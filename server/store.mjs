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
        sourceSize: Number(input.sourceSize || 0),
        trimStart: Number(input.trimStart || 0),
        trimEnd: Number(input.trimEnd || 0),
        caption: String(input.caption || "").trim().slice(0, 120)
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
