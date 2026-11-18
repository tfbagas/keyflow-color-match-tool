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
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const R2_ACCOUNT_ID = (process.env.R2_ACCOUNT_ID || "").trim();
const R2_ACCESS_KEY_ID = (process.env.R2_ACCESS_KEY_ID || "").trim();
const R2_SECRET_ACCESS_KEY = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
const R2_BUCKET_NAME = (process.env.R2_BUCKET_NAME || "match-tool-cloud-render").trim();

const DAILY_LIMIT_PER_USER = Math.max(1, Number(process.env.DAILY_LIMIT_PER_USER) || 3);
const MAX_DURATION_SEC = Math.max(1, Number(process.env.MAX_DURATION_SEC) || 30);
const MAX_FILE_SIZE_MB = Math.max(1, Number(process.env.MAX_FILE_SIZE_MB) || 80);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const PRESIGN_TTL_SEC = 15 * 60;
const OUTPUT_CLEANUP_MS = 15 * 60 * 1000;

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

const allowedOrigins = ALLOWED_ORIGIN.split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS"));
    },
  })
);
app.use(express.json({ limit: "64kb" }));

// Strict FIFO queue (concurrency = 1)
const jobs = new Map();
const queue = [];
let activeJobId = null;

// Daily quota maps keyed by UTC YYYY-MM-DD -> Map<key, count>
const clientDailyUsage = new Map();
const ipDailyUsage = new Map();

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
  return queue.length + (activeJobId ? 1 : 0);
}

function getQueuePosition(jobId) {
  if (activeJobId === jobId) return 0;
  const idx = queue.indexOf(jobId);
  return idx >= 0 ? idx + 1 : 0;
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

function runFfmpegLut(inputPath, lutPath, outputPath, durationSec, onProgressText) {
  return new Promise((resolve, reject) => {
    // Escape colons/backslashes for FFmpeg filtergraph path safety
    const escapedLut = lutPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    const args = [
      "-y",
      "-i",
      inputPath,
      "-vf",
      `lut3d=${escapedLut}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "19",
      "-maxrate",
      "12M",
      "-bufsize",
      "24M",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-threads",
      "2",
      "-c:a",
      "copy",
      outputPath,
    ];

    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderrTail = "";

    proc.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderrTail = (stderrTail + text).slice(-2000);
      if (durationSec > 0) {
        const curSec = parseFfmpegTimeSec(text);
        if (curSec !== null) {
          const pct = Math.min(99, Math.max(1, Math.round((curSec / durationSec) * 100)));
          onProgressText(`Rendering on Cloud FFmpeg (${pct}%)...`);
        }
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start FFmpeg: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderrTail.trim().slice(-300)}`));
      }
    });
  });
}

function scheduleOutputCleanup(job) {
  if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
  job.cleanupTimer = setTimeout(async () => {
    await deleteR2Object(job.outputKey);
    jobs.delete(job.jobId);
  }, OUTPUT_CLEANUP_MS);
  if (typeof job.cleanupTimer.unref === "function") {
    job.cleanupTimer.unref();
  }
}

async function processNext() {
  if (activeJobId || queue.length === 0) return;
  const nextId = queue.shift();
  const job = jobs.get(nextId);
  if (!job) {
    setImmediate(processNext);
    return;
  }

  activeJobId = nextId;
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
    scheduleOutputCleanup(job);
  } catch (err) {
    console.error(`[Worker] Job ${job.jobId} failed:`, err);
    job.status = "failed";
    job.error = err.message || "Cloud render failed";
    job.progressText = "Render failed";
    if (job.quotaCharged) {
      decrementQuota(job.clientId, job.ip);
      job.quotaCharged = false;
    }
  } finally {
    await fsp.rm(jobDir, { recursive: true, force: true }).catch(() => {});
    await Promise.all([deleteR2Object(job.videoKey), deleteR2Object(job.lutKey)]);
    activeJobId = null;
    setImmediate(processNext);
  }
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    queueLength: getQueueLength(),
    r2Configured,
  });
});

app.get("/api/quota", (req, res) => {
  const clientId = normalizeClientId(req.query.clientId);
  const ip = getClientIp(req);
  const quota = getQuotaStatus(clientId, ip);
  res.json({
    ...quota,
    queueLength: getQueueLength(),
    maxDurationSec: MAX_DURATION_SEC,
    maxFileSizeMb: MAX_FILE_SIZE_MB,
  });
});

app.post("/api/jobs/init", async (req, res) => {
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

    jobs.set(jobId, {
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
    });

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

app.post("/api/jobs/:jobId/start", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found or expired." });
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
  });
});

app.get("/api/jobs/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found or expired." });
    return;
  }

  res.json({
    jobId: job.jobId,
    status: job.status,
    queuePosition: getQueuePosition(job.jobId),
    queueLength: getQueueLength(),
    progressText: job.progressText,
    downloadUrl: job.downloadUrl,
    error: job.error,
  });
});

app.post("/api/jobs/:jobId/cleanup", async (req, res) => {
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
    `[cloud-renderer] Listening on port ${PORT} (R2 configured: ${r2Configured}, limit: ${DAILY_LIMIT_PER_USER}/day)`
  );
});
