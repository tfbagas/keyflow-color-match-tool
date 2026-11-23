"""Standalone Kaggle GPU Turbo worker for Keyflow Color Match.

Run inside a Kaggle Notebook (GPU T4/P100 recommended):
    !python kaggle_gpu_worker.py

Reads Cloudflare R2 credentials from Kaggle Secrets (or environment variables):
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
"""

from __future__ import annotations

import atexit
from collections import deque
from datetime import datetime, timezone
import io
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import uuid


def _ensure_python_deps() -> None:
    required = {
        ("fastapi",): "fastapi",
        ("uvicorn",): "uvicorn",
        ("boto3",): "boto3",
        ("botocore",): "botocore",
        ("python_multipart", "multipart"): "python-multipart",
    }
    missing = []
    for mods, pkg in required.items():
        found = False
        for mod in mods:
            try:
                __import__(mod)
                found = True
                break
            except ImportError:
                continue
        if not found:
            missing.append(pkg)
    if missing:
        print(f"[setup] Installing missing Python packages: {', '.join(missing)}")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", *missing])


_ensure_python_deps()

import boto3  # noqa: E402
from botocore.config import Config  # noqa: E402
from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.concurrency import run_in_threadpool  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
import uvicorn  # noqa: E402


PORT = int(os.environ.get("PORT", "7860"))
DAILY_LIMIT_PER_USER = int(os.environ.get("DAILY_LIMIT_PER_USER", "15"))
MAX_DURATION_SEC = int(os.environ.get("MAX_DURATION_SEC", "180"))
MAX_FILE_SIZE_MB = int(os.environ.get("MAX_FILE_SIZE_MB", "300"))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
RENDER_CONCURRENCY = max(1, min(4, int(os.environ.get("RENDER_CONCURRENCY", "2"))))
FFMPEG_TIMEOUT_SEC = 600
PRESIGN_TTL_SEC = 15 * 60
OUTPUT_CLEANUP_SEC = 15 * 60

WORKER_OVERRIDE_KEY = "worker-override.json"
HEARTBEAT_INTERVAL_SEC = 25
OVERRIDE_TTL_MS = 50_000
CLOUDFLARED_URL = (
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
)


def _get_secret(name: str, default: str = "") -> str:
    env_val = os.environ.get(name, "").strip()
    if env_val:
        return env_val
    try:
        from kaggle_secrets import UserSecretsClient  # type: ignore

        val = UserSecretsClient().get_secret(name)
        if isinstance(val, str) and val.strip():
            return val.strip()
    except Exception:
        pass
    return default


