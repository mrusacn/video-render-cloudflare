import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const outputDir = resolve(process.env.OUTPUT_DIR || join(root, "outputs"));
const workspaceRoot = resolve(process.env.WORKSPACE_DIR || "C:\\CloudCutStudio");
const projectsDir = join(workspaceRoot, "Projects");
const assetLibraryDir = join(workspaceRoot, "AssetLibrary");
const autosaveFile = join(projectsDir, "current-project.json");
const apiBase = process.env.API_BASE || "http://localhost:8787";
const runnerToken = process.env.RUNNER_TOKEN || "dev-token";
const runnerId = process.env.RUNNER_ID || `local-${crypto.randomUUID().slice(0, 8)}`;
const pollMs = Number(process.env.POLL_MS || 3000);
let ffmpegAvailable;
let heartbeatInFlight = false;
let lastSavedProjectAt = "";

await ensureLocalWorkspace();
console.log(`Local video runner started: ${runnerId}`);
console.log(`Polling: ${apiBase}`);
console.log(`Outputs: ${outputDir}`);
console.log(`Workspace: ${workspaceRoot}`);
console.log(`Asset library: ${assetLibraryDir}`);

heartbeat().catch((error) => console.error(formatError(error)));
setInterval(() => {
  heartbeat().catch((error) => console.error(formatError(error)));
}, 10000);

while (true) {
  try {
    await syncProjectDraft().catch((error) => console.error(formatError(error)));
    const job = await claimJob();
    if (job) {
      await renderJob(job);
    }
  } catch (error) {
    console.error(formatError(error));
  }
  await sleep(pollMs);
}

async function heartbeat() {
  if (heartbeatInFlight) return;
  heartbeatInFlight = true;
  try {
    const capabilities = [(await hasFfmpeg()) ? "ffmpeg" : "dry-run"];
    const assets = await scanAssetLibrary();
    const response = await fetch(`${apiBase}/api/runner/heartbeat`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${runnerToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        runnerId,
        version: "0.1.0",
        capabilities,
        workspace: {
          root: workspaceRoot,
          projectsDir,
          assetLibraryDir,
          autosaveFile
        },
        assets
      })
    });

    if (!response.ok) {
      throw new Error(`Heartbeat failed: ${response.status} ${await response.text()}`);
    }
  } finally {
    heartbeatInFlight = false;
  }
}

async function ensureLocalWorkspace() {
  await mkdir(outputDir, { recursive: true });
  await mkdir(projectsDir, { recursive: true });
  await mkdir(assetLibraryDir, { recursive: true });
  await Promise.all(
    ["Videos", "Images", "Music", "Stickers", "Backgrounds"].map((name) =>
      mkdir(join(assetLibraryDir, name), { recursive: true })
    )
  );
}

async function scanAssetLibrary() {
  await ensureLocalWorkspace();
  const files = [];
  await walkAssetDir(assetLibraryDir, files);
  const assets = files.slice(0, 240).map((filePath) => ({
    path: filePath,
    name: fileNameFromPath(filePath),
    type: detectAssetType(filePath)
  }));
  return {
    root: assetLibraryDir,
    scannedAt: new Date().toISOString(),
    counts: {
      total: assets.length,
      video: assets.filter((asset) => asset.type === "video").length,
      audio: assets.filter((asset) => asset.type === "audio").length,
      image: assets.filter((asset) => asset.type === "image").length
    },
    items: assets
  };
}

async function walkAssetDir(dir, files) {
  if (files.length >= 240) return;
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const filePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkAssetDir(filePath, files);
    } else if (isSupportedAsset(filePath)) {
      files.push(filePath);
    }
    if (files.length >= 240) return;
  }
}

