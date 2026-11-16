import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Sliders,
  Settings,
  Info,
  Sun,
  Contrast,
  SlidersHorizontal,
  Droplet,
  Sparkles,
  Thermometer,
  Palette,
  Activity,
  Layers,
  RotateCcw,
  Heart,
  ChevronDown,
  Cpu,
  CheckCircle2,
  RefreshCw,
  History,
  Check,
  Play,
  HelpCircle,
  Gauge,
} from "lucide-react";

import ImageDropCard, { ALLOWED_IMAGE_MIMES } from "./components/ImageDropCard";
import ComparisonSlider from "./components/ComparisonSlider";
import ParameterControl from "./components/ParameterControl";
import ColorSwatchCard from "./components/ColorSwatchCard";
import ExportCard from "./components/ExportCard";
import SupportTab from "./components/SupportTab";
import SupportToast from "./components/SupportToast";
import ProScopes from "./components/ProScopes";
import ShortcutsModal from "./components/ShortcutsModal";
import KeyflowLogo, { TfbagasWordmark } from "./components/KeyflowLogo";
import ChangelogModal, {
  ReleaseHistoryAccordion,
} from "./components/ChangelogModal";
import M3Select from "./components/M3Select";
import SplashIntro from "./components/SplashIntro";
import { usePillIndicator } from "./hooks/usePillIndicator";
import {
  DEFAULT_PARAMS,
  analyzeImagePixels,
  simulateGradePixels,
} from "./utils/colorGrading";
import { scaleParamsByStrength } from "./utils/gradeEngine";
import {
  generateKfplug,
  downloadBlob,
  sanitizeMetadataText,
} from "./utils/kfplugPackager";
import { inspectFile, prepareImageBlob } from "./utils/rawDecoder";
import { generateLutFile } from "./utils/lutExporter";
import { exportGradedImage } from "./utils/imageExporter";
import { importLutFile, importKfplugFile } from "./utils/presetImporter";
import { SAMPLE_LOOKS, renderLookSample, drawNeutralScene } from "./utils/sampleLooks";
import VideoTransportBar from "./components/VideoTransportBar";

const PARAM_CONTROLS = [
  { key: "exposure", label: "Exposure (EV)", min: -2.0, max: 2.0, step: 0.02, icon: Sun, isBipolar: true },
  { key: "contrast", label: "Contrast", min: 0.5, max: 2.0, step: 0.02, icon: Contrast, isBipolar: true },
  { key: "pivot", label: "Contrast Pivot", min: 0.1, max: 0.9, step: 0.02, icon: SlidersHorizontal, isBipolar: false },
  { key: "shadows", label: "Shadows Tint/Level", min: -0.5, max: 0.5, step: 0.02, icon: Droplet, isBipolar: true },
  { key: "highlights", label: "Highlights Tint/Level", min: -0.5, max: 0.5, step: 0.02, icon: Sparkles, isBipolar: true },
  { key: "temp", label: "Color Temperature", min: -1.0, max: 1.0, step: 0.02, icon: Thermometer, isBipolar: true },
  { key: "tint", label: "Color Tint", min: -1.0, max: 1.0, step: 0.02, icon: Palette, isBipolar: true },
  { key: "sat", label: "Saturation", min: 0.0, max: 2.0, step: 0.02, icon: Droplet, isBipolar: true },
  { key: "vib", label: "Vibrance", min: -0.8, max: 0.8, step: 0.02, icon: Activity, isBipolar: true },
];

const CALIBRATION_STORAGE_KEY = "kf_export_calibration_v1";
const SEEN_UPDATE_STORAGE_KEY = "kf_seen_update_v080";
const SPLASH_SESSION_KEY = "kf_splash_seen_v080";
const DEFAULT_CALIBRATION = {
  toneScale: 1.0,
  wbScale: 1.0,
  chromaScale: 1.0,
};

function clampVal(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function applyCalibrationToParams(params, cal) {
  const tS = cal?.toneScale ?? 1.0;
  const wS = cal?.wbScale ?? 1.0;
  const cS = cal?.chromaScale ?? 1.0;

  return {
    ...params,
    exposure: round2(clampVal((params.exposure ?? 0) * tS, -2.0, 2.0)),
    contrast: round2(clampVal(1.0 + ((params.contrast ?? 1.0) - 1.0) * tS, 0.5, 2.0)),
    shadows: round2(clampVal((params.shadows ?? 0) * tS, -0.5, 0.5)),
    highlights: round2(clampVal((params.highlights ?? 0) * tS, -0.5, 0.5)),
    liftR: round2(clampVal(0.5 + ((params.liftR ?? 0.5) - 0.5) * tS, 0.0, 1.0)),
    liftG: round2(clampVal(0.5 + ((params.liftG ?? 0.5) - 0.5) * tS, 0.0, 1.0)),
    liftB: round2(clampVal(0.5 + ((params.liftB ?? 0.5) - 0.5) * tS, 0.0, 1.0)),
    gammaR: round2(clampVal(0.5 + ((params.gammaR ?? 0.5) - 0.5) * tS, 0.0, 1.0)),
    gammaG: round2(clampVal(0.5 + ((params.gammaG ?? 0.5) - 0.5) * tS, 0.0, 1.0)),
    gammaB: round2(clampVal(0.5 + ((params.gammaB ?? 0.5) - 0.5) * tS, 0.0, 1.0)),
    gainR: round2(clampVal(0.5 + ((params.gainR ?? 0.5) - 0.5) * tS, 0.0, 1.0)),
    gainG: round2(clampVal(0.5 + ((params.gainG ?? 0.5) - 0.5) * tS, 0.0, 1.0)),
    gainB: round2(clampVal(0.5 + ((params.gainB ?? 0.5) - 0.5) * tS, 0.0, 1.0)),
    temp: round2(clampVal((params.temp ?? 0) * wS, -1.0, 1.0)),
    tint: round2(clampVal((params.tint ?? 0) * wS, -1.0, 1.0)),
    sat: round2(clampVal(1.0 + ((params.sat ?? 1.0) - 1.0) * cS, 0.0, 2.0)),
    vib: round2(clampVal((params.vib ?? 0) * cS, -0.8, 0.8)),
  };
}

function drawHistogram(canvas, imageData) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  [0.25, 0.5, 0.75].forEach((p) => {
    const x = Math.round(w * p) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  });

  if (!imageData || !imageData.data) {
    return;
  }

  const data = imageData.data;
  const rHist = new Uint32Array(256);
  const gHist = new Uint32Array(256);
  const bHist = new Uint32Array(256);
  const yHist = new Uint32Array(256);

  const step = 8;
  for (let i = 0; i < data.length; i += step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    rHist[r]++;
    gHist[g]++;
    bHist[b]++;
    const y = Math.min(255, Math.max(0, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)));
    yHist[y]++;
  }

  let maxCount = 1;
  for (let i = 2; i < 254; i++) {
    if (rHist[i] > maxCount) maxCount = rHist[i];
    if (gHist[i] > maxCount) maxCount = gHist[i];
    if (bHist[i] > maxCount) maxCount = bHist[i];
    if (yHist[i] > maxCount) maxCount = yHist[i];
  }

  const drawChannel = (hist, strokeColor, fillColor) => {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * w;
      const norm = Math.min(1, hist[i] / maxCount);
      const y = h - norm * (h - 6);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * w;
      const norm = Math.min(1, hist[i] / maxCount);
      const y = h - norm * (h - 6);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.25;
    ctx.stroke();
  };

  ctx.globalCompositeOperation = "screen";
  drawChannel(rHist, "rgba(248, 113, 113, 0.75)", "rgba(248, 113, 113, 0.14)");
  drawChannel(gHist, "rgba(74, 222, 128, 0.75)", "rgba(74, 222, 128, 0.14)");
  drawChannel(bHist, "rgba(96, 165, 250, 0.75)", "rgba(96, 165, 250, 0.14)");
  drawChannel(yHist, "rgba(226, 228, 233, 0.85)", "rgba(226, 228, 233, 0.08)");
  ctx.globalCompositeOperation = "source-over";
}

