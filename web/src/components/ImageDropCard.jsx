import React, { memo, useRef, useState } from "react";
import {
  Upload,
  RefreshCw,
  Trash2,
  Sparkles,
  Image as ImageIcon,
  ChevronDown,
  AlertCircle,
  FileCog,
  X,
  Film,
} from "lucide-react";
import { IMAGE_ACCEPT, VIDEO_ACCEPT, PRESET_ACCEPT } from "../utils/rawDecoder";

export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const ImageDropCard = memo(function ImageDropCard({
  title,
  imageInfo,
  onSelectImage,
  onClearImage,
  onTrySample,
  isAnalyzing = false,
  defaultExpanded = true,
  isPasteTarget = false,
  onHoverChange,
  onFocusSlot,
  errorMessage = "",
  allowVideo = false,
  allowPresets = false,
  sampleOptions = null,
  importedLook = null,
  onClearImportedLook,
}) {
  const [showSamples, setShowSamples] = useState(false);
  const acceptList = [IMAGE_ACCEPT, allowVideo ? VIDEO_ACCEPT : "", allowPresets ? PRESET_ACCEPT : ""]
    .filter(Boolean)
    .join(",");
  const formatHint = allowVideo
    ? "Image, RAW or video (MP4, WEBM, MOV, MKV)"
    : allowPresets
    ? "Image, RAW, .cube, .lut or .kfplug"
    : "Image or Camera RAW";
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleFile = (file) => {
    if (!file) return;
    // Extension + magic-byte validation happens in the app (RAW files often have an empty MIME type).
    onSelectImage(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    handleFile(file);
  };

  return (
    <div
      onMouseEnter={() => onHoverChange && onHoverChange(true)}
      onMouseLeave={() => onHoverChange && onHoverChange(false)}
      onClick={() => onFocusSlot && onFocusSlot()}
      className={`m3-panel rounded-2xl p-3.5 transition-all ${
        isPasteTarget
          ? "border-white/20 shadow-[0_0_0_1px_rgba(226,228,233,0.08)]"
          : ""
      }`}
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

      <div
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center justify-between cursor-pointer select-none group"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <ImageIcon className="w-3.5 h-3.5 text-[#9CA3AF] group-hover:text-[#E2E4E9] transition-colors shrink-0" />
          <h3 className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.06em] sm:tracking-[0.08em] text-[#9CA3AF] group-hover:text-[#E2E4E9] transition-colors truncate">
            {title}
          </h3>
          {isPasteTarget && (
            <span className="hidden lg:inline-block text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-[#9CA3AF] border border-white/[0.09] shrink-0">
              Ctrl+V Target
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-[10px] sm:text-[11px] font-mono px-1.5 sm:px-2 py-0.5 rounded-md border ${
              isAnalyzing
                ? "bg-white/[0.06] text-[#E2E4E9] border-white/15 animate-pulse"
                : imageInfo
                ? "bg-white/[0.04] text-[#E2E4E9] border-white/[0.09]"
                : "bg-transparent text-[#9CA3AF]/60 border-white/[0.06]"
            }`}
          >
            {isAnalyzing ? "ANALYZING..." : imageInfo ? "LOADED" : "EMPTY"}
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((prev) => !prev);
            }}
            aria-expanded={isExpanded}
            aria-label={`Toggle ${title} panel`}
            className="m3-btn-morph p-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-[#9CA3AF] hover:text-[#E2E4E9] border border-white/[0.09] cursor-pointer"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-300 ${
                isExpanded ? "rotate-180" : "rotate-0"
              }`}
              style={{ transitionTimingFunction: "var(--ease-m3-spring)" }}
            />
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/25 flex items-center gap-2 text-[11px] text-red-300">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {!isExpanded && imageInfo && (
        <div className="mt-2.5 pt-2.5 border-t border-white/[0.08] flex items-center justify-between gap-2.5 m3-tab-enter">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={imageInfo.thumbUrl || imageInfo.dataUrl}
              alt={imageInfo.name}
              className="w-8 h-8 rounded-md object-cover bg-[#0A0A0D]/38 border border-white/10 shrink-0"
            />
            <div className="min-w-0">
              <div className="text-xs font-medium text-[#E2E4E9] truncate">
                {imageInfo.name}
              </div>
              <div className="text-[10px] font-mono text-[#9CA3AF] truncate">
                {imageInfo.width}×{imageInfo.height} px • {imageInfo.formatBadge || imageInfo.ext} •{" "}
                {imageInfo.sizeMB} MB
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
            className="m3-btn-morph inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.09] text-xs font-medium text-[#E2E4E9] shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3 text-[#9CA3AF]" />
            <span>Replace</span>
          </button>
        </div>
      )}

      <div
        className={`m3-collapse-grid ${isExpanded ? "mt-2.5" : "mt-0"}`}
        data-expanded={isExpanded}
      >
        <div className="m3-collapse-inner">
          <div className="flex flex-col lg:flex-row gap-2 items-stretch">
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`relative flex-1 min-h-[84px] lg:min-h-[210px] rounded-lg border transition-all cursor-pointer flex flex-col items-center justify-center overflow-hidden bg-[#0A0A0D]/38 ${
                isDragging
                  ? "border-[#E2E4E9]/50 bg-white/[0.06]"
                  : imageInfo
                  ? "border-white/[0.09] hover:border-white/20"
                  : "border-dashed border-white/[0.14] hover:border-white/25 hover:bg-white/[0.03]"
              }`}
            >
              {imageInfo ? (
                <>
                  <img
                    src={imageInfo.thumbUrl || imageInfo.dataUrl}
                    alt={title}
                    className="w-full h-[84px] lg:h-[210px] object-contain p-1 lg:p-1.5 select-none"
                  />
                  {imageInfo.formatBadge && (
                    <span className="absolute top-1 left-1 lg:top-1.5 lg:left-1.5 inline-flex items-center gap-1 text-[9px] lg:text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#151519]/90 text-[#E2E4E9] border border-white/[0.12] pointer-events-none">
                      {imageInfo.kind === "video" && <Film className="w-2.5 h-2.5" />}
                      {imageInfo.formatBadge}
                    </span>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center text-center p-2 lg:p-3">
                  <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-lg bg-white/[0.04] border border-white/[0.09] flex items-center justify-center mb-1 lg:mb-1.5 text-[#E2E4E9]">
                    <Upload className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  </div>
                  <p className="text-[11px] lg:text-xs font-medium text-[#E2E4E9] leading-tight">
                    {allowVideo ? "Drop image, RAW or video" : allowPresets ? "Drop image, RAW or LUT" : "Drop image or click"}
                  </p>
                  <span className="hidden lg:inline text-[10px] text-[#9CA3AF]/70 mt-1 font-mono">
                    {formatHint}
                  </span>
                </div>
              )}
            </div>

            <div className="flex lg:flex-col gap-1.5 lg:w-24 shrink-0">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="m3-btn-morph flex-1 min-w-0 flex items-center justify-center gap-1 px-1.5 sm:px-2 py-1.5 lg:py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.09] text-[10px] sm:text-[11px] lg:text-xs font-medium text-[#E2E4E9] cursor-pointer"
              >
                <RefreshCw className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-[#9CA3AF] shrink-0" />
                <span className="truncate">{imageInfo ? "Replace" : "Browse"}</span>
              </button>

              {imageInfo ? (
                <button
                  type="button"
                  onClick={onClearImage}
                  className="m3-btn-morph flex-1 min-w-0 flex items-center justify-center gap-1 px-1.5 sm:px-2 py-1.5 lg:py-2 rounded-lg bg-white/[0.04] hover:bg-red-500/15 border border-white/[0.09] hover:border-red-500/30 text-[10px] sm:text-[11px] lg:text-xs font-medium text-[#9CA3AF] hover:text-red-300 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3 lg:w-3.5 lg:h-3.5 shrink-0" />
                  <span className="truncate">Remove</span>
                </button>
              ) : (
                onTrySample && (
                  <button
                    type="button"
                    onClick={() => (sampleOptions ? setShowSamples((v) => !v) : onTrySample())}
                    className="m3-btn-morph flex-1 min-w-0 flex items-center justify-center gap-1 px-1.5 sm:px-2 py-1.5 lg:py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.09] text-[10px] sm:text-[11px] lg:text-xs font-medium text-[#9CA3AF] hover:text-[#E2E4E9] cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 lg:w-3.5 lg:h-3.5 shrink-0" />
                    <span className="truncate">Sample</span>
                  </button>
                )
              )}
            </div>
          </div>

          {sampleOptions && showSamples && !imageInfo && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 m3-tab-enter">
              {sampleOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setShowSamples(false);
                    onTrySample(opt.id);
                  }}
                  className="m3-btn-morph px-2 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.09] text-[11px] font-medium text-[#E2E4E9] cursor-pointer text-left"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {importedLook && (
            <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.09] flex items-center gap-2 text-[11px] text-[#E2E4E9]">
              <FileCog className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
              <span className="truncate min-w-0">
                <span className="font-mono text-[#9CA3AF]">{importedLook.kind}</span> {importedLook.name}
                {typeof importedLook.rms === "number" && (
                  <span className="font-mono text-[#9CA3AF]"> (fit {importedLook.rms.toFixed(3)})</span>
                )}
              </span>
              <button
                type="button"
                onClick={onClearImportedLook}
                aria-label="Clear imported look"
                className="ml-auto p-0.5 rounded text-[#9CA3AF] hover:text-[#E2E4E9] hover:bg-white/10 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {imageInfo && (
            <div className="mt-2 pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[10px] sm:text-[11px] text-[#9CA3AF] font-mono">
              <span className="truncate max-w-full sm:max-w-[200px] text-[#E2E4E9]/80">
                {imageInfo.name}
              </span>
              <span className="truncate">
                {imageInfo.width}x{imageInfo.height} px • {imageInfo.formatBadge || imageInfo.ext} •{" "}
                {imageInfo.sizeMB} MB
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default ImageDropCard;
