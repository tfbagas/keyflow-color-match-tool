import { generateLutText, LUT_SIZE } from "./lutExporter";
import { getEngineCodename } from "./engineRegistry";
import { scaleParamsByStrength } from "./gradeEngine";

const CLOUD_CLIENT_ID_KEY = "kf_cloud_client_id";
const DEFAULT_PROD_CLOUD_RENDER_URL = "https://color-match-tool-cloud-render.onrender.com";
const DEFAULT_MAX_DURATION_SEC = 30;
const DEFAULT_MAX_FILE_SIZE_MB = 80;
const DEFAULT_DAILY_LIMIT = 3;
const POLL_INTERVAL_MS = 2000;
const WAKE_TIMEOUT_MS = 75_000;
const WAKE_POLL_INTERVAL_MS = 3_000;

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
    throw new Error(`${contextLabel} failed (${err?.message || "network/CORS error"}).`);
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
      reject(
        new Error(
          "Network/CORS error while uploading to cloud storage (R2 PUT blocked or unreachable)."
        )
      );
    };

    xhr.send(body);
  });
}

async function wakeCloudWorker(baseUrl, onStatusChange, abortSignal) {
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
    `Cloud worker did not respond within 75s${detail}. Please try again or use Local Render.`
  );
}

export async function fetchCloudQuota(signal) {
  const baseUrl = getCloudRenderBaseUrl();
  if (!baseUrl) {
    return {
      configured: false,
      used: 0,
      remaining: 0,
      limit: DEFAULT_DAILY_LIMIT,
      queueLength: 0,
      maxDurationSec: DEFAULT_MAX_DURATION_SEC,
      maxFileSizeMb: DEFAULT_MAX_FILE_SIZE_MB,
    };
  }
  const clientId = getOrCreateClientId();
  const resp = await fetchWithDetail(
    `${baseUrl}/api/quota?clientId=${encodeURIComponent(clientId)}`,
    { method: "GET", signal },
    `Cloud quota check (${baseUrl})`
  );
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    const statusLabel = `HTTP ${resp.status}${resp.statusText ? ` ${resp.statusText}` : ""}`;
    throw new Error(errBody.error || `Failed to fetch cloud quota (${statusLabel}).`);
  }
  const data = await resp.json();
  return {
    configured: true,
    used: Number(data.used ?? 0),
    remaining: Number(data.remaining ?? 0),
    limit: Number(data.limit ?? DEFAULT_DAILY_LIMIT),
    queueLength: Number(data.queueLength ?? 0),
    maxDurationSec: Number(data.maxDurationSec ?? DEFAULT_MAX_DURATION_SEC),
    maxFileSizeMb: Number(data.maxFileSizeMb ?? DEFAULT_MAX_FILE_SIZE_MB),
  };
}

export async function exportVideoInCloud({
  videoSrc,
  targetFile = null,
  videoDurationSec = 0,
  params,
  activeLut = null,
  lutMix = 1.0,
  engine = "v3",
  matchStrength = 100,
  logProfile = "rec709",
  presetName = "Target",
  onProgress,
  onStatusChange,
  abortSignal,
}) {
  const baseUrl = getCloudRenderBaseUrl();
  if (!baseUrl) {
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

  // 2. Wake Render free instance & check quota
  await wakeCloudWorker(baseUrl, onStatusChange, abortSignal);

  const quota = await fetchCloudQuota(abortSignal);
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

  // 3. Bake active grading stack into a 33x33x33 .cube 3D LUT (~300 KB)
  report(12, "Baking 3D LUT (.cube)...");
  const effectiveParams =
    typeof matchStrength === "number" && matchStrength < 100
      ? scaleParamsByStrength(params, matchStrength)
      : params;
  const cubeText = generateLutText(
    effectiveParams,
    presetName || "Match Grade",
    LUT_SIZE,
    logProfile,
    activeLut,
    lutMix
  );

  // 4. Initialize job & presigned R2 URLs
  report(16, "Initializing cloud job...");
  const rawFileName =
    (targetFile instanceof File && targetFile.name) || `${presetName || "video"}.mp4`;
  const contentType = videoBlob.type || "video/mp4";

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
    throw new Error(initData.error || `Failed to initialize cloud job (HTTP ${initResp.status}).`);
  }

  const { jobId, videoUploadUrl, lutUploadUrl } = initData;

  // 5. Direct upload video + .cube to Cloudflare R2
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

  // 6. Enqueue FIFO render job
  report(50, "Enqueueing Cloud FFmpeg job...");
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
  if (!startResp.ok) {
    throw new Error(startData.error || `Failed to start cloud render (HTTP ${startResp.status}).`);
  }

  // 7. Poll job status every 2s
  let downloadUrl = null;
  while (true) {
    throwIfAborted(abortSignal);
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
    if (!statusResp.ok) {
      throw new Error(job.error || `Failed to poll job status (HTTP ${statusResp.status}).`);
    }

    if (job.status === "queued") {
      const pos = job.queuePosition || 1;
      report(52, `Queue #${pos} — waiting for Cloud FFmpeg...`);
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

  // 8. Download rendered MP4 & trigger browser save
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

  // 9. Best-effort R2 cleanup
  report(98, "Cleaning up cloud storage...");
  try {
    await fetch(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}/cleanup`, {
      method: "POST",
    });
  } catch {
    // Server has a 15-min fallback cleanup timer
  }

  report(100, "Exported Cloud Video!");
  return { fileName, jobId };
}