R2_ACCOUNT_ID = _get_secret("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = _get_secret("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = _get_secret("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = _get_secret("R2_BUCKET_NAME", "match-tool-cloud-render")

r2_configured = bool(
    R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME
)

def _build_r2_client():
    """Build a boto3 S3 client configured for Cloudflare R2 presigned URLs."""
    if not r2_configured:
        return None
    try:
        # Disable automatic CRC32 checksum query params on presigned PUT URLs (rejected by R2).
        config = Config(
            signature_version="s3v4",
            s3={"addressing_style": "virtual"},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        )
    except TypeError:
        config = Config(
            signature_version="s3v4",
            s3={"addressing_style": "virtual"},
        )
    return boto3.client(
        "s3",
        region_name="auto",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=config,
    )


s3_client = _build_r2_client()


def _detect_nvenc() -> bool:
    try:
        res = subprocess.run(
            ["ffmpeg", "-hide_banner", "-encoders"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        if "h264_nvenc" not in (res.stdout or ""):
            return False
        probe = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "color=c=black:s=64x64:d=0.1",
                "-c:v",
                "h264_nvenc",
                "-f",
                "null",
                "-",
            ],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        return probe.returncode == 0
    except Exception:
        return False


NVENC_AVAILABLE = _detect_nvenc()


# State & synchronization
state_lock = threading.Lock()
jobs: dict[str, dict] = {}
queue: deque[str] = deque()
active_jobs: set[str] = set()
client_daily_usage: dict[str, dict[str, int]] = {}
ip_daily_usage: dict[str, dict[str, int]] = {}

shutdown_event = threading.Event()
tunnel_process: subprocess.Popen | None = None
cleanup_done = False


def _utc_today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _prune_quota_buckets(today: str) -> None:
    for bucket in (client_daily_usage, ip_daily_usage):
        stale = [k for k in bucket.keys() if k != today]
        for k in stale:
            bucket.pop(k, None)


def _normalize_client_id(raw: object) -> str:
    if not isinstance(raw, str):
        return ""
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", raw.strip())
    return cleaned[:64]


def _get_client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _get_quota_status(client_id: str, ip: str) -> dict:
    today = _utc_today()
    with state_lock:
        _prune_quota_buckets(today)
        client_used = client_daily_usage.get(today, {}).get(client_id, 0) if client_id else 0
        ip_used = ip_daily_usage.get(today, {}).get(ip, 0) if ip else 0
        used = max(client_used, ip_used)
        remaining = max(0, DAILY_LIMIT_PER_USER - used)
    return {
        "used": used,
        "remaining": remaining,
        "limit": DAILY_LIMIT_PER_USER,
    }


def _increment_quota(client_id: str, ip: str) -> None:
    today = _utc_today()
    with state_lock:
        _prune_quota_buckets(today)
        if client_id:
            bucket = client_daily_usage.setdefault(today, {})
            bucket[client_id] = bucket.get(client_id, 0) + 1
        if ip:
            bucket = ip_daily_usage.setdefault(today, {})
            bucket[ip] = bucket.get(ip, 0) + 1


def _decrement_quota(client_id: str, ip: str) -> None:
    today = _utc_today()
    with state_lock:
        if client_id and today in client_daily_usage:
            cur = client_daily_usage[today].get(client_id, 0)
            if cur > 0:
                client_daily_usage[today][client_id] = cur - 1
        if ip and today in ip_daily_usage:
            cur = ip_daily_usage[today].get(ip, 0)
            if cur > 0:
                ip_daily_usage[today][ip] = cur - 1


def _get_queue_stats(job_id: str | None = None) -> tuple[int, int, int, int]:
    with state_lock:
        q_len = len(queue) + len(active_jobs)
        active = len(active_jobs)
        queued = len(queue)
        pos = 0
        if job_id:
            if job_id in active_jobs:
                pos = 0
            else:
                try:
                    pos = list(queue).index(job_id) + 1
                except ValueError:
                    pos = 0
        return pos, q_len, active, queued


def _sanitize_video_ext(file_name: str, content_type: str) -> str:
    ext = Path(file_name or "").suffix.lower()
    if ext in {".mp4", ".mov", ".m4v", ".webm", ".mkv"}:
        return ext
    ct = (content_type or "").lower()
    if "webm" in ct:
        return ".webm"
    if "quicktime" in ct:
        return ".mov"
    return ".mp4"


def _delete_r2_object(key: str) -> None:
    if not s3_client or not key:
        return
    try:
        s3_client.delete_object(Bucket=R2_BUCKET_NAME, Key=key)
    except Exception as exc:
        print(f"[R2] Failed to delete {key}: {exc}")


def _schedule_job_expiry(job_id: str, delete_output: bool) -> None:
    def _expire() -> None:
        with state_lock:
            job = jobs.pop(job_id, None)
        if job and delete_output:
            _delete_r2_object(job["outputKey"])

    with state_lock:
        job = jobs.get(job_id)
        if not job:
            return
        old_timer = job.get("cleanupTimer")
        if old_timer is not None:
            old_timer.cancel()
        timer = threading.Timer(OUTPUT_CLEANUP_SEC, _expire)
        timer.daemon = True
        job["cleanupTimer"] = timer
        timer.start()


def _parse_ffmpeg_time_sec(line: str) -> float | None:
    match = re.search(r"time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)", line)
    if not match:
        return None
    hours, mins, secs = int(match.group(1)), int(match.group(2)), float(match.group(3))
    return hours * 3600 + mins * 60 + secs


def _run_ffmpeg_pass(
    input_path: str,
    lut_path: str,
    output_path: str,
    duration_sec: float,
    use_nvenc: bool,
    audio_args: list[str],
    job: dict,
) -> None:
    escaped_lut = lut_path.replace("\\", "/").replace("'", "'\\''")
    vf = (
        "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:flags=bilinear,"
        "scale=trunc(iw/2)*2:trunc(ih/2)*2,"
        "format=rgb48le,"
        f"lut3d=file='{escaped_lut}':interp=tetrahedral,"
        "scale=iw:ih:out_color_matrix=bt709,"
        "format=yuv420p"
    )

    if use_nvenc:
        video_args = ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "19", "-pix_fmt", "yuv420p"]
        label = "Kaggle GPU FFmpeg"
    else:
        video_args = [
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
        ]
        label = "Kaggle CPU FFmpeg"

    cmd = [
        "ffmpeg",
        "-y",
        "-loglevel",
        "error",
        "-stats",
        "-i",
        input_path,
        "-vf",
        vf,
        *video_args,
        "-colorspace",
        "bt709",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-movflags",
        "+faststart",
        *audio_args,
        output_path,
    ]

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    stderr_lines: list[str] = []
    deadline = time.monotonic() + FFMPEG_TIMEOUT_SEC
    timed_out = False

    def _read_stderr() -> None:
        if proc.stderr is None:
            return
        buf = ""
        while True:
            ch = proc.stderr.read(1)
            if not ch:
                break
            if ch in ("\r", "\n"):
                line = buf.strip()
                buf = ""
                if not line:
                    continue
                if duration_sec > 0:
                    cur = _parse_ffmpeg_time_sec(line)
                    if cur is not None:
                        pct = min(99, max(1, round((cur / duration_sec) * 100)))
                        job["progressText"] = f"Rendering on {label} ({pct}%)..."
                if not re.match(r"^frame=\s*\d+", line):
                    stderr_lines.append(line)
                    if len(stderr_lines) > 20:
                        stderr_lines.pop(0)
            else:
                buf += ch

    reader = threading.Thread(target=_read_stderr, daemon=True)
    reader.start()

    while proc.poll() is None:
        if time.monotonic() > deadline:
            timed_out = True
            proc.kill()
            break
        time.sleep(0.25)

    reader.join(timeout=2.0)

    if timed_out:
        raise TimeoutError(f"FFmpeg timed out after {FFMPEG_TIMEOUT_SEC}s")
    if proc.returncode != 0:
        tail = "\n".join(stderr_lines)[-300:]
        raise RuntimeError(f"FFmpeg exited with code {proc.returncode}: {tail}")


def _run_ffmpeg_lut(input_path: str, lut_path: str, output_path: str, duration_sec: float, job: dict) -> None:
    encoder_modes = [True, False] if NVENC_AVAILABLE else [False]
    last_err: Exception | None = None

    for use_nvenc in encoder_modes:
        try:
            try:
                _run_ffmpeg_pass(
                    input_path,
                    lut_path,
                    output_path,
                    duration_sec,
                    use_nvenc,
                    ["-c:a", "copy"],
                    job,
                )
                return
            except TimeoutError:
                raise
            except Exception as err:
                print(f"[FFmpeg] Audio copy failed ({err}); retrying with AAC 192k...")
                _run_ffmpeg_pass(
                    input_path,
                    lut_path,
                    output_path,
                    duration_sec,
                    use_nvenc,
                    ["-c:a", "aac", "-b:a", "192k"],
                    job,
                )
                return
        except TimeoutError:
            raise
        except Exception as err:
            last_err = err
            if use_nvenc:
                print(f"[FFmpeg] h264_nvenc failed ({err}); falling back to libx264 veryfast...")

    if last_err:
        raise last_err


def _run_job(job_id: str) -> None:
    with state_lock:
        job = jobs.get(job_id)
    if not job:
        with state_lock:
            active_jobs.discard(job_id)
        _process_next()
        return

    job["status"] = "processing"
    job["progressText"] = "Downloading media from cloud storage..."
    job_dir = tempfile.mkdtemp(prefix=f"kf_{job_id}_")
    input_path = os.path.join(job_dir, f"input{job['videoExt']}")
    lut_path = os.path.join(job_dir, "grade.cube")
    output_path = os.path.join(job_dir, "output.mp4")

    try:
        assert s3_client is not None
        s3_client.download_file(R2_BUCKET_NAME, job["videoKey"], input_path)
        s3_client.download_file(R2_BUCKET_NAME, job["lutKey"], lut_path)

        job["progressText"] = (
            "Rendering on Kaggle GPU FFmpeg..." if NVENC_AVAILABLE else "Rendering on Kaggle FFmpeg..."
        )
        _run_ffmpeg_lut(input_path, lut_path, output_path, job["durationSec"], job)

        for tmp in (input_path, lut_path):
            try:
                os.remove(tmp)
            except OSError:
                pass

        job["progressText"] = "Uploading rendered MP4..."
        s3_client.upload_file(
            output_path,
            R2_BUCKET_NAME,
            job["outputKey"],
            ExtraArgs={"ContentType": "video/mp4"},
        )

        download_url = s3_client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": R2_BUCKET_NAME,
                "Key": job["outputKey"],
                "ResponseContentDisposition": f'attachment; filename="{job["outputFileName"]}"',
            },
            ExpiresIn=PRESIGN_TTL_SEC,
        )

        job["status"] = "completed"
        job["downloadUrl"] = download_url
        job["progressText"] = "Render complete"
        _schedule_job_expiry(job_id, delete_output=True)
    except Exception as exc:
        print(f"[Worker] Job {job_id} failed: {exc}")
        job["status"] = "failed"
        job["error"] = str(exc) or "Kaggle GPU render failed"
        job["progressText"] = "Render failed"
        if job.get("quotaCharged"):
            _decrement_quota(job["clientId"], job["ip"])
            job["quotaCharged"] = False
        _schedule_job_expiry(job_id, delete_output=False)
    finally:
        shutil.rmtree(job_dir, ignore_errors=True)
        _delete_r2_object(job["videoKey"])
        _delete_r2_object(job["lutKey"])
        with state_lock:
            active_jobs.discard(job_id)
        _process_next()


