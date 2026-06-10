const loginView = document.querySelector("#loginView");
const studioView = document.querySelector("#studioView");
const loginForm = document.querySelector("#loginForm");
const accessCodeInput = document.querySelector("#accessCodeInput");
const logoutBtn = document.querySelector("#logoutBtn");
const form = document.querySelector("#jobForm");
const jobsList = document.querySelector("#jobsList");
const summaryText = document.querySelector("#summaryText");
const runnerState = document.querySelector("#runnerState");
const refreshBtn = document.querySelector("#refreshBtn");
const sourceInput = document.querySelector("#sourceInput");
const previewVideo = document.querySelector("#previewVideo");
const previewFrame = document.querySelector("#previewFrame");
const previewMeta = document.querySelector("#previewMeta");
const emptyPreview = document.querySelector("#emptyPreview");
const captionInput = document.querySelector("#captionInput");
const captionOverlay = document.querySelector("#captionOverlay");
const presetInput = document.querySelector("#presetInput");
const installBox = document.querySelector("#installBox");

const accessCodeKey = "cloud-video-studio-access-code";
let accessCode = localStorage.getItem(accessCodeKey) || "";
let selectedSource = null;

const statusLabels = {
  queued: "排队中",
  claimed: "已领取",
  rendering: "渲染中",
  completed: "已完成",
  failed: "失败"
};

bootstrap();

function bootstrap() {
  if (accessCode) {
    showStudio();
  } else {
    loginView.classList.remove("hidden");
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  accessCode = accessCodeInput.value.trim();
  localStorage.setItem(accessCodeKey, accessCode);
  showStudio();
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem(accessCodeKey);
  location.reload();
});

sourceInput.addEventListener("change", () => {
  const file = sourceInput.files?.[0];
  selectedSource = file || null;
  if (!file) return;

  previewVideo.src = URL.createObjectURL(file);
  previewVideo.classList.add("ready");
  emptyPreview.classList.add("hidden");
  previewMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  if (!document.querySelector("#titleInput").value) {
    document.querySelector("#titleInput").value = file.name.replace(/\.[^.]+$/, "");
  }
});

captionInput.addEventListener("input", updateCaption);
presetInput.addEventListener("change", updatePresetFrame);
refreshBtn.addEventListener("click", refreshAll);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.sourceName = selectedSource?.name || "";
  payload.sourceSize = selectedSource?.size || 0;
  payload.duration = getDuration();
  payload.caption = captionInput.value.trim();
  payload.localAssetRequired = Boolean(selectedSource);
  await api("/api/jobs", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  await refreshAll();
});

async function showStudio() {
  loginView.classList.add("hidden");
  studioView.classList.remove("hidden");
  updateCaption();
  updatePresetFrame();
  await refreshAll();
  setInterval(refreshAll, 3000);
}

async function api(path, options = {}) {
  const headers = {
    "content-type": "application/json",
    "x-app-access-code": accessCode,
    ...(options.headers || {})
  };
  const response = await fetch(path, { ...options, headers });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `请求失败：${response.status}`);
  }

  return response.json();
}

async function refreshAll() {
  try {
    const [jobsData, runnerData] = await Promise.all([
      api("/api/jobs"),
      api("/api/runner/status")
    ]);
    renderJobs(jobsData.jobs);
    renderRunner(runnerData.runner);
  } catch (error) {
    summaryText.textContent = error.message;
  }
}

function renderRunner(runner) {
  if (runner?.online) {
    runnerState.textContent = `本地助手在线：${runner.runnerId}`;
    runnerState.className = "state-pill online";
    installBox.classList.add("connected");
    installBox.querySelector("strong").textContent = "本地渲染助手已连接";
    installBox.querySelector("span").textContent = "现在可以在网页提交导出任务，客户电脑会自动领取并渲染。";
    return;
  }
  runnerState.textContent = "本地助手未连接";
  runnerState.className = "state-pill offline";
  installBox.classList.remove("connected");
  installBox.querySelector("strong").textContent = "本地渲染助手未连接";
  installBox.querySelector("span").textContent = "如果导出任务一直排队，请让客户把本项目文件夹放到电脑里，设置 Cloudflare 地址和密钥，然后运行 start-runner.cmd。";
}

function renderJobs(jobs) {
  summaryText.textContent = jobs.length
    ? `${jobs.length} 个任务，${jobs.filter((job) => job.status === "queued").length} 个排队中`
    : "还没有导出任务。";

  if (!jobs.length) {
    jobsList.innerHTML = `<div class="empty">剪辑完成后点击“导出视频”。</div>`;
    return;
  }

  jobsList.innerHTML = jobs
    .map((job) => {
      const progress = Math.max(0, Math.min(100, job.progress || 0));
      const edit = job.edit || {};
      const result = job.resultUrl
        ? `<div class="result-box">结果位置<br>${escapeHtml(job.resultUrl)}</div>`
        : `<div class="result-box">${job.localAssetRequired ? "需要客户电脑读取本地素材" : "等待导出结果"}</div>`;

      return `
        <article class="job-card">
          <div>
            <div class="job-title">
              <strong>${escapeHtml(job.title)}</strong>
              <span class="status-pill ${job.status}">${statusLabels[job.status] || job.status}</span>
            </div>
            <div class="job-meta">
              ${escapeHtml(job.preset)} · ${job.duration}s · ${escapeHtml(edit.sourceName || "无素材名")} · ${formatTime(job.createdAt)}
            </div>
            ${edit.caption ? `<div class="job-notes">字幕：${escapeHtml(edit.caption)}</div>` : ""}
            ${job.notes ? `<div class="job-notes">${escapeHtml(job.notes)}</div>` : ""}
            <div class="progress-shell" aria-label="渲染进度">
              <div class="progress-bar" style="--progress: ${progress}%"></div>
            </div>
          </div>
          ${result}
        </article>
      `;
    })
    .join("");
}

function updateCaption() {
  const value = captionInput.value.trim();
  captionOverlay.textContent = value || "字幕预览";
  captionOverlay.classList.toggle("muted", !value);
}

function updatePresetFrame() {
  previewFrame.classList.remove("vertical", "square", "landscape");
  const value = presetInput.value;
  if (value.startsWith("square")) previewFrame.classList.add("square");
  else if (value.startsWith("landscape")) previewFrame.classList.add("landscape");
  else previewFrame.classList.add("vertical");
}

function getDuration() {
  const start = Number(document.querySelector("#trimStartInput").value || 0);
  const end = Number(document.querySelector("#trimEndInput").value || 0);
  if (end > start) return Number((end - start).toFixed(1));
  if (Number.isFinite(previewVideo.duration)) return Number(Math.max(1, previewVideo.duration - start).toFixed(1));
  return 30;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatBytes(value) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
