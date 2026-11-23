import { generateLutText, LUT_SIZE } from "./lutExporter";
import { DEFAULT_ENGINE_ID, getEngineCodename } from "./engineMetadata";
import { scaleParamsByStrength } from "./gradeEngine";
import { isLogProfileActive } from "./logProfiles";

const LOG_LUT_SIZE = 65;

const CLOUD_CLIENT_ID_KEY = "kf_cloud_client_id";
const DEFAULT_PROD_CLOUD_RENDER_URL = "https://color-match-tool-cloud-render.onrender.com";
const DEFAULT_MAX_DURATION_SEC = 60;
const DEFAULT_MAX_FILE_SIZE_MB = 100;
const DEFAULT_DAILY_LIMIT = 5;
const DEFAULT_MAX_CONCURRENCY = 2;
const POLL_INTERVAL_MS = 2000;
const RENDER_POLL_TIMEOUT_MS = 360_000;
const WAKE_TIMEOUT_MS = 110_000;
const WAKE_POLL_INTERVAL_MS = 3_000;
const WORKER_TARGET_TIMEOUT_MS = 95_000;
const WORKER_TARGET_WAKE_NOTICE_MS = 4_000;
const WORKER_TARGET_CACHE_TTL_MS = 5_000;
const DIRECT_TUNNEL_HEALTH_TIMEOUT_MS = 5_000;

let workerTargetCache = { fetchedAt: 0, renderBaseUrl: "", value: null };

export function getCloudRenderBaseUrl() {
  const raw = import.meta.env?.VITE_CLOUD_RENDER_URL;
  const normalized = typeof raw === "string" ? raw.trim().replace(/\/+$/, "") : "";
  if (normalized) return normalized;
  if (import.meta.env?.PROD) return DEFAULT_PROD_CLOUD_RENDER_URL;
  return "";
}

export function isCloudRenderConfigured() {
  return getCloudRenderBaseUrl().length > 0;
}

