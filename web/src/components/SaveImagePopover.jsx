import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Download, Check, X } from "lucide-react";

export default function SaveImagePopover({
  onSaveImage,
  isSavingImage = false,
  nativeWidth = 0,
  nativeHeight = 0,
  targetBaseName = "Target",
  engineId = "v3",
  splitPos = 50,
}) {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState("png");
  const [exportQuality, setExportQuality] = useState(95);
  const [exportLayout, setExportLayout] = useState("graded");
  const [savedLabel, setSavedLabel] = useState("");
  const exportPopoverRef = useRef(null);
  const savedTimerRef = useRef(null);

  useEffect(() => {
    if (!isExportOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key === "Escape") setIsExportOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isExportOpen]);

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    },
    []
  );

  const cleanExportBase =
    String(targetBaseName || "Target")
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "Target";
  const engineSuffix = engineId ? `_${engineId}` : "";
  const baseWithEngine = cleanExportBase.endsWith(engineSuffix)
    ? cleanExportBase
    : `${cleanExportBase}${engineSuffix}`;
  const previewExportFilename = `${baseWithEngine}-${
    exportLayout === "split" ? "split" : "graded"
  }.${exportFormat}`;

  const handleDownloadClick = async () => {
    if (!onSaveImage || isSavingImage) return;
    const ok = await onSaveImage({
      format: exportFormat,
      quality: exportQuality,
      layout: exportLayout,
      splitPos,
    });
    if (ok !== false) {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      setSavedLabel(`Saved ${exportFormat.toUpperCase()}`);
      savedTimerRef.current = setTimeout(() => setSavedLabel(""), 1200);
    }
  };

  return (
    <div ref={exportPopoverRef} className="relative">
      <button
        type="button"
        onClick={() => setIsExportOpen((v) => !v)}
        aria-expanded={isExportOpen}
        title="Export full-resolution graded image or video frame"
        className={`m3-btn-morph inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer select-none ${
          isExportOpen
            ? "bg-[#E2E4E9] text-[#0E0E11] border-[#E2E4E9]"
            : "bg-white/[0.04] hover:bg-white/[0.09] text-[#E2E4E9] border-white/[0.09]"
        }`}
      >
        <Download className="w-3.5 h-3.5" />
        <span>Save Image</span>
      </button>

      {isExportOpen &&
        createPortal(
          <div
            onClick={() => setIsExportOpen(false)}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Export Native Resolution"
              className="w-full sm:max-w-md max-h-[88dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#131419] border border-white/[0.16] shadow-2xl p-4 space-y-3 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#9CA3AF]">
                  Export Native Resolution
                </span>
                <div className="flex items-center gap-2">
                  {nativeWidth > 0 && nativeHeight > 0 && (
                    <span className="text-[10px] font-mono text-[#E2E4E9]">
                      {nativeWidth} x {nativeHeight} px
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsExportOpen(false)}
                    aria-label="Close export sheet"
                    className="p-1 rounded-lg text-[#9CA3AF] hover:text-[#F4F5F7] hover:bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-[#9CA3AF]">Format</span>
                <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-[#0A0A0D]/70 border border-white/[0.08]">
                  {[
                    { id: "png", label: "PNG", sub: "Lossless" },
                    { id: "jpg", label: "JPG", sub: "Standard" },
                    { id: "webp", label: "WEBP", sub: "Compact" },
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
                    <span className="text-[#9CA3AF]">Quality</span>
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
                <span className="text-[10px] text-[#9CA3AF]">Layout Output</span>
                <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-[#0A0A0D]/70 border border-white/[0.08]">
                  {[
                    { id: "graded", label: "Graded Only" },
                    { id: "split", label: "Before / After Split" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setExportLayout(opt.id)}
                      className={`py-1 px-2 rounded-md text-[10px] font-medium transition-colors cursor-pointer truncate ${
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

              <div className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.07] text-[10px] font-mono text-[#9CA3AF] truncate">
                {previewExportFilename}
              </div>

              <button
                type="button"
                onClick={handleDownloadClick}
                disabled={isSavingImage}
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
                      {isSavingImage
                        ? "Rendering..."
                        : `Download ${exportFormat.toUpperCase()}`}
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
