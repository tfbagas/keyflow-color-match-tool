"use strict";

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { pipeline } = require("stream/promises");
const { v4: uuidv4 } = require("uuid");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const PORT = Number(process.env.PORT) || 8080;
const R2_ACCOUNT_ID = (process.env.R2_ACCOUNT_ID || "").trim();
const R2_ACCESS_KEY_ID = (process.env.R2_ACCESS_KEY_ID || "").trim();
const R2_SECRET_ACCESS_KEY = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
const R2_BUCKET_NAME = (process.env.R2_BUCKET_NAME || "match-tool-cloud-render").trim();

const DAILY_LIMIT_PER_USER = Math.max(1, Number(process.env.DAILY_LIMIT_PER_USER) || 5);
const MAX_DURATION_SEC = Math.max(1, Number(process.env.MAX_DURATION_SEC) || 60);
const MAX_FILE_SIZE_MB = Math.max(1, Number(process.env.MAX_FILE_SIZE_MB) || 100);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const RENDER_CONCURRENCY = Math.min(2, Math.max(1, Number(process.env.RENDER_CONCURRENCY) || 2));
const MIN_FREE_RAM_FOR_EXTRA_WORKER_BYTES = 210 * 1024 * 1024;
const MEMORY_RECHECK_INTERVAL_MS = 1000;
const FFMPEG_TIMEOUT_MS = 360_000;
const PRESIGN_TTL_SEC = 15 * 60;
const OUTPUT_CLEANUP_MS = 15 * 60 * 1000;
const WORKER_OVERRIDE_KEY = "worker-override.json";
const WORKER_OVERRIDE_CACHE_TTL_MS = 8_000;
const WORKER_HEALTH_TIMEOUT_MS = 3000;
const WORKER_PROXY_TIMEOUT_MS = 10_000;

const r2Configured = Boolean(
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME
);

const s3Client = r2Configured
  ? new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

const app = express();
app.set("trust proxy", 1);

const corsOptions = {
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "64kb" }));

// Elastic FIFO queue (1 to RENDER_CONCURRENCY concurrent workers based on cgroup RAM)
const jobs = new Map();
const queue = [];
const activeJobs = new Set();
let memoryRecheckTimer = null;

// Daily quota maps keyed by UTC YYYY-MM-DD -> Map<key, count>
const clientDailyUsage = new Map();
const ipDailyUsage = new Map();

// In-memory cache for R2 worker-override.json (8s TTL)
let workerOverrideCache = { fetchedAt: 0, value: null };

async function readStreamToUtf8(body) {
  if (!body) return "";
  if (typeof body.transformToString === "function") {
    return body.transformToString("utf8");
  }
  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function getWorkerOverrideFromR2() {
  if (!r2Configured || !s3Client) return null;
  const now = Date.now();
  if (now - workerOverrideCache.fetchedAt < WORKER_OVERRIDE_CACHE_TTL_MS) {
    return workerOverrideCache.value;
  }

  let parsed = null;
  try {
    const resp = await s3Client.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: WORKER_OVERRIDE_KEY,
      })
    );
    const raw = await readStreamToUtf8(resp.Body);
    const data = JSON.parse(raw);
    const url = typeof data?.url === "string" ? data.url.trim().replace(/\/+$/, "") : "";
    const expiresAt = Number(data?.expiresAt);
    if (/^https?:\/\//i.test(url) && Number.isFinite(expiresAt)) {
      parsed = {
        url,
        mode: typeof data.mode === "string" && data.mode.trim() ? data.mode.trim() : "kaggle-gpu",
        expiresAt,
        limits: {
          dailyLimit: Number(data?.limits?.dailyLimit) || 15,
          maxDurationSec: Number(data?.limits?.maxDurationSec) || 180,
          maxFileSizeMb: Number(data?.limits?.maxFileSizeMb) || 300,
        },
      };
    }
  } catch (err) {
    const code = err?.name || err?.Code || "";
    if (code !== "NoSuchKey" && err?.$metadata?.httpStatusCode !== 404) {
      console.warn("[WorkerOverride] Failed to read worker-override.json from R2:", err.message);
    }
  }

  workerOverrideCache = { fetchedAt: now, value: parsed };
  return parsed;
}