async function syncProjectDraft() {
  const response = await fetch(`${apiBase}/api/runner/project-sync`, {
    headers: {
      "authorization": `Bearer ${runnerToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Project sync failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const project = data.project;
  if (!project?.savedAt || project.savedAt === lastSavedProjectAt) return;

  await ensureLocalWorkspace();
  const content = JSON.stringify(project, null, 2);
  await writeFile(autosaveFile, content, "utf8");
  await writeFile(join(projectsDir, `${safeFileName(project.projectName || "CloudCut-project")}.json`), content, "utf8");
  lastSavedProjectAt = project.savedAt;
}

async function claimJob() {
  const response = await fetch(`${apiBase}/api/jobs/claim`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${runnerToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ runnerId })
  });

  if (!response.ok) {
    throw new Error(`Claim failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.job;
}

async function renderJob(job) {
  console.log(`Rendering ${job.id}: ${job.title}`);
  try {
    await updateJob(job.id, { status: "rendering", progress: 12 });
    await sleep(300);
    await updateJob(job.id, { status: "rendering", progress: 30 });

    const resultPath = await createResult(job);

    await updateJob(job.id, {
      status: "completed",
      progress: 100,
      resultUrl: resultPath
    });
    console.log(`Completed ${job.id}: ${resultPath}`);
  } catch (error) {
    await updateJob(job.id, {
      status: "failed",
      error: error.message
    });
    console.error(`Failed ${job.id}: ${error.message}`);
  }
}

async function createResult(job) {
  await mkdir(outputDir, { recursive: true });
  const mp4Path = join(outputDir, `${job.id}.mp4`);
  const txtPath = join(outputDir, `${job.id}.txt`);

  if (await hasFfmpeg() && job.edit?.sourcePath) {
    await renderWithFfmpeg(job, mp4Path);
    return mp4Path;
  }

  await writeFile(
    txtPath,
    [
      `Render job: ${job.title}`,
      `Preset: ${job.preset}`,
      `Duration: ${job.duration}s`,
      `Source file expected in customer computer: ${job.edit?.sourceName || "not provided"}`,
      `Source path: ${job.edit?.sourcePath || "not provided"}`,
      `Trim: ${job.edit?.trimStart || 0}s - ${job.edit?.trimEnd || "auto"}s`,
      `Caption: ${job.edit?.caption || ""}`,
      `Subtitles: ${JSON.stringify(job.edit?.subtitles || [])}`,
      `Color: brightness=${job.edit?.brightness ?? 0}, contrast=${job.edit?.contrast ?? 1}, saturation=${job.edit?.saturation ?? 1}`,
      `Audio: volume=${job.edit?.volume ?? 1}, muted=${Boolean(job.edit?.muted)}`,
      `Sticker: ${job.edit?.stickerPath || ""}`,
      `Music: ${job.edit?.musicPath || ""}`,
      `Background: ${job.edit?.backgroundPath || ""}`,
      `Template: ${job.edit?.template || "none"}, intro=${job.edit?.introText || ""}, outro=${job.edit?.outroText || ""}`,
      `Notes: ${job.notes || ""}`,
      "",
      "FFmpeg was not found, so the runner created this dry-run result instead."
    ].join("\n"),
    "utf8"
  );
  return txtPath;
}

async function renderWithFfmpeg(job, mp4Path) {
  const sourcePath = resolve(job.edit.sourcePath);
  await assertFileExists(sourcePath);
  const { width, height } = getPresetSize(job.preset);
  const trimStart = Math.max(0, Number(job.edit?.trimStart || 0));
  const trimEnd = Math.max(0, Number(job.edit?.trimEnd || 0));
  const duration = trimEnd > trimStart ? trimEnd - trimStart : Number(job.duration || 0);
  const args = ["-y"];
  const stickerPath = String(job.edit?.stickerPath || "").trim();
  const musicPath = String(job.edit?.musicPath || "").trim();
  const backgroundPath = String(job.edit?.backgroundPath || "").trim();
  const hasSticker = Boolean(stickerPath);
  const hasMusic = Boolean(musicPath);
  const hasBackground = Boolean(backgroundPath);

  if (trimStart > 0) {
    args.push("-ss", String(trimStart));
  }

  args.push("-i", sourcePath);

  let nextInputIndex = 1;
  let backgroundInputIndex = -1;
  let stickerInputIndex = -1;
  let musicInputIndex = -1;

  if (hasBackground) {
    const resolvedBackground = resolve(backgroundPath);
    await assertFileExists(resolvedBackground);
    backgroundInputIndex = nextInputIndex;
    nextInputIndex += 1;
    args.push("-loop", "1", "-i", resolvedBackground);
  }

  if (hasSticker) {
    const resolvedSticker = resolve(stickerPath);
    await assertFileExists(resolvedSticker);
    stickerInputIndex = nextInputIndex;
    nextInputIndex += 1;
    args.push("-loop", "1", "-i", resolvedSticker);
  }

  if (hasMusic) {
    const resolvedMusic = resolve(musicPath);
    await assertFileExists(resolvedMusic);
    musicInputIndex = nextInputIndex;
    args.push("-stream_loop", "-1", "-i", resolvedMusic);
  }

  if (duration > 0) {
    args.push("-t", String(duration));
  }

  const filterGraph = buildFilterGraph({
    width,
    height,
    duration,
    edit: job.edit || {},
    backgroundInputIndex,
    stickerInputIndex,
    musicInputIndex
  });

  args.push("-filter_complex", filterGraph, "-map", "[vout]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23");

  if (hasMusic) {
    args.push("-map", "[aout]", "-c:a", "aac", "-b:a", "160k", "-shortest");
  } else if (job.edit?.muted) {
    args.push("-an");
  } else {
    args.push("-map", "0:a?", "-filter:a", `volume=${clampNumber(job.edit?.volume, 0, 2, 1)}`, "-c:a", "aac", "-b:a", "160k");
  }

  args.push("-movflags", "+faststart", "-pix_fmt", "yuv420p", mp4Path);

  await updateJob(job.id, { status: "rendering", progress: 55 });
  await execFileAsync("ffmpeg", args, { maxBuffer: 1024 * 1024 * 20 });
  await updateJob(job.id, { status: "rendering", progress: 88 });
}

async function assertFileExists(filePath) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`找不到本地素材文件：${filePath}`);
  }
}

