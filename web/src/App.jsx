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
  Zap,
  Scale,
  Undo2,
  Redo2,
  Copy,
  Bookmark,
  Share2,
  Search,
  X,
  Globe,
} from "lucide-react";

import { useLanguage } from "./i18n/LanguageContext";
import { translateStatusText } from "./i18n/translations";
import ImageDropCard, { ALLOWED_IMAGE_MIMES } from "./components/ImageDropCard";
import ComparisonSlider from "./components/ComparisonSlider";
import ParameterSlider from "./components/ParameterSlider";
import ColorWheel from "./components/ColorWheel";
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
import IntroScreen from "./components/IntroScreen";
import CommandPalette from "./components/CommandPalette";
import { usePillIndicator } from "./hooks/usePillIndicator";
import {
  DEFAULT_PARAMS,
  simulateGradePixels,
} from "./utils/colorGrading";
import {
  DEFAULT_ENGINE_ID,
  getEngine,
  getEngineCodename,
  listEngines,
} from "./utils/engineRegistry";
import { scaleParamsByStrength } from "./utils/gradeEngine";
import {
  generateKfplug,
  downloadBlob,
} from "./utils/kfplugPackager";
import { exportToFfx, parseFfxPreset } from "./utils/ffxEngine";
import { sanitizeMetadataText } from "./utils/hostGuard";
import { SLIDER_PARAM_SPECS, applyCalibrationToParams } from "./utils/paramSchema";
import { generateLutFile } from "./utils/lutExporter";
import {
  exportGradedImage,
  exportPromoCardBlob,
  extractPaletteSwatches,
} from "./utils/imageExporter";
import { exportGradedVideo } from "./utils/videoExporter";
import { exportVideoInCloud } from "./utils/cloudVideoExporter";
import { buildZipBlob } from "./utils/zipBuilder";
import { decodeGradeFromHash } from "./utils/shareCodec";
import LooksDrawer from "./components/LooksDrawer";
import ShareModal from "./components/ShareModal";
import ReleaseMediaKitModal from "./components/ReleaseMediaKitModal";
import { importKfplugFile } from "./utils/presetImporter";
import { SAMPLE_LOOKS, renderLookSample, drawNeutralScene } from "./utils/sampleLooks";
import VideoTransportBar from "./components/VideoTransportBar";
import {
  useMediaLoader,
  revokeMediaUrls,
  sampleVideoMultiTimestamp,
} from "./hooks/useMediaLoader";
import { useColorMatchWorker } from "./hooks/useColorMatchWorker";
import {
  DEFAULT_LOG_PROFILE,
  resolveLogProfileId,
  getLogProfile,
} from "./utils/logProfiles";

const SLIDER_ICON_MAP = {
  exposure: Sun,
  contrast: Contrast,
  pivot: SlidersHorizontal,
  shadows: Droplet,
  highlights: Sparkles,
  temp: Thermometer,
  tint: Palette,
  sat: Droplet,
  vib: Activity,
};

const PARAM_CONTROLS = SLIDER_PARAM_SPECS.map((spec) => ({
  key: spec.key,
  label: spec.label,
  min: spec.uiMin,
  max: spec.uiMax,
  step: spec.step,
  icon: SLIDER_ICON_MAP[spec.key] || Sliders,
  isBipolar: spec.isBipolar,
}));

const CALIBRATION_STORAGE_KEY = "kf_export_calibration_v1";
const AUTHOR_STORAGE_KEY = "kf_author_name_v1";
const SEEN_UPDATE_STORAGE_KEY = "kf_seen_update_v090";
const SPLASH_SESSION_KEY = "kf_splash_seen_v090";
const SESSION_RECOVERY_KEY = "kf_last_session_v1";
const MAX_HISTORY = 25;
const TONE_KEYS = new Set(["exposure", "contrast", "pivot", "shadows", "highlights"]);
const COLOR_KEYS = new Set(["temp", "tint", "sat", "vib"]);
const TONE_CONTROLS = PARAM_CONTROLS.filter((c) => TONE_KEYS.has(c.key));
const COLOR_CONTROLS = PARAM_CONTROLS.filter((c) => COLOR_KEYS.has(c.key));
const DEFAULT_CALIBRATION = {
  toneScale: 1.0,
  wbScale: 1.0,
  chromaScale: 1.0,
};

function withEngineSuffix(base, engineId) {
  const clean = String(base || "").trim() || "Custom Look";
  const codename = getEngineCodename(engineId);
  const suffix = codename ? `_${codename}` : "";
  if (!suffix || /_(altair|vega|polaris|v[123])$/i.test(clean)) return clean;
  return `${clean}${suffix}`;
}

function areSnapshotsEqual(a, b) {
  if (!a || !b) return false;
  if (a.matchStrength !== b.matchStrength) return false;
  const pa = a.params;
  const pb = b.params;
  for (const k of Object.keys(DEFAULT_PARAMS)) {
    if (Math.abs((pa[k] ?? 0) - (pb[k] ?? 0)) > 1e-5) return false;
  }
  if (Math.abs((pa.autoGradeMix ?? 0) - (pb.autoGradeMix ?? 0)) > 1e-5) return false;
  return true;
}

function toRgbCss(r = 0.5, g = 0.5, b = 0.5) {
  const cb = (v) => Math.max(0, Math.min(255, Math.round((v ?? 0.5) * 255)));
  return `rgb(${cb(r)}, ${cb(g)}, ${cb(b)})`;
}