async function checkWorkerHealth(baseUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WORKER_HEALTH_TIMEOUT_MS);
  if (typeof timer.unref === "function") timer.unref();
  try {
    const resp = await fetch(`${baseUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!resp.ok) return false;
    const data = await resp.json().catch(() => null);
    return data ? data.ok !== false : true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function getActiveKaggleWorkerOverride() {
  const override = await getWorkerOverrideFromR2();
  if (!override || Date.now() >= override.expiresAt) return null;
  if (override.mode !== "kaggle-gpu") return null;
  return override;
}

async function proxyJsonToWorker(override, req, res, options = {}) {
  const targetUrl = `${override.url}${req.originalUrl}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WORKER_PROXY_TIMEOUT_MS);
  if (typeof timer.unref === "function") timer.unref();

  try {
    const headers = {
      "x-forwarded-for": getClientIp(req),
    };
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    if (hasBody) {
      headers["content-type"] = "application/json";
    }

    const resp = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
      signal: controller.signal,
    });

    if (resp.status >= 502) {
      throw new Error(`Worker tunnel returned HTTP ${resp.status}`);
    }

    const rawText = await resp.text();
    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      throw new Error(`Worker returned non-JSON response (HTTP ${resp.status})`);
    }

    if (
      options.injectWorkerMode &&
      resp.ok &&
      data &&
      typeof data === "object" &&
      !data.workerMode
    ) {
      data.workerMode = override.mode;
    }

    res.status(resp.status).json(data);
    return true;
  } catch (err) {
    console.warn(
      `[WorkerProxy] ${req.method} ${req.originalUrl} failed, falling back to local Render:`,
      err.message
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function getUtcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function pruneOldQuotaBuckets(todayKey) {
  for (const key of clientDailyUsage.keys()) {
    if (key !== todayKey) clientDailyUsage.delete(key);
  }
  for (const key of ipDailyUsage.keys()) {
    if (key !== todayKey) ipDailyUsage.delete(key);
  }
}

function normalizeClientId(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function getQuotaStatus(clientId, ip) {
  const today = getUtcDateKey();
  pruneOldQuotaBuckets(today);
  const clientMap = clientDailyUsage.get(today);
  const ipMap = ipDailyUsage.get(today);
  const clientUsed = clientId && clientMap ? clientMap.get(clientId) || 0 : 0;
  const ipUsed = ip && ipMap ? ipMap.get(ip) || 0 : 0;
  const used = Math.max(clientUsed, ipUsed);
  const remaining = Math.max(0, DAILY_LIMIT_PER_USER - used);
  return {
    used,
    remaining,
    limit: DAILY_LIMIT_PER_USER,
  };
}

function incrementQuota(clientId, ip) {
  const today = getUtcDateKey();
  pruneOldQuotaBuckets(today);
  if (clientId) {
    if (!clientDailyUsage.has(today)) clientDailyUsage.set(today, new Map());
    const m = clientDailyUsage.get(today);
    m.set(clientId, (m.get(clientId) || 0) + 1);
  }
  if (ip) {
    if (!ipDailyUsage.has(today)) ipDailyUsage.set(today, new Map());
    const m = ipDailyUsage.get(today);
    m.set(ip, (m.get(ip) || 0) + 1);
  }
}

function decrementQuota(clientId, ip) {
  const today = getUtcDateKey();
  if (clientId && clientDailyUsage.has(today)) {
    const m = clientDailyUsage.get(today);
    const cur = m.get(clientId) || 0;
    if (cur > 0) m.set(clientId, cur - 1);
  }
  if (ip && ipDailyUsage.has(today)) {
    const m = ipDailyUsage.get(today);
    const cur = m.get(ip) || 0;
    if (cur > 0) m.set(ip, cur - 1);
  }
}

function getQueueLength() {
  return queue.length + activeJobs.size;
}

function getQueuePosition(jobId) {
  if (activeJobs.has(jobId)) return 0;
  const idx = queue.indexOf(jobId);
  return idx >= 0 ? idx + 1 : 0;
}

function readCgroupNumber(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw || raw === "max") return null;
    const val = Number(raw);
    return Number.isFinite(val) && val >= 0 ? val : null;
  } catch {
    return null;
  }
}

function getContainerFreeMemoryBytes() {
  // cgroup v2
  const currentV2 = readCgroupNumber("/sys/fs/cgroup/memory.current");
  const maxV2 = readCgroupNumber("/sys/fs/cgroup/memory.max");
  if (currentV2 !== null && maxV2 !== null && maxV2 > 0) {
    return Math.max(0, maxV2 - currentV2);
  }

  // cgroup v1
  const currentV1 = readCgroupNumber("/sys/fs/cgroup/memory/memory.usage_in_bytes");
  const maxV1 = readCgroupNumber("/sys/fs/cgroup/memory/memory.limit_in_bytes");
  if (currentV1 !== null && maxV1 !== null && maxV1 > 0 && maxV1 <= os.totalmem() * 2) {
    return Math.max(0, maxV1 - currentV1);
  }

  return os.freemem();
}

function sanitizeVideoExtension(fileName, contentType) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  if ([".mp4", ".mov", ".m4v", ".webm", ".mkv"].includes(ext)) {
    return ext;
  }
  if (String(contentType || "").includes("webm")) return ".webm";
  if (String(contentType || "").includes("quicktime")) return ".mov";
  return ".mp4";
}

