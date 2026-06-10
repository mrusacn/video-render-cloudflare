const loginView = document.querySelector("#loginView");
const studioView = document.querySelector("#studioView");
const loginForm = document.querySelector("#loginForm");
const accessCodeInput = document.querySelector("#accessCodeInput");
const logoutBtn = document.querySelector("#logoutBtn");
const form = document.querySelector("#jobForm");
const railItems = [...document.querySelectorAll(".rail-item")];
const toolPanes = [...document.querySelectorAll(".tool-pane")];
const titleInput = document.querySelector("#titleInput");
const projectNameLabel = document.querySelector("#projectNameLabel");
const exportTopBtn = document.querySelector("#exportTopBtn");
const jobsList = document.querySelector("#jobsList");
const summaryText = document.querySelector("#summaryText");
const runnerState = document.querySelector("#runnerState");
const refreshBtn = document.querySelector("#refreshBtn");
const sourceInput = document.querySelector("#sourceInput");
const sourcePathInput = document.querySelector("#sourcePathInput");
const videoAssetName = document.querySelector("#videoAssetName");
const trimStartInput = document.querySelector("#trimStartInput");
const trimEndInput = document.querySelector("#trimEndInput");
const previewVideo = document.querySelector("#previewVideo");
const previewFrame = document.querySelector("#previewFrame");
const previewMeta = document.querySelector("#previewMeta");
const emptyPreview = document.querySelector("#emptyPreview");
const captionInput = document.querySelector("#captionInput");
const captionOverlay = document.querySelector("#captionOverlay");
const presetInput = document.querySelector("#presetInput");
const installBox = document.querySelector("#installBox");
const addSubtitleBtn = document.querySelector("#addSubtitleBtn");
const autoCaptionBtn = document.querySelector("#autoCaptionBtn");
const autoCaptionText = document.querySelector("#autoCaptionText");
const subtitleList = document.querySelector("#subtitleList");
const subtitleBars = document.querySelector("#subtitleBars");
const timelineDuration = document.querySelector("#timelineDuration");
const clipBar = document.querySelector("#clipBar");
const deleteTrackBtn = document.querySelector("#deleteTrackBtn");
const splitSubtitleBtn = document.querySelector("#splitSubtitleBtn");
const aiCaptionBtn = document.querySelector("#aiCaptionBtn");
const addMarkerBtn = document.querySelector("#addMarkerBtn");
const timelinePlayBtn = document.querySelector("#timelinePlayBtn");
const currentTimeText = document.querySelector("#currentTimeText");
const playhead = document.querySelector("#playhead");
const zoomOutBtn = document.querySelector("#zoomOutBtn");
const zoomInBtn = document.querySelector("#zoomInBtn");
const timelineZoomInput = document.querySelector("#timelineZoomInput");
const dropLane = document.querySelector("#dropLane");
const audioWave = document.querySelector("#audioWave");
const brightnessInput = document.querySelector("#brightnessInput");
const contrastInput = document.querySelector("#contrastInput");
const saturationInput = document.querySelector("#saturationInput");
const volumeInput = document.querySelector("#volumeInput");
const muteInput = document.querySelector("#muteInput");
const stickerPathInput = document.querySelector("#stickerPathInput");
const stickerFileInput = document.querySelector("#stickerFileInput");
const stickerAssetName = document.querySelector("#stickerAssetName");
const stickerPositionInput = document.querySelector("#stickerPositionInput");
const stickerScaleInput = document.querySelector("#stickerScaleInput");
const musicPathInput = document.querySelector("#musicPathInput");
const musicFileInput = document.querySelector("#musicFileInput");
const musicAssetName = document.querySelector("#musicAssetName");
const musicVolumeInput = document.querySelector("#musicVolumeInput");
const backgroundPathInput = document.querySelector("#backgroundPathInput");
const backgroundFileInput = document.querySelector("#backgroundFileInput");
const backgroundAssetName = document.querySelector("#backgroundAssetName");
const templateInput = document.querySelector("#templateInput");
const introTextInput = document.querySelector("#introTextInput");
const outroTextInput = document.querySelector("#outroTextInput");
const templateSecondsInput = document.querySelector("#templateSecondsInput");
const quickTextInput = document.querySelector("#quickTextInput");
const applyQuickTextBtn = document.querySelector("#applyQuickTextBtn");
const libraryCaptionText = document.querySelector("#libraryCaptionText");
const libraryAutoCaptionBtn = document.querySelector("#libraryAutoCaptionBtn");
const transcriptText = document.querySelector("#transcriptText");
const transcriptToCaptionsBtn = document.querySelector("#transcriptToCaptionsBtn");

