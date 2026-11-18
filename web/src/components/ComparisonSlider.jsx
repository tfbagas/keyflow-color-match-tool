import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Columns,
  MoveHorizontal,
  MoveVertical,
  Eye,
  Pin,
  PinOff,
  Pipette,
  ScanEye,
  Search,
  RotateCcw,
} from "lucide-react";
import { usePillIndicator } from "../hooks/usePillIndicator";
import { usePixelReadout } from "../hooks/usePixelReadout";
import WebGLPreviewCanvas from "./WebGLPreviewCanvas";
import SaveImagePopover from "./SaveImagePopover";
import InputProfileDropdown from "./InputProfileDropdown";
import { useLanguage } from "../i18n/LanguageContext";

const LOUPE_SIZE = 132;

function SplitDivider({
  splitPos,
  splitDirection = "vertical",
  splitLineWrapperRef,
  splitHandleRef,
}) {
  const isHorizontal = splitDirection === "horizontal";
  return (
    <div
      ref={splitLineWrapperRef}
      className="pointer-events-none absolute inset-0 overflow-visible touch-none select-none z-10"
      style={{
        transform: isHorizontal
          ? `translate3d(0, ${splitPos}%, 0)`
          : `translate3d(${splitPos}%, 0, 0)`,
      }}
    >
      {isHorizontal ? (
        <div className="absolute left-0 right-0 top-0 h-0.5 -translate-y-1/2 bg-[#E2E4E9] shadow-[0_0_8px_rgba(0,0,0,0.85)]">
          <div
            ref={splitHandleRef}
            className="absolute top-1/2 left-1/2 w-7 h-7 rounded-full bg-[#16171D]/90 border border-[#E2E4E9] flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_14px_rgba(0,0,0,0.65)] transition-transform duration-150"
            style={{ transform: "translate(-50%, -50%) scale3d(1, 1, 1)" }}
          >
            <MoveVertical className="w-3.5 h-3.5 text-[#E2E4E9]" />
          </div>
        </div>
      ) : (
        <div className="absolute top-0 bottom-0 left-0 w-0.5 -translate-x-1/2 bg-[#E2E4E9] shadow-[0_0_8px_rgba(0,0,0,0.85)]">
          <div
            ref={splitHandleRef}
            className="absolute top-1/2 left-1/2 w-7 h-7 rounded-full bg-[#16171D]/90 border border-[#E2E4E9] flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_14px_rgba(0,0,0,0.65)] transition-transform duration-150"
            style={{ transform: "translate(-50%, -50%) scale3d(1, 1, 1)" }}
          >
            <MoveHorizontal className="w-3.5 h-3.5 text-[#E2E4E9]" />
          </div>
        </div>
      )}
    </div>
  );
}