async function deleteR2Object(key) {
  if (!s3Client || !key) return;
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      })
    );
  } catch (err) {
    console.warn(`[R2] Failed to delete ${key}:`, err.message);
  }
}

async function downloadR2ToFile(key, destPath) {
  const resp = await s3Client.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );
  if (!resp.Body) {
    throw new Error(`Empty R2 body for ${key}`);
  }
  await pipeline(resp.Body, fs.createWriteStream(destPath));
}

async function uploadFileToR2(filePath, key, contentType) {
  const stat = await fsp.stat(filePath);
  const stream = fs.createReadStream(filePath);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: stream,
      ContentType: contentType,
      ContentLength: stat.size,
    })
  );
}

function parseFfmpegTimeSec(line) {
  const match = /time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  const secs = Number(match[3]);
  return hours * 3600 + mins * 60 + secs;
}

function runFfmpegPass(inputPath, lutPath, outputPath, durationSec, audioArgs, onProgressText) {
  return new Promise((resolve, reject) => {
    // Normalize path and escape single quotes for FFmpeg single-quoted filtergraph value
    const escapedLut = lutPath.replace(/\\/g, "/").replace(/'/g, "'\\''");
    const vf =
      `scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:flags=bilinear,` +
      `scale=trunc(iw/2)*2:trunc(ih/2)*2,` +
      `lut3d=file='${escapedLut}':interp=trilinear`;

    const args = [
      "-y",
      "-loglevel",
      "error",
      "-stats",
      "-threads",
      "1",
      "-i",
      inputPath,
      "-vf",
      vf,
      "-threads",
      "1",
      "-filter_threads",
      "1",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "17",
      "-tune",
      "fastdecode",
      "-x264-params",
      "rc-lookahead=4:sync-lookahead=0:bframes=0:ref=1:aq-mode=2",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      ...audioArgs,
      outputPath,
    ];

    const proc = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderrTail = "";
    let settled = false;
    let timedOut = false;

    const killTimer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, FFMPEG_TIMEOUT_MS);
    if (typeof killTimer.unref === "function") {
      killTimer.unref();
    }

    proc.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      if (durationSec > 0) {
        const curSec = parseFfmpegTimeSec(text);
        if (curSec !== null) {
          const pct = Math.min(99, Math.max(1, Math.round((curSec / durationSec) * 100)));
          onProgressText(`Rendering on Cloud FFmpeg (${pct}%)...`);
        }
      }
      for (const line of text.split(/[\r\n]+/)) {
        const trimmed = line.trim();
        if (trimmed && !/^frame=\s*\d+/.test(trimmed)) {
          stderrTail = (stderrTail ? `${stderrTail}\n${trimmed}` : trimmed).slice(-1024);
        }
      }
    });

    proc.on("error", (err) => {
      clearTimeout(killTimer);
      if (settled) return;
      settled = true;
      reject(new Error(`Failed to start FFmpeg: ${err.message}`));
    });

    proc.on("close", (code, signal) => {
      clearTimeout(killTimer);
      if (settled) return;
      settled = true;
      if (timedOut) {
        const err = new Error(`FFmpeg timed out after ${Math.round(FFMPEG_TIMEOUT_MS / 1000)}s`);
        err.timedOut = true;
        reject(err);
        return;
      }
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `FFmpeg exited with code ${code}${signal ? ` (${signal})` : ""}: ${stderrTail.trim().slice(-300)}`
          )
        );
      }
    });
  });
}