const accessCodeKey = "cloud-video-studio-access-code";
let accessCode = localStorage.getItem(accessCodeKey) || "";
let selectedSource = null;
let markers = [];
let subtitles = [
  { id: makeId(), start: 0, end: 3, text: "" }
];

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

railItems.forEach((item) => {
  item.addEventListener("click", () => activateTool(item.dataset.tool));
});

sourceInput.addEventListener("change", () => {
  const file = sourceInput.files?.[0];
  selectedSource = file || null;
  if (!file) return;

  previewVideo.src = URL.createObjectURL(file);
  previewVideo.classList.add("ready");
  emptyPreview.classList.add("hidden");
  previewMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  videoAssetName.textContent = file.name;
  sourcePathInput.placeholder = `请粘贴这个文件在客户电脑里的完整路径：${file.name}`;
  if (!titleInput.value) {
    titleInput.value = file.name.replace(/\.[^.]+$/, "");
  }
  syncProjectTitle();
  previewVideo.addEventListener("loadedmetadata", renderTimeline, { once: true });
});

stickerFileInput.addEventListener("change", () => {
  const file = stickerFileInput.files?.[0];
  if (!file) return;
  stickerAssetName.textContent = file.name;
  stickerPathInput.placeholder = `请粘贴这个图片在客户电脑里的完整路径：${file.name}`;
});

musicFileInput.addEventListener("change", () => {
  const file = musicFileInput.files?.[0];
  if (!file) return;
  musicAssetName.textContent = file.name;
  musicPathInput.placeholder = `请粘贴这个音乐在客户电脑里的完整路径：${file.name}`;
});

backgroundFileInput.addEventListener("change", () => {
  const file = backgroundFileInput.files?.[0];
  if (!file) return;
  backgroundAssetName.textContent = file.name;
  backgroundPathInput.placeholder = `请粘贴这个背景图在客户电脑里的完整路径：${file.name}`;
});

