import React, { useState, useRef, useEffect, useMemo } from "react";
import { Columns, MoveHorizontal, Eye, Pin, PinOff, Camera, Download, Check } from "lucide-react";
import { usePillIndicator } from "../hooks/usePillIndicator";
import { prepareGrade, gradeRGB, applyLogInputRGB } from "../utils/gradeEngine";
import VideoGLCanvas from "./VideoGLCanvas";
import ImageGLCanvas from "./ImageGLCanvas";

const PREVIEW_MODES = [
  { id: "split", label: "Split Slider" },
  { id: "side", label: "Side by Side" },
  { id: "result", label: "Split Result" },
];

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
  simulateLogInput = false,
  onToggleSimulateLogInput,
  footer = null,
}) {
  const [splitPos, setSplitPos] = useState(50); // percentage 0..100
  const [isHoldingBefore, setIsHoldingBefore] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState("png");
  const [exportQuality, setExportQuality] = useState(95);
  const [exportLayout, setExportLayout] = useState("graded");
  const [savedLabel, setSavedLabel] = useState("");
  const exportPopoverRef = useRef(null);
  const savedTimerRef = useRef(null);
  const [pixelReadout, setPixelReadout] = useState(null);
  const containerRef = useRef(null);
  const mediaBoxRef = useRef(null);
  const [mediaBox, setMediaBox] = useState(null);
  const sampleBufferRef = useRef({ data: null, w: 0, h: 0 });
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

  const preparedGrade = useMemo(
    () => (gradingParams ? prepareGrade(gradingParams) : null),
    [gradingParams]
  );

  // Build lightweight <=240px CPU pixel buffer for zero-stall hover RGB/IRE readout
  useEffect(() => {
    if (videoEl) {
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d", { willReadFrequently: true });
      const syncVideoSample = () => {
        if (!videoEl.paused || videoEl.readyState < 2 || !videoEl.videoWidth) return;
        const scale = Math.min(1, 240 / Math.max(videoEl.videoWidth, videoEl.videoHeight));
        const w = Math.max(1, Math.round(videoEl.videoWidth * scale));
        const h = Math.max(1, Math.round(videoEl.videoHeight * scale));
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
        try {
          ctx.drawImage(videoEl, 0, 0, w, h);
          sampleBufferRef.current = { data: ctx.getImageData(0, 0, w, h).data, w, h };
        } catch {
          // frame not ready
        }
      };
      syncVideoSample();
      videoEl.addEventListener("loadeddata", syncVideoSample);
      videoEl.addEventListener("seeked", syncVideoSample);
      videoEl.addEventListener("pause", syncVideoSample);
      return () => {
        videoEl.removeEventListener("loadeddata", syncVideoSample);
        videoEl.removeEventListener("seeked", syncVideoSample);
        videoEl.removeEventListener("pause", syncVideoSample);
      };
    }

    if (!originalImage) {
      sampleBufferRef.current = { data: null, w: 0, h: 0 };
      return undefined;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const scale = Math.min(1, 240 / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      sampleBufferRef.current = { data: ctx.getImageData(0, 0, w, h).data, w, h };
    };
    img.src = originalImage;
    return () => {
      cancelled = true;
    };
  }, [originalImage, videoEl]);

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

  const handlePointerSample = (clientX, clientY) => {
    const buf = sampleBufferRef.current;
    if (!hasImage || !containerRef.current || mode === "side" || !buf.data || !buf.w || !buf.h) {
      setPixelReadout(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const srcW = buf.w;
    const srcH = buf.h;
    if (rect.width <= 0 || rect.height <= 0) return;

    // Compute object-contain rendered box inside containerRef
    const containerAspect = rect.width / rect.height;
    const mediaAspect = srcW / srcH;
    let renderW = rect.width;
    let renderH = rect.height;
    let offsetX = 0;
    let offsetY = 0;
    if (mediaAspect > containerAspect) {
      renderH = rect.width / mediaAspect;
      offsetY = (rect.height - renderH) / 2;
    } else {
      renderW = rect.height * mediaAspect;
      offsetX = (rect.width - renderW) / 2;
    }

    const relX = clientX - rect.left - offsetX;
    const relY = clientY - rect.top - offsetY;
    if (relX < 0 || relY < 0 || relX > renderW || relY > renderH) {
      setPixelReadout(null);
      return;
    }

    const sx = Math.min(srcW - 1, Math.max(0, Math.floor((relX / renderW) * srcW)));
    const sy = Math.min(srcH - 1, Math.max(0, Math.floor((relY / renderH) * srcH)));
    const idx = (sy * srcW + sx) * 4;
    const r = buf.data[idx];
    const g = buf.data[idx + 1];
    const b = buf.data[idx + 2];

    const beforeIre = Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) / 2.55);
    let gr = r;
    let gg = g;
    let gb = b;
    if (preparedGrade) {
      let inR = r / 255;
      let inG = g / 255;
      let inB = b / 255;
      if (simulateLogInput) {
        const logOut = [0, 0, 0];
        applyLogInputRGB(inR, inG, inB, logOut);
        inR = logOut[0];
        inG = logOut[1];
        inB = logOut[2];
      }
      const out = [0, 0, 0];
      gradeRGB(preparedGrade, inR, inG, inB, out);
      gr = Math.round(Math.max(0, Math.min(255, out[0] * 255)));
      gg = Math.round(Math.max(0, Math.min(255, out[1] * 255)));
      gb = Math.round(Math.max(0, Math.min(255, out[2] * 255)));
    }
    const gradedIre = Math.round((0.2126 * gr + 0.7152 * gg + 0.0722 * gb) / 2.55);
    setPixelReadout({ r, g, b, beforeIre, gr, gg, gb, gradedIre });
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
    if (mode !== "split" || !hasImage || isHoldingBefore) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
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
      handlePointerSample(e.clientX, e.clientY);
    }
  };

  const handleSplitPointerEnd = (e) => {
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

  // Close Save Image popover on outside click or Escape
  useEffect(() => {
    if (!isExportOpen) return undefined;
    const onPointerDown = (e) => {
      if (exportPopoverRef.current && !exportPopoverRef.current.contains(e.target)) {
        setIsExportOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setIsExportOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isExportOpen]);

  const cleanExportBase =
    String(targetBaseName || "Target")
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "Target";
  const previewExportFilename = `${cleanExportBase}-${
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
          {/* Mobile Sticky Pin Toggle */}
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

          {/* Save Graded Image Popover (PNG, JPG, WEBP & Split) */}
          {hasImage && onSaveImage && (
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

              {isExportOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-black/65 sm:hidden"
                    onClick={() => setIsExportOpen(false)}
                  />
                  <div className="fixed inset-x-3 top-1/2 -translate-y-1/2 max-w-[400px] mx-auto z-50 sm:inset-auto sm:translate-y-0 sm:right-0 sm:top-full sm:mt-2 sm:w-72 rounded-xl bg-[#131419] border border-white/[0.16] shadow-2xl p-3 space-y-2.5 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#9CA3AF]">
                      Export Native Resolution
                    </span>
                    {nativeWidth > 0 && nativeHeight > 0 && (
                      <span className="text-[10px] font-mono text-[#E2E4E9]">
                        {nativeWidth} x {nativeHeight} px
                      </span>
                    )}
                  </div>

                  {/* 1. Format Selector */}
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

                  {/* 2. Quality Slider (JPG / WEBP only) */}
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

                  {/* 3. Layout Output Toggle */}
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

                  {/* 4. Filename Preview */}
                  <div className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.07] text-[10px] font-mono text-[#9CA3AF] truncate">
                    {previewExportFilename}
                  </div>

                  {/* 5. Download Action with In-Button Morph */}
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
                </>
              )}
            </div>
          )}

          {/* Simulate Log Input Checkbox (Preview-Only, Never Exported to .kfplug) */}
          {hasImage && onToggleSimulateLogInput && (
            <label
              title="Preview grade on simulated flat Log footage without changing the exported .kfplug"
              className={`m3-btn-morph inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium border cursor-pointer select-none ${
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
              <span>Simulate Log Input</span>
            </label>
          )}

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
              className={`m3-btn-morph inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer select-none ${
                isHoldingBefore
                  ? "bg-[#E2E4E9] text-[#0E0E11] border-[#E2E4E9]"
                  : "bg-white/[0.04] text-[#9CA3AF] hover:text-[#E2E4E9] border-white/[0.09]"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Hold Before</span>
            </button>
          )}

          {/* Mode Selector Segmented Pill with Shared-Element Liquid Stretch (Zero Nested Backdrop Blur) */}
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

      {/* Preview Viewport (Stretches to align bottom edge flush with right column) */}
      <div
        ref={containerRef}
        onPointerDown={handleSplitPointerDown}
        onPointerMove={handleSplitPointerMove}
        onPointerUp={handleSplitPointerEnd}
        onPointerCancel={handleSplitPointerEnd}
        onPointerLeave={() => setPixelReadout(null)}
        style={mode === "split" && hasImage ? { touchAction: "none", userSelect: "none" } : undefined}
        className={`relative w-full flex-1 ${
          isPinned ? "h-[30vh] min-h-[200px] max-h-[245px]" : "min-h-[210px]"
        } lg:h-auto lg:min-h-[300px] lg:max-h-none rounded-lg bg-[#0A0A0D]/38 border border-white/[0.09] overflow-hidden flex items-center justify-center select-none ${
          mode === "split" && hasImage ? "cursor-ew-resize touch-none" : ""
        }`}
      >
        {!hasImage ? (
          <div className="text-center p-6 text-[#9CA3AF]/60 text-xs">
            Load a Reference or Target image above to inspect Before / After grading
          </div>
        ) : videoEl || (useWebGLPhoto && imageEl) ? (
          /* Single-pass WebGL fragment-shader preview for video & photo (identical grading to .kfplug) */
          <div className="relative w-full h-full flex items-center justify-center">
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
              {videoEl ? (
                <VideoGLCanvas
                  videoEl={videoEl}
                  params={gradingParams}
                  mode={mode}
                  splitPos={splitPos}
                  hold={isHoldingBefore}
                  simulateLogInput={simulateLogInput}
                  previewRef={activeGLRef}
                  onError={onVideoError}
                  className="w-full h-full object-contain pointer-events-none"
                />
              ) : (
                <ImageGLCanvas
                  imageEl={imageEl}
                  params={gradingParams}
                  mode={mode}
                  splitPos={splitPos}
                  hold={isHoldingBefore}
                  simulateLogInput={simulateLogInput}
                  maxSide={previewMaxDim}
                  previewRef={activeGLRef}
                  onError={onWebGLPhotoError}
                  className="w-full h-full object-contain pointer-events-none"
                />
              )}

              {mode === "split" && !isHoldingBefore && (
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
              )}

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
            </div>
          </div>
        ) : mode === "side" ? (
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
            <span className="absolute top-3 right-3 bg-[#1E1E24]/90 lg:backdrop-blur-md text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded text-[#E2E4E9] border border-white/15">
              {isHoldingBefore ? "BEFORE (PEEK)" : "GRADED RESULT"}
            </span>
          </div>
        ) : (
          /* Interactive Split Slider Mode (0px offset: wrapped to exact mediaBox) */
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
              {/* Layer 1: Graded After Canvas (Full Width underneath) */}
              <canvas
                ref={gradedCanvasRef}
                className="w-full h-full object-contain pointer-events-none"
              />

              {/* Layer 2: Original Before Image (Clipped to left side, or 100% when holding before) */}
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

              {/* Divider Line & Handle */}
              {!isHoldingBefore && (
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
              )}

              {/* Corner Badges */}
              <span className="absolute top-2.5 left-2.5 bg-[#151519]/90 lg:backdrop-blur-md text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded text-[#9CA3AF] border border-white/[0.08] pointer-events-none">
                {isHoldingBefore ? "BEFORE (HOLD PEEK)" : "BEFORE"}
              </span>
              {!isHoldingBefore && (
                <span className="absolute top-2.5 right-2.5 bg-[#1E1E24]/90 lg:backdrop-blur-md text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded text-[#E2E4E9] border border-white/15 pointer-events-none">
                  GRADED
                </span>
              )}
            </div>
          </div>
        )}

        {/* Hover Pixel Readout (RGB & IRE) */}
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