async function runFfmpegLut(inputPath, lutPath, outputPath, durationSec, onProgressText) {
  try {
    await runFfmpegPass(inputPath, lutPath, outputPath, durationSec, ["-c:a", "copy"], onProgressText);
  } catch (err) {
    if (err.timedOut) throw err;
    console.warn(`[FFmpeg] Audio stream copy failed (${err.message}); retrying with AAC 192k...`);
    await runFfmpegPass(
      inputPath,
      lutPath,
      outputPath,
      durationSec,
      ["-c:a", "aac", "-b:a", "192k"],
      onProgressText
    );
  }
}

function scheduleJobExpiry(job, deleteOutput = true) {
  if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
  job.cleanupTimer = setTimeout(async () => {
    if (deleteOutput) {
      await deleteR2Object(job.outputKey);
    }
    jobs.delete(job.jobId);
  }, OUTPUT_CLEANUP_MS);
  if (typeof job.cleanupTimer.unref === "function") {
    job.cleanupTimer.unref();
  }
}

function clearMemoryRecheckTimer() {
  if (memoryRecheckTimer) {
    clearTimeout(memoryRecheckTimer);
    memoryRecheckTimer = null;
  }
}

function scheduleMemoryRecheck() {
  if (memoryRecheckTimer || queue.length === 0 || activeJobs.size >= RENDER_CONCURRENCY) {
    return;
  }
  memoryRecheckTimer = setTimeout(() => {
    memoryRecheckTimer = null;
    processNext();
  }, MEMORY_RECHECK_INTERVAL_MS);
  if (typeof memoryRecheckTimer.unref === "function") {
    memoryRecheckTimer.unref();
  }
}

async function runJob(job) {
  job.status = "processing";
  job.progressText = "Downloading media from cloud storage...";

  const jobDir = path.join(os.tmpdir(), job.jobId);
  const inputPath = path.join(jobDir, `input${job.videoExt}`);
  const lutPath = path.join(jobDir, "grade.cube");
  const outputPath = path.join(jobDir, "output.mp4");

  try {
    await fsp.mkdir(jobDir, { recursive: true });
    await downloadR2ToFile(job.videoKey, inputPath);
    await downloadR2ToFile(job.lutKey, lutPath);

    job.progressText = "Rendering on Cloud FFmpeg...";
    await runFfmpegLut(inputPath, lutPath, outputPath, job.durationSec, (txt) => {
      job.progressText = txt;
    });

    await Promise.all([
      fsp.rm(inputPath, { force: true }).catch(() => {}),
      fsp.rm(lutPath, { force: true }).catch(() => {}),
    ]);

    job.progressText = "Uploading rendered MP4...";
    await uploadFileToR2(outputPath, job.outputKey, "video/mp4");

    const downloadUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: job.outputKey,
        ResponseContentDisposition: `attachment; filename="${job.outputFileName}"`,
      }),
      { expiresIn: PRESIGN_TTL_SEC }
    );

    job.status = "completed";
    job.downloadUrl = downloadUrl;
    job.progressText = "Render complete";
    scheduleJobExpiry(job, true);
  } catch (err) {
    console.error(`[Worker] Job ${job.jobId} failed:`, err);
    job.status = "failed";
    job.error = err.message || "Cloud render failed";
    job.progressText = "Render failed";
    if (job.quotaCharged) {
      decrementQuota(job.clientId, job.ip);
      job.quotaCharged = false;
    }
    scheduleJobExpiry(job, false);
  } finally {
    await fsp.rm(jobDir, { recursive: true, force: true }).catch(() => {});
    await Promise.all([deleteR2Object(job.videoKey), deleteR2Object(job.lutKey)]);
    activeJobs.delete(job.jobId);
    clearMemoryRecheckTimer();
    setImmediate(processNext);
  }
}

