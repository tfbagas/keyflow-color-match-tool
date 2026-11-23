import React, { memo, useRef, useState, useEffect } from "react";
import {
  Upload,
  RefreshCw,
  Trash2,
  Image as ImageIcon,
  Sliders,
  AlertCircle,
  FileCog,
  X,
  Film,
  Check,
} from "lucide-react";
import { IMAGE_ACCEPT, VIDEO_ACCEPT, PRESET_ACCEPT } from "../utils/rawDecoder";
import InputProfileDropdown from "./InputProfileDropdown";
import { useLanguage } from "../i18n/LanguageContext";
import { SAMPLE_LOOK_LABELS_ID } from "../i18n/translations";

export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const ImageDropCard = memo(function ImageDropCard({
  title,
  stepIndex = "",
  subtitle = "",
  imageInfo,
  onSelectImage,
  onClearImage,
  onTrySample,
  isAnalyzing = false,
  isPasteTarget = false,
  onHoverChange,
  onFocusSlot,
  errorMessage = "",
  allowVideo = false,
  allowPresets = false,
  sampleOptions = null,
  importedLook = null,
  onClearImportedLook,
  isDirectConversionReady = false,
  inputProfile = null,
  onInputProfileChange = null,
  paletteSwatches = null,
  onCopySwatch = null,
}) {
  const { lang, t } = useLanguage();
  const [showSamples, setShowSamples] = useState(false);
  const [copiedHex, setCopiedHex] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const copyTimerRef = useRef(0);
  const inputRef = useRef(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    []
  );

  const acceptList = [
    IMAGE_ACCEPT,
    allowVideo ? VIDEO_ACCEPT : "",
    allowPresets ? PRESET_ACCEPT : "",
  ]
    .filter(Boolean)
    .join(",");

  const resolvedSubtitle =
    subtitle ||
    (allowPresets
      ? t("dropCard.referenceRoleSub")
      : t("dropCard.targetRoleSub"));

  const handleFile = (file) => {
    if (!file) return;
    onSelectImage(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    handleFile(file);
  };

  const handleSwatchClick = (e, hex) => {
    e.stopPropagation();
    const normalized = String(hex || "").toUpperCase();
    navigator.clipboard?.writeText?.(normalized)?.catch?.(() => {});
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    setCopiedHex(normalized);
    copyTimerRef.current = setTimeout(() => {
      setCopiedHex("");
      copyTimerRef.current = 0;
    }, 1500);
    if (onCopySwatch) {
      onCopySwatch(normalized);
    }
  };

  const formatSmartBadge = (badge) => {
    if (!badge || lang !== "id") return badge;
    return String(badge).replace(/frames sampled/i, "frame disampling");
  };

  return (
    <section
      onMouseEnter={() => onHoverChange && onHoverChange(true)}
      onMouseLeave={() => onHoverChange && onHoverChange(false)}
      onClick={() => onFocusSlot && onFocusSlot()}
      className="px-3.5 py-3 select-none"
    >
      <input
        ref={inputRef}
        type="file"
        accept={acceptList}
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/* Section Header + Role Subtitle */}
      <div className="flex items-start justify-between gap-1.5 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {stepIndex && (
              <span className="text-[10px] font-mono tabular-nums font-semibold text-[#93B8D8] shrink-0">
                {stepIndex}
              </span>
            )}
            <h3 className="text-[10.5px] font-sans font-semibold uppercase tracking-[0.06em] text-[#F4F7FB] truncate">
              {title}
            </h3>
            {isAnalyzing && (
              <span className="text-[9px] font-mono text-[#93B8D8] animate-pulse">
                •
              </span>
            )}
            {isPasteTarget && !isAnalyzing && (
              <span className="hidden lg:inline text-[9px] font-mono text-[#AAB7C5] px-1 py-0 rounded bg-[#0A0C10] border border-[#AAB7C5]/16">
                Ctrl+V
              </span>
            )}
          </div>
          {resolvedSubtitle && (
            <p className="text-[10.5px] font-sans text-[#AAB7C5] leading-tight mt-0.5 truncate">
              {resolvedSubtitle}
            </p>
          )}
        </div>

        {/* Inline Micro Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {!imageInfo && onTrySample && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (sampleOptions) {
                  setShowSamples((v) => !v);
                } else {
                  onTrySample();
                }
              }}
              className="px-1.5 py-0.5 rounded text-[10px] font-sans font-medium text-[#C9D7E2] hover:text-[#F4F7FB] hover:bg-[#1C2430] transition-colors cursor-pointer inline-flex items-center gap-1"
            >
              <ImageIcon className="w-2.5 h-2.5 text-[#93B8D8]" />
              <span>{t("dropCard.sample")}</span>
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
            title={imageInfo ? t("dropCard.replace") : t("dropCard.browse")}
            aria-label={imageInfo ? t("dropCard.replace") : t("dropCard.browse")}
            className="p-1 rounded text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          {imageInfo && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClearImage();
              }}
              title={t("dropCard.remove")}
              aria-label={t("dropCard.remove")}
              className="p-1 rounded text-[#AAB7C5] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="mb-2 px-2 py-1.5 rounded-md bg-red-500/10 border border-red-500/25 flex items-center gap-1.5 text-[10px] text-red-300 leading-snug">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span className="line-clamp-2">{errorMessage}</span>
        </div>
      )}

      {/* Compact Thumbnail / Dropzone Well */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`${title}: ${resolvedSubtitle}`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative w-full h-[102px] rounded-md border transition-colors cursor-pointer flex flex-col items-center justify-center overflow-hidden bg-[#0A0C10] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#7FA3C2] ${
          isDragging
            ? "border-[#7FA3C2]/70 bg-[#1C2430]"
            : isPasteTarget
            ? "border-[#4A6B86]/50"
            : imageInfo
            ? "border-[#AAB7C5]/14 hover:border-[#4A6B86]/55"
            : "border-dashed border-[#AAB7C5]/20 hover:border-[#4A6B86]/65 hover:bg-[#0D1118]"
        }`}
      >
        {imageInfo ? (
          <>
            <img
              src={imageInfo.thumbUrl || imageInfo.dataUrl}
              alt={title}
              className="w-full h-full object-contain p-1 select-none"
            />
            {imageInfo.formatBadge && (
              <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#0A0C10]/88 text-[#C9D7E2] border border-[#AAB7C5]/16 pointer-events-none">
                {(imageInfo.kind === "video" || imageInfo.sourceKind === "video") && (
                  <Film className="w-2.5 h-2.5" />
                )}
                {imageInfo.formatBadge}
              </span>
            )}
            {imageInfo.smartSampleBadge && (
              <span className="absolute bottom-1.5 left-1.5 right-1.5 inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#0A0C10]/90 text-[#C9D7E2] border border-[#AAB7C5]/16 pointer-events-none truncate">
                <Sliders className="w-2.5 h-2.5 shrink-0 text-[#93B8D8]" />
                <span className="truncate">{formatSmartBadge(imageInfo.smartSampleBadge)}</span>
              </span>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center text-center px-3">
            <Upload className="w-3.5 h-3.5 text-[#93B8D8] mb-1.5" />
            <p className="text-[11px] font-sans font-medium text-[#F4F7FB] leading-tight">
              {allowPresets
                ? t("dropCard.dropImageVideoOrLut")
                : t("dropCard.dropTargetPhotoOrVideo")}
            </p>
            <span className="text-[10px] font-mono text-[#AAB7C5] mt-0.5">
              {allowPresets
                ? "PNG · JPG · MP4 · .cube · .lut · .kfplug"
                : "PNG · JPG · RAW · MP4 · MOV"}
            </span>
          </div>
        )}
      </div>

      {/* Inline Sample Picker (Smooth CSS Grid Collapse) */}
      {sampleOptions && !imageInfo && (
        <div
          className="studio-collapse-grid"
          data-expanded={showSamples}
          aria-hidden={!showSamples}
        >
          <div className="studio-collapse-inner">
            <div className="mt-2 grid grid-cols-2 gap-1">
              {sampleOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  tabIndex={showSamples ? 0 : -1}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSamples(false);
                    onTrySample(opt.id);
                  }}
                  className="studio-tactile px-2 py-1 rounded bg-[#0A0C10] hover:bg-[#1C2430] border border-[#AAB7C5]/14 text-[10px] font-sans font-medium text-[#C9D7E2] hover:text-[#F4F7FB] cursor-pointer text-left truncate"
                >
                  {lang === "id" && SAMPLE_LOOK_LABELS_ID[opt.id]
                    ? SAMPLE_LOOK_LABELS_ID[opt.id]
                    : opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Imported Preset Flush Row (.cube / .kfplug / .ffx) */}
      {importedLook && (
        <div className="mt-2.5 pt-2 border-t border-[#AAB7C5]/14 space-y-1">
          <div className="flex items-center gap-1.5 text-[10.5px] text-[#F4F7FB]">
            <FileCog className="w-3 h-3 text-[#93B8D8] shrink-0" />
            <div className="min-w-0 flex-1 truncate font-medium">
              {importedLook.kind && (
                <span className="font-mono text-[#AAB7C5] mr-1">{importedLook.kind}</span>
              )}
              <span>{importedLook.name}</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClearImportedLook?.();
              }}
              aria-label={t("dropCard.clearImportedLook")}
              className="p-0.5 rounded text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] cursor-pointer shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          {isDirectConversionReady && (
            <div className="text-[9.5px] font-sans text-[#AAB7C5] flex items-center justify-between">
              <span>{t("dropCard.directConversionReady")}</span>
              <span className="font-mono text-[#93B8D8]">.kfplug / .cube</span>
            </div>
          )}
        </div>
      )}

      {/* Metadata Row when media is loaded */}
      {imageInfo && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-mono text-[#AAB7C5] tabular-nums">
          <span className="truncate text-[#C9D7E2] max-w-[130px]">{imageInfo.name}</span>
          <span className="shrink-0">
            {imageInfo.width}×{imageInfo.height} · {imageInfo.sizeMB}M
          </span>
        </div>
      )}

      {/* Reference: 6-Color Dominant Palette Droplets */}
      {!onInputProfileChange && (
        <div className="mt-2.5 pt-2 border-t border-[#AAB7C5]/14 flex items-center justify-between gap-2">
          <span className="text-[10px] font-sans font-medium text-[#AAB7C5] truncate">
            {copiedHex ? (
              <span className="inline-flex items-center gap-1 font-mono text-[#F4F7FB]">
                <Check className="w-2.5 h-2.5 text-[#93B8D8]" />
                <span>{copiedHex}</span>
              </span>
            ) : (
              t("dropCard.paletteShort")
            )}
          </span>
          <div className="flex items-center gap-1.5">
            {Array.isArray(paletteSwatches) && paletteSwatches.length > 0
              ? paletteSwatches.slice(0, 6).map((hex, idx) => (
                  <button
                    key={`${hex}-${idx}`}
                    type="button"
                    onClick={(e) => handleSwatchClick(e, hex)}
                    title={t("dropCard.copyHexTitle", { hex })}
                    aria-label={t("dropCard.copyHexTitle", { hex })}
                    className="w-4 h-4 rounded-full border border-[#F4F7FB]/20 hover:scale-115 active:scale-95 transition-transform cursor-pointer"
                    style={{
                      backgroundColor: hex,
                      boxShadow: "inset 0 1px 1px rgba(255,255,255,0.35), 0 1px 3px rgba(0,0,0,0.6)",
                    }}
                  />
                ))
              : Array.from({ length: 6 }).map((_, idx) => (
                  <span
                    key={idx}
                    className="w-4 h-4 rounded-full bg-[#0A0C10] border border-[#AAB7C5]/14"
                  />
                ))}
          </div>
        </div>
      )}

      {/* Target Footage: Input Profile Dropdown */}
      {typeof onInputProfileChange === "function" && (
        <div className="mt-2.5 pt-2 border-t border-[#AAB7C5]/14 flex items-center justify-between gap-2">
          <span className="text-[10.5px] font-sans font-medium text-[#AAB7C5] shrink-0">
            {t("dropCard.inputProfileTitle")}
          </span>
          <InputProfileDropdown
            value={inputProfile || "rec709"}
            onChange={onInputProfileChange}
            ariaLabel={t("dropCard.targetInputProfileAria")}
            compact
            className="w-[144px]"
          />
        </div>
      )}
    </section>
  );
});

export default ImageDropCard;
