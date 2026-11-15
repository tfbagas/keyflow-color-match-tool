import React, { useState, useRef, useEffect, useCallback } from "react";
import { Columns } from "lucide-react";

const PREVIEW_MODES = [
  { id: "split", label: "Split Slider" },
  { id: "side", label: "Side by Side" },
  { id: "result", label: "Split Result" }
];

export default function ComparisonSlider({
  originalImage,
  gradedCanvasRef,
  previewMode = "split",
  onPreviewModeChange
}) {
  const [splitPos, setSplitPos] = useState(0.5);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  const handleMove = useCallback((clientX) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = clientX - rect.left;
    const pos = Math.max(0.02, Math.min(0.98, x / rect.width));
    setSplitPos(pos);
  }, []);

  const handleMouseDown = (e) => {
    if (previewMode !== "split" || !originalImage) return;
    setIsDragging(true);
    handleMove(e.clientX);
  };

  const handleTouchStart = (e) => {
    if (previewMode !== "split" || !originalImage) return;
    if (e.touches && e.touches.length > 0) {
      setIsDragging(true);
      handleMove(e.touches[0].clientX);
    }
  };

  useEffect(() => {
    const handleWindowMouseMove = (e) => {
      if (isDragging) {
        handleMove(e.clientX);
      }
    };
    const handleWindowTouchMove = (e) => {
      if (isDragging && e.touches && e.touches.length > 0) {
        handleMove(e.touches[0].clientX);
      }
    };
    const handleWindowMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("touchmove", handleWindowTouchMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("touchend", handleWindowMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("touchmove", handleWindowTouchMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("touchend", handleWindowMouseUp);
    };
  }, [isDragging, handleMove]);

  return (
    <div className="liquid-glass rounded-2xl p-4 flex flex-col gap-3">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Columns size={16} className="text-[#00E987] shrink-0" />
          <span className="text-xs font-semibold text-white">
            Visual Preview (Before / After Comparison)
          </span>
        </div>

        {/* 3-Mode Segmented Control */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#09100D]/90 border border-[#20352B]">
          {PREVIEW_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => onPreviewModeChange?.(mode.id)}
              className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer ${
                previewMode === mode.id
                  ? "bg-[#00E987] text-[#080D0B] shadow-[0_0_8px_rgba(0,233,135,0.25)]"
                  : "text-[#91A69A] hover:text-[#E8F2ED]"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Image Stage */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className={`relative w-full aspect-16/10 bg-[#09100D] border border-[#20352B] rounded-xl overflow-hidden select-none min-h-[200px] ${
          originalImage && previewMode === "split" ? "cursor-ew-resize" : "cursor-default"
        }`}
      >
        {!originalImage ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[#91A69A] font-medium text-center px-4">
            No image loaded for visual preview
          </div>
        ) : previewMode === "split" ? (
          /* Mode 1: Interactive Split Slider */
          <div className="absolute inset-0 w-full h-full">
            {/* Graded Image on Right (Base layer) */}
            <canvas
              key="canvas-split"
              ref={gradedCanvasRef}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />

            {/* Original Image on Left (Clipped layer) */}
            <div
              className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none"
              style={{ clipPath: `inset(0 ${(1 - splitPos) * 100}% 0 0)` }}
            >
              <img
                src={originalImage}
                alt="Before"
                className="w-full h-full object-contain"
              />
            </div>

            {/* Neon Green Divider Line */}
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-[#00E987] shadow-[0_0_8px_#00E987] pointer-events-none"
              style={{ left: `${splitPos * 100}%` }}
            >
              {/* Circular Handle */}
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-[#111A17] border-2 border-[#00E987] flex items-center justify-center text-[10px] text-[#00E987] font-semibold shadow-lg">
                ◂▸
              </div>
            </div>

            {/* Badges */}
            <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-black/65 backdrop-blur-sm text-[9px] font-semibold tracking-wider text-white border border-white/10 pointer-events-none">
              BEFORE
            </div>
            <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-black/65 backdrop-blur-sm text-[9px] font-semibold tracking-wider text-[#00E987] border border-[#00E987]/30 pointer-events-none">
              AFTER
            </div>
          </div>
        ) : previewMode === "side" ? (
          /* Mode 2: Side by Side */
          <div className="absolute inset-0 grid grid-cols-2 w-full h-full divide-x divide-[#20352B]">
            <div className="relative w-full h-full min-w-0 min-h-0 overflow-hidden bg-black/30">
              <img
                src={originalImage}
                alt="Original"
                className="w-full h-full object-contain pointer-events-none"
              />
              <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/65 backdrop-blur-sm rounded text-[9px] font-semibold tracking-wider text-white border border-white/10 pointer-events-none">
                ORIGINAL
              </span>
            </div>
            <div className="relative w-full h-full min-w-0 min-h-0 overflow-hidden bg-black/30">
              <canvas
                key="canvas-side"
                ref={gradedCanvasRef}
                className="w-full h-full object-contain pointer-events-none"
              />
              <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/65 backdrop-blur-sm rounded text-[9px] font-semibold tracking-wider text-[#00E987] border border-[#00E987]/30 pointer-events-none">
                GRADED
              </span>
            </div>
          </div>
        ) : (
          /* Mode 3: Split Result (Clean 50/50 Split Seam) */
          <div className="absolute inset-0 w-full h-full">
            {/* Graded Image (Right 50% Base layer) */}
            <canvas
              key="canvas-result"
              ref={gradedCanvasRef}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />

            {/* Original Image (Left 50% Clipped) */}
            <div
              className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none"
              style={{ clipPath: "inset(0 50% 0 0)" }}
            >
              <img
                src={originalImage}
                alt="Original"
                className="w-full h-full object-contain"
              />
            </div>

            {/* Clean Hairline Seam Divider at 50% */}
            <div
              className="absolute top-0 bottom-0 w-[1px] bg-[#00E987]/80 shadow-[0_0_6px_rgba(0,233,135,0.5)] pointer-events-none"
              style={{ left: "50%" }}
            />

            {/* Badges */}
            <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-black/65 backdrop-blur-sm text-[9px] font-semibold tracking-wider text-white border border-white/10 pointer-events-none">
              BEFORE
            </div>
            <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-black/65 backdrop-blur-sm text-[9px] font-semibold tracking-wider text-[#00E987] border border-[#00E987]/30 pointer-events-none">
              AFTER
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