export function getOrCreateClientId() {
  const fallback = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `kf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      let id = window.localStorage.getItem(CLOUD_CLIENT_ID_KEY);
      if (!id) {
        id = fallback();
        window.localStorage.setItem(CLOUD_CLIENT_ID_KEY, id);
      }
      return id;
    }
  } catch {
    // ignore storage errors
  }
  return fallback();
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

function sleepWithAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
    } catch {
      // ignore
    }
    URL.revokeObjectURL(url);
  }, 1500);
}

function probeVideoDurationSec(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    v.preload = "metadata";
    const cleanup = () => {
      v.removeAttribute("src");
      v.load();
      URL.revokeObjectURL(url);
    };
    v.onloadedmetadata = () => {
      const dur = Number.isFinite(v.duration) ? v.duration : 0;
      cleanup();
      resolve(dur);
    };
    v.onerror = () => {
      cleanup();
      resolve(0);
    };
    v.src = url;
  });
}

async function fetchWithDetail(url, options, contextLabel) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    const wrapped = new Error(`${contextLabel} failed (${err?.message || "network/CORS error"}).`);
    wrapped.isNetworkError = true;
    throw wrapped;
  }
}

function isTunnelUnreachableError(err) {
  if (!err || err.name === "AbortError") return false;
  if (err.isNetworkError || err.isTunnelUnreachable) return true;
  const msg = String(err.message || "");
  return (
    /network\/CORS error/i.test(msg) ||
    /did not respond within/i.test(msg) ||
    /HTTP (502|503|52[0-9]|530)\b/.test(msg)
  );
}

async function resolveWorkerTarget(renderBaseUrl, abortSignal, onStatusChange) {
  const fallback = {
    mode: "render-cpu",
    baseUrl: renderBaseUrl,
    renderBaseUrl,
    limits: {
      dailyLimit: DEFAULT_DAILY_LIMIT,
      maxDurationSec: DEFAULT_MAX_DURATION_SEC,
      maxFileSizeMb: DEFAULT_MAX_FILE_SIZE_MB,
    },
  };
  if (!renderBaseUrl) return fallback;

  throwIfAborted(abortSignal);
  if (
    workerTargetCache.value &&
    workerTargetCache.renderBaseUrl === renderBaseUrl &&
    Date.now() - workerTargetCache.fetchedAt < WORKER_TARGET_CACHE_TTL_MS
  ) {
    return workerTargetCache.value;
  }

  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  abortSignal?.addEventListener("abort", onParentAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), WORKER_TARGET_TIMEOUT_MS);
  const wakeNoticeTimer = onStatusChange
    ? setTimeout(() => {
        onStatusChange({ progress: 14, statusText: "Waking up cloud worker..." });
      }, WORKER_TARGET_WAKE_NOTICE_MS)
    : null;

  try {
    const resp = await fetch(`${renderBaseUrl}/api/worker-target`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!resp.ok) return fallback;
    const data = await resp.json().catch(() => null);
    const targetUrl =
      typeof data?.baseUrl === "string" ? data.baseUrl.trim().replace(/\/+$/, "") : "";
    let resolved = fallback;
    if (data?.mode === "kaggle-gpu" && /^https?:\/\//i.test(targetUrl)) {
      resolved = {
        mode: "kaggle-gpu",
        baseUrl: targetUrl,
        renderBaseUrl,
        limits: {
          dailyLimit: Number(data?.limits?.dailyLimit) || 15,
          maxDurationSec: Number(data?.limits?.maxDurationSec) || 180,
          maxFileSizeMb: Number(data?.limits?.maxFileSizeMb) || 300,
        },
      };
    } else if (data?.limits) {
      resolved = {
        ...fallback,
        limits: {
          dailyLimit: Number(data.limits.dailyLimit) || DEFAULT_DAILY_LIMIT,
          maxDurationSec: Number(data.limits.maxDurationSec) || DEFAULT_MAX_DURATION_SEC,
          maxFileSizeMb: Number(data.limits.maxFileSizeMb) || DEFAULT_MAX_FILE_SIZE_MB,
        },
      };
    }
    workerTargetCache = {
      fetchedAt: Date.now(),
      renderBaseUrl,
      value: resolved,
    };
    return resolved;
  } catch {
    if (abortSignal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    return fallback;
  } finally {
    clearTimeout(timer);
    if (wakeNoticeTimer) clearTimeout(wakeNoticeTimer);
    abortSignal?.removeEventListener("abort", onParentAbort);
  }
}

function uploadViaPut(url, body, contentType, onProgress, abortSignal) {
  return new Promise((resolve, reject) => {
    throwIfAborted(abortSignal);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    if (contentType) {
      xhr.setRequestHeader("Content-Type", contentType);
    }

    const onAbort = () => {
      xhr.abort();
      reject(new DOMException("Aborted", "AbortError"));
    };
    abortSignal?.addEventListener("abort", onAbort, { once: true });

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && typeof onProgress === "function") {
        onProgress(e.loaded / Math.max(1, e.total));
      }
    };

    xhr.onload = () => {
      abortSignal?.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        const detail = xhr.statusText ? ` ${xhr.statusText}` : "";
        reject(new Error(`Cloud storage upload failed (HTTP ${xhr.status}${detail}).`));
      }
    };

    xhr.onerror = () => {
      abortSignal?.removeEventListener("abort", onAbort);
      const err = new Error(
        "Network/CORS error while uploading to cloud storage (R2 PUT blocked or unreachable)."
      );
      err.isR2UploadNetworkError = true;
      reject(err);
    };

    xhr.send(body);
  });
}

function uploadViaWorker(baseUrl, jobId, videoBlob, fileName, cubeText, onProgress, abortSignal) {
  return new Promise((resolve, reject) => {
    throwIfAborted(abortSignal);
    const formData = new FormData();
    formData.append("video", videoBlob, fileName || "input.mp4");
    formData.append(
      "lut",
      new Blob([cubeText], { type: "text/plain;charset=utf-8" }),
      "grade.cube"
    );

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${baseUrl}/api/jobs/${encodeURIComponent(jobId)}/upload`, true);

    const onAbort = () => {
      xhr.abort();
      reject(new DOMException("Aborted", "AbortError"));
    };
    abortSignal?.addEventListener("abort", onAbort, { once: true });

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && typeof onProgress === "function") {
        onProgress(e.loaded / Math.max(1, e.total));
      }
    };

    xhr.onload = () => {
      abortSignal?.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let detail = xhr.statusText ? ` ${xhr.statusText}` : "";
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed?.error) detail = `: ${parsed.error}`;
        } catch {
          // ignore non-JSON body
        }
        const err = new Error(`Worker upload fallback failed (HTTP ${xhr.status}${detail}).`);
        if (xhr.status >= 502) err.isTunnelUnreachable = true;
        reject(err);
      }
    };

    xhr.onerror = () => {
      abortSignal?.removeEventListener("abort", onAbort);
      const err = new Error("Worker upload fallback failed (network/CORS error).");
      err.isNetworkError = true;
      reject(err);
    };

    xhr.send(formData);
  });
}

