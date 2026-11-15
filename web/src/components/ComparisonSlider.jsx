import React, { useState, useRef, useEffect } from "react";
import { Columns, MoveHorizontal, Eye } from "lucide-react";

export default function ComparisonSlider({
  originalImage,
  gradedCanvasRef,
  hasImage,
  mode = "split",
  onModeChange,
}) {
  const [splitPos, setSplitPos] = useState(50); // percentage 0..100
  const [isDragging, setIsDragging] = useState(false);
  const [isHoldingBefore, setIsHoldingBefore] = useState(false);
  const containerRef = useRef(null);

  const updatePosition = (clientX) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSplitPos((x / rect.width) * 100);
  };

  useEffect(() => {
    const handleMouseUp = () => setIsDragging(false);
    const handleMouseMove = (e) => {
      if (isDragging) updatePosition(e.clientX);
    };
    const handleTouchMove = (e) => {
      if (isDragging && e.touches?.[0]) {
        updatePosition(e.touches[0].clientX);
      }
    };

    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchend", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });

    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchend", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [isDragging]);

  // Keyboard shortcut: hold '\' to peek at Before image
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "\\") {
        setIsHoldingBefore(true);
      }
    };
    const handleKeyUp = (e) => {
      if (e.key === "\\") {
        setIsHoldingBefore(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return (
    <div className="m3-panel rounded-2xl p-3.5">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <Columns className="w-3.5 h-3.5 text-[#9CA3AF]" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">
            VISUAL PREVIEW
          </h3>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Hold Before Peek Button */}
          {hasImage && (
            <button
              type="button"
              onMouseDown={() => setIsHoldingBefore(true)}
              onMouseUp={() => setIsHoldingBefore(false)}
              onMouseLeave={() => setIsHoldingBefore(false)}
              onTouchStart={() => setIsHoldingBefore(true)}
              onTouchEnd={() => setIsHoldingBefore(false)}
              title="Hold to peek at original ungraded image (Shortcut: Hold \)"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer select-none ${
                isHoldingBefore
                  ? "bg-[#E2E4E9] text-[#0E0E11] border-[#E2E4E9]"
                  : "bg-[#1E1E24] text-[#9CA3AF] hover:text-[#E2E4E9] border-white/[0.08]"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Hold Before</span>
            </button>
          )}

          {/* Mode Selector Segmented Pill */}
          <div className="flex items-center bg-[#0E0E11] border border-white/[0.08] rounded-lg p-0.5 text-xs">
            {[
              { id: "split", label: "Split Slider" },
              { id: "side", label: "Side by Side" },
              { id: "result", label: "Split Result" },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onModeChange && onModeChange(m.id)}
                className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                  mode === m.id
                    ? "bg-[#E2E4E9] text-[#0E0E11] font-semibold"
                    : "text-[#9CA3AF] hover:text-[#E2E4E9]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Preview Viewport */}
      <div
        ref={containerRef}
        onMouseDown={(e) => {
          if (mode === "split" && hasImage && !isHoldingBefore) {
            setIsDragging(true);
            updatePosition(e.clientX);
          }
        }}
        onTouchStart={(e) => {
          if (mode === "split" && hasImage && !isHoldingBefore && e.touches?.[0]) {
            setIsDragging(true);
            updatePosition(e.touches[0].clientX);
          }
        }}
        className={`relative w-full min-h-[220px] sm:min-h-[270px] rounded-lg bg-[#0E0E11] border border-white/[0.08] overflow-hidden flex items-center justify-center select-none ${
          mode === "split" && hasImage ? "cursor-ew-resize" : ""
        }`}
      >
        {!hasImage ? (
          <div className="text-center p-6 text-[#9CA3AF]/60 text-xs">
            Load a Reference or Target image above to inspect Before / After grading
          </div>
        ) : mode === "side" ? (
          <div className="grid grid-cols-2 gap-1.5 w-full h-[250px] sm:h-[290px] p-2 items-center">
            <div className="relative h-full flex items-center justify-center bg-black/40 rounded-md overflow-hidden border border-white/[0.06]">
              <img
                src={originalImage}
                alt="Before"
                className="w-full h-full object-contain"
              />
              <span className="absolute top-2 left-2 bg-[#151519]/90 backdrop-blur-md text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded text-[#9CA3AF] border border-white/[0.08]">
                BEFORE
              </span>
            </div>
            <div className="relative h-full flex items-center justify-center bg-black/40 rounded-md overflow-hidden border border-white/[0.06]">
              <canvas
                ref={gradedCanvasRef}
                className={`w-full h-full object-contain ${isHoldingBefore ? "hidden" : "block"}`}
              />
              {isHoldingBefore && (
                <img
                  src={originalImage}
                  alt="Before Peek"
                  className="w-full h-full object-contain"
                />
              )}
              <span className="absolute top-2 right-2 bg-[#1E1E24]/90 backdrop-blur-md text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded text-[#E2E4E9] border border-white/15">
                {isHoldingBefore ? "BEFORE (PEEK)" : "AFTER"}
              </span>
            </div>
          </div>
        ) : mode === "result" ? (
          <div className="relative w-full h-[250px] sm:h-[290px] flex items-center justify-center p-2">
            <canvas
              ref={gradedCanvasRef}
              className={`w-full h-full object-contain rounded ${isHoldingBefore ? "hidden" : "block"}`}
            />
            {isHoldingBefore && (
              <img
                src={originalImage}
                alt="Before Peek"
                className="w-full h-full object-contain rounded"
              />
            )}
            <span className="absolute top-3 right-3 bg-[#1E1E24]/90 backdrop-blur-md text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded text-[#E2E4E9] border border-white/15">
              {isHoldingBefore ? "BEFORE (PEEK)" : "GRADED RESULT"}
            </span>
          </div>
        ) : (
          /* Interactive Split Slider Mode */
          <div className="relative w-full h-[250px] sm:h-[290px] flex items-center justify-center">
            {/* Layer 1: Graded After Canvas (Full Width underneath) */}
            <canvas
              ref={gradedCanvasRef}
              className="w-full h-full object-contain pointer-events-none"
            />

            {/* Layer 2: Original Before Image (Clipped to left side, or 100% when holding before) */}
            <div
              className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none"
              style={{
                clipPath: `inset(0 ${isHoldingBefore ? 0 : 100 - splitPos}% 0 0)`,
              }}
            >
              <img
                src={originalImage}
                alt="Original Before"
                className="w-full h-full object-contain"
              />
            </div>

            {/* Divider Line & Handle */}
            {!isHoldingBefore && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-[#E2E4E9] shadow-[0_0_8px_rgba(0,0,0,0.8)] pointer-events-none"
                style={{ left: `${splitPos}%` }}
              >
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-[#1E1E24] border border-[#E2E4E9] flex items-center justify-center shadow-lg">
                  <MoveHorizontal className="w-3.5 h-3.5 text-[#E2E4E9]" />
                </div>
              </div>
            )}

            {/* Corner Badges */}
            <span className="absolute top-2.5 left-2.5 bg-[#151519]/90 backdrop-blur-md text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded text-[#9CA3AF] border border-white/[0.08] pointer-events-none">
              {isHoldingBefore ? "BEFORE (HOLD PEEK)" : "BEFORE"}
            </span>
            {!isHoldingBefore && (
              <span className="absolute top-2.5 right-2.5 bg-[#1E1E24]/90 backdrop-blur-md text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded text-[#E2E4E9] border border-white/15 pointer-events-none">
                GRADED
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