function CornerBadges({ mode, isHoldingBefore, splitDirection, t }) {
  const isHorizSplit = mode === "split" && splitDirection === "horizontal";
  return (
    <>
      {mode !== "result" && (
        <span className="absolute top-2.5 left-2.5 z-10 bg-[#151519]/90 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded text-[#9CA3AF] border border-white/[0.08] pointer-events-none">
          {isHoldingBefore ? t("preview.beforeHoldPeek") : t("preview.before")}
        </span>
      )}
      {!isHoldingBefore && (
        <span
          className={`absolute ${
            isHorizSplit ? "bottom-2.5 right-2.5" : "top-2.5 right-2.5"
          } z-10 bg-[#1E1E24]/90 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded text-[#E2E4E9] border border-white/15 pointer-events-none`}
        >
          {mode === "result"
            ? t("preview.gradedResult")
            : mode === "side"
            ? t("preview.after")
            : t("preview.graded")}
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
  activeLut = null,
  lutMix = 1.0,
  onVideoError,
  onSplitDragChange,
  isPinned = true,
  onTogglePin,
  onSaveImage,
  isSavingImage = false,
  onExportVideo,
  isExportingVideo = false,
  videoExportProgress = 0,
  videoExportStatusText = "",
  onCancelVideoExport,
  targetVideoSrc = "",
  targetFile = null,
  videoDurationSec = 0,
  onTryInstantDemo,
  nativeWidth = 0,
  nativeHeight = 0,
  targetBaseName = "Target",
  engineId = "v3",
  simulateLogInput = false,
  onToggleSimulateLogInput,
  isTabActive = true,
  footer = null,
}) {
  const { t } = useLanguage();
  const [splitPos, setSplitPos] = useState(50);
  const [splitDirection, setSplitDirection] = useState("vertical");
  const [isHoldingBefore, setIsHoldingBefore] = useState(false);
  const [isContextLost, setIsContextLost] = useState(false);
  const [monitorMode, setMonitorMode] = useState("off");
  const [isEyedropperActive, setIsEyedropperActive] = useState(false);
  const [loupeZoom, setLoupeZoom] = useState(0); // 0 = Off, 2 = 2x, 4 = 4x
  const [loupePos, setLoupePos] = useState(null); // { x, y } relative to containerRef
  const [reticlePos, setReticlePos] = useState(null); // { x, y } relative to containerRef
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const previewModes = useMemo(
    () => [
      { id: "split", label: t("preview.splitSlider") },
      { id: "side", label: t("preview.sideBySide") },
      { id: "result", label: t("preview.gradedOnly") },
    ],
    [t]
  );

  const monitorModes = useMemo(
    () => [
      { id: "off", label: t("preview.off") },
      { id: "zebra", label: t("preview.zebra") },
      { id: "falsecolor", label: t("preview.ire") },
    ],
    [t]
  );

  const loupeModes = useMemo(
    () => [
      { id: 0, label: t("preview.off") },
      { id: 2, label: "2x" },
      { id: 4, label: "4x" },
    ],
    [t]
  );

  const containerRef = useRef(null);
  const mediaBoxRef = useRef(null);
  const [mediaBox, setMediaBox] = useState(null);
  const loupeCanvasRef = useRef(null);

  // Strict Multi-Touch & Pointer State Machine refs
  const activePointersRef = useRef(new Map());
  const pinchLockUntilAllUpRef = useRef(false);
  const pinchStartRef = useRef({
    dist: 1,
    midX: 0,
    midY: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
  });
  const singleDragModeRef = useRef(null); // "eyedropper" | "loupe" | "split" | "pan" | null
  const panDragStartRef = useRef({
    startX: 0,
    startY: 0,
    panX: 0,
    panY: 0,
  });
  const lastTapTimeRef = useRef(0);

  const zoomRef = useRef(1.0);
  zoomRef.current = zoom;
  const panRef = useRef({ x: 0, y: 0 });
  panRef.current = pan;
  const splitDirectionRef = useRef(splitDirection);
  splitDirectionRef.current = splitDirection;

  const splitRafRef = useRef(0);
  const pendingSplitCoordRef = useRef(null);
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

  const clampPan = useCallback((nx, ny, nextZoom) => {
    if (nextZoom <= 1.001 || !containerRef.current) {
      return { x: 0, y: 0 };
    }
    const rect = containerRef.current.getBoundingClientRect();
    const maxX = Math.max(0, ((rect.width * (nextZoom - 1)) / 2) * 0.95);
    const maxY = Math.max(0, ((rect.height * (nextZoom - 1)) / 2) * 0.95);
    return {
      x: Math.max(-maxX, Math.min(maxX, nx)),
      y: Math.max(-maxY, Math.min(maxY, ny)),
    };
  }, []);

  const handleResetZoom = useCallback(() => {
    zoomRef.current = 1.0;
    panRef.current = { x: 0, y: 0 };
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  }, []);

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

  const applySplitPositionDirect = useCallback(
    (clientX, clientY) => {
      const targetEl = (mode === "split" && mediaBoxRef.current) || containerRef.current;
      if (!targetEl) return;
      const rect = targetEl.getBoundingClientRect();
      const isHoriz = splitDirectionRef.current === "horizontal";
      const span = isHoriz ? rect.height : rect.width;
      if (span <= 0) return;
      const coord = isHoriz
        ? Math.max(0, Math.min(clientY - rect.top, rect.height))
        : Math.max(0, Math.min(clientX - rect.left, rect.width));
      let pct = (coord / span) * 100;
      if (pct >= 48.2 && pct <= 51.8) {
        pct = 50;
      }
      splitPosRef.current = pct;
      if (splitLineWrapperRef.current) {
        splitLineWrapperRef.current.style.transform = isHoriz
          ? `translate3d(0, ${pct}%, 0)`
          : `translate3d(${pct}%, 0, 0)`;
      }
      if (cpuClipRef.current) {
        cpuClipRef.current.style.clipPath = isHoriz
          ? `inset(0 0 ${100 - pct}% 0)`
          : `inset(0 ${100 - pct}% 0 0)`;
      }
      activeGLRef.current?.setSplitPos?.(pct);
    },
    [mode, activeGLRef]
  );

  const handleToggleSplitDirection = (nextDir) => {
    splitDirectionRef.current = nextDir;
    setSplitDirection(nextDir);
    activeGLRef.current?.setSplitDirection?.(nextDir);
    if (splitLineWrapperRef.current) {
      splitLineWrapperRef.current.style.transform =
        nextDir === "horizontal"
          ? `translate3d(0, ${splitPosRef.current}%, 0)`
          : `translate3d(${splitPosRef.current}%, 0, 0)`;
    }
    if (cpuClipRef.current) {
      cpuClipRef.current.style.clipPath =
        nextDir === "horizontal"
          ? `inset(0 0 ${100 - splitPosRef.current}% 0)`
          : `inset(0 ${100 - splitPosRef.current}% 0 0)`;
    }
  };

  // Draw magnified pixels into the Optical Glass Pixel Loupe (2x / 4x)
  const renderLoupeAt = useCallback(
    (sampleClientX, sampleClientY) => {
      const container = containerRef.current;
      if (!container || !hasImage || loupeZoom <= 0) {
        setLoupePos(null);
        return;
      }
      const cRect = container.getBoundingClientRect();
      const relContainerX = sampleClientX - cRect.left;
      const relContainerY = sampleClientY - cRect.top;
      if (
        relContainerX < 0 ||
        relContainerY < 0 ||
        relContainerX > cRect.width ||
        relContainerY > cRect.height
      ) {
        setLoupePos(null);
        return;
      }

      setLoupePos({ x: relContainerX, y: relContainerY });

      const glCanvas = activeGLRef.current?.getCanvas?.();
      const sourceCanvas = glCanvas || gradedCanvasRef?.current || imageEl || videoEl;
      const loupeCanvas = loupeCanvasRef.current;
      if (!sourceCanvas || !loupeCanvas) return;

      const targetEl = mediaBoxRef.current || container;
      const mRect = targetEl.getBoundingClientRect();
      if (mRect.width <= 0 || mRect.height <= 0) return;

      const u = Math.max(0, Math.min(1, (sampleClientX - mRect.left) / mRect.width));
      const v = Math.max(0, Math.min(1, (sampleClientY - mRect.top) / mRect.height));

      const srcW =
        sourceCanvas.width ||
        sourceCanvas.videoWidth ||
        sourceCanvas.naturalWidth ||
        1;
      const srcH =
        sourceCanvas.height ||
        sourceCanvas.videoHeight ||
        sourceCanvas.naturalHeight ||
        1;

      const ctx = loupeCanvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
      ctx.imageSmoothingEnabled = false;

      const patchW = Math.max(8, LOUPE_SIZE / loupeZoom);
      const patchH = Math.max(8, LOUPE_SIZE / loupeZoom);
      const sx = u * srcW - patchW * 0.5;
      const sy = v * srcH - patchH * 0.5;

      ctx.fillStyle = "#08080B";
      ctx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);

      try {
        ctx.drawImage(
          sourceCanvas,
          sx,
          sy,
          patchW,
          patchH,
          0,
          0,
          LOUPE_SIZE,
          LOUPE_SIZE
        );
      } catch {
        // Ignore if source frame is not ready
      }
    },
    [hasImage, loupeZoom, activeGLRef, gradedCanvasRef, imageEl, videoEl]
  );

  // Re-render loupe when grading params change while loupe is visible
  useEffect(() => {
    if (loupePos && loupeZoom > 0 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const raf = requestAnimationFrame(() => {
        renderLoupeAt(rect.left + loupePos.x, rect.top + loupePos.y);
      });
      return () => cancelAnimationFrame(raf);
    }
    return undefined;
  }, [gradingParams, splitPos, splitDirection, loupePos, loupeZoom, renderLoupeAt]);

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

  const cancelSingleFingerActions = useCallback(() => {
    if (splitRafRef.current) {
      cancelAnimationFrame(splitRafRef.current);
      splitRafRef.current = 0;
    }
    pendingSplitCoordRef.current = null;
    if (isDraggingSplitRef.current) {
      isDraggingSplitRef.current = false;
      if (splitHandleRef.current) {
        splitHandleRef.current.style.transform =
          "translate(-50%, -50%) scale3d(1, 1, 1)";
      }
      setSplitPos(splitPosRef.current);
      onSplitDragChangeRef.current?.(false);
    }
    singleDragModeRef.current = null;
    setLoupePos(null);
    setReticlePos(null);
  }, []);

  const handleViewportPointerDown = (e) => {
    if (!hasImage || isHoldingBefore) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const pointers = activePointersRef.current;
    pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      pointerType: e.pointerType,
    });

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable
    }

    // 1. Strict 2-Finger Priority: Pinch-to-Zoom (1.0x - 4.0x) & 2-Finger Pan
    if (pointers.size === 2) {
      e.preventDefault();
      pinchLockUntilAllUpRef.current = true;
      cancelSingleFingerActions();
      const pts = Array.from(pointers.values());
      const dist = Math.max(12, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
      const midX = (pts[0].x + pts[1].x) * 0.5;
      const midY = (pts[0].y + pts[1].y) * 0.5;
      pinchStartRef.current = {
        dist,
        midX,
        midY,
        zoom: zoomRef.current,
        panX: panRef.current.x,
        panY: panRef.current.y,
      };
      return;
    }

    if (pointers.size > 2 || pinchLockUntilAllUpRef.current) {
      return;
    }

    // Double-Tap on touch to reset zoom when zoomed > 1.0x
    if (e.pointerType === "touch" && zoomRef.current > 1.001) {
      const now = performance.now();
      if (now - lastTapTimeRef.current < 280) {
        lastTapTimeRef.current = 0;
        handleResetZoom();
        return;
      }
      lastTapTimeRef.current = now;
    }

    const touchOffsetY = e.pointerType === "touch" ? -36 : 0;
    const sampleX = e.clientX;
    const sampleY = e.clientY + touchOffsetY;

    // 2. 1-Finger / Mouse Hierarchy:
    // Priority 1: Eyedropper active -> moves RGB/IRE reticle (+36px vertical offset on touch)
    if (isEyedropperActive && mode !== "side") {
      e.preventDefault();
      singleDragModeRef.current = "eyedropper";
      if (containerRef.current) {
        const cRect = containerRef.current.getBoundingClientRect();
        setReticlePos({
          x: Math.max(0, Math.min(cRect.width, sampleX - cRect.left)),
          y: Math.max(0, Math.min(cRect.height, sampleY - cRect.top)),
        });
      }
      samplePixelAt(sampleX, sampleY);
      return;
    }

    // Priority 2: Optical Loupe (2x / 4x) active -> moves circular magnifying glass loupe (+36px vertical offset on touch)
    if (loupeZoom > 0 && mode !== "side") {
      e.preventDefault();
      singleDragModeRef.current = "loupe";
      renderLoupeAt(sampleX, sampleY);
      samplePixelAt(sampleX, sampleY);
      return;
    }

    // Priority 3: Split Slider active
    if (mode === "split") {
      const targetEl = mediaBoxRef.current || containerRef.current;
      if (!targetEl) return;
      const rect = targetEl.getBoundingClientRect();
      const isHoriz = splitDirectionRef.current === "horizontal";
      const splitLineScreenPos = isHoriz
        ? rect.top + (splitPosRef.current / 100) * rect.height
        : rect.left + (splitPosRef.current / 100) * rect.width;
      const pointerPos = isHoriz ? e.clientY : e.clientX;
      const distFromSplit = Math.abs(pointerPos - splitLineScreenPos);

      // At > 1.0x zoom: within +-28px moves split wipe, outside pans the zoomed image
      if (zoomRef.current > 1.001 && distFromSplit > 28) {
        e.preventDefault();
        singleDragModeRef.current = "pan";
        panDragStartRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
        return;
      }

      // At 1.0x zoom (or within +-28px of split line when zoomed): dragging moves the split wipe
      e.preventDefault();
      singleDragModeRef.current = "split";
      isDraggingSplitRef.current = true;
      if (splitHandleRef.current) {
        splitHandleRef.current.style.transform =
          "translate(-50%, -50%) scale3d(1.16, 1.16, 1)";
      }
      onSplitDragChangeRef.current?.(true);
      applySplitPositionDirect(e.clientX, e.clientY);
      return;
    }

    // In Graded Only / Side by Side mode when zoomed > 1.0x: drag pans the zoomed image
    if (zoomRef.current > 1.001) {
      e.preventDefault();
      singleDragModeRef.current = "pan";
      panDragStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
      };
    }
  };

  const handleViewportPointerMove = (e) => {
    const pointers = activePointersRef.current;
    if (pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        pointerType: e.pointerType,
      });
    }

    // 1. 2-Finger Pinch-to-Zoom & 2-Finger Pan
    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      const dist = Math.max(12, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
      const midX = (pts[0].x + pts[1].x) * 0.5;
      const midY = (pts[0].y + pts[1].y) * 0.5;
      const start = pinchStartRef.current;
      const nextZoom = Math.max(
        1.0,
        Math.min(4.0, Number((start.zoom * (dist / start.dist)).toFixed(3)))
      );
      const rawPanX = start.panX + (midX - start.midX);
      const rawPanY = start.panY + (midY - start.midY);
      const nextPan = clampPan(rawPanX, rawPanY, nextZoom);
      zoomRef.current = nextZoom;
      panRef.current = nextPan;
      setZoom(nextZoom);
      setPan(nextPan);
      return;
    }

    if (pinchLockUntilAllUpRef.current) {
      return;
    }

    const touchOffsetY = e.pointerType === "touch" ? -36 : 0;
    const sampleX = e.clientX;
    const sampleY = e.clientY + touchOffsetY;

    // 2. Active 1-Finger / Mouse Drag Modes
    if (singleDragModeRef.current === "eyedropper") {
      if (containerRef.current) {
        const cRect = containerRef.current.getBoundingClientRect();
        setReticlePos({
          x: Math.max(0, Math.min(cRect.width, sampleX - cRect.left)),
          y: Math.max(0, Math.min(cRect.height, sampleY - cRect.top)),
        });
      }
      samplePixelAt(sampleX, sampleY);
      return;
    }

    if (singleDragModeRef.current === "loupe") {
      renderLoupeAt(sampleX, sampleY);
      samplePixelAt(sampleX, sampleY);
      return;
    }

    if (singleDragModeRef.current === "split" && isDraggingSplitRef.current) {
      pendingSplitCoordRef.current = { x: e.clientX, y: e.clientY };
      if (!splitRafRef.current) {
        splitRafRef.current = requestAnimationFrame(() => {
          splitRafRef.current = 0;
          if (pendingSplitCoordRef.current !== null) {
            const { x, y } = pendingSplitCoordRef.current;
            pendingSplitCoordRef.current = null;
            applySplitPositionDirect(x, y);
          }
        });
      }
      return;
    }

    if (singleDragModeRef.current === "pan") {
      const start = panDragStartRef.current;
      const nextPan = clampPan(
        start.panX + (e.clientX - start.startX),
        start.panY + (e.clientY - start.startY),
        zoomRef.current
      );
      panRef.current = nextPan;
      setPan(nextPan);
      return;
    }

    // Passive mouse hover over viewport
    if (e.pointerType === "mouse" && hasImage && mode !== "side") {
      if (loupeZoom > 0) {
        renderLoupeAt(e.clientX, e.clientY);
      }
      if (isEyedropperActive && containerRef.current) {
        const cRect = containerRef.current.getBoundingClientRect();
        setReticlePos({
          x: Math.max(0, Math.min(cRect.width, e.clientX - cRect.left)),
          y: Math.max(0, Math.min(cRect.height, e.clientY - cRect.top)),
        });
      }
      samplePixelAt(e.clientX, e.clientY);
    }
  };

  const handleViewportPointerEnd = (e) => {
    const pointers = activePointersRef.current;
    pointers.delete(e.pointerId);
    try {
      if (e?.currentTarget?.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }

    if (pointers.size === 0) {
      pinchLockUntilAllUpRef.current = false;
    } else {
      return;
    }

    if (singleDragModeRef.current === "split" || isDraggingSplitRef.current) {
      if (splitRafRef.current) {
        cancelAnimationFrame(splitRafRef.current);
        splitRafRef.current = 0;
      }
      if (pendingSplitCoordRef.current !== null) {
        const { x, y } = pendingSplitCoordRef.current;
        pendingSplitCoordRef.current = null;
        applySplitPositionDirect(x, y);
      }
      isDraggingSplitRef.current = false;
      if (splitHandleRef.current) {
        splitHandleRef.current.style.transform =
          "translate(-50%, -50%) scale3d(1, 1, 1)";
      }
      setSplitPos(splitPosRef.current);
      onSplitDragChangeRef.current?.(false);
    }

    if (e.pointerType === "touch" && singleDragModeRef.current === "loupe") {
      setLoupePos(null);
    }

    singleDragModeRef.current = null;
  };

  const handleViewportPointerLeave = () => {
    if (activePointersRef.current.size === 0) {
      clearPixelReadout();
      setLoupePos(null);
      if (!isEyedropperActive) {
        setReticlePos(null);
      }
    }
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
  const isHorizSplit = splitDirection === "horizontal";

  return (
    <div
      className={`liquid-glass-card m3-panel rounded-[18px] overflow-hidden p-3 lg:p-4 flex-1 flex flex-col ${
        isPinned
          ? "max-lg:!bg-[#0d0f12] max-lg:backdrop-blur-md max-lg:shadow-[0_12px_28px_rgba(0,0,0,0.85)]"
          : ""
      }`}
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <Columns className="w-3.5 h-3.5 text-[#9CA3AF]" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">
            {t("preview.title")}
          </h3>
          {zoom > 1.001 && (
            <button
              type="button"
              onClick={handleResetZoom}
              title={t("preview.resetZoomTitle")}
              className="liquid-droplet-badge m3-btn-morph inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#6EE7B7]/15 hover:bg-[#6EE7B7]/25 text-[#6EE7B7] border border-[#6EE7B7]/40 text-[10px] font-mono cursor-pointer"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>{t("preview.resetZoom", { zoom: zoom.toFixed(1) })}</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onTogglePin && (
            <button
              type="button"
              onClick={onTogglePin}
              title={isPinned ? t("preview.unpinTitle") : t("preview.pinTitle")}
              className={`lg:hidden m3-btn-morph inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border cursor-pointer select-none ${
                isPinned
                  ? "bg-white/[0.12] text-[#F4F5F7] border-white/25"
                  : "bg-white/[0.04] text-[#9CA3AF] hover:text-[#E2E4E9] border-white/[0.09]"
              }`}
            >
              {isPinned ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
              <span>{isPinned ? t("preview.pinned") : t("preview.pin")}</span>
            </button>
          )}

          {hasImage && onSaveImage && (
            <SaveImagePopover
              onSaveImage={onSaveImage}
              isSavingImage={isSavingImage}
              isVideo={Boolean(videoEl)}
              onExportVideo={onExportVideo}
              isExportingVideo={isExportingVideo}
              videoExportProgress={videoExportProgress}
              videoExportStatusText={videoExportStatusText}
              onCancelVideoExport={onCancelVideoExport}
              targetVideoSrc={targetVideoSrc}
              targetFile={targetFile}
              videoDurationSec={videoDurationSec}
              nativeWidth={nativeWidth}
              nativeHeight={nativeHeight}
              targetBaseName={targetBaseName}
              engineId={engineId}
              splitPos={splitPos}
              params={gradingParams}
              logProfile={simulateLogInput}
            />
          )}

          {/* Split Orientation Toggle: Vertical | vs Horizontal - */}
          {hasImage && mode === "split" && (
            <div
              title={t("preview.splitOrientationTitle")}
              className="inline-flex items-center gap-0.5 bg-[#0A0A0D]/55 border border-white/[0.09] rounded-lg p-0.5 text-[10px] font-mono"
            >
              <button
                type="button"
                onClick={() => handleToggleSplitDirection("vertical")}
                className={`px-1.5 py-0.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  splitDirection === "vertical"
                    ? "bg-white/[0.15] text-[#F4F5F7] font-semibold"
                    : "text-[#9CA3AF] hover:text-[#E2E4E9]"
                }`}
              >
                {t("preview.vertical")}
              </button>
              <button
                type="button"
                onClick={() => handleToggleSplitDirection("horizontal")}
                className={`px-1.5 py-0.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  splitDirection === "horizontal"
                    ? "bg-white/[0.15] text-[#F4F5F7] font-semibold"
                    : "text-[#9CA3AF] hover:text-[#E2E4E9]"
                }`}
              >
                {t("preview.horizontal")}
              </button>
            </div>
          )}

          {/* Optical Glass Pixel Loupe Toggle (Off / 2x / 4x) */}
          {hasImage && mode !== "side" && (
            <div
              title={t("preview.loupeTitle")}
              className="inline-flex items-center gap-0.5 bg-[#0A0A0D]/55 border border-white/[0.09] rounded-lg p-0.5 text-[10px] font-mono"
            >
              <Search className="w-3 h-3 text-[#9CA3AF] mx-1 shrink-0 hidden sm:block" />
              {loupeModes.map((lm) => (
                <button
                  key={lm.id}
                  type="button"
                  onClick={() => {
                    setLoupeZoom(lm.id);
                    if (lm.id === 0) setLoupePos(null);
                  }}
                  className={`px-1.5 py-0.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    loupeZoom === lm.id
                      ? lm.id === 0
                        ? "bg-white/[0.14] text-[#F4F5F7] font-semibold"
                        : "bg-[#6EE7B7]/20 text-[#6EE7B7] font-semibold"
                      : "text-[#9CA3AF] hover:text-[#E2E4E9]"
                  }`}
                >
                  {lm.label}
                </button>
              ))}
            </div>
          )}

          {hasImage && showWebGL && (
            <div
              title={t("preview.monitorTitle")}
              className="inline-flex items-center gap-0.5 bg-[#0A0A0D]/55 border border-white/[0.09] rounded-lg p-0.5 text-[10px] font-mono"
            >
              <ScanEye className="w-3 h-3 text-[#9CA3AF] mx-1 shrink-0 hidden sm:block" />
              {monitorModes.map((mm) => (
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
                  if (v) {
                    clearPixelReadout();
                    setReticlePos(null);
                  }
                  return !v;
                });
              }}
              aria-pressed={isEyedropperActive}
              title={t("preview.eyedropperTitle")}
              className={`m3-btn-morph inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border cursor-pointer select-none ${
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
            <InputProfileDropdown
              value={simulateLogInput}
              onChange={onToggleSimulateLogInput}
              ariaLabel={t("dropCard.targetInputProfileAria")}
              title={t("preview.inputProfileTitle")}
              compact
            />
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
              title={t("preview.holdBeforeTitle")}
              className={`m3-btn-morph inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-medium border cursor-pointer select-none ${
                isHoldingBefore
                  ? "bg-[#E2E4E9] text-[#0E0E11] border-[#E2E4E9]"
                  : "bg-white/[0.04] text-[#9CA3AF] hover:text-[#E2E4E9] border-white/[0.09]"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="whitespace-nowrap">{t("preview.holdBefore")}</span>
            </button>
          )}

          {/* Morphing Segmented Pills for Preview Modes */}
          <div
            ref={modeContainerRef}
            className="relative flex items-center gap-0.5 bg-[#080A12]/65 border border-white/[0.14] rounded-full p-0.5 text-xs"
          >
            <div
              aria-hidden="true"
              className="m3-pill-indicator optical-refract-glass pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-full bg-[#E2E4E9] shadow-[0_2px_10px_rgba(255,255,255,0.28),inset_0_1px_1px_rgba(255,255,255,0.85)]"
              style={{
                transform: `translate3d(${modePillStyle.left}px, 0, 0)`,
                width: `${modePillStyle.width}px`,
                opacity: modePillStyle.opacity,
              }}
            />
            {previewModes.map((m) => (
              <button
                key={m.id}
                ref={registerModeTabRef(m.id)}
                type="button"
                onClick={() => onModeChange && onModeChange(m.id)}
                className={`relative z-10 px-2.5 py-1 rounded-full font-medium transition-colors duration-200 active:scale-[0.96] cursor-pointer whitespace-nowrap ${
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

      {/* Preview Viewport - Solid Neutral #07080a Isolation Matte for 100% Accurate Color Grading Judgment */}
      <div
        ref={containerRef}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerEnd}
        onPointerCancel={handleViewportPointerEnd}
        onPointerLeave={handleViewportPointerLeave}
        onDoubleClick={() => {
          if (zoom > 1.001) handleResetZoom();
        }}
        style={
          hasImage
            ? { touchAction: "none", userSelect: "none" }
            : undefined
        }
        className={`relative isolate w-full flex-1 ${
          isPinned ? "h-[30vh] min-h-[200px] max-h-[245px]" : "min-h-[210px]"
        } lg:h-auto lg:min-h-[300px] lg:max-h-none rounded-[18px] bg-[#07080a] border border-white/[0.12] shadow-[inset_0_2px_14px_rgba(0,0,0,0.88)] overflow-hidden flex items-center justify-center select-none ${
          isEyedropperActive && hasImage
            ? "cursor-crosshair"
            : loupeZoom > 0 && hasImage
            ? "cursor-none"
            : mode === "split" && hasImage
            ? isHorizSplit
              ? "cursor-ns-resize"
              : "cursor-ew-resize"
            : zoom > 1.001
            ? "cursor-grab active:cursor-grabbing"
            : ""
        }`}
      >
        {/* Solid Neutral #07080a Isolation Matte Behind Media Frame */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[#07080a]"
        />
        {!hasImage ? (
          <div className="text-center p-6 text-[#9CA3AF]/60 text-xs space-y-3">
            <p>{t("preview.emptyHint")}</p>
            {onTryInstantDemo && (
              <button
                type="button"
                onClick={onTryInstantDemo}
                className="m3-btn-morph inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#6EE7B7] hover:bg-[#86EFAC] text-[#042F1E] text-xs font-semibold cursor-pointer shadow-lg"
              >
                <span>{t("preview.tryInstantDemo")}</span>
              </button>
            )}
          </div>
        ) : (
          <div
            className="relative w-full h-full flex items-center justify-center"
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale3d(${zoom}, ${zoom}, 1)`,
              transformOrigin: "center center",
              willChange: zoom > 1.001 ? "transform" : undefined,
            }}
          >
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
                    activeLut={activeLut}
                    lutMix={lutMix}
                    mode={mode}
                    splitPos={splitPos}
                    splitDirection={splitDirection}
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
                      splitDirection={splitDirection}
                      splitLineWrapperRef={splitLineWrapperRef}
                      splitHandleRef={splitHandleRef}
                    />
                  )}
                  <CornerBadges
                    mode={mode}
                    isHoldingBefore={isHoldingBefore}
                    splitDirection={splitDirection}
                    t={t}
                  />
                </div>
              </div>
            )}

            {!showWebGL && (
              mode === "side" ? (
                <div className="grid grid-cols-2 gap-1.5 w-full h-full min-h-[240px] sm:min-h-[280px] p-2 items-center">
                  <div className="relative h-full flex items-center justify-center bg-black/40 rounded-md overflow-hidden border border-white/[0.06]">
                    <img
                      src={originalImage}
                      alt={t("preview.before")}
                      className="w-full h-full max-h-[360px] object-contain"
                    />
                    <span className="absolute top-2 left-2 bg-[#151519]/90 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded text-[#9CA3AF] border border-white/[0.08]">
                      {t("preview.before")}
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
                        alt={t("preview.beforePeek")}
                        className="w-full h-full max-h-[360px] object-contain"
                      />
                    )}
                    <span className="absolute top-2 right-2 bg-[#1E1E24]/90 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded text-[#E2E4E9] border border-white/15">
                      {isHoldingBefore ? t("preview.beforePeek") : t("preview.after")}
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
                      alt={t("preview.beforePeek")}
                      className="w-full h-full max-h-[360px] object-contain rounded"
                    />
                  )}
                  <CornerBadges
                    mode="result"
                    isHoldingBefore={isHoldingBefore}
                    splitDirection={splitDirection}
                    t={t}
                  />
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
                        clipPath: isHorizSplit
                          ? `inset(0 0 ${isHoldingBefore ? 0 : 100 - splitPos}% 0)`
                          : `inset(0 ${isHoldingBefore ? 0 : 100 - splitPos}% 0 0)`,
                      }}
                    >
                      <img
                        src={originalImage}
                        alt={t("preview.before")}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    {!isHoldingBefore && (
                      <SplitDivider
                        splitPos={splitPos}
                        splitDirection={splitDirection}
                        splitLineWrapperRef={splitLineWrapperRef}
                        splitHandleRef={splitHandleRef}
                      />
                    )}
                    <CornerBadges
                      mode="split"
                      isHoldingBefore={isHoldingBefore}
                      splitDirection={splitDirection}
                      t={t}
                    />
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* Optical Eyedropper Reticle Overlay */}
        {isEyedropperActive && reticlePos && hasImage && mode !== "side" && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-30 w-7 h-7 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#6EE7B7] shadow-[0_0_12px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,255,255,0.6)] flex items-center justify-center"
            style={{
              left: `${reticlePos.x}px`,
              top: `${reticlePos.y}px`,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7]" />
          </div>
        )}

        {/* Optical Glass Pixel Loupe (2x / 4x) Magnifying Lens Overlay + Soft-Edge Diffusion Aura */}
        {loupeZoom > 0 && loupePos && hasImage && mode !== "side" && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-30 flex items-center justify-center"
            style={{
              width: `${LOUPE_SIZE}px`,
              height: `${LOUPE_SIZE}px`,
              left: `${loupePos.x}px`,
              top: `${loupePos.y}px`,
              transform: "translate3d(-50%, -50%, 0)",
            }}
          >
            {/* Outer Optical Diffusion Aura with Frosted Soft Edges */}
            <div
              className="frosted-soft-edge pointer-events-none absolute -inset-6 rounded-full bg-white/[0.10]"
            />
            <div
              className="optical-refract-glass relative w-full h-full rounded-full overflow-hidden flex items-center justify-center"
              style={{
                border: "1.5px solid rgba(255, 255, 255, 0.72)",
                boxShadow:
                  "inset 0 2px 3px rgba(255, 255, 255, 0.65), inset 0 -2px 6px rgba(0, 0, 0, 0.7), 0 16px 38px rgba(0, 0, 0, 0.75)",
              }}
            >
              <canvas
                ref={loupeCanvasRef}
                width={LOUPE_SIZE}
                height={LOUPE_SIZE}
                className="w-full h-full block"
                style={{ imageRendering: "pixelated" }}
              />
              {/* Optical Crosshair & Specular Rim Inside Lens */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-x-0 top-1/2 h-px bg-white/35" />
                <div className="absolute inset-y-0 left-1/2 w-px bg-white/35" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 border border-[#6EE7B7]/90 rounded-[2px]" />
                <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-full bg-[#09090D]/85 border border-white/25 text-[9px] font-mono font-semibold text-[#6EE7B7]">
                  {loupeZoom}x
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Floating Reset Zoom Glass Pill inside Viewport */}
        {zoom > 1.001 && hasImage && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleResetZoom();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute top-2.5 left-1/2 -translate-x-1/2 z-30 px-3 py-1 rounded-full bg-[#0E0E13]/85 hover:bg-[#181920] border border-white/25 text-[10px] font-mono font-semibold text-[#F4F5F7] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_20px_rgba(0,0,0,0.6)] flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 text-[#6EE7B7]" />
            <span>{t("preview.resetZoom", { zoom: zoom.toFixed(1) })}</span>
          </button>
        )}

        {pixelReadout && hasImage && mode !== "side" && (
          <div className="pointer-events-none absolute bottom-2 left-2 z-20 px-2 py-1 rounded-md bg-[#0E0E12]/88 border border-white/[0.12] text-[10px] font-mono tabular-nums text-[#E2E4E9] flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[#9CA3AF]">
              {t("preview.before")} {pixelReadout.r}/{pixelReadout.g}/{pixelReadout.b} ({pixelReadout.beforeIre} IRE)
            </span>
            <span className="text-white/25">|</span>
            <span className="text-[#6EE7B7]">
              {t("preview.graded")} {pixelReadout.gr}/{pixelReadout.gg}/{pixelReadout.gb} ({pixelReadout.gradedIre} IRE)
            </span>
          </div>
        )}
      </div>
      {footer}
    </div>
  );
}