def _process_next() -> None:
    to_start: list[str] = []
    with state_lock:
        while queue and len(active_jobs) < RENDER_CONCURRENCY:
            next_id = queue.popleft()
            if next_id in jobs:
                active_jobs.add(next_id)
                to_start.append(next_id)

    for jid in to_start:
        t = threading.Thread(target=_run_job, args=(jid,), daemon=True)
        t.start()


app = FastAPI(title="Keyflow Kaggle GPU Worker")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.exception_handler(HTTPException)
async def _http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})


@app.get("/health")
def health() -> dict:
    _, q_len, active, queued = _get_queue_stats()
    return {
        "ok": True,
        "mode": "kaggle-gpu",
        "nvencAvailable": NVENC_AVAILABLE,
        "queueLength": q_len,
        "activeWorkers": active,
        "maxConcurrency": RENDER_CONCURRENCY,
        "queuedJobs": queued,
        "r2Configured": r2_configured,
    }


@app.get("/api/quota")
def get_quota(request: Request, clientId: str = "") -> dict:
    cid = _normalize_client_id(clientId)
    ip = _get_client_ip(request)
    quota = _get_quota_status(cid, ip)
    _, q_len, active, queued = _get_queue_stats()
    return {
        **quota,
        "queueLength": q_len,
        "activeWorkers": active,
        "maxConcurrency": RENDER_CONCURRENCY,
        "queuedJobs": queued,
        "maxDurationSec": MAX_DURATION_SEC,
        "maxFileSizeMb": MAX_FILE_SIZE_MB,
    }