captionInput.addEventListener("input", updateCaption);
titleInput.addEventListener("input", syncProjectTitle);
previewVideo.addEventListener("timeupdate", updateCaption);
previewVideo.addEventListener("timeupdate", updateTimelinePlayhead);
previewVideo.addEventListener("play", () => {
  timelinePlayBtn.textContent = "⏸";
});
previewVideo.addEventListener("pause", () => {
  timelinePlayBtn.textContent = "▶";
});
presetInput.addEventListener("change", updatePresetFrame);
refreshBtn.addEventListener("click", refreshAll);
exportTopBtn.addEventListener("click", () => form.requestSubmit());
timelinePlayBtn.addEventListener("click", toggleTimelinePlayback);
deleteTrackBtn.addEventListener("click", deleteSubtitleTrack);
splitSubtitleBtn.addEventListener("click", splitSubtitleAtPlayhead);
aiCaptionBtn.addEventListener("click", () => {
  if (!autoCaptionText.value.trim() && transcriptText.value.trim()) {
    autoCaptionText.value = transcriptText.value;
  }
  autoSplitCaptions();
});
addMarkerBtn.addEventListener("click", addTimelineMarker);
zoomOutBtn.addEventListener("click", () => setTimelineZoom(Number(timelineZoomInput.value) - 10));
zoomInBtn.addEventListener("click", () => setTimelineZoom(Number(timelineZoomInput.value) + 10));
timelineZoomInput.addEventListener("input", () => setTimelineZoom(Number(timelineZoomInput.value)));
dropLane.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropLane.classList.add("drag-over");
});
dropLane.addEventListener("dragleave", () => dropLane.classList.remove("drag-over"));
dropLane.addEventListener("drop", handleTimelineDrop);
addSubtitleBtn.addEventListener("click", () => {
  const last = subtitles.at(-1);
  const start = last ? Number(last.end || 0) : 0;
  subtitles.push({ id: makeId(), start, end: start + 3, text: "" });
  renderSubtitles();
});
autoCaptionBtn.addEventListener("click", autoSplitCaptions);
libraryAutoCaptionBtn.addEventListener("click", () => {
  autoCaptionText.value = libraryCaptionText.value;
  autoSplitCaptions();
  activateTool("media");
});
transcriptToCaptionsBtn.addEventListener("click", () => {
  autoCaptionText.value = transcriptText.value;
  libraryCaptionText.value = transcriptText.value;
  autoSplitCaptions();
  activateTool("captions");
});
applyQuickTextBtn.addEventListener("click", () => {
  captionInput.value = quickTextInput.value.trim();
  updateCaption();
});

document.querySelectorAll("[data-template-choice]").forEach((button) => {
  button.addEventListener("click", () => {
    templateInput.value = button.dataset.templateChoice;
  });
});

document.querySelectorAll("[data-sticker-position]").forEach((button) => {
  button.addEventListener("click", () => {
    stickerPositionInput.value = button.dataset.stickerPosition;
  });
});

document.querySelectorAll("[data-volume]").forEach((button) => {
  button.addEventListener("click", () => {
    volumeInput.value = button.dataset.volume;
    muteInput.checked = Number(button.dataset.volume) === 0;
    updatePreviewAudio();
  });
});

document.querySelectorAll("[data-effect]").forEach((button) => {
  button.addEventListener("click", () => applyEffect(button.dataset.effect));
});

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => applyFilter(button.dataset.filter));
});

[brightnessInput, contrastInput, saturationInput].forEach((input) => {
  input.addEventListener("input", updatePreviewEffects);
});

volumeInput.addEventListener("input", updatePreviewAudio);
muteInput.addEventListener("change", updatePreviewAudio);