function processNext() {
  while (queue.length > 0 && activeJobs.size < RENDER_CONCURRENCY) {
    if (activeJobs.size >= 1) {
      const freeBytes = getContainerFreeMemoryBytes();
      if (freeBytes < MIN_FREE_RAM_FOR_EXTRA_WORKER_BYTES) {
        scheduleMemoryRecheck();
        break;
      }
    }
    const nextId = queue.shift();
    const job = jobs.get(nextId);
    if (!job) continue;

    clearMemoryRecheckTimer();
    activeJobs.add(nextId);
    void runJob(job);
  }
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    queueLength: getQueueLength(),
    activeWorkers: activeJobs.size,
    maxConcurrency: RENDER_CONCURRENCY,
    queuedJobs: queue.length,
    r2Configured,
  });
});

app.get("/api/worker-target", async (_req, res) => {
  const fallback = {
    mode: "render-cpu",
    baseUrl: null,
    limits: {
      dailyLimit: DAILY_LIMIT_PER_USER,
      maxDurationSec: MAX_DURATION_SEC,
      maxFileSizeMb: MAX_FILE_SIZE_MB,
    },
  };

  try {
    const override = await getWorkerOverrideFromR2();
    if (!override || Date.now() >= override.expiresAt) {
      res.json(fallback);
      return;
    }

    const healthy = await checkWorkerHealth(override.url);
    if (!healthy) {
      res.json(fallback);
      return;
    }

    res.json({
      mode: override.mode,
      baseUrl: override.url,
      limits: override.limits,
    });
  } catch (err) {
    console.warn("[WorkerTarget] Error resolving worker target:", err.message);
    res.json(fallback);
  }
});

app.get("/api/quota", async (req, res) => {
  const override = await getActiveKaggleWorkerOverride();
  if (override && (await proxyJsonToWorker(override, req, res, { injectWorkerMode: true }))) {
    return;
  }

  const clientId = normalizeClientId(req.query.clientId);
  const ip = getClientIp(req);
  const quota = getQuotaStatus(clientId, ip);
  res.json({
    ...quota,
    workerMode: "render-cpu",
    queueLength: getQueueLength(),
    activeWorkers: activeJobs.size,
    maxConcurrency: RENDER_CONCURRENCY,
    queuedJobs: queue.length,
    maxDurationSec: MAX_DURATION_SEC,
    maxFileSizeMb: MAX_FILE_SIZE_MB,
  });
});

app.post("/api/jobs/init", async (req, res) => {
  const override = await getActiveKaggleWorkerOverride();
  if (override && (await proxyJsonToWorker(override, req, res))) {
    return;
  }

  if (!r2Configured || !s3Client) {
    res.status(503).json({ error: "Cloud storage (R2) is not configured on the server." });
    return;
  }

  const clientId = normalizeClientId(req.body?.clientId);
  if (!clientId) {
    res.status(400).json({ error: "Missing or invalid clientId." });
    return;
  }

  const ip = getClientIp(req);
  const quota = getQuotaStatus(clientId, ip);
  if (quota.remaining <= 0) {
    res.status(429).json({
      error: `Daily cloud render limit (${DAILY_LIMIT_PER_USER}/day) reached. Use Local Render for unlimited exports.`,
    });
    return;
  }

  const fileSizeBytes = Number(req.body?.fileSizeBytes);
  const durationSec = Number(req.body?.durationSec);
  const fileName = String(req.body?.fileName || "input.mp4");
  const contentType = String(req.body?.contentType || "video/mp4");

  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0 || fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    res.status(400).json({
      error: `Video file size must be between 1 byte and ${MAX_FILE_SIZE_MB} MB.`,
    });
    return;
  }

  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > MAX_DURATION_SEC) {
    res.status(400).json({
      error: `Video duration must be ${MAX_DURATION_SEC} seconds or less for Cloud Render.`,
    });
    return;
  }

  const jobId = uuidv4();
  const videoExt = sanitizeVideoExtension(fileName, contentType);
  const baseSafe =
    path
      .basename(fileName, path.extname(fileName))
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "graded";

  const videoKey = `jobs/${jobId}/input${videoExt}`;
  const lutKey = `jobs/${jobId}/grade.cube`;
  const outputKey = `jobs/${jobId}/output.mp4`;
  const outputFileName = `${baseSafe}_cloud_graded.mp4`;

  try {
    const [videoUploadUrl, lutUploadUrl] = await Promise.all([
      getSignedUrl(
        s3Client,
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: videoKey,
          ContentType: contentType,
        }),
        { expiresIn: PRESIGN_TTL_SEC }
      ),
      getSignedUrl(
        s3Client,
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: lutKey,
          ContentType: "text/plain;charset=utf-8",
        }),
        { expiresIn: PRESIGN_TTL_SEC }
      ),
    ]);

    const job = {
      jobId,
      clientId,
      ip,
      durationSec,
      videoExt,
      videoKey,
      lutKey,
      outputKey,
      outputFileName,
      status: "initialized",
      progressText: "Waiting for upload...",
      downloadUrl: null,
      error: null,
      quotaCharged: false,
      cleanupTimer: null,
    };
    jobs.set(jobId, job);
    scheduleJobExpiry(job, false);

    res.json({
      jobId,
      videoUploadUrl,
      lutUploadUrl,
      videoKey,
      lutKey,
      outputKey,
    });
  } catch (err) {
    console.error("[Init] Failed to generate presigned URLs:", err);
    res.status(500).json({ error: "Failed to initialize cloud upload URLs." });
  }
});

