import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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
    console.error(error.message);
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
    await sleep(700);
    await updateJob(job.id, { status: "rendering", progress: 35 });
    await sleep(900);
    await updateJob(job.id, { status: "rendering", progress: 68 });

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

  if (await hasFfmpeg()) {
    const size = job.preset === "landscape-1080p" ? "1920x1080" : job.preset === "square-1080p" ? "1080x1080" : "1080x1920";
    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=0x1f7a5a:s=${size}:d=3`,
      "-vf",
      `drawtext=text='${escapeFfmpegText(job.title)}':fontcolor=white:fontsize=54:x=(w-text_w)/2:y=(h-text_h)/2`,
      "-pix_fmt",
      "yuv420p",
      mp4Path
    ]);
    return mp4Path;
  }

  await writeFile(
    txtPath,
    [
      `Render job: ${job.title}`,
      `Preset: ${job.preset}`,
      `Duration: ${job.duration}s`,
      `Source file expected in customer computer: ${job.edit?.sourceName || "not provided"}`,
      `Trim: ${job.edit?.trimStart || 0}s - ${job.edit?.trimEnd || "auto"}s`,
      `Caption: ${job.edit?.caption || ""}`,
      `Notes: ${job.notes || ""}`,
      "",
      "FFmpeg was not found, so the runner created this dry-run result instead."
    ].join("\n"),
    "utf8"
  );
  return txtPath;
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

let ffmpegAvailable;
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
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
