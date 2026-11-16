import React, { useState, useRef, useEffect } from "react";
import { Columns, MoveHorizontal, Eye, Pin, PinOff, Pipette, ScanEye } from "lucide-react";
import { usePillIndicator } from "../hooks/usePillIndicator";
import { usePixelReadout } from "../hooks/usePixelReadout";
import WebGLPreviewCanvas from "./WebGLPreviewCanvas";
import SaveImagePopover from "./SaveImagePopover";

const PREVIEW_MODES = [
  { id: "split", label: "Split Slider" },
  { id: "side", label: "Side by Side" },
  { id: "result", label: "Graded Only" },
];

const MONITOR_MODES = [
  { id: "off", label: "Off" },
  { id: "zebra", label: "Zebra" },
  { id: "falsecolor", label: "IRE" },
];

function SplitDivider({ splitPos, splitLineWrapperRef, splitHandleRef }) {
  return (
    <div
      ref={splitLineWrapperRef}
      className="pointer-events-none absolute inset-0 overflow-visible touch-none select-none"
      style={{ transform: `translate3d(${splitPos}%, 0, 0)` }}
    >
      <div className="absolute top-0 bottom-0 left-0 w-0.5 -translate-x-1/2 bg-[#E2E4E9] shadow-[0_0_8px_rgba(0,0,0,0.8)]">
        <div
          ref={splitHandleRef}
          className="absolute top-1/2 left-1/2 w-7 h-7 rounded-full bg-[#1E1E24] border border-[#E2E4E9] flex items-center justify-center shadow-lg transition-transform duration-100"
          style={{ transform: "translate(-50%, -50%) scale(1)" }}
        >
          <MoveHorizontal className="w-3.5 h-3.5 text-[#E2E4E9]" />
        </div>
      </div>
    </div>
  );
}

function CornerBadges({ mode, isHoldingBefore }) {
  return (
    <>
      {mode !== "result" && (
        <span className="absolute top-2.5 left-2.5 bg-[#151519]/90 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded text-[#9CA3AF] border border-white/[0.08] pointer-events-none">
          {isHoldingBefore ? "BEFORE (HOLD PEEK)" : "BEFORE"}
        </span>
      )}
      {!isHoldingBefore && (
        <span className="absolute top-2.5 right-2.5 bg-[#1E1E24]/90 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded text-[#E2E4E9] border border-white/15 pointer-events-none">
          {mode === "result" ? "GRADED RESULT" : mode === "side" ? "AFTER" : "GRADED"}
        </span>
      )}
    </>
  );
}