@app.post("/api/jobs/init")
async def init_job(request: Request) -> dict:
    if not r2_configured or not s3_client:
        raise HTTPException(status_code=503, detail="Cloud storage (R2) is not configured.")

    body = await request.json()
    cid = _normalize_client_id(body.get("clientId"))
    if not cid:
        raise HTTPException(status_code=400, detail="Missing or invalid clientId.")

    ip = _get_client_ip(request)
    quota = _get_quota_status(cid, ip)
    if quota["remaining"] <= 0:
        raise HTTPException(
            status_code=429,
            detail=f"Daily cloud render limit ({DAILY_LIMIT_PER_USER}/day) reached.",
        )

    try:
        file_size_bytes = float(body.get("fileSizeBytes", 0))
        duration_sec = float(body.get("durationSec", 0))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid fileSizeBytes or durationSec.") from exc

    file_name = str(body.get("fileName") or "input.mp4")
    content_type = str(body.get("contentType") or "video/mp4")

    if file_size_bytes <= 0 or file_size_bytes > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Video file size must be between 1 byte and {MAX_FILE_SIZE_MB} MB.",
        )

    if duration_sec <= 0 or duration_sec > MAX_DURATION_SEC:
        raise HTTPException(
            status_code=400,
            detail=f"Video duration must be {MAX_DURATION_SEC} seconds or less for Cloud Render.",
        )

    job_id = str(uuid.uuid4())
    video_ext = _sanitize_video_ext(file_name, content_type)
    stem = Path(file_name).stem
    base_safe = re.sub(r"[^a-zA-Z0-9._-]+", "-", stem).strip("-")[:48] or "graded"

    video_key = f"jobs/{job_id}/input{video_ext}"
    lut_key = f"jobs/{job_id}/grade.cube"
    output_key = f"jobs/{job_id}/output.mp4"
    output_file_name = f"{base_safe}_cloud_graded.mp4"

    video_upload_url = s3_client.generate_presigned_url(
        "put_object",
        Params={"Bucket": R2_BUCKET_NAME, "Key": video_key},
        ExpiresIn=PRESIGN_TTL_SEC,
    )
    lut_upload_url = s3_client.generate_presigned_url(
        "put_object",
        Params={"Bucket": R2_BUCKET_NAME, "Key": lut_key},
        ExpiresIn=PRESIGN_TTL_SEC,
    )

    with state_lock:
        jobs[job_id] = {
            "jobId": job_id,
            "clientId": cid,
            "ip": ip,
            "durationSec": duration_sec,
            "contentType": content_type,
            "videoExt": video_ext,
            "videoKey": video_key,
            "lutKey": lut_key,
            "outputKey": output_key,
            "outputFileName": output_file_name,
            "status": "initialized",
            "progressText": "Waiting for upload...",
            "downloadUrl": None,
            "error": None,
            "quotaCharged": False,
            "cleanupTimer": None,
        }
    _schedule_job_expiry(job_id, delete_output=False)

    return {
        "jobId": job_id,
        "videoUploadUrl": video_upload_url,
        "lutUploadUrl": lut_upload_url,
        "videoKey": video_key,
        "lutKey": lut_key,
        "outputKey": output_key,
    }