function getPresetSize(preset) {
  if (preset === "landscape-1080p") return { width: 1920, height: 1080 };
  if (preset === "square-1080p") return { width: 1080, height: 1080 };
  return { width: 1080, height: 1920 };
}

function buildFilterGraph({ width, height, duration, edit, backgroundInputIndex, stickerInputIndex, musicInputIndex }) {
  const videoFilters = buildVideoFilters({ width, height, duration, edit });
  const parts = [];
  let videoLabel = "v0";

  if (backgroundInputIndex > -1) {
    const afterFitFilters = videoFilters.slice(2);
    parts.push(`[${backgroundInputIndex}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[bg]`);
    parts.push(`[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,setsar=1[mainfit]`);
    parts.push(`[bg][mainfit]overlay=(W-w)/2:(H-h)/2[base]`);
    parts.push(afterFitFilters.length ? `[base]${afterFitFilters.join(",")}[v0]` : "[base]copy[v0]");
  } else {
    parts.push(`[0:v]${videoFilters.join(",")}[v0]`);
  }

  if (stickerInputIndex > -1) {
    const stickerWidth = Math.round(width * (clampNumber(edit.stickerScale, 8, 60, 22) / 100));
    const position = getStickerOverlayPosition(edit.stickerPosition, width, height);
    parts.push(`[${stickerInputIndex}:v]scale=${stickerWidth}:-1[sticker]`);
    parts.push(`[${videoLabel}][sticker]overlay=${position}:format=auto[v1]`);
    videoLabel = "v1";
  }

  parts.push(`[${videoLabel}]format=yuv420p[vout]`);

  if (musicInputIndex > -1) {
    parts.push(`[${musicInputIndex}:a]volume=${clampNumber(edit.musicVolume, 0, 2, 0.6)}[aout]`);
  }

  return parts.join(";");
}

function buildVideoFilters({ width, height, duration, edit }) {
  const caption = String(edit?.caption || "").trim();
  const subtitles = Array.isArray(edit?.subtitles) ? edit.subtitles : [];
  const filters = [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    `eq=brightness=${clampNumber(edit.brightness, -0.5, 0.5, 0)}:contrast=${clampNumber(edit.contrast, 0.5, 2, 1)}:saturation=${clampNumber(edit.saturation, 0, 2, 1)}`
  ];

  const fontFile = "C\\:/Windows/Fonts/msyh.ttc";
  const fontSize = Math.round(width * 0.048);
  const y = `h-text_h-${Math.round(height * 0.08)}`;
  const cleanSubtitles = subtitles
    .map((subtitle) => ({
      start: Number(subtitle.start || 0),
      end: Number(subtitle.end || 0),
      text: String(subtitle.text || "").trim()
    }))
    .filter((subtitle) => subtitle.text && subtitle.end > subtitle.start)
    .slice(0, 50);

  if (cleanSubtitles.length) {
    cleanSubtitles.forEach((subtitle) => {
      filters.push(
        `drawtext=fontfile='${fontFile}':text='${escapeFfmpegText(subtitle.text)}':fontcolor=white:fontsize=${fontSize}:line_spacing=10:box=1:boxcolor=black@0.45:boxborderw=20:x=(w-text_w)/2:y=${y}:enable='between(t,${subtitle.start},${subtitle.end})'`
      );
    });
  } else if (caption) {
    filters.push(
      `drawtext=fontfile='${fontFile}':text='${escapeFfmpegText(caption)}':fontcolor=white:fontsize=${fontSize}:line_spacing=10:box=1:boxcolor=black@0.45:boxborderw=20:x=(w-text_w)/2:y=${y}`
    );
  }

  addTemplateFilters(filters, { width, height, duration, edit, fontFile });

  return filters;
}

