import React, { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  MoveHorizontal,
  MoveVertical,
  Eye,
  Pipette,
  RotateCcw,
  Image as ImageIcon,
  Bookmark,
  Upload,
  X,
  Camera,
  Check,
  ChevronDown,
  Undo2,
  Redo2,
  RefreshCw,
  ArrowRight,
  HelpCircle,
} from "lucide-react";
import { usePixelReadout } from "../hooks/usePixelReadout";
import { useLanguage } from "../i18n/LanguageContext";
import { CURATED_SAMPLE_PLATES } from "../utils/samplePlates";

const WebGLPreviewCanvas = lazy(() => import("./WebGLPreviewCanvas"));

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
        <div className="absolute left-0 right-0 top-0 h-px bg-[#F4F7FB]/85 shadow-[0_0_6px_rgba(0,0,0,0.9)]">
          <div
            ref={splitHandleRef}
            className="absolute top-1/2 left-1/2 w-6 h-6 rounded-full bg-[#11161F]/92 border border-[#C9D7E2]/65 flex items-center justify-center shadow-[0_4px_14px_rgba(0,0,0,0.75)] transition-transform duration-120"
            style={{ transform: "translate(-50%, -50%) scale3d(1, 1, 1)" }}
          >
            <MoveVertical className="w-3 h-3 text-[#F4F7FB]" />
          </div>
        </div>
      ) : (
        <div className="absolute top-0 bottom-0 left-0 w-px bg-[#F4F7FB]/85 shadow-[0_0_6px_rgba(0,0,0,0.9)]">
          <div
            ref={splitHandleRef}
            className="absolute top-1/2 left-1/2 w-6 h-6 rounded-full bg-[#11161F]/92 border border-[#C9D7E2]/65 flex items-center justify-center shadow-[0_4px_14px_rgba(0,0,0,0.75)] transition-transform duration-120"
            style={{ transform: "translate(-50%, -50%) scale3d(1, 1, 1)" }}
          >
            <MoveHorizontal className="w-3 h-3 text-[#F4F7FB]" />
          </div>
        </div>
      )}
    </div>
  );
}