@app.post("/api/jobs/{job_id}/upload")
async def upload_job_files(job_id: str, request: Request) -> dict:
    """Fallback endpoint to upload video + .cube LUT directly to R2 via the worker."""
    if not r2_configured or not s3_client:
        raise HTTPException(status_code=503, detail="Cloud storage (R2) is not configured.")

    with state_lock:
        job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or worker restarted")
    if job["status"] != "initialized":
        raise HTTPException(status_code=409, detail="Job has already been started.")

    content_type_header = (request.headers.get("content-type") or "").lower()
    if "multipart/form-data" not in content_type_header:
        raise HTTPException(
            status_code=400,
            detail="Expected multipart/form-data with 'video' and 'lut' fields.",
        )

    form = await request.form()
    video_part = form.get("video")
    lut_part = form.get("lut")

    if video_part is None or not hasattr(video_part, "file"):
        raise HTTPException(status_code=400, detail="Missing 'video' file in multipart upload.")
    if lut_part is None:
        raise HTTPException(status_code=400, detail="Missing 'lut' in multipart upload.")

    video_ct = getattr(video_part, "content_type", None) or job.get("contentType") or "video/mp4"
    try:
        video_part.file.seek(0)
        await run_in_threadpool(
            s3_client.upload_fileobj,
            video_part.file,
            R2_BUCKET_NAME,
            job["videoKey"],
            ExtraArgs={"ContentType": video_ct},
        )

        if hasattr(lut_part, "file"):
            lut_part.file.seek(0)
            await run_in_threadpool(
                s3_client.upload_fileobj,
                lut_part.file,
                R2_BUCKET_NAME,
                job["lutKey"],
                ExtraArgs={"ContentType": "text/plain;charset=utf-8"},
            )
        else:
            lut_bytes = str(lut_part).encode("utf-8")
            await run_in_threadpool(
                s3_client.upload_fileobj,
                io.BytesIO(lut_bytes),
                R2_BUCKET_NAME,
                job["lutKey"],
                ExtraArgs={"ContentType": "text/plain;charset=utf-8"},
            )
    finally:
        if hasattr(video_part, "close"):
            await video_part.close()
        if hasattr(lut_part, "close"):
            await lut_part.close()

    with state_lock:
        if job_id in jobs and jobs[job_id]["status"] == "initialized":
            jobs[job_id]["progressText"] = "Uploaded via worker fallback. Ready to start."

    return {
        "ok": True,
        "jobId": job_id,
        "videoKey": job["videoKey"],
        "lutKey": job["lutKey"],
    }