async function wakeCloudWorker(baseUrl, onStatusChange, abortSignal, options = {}) {
  if (options.fastCheck) {
    throwIfAborted(abortSignal);
    onStatusChange?.({ progress: 5, statusText: "Connecting to Kaggle GPU worker..." });
    const controller = new AbortController();
    const onParentAbort = () => controller.abort();
    abortSignal?.addEventListener("abort", onParentAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), DIRECT_TUNNEL_HEALTH_TIMEOUT_MS);
    try {
      const resp = await fetch(`${baseUrl}/health`, {
        method: "GET",
        signal: controller.signal,
      });
      if (resp.ok) {
        return await resp.json();
      }
      const err = new Error(`Direct tunnel health check failed (HTTP ${resp.status}).`);
      err.isTunnelUnreachable = true;
      throw err;
    } catch (err) {
      if (abortSignal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (!err.isTunnelUnreachable) {
        err.isTunnelUnreachable = true;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", onParentAbort);
    }
  }

  const deadline = Date.now() + WAKE_TIMEOUT_MS;
  let attempt = 0;
  let lastError = "";

  while (Date.now() < deadline) {
    throwIfAborted(abortSignal);
    if (attempt === 0) {
      onStatusChange?.({ progress: 5, statusText: "Waking up cloud worker..." });
    } else {
      onStatusChange?.({
        progress: 8,
        statusText: "Waking up cloud worker (cold start)...",
      });
    }

    const remainingMs = Math.max(1000, deadline - Date.now());
    const attemptController = new AbortController();
    const onParentAbort = () => attemptController.abort();
    abortSignal?.addEventListener("abort", onParentAbort, { once: true });
    const attemptTimer = setTimeout(() => attemptController.abort(), remainingMs);

    try {
      const resp = await fetch(`${baseUrl}/health`, {
        method: "GET",
        signal: attemptController.signal,
      });
      if (resp.ok) {
        return await resp.json();
      }
      const errBody = await resp.json().catch(() => ({}));
      lastError =
        errBody.error || `HTTP ${resp.status}${resp.statusText ? ` ${resp.statusText}` : ""}`;
      if (resp.status >= 400 && resp.status < 500) {
        throw new Error(`Cloud worker health check failed (${lastError}).`);
      }
    } catch (err) {
      if (abortSignal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (err?.message?.startsWith("Cloud worker health check failed")) {
        throw err;
      }
      lastError =
        err?.name === "AbortError"
          ? "request timed out"
          : err?.message || "network/CORS error";
    } finally {
      clearTimeout(attemptTimer);
      abortSignal?.removeEventListener("abort", onParentAbort);
    }

    attempt += 1;
    const sleepMs = Math.min(WAKE_POLL_INTERVAL_MS, Math.max(0, deadline - Date.now()));
    if (sleepMs <= 0) break;
    await sleepWithAbort(sleepMs, abortSignal);
  }

  const detail = lastError ? `: ${lastError}` : "";
  throw new Error(
    `Cloud worker did not respond within ${Math.round(WAKE_TIMEOUT_MS / 1000)}s${detail}. Please try again or use Local Render.`
  );
}

async function fetchQuotaFromBase(baseUrl, clientId, workerMode, fallbackLimits, signal) {
  const resp = await fetchWithDetail(
    `${baseUrl}/api/quota?clientId=${encodeURIComponent(clientId)}`,
    { method: "GET", signal },
    `Cloud quota check (${baseUrl})`
  );
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    const statusLabel = `HTTP ${resp.status}${resp.statusText ? ` ${resp.statusText}` : ""}`;
    const err = new Error(errBody.error || `Failed to fetch cloud quota (${statusLabel}).`);
    if (resp.status >= 502) err.isTunnelUnreachable = true;
    throw err;
  }
  const data = await resp.json();
  return {
    configured: true,
    workerMode: data.workerMode || workerMode,
    workerBaseUrl: baseUrl,
    used: Number(data.used ?? 0),
    remaining: Number(data.remaining ?? 0),
    limit: Number(data.limit ?? fallbackLimits.dailyLimit),
    queueLength: Number(data.queueLength ?? 0),
    activeWorkers: Number(data.activeWorkers ?? 0),
    maxConcurrency: Number(data.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY),
    queuedJobs: Number(data.queuedJobs ?? 0),
    maxDurationSec: Number(data.maxDurationSec ?? fallbackLimits.maxDurationSec),
    maxFileSizeMb: Number(data.maxFileSizeMb ?? fallbackLimits.maxFileSizeMb),
  };
}

export async function fetchCloudQuota(signal) {
  const renderBaseUrl = getCloudRenderBaseUrl();
  if (!renderBaseUrl) {
    return {
      configured: false,
      workerMode: "render-cpu",
      workerBaseUrl: "",
      used: 0,
      remaining: 0,
      limit: DEFAULT_DAILY_LIMIT,
      queueLength: 0,
      activeWorkers: 0,
      maxConcurrency: DEFAULT_MAX_CONCURRENCY,
      queuedJobs: 0,
      maxDurationSec: DEFAULT_MAX_DURATION_SEC,
      maxFileSizeMb: DEFAULT_MAX_FILE_SIZE_MB,
    };
  }
  const clientId = getOrCreateClientId();
  const target = await resolveWorkerTarget(renderBaseUrl, signal);

  try {
    return await fetchQuotaFromBase(target.baseUrl, clientId, target.mode, target.limits, signal);
  } catch (err) {
    if (
      target.mode === "kaggle-gpu" &&
      target.baseUrl !== renderBaseUrl &&
      isTunnelUnreachableError(err)
    ) {
      return await fetchQuotaFromBase(
        renderBaseUrl,
        clientId,
        "kaggle-gpu",
        target.limits,
        signal
      );
    }
    throw err;
  }
}

export async function exportVideoInCloud({
  videoSrc,
  targetFile = null,
  videoDurationSec = 0,
  params,
  activeLut = null,
  lutMix = 1.0,
  engine = DEFAULT_ENGINE_ID,
  matchStrength = 100,
  logProfile = "rec709",
  presetName = "Target",
  onProgress,
  onStatusChange,
  abortSignal,
}) {
  const renderBaseUrl = getCloudRenderBaseUrl();
  if (!renderBaseUrl) {
    throw new Error(
      "Cloud Render is not configured (VITE_CLOUD_RENDER_URL is unset). Use Local Render instead."
    );
  }

  const report = (pct, statusText) => {
    onProgress?.(pct);
    onStatusChange?.({ progress: pct, statusText });
  };

  throwIfAborted(abortSignal);
  const clientId = getOrCreateClientId();

  // 1. Resolve source video Blob
  report(2, "Preparing video file...");
  let videoBlob = null;
  if (targetFile instanceof Blob) {
    videoBlob = targetFile;
  } else if (videoSrc) {
    const resp = await fetch(videoSrc, { signal: abortSignal });
    if (!resp.ok) {
      throw new Error(`Unable to read source video (HTTP ${resp.status}).`);
    }
    videoBlob = await resp.blob();
  } else {
    throw new Error("No source video found for Cloud Render.");
  }

  const durationSec =
    Number.isFinite(videoDurationSec) && videoDurationSec > 0
      ? videoDurationSec
      : await probeVideoDurationSec(videoBlob);

  // 2. Bake active grading stack into a .cube 3D LUT (65^3 when Camera Log is active, 33^3 otherwise)
  const useLogLutSize = isLogProfileActive(logProfile);
  const lutGridSize = useLogLutSize ? LOG_LUT_SIZE : LUT_SIZE;
  report(12, useLogLutSize ? "Baking 65³ Log 3D LUT (.cube)..." : "Baking 3D LUT (.cube)...");
  const effectiveParams =
    typeof matchStrength === "number" && matchStrength !== 100
      ? scaleParamsByStrength(params, matchStrength)
      : params;
  const cubeText = generateLutText(
    effectiveParams,
    presetName || "Match Grade",
    lutGridSize,
    logProfile,
    activeLut,
    lutMix
  );

  const rawFileName =
    (targetFile instanceof File && targetFile.name) || `${presetName || "video"}.mp4`;
  const contentType = videoBlob.type || "video/mp4";

  const executePipeline = async (baseUrl, workerMode, limits) => {
    // Wake worker & check quota
    const isDirectTunnel = workerMode === "kaggle-gpu" && baseUrl !== renderBaseUrl;
    await wakeCloudWorker(baseUrl, onStatusChange, abortSignal, { fastCheck: isDirectTunnel });

    const quota = await fetchQuotaFromBase(baseUrl, clientId, workerMode, limits, abortSignal);
    const effectiveMode = quota.workerMode || workerMode;
    if (quota.remaining <= 0) {
      throw new Error(
        `Daily Cloud Render quota (${quota.limit}/day) reached. Switch to Local Render for unlimited exports.`
      );
    }
    const maxBytes = quota.maxFileSizeMb * 1024 * 1024;
    if (videoBlob.size > maxBytes) {
      throw new Error(
        `Video exceeds ${quota.maxFileSizeMb} MB Cloud Render limit. Use Local Render for larger files.`
      );
    }
    if (!durationSec || durationSec > quota.maxDurationSec) {
      throw new Error(
        `Video exceeds ${quota.maxDurationSec}s Cloud Render limit. Use Local Render for longer clips.`
      );
    }

    // Initialize job & presigned R2 URLs
    report(16, "Initializing cloud job...");
    const initResp = await fetchWithDetail(
      `${baseUrl}/api/jobs/init`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          fileName: rawFileName,
          fileSizeBytes: videoBlob.size,
          durationSec,
          contentType,
        }),
        signal: abortSignal,
      },
      "Initialize cloud job"
    );
    const initData = await initResp.json().catch(() => ({}));
    if (!initResp.ok) {
      const err = new Error(
        initData.error || `Failed to initialize cloud job (HTTP ${initResp.status}).`
      );
      if (initResp.status >= 502) err.isTunnelUnreachable = true;
      throw err;
    }

    const { jobId, videoUploadUrl, lutUploadUrl } = initData;

    // Direct upload video + .cube to Cloudflare R2 (fall back to worker upload on Network/CORS error)
    try {
      report(20, "Uploading video to cloud storage...");
      await uploadViaPut(
        videoUploadUrl,
        videoBlob,
        contentType,
        (ratio) => {
          const pct = 20 + Math.round(ratio * 25);
          report(pct, `Uploading video (${Math.round(ratio * 100)}%)...`);
        },
        abortSignal
      );

      report(46, "Uploading 3D LUT (.cube)...");
      await uploadViaPut(
        lutUploadUrl,
        cubeText,
        "text/plain;charset=utf-8",
        null,
        abortSignal
      );
    } catch (uploadErr) {
      if (!uploadErr?.isR2UploadNetworkError) {
        throw uploadErr;
      }
      report(20, "Direct R2 upload blocked; uploading via worker fallback...");
      await uploadViaWorker(
        baseUrl,
        jobId,
        videoBlob,
        rawFileName,
        cubeText,
        (ratio) => {
          const pct = 20 + Math.round(ratio * 28);
          report(pct, `Uploading via worker (${Math.round(ratio * 100)}%)...`);
        },
        abortSignal
      );
    }

    // Enqueue FIFO render job
    report(
      50,
      effectiveMode === "kaggle-gpu"
        ? "Enqueueing Kaggle GPU FFmpeg job..."
        : "Enqueueing Cloud FFmpeg job..."
    );
    const startResp = await fetchWithDetail(
      `${baseUrl}/api/jobs/${encodeURIComponent(jobId)}/start`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
        signal: abortSignal,
      },
      "Start cloud render"
    );
    const startData = await startResp.json().catch(() => ({}));
    if (startResp.status === 404) {
      const reason = (startData.error || "Job not found or worker restarted").replace(/\.+$/, "");
      throw new Error(/retry/i.test(reason) ? `${reason}.` : `${reason}. Please retry.`);
    }
    if (!startResp.ok) {
      const err = new Error(
        startData.error || `Failed to start cloud render (HTTP ${startResp.status}).`
      );
      if (startResp.status >= 502) err.isTunnelUnreachable = true;
      throw err;
    }

    // Poll job status every 2s (up to 6 minutes)
    let downloadUrl = null;
    const pollStartTime = Date.now();
    while (true) {
      throwIfAborted(abortSignal);
      if (Date.now() - pollStartTime > RENDER_POLL_TIMEOUT_MS) {
        throw new Error(
          "Cloud render timed out after 6 minutes. Please try again or use Local Render."
        );
      }
      await sleepWithAbort(POLL_INTERVAL_MS, abortSignal);

      const statusResp = await fetchWithDetail(
        `${baseUrl}/api/jobs/${encodeURIComponent(jobId)}`,
        {
          method: "GET",
          signal: abortSignal,
        },
        "Poll cloud job status"
      );
      const job = await statusResp.json().catch(() => ({}));
      if (statusResp.status === 404) {
        const reason = (job.error || "Job not found or worker restarted").replace(/\.+$/, "");
        throw new Error(/retry/i.test(reason) ? `${reason}.` : `${reason}. Please retry.`);
      }
      if (!statusResp.ok) {
        const err = new Error(job.error || `Failed to poll job status (HTTP ${statusResp.status}).`);
        if (statusResp.status >= 502) err.isTunnelUnreachable = true;
        throw err;
      }

      if (job.status === "queued") {
        const pos = job.queuePosition || 1;
        report(
          52,
          effectiveMode === "kaggle-gpu"
            ? `Queue #${pos}: waiting for Kaggle GPU...`
            : `Queue #${pos}: waiting for Cloud FFmpeg...`
        );
      } else if (job.status === "processing") {
        const pctMatch = /\((\d+)%\)/.exec(job.progressText || "");
        const renderPct = pctMatch ? Number(pctMatch[1]) : 50;
        const mappedPct = 55 + Math.round((renderPct / 100) * 35);
        report(mappedPct, job.progressText || "Rendering on Cloud FFmpeg...");
      } else if (job.status === "failed") {
        throw new Error(job.error || "Cloud FFmpeg render failed.");
      } else if (job.status === "completed") {
        downloadUrl = job.downloadUrl;
        break;
      }
    }

    if (!downloadUrl) {
      throw new Error("Cloud render completed without a download URL.");
    }

    // Download rendered MP4 & trigger browser save
    report(92, "Downloading rendered MP4...");
    const codename = getEngineCodename(engine);
    const cleanBase =
      String(presetName || "Target")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "Target";
    const engineSuffix = codename ? `_${codename}` : "";
    const fileName = `${cleanBase}${engineSuffix}_cloud_graded.mp4`;

    const dlResp = await fetchWithDetail(
      downloadUrl,
      { signal: abortSignal },
      "Download rendered MP4"
    );
    if (!dlResp.ok) {
      throw new Error(`Failed to download rendered MP4 (HTTP ${dlResp.status}).`);
    }
    const mp4Blob = await dlResp.blob();
    triggerBlobDownload(mp4Blob, fileName);

    // Best-effort R2 cleanup
    report(98, "Cleaning up cloud storage...");
    try {
      await fetch(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}/cleanup`, {
        method: "POST",
      });
    } catch {
      // Server has a 15-min fallback cleanup timer
    }

    report(100, "Exported Cloud Video!");
    return { fileName, jobId, workerMode: effectiveMode };
  };

  const target = await resolveWorkerTarget(renderBaseUrl, abortSignal, onStatusChange);
  try {
    return await executePipeline(target.baseUrl, target.mode, target.limits);
  } catch (err) {
    if (
      target.mode === "kaggle-gpu" &&
      target.baseUrl !== renderBaseUrl &&
      isTunnelUnreachableError(err)
    ) {
      report(5, "Direct tunnel unreachable; routing via Render.com...");
      return await executePipeline(renderBaseUrl, "kaggle-gpu", target.limits);
    }
    throw err;
  }
}