app.post("/api/jobs/:jobId/start", async (req, res) => {
  if (!jobs.has(req.params.jobId)) {
    const override = await getActiveKaggleWorkerOverride();
    if (override && (await proxyJsonToWorker(override, req, res))) {
      return;
    }
  }

  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found or worker restarted" });
    return;
  }

  if (job.status !== "initialized") {
    res.json({
      ok: true,
      jobId: job.jobId,
      status: job.status,
      queuePosition: getQueuePosition(job.jobId),
      queueLength: getQueueLength(),
    });
    return;
  }

  const quota = getQuotaStatus(job.clientId, job.ip);
  if (quota.remaining <= 0) {
    res.status(429).json({
      error: `Daily cloud render limit (${DAILY_LIMIT_PER_USER}/day) reached.`,
    });
    return;
  }

  if (job.cleanupTimer) {
    clearTimeout(job.cleanupTimer);
    job.cleanupTimer = null;
  }
  incrementQuota(job.clientId, job.ip);
  job.quotaCharged = true;
  job.status = "queued";
  job.progressText = "Queued for Cloud FFmpeg...";
  queue.push(job.jobId);

  const queuePosition = getQueuePosition(job.jobId);
  processNext();

  res.json({
    ok: true,
    jobId: job.jobId,
    status: job.status,
    queuePosition,
    queueLength: getQueueLength(),
    activeWorkers: activeJobs.size,
    maxConcurrency: RENDER_CONCURRENCY,
    queuedJobs: queue.length,
  });
});

app.get("/api/jobs/:jobId", async (req, res) => {
  if (!jobs.has(req.params.jobId)) {
    const override = await getActiveKaggleWorkerOverride();
    if (override && (await proxyJsonToWorker(override, req, res))) {
      return;
    }
  }

  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found or worker restarted" });
    return;
  }

  res.json({
    jobId: job.jobId,
    status: job.status,
    queuePosition: getQueuePosition(job.jobId),
    queueLength: getQueueLength(),
    activeWorkers: activeJobs.size,
    maxConcurrency: RENDER_CONCURRENCY,
    queuedJobs: queue.length,
    progressText: job.progressText,
    downloadUrl: job.downloadUrl,
    error: job.error,
  });
});

app.post("/api/jobs/:jobId/cleanup", async (req, res) => {
  if (!jobs.has(req.params.jobId)) {
    const override = await getActiveKaggleWorkerOverride();
    if (override && (await proxyJsonToWorker(override, req, res))) {
      return;
    }
  }

  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.json({ ok: true });
    return;
  }

  if (job.cleanupTimer) {
    clearTimeout(job.cleanupTimer);
    job.cleanupTimer = null;
  }
  await deleteR2Object(job.outputKey);
  jobs.delete(job.jobId);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(
    `[cloud-renderer] Listening on port ${PORT} (R2 configured: ${r2Configured}, concurrency: 1-${RENDER_CONCURRENCY}, minFreeRamMB: ${Math.round(
      MIN_FREE_RAM_FOR_EXTRA_WORKER_BYTES / (1024 * 1024)
    )}, limit: ${DAILY_LIMIT_PER_USER}/day)`
  );
});