function hexToRgbaCss(hex, alpha = 0.04) {
  if (!hex || typeof hex !== "string") return `rgba(255, 255, 255, ${alpha})`;
  const clean = hex.replace("#", "").trim();
  if (clean.length !== 6) return `rgba(255, 255, 255, ${alpha})`;
  const rawR = parseInt(clean.slice(0, 2), 16) || 180;
  const rawG = parseInt(clean.slice(2, 4), 16) || 190;
  const rawB = parseInt(clean.slice(4, 6), 16) || 210;
  // Desaturate 70% toward neutral luminance so workstation light-field never biases color perception
  const luma = 0.2126 * rawR + 0.7152 * rawG + 0.0722 * rawB;
  const r = Math.round(luma * 0.7 + rawR * 0.3);
  const g = Math.round(luma * 0.7 + rawG * 0.3);
  const b = Math.round(luma * 0.7 + rawB * 0.3);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function App() {
  const { lang, setLang, t, dict } = useLanguage();
  const [activeTab, setActiveTab] = useState("home");
  const [showSplash, setShowSplash] = useState(() => {
    try {
      if (
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("mediakit") === "1"
      ) {
        return false;
      }
      return sessionStorage.getItem(SPLASH_SESSION_KEY) !== "true";
    } catch {
      return true;
    }
  });
  const [workspacePhase, setWorkspacePhase] = useState(() => {
    try {
      if (
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("mediakit") === "1"
      ) {
        return "settled";
      }
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
  const [isToneExpanded, setIsToneExpanded] = useState(true);
  const [isColorExpanded, setIsColorExpanded] = useState(true);
  const [isEngineCompareOpen, setIsEngineCompareOpen] = useState(false);
  const engineCompareRef = useRef(null);
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(48);
  const [mobileToast, setMobileToast] = useState("");
  const mobileToastTimerRef = useRef(0);

  const showMobileToast = useCallback((msg) => {
    if (!msg) return;
    if (mobileToastTimerRef.current) clearTimeout(mobileToastTimerRef.current);
    setMobileToast(msg);
    mobileToastTimerRef.current = setTimeout(() => {
      setMobileToast("");
      mobileToastTimerRef.current = 0;
    }, 1800);
  }, []);

  const [referenceImage, setReferenceImage] = useState(null);
  const [targetImage, setTargetImage] = useState(null);
  const [referenceError, setReferenceError] = useState("");
  const [targetError, setTargetError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusText, setStatusText] = useState("Ready");
  const [importedLook, setImportedLook] = useState(null);
  const [activeLut, setActiveLut] = useState(null);
  const targetRef = useRef(null);
  const referenceRef = useRef(null);
  const triggerAnalysisRef = useRef(() => {});
  targetRef.current = targetImage;
  referenceRef.current = referenceImage;

  const [hoveredSlot, setHoveredSlot] = useState(null);
  const [focusedSlot, setFocusedSlot] = useState(null);

  // Grading parameters & last matched Reference snapshot (includes 9 sliders + 9 color wheel channels)
  const [gradingParams, setGradingParams] = useState({ ...DEFAULT_PARAMS });
  const [activeEngineId, setActiveEngineId] = useState(DEFAULT_ENGINE_ID);
  const activeEngineIdRef = useRef(DEFAULT_ENGINE_ID);
  activeEngineIdRef.current = activeEngineId;
  const cachedAnalysisBuffersRef = useRef({
    ref: null,
    tgt: null,
    mediaType: "image",
  });
  const [matchStrength, setMatchStrength] = useState(100);
  const [activeSlot, setActiveSlot] = useState("A");
  const [slotSnapshots, setSlotSnapshots] = useState({
    A: {
      params: { ...DEFAULT_PARAMS },
      matchStrength: 100,
      engineId: DEFAULT_ENGINE_ID,
      isFilled: false,
    },
    B: {
      params: { ...DEFAULT_PARAMS },
      matchStrength: 100,
      engineId: DEFAULT_ENGINE_ID,
      isFilled: false,
    },
  });
  const historyRef = useRef({ past: [], future: [] });
  const lastRecordedSnapshotRef = useRef({
    params: { ...DEFAULT_PARAMS },
    matchStrength: 100,
  });
  const isApplyingHistoryRef = useRef(false);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [isPreviewPinned, setIsPreviewPinned] = useState(true);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isLooksOpen, setIsLooksOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isReleaseKitOpen, setIsReleaseKitOpen] = useState(() => {
    try {
      return (
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("mediakit") === "1"
      );
    } catch {
      return false;
    }
  });
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSavingFrame, setIsSavingFrame] = useState(false);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [videoExportProgress, setVideoExportProgress] = useState(0);
  const [videoExportStatusText, setVideoExportStatusText] = useState("");
  const videoExportAbortRef = useRef(null);
  const [restorableSession, setRestorableSession] = useState(null);
  const hasHydratedRef = useRef(false);
  const [simulateLogInput, setSimulateLogInput] = useState(DEFAULT_LOG_PROFILE);
  const [autoNormalizeTarget, setAutoNormalizeTarget] = useState(false);
  const autoNormalizeTargetRef = useRef(false);
  autoNormalizeTargetRef.current = autoNormalizeTarget;
  const [isScopesCollapsed, setIsScopesCollapsed] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 1024 : false
  );
  const [isScopeFrozen, setIsScopeFrozen] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isDesktopRealtime, setIsDesktopRealtime] = useState(() =>
    typeof window !== "undefined" &&
    window.innerWidth >= 1024 &&
    !window.matchMedia?.("(pointer: coarse)")?.matches
  );
  const [webglPhotoError, setWebglPhotoError] = useState(false);
  const [lastMatchedParams, setLastMatchedParams] = useState(null);
  const [reloadedFeedback, setReloadedFeedback] = useState(false);
  const reloadedTimerRef = useRef(null);
  const scopeRef = useRef(null);
  const slotSnapshotsRef = useRef(slotSnapshots);
  slotSnapshotsRef.current = slotSnapshots;

  const isScopesCollapsedRef = useRef(isScopesCollapsed);
  isScopesCollapsedRef.current = isScopesCollapsed;
  const isDesktopRealtimeRef = useRef(isDesktopRealtime);
  isDesktopRealtimeRef.current = isDesktopRealtime;
  const isControlDraggingRef = useRef(false);
  const isScopeFrozenRef = useRef(false);
  isScopeFrozenRef.current = isScopeFrozen;
  const scopeIdleTimerRef = useRef(null);
  const scopeRafRef = useRef(0);
  const scopePhotoSrcRef = useRef(null);
  const refreshScopesOnceRef = useRef(() => {});
  const glPreviewRef = useRef(null);
  const liveParamsRef = useRef({ ...DEFAULT_PARAMS });
  const liveStrengthRef = useRef(100);
  const commitTimerRef = useRef(0);
  const lastCommitAtRef = useRef(0);

  const [previewMode, setPreviewMode] = useState("split");
  const [presetName, setPresetName] = useState("");
  const [authorName, setAuthorName] = useState(() => {
    try {
      return localStorage.getItem(AUTHOR_STORAGE_KEY) || "TFBAGAS";
    } catch {
      return "TFBAGAS";
    }
  });
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
    message: "Calibrated - Canvas & Worker OK",
    deltaE: "0.00",
    latencyMs: 2,
  });
  const [calibrationTick, setCalibrationTick] = useState(0);

  const isCalibrationActive =
    Math.abs(calibration.toneScale - 1.0) > 0.004 ||
    Math.abs(calibration.wbScale - 1.0) > 0.004 ||
    Math.abs(calibration.chromaScale - 1.0) > 0.004;

  const gradedCanvasRef = useRef(null);
  const previewSourceImageDataRef = useRef(null);
  const lastRenderedImgRef = useRef(null);
  const rafRef = useRef(null);
  const simulateLogInputRef = useRef(simulateLogInput);
  simulateLogInputRef.current = simulateLogInput;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const effectiveParams = useMemo(
    () => scaleParamsByStrength(gradingParams, matchStrength),
    [gradingParams, matchStrength]
  );

  const gradingParamsRef = useRef(effectiveParams);
  gradingParamsRef.current = effectiveParams;
  const liveEffectiveParamsRef = useRef(effectiveParams);
  if (!isControlDraggingRef.current) {
    liveEffectiveParamsRef.current = effectiveParams;
  }

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const coarseMq = window.matchMedia?.("(pointer: coarse)");
    const updateDesktopRealtime = () => {
      const next =
        window.innerWidth >= 1024 && !coarseMq?.matches;
      isDesktopRealtimeRef.current = next;
      setIsDesktopRealtime(next);
    };
    window.addEventListener("resize", updateDesktopRealtime);
    coarseMq?.addEventListener?.("change", updateDesktopRealtime);
    return () => {
      window.removeEventListener("resize", updateDesktopRealtime);
      coarseMq?.removeEventListener?.("change", updateDesktopRealtime);
    };
  }, []);

  const isNeutralGrade = useMemo(() => {
    for (const k of Object.keys(DEFAULT_PARAMS)) {
      if (Math.abs((effectiveParams[k] ?? 0) - DEFAULT_PARAMS[k]) > 0.004) {
        return false;
      }
    }
    return Math.abs(effectiveParams.autoGradeMix ?? 0) <= 0.004;
  }, [effectiveParams]);

  // Hydrate #g=... share hash on load, or offer Restore Last Session if non-default.
  useEffect(() => {
    if (hasHydratedRef.current) return;
    hasHydratedRef.current = true;

    const decoded =
      typeof window !== "undefined" ? decodeGradeFromHash(window.location.hash) : null;
    if (decoded) {
      setActiveEngineId(decoded.engineId);
      setSimulateLogInput(decoded.logProfile);
      setMatchStrength(decoded.matchStrength);
      setGradingParams(decoded.params);
      setImportedLook({ name: "Shared Grade", source: "share-link" });
      setStatusText("Loaded Share");
      return;
    }

    try {
      const raw = sessionStorage.getItem(SESSION_RECOVERY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.params && typeof parsed.params === "object") {
          setRestorableSession(parsed);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  // Silent session auto-recovery persistence on parameter/engine/log changes.
  useEffect(() => {
    if (!hasHydratedRef.current) return;
    const isDefault =
      isNeutralGrade &&
      activeEngineId === DEFAULT_ENGINE_ID &&
      simulateLogInput === DEFAULT_LOG_PROFILE &&
      matchStrength === 100 &&
      !presetName;
    if (isDefault) return;
    try {
      sessionStorage.setItem(
        SESSION_RECOVERY_KEY,
        JSON.stringify({
          params: gradingParams,
          engineId: activeEngineId,
          logProfile: simulateLogInput,
          matchStrength,
          presetName,
        })
      );
    } catch {
      // ignore storage errors
    }
  }, [
    isNeutralGrade,
    gradingParams,
    activeEngineId,
    simulateLogInput,
    matchStrength,
    presetName,
  ]);

  // Keep live refs aligned whenever state commits from non-drag actions (analysis, presets, slots, reset).
  useEffect(() => {
    if (!isControlDraggingRef.current) {
      liveParamsRef.current = gradingParams;
      liveStrengthRef.current = matchStrength;
    }
  }, [gradingParams, matchStrength]);

  // Record Undo/Redo snapshots on committed parameter or strength changes (max 25 steps).
  useEffect(() => {
    if (isControlDraggingRef.current) return;
    if (isApplyingHistoryRef.current) {
      isApplyingHistoryRef.current = false;
      return;
    }
    const nextSnap = { params: { ...gradingParams }, matchStrength };
    const prevSnap = lastRecordedSnapshotRef.current;
    if (areSnapshotsEqual(prevSnap, nextSnap)) return;
    const h = historyRef.current;
    h.past = [...h.past.slice(-(MAX_HISTORY - 1)), prevSnap];
    h.future = [];
    lastRecordedSnapshotRef.current = nextSnap;
    setHistoryState({ canUndo: h.past.length > 0, canRedo: false });
  }, [gradingParams, matchStrength]);

  // Measure sticky header height so mobile sticky preview never overlaps wrapped headers.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const update = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) setHeaderHeight(h);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Close engine comparison popover on outside pointerdown or Escape.
  useEffect(() => {
    if (!isEngineCompareOpen) return undefined;
    const onPointerDown = (e) => {
      if (engineCompareRef.current && !engineCompareRef.current.contains(e.target)) {
        setIsEngineCompareOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setIsEngineCompareOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isEngineCompareOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(AUTHOR_STORAGE_KEY, authorName);
    } catch {
      // ignore storage errors
    }
  }, [authorName]);

  useEffect(() => {
    try {
      localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(calibration));
    } catch {
      // ignore storage errors
    }
  }, [calibration]);

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

  const {
    beginAnalysisJob,
    isCurrentJob,
    dispatchAnalysis,
    fitLutInWorker,
    restartWorker,
  } = useColorMatchWorker({
    referenceRef,
    targetRef,
    captureRgba,
    setIsAnalyzing,
    setStatusText,
    setReferenceError,
    setGradingParams,
    setLastMatchedParams,
  });

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

  const setSlotError = useCallback((slot, msg) => {
    if (slot === "reference") {
      setReferenceError(msg);
    } else {
      setTargetError(msg);
    }
  }, []);

  // Triggers background worker analysis (reference vs. current target image / multi-timestamp video)
  const triggerReferenceAnalysis = useCallback(
    async (
      img,
      overrideEngineId = null,
      overrideAutoNorm = null,
      overrideInputProfile = null
    ) => {
      if (!img && !referenceRef.current?.sampledPixels) return;
      const engineToUse = overrideEngineId || activeEngineIdRef.current || DEFAULT_ENGINE_ID;
      const autoNormToUse =
        overrideAutoNorm !== null ? overrideAutoNorm : autoNormalizeTargetRef.current;
      const profileToUse =
        overrideInputProfile !== null
          ? overrideInputProfile
          : simulateLogInputRef.current || DEFAULT_LOG_PROFILE;
      const jobId = beginAnalysisJob();
      setIsAnalyzing(true);
      setStatusText("Analyzing...");

      const ref =
        referenceRef.current?.sampledPixels ||
        (img ? captureRgba(img, analysisMaxDim) : null);
      if (!ref) {
        setIsAnalyzing(false);
        return;
      }

      const tgtInfo = targetRef.current;
      let tgt = null;
      if (tgtInfo) {
        try {
          if (tgtInfo.kind === "video") {
            tgt = await sampleVideoMultiTimestamp(
              tgtInfo.videoEl,
              Math.min(analysisMaxDim, 512),
              captureRgba
            );
          } else if (tgtInfo.imgElement) {
            tgt = captureRgba(tgtInfo.imgElement, Math.min(analysisMaxDim, 960));
          }
        } catch {
          tgt = null;
        }
      }

      // If a newer analysis started while awaiting video frame seek, abort this stale job.
      if (!isCurrentJob(jobId)) return;

      const mediaType = tgtInfo?.kind === "video" ? "video" : "image";
      cachedAnalysisBuffersRef.current = {
        ref,
        tgt,
        mediaType,
      };

      dispatchAnalysis({
        jobId,
        ref,
        tgt,
        mediaType,
        engineId: engineToUse,
        autoNormalizeTarget: autoNormToUse,
        inputProfile: profileToUse,
        preserveBuffers: true,
      });
    },
    [analysisMaxDim, beginAnalysisJob, captureRgba, dispatchAnalysis, isCurrentJob]
  );

  const handleEngineChange = useCallback(
    (nextEngineId) => {
      if (!nextEngineId || nextEngineId === activeEngineIdRef.current) return;

      // Auto-backup previous grade to Slot B on engine switch if Slot B is empty.
      if (!slotSnapshotsRef.current.B?.isFilled && !isNeutralGrade) {
        setSlotSnapshots((prev) => ({
          ...prev,
          B: {
            params: { ...liveParamsRef.current },
            matchStrength: liveStrengthRef.current,
            engineId: activeEngineIdRef.current,
            isFilled: true,
          },
        }));
        showMobileToast(t("toasts.backedUpSlotB"));
      }

      activeEngineIdRef.current = nextEngineId;
      setActiveEngineId(nextEngineId);
      const nextEngineMeta = getEngine(nextEngineId);

      const cached = cachedAnalysisBuffersRef.current;
      if (cached?.ref?.data && cached.ref.numPixels > 0 && referenceRef.current) {
        const jobId = beginAnalysisJob();
        setIsAnalyzing(true);
        setStatusText(`Switching to ${nextEngineMeta.name} (${nextEngineMeta.versionBadge})...`);
        dispatchAnalysis({
          jobId,
          ref: cached.ref,
          tgt: cached.tgt,
          mediaType: cached.mediaType || "image",
          engineId: nextEngineId,
          autoNormalizeTarget: autoNormalizeTargetRef.current,
          inputProfile: simulateLogInputRef.current || DEFAULT_LOG_PROFILE,
          preserveBuffers: true,
        });
      } else if (referenceRef.current?.imgElement) {
        triggerReferenceAnalysis(referenceRef.current.imgElement, nextEngineId);
      } else {
        setStatusText(`Engine: ${nextEngineMeta.name}`);
        showMobileToast(`Engine: ${nextEngineMeta.name} (${nextEngineMeta.versionBadge})`);
      }
    },
    [beginAnalysisJob, dispatchAnalysis, isNeutralGrade, showMobileToast, t, triggerReferenceAnalysis]
  );

  const handleToggleAutoNormalizeTarget = useCallback(
    (nextChecked) => {
      const enabled = Boolean(nextChecked);
      autoNormalizeTargetRef.current = enabled;
      setAutoNormalizeTarget(enabled);

      const cached = cachedAnalysisBuffersRef.current;
      if (cached?.ref?.data && cached.ref.numPixels > 0 && referenceRef.current) {
        const jobId = beginAnalysisJob();
        setIsAnalyzing(true);
        setStatusText(enabled ? "Auto-Normalizing Target & Matching..." : "Re-matching...");
        dispatchAnalysis({
          jobId,
          ref: cached.ref,
          tgt: cached.tgt,
          mediaType: cached.mediaType || "image",
          engineId: activeEngineIdRef.current || DEFAULT_ENGINE_ID,
          autoNormalizeTarget: enabled,
          inputProfile: simulateLogInputRef.current || DEFAULT_LOG_PROFILE,
          preserveBuffers: true,
        });
      } else if (referenceRef.current?.imgElement) {
        triggerReferenceAnalysis(
          referenceRef.current.imgElement,
          activeEngineIdRef.current,
          enabled,
          simulateLogInputRef.current
        );
      } else {
        showMobileToast(enabled ? t("toasts.autoNormOn") : t("toasts.autoNormOff"));
      }
    },
    [beginAnalysisJob, dispatchAnalysis, showMobileToast, t, triggerReferenceAnalysis]
  );

  const handleTargetInputProfileChange = useCallback(
    (nextProfileOrBool) => {
      const nextId = resolveLogProfileId(nextProfileOrBool);
      simulateLogInputRef.current = nextId;
      setSimulateLogInput(nextId);
      const prof = getLogProfile(nextId);

      const cached = cachedAnalysisBuffersRef.current;
      if (cached?.ref?.data && cached.ref.numPixels > 0 && referenceRef.current && targetRef.current) {
        const jobId = beginAnalysisJob();
        setIsAnalyzing(true);
        setStatusText(`Matching with ${prof.shortLabel} input...`);
        dispatchAnalysis({
          jobId,
          ref: cached.ref,
          tgt: cached.tgt,
          mediaType: cached.mediaType || "image",
          engineId: activeEngineIdRef.current || DEFAULT_ENGINE_ID,
          autoNormalizeTarget: autoNormalizeTargetRef.current,
          inputProfile: nextId,
          preserveBuffers: true,
        });
      } else {
        showMobileToast(t("toasts.inputProfile", { label: prof.shortLabel }));
      }
    },
    [beginAnalysisJob, dispatchAnalysis, showMobileToast, t]
  );

  // Match Reference directly against the current video frame (without 3-timestamp seeking).
  const handleMatchCurrentFrame = useCallback(() => {
    const refImg = referenceRef.current?.imgElement;
    const tgtInfo = targetRef.current;
    if ((!refImg && !referenceRef.current?.sampledPixels) || !tgtInfo || tgtInfo.kind !== "video" || !tgtInfo.videoEl) return;

    const refBuf = referenceRef.current?.sampledPixels || captureRgba(refImg, analysisMaxDim);
    const tgtBuf = captureRgba(tgtInfo.videoEl, Math.min(analysisMaxDim, 512));
    if (!refBuf) return;

    const jobId = beginAnalysisJob();
    setIsAnalyzing(true);
    setStatusText("Matching current frame...");
    cachedAnalysisBuffersRef.current = {
      ref: refBuf,
      tgt: tgtBuf,
      mediaType: "video",
    };
    dispatchAnalysis({
      jobId,
      ref: refBuf,
      tgt: tgtBuf,
      mediaType: "video",
      engineId: activeEngineIdRef.current || DEFAULT_ENGINE_ID,
      autoNormalizeTarget: autoNormalizeTargetRef.current,
      inputProfile: simulateLogInputRef.current || DEFAULT_LOG_PROFILE,
      preserveBuffers: true,
    });
  }, [analysisMaxDim, beginAnalysisJob, captureRgba, dispatchAnalysis]);

  triggerAnalysisRef.current = () => {
    const r = referenceRef.current;
    if (r && r.imgElement) triggerReferenceAnalysis(r.imgElement);
  };

  const handleImportPreset = useCallback(
    async (file, meta) => {
      setReferenceError("");
      setStatusText(`Importing ${meta.label}...`);
      try {
        let result;
        let nextLut = null;
        if (meta.ext === "kfplug") {
          result = await importKfplugFile(file);
        } else if (meta.ext === "ffx") {
          result = await parseFfxPreset(file, file.name, lang);
        } else {
          if (file.size > 40 * 1024 * 1024) {
            throw new Error("LUT file is too large (limit 40 MB).");
          }
          const text = await file.text();
          const tgtInfo = targetRef.current;
          let tgtSample = null;
          if (tgtInfo?.kind === "video" && tgtInfo.videoEl?.readyState >= 2) {
            tgtSample = captureRgba(tgtInfo.videoEl, analysisMaxDim);
          } else if (tgtInfo?.imgElement) {
            tgtSample = captureRgba(tgtInfo.imgElement, analysisMaxDim);
          }
          const fitted = await fitLutInWorker(text, tgtSample);
          const baseName = file.name.replace(/\.[^/.]+$/, "");
          nextLut = fitted.lut || null;
          result = {
            kind: fitted.kind,
            name: fitted.title || sanitizeMetadataText(baseName, "Imported LUT", 48),
            author: "",
            description: "",
            statusSummary: `Imported ${fitted.kind} from ${file.name}`,
            params: fitted.params,
            rms: null,
          };
        }
        setActiveLut(nextLut);
        setGradingParams({ ...result.params });
        setLastMatchedParams({ ...result.params });
        setImportedLook({
          kind: result.kind,
          name: result.name,
          rms: result.rms,
          statusSummary:
            result.statusSummary ||
            `Imported ${result.kind} preset from ${file.name}`,
        });
        setPresetName(result.name.slice(0, 28));
        if (result.author) setAuthorName(result.author);
        setDescription(
          result.description || `Imported from ${meta.label}: ${result.name}.`
        );
        setStatusText(
          targetRef.current ? "Preset Imported" : "Direct Preset Conversion Ready"
        );
        if (result.statusSummary) {
          showMobileToast(result.statusSummary);
        }
      } catch (err) {
        if (err && err.message === "Superseded by a newer LUT import.") return;
        setReferenceError((err && err.message) || "Failed to import this file.");
        setStatusText("Import Error");
      }
    },
    [analysisMaxDim, captureRgba, fitLutInWorker, lang, showMobileToast]
  );

  const handleReferenceLoaded = useCallback(
    (info) => {
      setActiveLut(null);
      setImportedLook(null);
      setPresetName(info.baseName.slice(0, 28));
      setDescription(`Grading preset matched from reference '${info.baseName}'.`);
      triggerReferenceAnalysis(info.imgElement);
      setStatusText("Analyzing...");
    },
    [triggerReferenceAnalysis]
  );

  const { loadImageFile, replaceReference, replaceTarget, cancelSlotLoad } = useMediaLoader({
    referenceRef,
    targetRef,
    setReferenceImage,
    setTargetImage,
    setSlotError,
    setStatusText,
    onImportPreset: handleImportPreset,
    onReferenceLoaded: handleReferenceLoaded,
  });

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
  const activePasteTargetRef = useRef(activePasteTarget);
  activePasteTargetRef.current = activePasteTarget;

  useEffect(() => {
    const handlePaste = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const targetSlot = activePasteTargetRef.current;

      for (let i = 0; i < items.length; i++) {
        const mime = items[i].type;
        if (mime.startsWith("image/")) {
          if (!ALLOWED_IMAGE_MIMES.includes(mime)) {
            setSlotError(
              targetSlot,
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
            loadImageFile(file, targetSlot);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [loadImageFile, setSlotError]);

  const videoEl = targetImage?.kind === "video" ? targetImage.videoEl : null;
  const activePreviewImgElement = !videoEl
    ? targetImage?.imgElement || referenceImage?.imgElement || null
    : null;

  const getScopeDims = useCallback((sw, sh) => {
    const desktop = isDesktopRealtimeRef.current;
    const maxW = desktop ? 160 : 96;
    const maxH = desktop ? 90 : 54;
    const scale = Math.min(1, maxW / Math.max(1, sw), maxH / Math.max(1, sh));
    return {
      w: Math.max(1, Math.round(sw * scale)),
      h: Math.max(1, Math.round(sh * scale)),
    };
  }, []);

  const refreshPhotoScope = useCallback(() => {
    if (
      isScopesCollapsedRef.current ||
      (isScopeFrozenRef.current && !isDesktopRealtimeRef.current) ||
      document.hidden ||
      activeTabRef.current !== "home"
    ) {
      return;
    }
    const src = scopePhotoSrcRef.current;
    if (!src) return;
    const outBuf = new Uint8ClampedArray(src.data.length);
    simulateGradePixels(
      src.data,
      outBuf,
      liveEffectiveParamsRef.current,
      simulateLogInputRef.current
    );
    scopeRef.current?.updateFrame({ data: outBuf, width: src.width, height: src.height });
  }, []);

  // Build tiny <=96x54 (mobile) / <=160x90 (desktop) photo source buffer once per image.
  useEffect(() => {
    if (!activePreviewImgElement) {
      scopePhotoSrcRef.current = null;
      if (!videoEl) scopeRef.current?.updateFrame(null);
      return undefined;
    }
    const sw = activePreviewImgElement.naturalWidth || 1;
    const sh = activePreviewImgElement.naturalHeight || 1;
    const { w, h } = getScopeDims(sw, sh);
    const oc = document.createElement("canvas");
    oc.width = w;
    oc.height = h;
    const octx = oc.getContext("2d", { willReadFrequently: true });
    octx.drawImage(activePreviewImgElement, 0, 0, w, h);
    scopePhotoSrcRef.current = octx.getImageData(0, 0, w, h);
    refreshPhotoScope();
    return undefined;
  }, [activePreviewImgElement, videoEl, isDesktopRealtime, getScopeDims, refreshPhotoScope]);

  // CPU 2D fallback ONLY when WebGL is unavailable for photo preview.
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
  }, [effectiveParams, simulateLogInput]);

  useEffect(() => {
    if (!webglPhotoError || videoEl) {
      previewSourceImageDataRef.current = null;
      lastRenderedImgRef.current = null;
      return undefined;
    }

    const activeImg = activePreviewImgElement;
    const canvas = gradedCanvasRef.current;
    if (!activeImg || !canvas) {
      previewSourceImageDataRef.current = null;
      lastRenderedImgRef.current = null;
      return undefined;
    }

    const viewportPreviewCap =
      typeof window !== "undefined" && window.innerWidth < 1024 ? 960 : 1600;
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
    webglPhotoError,
    videoEl,
    activePreviewImgElement,
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

  // Live scope telemetry from the current video frame:
  // 60fps requestAnimationFrame on desktop; throttled <=6 FPS on mobile/tablet; 0ms when paused/hidden/collapsed.
  useEffect(() => {
    if (!videoEl) {
      setIsVideoPlaying(false);
      refreshScopesOnceRef.current = refreshPhotoScope;
      return undefined;
    }

    const small = document.createElement("canvas");
    const sctx = small.getContext("2d", { willReadFrequently: true });
    let gradedBuf = null;
    let intervalId = 0;
    let rafId = 0;

    const tick = (force = false) => {
      if (
        document.hidden ||
        activeTabRef.current !== "home" ||
        isScopesCollapsedRef.current ||
        (isScopeFrozenRef.current && !isDesktopRealtimeRef.current)
      ) {
        return;
      }
      if (!force && (videoEl.paused || videoEl.ended)) return;
      if (videoEl.readyState < 2 || !videoEl.videoWidth) return;
      const { w, h } = getScopeDims(videoEl.videoWidth, videoEl.videoHeight);
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
          liveEffectiveParamsRef.current,
          simulateLogInputRef.current
        );
        scopeRef.current?.updateFrame({ data: gradedBuf, width: w, height: h });
      } catch {
        // frame not readable yet
      }
    };

    refreshScopesOnceRef.current = () => tick(true);

    const canRunLoop = () =>
      !document.hidden &&
      activeTabRef.current === "home" &&
      !isScopesCollapsedRef.current &&
      !videoEl.paused &&
      !videoEl.ended;

    const stopLoop = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = 0;
      }
    };

    const runRaf = () => {
      rafId = 0;
      if (!canRunLoop() || !isDesktopRealtimeRef.current) return;
      tick(false);
      rafId = requestAnimationFrame(runRaf);
    };

    const startLoop = () => {
      if (!canRunLoop()) return;
      if (isDesktopRealtimeRef.current) {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = 0;
        }
        if (!rafId) {
          rafId = requestAnimationFrame(runRaf);
        }
      } else {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
        if (!intervalId) {
          intervalId = setInterval(() => tick(false), 165);
        }
      }
    };

    const onPlay = () => {
      setIsVideoPlaying(true);
      startLoop();
    };
    const onPauseOrEnd = () => {
      setIsVideoPlaying(false);
      stopLoop();
      tick(true);
    };
    const onSeekOrLoad = () => tick(true);
    const onVisibility = () => {
      if (document.hidden) {
        stopLoop();
      } else if (canRunLoop()) {
        startLoop();
        tick(true);
      }
    };

    setIsVideoPlaying(!videoEl.paused && !videoEl.ended);
    tick(true);
    startLoop();

    videoEl.addEventListener("play", onPlay);
    videoEl.addEventListener("pause", onPauseOrEnd);
    videoEl.addEventListener("ended", onPauseOrEnd);
    videoEl.addEventListener("seeked", onSeekOrLoad);
    videoEl.addEventListener("loadeddata", onSeekOrLoad);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopLoop();
      videoEl.removeEventListener("play", onPlay);
      videoEl.removeEventListener("pause", onPauseOrEnd);
      videoEl.removeEventListener("ended", onPauseOrEnd);
      videoEl.removeEventListener("seeked", onSeekOrLoad);
      videoEl.removeEventListener("loadeddata", onSeekOrLoad);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [videoEl, activeTab, isScopesCollapsed, isDesktopRealtime, getScopeDims, refreshPhotoScope]);

  const flushParamCommit = useCallback(() => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = 0;
    }
    lastCommitAtRef.current = performance.now();
    setGradingParams({ ...liveParamsRef.current });
    setMatchStrength(liveStrengthRef.current);
  }, []);

  const scheduleParamCommit = useCallback(() => {
    const now = performance.now();
    const elapsed = now - lastCommitAtRef.current;
    if (elapsed >= 80) {
      flushParamCommit();
    } else if (!commitTimerRef.current) {
      commitTimerRef.current = setTimeout(() => {
        commitTimerRef.current = 0;
        flushParamCommit();
      }, 80 - elapsed);
    }
  }, [flushParamCommit]);

  const scheduleDesktopScopeRefresh = useCallback(() => {
    if (
      !isDesktopRealtimeRef.current ||
      isScopesCollapsedRef.current ||
      document.hidden ||
      activeTabRef.current !== "home"
    ) {
      return;
    }
    if (scopeRafRef.current) return;
    scopeRafRef.current = requestAnimationFrame(() => {
      scopeRafRef.current = 0;
      refreshScopesOnceRef.current();
    });
  }, []);

  // Freeze ProScopes while dragging sliders/wheels/split-bar on mobile/tablet; on desktop keep 60fps real-time updates.
  const handleControlDragChange = useCallback((dragging) => {
    if (scopeIdleTimerRef.current) {
      clearTimeout(scopeIdleTimerRef.current);
      scopeIdleTimerRef.current = null;
    }
    if (dragging) {
      isControlDraggingRef.current = true;
      if (!isDesktopRealtimeRef.current) {
        isScopeFrozenRef.current = true;
        setIsScopeFrozen(true);
      }
    } else {
      isControlDraggingRef.current = false;
      flushParamCommit();
      if (isScopeFrozenRef.current) {
        isScopeFrozenRef.current = false;
        setIsScopeFrozen(false);
      }
      refreshScopesOnceRef.current();
    }
  }, [flushParamCommit]);

  useEffect(() => {
    if (isControlDraggingRef.current) {
      if (isDesktopRealtimeRef.current) {
        scheduleDesktopScopeRefresh();
        return;
      }
      if (!isScopeFrozenRef.current) {
        isScopeFrozenRef.current = true;
        setIsScopeFrozen(true);
      }
      if (scopeIdleTimerRef.current) clearTimeout(scopeIdleTimerRef.current);
      if (scopeRafRef.current) cancelAnimationFrame(scopeRafRef.current);
      scopeIdleTimerRef.current = setTimeout(() => {
        scopeIdleTimerRef.current = null;
        isScopeFrozenRef.current = false;
        setIsScopeFrozen(false);
        refreshScopesOnceRef.current();
      }, 120);
    } else {
      refreshScopesOnceRef.current();
    }
  }, [effectiveParams, simulateLogInput, scheduleDesktopScopeRefresh]);

  useEffect(() => {
    if (!isScopesCollapsed) {
      refreshScopesOnceRef.current();
    }
  }, [isScopesCollapsed]);

  // Release any media object URLs and timers on unmount.
  useEffect(
    () => () => {
      if (scopeIdleTimerRef.current) clearTimeout(scopeIdleTimerRef.current);
      if (scopeRafRef.current) cancelAnimationFrame(scopeRafRef.current);
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      if (reloadedTimerRef.current) clearTimeout(reloadedTimerRef.current);
      if (mobileToastTimerRef.current) clearTimeout(mobileToastTimerRef.current);
      const t = targetRef.current;
      if (t && t.kind === "video") {
        try {
          t.videoEl.pause();
          t.videoEl.removeAttribute("src");
          t.videoEl.load();
        } catch {
          // ignore
        }
      }
      revokeMediaUrls(t);
      revokeMediaUrls(referenceRef.current);
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

    restartWorker();
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
        message: "Calibrated - Canvas & Worker OK",
        deltaE: avgDeltaE,
        latencyMs: elapsed,
      });
      setStatusText("Calibrated");
    }, 180);
  };

  const handleParamChange = useCallback(
    (key, value) => {
      setActiveLut(null);
      glPreviewRef.current?.setActiveLut?.(null);
      const next = { ...liveParamsRef.current, [key]: value };
      liveParamsRef.current = next;
      const eff = scaleParamsByStrength(next, liveStrengthRef.current);
      liveEffectiveParamsRef.current = eff;
      glPreviewRef.current?.setParams?.(eff);
      if (isControlDraggingRef.current) {
        scheduleParamCommit();
        scheduleDesktopScopeRefresh();
      } else {
        setGradingParams(next);
      }
    },
    [scheduleParamCommit, scheduleDesktopScopeRefresh]
  );

  const handleMatchStrengthChange = useCallback(
    (_, val) => {
      const nextStrength = Math.round(val);
      liveStrengthRef.current = nextStrength;
      const eff = scaleParamsByStrength(liveParamsRef.current, nextStrength);
      liveEffectiveParamsRef.current = eff;
      glPreviewRef.current?.setParams?.(eff);
      glPreviewRef.current?.setLutMix?.(nextStrength / 100);
      if (isControlDraggingRef.current) {
        scheduleParamCommit();
        scheduleDesktopScopeRefresh();
      } else {
        setMatchStrength(nextStrength);
      }
    },
    [scheduleParamCommit, scheduleDesktopScopeRefresh]
  );

  const handleCalibrationChange = useCallback((key, value) => {
    setCalibration((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const handleResetParams = useCallback(() => {
    setActiveLut(null);
    glPreviewRef.current?.setActiveLut?.(null);
    setGradingParams({ ...DEFAULT_PARAMS });
    setMatchStrength(100);
    setSimulateLogInput(DEFAULT_LOG_PROFILE);
    setStatusText("Reset");
    showMobileToast(t("toasts.paramsReset"));
  }, [showMobileToast, t]);

  const handleUndo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const prev = h.past[h.past.length - 1];
    h.past = h.past.slice(0, -1);
    h.future = [lastRecordedSnapshotRef.current, ...h.future].slice(0, MAX_HISTORY);
    isApplyingHistoryRef.current = true;
    lastRecordedSnapshotRef.current = prev;
    setGradingParams({ ...prev.params });
    setMatchStrength(prev.matchStrength);
    setHistoryState({ canUndo: h.past.length > 0, canRedo: h.future.length > 0 });
    setStatusText("Undo");
    showMobileToast(t("toasts.undo"));
  }, [showMobileToast, t]);

  const handleRedo = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const next = h.future[0];
    h.future = h.future.slice(1);
    h.past = [...h.past, lastRecordedSnapshotRef.current].slice(-MAX_HISTORY);
    isApplyingHistoryRef.current = true;
    lastRecordedSnapshotRef.current = next;
    setGradingParams({ ...next.params });
    setMatchStrength(next.matchStrength);
    setHistoryState({ canUndo: h.past.length > 0, canRedo: h.future.length > 0 });
    setStatusText("Redo");
    showMobileToast(t("toasts.redo"));
  }, [showMobileToast, t]);

  const handleWheelChange = useCallback(
    (prefix, [r, g, b]) => {
      setActiveLut(null);
      glPreviewRef.current?.setActiveLut?.(null);
      const next = {
        ...liveParamsRef.current,
        [`${prefix}R`]: r,
        [`${prefix}G`]: g,
        [`${prefix}B`]: b,
      };
      liveParamsRef.current = next;
      const eff = scaleParamsByStrength(next, liveStrengthRef.current);
      liveEffectiveParamsRef.current = eff;
      glPreviewRef.current?.setParams?.(eff);
      if (isControlDraggingRef.current) {
        scheduleParamCommit();
        scheduleDesktopScopeRefresh();
      } else {
        setGradingParams(next);
      }
    },
    [scheduleParamCommit, scheduleDesktopScopeRefresh]
  );

  const handleWheelReset = useCallback(
    (prefix) => {
      handleWheelChange(prefix, [0.5, 0.5, 0.5]);
    },
    [handleWheelChange]
  );

  const handleLiftChange = useCallback((rgb) => handleWheelChange("lift", rgb), [handleWheelChange]);
  const handleGammaChange = useCallback((rgb) => handleWheelChange("gamma", rgb), [handleWheelChange]);
  const handleGainChange = useCallback((rgb) => handleWheelChange("gain", rgb), [handleWheelChange]);
  const handleLiftReset = useCallback(() => handleWheelReset("lift"), [handleWheelReset]);
  const handleGammaReset = useCallback(() => handleWheelReset("gamma"), [handleWheelReset]);
  const handleGainReset = useCallback(() => handleWheelReset("gain"), [handleWheelReset]);

  const liftRgb = useMemo(
    () => [gradingParams.liftR, gradingParams.liftG, gradingParams.liftB],
    [gradingParams.liftR, gradingParams.liftG, gradingParams.liftB]
  );
  const gammaRgb = useMemo(
    () => [gradingParams.gammaR, gradingParams.gammaG, gradingParams.gammaB],
    [gradingParams.gammaR, gradingParams.gammaG, gradingParams.gammaB]
  );
  const gainRgb = useMemo(
    () => [gradingParams.gainR, gradingParams.gainG, gradingParams.gainB],
    [gradingParams.gainR, gradingParams.gainG, gradingParams.gainB]
  );

  const handleSwitchSlot = useCallback(
    (nextSlot) => {
      if (nextSlot === activeSlot) return;
      const updated = {
        ...slotSnapshotsRef.current,
        [activeSlot]: {
          params: { ...gradingParams },
          matchStrength,
          engineId: activeEngineId,
          isFilled: true,
        },
      };
      const loaded = updated[nextSlot] || {
        params: { ...DEFAULT_PARAMS },
        matchStrength: 100,
        engineId: activeEngineId,
        isFilled: false,
      };
      setSlotSnapshots(updated);
      setGradingParams({ ...(loaded.params || DEFAULT_PARAMS) });
      setMatchStrength(loaded.matchStrength ?? 100);
      if (loaded.engineId && loaded.engineId !== activeEngineId) {
        activeEngineIdRef.current = loaded.engineId;
        setActiveEngineId(loaded.engineId);
      }
      setActiveSlot(nextSlot);
      setStatusText(`Slot ${nextSlot}`);
      showMobileToast(`Slot ${nextSlot}`);
    },
    [activeEngineId, activeSlot, gradingParams, matchStrength, showMobileToast]
  );

  const handleCopyToB = useCallback(() => {
    setSlotSnapshots((prev) => ({
      ...prev,
      B: {
        params: { ...gradingParams },
        matchStrength,
        engineId: activeEngineId,
        isFilled: true,
      },
    }));
    setStatusText("Copied to B");
    showMobileToast(t("toasts.copiedToSlotB"));
  }, [activeEngineId, gradingParams, matchStrength, showMobileToast, t]);

  const handleSaveImage = async ({
    format = "png",
    quality = 95,
    layout = "graded",
    splitPos = 50,
    promoAspect = "16:9",
    includeQr = false,
    qrMode = "grade",
    qrUrl = "",
  } = {}) => {
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
      const baseName = withEngineSuffix(
        targetImage?.baseName || referenceImage?.baseName || presetName || "Target",
        activeEngineId
      );
      const presetTitle =
        presetName || referenceImage?.baseName || importedLook?.name || "Custom Look";
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
        presetTitle,
        engineId: activeEngineId,
        promoAspect,
        includeQr,
        qrMode,
        qrUrl,
        activeLut,
        lutMix: matchStrength / 100,
      });
      setStatusText(`Saved ${format.toUpperCase()}`);
      showMobileToast(t("toasts.savedFormat", { format: format.toUpperCase() }));
      return true;
    } catch {
      setStatusText("Export Error");
      return false;
    } finally {
      setIsSavingFrame(false);
    }
  };

  const handleExportVideo = useCallback(
    async ({
      renderMode = "local",
      targetVideoSrc = "",
      targetFile = null,
      layout = "graded",
      splitPosition = 50,
      bitrateMbps = 16,
      includeAudio = true,
    } = {}) => {
      if (isExportingVideo) return false;
      const src =
        targetVideoSrc ||
        targetImage?.videoUrl ||
        videoEl?.currentSrc ||
        videoEl?.src ||
        "";
      const fileFallback = targetFile || targetImage?.file || null;

      const controller = new AbortController();
      videoExportAbortRef.current = controller;
      setIsExportingVideo(true);
      setVideoExportProgress(0);
      setVideoExportStatusText(
        renderMode === "cloud" ? "Waking up cloud worker..." : ""
      );
      setStatusText(
        renderMode === "cloud" ? "Cloud Rendering Video..." : "Rendering Video..."
      );

      try {
        const baseName =
          presetName || targetImage?.baseName || referenceImage?.baseName || "Target";
        const res =
          renderMode === "cloud"
            ? await exportVideoInCloud({
                videoSrc: src,
                targetFile: fileFallback,
                videoDurationSec: Number.isFinite(videoEl?.duration)
                  ? videoEl.duration
                  : 0,
                params: gradingParams,
                activeLut,
                lutMix: matchStrength / 100,
                engine: activeEngineId,
                matchStrength,
                logProfile: simulateLogInput,
                presetName: baseName,
                onProgress: (pct) => setVideoExportProgress(pct),
                onStatusChange: ({ progress, statusText: nextText }) => {
                  if (typeof progress === "number") setVideoExportProgress(progress);
                  if (nextText) {
                    setVideoExportStatusText(nextText);
                    setStatusText(nextText);
                  }
                },
                abortSignal: controller.signal,
              })
            : await exportGradedVideo({
                videoSrc: src,
                targetFile: fileFallback,
                params: gradingParams,
                activeLut,
                lutMix: matchStrength / 100,
                engine: activeEngineId,
                matchStrength,
                logProfile: simulateLogInput,
                layout,
                splitPosition,
                bitrateMbps,
                includeAudio,
                presetName: baseName,
                onProgress: (pct) => setVideoExportProgress(pct),
                abortSignal: controller.signal,
              });
        setStatusText("Exported Video!");
        showMobileToast(t("toasts.savedFormat", { format: res.fileName }));
        return true;
      } catch (err) {
        if (err?.name === "AbortError") {
          setStatusText("Export Cancelled");
          showMobileToast(t("toasts.videoExportCancelled"));
          return false;
        }
        setStatusText("Video Export Error");
        throw err;
      } finally {
        videoExportAbortRef.current = null;
        setIsExportingVideo(false);
        setVideoExportProgress(0);
        setVideoExportStatusText("");
      }
    },
    [
      isExportingVideo,
      targetImage,
      videoEl,
      presetName,
      referenceImage,
      gradingParams,
      activeLut,
      activeEngineId,
      matchStrength,
      simulateLogInput,
      showMobileToast,
      t,
    ]
  );

  const handleCancelVideoExport = useCallback(() => {
    videoExportAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((v) => !v);
        return;
      }
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      } else if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setIsShortcutsOpen((v) => !v);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "1") {
        handleEngineChange("v1");
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "2") {
        handleEngineChange("v2");
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "3") {
        handleEngineChange("v3");
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
  }, [handleEngineChange, handleRedo, handleUndo, videoEl]);

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
      if (reloadedTimerRef.current) clearTimeout(reloadedTimerRef.current);
      setReloadedFeedback(true);
      reloadedTimerRef.current = setTimeout(() => setReloadedFeedback(false), 1200);
    } else if (referenceImage?.imgElement) {
      triggerReferenceAnalysis(referenceImage.imgElement);
    }
  };

  const hasLook = Boolean(referenceImage || importedLook);

  const handleExportLut = useCallback(
    (ext, size = 33) => {
      if (!hasLook) return;
      try {
        const rawName = withEngineSuffix(
          presetName || referenceImage?.baseName || importedLook?.name || "Custom Look",
          activeEngineId
        );
        const safePreset = sanitizeMetadataText(rawName, "Custom Look", 64);
        const { blob, fileName } = generateLutFile(
          applyCalibrationToParams(effectiveParams, calibration),
          safePreset,
          ext,
          simulateLogInput,
          size,
          activeLut,
          matchStrength / 100
        );
        downloadBlob(blob, fileName);
        setStatusText(`Exported .${ext}`);
        showMobileToast(t("toasts.exportedFile", { file: `.${ext}` }));
      } catch {
        setStatusText("Export Error");
      }
    },
    [
      hasLook,
      presetName,
      referenceImage,
      importedLook,
      activeEngineId,
      effectiveParams,
      calibration,
      simulateLogInput,
      activeLut,
      matchStrength,
      showMobileToast,
      t,
    ]
  );

  const handleExportCube = useCallback(
    (size = 33) => handleExportLut("cube", size),
    [handleExportLut]
  );
  const handleExportLut3d = useCallback(() => handleExportLut("lut", 33), [handleExportLut]);

  const handleExportFfx = useCallback(async () => {
    if (!hasLook) return;
    setIsExporting(true);
    setStatusText("Exporting .ffx...");
    try {
      const calibratedParams = applyCalibrationToParams(
        effectiveParams,
        calibration
      );
      const rawName = withEngineSuffix(
        presetName || referenceImage?.baseName || importedLook?.name || "Custom Look",
        activeEngineId
      );
      const safePreset = sanitizeMetadataText(rawName, "Custom_Look", 64);
      const { blob, fileName } = await exportToFfx(
        calibratedParams,
        safePreset,
        null,
        simulateLogInput
      );
      downloadBlob(blob, fileName);
      setStatusText("Exported .ffx");
      showMobileToast(t("toasts.exportedFile", { file: fileName }));
      setExportToast({ visible: true, filename: fileName });
    } catch {
      setStatusText("Export Error");
    } finally {
      setIsExporting(false);
    }
  }, [
    hasLook,
    effectiveParams,
    calibration,
    presetName,
    referenceImage,
    importedLook,
    activeEngineId,
    simulateLogInput,
    showMobileToast,
    t,
  ]);

  const handleResetCalibration = () => {
    setCalibration({ ...DEFAULT_CALIBRATION });
  };

  const handleExport = useCallback(async () => {
    if (!hasLook) return;
    setIsExporting(true);
    setStatusText("Exporting...");
    try {
      const calibratedParams = applyCalibrationToParams(
        effectiveParams,
        calibration
      );
      const rawName = withEngineSuffix(
        presetName || referenceImage?.baseName || importedLook?.name || "Custom Look",
        activeEngineId
      );
      const safePreset = sanitizeMetadataText(rawName, "Custom Look", 64);
      const safeAuthor = sanitizeMetadataText(authorName, "TFBAGAS", 64);
      const safeDesc = sanitizeMetadataText(description, "", 200);

      const { blob, fileName } = await generateKfplug(
        calibratedParams,
        safePreset,
        safeAuthor,
        safeDesc,
        simulateLogInput,
        activeLut,
        matchStrength / 100
      );
      downloadBlob(blob, fileName);
      setStatusText("Exported!");
      showMobileToast(t("toasts.exportedFile", { file: fileName }));
      setExportToast({ visible: true, filename: fileName });
    } catch {
      setStatusText("Export Error");
    } finally {
      setIsExporting(false);
    }
  }, [
    hasLook,
    effectiveParams,
    calibration,
    presetName,
    referenceImage,
    importedLook,
    activeEngineId,
    authorName,
    description,
    simulateLogInput,
    activeLut,
    matchStrength,
    showMobileToast,
    t,
  ]);

  const handleExportZipPack = useCallback(
    async (cubeSize = 33) => {
      if (!hasLook || isExporting) return;
      setIsExporting(true);
      setStatusText("Packaging .zip...");
      try {
        const calibratedParams = applyCalibrationToParams(effectiveParams, calibration);
        const rawBase =
          presetName || referenceImage?.baseName || importedLook?.name || "Custom Look";
        const withEng = withEngineSuffix(rawBase, activeEngineId);
        const safePreset = sanitizeMetadataText(withEng, "Custom Look", 64);
        const safeAuthor = sanitizeMetadataText(authorName, "TFBAGAS", 64);
        const safeDesc = sanitizeMetadataText(description, "", 200);
        const filePrefix =
          safePreset.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "Custom_Look";

        const [kfRes, ffxRes] = await Promise.all([
          generateKfplug(
            calibratedParams,
            safePreset,
            safeAuthor,
            safeDesc,
            simulateLogInput,
            activeLut,
            matchStrength / 100
          ),
          exportToFfx(calibratedParams, safePreset, null, simulateLogInput),
        ]);
        const cubeRes = generateLutFile(
          calibratedParams,
          safePreset,
          "cube",
          simulateLogInput,
          cubeSize,
          activeLut,
          matchStrength / 100
        );

        const entries = [
          { name: `${filePrefix}.kfplug`, data: kfRes.blob },
          { name: `${filePrefix}.ffx`, data: ffxRes.blob },
          { name: `${filePrefix}.cube`, data: cubeRes.blob },
        ];

        const isVideoTarget = targetImage?.kind === "video" && videoEl;
        const previewSrc = isVideoTarget
          ? videoEl
          : targetImage?.imgElement || referenceImage?.imgElement;
        const pw = isVideoTarget ? videoEl?.videoWidth : previewSrc?.naturalWidth;
        const ph = isVideoTarget ? videoEl?.videoHeight : previewSrc?.naturalHeight;

        if (previewSrc && pw && ph) {
          const promoRes = await exportPromoCardBlob({
            source: previewSrc,
            width: pw,
            height: ph,
            params: effectiveParams,
            splitPos: 50,
            simulateLogInput,
            presetTitle: rawBase,
            engineId: activeEngineId,
            aspectRatio: "16:9",
            format: "png",
          });
          entries.push({ name: `${filePrefix}_PromoCard.png`, data: promoRes.blob });
        }

        const zipBlob = await buildZipBlob(entries);
        const zipName = `${filePrefix}_Pack.zip`;
        downloadBlob(zipBlob, zipName);
        setStatusText("Exported Pack!");
        showMobileToast(t("toasts.exportedFile", { file: zipName }));
        setExportToast({ visible: true, filename: zipName });
      } catch {
        setStatusText("Export Error");
      } finally {
        setIsExporting(false);
      }
    },
    [
      hasLook,
      isExporting,
      effectiveParams,
      calibration,
      presetName,
      referenceImage,
      importedLook,
      activeEngineId,
      authorName,
      description,
      simulateLogInput,
      activeLut,
      matchStrength,
      targetImage,
      videoEl,
      showMobileToast,
      t,
    ]
  );

  const handleApplyLook = useCallback(
    (look) => {
      if (!look || !look.params) return;
      setActiveLut(null);
      if (look.engineId && ["v1", "v2", "v3"].includes(look.engineId)) {
        setActiveEngineId(look.engineId);
      }
      if (look.logProfile) {
        setSimulateLogInput(resolveLogProfileId(look.logProfile));
      }
      if (typeof look.matchStrength === "number") {
        setMatchStrength(look.matchStrength);
      }
      setGradingParams({ ...DEFAULT_PARAMS, ...look.params });
      setPresetName(look.name || "Custom Look");
      setImportedLook({ name: look.name || "Custom Look", source: "looks-drawer" });
      setStatusText("Applied Look");
      showMobileToast(t("toasts.appliedLook", { name: look.name }));
    },
    [showMobileToast, t]
  );

  const handleComputeSwatches = useCallback(() => {
    const isVideoTarget = targetImage?.kind === "video" && videoEl;
    const src = isVideoTarget
      ? videoEl
      : targetImage?.imgElement || referenceImage?.imgElement;
    if (!src) {
      return ["#1B263B", "#415A77", "#778DA9", "#D4A373", "#E9ECEF"];
    }
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d");
    ctx.drawImage(src, 0, 0, 64, 64);
    return extractPaletteSwatches(c, 5);
  }, [targetImage, videoEl, referenceImage]);

  const handleTryInstantDemo = useCallback(() => {
    handleTrySample("reference", SAMPLE_LOOKS[0].id);
    handleTrySample("target");
    setStatusText("Demo Loaded");
  }, [handleTrySample]);

  const handleRestoreSession = useCallback(() => {
    if (!restorableSession) return;
    setActiveLut(null);
    if (restorableSession.engineId) setActiveEngineId(restorableSession.engineId);
    if (restorableSession.logProfile) setSimulateLogInput(resolveLogProfileId(restorableSession.logProfile));
    if (typeof restorableSession.matchStrength === "number") {
      setMatchStrength(restorableSession.matchStrength);
    }
    if (restorableSession.presetName) setPresetName(restorableSession.presetName);
    setGradingParams({ ...DEFAULT_PARAMS, ...restorableSession.params });
    setImportedLook({ name: restorableSession.presetName || "Restored Session", source: "session" });
    setRestorableSession(null);
    setStatusText("Restored Session");
    showMobileToast(t("toasts.restoredLastSession"));
  }, [restorableSession, showMobileToast, t]);

  const handleShare = useCallback(async () => {
    if (!hasLook || typeof navigator === "undefined" || typeof navigator.share !== "function") {
      return;
    }
    setIsExporting(true);
    try {
      const calibratedParams = applyCalibrationToParams(effectiveParams, calibration);
      const rawName = withEngineSuffix(
        presetName || referenceImage?.baseName || importedLook?.name || "Custom Look",
        activeEngineId
      );
      const safePreset = sanitizeMetadataText(rawName, "Custom Look", 64);
      const safeAuthor = sanitizeMetadataText(authorName, "TFBAGAS", 64);
      const safeDesc = sanitizeMetadataText(description, "", 200);
      const { blob, fileName } = await generateKfplug(
        calibratedParams,
        safePreset,
        safeAuthor,
        safeDesc,
        simulateLogInput,
        activeLut,
        matchStrength / 100
      );
      const file = new File([blob], fileName, { type: "application/zip" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: safePreset });
        setStatusText("Shared!");
        showMobileToast(t("toasts.sharedKfplug"));
      } else {
        downloadBlob(blob, fileName);
        setStatusText("Exported!");
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        setStatusText("Share Error");
      }
    } finally {
      setIsExporting(false);
    }
  }, [
    hasLook,
    effectiveParams,
    calibration,
    presetName,
    referenceImage,
    importedLook,
    activeEngineId,
    authorName,
    description,
    simulateLogInput,
    activeLut,
    matchStrength,
    showMobileToast,
    t,
  ]);

  const handleSelectReference = useCallback(
    (file) => loadImageFile(file, "reference"),
    [loadImageFile]
  );
  const handleClearReference = useCallback(() => {
    cancelSlotLoad("reference");
    replaceReference(null);
    cachedAnalysisBuffersRef.current = { ref: null, tgt: null, mediaType: "image" };
    if (!importedLook) setLastMatchedParams(null);
    setReferenceError("");
    setStatusText("Ready");
  }, [cancelSlotLoad, replaceReference, importedLook]);
  const handleTryReferenceSample = useCallback(
    (id) => handleTrySample("reference", id),
    [handleTrySample]
  );
  const handleClearImportedLook = useCallback(() => {
    setActiveLut(null);
    setImportedLook(null);
    setLastMatchedParams(null);
  }, []);
  const handleHoverReference = useCallback(
    (hovered) => setHoveredSlot(hovered ? "reference" : null),
    []
  );
  const handleFocusReference = useCallback(() => setFocusedSlot("reference"), []);

  const handleSelectTarget = useCallback(
    (file) => loadImageFile(file, "target"),
    [loadImageFile]
  );
  const handleClearTarget = useCallback(() => {
    cancelSlotLoad("target");
    replaceTarget(null);
    cachedAnalysisBuffersRef.current = {
      ...cachedAnalysisBuffersRef.current,
      tgt: null,
      mediaType: "image",
    };
    setTargetError("");
  }, [cancelSlotLoad, replaceTarget]);
  const handleTryTargetSample = useCallback(
    () => handleTrySample("target"),
    [handleTrySample]
  );
  const handleHoverTarget = useCallback(
    (hovered) => setHoveredSlot(hovered ? "target" : null),
    []
  );
  const handleFocusTarget = useCallback(() => setFocusedSlot("target"), []);

  const handleToggleScopesCollapse = useCallback(
    () => setIsScopesCollapsed((v) => !v),
    []
  );
  const handleOpenCalibration = useCallback(() => setActiveTab("settings"), []);

  const activePreviewImageUrl =
    targetImage?.dataUrl || referenceImage?.dataUrl || null;

  const navTabs = useMemo(
    () => [
      { id: "home", label: t("nav.workspace"), icon: Sliders },
      { id: "settings", label: t("nav.settings"), icon: Settings },
      { id: "about", label: t("nav.about"), icon: Info },
      { id: "support", label: t("nav.support"), icon: Heart },
    ],
    [t]
  );

  const {
    containerRef: navContainerRef,
    registerTabRef: registerNavTabRef,
    pillStyle: navPillStyle,
  } = usePillIndicator(`${activeTab}-${lang}`);

  const engineOptions = useMemo(
    () =>
      listEngines().map((eng) => ({
        ...eng,
        subtitle: t(`engines.${eng.id}.subtitle`) || eng.subtitle,
        bestFor: t(`engines.${eng.id}.bestFor`) || eng.bestFor,
        summary: t(`engines.${eng.id}.summary`) || eng.summary,
        pipelineBadges:
          dict?.engines?.[eng.id]?.pipelineBadges || eng.pipelineBadges,
      })),
    [t, dict]
  );
  const activeEngine = useMemo(
    () => engineOptions.find((e) => e.id === activeEngineId) || engineOptions[2],
    [engineOptions, activeEngineId]
  );
  const activeEngineIndex = useMemo(
    () => Math.max(0, engineOptions.findIndex((e) => e.id === activeEngineId)),
    [engineOptions, activeEngineId]
  );
  const hasPreviewImage = Boolean(activePreviewImageUrl) || Boolean(videoEl);

  // Extract 5 dominant colors from REFERENCE media for 5-Swatch Glass Palette Droplets
  // and ultra-restrained 4% neutral-desaturated ambient tint behind top header.
  const referencePalette = useMemo(() => {
    const src = referenceImage?.imgElement || referenceImage?.videoEl;
    if (!src) return [];
    try {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext("2d");
      ctx.drawImage(src, 0, 0, 64, 64);
      return extractPaletteSwatches(c, 5);
    } catch {
      return [];
    }
  }, [referenceImage]);

  const ambientPrimary = useMemo(
    () =>
      referencePalette[0]
        ? hexToRgbaCss(referencePalette[0], 0.04)
        : "rgba(255, 255, 255, 0.045)",
    [referencePalette]
  );

  const ambientSecondary = useMemo(
    () =>
      referencePalette[1]
        ? hexToRgbaCss(referencePalette[1], 0.03)
        : "rgba(255, 255, 255, 0.025)",
    [referencePalette]
  );

  const handleCopySwatchToast = useCallback(
    (hex) => {
      showMobileToast(t("toasts.copiedHex", { hex }));
    },
    [showMobileToast, t]
  );

  const handleSwitchLanguage = useCallback(
    (nextLang) => {
      const resolved = nextLang === "id" ? "id" : "en";
      if (resolved === lang) return;
      setLang(resolved);
      showMobileToast(resolved === "id" ? "Bahasa: Indonesia" : "Language: English");
    },
    [lang, setLang, showMobileToast]
  );

  return (
    <div
      style={{
        "--kf-header-h": `${headerHeight}px`,
        "--ambient-primary": ambientPrimary,
        "--ambient-secondary": ambientSecondary,
      }}
      className="min-h-screen flex flex-col relative bg-transparent text-[#E2E4E9] overflow-x-clip"
    >
      {/* Global SVG Gooey Metaball Filter for Liquid Droplet Detachment */}
      <svg className="hidden" aria-hidden="true">
        <defs>
          <filter id="liquid-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      {/* v0.9.5 Luxury Enterprise Minimalist Intro & Spatial Zoom-Through */}
      {showSplash && (
        <IntroScreen
          onStartExit={handleStartExit}
          onComplete={handleSplashComplete}
        />
      )}

      {/* 120fps GPU-Composited Monochrome Anamorphic Liquid Light-Field Backdrop (z-0 over body #060709) */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-0 overflow-hidden pointer-events-none"
      >
        {/* Diagonal Anamorphic Light Ribbons */}
        <div className="workspace-anamorphic-ribbon-a absolute -inset-x-[25%] -top-[18%] h-[68vh]" />
        <div className="workspace-anamorphic-ribbon-b absolute -inset-x-[25%] -bottom-[14%] h-[62vh]" />

        {/* Organic Liquid Caustic Pools */}
        <div className="workspace-caustic-pool-a absolute -inset-x-[30%] top-[14%] h-[44vh] rounded-full" />
        <div className="workspace-caustic-pool-b absolute -inset-x-[22%] bottom-[12%] h-[38vh] rounded-full" />

        {/* Subtle Anamorphic Horizon Line */}
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent 8%, rgba(255, 255, 255, 0.08) 50%, transparent 92%)",
          }}
        />
        <div className="obsidian-studio-light absolute inset-0" />
        <div className="optical-caustic-grain absolute inset-0" />
      </div>

      {/* Compact Self-Contained Vertical Pill Rail Fixed to Left Viewport Margin (2xl+ only) */}
      <aside
        aria-label={t("nav.railLabel")}
        className="optical-refract-glass fresnel-glass-rim fixed left-3.5 top-1/2 -translate-y-1/2 z-40 hidden 2xl:flex flex-col items-center gap-1.5 w-11 p-1.5 rounded-full bg-[#121419]/82 border border-white/[0.09]"
      >
        <button
          type="button"
          onClick={handleUndo}
          disabled={!historyState.canUndo}
          title={t("nav.undoTitle")}
          aria-label={t("nav.undoTitle")}
          className={`m3-btn-morph w-8 h-8 rounded-full flex items-center justify-center border ${
            !historyState.canUndo
              ? "bg-white/[0.02] text-[#9CA3AF]/30 border-white/[0.05] cursor-not-allowed"
              : "bg-white/[0.045] hover:bg-white/[0.10] text-[#E2E4E9] border-white/[0.10] cursor-pointer"
          }`}
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={handleRedo}
          disabled={!historyState.canRedo}
          title={t("nav.redoTitle")}
          aria-label={t("nav.redoTitle")}
          className={`m3-btn-morph w-8 h-8 rounded-full flex items-center justify-center border ${
            !historyState.canRedo
              ? "bg-white/[0.02] text-[#9CA3AF]/30 border-white/[0.05] cursor-not-allowed"
              : "bg-white/[0.045] hover:bg-white/[0.10] text-[#E2E4E9] border-white/[0.10] cursor-pointer"
          }`}
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>

        <div className="w-5 h-px bg-white/[0.09] my-0.5" />

        <button
          type="button"
          onClick={() => handleSwitchSlot(activeSlot === "A" ? "B" : "A")}
          title={t("nav.slotToggleTitle", { slot: activeSlot })}
          aria-label={t("nav.slotToggleTitle", { slot: activeSlot })}
          className="m3-btn-morph w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.055] hover:bg-white/[0.12] border border-white/[0.10] text-[10px] font-mono font-bold text-[#F4F5F7] cursor-pointer"
        >
          {activeSlot}
        </button>

        <button
          type="button"
          onClick={() => setIsLooksOpen(true)}
          title={t("nav.looksTitle")}
          aria-label={t("nav.looksTitle")}
          className="m3-btn-morph w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.045] hover:bg-white/[0.10] border border-white/[0.10] text-[#6EE7B7] cursor-pointer"
        >
          <Bookmark className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={handleToggleScopesCollapse}
          title={isScopesCollapsed ? t("nav.showScopes") : t("nav.hideScopes")}
          aria-label={t("nav.toggleScopesLabel")}
          className={`m3-btn-morph w-8 h-8 rounded-full flex items-center justify-center border cursor-pointer ${
            !isScopesCollapsed
              ? "bg-[#6EE7B7]/16 text-[#6EE7B7] border-[#6EE7B7]/35"
              : "bg-white/[0.045] hover:bg-white/[0.10] text-[#9CA3AF] hover:text-[#E2E4E9] border-white/[0.10]"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setIsCommandPaletteOpen(true)}
          title={t("nav.commandPaletteTitle")}
          aria-label={t("nav.commandPaletteTitle")}
          className="m3-btn-morph w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.045] hover:bg-white/[0.10] border border-white/[0.10] text-[#E2E4E9] cursor-pointer"
        >
          <Search className="w-3.5 h-3.5" />
        </button>

        <div className="w-5 h-px bg-white/[0.09] my-0.5" />

        <button
          type="button"
          onClick={() => setIsShareOpen(true)}
          title={t("nav.shareTitle")}
          aria-label={t("nav.shareTitle")}
          className="m3-btn-morph w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.045] hover:bg-white/[0.10] border border-white/[0.10] text-[#9CA3AF] hover:text-[#E2E4E9] cursor-pointer"
        >
          <Share2 className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setIsShortcutsOpen(true)}
          title={t("nav.shortcutsTitle")}
          aria-label={t("nav.shortcutsTitle")}
          className="m3-btn-morph w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.045] hover:bg-white/[0.10] border border-white/[0.10] text-[#9CA3AF] hover:text-[#E2E4E9] cursor-pointer"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </aside>

      {/* Foreground Application Content Wrapper (no transform when visible so sticky header + backdrop-filter work reliably) */}
      <div
        className={`relative z-10 min-h-screen overflow-x-clip flex flex-col bg-transparent ${
          workspacePhase === "hidden"
            ? "opacity-0 pointer-events-none scale-[0.97]"
            : "opacity-100"
        }`}
      >
      {/* 1. Compact 48px Top App Bar (direct sticky child of scrolling viewport) */}
      <header
        ref={headerRef}
        style={{
          backgroundColor: "rgba(10, 12, 16, 0.72)",
          backdropFilter: "blur(20px) saturate(150%)",
          WebkitBackdropFilter: "blur(20px) saturate(150%)",
        }}
        className={`sticky top-0 z-50 w-full min-h-12 px-3 sm:px-5 py-1.5 border-b border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_12px_32px_-12px_rgba(0,0,0,0.72)] flex flex-wrap items-center justify-between gap-2 ${
          workspacePhase === "morphing-in" ? "m3-morph-topbar" : ""
        }`}
      >
        {/* Left: Achromatic Keyflow Logo + Brand Title + v0.9.5 Beta Badge + Support Capsule */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0 max-w-full">
          <KeyflowLogo size={26} />
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
            <h1 className="text-sm sm:text-base font-bold font-display tracking-tight text-[#E2E4E9] truncate">
              Color Match for Keyflow
            </h1>
            <button
              type="button"
              onClick={handleOpenChangelog}
              title={t("nav.whatsNewTitle")}
              className="m3-btn-morph inline-flex items-center gap-1 text-[10px] font-mono px-2 sm:px-2.5 py-0.5 rounded-full bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.11] text-[#E2E4E9] hover:border-white/25 cursor-pointer"
            >
              {hasUnreadUpdate && (
                <span className="liquid-droplet-badge w-1.5 h-1.5 rounded-full bg-[#6EE7B7] animate-pulse" />
              )}
              <span>v0.9.5 Beta</span>
            </button>
            <a
              href="https://sociabuzz.com/tfbagas/support"
              target="_blank"
              rel="noopener noreferrer"
              title={t("nav.supportTitle")}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.11] text-[10px] sm:text-[11px] font-medium text-[#E2E4E9] hover:border-white/25 transition-colors"
            >
              <Heart className="w-3 h-3 text-[#9CA3AF]" />
              <span>{t("nav.support")}</span>
            </a>

            {restorableSession && (
              <div className="liquid-droplet-badge inline-flex items-center rounded-full bg-[#6EE7B7]/12 border border-[#6EE7B7]/35 text-[10px] font-medium text-[#6EE7B7] overflow-hidden">
                <button
                  type="button"
                  onClick={handleRestoreSession}
                  className="px-2.5 py-0.5 hover:bg-[#6EE7B7]/20 transition-colors cursor-pointer"
                >
                  {t("nav.restoreSession")}
                </button>
                <button
                  type="button"
                  onClick={() => setRestorableSession(null)}
                  aria-label={t("nav.dismissRestore")}
                  className="px-1.5 py-0.5 hover:bg-[#6EE7B7]/20 border-l border-[#6EE7B7]/25 transition-colors cursor-pointer"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Apple Smoked Obsidian Sliding & Stretching Pill Nav + EN|ID Switcher + Status Chip */}
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 ml-auto max-w-full">
          <nav
            aria-label={t("nav.primaryLabel")}
            className="relative flex items-center gap-0.5 bg-white/[0.06] border border-white/[0.10] rounded-full p-0.5"
          >
            {navTabs.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative z-10 flex items-center justify-center gap-1.5 px-2 sm:px-3.5 py-1 rounded-full text-xs font-medium transition-colors duration-200 active:scale-[0.96] cursor-pointer ${
                    isActive
                      ? "bg-white text-zinc-950 font-semibold shadow-sm"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Sleek Compact EN | ID Segmented Toggle Pill (no backdrop-filter inside header) */}
          <div
            role="group"
            aria-label={t("nav.langSwitchTitle")}
            title={t("nav.langSwitchTitle")}
            className="inline-flex items-center p-0.5 rounded-full bg-white/[0.06] border border-white/[0.11] text-[10px] font-mono select-none shrink-0"
          >
            {[
              { code: "en", label: "EN" },
              { code: "id", label: "ID" },
            ].map((item) => {
              const isLangActive = lang === item.code;
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => handleSwitchLanguage(item.code)}
                  aria-pressed={isLangActive}
                  className={`px-1.5 sm:px-2 py-0.5 rounded-full transition-colors duration-150 cursor-pointer ${
                    isLangActive
                      ? "bg-white text-zinc-950 font-semibold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setIsCommandPaletteOpen(true)}
            title={t("nav.commandPaletteTitle")}
            className="m3-btn-morph inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.11] text-xs font-medium text-[#E2E4E9] cursor-pointer shrink-0"
          >
            <Search className="w-3.5 h-3.5 text-[#6EE7B7]" />
            <span className="hidden md:inline font-mono text-[10px] text-[#9CA3AF]">Ctrl+K</span>
          </button>

          <button
            type="button"
            onClick={() => setIsLooksOpen(true)}
            title={t("nav.looksTitle")}
            className="m3-btn-morph inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.11] text-xs font-medium text-[#E2E4E9] cursor-pointer shrink-0"
          >
            <Bookmark className="w-3.5 h-3.5 text-[#6EE7B7]" />
            <span className="hidden sm:inline">{t("nav.looks")}</span>
            <span className="liquid-droplet-badge px-1.5 py-0.2 rounded-full bg-white/[0.08] border border-white/[0.14] text-[9px] font-mono font-bold text-[#E2E4E9]">
              {SAMPLE_LOOKS.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsShortcutsOpen(true)}
            title={t("nav.shortcutsTitle")}
            aria-label={t("nav.shortcutsTitle")}
            className="m3-btn-morph inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.11] text-xs font-mono text-[#9CA3AF] hover:text-[#E2E4E9] cursor-pointer shrink-0"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>

          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.11] text-[11px] font-mono text-[#E2E4E9]">
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
            <span>{translateStatusText(statusText, lang)}</span>
          </div>
        </div>
      </header>

      {/* Main Content Container (Widescreen Fluid Container max-w-[1600px]) */}
      <main className="relative z-10 flex-1 max-w-[1600px] w-full mx-auto px-3 sm:px-5 py-2.5">
        {/* WORKSPACE TAB */}
        <div
          key={cascadeKey}
          className={
            activeTab === "home" ? "space-y-2.5" : "hidden"
          }
        >
          {/* 2-Column Workstation Grid: Unified Page Scroll on >=1024px, Direct-child sticky VISUAL PREVIEW on <1024px */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-start lg:items-stretch">
            {/* LEFT COLUMN WRAPPER: display:contents on <1024px so order-1/order-2 work directly in grid */}
            <div className="contents lg:flex lg:flex-col lg:gap-2.5 lg:col-span-7 lg:col-start-1">
              {/* MEDIA DROPZONES (order-2 on mobile, top of left column on desktop) */}
              <div className="order-2 lg:order-none grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-stretch">
                {/* 3. Panel REFERENCE (delay: 110ms) */}
                <div
                  className={`h-full ${
                    workspacePhase === "morphing-in" ? "m3-morph-panel" : ""
                  }`}
                  style={
                    workspacePhase === "morphing-in"
                      ? { "--morph-delay": "110ms" }
                      : undefined
                  }
                >
                  <ImageDropCard
                    title={t("dropCard.referenceTitle")}
                    allowVideo
                    imageInfo={referenceImage}
                    onSelectImage={handleSelectReference}
                    onClearImage={handleClearReference}
                    onTrySample={handleTryReferenceSample}
                    sampleOptions={SAMPLE_LOOKS}
                    allowPresets
                    importedLook={importedLook}
                    onClearImportedLook={handleClearImportedLook}
                    isDirectConversionReady={Boolean(importedLook && !targetImage)}
                    isAnalyzing={isAnalyzing}
                    paletteSwatches={referencePalette}
                    onCopySwatch={handleCopySwatchToast}
                    isPasteTarget={
                      hoveredSlot === "reference" ||
                      (!hoveredSlot && focusedSlot === "reference")
                    }
                    onHoverChange={handleHoverReference}
                    onFocusSlot={handleFocusReference}
                    errorMessage={referenceError}
                  />
                </div>

                {/* 5. Panel TARGET IMAGE (delay: 190ms) */}
                <div
                  className={`h-full ${
                    workspacePhase === "morphing-in" ? "m3-morph-panel" : ""
                  }`}
                  style={
                    workspacePhase === "morphing-in"
                      ? { "--morph-delay": "190ms" }
                      : undefined
                  }
                >
                  <ImageDropCard
                    title={t("dropCard.targetTitle")}
                    allowVideo
                    imageInfo={targetImage}
                    onSelectImage={handleSelectTarget}
                    onClearImage={handleClearTarget}
                    onTrySample={handleTryTargetSample}
                    inputProfile={simulateLogInput}
                    onInputProfileChange={handleTargetInputProfileChange}
                    isPasteTarget={
                      hoveredSlot === "target" ||
                      (!hoveredSlot && focusedSlot === "target")
                    }
                    onHoverChange={handleHoverTarget}
                    onFocusSlot={handleFocusTarget}
                    errorMessage={targetError}
                  />
                </div>
              </div>

              {/* 7. Panel VISUAL PREVIEW (hidden on <1024px when empty; sticky below header on mobile; expands to match right col on desktop) */}
              <div
                className={`order-1 lg:order-none ${
                  !hasPreviewImage ? "hidden lg:flex" : "flex"
                } lg:flex-1 flex-col min-h-[420px] lg:min-h-[490px] [&>*]:flex-1 ${
                  isPreviewPinned
                    ? "sticky top-[var(--kf-header-h,48px)] z-30 bg-[#0d0f12] backdrop-blur-md rounded-[18px] border-b border-white/[0.1] pb-1 lg:static lg:z-auto lg:bg-transparent lg:backdrop-blur-none lg:border-b-0 lg:pb-0"
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
                  imageEl={activePreviewImgElement}
                  gradedCanvasRef={gradedCanvasRef}
                  glPreviewRef={glPreviewRef}
                  useWebGLPhoto={!webglPhotoError}
                  previewMaxDim={previewMaxDim}
                  onWebGLPhotoError={() => setWebglPhotoError(true)}
                  hasImage={hasPreviewImage}
                  mode={previewMode}
                  onModeChange={setPreviewMode}
                  videoEl={videoEl}
                  gradingParams={effectiveParams}
                  activeLut={activeLut}
                  lutMix={matchStrength / 100}
                  onVideoError={(msg) => setTargetError(msg)}
                  onSplitDragChange={handleControlDragChange}
                  isPinned={isPreviewPinned}
                  onTogglePin={() => setIsPreviewPinned((p) => !p)}
                  onSaveImage={handleSaveImage}
                  isSavingImage={isSavingFrame}
                  onExportVideo={handleExportVideo}
                  isExportingVideo={isExportingVideo}
                  videoExportProgress={videoExportProgress}
                  videoExportStatusText={videoExportStatusText}
                  onCancelVideoExport={handleCancelVideoExport}
                  targetVideoSrc={targetImage?.videoUrl || videoEl?.currentSrc || videoEl?.src || ""}
                  targetFile={targetImage?.file || null}
                  videoDurationSec={Number.isFinite(videoEl?.duration) ? videoEl.duration : 0}
                  onTryInstantDemo={handleTryInstantDemo}
                  nativeWidth={targetImage?.width || referenceImage?.width || 0}
                  nativeHeight={targetImage?.height || referenceImage?.height || 0}
                  targetBaseName={targetImage?.baseName || referenceImage?.baseName || "Target"}
                  engineId={activeEngineId}
                  simulateLogInput={simulateLogInput}
                  onToggleSimulateLogInput={handleTargetInputProfileChange}
                  isTabActive={activeTab === "home"}
                  footer={
                    videoEl ? (
                      <VideoTransportBar
                        videoEl={videoEl}
                        resolution={`${targetImage.width}x${targetImage.height}`}
                        onMatchCurrentFrame={handleMatchCurrentFrame}
                        canMatchFrame={Boolean(referenceImage?.imgElement)}
                        isAnalyzing={isAnalyzing}
                      />
                    ) : null
                  }
                />
              </div>

              {/* Compact Quick Workflow & Tips Strip (balances left column on desktop) */}
              <div
                className={`hidden lg:flex flex-col gap-2 liquid-glass-card m3-panel rounded-[18px] overflow-hidden px-3.5 py-3 ${
                  workspacePhase === "morphing-in" ? "m3-morph-panel" : ""
                }`}
                style={
                  workspacePhase === "morphing-in"
                    ? { "--morph-delay": "310ms" }
                    : undefined
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">
                    {t("workflow.title")}
                  </span>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono">
                    <span
                      className={`px-2.5 py-0.5 rounded-full border ${
                        hasLook
                          ? "bg-[#6EE7B7]/12 text-[#6EE7B7] border-[#6EE7B7]/35"
                          : "bg-white/[0.06] text-[#E2E4E9] border-white/20"
                      }`}
                    >
                      {t("workflow.step1")}
                    </span>
                    <span className="text-[#9CA3AF]/60">-&gt;</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full border ${
                        targetImage
                          ? "bg-[#6EE7B7]/12 text-[#6EE7B7] border-[#6EE7B7]/35"
                          : hasLook
                          ? "bg-white/[0.06] text-[#E2E4E9] border-white/20"
                          : "bg-white/[0.02] text-[#9CA3AF]/70 border-white/[0.07]"
                      }`}
                    >
                      {t("workflow.step2")}
                    </span>
                    <span className="text-[#9CA3AF]/60">-&gt;</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full border ${
                        hasLook && targetImage
                          ? "bg-white/[0.08] text-[#E2E4E9] border-white/25"
                          : "bg-white/[0.02] text-[#9CA3AF]/70 border-white/[0.07]"
                      }`}
                    >
                      {t("workflow.step3")}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-white/[0.08] text-[10px] font-mono text-[#9CA3AF]">
                  <span>{t("workflow.tipReset")}</span>
                  <div className="flex items-center gap-2.5">
                    <span>{t("workflow.tipFine")}</span>
                    <span>{t("workflow.tipEngines")}</span>
                    <span>{t("workflow.tipUndo")}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="order-3 lg:order-none lg:col-span-5 lg:col-start-8 flex flex-col gap-2.5">
              {/* Top Card: ENGINE & MATCH STRENGTH */}
              <div
                className={`liquid-glass-card m3-panel rounded-[18px] overflow-hidden p-3 ${
                  workspacePhase === "morphing-in" ? "m3-morph-panel" : ""
                }`}
                style={
                  workspacePhase === "morphing-in"
                    ? { "--morph-delay": "130ms" }
                    : undefined
                }
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5 text-[#9CA3AF]" />
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">
                      {t("engineCard.title")}
                    </h3>
                  </div>

                  <div ref={engineCompareRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setIsEngineCompareOpen((v) => !v)}
                      aria-expanded={isEngineCompareOpen}
                      aria-label={t("engineCard.compareAria")}
                      title={t("engineCard.compareTitle")}
                      className={`m3-btn-morph inline-flex items-center justify-center w-6 h-6 rounded-full border text-[11px] font-mono cursor-pointer ${
                        isEngineCompareOpen
                          ? "bg-[#E2E4E9] text-[#0E0E11] border-[#E2E4E9]"
                          : "bg-white/[0.045] hover:bg-white/[0.10] text-[#9CA3AF] hover:text-[#E2E4E9] border-white/[0.10]"
                      }`}
                    >
                      ?
                    </button>

                    {isEngineCompareOpen && (
                      <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 z-50 rounded-[18px] overflow-hidden bg-[#12141B]/95 border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_18px_40px_-16px_rgba(0,0,0,0.85)] p-3.5 space-y-2 text-left">
                        <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#9CA3AF] border-b border-white/[0.08] pb-1.5">
                          {t("engineCard.compareHeader")}
                        </div>
                        <div className="space-y-2">
                          {engineOptions.map((eng) => (
                            <div
                              key={eng.id}
                              className={`p-2 rounded-xl border ${
                                activeEngineId === eng.id
                                  ? "bg-white/[0.08] border-white/20"
                                  : "bg-[#090A0D]/65 border-white/[0.07]"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-[#E2E4E9]">
                                  {eng.name} ({eng.subtitle})
                                </span>
                                {eng.badge && (
                                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-white/[0.08] text-[#6EE7B7] border border-[#6EE7B7]/30">
                                    {eng.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[#9CA3AF] mt-0.5 leading-snug">
                                {eng.summary}
                              </p>
                              <div className="text-[10px] font-mono text-[#6EE7B7]/90 mt-1">
                                {t("engineCard.bestForPrefix")} {eng.bestFor}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3-Column Interactive Liquid Glass Engine Selector with Bouncy Spring Pill Glide */}
                <div
                  role="tablist"
                  aria-label={t("engineCard.selectorAria")}
                  className="relative grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#08090C]/75 border border-white/[0.085] mb-2"
                >
                  <div
                    aria-hidden="true"
                    className="m3-pill-indicator pointer-events-none absolute top-1 bottom-1 left-1 w-[calc((100%-1.25rem)/3)] rounded-xl bg-white/[0.12] border border-white/[0.22]"
                    style={{
                      transform: `translate3d(calc(${activeEngineIndex * 100}% + ${activeEngineIndex * 0.375}rem), 0, 0)`,
                    }}
                  />
                  {engineOptions.map((eng) => {
                    const isActive = activeEngineId === eng.id;
                    const EngIcon =
                      eng.id === "v1" ? Zap : eng.id === "v2" ? Scale : Sparkles;
                    return (
                      <button
                        key={eng.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        title={`${eng.name} (${eng.badge}) - ${eng.subtitle} (${t("engineCard.shortcutPrefix")}: ${eng.shortcutKey})`}
                        onClick={() => handleEngineChange(eng.id)}
                        className={`relative z-10 flex flex-col items-start text-left p-2 rounded-xl border transition-colors duration-200 cursor-pointer select-none active:scale-[0.98] ${
                          isActive
                            ? "border-transparent"
                            : "border-transparent hover:bg-white/[0.035]"
                        }`}
                      >
                        <div className="w-full flex items-center justify-between gap-1 mb-0.5">
                          <EngIcon
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? "text-[#6EE7B7]" : "text-[#9CA3AF]"
                            }`}
                          />
                          {eng.badge && (
                            <span
                              className={`text-[8px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full ${
                                isActive
                                  ? "liquid-droplet-badge bg-[#6EE7B7]/18 text-[#6EE7B7] border border-[#6EE7B7]/35"
                                  : "bg-white/[0.06] text-[#E2E4E9] border border-white/[0.10]"
                              }`}
                            >
                              {eng.badge}
                            </span>
                          )}
                        </div>
                        <div
                          className={`text-xs font-semibold leading-tight ${
                            isActive ? "text-[#F4F5F7]" : "text-[#E2E4E9]/85"
                          }`}
                        >
                          {eng.name}
                        </div>
                        <div className="text-[10px] text-[#9CA3AF] truncate w-full mt-0.5">
                          {eng.subtitle}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Live Engine Info Strip */}
                <div className="mb-2 px-3 py-2 rounded-xl bg-[#08090C]/65 border border-white/[0.075] space-y-1.5 transition-all">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-[10px] font-mono text-[#6EE7B7]">
                      {t("engineCard.bestForPrefix")} {activeEngine.bestFor}
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      {activeEngine.pipelineBadges?.map((b) => (
                        <span
                          key={b}
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-white/[0.045] text-[#D1D5DB] border border-white/[0.085]"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-[#9CA3AF] leading-snug">
                    {activeEngine.summary}
                  </p>
                </div>

                {/* Master Match Strength (0% - 150%, default 100%) + iOS 26 Liquid Stretch Toggle */}
                <div className="space-y-1.5">
                  <ParameterSlider
                    paramKey="matchStrength"
                    label={t("engineCard.matchStrengthLabel")}
                    min={0}
                    max={150}
                    step={5}
                    value={matchStrength}
                    defaultValue={100}
                    isBipolar={false}
                    valueSuffix="%"
                    onChange={handleMatchStrengthChange}
                    onDragChange={handleControlDragChange}
                    icon={Gauge}
                  />

                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#08090C]/65 border border-white/[0.075]">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-[#E2E4E9] leading-tight">
                        {t("engineCard.autoNormalizeTitle")}
                      </div>
                      <div className="text-[10px] text-[#9CA3AF] truncate">
                        {t("engineCard.autoNormalizeSub")}
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={autoNormalizeTarget}
                      aria-label={t("engineCard.autoNormalizeTitle")}
                      title={t("engineCard.autoNormalizeTooltip")}
                      onClick={() => handleToggleAutoNormalizeTarget(!autoNormalizeTarget)}
                      className={`liquid-switch relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border cursor-pointer ${
                        autoNormalizeTarget
                          ? "bg-[#6EE7B7]/25 border-[#6EE7B7]/60"
                          : "bg-white/[0.06] border-white/[0.14] hover:border-white/25"
                      }`}
                    >
                      <span
                        className={`liquid-switch-thumb inline-block h-3.5 w-3.5 rounded-full ${
                          autoNormalizeTarget
                            ? "bg-[#6EE7B7]"
                            : "bg-[#E2E4E9]"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* 4. Panel DETECTED PARAMETERS (delay: 150ms) */}
              <div
                className={`liquid-glass-card m3-panel rounded-[18px] overflow-hidden p-3 ${
                  workspacePhase === "morphing-in" ? "m3-morph-panel" : ""
                }`}
                style={
                  workspacePhase === "morphing-in"
                    ? { "--morph-delay": "150ms", contain: "layout paint" }
                    : { contain: "layout paint" }
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-[#9CA3AF]" />
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">
                      {t("paramsCard.title")}
                    </h3>
                    {/* A / B Grading Snapshot Slots with Bouncy Spring Pill + Gooey Droplet Detachment */}
                    <div className="relative grid grid-cols-2 items-center p-0.5 rounded-full bg-[#08090C]/75 border border-white/[0.09]">
                      <div
                        aria-hidden="true"
                        className="m3-pill-indicator pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-[#E2E4E9]"
                        style={{
                          transform: `translate3d(${activeSlot === "B" ? "100%" : "0%"}, 0, 0)`,
                        }}
                      />
                      {["A", "B"].map((slot) => {
                        const isBFilled = slot === "B" && slotSnapshots.B?.isFilled;
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => handleSwitchSlot(slot)}
                            title={t("paramsCard.slotTitle", { slot })}
                            className={`relative z-10 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
                              activeSlot === slot
                                ? "text-[#0E0E11]"
                                : "text-[#9CA3AF] hover:text-[#F4F5F7]"
                            }`}
                          >
                            {slot}
                            {isBFilled && (
                              <span
                                className={`liquid-droplet-badge inline-block w-1.5 h-1.5 rounded-full ml-0.5 align-top ${
                                  activeSlot === "B" ? "bg-[#042F1E]" : "bg-[#6EE7B7]"
                                }`}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyToB}
                      title={t("paramsCard.copyToBTitle")}
                      className="liquid-glass-pill m3-btn-morph inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full text-[#9CA3AF] hover:text-[#E2E4E9] cursor-pointer"
                    >
                      <Copy className="w-2.5 h-2.5" />
                      <span className="hidden sm:inline">{t("paramsCard.copyToB")}</span>
                      {slotSnapshots.B?.isFilled && (
                        <span className="liquid-droplet-badge w-1.5 h-1.5 rounded-full bg-[#6EE7B7]" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsLooksOpen(true)}
                      title={t("paramsCard.looksTitle")}
                      className="liquid-glass-pill m3-btn-morph inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full text-[#E2E4E9] cursor-pointer"
                    >
                      <Bookmark className="w-2.5 h-2.5 text-[#6EE7B7]" />
                      <span>{t("paramsCard.looks")}</span>
                      <span className="liquid-droplet-badge px-1 py-0.1 rounded-full bg-white/[0.08] text-[9px] text-[#E2E4E9] font-bold">
                        {SAMPLE_LOOKS.length}
                      </span>
                    </button>
                  </div>

                  {/* Action Buttons: Undo/Redo + Reload Analysis + Reset All with Droplet Detachment */}
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={handleUndo}
                      disabled={!historyState.canUndo}
                      title={t("paramsCard.undoTitle")}
                      aria-label={t("paramsCard.undoTitle")}
                      className={`m3-btn-morph p-1.5 rounded-full border ${
                        !historyState.canUndo
                          ? "bg-white/[0.02] text-[#9CA3AF]/30 border-white/[0.05] cursor-not-allowed"
                          : "bg-white/[0.045] hover:bg-white/[0.10] text-[#9CA3AF] hover:text-[#E2E4E9] border-white/[0.10] cursor-pointer"
                      }`}
                    >
                      <Undo2 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={handleRedo}
                      disabled={!historyState.canRedo}
                      title={t("paramsCard.redoTitle")}
                      aria-label={t("paramsCard.redoTitle")}
                      className={`m3-btn-morph p-1.5 rounded-full border ${
                        !historyState.canRedo
                          ? "bg-white/[0.02] text-[#9CA3AF]/30 border-white/[0.05] cursor-not-allowed"
                          : "bg-white/[0.045] hover:bg-white/[0.10] text-[#9CA3AF] hover:text-[#E2E4E9] border-white/[0.10] cursor-pointer"
                      }`}
                    >
                      <Redo2 className="w-3 h-3" />
                    </button>

                    <button
                      type="button"
                      onClick={handleReloadAnalysis}
                      disabled={!hasLook || isAnalyzing}
                      className={`m3-btn-morph flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border ${
                        !hasLook || isAnalyzing
                          ? "bg-white/[0.025] text-[#9CA3AF]/35 border-white/[0.05] cursor-not-allowed"
                          : reloadedFeedback
                          ? "bg-[#E2E4E9] text-[#0E0E11] border-[#E2E4E9] font-semibold cursor-pointer"
                          : "bg-white/[0.045] hover:bg-white/[0.10] text-[#9CA3AF] hover:text-[#E2E4E9] border-white/[0.10] cursor-pointer"
                      }`}
                      title={t("paramsCard.reloadTitle")}
                    >
                      {reloadedFeedback ? (
                        <span className="liquid-droplet-badge inline-flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>{t("paramsCard.restored")}</span>
                        </span>
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3" />
                          <span>{t("paramsCard.reload")}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleResetParams}
                      className="liquid-glass-pill m3-btn-morph flex items-center gap-1 text-[11px] font-medium text-[#9CA3AF] hover:text-[#E2E4E9] px-2.5 py-1 rounded-full cursor-pointer"
                      title={t("paramsCard.resetTitle")}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{t("paramsCard.reset")}</span>
                      {!isNeutralGrade && (
                        <span className="liquid-droplet-badge w-1.5 h-1.5 rounded-full bg-[#6EE7B7]" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Pro Scopes (Luma/RGB, RGB Parade, Vectorscope with Skin-Tone Line) */}
                <div className="mb-2.5">
                  <ProScopes
                    ref={scopeRef}
                    hasMedia={hasPreviewImage}
                    isDragging={isScopeFrozen}
                    isVideoPlaying={isVideoPlaying}
                    isDesktopRealtime={isDesktopRealtime}
                    isCollapsed={isScopesCollapsed}
                    onToggleCollapse={handleToggleScopesCollapse}
                  />
                </div>

                {/* Collapsible Sub-Group 1: TONE & CONTRAST (Permanent 18px Radius in Both Collapsed & Expanded States) */}
                <div
                  data-open={isToneExpanded}
                  className="capsule-disclosure rounded-[18px] overflow-hidden bg-[#08090C]/65 border border-white/[0.085] mb-2"
                >
                  <button
                    type="button"
                    onClick={() => setIsToneExpanded((v) => !v)}
                    aria-expanded={isToneExpanded}
                    className="w-full flex items-center justify-between px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.10em] text-[#9CA3AF] hover:text-[#E2E4E9] cursor-pointer select-none"
                  >
                    <span>{t("paramsCard.toneAndContrast")}</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-300 ${
                        isToneExpanded ? "rotate-180" : "rotate-0"
                      }`}
                    />
                  </button>
                  <div className="m3-collapse-grid" data-expanded={isToneExpanded}>
                    <div className="m3-collapse-inner">
                      <div className="px-1.5 pb-1.5 space-y-0.5 divide-y divide-white/[0.04] border-t border-white/[0.05]">
                        {TONE_CONTROLS.map((ctrl) => (
                          <ParameterSlider
                            key={ctrl.key}
                            paramKey={ctrl.key}
                            label={t(`paramLabels.${ctrl.key}`) || ctrl.label}
                            min={ctrl.min}
                            max={ctrl.max}
                            step={ctrl.step}
                            value={
                              gradingParams[ctrl.key] ?? DEFAULT_PARAMS[ctrl.key]
                            }
                            defaultValue={DEFAULT_PARAMS[ctrl.key]}
                            isBipolar={ctrl.isBipolar}
                            onChange={handleParamChange}
                            onDragChange={handleControlDragChange}
                            icon={ctrl.icon}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Collapsible Sub-Group 2: COLOR & SATURATION (Permanent 18px Radius in Both Collapsed & Expanded States) */}
                <div
                  data-open={isColorExpanded}
                  className="capsule-disclosure rounded-[18px] overflow-hidden bg-[#08090C]/65 border border-white/[0.085]"
                >
                  <button
                    type="button"
                    onClick={() => setIsColorExpanded((v) => !v)}
                    aria-expanded={isColorExpanded}
                    className="w-full flex items-center justify-between px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.10em] text-[#9CA3AF] hover:text-[#E2E4E9] cursor-pointer select-none"
                  >
                    <span>{t("paramsCard.colorAndSaturation")}</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-300 ${
                        isColorExpanded ? "rotate-180" : "rotate-0"
                      }`}
                    />
                  </button>
                  <div className="m3-collapse-grid" data-expanded={isColorExpanded}>
                    <div className="m3-collapse-inner">
                      <div className="px-1.5 pb-1.5 space-y-0.5 divide-y divide-white/[0.04] border-t border-white/[0.05]">
                        {COLOR_CONTROLS.map((ctrl) => (
                          <ParameterSlider
                            key={ctrl.key}
                            paramKey={ctrl.key}
                            label={t(`paramLabels.${ctrl.key}`) || ctrl.label}
                            min={ctrl.min}
                            max={ctrl.max}
                            step={ctrl.step}
                            value={
                              gradingParams[ctrl.key] ?? DEFAULT_PARAMS[ctrl.key]
                            }
                            defaultValue={DEFAULT_PARAMS[ctrl.key]}
                            isBipolar={ctrl.isBipolar}
                            onChange={handleParamChange}
                            onDragChange={handleControlDragChange}
                            icon={ctrl.icon}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 6. Collapsible 3-Way Color Wheels (Permanent 18px Radius in Both Collapsed & Expanded States) */}
                <div
                  data-open={isWheelsExpanded}
                  className={`capsule-disclosure rounded-[18px] overflow-hidden mt-2.5 bg-[#08090C]/65 border border-white/[0.085] px-3.5 py-2 ${
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
                        {t("paramsCard.colorWheels")}
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
                            title={t("paramsCard.shadowsWheel")}
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
                            title={t("paramsCard.midtonesWheel")}
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
                            title={t("paramsCard.highlightsWheel")}
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
                        aria-label={t("paramsCard.toggleWheelsAria")}
                        className="m3-btn-morph p-1 rounded-full bg-white/[0.04] hover:bg-white/[0.09] text-[#9CA3AF] hover:text-[#E2E4E9] border border-white/[0.09] cursor-pointer"
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-300 ${
                            isWheelsExpanded ? "rotate-180" : "rotate-0"
                          }`}
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
                        <ColorWheel
                          title={t("paramsCard.shadowsWheel")}
                          rgb={liftRgb}
                          onChange={handleLiftChange}
                          onReset={handleLiftReset}
                          onDragChange={handleControlDragChange}
                        />
                        <ColorWheel
                          title={t("paramsCard.midtonesWheel")}
                          rgb={gammaRgb}
                          onChange={handleGammaChange}
                          onReset={handleGammaReset}
                          onDragChange={handleControlDragChange}
                        />
                        <ColorWheel
                          title={t("paramsCard.highlightsWheel")}
                          rgb={gainRgb}
                          onChange={handleGainChange}
                          onReset={handleGainReset}
                          onDragChange={handleControlDragChange}
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
                  onShare={() => setIsShareOpen(true)}
                  isExporting={isExporting}
                  disabled={!hasLook}
                  onExportFfx={handleExportFfx}
                  onExportCube={handleExportCube}
                  onExportLut={handleExportLut3d}
                  onExportZipPack={handleExportZipPack}
                  isCalibrationActive={isCalibrationActive}
                  onOpenCalibration={handleOpenCalibration}
                  engineId={activeEngineId}
                  fallbackName={referenceImage?.baseName || importedLook?.name || "Custom Look"}
                  isNeutralGrade={isNeutralGrade}
                />
              </div>
            </div>
          </div>
        </div>

        {/* SETTINGS TAB */}
        {activeTab === "settings" && (
          <div className="max-w-2xl mx-auto space-y-4 m3-tab-enter">
            {/* Language Selector Card */}
            <div className="m3-panel rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5 border-b border-white/[0.08] pb-3.5">
                <Globe className="w-4 h-4 text-[#6EE7B7]" />
                <h2 className="text-base font-bold font-display text-[#E2E4E9]">
                  {t("settings.languageHeading")}
                </h2>
              </div>
              <p className="text-xs text-[#9CA3AF] leading-relaxed">
                {t("settings.languageDesc")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  {
                    code: "en",
                    title: t("settings.langEnglish"),
                    sub: t("settings.langEnglishSub"),
                    badge: "EN",
                  },
                  {
                    code: "id",
                    title: t("settings.langIndonesian"),
                    sub: t("settings.langIndonesianSub"),
                    badge: "ID",
                  },
                ].map((opt) => {
                  const isSelected = lang === opt.code;
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => handleSwitchLanguage(opt.code)}
                      aria-pressed={isSelected}
                      className={`m3-btn-morph flex items-center justify-between gap-3 p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-[#6EE7B7]/12 border-[#6EE7B7]/45 text-[#F4F5F7]"
                          : "bg-white/[0.035] hover:bg-white/[0.07] border-white/[0.09] text-[#E2E4E9]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{opt.title}</div>
                        <div className="text-[11px] text-[#9CA3AF] truncate mt-0.5">
                          {opt.sub}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border shrink-0 ${
                          isSelected
                            ? "bg-[#6EE7B7] text-[#042F1E] border-[#6EE7B7]"
                            : "bg-white/[0.06] text-[#9CA3AF] border-white/[0.12]"
                        }`}
                      >
                        {opt.badge}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="m3-panel overflow-visible relative z-20 rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex items-center gap-2.5 border-b border-white/[0.08] pb-3.5">
                <Settings className="w-4 h-4 text-[#E2E4E9]" />
                <h2 className="text-base font-bold font-display text-[#E2E4E9]">
                  {t("settings.perfHeading")}
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#E2E4E9] mb-1">
                    {t("settings.refResLabel")}
                  </label>
                  <p className="text-xs text-[#9CA3AF] mb-2">
                    {t("settings.refResDesc")}
                  </p>
                  <M3Select
                    value={analysisMaxDim}
                    onChange={(val) => setAnalysisMaxDim(Number(val))}
                    ariaLabel={t("settings.refResLabel")}
                    options={[
                      { value: 720, label: t("settings.refRes720") },
                      { value: 1280, label: t("settings.refRes1280") },
                      { value: 1920, label: t("settings.refRes1920") },
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#E2E4E9] mb-1">
                    {t("settings.previewResLabel")}
                  </label>
                  <p className="text-xs text-[#9CA3AF] mb-2">
                    {t("settings.previewResDesc")}
                  </p>
                  <M3Select
                    value={previewMaxDim}
                    onChange={(val) => setPreviewMaxDim(Number(val))}
                    ariaLabel={t("settings.previewResLabel")}
                    options={[
                      { value: 640, label: t("settings.previewRes640") },
                      { value: 960, label: t("settings.previewRes960") },
                      { value: 1440, label: t("settings.previewRes1440") },
                    ]}
                  />
                </div>
              </div>
            </div>

            <div className="m3-panel relative z-10 rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3.5">
                <div className="flex items-center gap-2.5">
                  <Cpu className="w-4 h-4 text-[#E2E4E9]" />
                  <div>
                    <h2 className="text-base font-bold font-display text-[#E2E4E9]">
                      {t("settings.calHeading")}
                    </h2>
                    <p className="text-xs text-[#9CA3AF]">
                      {t("settings.calSubtitle")}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleResetCalibration}
                  className="m3-btn-morph inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-xs font-medium text-[#9CA3AF] hover:text-[#E2E4E9] border border-white/[0.09] cursor-pointer"
                  title={t("settings.resetCalTitle")}
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{t("settings.resetCal")}</span>
                </button>
              </div>

              <div className="bg-white/[0.035] border border-white/[0.09] rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-[#E2E4E9]">
                      {t("settings.selfCalTitle")}
                    </div>
                    <p className="text-xs text-[#9CA3AF] leading-relaxed">
                      {t("settings.selfCalDesc")}
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
                    <span>{t("settings.runCalBtn")}</span>
                  </button>
                </div>

                <div className="pt-2.5 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                  <div className="flex items-center gap-2 text-[#E2E4E9]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#6EE7B7] shrink-0" />
                    <span>
                      {calibrationStatus.running
                        ? t("settings.calRunningMsg")
                        : t("settings.calOkMsg")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[#9CA3AF]">
                    <span>
                      {t("settings.driftLabel")}{" "}
                      <strong className="text-[#E2E4E9]">dE {calibrationStatus.deltaE}</strong>
                    </span>
                    <span>-</span>
                    <span>
                      {t("settings.latencyLabel")}{" "}
                      <strong className="text-[#E2E4E9]">{calibrationStatus.latencyMs} ms</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#E2E4E9]">
                    {t("settings.multipliersTitle")}
                  </span>
                  <span className="text-[11px] font-mono text-[#9CA3AF]">
                    {t("settings.multipliersRange")}
                  </span>
                </div>
                <p className="text-xs text-[#9CA3AF] pb-1">
                  {t("settings.multipliersDesc")}
                </p>

                <div className="bg-[#0A0A0D]/38 border border-white/[0.09] rounded-xl p-2 divide-y divide-white/[0.04]">
                  <ParameterSlider
                    paramKey="toneScale"
                    label={t("paramLabels.toneScale")}
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
                  <ParameterSlider
                    paramKey="wbScale"
                    label={t("paramLabels.wbScale")}
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
                  <ParameterSlider
                    paramKey="chromaScale"
                    label={t("paramLabels.chromaScale")}
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
                        Color Match for Keyflow
                      </h2>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.05] text-[#6EE7B7] border border-white/[0.12]">
                        v0.9.5 Beta
                      </span>
                    </div>
                    <p className="text-xs text-[#9CA3AF] mt-0.5">
                      {t("about.subtitle")}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsReleaseKitOpen(true)}
                    title={t("about.releasePosterTitle")}
                    className="m3-btn-morph inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.09] text-xs font-medium text-[#E2E4E9] cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#6EE7B7]" />
                    <span>{t("about.releasePosterBtn")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleReplayIntro}
                    title={t("about.replayIntroTitle")}
                    className="m3-btn-morph inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.09] text-xs font-medium text-[#E2E4E9] cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 text-[#6EE7B7]" />
                    <span>{t("about.replayIntroBtn")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("support")}
                    title={t("about.devHubTitle")}
                    className="cursor-pointer transition-transform hover:scale-[1.02]"
                  >
                    <TfbagasWordmark compact />
                  </button>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-[#9CA3AF] leading-relaxed">
                {t("about.heroParagraph1")}{" "}
                <code className="text-[#E2E4E9] font-mono bg-white/[0.05] px-1.5 py-0.5 rounded border border-white/[0.09]">
                  .kfplug
                </code>{" "}
                {t("about.heroParagraph2")}
              </p>

              <div className="bg-white/[0.035] border border-white/[0.09] rounded-xl p-4 text-xs text-[#9CA3AF] space-y-1.5">
                <div className="font-semibold text-[#E2E4E9]">{t("about.privacyTitle")}</div>
                <p>{t("about.privacyDesc")}</p>
              </div>
            </div>

            {/* 3-Step Keyflow Mobile Install Guide */}
            <div className="m3-panel rounded-2xl p-5 sm:p-6 space-y-3.5">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <h3 className="text-sm sm:text-base font-bold font-display text-[#E2E4E9]">
                  {t("about.installGuideTitle")}
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#6EE7B7]/10 text-[#6EE7B7] border border-[#6EE7B7]/25">
                  {t("about.mobileGuideBadge")}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3.5 space-y-1.5">
                  <div className="text-[10px] font-mono uppercase tracking-[0.1em] text-[#6EE7B7]">
                    {t("about.step01")}
                  </div>
                  <div className="font-semibold text-[#E2E4E9]">{t("about.step01Title")}</div>
                  <p className="text-[#9CA3AF] leading-relaxed">{t("about.step01Desc")}</p>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3.5 space-y-1.5">
                  <div className="text-[10px] font-mono uppercase tracking-[0.1em] text-[#6EE7B7]">
                    {t("about.step02")}
                  </div>
                  <div className="font-semibold text-[#E2E4E9]">{t("about.step02Title")}</div>
                  <p className="text-[#9CA3AF] leading-relaxed">{t("about.step02Desc")}</p>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3.5 space-y-1.5">
                  <div className="text-[10px] font-mono uppercase tracking-[0.1em] text-[#6EE7B7]">
                    {t("about.step03")}
                  </div>
                  <div className="font-semibold text-[#E2E4E9]">{t("about.step03Title")}</div>
                  <p className="text-[#9CA3AF] leading-relaxed">{t("about.step03Desc")}</p>
                </div>
              </div>
            </div>

            {/* Permanent Release History / Changelog Accordion */}
            <div className="m3-panel rounded-2xl p-5 sm:p-6 space-y-3.5">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-[#6EE7B7]" />
                  <h3 className="text-sm sm:text-base font-bold font-display text-[#E2E4E9]">
                    {t("about.changelogTitle")}
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-[#9CA3AF]">
                  v0.5.0 - v0.9.5 Beta
                </span>
              </div>

              {/* Latest v0.9.5 Beta Release Entry */}
              <div className="rounded-xl bg-[#6EE7B7]/[0.05] border border-[#6EE7B7]/25 p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-bold font-display text-[#F4F5F7]">
                      v0.9.5 Beta
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#6EE7B7]/15 text-[#6EE7B7] border border-[#6EE7B7]/35">
                      {t("about.latestBadge")}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-[#9CA3AF]">
                    {t("about.preReleasePolish")}
                  </span>
                </div>
                <ul className="text-xs text-[#9CA3AF] space-y-1.5 list-disc pl-4 leading-relaxed">
                  {(dict?.about?.v095Items || []).map((item, idx) => (
                    <li key={idx}>
                      <span className="text-[#E2E4E9] font-medium">{item.bold}</span>{" "}
                      {item.text}
                    </li>
                  ))}
                </ul>
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

      {/* Interactive "What's New in v0.8.1 Beta" Modal Dialog */}
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

      {/* Saved & Built-in Looks Drawer */}
      <LooksDrawer
        isOpen={isLooksOpen}
        onClose={() => setIsLooksOpen(false)}
        onApplyLook={handleApplyLook}
        onComputeSwatches={handleComputeSwatches}
        authorName={authorName}
        currentGrade={{
          presetName: presetName || referenceImage?.baseName || importedLook?.name || "",
          engineId: activeEngineId,
          logProfile: simulateLogInput,
          matchStrength,
          params: gradingParams,
        }}
      />

      {/* Share Link & QR Code Modal */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        engineId={activeEngineId}
        logProfile={simulateLogInput}
        matchStrength={matchStrength}
        params={gradingParams}
        onShareFile={handleShare}
        canShareFile={
          typeof navigator !== "undefined" &&
          typeof navigator.share === "function" &&
          typeof navigator.canShare === "function"
        }
      />

      {/* v0.9.5 Beta + v0.9.0 Release Poster Modal */}
      <ReleaseMediaKitModal
        isOpen={isReleaseKitOpen}
        onClose={() => setIsReleaseKitOpen(false)}
      />

      {/* Spotlight Command Bar (Ctrl+K / Cmd+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        activeEngineId={activeEngineId}
        onSelectEngine={handleEngineChange}
        activeLogProfile={simulateLogInput}
        onSelectLogProfile={handleTargetInputProfileChange}
        autoNormalizeTarget={autoNormalizeTarget}
        onToggleAutoNormalizeTarget={handleToggleAutoNormalizeTarget}
        onApplyLook={handleApplyLook}
        onTryInstantDemo={handleTryInstantDemo}
        onExportKfplug={handleExport}
        onExportFfx={handleExportFfx}
        onExportCube={handleExportCube}
        onExportZip={handleExportZipPack}
        hasLook={hasLook}
      />

      {/* Universal Floating Liquid Glass Status & Copy Pill with Frosted Soft-Edge Halo */}
      {mobileToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex items-center justify-center m3-toast-enter">
          <div
            aria-hidden="true"
            className="frosted-soft-edge absolute -inset-4 rounded-full bg-white/[0.12]"
          />
          <div className="optical-refract-glass relative z-10 px-3.5 py-1.5 rounded-full bg-[#14151B]/92 border border-white/20 text-[11px] font-mono text-[#F4F5F7] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7]" />
            <span>{mobileToast}</span>
          </div>
        </div>
      )}

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