@app.post("/api/jobs/{job_id}/start")
def start_job(job_id: str) -> dict:
    with state_lock:
        job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or worker restarted")

    if job["status"] != "initialized":
        pos, q_len, _, _ = _get_queue_stats(job_id)
        return {
            "ok": True,
            "jobId": job_id,
            "status": job["status"],
            "queuePosition": pos,
            "queueLength": q_len,
        }

    quota = _get_quota_status(job["clientId"], job["ip"])
    if quota["remaining"] <= 0:
        raise HTTPException(
            status_code=429,
            detail=f"Daily cloud render limit ({DAILY_LIMIT_PER_USER}/day) reached.",
        )

    with state_lock:
        old_timer = job.get("cleanupTimer")
        if old_timer is not None:
            old_timer.cancel()
            job["cleanupTimer"] = None
        job["quotaCharged"] = True
        job["status"] = "queued"
        job["progressText"] = "Queued for Kaggle GPU FFmpeg..."
        queue.append(job_id)

    _increment_quota(job["clientId"], job["ip"])
    pos, q_len, active, queued = _get_queue_stats(job_id)
    _process_next()

    return {
        "ok": True,
        "jobId": job_id,
        "status": job["status"],
        "queuePosition": pos,
        "queueLength": q_len,
        "activeWorkers": active,
        "maxConcurrency": RENDER_CONCURRENCY,
        "queuedJobs": queued,
    }


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    with state_lock:
        job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or worker restarted")

    pos, q_len, active, queued = _get_queue_stats(job_id)
    return {
        "jobId": job_id,
        "status": job["status"],
        "queuePosition": pos,
        "queueLength": q_len,
        "activeWorkers": active,
        "maxConcurrency": RENDER_CONCURRENCY,
        "queuedJobs": queued,
        "progressText": job["progressText"],
        "downloadUrl": job["downloadUrl"],
        "error": job["error"],
    }