[trimStartInput, trimEndInput].forEach((input) => {
  input.addEventListener("input", renderTimeline);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  delete payload.source;
  const sourcePath = sourcePathInput.value.trim();
  payload.sourceName = selectedSource?.name || fileNameFromPath(sourcePath);
  payload.sourceSize = selectedSource?.size || 0;
  payload.sourcePath = sourcePath;
  payload.duration = getDuration();
  payload.caption = captionInput.value.trim();
  payload.subtitles = getCleanSubtitles();
  payload.brightness = Number(brightnessInput.value);
  payload.contrast = Number(contrastInput.value);
  payload.saturation = Number(saturationInput.value);
  payload.volume = Number(volumeInput.value);
  payload.muted = muteInput.checked;
  payload.stickerPath = stickerPathInput.value.trim();
  payload.stickerPosition = stickerPositionInput.value;
  payload.stickerScale = Number(stickerScaleInput.value);
  payload.musicPath = musicPathInput.value.trim();
  payload.musicVolume = Number(musicVolumeInput.value);
  payload.backgroundPath = backgroundPathInput.value.trim();
  payload.template = templateInput.value;
  payload.introText = introTextInput.value.trim();
  payload.outroText = outroTextInput.value.trim();
  payload.templateSeconds = Number(templateSecondsInput.value);
  payload.localAssetRequired = Boolean(selectedSource || sourcePath);
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
  updatePreviewEffects();
  updatePreviewAudio();
  syncProjectTitle();
  renderSubtitles();
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

function activateTool(name) {
  railItems.forEach((item) => item.classList.toggle("active", item.dataset.tool === name));
  toolPanes.forEach((pane) => pane.classList.toggle("active", pane.dataset.pane === name));
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
        : `<div class="result-box">${edit.sourcePath ? "等待本地 FFmpeg 导出" : "需要填写本地素材路径"}</div>`;

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
            ${edit.sourcePath ? `<div class="job-notes">素材路径：${escapeHtml(edit.sourcePath)}</div>` : ""}
            ${edit.caption ? `<div class="job-notes">标题字幕：${escapeHtml(edit.caption)}</div>` : ""}
            ${edit.subtitles?.length ? `<div class="job-notes">字幕段数：${edit.subtitles.length}</div>` : ""}
            ${edit.stickerPath ? `<div class="job-notes">贴纸：${escapeHtml(edit.stickerPath)}</div>` : ""}
            ${edit.musicPath ? `<div class="job-notes">背景音乐：${escapeHtml(edit.musicPath)}</div>` : ""}
            ${edit.backgroundPath ? `<div class="job-notes">背景图片：${escapeHtml(edit.backgroundPath)}</div>` : ""}
            ${edit.template && edit.template !== "none" ? `<div class="job-notes">模板：${escapeHtml(edit.template)}</div>` : ""}
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
  const activeSubtitle = getPreviewSubtitle();
  captionOverlay.textContent = activeSubtitle || value || "字幕预览";
  captionOverlay.classList.toggle("muted", !activeSubtitle && !value);
  renderTimeline();
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

function renderSubtitles() {
  subtitleList.innerHTML = subtitles
    .map((item, index) => `
      <div class="subtitle-row" data-id="${item.id}">
        <input class="subtitle-time" data-field="start" type="number" min="0" step="0.1" value="${escapeHtml(item.start)}" aria-label="字幕开始时间" />
        <input class="subtitle-time" data-field="end" type="number" min="0" step="0.1" value="${escapeHtml(item.end)}" aria-label="字幕结束时间" />
        <input class="subtitle-text" data-field="text" maxlength="120" value="${escapeHtml(item.text)}" placeholder="字幕 ${index + 1}" />
        <button class="icon-button" type="button" data-remove="${item.id}" aria-label="删除字幕">×</button>
      </div>
    `)
    .join("");

  subtitleList.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", (event) => {
      const row = event.target.closest(".subtitle-row");
      const item = subtitles.find((subtitle) => subtitle.id === row.dataset.id);
      if (!item) return;
      const field = event.target.dataset.field;
      item[field] = field === "text" ? event.target.value : Number(event.target.value || 0);
      updateCaption();
    });
  });

  subtitleList.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      subtitles = subtitles.filter((subtitle) => subtitle.id !== button.dataset.remove);
      if (!subtitles.length) subtitles.push({ id: makeId(), start: 0, end: 3, text: "" });
      renderSubtitles();
    });
  });

  renderTimeline();
}

function renderTimeline() {
  const duration = Math.max(1, getDuration());
  timelineDuration.textContent = `${duration}s`;
  clipBar.style.width = "100%";
  subtitleBars.innerHTML = subtitles
    .map((subtitle) => ({
      id: subtitle.id,
      start: Number(subtitle.start || 0),
      end: Number(subtitle.end || 0),
      text: String(subtitle.text || "").trim()
    }))
    .filter((subtitle) => subtitle.text && subtitle.end > subtitle.start)
    .map((subtitle) => {
      const left = Math.max(0, Math.min(100, (subtitle.start / duration) * 100));
      const width = Math.max(4, Math.min(100 - left, ((subtitle.end - subtitle.start) / duration) * 100));
      return `<div class="subtitle-bar" data-id="${escapeHtml(subtitle.id)}" style="left:${left}%;width:${width}%">${escapeHtml(subtitle.text)}</div>`;
    })
    .join("");
  renderMarkers(duration);
  updateTimelinePlayhead();
  updateTimelineAssets();
  bindTimelineDrag();
}