function CornerBadges({ mode, isHoldingBefore, splitDirection }) {
  const isHorizSplit = mode === "split" && splitDirection === "horizontal";
  return (
    <>
      {mode !== "result" && (
        <span className="absolute top-4 left-4 z-20 bg-[#0A0C10]/85 backdrop-blur-sm text-[10px] font-mono uppercase tracking-[0.1em] px-2 py-0.5 rounded text-[#C9D7E2] border border-[#AAB7C5]/18 pointer-events-none select-none">
          {isHoldingBefore ? "BEFORE (PEEK)" : "BEFORE"}
        </span>
      )}
      {!isHoldingBefore && (
        <span
          className={`absolute ${
            isHorizSplit ? "bottom-14 right-4" : "top-4 right-4"
          } z-20 bg-[#0A0C10]/85 backdrop-blur-sm text-[10px] font-mono uppercase tracking-[0.1em] px-2 py-0.5 rounded text-[#F4F7FB] border border-[#7FA3C2]/35 pointer-events-none select-none`}
        >
          {mode === "result" ? "GRADED" : "MATCHED"}
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
  hasTargetImage = false,
  mode = "split",
  onModeChange,
  videoEl = null,
  gradingParams,
  activeLut = null,
  lutMix = 1.0,
  onVideoError,
  onSplitDragChange,
  onSplitPosChange,
  onQuickSaveFrame,
  isSavingImage = false,
  onTryInstantDemo,
  onLoadSamplePhoto = null,
  onLoadSamplePlate = null,
  onOpenGuide = null,
  nativeWidth = 0,
  nativeHeight = 0,
  simulateLogInput = false,
  isTabActive = true,
  scanlineKey = 0,
  footer = null,
  canUndo = false,
  canRedo = false,
  onUndo = null,
  onRedo = null,
  onRematch = null,
  canRematch = false,
  isAnalyzing = false,
  reloadedFeedback = false,
  isNeutralGrade = false,
  onOpenLooks = null,
  onImportPreset = null,
  onLoadSampleReference = null,
}) {
  const { t } = useLanguage();
  const [completedScanKey, setCompletedScanKey] = useState(0);
  const [dismissedStep2ForImage, setDismissedStep2ForImage] = useState(null);
  const [splitPos, setSplitPos] = useState(50);
  const [splitDirection, setSplitDirection] = useState("vertical");
  const [isHoldingBefore, setIsHoldingBefore] = useState(false);
  const [isContextLost, setIsContextLost] = useState(false);
  const [monitorMode, setMonitorMode] = useState("off"); // "off" | "zebra" | "falsecolor" | "gamut"
  const [isEyedropperActive, setIsEyedropperActive] = useState(false);
  const [loupeZoom, setLoupeZoom] = useState(0); // 0 | 2 | 4
  const [loupePos, setLoupePos] = useState(null);
  const [reticlePos, setReticlePos] = useState(null);
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [quickSaved, setQuickSaved] = useState(false);
  const [isMobileViewOpen, setIsMobileViewOpen] = useState(false);
  const quickSaveTimerRef = useRef(0);
  const mobileViewRef = useRef(null);

  useEffect(() => {
    if (!isMobileViewOpen) return undefined;
    const onPointerDown = (e) => {
      if (mobileViewRef.current && !mobileViewRef.current.contains(e.target)) {
        setIsMobileViewOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setIsMobileViewOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isMobileViewOpen]);

  useEffect(
    () => () => {
      if (quickSaveTimerRef.current) clearTimeout(quickSaveTimerRef.current);
    },
    []
  );

  const handleQuickSaveClick = async () => {
    if (!hasImage || !onQuickSaveFrame || isSavingImage) return;
    const ok = await onQuickSaveFrame({
      format: "png",
      layout: mode === "split" ? "split" : "graded",
      splitPos: splitPosRef.current,
    });
    if (ok !== false) {
      if (quickSaveTimerRef.current) clearTimeout(quickSaveTimerRef.current);
      setQuickSaved(true);
      quickSaveTimerRef.current = setTimeout(() => {
        setQuickSaved(false);
        quickSaveTimerRef.current = 0;
      }, 1200);
    }
  };

  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const mediaBoxRef = useRef(null);
  const [mediaBox, setMediaBox] = useState(null);
  const loupeCanvasRef = useRef(null);

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
  const singleDragModeRef = useRef(null);
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
  const onSplitPosChangeRef = useRef(onSplitPosChange);
  onSplitPosChangeRef.current = onSplitPosChange;

  const { pixelReadout, samplePixelAt, clearPixelReadout } = usePixelReadout({
    hasImage,
    mode,
    imageEl,
    videoEl,
    containerRef,
    gradingParams,
    simulateLogInput,
  });

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
    const el = stageRef.current || containerRef.current;
    if (!el || !nativeWidth || !nativeHeight || mode === "side") {
      setMediaBox(null);
      return undefined;
    }
    const computeBox = () => {
      const targetEl = stageRef.current || containerRef.current;
      if (!targetEl) return;
      const cs = window.getComputedStyle(targetEl);
      const padX =
        (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const padY =
        (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const availW = Math.max(0, targetEl.clientWidth - padX);
      const availH = Math.max(0, targetEl.clientHeight - padY);
      if (availW <= 0 || availH <= 0) return;

      const containerAspect = availW / availH;
      const mediaAspect = nativeWidth / nativeHeight;
      let w = availW;
      let h = availH;
      if (mediaAspect > containerAspect) {
        h = availW / mediaAspect;
      } else {
        w = availH * mediaAspect;
      }
      setMediaBox({ width: Math.round(w), height: Math.round(h) });
    };
    computeBox();
    const ro = new ResizeObserver(computeBox);
    if (containerRef.current) ro.observe(containerRef.current);
    if (stageRef.current && stageRef.current !== containerRef.current) {
      ro.observe(stageRef.current);
    }
    return () => ro.disconnect();
  }, [nativeWidth, nativeHeight, mode, hasImage]);

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

  const handleToggleSplitDirection = () => {
    const nextDir = splitDirection === "vertical" ? "horizontal" : "vertical";
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

      ctx.fillStyle = "#07090D";
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
      onSplitPosChangeRef.current?.(splitPosRef.current);
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
      // ignore
    }

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

    if (loupeZoom > 0 && mode !== "side") {
      e.preventDefault();
      singleDragModeRef.current = "loupe";
      renderLoupeAt(sampleX, sampleY);
      samplePixelAt(sampleX, sampleY);
      return;
    }

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

      e.preventDefault();
      singleDragModeRef.current = "split";
      isDraggingSplitRef.current = true;
      if (splitHandleRef.current) {
        splitHandleRef.current.style.transform =
          "translate(-50%, -50%) scale3d(1.12, 1.12, 1)";
      }
      onSplitDragChangeRef.current?.(true);
      applySplitPositionDirect(e.clientX, e.clientY);
      return;
    }

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
      if (isEyedropperActive || loupeZoom > 0) {
        samplePixelAt(e.clientX, e.clientY);
      }
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
      // ignore
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
      onSplitPosChangeRef.current?.(splitPosRef.current);
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

  // Keyboard shortcuts: hold 'B' or '\' to peek at Before image; 'Esc' resets active zoom/loupe/eyedropper
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "\\" || e.key.toLowerCase() === "b") {
        setIsHoldingBefore(true);
      } else if (e.key === "Escape") {
        if (zoomRef.current > 1.001) {
          handleResetZoom();
        }
        setLoupeZoom(0);
        setLoupePos(null);
        setIsEyedropperActive(false);
        clearPixelReadout();
        setReticlePos(null);
      }
    };
    const handleKeyUp = (e) => {
      if (e.key === "\\" || e.key.toLowerCase() === "b") {
        setIsHoldingBefore(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleResetZoom, clearPixelReadout]);

  const canUseWebGL = Boolean(videoEl || (useWebGLPhoto && imageEl));
  const showWebGL = canUseWebGL && !isContextLost;
  const isHorizSplit = splitDirection === "horizontal";

  const toggleMonitor = (target) => {
    setMonitorMode((cur) => (cur === target ? "off" : target));
  };

  const toggleLoupe = (level) => {
    setLoupeZoom((cur) => {
      const next = cur === level ? 0 : level;
      if (next === 0) setLoupePos(null);
      return next;
    });
  };

  const dockBtnBase =
    "studio-tactile px-1.5 2xl:px-2 py-0.5 2xl:py-1 rounded-full text-[10px] 2xl:text-[11px] font-medium whitespace-nowrap cursor-pointer select-none inline-flex items-center gap-1";

  const hasSecondaryViewActive =
    mode === "side" ||
    loupeZoom > 0 ||
    monitorMode !== "off" ||
    isEyedropperActive;

  const mobilePillBtn =
    "min-h-[44px] px-3 rounded-full text-[11px] font-sans font-medium whitespace-nowrap cursor-pointer select-none inline-flex items-center justify-center gap-1 transition-colors active:scale-[0.97]";

  const currentTargetKey = originalImage || "target-active";
  const showStep2GuidancePill =
    Boolean(hasImage && hasTargetImage && isNeutralGrade && !canRematch) &&
    dismissedStep2ForImage !== currentTargetKey;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#07090D] lg:bg-[#0A0C10] select-none">
      {/* Full-Bleed Neutral Cinema Viewport Well (Compact Sticky Stage on <lg) */}
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
        className={`relative isolate w-full h-[36vh] min-h-[220px] max-h-[300px] lg:h-auto lg:flex-1 lg:min-h-0 lg:max-h-none bg-[#07090D] lg:bg-[#0A0C10] overflow-hidden flex items-center justify-center ${
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
        {!hasImage ? (
          <AnimatePresence>
            {!hasTargetImage && (
              <motion.div
                key="studio-empty-onboarding"
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-xl px-4 py-4 sm:px-6 sm:py-6 text-center space-y-3 sm:space-y-4"
              >
                {/* Compact Responsive 3-Step Workflow Strip */}
                <div className="inline-flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 px-3.5 py-2 rounded-xl bg-[#11161F]/92 border border-[#AAB7C5]/14 text-[10.5px] sm:text-[11.5px]">
                  <span className="inline-flex items-center gap-1.5 font-sans font-medium text-[#F4F7FB]">
                    <span className="font-mono tabular-nums text-[10px] text-[#93B8D8]">01</span>
                    <span>{t("preview.step01LoadTarget")}</span>
                  </span>
                  <ArrowRight className="w-3 h-3 text-[#AAB7C5] shrink-0" />
                  <span className="inline-flex items-center gap-1.5 font-sans font-medium text-[#C9D7E2]">
                    <span className="font-mono tabular-nums text-[10px] text-[#93B8D8]">02</span>
                    <span>{t("preview.step02RefOrLut")}</span>
                  </span>
                  <ArrowRight className="w-3 h-3 text-[#AAB7C5] shrink-0" />
                  <span className="inline-flex items-center gap-1.5 font-sans font-medium text-[#C9D7E2]">
                    <span className="font-mono tabular-nums text-[10px] text-[#93B8D8]">03</span>
                    <span>{t("preview.step03TuneExport")}</span>
                  </span>
                </div>

                <p className="hidden sm:block text-xs text-[#AAB7C5] leading-relaxed max-w-md mx-auto">
                  {t("preview.emptyHint")}
                </p>

                {/* Quick-Start Actions */}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {(onLoadSamplePhoto || onTryInstantDemo) && (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.985 }}
                      onClick={onLoadSamplePhoto || onTryInstantDemo}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#F4F7FB] hover:bg-[#FBFDFF] text-[#0A0C10] font-sans font-semibold text-xs cursor-pointer transition-colors"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>{t("preview.loadSamplePhoto")}</span>
                    </motion.button>
                  )}
                  {onOpenGuide && (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.985 }}
                      onClick={onOpenGuide}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#11161F] hover:bg-[#1C2430] border border-[#AAB7C5]/18 text-[#C9D7E2] hover:text-[#F4F7FB] text-xs font-sans font-medium cursor-pointer transition-colors"
                    >
                      <HelpCircle className="w-3.5 h-3.5 text-[#93B8D8]" />
                      <span>{t("preview.howToUse")}</span>
                      <ArrowRight className="w-3 h-3 text-[#AAB7C5]" />
                    </motion.button>
                  )}
                </div>

                {/* Curated 4-Scene High-Resolution Sample Plate Strip */}
                {onLoadSamplePlate && (
                  <div
                    role="group"
                    aria-label="Curated high-resolution sample plates"
                    className="hidden sm:flex flex-wrap items-center justify-center gap-1.5 pt-1"
                  >
                    {CURATED_SAMPLE_PLATES.map((plate) => (
                      <button
                        key={plate.id}
                        type="button"
                        onClick={() => onLoadSamplePlate(plate)}
                        className="min-h-[32px] inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#11161F]/88 hover:bg-[#1C2430] border border-[#AAB7C5]/14 hover:border-[#7FA3C2]/45 text-[11px] font-sans font-medium text-[#C9D7E2] hover:text-[#F4F7FB] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
                      >
                        <span className="inline-flex items-center gap-0.5 shrink-0" aria-hidden="true">
                          {plate.swatches.slice(1, 4).map((hex) => (
                            <span
                              key={hex}
                              className="w-2 h-2 rounded-[2px] border border-[#F4F7FB]/20"
                              style={{ backgroundColor: hex }}
                            />
                          ))}
                        </span>
                        <span>{t(plate.sceneTagKey)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          <div
            ref={stageRef}
            className="relative w-full h-full flex items-center justify-center p-1.5 lg:p-4 lg:pb-14"
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
                  <Suspense fallback={null}>
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
                  </Suspense>

                  {mode === "split" && !isHoldingBefore && (
                    <SplitDivider
                      splitPos={splitPos}
                      splitDirection={splitDirection}
                      splitLineWrapperRef={splitLineWrapperRef}
                      splitHandleRef={splitHandleRef}
                    />
                  )}
                </div>
              </div>
            )}

            {!showWebGL &&
              (mode === "side" ? (
                <div className="grid grid-cols-2 gap-1.5 w-full h-full items-center">
                  <div className="relative h-full flex items-center justify-center bg-black/40 overflow-hidden border border-white/[0.06]">
                    <img
                      src={originalImage}
                      alt={t("preview.before")}
                      className="w-full h-full max-h-full object-contain"
                    />
                  </div>
                  <div className="relative h-full flex items-center justify-center bg-black/40 overflow-hidden border border-white/[0.06]">
                    <canvas
                      ref={gradedCanvasRef}
                      className={`w-full h-full max-h-full object-contain ${
                        isHoldingBefore ? "hidden" : "block"
                      }`}
                    />
                    {isHoldingBefore && (
                      <img
                        src={originalImage}
                        alt={t("preview.beforePeek")}
                        className="w-full h-full max-h-full object-contain"
                      />
                    )}
                  </div>
                </div>
              ) : mode === "result" ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <canvas
                    ref={gradedCanvasRef}
                    className={`w-full h-full max-h-full object-contain ${
                      isHoldingBefore ? "hidden" : "block"
                    }`}
                  />
                  {isHoldingBefore && (
                    <img
                      src={originalImage}
                      alt={t("preview.beforePeek")}
                      className="w-full h-full max-h-full object-contain"
                    />
                  )}
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
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Single Unified Viewport Corner Badges (Never Duplicated Across WebGL / CPU / Zoom) */}
        {hasImage && (
          <CornerBadges
            mode={mode}
            isHoldingBefore={isHoldingBefore}
            splitDirection={splitDirection}
          />
        )}

        {/* Compact Top Strip when Reference is previewed but no Target image is loaded yet */}
        <AnimatePresence>
          {hasImage && !hasTargetImage && (
            <motion.div
              key="studio-no-target-banner"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-[92%] inline-flex flex-wrap items-center justify-center gap-2 px-3 py-1.5 rounded-full bg-[#11161F]/94 backdrop-blur-md border border-[#AAB7C5]/18 shadow-[0_8px_24px_rgba(0,0,0,0.65)] text-[11px]"
            >
              <span className="font-mono tabular-nums text-[10px] text-[#93B8D8]">01</span>
              <span className="text-[#F4F7FB] font-sans font-medium">{t("preview.loadATargetPhoto")}</span>
              {onLoadSamplePhoto && (
                <button
                  type="button"
                  onClick={onLoadSamplePhoto}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#F4F7FB] hover:bg-[#FBFDFF] text-[#0A0C10] font-sans font-semibold text-[10.5px] cursor-pointer transition-colors"
                >
                  <ImageIcon className="w-2.5 h-2.5" />
                  <span>{t("preview.loadSamplePhoto")}</span>
                </button>
              )}
              {onOpenGuide && (
                <button
                  type="button"
                  onClick={onOpenGuide}
                  className="inline-flex items-center gap-0.5 text-[10.5px] font-sans font-medium text-[#C9D7E2] hover:text-[#F4F7FB] cursor-pointer transition-colors"
                >
                  <span>{t("preview.howToUse")}</span>
                  <ArrowRight className="w-2.5 h-2.5" />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Contextual Step-02 Guidance Pill when Target is loaded and grade is still neutral */}
        <AnimatePresence>
          {showStep2GuidancePill && !pixelReadout && zoom <= 1.001 && (
            <motion.div
              key="studio-step02-guidance"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-[94%] inline-flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-full bg-[#11161F]/95 backdrop-blur-md border border-[#AAB7C5]/18 shadow-[0_8px_24px_rgba(0,0,0,0.68)] text-[11px]"
            >
              <span className="font-mono tabular-nums text-[10px] font-semibold text-[#93B8D8]">
                02
              </span>
              <span className="text-[#F4F7FB] font-sans font-medium">
                {t("preview.step02Guidance")}
              </span>
              {onLoadSampleReference && (
                <button
                  type="button"
                  onClick={onLoadSampleReference}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#F4F7FB] hover:bg-[#FBFDFF] text-[#0A0C10] font-sans font-semibold text-[10.5px] cursor-pointer transition-colors"
                >
                  <ImageIcon className="w-2.5 h-2.5" />
                  <span>{t("preview.sampleRefBtn")}</span>
                </button>
              )}
              {onOpenLooks && (
                <button
                  type="button"
                  onClick={onOpenLooks}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0A0C10]/70 hover:bg-[#1C2430] border border-[#AAB7C5]/18 text-[#C9D7E2] hover:text-[#F4F7FB] font-sans font-medium text-[10.5px] cursor-pointer transition-colors"
                >
                  <Bookmark className="w-2.5 h-2.5 text-[#93B8D8]" />
                  <span>{t("nav.looks")}</span>
                </button>
              )}
              {onImportPreset && (
                <button
                  type="button"
                  onClick={onImportPreset}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0A0C10]/70 hover:bg-[#1C2430] border border-[#AAB7C5]/18 text-[#C9D7E2] hover:text-[#F4F7FB] font-mono text-[10px] cursor-pointer transition-colors"
                >
                  <Upload className="w-2.5 h-2.5 text-[#AAB7C5]" />
                  <span>.cube / .lut</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setDismissedStep2ForImage(currentTargetKey)}
                aria-label={t("preview.dismissGuidanceAria")}
                className="p-0.5 rounded-full text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] cursor-pointer transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Steel Night Calibration Scanline Sweep (420ms on Look/Preset/Import/Reset) */}
        {scanlineKey > 0 && scanlineKey !== completedScanKey && (
          <div key={scanlineKey} aria-hidden="true" className="studio-scanline-overlay">
            <div
              className="studio-scanline-sweep"
              onAnimationEnd={() => setCompletedScanKey(scanlineKey)}
            />
          </div>
        )}

        {/* Eyedropper Reticle */}
        {isEyedropperActive && reticlePos && hasImage && mode !== "side" && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-30 w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#F4F7FB]/90 shadow-[0_0_8px_rgba(0,0,0,0.85)] flex items-center justify-center"
            style={{
              left: `${reticlePos.x}px`,
              top: `${reticlePos.y}px`,
            }}
          >
            <span className="w-1 h-1 rounded-full bg-[#F4F7FB]" />
          </div>
        )}

        {/* Optical Pixel Loupe (2x / 4x) */}
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
            <div className="relative w-full h-full rounded-full overflow-hidden border border-[#C9D7E2]/60 shadow-[0_12px_32px_rgba(0,0,0,0.8)]">
              <canvas
                ref={loupeCanvasRef}
                width={LOUPE_SIZE}
                height={LOUPE_SIZE}
                className="w-full h-full block"
                style={{ imageRendering: "pixelated" }}
              />
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-x-0 top-1/2 h-px bg-[#F4F7FB]/30" />
                <div className="absolute inset-y-0 left-1/2 w-px bg-[#F4F7FB]/30" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 border border-[#F4F7FB]/85" />
                <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0 rounded-full bg-[#0A0C10]/88 border border-[#AAB7C5]/25 text-[9px] font-mono text-[#F4F7FB]">
                  {loupeZoom}x
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Reset Zoom Pill when pinched > 1.0x */}
        {zoom > 1.001 && hasImage && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleResetZoom();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-2.5 py-1 rounded-full bg-[#11161F]/92 hover:bg-[#1C2430] border border-[#AAB7C5]/18 text-[10px] font-mono text-[#F4F7FB] flex items-center gap-1.5 cursor-pointer backdrop-blur-md"
          >
            <RotateCcw className="w-3 h-3 text-[#93B8D8]" />
            <span>{zoom.toFixed(1)}x · Reset</span>
            <kbd className="hidden lg:inline-flex keycap-hint">Esc</kbd>
          </button>
        )}

        {/* RGB / IRE Pixel Readout (positioned cleanly above dock) */}
        {pixelReadout && hasImage && mode !== "side" && (
          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20 px-2.5 py-1 rounded-full bg-[#11161F]/90 backdrop-blur-md border border-[#AAB7C5]/18 text-[10px] font-mono tabular-nums text-[#C9D7E2] flex items-center gap-2 whitespace-nowrap">
            <span className="text-[#AAB7C5]">
              IN {pixelReadout.r}/{pixelReadout.g}/{pixelReadout.b} · {pixelReadout.beforeIre} IRE
            </span>
            <span className="text-[#AAB7C5]/30">|</span>
            <span className="text-[#F4F7FB]">
              OUT {pixelReadout.gr}/{pixelReadout.gg}/{pixelReadout.gb} · {pixelReadout.gradedIre} IRE
            </span>
          </div>
        )}

        {/* Floating Translucent Steel-Night Dock (Desktop lg+) */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className="hidden lg:block absolute bottom-3 left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-20px)] overflow-x-auto no-scrollbar rounded-full backdrop-blur-md bg-[#11161F]/88 border border-[#AAB7C5]/16 px-1.5 py-1 shadow-[inset_0_1px_0_rgba(244,247,251,0.08),0_12px_32px_rgba(0,0,0,0.7)]"
        >
          <div className="flex items-center gap-0.5 w-max">
            {/* View Mode Group */}
            <button
              type="button"
              onClick={() => onModeChange?.("split")}
              className={`${dockBtnBase} ${
                mode === "split"
                  ? "bg-[#F4F7FB] text-[#0A0C10] font-semibold"
                  : "text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430]"
              }`}
            >
              <span className="hidden sm:inline">Split Slider</span>
              <span className="sm:hidden">Split</span>
            </button>
            {mode === "split" && hasImage && (
              <button
                type="button"
                onClick={handleToggleSplitDirection}
                title={t("preview.splitOrientationTitle")}
                aria-label={t("preview.splitOrientationTitle")}
                className="w-6 h-6 rounded-full inline-flex items-center justify-center text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] transition-colors cursor-pointer"
              >
                {splitDirection === "vertical" ? (
                  <MoveHorizontal className="w-3 h-3" />
                ) : (
                  <MoveVertical className="w-3 h-3" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => onModeChange?.("side")}
              className={`${dockBtnBase} ${
                mode === "side"
                  ? "bg-[#F4F7FB] text-[#0A0C10] font-semibold"
                  : "text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430]"
              }`}
            >
              <span className="hidden sm:inline">Side-by-Side</span>
              <span className="sm:hidden">Side</span>
            </button>
            <button
              type="button"
              onClick={() => onModeChange?.("result")}
              className={`${dockBtnBase} ${
                mode === "result"
                  ? "bg-[#F4F7FB] text-[#0A0C10] font-semibold"
                  : "text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430]"
              }`}
            >
              <span className="hidden sm:inline">Graded Only</span>
              <span className="sm:hidden">Graded</span>
            </button>

            <span className="w-px h-3.5 bg-[#AAB7C5]/18 mx-1 shrink-0" />

            {/* Loupe Magnification: 2x / 4x */}
            {[2, 4].map((lvl) => (
              <button
                key={lvl}
                type="button"
                disabled={!hasImage || mode === "side"}
                onClick={() => toggleLoupe(lvl)}
                title={`${lvl}x Pixel Loupe`}
                className={`${dockBtnBase} font-mono ${
                  !hasImage || mode === "side"
                    ? "text-[#AAB7C5]/35 cursor-not-allowed"
                    : loupeZoom === lvl
                    ? "bg-[#4A6B86]/38 text-[#F4F7FB]"
                    : "text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430]"
                }`}
              >
                {lvl}x
              </button>
            ))}

            <span className="w-px h-3.5 bg-[#AAB7C5]/18 mx-1 shrink-0" />

            {/* GPU Monitor Overlays: Zebra / IRE / Gamut */}
            <button
              type="button"
              disabled={!hasImage || !showWebGL}
              onClick={() => toggleMonitor("zebra")}
              title="Zebra Clipping Overlay (>98 / <2 IRE)"
              className={`${dockBtnBase} ${
                !hasImage || !showWebGL
                  ? "text-[#AAB7C5]/35 cursor-not-allowed"
                  : monitorMode === "zebra"
                  ? "bg-[#4A6B86]/38 text-[#F4F7FB]"
                  : "text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430]"
              }`}
            >
              Zebra
            </button>
            <button
              type="button"
              disabled={!hasImage || !showWebGL}
              onClick={() => toggleMonitor("falsecolor")}
              title="False Color IRE Exposure Map"
              className={`${dockBtnBase} ${
                !hasImage || !showWebGL
                  ? "text-[#AAB7C5]/35 cursor-not-allowed"
                  : monitorMode === "falsecolor"
                  ? "bg-[#4A6B86]/38 text-[#F4F7FB]"
                  : "text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430]"
              }`}
            >
              IRE
            </button>
            <button
              type="button"
              disabled={!hasImage || !showWebGL}
              onClick={() => toggleMonitor("gamut")}
              title="Rec.709 Gamut Warning Overlay"
              className={`${dockBtnBase} ${
                !hasImage || !showWebGL
                  ? "text-[#AAB7C5]/35 cursor-not-allowed"
                  : monitorMode === "gamut"
                  ? "bg-[#4A6B86]/38 text-[#F4F7FB]"
                  : "text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430]"
              }`}
            >
              Gamut
            </button>

            <button
              type="button"
              disabled={!hasImage || mode === "side"}
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
              className={`${dockBtnBase} ${
                !hasImage || mode === "side"
                  ? "text-[#AAB7C5]/35 cursor-not-allowed"
                  : isEyedropperActive
                  ? "bg-[#4A6B86]/38 text-[#F4F7FB]"
                  : "text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430]"
              }`}
            >
              <Pipette className="w-3 h-3" />
            </button>

            <span className="w-px h-3.5 bg-[#AAB7C5]/18 mx-1 shrink-0" />

            {/* Hold Before Peek */}
            <button
              type="button"
              disabled={!hasImage}
              onMouseDown={() => hasImage && setIsHoldingBefore(true)}
              onMouseUp={() => setIsHoldingBefore(false)}
              onMouseLeave={() => setIsHoldingBefore(false)}
              onTouchStart={() => hasImage && setIsHoldingBefore(true)}
              onTouchEnd={() => setIsHoldingBefore(false)}
              onTouchCancel={() => setIsHoldingBefore(false)}
              onContextMenu={(e) => e.preventDefault()}
              title={t("preview.holdBeforeTitle")}
              className={`${dockBtnBase} ${
                !hasImage
                  ? "text-[#AAB7C5]/35 cursor-not-allowed"
                  : isHoldingBefore
                  ? "bg-[#F4F7FB] text-[#0A0C10] font-semibold"
                  : "text-[#C9D7E2] hover:text-[#F4F7FB] hover:bg-[#1C2430]"
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>Hold Before</span>
              <kbd
                className={`keycap-hint ${
                  isHoldingBefore
                    ? "!bg-black/15 !border-black/25 !text-[#0A0C10] !shadow-none"
                    : ""
                }`}
              >
                B
              </kbd>
            </button>

            {/* 1-Click Quick Save Frame */}
            {onQuickSaveFrame && (
              <button
                type="button"
                disabled={!hasImage || isSavingImage}
                onClick={handleQuickSaveClick}
                title="Quick Save Frame (PNG)"
                aria-label="Quick Save Frame (PNG)"
                className={`w-6 h-6 rounded-full inline-flex items-center justify-center transition-colors ${
                  !hasImage || isSavingImage
                    ? "text-[#AAB7C5]/35 cursor-not-allowed"
                    : quickSaved
                    ? "bg-[#4A6B86]/35 text-[#93B8D8] cursor-pointer"
                    : "text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] cursor-pointer"
                }`}
              >
                {quickSaved ? (
                  <Check className="w-3 h-3 stroke-[2.5]" />
                ) : (
                  <Camera className="w-3 h-3" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile (<lg) Thumb-Friendly Essential Control Bar + View Popover */}
      <div
        ref={mobileViewRef}
        className="lg:hidden relative z-30 shrink-0 bg-[#0D1118] border-t border-[#AAB7C5]/14 px-2.5 pt-1.5 pb-2"
      >
        <div className="flex items-center justify-between gap-1 min-h-[44px] overflow-x-auto no-scrollbar">
          {/* Primary Essentials: Split, Graded, Hold Before, View */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onModeChange?.("split")}
              className={`${mobilePillBtn} ${
                mode === "split"
                  ? "bg-[#F4F7FB] text-[#0A0C10] font-semibold"
                  : "bg-[#11161F] text-[#AAB7C5] hover:text-[#F4F7FB] border border-[#AAB7C5]/14"
              }`}
            >
              {t("preview.splitShort")}
            </button>
            <button
              type="button"
              onClick={() => onModeChange?.("result")}
              className={`${mobilePillBtn} ${
                mode === "result"
                  ? "bg-[#F4F7FB] text-[#0A0C10] font-semibold"
                  : "bg-[#11161F] text-[#AAB7C5] hover:text-[#F4F7FB] border border-[#AAB7C5]/14"
              }`}
            >
              {t("preview.gradedShort")}
            </button>
            <button
              type="button"
              disabled={!hasImage}
              onMouseDown={() => hasImage && setIsHoldingBefore(true)}
              onMouseUp={() => setIsHoldingBefore(false)}
              onMouseLeave={() => setIsHoldingBefore(false)}
              onTouchStart={() => hasImage && setIsHoldingBefore(true)}
              onTouchEnd={() => setIsHoldingBefore(false)}
              onTouchCancel={() => setIsHoldingBefore(false)}
              onContextMenu={(e) => e.preventDefault()}
              className={`${mobilePillBtn} touch-none ${
                !hasImage
                  ? "bg-[#11161F]/50 text-[#AAB7C5]/35 border border-[#AAB7C5]/10 cursor-not-allowed"
                  : isHoldingBefore
                  ? "bg-[#F4F7FB] text-[#0A0C10] font-semibold"
                  : "bg-[#11161F] text-[#C9D7E2] hover:text-[#F4F7FB] border border-[#AAB7C5]/16"
              }`}
            >
              <Eye className="w-3 h-3 shrink-0" />
              <span>{t("preview.holdBefore")}</span>
            </button>
            <button
              type="button"
              aria-expanded={isMobileViewOpen}
              aria-haspopup="true"
              onClick={() => setIsMobileViewOpen((v) => !v)}
              className={`${mobilePillBtn} relative border ${
                isMobileViewOpen || hasSecondaryViewActive
                  ? "bg-[#1C2430] text-[#F4F7FB] border-[#4A6B86]/65"
                  : "bg-[#11161F] text-[#AAB7C5] hover:text-[#F4F7FB] border border-[#AAB7C5]/14"
              }`}
            >
              <span>{t("preview.viewShort")}</span>
              {hasSecondaryViewActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#93B8D8]" aria-hidden="true" />
              )}
              <ChevronDown
                className={`w-3 h-3 transition-transform duration-150 ${
                  isMobileViewOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>

          {/* History + Re-match Essentials */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onUndo?.()}
              disabled={!canUndo}
              aria-label={t("paramsCard.undoTitle")}
              title={t("paramsCard.undoTitle")}
              className={`min-h-[44px] min-w-[44px] rounded-full inline-flex items-center justify-center border transition-colors ${
                canUndo
                  ? "bg-[#11161F] text-[#C9D7E2] hover:text-[#F4F7FB] border-[#AAB7C5]/16 cursor-pointer"
                  : "bg-transparent text-[#AAB7C5]/35 border-[#AAB7C5]/10 cursor-not-allowed"
              }`}
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onRedo?.()}
              disabled={!canRedo}
              aria-label={t("paramsCard.redoTitle")}
              title={t("paramsCard.redoTitle")}
              className={`min-h-[44px] min-w-[44px] rounded-full inline-flex items-center justify-center border transition-colors ${
                canRedo
                  ? "bg-[#11161F] text-[#C9D7E2] hover:text-[#F4F7FB] border-[#AAB7C5]/16 cursor-pointer"
                  : "bg-transparent text-[#AAB7C5]/35 border-[#AAB7C5]/10 cursor-not-allowed"
              }`}
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onRematch?.()}
              disabled={!canRematch || isAnalyzing}
              className={`min-h-[44px] px-3 rounded-full text-[11px] font-sans font-medium inline-flex items-center gap-1 border transition-colors whitespace-nowrap ${
                !canRematch || isAnalyzing
                  ? "bg-[#11161F]/50 text-[#AAB7C5]/35 border-[#AAB7C5]/10 cursor-not-allowed"
                  : reloadedFeedback
                  ? "bg-[#F4F7FB] text-[#0A0C10] border-[#F4F7FB] cursor-pointer"
                  : "bg-[#11161F] text-[#C9D7E2] hover:text-[#F4F7FB] border-[#AAB7C5]/16 cursor-pointer"
              }`}
            >
              {reloadedFeedback ? (
                <>
                  <Check className="w-3 h-3" />
                  <span>{t("preview.matchedShort")}</span>
                </>
              ) : (
                <>
                  <RefreshCw className={`w-3 h-3 ${isAnalyzing ? "animate-spin" : ""}`} />
                  <span>{t("preview.rematchShort")}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Compact View Inspection Popover */}
        {isMobileViewOpen && (
          <div className="absolute left-2 right-2 sm:left-auto sm:right-2 sm:w-[300px] top-full mt-1.5 z-50 rounded-xl bg-[#11161F]/98 backdrop-blur-xl border border-[#AAB7C5]/18 shadow-[0_18px_42px_rgba(0,0,0,0.88)] p-2.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#AAB7C5]/14">
              <span className="text-[10px] font-sans font-semibold uppercase tracking-[0.08em] text-[#AAB7C5]">
                {t("preview.viewAndInspection")}
              </span>
              {onQuickSaveFrame && (
                <button
                  type="button"
                  disabled={!hasImage || isSavingImage}
                  onClick={handleQuickSaveClick}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border transition-colors ${
                    !hasImage || isSavingImage
                      ? "text-[#AAB7C5]/35 border-[#AAB7C5]/10 cursor-not-allowed"
                      : quickSaved
                      ? "bg-[#4A6B86]/30 text-[#93B8D8] border-[#7FA3C2]/45"
                      : "bg-[#0A0C10] text-[#C9D7E2] border-[#AAB7C5]/16 cursor-pointer"
                  }`}
                >
                  {quickSaved ? <Check className="w-3 h-3" /> : <Camera className="w-3 h-3" />}
                  <span>{quickSaved ? "Saved" : "Save PNG"}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onModeChange?.(mode === "side" ? "split" : "side");
                }}
                className={`min-h-[36px] px-2 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                  mode === "side"
                    ? "bg-[#F4F7FB] text-[#0A0C10] border-[#F4F7FB] font-semibold"
                    : "bg-[#0A0C10] text-[#C9D7E2] border-[#AAB7C5]/14"
                }`}
              >
                Side
              </button>
              {[2, 4].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  disabled={!hasImage || mode === "side"}
                  onClick={() => toggleLoupe(lvl)}
                  className={`min-h-[36px] px-2 rounded-lg text-[11px] font-mono border transition-colors ${
                    !hasImage || mode === "side"
                      ? "bg-[#0A0C10]/40 text-[#AAB7C5]/35 border-[#AAB7C5]/10 cursor-not-allowed"
                      : loupeZoom === lvl
                      ? "bg-[#4A6B86]/35 text-[#F4F7FB] border-[#7FA3C2]/55 cursor-pointer"
                      : "bg-[#0A0C10] text-[#C9D7E2] border-[#AAB7C5]/14 cursor-pointer"
                  }`}
                >
                  {lvl}x
                </button>
              ))}
              <button
                type="button"
                disabled={!hasImage || mode !== "split"}
                onClick={handleToggleSplitDirection}
                className={`min-h-[36px] px-2 rounded-lg text-[11px] font-mono inline-flex items-center justify-center gap-1 border transition-colors ${
                  !hasImage || mode !== "split"
                    ? "bg-[#0A0C10]/40 text-[#AAB7C5]/35 border-[#AAB7C5]/10 cursor-not-allowed"
                    : "bg-[#0A0C10] text-[#C9D7E2] border-[#AAB7C5]/14 cursor-pointer"
                }`}
              >
                {splitDirection === "vertical" ? (
                  <MoveHorizontal className="w-3 h-3" />
                ) : (
                  <MoveVertical className="w-3 h-3" />
                )}
                <span>{splitDirection === "vertical" ? "H" : "V"}</span>
              </button>

              <button
                type="button"
                disabled={!hasImage || !showWebGL}
                onClick={() => toggleMonitor("zebra")}
                className={`min-h-[36px] px-2 rounded-lg text-[11px] font-medium border transition-colors ${
                  !hasImage || !showWebGL
                    ? "bg-[#0A0C10]/40 text-[#AAB7C5]/35 border-[#AAB7C5]/10 cursor-not-allowed"
                    : monitorMode === "zebra"
                    ? "bg-[#4A6B86]/35 text-[#F4F7FB] border-[#7FA3C2]/55 cursor-pointer"
                    : "bg-[#0A0C10] text-[#C9D7E2] border-[#AAB7C5]/14 cursor-pointer"
                }`}
              >
                Zebra
              </button>
              <button
                type="button"
                disabled={!hasImage || !showWebGL}
                onClick={() => toggleMonitor("falsecolor")}
                className={`min-h-[36px] px-2 rounded-lg text-[11px] font-medium border transition-colors ${
                  !hasImage || !showWebGL
                    ? "bg-[#0A0C10]/40 text-[#AAB7C5]/35 border-[#AAB7C5]/10 cursor-not-allowed"
                    : monitorMode === "falsecolor"
                    ? "bg-[#4A6B86]/35 text-[#F4F7FB] border-[#7FA3C2]/55 cursor-pointer"
                    : "bg-[#0A0C10] text-[#C9D7E2] border-[#AAB7C5]/14 cursor-pointer"
                }`}
              >
                IRE
              </button>
              <button
                type="button"
                disabled={!hasImage || !showWebGL}
                onClick={() => toggleMonitor("gamut")}
                className={`min-h-[36px] px-2 rounded-lg text-[11px] font-medium border transition-colors ${
                  !hasImage || !showWebGL
                    ? "bg-[#0A0C10]/40 text-[#AAB7C5]/35 border-[#AAB7C5]/10 cursor-not-allowed"
                    : monitorMode === "gamut"
                    ? "bg-[#4A6B86]/35 text-[#F4F7FB] border-[#7FA3C2]/55 cursor-pointer"
                    : "bg-[#0A0C10] text-[#C9D7E2] border-[#AAB7C5]/14 cursor-pointer"
                }`}
              >
                Gamut
              </button>
              <button
                type="button"
                disabled={!hasImage || mode === "side"}
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
                className={`min-h-[36px] px-2 rounded-lg text-[11px] font-medium inline-flex items-center justify-center gap-1 border transition-colors ${
                  !hasImage || mode === "side"
                    ? "bg-[#0A0C10]/40 text-[#AAB7C5]/35 border-[#AAB7C5]/10 cursor-not-allowed"
                    : isEyedropperActive
                    ? "bg-[#4A6B86]/35 text-[#F4F7FB] border-[#7FA3C2]/55 cursor-pointer"
                    : "bg-[#0A0C10] text-[#C9D7E2] border-[#AAB7C5]/14 cursor-pointer"
                }`}
              >
                <Pipette className="w-3 h-3" />
                <span>Pick</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Video Transport + Telemetry Footer */}
      {footer}
    </div>
  );
}
