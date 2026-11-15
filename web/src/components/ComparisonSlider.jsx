import React, { useState, useRef, useEffect, useCallback } from "react";
import { Columns, SplitSquareVertical } from "lucide-react";

export default function ComparisonSlider({ originalImage, gradedCanvasRef }) {
  const [splitPos, setSplitPos] = useState(0.5);
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState("split"); // "split" | "side"
  const containerRef = useRef(null);

  const handleMove = useCallback((clientX) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pos = Math.max(0.02, Math.min(0.98, x / rect.width));
    setSplitPos(pos);
  }, []);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    handleMove(e.clientX);
  };

  const handleTouchStart = (e) => {
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Columns size={16} className="text-[#00E987]" />
          <span className="text-xs font-bold text-white">Visual Preview (Before / After Comparison)</span>
        </div>

        <button
          onClick={() => setViewMode(viewMode === "split" ? "side" : "split")}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold text-[#E8F2ED] bg-[#16231D]/80 hover:border-[#00E987] border border-[#20352B] rounded-lg transition-colors cursor-pointer"
        >
          <SplitSquareVertical size={12} className="text-[#91A69A]" />
          {viewMode === "split" ? "Split Slider ▾" : "Side by Side ▾"}
        </button>
      </div>

      {/* Main Image Stage */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className="relative w-full aspect-16/10 bg-[#09100D] border border-[#20352B] rounded-xl overflow-hidden select-none cursor-ew-resize flex items-center justify-center min-h-[180px]"
      >
        {!originalImage ? (
          <div className="text-xs text-[#91A69A] font-medium text-center px-4">
            No image loaded for visual preview
          </div>
        ) : viewMode === "split" ? (
          <>
            {/* Graded Image on Right (Base layer) */}
            <canvas
              ref={gradedCanvasRef}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />

            {/* Original Image on Left (Clipped layer) */}
            <div
              className="absolute inset-0 overflow-hidden pointer-events-none"
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
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-[#111A17] border-2 border-[#00E987] flex items-center justify-center text-[10px] text-[#00E987] font-bold shadow-lg">
                ◂▸
              </div>
            </div>

            {/* Badges */}
            <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[9px] font-bold tracking-wider text-white border border-white/10 pointer-events-none">
              BEFORE
            </div>
            <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[9px] font-bold tracking-wider text-[#00E987] border border-[#00E987]/30 pointer-events-none">
              AFTER
            </div>
          </>
        ) : (
          /* Side by side mode */
          <div className="grid grid-cols-2 w-full h-full divide-x divide-[#20352B]">
            <div className="relative w-full h-full flex items-center justify-center bg-black/30">
              <img src={originalImage} alt="Before" className="max-w-full max-h-full object-contain" />
              <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 rounded text-[9px] font-bold text-white">
                ORIGINAL
              </span>
            </div>
            <div className="relative w-full h-full flex items-center justify-center bg-black/30">
              <canvas ref={gradedCanvasRef} className="max-w-full max-h-full object-contain" />
              <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 rounded text-[9px] font-bold text-[#00E987]">
                GRADED
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
