const memoryJobs = [];
const memoryValues = new Map();

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, env, url);
      }

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return new Response("Static assets binding is not configured.", { status: 404 });
    } catch (error) {
      if (error instanceof Response) {
        return error;
      }
      return json({ error: error.message }, 500);
    }
  }
};

async function handleApi(request, env, url) {
  if (request.method === "GET" && url.pathname === "/api/jobs") {
    authorizeApp(request, env);
    return json({ jobs: await listJobs(env) });
  }

  if (request.method === "POST" && url.pathname === "/api/jobs") {
    authorizeApp(request, env);
    const input = await request.json();
    const jobs = await listJobs(env);
    const now = new Date().toISOString();
    const job = {
      id: crypto.randomUUID(),
      title: String(input.title || "未命名视频").trim().slice(0, 80),
      duration: Number(input.duration || 30),
      preset: String(input.preset || "vertical-1080p"),
      notes: String(input.notes || "").trim().slice(0, 2000),
      edit: {
        sourceName: String(input.sourceName || "").trim().slice(0, 240),
        sourcePath: String(input.sourcePath || "").trim().slice(0, 1000),
        sourceSize: Number(input.sourceSize || 0),
        trimStart: Number(input.trimStart || 0),
        trimEnd: Number(input.trimEnd || 0),
        caption: String(input.caption || "").trim().slice(0, 120),
        subtitles: sanitizeSubtitles(input.subtitles),
        brightness: clampNumber(input.brightness, -0.5, 0.5, 0),
        contrast: clampNumber(input.contrast, 0.5, 2, 1),
        saturation: clampNumber(input.saturation, 0, 2, 1),
        volume: clampNumber(input.volume, 0, 2, 1),
        muted: Boolean(input.muted),
        stickerPath: String(input.stickerPath || "").trim().slice(0, 1000),
        stickerPosition: sanitizeChoice(input.stickerPosition, ["top-right", "top-left", "bottom-right", "bottom-left", "center"], "top-right"),
        stickerScale: clampNumber(input.stickerScale, 8, 60, 22),
        musicPath: String(input.musicPath || "").trim().slice(0, 1000),
        musicVolume: clampNumber(input.musicVolume, 0, 2, 0.6),
        backgroundPath: String(input.backgroundPath || "").trim().slice(0, 1000),
        template: sanitizeChoice(input.template, ["none", "clean", "dark", "brand"], "none"),
        introText: String(input.introText || "").trim().slice(0, 80),
        outroText: String(input.outroText || "").trim().slice(0, 80),
        templateSeconds: clampNumber(input.templateSeconds, 0.5, 8, 2.5)
      },
      localAssetRequired: Boolean(input.localAssetRequired),
      status: "queued",
      progress: 0,
      resultUrl: "",
      error: "",
      runnerId: "",
      createdAt: now,
      updatedAt: now
    };
    jobs.unshift(job);
    await saveJobs(env, jobs);
    return json({ job }, 201);
  }

  if (request.method === "GET" && url.pathname === "/api/runner/status") {
    authorizeApp(request, env);
    return json({ runner: await getRunnerStatus(env) });
  }

  if (request.method === "POST" && url.pathname === "/api/runner/heartbeat") {
    authorizeRunner(request, env);
    const input = await request.json().catch(() => ({}));
    const heartbeat = {
      runnerId: input.runnerId || "cloud-runner",
      version: input.version || "dev",
      capabilities: Array.isArray(input.capabilities) ? input.capabilities : [],
      checkedAt: new Date().toISOString()
    };
    await putValue(env, "runner:heartbeat", heartbeat);
    return json({ runner: await getRunnerStatus(env) });
  }

  if (request.method === "POST" && url.pathname === "/api/jobs/claim") {
    authorizeRunner(request, env);
    const input = await request.json().catch(() => ({}));
    const jobs = await listJobs(env);
    const job = jobs.find((item) => item.status === "queued");
    if (!job) {
      return json({ job: null });
    }
    job.status = "claimed";
    job.runnerId = input.runnerId || "cloud-runner";
    job.progress = 5;
    job.updatedAt = new Date().toISOString();
    await saveJobs(env, jobs);
    return json({ job });
  }

  const match = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (request.method === "PATCH" && match) {
    authorizeRunner(request, env);
    const patch = await request.json();
    const jobs = await listJobs(env);
    const job = jobs.find((item) => item.id === match[1]);
    if (!job) {
      return json({ error: "Job not found" }, 404);
    }
    Object.assign(job, sanitizePatch(patch), { updatedAt: new Date().toISOString() });
    await saveJobs(env, jobs);
    return json({ job });
  }

  return json({ error: "Not found" }, 404);
}

async function listJobs(env) {
  if (env.JOBS) {
    const raw = await env.JOBS.get("jobs");
    return raw ? JSON.parse(raw) : [];
  }
  return memoryJobs;
}

async function saveJobs(env, jobs) {
  if (env.JOBS) {
    await env.JOBS.put("jobs", JSON.stringify(jobs));
    return;
  }
  memoryJobs.splice(0, memoryJobs.length, ...jobs);
}

async function getRunnerStatus(env) {
  const heartbeat = await getValue(env, "runner:heartbeat");
  if (!heartbeat) {
    return { online: false };
  }
  const ageMs = Date.now() - Date.parse(heartbeat.checkedAt);
  return {
    ...heartbeat,
    online: ageMs < 15000,
    ageMs
  };
}

async function getValue(env, key) {
  if (env.JOBS) {
    const raw = await env.JOBS.get(key);
    return raw ? JSON.parse(raw) : null;
  }
  return memoryValues.get(key) || null;
}

async function putValue(env, key, value) {
  if (env.JOBS) {
    await env.JOBS.put(key, JSON.stringify(value));
    return;
  }
  memoryValues.set(key, value);
}

function sanitizePatch(patch) {
  const output = {};
  if (typeof patch.status === "string") output.status = patch.status;
  if (Number.isFinite(Number(patch.progress))) output.progress = Number(patch.progress);
  if (typeof patch.resultUrl === "string") output.resultUrl = patch.resultUrl;
  if (typeof patch.error === "string") output.error = patch.error.slice(0, 1000);
  return output;
}

function sanitizeSubtitles(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      start: clampNumber(item?.start, 0, 36000, 0),
      end: clampNumber(item?.end, 0, 36000, 0),
      text: String(item?.text || "").trim().slice(0, 120)
    }))
    .filter((item) => item.text && item.end > item.start)
    .slice(0, 50);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function sanitizeChoice(value, choices, fallback) {
  return choices.includes(value) ? value : fallback;
}

function authorizeRunner(request, env) {
  const expected = env.RUNNER_TOKEN || "change-me";
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token !== expected) {
    throw new Response("Runner token is invalid", { status: 401 });
  }
}

function authorizeApp(request, env) {
  if (!env.APP_ACCESS_CODE) {
    return;
  }
  const code = request.headers.get("x-app-access-code");
  if (code !== env.APP_ACCESS_CODE) {
    throw new Response("Access code is invalid", { status: 401 });
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