@app.post("/api/jobs/{job_id}/cleanup")
def cleanup_job(job_id: str) -> dict:
    with state_lock:
        job = jobs.pop(job_id, None)
    if job:
        timer = job.get("cleanupTimer")
        if timer is not None:
            timer.cancel()
        _delete_r2_object(job["outputKey"])
    return {"ok": True}


def _ensure_cloudflared() -> str:
    existing = shutil.which("cloudflared")
    if existing:
        return existing
    local_bin = "/usr/local/bin/cloudflared"
    if os.path.exists(local_bin) and os.access(local_bin, os.X_OK):
        return local_bin
    print("[tunnel] Downloading cloudflared...")
    urllib.request.urlretrieve(CLOUDFLARED_URL, local_bin)
    os.chmod(local_bin, 0o755)
    return local_bin


def _start_tunnel_and_heartbeat() -> None:
    global tunnel_process
    bin_path = _ensure_cloudflared()
    tunnel_process = subprocess.Popen(
        [bin_path, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{PORT}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    tunnel_url_holder: list[str] = []
    url_found = threading.Event()
    url_pattern = re.compile(r"(https://[a-zA-Z0-9-]+\.trycloudflare\.com)")

    def _watch_tunnel_output() -> None:
        if tunnel_process is None or tunnel_process.stdout is None:
            return
        for line in tunnel_process.stdout:
            match = url_pattern.search(line)
            if match and not tunnel_url_holder:
                tunnel_url_holder.append(match.group(1))
                url_found.set()

    threading.Thread(target=_watch_tunnel_output, daemon=True).start()

    if not url_found.wait(timeout=30):
        raise RuntimeError("Timed out waiting for cloudflared tunnel URL.")

    tunnel_url = tunnel_url_holder[0]
    print(f"[tunnel] Kaggle GPU Turbo URL: {tunnel_url} (NVENC: {NVENC_AVAILABLE})")

    def _publish_override() -> None:
        if not s3_client:
            return
        payload = {
            "url": tunnel_url,
            "mode": "kaggle-gpu",
            "expiresAt": int(time.time() * 1000) + OVERRIDE_TTL_MS,
            "limits": {
                "dailyLimit": DAILY_LIMIT_PER_USER,
                "maxDurationSec": MAX_DURATION_SEC,
                "maxFileSizeMb": MAX_FILE_SIZE_MB,
            },
        }
        s3_client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=WORKER_OVERRIDE_KEY,
            Body=json.dumps(payload).encode("utf-8"),
            ContentType="application/json",
        )

    _publish_override()

    def _heartbeat_loop() -> None:
        while not shutdown_event.wait(HEARTBEAT_INTERVAL_SEC):
            try:
                _publish_override()
            except Exception as exc:
                print(f"[heartbeat] Failed to update worker-override.json: {exc}")

    threading.Thread(target=_heartbeat_loop, daemon=True).start()


def _cleanup_on_exit(*_args: object) -> None:
    global cleanup_done
    if cleanup_done:
        return
    cleanup_done = True
    shutdown_event.set()
    print("[shutdown] Removing worker-override.json from R2...")
    _delete_r2_object(WORKER_OVERRIDE_KEY)
    if tunnel_process is not None and tunnel_process.poll() is None:
        tunnel_process.terminate()
        try:
            tunnel_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            tunnel_process.kill()


def main() -> None:
    if not r2_configured:
        raise RuntimeError(
            "R2 credentials missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME."
        )

    atexit.register(_cleanup_on_exit)
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda s, f: (_cleanup_on_exit(), sys.exit(0)))

    _start_tunnel_and_heartbeat()
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")


if __name__ == "__main__":
    main()
