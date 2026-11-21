import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  Check,
  X,
  Film,
  Image as ImageIcon,
  Package,
  AlertTriangle,
  QrCode,
  Cloud,
  Cpu,
  Sliders,
  ChevronDown,
  Share2,
} from "lucide-react";
import { DEFAULT_ENGINE_ID, getEngineCodename } from "../utils/engineMetadata";
import { encodeGradeToHash } from "../utils/shareCodec";
import { fetchCloudQuota, isCloudRenderConfigured } from "../utils/cloudVideoExporter";
import { useLanguage } from "../i18n/LanguageContext";
import ParameterSlider from "./ParameterSlider";
import { usePresence } from "../hooks/usePresence";
import { usePillIndicator } from "../hooks/usePillIndicator";

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

export default function ExportModal({
  isOpen,
  onClose,
  // Preset / Plugin export props
  presetName,
  setPresetName,
  authorName,
  setAuthorName,
  description,
  setDescription,
  onExportKfplug,
  onExportFfx,
  onExportCube,
  onExportLut,
  onExportZipPack,
  onOpenShare,
  isExportingPreset = false,
  hasLook = false,
  isCalibrationActive = false,
  onOpenCalibration,
  fallbackName = "Custom Look",
  isNeutralGrade = false,
  // Media / Video / Frame export props
  hasPreviewMedia = false,
  isVideo = false,
  onSaveImage,
  isSavingImage = false,
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
  engineId = DEFAULT_ENGINE_ID,
  splitPos = 50,
  params = null,
  logProfile = "rec709",
  matchStrength = 100,
}) {
  const { t } = useLanguage();
  const { isMounted, state: presenceState } = usePresence(isOpen, 160);
  const [activeTab, setActiveTab] = useState("presets"); // "presets" | "video" | "frame"
  const {
    containerRef: exportTabContainerRef,
    registerTabRef: registerExportTabRef,
    pillStyle: exportTabPillStyle,
  } = usePillIndicator(activeTab, { refreshKey: isMounted });
  const [isMetaExpanded, setIsMetaExpanded] = useState(false);
  const [cubeSize, setCubeSize] = useState(32);
  const [exportedKey, setExportedKey] = useState(null);

  // Frame / Promo state
  const [exportFormat, setExportFormat] = useState("png");
  const [exportQuality, setExportQuality] = useState(95);
  const [exportLayout, setExportLayout] = useState("graded");
  const [promoAspect, setPromoAspect] = useState("16:9");
  const [includeQr, setIncludeQr] = useState(true);
  const [promoQrMode, setPromoQrMode] = useState("grade");
  const [promoQrCustomUrl, setPromoQrCustomUrl] = useState(readStoredPromoQrUrl);

  // Video Local / Cloud state
  const [renderMode, setRenderMode] = useState("local");
  const [cloudQuota, setCloudQuota] = useState(null);
  const [cloudQuotaLoading, setCloudQuotaLoading] = useState(false);
  const [cloudQuotaError, setCloudQuotaError] = useState("");
  const [videoLayout, setVideoLayout] = useState("graded");
  const [videoBitrate, setVideoBitrate] = useState(16);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [savedLabel, setSavedLabel] = useState("");
  const [renderError, setRenderError] = useState("");

  const savedTimerRef = useRef(null);
  const presetTimerRef = useRef(null);
  const wasCancelledRef = useRef(false);
  const cloudConfigured = isCloudRenderConfigured();

  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !isExportingVideo) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, isExportingVideo, onClose]);

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      if (presetTimerRef.current) clearTimeout(presetTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!isOpen || !isVideo || activeTab !== "video" || !cloudConfigured) {
      return undefined;
    }
    const controller = new AbortController();
    setCloudQuotaLoading(true);
    setCloudQuotaError("");
    fetchCloudQuota(controller.signal)
      .then((q) => setCloudQuota(q))
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setCloudQuotaError(err?.message || "Unable to reach cloud renderer.");
        }
      })
      .finally(() => setCloudQuotaLoading(false));
    return () => controller.abort();
  }, [isOpen, isVideo, activeTab, cloudConfigured, renderMode]);

  if (!isMounted || typeof document === "undefined") return null;

  const codename = getEngineCodename(engineId);
  const engineSuffix = codename ? `_${codename}` : "";

  const rawPresetBase = (presetName || fallbackName || "Custom Look").trim();
  const safePresetBase =
    rawPresetBase.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") ||
    "Custom_Look";
  const previewKfplugName = /_(altair45|altair_refresh|altair|vega|sirius|polaris|v[1234])$/i.test(safePresetBase)
    ? `${safePresetBase}.kfplug`
    : `${safePresetBase}${engineSuffix}.kfplug`;

  const rawTargetBase = String(targetBaseName || "Target").trim();
  const safeTargetBase = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(rawTargetBase)
    ? "Custom-Color-Grade"
    : rawTargetBase;
  const cleanExportBase =
    safeTargetBase.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") ||
    "Target";
  const baseWithEngine = /_(altair45|altair_refresh|altair|vega|sirius|polaris|v[1234])$/i.test(cleanExportBase)
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
  const cloudQuotaExhausted = cloudQuota !== null && cloudQuota.remaining <= 0;

  let cloudBlockReason = "";
  if (isVideo && activeTab === "video" && renderMode === "cloud") {
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
  const previewVideoFilename =
    renderMode === "cloud"
      ? `${baseWithEngine}_cloud_graded.mp4`
      : `${baseWithEngine}_graded.${videoLayout === "split" ? "split." : ""}${videoExtPreview}`;
  const previewFrameFilename = `${baseWithEngine}-${layoutSuffix}.${exportFormat}`;

  const handlePresetTrigger = async (key, handler) => {
    if (!handler || !hasLook || isExportingPreset) return;
    await handler();
    if (presetTimerRef.current) clearTimeout(presetTimerRef.current);
    setExportedKey(key);
    presetTimerRef.current = setTimeout(() => setExportedKey(null), 1200);
  };

  const handleVideoDownload = async () => {
    setRenderError("");
    wasCancelledRef.current = false;
    if (!onExportVideo || isExportingVideo || isCloudBlocked || !isVideo) return;
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
  };

  const handleFrameDownload = async () => {
    setRenderError("");
    if (!onSaveImage || isSavingImage || !hasPreviewMedia) return;
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

  const tabs = [
    { id: "presets", label: "LUT / Plugin", icon: Package },
    { id: "video", label: "Video Render", icon: Film, badge: isVideo ? "MP4" : null },
    { id: "frame", label: "Current Frame", icon: ImageIcon },
  ];

  return createPortal(
    <div
      data-state={presenceState}
      onClick={() => {
        if (!isExportingVideo) onClose();
      }}
      className="studio-backdrop fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md"
    >
      <div
        data-state={presenceState}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Export Grade & Media"
        className="studio-modal w-full sm:max-w-[460px] max-h-[90dvh] flex flex-col rounded-t-xl sm:rounded-xl bg-[#0E0F12]/96 backdrop-blur-2xl border border-white/[0.11] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_24px_64px_rgba(0,0,0,0.85)] overflow-hidden text-left"
      >
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#F4F4F5]">
              Export Workstation
            </h2>
            {nativeWidth > 0 && nativeHeight > 0 && (
              <span className="text-[10px] font-mono tabular-nums text-[#71717A]">
                {nativeWidth}×{nativeHeight}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!isExportingVideo) onClose();
            }}
            disabled={isExportingVideo}
            aria-label="Close export modal"
            className="studio-tactile p-1 rounded-md text-[#71717A] hover:text-[#F4F4F5] hover:bg-white/[0.06] cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Multi-Format Tab Bar with Sliding Active Pill */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div
            ref={exportTabContainerRef}
            className="relative grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-[#08090A] border border-white/[0.07]"
          >
            <div
              aria-hidden="true"
              className="studio-sliding-pill pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-md bg-[#1C1F26] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_1px_6px_rgba(0,0,0,0.5)]"
              style={exportTabPillStyle}
            />
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={registerExportTabRef(tab.id)}
                  type="button"
                  disabled={isExportingVideo}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setRenderError("");
                  }}
                  className={`relative z-10 py-1.5 px-2 rounded-md text-[11px] font-medium inline-flex items-center justify-center gap-1.5 transition-[color,transform] duration-150 ease-[var(--ease-shutter)] active:scale-[0.96] cursor-pointer ${
                    isActive
                      ? "text-[#F4F4F5]"
                      : "text-[#71717A] hover:text-[#D4D4D8]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                  {tab.badge && (
                    <span className="text-[9px] font-mono text-[#34D399]">•</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Modal Body */}
        <div key={activeTab} className="studio-panel-fade flex-1 overflow-y-auto px-4 pb-4 pt-1 space-y-3">
          {/* TAB 1: PRESETS (.kfplug, .cube, .ffx, .lut, .zip) */}
          {activeTab === "presets" && (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-medium text-[#A1A1AA]">
                    {t("exportCard.presetNameLabel")}
                  </label>
                  <div className="flex items-center gap-2 min-w-0">
                    {isCalibrationActive && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenCalibration?.();
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#15171C] text-[#D4D4D8] border border-white/[0.10] cursor-pointer"
                      >
                        <Sliders className="w-2.5 h-2.5" />
                        <span>{t("exportCard.calibrated")}</span>
                      </button>
                    )}
                    <span className="text-[10px] font-mono text-[#71717A] truncate max-w-[170px]">
                      {previewKfplugName}
                    </span>
                  </div>
                </div>
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder={t("exportCard.presetNamePlaceholder")}
                  className="w-full bg-[#15171C] border border-white/[0.08] focus:border-white/25 rounded-md px-3 py-1.5 text-xs text-[#F4F4F5] placeholder-[#52525B] outline-none transition-colors"
                />
              </div>

              {/* Optional Author & Description (Smooth CSS Grid Accordion) */}
              <div className="rounded-md bg-[#08090A] border border-white/[0.07]">
                <button
                  type="button"
                  aria-expanded={isMetaExpanded}
                  onClick={() => setIsMetaExpanded((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-medium text-[#71717A] hover:text-[#D4D4D8] transition-colors duration-150 cursor-pointer"
                >
                  <span>{t("exportCard.metadataOptional")}</span>
                  <ChevronDown
                    className={`studio-chevron w-3.5 h-3.5 ${
                      isMetaExpanded ? "rotate-180 text-[#E4E4E7]" : "rotate-0"
                    }`}
                  />
                </button>
                <div
                  className="studio-collapse-grid"
                  data-expanded={isMetaExpanded}
                  aria-hidden={!isMetaExpanded}
                >
                  <div className="studio-collapse-inner">
                    <div className="px-3 pb-3 pt-1.5 grid grid-cols-2 gap-2 border-t border-white/[0.06]">
                      <div>
                        <label className="block text-[10px] text-[#71717A] mb-1">
                          {t("exportCard.authorLabel")}
                        </label>
                        <input
                          type="text"
                          tabIndex={isMetaExpanded ? 0 : -1}
                          value={authorName}
                          onChange={(e) => setAuthorName(e.target.value)}
                          placeholder={t("exportCard.authorPlaceholder")}
                          className="w-full bg-[#15171C] border border-white/[0.08] focus:border-white/25 rounded-md px-2.5 py-1.5 text-xs text-[#F4F4F5] placeholder-[#52525B] outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#71717A] mb-1">
                          {t("exportCard.descLabel")}
                        </label>
                        <input
                          type="text"
                          tabIndex={isMetaExpanded ? 0 : -1}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder={t("exportCard.descPlaceholder")}
                          className="w-full bg-[#15171C] border border-white/[0.08] focus:border-white/25 rounded-md px-2.5 py-1.5 text-xs text-[#F4F4F5] placeholder-[#52525B] outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {!hasLook && (
                <div className="px-3 py-2 rounded-md bg-[#15171C] border border-white/[0.07] text-[11px] text-[#A1A1AA]">
                  Load a Reference image or preset to enable LUT & plugin exports.
                </div>
              )}

              {hasLook && isNeutralGrade && (
                <div className="px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-[11px] text-amber-200/90">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-300" />
                  <span>{t("exportCard.neutralWarning")}</span>
                </div>
              )}

              {/* Primary .kfplug Export */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePresetTrigger("kfplug", onExportKfplug)}
                  disabled={!hasLook || isExportingPreset}
                  className={`flex-1 py-2 px-3 rounded-md font-semibold text-xs flex items-center justify-center gap-2 transition-colors ${
                    !hasLook || isExportingPreset
                      ? "bg-[#15171C] text-[#52525B] border border-white/[0.06] cursor-not-allowed"
                      : "bg-[#34D399] hover:bg-[#2CC08A] text-[#051B14] cursor-pointer"
                  }`}
                >
                  {exportedKey === "kfplug" ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>{t("exportCard.exported")}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {isExportingPreset
                          ? t("exportCard.packagingKfplug")
                          : t("exportCard.exportToKfplug")}
                      </span>
                    </>
                  )}
                </button>

                {onOpenShare && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenShare();
                    }}
                    className="py-2 px-3 rounded-md text-xs font-medium bg-[#15171C] hover:bg-[#1C1F26] text-[#E4E4E7] border border-white/[0.08] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5 text-[#A1A1AA]" />
                    <span>QR</span>
                  </button>
                )}
              </div>

              {/* .cube 3D LUT + Grid Precision */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePresetTrigger("cube", () => onExportCube?.(cubeSize))}
                  disabled={!hasLook || isExportingPreset}
                  className={`flex-1 py-2 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors ${
                    !hasLook || isExportingPreset
                      ? "bg-[#15171C]/50 text-[#52525B] border-white/[0.05] cursor-not-allowed"
                      : "bg-[#15171C] hover:bg-[#1C1F26] text-[#E4E4E7] border-white/[0.08] cursor-pointer"
                  }`}
                >
                  {exportedKey === "cube" ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{t("exportCard.exported")}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 text-[#A1A1AA]" />
                      <span>{t("exportCard.exportCube")}</span>
                    </>
                  )}
                </button>

                <div className="inline-flex items-center p-0.5 rounded-md bg-[#08090A] border border-white/[0.07] text-[10px] font-mono shrink-0">
                  {[17, 32, 33, 65].map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setCubeSize(sz)}
                      className={`px-2 py-1 rounded-[4px] transition-colors cursor-pointer ${
                        cubeSize === sz
                          ? "bg-[#1C1F26] text-[#F4F4F5] font-semibold"
                          : "text-[#71717A] hover:text-[#D4D4D8]"
                      }`}
                    >
                      {sz}³
                    </button>
                  ))}
                </div>
              </div>

              {/* .ffx After Effects Lumetri */}
              <button
                type="button"
                onClick={() => handlePresetTrigger("ffx", onExportFfx)}
                disabled={!hasLook || isExportingPreset}
                className={`w-full py-2 px-3 rounded-md text-xs font-medium flex items-center justify-between gap-2 border transition-colors ${
                  !hasLook || isExportingPreset
                    ? "bg-[#15171C]/50 text-[#52525B] border-white/[0.05] cursor-not-allowed"
                    : "bg-[#15171C] hover:bg-[#1C1F26] text-[#E4E4E7] border-white/[0.08] cursor-pointer"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {exportedKey === "ffx" ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{t("exportCard.exportedFfx")}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 text-[#A1A1AA]" />
                      <span>{t("exportCard.exportFfx")}</span>
                    </>
                  )}
                </span>
                <span className="text-[10px] font-mono text-[#71717A]">
                  {t("exportCard.aeLumetriBadge")}
                </span>
              </button>

              {/* .lut & Full .zip Pack */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handlePresetTrigger("lut", onExportLut)}
                  disabled={!hasLook || isExportingPreset}
                  className={`py-2 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors ${
                    !hasLook || isExportingPreset
                      ? "bg-[#15171C]/50 text-[#52525B] border-white/[0.05] cursor-not-allowed"
                      : "bg-[#15171C] hover:bg-[#1C1F26] text-[#E4E4E7] border-white/[0.08] cursor-pointer"
                  }`}
                >
                  <Download className="w-3.5 h-3.5 text-[#A1A1AA]" />
                  <span>{exportedKey === "lut" ? t("exportCard.exported") : t("exportCard.exportLut")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePresetTrigger("zip", () => onExportZipPack?.(cubeSize))}
                  disabled={!hasLook || isExportingPreset}
                  className={`py-2 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors ${
                    !hasLook || isExportingPreset
                      ? "bg-[#15171C]/50 text-[#52525B] border-white/[0.05] cursor-not-allowed"
                      : "bg-[#15171C] hover:bg-[#1C1F26] text-[#F4F4F5] border-white/[0.12] cursor-pointer"
                  }`}
                >
                  <Package className="w-3.5 h-3.5 text-[#A1A1AA] shrink-0" />
                  <span className="truncate">
                    {exportedKey === "zip" ? t("exportCard.packSaved") : "All-in-One (.zip)"}
                  </span>
                </button>
              </div>
            </>
          )}

          {/* TAB 2: VIDEO RENDER (LOCAL / CLOUD KAGGLE TURBO) */}
          {activeTab === "video" && (
            <>
              {!isVideo ? (
                <div className="py-8 px-4 text-center rounded-md bg-[#08090A] border border-white/[0.07] space-y-1.5">
                  <Film className="w-5 h-5 text-[#52525B] mx-auto" />
                  <p className="text-xs font-medium text-[#A1A1AA]">
                    No video clip loaded in Target Footage
                  </p>
                  <p className="text-[11px] text-[#71717A]">
                    Drop an MP4, MOV, or WEBM clip into Target Footage to enable Local WebCodecs or Cloud Kaggle Turbo FFmpeg rendering.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-[#71717A]">
                      Render Engine
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        disabled={isExportingVideo}
                        onClick={() => {
                          setRenderMode("local");
                          setRenderError("");
                        }}
                        className={`p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                          renderMode === "local"
                            ? "bg-[#15171C] border-white/25 text-[#F4F4F5]"
                            : "bg-[#08090A] border-white/[0.07] text-[#A1A1AA] hover:border-white/[0.14]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <Cpu className="w-3.5 h-3.5" />
                          <span>Local Render</span>
                        </div>
                        <div className="text-[10px] font-mono text-[#71717A] mt-0.5">
                          Unlimited · WebCodecs
                        </div>
                      </button>

                      <button
                        type="button"
                        disabled={isExportingVideo}
                        onClick={() => {
                          setRenderMode("cloud");
                          setRenderError("");
                        }}
                        className={`p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                          renderMode === "cloud"
                            ? "bg-[#15171C] border-[#34D399]/60 text-[#F4F4F5]"
                            : "bg-[#08090A] border-white/[0.07] text-[#A1A1AA] hover:border-white/[0.14]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <Cloud className="w-3.5 h-3.5 text-[#34D399]" />
                          <span>Cloud Turbo</span>
                        </div>
                        <div className="text-[10px] font-mono text-[#71717A] mt-0.5">
                          FFmpeg · {cloudQuota ? `${cloudQuota.remaining}/${cloudQuota.limit}` : "5/5"} left
                        </div>
                      </button>
                    </div>
                  </div>

                  {renderMode === "cloud" ? (
                    <div className="space-y-2">
                      {isKaggleTurbo && (
                        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-amber-400/10 border border-amber-400/25 text-[10px] font-medium text-amber-200">
                          <span>Kaggle Turbo GPU Worker</span>
                          <span className="font-mono text-amber-300/80">
                            {dailyCloudLimit}/day · {maxCloudDurationSec}s · {maxCloudFileSizeMb}MB
                          </span>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 rounded-md bg-[#08090A] border border-white/[0.07] text-[10px] font-mono text-[#A1A1AA]">
                        <div className="flex items-center gap-2.5">
                          <span className={cloudQuotaExhausted ? "text-red-400" : "text-[#F4F4F5]"}>
                            {cloudQuotaLoading
                              ? "Checking..."
                              : cloudQuota
                              ? `Quota ${cloudQuota.remaining}/${cloudQuota.limit}`
                              : "Quota 5/day"}
                          </span>
                          <span>
                            Workers {activeCloudWorkers}/{maxCloudConcurrency}
                          </span>
                          <span>Queue {queuedCloudJobs}</span>
                        </div>
                        <span className="text-[#71717A]">
                          Max {maxCloudDurationSec}s · {maxCloudFileSizeMb}MB
                        </span>
                      </div>

                      {cloudQuotaError && !cloudBlockReason && (
                        <div className="px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-[10px] text-amber-200">
                          {cloudQuotaError}
                        </div>
                      )}

                      {cloudBlockReason && (
                        <div className="px-2.5 py-2 rounded-md bg-amber-500/10 border border-amber-500/25 flex items-start gap-2 text-[11px] text-amber-200">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span>{cloudBlockReason}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <span className="text-[10px] text-[#71717A]">{t("savePopover.layout")}</span>
                          <div className="grid grid-cols-2 gap-0.5 p-0.5 rounded-md bg-[#08090A] border border-white/[0.07]">
                            {[
                              { id: "graded", label: "Graded" },
                              { id: "split", label: "Split" },
                            ].map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                disabled={isExportingVideo}
                                onClick={() => setVideoLayout(opt.id)}
                                className={`py-1 px-1.5 rounded-[4px] text-[10px] font-medium cursor-pointer transition-colors ${
                                  videoLayout === opt.id
                                    ? "bg-[#1C1F26] text-[#F4F4F5]"
                                    : "text-[#71717A] hover:text-[#D4D4D8]"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] text-[#71717A]">{t("savePopover.bitrateQuality")}</span>
                          <div className="grid grid-cols-2 gap-0.5 p-0.5 rounded-md bg-[#08090A] border border-white/[0.07]">
                            {[
                              { val: 16, label: "16 Mbps" },
                              { val: 8, label: "8 Mbps" },
                            ].map((opt) => (
                              <button
                                key={opt.val}
                                type="button"
                                disabled={isExportingVideo}
                                onClick={() => setVideoBitrate(opt.val)}
                                className={`py-1 px-1.5 rounded-[4px] text-[10px] font-mono cursor-pointer transition-colors ${
                                  videoBitrate === opt.val
                                    ? "bg-[#1C1F26] text-[#F4F4F5]"
                                    : "text-[#71717A] hover:text-[#D4D4D8]"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <label className="flex items-center justify-between px-3 py-2 rounded-md bg-[#08090A] border border-white/[0.07] cursor-pointer">
                        <span className="text-[11px] text-[#D4D4D8] font-medium">
                          {t("savePopover.includeAudio")}
                        </span>
                        <input
                          type="checkbox"
                          checked={includeAudio}
                          disabled={isExportingVideo}
                          onChange={(e) => setIncludeAudio(e.target.checked)}
                          className="accent-[#34D399] w-3.5 h-3.5 cursor-pointer"
                        />
                      </label>
                    </div>
                  )}

                  {isExportingVideo && (
                    <div className="space-y-1.5 p-2.5 rounded-md bg-[#08090A] border border-white/[0.10]">
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                        <span className="text-[#E4E4E7] truncate">
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
                          className="px-2 py-0.5 rounded bg-white/[0.08] hover:bg-red-500/20 text-[#E4E4E7] hover:text-red-300 text-[10px] cursor-pointer shrink-0"
                        >
                          {t("savePopover.cancel")}
                        </button>
                      </div>
                      <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-[#34D399] transition-all duration-150"
                          style={{ width: `${Math.min(100, Math.max(0, videoExportProgress))}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="px-2.5 py-1.5 rounded-md bg-[#08090A] border border-white/[0.06] text-[10px] font-mono text-[#71717A] truncate">
                    {previewVideoFilename}
                  </div>

                  {renderError && (
                    <div className="px-2.5 py-2 rounded-md bg-red-500/10 border border-red-500/25 flex items-start gap-2 text-[11px] text-red-200">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <span>{renderError}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleVideoDownload}
                    disabled={isExportingVideo || isCloudBlocked}
                    className="w-full py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 bg-[#34D399] hover:bg-[#2CC08A] text-[#051B14] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {savedLabel ? (
                      <>
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>{savedLabel}</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>
                          {isExportingVideo
                            ? videoExportStatusText ||
                              t("savePopover.renderingVideo", { pct: videoExportProgress })
                            : renderMode === "cloud"
                            ? "Render in Cloud (FFmpeg)"
                            : t("savePopover.exportGradedVideo")}
                        </span>
                      </>
                    )}
                  </button>
                </>
              )}
            </>
          )}

          {/* TAB 3: CURRENT FRAME & PROMO CARD */}
          {activeTab === "frame" && (
            <>
              {!hasPreviewMedia ? (
                <div className="py-8 px-4 text-center rounded-md bg-[#08090A] border border-white/[0.07] space-y-1.5">
                  <ImageIcon className="w-5 h-5 text-[#52525B] mx-auto" />
                  <p className="text-xs font-medium text-[#A1A1AA]">
                    No image or video frame loaded
                  </p>
                  <p className="text-[11px] text-[#71717A]">
                    Load Reference or Target media to export native-resolution graded frames or Promo Cards.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] text-[#71717A]">{t("savePopover.format")}</span>
                    <div className="grid grid-cols-3 gap-0.5 p-0.5 rounded-md bg-[#08090A] border border-white/[0.07]">
                      {[
                        { id: "png", label: "PNG", sub: t("savePopover.lossless") },
                        { id: "jpg", label: "JPG", sub: t("savePopover.standard") },
                        { id: "webp", label: "WEBP", sub: t("savePopover.compact") },
                      ].map((fmt) => (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() => setExportFormat(fmt.id)}
                          className={`py-1.5 px-1.5 rounded-[4px] text-center transition-colors cursor-pointer ${
                            exportFormat === fmt.id
                              ? "bg-[#1C1F26] text-[#F4F4F5] font-semibold"
                              : "text-[#71717A] hover:text-[#D4D4D8]"
                          }`}
                        >
                          <div className="text-[11px] leading-tight">{fmt.label}</div>
                          <div className="text-[9px] opacity-70">{fmt.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {exportFormat !== "png" && (
                    <ParameterSlider
                      paramKey="exportQuality"
                      label={t("savePopover.quality")}
                      min={60}
                      max={100}
                      step={1}
                      value={exportQuality}
                      defaultValue={95}
                      isBipolar={false}
                      decimals={0}
                      valueSuffix="%"
                      onChange={(_, v) => setExportQuality(Math.round(v))}
                    />
                  )}

                  <div className="space-y-1">
                    <span className="text-[10px] text-[#71717A]">{t("savePopover.layoutOutput")}</span>
                    <div className="grid grid-cols-3 gap-0.5 p-0.5 rounded-md bg-[#08090A] border border-white/[0.07]">
                      {[
                        { id: "graded", label: t("savePopover.gradedOnly") },
                        { id: "split", label: t("savePopover.beforeAfter") },
                        { id: "promo", label: t("savePopover.promoCard") },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setExportLayout(opt.id)}
                          className={`py-1.5 px-1.5 rounded-[4px] text-[10px] font-medium transition-colors cursor-pointer truncate ${
                            exportLayout === opt.id
                              ? "bg-[#1C1F26] text-[#F4F4F5]"
                              : "text-[#71717A] hover:text-[#D4D4D8]"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {exportLayout === "promo" && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-4 gap-0.5 p-0.5 rounded-md bg-[#08090A] border border-white/[0.07]">
                        {[
                          { id: "16:9", label: "16:9" },
                          { id: "4:5", label: "4:5" },
                          { id: "1:1", label: "1:1" },
                          { id: "9:16", label: "9:16" },
                        ].map((ar) => (
                          <button
                            key={ar.id}
                            type="button"
                            onClick={() => setPromoAspect(ar.id)}
                            className={`py-1 px-1.5 rounded-[4px] text-[10px] font-mono transition-colors cursor-pointer ${
                              promoAspect === ar.id
                                ? "bg-[#1C1F26] text-[#F4F4F5]"
                                : "text-[#71717A] hover:text-[#D4D4D8]"
                            }`}
                          >
                            {ar.label}
                          </button>
                        ))}
                      </div>

                      <div className="space-y-1.5 p-2.5 rounded-md bg-[#08090A] border border-white/[0.07]">
                        <label className="flex items-center justify-between cursor-pointer">
                          <span className="text-[11px] text-[#D4D4D8] font-medium inline-flex items-center gap-1.5">
                            <QrCode className="w-3.5 h-3.5 text-[#A1A1AA]" />
                            <span>{t("savePopover.includeQrCode")}</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={includeQr}
                            onChange={(e) => setIncludeQr(e.target.checked)}
                            className="accent-[#34D399] w-3.5 h-3.5 cursor-pointer"
                          />
                        </label>

                        {includeQr && (
                          <div className="space-y-1.5 pt-1.5 border-t border-white/[0.06]">
                            <div className="grid grid-cols-2 gap-0.5 p-0.5 rounded-md bg-[#15171C] border border-white/[0.07]">
                              {[
                                { id: "grade", label: t("savePopover.liveGradeLink") },
                                { id: "custom", label: t("savePopover.customStoreUrl") },
                              ].map((m) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => setPromoQrMode(m.id)}
                                  className={`py-1 px-1.5 rounded-[4px] text-[10px] font-medium transition-colors cursor-pointer truncate ${
                                    promoQrMode === m.id
                                      ? "bg-[#0E0F12] text-[#F4F4F5]"
                                      : "text-[#71717A] hover:text-[#D4D4D8]"
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
                                    window.localStorage?.setItem(PROMO_QR_STORAGE_KEY, next);
                                  } catch {
                                    // ignore
                                  }
                                }}
                                placeholder="https://sociabuzz.com/tfbagas/shop"
                                className="w-full bg-[#15171C] border border-white/[0.08] focus:border-white/25 rounded-md px-2.5 py-1.5 text-[11px] font-mono text-[#F4F4F5] placeholder-[#52525B] outline-none"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="px-2.5 py-1.5 rounded-md bg-[#08090A] border border-white/[0.06] text-[10px] font-mono text-[#71717A] truncate">
                    {previewFrameFilename}
                  </div>

                  {renderError && (
                    <div className="px-2.5 py-2 rounded-md bg-red-500/10 border border-red-500/25 flex items-start gap-2 text-[11px] text-red-200">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <span>{renderError}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleFrameDownload}
                    disabled={isSavingImage}
                    className="w-full py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 bg-[#34D399] hover:bg-[#2CC08A] text-[#051B14] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {savedLabel ? (
                      <>
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>{savedLabel}</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>
                          {isSavingImage
                            ? t("savePopover.rendering")
                            : t("savePopover.downloadFmt", { fmt: exportFormat.toUpperCase() })}
                        </span>
                      </>
                    )}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
