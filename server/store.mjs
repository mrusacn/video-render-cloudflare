import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export class FileJobStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
  }

  async list() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw);
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async save(jobs) {
    await mkdir(dirname(this.filePath), { recursive: true });
    this.writeQueue = this.writeQueue.then(() =>
      writeFile(this.filePath, `${JSON.stringify(jobs, null, 2)}\n`, "utf8")
    );
    return this.writeQueue;
  }

  async create(input) {
    const jobs = await this.list();
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
    await this.save(jobs);
    return job;
  }

  async claim(runnerId) {
    const jobs = await this.list();
    const job = jobs.find((item) => item.status === "queued");
    if (!job) {
      return null;
    }
    job.status = "claimed";
    job.runnerId = runnerId;
    job.progress = 5;
    job.updatedAt = new Date().toISOString();
    await this.save(jobs);
    return job;
  }

  async update(id, patch) {
    const jobs = await this.list();
    const job = jobs.find((item) => item.id === id);
    if (!job) {
      return null;
    }
    Object.assign(job, sanitizePatch(patch), {
      updatedAt: new Date().toISOString()
    });
    await this.save(jobs);
    return job;
  }
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