function getCleanSubtitles() {
  return subtitles
    .map((subtitle) => ({
      start: Number(subtitle.start || 0),
      end: Number(subtitle.end || 0),
      text: String(subtitle.text || "").trim()
    }))
    .filter((subtitle) => subtitle.text && subtitle.end > subtitle.start)
    .slice(0, 50);
}

function getPreviewSubtitle() {
  const current = Number.isFinite(previewVideo.currentTime) ? previewVideo.currentTime : 0;
  const match = getCleanSubtitles().find((subtitle) => current >= subtitle.start && current <= subtitle.end);
  return match?.text || "";
}

function updatePreviewEffects() {
  previewVideo.style.filter = [
    `brightness(${1 + Number(brightnessInput.value)})`,
    `contrast(${Number(contrastInput.value)})`,
    `saturate(${Number(saturationInput.value)})`
  ].join(" ");
}

function updatePreviewAudio() {
  previewVideo.volume = Math.max(0, Math.min(1, Number(volumeInput.value)));
  previewVideo.muted = muteInput.checked;
}

function toggleTimelinePlayback() {
  if (!previewVideo.src) return;
  if (previewVideo.paused) previewVideo.play();
  else previewVideo.pause();
}

function updateTimelinePlayhead() {
  const duration = Math.max(1, getDuration());
  const current = Number.isFinite(previewVideo.currentTime) ? previewVideo.currentTime : 0;
  const percent = Math.max(0, Math.min(100, (current / duration) * 100));
  playhead.style.setProperty("--playhead", `${percent}%`);
  currentTimeText.textContent = formatClock(current);
}

function deleteSubtitleTrack() {
  subtitles = [{ id: makeId(), start: 0, end: 3, text: "" }];
  markers = [];
  renderSubtitles();
}

function splitSubtitleAtPlayhead() {
  const current = Number(previewVideo.currentTime || 0);
  const item = subtitles.find((subtitle) => current > Number(subtitle.start) && current < Number(subtitle.end));
  if (!item || !item.text.trim()) return;
  const originalEnd = Number(item.end);
  item.end = Number(current.toFixed(1));
  subtitles.push({
    id: makeId(),
    start: Number(current.toFixed(1)),
    end: originalEnd,
    text: item.text
  });
  subtitles.sort((a, b) => Number(a.start) - Number(b.start));
  renderSubtitles();
}

function addTimelineMarker() {
  const current = Number(previewVideo.currentTime || 0);
  markers.push({ id: makeId(), time: current });
  renderTimeline();
}

function renderMarkers(duration) {
  document.querySelectorAll(".timeline-marker").forEach((marker) => marker.remove());
  const timelineBody = document.querySelector(".timeline-body");
  markers.forEach((marker) => {
    const percent = Math.max(0, Math.min(100, (marker.time / duration) * 100));
    const element = document.createElement("div");
    element.className = "timeline-marker";
    element.style.setProperty("--marker-left", `${percent}%`);
    element.title = `标记 ${formatClock(marker.time)}`;
    timelineBody.appendChild(element);
  });
}

function setTimelineZoom(value) {
  const next = Math.max(60, Math.min(180, value));
  timelineZoomInput.value = String(next);
  document.querySelector(".timeline-lanes").style.width = `${next}%`;
  document.querySelector(".timeline-ruler").style.width = `${next}%`;
}

function handleTimelineDrop(event) {
  event.preventDefault();
  dropLane.classList.remove("drag-over");
  const file = event.dataTransfer.files?.[0];
  if (!file) return;
  if (file.type.startsWith("video/")) {
    selectedSource = file;
    previewVideo.src = URL.createObjectURL(file);
    previewVideo.classList.add("ready");
    emptyPreview.classList.add("hidden");
    videoAssetName.textContent = file.name;
    previewMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
    sourcePathInput.placeholder = `请粘贴这个文件在客户电脑里的完整路径：${file.name}`;
  } else if (file.type.startsWith("audio/")) {
    musicAssetName.textContent = file.name;
    musicPathInput.placeholder = `请粘贴这个音乐在客户电脑里的完整路径：${file.name}`;
  } else if (file.type.startsWith("image/")) {
    stickerAssetName.textContent = file.name;
    stickerPathInput.placeholder = `请粘贴这个图片在客户电脑里的完整路径：${file.name}`;
  }
  updateTimelineAssets();
}