function addTemplateFilters(filters, { width, height, duration, edit, fontFile }) {
  const template = edit.template || "none";
  if (template === "none") return;
  const seconds = clampNumber(edit.templateSeconds, 0.5, 8, 2.5);
  const intro = String(edit.introText || "").trim();
  const outro = String(edit.outroText || "").trim();
  const fontSize = Math.round(width * 0.06);
  const style = getTemplateStyle(template);

  if (intro) {
    filters.push(`drawbox=x=0:y=0:w=iw:h=ih:color=${style.box}:t=fill:enable='between(t,0,${seconds})'`);
    filters.push(`drawtext=fontfile='${fontFile}':text='${escapeFfmpegText(intro)}':fontcolor=${style.text}:fontsize=${fontSize}:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0,${seconds})'`);
  }

  if (outro && duration > 0) {
    const start = Math.max(0, duration - seconds);
    filters.push(`drawbox=x=0:y=0:w=iw:h=ih:color=${style.box}:t=fill:enable='between(t,${start},${duration})'`);
    filters.push(`drawtext=fontfile='${fontFile}':text='${escapeFfmpegText(outro)}':fontcolor=${style.text}:fontsize=${fontSize}:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${start},${duration})'`);
  }
}

function getTemplateStyle(template) {
  if (template === "dark") return { box: "black@0.88", text: "white" };
  if (template === "brand") return { box: "0x16735b@0.88", text: "white" };
  return { box: "white@0.82", text: "black" };
}

function getStickerOverlayPosition(position, width, height) {
  const margin = Math.round(Math.min(width, height) * 0.04);
  const map = {
    "top-left": `${margin}:${margin}`,
    "top-right": `W-w-${margin}:${margin}`,
    "bottom-left": `${margin}:H-h-${margin}`,
    "bottom-right": `W-w-${margin}:H-h-${margin}`,
    center: "(W-w)/2:(H-h)/2"
  };
  return map[position] || map["top-right"];
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

async function updateJob(id, patch) {
  const response = await fetch(`${apiBase}/api/jobs/${id}`, {
    method: "PATCH",
    headers: {
      "authorization": `Bearer ${runnerToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(patch)
  });

  if (!response.ok) {
    throw new Error(`Update failed: ${response.status} ${await response.text()}`);
  }
}

async function hasFfmpeg() {
  if (typeof ffmpegAvailable === "boolean") {
    return ffmpegAvailable;
  }
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

function escapeFfmpegText(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'")
    .replaceAll("%", "\\%");
}

function isSupportedAsset(filePath) {
  return /\.(mp4|mov|mkv|webm|mp3|wav|m4a|aac|flac|png|jpe?g|webp|gif)$/i.test(filePath);
}

function detectAssetType(filePath) {
  if (/\.(mp4|mov|mkv|webm)$/i.test(filePath)) return "video";
  if (/\.(mp3|wav|m4a|aac|flac)$/i.test(filePath)) return "audio";
  return "image";
}

function fileNameFromPath(value) {
  return String(value || "").split(/[\\/]/).filter(Boolean).pop() || "";
}

function safeFileName(value) {
  return String(value || "CloudCut-project")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .trim()
    .slice(0, 80) || "CloudCut-project";
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function formatError(error) {
  const parts = [error.message || String(error)];
  if (error.cause?.code) parts.push(`code=${error.cause.code}`);
  if (error.cause?.errno) parts.push(`errno=${error.cause.errno}`);
  if (error.cause?.syscall) parts.push(`syscall=${error.cause.syscall}`);
  if (error.cause?.hostname) parts.push(`host=${error.cause.hostname}`);
  if (error.cause?.address) parts.push(`address=${error.cause.address}`);
  if (error.cause?.port) parts.push(`port=${error.cause.port}`);
  if (error.cause?.message) parts.push(`cause=${error.cause.message}`);
  return parts.join(" | ");
}