function toRgbCss(r = 0.5, g = 0.5, b = 0.5) {
  const cb = (v) => Math.max(0, Math.min(255, Math.round((v ?? 0.5) * 255)));
  return `rgb(${cb(r)}, ${cb(g)}, ${cb(b)})`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [showSplash, setShowSplash] = useState(() => {
    try {
      return sessionStorage.getItem(SPLASH_SESSION_KEY) !== "true";
    } catch {
      return true;
    }
  });
  const [workspacePhase, setWorkspacePhase] = useState(() => {
    try {
      return sessionStorage.getItem(SPLASH_SESSION_KEY) !== "true"
        ? "hidden"
        : "settled";
    } catch {
      return "hidden";
    }
  });
  const [cascadeKey, setCascadeKey] = useState(0);
  const settleTimerRef = useRef(null);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [hasUnreadUpdate, setHasUnreadUpdate] = useState(() => {
    try {
      return localStorage.getItem(SEEN_UPDATE_STORAGE_KEY) !== "true";
    } catch {
      return true;
    }
  });
  const [isWheelsExpanded, setIsWheelsExpanded] = useState(true);

  const [referenceImage, setReferenceImage] = useState(null);
  const [targetImage, setTargetImage] = useState(null);
  const [referenceError, setReferenceError] = useState("");
  const [targetError, setTargetError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusText, setStatusText] = useState("Ready");
  const [importedLook, setImportedLook] = useState(null);
  const targetRef = useRef(null);
  const referenceRef = useRef(null);
  const triggerAnalysisRef = useRef(() => {});
  targetRef.current = targetImage;
  referenceRef.current = referenceImage;

  const [hoveredSlot, setHoveredSlot] = useState(null);
  const [focusedSlot, setFocusedSlot] = useState(null);

  // Grading parameters & last matched Reference snapshot (includes 9 sliders + 9 color wheel channels)
  const [gradingParams, setGradingParams] = useState({ ...DEFAULT_PARAMS });
  const [matchStrength, setMatchStrength] = useState(100);
  const [activeSlot, setActiveSlot] = useState("A");
  const [slotSnapshots, setSlotSnapshots] = useState({
    A: { ...DEFAULT_PARAMS },
    B: { ...DEFAULT_PARAMS },
  });
  const [isPreviewPinned, setIsPreviewPinned] = useState(true);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isSavingFrame, setIsSavingFrame] = useState(false);
  const [simulateLogInput, setSimulateLogInput] = useState(false);
  const [scopeImageData, setScopeImageData] = useState(null);
  const [lastMatchedParams, setLastMatchedParams] = useState(null);
  const [reloadedFeedback, setReloadedFeedback] = useState(false);

  const effectiveParams = useMemo(
    () => scaleParamsByStrength(gradingParams, matchStrength),
    [gradingParams, matchStrength]
  );

  const [previewMode, setPreviewMode] = useState("split");

  const [presetName, setPresetName] = useState("");
  const [authorName, setAuthorName] = useState("TFBAGAS");
  const [description, setDescription] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportToast, setExportToast] = useState({ visible: false, filename: "" });

  const [analysisMaxDim, setAnalysisMaxDim] = useState(1280);
  const [previewMaxDim, setPreviewMaxDim] = useState(960);

  const [calibration, setCalibration] = useState(() => {
    try {
      const saved = localStorage.getItem(CALIBRATION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          toneScale: Number(parsed.toneScale) || 1.0,
          wbScale: Number(parsed.wbScale) || 1.0,
          chromaScale: Number(parsed.chromaScale) || 1.0,
        };
      }
    } catch {
      // ignore storage errors
    }
    return { ...DEFAULT_CALIBRATION };
  });

  const [calibrationStatus, setCalibrationStatus] = useState({
    running: false,
    message: "Calibrated • Canvas & Worker OK",
    deltaE: "0.00",
    latencyMs: 2,
  });
  const [calibrationTick, setCalibrationTick] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(calibration));
    } catch {
      // ignore storage errors
    }
  }, [calibration]);

  const isCalibrationActive =
    Math.abs(calibration.toneScale - 1.0) > 0.004 ||
    Math.abs(calibration.wbScale - 1.0) > 0.004 ||
    Math.abs(calibration.chromaScale - 1.0) > 0.004;

  const workerRef = useRef(null);
  const analysisTimeoutRef = useRef(null);
  const pendingAnalysisRef = useRef(null);
  const gradedCanvasRef = useRef(null);
  const histogramCanvasRef = useRef(null);
  const previewSourceImageDataRef = useRef(null);
  const lastRenderedImgRef = useRef(null);
  const rafRef = useRef(null);

  const clearAnalysisTimeout = useCallback(() => {
    if (analysisTimeoutRef.current) {
      clearTimeout(analysisTimeoutRef.current);
      analysisTimeoutRef.current = null;
    }
  }, []);

  const runFallbackAnalysisOrReset = useCallback(
    (reasonMsg) => {
      clearAnalysisTimeout();
      const pending = pendingAnalysisRef.current;
      pendingAnalysisRef.current = null;

      if (pending && pending.rgbaData && pending.numPixels > 0) {
        try {
          const fallbackParams = analyzeImagePixels(
            pending.rgbaData,
            pending.numPixels,
            undefined,
            pending.targetRgbaData || null,
            pending.targetNumPixels || 0,
            pending.mediaType || "image"
          );
          setIsAnalyzing(false);
          setGradingParams({ ...fallbackParams });
          setLastMatchedParams({ ...fallbackParams });
          setStatusText("Matched");
          return;
        } catch (err) {
          setReferenceError(
            (err && err.message) || reasonMsg || "Failed to analyze reference image."
          );
        }
      } else if (reasonMsg) {
        setReferenceError(reasonMsg);
      }

      setIsAnalyzing(false);
      setStatusText("Error");
    },
    [clearAnalysisTimeout]
  );

  const handleOpenChangelog = () => {
    setIsChangelogOpen(true);
    setHasUnreadUpdate(false);
    try {
      localStorage.setItem(SEEN_UPDATE_STORAGE_KEY, "true");
    } catch {
      // ignore storage errors
    }
  };

  const handleStartExit = useCallback(() => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
    }
    setCascadeKey((k) => k + 1);
    setWorkspacePhase("morphing-in");
    settleTimerRef.current = setTimeout(() => {
      setWorkspacePhase("settled");
    }, 720);
  }, []);

  const handleSplashComplete = useCallback(() => {
    try {
      sessionStorage.setItem(SPLASH_SESSION_KEY, "true");
    } catch {
      // ignore storage errors
    }
    setShowSplash(false);
    setWorkspacePhase((prev) => (prev === "hidden" ? "settled" : prev));
  }, []);

  useEffect(() => {
    if (!showSplash && workspacePhase === "hidden") {
      setWorkspacePhase("settled");
    }
  }, [showSplash, workspacePhase]);

  const handleReplayIntro = () => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
    }
    setActiveTab("home");
    setWorkspacePhase("hidden");
    setShowSplash(true);
  };

  const initWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    const worker = new Worker(
      new URL("./workers/colorMatchWorker.js", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (e) => {
      const { type, params, stage, error } = e.data || {};
      if (type === "stage") {
        setStatusText(stage || "Analyzing...");
      } else if (type === "success" && params) {
        clearAnalysisTimeout();
        pendingAnalysisRef.current = null;
        setIsAnalyzing(false);
        setGradingParams({ ...params });
        setLastMatchedParams({ ...params });
        setStatusText("Matched");
      } else if (type === "error") {
        clearAnalysisTimeout();
        pendingAnalysisRef.current = null;
        setIsAnalyzing(false);
        setReferenceError(error || "Failed to analyze image.");
        setStatusText("Error");
      }
    };

    worker.onerror = (err) => {
      if (err && typeof err.preventDefault === "function") {
        err.preventDefault();
      }
      runFallbackAnalysisOrReset(
        "Background worker encountered an error; recovered on main thread."
      );
    };

    worker.onmessageerror = () => {
      runFallbackAnalysisOrReset(
        "Worker message serialization error; recovered on main thread."
      );
    };

    workerRef.current = worker;
    return worker;
  }, [clearAnalysisTimeout, runFallbackAnalysisOrReset]);

  useEffect(() => {
    const worker = initWorker();
    return () => {
      clearAnalysisTimeout();
      worker.terminate();
    };
  }, [initWorker, clearAnalysisTimeout]);

  const setSlotError = useCallback((slot, msg) => {
    if (slot === "reference") {
      setReferenceError(msg);
    } else {
      setTargetError(msg);
    }
  }, []);

  // Draws an image or a video frame into RGBA pixels (downscaled to maxDim).
  const captureRgba = useCallback((source, maxDim) => {
    const sw = source.videoWidth || source.naturalWidth;
    const sh = source.videoHeight || source.naturalHeight;
    if (!sw || !sh) return null;
    const scale = Math.min(1, maxDim / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h);
    return { data: d.data, numPixels: w * h };
  }, []);

  // Video-only helpers: mean luma check, letterbox bar filtering (R,G,B <= 6),
  // and smart non-black frame seeking when video starts with a black fade-in.
  const computeFrameMeanLuma = useCallback((rgba) => {
    if (!rgba || rgba.length < 4) return 0;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < rgba.length; i += 16) {
      sum += (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
      count++;
    }
    return count > 0 ? sum / count : 0;
  }, []);

  const filterLetterboxPixels = useCallback((rgba) => {
    const total = rgba.length / 4;
    let kept = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i] > 8 || rgba[i + 1] > 8 || rgba[i + 2] > 8) kept++;
    }
    if (kept < total * 0.15 || kept === total) {
      return { data: rgba, numPixels: total };
    }
    const filtered = new Uint8ClampedArray(kept * 4);
    let ptr = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i] > 8 || rgba[i + 1] > 8 || rgba[i + 2] > 8) {
        filtered[ptr++] = rgba[i];
        filtered[ptr++] = rgba[i + 1];
        filtered[ptr++] = rgba[i + 2];
        filtered[ptr++] = rgba[i + 3];
      }
    }
    return { data: filtered, numPixels: kept };
  }, []);

  const captureBestVideoFrame = useCallback(
    async (videoEl, maxDim) => {
      if (!videoEl) return null;
      const cur = videoEl.readyState >= 2 ? captureRgba(videoEl, maxDim) : null;
      if (cur && videoEl.currentTime > 0.1 && computeFrameMeanLuma(cur.data) >= 0.08) {
        return filterLetterboxPixels(cur.data);
      }

      const dur = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
      const srcUrl = videoEl.currentSrc || videoEl.src;
      if (!srcUrl || dur <= 0.25) {
        return cur ? filterLetterboxPixels(cur.data) : null;
      }

      const probe = document.createElement("video");
      probe.muted = true;
      probe.playsInline = true;
      probe.preload = "auto";
      probe.src = srcUrl;

      try {
        await new Promise((resolve) => {
          const t = setTimeout(resolve, 1500);
          probe.onloadeddata = () => {
            clearTimeout(t);
            resolve();
          };
          probe.onerror = () => {
            clearTimeout(t);
            resolve();
          };
        });

        const candidates = [
          Math.min(dur * 0.25, 2.0),
          dur * 0.5,
          dur * 0.7,
        ].filter((ts) => ts > 0.05 && ts < dur - 0.05);

        let best = cur;
        let bestLuma = cur ? computeFrameMeanLuma(cur.data) : 0;

        for (const ts of candidates) {
          await new Promise((resolve) => {
            const t = setTimeout(resolve, 1200);
            probe.onseeked = () => {
              clearTimeout(t);
              requestAnimationFrame(() => resolve());
            };
            probe.currentTime = ts;
          });
          const cap = captureRgba(probe, maxDim);
          if (!cap) continue;
          const luma = computeFrameMeanLuma(cap.data);
          if (luma > bestLuma) {
            best = cap;
            bestLuma = luma;
          }
          if (luma >= 0.08) break;
        }
        return best ? filterLetterboxPixels(best.data) : null;
      } catch {
        return cur ? filterLetterboxPixels(cur.data) : null;
      } finally {
        try {
          probe.removeAttribute("src");
          probe.load();
        } catch {
          // ignore probe cleanup
        }
      }
    },
    [captureRgba, computeFrameMeanLuma, filterLetterboxPixels]
  );

  // Triggers background worker analysis (reference vs. current target image / video frame)
  const triggerReferenceAnalysis = useCallback(
    async (img) => {
      if (!img) return;
      setIsAnalyzing(true);
      setStatusText("Analyzing...");

      const ref = captureRgba(img, analysisMaxDim);
      if (!ref) {
        setIsAnalyzing(false);
        return;
      }

      const tgtInfo = targetRef.current;
      let tgt = null;
      if (tgtInfo) {
        try {
          if (tgtInfo.kind === "video") {
            tgt = await captureBestVideoFrame(
              tgtInfo.videoEl,
              Math.min(analysisMaxDim, 960)
            );
          } else if (tgtInfo.imgElement) {
            tgt = captureRgba(tgtInfo.imgElement, Math.min(analysisMaxDim, 960));
          }
        } catch {
          tgt = null;
        }
      }

      pendingAnalysisRef.current = {
        rgbaData: ref.data,
        numPixels: ref.numPixels,
        targetRgbaData: tgt ? tgt.data : null,
        targetNumPixels: tgt ? tgt.numPixels : 0,
        mediaType: tgtInfo?.kind === "video" ? "video" : "image",
      };

      clearAnalysisTimeout();
      analysisTimeoutRef.current = setTimeout(() => {
        runFallbackAnalysisOrReset(
          "Worker analysis timed out; recovered on main thread."
        );
      }, 6000);

      try {
        workerRef.current?.postMessage({
          type: "analyze",
          ...pendingAnalysisRef.current,
        });
      } catch {
        runFallbackAnalysisOrReset(
          "Worker unavailable; analyzed on main thread."
        );
      }
    },
    [
      analysisMaxDim,
      captureBestVideoFrame,
      captureRgba,
      clearAnalysisTimeout,
      runFallbackAnalysisOrReset,
    ]
  );

  triggerAnalysisRef.current = () => {
    const r = referenceRef.current;
    if (r && r.imgElement) triggerReferenceAnalysis(r.imgElement);
  };

  const replaceTarget = useCallback((next) => {
    const prev = targetRef.current;
    if (prev && prev.kind === "video") {
      try {
        prev.videoEl.pause();
        prev.videoEl.removeAttribute("src");
        prev.videoEl.load();
      } catch {
        // ignore teardown errors
      }
      if (prev.videoUrl) URL.revokeObjectURL(prev.videoUrl);
    }
    targetRef.current = next;
    setTargetImage(next);
  }, []);

  const loadVideoFile = useCallback(
    (file, meta) => {
      setTargetError("");
      setStatusText("Loading video...");
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = "auto";

      let settled = false;
      const fail = (msg) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          v.removeAttribute("src");
          v.load();
        } catch {
          // ignore
        }
        URL.revokeObjectURL(url);
        setTargetError(msg);
        setStatusText("Video Error");
      };

      const timer = setTimeout(
        () => fail(`Could not load this ${meta.label} video (timed out). The codec may not be supported by this browser.`),
        20000
      );

      v.onerror = () =>
        fail(
          `This ${meta.label} video uses a codec or container this browser cannot play. Try MP4 (H.264) or WEBM (VP9).`
        );

      v.onloadeddata = async () => {
        if (settled) return;
        if (!v.videoWidth || !v.videoHeight) {
          fail("This video has no decodable picture track (audio-only or unsupported codec).");
          return;
        }
        settled = true;
        clearTimeout(timer);
        v.onerror = () => setTargetError("Video playback error.");

        let poster = "";
        try {
          const pw = Math.min(640, v.videoWidth);
          const ph = Math.max(1, Math.round((pw * v.videoHeight) / v.videoWidth));
          const pc = document.createElement("canvas");
          pc.width = pw;
          pc.height = ph;
          const pctx = pc.getContext("2d", { willReadFrequently: true });
          pctx.drawImage(v, 0, 0, pw, ph);
          let luma = computeFrameMeanLuma(pctx.getImageData(0, 0, pw, ph).data);

          const dur = Number.isFinite(v.duration) ? v.duration : 0;
          if (luma < 0.08 && dur > 0.25) {
            const seekTargets = [Math.min(dur * 0.25, 2.0), dur * 0.5].filter(
              (ts) => ts > 0.05 && ts < dur - 0.05
            );
            for (const ts of seekTargets) {
              await new Promise((resolve) => {
                const t = setTimeout(resolve, 1000);
                const onSeek = () => {
                  v.removeEventListener("seeked", onSeek);
                  clearTimeout(t);
                  requestAnimationFrame(() => resolve());
                };
                v.addEventListener("seeked", onSeek);
                v.currentTime = ts;
              });
              pctx.drawImage(v, 0, 0, pw, ph);
              luma = computeFrameMeanLuma(pctx.getImageData(0, 0, pw, ph).data);
              if (luma >= 0.08) break;
            }
          }
          poster = pc.toDataURL("image/jpeg", 0.8);
          if (v.currentTime > 0.05) {
            v.currentTime = 0;
          }
        } catch {
          poster = "";
        }

        const rawBase = file.name.replace(/\.[^/.]+$/, "");
        replaceTarget({
          kind: "video",
          name: sanitizeMetadataText(file.name, "video", 80),
          baseName: sanitizeMetadataText(rawBase, "Target", 48),
          width: v.videoWidth,
          height: v.videoHeight,
          ext: meta.ext.toUpperCase(),
          formatBadge: `VIDEO (${meta.ext.toUpperCase()})`,
          sizeMB: (file.size / (1024 * 1024)).toFixed(1),
          dataUrl: poster,
          imgElement: null,
          videoEl: v,
          videoUrl: url,
        });
        setStatusText("Video Ready");
        v.play().catch(() => {});
      };

      v.src = url;
      v.load();
    },
    [replaceTarget, computeFrameMeanLuma]
  );

  const handleImportPreset = useCallback(async (file, meta) => {
    setReferenceError("");
    setStatusText(`Importing ${meta.label}...`);
    try {
      const result =
        meta.ext === "kfplug"
          ? await importKfplugFile(file)
          : await importLutFile(file);
      setGradingParams({ ...result.params });
      setLastMatchedParams({ ...result.params });
      setImportedLook({ kind: result.kind, name: result.name, rms: result.rms });
      setPresetName(result.name.slice(0, 28));
      if (result.author) setAuthorName(result.author);
      setDescription(
        result.description || `Imported from ${meta.label}: ${result.name}.`
      );
      setStatusText("Imported");
    } catch (err) {
      setReferenceError((err && err.message) || "Failed to import this file.");
      setStatusText("Import Error");
    }
  }, []);

  // Extension + magic byte validation, RAW / TIFF / HEIC decoding, video and LUT routing
  const loadImageFile = useCallback(
    async (file, type) => {
      if (!file) return;
      setSlotError(type, "");

      const meta = await inspectFile(file);

      if (meta.category === "preset") {
        if (type === "reference") {
          await handleImportPreset(file, meta);
        } else {
          setSlotError(type, "LUT and plugin files can only be imported into the REFERENCE slot.");
        }
        return;
      }

      if (meta.category === "video") {
        if (type === "target") {
          loadVideoFile(file, meta);
        } else {
          setSlotError(type, "Video files are supported in the TARGET slot only.");
        }
        return;
      }

      if (meta.category !== "image") {
        setSlotError(type, meta.error || "Unsupported file format.");
        setStatusText("Invalid File");
        return;
      }

      setStatusText(`Decoding ${meta.label}...`);
      let prepared;
      try {
        prepared = await prepareImageBlob(file, meta);
      } catch (err) {
        setSlotError(type, (err && err.message) || "Failed to decode this image.");
        setStatusText("Decode Error");
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => {
        setSlotError(type, "Failed to read image file.");
        setStatusText("Read Error");
      };

      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const img = new Image();

        img.onerror = () => {
          setSlotError(
            type,
            `This ${meta.label} image could not be decoded by the browser. Try exporting it as JPG or PNG.`
          );
          setStatusText("Invalid Image");
        };

        img.onload = () => {
          if (img.naturalWidth < 1 || img.naturalHeight < 1) {
            setSlotError(type, "Invalid image dimensions.");
            return;
          }

          const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
          const rawBaseName = file.name.replace(/\.[^/.]+$/, "");
          const baseName = sanitizeMetadataText(rawBaseName, "Reference", 48);

          const info = {
            kind: "image",
            name: sanitizeMetadataText(file.name, "image.png", 80),
            baseName,
            width: img.naturalWidth,
            height: img.naturalHeight,
            ext: meta.ext.toUpperCase(),
            formatBadge: meta.label,
            sizeMB,
            dataUrl,
            imgElement: img,
          };

          if (type === "reference") {
            setImportedLook(null);
            setReferenceImage(info);
            referenceRef.current = info;
            setPresetName(baseName.slice(0, 28));
            setDescription(
              `Grading preset matched from reference '${baseName}'.`
            );
            triggerReferenceAnalysis(img);
          } else {
            replaceTarget(info);
          }
          setStatusText(type === "reference" ? "Analyzing..." : "Target Ready");
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(prepared.blob);
    },
    [
      setSlotError,
      triggerReferenceAnalysis,
      replaceTarget,
      loadVideoFile,
      handleImportPreset,
    ]
  );

  const handleTrySample = useCallback(
    (type, id) => {
      const w = 960;
      const h = 540;
      let canvas;
      let fileName;

      if (type === "reference") {
        const rendered = renderLookSample(id || SAMPLE_LOOKS[0].id, w, h);
        canvas = rendered.canvas;
        fileName = rendered.fileName;
      } else {
        canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        drawNeutralScene(canvas.getContext("2d"), w, h);
        fileName = "Sample_Daylight_Target.png";
      }

      canvas.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], fileName, { type: "image/png" });
        loadImageFile(file, type);
      }, "image/png");
    },
    [loadImageFile]
  );

  const activePasteTarget =
    hoveredSlot || focusedSlot || (!referenceImage ? "reference" : "target");

  useEffect(() => {
    const handlePaste = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const mime = items[i].type;
        if (mime.startsWith("image/")) {
          if (!ALLOWED_IMAGE_MIMES.includes(mime)) {
            setSlotError(
              activePasteTarget,
              `Unsupported clipboard image format (${mime}). Allowed: JPG, PNG, WEBP.`
            );
            return;
          }
          const blob = items[i].getAsFile();
          if (blob) {
            const ext = mime.split("/")[1] || "png";
            const file = new File([blob], `Clipboard_Image.${ext}`, {
              type: mime,
            });
            loadImageFile(file, activePasteTarget);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [activePasteTarget, loadImageFile, setSlotError]);

  const updatePreviewSimulation = useCallback(() => {
    const srcData = previewSourceImageDataRef.current;
    const canvas = gradedCanvasRef.current;
    if (!srcData || !canvas) return;

    const ctx = canvas.getContext("2d");
    const targetImgData = ctx.createImageData(srcData.width, srcData.height);
    simulateGradePixels(
      srcData.data,
      targetImgData.data,
      effectiveParams,
      simulateLogInput
    );
    ctx.putImageData(targetImgData, 0, 0);
    canvas.dataset.rendered = "true";

    // Downsample to <=160x90 for fast ProScopes telemetry
    const sw = Math.min(160, targetImgData.width);
    const sh = Math.min(90, Math.max(1, Math.round((sw * targetImgData.height) / targetImgData.width)));
    const scopeBuf = new Uint8ClampedArray(sw * sh * 4);
    for (let y = 0; y < sh; y++) {
      const sy = Math.min(targetImgData.height - 1, Math.floor((y / sh) * targetImgData.height));
      for (let x = 0; x < sw; x++) {
        const sx = Math.min(targetImgData.width - 1, Math.floor((x / sw) * targetImgData.width));
        const sIdx = (sy * targetImgData.width + sx) * 4;
        const dIdx = (y * sw + x) * 4;
        scopeBuf[dIdx] = targetImgData.data[sIdx];
        scopeBuf[dIdx + 1] = targetImgData.data[sIdx + 1];
        scopeBuf[dIdx + 2] = targetImgData.data[sIdx + 2];
        scopeBuf[dIdx + 3] = targetImgData.data[sIdx + 3];
      }
    }
    setScopeImageData({ data: scopeBuf, width: sw, height: sh });
  }, [effectiveParams, simulateLogInput]);

  useEffect(() => {
    const isVideoTarget = targetImage?.kind === "video";
    const activeImg = isVideoTarget
      ? null
      : targetImage?.imgElement || referenceImage?.imgElement;
    const canvas = gradedCanvasRef.current;

    if (isVideoTarget) {
      // Video target is rendered by the WebGL pipeline; the CPU canvas is unused.
      previewSourceImageDataRef.current = null;
      lastRenderedImgRef.current = null;
      return undefined;
    }

    if (!activeImg || !canvas) {
      previewSourceImageDataRef.current = null;
      lastRenderedImgRef.current = null;
      setScopeImageData(null);
      return;
    }

    const viewportPreviewCap =
      typeof window !== "undefined" && window.innerWidth < 1024 ? 1280 : 1920;
    const effectivePreviewCap = Math.min(previewMaxDim, viewportPreviewCap);
    const scale = Math.min(
      1,
      effectivePreviewCap / Math.max(activeImg.naturalWidth, activeImg.naturalHeight)
    );
    const w = Math.max(1, Math.round(activeImg.naturalWidth * scale));
    const h = Math.max(1, Math.round(activeImg.naturalHeight * scale));

    const needsRebuild =
      lastRenderedImgRef.current !== activeImg ||
      !previewSourceImageDataRef.current ||
      canvas.width !== w ||
      canvas.height !== h ||
      canvas.dataset.rendered !== "true";

    if (needsRebuild) {
      canvas.width = w;
      canvas.height = h;

      const offCanvas = document.createElement("canvas");
      offCanvas.width = w;
      offCanvas.height = h;
      const ctx = offCanvas.getContext("2d");
      ctx.drawImage(activeImg, 0, 0, w, h);
      previewSourceImageDataRef.current = ctx.getImageData(0, 0, w, h);
      lastRenderedImgRef.current = activeImg;

      updatePreviewSimulation();
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        updatePreviewSimulation();
      });
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [
    targetImage,
    referenceImage,
    previewMaxDim,
    previewMode,
    calibrationTick,
    updatePreviewSimulation,
  ]);

  // Re-run the dynamic range / chroma match whenever the target changes.
  useEffect(() => {
    if (referenceRef.current?.imgElement) {
      triggerAnalysisRef.current();
    }
  }, [targetImage]);

  // Live scope telemetry from the current video frame (graded through the same equation).
  const videoEl = targetImage?.kind === "video" ? targetImage.videoEl : null;
  const gradingParamsRef = useRef(effectiveParams);
  gradingParamsRef.current = effectiveParams;
  const simulateLogInputRef = useRef(simulateLogInput);
  simulateLogInputRef.current = simulateLogInput;
  useEffect(() => {
    if (!videoEl) return undefined;
    const small = document.createElement("canvas");
    const sctx = small.getContext("2d", { willReadFrequently: true });
    let gradedBuf = null;

    const tick = (force = false) => {
      if (document.hidden || activeTab !== "home") return;
      if (!force && videoEl.paused) return;
      if (videoEl.readyState < 2 || !videoEl.videoWidth) return;
      const w = 160;
      const h = Math.min(90, Math.max(1, Math.round((w * videoEl.videoHeight) / videoEl.videoWidth)));
      if (small.width !== w || small.height !== h || !gradedBuf || gradedBuf.length !== w * h * 4) {
        small.width = w;
        small.height = h;
        gradedBuf = new Uint8ClampedArray(w * h * 4);
      }
      try {
        sctx.drawImage(videoEl, 0, 0, w, h);
        const src = sctx.getImageData(0, 0, w, h);
        simulateGradePixels(
          src.data,
          gradedBuf,
          gradingParamsRef.current,
          simulateLogInputRef.current
        );
        setScopeImageData({ data: gradedBuf, width: w, height: h });
      } catch {
        // frame not readable yet
      }
    };

    tick(true);
    const id = setInterval(() => tick(false), 84);
    const onSeekOrLoad = () => tick(true);
    videoEl.addEventListener("seeked", onSeekOrLoad);
    videoEl.addEventListener("loadeddata", onSeekOrLoad);
    return () => {
      clearInterval(id);
      videoEl.removeEventListener("seeked", onSeekOrLoad);
      videoEl.removeEventListener("loadeddata", onSeekOrLoad);
    };
  }, [videoEl, activeTab]);

  // Release any video object URL on unmount.
  useEffect(
    () => () => {
      const t = targetRef.current;
      if (t && t.kind === "video") {
        try {
          t.videoEl.pause();
        } catch {
          // ignore
        }
        if (t.videoUrl) URL.revokeObjectURL(t.videoUrl);
      }
    },
    []
  );

  const handleRunPipelineCalibration = () => {
    setCalibrationStatus((prev) => ({
      ...prev,
      running: true,
      message: "Running synthetic gray-ramp & worker diagnostic...",
    }));

    const t0 = performance.now();

    const size = 64;
    const numPixels = size * size;
    const srcBuf = new Uint8ClampedArray(numPixels * 4);
    const outBuf = new Uint8ClampedArray(numPixels * 4);

    for (let i = 0; i < numPixels; i++) {
      const idx = i * 4;
      const ramp = i % 256;
      srcBuf[idx] = ramp;
      srcBuf[idx + 1] = ramp;
      srcBuf[idx + 2] = ramp;
      srcBuf[idx + 3] = 255;
    }

    simulateGradePixels(srcBuf, outBuf, DEFAULT_PARAMS);

    let totalDiff = 0;
    for (let i = 0; i < numPixels * 4; i += 4) {
      const dr = Math.abs(srcBuf[i] - outBuf[i]);
      const dg = Math.abs(srcBuf[i + 1] - outBuf[i + 1]);
      const db = Math.abs(srcBuf[i + 2] - outBuf[i + 2]);
      totalDiff += (dr + dg + db) / 3.0;
    }
    const avgDeltaE = (totalDiff / numPixels).toFixed(2);

    initWorker();
    previewSourceImageDataRef.current = null;
    lastRenderedImgRef.current = null;
    if (gradedCanvasRef.current) {
      gradedCanvasRef.current.dataset.rendered = "false";
    }
    setCalibrationTick((t) => t + 1);

    const elapsed = Math.max(1, Math.round(performance.now() - t0));

    setTimeout(() => {
      setCalibrationStatus({
        running: false,
        message: "Calibrated • Canvas & Worker OK",
        deltaE: avgDeltaE,
        latencyMs: elapsed,
      });
      setStatusText("Calibrated");
    }, 180);
  };

  const handleParamChange = (key, value) => {
    setGradingParams((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleCalibrationChange = (key, value) => {
    setCalibration((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleResetParams = () => {
    setGradingParams({ ...DEFAULT_PARAMS });
    setMatchStrength(100);
    setSimulateLogInput(false);
    setStatusText("Reset");
  };

  const handleWheelChange = (prefix, [r, g, b]) => {
    setGradingParams((prev) => ({
      ...prev,
      [`${prefix}R`]: r,
      [`${prefix}G`]: g,
      [`${prefix}B`]: b,
    }));
  };

  const handleWheelReset = (prefix) => {
    handleWheelChange(prefix, [0.5, 0.5, 0.5]);
  };

  const handleSwitchSlot = useCallback(
    (nextSlot) => {
      if (nextSlot === activeSlot) return;
      setSlotSnapshots((prev) => {
        const updated = { ...prev, [activeSlot]: { ...gradingParams } };
        const loaded = updated[nextSlot] || { ...DEFAULT_PARAMS };
        setGradingParams({ ...loaded });
        return updated;
      });
      setActiveSlot(nextSlot);
      setStatusText(`Slot ${nextSlot}`);
    },
    [activeSlot, gradingParams]
  );

  const handleSaveImage = async ({ format = "png", quality = 95, layout = "graded", splitPos = 50 } = {}) => {
    if (isSavingFrame) return false;
    const isVideo = targetImage?.kind === "video" && videoEl;
    const activeImg = isVideo
      ? null
      : targetImage?.imgElement || referenceImage?.imgElement;
    if (!isVideo && !activeImg) return false;

    const w = isVideo ? videoEl.videoWidth : activeImg.naturalWidth;
    const h = isVideo ? videoEl.videoHeight : activeImg.naturalHeight;
    if (!w || !h) return false;

    setIsSavingFrame(true);
    try {
      const baseName =
        targetImage?.baseName || referenceImage?.baseName || presetName || "Target";
      await exportGradedImage({
        source: isVideo ? videoEl : activeImg,
        width: w,
        height: h,
        params: effectiveParams,
        format,
        quality,
        layout,
        splitPos,
        simulateLogInput,
        baseName,
      });
      setStatusText(`Saved ${format.toUpperCase()}`);
      return true;
    } catch {
      setStatusText("Export Error");
      return false;
    } finally {
      setIsSavingFrame(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setIsShortcutsOpen((v) => !v);
      } else if (e.key === "1") {
        handleSwitchSlot("A");
      } else if (e.key === "2") {
        handleSwitchSlot("B");
      } else if (e.code === "Space" && videoEl) {
        e.preventDefault();
        if (videoEl.paused) {
          videoEl.play().catch(() => {});
        } else {
          videoEl.pause();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSwitchSlot, videoEl]);

  // Reload Analysis: restores all grading parameters + 3-Way Color Wheels from the last match.
  // With a video target it re-matches against the CURRENT video frame instead.
  const handleReloadAnalysis = () => {
    if (!referenceImage && !importedLook) return;

    if (referenceImage?.imgElement && targetImage?.kind === "video") {
      triggerReferenceAnalysis(referenceImage.imgElement);
      return;
    }

    if (lastMatchedParams) {
      setGradingParams({ ...lastMatchedParams });
      setStatusText("Matched");
      setReloadedFeedback(true);
      setTimeout(() => setReloadedFeedback(false), 1200);
    } else if (referenceImage?.imgElement) {
      triggerReferenceAnalysis(referenceImage.imgElement);
    }
  };

  const hasLook = Boolean(referenceImage || importedLook);

  const buildCalibratedParams = () =>
    applyCalibrationToParams(effectiveParams, calibration);

  const handleExportLut = (ext) => {
    if (!hasLook) return;
    try {
      const safePreset = sanitizeMetadataText(
        presetName,
        referenceImage?.baseName || importedLook?.name || "Custom Look",
        64
      );
      const { blob, fileName } = generateLutFile(
        buildCalibratedParams(),
        safePreset,
        ext
      );
      downloadBlob(blob, fileName);
      setStatusText(`Exported .${ext}`);
    } catch {
      setStatusText("Export Error");
    }
  };

  const handleResetCalibration = () => {
    setCalibration({ ...DEFAULT_CALIBRATION });
  };

  const handleExport = async () => {
    if (!hasLook) return;
    setIsExporting(true);
    setStatusText("Exporting...");
    try {
      const calibratedParams = applyCalibrationToParams(
        effectiveParams,
        calibration
      );
      const safePreset = sanitizeMetadataText(
        presetName,
        referenceImage?.baseName || importedLook?.name || "Custom Look",
        64
      );
      const safeAuthor = sanitizeMetadataText(authorName, "TFBAGAS", 64);
      const safeDesc = sanitizeMetadataText(description, "", 200);

      const { blob, fileName } = await generateKfplug(
        calibratedParams,
        safePreset,
        safeAuthor,
        safeDesc
      );
      downloadBlob(blob, fileName);
      setStatusText("Exported!");
      setExportToast({ visible: true, filename: fileName });
    } catch {
      setStatusText("Export Error");
    } finally {
      setIsExporting(false);
    }
  };

  const activePreviewImageUrl =
    targetImage?.dataUrl || referenceImage?.dataUrl || null;

  const navTabs = [
    { id: "home", label: "Workspace", icon: Sliders },
    { id: "settings", label: "Settings", icon: Settings },
    { id: "about", label: "About", icon: Info },
    { id: "support", label: "Support", icon: Heart },
  ];

  const {
    containerRef: navContainerRef,
    registerTabRef: registerNavTabRef,
    pillStyle: navPillStyle,
  } = usePillIndicator(activeTab);

  return (
    <div className="min-h-screen flex flex-col relative bg-transparent text-[#E2E4E9]">
      {/* v0.6.5 Beta: Minimalist Pro Studio Intro */}
      {showSplash && (
        <SplashIntro
          onStartExit={handleStartExit}
          onComplete={handleSplashComplete}
        />
      )}

      {/* Lightweight GPU-Composited Monochrome Ambient Layer (2 radial-gradient orbs, transform only) */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#070709]"
      >
        <div className="m3-liquid-orb-1 absolute -top-20 -left-16" />
        <div className="m3-liquid-orb-2 absolute -bottom-24 left-8" />
      </div>

      {/* Foreground Application Content Wrapper (relative z-10 bg-transparent, synchronized with SplashIntro exit) */}
      <div
        className={`relative z-10 min-h-screen flex flex-col bg-transparent ${
          workspacePhase === "hidden"
            ? "opacity-0 pointer-events-none scale-[0.97]"
            : "opacity-100 scale-100"
        }`}
      >
      {/* 1. Compact 48px Top App Bar (delay: 0ms fast spring down) */}
      <header
        className={`sticky top-0 z-40 min-h-12 px-3 sm:px-5 py-1.5 bg-[#0E0E12]/80 backdrop-blur-md border-b border-white/[0.12] flex flex-wrap items-center justify-between gap-2 ${
          workspacePhase === "morphing-in" ? "m3-morph-topbar" : ""
        }`}
      >
        {/* Left: Achromatic Keyflow Logo + Brand Title + v0.8.0 Beta Badge + Support Capsule */}
        <div className="flex flex-wrap items-center gap-2">
          <KeyflowLogo size={26} />
          <div className="flex items-center gap-1.5 sm:gap-2">
            <h1 className="text-sm sm:text-base font-bold font-display tracking-tight text-[#E2E4E9]">
              Color Match Tool
            </h1>
            <button
              type="button"
              onClick={handleOpenChangelog}
              title="View What's New in v0.8.0 Beta"
              className="m3-btn-morph inline-flex items-center gap-1 text-[10px] font-mono px-1.5 sm:px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.09] text-[#E2E4E9] border border-white/[0.09] hover:border-white/25 cursor-pointer"
            >
              {hasUnreadUpdate && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7] animate-pulse" />
              )}
              <span>v0.8.0 Beta</span>
            </button>
            <a
              href="https://sociabuzz.com/tfbagas/support"
              target="_blank"
              rel="noopener noreferrer"
              title="Support development on SociaBuzz"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.09] text-[10px] sm:text-[11px] font-medium text-[#E2E4E9] transition-colors"
            >
              <Heart className="w-3 h-3 text-[#9CA3AF]" />
              <span>Support</span>
            </a>
          </div>
        </div>

        {/* Right: Material You Expressive Sliding & Stretching Pill Nav + Status Chip */}
        <div className="flex items-center gap-2 ml-auto">
          <nav
            ref={navContainerRef}
            aria-label="Primary Navigation"
            className="relative flex items-center gap-0.5 bg-[#0A0A0D]/55 border border-white/[0.09] rounded-xl p-0.5"
          >
            <div
              aria-hidden="true"
              className="m3-pill-indicator pointer-events-none absolute top-0.5 bottom-0.5 rounded-lg bg-[#E2E4E9] shadow-[0_2px_10px_rgba(255,255,255,0.22),inset_0_1px_0_rgba(255,255,255,0.7)]"
              style={{
                left: `${navPillStyle.left}px`,
                width: `${navPillStyle.width}px`,
                opacity: navPillStyle.opacity,
              }}
            />

            {navTabs.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  ref={registerNavTabRef(item.id)}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative z-10 flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1 rounded-lg text-xs font-medium transition-colors duration-200 active:scale-[0.96] cursor-pointer ${
                    isActive
                      ? "text-[#0E0E11] font-semibold"
                      : "text-[#9CA3AF] hover:text-[#E2E4E9]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => setIsShortcutsOpen(true)}
            title="Keyboard & Grading Shortcuts (?)"
            aria-label="Keyboard Shortcuts"
            className="m3-btn-morph inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.09] text-xs font-mono text-[#9CA3AF] hover:text-[#E2E4E9] cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>

          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.09] text-[11px] font-mono text-[#E2E4E9]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isAnalyzing
                  ? "bg-amber-400 animate-ping"
                  : statusText === "Matched" ||
                    statusText === "Exported!" ||
                    statusText === "Calibrated"
                  ? "bg-[#6EE7B7]"
                  : "bg-[#9CA3AF]"
              }`}
            />
            <span>{statusText.toUpperCase()}</span>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-5 py-2.5">
        {/* WORKSPACE TAB */}
        <div
          key={cascadeKey}
          className={
            activeTab === "home" ? "space-y-2.5" : "hidden"
          }
        >
          {/* 2-Column Workstation Grid: Direct-child sticky VISUAL PREVIEW on <1024px, 38%/62% Left + 100vh Right on >=1024px */}
          <div className="grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[auto_1fr] gap-2.5 items-stretch">
            {/* MEDIA DROPZONES (order-2 on mobile, row 1 col 1..7 on desktop) */}
            <div className="order-2 lg:order-none lg:col-span-7 lg:col-start-1 lg:row-start-1 grid grid-cols-2 gap-2 lg:gap-2.5">
                {/* 3. Panel REFERENCE (delay: 110ms) */}
                <div
                  className={
                    workspacePhase === "morphing-in" ? "m3-morph-panel" : ""
                  }
                  style={
                    workspacePhase === "morphing-in"
                      ? { "--morph-delay": "110ms" }
                      : undefined
                  }
                >
                  <ImageDropCard
                    title="REFERENCE"
                    imageInfo={referenceImage}
                    onSelectImage={(file) => loadImageFile(file, "reference")}
                    onClearImage={() => {
                      setReferenceImage(null);
                      if (!importedLook) setLastMatchedParams(null);
                      setReferenceError("");
                      setStatusText("Ready");
                    }}
                    onTrySample={(id) => handleTrySample("reference", id)}
                    sampleOptions={SAMPLE_LOOKS}
                    allowPresets
                    importedLook={importedLook}
                    onClearImportedLook={() => {
                      setImportedLook(null);
                      setLastMatchedParams(null);
                    }}
                    isAnalyzing={isAnalyzing}
                    isPasteTarget={
                      hoveredSlot === "reference" ||
                      (!hoveredSlot && focusedSlot === "reference")
                    }
                    onHoverChange={(hovered) =>
                      setHoveredSlot(hovered ? "reference" : null)
                    }
                    onFocusSlot={() => setFocusedSlot("reference")}
                    errorMessage={referenceError}
                    onFileRejected={(msg) => setReferenceError(msg)}
                  />
                </div>

                {/* 5. Panel TARGET IMAGE (delay: 190ms) */}
                <div
                  className={
                    workspacePhase === "morphing-in" ? "m3-morph-panel" : ""
                  }
                  style={
                    workspacePhase === "morphing-in"
                      ? { "--morph-delay": "190ms" }
                      : undefined
                  }
                >
                  <ImageDropCard
                    title="TARGET IMAGE / VIDEO"
                    allowVideo
                    imageInfo={targetImage}
                    onSelectImage={(file) => loadImageFile(file, "target")}
                    onClearImage={() => {
                      replaceTarget(null);
                      setTargetError("");
                    }}
                    onTrySample={() => handleTrySample("target")}
                    isPasteTarget={
                      hoveredSlot === "target" ||
                      (!hoveredSlot && focusedSlot === "target")
                    }
                    onHoverChange={(hovered) =>
                      setHoveredSlot(hovered ? "target" : null)
                    }
                    onFocusSlot={() => setFocusedSlot("target")}
                    errorMessage={targetError}
                    onFileRejected={(msg) => setTargetError(msg)}
                  />
                </div>
              </div>

              {/* 7. Panel VISUAL PREVIEW (direct child of workspace grid: sticky top-[48px] on <1024px, row 2 col 1..7 on >=1024px) */}
              <div
                className={`order-1 lg:order-none lg:col-span-7 lg:col-start-1 lg:row-start-2 flex flex-col ${
                  isPreviewPinned
                    ? "sticky top-[48px] z-30 bg-[#121216] pb-1 lg:static lg:z-auto lg:bg-transparent lg:pb-0"
                    : ""
                } ${
                  workspacePhase === "morphing-in" ? "m3-morph-panel" : ""
                }`}
                style={
                  workspacePhase === "morphing-in"
                    ? { "--morph-delay": "270ms" }
                    : undefined
                }
              >
                <ComparisonSlider
                  originalImage={activePreviewImageUrl}
                  gradedCanvasRef={gradedCanvasRef}
                  hasImage={Boolean(activePreviewImageUrl) || Boolean(videoEl)}
                  mode={previewMode}
                  onModeChange={setPreviewMode}
                  videoEl={videoEl}
                  gradingParams={effectiveParams}
                  onVideoError={(msg) => setTargetError(msg)}
                  isPinned={isPreviewPinned}
                  onTogglePin={() => setIsPreviewPinned((p) => !p)}
                  onSaveImage={handleSaveImage}
                  isSavingImage={isSavingFrame}
                  nativeWidth={targetImage?.width || referenceImage?.width || 0}
                  nativeHeight={targetImage?.height || referenceImage?.height || 0}
                  targetBaseName={targetImage?.baseName || referenceImage?.baseName || "Target"}
                  simulateLogInput={simulateLogInput}
                  onToggleSimulateLogInput={setSimulateLogInput}
                  footer={
                    videoEl ? (
                      <VideoTransportBar
                        videoEl={videoEl}
                        resolution={`${targetImage.width}×${targetImage.height}`}
                      />
                    ) : null
                  }
                />
              </div>

            {/* RIGHT COLUMN */}
            <div className="order-3 lg:order-none lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:row-span-2 flex flex-col gap-2">
              {/* 4. Panel DETECTED PARAMETERS (delay: 150ms) */}
              <div
                className={`m3-panel rounded-2xl p-2.5 ${
                  workspacePhase === "morphing-in" ? "m3-morph-panel" : ""
                }`}
                style={
                  workspacePhase === "morphing-in"
                    ? { "--morph-delay": "150ms", contain: "layout paint" }
                    : { contain: "layout paint" }
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5 text-[#9CA3AF]" />
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">
                      DETECTED PARAMETERS
                    </h3>
                    {/* A / B Grading Snapshot Slots */}
                    <div className="inline-flex items-center p-0.5 rounded-md bg-[#0E0E12] border border-white/[0.08]">
                      {["A", "B"].map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => handleSwitchSlot(slot)}
                          title={`Grading Snapshot Slot ${slot} (Shortcut: ${slot === "A" ? "1" : "2"})`}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
                            activeSlot === slot
                              ? "bg-[#E2E4E9] text-[#0E0E11]"
                              : "text-[#9CA3AF] hover:text-[#F4F5F7]"
                          }`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons: Reload Analysis + Reset All */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleReloadAnalysis}
                      disabled={!hasLook || isAnalyzing}
                      className={`m3-btn-morph flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border ${
                        !hasLook || isAnalyzing
                          ? "bg-white/[0.025] text-[#9CA3AF]/35 border-white/[0.05] cursor-not-allowed"
                          : reloadedFeedback
                          ? "bg-[#E2E4E9] text-[#0E0E11] border-[#E2E4E9] font-semibold cursor-pointer"
                          : "bg-white/[0.04] hover:bg-white/[0.09] text-[#9CA3AF] hover:text-[#E2E4E9] border-white/[0.09] cursor-pointer"
                      }`}
                      title="Restore all sliders and 3-Way Color Wheels to the Reference analysis result"
                    >
                      {reloadedFeedback ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Restored</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3" />
                          <span>Reload Analysis</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleResetParams}
                      className="m3-btn-morph flex items-center gap-1 text-[11px] font-medium text-[#9CA3AF] hover:text-[#E2E4E9] px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.09] cursor-pointer"
                      title="Reset all sliders to neutral defaults"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset All</span>
                    </button>
                  </div>
                </div>

                {/* Master Match Strength (0% - 150%, default 100%) */}
                <div className="mb-2">
                  <ParameterControl
                    paramKey="matchStrength"
                    label="Match Strength"
                    min={0}
                    max={150}
                    step={5}
                    value={matchStrength}
                    defaultValue={100}
                    isBipolar={false}
                    valueSuffix="%"
                    onChange={(_, val) => setMatchStrength(Math.round(val))}
                    icon={Gauge}
                  />
                </div>

                {/* Pro Scopes (Luma/RGB, RGB Parade, Vectorscope with Skin-Tone Line) */}
                <div className="mb-2.5">
                  <ProScopes
                    imageData={scopeImageData}
                    hasMedia={Boolean(activePreviewImageUrl || videoEl)}
                  />
                </div>

                {/* Bipolar Sliders List (staggered row cascade during morphing-in) */}
                <div className="space-y-0.5 divide-y divide-white/[0.04]">
                  {PARAM_CONTROLS.map((ctrl, idx) => (
                    <div
                      key={ctrl.key}
                      className={
                        workspacePhase === "morphing-in"
                          ? "m3-morph-slider-row"
                          : ""
                      }
                      style={
                        workspacePhase === "morphing-in"
                          ? { "--row-delay": `${175 + idx * 18}ms` }
                          : undefined
                      }
                    >
                      <ParameterControl
                        paramKey={ctrl.key}
                        label={ctrl.label}
                        min={ctrl.min}
                        max={ctrl.max}
                        step={ctrl.step}
                        value={
                          gradingParams[ctrl.key] ?? DEFAULT_PARAMS[ctrl.key]
                        }
                        defaultValue={DEFAULT_PARAMS[ctrl.key]}
                        isBipolar={ctrl.isBipolar}
                        onChange={handleParamChange}
                        icon={ctrl.icon}
                      />
                    </div>
                  ))}
                </div>

                {/* 6. Collapsible 3-Way Color Wheels Swatches (delay: 230ms) */}
                <div
                  className={`mt-3 pt-3 border-t border-white/[0.08] ${
                    workspacePhase === "morphing-in" ? "m3-morph-panel" : ""
                  }`}
                  style={
                    workspacePhase === "morphing-in"
                      ? { "--morph-delay": "230ms" }
                      : undefined
                  }
                >
                  <div
                    onClick={() => setIsWheelsExpanded((prev) => !prev)}
                    className="flex items-center justify-between cursor-pointer select-none group"
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-[#9CA3AF] group-hover:text-[#E2E4E9] transition-colors" />
                      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF] group-hover:text-[#E2E4E9] transition-colors">
                        3-WAY COLOR WHEELS
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isWheelsExpanded && (
                        <div className="flex items-center gap-1.5 mr-1">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/20"
                            style={{
                              backgroundColor: toRgbCss(
                                gradingParams.liftR,
                                gradingParams.liftG,
                                gradingParams.liftB
                              ),
                            }}
                            title="Shadows (Lift)"
                          />
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/20"
                            style={{
                              backgroundColor: toRgbCss(
                                gradingParams.gammaR,
                                gradingParams.gammaG,
                                gradingParams.gammaB
                              ),
                            }}
                            title="Midtones (Gamma)"
                          />
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/20"
                            style={{
                              backgroundColor: toRgbCss(
                                gradingParams.gainR,
                                gradingParams.gainG,
                                gradingParams.gainB
                              ),
                            }}
                            title="Highs (Gain)"
                          />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsWheelsExpanded((prev) => !prev);
                        }}
                        aria-expanded={isWheelsExpanded}
                        aria-label="Toggle 3-Way Color Wheels panel"
                        className="m3-btn-morph p-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-[#9CA3AF] hover:text-[#E2E4E9] border border-white/[0.09] cursor-pointer"
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-300 ${
                            isWheelsExpanded ? "rotate-180" : "rotate-0"
                          }`}
                          style={{ transitionTimingFunction: "var(--ease-m3-spring)" }}
                        />
                      </button>
                    </div>
                  </div>

                  <div
                    className={`m3-collapse-grid ${
                      isWheelsExpanded ? "mt-2.5" : "mt-0"
                    }`}
                    data-expanded={isWheelsExpanded}
                  >
                    <div className="m3-collapse-inner">
                      <div className="grid grid-cols-3 gap-2">
                        <ColorSwatchCard
                          title="Shadows (Lift)"
                          rgb={[
                            gradingParams.liftR,
                            gradingParams.liftG,
                            gradingParams.liftB,
                          ]}
                          onChange={(rgb) => handleWheelChange("lift", rgb)}
                          onReset={() => handleWheelReset("lift")}
                        />
                        <ColorSwatchCard
                          title="Midtones (Gamma)"
                          rgb={[
                            gradingParams.gammaR,
                            gradingParams.gammaG,
                            gradingParams.gammaB,
                          ]}
                          onChange={(rgb) => handleWheelChange("gamma", rgb)}
                          onReset={() => handleWheelReset("gamma")}
                        />
                        <ColorSwatchCard
                          title="Highs (Gain)"
                          rgb={[
                            gradingParams.gainR,
                            gradingParams.gainG,
                            gradingParams.gainB,
                          ]}
                          onChange={(rgb) => handleWheelChange("gain", rgb)}
                          onReset={() => handleWheelReset("gain")}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 8. Panel EXPORT PLUGIN (delay: 310ms) */}
              <div
                className={
                  workspacePhase === "morphing-in" ? "m3-morph-panel" : ""
                }
                style={
                  workspacePhase === "morphing-in"
                    ? { "--morph-delay": "310ms" }
                    : undefined
                }
              >
                <ExportCard
                  presetName={presetName}
                  setPresetName={setPresetName}
                  authorName={authorName}
                  setAuthorName={setAuthorName}
                  description={description}
                  setDescription={setDescription}
                  onExport={handleExport}
                  isExporting={isExporting}
                  disabled={!hasLook}
                  onExportCube={() => handleExportLut("cube")}
                  onExportLut={() => handleExportLut("lut")}
                  isCalibrationActive={isCalibrationActive}
                  onOpenCalibration={() => setActiveTab("settings")}
                />
              </div>
            </div>
          </div>
        </div>

        {/* SETTINGS TAB */}
        {activeTab === "settings" && (
          <div className="max-w-2xl mx-auto space-y-4 m3-tab-enter">
            <div className="m3-panel rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex items-center gap-2.5 border-b border-white/[0.08] pb-3.5">
                <Settings className="w-4 h-4 text-[#E2E4E9]" />
                <h2 className="text-base font-bold font-display text-[#E2E4E9]">
                  Performance &amp; Processing Settings
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#E2E4E9] mb-1">
                    Reference Analysis Resolution Limit
                  </label>
                  <p className="text-xs text-[#9CA3AF] mb-2">
                    Downscales reference images in the background Web Worker before computing Rec. 709 histograms and percentiles.
                  </p>
                  <M3Select
                    value={analysisMaxDim}
                    onChange={(val) => setAnalysisMaxDim(Number(val))}
                    ariaLabel="Reference Analysis Resolution Limit"
                    options={[
                      { value: 720, label: "720 px (Ultra Fast — Low RAM)" },
                      { value: 1280, label: "1280 px (Recommended Balanced)" },
                      { value: 1920, label: "1920 px (Full HD Precision)" },
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#E2E4E9] mb-1">
                    Live Preview Simulation Resolution
                  </label>
                  <p className="text-xs text-[#9CA3AF] mb-2">
                    Controls the internal canvas resolution when dragging sliders in real time.
                  </p>
                  <M3Select
                    value={previewMaxDim}
                    onChange={(val) => setPreviewMaxDim(Number(val))}
                    ariaLabel="Live Preview Simulation Resolution"
                    options={[
                      { value: 640, label: "640 px (60fps Mobile Smoothness)" },
                      { value: 960, label: "960 px (Recommended Default)" },
                      { value: 1440, label: "1440 px (High Detail Desktop)" },
                    ]}
                  />
                </div>
              </div>
            </div>

            <div className="m3-panel rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3.5">
                <div className="flex items-center gap-2.5">
                  <Cpu className="w-4 h-4 text-[#E2E4E9]" />
                  <div>
                    <h2 className="text-base font-bold font-display text-[#E2E4E9]">
                      Engine &amp; Export Calibration
                    </h2>
                    <p className="text-xs text-[#9CA3AF]">
                      Web pipeline self-test recovery &amp; Keyflow OpenGL ES shader output scaling
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleResetCalibration}
                  className="m3-btn-morph inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-xs font-medium text-[#9CA3AF] hover:text-[#E2E4E9] border border-white/[0.09] cursor-pointer"
                  title="Reset all output calibration multipliers to 1.00x"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Calibration</span>
                </button>
              </div>

              <div className="bg-white/[0.035] border border-white/[0.09] rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-[#E2E4E9]">
                      Web Pipeline Self-Calibration &amp; Recovery
                    </div>
                    <p className="text-xs text-[#9CA3AF] leading-relaxed">
                      Verifies neutral gray ramp &amp; RGB primaries through the Canvas 2D shader simulator, restarts the background Web Worker, and flushes cached preview buffers.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunPipelineCalibration}
                    disabled={calibrationStatus.running}
                    className="m3-btn-morph inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#E2E4E9] hover:bg-white text-[#0E0E11] shrink-0 cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        calibrationStatus.running ? "animate-spin" : ""
                      }`}
                    />
                    <span>Run Calibration &amp; Flush Cache</span>
                  </button>
                </div>

                <div className="pt-2.5 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                  <div className="flex items-center gap-2 text-[#E2E4E9]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#6EE7B7] shrink-0" />
                    <span>{calibrationStatus.message}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[#9CA3AF]">
                    <span>
                      Drift <strong className="text-[#E2E4E9]">ΔE {calibrationStatus.deltaE}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Latency <strong className="text-[#E2E4E9]">{calibrationStatus.latencyMs} ms</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#E2E4E9]">
                    Keyflow .kfplug Output Calibration Multipliers
                  </span>
                  <span className="text-[11px] font-mono text-[#9CA3AF]">
                    Range: 0.50x – 1.50x (Default 1.00x)
                  </span>
                </div>
                <p className="text-xs text-[#9CA3AF] pb-1">
                  Compensates for rendering intensity differences between browser 2D canvas and Keyflow Mobile&apos;s OpenGL ES shader pipeline during <code className="font-mono text-[#E2E4E9]">.kfplug</code> packaging.
                </p>

                <div className="bg-[#0A0A0D]/38 border border-white/[0.09] rounded-xl p-2 divide-y divide-white/[0.04]">
                  <ParameterControl
                    paramKey="toneScale"
                    label="Tone & Contrast Scale"
                    min={0.5}
                    max={1.5}
                    step={0.01}
                    value={calibration.toneScale}
                    defaultValue={1.0}
                    isBipolar={true}
                    valueSuffix="x"
                    onChange={handleCalibrationChange}
                    icon={Contrast}
                  />
                  <ParameterControl
                    paramKey="wbScale"
                    label="White Balance Scale"
                    min={0.5}
                    max={1.5}
                    step={0.01}
                    value={calibration.wbScale}
                    defaultValue={1.0}
                    isBipolar={true}
                    valueSuffix="x"
                    onChange={handleCalibrationChange}
                    icon={Thermometer}
                  />
                  <ParameterControl
                    paramKey="chromaScale"
                    label="Chroma (Sat/Vib) Scale"
                    min={0.5}
                    max={1.5}
                    step={0.01}
                    value={calibration.chromaScale}
                    defaultValue={1.0}
                    isBipolar={true}
                    valueSuffix="x"
                    onChange={handleCalibrationChange}
                    icon={Palette}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABOUT TAB */}
        {activeTab === "about" && (
          <div className="max-w-2xl mx-auto space-y-4 m3-tab-enter">
            <div className="m3-panel rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3.5 border-b border-white/[0.08] pb-4">
                <div className="flex items-center gap-3.5">
                  <KeyflowLogo size={48} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold font-display text-[#E2E4E9]">
                        Color Match for Keyflow V.0.8.0 Beta
                      </h2>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.05] text-[#6EE7B7] border border-white/[0.09]">
                        v0.8.0 Beta
                      </span>
                    </div>
                    <p className="text-xs text-[#9CA3AF] mt-0.5">
                      100% Client-Side Web App • Zero Server Upload
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleReplayIntro}
                    title="Replay the interactive monochrome liquid glass entrance intro"
                    className="m3-btn-morph inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.09] text-xs font-medium text-[#E2E4E9] cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 text-[#6EE7B7]" />
                    <span>Replay Intro</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("support")}
                    title="Created by TFBAGAS — View Developer & Support Hub"
                    className="cursor-pointer transition-transform hover:scale-[1.02]"
                  >
                    <TfbagasWordmark compact />
                  </button>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-[#9CA3AF] leading-relaxed">
                This tool analyzes the luminance distribution (Rec. 709), white balance neutrality, saturation, and 3-way split toning (Shadows, Midtones, Highlights) of any reference image directly inside your browser using Web Workers, then packages a native{" "}
                <code className="text-[#E2E4E9] font-mono bg-white/[0.05] px-1.5 py-0.5 rounded border border-white/[0.09]">
                  .kfplug
                </code>{" "}
                GLSL shader plugin for Keyflow.
              </p>

              <div className="bg-white/[0.035] border border-white/[0.09] rounded-xl p-4 text-xs text-[#9CA3AF] space-y-1.5">
                <div className="font-semibold text-[#E2E4E9]">Privacy &amp; Architecture</div>
                <p>
                  All images are processed locally in your device&apos;s memory. No photos or presets are ever uploaded to an external server.
                </p>
              </div>
            </div>

            {/* Permanent Release History / Changelog Accordion (v0.5.0 Beta -> v0.6.5 Beta) */}
            <div className="m3-panel rounded-2xl p-5 sm:p-6 space-y-3.5">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-[#6EE7B7]" />
                  <h3 className="text-sm sm:text-base font-bold font-display text-[#E2E4E9]">
                    Release History / Changelog
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-[#9CA3AF]">
                  v0.5.0 - v0.8.0 Beta
                </span>
              </div>

              <ReleaseHistoryAccordion />
            </div>
          </div>
        )}

        {/* SUPPORT TAB */}
        {activeTab === "support" && (
          <div className="m3-tab-enter">
            <SupportTab />
          </div>
        )}
      </main>

      {/* Interactive "What's New in v0.8.0 Beta" Modal Dialog */}
      <ChangelogModal
        open={isChangelogOpen}
        onClose={() => setIsChangelogOpen(false)}
        onViewFullHistory={() => setActiveTab("about")}
      />

      {/* Keyboard & Grading Shortcuts Modal */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Post-Export Support Toast */}
      <SupportToast
        visible={exportToast.visible}
        filename={exportToast.filename}
        onClose={() => setExportToast({ visible: false, filename: "" })}
      />
      </div>
    </div>
  );
}