function updateTimelineAssets() {
  audioWave.classList.toggle("has-audio", Boolean(musicPathInput.value.trim() || musicFileInput.files?.[0]));
}

function formatClock(seconds) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = Math.floor(safeSeconds % 60);
  return [h, m, s].map((part) => String(part).padStart(2, "0")).join(":");
}

function applyEffect(effect) {
  const presets = {
    bright: { brightness: 0.15, contrast: 1.05, saturation: 1.1 },
    contrast: { brightness: 0.02, contrast: 1.35, saturation: 1.05 },
    soft: { brightness: 0.08, contrast: 0.85, saturation: 0.9 },
    reset: { brightness: 0, contrast: 1, saturation: 1 }
  };
  const preset = presets[effect] || presets.reset;
  brightnessInput.value = preset.brightness;
  contrastInput.value = preset.contrast;
  saturationInput.value = preset.saturation;
  updatePreviewEffects();
}

function applyFilter(filter) {
  const presets = {
    vivid: { brightness: 0.03, contrast: 1.12, saturation: 1.45 },
    mono: { brightness: 0, contrast: 1.08, saturation: 0.15 },
    warm: { brightness: 0.06, contrast: 1.02, saturation: 1.22 },
    reset: { brightness: 0, contrast: 1, saturation: 1 }
  };
  const preset = presets[filter] || presets.reset;
  brightnessInput.value = preset.brightness;
  contrastInput.value = preset.contrast;
  saturationInput.value = preset.saturation;
  updatePreviewEffects();
}

function syncProjectTitle() {
  const value = titleInput.value.trim() || "Cloud video project";
  projectNameLabel.textContent = value;
}

function autoSplitCaptions() {
  const text = autoCaptionText.value.trim();
  if (!text) return;
  const pieces = text
    .split(/[\n。！？!?；;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 50);
  if (!pieces.length) return;
  const duration = Math.max(1, getDuration());
  const step = Math.max(1.2, duration / pieces.length);
  subtitles = pieces.map((textPiece, index) => ({
    id: makeId(),
    start: Number((index * step).toFixed(1)),
    end: Number(Math.min(duration, (index + 1) * step).toFixed(1)),
    text: textPiece
  }));
  renderSubtitles();
}

function bindTimelineDrag() {
  subtitleBars.querySelectorAll(".subtitle-bar").forEach((bar) => {
    bar.addEventListener("pointerdown", (event) => {
      const item = subtitles.find((subtitle) => subtitle.id === bar.dataset.id);
      if (!item) return;
      event.preventDefault();
      bar.setPointerCapture(event.pointerId);
      const rect = subtitleBars.getBoundingClientRect();
      const duration = Math.max(1, getDuration());
      const startX = event.clientX;
      const originalStart = Number(item.start || 0);
      const originalEnd = Number(item.end || 0);
      const length = Math.max(0.5, originalEnd - originalStart);

      function move(moveEvent) {
        const delta = ((moveEvent.clientX - startX) / rect.width) * duration;
        const nextStart = Math.max(0, Math.min(duration - length, originalStart + delta));
        item.start = Number(nextStart.toFixed(1));
        item.end = Number((nextStart + length).toFixed(1));
        renderSubtitles();
      }

      function up() {
        bar.releasePointerCapture(event.pointerId);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      }

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  });
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

function fileNameFromPath(value) {
  return String(value || "").split(/[\\/]/).filter(Boolean).pop() || "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