export default function ComparisonSlider({
  originalImage,
  imageEl = null,
  gradedCanvasRef,
  glPreviewRef = null,
  useWebGLPhoto = false,
  previewMaxDim = 960,
  onWebGLPhotoError,
  hasImage,
  mode = "split",
  onModeChange,
  videoEl = null,
  gradingParams,
  onVideoError,
  onSplitDragChange,
  isPinned = true,
  onTogglePin,
  onSaveImage,
  isSavingImage = false,
  nativeWidth = 0,
  nativeHeight = 0,
  targetBaseName = "Target",
  engineId = "v3",
  simulateLogInput = false,
  onToggleSimulateLogInput,
  isTabActive = true,
  footer = null,
}) {
  const [splitPos, setSplitPos] = useState(50);
  const [isHoldingBefore, setIsHoldingBefore] = useState(false);
  const [isContextLost, setIsContextLost] = useState(false);
  const [monitorMode, setMonitorMode] = useState("off");
  const [isEyedropperActive, setIsEyedropperActive] = useState(false);
  const isEyedropperDraggingRef = useRef(false);
  const containerRef = useRef(null);
  const mediaBoxRef = useRef(null);
  const [mediaBox, setMediaBox] = useState(null);
  const splitRafRef = useRef(0);
  const pendingSplitXRef = useRef(null);
  const isDraggingSplitRef = useRef(false);
  const splitPosRef = useRef(50);
  const splitLineWrapperRef = useRef(null);
  const splitHandleRef = useRef(null);
  const cpuClipRef = useRef(null);
  const internalGLRef = useRef(null);
  const activeGLRef = glPreviewRef || internalGLRef;
  const onSplitDragChangeRef = useRef(onSplitDragChange);
  onSplitDragChangeRef.current = onSplitDragChange;

  const { pixelReadout, samplePixelAt, clearPixelReadout } = usePixelReadout({
    hasImage,
    mode,
    imageEl,
    videoEl,
    containerRef,
    gradingParams,
    simulateLogInput,
  });

  const {
    containerRef: modeContainerRef,
    registerTabRef: registerModeTabRef,
    pillStyle: modePillStyle,
  } = usePillIndicator(mode);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !nativeWidth || !nativeHeight || mode === "side") {
      setMediaBox(null);
      return undefined;
    }
    const computeBox = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const containerAspect = rect.width / rect.height;
      const mediaAspect = nativeWidth / nativeHeight;
      let w = rect.width;
      let h = rect.height;
      if (mediaAspect > containerAspect) {
        h = rect.width / mediaAspect;
      } else {
        w = rect.height * mediaAspect;
      }
      setMediaBox({ width: Math.round(w), height: Math.round(h) });
    };
    computeBox();
    const ro = new ResizeObserver(computeBox);
    ro.observe(el);
    return () => ro.disconnect();
  }, [nativeWidth, nativeHeight, isPinned, mode]);

  const applySplitPositionDirect = (clientX) => {
    const targetEl = (mode === "split" && mediaBoxRef.current) || containerRef.current;
    if (!targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    let pct = (x / rect.width) * 100;
    if (pct >= 48.2 && pct <= 51.8) {
      pct = 50;
    }
    splitPosRef.current = pct;
    if (splitLineWrapperRef.current) {
      splitLineWrapperRef.current.style.transform = `translate3d(${pct}%, 0, 0)`;
    }
    if (cpuClipRef.current) {
      cpuClipRef.current.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    }
    activeGLRef.current?.setSplitPos?.(pct);
  };

  useEffect(
    () => () => {
      if (splitRafRef.current) {
        cancelAnimationFrame(splitRafRef.current);
        splitRafRef.current = 0;
      }
      if (isDraggingSplitRef.current) {
        isDraggingSplitRef.current = false;
        onSplitDragChangeRef.current?.(false);
      }
    },
    []
  );

  const handleSplitPointerDown = (e) => {
    if (!hasImage || isHoldingBefore) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    if (isEyedropperActive && e.pointerType !== "mouse" && mode !== "side") {
      e.preventDefault();
      isEyedropperDraggingRef.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      samplePixelAt(e.clientX, e.clientY);
      return;
    }

    if (mode !== "split") return;

    // On touch, only start split-drag when touching near the center handle/divider line
    // so touching anywhere else on the image scrolls the page naturally.
    if (e.pointerType === "touch") {
      const targetEl = mediaBoxRef.current || containerRef.current;
      if (!targetEl) return;
      const rect = targetEl.getBoundingClientRect();
      const dividerX = rect.left + (splitPosRef.current / 100) * rect.width;
      if (Math.abs(e.clientX - dividerX) > 32) {
        return;
      }
    }

    e.preventDefault();
    isDraggingSplitRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable
    }
    if (splitHandleRef.current) {
      splitHandleRef.current.style.transform = "translate(-50%, -50%) scale(1.1)";
    }
    onSplitDragChangeRef.current?.(true);
    applySplitPositionDirect(e.clientX);
  };

  const handleSplitPointerMove = (e) => {
    if (isEyedropperDraggingRef.current) {
      samplePixelAt(e.clientX, e.clientY);
      return;
    }
    if (isDraggingSplitRef.current) {
      pendingSplitXRef.current = e.clientX;
      if (!splitRafRef.current) {
        splitRafRef.current = requestAnimationFrame(() => {
          splitRafRef.current = 0;
          if (pendingSplitXRef.current !== null) {
            const x = pendingSplitXRef.current;
            pendingSplitXRef.current = null;
            applySplitPositionDirect(x);
          }
        });
      }
      return;
    }
    if (e.pointerType === "mouse") {
      samplePixelAt(e.clientX, e.clientY);
    }
  };

  const handleSplitPointerEnd = (e) => {
    if (isEyedropperDraggingRef.current) {
      isEyedropperDraggingRef.current = false;
      try {
        if (e?.currentTarget?.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
      return;
    }
    if (!isDraggingSplitRef.current) return;
    if (splitRafRef.current) {
      cancelAnimationFrame(splitRafRef.current);
      splitRafRef.current = 0;
    }
    if (pendingSplitXRef.current !== null) {
      const x = pendingSplitXRef.current;
      pendingSplitXRef.current = null;
      applySplitPositionDirect(x);
    }
    isDraggingSplitRef.current = false;
    try {
      if (e?.currentTarget?.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
    if (splitHandleRef.current) {
      splitHandleRef.current.style.transform = "translate(-50%, -50%) scale(1)";
    }
    setSplitPos(splitPosRef.current);
    onSplitDragChangeRef.current?.(false);
  };

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

  const canUseWebGL = Boolean(videoEl || (useWebGLPhoto && imageEl));
  const showWebGL = canUseWebGL && !isContextLost;

  return (
    <div className="m3-panel !bg-[#121216] lg:!bg-transparent rounded-2xl p-2.5 lg:p-3.5 flex-1 flex flex-col">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <Columns className="w-3.5 h-3.5 text-[#9CA3AF]" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">
            VISUAL PREVIEW
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onTogglePin && (
            <button
              type="button"
              onClick={onTogglePin}
              title={isPinned ? "Unpin sticky preview on mobile" : "Pin preview to top on mobile"}
              className={`lg:hidden m3-btn-morph inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border cursor-pointer select-none ${
                isPinned
                  ? "bg-white/[0.12] text-[#F4F5F7] border-white/25"
                  : "bg-white/[0.04] text-[#9CA3AF] hover:text-[#E2E4E9] border-white/[0.09]"
              }`}
            >
              {isPinned ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
              <span>{isPinned ? "Pinned" : "Pin"}</span>
            </button>
          )}

          {hasImage && onSaveImage && (
            <SaveImagePopover
              onSaveImage={onSaveImage}
              isSavingImage={isSavingImage}
              nativeWidth={nativeWidth}
              nativeHeight={nativeHeight}
              targetBaseName={targetBaseName}
              engineId={engineId}
              splitPos={splitPos}
            />
          )}

          {hasImage && showWebGL && (
            <div
              title="WebGL Monitoring Overlay (Preview Only)"
              className="inline-flex items-center gap-0.5 bg-[#0A0A0D]/55 border border-white/[0.09] rounded-lg p-0.5 text-[10px] font-mono"
            >
              <ScanEye className="w-3 h-3 text-[#9CA3AF] mx-1 shrink-0 hidden sm:block" />
              {MONITOR_MODES.map((mm) => (
                <button
                  key={mm.id}
                  type="button"
                  onClick={() => setMonitorMode(mm.id)}
                  className={`px-1.5 py-0.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    monitorMode === mm.id
                      ? mm.id === "off"
                        ? "bg-white/[0.14] text-[#F4F5F7] font-semibold"
                        : "bg-[#6EE7B7]/20 text-[#6EE7B7] font-semibold"
                      : "text-[#9CA3AF] hover:text-[#E2E4E9]"
                  }`}
                >
                  {mm.label}
                </button>
              ))}
            </div>
          )}

          {hasImage && mode !== "side" && (
            <button
              type="button"
              onClick={() => {
                setIsEyedropperActive((v) => {
                  if (v) clearPixelReadout();
                  return !v;
                });
              }}
              aria-pressed={isEyedropperActive}
              title="Touch Eyedropper: tap or drag on preview to inspect RGB / IRE"
              className={`lg:hidden m3-btn-morph inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border cursor-pointer select-none ${
                isEyedropperActive
                  ? "bg-[#6EE7B7]/20 text-[#6EE7B7] border-[#6EE7B7]/40"
                  : "bg-white/[0.04] hover:bg-white/[0.08] text-[#9CA3AF] hover:text-[#E2E4E9] border-white/[0.09]"
              }`}
            >
              <Pipette className="w-3 h-3" />
              <span>RGB</span>
            </button>
          )}

          {hasImage && onToggleSimulateLogInput && (
            <label
              title="Preview grade on simulated flat Log footage without changing the exported .kfplug"
              className={`m3-btn-morph inline-flex items-center gap-1 sm:gap-1.5 px-2 py-1 rounded-lg text-[10px] sm:text-[11px] font-medium border cursor-pointer select-none ${
                simulateLogInput
                  ? "bg-white/[0.12] text-[#F4F5F7] border-white/25"
                  : "bg-white/[0.04] hover:bg-white/[0.08] text-[#9CA3AF] hover:text-[#E2E4E9] border-white/[0.09]"
              }`}
            >
              <input
                type="checkbox"
                checked={simulateLogInput}
                onChange={(e) => onToggleSimulateLogInput(e.target.checked)}
                className="w-3 h-3 accent-[#E2E4E9] rounded cursor-pointer"
              />
              <span className="whitespace-nowrap">Log Input</span>
            </label>
          )}

          {hasImage && (
            <button
              type="button"
              onMouseDown={() => setIsHoldingBefore(true)}
              onMouseUp={() => setIsHoldingBefore(false)}
              onMouseLeave={() => setIsHoldingBefore(false)}
              onTouchStart={() => setIsHoldingBefore(true)}
              onTouchEnd={() => setIsHoldingBefore(false)}
              onTouchCancel={() => setIsHoldingBefore(false)}
              onContextMenu={(e) => e.preventDefault()}
              title="Hold to peek at original ungraded image (Shortcut: Hold \)"
              className={`m3-btn-morph inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-medium border cursor-pointer select-none ${
                isHoldingBefore
                  ? "bg-[#E2E4E9] text-[#0E0E11] border-[#E2E4E9]"
                  : "bg-white/[0.04] text-[#9CA3AF] hover:text-[#E2E4E9] border-white/[0.09]"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="whitespace-nowrap">Hold Before</span>
            </button>
          )}

          <div
            ref={modeContainerRef}
            className="relative flex items-center gap-0.5 bg-[#0A0A0D]/55 border border-white/[0.09] rounded-xl p-0.5 text-xs"
          >
            <div
              aria-hidden="true"
              className="m3-pill-indicator pointer-events-none absolute top-0.5 bottom-0.5 rounded-lg bg-[#E2E4E9] shadow-[0_2px_10px_rgba(255,255,255,0.22),inset_0_1px_0_rgba(255,255,255,0.7)]"
              style={{
                left: `${modePillStyle.left}px`,
                width: `${modePillStyle.width}px`,
                opacity: modePillStyle.opacity,
              }}
            />
            {PREVIEW_MODES.map((m) => (
              <button
                key={m.id}
                ref={registerModeTabRef(m.id)}
                type="button"
                onClick={() => onModeChange && onModeChange(m.id)}
                className={`relative z-10 px-2.5 py-1 rounded-lg font-medium transition-colors duration-200 active:scale-[0.96] cursor-pointer whitespace-nowrap ${
                  mode === m.id
                    ? "text-[#0E0E11] font-semibold"
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
        onPointerDown={handleSplitPointerDown}
        onPointerMove={handleSplitPointerMove}
        onPointerUp={handleSplitPointerEnd}
        onPointerCancel={handleSplitPointerEnd}
        onPointerLeave={clearPixelReadout}
        style={
          isEyedropperActive && hasImage
            ? { touchAction: "none", userSelect: "none" }
            : mode === "split" && hasImage
            ? { touchAction: "pan-y", userSelect: "none" }
            : undefined
        }
        className={`relative w-full flex-1 ${
          isPinned ? "h-[30vh] min-h-[200px] max-h-[245px]" : "min-h-[210px]"
        } lg:h-auto lg:min-h-[300px] lg:max-h-none rounded-lg bg-[#0A0A0D]/38 border border-white/[0.09] overflow-hidden flex items-center justify-center select-none ${
          isEyedropperActive && hasImage
            ? "cursor-crosshair touch-none"
            : mode === "split" && hasImage
            ? "cursor-ew-resize touch-pan-y"
            : ""
        }`}
      >
        {!hasImage ? (
          <div className="text-center p-6 text-[#9CA3AF]/60 text-xs">
            Load a Reference or Target image above to inspect Before / After grading
          </div>
        ) : (
          <>
            {canUseWebGL && (
              <div
                className={
                  showWebGL
                    ? "relative w-full h-full flex items-center justify-center"
                    : "hidden"
                }
              >
                <div
                  ref={mode === "split" ? mediaBoxRef : undefined}
                  style={
                    mode !== "side" && mediaBox
                      ? { width: `${mediaBox.width}px`, height: `${mediaBox.height}px` }
                      : undefined
                  }
                  className={`relative flex items-center justify-center shrink-0 ${
                    mode !== "side" && mediaBox ? "" : "w-full h-full"
                  }`}
                >
                  <WebGLPreviewCanvas
                    videoEl={videoEl}
                    imageEl={imageEl}
                    params={gradingParams}
                    mode={mode}
                    splitPos={splitPos}
                    hold={isHoldingBefore}
                    simulateLogInput={simulateLogInput}
                    monitorMode={monitorMode}
                    maxSide={videoEl ? 0 : previewMaxDim}
                    previewRef={activeGLRef}
                    onError={videoEl ? onVideoError : onWebGLPhotoError}
                    onContextLost={() => setIsContextLost(true)}
                    onContextRestored={() => setIsContextLost(false)}
                    isActive={isTabActive}
                    className="w-full h-full object-contain pointer-events-none"
                  />

                  {mode === "split" && !isHoldingBefore && (
                    <SplitDivider
                      splitPos={splitPos}
                      splitLineWrapperRef={splitLineWrapperRef}
                      splitHandleRef={splitHandleRef}
                    />
                  )}
                  <CornerBadges mode={mode} isHoldingBefore={isHoldingBefore} />
                </div>
              </div>
            )}

            {!showWebGL && (
              mode === "side" ? (
                <div className="grid grid-cols-2 gap-1.5 w-full h-full min-h-[240px] sm:min-h-[280px] p-2 items-center">
                  <div className="relative h-full flex items-center justify-center bg-black/40 rounded-md overflow-hidden border border-white/[0.06]">
                    <img
                      src={originalImage}
                      alt="Before"
                      className="w-full h-full max-h-[360px] object-contain"
                    />
                    <span className="absolute top-2 left-2 bg-[#151519]/90 lg:backdrop-blur-md text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded text-[#9CA3AF] border border-white/[0.08]">
                      BEFORE
                    </span>
                  </div>
                  <div className="relative h-full flex items-center justify-center bg-black/40 rounded-md overflow-hidden border border-white/[0.06]">
                    <canvas
                      ref={gradedCanvasRef}
                      className={`w-full h-full max-h-[360px] object-contain ${
                        isHoldingBefore ? "hidden" : "block"
                      }`}
                    />
                    {isHoldingBefore && (
                      <img
                        src={originalImage}
                        alt="Before Peek"
                        className="w-full h-full max-h-[360px] object-contain"
                      />
                    )}
                    <span className="absolute top-2 right-2 bg-[#1E1E24]/90 lg:backdrop-blur-md text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded text-[#E2E4E9] border border-white/15">
                      {isHoldingBefore ? "BEFORE (PEEK)" : "AFTER"}
                    </span>
                  </div>
                </div>
              ) : mode === "result" ? (
                <div className="relative w-full h-full min-h-[240px] sm:min-h-[280px] flex items-center justify-center p-2">
                  <canvas
                    ref={gradedCanvasRef}
                    className={`w-full h-full max-h-[360px] object-contain rounded ${
                      isHoldingBefore ? "hidden" : "block"
                    }`}
                  />
                  {isHoldingBefore && (
                    <img
                      src={originalImage}
                      alt="Before Peek"
                      className="w-full h-full max-h-[360px] object-contain rounded"
                    />
                  )}
                  <CornerBadges mode="result" isHoldingBefore={isHoldingBefore} />
                </div>
              ) : (
                <div className="relative w-full h-full flex items-center justify-center">
                  <div
                    ref={mediaBoxRef}
                    style={
                      mediaBox
                        ? { width: `${mediaBox.width}px`, height: `${mediaBox.height}px` }
                        : undefined
                    }
                    className={`relative flex items-center justify-center shrink-0 ${
                      mediaBox ? "" : "w-full h-full"
                    }`}
                  >
                    <canvas
                      ref={gradedCanvasRef}
                      className="w-full h-full object-contain pointer-events-none"
                    />
                    <div
                      ref={cpuClipRef}
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
                    {!isHoldingBefore && (
                      <SplitDivider
                        splitPos={splitPos}
                        splitLineWrapperRef={splitLineWrapperRef}
                        splitHandleRef={splitHandleRef}
                      />
                    )}
                    <CornerBadges mode="split" isHoldingBefore={isHoldingBefore} />
                  </div>
                </div>
              )
            )}
          </>
        )}

        {pixelReadout && hasImage && mode !== "side" && (
          <div className="pointer-events-none absolute bottom-2 left-2 z-20 px-2 py-1 rounded-md bg-[#0E0E12]/88 border border-white/[0.12] text-[10px] font-mono tabular-nums text-[#E2E4E9] flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[#9CA3AF]">
              BEFORE {pixelReadout.r}/{pixelReadout.g}/{pixelReadout.b} ({pixelReadout.beforeIre} IRE)
            </span>
            <span className="text-white/25">|</span>
            <span className="text-[#6EE7B7]">
              GRADED {pixelReadout.gr}/{pixelReadout.gg}/{pixelReadout.gb} ({pixelReadout.gradedIre} IRE)
            </span>
          </div>
        )}
      </div>
      {footer}
    </div>
  );
}
