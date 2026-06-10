import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const outputDir = resolve(process.env.OUTPUT_DIR || join(root, "outputs"));
const apiBase = process.env.API_BASE || "http://localhost:8787";
const runnerToken = process.env.RUNNER_TOKEN || "dev-token";
const runnerId = process.env.RUNNER_ID || `local-${crypto.randomUUID().slice(0, 8)}`;
const pollMs = Number(process.env.POLL_MS || 3000);
let ffmpegAvailable;

console.log(`Local video runner started: ${runnerId}`);
console.log(`Polling: ${apiBase}`);
console.log(`Outputs: ${outputDir}`);

while (true) {
  try {
    await heartbeat();
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
  const capabilities = [(await hasFfmpeg()) ? "ffmpeg" : "dry-run"];
  const response = await fetch(`${apiBase}/api/runner/heartbeat`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${runnerToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ runnerId, version: "0.1.0", capabilities })
  });

  if (!response.ok) {
    throw new Error(`Heartbeat failed: ${response.status} ${await response.text()}`);
  }
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
  const caption = String(job.edit?.caption || "").trim();
  const subtitles = Array.isArray(job.edit?.subtitles) ? job.edit.subtitles : [];
  const vf = buildVideoFilter({ width, height, caption, subtitles, edit: job.edit || {} });
  const args = ["-y"];

  if (trimStart > 0) {
    args.push("-ss", String(trimStart));
  }

  args.push("-i", sourcePath);

  if (duration > 0) {
    args.push("-t", String(duration));
  }

  args.push("-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23");

  if (job.edit?.muted) {
    args.push("-an");
  } else {
    args.push("-filter:a", `volume=${clampNumber(job.edit?.volume, 0, 2, 1)}`, "-c:a", "aac", "-b:a", "160k");
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

function buildVideoFilter({ width, height, caption, subtitles, edit }) {
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

  return filters.join(",");
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
