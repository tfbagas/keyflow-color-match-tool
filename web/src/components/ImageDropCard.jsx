import React, { useRef, useState } from "react";
import {
  Upload,
  RefreshCw,
  Trash2,
  Sparkles,
  Image as ImageIcon,
  ChevronDown,
  AlertCircle,
} from "lucide-react";

export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export default function ImageDropCard({
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
  onFileRejected,
}) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleFile = (file) => {
    if (!file) return;
    if (!ALLOWED_IMAGE_MIMES.includes(file.type)) {
      if (onFileRejected) {
        onFileRejected(
          `Unsupported file format (${file.type || "unknown"}). Please upload JPG, PNG, or WEBP.`
        );
      }
      return;
    }
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
        accept="image/jpeg,image/png,image/webp"
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
        <div className="flex items-center gap-2">
          <ImageIcon className="w-3.5 h-3.5 text-[#9CA3AF] group-hover:text-[#E2E4E9] transition-colors" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF] group-hover:text-[#E2E4E9] transition-colors">
            {title}
          </h3>
          {isPasteTarget && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-[#9CA3AF] border border-white/[0.09]">
              Ctrl+V Target
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] font-mono px-2 py-0.5 rounded-md border ${
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
            className="p-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-[#9CA3AF] hover:text-[#E2E4E9] border border-white/[0.09] transition-all cursor-pointer"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-300 ${
                isExpanded ? "rotate-180" : "rotate-0"
              }`}
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
              src={imageInfo.dataUrl}
              alt={imageInfo.name}
              className="w-8 h-8 rounded-md object-cover bg-[#0A0A0D]/38 border border-white/10 shrink-0"
            />
            <div className="min-w-0">
              <div className="text-xs font-medium text-[#E2E4E9] truncate">
                {imageInfo.name}
              </div>
              <div className="text-[10px] font-mono text-[#9CA3AF] truncate">
                {imageInfo.width}×{imageInfo.height} px • {imageInfo.ext} •{" "}
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
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.09] text-xs font-medium text-[#E2E4E9] transition-colors shrink-0 cursor-pointer"
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
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch">
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`relative flex-1 min-h-[140px] sm:min-h-[154px] rounded-lg border transition-all cursor-pointer flex flex-col items-center justify-center overflow-hidden bg-[#0A0A0D]/38 ${
                isDragging
                  ? "border-[#E2E4E9]/50 bg-white/[0.06]"
                  : imageInfo
                  ? "border-white/[0.09] hover:border-white/20"
                  : "border-dashed border-white/[0.14] hover:border-white/25 hover:bg-white/[0.03]"
              }`}
            >
              {imageInfo ? (
                <img
                  src={imageInfo.dataUrl}
                  alt={title}
                  className="w-full h-[154px] object-contain p-1.5 select-none"
                />
              ) : (
                <div className="flex flex-col items-center text-center p-3">
                  <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.09] flex items-center justify-center mb-2 text-[#E2E4E9]">
                    <Upload className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-medium text-[#E2E4E9]">
                    Drop image or click to browse
                  </p>
                  <span className="text-[11px] text-[#9CA3AF]/70 mt-1.5 font-mono">
                    JPG, PNG, WEBP
                  </span>
                </div>
              )}
            </div>

            <div className="flex sm:flex-col gap-2 sm:w-24 shrink-0">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.09] text-xs font-medium text-[#E2E4E9] transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#9CA3AF]" />
                <span>{imageInfo ? "Replace" : "Browse"}</span>
              </button>

              {imageInfo ? (
                <button
                  type="button"
                  onClick={onClearImage}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/[0.04] hover:bg-red-500/15 border border-white/[0.09] hover:border-red-500/30 text-xs font-medium text-[#9CA3AF] hover:text-red-300 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              ) : (
                onTrySample && (
                  <button
                    type="button"
                    onClick={onTrySample}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.09] text-xs font-medium text-[#9CA3AF] hover:text-[#E2E4E9] transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Sample</span>
                  </button>
                )
              )}
            </div>
          </div>

          {imageInfo && (
            <div className="mt-2 pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-[#9CA3AF] font-mono truncate">
              <span className="truncate max-w-[180px] sm:max-w-[240px] text-[#E2E4E9]/80">
                {imageInfo.name}
              </span>
              <span>
                {imageInfo.width}×{imageInfo.height} px • {imageInfo.ext} •{" "}
                {imageInfo.sizeMB} MB
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
