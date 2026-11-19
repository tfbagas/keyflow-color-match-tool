import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Download, Check, X, Film, Image as ImageIcon, AlertTriangle, QrCode, Cloud, Cpu } from "lucide-react";
import { getEngineCodename } from "../utils/engineRegistry";
import { encodeGradeToHash } from "../utils/shareCodec";
import { fetchCloudQuota, isCloudRenderConfigured } from "../utils/cloudVideoExporter";
import { useLanguage } from "../i18n/LanguageContext";

const PROMO_QR_STORAGE_KEY = "cmk_promo_qr_url";

function readStoredPromoQrUrl() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(PROMO_QR_STORAGE_KEY) || "";
    }
  } catch {
    // ignore storage errors
  }
  return "";
}

export default function SaveImagePopover({
  onSaveImage,
  isSavingImage = false,
  isVideo = false,
  onExportVideo,
  isExportingVideo = false,
  videoExportProgress = 0,
  videoExportStatusText = "",
  onCancelVideoExport,
  targetVideoSrc = "",
  targetFile = null,
  videoDurationSec = 0,
  nativeWidth = 0,
  nativeHeight = 0,
  targetBaseName = "Target",
  engineId = "v3",
  splitPos = 50,
  params = null,
  logProfile = "rec709",
  matchStrength = 100,
}) {
  const { t } = useLanguage();
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [mediaMode, setMediaMode] = useState("video"); // "video" | "frame"
  const [exportFormat, setExportFormat] = useState("png");
  const [exportQuality, setExportQuality] = useState(95);
  const [exportLayout, setExportLayout] = useState("graded"); // "graded" | "split" | "promo"
  const [promoAspect, setPromoAspect] = useState("16:9"); // "16:9" | "4:5" | "9:16"
  const [includeQr, setIncludeQr] = useState(true);
  const [promoQrMode, setPromoQrMode] = useState("grade"); // "grade" | "custom"
  const [promoQrCustomUrl, setPromoQrCustomUrl] = useState(readStoredPromoQrUrl);
  const [renderMode, setRenderMode] = useState("local"); // "local" | "cloud"
  const [cloudQuota, setCloudQuota] = useState(null);
  const [cloudQuotaLoading, setCloudQuotaLoading] = useState(false);
  const [cloudQuotaError, setCloudQuotaError] = useState("");
  const [videoLayout, setVideoLayout] = useState("graded"); // "graded" | "split"
  const [videoBitrate, setVideoBitrate] = useState(16); // 16 | 8
  const [includeAudio, setIncludeAudio] = useState(true);
  const [savedLabel, setSavedLabel] = useState("");
  const [renderError, setRenderError] = useState("");
  const exportPopoverRef = useRef(null);
  const savedTimerRef = useRef(null);
  const wasCancelledRef = useRef(false);
  const cloudConfigured = isCloudRenderConfigured();

  useEffect(() => {
    if (!isVideo) {
      setMediaMode("frame");
    } else {
      setMediaMode("video");
    }
  }, [isVideo]);

  useEffect(() => {
    if (!isExportOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !isExportingVideo) setIsExportOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isExportOpen, isExportingVideo]);

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!isExportOpen || !isVideo || mediaMode !== "video" || !cloudConfigured) {
      return undefined;
    }
    const controller = new AbortController();
    setCloudQuotaLoading(true);
    setCloudQuotaError("");
    fetchCloudQuota(controller.signal)
      .then((q) => {
        setCloudQuota(q);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setCloudQuotaError(err?.message || "Unable to reach cloud renderer.");
        }
      })
      .finally(() => {
        setCloudQuotaLoading(false);
      });
    return () => controller.abort();
  }, [isExportOpen, isVideo, mediaMode, cloudConfigured, renderMode]);

  const rawTargetBase = String(targetBaseName || "Target").trim();
  const safeTargetBase = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(rawTargetBase)
    ? "Custom-Color-Grade"
    : rawTargetBase;
  const cleanExportBase =
    safeTargetBase
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "Target";
  const codename = getEngineCodename(engineId);
  const engineSuffix = codename ? `_${codename}` : "";
  const baseWithEngine = /_(altair|vega|polaris|v[123])$/i.test(cleanExportBase)
    ? cleanExportBase
    : `${cleanExportBase}${engineSuffix}`;

  const layoutSuffix =
    exportLayout === "promo"
      ? `promo-${promoAspect.replace(":", "x")}`
      : exportLayout === "split"
      ? "split"
      : "graded";
  const isKaggleTurbo = cloudQuota?.workerMode === "kaggle-gpu";
  const maxCloudDurationSec = cloudQuota?.maxDurationSec ?? (isKaggleTurbo ? 180 : 60);
  const maxCloudFileSizeMb = cloudQuota?.maxFileSizeMb ?? (isKaggleTurbo ? 300 : 100);
  const dailyCloudLimit = cloudQuota?.limit ?? (isKaggleTurbo ? 15 : 5);
  const activeCloudWorkers = cloudQuota?.activeWorkers ?? 0;
  const maxCloudConcurrency = cloudQuota?.maxConcurrency ?? 2;
  const queuedCloudJobs = cloudQuota?.queuedJobs ?? cloudQuota?.queueLength ?? 0;
  const targetFileSizeMb =
    targetFile && typeof targetFile.size === "number"
      ? targetFile.size / (1024 * 1024)
      : 0;
  const cloudDurationExceeded =
    videoDurationSec > 0 && videoDurationSec > maxCloudDurationSec;
  const cloudSizeExceeded =
    targetFileSizeMb > 0 && targetFileSizeMb > maxCloudFileSizeMb;
  const cloudQuotaExhausted =
    cloudQuota !== null && cloudQuota.remaining <= 0;

  let cloudBlockReason = "";
  if (isVideo && mediaMode === "video" && renderMode === "cloud") {
    if (!cloudConfigured) {
      cloudBlockReason =
        "Cloud Render URL is not configured (VITE_CLOUD_RENDER_URL). Switch to Local Render for instant unlimited exports.";
    } else if (cloudQuotaExhausted) {
      cloudBlockReason = `Daily Cloud Render quota (${cloudQuota.limit}/${cloudQuota.limit}) reached. Switch to Local Render for unlimited exports.`;
    } else if (cloudDurationExceeded) {
      cloudBlockReason = `Clip is ${Math.ceil(videoDurationSec)}s (max ${maxCloudDurationSec}s for Cloud Render). Use Local Render instead.`;
    } else if (cloudSizeExceeded) {
      cloudBlockReason = `File is ${targetFileSizeMb.toFixed(1)} MB (max ${maxCloudFileSizeMb} MB for Cloud Render). Use Local Render instead.`;
    }
  }
  const isCloudBlocked = Boolean(cloudBlockReason);

  const videoExtPreview =
    renderMode === "cloud"
      ? "mp4"
      : typeof VideoEncoder !== "undefined"
      ? "mp4"
      : "webm";
  const previewExportFilename =
    isVideo && mediaMode === "video"
      ? renderMode === "cloud"
        ? `${baseWithEngine}_cloud_graded.mp4`
        : `${baseWithEngine}_graded.${videoLayout === "split" ? "split." : ""}${videoExtPreview}`
      : `${baseWithEngine}-${layoutSuffix}.${exportFormat}`;

  const handleDownloadClick = async () => {
    setRenderError("");
    wasCancelledRef.current = false;

    if (isVideo && mediaMode === "video") {
      if (!onExportVideo || isExportingVideo || isCloudBlocked) return;
      try {
        const ok = await onExportVideo({
          renderMode,
          targetVideoSrc,
          targetFile,
          layout: videoLayout,
          splitPosition: splitPos,
          bitrateMbps: videoBitrate,
          includeAudio,
        });
        if (ok !== false) {
          if (renderMode === "cloud" && cloudConfigured) {
            fetchCloudQuota()
              .then((q) => setCloudQuota(q))
              .catch(() => {});
          }
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          setSavedLabel(t("savePopover.savedVideo"));
          savedTimerRef.current = setTimeout(() => setSavedLabel(""), 1400);
        }
      } catch (err) {
        if (!wasCancelledRef.current && err?.name !== "AbortError") {
          setRenderError(err?.message || String(err));
        }
      }
      return;
    }

    if (!onSaveImage || isSavingImage) return;
    let resolvedQrUrl = "";
    if (exportLayout === "promo" && includeQr) {
      if (promoQrMode === "custom") {
        resolvedQrUrl = promoQrCustomUrl.trim();
      } else if (params && typeof window !== "undefined") {
        const hash = encodeGradeToHash({ engineId, logProfile, matchStrength, params });
        resolvedQrUrl = `${window.location.origin}${window.location.pathname}${hash}`;
      }
    }
    try {
      const ok = await onSaveImage({
        format: exportFormat,
        quality: exportQuality,
        layout: exportLayout,
        splitPos,
        promoAspect,
        includeQr: exportLayout === "promo" ? includeQr : false,
        qrMode: promoQrMode,
        qrUrl: resolvedQrUrl,
      });
      if (ok !== false) {
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        setSavedLabel(t("savePopover.savedFmt", { fmt: exportFormat.toUpperCase() }));
        savedTimerRef.current = setTimeout(() => setSavedLabel(""), 1200);
      } else {
        setRenderError(t("savePopover.exportFailed"));
      }
    } catch (err) {
      setRenderError(err?.message || t("savePopover.exportFailed"));
    }
  };

  return (
    <div ref={exportPopoverRef} className="relative">
      <button
        type="button"
        onClick={() => setIsExportOpen((v) => !v)}
        aria-expanded={isExportOpen}
        title={
          isVideo
            ? t("savePopover.saveVideoTitle")
            : t("savePopover.saveImageTitle")
        }
        className={`m3-btn-morph inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer select-none ${
          isExportOpen
            ? "bg-[#E2E4E9] text-[#0E0E11] border-[#E2E4E9]"
            : "bg-white/[0.04] hover:bg-white/[0.09] text-[#E2E4E9] border-white/[0.09]"
        }`}
      >
        <Download className="w-3.5 h-3.5" />
        <span>
          {isVideo ? t("savePopover.saveMedia") : t("savePopover.saveImage")}
        </span>
      </button>

      {isExportOpen &&
        createPortal(
          <div
            onClick={() => {
              if (!isExportingVideo) setIsExportOpen(false);
            }}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={t("savePopover.exportNativeRes")}
              className="w-full sm:max-w-md max-h-[88dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#131419] border border-white/[0.16] shadow-2xl p-4 space-y-3 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#9CA3AF]">
                  {isVideo && mediaMode === "video"
                    ? t("savePopover.exportGradedVideo")
                    : t("savePopover.exportNativeRes")}
                </span>
                <div className="flex items-center gap-2">
                  {nativeWidth > 0 && nativeHeight > 0 && (
                    <span className="text-[10px] font-mono text-[#E2E4E9]">
                      {nativeWidth} x {nativeHeight} px
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!isExportingVideo) setIsExportOpen(false);
                    }}
                    disabled={isExportingVideo}
                    aria-label={t("savePopover.closeAria")}
                    className="p-1 rounded-lg text-[#9CA3AF] hover:text-[#F4F5F7] hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {isVideo && (
                <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-[#0A0A0D]/70 border border-white/[0.08]">
                  <button
                    type="button"
                    disabled={isExportingVideo}
                    onClick={() => setMediaMode("video")}
                    className={`py-1.5 px-2 rounded-md text-[11px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      mediaMode === "video"
                        ? "bg-[#E2E4E9] text-[#0E0E11] font-semibold"
                        : "text-[#9CA3AF] hover:text-[#F4F5F7]"
                    }`}
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>{t("savePopover.fullVideo")}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isExportingVideo}
                    onClick={() => setMediaMode("frame")}
                    className={`py-1.5 px-2 rounded-md text-[11px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      mediaMode === "frame"
                        ? "bg-[#E2E4E9] text-[#0E0E11] font-semibold"
                        : "text-[#9CA3AF] hover:text-[#F4F5F7]"
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{t("savePopover.currentFramePromo")}</span>
                  </button>
                </div>
              )}

              {isVideo && mediaMode === "video" ? (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] text-[#9CA3AF]">
                      Render Mode
                    </span>
                    <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-[#0A0A0D]/70 border border-white/[0.08]">
                      <button
                        type="button"
                        disabled={isExportingVideo}
                        onClick={() => {
                          setRenderMode("local");
                          setRenderError("");
                        }}
                        className={`py-1.5 px-2 rounded-md text-left transition-colors cursor-pointer ${
                          renderMode === "local"
                            ? "bg-[#E2E4E9] text-[#0E0E11] font-semibold"
                            : "text-[#9CA3AF] hover:text-[#F4F5F7]"
                        }`}
                      >
                        <div className="flex items-center gap-1 text-[11px] leading-tight">
                          <Cpu className="w-3 h-3 shrink-0" />
                          <span>Local Render</span>
                        </div>
                        <div className="text-[9px] opacity-75 leading-tight mt-0.5">
                          Unlimited • Instant
                        </div>
                      </button>

                      <button
                        type="button"
                        disabled={isExportingVideo}
                        onClick={() => {
                          setRenderMode("cloud");
                          setRenderError("");
                        }}
                        className={`py-1.5 px-2 rounded-md text-left transition-colors cursor-pointer ${
                          renderMode === "cloud"
                            ? "bg-[#6EE7B7] text-[#042F1E] font-semibold"
                            : "text-[#9CA3AF] hover:text-[#F4F5F7]"
                        }`}
                      >
                        <div className="flex items-center gap-1 text-[11px] leading-tight">
                          <Cloud className="w-3 h-3 shrink-0" />
                          <span>Cloud Render</span>
                        </div>
                        <div className="text-[9px] opacity-80 leading-tight mt-0.5">
                          60fps FFmpeg • Quota{" "}
                          {cloudQuota
                            ? `${cloudQuota.remaining}/${cloudQuota.limit}`
                            : "5/5"}
                        </div>
                      </button>
                    </div>
                  </div>

                  {renderMode === "cloud" ? (
                    <div className="space-y-2">
                      {isKaggleTurbo && (
                        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-amber-400/12 border border-amber-400/35 text-[10px] font-semibold text-amber-200">
                          <span>⚡ Kaggle Turbo</span>
                          <span className="font-mono text-[9px] text-amber-300/90">
                            {dailyCloudLimit}/day • Max {maxCloudDurationSec}s · {maxCloudFileSizeMb}MB
                          </span>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-2 rounded-lg bg-[#0A0A0D]/55 border border-white/[0.08] text-[10px] font-mono">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded border ${
                              cloudQuotaExhausted
                                ? "bg-red-500/15 text-red-300 border-red-500/35"
                                : "bg-[#6EE7B7]/15 text-[#6EE7B7] border-[#6EE7B7]/30"
                            }`}
                          >
                            {cloudQuotaLoading
                              ? "Checking quota..."
                              : cloudQuota
                              ? `Quota: ${cloudQuota.remaining}/${cloudQuota.limit} left`
                              : "Quota: 5/day"}
                          </span>
                          <span className="text-[#9CA3AF]">
                            Workers: {activeCloudWorkers}/{maxCloudConcurrency}
                          </span>
                          <span className="text-[#9CA3AF]">
                            Queue: {queuedCloudJobs}
                          </span>
                        </div>
                        <span className="text-[#9CA3AF]">
                          Max {maxCloudDurationSec}s • {maxCloudFileSizeMb}MB
                        </span>
                      </div>

                      {cloudQuotaError && !cloudBlockReason && (
                        <div className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-200 leading-snug">
                          {cloudQuotaError}
                        </div>
                      )}

                      {cloudBlockReason && (
                        <div className="px-2.5 py-2 rounded-lg bg-amber-500/12 border border-amber-500/35 flex items-start gap-2 text-[11px] text-amber-200">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span className="leading-snug">{cloudBlockReason}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <span className="text-[10px] text-[#9CA3AF]">
                          {t("savePopover.layout")}
                        </span>
                        <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-[#0A0A0D]/70 border border-white/[0.08]">
                          {[
                            { id: "graded", label: t("savePopover.gradedOnly") },
                            { id: "split", label: t("savePopover.beforeAfterSplit") },
                          ].map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={isExportingVideo}
                              onClick={() => setVideoLayout(opt.id)}
                              className={`py-1 px-2 rounded-md text-[10px] font-medium transition-colors cursor-pointer truncate ${
                                videoLayout === opt.id
                                  ? "bg-white/[0.14] text-[#F4F5F7]"
                                  : "text-[#9CA3AF] hover:text-[#F4F5F7]"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] text-[#9CA3AF]">
                          {t("savePopover.bitrateQuality")}
                        </span>
                        <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-[#0A0A0D]/70 border border-white/[0.08]">
                          {[
                            { val: 16, label: t("savePopover.high16Mbps") },
                            { val: 8, label: t("savePopover.standard8Mbps") },
                          ].map((opt) => (
                            <button
                              key={opt.val}
                              type="button"
                              disabled={isExportingVideo}
                              onClick={() => setVideoBitrate(opt.val)}
                              className={`py-1 px-2 rounded-md text-[10px] font-medium transition-colors cursor-pointer truncate ${
                                videoBitrate === opt.val
                                  ? "bg-white/[0.14] text-[#F4F5F7]"
                                  : "text-[#9CA3AF] hover:text-[#F4F5F7]"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#0A0A0D]/55 border border-white/[0.08] cursor-pointer">
                        <span className="text-[11px] text-[#E2E4E9] font-medium">
                          {t("savePopover.includeAudio")}
                        </span>
                        <input
                          type="checkbox"
                          checked={includeAudio}
                          disabled={isExportingVideo}
                          onChange={(e) => setIncludeAudio(e.target.checked)}
                          className="accent-[#6EE7B7] w-4 h-4 cursor-pointer"
                        />
                      </label>
                    </>
                  )}

                  {isExportingVideo && (
                    <div className="space-y-1.5 p-2.5 rounded-lg bg-[#0A0A0D]/70 border border-[#6EE7B7]/30">
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                        <span className="text-[#6EE7B7] truncate">
                          {videoExportStatusText ||
                            t("savePopover.renderingVideo", { pct: videoExportProgress })}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            wasCancelledRef.current = true;
                            setRenderError("");
                            onCancelVideoExport?.();
                          }}
                          className="px-2 py-0.5 rounded bg-white/[0.08] hover:bg-red-500/20 text-[#E2E4E9] hover:text-red-300 text-[10px] cursor-pointer shrink-0"
                        >
                          {t("savePopover.cancel")}
                        </button>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-[#6EE7B7] transition-all duration-150"
                          style={{ width: `${Math.min(100, Math.max(0, videoExportProgress))}%` }}
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] text-[#9CA3AF]">
                      {t("savePopover.format")}
                    </span>
                    <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-[#0A0A0D]/70 border border-white/[0.08]">
                      {[
                        { id: "png", label: "PNG", sub: t("savePopover.lossless") },
                        { id: "jpg", label: "JPG", sub: t("savePopover.standard") },
                        { id: "webp", label: "WEBP", sub: t("savePopover.compact") },
                      ].map((fmt) => (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() => setExportFormat(fmt.id)}
                          className={`py-1 px-1.5 rounded-md text-center transition-colors cursor-pointer ${
                            exportFormat === fmt.id
                              ? "bg-[#E2E4E9] text-[#0E0E11] font-semibold"
                              : "text-[#9CA3AF] hover:text-[#F4F5F7]"
                          }`}
                        >
                          <div className="text-[11px] leading-tight">{fmt.label}</div>
                          <div className="text-[9px] opacity-75 leading-tight">{fmt.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {exportFormat !== "png" && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-[#9CA3AF]">{t("savePopover.quality")}</span>
                        <span className="font-mono text-[#E2E4E9]">{exportQuality}%</span>
                      </div>
                      <input
                        type="range"
                        min={60}
                        max={100}
                        step={1}
                        value={exportQuality}
                        onChange={(e) => setExportQuality(Number(e.target.value))}
                        className="w-full accent-[#E2E4E9] cursor-pointer h-1.5"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <span className="text-[10px] text-[#9CA3AF]">
                      {t("savePopover.layoutOutput")}
                    </span>
                    <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-[#0A0A0D]/70 border border-white/[0.08]">
                      {[
                        { id: "graded", label: t("savePopover.gradedOnly") },
                        { id: "split", label: t("savePopover.beforeAfter") },
                        { id: "promo", label: t("savePopover.promoCard") },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setExportLayout(opt.id)}
                          className={`py-1 px-1.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer truncate ${
                            exportLayout === opt.id
                              ? "bg-white/[0.14] text-[#F4F5F7]"
                              : "text-[#9CA3AF] hover:text-[#F4F5F7]"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {exportLayout === "promo" && (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <span className="text-[10px] text-[#9CA3AF]">
                          {t("savePopover.promoAspectRatio")}
                        </span>
                        <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-[#0A0A0D]/70 border border-white/[0.08]">
                          {[
                            { id: "16:9", label: t("savePopover.aspect169") },
                            { id: "4:5", label: t("savePopover.aspect45") },
                            { id: "9:16", label: t("savePopover.aspect916") },
                          ].map((ar) => (
                            <button
                              key={ar.id}
                              type="button"
                              onClick={() => setPromoAspect(ar.id)}
                              className={`py-1 px-1.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer truncate ${
                                promoAspect === ar.id
                                  ? "bg-[#6EE7B7]/20 text-[#6EE7B7] font-semibold"
                                  : "text-[#9CA3AF] hover:text-[#F4F5F7]"
                              }`}
                            >
                              {ar.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5 p-2 rounded-lg bg-[#0A0A0D]/55 border border-white/[0.08]">
                        <label className="flex items-center justify-between cursor-pointer">
                          <span className="text-[11px] text-[#E2E4E9] font-medium inline-flex items-center gap-1.5">
                            <QrCode className="w-3.5 h-3.5 text-[#6EE7B7]" />
                            <span>{t("savePopover.includeQrCode")}</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={includeQr}
                            onChange={(e) => setIncludeQr(e.target.checked)}
                            className="accent-[#6EE7B7] w-4 h-4 cursor-pointer"
                          />
                        </label>

                        {includeQr && (
                          <div className="space-y-1.5 pt-1 border-t border-white/[0.06]">
                            <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-[#0A0A0D]/80 border border-white/[0.08]">
                              {[
                                { id: "grade", label: t("savePopover.liveGradeLink") },
                                { id: "custom", label: t("savePopover.customStoreUrl") },
                              ].map((m) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => setPromoQrMode(m.id)}
                                  className={`py-1 px-1.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer truncate ${
                                    promoQrMode === m.id
                                      ? "bg-white/[0.14] text-[#F4F5F7]"
                                      : "text-[#9CA3AF] hover:text-[#F4F5F7]"
                                  }`}
                                >
                                  {m.label}
                                </button>
                              ))}
                            </div>

                            {promoQrMode === "custom" && (
                              <input
                                type="url"
                                value={promoQrCustomUrl}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  setPromoQrCustomUrl(next);
                                  try {
                                    if (typeof window !== "undefined" && window.localStorage) {
                                      window.localStorage.setItem(PROMO_QR_STORAGE_KEY, next);
                                    }
                                  } catch {
                                    // ignore storage errors
                                  }
                                }}
                                placeholder="https://sociabuzz.com/tfbagas/shop"
                                className="w-full bg-[#090A0E] border border-white/[0.12] focus:border-[#6EE7B7]/60 rounded-md px-2.5 py-1.5 text-[11px] font-mono text-[#E2E4E9] placeholder-[#9CA3AF]/40 outline-none transition-colors"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.07] text-[10px] font-mono text-[#9CA3AF] truncate">
                {previewExportFilename}
              </div>

              {renderError && (
                <div className="px-2.5 py-2 rounded-lg bg-red-500/12 border border-red-500/35 flex items-start gap-2 text-[11px] text-red-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  <span className="leading-snug">{renderError}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleDownloadClick}
                disabled={isSavingImage || isExportingVideo || isCloudBlocked}
                className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-[opacity,transform] duration-200 cursor-pointer disabled:cursor-not-allowed ${
                  savedLabel
                    ? "bg-[#86EFAC] text-[#042F1E] scale-[0.99]"
                    : "bg-[#6EE7B7] hover:bg-[#86EFAC] text-[#042F1E]"
                } disabled:opacity-50`}
              >
                {savedLabel ? (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>{savedLabel}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 stroke-[2.25]" />
                    <span>
                      {isVideo && mediaMode === "video"
                        ? isExportingVideo
                          ? videoExportStatusText ||
                            t("savePopover.renderingVideo", { pct: videoExportProgress })
                          : renderMode === "cloud"
                          ? "Render in Cloud (FFmpeg)"
                          : t("savePopover.exportGradedVideo")
                        : isSavingImage
                        ? t("savePopover.rendering")
                        : t("savePopover.downloadFmt", { fmt: exportFormat.toUpperCase() })}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
