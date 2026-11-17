import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Download, Check, X, Film, Image as ImageIcon, AlertTriangle, QrCode } from "lucide-react";
import { getEngineCodename } from "../utils/engineRegistry";
import { encodeGradeToHash } from "../utils/shareCodec";
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
  onCancelVideoExport,
  targetVideoSrc = "",
  targetFile = null,
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
  const [videoLayout, setVideoLayout] = useState("graded"); // "graded" | "split"
  const [videoBitrate, setVideoBitrate] = useState(16); // 16 | 8
  const [includeAudio, setIncludeAudio] = useState(true);
  const [savedLabel, setSavedLabel] = useState("");
  const [renderError, setRenderError] = useState("");
  const exportPopoverRef = useRef(null);
  const savedTimerRef = useRef(null);
  const wasCancelledRef = useRef(false);

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
  const videoExtPreview = typeof VideoEncoder !== "undefined" ? "mp4" : "webm";
  const previewExportFilename =
    isVideo && mediaMode === "video"
      ? `${baseWithEngine}_graded.${videoLayout === "split" ? "split." : ""}${videoExtPreview}`
      : `${baseWithEngine}-${layoutSuffix}.${exportFormat}`;

  const handleDownloadClick = async () => {
    setRenderError("");
    wasCancelledRef.current = false;

    if (isVideo && mediaMode === "video") {
      if (!onExportVideo || isExportingVideo) return;
      try {
        const ok = await onExportVideo({
          targetVideoSrc,
          targetFile,
          layout: videoLayout,
          splitPosition: splitPos,
          bitrateMbps: videoBitrate,
          includeAudio,
        });
        if (ok !== false) {
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

                  {isExportingVideo && (
                    <div className="space-y-1.5 p-2.5 rounded-lg bg-[#0A0A0D]/70 border border-[#6EE7B7]/30">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-[#6EE7B7]">
                          {t("savePopover.renderingVideo", { pct: videoExportProgress })}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            wasCancelledRef.current = true;
                            setRenderError("");
                            onCancelVideoExport?.();
                          }}
                          className="px-2 py-0.5 rounded bg-white/[0.08] hover:bg-red-500/20 text-[#E2E4E9] hover:text-red-300 text-[10px] cursor-pointer"
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
                disabled={isSavingImage || isExportingVideo}
                className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-[opacity,transform] duration-200 cursor-pointer ${
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
                          ? t("savePopover.renderingVideo", { pct: videoExportProgress })
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
