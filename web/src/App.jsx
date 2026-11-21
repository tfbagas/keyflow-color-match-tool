import React, { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import {
  Settings,
  RotateCcw,
  Cpu,
  CheckCircle2,
  RefreshCw,
  History,
  Check,
  Play,
  HelpCircle,
  Undo2,
  Redo2,
  Bookmark,
  Share2,
  Search,
  X,
  Globe,
  Download,
  Upload,
  Sparkles,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Keyboard,
  Layers,
  ChevronDown,
  Activity,
  Sliders,
  Package,
  Film,
  AlertCircle,
  FileCog,
} from "lucide-react";

import { useLanguage } from "./i18n/LanguageContext";
import { translateStatusText, SAMPLE_LOOK_LABELS_ID } from "./i18n/translations";
import ImageDropCard, { ALLOWED_IMAGE_MIMES } from "./components/ImageDropCard";
import InputProfileDropdown from "./components/InputProfileDropdown";
import ComparisonSlider from "./components/ComparisonSlider";
import ParameterSlider from "./components/ParameterSlider";
import ColorWheel from "./components/ColorWheel";
import Hue6VPanel from "./components/Hue6VPanel";
import SupportToast from "./components/SupportToast";
import { TfbagasWordmark } from "./components/KeyflowLogo";
import BrandLogo from "./components/BrandLogo";
import M3Select from "./components/M3Select";
import IntroScreen from "./components/IntroScreen";
import VideoTransportBar from "./components/VideoTransportBar";
import { DEFAULT_PARAMS } from "./utils/paramSchema";
import { simulateGradePixels } from "./utils/previewRenderer";
import {
  DEFAULT_ENGINE_ID,
  getEngine,
  getEngineCodename,
  listEngines,
  resolveEngineId,
} from "./utils/engineMetadata";
import { IDENTITY_HUE6, clamp, scaleParamsByStrength } from "./utils/gradeEngine";
import { downloadBlob } from "./utils/download";
import { sanitizeMetadataText } from "./utils/hostGuard";
import { applyCalibrationToParams } from "./utils/paramSchema";
import { extractPaletteSwatches } from "./utils/paletteSwatches";
import { SAMPLE_LOOKS, renderLookSample, drawNeutralScene } from "./utils/sampleLooks";
import { IMAGE_ACCEPT, VIDEO_ACCEPT, PRESET_ACCEPT } from "./utils/rawDecoder";
import {
  useMediaLoader,
  revokeMediaUrls,
  sampleVideoMultiTimestamp,
} from "./hooks/useMediaLoader";
import { useColorMatchWorker } from "./hooks/useColorMatchWorker";
import { usePillIndicator } from "./hooks/usePillIndicator";
import { usePresence } from "./hooks/usePresence";
import {
  DEFAULT_LOG_PROFILE,
  resolveLogProfileId,
  getLogProfile,
} from "./utils/logProfiles";
import {
  applySkinProtectToParams,
  computeLiveColorMetrics,
} from "./utils/telemetryMetrics";

const ExportModal = lazy(() => import("./components/ExportModal"));
const SupportTab = lazy(() => import("./components/SupportTab"));
const ProScopes = lazy(() => import("./components/ProScopes"));
const ShortcutsModal = lazy(() => import("./components/ShortcutsModal"));
const ChangelogModal = lazy(() => import("./components/ChangelogModal"));
const ReleaseHistoryAccordion = lazy(() =>
  import("./components/ChangelogModal").then((m) => ({ default: m.ReleaseHistoryAccordion }))
);
const CommandPalette = lazy(() => import("./components/CommandPalette"));
const LooksDrawer = lazy(() => import("./components/LooksDrawer"));
const ShareModal = lazy(() => import("./components/ShareModal"));
const ReleaseMediaKitModal = lazy(() => import("./components/ReleaseMediaKitModal"));
const InteractiveStudioBackdrop = lazy(() =>
  import("./components/InteractiveStudioBackdrop")
);

function useMountOnce(isOpen) {
  const [hasMounted, setHasMounted] = useState(Boolean(isOpen));
  if (isOpen && !hasMounted) {
    setHasMounted(true);
  }
  return hasMounted;
}

const CALIBRATION_STORAGE_KEY = "kf_export_calibration_v1";
const AUTHOR_STORAGE_KEY = "kf_author_name_v1";
const SEEN_UPDATE_STORAGE_KEY = "kf_seen_update_v090";
const SPLASH_SESSION_KEY = "kf_splash_seen_v090";
const SESSION_RECOVERY_KEY = "kf_last_session_v1";
const MAX_HISTORY = 25;

const DEFAULT_CALIBRATION = {
  toneScale: 1.0,
  wbScale: 1.0,
  chromaScale: 1.0,
};

function withEngineSuffix(base, engineId) {
  const clean = String(base || "").trim() || "Custom Look";
  const codename = getEngineCodename(engineId);
  const suffix = codename ? `_${codename}` : "";
  if (!suffix || /_(altair45|altair_refresh|altair|vega|sirius|polaris|v[1234])$/i.test(clean)) return clean;
  return `${clean}${suffix}`;
}

function areSnapshotsEqual(a, b) {
  if (!a || !b) return false;
  if (a.matchStrength !== b.matchStrength) return false;
  if ((a.skinProtect ?? 75) !== (b.skinProtect ?? 75)) return false;
  const pa = a.params;
  const pb = b.params;
  for (const k of Object.keys(DEFAULT_PARAMS)) {
    if (Math.abs((pa[k] ?? 0) - (pb[k] ?? 0)) > 1e-5) return false;
  }
  if (Math.abs((pa.autoGradeMix ?? 0) - (pb.autoGradeMix ?? 0)) > 1e-5) return false;
  if (Math.abs((pa.filmicShoulder ?? 0) - (pb.filmicShoulder ?? 0)) > 1e-5) return false;
  return true;
}

function MobileMediaTile({
  label,
  imageInfo,
  onSelect,
  onClear,
  onTrySample,
  allowPresets = false,
  importedLook = null,
  onClearImportedLook,
  isAnalyzing = false,
  errorMessage = "",
}) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const acceptList = [
    IMAGE_ACCEPT,
    VIDEO_ACCEPT,
    allowPresets ? PRESET_ACCEPT : "",
  ]
    .filter(Boolean)
    .join(",");

  const handleFile = (file) => {
    if (!file) return;
    onSelect?.(file);
  };

  return (
    <div className="min-w-0">
      <input
        ref={inputRef}
        type="file"
        accept={acceptList}
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFile(e.dataTransfer?.files?.[0]);
        }}
        className={`relative w-full h-[92px] rounded-lg overflow-hidden border transition-colors cursor-pointer select-none ${
          isDragging
            ? "border-[#34D399]/70 bg-[#15171C]"
            : imageInfo || importedLook
            ? "border-white/[0.12] bg-[#08090A]"
            : "border-dashed border-white/[0.15] bg-[#0B0C0F] hover:border-white/[0.25]"
        }`}
      >
        {imageInfo ? (
          <>
            <img
              src={imageInfo.thumbUrl || imageInfo.dataUrl}
              alt={label}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-x-0 top-0 p-1.5 flex items-start justify-between gap-1 bg-gradient-to-b from-black/75 via-black/35 to-transparent">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm border border-white/[0.12] text-[9px] font-mono uppercase tracking-[0.06em] text-[#E4E4E7]">
                {(imageInfo.kind === "video" || imageInfo.sourceKind === "video") && (
                  <Film className="w-2.5 h-2.5 text-[#34D399]" />
                )}
                <span>{label}</span>
              </span>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    inputRef.current?.click();
                  }}
                  title={`Replace ${label}`}
                  aria-label={`Replace ${label}`}
                  className="w-6 h-6 rounded-md bg-black/75 backdrop-blur-sm border border-white/[0.14] text-[#E4E4E7] hover:text-white inline-flex items-center justify-center cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isAnalyzing ? "animate-spin" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClear?.();
                  }}
                  title={`Clear ${label}`}
                  aria-label={`Clear ${label}`}
                  className="w-6 h-6 rounded-md bg-black/75 backdrop-blur-sm border border-white/[0.14] text-[#A1A1AA] hover:text-red-400 inline-flex items-center justify-center cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex items-center justify-between gap-1.5">
              <span className="text-[10.5px] font-medium text-[#F4F4F5] truncate">
                {imageInfo.name}
              </span>
              {imageInfo.formatBadge && (
                <span className="shrink-0 text-[9px] font-mono text-[#A1A1AA]">
                  {imageInfo.formatBadge}
                </span>
              )}
            </div>
          </>
        ) : importedLook ? (
          <div className="w-full h-full p-2 flex flex-col justify-between bg-[#111318]">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[9px] font-mono uppercase tracking-[0.06em] text-[#34D399]">
                {label} · PRESET
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearImportedLook?.();
                }}
                aria-label="Clear preset"
                className="w-6 h-6 rounded-md bg-white/[0.06] border border-white/[0.1] text-[#A1A1AA] hover:text-red-400 inline-flex items-center justify-center cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <FileCog className="w-3.5 h-3.5 text-[#34D399] shrink-0" />
              <span className="text-[11px] font-medium text-[#F4F4F5] truncate">
                {importedLook.name}
              </span>
            </div>
          </div>
        ) : (
          <div className="w-full h-full p-2 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#A1A1AA]">
                {label}
              </span>
              {onTrySample && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTrySample();
                  }}
                  className="px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[9.5px] font-medium text-[#E4E4E7] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-2.5 h-2.5 text-[#34D399]" />
                  <span>Sample</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-left">
              <div className="w-7 h-7 rounded-md bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
                <Upload className="w-3.5 h-3.5 text-[#A1A1AA]" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-[#E4E4E7] leading-tight truncate">
                  Tap to load
                </div>
                <div className="text-[9.5px] font-mono text-[#71717A] truncate mt-0.5">
                  {allowPresets ? "Img · Vid · LUT" : "Img · Vid"}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="mt-1 px-1.5 py-1 rounded bg-red-500/10 border border-red-500/25 flex items-center gap-1 text-[9.5px] text-red-300 leading-tight">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span className="truncate">{errorMessage}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { lang, setLang, t, dict } = useLanguage();
  const [activeTab, setActiveTab] = useState("home");
  const [gradingTab, setGradingTab] = useState("primary"); // "primary" | "wheels" | "hue6v"
  const [mobileDeckTab, setMobileDeckTab] = useState("match"); // "match" | "adjust" | "scopes" | "export"
  const [mobileCubeSize, setMobileCubeSize] = useState(33);
  const [mobilePromoAspect, setMobilePromoAspect] = useState("16:9");
  const [mobileExportedKey, setMobileExportedKey] = useState(null);
  const [mobileShowRefSamples, setMobileShowRefSamples] = useState(false);
  const [mobileCopiedHex, setMobileCopiedHex] = useState("");
  const mobileExportTimerRef = useRef(0);
  const mobileCopyTimerRef = useRef(0);
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
  const [hasEnteredStudio, setHasEnteredStudio] = useState(() => workspacePhase !== "hidden");
  const twoStageSolverRef = useRef(null);
  const settleTimerRef = useRef(null);
  const [introReplayKey, setIntroReplayKey] = useState(0);
  const [homeTabReveal, setHomeTabReveal] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [hasUnreadUpdate, setHasUnreadUpdate] = useState(() => {
    try {
      return localStorage.getItem(SEEN_UPDATE_STORAGE_KEY) !== "true";
    } catch {
      return true;
    }
  });
  const [isEngineCompareOpen, setIsEngineCompareOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [isEngineSectionOpen, setIsEngineSectionOpen] = useState(true);
  const [isToneRollOffOpen, setIsToneRollOffOpen] = useState(true);
  const [isMasterLevelsOpen, setIsMasterLevelsOpen] = useState(true);
  const [hoveredEngineTip, setHoveredEngineTip] = useState(null);
  const engineCompareRef = useRef(null);
  const presetImportInputRef = useRef(null);
  const [mobileToast, setMobileToast] = useState("");
  const [lastMobileToast, setLastMobileToast] = useState("");
  if (mobileToast && mobileToast !== lastMobileToast) {
    setLastMobileToast(mobileToast);
  }
  const mobileToastTimerRef = useRef(0);
  const calibDoneTimerRef = useRef(0);
  const calibFlashTimerRef = useRef(0);
  const [calibrationJustLocked, setCalibrationJustLocked] = useState(false);
  const [viewportScanKey, setViewportScanKey] = useState(0);
  const [calibScanKey, setCalibScanKey] = useState(0);
  const [completedCalibScanKey, setCompletedCalibScanKey] = useState(0);

  const triggerViewportScan = useCallback(() => {
    setViewportScanKey((k) => k + 1);
  }, []);

  const triggerCalibScan = useCallback(() => {
    setCalibScanKey((k) => k + 1);
  }, []);

  const engineComparePresence = usePresence(isEngineCompareOpen, 130);
  const mobileToastPresence = usePresence(Boolean(mobileToast), 150);

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
  const activeLutRef = useRef(null);
  activeLutRef.current = activeLut;
  const targetRef = useRef(null);
  const referenceRef = useRef(null);
  const triggerAnalysisRef = useRef(() => {});
  targetRef.current = targetImage;
  referenceRef.current = referenceImage;

  const [hoveredSlot, setHoveredSlot] = useState(null);
  const [focusedSlot, setFocusedSlot] = useState(null);

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
  const [skinProtect, setSkinProtect] = useState(75);
  const [sourceNormalize, setSourceNormalize] = useState(100);
  const [styleSigma, setStyleSigma] = useState(100);
  const sourceNormalizeRef = useRef(100);
  sourceNormalizeRef.current = sourceNormalize;
  const styleSigmaRef = useRef(100);
  styleSigmaRef.current = styleSigma;
  const [exportSplitPos, setExportSplitPos] = useState(50);

  const [activeSlot, setActiveSlot] = useState("A");
  const [slotSnapshots, setSlotSnapshots] = useState({
    A: {
      params: { ...DEFAULT_PARAMS },
      matchStrength: 100,
      skinProtect: 75,
      engineId: DEFAULT_ENGINE_ID,
      isFilled: false,
    },
    B: {
      params: { ...DEFAULT_PARAMS },
      matchStrength: 100,
      skinProtect: 75,
      engineId: DEFAULT_ENGINE_ID,
      isFilled: false,
    },
  });
  const historyRef = useRef({ past: [], future: [] });
  const lastRecordedSnapshotRef = useRef({
    params: { ...DEFAULT_PARAMS },
    matchStrength: 100,
    skinProtect: 75,
  });
  const isApplyingHistoryRef = useRef(false);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
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
  const desktopScopeRef = useRef(null);
  const mobileScopeRef = useRef(null);
  const scopeRef = useRef({
    updateFrame: (frame) => {
      desktopScopeRef.current?.updateFrame(frame);
      mobileScopeRef.current?.updateFrame(frame);
    },
  });
  const slotSnapshotsRef = useRef(slotSnapshots);
  slotSnapshotsRef.current = slotSnapshots;

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
  const liveSkinProtectRef = useRef(75);
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
    () =>
      applySkinProtectToParams(
        scaleParamsByStrength(gradingParams, matchStrength),
        skinProtect
      ),
    [gradingParams, matchStrength, skinProtect]
  );

  const liveEffectiveParamsRef = useRef(effectiveParams);
  if (!isControlDraggingRef.current) {
    liveEffectiveParamsRef.current = effectiveParams;
  }

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const coarseMq = window.matchMedia?.("(pointer: coarse)");
    const updateDesktopRealtime = () => {
      const next = window.innerWidth >= 1024 && !coarseMq?.matches;
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
    if (activeLut) return false;
    for (const k of Object.keys(DEFAULT_PARAMS)) {
      if (Math.abs((effectiveParams[k] ?? 0) - DEFAULT_PARAMS[k]) > 0.004) {
        return false;
      }
    }
    return Math.abs(effectiveParams.autoGradeMix ?? 0) <= 0.004;
  }, [effectiveParams, activeLut]);

  // Hydrate #g=... share hash on load, or offer Restore Last Session if non-default.
  useEffect(() => {
    if (hasHydratedRef.current) return;
    hasHydratedRef.current = true;

    const rawHash = typeof window !== "undefined" ? window.location.hash : "";
    if (rawHash && /#?g=/.test(rawHash)) {
      import("./utils/shareCodec")
        .then(({ decodeGradeFromHash }) => {
          const decoded = decodeGradeFromHash(rawHash);
          if (decoded) {
            setActiveEngineId(decoded.engineId);
            setSimulateLogInput(decoded.logProfile);
            setMatchStrength(decoded.matchStrength);
            setGradingParams(decoded.params);
            setImportedLook({ name: "Shared Grade", source: "share-link" });
            setStatusText("Loaded Share");
          }
        })
        .catch(() => {});
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

  // Silent session auto-recovery persistence
  useEffect(() => {
    if (!hasHydratedRef.current) return;
    const isDefault =
      isNeutralGrade &&
      activeEngineId === DEFAULT_ENGINE_ID &&
      simulateLogInput === DEFAULT_LOG_PROFILE &&
      matchStrength === 100 &&
      skinProtect === 75 &&
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
          skinProtect,
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
    skinProtect,
    presetName,
  ]);

  useEffect(() => {
    if (!isControlDraggingRef.current) {
      liveParamsRef.current = gradingParams;
      liveStrengthRef.current = matchStrength;
      liveSkinProtectRef.current = skinProtect;
    }
  }, [gradingParams, matchStrength, skinProtect]);

  // Undo/Redo history snapshots
  useEffect(() => {
    if (isControlDraggingRef.current) return;
    if (isApplyingHistoryRef.current) {
      isApplyingHistoryRef.current = false;
      return;
    }
    const nextSnap = { params: { ...gradingParams }, matchStrength, skinProtect };
    const prevSnap = lastRecordedSnapshotRef.current;
    if (areSnapshotsEqual(prevSnap, nextSnap)) return;
    const h = historyRef.current;
    h.past = [...h.past.slice(-(MAX_HISTORY - 1)), prevSnap];
    h.future = [];
    lastRecordedSnapshotRef.current = nextSnap;
    setHistoryState({ canUndo: h.past.length > 0, canRedo: false });
  }, [gradingParams, matchStrength, skinProtect]);

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
      // ignore
    }
  }, [authorName]);

  useEffect(() => {
    try {
      localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(calibration));
    } catch {
      // ignore
    }
  }, [calibration]);

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
    setActiveLut,
  });

  const handleOpenChangelog = () => {
    setIsChangelogOpen(true);
    setHasUnreadUpdate(false);
    try {
      localStorage.setItem(SEEN_UPDATE_STORAGE_KEY, "true");
    } catch {
      // ignore
    }
  };

  const scheduleDeferredLutWarmup = useCallback(() => {
    const runWarmup = () => {
      import("./engine/lut3d.ts")
        .then((m) => m.warmupStandardCube?.())
        .catch(() => {});
      if (!twoStageSolverRef.current) {
        import("./engine/twoStageSolver.ts")
          .then((m) => {
            twoStageSolverRef.current = m;
          })
          .catch(() => {});
      }
    };
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(runWarmup);
    } else {
      setTimeout(runWarmup, 0);
    }
  }, []);

  const handleStartExit = useCallback(() => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    setHasEnteredStudio(true);
    setHomeTabReveal(false);
    scheduleDeferredLutWarmup();

    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      setWorkspacePhase("settled");
      return;
    }

    setWorkspacePhase("entering");
    settleTimerRef.current = setTimeout(() => {
      setWorkspacePhase("settled");
      settleTimerRef.current = null;
    }, 700);
  }, [scheduleDeferredLutWarmup]);

  const handleSplashComplete = useCallback(() => {
    try {
      sessionStorage.setItem(SPLASH_SESSION_KEY, "true");
    } catch {
      // ignore
    }
    setShowSplash(false);
    setHasEnteredStudio(true);
    setWorkspacePhase((prev) => (prev === "hidden" ? "settled" : prev));
  }, []);

  useEffect(() => {
    if (!showSplash && workspacePhase === "hidden") {
      setHasEnteredStudio(true);
      setWorkspacePhase("settled");
    }
  }, [showSplash, workspacePhase]);

  useEffect(() => {
    if (!hasEnteredStudio) return;
    scheduleDeferredLutWarmup();
  }, [hasEnteredStudio, scheduleDeferredLutWarmup]);

  if (activeTab !== "home" && !homeTabReveal) {
    setHomeTabReveal(true);
  }

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, []);

  const handleReplayIntro = () => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    setHomeTabReveal(false);
    setActiveTab("home");
    setWorkspacePhase("hidden");
    setIntroReplayKey((k) => k + 1);
    setShowSplash(true);
  };

  const setSlotError = useCallback((slot, msg) => {
    if (slot === "reference") setReferenceError(msg);
    else setTargetError(msg);
  }, []);

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

      if (!isCurrentJob(jobId)) return;

      const mediaType = tgtInfo?.kind === "video" ? "video" : "image";
      cachedAnalysisBuffersRef.current = { ref, tgt, mediaType };

      dispatchAnalysis({
        jobId,
        ref,
        tgt,
        mediaType,
        engineId: engineToUse,
        autoNormalizeTarget: autoNormToUse,
        inputProfile: profileToUse,
        normalizeWeight: sourceNormalizeRef.current / 100,
        sigmaWeight: styleSigmaRef.current / 100,
        skinProtect: liveSkinProtectRef.current / 100,
        preserveBuffers: true,
      });
    },
    [analysisMaxDim, beginAnalysisJob, captureRgba, dispatchAnalysis, isCurrentJob]
  );

  const handleEngineChange = useCallback(
    (rawNextEngineId) => {
      if (!rawNextEngineId) return;
      const nextEngineId = resolveEngineId(rawNextEngineId);
      if (nextEngineId === activeEngineIdRef.current) return;

      if (!slotSnapshotsRef.current.B?.isFilled && !isNeutralGrade) {
        setSlotSnapshots((prev) => ({
          ...prev,
          B: {
            params: { ...liveParamsRef.current },
            matchStrength: liveStrengthRef.current,
            skinProtect: liveSkinProtectRef.current,
            engineId: activeEngineIdRef.current,
            isFilled: true,
          },
        }));
        showMobileToast(t("toasts.backedUpSlotB"));
      }

      activeEngineIdRef.current = nextEngineId;
      setActiveEngineId(nextEngineId);
      const nextEngineMeta = getEngine(nextEngineId);
      if (nextEngineMeta.usesLut32 && liveStrengthRef.current > 100) {
        liveStrengthRef.current = 100;
        setMatchStrength(100);
        glPreviewRef.current?.setLutMix?.(1.0);
      }

      const cached = cachedAnalysisBuffersRef.current;
      if (cached?.ref?.data && cached.ref.numPixels > 0 && referenceRef.current) {
        const jobId = beginAnalysisJob();
        setIsAnalyzing(true);
        setStatusText(`Switching to ${nextEngineMeta.name} (${nextEngineMeta.versionBadge})...`);
        triggerViewportScan();
        dispatchAnalysis({
          jobId,
          ref: cached.ref,
          tgt: cached.tgt,
          mediaType: cached.mediaType || "image",
          engineId: nextEngineId,
          autoNormalizeTarget: autoNormalizeTargetRef.current,
          inputProfile: simulateLogInputRef.current || DEFAULT_LOG_PROFILE,
          normalizeWeight: sourceNormalizeRef.current / 100,
          sigmaWeight: styleSigmaRef.current / 100,
          skinProtect: liveSkinProtectRef.current / 100,
          preserveBuffers: true,
        });
      } else if (referenceRef.current?.imgElement) {
        triggerViewportScan();
        triggerReferenceAnalysis(referenceRef.current.imgElement, nextEngineId);
      } else {
        setStatusText(`Engine: ${nextEngineMeta.name}`);
        showMobileToast(`Engine: ${nextEngineMeta.name} (${nextEngineMeta.versionBadge})`);
      }
    },
    [
      beginAnalysisJob,
      dispatchAnalysis,
      isNeutralGrade,
      showMobileToast,
      t,
      triggerReferenceAnalysis,
      triggerViewportScan,
    ]
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
          normalizeWeight: sourceNormalizeRef.current / 100,
          sigmaWeight: styleSigmaRef.current / 100,
          skinProtect: liveSkinProtectRef.current / 100,
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
          normalizeWeight: sourceNormalizeRef.current / 100,
          sigmaWeight: styleSigmaRef.current / 100,
          skinProtect: liveSkinProtectRef.current / 100,
          preserveBuffers: true,
        });
      } else {
        showMobileToast(t("toasts.inputProfile", { label: prof.shortLabel }));
      }
    },
    [beginAnalysisJob, dispatchAnalysis, showMobileToast, t]
  );

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
      normalizeWeight: sourceNormalizeRef.current / 100,
      sigmaWeight: styleSigmaRef.current / 100,
      skinProtect: liveSkinProtectRef.current / 100,
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
          const { importKfplugFile } = await import("./utils/presetImporter");
          result = await importKfplugFile(file);
        } else if (meta.ext === "ffx") {
          const { parseFfxPreset } = await import("./utils/ffxEngine");
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
        triggerViewportScan();
        if (result.statusSummary) {
          showMobileToast(result.statusSummary);
        }
      } catch (err) {
        if (err && err.message === "Superseded by a newer LUT import.") return;
        setReferenceError((err && err.message) || "Failed to import this file.");
        setStatusText("Import Error");
      }
    },
    [analysisMaxDim, captureRgba, fitLutInWorker, lang, showMobileToast, triggerViewportScan]
  );

  const handleReferenceLoaded = useCallback(
    (info) => {
      setActiveLut(null);
      setImportedLook(null);
      setPresetName(info.baseName.slice(0, 28));
      setDescription(`Grading preset matched from reference '${info.baseName}'.`);
      triggerReferenceAnalysis(info.imgElement);
      triggerViewportScan();
      setStatusText("Analyzing...");
    },
    [triggerReferenceAnalysis, triggerViewportScan]
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
      simulateLogInputRef.current,
      activeLutRef.current,
      liveStrengthRef.current / 100
    );
    scopeRef.current?.updateFrame({ data: outBuf, width: src.width, height: src.height });
  }, []);

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
      simulateLogInput,
      activeLut,
      matchStrength / 100
    );
    ctx.putImageData(targetImgData, 0, 0);
    canvas.dataset.rendered = "true";
  }, [effectiveParams, simulateLogInput, activeLut, matchStrength]);

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

  useEffect(() => {
    if (referenceRef.current?.imgElement) {
      triggerAnalysisRef.current();
    }
  }, [targetImage]);

  // Live video scope loop
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
          simulateLogInputRef.current,
          activeLutRef.current,
          liveStrengthRef.current / 100
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
  }, [videoEl, activeTab, isDesktopRealtime, getScopeDims, refreshPhotoScope]);

  const flushParamCommit = useCallback(() => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = 0;
    }
    lastCommitAtRef.current = performance.now();
    setGradingParams({ ...liveParamsRef.current });
    setMatchStrength(liveStrengthRef.current);
    setSkinProtect(liveSkinProtectRef.current);
    setSourceNormalize(sourceNormalizeRef.current);
    setStyleSigma(styleSigmaRef.current);
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
  }, [effectiveParams, simulateLogInput, activeLut, matchStrength, scheduleDesktopScopeRefresh]);

  useEffect(
    () => () => {
      if (scopeIdleTimerRef.current) clearTimeout(scopeIdleTimerRef.current);
      if (scopeRafRef.current) cancelAnimationFrame(scopeRafRef.current);
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      if (reloadedTimerRef.current) clearTimeout(reloadedTimerRef.current);
      if (mobileToastTimerRef.current) clearTimeout(mobileToastTimerRef.current);
      if (calibDoneTimerRef.current) clearTimeout(calibDoneTimerRef.current);
      if (calibFlashTimerRef.current) clearTimeout(calibFlashTimerRef.current);
      const tCur = targetRef.current;
      if (tCur && tCur.kind === "video") {
        try {
          tCur.videoEl.pause();
          tCur.videoEl.removeAttribute("src");
          tCur.videoEl.load();
        } catch {
          // ignore
        }
      }
      revokeMediaUrls(tCur);
      revokeMediaUrls(referenceRef.current);
    },
    []
  );

  const handleRunPipelineCalibration = () => {
    if (calibDoneTimerRef.current) clearTimeout(calibDoneTimerRef.current);
    if (calibFlashTimerRef.current) clearTimeout(calibFlashTimerRef.current);
    setCalibrationJustLocked(false);
    triggerCalibScan();
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
    setCalibrationTick((c) => c + 1);

    const elapsed = Math.max(1, Math.round(performance.now() - t0));
    calibDoneTimerRef.current = setTimeout(() => {
      calibDoneTimerRef.current = 0;
      setCalibrationStatus({
        running: false,
        message: "Calibrated - Canvas & Worker OK",
        deltaE: avgDeltaE,
        latencyMs: elapsed,
      });
      setCalibrationJustLocked(true);
      setStatusText("Calibrated");
      showMobileToast(`Calibrated · ΔE ${avgDeltaE} · ${elapsed}ms`);
      calibFlashTimerRef.current = setTimeout(() => {
        calibFlashTimerRef.current = 0;
        setCalibrationJustLocked(false);
      }, 650);
    }, 360);
  };

  const pushLiveEffectiveToGL = useCallback((nextParams, nextStrength, nextSkinProtect) => {
    const eff = applySkinProtectToParams(
      scaleParamsByStrength(nextParams, nextStrength),
      nextSkinProtect
    );
    liveEffectiveParamsRef.current = eff;
    glPreviewRef.current?.setParams?.(eff);
  }, []);

  const clearNonPostGradeLut = useCallback(() => {
    if (!activeLutRef.current || activeLutRef.current.applyPostGrade) return;
    activeLutRef.current = null;
    setActiveLut(null);
    glPreviewRef.current?.setActiveLut?.(null);
  }, []);

  const rebakeAltairRefreshLut = useCallback(async (normPct, sigmaPct, skinPct) => {
    if (activeEngineIdRef.current !== "altair_refresh") return;
    const cached = cachedAnalysisBuffersRef.current;
    if (!cached?.ref?.data || !cached.ref.numPixels) return;
    const solverMod =
      twoStageSolverRef.current ||
      (twoStageSolverRef.current = await import("./engine/twoStageSolver.ts"));
    const res = solverMod.solveTwoStageLut32(
      cached.ref.data,
      cached.ref.numPixels,
      cached.tgt ? cached.tgt.data : null,
      cached.tgt ? cached.tgt.numPixels : 0,
      {
        normalizeWeight: clamp(normPct / 100, 0, 1),
        sigmaWeight: clamp(sigmaPct / 100, 0, 1),
        skinProtect: clamp(skinPct / 100, 0, 1),
        inputProfile: simulateLogInputRef.current || DEFAULT_LOG_PROFILE,
      }
    );
    const nextLut = {
      title: "Keyflow_Altair_Refresh",
      kind: "3d",
      size: 32,
      dMin: [0, 0, 0],
      dMax: [1, 1, 1],
      data: res.lut32,
      sourceEngine: "altair_refresh",
      applyPostGrade: false,
    };
    activeLutRef.current = nextLut;
    glPreviewRef.current?.setActiveLut?.(nextLut);
    setActiveLut(nextLut);
    if (res.params) {
      liveParamsRef.current = res.params;
      pushLiveEffectiveToGL(res.params, liveStrengthRef.current, skinPct);
      if (!isControlDraggingRef.current) {
        setGradingParams({ ...res.params });
        setLastMatchedParams({ ...res.params });
      }
    }
  }, [pushLiveEffectiveToGL]);

  const handleParamChange = useCallback(
    (key, value) => {
      clearNonPostGradeLut();
      const next = { ...liveParamsRef.current, [key]: value };
      liveParamsRef.current = next;
      pushLiveEffectiveToGL(next, liveStrengthRef.current, liveSkinProtectRef.current);
      if (isControlDraggingRef.current) {
        scheduleParamCommit();
        scheduleDesktopScopeRefresh();
      } else {
        setGradingParams(next);
      }
    },
    [clearNonPostGradeLut, pushLiveEffectiveToGL, scheduleParamCommit, scheduleDesktopScopeRefresh]
  );

  // Derived Whites & Blacks controls mapped cleanly onto gainR/G/B and liftR/G/B
  // preserving existing chromatic split-toning tint and 1:1 WebGL/.kfplug/.cube/.ffx parity.
  const handleWhitesChange = useCallback(
    (_, nextWhites) => {
      clearNonPostGradeLut();
      const cur = liveParamsRef.current;
      const mean = ((cur.gainR ?? 0.5) + (cur.gainG ?? 0.5) + (cur.gainB ?? 0.5)) / 3;
      const targetMean = clamp(0.5 + nextWhites * 0.5, 0.0, 1.0);
      const delta = targetMean - mean;
      const next = {
        ...cur,
        gainR: Number(clamp((cur.gainR ?? 0.5) + delta, 0, 1).toFixed(4)),
        gainG: Number(clamp((cur.gainG ?? 0.5) + delta, 0, 1).toFixed(4)),
        gainB: Number(clamp((cur.gainB ?? 0.5) + delta, 0, 1).toFixed(4)),
      };
      liveParamsRef.current = next;
      pushLiveEffectiveToGL(next, liveStrengthRef.current, liveSkinProtectRef.current);
      if (isControlDraggingRef.current) {
        scheduleParamCommit();
        scheduleDesktopScopeRefresh();
      } else {
        setGradingParams(next);
      }
    },
    [clearNonPostGradeLut, pushLiveEffectiveToGL, scheduleParamCommit, scheduleDesktopScopeRefresh]
  );

  const handleBlacksChange = useCallback(
    (_, nextBlacks) => {
      clearNonPostGradeLut();
      const cur = liveParamsRef.current;
      const mean = ((cur.liftR ?? 0.5) + (cur.liftG ?? 0.5) + (cur.liftB ?? 0.5)) / 3;
      const targetMean = clamp(0.5 + nextBlacks * 0.5, 0.0, 1.0);
      const delta = targetMean - mean;
      const next = {
        ...cur,
        liftR: Number(clamp((cur.liftR ?? 0.5) + delta, 0, 1).toFixed(4)),
        liftG: Number(clamp((cur.liftG ?? 0.5) + delta, 0, 1).toFixed(4)),
        liftB: Number(clamp((cur.liftB ?? 0.5) + delta, 0, 1).toFixed(4)),
      };
      liveParamsRef.current = next;
      pushLiveEffectiveToGL(next, liveStrengthRef.current, liveSkinProtectRef.current);
      if (isControlDraggingRef.current) {
        scheduleParamCommit();
        scheduleDesktopScopeRefresh();
      } else {
        setGradingParams(next);
      }
    },
    [clearNonPostGradeLut, pushLiveEffectiveToGL, scheduleParamCommit, scheduleDesktopScopeRefresh]
  );

  const handleHue6VChange = useCallback(
    (channelKey, sectorIndex, value) => {
      clearNonPostGradeLut();
      const cur = liveParamsRef.current;
      const arr = Array.isArray(cur[channelKey])
        ? cur[channelKey].slice()
        : IDENTITY_HUE6.slice();
      arr[sectorIndex] = value;
      const next = {
        ...cur,
        [channelKey]: arr,
        autoGradeMix: Math.max(cur.autoGradeMix ?? 0, 1.0),
      };
      liveParamsRef.current = next;
      pushLiveEffectiveToGL(next, liveStrengthRef.current, liveSkinProtectRef.current);
      if (isControlDraggingRef.current) {
        scheduleParamCommit();
        scheduleDesktopScopeRefresh();
      } else {
        setGradingParams(next);
      }
    },
    [clearNonPostGradeLut, pushLiveEffectiveToGL, scheduleParamCommit, scheduleDesktopScopeRefresh]
  );

  const handleResetHue6V = useCallback(() => {
    clearNonPostGradeLut();
    const next = {
      ...liveParamsRef.current,
      hueShift: IDENTITY_HUE6.slice(),
      hueSat: IDENTITY_HUE6.slice(),
      hueLuma: IDENTITY_HUE6.slice(),
    };
    liveParamsRef.current = next;
    pushLiveEffectiveToGL(next, liveStrengthRef.current, liveSkinProtectRef.current);
    setGradingParams(next);
  }, [clearNonPostGradeLut, pushLiveEffectiveToGL]);

  const handleResetHueChannel = useCallback(
    (channelKey) => {
      if (!["hueShift", "hueSat", "hueLuma"].includes(channelKey)) return;
      clearNonPostGradeLut();
      const next = {
        ...liveParamsRef.current,
        [channelKey]: IDENTITY_HUE6.slice(),
      };
      liveParamsRef.current = next;
      pushLiveEffectiveToGL(next, liveStrengthRef.current, liveSkinProtectRef.current);
      setGradingParams(next);
    },
    [clearNonPostGradeLut, pushLiveEffectiveToGL]
  );

  const handleGammaLevelChange = useCallback(
    (_, nextLevel) => {
      clearNonPostGradeLut();
      const cur = liveParamsRef.current;
      const curMean = ((cur.gammaR ?? 0.5) + (cur.gammaG ?? 0.5) + (cur.gammaB ?? 0.5)) / 3;
      const targetMean = 0.5 + nextLevel * 0.5;
      const delta = targetMean - curMean;
      const next = {
        ...cur,
        gammaR: Number(clamp((cur.gammaR ?? 0.5) + delta, 0, 1).toFixed(4)),
        gammaG: Number(clamp((cur.gammaG ?? 0.5) + delta, 0, 1).toFixed(4)),
        gammaB: Number(clamp((cur.gammaB ?? 0.5) + delta, 0, 1).toFixed(4)),
      };
      liveParamsRef.current = next;
      pushLiveEffectiveToGL(next, liveStrengthRef.current, liveSkinProtectRef.current);
      if (isControlDraggingRef.current) {
        scheduleParamCommit();
        scheduleDesktopScopeRefresh();
      } else {
        setGradingParams(next);
      }
    },
    [clearNonPostGradeLut, pushLiveEffectiveToGL, scheduleParamCommit, scheduleDesktopScopeRefresh]
  );

  const handleResetAllWheels = useCallback(() => {
    clearNonPostGradeLut();
    const next = {
      ...liveParamsRef.current,
      liftR: 0.5,
      liftG: 0.5,
      liftB: 0.5,
      gammaR: 0.5,
      gammaG: 0.5,
      gammaB: 0.5,
      gainR: 0.5,
      gainG: 0.5,
      gainB: 0.5,
    };
    liveParamsRef.current = next;
    pushLiveEffectiveToGL(next, liveStrengthRef.current, liveSkinProtectRef.current);
    setGradingParams(next);
  }, [clearNonPostGradeLut, pushLiveEffectiveToGL]);

  const handleMatchStrengthChange = useCallback(
    (_, val) => {
      const maxVal = getEngine(activeEngineIdRef.current).usesLut32 ? 100 : 150;
      const nextStrength = Math.min(maxVal, Math.max(0, Math.round(val)));
      liveStrengthRef.current = nextStrength;
      pushLiveEffectiveToGL(liveParamsRef.current, nextStrength, liveSkinProtectRef.current);
      glPreviewRef.current?.setLutMix?.(nextStrength / 100);
      if (isControlDraggingRef.current) {
        scheduleParamCommit();
        scheduleDesktopScopeRefresh();
      } else {
        setMatchStrength(nextStrength);
      }
    },
    [pushLiveEffectiveToGL, scheduleParamCommit, scheduleDesktopScopeRefresh]
  );

  const handleSourceNormalizeChange = useCallback(
    (_, val) => {
      const nextNorm = clamp(Math.round(val), 0, 100);
      sourceNormalizeRef.current = nextNorm;
      rebakeAltairRefreshLut(nextNorm, styleSigmaRef.current, liveSkinProtectRef.current);
      if (isControlDraggingRef.current) {
        scheduleParamCommit();
        scheduleDesktopScopeRefresh();
      } else {
        setSourceNormalize(nextNorm);
      }
    },
    [rebakeAltairRefreshLut, scheduleParamCommit, scheduleDesktopScopeRefresh]
  );

  const handleStyleSigmaChange = useCallback(
    (_, val) => {
      const nextSigma = clamp(Math.round(val), 0, 100);
      styleSigmaRef.current = nextSigma;
      rebakeAltairRefreshLut(sourceNormalizeRef.current, nextSigma, liveSkinProtectRef.current);
      if (isControlDraggingRef.current) {
        scheduleParamCommit();
        scheduleDesktopScopeRefresh();
      } else {
        setStyleSigma(nextSigma);
      }
    },
    [rebakeAltairRefreshLut, scheduleParamCommit, scheduleDesktopScopeRefresh]
  );

  const handleSkinProtectChange = useCallback(
    (_, val) => {
      const nextSkin = Math.round(val);
      liveSkinProtectRef.current = nextSkin;
      pushLiveEffectiveToGL(liveParamsRef.current, liveStrengthRef.current, nextSkin);
      if (activeEngineIdRef.current === "altair_refresh") {
        rebakeAltairRefreshLut(sourceNormalizeRef.current, styleSigmaRef.current, nextSkin);
      }
      if (isControlDraggingRef.current) {
        scheduleParamCommit();
        scheduleDesktopScopeRefresh();
      } else {
        setSkinProtect(nextSkin);
      }
    },
    [pushLiveEffectiveToGL, rebakeAltairRefreshLut, scheduleParamCommit, scheduleDesktopScopeRefresh]
  );

  const handleCalibrationChange = useCallback((key, value) => {
    setCalibration((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const handleResetParams = useCallback(() => {
    activeLutRef.current = null;
    setActiveLut(null);
    glPreviewRef.current?.setActiveLut?.(null);
    setGradingParams({ ...DEFAULT_PARAMS });
    setMatchStrength(100);
    setSkinProtect(75);
    sourceNormalizeRef.current = 100;
    styleSigmaRef.current = 100;
    setSourceNormalize(100);
    setStyleSigma(100);
    setSimulateLogInput(DEFAULT_LOG_PROFILE);
    setStatusText("Reset");
    triggerViewportScan();
    showMobileToast(t("toasts.paramsReset"));
  }, [showMobileToast, t, triggerViewportScan]);

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
    setSkinProtect(prev.skinProtect ?? 75);
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
    setSkinProtect(next.skinProtect ?? 75);
    setHistoryState({ canUndo: h.past.length > 0, canRedo: h.future.length > 0 });
    setStatusText("Redo");
    showMobileToast(t("toasts.redo"));
  }, [showMobileToast, t]);

  const handleWheelChange = useCallback(
    (prefix, [r, g, b]) => {
      clearNonPostGradeLut();
      const next = {
        ...liveParamsRef.current,
        [`${prefix}R`]: r,
        [`${prefix}G`]: g,
        [`${prefix}B`]: b,
      };
      liveParamsRef.current = next;
      pushLiveEffectiveToGL(next, liveStrengthRef.current, liveSkinProtectRef.current);
      if (isControlDraggingRef.current) {
        scheduleParamCommit();
        scheduleDesktopScopeRefresh();
      } else {
        setGradingParams(next);
      }
    },
    [clearNonPostGradeLut, pushLiveEffectiveToGL, scheduleParamCommit, scheduleDesktopScopeRefresh]
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

  const whitesVal = useMemo(() => {
    const mean = ((gradingParams.gainR ?? 0.5) + (gradingParams.gainG ?? 0.5) + (gradingParams.gainB ?? 0.5)) / 3;
    return Number(clamp((mean - 0.5) * 2, -1, 1).toFixed(2));
  }, [gradingParams.gainR, gradingParams.gainG, gradingParams.gainB]);

  const blacksVal = useMemo(() => {
    const mean = ((gradingParams.liftR ?? 0.5) + (gradingParams.liftG ?? 0.5) + (gradingParams.liftB ?? 0.5)) / 3;
    return Number(clamp((mean - 0.5) * 2, -1, 1).toFixed(2));
  }, [gradingParams.liftR, gradingParams.liftG, gradingParams.liftB]);

  const gammaLevelVal = useMemo(() => {
    const mean = ((gradingParams.gammaR ?? 0.5) + (gradingParams.gammaG ?? 0.5) + (gradingParams.gammaB ?? 0.5)) / 3;
    return Number(clamp((mean - 0.5) * 2, -1, 1).toFixed(2));
  }, [gradingParams.gammaR, gradingParams.gammaG, gradingParams.gammaB]);

  // Derived bipolar Shadow Tint & Highlight Tint (Cool Blue <-> Warm Amber, synced 1:1 with Lift/Gain wheels)
  const shadowTintVal = useMemo(() => {
    const r = gradingParams.liftR ?? 0.5;
    const b = gradingParams.liftB ?? 0.5;
    return Number(clamp((r - b) * 2.5, -1, 1).toFixed(2));
  }, [gradingParams.liftR, gradingParams.liftB]);

  const highlightTintVal = useMemo(() => {
    const r = gradingParams.gainR ?? 0.5;
    const b = gradingParams.gainB ?? 0.5;
    return Number(clamp((r - b) * 2.5, -1, 1).toFixed(2));
  }, [gradingParams.gainR, gradingParams.gainB]);

  const handleShadowTintChange = useCallback(
    (_, nextTint) => {
      clearNonPostGradeLut();
      const cur = liveParamsRef.current;
      const mean = ((cur.liftR ?? 0.5) + (cur.liftG ?? 0.5) + (cur.liftB ?? 0.5)) / 3;
      const offset = nextTint * 0.2;
      const next = {
        ...cur,
        liftR: Number(clamp(mean + offset, 0, 1).toFixed(4)),
        liftG: Number(clamp(mean, 0, 1).toFixed(4)),
        liftB: Number(clamp(mean - offset, 0, 1).toFixed(4)),
      };
      liveParamsRef.current = next;
      pushLiveEffectiveToGL(next, liveStrengthRef.current, liveSkinProtectRef.current);
      if (isControlDraggingRef.current) {
        scheduleParamCommit();
        scheduleDesktopScopeRefresh();
      } else {
        setGradingParams(next);
      }
    },
    [clearNonPostGradeLut, pushLiveEffectiveToGL, scheduleParamCommit, scheduleDesktopScopeRefresh]
  );

  const handleHighlightTintChange = useCallback(
    (_, nextTint) => {
      clearNonPostGradeLut();
      const cur = liveParamsRef.current;
      const mean = ((cur.gainR ?? 0.5) + (cur.gainG ?? 0.5) + (cur.gainB ?? 0.5)) / 3;
      const offset = nextTint * 0.2;
      const next = {
        ...cur,
        gainR: Number(clamp(mean + offset, 0, 1).toFixed(4)),
        gainG: Number(clamp(mean, 0, 1).toFixed(4)),
        gainB: Number(clamp(mean - offset, 0, 1).toFixed(4)),
      };
      liveParamsRef.current = next;
      pushLiveEffectiveToGL(next, liveStrengthRef.current, liveSkinProtectRef.current);
      if (isControlDraggingRef.current) {
        scheduleParamCommit();
        scheduleDesktopScopeRefresh();
      } else {
        setGradingParams(next);
      }
    },
    [clearNonPostGradeLut, pushLiveEffectiveToGL, scheduleParamCommit, scheduleDesktopScopeRefresh]
  );

  const handleSwitchSlot = useCallback(
    (nextSlot) => {
      if (nextSlot === activeSlot) return;
      const updated = {
        ...slotSnapshotsRef.current,
        [activeSlot]: {
          params: { ...gradingParams },
          matchStrength,
          skinProtect,
          engineId: activeEngineId,
          isFilled: true,
        },
      };
      const loaded = updated[nextSlot] || {
        params: { ...DEFAULT_PARAMS },
        matchStrength: 100,
        skinProtect: 75,
        engineId: activeEngineId,
        isFilled: false,
      };
      setSlotSnapshots(updated);
      setGradingParams({ ...(loaded.params || DEFAULT_PARAMS) });
      setMatchStrength(loaded.matchStrength ?? 100);
      setSkinProtect(loaded.skinProtect ?? 75);
      if (loaded.engineId) {
        const resolvedLoadedEngine = resolveEngineId(loaded.engineId);
        if (resolvedLoadedEngine !== activeEngineId) {
          activeEngineIdRef.current = resolvedLoadedEngine;
          setActiveEngineId(resolvedLoadedEngine);
        }
      }
      setActiveSlot(nextSlot);
      setStatusText(`Slot ${nextSlot}`);
      showMobileToast(`Slot ${nextSlot}`);
    },
    [activeEngineId, activeSlot, gradingParams, matchStrength, skinProtect, showMobileToast]
  );

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
        presetName ||
        referenceImage?.baseName ||
        importedLook?.name ||
        targetImage?.baseName ||
        "Custom Look";
      const { exportGradedImage } = await import("./utils/imageExporter");
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
        const calibratedVideoParams = applyCalibrationToParams(
          effectiveParams,
          calibration
        );
        const res =
          renderMode === "cloud"
            ? await (await import("./utils/cloudVideoExporter")).exportVideoInCloud({
                videoSrc: src,
                targetFile: fileFallback,
                videoDurationSec: Number.isFinite(videoEl?.duration)
                  ? videoEl.duration
                  : 0,
                params: calibratedVideoParams,
                activeLut,
                lutMix: matchStrength / 100,
                engine: activeEngineId,
                matchStrength: 100,
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
            : await (await import("./utils/videoExporter")).exportGradedVideo({
                videoSrc: src,
                targetFile: fileFallback,
                params: calibratedVideoParams,
                activeLut,
                lutMix: matchStrength / 100,
                engine: activeEngineId,
                matchStrength: 100,
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
      effectiveParams,
      calibration,
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
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      } else if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setIsShortcutsOpen((v) => !v);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "1") {
        handleEngineChange("v2");
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "2") {
        handleEngineChange("v3");
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "3") {
        handleEngineChange("altair");
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "4") {
        handleEngineChange("altair_refresh");
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "[") {
        e.preventDefault();
        setIsLeftCollapsed((v) => !v);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "]") {
        e.preventDefault();
        setIsRightCollapsed((v) => !v);
      } else if (e.code === "Space" && videoEl) {
        e.preventDefault();
        if (videoEl.paused) videoEl.play().catch(() => {});
        else videoEl.pause();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleEngineChange, handleRedo, handleUndo, videoEl]);

  const handleReloadAnalysis = () => {
    if (!referenceImage && !importedLook) return;

    if (referenceImage?.imgElement && targetImage?.kind === "video") {
      triggerViewportScan();
      triggerReferenceAnalysis(referenceImage.imgElement);
      return;
    }

    if (lastMatchedParams && !(getEngine(activeEngineIdRef.current).usesLut32 && !activeLutRef.current)) {
      setGradingParams({ ...lastMatchedParams });
      setStatusText("Matched");
      triggerViewportScan();
      if (reloadedTimerRef.current) clearTimeout(reloadedTimerRef.current);
      setReloadedFeedback(true);
      reloadedTimerRef.current = setTimeout(() => setReloadedFeedback(false), 1200);
    } else if (referenceImage?.imgElement || referenceRef.current?.sampledPixels) {
      triggerViewportScan();
      triggerReferenceAnalysis(referenceImage?.imgElement || null);
    }
  };

  const hasLook = Boolean(referenceImage || importedLook);

  const handleExportLut = useCallback(
    async (ext, size = 32) => {
      if (!hasLook) return;
      try {
        const { generateLutFile } = await import("./utils/lutExporter");
        const defaultBase =
          activeEngineId === "altair_refresh" && !presetName
            ? "Keyflow_Altair_Refresh"
            : withEngineSuffix(
                presetName || referenceImage?.baseName || importedLook?.name || "Custom Look",
                activeEngineId
              );
        const safePreset = sanitizeMetadataText(defaultBase, "Keyflow_Altair_Refresh", 64);
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
    (size = 32) => handleExportLut("cube", size),
    [handleExportLut]
  );
  const handleExportLut3d = useCallback(() => handleExportLut("lut", 32), [handleExportLut]);

  const handleExportFfx = useCallback(async () => {
    if (!hasLook) return;
    setIsExporting(true);
    setStatusText("Exporting .ffx...");
    try {
      const calibratedParams = applyCalibrationToParams(effectiveParams, calibration);
      const rawName = withEngineSuffix(
        presetName || referenceImage?.baseName || importedLook?.name || "Custom Look",
        activeEngineId
      );
      const safePreset = sanitizeMetadataText(rawName, "Custom_Look", 64);
      const { exportToFfx } = await import("./utils/ffxEngine");
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
    triggerCalibScan();
  };

  const handleExport = useCallback(async () => {
    if (!hasLook) return;
    setIsExporting(true);
    setStatusText("Exporting...");
    try {
      const calibratedParams = applyCalibrationToParams(effectiveParams, calibration);
      const rawName = withEngineSuffix(
        presetName || referenceImage?.baseName || importedLook?.name || "Custom Look",
        activeEngineId
      );
      const safePreset = sanitizeMetadataText(rawName, "Custom Look", 64);
      const safeAuthor = sanitizeMetadataText(authorName, "TFBAGAS", 64);
      const safeDesc = sanitizeMetadataText(description, "", 200);

      const { generateKfplug } = await import("./utils/kfplugPackager");
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
    async (cubeSize = 32) => {
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

        const [
          { generateKfplug },
          { exportToFfx },
          { generateLutFile },
          { buildZipBlob },
        ] = await Promise.all([
          import("./utils/kfplugPackager"),
          import("./utils/ffxEngine"),
          import("./utils/lutExporter"),
          import("./utils/zipBuilder"),
        ]);

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
          const { exportPromoCardBlob } = await import("./utils/imageExporter");
          const promoRes = await exportPromoCardBlob({
            source: previewSrc,
            width: pw,
            height: ph,
            params: effectiveParams,
            splitPos: exportSplitPos,
            simulateLogInput,
            presetTitle: rawBase,
            engineId: activeEngineId,
            aspectRatio: "16:9",
            format: "png",
            activeLut,
            lutMix: matchStrength / 100,
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
      exportSplitPos,
      showMobileToast,
      t,
    ]
  );

  const handleApplyLook = useCallback(
    (look) => {
      if (!look || !look.params) return;
      setActiveLut(null);
      if (look.engineId) setActiveEngineId(resolveEngineId(look.engineId));
      if (look.logProfile) setSimulateLogInput(resolveLogProfileId(look.logProfile));
      if (typeof look.matchStrength === "number") setMatchStrength(look.matchStrength);
      setGradingParams({ ...DEFAULT_PARAMS, ...look.params });
      setPresetName(look.name || "Custom Look");
      setImportedLook({ name: look.name || "Custom Look", source: "looks-drawer" });
      setStatusText("Applied Look");
      triggerViewportScan();
      showMobileToast(t("toasts.appliedLook", { name: look.name }));
    },
    [showMobileToast, t, triggerViewportScan]
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
    if (restorableSession.engineId) setActiveEngineId(resolveEngineId(restorableSession.engineId));
    if (restorableSession.logProfile) setSimulateLogInput(resolveLogProfileId(restorableSession.logProfile));
    if (typeof restorableSession.matchStrength === "number") setMatchStrength(restorableSession.matchStrength);
    if (typeof restorableSession.skinProtect === "number") setSkinProtect(restorableSession.skinProtect);
    if (restorableSession.presetName) setPresetName(restorableSession.presetName);
    setGradingParams({ ...DEFAULT_PARAMS, ...restorableSession.params });
    setImportedLook({ name: restorableSession.presetName || "Restored Session", source: "session" });
    setRestorableSession(null);
    setStatusText("Restored Session");
    triggerViewportScan();
    showMobileToast(t("toasts.restoredLastSession"));
  }, [restorableSession, showMobileToast, t, triggerViewportScan]);

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
      const { generateKfplug } = await import("./utils/kfplugPackager");
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
      if (err?.name !== "AbortError") setStatusText("Share Error");
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
  const handleOpenCalibration = useCallback(() => setActiveTab("settings"), []);

  const activePreviewImageUrl =
    targetImage?.dataUrl || referenceImage?.dataUrl || null;

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
    () =>
      engineOptions.find((e) => e.id === activeEngineId) ||
      engineOptions[engineOptions.length - 1],
    [engineOptions, activeEngineId]
  );

  const activeLogProfileMeta = useMemo(
    () => getLogProfile(simulateLogInput),
    [simulateLogInput]
  );

  const hasPreviewImage = Boolean(activePreviewImageUrl) || Boolean(videoEl);

  // Extract 6 dominant colors from REFERENCE media for 6-Swatch Palette Droplets
  const referencePalette = useMemo(() => {
    const src = referenceImage?.imgElement || referenceImage?.videoEl;
    if (!src) return [];
    try {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext("2d");
      ctx.drawImage(src, 0, 0, 64, 64);
      return extractPaletteSwatches(c, 6);
    } catch {
      return [];
    }
  }, [referenceImage]);

  // Live perceptual OKLab Delta-E & Skin-Tone Safe telemetry
  const [liveMetrics, setLiveMetrics] = useState({ deltaE: null, skinSafe: true });
  useEffect(() => {
    const cached = cachedAnalysisBuffersRef.current;
    if (cached?.ref?.data && referenceImage) {
      setLiveMetrics(
        computeLiveColorMetrics(
          cached.ref,
          cached.tgt,
          effectiveParams,
          simulateLogInput,
          skinProtect,
          activeLut,
          matchStrength / 100
        )
      );
    } else if (importedLook?.rms && Number.isFinite(importedLook.rms)) {
      setLiveMetrics({
        deltaE: Number((importedLook.rms * 18).toFixed(2)),
        skinSafe: skinProtect >= 35,
      });
    } else {
      setLiveMetrics({ deltaE: null, skinSafe: skinProtect >= 35 });
    }
  }, [
    effectiveParams,
    simulateLogInput,
    skinProtect,
    activeLut,
    matchStrength,
    importedLook,
    referenceImage,
    targetImage,
    isAnalyzing,
  ]);

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

  const primaryControls = useMemo(
    () => [
      {
        key: "exposure",
        label: "Exposure",
        min: -2.0,
        max: 2.0,
        step: 0.02,
        defaultValue: 0.0,
        value: gradingParams.exposure ?? 0,
        isBipolar: true,
        onChange: handleParamChange,
      },
      {
        key: "contrast",
        label: "Contrast",
        min: 0.5,
        max: 2.0,
        step: 0.02,
        defaultValue: 1.0,
        value: gradingParams.contrast ?? 1.0,
        isBipolar: true,
        showPlusSign: false,
        onChange: handleParamChange,
      },
      {
        key: "highlights",
        label: "Highlights",
        min: -0.5,
        max: 0.5,
        step: 0.02,
        defaultValue: 0.0,
        value: gradingParams.highlights ?? 0,
        isBipolar: true,
        onChange: handleParamChange,
      },
      {
        key: "shadows",
        label: "Shadows",
        min: -0.5,
        max: 0.5,
        step: 0.02,
        defaultValue: 0.0,
        value: gradingParams.shadows ?? 0,
        isBipolar: true,
        onChange: handleParamChange,
      },
      {
        key: "whites",
        label: "Whites",
        min: -1.0,
        max: 1.0,
        step: 0.02,
        defaultValue: 0.0,
        value: whitesVal,
        isBipolar: true,
        onChange: handleWhitesChange,
      },
      {
        key: "blacks",
        label: "Blacks",
        min: -1.0,
        max: 1.0,
        step: 0.02,
        defaultValue: 0.0,
        value: blacksVal,
        isBipolar: true,
        onChange: handleBlacksChange,
      },
      {
        key: "temp",
        label: "Temp",
        min: -1.0,
        max: 1.0,
        step: 0.02,
        defaultValue: 0.0,
        value: gradingParams.temp ?? 0,
        isBipolar: true,
        onChange: handleParamChange,
      },
      {
        key: "tint",
        label: "Tint",
        min: -1.0,
        max: 1.0,
        step: 0.02,
        defaultValue: 0.0,
        value: gradingParams.tint ?? 0,
        isBipolar: true,
        onChange: handleParamChange,
      },
      {
        key: "sat",
        label: "Saturation",
        min: 0.0,
        max: 2.0,
        step: 0.02,
        defaultValue: 1.0,
        value: gradingParams.sat ?? 1.0,
        isBipolar: true,
        showPlusSign: false,
        onChange: handleParamChange,
      },
      {
        key: "vib",
        label: "Vibrance",
        min: -0.8,
        max: 0.8,
        step: 0.02,
        defaultValue: 0.0,
        value: gradingParams.vib ?? 0,
        isBipolar: true,
        onChange: handleParamChange,
      },
    ],
    [
      gradingParams.exposure,
      gradingParams.contrast,
      gradingParams.highlights,
      gradingParams.shadows,
      gradingParams.temp,
      gradingParams.tint,
      gradingParams.sat,
      gradingParams.vib,
      whitesVal,
      blacksVal,
      handleParamChange,
      handleWhitesChange,
      handleBlacksChange,
    ]
  );

  const isPrimaryModified = useMemo(
    () =>
      Math.abs((gradingParams.exposure ?? 0) - DEFAULT_PARAMS.exposure) > 0.004 ||
      Math.abs((gradingParams.contrast ?? 1) - DEFAULT_PARAMS.contrast) > 0.004 ||
      Math.abs((gradingParams.highlights ?? 0) - DEFAULT_PARAMS.highlights) > 0.004 ||
      Math.abs((gradingParams.shadows ?? 0) - DEFAULT_PARAMS.shadows) > 0.004 ||
      Math.abs((gradingParams.temp ?? 0) - DEFAULT_PARAMS.temp) > 0.004 ||
      Math.abs((gradingParams.tint ?? 0) - DEFAULT_PARAMS.tint) > 0.004 ||
      Math.abs((gradingParams.sat ?? 1) - DEFAULT_PARAMS.sat) > 0.004 ||
      Math.abs((gradingParams.vib ?? 0) - DEFAULT_PARAMS.vib) > 0.004 ||
      Math.abs(whitesVal) > 0.004 ||
      Math.abs(blacksVal) > 0.004,
    [
      gradingParams.exposure,
      gradingParams.contrast,
      gradingParams.highlights,
      gradingParams.shadows,
      gradingParams.temp,
      gradingParams.tint,
      gradingParams.sat,
      gradingParams.vib,
      whitesVal,
      blacksVal,
    ]
  );

  const isWheelsModified = useMemo(
    () =>
      Math.abs((gradingParams.liftR ?? 0.5) - 0.5) > 0.004 ||
      Math.abs((gradingParams.liftG ?? 0.5) - 0.5) > 0.004 ||
      Math.abs((gradingParams.liftB ?? 0.5) - 0.5) > 0.004 ||
      Math.abs((gradingParams.gammaR ?? 0.5) - 0.5) > 0.004 ||
      Math.abs((gradingParams.gammaG ?? 0.5) - 0.5) > 0.004 ||
      Math.abs((gradingParams.gammaB ?? 0.5) - 0.5) > 0.004 ||
      Math.abs((gradingParams.gainR ?? 0.5) - 0.5) > 0.004 ||
      Math.abs((gradingParams.gainG ?? 0.5) - 0.5) > 0.004 ||
      Math.abs((gradingParams.gainB ?? 0.5) - 0.5) > 0.004 ||
      Math.abs((gradingParams.pivot ?? DEFAULT_PARAMS.pivot) - DEFAULT_PARAMS.pivot) > 0.004,
    [
      gradingParams.liftR,
      gradingParams.liftG,
      gradingParams.liftB,
      gradingParams.gammaR,
      gradingParams.gammaG,
      gradingParams.gammaB,
      gradingParams.gainR,
      gradingParams.gainG,
      gradingParams.gainB,
      gradingParams.pivot,
    ]
  );

  const isHue6VModified = useMemo(
    () =>
      [
        ...(gradingParams.hueShift || IDENTITY_HUE6),
        ...(gradingParams.hueSat || IDENTITY_HUE6),
        ...(gradingParams.hueLuma || IDENTITY_HUE6),
      ].some((v) => Math.abs(v || 0) > 0.004),
    [gradingParams.hueShift, gradingParams.hueSat, gradingParams.hueLuma]
  );

  const desktopGridColsClass =
    isLeftCollapsed && isRightCollapsed
      ? "lg:grid-cols-[1fr]"
      : isLeftCollapsed
      ? "lg:grid-cols-[1fr_340px]"
      : isRightCollapsed
      ? "lg:grid-cols-[280px_1fr]"
      : "lg:grid-cols-[280px_1fr_340px]";

  const hasExportModalMounted = useMountOnce(isExportModalOpen);
  const hasChangelogMounted = useMountOnce(isChangelogOpen);
  const hasShortcutsMounted = useMountOnce(isShortcutsOpen);
  const hasLooksMounted = useMountOnce(isLooksOpen);
  const hasShareMounted = useMountOnce(isShareOpen);
  const hasReleaseKitMounted = useMountOnce(isReleaseKitOpen);
  const hasCommandPaletteMounted = useMountOnce(isCommandPaletteOpen);

  const {
    containerRef: topNavContainerRef,
    registerTabRef: registerTopNavRef,
    pillStyle: topNavPillStyle,
  } = usePillIndicator(activeTab, {
    refreshKey: `${lang}-${hasEnteredStudio}`,
    duration: "var(--dur-pill-nav, 260ms)",
  });
  const {
    containerRef: engineTierContainerRef,
    registerTabRef: registerEngineTierRef,
    pillStyle: engineTierPillStyle,
  } = usePillIndicator(activeEngineId, {
    orientation: "vertical",
    refreshKey: `${activeTab}-${isEngineSectionOpen}-${isRightCollapsed}-${lang}-${hasEnteredStudio}`,
  });
  const {
    containerRef: gradingTabContainerRef,
    registerTabRef: registerGradingTabRef,
    pillStyle: gradingTabPillStyle,
  } = usePillIndicator(gradingTab, {
    refreshKey: `${activeTab}-${isRightCollapsed}-${hasEnteredStudio}`,
  });
  const {
    containerRef: slotContainerRef,
    registerTabRef: registerSlotRef,
    pillStyle: slotPillStyle,
  } = usePillIndicator(activeSlot, { refreshKey: `${activeTab}-${hasEnteredStudio}` });
  const {
    containerRef: mobileDeckTabContainerRef,
    registerTabRef: registerMobileDeckTabRef,
    pillStyle: mobileDeckTabPillStyle,
  } = usePillIndicator(mobileDeckTab, { refreshKey: `${activeTab}-${lang}-${hasEnteredStudio}` });
  const {
    containerRef: mobileAdjustTabContainerRef,
    registerTabRef: registerMobileAdjustTabRef,
    pillStyle: mobileAdjustTabPillStyle,
  } = usePillIndicator(gradingTab, { refreshKey: `${activeTab}-${mobileDeckTab}-${hasEnteredStudio}` });

  useEffect(
    () => () => {
      if (mobileExportTimerRef.current) clearTimeout(mobileExportTimerRef.current);
      if (mobileCopyTimerRef.current) clearTimeout(mobileCopyTimerRef.current);
    },
    []
  );

  const handleMobileExportTrigger = async (key, fn) => {
    if (!fn || isExporting) return;
    const ok = await fn();
    if (ok === false) return;
    if (mobileExportTimerRef.current) clearTimeout(mobileExportTimerRef.current);
    setMobileExportedKey(key);
    mobileExportTimerRef.current = setTimeout(() => {
      setMobileExportedKey(null);
      mobileExportTimerRef.current = 0;
    }, 1200);
  };

  const handleMobileSwatchCopy = (hex) => {
    const normalized = String(hex || "").toUpperCase();
    navigator.clipboard?.writeText?.(normalized)?.catch?.(() => {});
    if (mobileCopyTimerRef.current) clearTimeout(mobileCopyTimerRef.current);
    setMobileCopiedHex(normalized);
    mobileCopyTimerRef.current = setTimeout(() => {
      setMobileCopiedHex("");
      mobileCopyTimerRef.current = 0;
    }, 1500);
    handleCopySwatchToast(normalized);
  };

  const handleEngineHoverStart = (eng, el) => {
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const tooltipW = 248;
    const left = Math.max(12, rect.left - tooltipW - 10);
    const top = Math.max(52, Math.min(window.innerHeight - 170, rect.top));
    setHoveredEngineTip({ eng, top, left });
  };

  return (
    <div
      className={`min-h-screen ${
        activeTab === "home" ? "lg:h-screen lg:overflow-hidden" : ""
      } flex flex-col bg-[#08090A] text-[#E4E4E7]`}
    >
      {/* Hidden Preset Importer (.cube / .kfplug / .ffx / .lut) */}
      <input
        ref={presetImportInputRef}
        type="file"
        accept={PRESET_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleSelectReference(file);
          e.target.value = "";
        }}
      />

      {/* Intro Screen */}
      {showSplash && (
        <IntroScreen
          key={introReplayKey}
          onStartExit={handleStartExit}
          onComplete={handleSplashComplete}
        />
      )}

      {hasEnteredStudio && (
      <>
      {/* SLIM TOP HEADER BAR (44px) */}
      <header
        className={`${
          activeTab === "home" ? "relative lg:sticky lg:top-0" : "sticky top-0"
        } z-40 shrink-0 w-full bg-[#0E0F12] border-b border-white/[0.07] flex flex-col ${
          workspacePhase === "hidden"
            ? "opacity-0 pointer-events-none"
            : workspacePhase === "entering"
            ? "workstation-header-enter"
            : "opacity-100"
        }`}
      >
        <div className="h-11 w-full px-3 sm:px-4 flex items-center justify-between gap-2">
        {/* Left: Collapse Left + Keyflow Logo + Title + Live Engine Status Pill + Restore Last Session */}
        <div className="flex items-center gap-2 min-w-0">
          {activeTab === "home" && (
            <button
              type="button"
              onClick={() => setIsLeftCollapsed((v) => !v)}
              title={isLeftCollapsed ? "Expand Left Inspector ([)" : "Collapse Left Inspector ([)"}
              aria-label={isLeftCollapsed ? "Expand Left Inspector" : "Collapse Left Inspector"}
              aria-pressed={isLeftCollapsed}
              className="hidden lg:inline-flex items-center justify-center w-6 h-6 rounded text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
            >
              {isLeftCollapsed ? (
                <PanelLeftOpen className="w-3.5 h-3.5" />
              ) : (
                <PanelLeftClose className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab("home")}
            className="flex items-center gap-2 shrink-0 cursor-pointer group"
          >
            <BrandLogo size={22} />
            <span className="hidden sm:inline text-[13px] font-semibold tracking-[-0.015em] text-[#F4F4F5] whitespace-nowrap">
              Keyflow Color Match
            </span>
            <span className="sm:hidden text-[13px] font-semibold tracking-[-0.015em] text-[#F4F4F5]">
              Keyflow
            </span>
          </button>

          {/* Subtle Live Engine Status Pill (xl+ so medium/narrow desktop widths never collide) */}
          <div className="hidden xl:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#15171C] border border-white/[0.08] text-[10px] font-mono text-[#A1A1AA] shrink-0">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isAnalyzing ? "bg-amber-400 animate-pulse" : "bg-[#34D399]"
              }`}
            />
            <span className="text-[#F4F4F5]">
              {activeEngine.name} {activeEngine.versionBadge}
            </span>
            <span className="text-white/20">·</span>
            <span className="text-[#A1A1AA]">
              {isAnalyzing ? "Analyzing" : "Active"}
            </span>
          </div>

          {restorableSession && (
            <div className="hidden xl:inline-flex items-center rounded-md bg-[#15171C] border border-white/[0.12] text-[10px] text-[#E4E4E7] overflow-hidden shrink-0">
              <button
                type="button"
                onClick={handleRestoreSession}
                className="px-2 py-0.5 hover:bg-white/[0.07] cursor-pointer transition-colors"
              >
                {t("nav.restoreSession")}
              </button>
              <button
                type="button"
                onClick={() => setRestorableSession(null)}
                aria-label={t("nav.dismissRestore")}
                className="px-1.5 py-0.5 border-l border-white/[0.08] text-[#A1A1AA] hover:text-[#F4F4F5] cursor-pointer"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Clean Uncluttered Utility Cluster (No Duplicate Export Button) */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Secondary Navigation (Desktop lg+) with Sliding Active Indicator Pill */}
          <div className="hidden lg:flex items-center gap-0.5 mr-1 pr-2 border-r border-white/[0.07] shrink-0">
            <div
              ref={topNavContainerRef}
              className="relative flex items-center gap-0.5"
            >
              <div
                aria-hidden="true"
                className="studio-sliding-pill pointer-events-none absolute inset-y-0 left-0 rounded bg-white/[0.11] border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_1px_6px_rgba(0,0,0,0.5)]"
                style={topNavPillStyle}
              />
              {[
                { id: "home", label: t("nav.workspace") },
                { id: "settings", label: t("nav.settings") },
                { id: "about", label: t("nav.about") },
                { id: "support", label: t("nav.support") },
              ].map((item) => (
                <button
                  key={item.id}
                  ref={registerTopNavRef(item.id)}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative z-10 px-2 py-1 rounded text-[11px] font-medium transition-[color,transform] duration-150 ease-[var(--ease-shutter)] active:scale-[0.96] cursor-pointer whitespace-nowrap ${
                    activeTab === item.id
                      ? "text-[#F4F4F5]"
                      : "text-[#A1A1AA] hover:text-[#F4F4F5]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsCommandPaletteOpen(true)}
              title={t("nav.commandPaletteTitle")}
              className="studio-tactile p-1.5 rounded text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.06] cursor-pointer shrink-0"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsShortcutsOpen(true)}
              title={t("nav.shortcutsTitle")}
              className="studio-tactile p-1.5 rounded text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.06] cursor-pointer shrink-0"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleOpenChangelog}
              title={t("nav.whatsNewTitle")}
              className="studio-tactile hidden xl:inline-flex relative px-1.5 py-0.5 rounded text-[10px] font-mono text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.05] cursor-pointer shrink-0"
            >
              v0.9.6a
              {hasUnreadUpdate && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[#34D399]" />
              )}
            </button>
          </div>

          {/* Partner Tool: SeeThrough Studio + Smoked-Glass Hover Popover (Desktop lg+) */}
          <div className="relative hidden lg:block group/seethrough shrink-0">
            <a
              href="https://seethrough-studio.pages.dev"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="SeeThrough Studio — Split PNG illustrations into layered PSD parts for Live2D"
              className="studio-tactile inline-flex items-center gap-1.5 border border-emerald-500/25 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.12] hover:border-emerald-400/40 text-zinc-100 hover:text-white text-[11px] font-medium px-2.5 py-1 rounded-md shrink-0"
            >
              <Layers className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="hidden lg:inline">SeeThrough · PNG→PSD</span>
              <span className="hidden lg:inline text-[10px] text-emerald-300 leading-none" aria-hidden="true">↗</span>
            </a>

            {/* Instant Rich Hover Popover Card — Crisp Smoked-Glass Optical Pop (280ms var(--ease-shutter)) */}
            <div
              role="tooltip"
              className="origin-top-right absolute right-0 top-full mt-2 z-50 w-[300px] rounded-xl bg-[#101216]/95 backdrop-blur-2xl border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_18px_48px_rgba(0,0,0,0.82)] p-3.5 text-left pointer-events-none opacity-0 -translate-y-[6px] scale-[0.96] group-hover/seethrough:opacity-100 group-hover/seethrough:translate-y-0 group-hover/seethrough:scale-100 group-focus-within/seethrough:opacity-100 group-focus-within/seethrough:translate-y-0 group-focus-within/seethrough:scale-100 transition-[opacity,transform] duration-[280ms] ease-[var(--ease-shutter)] motion-reduce:transition-none motion-reduce:transform-none"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Layers className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-xs font-semibold text-zinc-100 truncate">
                    SeeThrough Studio
                  </span>
                </div>
                <span className="text-[9px] font-mono font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                  LIVE2D / PSD TOOL
                </span>
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-zinc-300">
                Automatically split flat PNG character art into clean, separated layers and export a rig-ready .PSD file in seconds.
              </p>

              <ul className="mt-2.5 space-y-1.5 text-[11px] text-zinc-300">
                <li className="flex items-start gap-1.5">
                  <Check className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Smart Part Separation (Hair, Eyes, Face, Outfit)</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                  <span>One-Click Multi-Layer .PSD Export for Live2D &amp; AE</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                  <span>100% Free Web Tool for Illustrators &amp; Riggers</span>
                </li>
              </ul>

              <div className="mt-3 pt-2 border-t border-white/[0.08] flex items-center justify-between text-[10px] font-mono text-emerald-300">
                <span>Open seethrough-studio.pages.dev ↗</span>
              </div>
            </div>
          </div>

          {/* Ghost: Looks / Presets Drawer */}
          <button
            type="button"
            onClick={() => setIsLooksOpen(true)}
            title={t("nav.looksTitle")}
            className="studio-tactile shrink-0 inline-flex items-center gap-1.5 px-2 sm:px-2.5 h-7 rounded-md text-[11px] font-medium text-[#E4E4E7] hover:text-[#F4F4F5] hover:bg-white/[0.06] border border-white/[0.09] cursor-pointer"
          >
            <Bookmark className="w-3 h-3 text-[#A1A1AA]" />
            <span>{t("nav.looks")}</span>
            <span className="hidden sm:inline text-[10px] font-mono text-[#A1A1AA]">
              {SAMPLE_LOOKS.length}
            </span>
          </button>

          {/* Ghost: Import Preset (.cube / .kfplug) */}
          <button
            type="button"
            onClick={() => presetImportInputRef.current?.click()}
            title="Import .cube, .kfplug, .ffx, or .lut preset"
            className="studio-tactile shrink-0 inline-flex items-center gap-1.5 px-2 xl:px-2.5 h-7 rounded-md text-[11px] font-medium text-[#E4E4E7] hover:text-[#F4F4F5] hover:bg-white/[0.06] border border-white/[0.09] cursor-pointer"
          >
            <Upload className="w-3 h-3 text-[#A1A1AA]" />
            <span className="hidden xl:inline">Import Preset</span>
            <span className="xl:hidden">Import</span>
          </button>

          {/* Ghost: Share Link / QR */}
          <button
            type="button"
            onClick={() => setIsShareOpen(true)}
            title={t("nav.shareTitle")}
            className="studio-tactile shrink-0 inline-flex items-center gap-1.5 px-2 xl:px-2.5 h-7 rounded-md text-[11px] font-medium text-[#E4E4E7] hover:text-[#F4F4F5] hover:bg-white/[0.06] border border-white/[0.09] cursor-pointer"
          >
            <Share2 className="w-3 h-3 text-[#A1A1AA]" />
            <span className="hidden xl:inline">Share Link / QR</span>
            <span className="xl:hidden">Share</span>
          </button>

          {/* Collapse Right Inspector Toggle (]) */}
          {activeTab === "home" && (
            <button
              type="button"
              onClick={() => setIsRightCollapsed((v) => !v)}
              title={isRightCollapsed ? "Expand Right Inspector (])" : "Collapse Right Inspector (])"}
              aria-label={isRightCollapsed ? "Expand Right Inspector" : "Collapse Right Inspector"}
              aria-pressed={isRightCollapsed}
              className="studio-tactile hidden lg:inline-flex items-center justify-center w-6 h-6 ml-0.5 rounded text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.06] cursor-pointer shrink-0"
            >
              {isRightCollapsed ? (
                <PanelRightOpen className="w-3.5 h-3.5" />
              ) : (
                <PanelRightClose className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
        </div>

        {/* Mobile & Narrow Tablet Secondary Navigation Bar (< lg) */}
        <nav
          aria-label="Mobile navigation"
          className="lg:hidden w-full px-3 py-1.5 bg-[#090B0E] border-t border-white/[0.06] flex items-center justify-between gap-1 overflow-x-auto shrink-0"
        >
          <div className="flex items-center gap-0.5 shrink-0">
            {[
              { id: "home", label: t("nav.workspace") },
              { id: "settings", label: t("nav.settings") },
              { id: "about", label: t("nav.about") },
              { id: "support", label: t("nav.support") },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-[color,background-color,transform] duration-150 ease-[var(--ease-shutter)] active:scale-[0.96] cursor-pointer whitespace-nowrap ${
                  activeTab === item.id
                    ? "bg-white/[0.11] border border-white/[0.10] text-[#F4F4F5] shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_1px_6px_rgba(0,0,0,0.5)]"
                    : "border border-transparent text-[#A1A1AA] hover:text-[#F4F4F5]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <a
            href="https://seethrough-studio.pages.dev"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="SeeThrough Studio — Split PNG illustrations into layered PSD parts for Live2D"
            className="studio-tactile inline-flex items-center gap-1 border border-emerald-500/25 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.12] hover:border-emerald-400/40 text-zinc-100 hover:text-white text-[10px] font-medium px-2 py-0.5 rounded-md shrink-0 whitespace-nowrap"
          >
            <span>SeeThrough</span>
            <span className="text-emerald-400">↗</span>
          </a>
        </nav>
      </header>

      {/* WORKSPACE VIEW: Edge-to-Edge 3-Column 100vh on Desktop (Collapsible Inspectors), Sticky-Viewport Stack on <1024px */}
      <div
        className={
          activeTab === "home"
            ? `flex-1 min-h-0 flex flex-col lg:grid ${desktopGridColsClass} ${
                workspacePhase === "hidden"
                  ? "opacity-0 pointer-events-none"
                  : workspacePhase === "entering"
                  ? "opacity-100"
                  : homeTabReveal
                  ? "studio-view-enter opacity-100"
                  : "opacity-100"
              }`
            : "hidden"
        }
      >
        {/* A. LEFT INSPECTOR (280px on desktop, collapsible via '[') — Inputs & Live Scopes */}
        <aside
          className={`hidden lg:order-1 bg-[#0E0F12] border-t lg:border-t-0 lg:border-r border-white/[0.07] ${
            isLeftCollapsed ? "lg:hidden" : "lg:flex"
          } flex-col lg:min-h-0 lg:overflow-y-auto divide-y divide-white/[0.07] ${
            workspacePhase === "entering" ? "workstation-col-left-enter" : ""
          }`}
        >
          {/* Reference Input + 6 Dominant Palette Droplets */}
          <ImageDropCard
            title="REFERENCE"
            allowVideo
            allowPresets
            imageInfo={referenceImage}
            onSelectImage={handleSelectReference}
            onClearImage={handleClearReference}
            onTrySample={handleTryReferenceSample}
            sampleOptions={SAMPLE_LOOKS}
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

          {/* Target Footage + Input Profile Dropdown */}
          <ImageDropCard
            title="TARGET FOOTAGE"
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

          {/* Embedded Live Scopes filling remaining lower height */}
          <Suspense fallback={null}>
            <ProScopes
              ref={desktopScopeRef}
              hasMedia={hasPreviewImage}
              isDragging={isScopeFrozen}
              isVideoPlaying={isVideoPlaying}
              isDesktopRealtime={isDesktopRealtime}
              isCollapsed={false}
              skinSafe={liveMetrics.skinSafe}
              skinProtect={skinProtect}
            />
          </Suspense>
        </aside>

        {/* B. CENTER VIEWPORT (Fluid on desktop, Sticky Top on <1024px) */}
        <section
          className={`order-1 lg:order-2 sticky top-0 z-20 lg:static lg:z-auto bg-[#07080A] lg:bg-[#08090A] flex flex-col lg:min-h-0 lg:overflow-hidden border-b lg:border-b-0 border-white/[0.07] ${
            workspacePhase === "entering" ? "workstation-col-center-enter" : ""
          }`}
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
            onSplitPosChange={setExportSplitPos}
            onQuickSaveFrame={handleSaveImage}
            isSavingImage={isSavingFrame}
            onTryInstantDemo={handleTryInstantDemo}
            nativeWidth={targetImage?.width || referenceImage?.width || 0}
            nativeHeight={targetImage?.height || referenceImage?.height || 0}
            simulateLogInput={simulateLogInput}
            isTabActive={activeTab === "home"}
            scanlineKey={viewportScanKey}
            canUndo={historyState.canUndo}
            canRedo={historyState.canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onRematch={handleReloadAnalysis}
            canRematch={hasLook}
            isAnalyzing={isAnalyzing}
            reloadedFeedback={reloadedFeedback}
            footer={
              <>
                {videoEl && (
                  <VideoTransportBar
                    videoEl={videoEl}
                    resolution={`${targetImage.width}×${targetImage.height}`}
                    onMatchCurrentFrame={handleMatchCurrentFrame}
                    canMatchFrame={Boolean(referenceImage?.imgElement)}
                    isAnalyzing={isAnalyzing}
                  />
                )}

                {/* Slim Single-Line Bottom Telemetry Strip (Desktop lg+) */}
                <div className="hidden lg:flex shrink-0 h-8 px-3 bg-[#0B0C0E] border-t border-white/[0.07] items-center justify-between gap-2 text-[11px] font-mono tabular-nums overflow-x-auto no-scrollbar">
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-[#E4E4E7] font-medium">
                      {activeEngine.name} {activeEngine.versionBadge}
                    </span>
                    <span className="text-white/15">|</span>
                    <span className="text-[#A1A1AA]">
                      ΔE{" "}
                      <span className="text-[#F4F4F5]">
                        {liveMetrics.deltaE !== null ? liveMetrics.deltaE.toFixed(2) : "—"}
                      </span>
                    </span>
                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-[#A1A1AA] px-1.5 py-0.5 rounded bg-[#15171C] border border-white/[0.07]">
                      <ShieldCheck
                        className={`w-3 h-3 ${
                          liveMetrics.skinSafe ? "text-[#D4D4D8]" : "text-amber-400"
                        }`}
                      />
                      <span>
                        {liveMetrics.skinSafe ? "Skin-Tone Safe" : "Skin Shift"}
                      </span>
                    </span>
                    <span className="hidden md:inline text-white/15">|</span>
                    <span className="hidden md:inline text-[#A1A1AA]">
                      {activeLogProfileMeta.shortLabel}
                    </span>
                    {statusText && statusText !== "Ready" && (
                      <span className="hidden xl:inline text-[10px] text-[#A1A1AA]">
                        · {translateStatusText(statusText, lang)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Compact A/B Slot Toggle with Sliding Active Pill */}
                    <div
                      ref={slotContainerRef}
                      className="relative inline-flex items-center p-0.5 rounded bg-[#15171C] border border-white/[0.07] text-[10px]"
                    >
                      <div
                        aria-hidden="true"
                        className="studio-sliding-pill pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-[3px] bg-[#F4F4F5] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_1px_4px_rgba(0,0,0,0.45)]"
                        style={slotPillStyle}
                      />
                      {["A", "B"].map((slot) => (
                        <button
                          key={slot}
                          ref={registerSlotRef(slot)}
                          type="button"
                          onClick={() => handleSwitchSlot(slot)}
                          title={t("paramsCard.slotTitle", { slot })}
                          className={`relative z-10 px-1.5 py-0 rounded-[3px] cursor-pointer transition-[color,transform] duration-150 ease-[var(--ease-shutter)] active:scale-[0.96] ${
                            activeSlot === slot
                              ? "text-[#08090A] font-semibold"
                              : "text-[#A1A1AA] hover:text-[#F4F4F5]"
                          }`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>

                    {/* Undo / Redo */}
                    <button
                      type="button"
                      onClick={handleUndo}
                      disabled={!historyState.canUndo}
                      title={t("paramsCard.undoTitle")}
                      className={`p-1 rounded transition-colors ${
                        historyState.canUndo
                          ? "text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.06] cursor-pointer"
                          : "text-[#52525B] cursor-not-allowed"
                      }`}
                    >
                      <Undo2 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={handleRedo}
                      disabled={!historyState.canRedo}
                      title={t("paramsCard.redoTitle")}
                      className={`p-1 rounded transition-colors ${
                        historyState.canRedo
                          ? "text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.06] cursor-pointer"
                          : "text-[#52525B] cursor-not-allowed"
                      }`}
                    >
                      <Redo2 className="w-3 h-3" />
                    </button>

                    {/* Re-match Button */}
                    <button
                      type="button"
                      onClick={handleReloadAnalysis}
                      disabled={!hasLook || isAnalyzing}
                      title={t("paramsCard.reloadTitle")}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-medium border transition-colors ${
                        !hasLook || isAnalyzing
                          ? "text-[#52525B] border-white/[0.05] cursor-not-allowed"
                          : reloadedFeedback
                          ? "bg-[#F4F4F5] text-[#08090A] border-[#F4F4F5] cursor-pointer"
                          : "bg-[#15171C] hover:bg-[#1C1F26] text-[#E4E4E7] hover:text-[#F4F4F5] border-white/[0.09] cursor-pointer"
                      }`}
                    >
                      {reloadedFeedback ? (
                        <>
                          <Check className="w-2.5 h-2.5" />
                          <span>Matched</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className={`w-2.5 h-2.5 ${isAnalyzing ? "animate-spin" : ""}`} />
                          <span>Re-match</span>
                        </>
                      )}
                    </button>

                    {/* Quick Export fallback when Right Inspector is collapsed on desktop */}
                    {isRightCollapsed && (
                      <button
                        type="button"
                        onClick={() => setIsExportModalOpen(true)}
                        className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-semibold bg-[#34D399] hover:bg-[#2CC08A] text-[#051B14] transition-colors cursor-pointer"
                      >
                        <Download className="w-2.5 h-2.5 stroke-[2.25]" />
                        <span>Export</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            }
          />
        </section>

        {/* MOBILE / TABLET 4-TAB TOOL DECK (< lg) */}
        <div className="order-2 lg:hidden h-auto pb-6 flex flex-col bg-[#0E0F12]">
          {/* Segmented 4-Tab Switcher: Match · Adjust · Scopes · Export */}
          <div className="px-3 pt-2.5 pb-2 bg-[#0E0F12] border-b border-white/[0.07]">
            <div
              ref={mobileDeckTabContainerRef}
              role="tablist"
              aria-label="Mobile workstation tools"
              className="relative grid grid-cols-4 gap-0.5 p-0.5 rounded-lg bg-[#08090A] border border-white/[0.08]"
            >
              <div
                aria-hidden="true"
                className="studio-sliding-pill pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-[6px] bg-[#1C1F26] border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_1px_6px_rgba(0,0,0,0.5)]"
                style={mobileDeckTabPillStyle}
              />
              {[
                { id: "match", label: "Match", icon: Cpu },
                { id: "adjust", label: "Adjust", icon: Sliders },
                { id: "scopes", label: "Scopes", icon: Activity },
                { id: "export", label: "Export", icon: Package },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = mobileDeckTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    ref={registerMobileDeckTabRef(tab.id)}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setMobileDeckTab(tab.id)}
                    className={`relative z-10 min-h-[36px] py-1.5 px-1 rounded-[6px] text-[11px] font-medium transition-[color,transform] duration-150 ease-[var(--ease-shutter)] active:scale-[0.97] cursor-pointer inline-flex items-center justify-center gap-1 ${
                      active
                        ? "text-[#F4F4F5]"
                        : "text-[#A1A1AA] hover:text-[#F4F4F5]"
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? "text-[#34D399]" : ""}`} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* TAB 1: MATCH (Side-by-side Media Cards, Solver Tier, Input Profile, Extracted Palette) */}
          {mobileDeckTab === "match" && (
            <div className="p-3 space-y-3.5 studio-panel-fade">
              {/* Compact 2-Column Media Cards (h-[92px]) */}
              <div className="grid grid-cols-2 gap-2.5">
                <MobileMediaTile
                  label="Reference"
                  allowPresets
                  imageInfo={referenceImage}
                  onSelect={(file) => {
                    setMobileShowRefSamples(false);
                    handleSelectReference(file);
                  }}
                  onClear={handleClearReference}
                  onTrySample={() => setMobileShowRefSamples((v) => !v)}
                  importedLook={importedLook}
                  onClearImportedLook={handleClearImportedLook}
                  isAnalyzing={isAnalyzing}
                  errorMessage={referenceError}
                />
                <MobileMediaTile
                  label="Target Footage"
                  imageInfo={targetImage}
                  onSelect={handleSelectTarget}
                  onClear={handleClearTarget}
                  onTrySample={handleTryTargetSample}
                  errorMessage={targetError}
                />
              </div>

              {/* Quick Sample Look Strip (when Reference Sample is toggled) */}
              {mobileShowRefSamples && !referenceImage && (
                <div className="p-2 rounded-lg bg-[#08090A] border border-white/[0.08] space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.06em] text-[#A1A1AA]">
                    <span>Sample Reference Looks</span>
                    <button
                      type="button"
                      onClick={() => setMobileShowRefSamples(false)}
                      className="text-[#71717A] hover:text-[#F4F4F5] cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SAMPLE_LOOKS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setMobileShowRefSamples(false);
                          handleTryReferenceSample(opt.id);
                        }}
                        className="px-2 py-1.5 rounded-md bg-[#15171C] hover:bg-[#1C1F26] border border-white/[0.07] text-[11px] font-medium text-[#E4E4E7] text-left truncate cursor-pointer"
                      >
                        {lang === "id" && SAMPLE_LOOK_LABELS_ID[opt.id]
                          ? SAMPLE_LOOK_LABELS_ID[opt.id]
                          : opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Solver Tier Selector (Altair 4.5 Refresh, Altair 4.0, Polaris 3.5, Sirius 2.5) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A1A1AA] inline-flex items-center gap-1.5">
                    <Cpu className="w-3 h-3" />
                    <span>Solver Tier</span>
                  </span>
                  <span className="text-[10px] font-mono text-[#A1A1AA] tabular-nums">
                    ΔE {liveMetrics.deltaE !== null ? liveMetrics.deltaE.toFixed(2) : "—"}
                  </span>
                </div>
                <div
                  role="tablist"
                  aria-label={t("engineCard.selectorAria")}
                  className="grid grid-cols-2 gap-1.5"
                >
                  {[...engineOptions].reverse().map((eng) => {
                    const isActive = activeEngineId === eng.id;
                    return (
                      <button
                        key={eng.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => handleEngineChange(eng.id)}
                        className={`px-2 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                          isActive
                            ? "bg-[#15171C] border-[#34D399]/75 text-[#F4F4F5] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                            : "bg-[#08090A] hover:bg-[#15171C]/60 border-white/[0.07] text-[#A1A1AA]"
                        }`}
                      >
                        <div className="text-[11px] font-semibold leading-tight truncate">
                          {eng.name} {eng.versionBadge}
                        </div>
                        <div
                          className={`text-[9.5px] font-mono mt-0.5 truncate ${
                            isActive ? "text-[#34D399]" : "text-[#71717A]"
                          }`}
                        >
                          · {eng.functionalTag || eng.shortTag}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Input Profile */}
              <div className="px-2.5 py-2 rounded-lg bg-[#08090A] border border-white/[0.07] flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-[#A1A1AA]">
                  Input Profile
                </span>
                <InputProfileDropdown
                  value={simulateLogInput}
                  onChange={handleTargetInputProfileChange}
                  ariaLabel={t("dropCard.targetInputProfileAria")}
                  compact
                  className="w-[168px]"
                />
              </div>

              {/* Extracted Palette with Monospace HEX Codes */}
              <div className="px-2.5 py-2.5 rounded-lg bg-[#08090A] border border-white/[0.07] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-[0.06em] text-[#A1A1AA]">
                    Extracted Palette
                  </span>
                  {mobileCopiedHex && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[#34D399]">
                      <Check className="w-3 h-3" />
                      <span>Copied {mobileCopiedHex}</span>
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {Array.isArray(referencePalette) && referencePalette.length > 0
                    ? referencePalette.slice(0, 6).map((hex, idx) => (
                        <button
                          key={`${hex}-${idx}`}
                          type="button"
                          onClick={() => handleMobileSwatchCopy(hex)}
                          title={t("dropCard.copyHexTitle", { hex })}
                          aria-label={t("dropCard.copyHexTitle", { hex })}
                          className="flex flex-col items-center gap-1 py-1 rounded-md hover:bg-white/[0.04] active:scale-95 transition-[transform,background-color] cursor-pointer"
                        >
                          <span
                            className="w-5 h-5 rounded-full border border-white/20"
                            style={{
                              backgroundColor: hex,
                              boxShadow:
                                "inset 0 1px 1px rgba(255,255,255,0.35), 0 1px 3px rgba(0,0,0,0.6)",
                            }}
                          />
                          <span className="text-[9px] font-mono tabular-nums text-[#A1A1AA] tracking-tight">
                            {String(hex).toUpperCase()}
                          </span>
                        </button>
                      ))
                    : Array.from({ length: 6 }).map((_, idx) => (
                        <div
                          key={idx}
                          className="flex flex-col items-center gap-1 py-1"
                        >
                          <span className="w-5 h-5 rounded-full bg-[#15171C] border border-white/[0.06]" />
                          <span className="text-[9px] font-mono text-[#52525B]">—</span>
                        </div>
                      ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ADJUST (Match Intensity, Primary, Color Wheels, Hue 6V) */}
          {mobileDeckTab === "adjust" && (
            <div className="p-3 space-y-3 studio-panel-fade">
              {/* Match Intensity & Skin Protect + Reset */}
              <div className="p-2.5 rounded-lg bg-[#08090A] border border-white/[0.07] space-y-1.5">
                <div className="flex items-center justify-between gap-2 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A1A1AA]">
                    Match Intensity
                  </span>
                  <button
                    type="button"
                    onClick={handleResetParams}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#15171C] hover:bg-[#1C1F26] border border-white/[0.08] text-[10px] font-medium text-[#D4D4D8] cursor-pointer"
                  >
                    <RotateCcw className="w-2.5 h-2.5 text-[#A1A1AA]" />
                    <span>Reset</span>
                  </button>
                </div>
                {activeEngineId === "altair_refresh" && (
                  <>
                    <ParameterSlider
                      paramKey="sourceNormalize"
                      label="Source Normalize"
                      min={0}
                      max={100}
                      step={1}
                      value={sourceNormalize}
                      defaultValue={100}
                      isBipolar={false}
                      decimals={0}
                      valueSuffix="%"
                      onChange={handleSourceNormalizeChange}
                      onDragChange={handleControlDragChange}
                    />
                    <ParameterSlider
                      paramKey="styleSigma"
                      label="Style Sigma"
                      min={0}
                      max={100}
                      step={1}
                      value={styleSigma}
                      defaultValue={100}
                      isBipolar={false}
                      decimals={0}
                      valueSuffix="%"
                      onChange={handleStyleSigmaChange}
                      onDragChange={handleControlDragChange}
                    />
                  </>
                )}
                <ParameterSlider
                  paramKey="matchStrength"
                  label={activeEngine?.usesLut32 ? "Match Intensity" : "Match Strength"}
                  min={0}
                  max={activeEngine?.usesLut32 ? 100 : 150}
                  step={activeEngine?.usesLut32 ? 1 : 5}
                  value={activeEngine?.usesLut32 ? Math.min(100, matchStrength) : matchStrength}
                  defaultValue={100}
                  isBipolar={false}
                  decimals={0}
                  valueSuffix="%"
                  onChange={handleMatchStrengthChange}
                  onDragChange={handleControlDragChange}
                />
                <ParameterSlider
                  paramKey="skinProtect"
                  label="Skin Protect"
                  min={0}
                  max={100}
                  step={5}
                  value={skinProtect}
                  defaultValue={75}
                  isBipolar={false}
                  decimals={0}
                  valueSuffix="%"
                  onChange={handleSkinProtectChange}
                  onDragChange={handleControlDragChange}
                />
              </div>

              {/* Segmented Grading Sub-Tabs: Primary · Wheels · Hue 6V */}
              <div
                ref={mobileAdjustTabContainerRef}
                className="relative grid grid-cols-3 gap-0.5 p-0.5 rounded-md bg-[#08090A] border border-white/[0.07]"
              >
                <div
                  aria-hidden="true"
                  className="studio-sliding-pill pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-[4px] bg-[#1C1F26] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_1px_6px_rgba(0,0,0,0.5)]"
                  style={mobileAdjustTabPillStyle}
                />
                {[
                  { id: "primary", label: "Primary", modified: isPrimaryModified },
                  { id: "wheels", label: "Color Wheels", modified: isWheelsModified },
                  { id: "hue6v", label: "Hue 6V", modified: isHue6VModified },
                ].map((tab) => {
                  const active = gradingTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      ref={registerMobileAdjustTabRef(tab.id)}
                      type="button"
                      onClick={() => setGradingTab(tab.id)}
                      className={`relative z-10 py-1.5 rounded-[4px] text-[11px] font-medium transition-[color,transform] duration-150 ease-[var(--ease-shutter)] active:scale-[0.96] cursor-pointer inline-flex items-center justify-center gap-1 ${
                        active
                          ? "text-[#F4F4F5]"
                          : "text-[#A1A1AA] hover:text-[#F4F4F5]"
                      }`}
                    >
                      <span>{tab.label}</span>
                      {tab.modified && (
                        <span
                          aria-hidden="true"
                          className="w-1.5 h-1.5 rounded-full bg-[#34D399]/85 shrink-0"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {gradingTab === "primary" && (
                <div className="space-y-3 studio-panel-fade">
                  <div className="grid grid-cols-2 gap-x-3.5 gap-y-1.5">
                    {primaryControls.map((ctrl) => (
                      <ParameterSlider
                        key={ctrl.key}
                        paramKey={ctrl.key}
                        label={ctrl.label}
                        min={ctrl.min}
                        max={ctrl.max}
                        step={ctrl.step}
                        value={ctrl.value}
                        defaultValue={ctrl.defaultValue}
                        isBipolar={ctrl.isBipolar}
                        showPlusSign={ctrl.showPlusSign}
                        decimals={2}
                        onChange={ctrl.onChange}
                        onDragChange={handleControlDragChange}
                      />
                    ))}
                  </div>

                  <div className="pt-2.5 border-t border-white/[0.07] space-y-2">
                    <ParameterSlider
                      paramKey="pivot"
                      label="Contrast Pivot"
                      min={0.1}
                      max={0.9}
                      step={0.02}
                      value={gradingParams.pivot ?? DEFAULT_PARAMS.pivot}
                      defaultValue={DEFAULT_PARAMS.pivot}
                      isBipolar={false}
                      decimals={2}
                      onChange={handleParamChange}
                      onDragChange={handleControlDragChange}
                    />
                    <div className="grid grid-cols-2 gap-x-3.5 gap-y-1">
                      <ParameterSlider
                        paramKey="shadowTint"
                        label="Shadow Tint"
                        min={-1.0}
                        max={1.0}
                        step={0.02}
                        value={shadowTintVal}
                        defaultValue={0.0}
                        isBipolar
                        decimals={2}
                        onChange={handleShadowTintChange}
                        onDragChange={handleControlDragChange}
                      />
                      <ParameterSlider
                        paramKey="highlightTint"
                        label="Highlight Tint"
                        min={-1.0}
                        max={1.0}
                        step={0.02}
                        value={highlightTintVal}
                        defaultValue={0.0}
                        isBipolar
                        decimals={2}
                        onChange={handleHighlightTintChange}
                        onDragChange={handleControlDragChange}
                      />
                    </div>
                  </div>
                </div>
              )}

              {gradingTab === "wheels" && (
                <div className="space-y-3 studio-panel-fade">
                  <div className="grid grid-cols-3 gap-1.5">
                    <ColorWheel
                      title="Lift"
                      rgb={liftRgb}
                      onChange={handleLiftChange}
                      onReset={handleLiftReset}
                      onDragChange={handleControlDragChange}
                    />
                    <ColorWheel
                      title="Gamma"
                      rgb={gammaRgb}
                      onChange={handleGammaChange}
                      onReset={handleGammaReset}
                      onDragChange={handleControlDragChange}
                    />
                    <ColorWheel
                      title="Gain"
                      rgb={gainRgb}
                      onChange={handleGainChange}
                      onReset={handleGainReset}
                      onDragChange={handleControlDragChange}
                    />
                  </div>
                  <div className="pt-2.5 border-t border-white/[0.07] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A1A1AA]">
                        Master Levels / Offset
                      </span>
                      <button
                        type="button"
                        onClick={handleResetAllWheels}
                        disabled={!isWheelsModified}
                        className={`text-[10px] font-mono ${
                          isWheelsModified
                            ? "text-[#A1A1AA] hover:text-[#F4F4F5] cursor-pointer"
                            : "text-[#52525B] cursor-not-allowed"
                        }`}
                      >
                        Reset Wheels
                      </button>
                    </div>
                    <ParameterSlider
                      paramKey="liftLevel"
                      label="Lift Level"
                      min={-1.0}
                      max={1.0}
                      step={0.02}
                      value={blacksVal}
                      defaultValue={0.0}
                      isBipolar
                      decimals={2}
                      onChange={handleBlacksChange}
                      onDragChange={handleControlDragChange}
                    />
                    <ParameterSlider
                      paramKey="gammaLevel"
                      label="Gamma Level"
                      min={-1.0}
                      max={1.0}
                      step={0.02}
                      value={gammaLevelVal}
                      defaultValue={0.0}
                      isBipolar
                      decimals={2}
                      onChange={handleGammaLevelChange}
                      onDragChange={handleControlDragChange}
                    />
                    <ParameterSlider
                      paramKey="gainLevel"
                      label="Gain Level"
                      min={-1.0}
                      max={1.0}
                      step={0.02}
                      value={whitesVal}
                      defaultValue={0.0}
                      isBipolar
                      decimals={2}
                      onChange={handleWhitesChange}
                      onDragChange={handleControlDragChange}
                    />
                  </div>
                </div>
              )}

              {gradingTab === "hue6v" && (
                <div className="studio-panel-fade">
                  <Hue6VPanel
                    hueShift={gradingParams.hueShift || IDENTITY_HUE6}
                    hueSat={gradingParams.hueSat || IDENTITY_HUE6}
                    hueLuma={gradingParams.hueLuma || IDENTITY_HUE6}
                    skinProtect={skinProtect}
                    skinSafe={liveMetrics.skinSafe}
                    onChangeHueVector={handleHue6VChange}
                    onResetHue6V={handleResetHue6V}
                    onResetHueChannel={handleResetHueChannel}
                    onDragChange={handleControlDragChange}
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SCOPES (Full Mobile Width Live ProScopes) */}
          <div className={mobileDeckTab === "scopes" ? "w-full studio-panel-fade" : "hidden"}>
            <Suspense fallback={null}>
              <ProScopes
                ref={mobileScopeRef}
                hasMedia={hasPreviewImage}
                isDragging={isScopeFrozen}
                isVideoPlaying={isVideoPlaying}
                isDesktopRealtime={isDesktopRealtime}
                isCollapsed={mobileDeckTab !== "scopes"}
                skinSafe={liveMetrics.skinSafe}
                skinProtect={skinProtect}
              />
            </Suspense>
          </div>

          {/* TAB 4: EXPORT (.kfplug, .cube, .ffx, Export Promo Card) */}
          {mobileDeckTab === "export" && (
            <div className="p-3 space-y-3 studio-panel-fade">
              {/* Preset Name Input */}
              <div className="p-2.5 rounded-lg bg-[#08090A] border border-white/[0.07] space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="mobile-preset-name"
                    className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A1A1AA]"
                  >
                    Preset Name
                  </label>
                  <span className="text-[10px] font-mono text-[#71717A] truncate max-w-[175px]">
                    {withEngineSuffix(
                      presetName || referenceImage?.baseName || importedLook?.name || "Custom Look",
                      activeEngineId
                    ).replace(/[^a-zA-Z0-9._-]+/g, "_")}.kfplug
                  </span>
                </div>
                <input
                  id="mobile-preset-name"
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder={referenceImage?.baseName || importedLook?.name || "Custom Look"}
                  className="w-full h-9 px-2.5 rounded-md bg-[#15171C] border border-white/[0.09] text-xs text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#34D399]/60"
                />
              </div>

              {isNeutralGrade && hasLook && (
                <div className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[10.5px] text-amber-200">
                  Grade is currently neutral — adjust sliders or match a reference first.
                </div>
              )}

              {/* Primary .kfplug Plugin Export */}
              <button
                type="button"
                disabled={!hasLook || isExporting}
                onClick={() => handleMobileExportTrigger("kfplug", handleExport)}
                className={`w-full min-h-[42px] px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-between transition-colors ${
                  !hasLook || isExporting
                    ? "bg-[#15171C] text-[#52525B] border border-white/[0.05] cursor-not-allowed"
                    : "bg-[#34D399] hover:bg-[#2CC08A] text-[#051B14] cursor-pointer"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  {mobileExportedKey === "kfplug" ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Download className="w-4 h-4 stroke-[2.25]" />
                  )}
                  <span>
                    {mobileExportedKey === "kfplug" ? "Exported .kfplug" : "Export .kfplug Preset"}
                  </span>
                </span>
                <span className="text-[10px] font-mono opacity-80">.kfplug</span>
              </button>

              {/* .cube 3D LUT + Grid Selector & .ffx Lumetri */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-2.5 rounded-lg bg-[#08090A] border border-white/[0.08] space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-semibold text-[#F4F4F5]">.cube LUT</span>
                    <div className="flex items-center gap-0.5">
                      {[17, 33, 65].map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setMobileCubeSize(sz)}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono cursor-pointer ${
                            mobileCubeSize === sz
                              ? "bg-[#F4F4F5] text-[#08090A] font-semibold"
                              : "bg-[#15171C] text-[#A1A1AA]"
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!hasLook || isExporting}
                    onClick={() =>
                      handleMobileExportTrigger("cube", () => handleExportCube(mobileCubeSize))
                    }
                    className={`w-full min-h-[36px] px-2.5 rounded-md text-[11px] font-medium inline-flex items-center justify-center gap-1.5 border transition-colors ${
                      !hasLook || isExporting
                        ? "bg-[#15171C]/50 text-[#52525B] border-white/[0.04] cursor-not-allowed"
                        : "bg-[#15171C] hover:bg-[#1C1F26] text-[#F4F4F5] border-white/[0.10] cursor-pointer"
                    }`}
                  >
                    {mobileExportedKey === "cube" ? (
                      <Check className="w-3.5 h-3.5 text-[#34D399]" />
                    ) : (
                      <Download className="w-3.5 h-3.5 text-[#A1A1AA]" />
                    )}
                    <span>{mobileExportedKey === "cube" ? "Exported" : `Export .cube`}</span>
                  </button>
                </div>

                <div className="p-2.5 rounded-lg bg-[#08090A] border border-white/[0.08] flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-semibold text-[#F4F4F5]">.ffx Preset</span>
                    <span className="text-[9px] font-mono text-[#71717A]">AE Lumetri</span>
                  </div>
                  <button
                    type="button"
                    disabled={!hasLook || isExporting}
                    onClick={() => handleMobileExportTrigger("ffx", handleExportFfx)}
                    className={`w-full min-h-[36px] px-2.5 rounded-md text-[11px] font-medium inline-flex items-center justify-center gap-1.5 border transition-colors ${
                      !hasLook || isExporting
                        ? "bg-[#15171C]/50 text-[#52525B] border-white/[0.04] cursor-not-allowed"
                        : "bg-[#15171C] hover:bg-[#1C1F26] text-[#F4F4F5] border-white/[0.10] cursor-pointer"
                    }`}
                  >
                    {mobileExportedKey === "ffx" ? (
                      <Check className="w-3.5 h-3.5 text-[#34D399]" />
                    ) : (
                      <Download className="w-3.5 h-3.5 text-[#A1A1AA]" />
                    )}
                    <span>{mobileExportedKey === "ffx" ? "Exported" : "Export .ffx"}</span>
                  </button>
                </div>
              </div>

              {/* Export Promo Card */}
              <div className="p-2.5 rounded-lg bg-[#08090A] border border-white/[0.08] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold text-[#F4F4F5]">
                      Export Promo Card
                    </div>
                    <div className="text-[10px] text-[#71717A]">
                      Before/After showcase PNG with palette &amp; QR
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {["16:9", "9:16", "1:1"].map((ar) => (
                      <button
                        key={ar}
                        type="button"
                        onClick={() => setMobilePromoAspect(ar)}
                        className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono cursor-pointer ${
                          mobilePromoAspect === ar
                            ? "bg-[#F4F4F5] text-[#08090A] font-semibold"
                            : "bg-[#15171C] text-[#A1A1AA]"
                        }`}
                      >
                        {ar}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!hasPreviewImage || isSavingFrame}
                  onClick={() =>
                    handleMobileExportTrigger("promo", () =>
                      handleSaveImage({
                        format: "png",
                        quality: 95,
                        layout: "promo",
                        splitPos: exportSplitPos,
                        promoAspect: mobilePromoAspect,
                        includeQr: true,
                        qrMode: "grade",
                      })
                    )
                  }
                  className={`w-full min-h-[38px] px-3 rounded-md text-xs font-medium inline-flex items-center justify-center gap-1.5 border transition-colors ${
                    !hasPreviewImage || isSavingFrame
                      ? "bg-[#15171C]/50 text-[#52525B] border-white/[0.04] cursor-not-allowed"
                      : "bg-[#15171C] hover:bg-[#1C1F26] text-[#F4F4F5] border-white/[0.12] cursor-pointer"
                  }`}
                >
                  {mobileExportedKey === "promo" ? (
                    <Check className="w-3.5 h-3.5 text-[#34D399]" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-[#34D399]" />
                  )}
                  <span>
                    {isSavingFrame
                      ? "Rendering Promo Card..."
                      : mobileExportedKey === "promo"
                      ? "Promo Card Saved"
                      : "Export Promo Card"}
                  </span>
                </button>
              </div>

              {/* Full Export Modal (Video / Frame / ZIP / Calibration) */}
              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                className="w-full min-h-[36px] px-3 rounded-lg bg-transparent hover:bg-white/[0.04] border border-white/[0.08] text-[11px] font-medium text-[#A1A1AA] hover:text-[#F4F4F5] inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Package className="w-3.5 h-3.5" />
                <span>More Export Options (Video · Frame · ZIP)</span>
              </button>
            </div>
          )}
        </div>

        {/* C. RIGHT INSPECTOR (340px on desktop, collapsible via ']') — Engine, Grading & Pinned Export Footer */}
        <aside
          className={`hidden lg:order-3 bg-[#0E0F12] border-t lg:border-t-0 lg:border-l border-white/[0.07] ${
            isRightCollapsed ? "lg:hidden" : "lg:flex"
          } flex-col lg:min-h-0 ${
            workspacePhase === "entering" ? "workstation-col-right-enter" : ""
          }`}
        >
          {/* Scrollable Inspector Controls */}
          <div className="flex-1 lg:min-h-0 lg:overflow-y-auto divide-y divide-white/[0.07]">
            {/* 1. Collapsible Engine Selector Stack with Vertical Sliding Active Pill */}
            <section className="px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-expanded={isEngineSectionOpen}
                  onClick={() => setIsEngineSectionOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-left group cursor-pointer"
                >
                  <Cpu className="w-3 h-3 text-[#A1A1AA] group-hover:text-[#F4F4F5] transition-colors duration-150" />
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A1A1AA] group-hover:text-[#F4F4F5] transition-colors duration-150">
                    Color Match Engine
                  </h3>
                  <ChevronDown
                    className={`studio-chevron w-3 h-3 text-[#71717A] group-hover:text-[#E4E4E7] ${
                      isEngineSectionOpen ? "rotate-180" : "rotate-0"
                    }`}
                  />
                </button>

                <div className="flex items-center gap-1.5">
                  {!isEngineSectionOpen && (
                    <span className="text-[10px] font-mono text-[#E4E4E7] px-1.5 py-0.5 rounded bg-[#15171C] border border-[#34D399]/40">
                      {activeEngine.name} {activeEngine.versionBadge}
                    </span>
                  )}
                  {/* Engine Compare Info Popover */}
                  <div ref={engineCompareRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setIsEngineCompareOpen((v) => !v)}
                      aria-expanded={isEngineCompareOpen}
                      aria-label={t("engineCard.compareAria")}
                      className={`studio-tactile w-5 h-5 rounded inline-flex items-center justify-center text-[10px] font-mono border cursor-pointer ${
                        isEngineCompareOpen
                          ? "bg-[#F4F4F5] text-[#08090A] border-[#F4F4F5]"
                          : "bg-[#15171C] text-[#A1A1AA] hover:text-[#F4F4F5] border-white/[0.08]"
                      }`}
                    >
                      ?
                    </button>

                    {engineComparePresence.isMounted && (
                      <div
                        data-state={engineComparePresence.state}
                        className="studio-popover origin-top-right absolute right-0 top-full mt-1.5 w-72 z-50 rounded-lg bg-[#121419]/96 backdrop-blur-xl border border-white/[0.11] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_40px_rgba(0,0,0,0.85)] p-3 space-y-2 text-left"
                      >
                        <div className="text-[10px] font-mono uppercase tracking-[0.08em] text-[#A1A1AA] border-b border-white/[0.07] pb-1.5">
                          Engine Pipelines
                        </div>
                        {engineOptions.map((eng) => (
                          <div
                            key={eng.id}
                            className={`p-2 rounded-md border ${
                              activeEngineId === eng.id
                                ? "bg-[#15171C] border-[#34D399]/50"
                                : "bg-[#08090A] border-white/[0.06]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold text-[#F4F4F5]">
                                {eng.name} {eng.versionBadge}
                              </span>
                              <span className="text-[10px] text-[#A1A1AA]">{eng.subtitle}</span>
                            </div>
                            <p className="text-[10px] text-[#A1A1AA] mt-0.5 leading-snug">
                              {eng.summary}
                            </p>
                            {Array.isArray(eng.pipelineBadges) && eng.pipelineBadges.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {eng.pipelineBadges.map((badge) => (
                                  <span
                                    key={badge}
                                    className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-[9px] font-mono text-[#D4D4D8]"
                                  >
                                    {badge}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Smooth CSS Grid Collapsible Engine Tier Switcher with Sliding Pill */}
              <div
                className="studio-collapse-grid"
                data-expanded={isEngineSectionOpen}
                aria-hidden={!isEngineSectionOpen}
              >
                <div className="studio-collapse-inner">
                  <div
                    ref={engineTierContainerRef}
                    role="tablist"
                    aria-label={t("engineCard.selectorAria")}
                    className="relative mt-2 space-y-1"
                  >
                    <div
                      aria-hidden="true"
                      className="studio-sliding-pill pointer-events-none absolute left-0 right-0 top-0 rounded-md bg-[#15171C] border border-[#34D399]/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_2px_12px_rgba(0,0,0,0.5)]"
                      style={engineTierPillStyle}
                    />
                    {engineOptions.map((eng) => {
                      const isActive = activeEngineId === eng.id;
                      return (
                        <button
                          key={eng.id}
                          ref={registerEngineTierRef(eng.id)}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          tabIndex={isEngineSectionOpen ? 0 : -1}
                          onClick={() => handleEngineChange(eng.id)}
                          onMouseEnter={(e) => handleEngineHoverStart(eng, e.currentTarget)}
                          onMouseLeave={() => setHoveredEngineTip(null)}
                          onFocus={(e) => handleEngineHoverStart(eng, e.currentTarget)}
                          onBlur={() => setHoveredEngineTip(null)}
                          className={`relative z-10 w-full px-2.5 py-2 rounded-md border text-left flex items-center justify-between gap-2 transition-[color,background-color,border-color,transform] duration-150 ease-[var(--ease-shutter)] active:scale-[0.96] cursor-pointer ${
                            isActive
                              ? "bg-transparent border-transparent text-[#F4F4F5]"
                              : "bg-transparent hover:bg-white/[0.03] border-white/[0.07] text-[#A1A1AA]"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`text-xs font-semibold leading-none ${
                                  isActive ? "text-[#F4F4F5]" : "text-[#E4E4E7]"
                                }`}
                              >
                                {eng.name} {eng.versionBadge}
                              </span>
                              <span
                                className={`text-[9.5px] font-mono leading-none ${
                                  isActive ? "text-[#34D399]" : "text-[#71717A]"
                                }`}
                              >
                                · {eng.functionalTag || eng.shortTag}
                              </span>
                            </div>
                            <div className="text-[10px] text-[#A1A1AA] mt-0.5 truncate">
                              {eng.subtitle}
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-2 font-mono text-[10px] tabular-nums">
                            {isActive ? (
                              <span className="text-[#F4F4F5]">
                                ΔE {liveMetrics.deltaE !== null ? liveMetrics.deltaE.toFixed(2) : "—"}
                              </span>
                            ) : (
                              <span className="text-[#A1A1AA]/80">[{eng.shortcutKey}]</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Hover Spec Popover Portal for Engine Capabilities */}
              {hoveredEngineTip &&
                !isEngineCompareOpen &&
                createPortal(
                  <div
                    role="tooltip"
                    style={{
                      position: "fixed",
                      top: `${hoveredEngineTip.top}px`,
                      left: `${hoveredEngineTip.left}px`,
                      width: "248px",
                    }}
                    className="studio-popover-enter hidden lg:block pointer-events-none z-[85] rounded-lg bg-[#121419]/96 backdrop-blur-md border border-white/[0.11] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_34px_rgba(0,0,0,0.85)] p-2.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-[#F4F4F5]">
                        {hoveredEngineTip.eng.name} {hoveredEngineTip.eng.versionBadge}
                      </span>
                      <span className="text-[10px] text-[#A1A1AA]">
                        {hoveredEngineTip.eng.subtitle}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#A1A1AA] leading-snug">
                      {hoveredEngineTip.eng.bestFor}
                    </p>
                    {Array.isArray(hoveredEngineTip.eng.pipelineBadges) && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {hoveredEngineTip.eng.pipelineBadges.map((badge) => (
                          <span
                            key={badge}
                            className="px-1.5 py-0.5 rounded bg-[#15171C] border border-white/[0.09] text-[9px] font-mono text-[#E4E4E7]"
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>,
                  document.body
                )}
            </section>

            {/* 2. Match Controls: Two-Stage Sliders (Altair 4.5 Refresh) + Match Intensity & Skin Protect */}
            <section className="px-3.5 py-2.5 space-y-1">
              {activeEngineId === "altair_refresh" && (
                <>
                  <ParameterSlider
                    paramKey="sourceNormalize"
                    label="Source Normalize"
                    min={0}
                    max={100}
                    step={1}
                    value={sourceNormalize}
                    defaultValue={100}
                    isBipolar={false}
                    decimals={0}
                    valueSuffix="%"
                    onChange={handleSourceNormalizeChange}
                    onDragChange={handleControlDragChange}
                  />
                  <ParameterSlider
                    paramKey="styleSigma"
                    label="Style Sigma"
                    min={0}
                    max={100}
                    step={1}
                    value={styleSigma}
                    defaultValue={100}
                    isBipolar={false}
                    decimals={0}
                    valueSuffix="%"
                    onChange={handleStyleSigmaChange}
                    onDragChange={handleControlDragChange}
                  />
                </>
              )}
              <ParameterSlider
                paramKey="matchStrength"
                label={activeEngine?.usesLut32 ? "Match Intensity" : "Match Strength"}
                min={0}
                max={activeEngine?.usesLut32 ? 100 : 150}
                step={activeEngine?.usesLut32 ? 1 : 5}
                value={activeEngine?.usesLut32 ? Math.min(100, matchStrength) : matchStrength}
                defaultValue={100}
                isBipolar={false}
                decimals={0}
                valueSuffix="%"
                onChange={handleMatchStrengthChange}
                onDragChange={handleControlDragChange}
              />
              <ParameterSlider
                paramKey="skinProtect"
                label="Skin Protect"
                min={0}
                max={100}
                step={5}
                value={skinProtect}
                defaultValue={75}
                isBipolar={false}
                decimals={0}
                valueSuffix="%"
                onChange={handleSkinProtectChange}
                onDragChange={handleControlDragChange}
              />
            </section>

            {/* 3. Grading Tabs (Primary, Wheels, Hue 6V) with Sliding Active Pill & Modified Indicator Dots */}
            <section className="px-3.5 py-3">
              {/* Segmented Grading Tab Switcher */}
              <div
                ref={gradingTabContainerRef}
                className="relative grid grid-cols-3 gap-0.5 p-0.5 rounded-md bg-[#08090A] border border-white/[0.07] mb-3"
              >
                <div
                  aria-hidden="true"
                  className="studio-sliding-pill pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-[4px] bg-[#1C1F26] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_1px_6px_rgba(0,0,0,0.5)]"
                  style={gradingTabPillStyle}
                />
                {[
                  { id: "primary", label: "Primary", modified: isPrimaryModified },
                  { id: "wheels", label: "Wheels", modified: isWheelsModified },
                  { id: "hue6v", label: "Hue 6V", modified: isHue6VModified },
                ].map((tab) => {
                  const active = gradingTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      ref={registerGradingTabRef(tab.id)}
                      type="button"
                      onClick={() => setGradingTab(tab.id)}
                      className={`relative z-10 py-1 rounded-[4px] text-[11px] font-medium transition-[color,transform] duration-150 ease-[var(--ease-shutter)] active:scale-[0.96] cursor-pointer inline-flex items-center justify-center gap-1.5 ${
                        active
                          ? "text-[#F4F4F5]"
                          : "text-[#A1A1AA] hover:text-[#F4F4F5]"
                      }`}
                    >
                      <span>{tab.label}</span>
                      {tab.modified && (
                        <span
                          aria-hidden="true"
                          className="w-1.5 h-1.5 rounded-full bg-[#34D399]/85 shrink-0"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* PRIMARY TAB: Compact 2-Column Grid of all 10 Hairline Scrubbers + Collapsible Tone & Roll-Off */}
              {gradingTab === "primary" && (
                <div key="primary" className="studio-panel-fade space-y-3">
                  <div className="grid grid-cols-2 gap-x-3.5 gap-y-1.5">
                    {primaryControls.map((ctrl) => (
                      <ParameterSlider
                        key={ctrl.key}
                        paramKey={ctrl.key}
                        label={ctrl.label}
                        min={ctrl.min}
                        max={ctrl.max}
                        step={ctrl.step}
                        value={ctrl.value}
                        defaultValue={ctrl.defaultValue}
                        isBipolar={ctrl.isBipolar}
                        showPlusSign={ctrl.showPlusSign}
                        decimals={2}
                        onChange={ctrl.onChange}
                        onDragChange={handleControlDragChange}
                      />
                    ))}
                  </div>

                  {/* Tone & Roll-Off Collapsible Micro-Section */}
                  <div className="pt-3 border-t border-white/[0.07]">
                    <button
                      type="button"
                      aria-expanded={isToneRollOffOpen}
                      onClick={() => setIsToneRollOffOpen((v) => !v)}
                      className="w-full flex items-center justify-between gap-2 text-left group cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A1A1AA] group-hover:text-[#F4F4F5] transition-colors duration-150">
                        <span>Tone &amp; Roll-Off</span>
                        <ChevronDown
                          className={`studio-chevron w-3 h-3 text-[#71717A] group-hover:text-[#E4E4E7] ${
                            isToneRollOffOpen ? "rotate-180" : "rotate-0"
                          }`}
                        />
                      </span>
                      <span className="text-[10px] font-mono text-[#A1A1AA]">
                        {activeEngineId === "altair_refresh"
                          ? "32³ Tetrahedral LUT"
                          : activeEngineId === "altair"
                          ? "Filmic 32³ LUT"
                          : activeEngineId === "v3"
                          ? "AgX Roll-Off"
                          : "Standard Knee"}
                      </span>
                    </button>

                    <div
                      className="studio-collapse-grid"
                      data-expanded={isToneRollOffOpen}
                      aria-hidden={!isToneRollOffOpen}
                    >
                      <div className="studio-collapse-inner">
                        <div className="pt-2 space-y-2">
                          <ParameterSlider
                            paramKey="pivot"
                            label="Contrast Pivot"
                            min={0.1}
                            max={0.9}
                            step={0.02}
                            value={gradingParams.pivot ?? DEFAULT_PARAMS.pivot}
                            defaultValue={DEFAULT_PARAMS.pivot}
                            isBipolar={false}
                            decimals={2}
                            onChange={handleParamChange}
                            onDragChange={handleControlDragChange}
                          />

                          <div className="grid grid-cols-2 gap-x-3.5 gap-y-1">
                            <ParameterSlider
                              paramKey="shadowTint"
                              label="Shadow Tint"
                              min={-1.0}
                              max={1.0}
                              step={0.02}
                              value={shadowTintVal}
                              defaultValue={0.0}
                              isBipolar
                              decimals={2}
                              onChange={handleShadowTintChange}
                              onDragChange={handleControlDragChange}
                            />
                            <ParameterSlider
                              paramKey="highlightTint"
                              label="Highlight Tint"
                              min={-1.0}
                              max={1.0}
                              step={0.02}
                              value={highlightTintVal}
                              defaultValue={0.0}
                              isBipolar
                              decimals={2}
                              onChange={handleHighlightTintChange}
                              onDragChange={handleControlDragChange}
                            />
                          </div>

                          {/* Auto-Normalize Target Toggle Row */}
                          <div className="pt-1">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={autoNormalizeTarget}
                              tabIndex={isToneRollOffOpen ? 0 : -1}
                              title={t("engineCard.autoNormalizeTooltip")}
                              onClick={() => handleToggleAutoNormalizeTarget(!autoNormalizeTarget)}
                              className="studio-tactile w-full px-2.5 py-2 rounded-md bg-[#08090A] hover:bg-[#15171C] border border-white/[0.07] flex items-center justify-between gap-2 text-left cursor-pointer"
                            >
                              <div className="min-w-0">
                                <div className="text-[11px] font-medium text-[#E4E4E7] leading-tight">
                                  Auto-Normalize Target
                                </div>
                                <div className="text-[10px] text-[#A1A1AA] truncate mt-0.5">
                                  Pre-balance target exposure &amp; WB before match
                                </div>
                              </div>
                              <span
                                className={`nle-switch relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border ${
                                  autoNormalizeTarget
                                    ? "bg-[#34D399]/25 border-[#34D399]/60"
                                    : "bg-[#15171C] border-white/[0.14]"
                                }`}
                              >
                                <span
                                  className={`inline-block h-3 w-3 rounded-full transition-transform ${
                                    autoNormalizeTarget
                                      ? "translate-x-3 bg-[#34D399]"
                                      : "translate-x-0.5 bg-[#A1A1AA]"
                                  }`}
                                />
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* WHEELS TAB: Borderless 3-Way Color Wheels + Collapsible Master Levels + Collapsible Tone & Roll-Off */}
              {gradingTab === "wheels" && (
                <div key="wheels" className="studio-panel-fade space-y-3">
                  <div className="grid grid-cols-3 gap-1">
                    <ColorWheel
                      title="Lift"
                      rgb={liftRgb}
                      onChange={handleLiftChange}
                      onReset={handleLiftReset}
                      onDragChange={handleControlDragChange}
                    />
                    <ColorWheel
                      title="Gamma"
                      rgb={gammaRgb}
                      onChange={handleGammaChange}
                      onReset={handleGammaReset}
                      onDragChange={handleControlDragChange}
                    />
                    <ColorWheel
                      title="Gain"
                      rgb={gainRgb}
                      onChange={handleGainChange}
                      onReset={handleGainReset}
                      onDragChange={handleControlDragChange}
                    />
                  </div>

                  {/* DaVinci-Style Wheel Master Levels / Offsets (Collapsible) */}
                  <div className="pt-3 border-t border-white/[0.07]">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-expanded={isMasterLevelsOpen}
                        onClick={() => setIsMasterLevelsOpen((v) => !v)}
                        className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A1A1AA] hover:text-[#F4F4F5] transition-colors duration-150 cursor-pointer"
                      >
                        <span>Master Levels / Offset</span>
                        <ChevronDown
                          className={`studio-chevron w-3 h-3 text-[#71717A] ${
                            isMasterLevelsOpen ? "rotate-180" : "rotate-0"
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={handleResetAllWheels}
                        disabled={!isWheelsModified}
                        className={`text-[10px] font-mono transition-colors ${
                          isWheelsModified
                            ? "text-[#A1A1AA] hover:text-[#F4F4F5] cursor-pointer"
                            : "text-[#52525B] cursor-not-allowed"
                        }`}
                      >
                        Reset Wheels
                      </button>
                    </div>

                    <div
                      className="studio-collapse-grid"
                      data-expanded={isMasterLevelsOpen}
                      aria-hidden={!isMasterLevelsOpen}
                    >
                      <div className="studio-collapse-inner">
                        <div className="pt-2 space-y-2">
                          <ParameterSlider
                            paramKey="liftLevel"
                            label="Lift Level"
                            min={-1.0}
                            max={1.0}
                            step={0.02}
                            value={blacksVal}
                            defaultValue={0.0}
                            isBipolar
                            decimals={2}
                            onChange={handleBlacksChange}
                            onDragChange={handleControlDragChange}
                          />
                          <ParameterSlider
                            paramKey="gammaLevel"
                            label="Gamma Level"
                            min={-1.0}
                            max={1.0}
                            step={0.02}
                            value={gammaLevelVal}
                            defaultValue={0.0}
                            isBipolar
                            decimals={2}
                            onChange={handleGammaLevelChange}
                            onDragChange={handleControlDragChange}
                          />
                          <ParameterSlider
                            paramKey="gainLevel"
                            label="Gain Level"
                            min={-1.0}
                            max={1.0}
                            step={0.02}
                            value={whitesVal}
                            defaultValue={0.0}
                            isBipolar
                            decimals={2}
                            onChange={handleWhitesChange}
                            onDragChange={handleControlDragChange}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tone & Roll-Off + Auto-Normalize (Collapsible) */}
                  <div className="pt-3 border-t border-white/[0.07]">
                    <button
                      type="button"
                      aria-expanded={isToneRollOffOpen}
                      onClick={() => setIsToneRollOffOpen((v) => !v)}
                      className="w-full flex items-center justify-between gap-2 text-left group cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A1A1AA] group-hover:text-[#F4F4F5] transition-colors duration-150">
                        <span>Tone &amp; Roll-Off</span>
                        <ChevronDown
                          className={`studio-chevron w-3 h-3 text-[#71717A] group-hover:text-[#E4E4E7] ${
                            isToneRollOffOpen ? "rotate-180" : "rotate-0"
                          }`}
                        />
                      </span>
                      <span className="text-[10px] font-mono text-[#A1A1AA]">
                        {activeEngineId === "altair_refresh"
                          ? "32³ Tetrahedral LUT"
                          : activeEngineId === "altair"
                          ? "Filmic 32³ LUT"
                          : activeEngineId === "v3"
                          ? "AgX Roll-Off"
                          : "Standard Knee"}
                      </span>
                    </button>

                    <div
                      className="studio-collapse-grid"
                      data-expanded={isToneRollOffOpen}
                      aria-hidden={!isToneRollOffOpen}
                    >
                      <div className="studio-collapse-inner">
                        <div className="pt-2 space-y-2">
                          <ParameterSlider
                            paramKey="pivot"
                            label="Contrast Pivot"
                            min={0.1}
                            max={0.9}
                            step={0.02}
                            value={gradingParams.pivot ?? DEFAULT_PARAMS.pivot}
                            defaultValue={DEFAULT_PARAMS.pivot}
                            isBipolar={false}
                            decimals={2}
                            onChange={handleParamChange}
                            onDragChange={handleControlDragChange}
                          />

                          <div className="pt-1">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={autoNormalizeTarget}
                              tabIndex={isToneRollOffOpen ? 0 : -1}
                              title={t("engineCard.autoNormalizeTooltip")}
                              onClick={() => handleToggleAutoNormalizeTarget(!autoNormalizeTarget)}
                              className="studio-tactile w-full px-2.5 py-2 rounded-md bg-[#08090A] hover:bg-[#15171C] border border-white/[0.07] flex items-center justify-between gap-2 text-left cursor-pointer"
                            >
                              <div className="min-w-0">
                                <div className="text-[11px] font-medium text-[#E4E4E7] leading-tight">
                                  Auto-Normalize Target
                                </div>
                                <div className="text-[10px] text-[#A1A1AA] truncate mt-0.5">
                                  Pre-balance target exposure &amp; WB before match
                                </div>
                              </div>
                              <span
                                className={`nle-switch relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border ${
                                  autoNormalizeTarget
                                    ? "bg-[#34D399]/25 border-[#34D399]/60"
                                    : "bg-[#15171C] border-white/[0.14]"
                                }`}
                              >
                                <span
                                  className={`inline-block h-3 w-3 rounded-full transition-transform ${
                                    autoNormalizeTarget
                                      ? "translate-x-3 bg-[#34D399]"
                                      : "translate-x-0.5 bg-[#A1A1AA]"
                                  }`}
                                />
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* HUE 6V TAB: 6-Vector HSL Precision Controls */}
              {gradingTab === "hue6v" && (
                <div key="hue6v" className="studio-panel-fade">
                  <Hue6VPanel
                    hueShift={gradingParams.hueShift || IDENTITY_HUE6}
                    hueSat={gradingParams.hueSat || IDENTITY_HUE6}
                    hueLuma={gradingParams.hueLuma || IDENTITY_HUE6}
                    skinProtect={skinProtect}
                    skinSafe={liveMetrics.skinSafe}
                    onChangeHueVector={handleHue6VChange}
                    onResetHue6V={handleResetHue6V}
                    onResetHueChannel={handleResetHueChannel}
                    onDragChange={handleControlDragChange}
                  />
                </div>
              )}
            </section>
          </div>

          {/* 4. Pinned Bottom Action Bar: Reset + Primary Export CTA */}
          <div className="shrink-0 px-3.5 py-2.5 bg-[#0E0F12] border-t border-white/[0.07] flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetParams}
              title={t("paramsCard.resetTitle")}
              className="flex-1 h-8 rounded-md bg-[#15171C] hover:bg-[#1C1F26] border border-white/[0.08] text-xs font-medium text-[#D4D4D8] hover:text-[#F4F4F5] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#A1A1AA]" />
              <span>Reset</span>
            </button>

            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className="m3-btn-primary-morph flex-[1.5] h-8 rounded-md bg-[#34D399] hover:bg-[#2CC08A] text-[#051B14] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 stroke-[2.25]" />
              <span>Export</span>
            </button>
          </div>
        </aside>
      </div>

      {/* SECONDARY VIEWS (Settings / About / Support) — Rich max-w-7xl Studio Layouts */}
      {activeTab !== "home" && (
        <Suspense fallback={null}>
          <InteractiveStudioBackdrop
            as="main"
            refreshKey={activeTab}
            className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8"
          >
          <div className="min-h-[calc(100vh-44px)] flex flex-col justify-center py-6">
            {/* SETTINGS STUDIO VIEW */}
            {activeTab === "settings" && (
              <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-5 items-stretch studio-view-enter">
                {/* Left Studio Status Column (Top-Aligned & Height-Matched) */}
                <aside className="studio-card-enter studio-stagger-0 m3-panel bg-[#0B0C0F]/72 backdrop-blur-2xl border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_12px_32px_rgba(0,0,0,0.55)] overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Settings className="w-3.5 h-3.5 text-[#A1A1AA]" />
                        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#F4F4F5]">
                          Workstation Status
                        </span>
                      </div>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
                    </div>
                    <div className="p-4 space-y-4 text-xs">
                      <div className="rounded-md bg-[#0B0C0F]/55 border border-white/[0.06] divide-y divide-white/[0.06] font-mono text-[11px]">
                        <div className="p-2.5 flex items-center justify-between gap-2">
                          <span className="text-[#A1A1AA]">Engine</span>
                          <span className="text-[#F4F4F5] font-medium truncate">
                            {activeEngine.name} {activeEngine.versionBadge}
                          </span>
                        </div>
                        <div className="p-2.5 flex items-center justify-between gap-2">
                          <span className="text-[#A1A1AA]">Renderer</span>
                          <span className="text-[#F4F4F5] inline-flex items-center gap-1.5">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                webglPhotoError ? "bg-amber-400" : "bg-[#34D399]"
                              }`}
                            />
                            {webglPhotoError ? "CPU 2D" : "WebGL GPU"}
                          </span>
                        </div>
                        <div className="p-2.5 flex items-center justify-between gap-2">
                          <span className="text-[#A1A1AA]">Calibration</span>
                          <span className="text-[#F4F4F5]">
                            {isCalibrationActive ? "Custom" : "Nominal 1.0x"}
                          </span>
                        </div>
                        <div className="p-2.5 flex items-center justify-between gap-2">
                          <span className="text-[#A1A1AA]">Drift / Ping</span>
                          <span className="text-[#F4F4F5]">
                            ΔE {calibrationStatus.deltaE} · {calibrationStatus.latencyMs}ms
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                        All color-science transforms execute deterministically on local WebGL and Web Worker threads.
                      </p>

                      {/* Pipeline Capabilities Checklist */}
                      <div className="pt-3 border-t border-white/[0.07] space-y-2">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A1A1AA]">
                          Pipeline Capabilities
                        </div>
                        <ul className="rounded-md bg-[#0B0C0F]/55 border border-white/[0.06] divide-y divide-white/[0.06] text-[11px] font-mono">
                          {[
                            "Scene-Linear Rec.709",
                            "3D OKLab + Sliced OT",
                            "GLSL ES 1.00 .kfplug",
                            "65³ Tetrahedral LUT",
                            "Hybrid Cloud Render",
                          ].map((cap) => (
                            <li
                              key={cap}
                              className="px-2.5 py-2 flex items-center justify-between gap-2 text-[#E4E4E7]"
                            >
                              <span className="truncate">{cap}</span>
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#34D399] shrink-0" />
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 border-t border-white/[0.06] bg-[#0B0C0F]/55">
                    <button
                      type="button"
                      onClick={() => setActiveTab("home")}
                      className="w-full py-2 px-3 rounded-md bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-xs font-medium text-[#F4F4F5] transition-colors cursor-pointer"
                    >
                      Return to Workspace
                    </button>
                  </div>
                </aside>

                {/* Right Studio Configuration Grid */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                    {/* Interface & Language Card */}
                    <div className="studio-card-enter studio-stagger-1 m3-panel bg-[#0B0C0F]/72 backdrop-blur-2xl border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_12px_32px_rgba(0,0,0,0.55)] overflow-hidden flex flex-col">
                      <div className="px-4 py-3 border-b border-white/[0.07] flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-[#A1A1AA]" />
                        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#F4F4F5]">
                          Interface &amp; Language
                        </h2>
                      </div>
                      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                        <p className="text-xs text-[#A1A1AA] leading-relaxed">
                          {t("settings.languageDesc")}
                        </p>
                        <div className="space-y-2">
                          {[
                            { code: "en", title: t("settings.langEnglish"), sub: t("settings.langEnglishSub"), badge: "EN" },
                            { code: "id", title: t("settings.langIndonesian"), sub: t("settings.langIndonesianSub"), badge: "ID" },
                          ].map((opt) => {
                            const isSelected = lang === opt.code;
                            return (
                              <button
                                key={opt.code}
                                type="button"
                                onClick={() => handleSwitchLanguage(opt.code)}
                                aria-pressed={isSelected}
                                className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                                  isSelected
                                    ? "bg-white/[0.07] backdrop-blur-md border-[#34D399]/60 text-[#F4F4F5]"
                                    : "bg-[#0B0C0F]/55 hover:bg-white/[0.05] border-white/[0.06] text-[#E4E4E7]"
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-medium truncate">{opt.title}</div>
                                  <div className="text-[11px] text-[#A1A1AA] truncate mt-0.5">{opt.sub}</div>
                                </div>
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/[0.06] text-[#F4F4F5] border border-white/[0.08] shrink-0">
                                  {opt.badge}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Performance & Resolution Card */}
                    <div className="studio-card-enter studio-stagger-2 m3-panel bg-[#0B0C0F]/72 backdrop-blur-2xl border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_12px_32px_rgba(0,0,0,0.55)] overflow-visible relative z-20 flex flex-col">
                      <div className="px-4 py-3 border-b border-white/[0.07] flex items-center gap-2">
                        <Cpu className="w-3.5 h-3.5 text-[#A1A1AA]" />
                        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#F4F4F5]">
                          Performance &amp; Resolution
                        </h2>
                      </div>
                      <div className="p-4 space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-[#F4F4F5] mb-1">
                            {t("settings.refResLabel")}
                          </label>
                          <p className="text-[11px] text-[#A1A1AA] mb-2">{t("settings.refResDesc")}</p>
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
                          <label className="block text-xs font-medium text-[#F4F4F5] mb-1">
                            {t("settings.previewResLabel")}
                          </label>
                          <p className="text-[11px] text-[#A1A1AA] mb-2">{t("settings.previewResDesc")}</p>
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
                  </div>

                  {/* Pipeline Self-Calibration Full-Width Studio Card */}
                  <div className="studio-card-enter studio-stagger-3 m3-panel bg-[#0B0C0F]/72 backdrop-blur-2xl border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_12px_32px_rgba(0,0,0,0.55)] overflow-hidden">
                    {calibScanKey > 0 && calibScanKey !== completedCalibScanKey && (
                      <div key={calibScanKey} aria-hidden="true" className="studio-scanline-overlay">
                        <div
                          className="studio-scanline-sweep"
                          onAnimationEnd={() => setCompletedCalibScanKey(calibScanKey)}
                        />
                      </div>
                    )}
                    <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between gap-2">
                      <div>
                        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#F4F4F5]">
                          Pipeline Self-Calibration
                        </h2>
                        <p className="text-[11px] text-[#A1A1AA] mt-0.5">{t("settings.calSubtitle")}</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetCalibration}
                        className="studio-tactile inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.09] text-[11px] font-medium text-[#D4D4D8] hover:text-[#F4F4F5] border border-white/[0.08] cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{t("settings.resetCal")}</span>
                      </button>
                    </div>

                    <div className="p-4 space-y-4">
                      <div
                        className={`relative overflow-hidden bg-[#0B0C0F]/55 border rounded-md p-3.5 space-y-3 transition-colors duration-200 ${
                          calibrationStatus.running
                            ? "border-amber-400/35"
                            : calibrationJustLocked
                            ? "border-[#34D399]/50"
                            : "border-white/[0.06]"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <div className="text-xs font-medium text-[#F4F4F5]">{t("settings.selfCalTitle")}</div>
                            <p className="text-[11px] text-[#A1A1AA]">{t("settings.selfCalDesc")}</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleRunPipelineCalibration}
                            disabled={calibrationStatus.running}
                            className="studio-tactile inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#F4F4F5] hover:bg-white text-[#08090A] disabled:opacity-70 shrink-0 cursor-pointer"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${calibrationStatus.running ? "animate-spin" : ""}`} />
                            <span>{t("settings.runCalBtn")}</span>
                          </button>
                        </div>

                        {/* Precision Calibration Progress Rail */}
                        <div className="relative h-[2px] w-full rounded-full bg-white/[0.06] overflow-hidden">
                          {calibrationStatus.running && (
                            <div className="studio-calib-beam absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-transparent via-amber-300/90 to-transparent" />
                          )}
                          {!calibrationStatus.running && calibrationJustLocked && (
                            <div className="studio-calib-lock-flash absolute inset-0 bg-[#34D399]" />
                          )}
                        </div>

                        <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                          <div className="flex items-center gap-1.5 text-[#E4E4E7]">
                            {calibrationStatus.running ? (
                              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#34D399] shrink-0" />
                            )}
                            <span>
                              {calibrationStatus.running ? t("settings.calRunningMsg") : t("settings.calOkMsg")}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[#A1A1AA] tabular-nums">
                            <span>ΔE <strong className="text-[#F4F4F5]">{calibrationStatus.deltaE}</strong></span>
                            <span>{calibrationStatus.latencyMs} ms</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-[#0B0C0F]/55 border border-white/[0.06] rounded-md p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <ParameterSlider
                          paramKey="toneScale"
                          label={t("paramLabels.toneScale")}
                          min={0.5}
                          max={1.5}
                          step={0.01}
                          value={calibration.toneScale}
                          defaultValue={1.0}
                          isBipolar
                          showPlusSign={false}
                          valueSuffix="x"
                          onChange={handleCalibrationChange}
                        />
                        <ParameterSlider
                          paramKey="wbScale"
                          label={t("paramLabels.wbScale")}
                          min={0.5}
                          max={1.5}
                          step={0.01}
                          value={calibration.wbScale}
                          defaultValue={1.0}
                          isBipolar
                          showPlusSign={false}
                          valueSuffix="x"
                          onChange={handleCalibrationChange}
                        />
                        <ParameterSlider
                          paramKey="chromaScale"
                          label={t("paramLabels.chromaScale")}
                          min={0.5}
                          max={1.5}
                          step={0.01}
                          value={calibration.chromaScale}
                          defaultValue={1.0}
                          isBipolar
                          showPlusSign={false}
                          valueSuffix="x"
                          onChange={handleCalibrationChange}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Studio Keyboard Shortcuts Reference Card */}
                  <div className="studio-card-enter studio-stagger-4 m3-panel bg-[#0B0C0F]/72 backdrop-blur-2xl border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_12px_32px_rgba(0,0,0,0.55)] overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Keyboard className="w-3.5 h-3.5 text-[#A1A1AA]" />
                        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#F4F4F5]">
                          Studio Keyboard Shortcuts
                        </h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsShortcutsOpen(true)}
                        className="text-[10px] font-mono text-[#A1A1AA] hover:text-[#F4F4F5] transition-colors cursor-pointer"
                      >
                        Full Reference (?)
                      </button>
                    </div>
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {[
                        { keys: "Space", desc: "Play / Pause Video" },
                        { keys: "\\", desc: "Hold Before Peek" },
                        { keys: "[ / ]", desc: "Collapse Inspectors" },
                        { keys: "1 / 2 / 3", desc: "Switch Engine" },
                        { keys: "Ctrl+V", desc: "Paste Image" },
                        { keys: "Ctrl+K", desc: "Command Palette" },
                      ].map((sc) => (
                        <div
                          key={sc.keys}
                          className="px-3 py-2 rounded-md bg-[#0B0C0F]/55 border border-white/[0.06] flex items-center justify-between gap-2"
                        >
                          <span className="text-[11px] text-[#D4D4D8] truncate">{sc.desc}</span>
                          <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-[10px] font-mono text-[#F4F4F5] shrink-0">
                            {sc.keys}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ABOUT STUDIO VIEW */}
            {activeTab === "about" && (
              <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-5 items-stretch studio-view-enter">
                {/* Left Hero Identity Column (Height-Matched with Right Column) */}
                <aside className="studio-card-enter studio-stagger-0 m3-panel bg-[#0B0C0F]/72 backdrop-blur-2xl border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_12px_32px_rgba(0,0,0,0.55)] p-5 flex flex-col justify-between gap-4">
                  <div className="space-y-4">
                    <div className="space-y-3 border-b border-white/[0.07] pb-4">
                      <div className="flex items-center gap-3">
                        <BrandLogo size={38} />
                        <div className="min-w-0">
                          <h2 className="text-sm font-semibold text-[#F4F4F5] leading-tight">
                            Color Match for Keyflow
                          </h2>
                          <span className="inline-block mt-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-[#E4E4E7] border border-white/[0.08]">
                            v0.9.6a
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-[#A1A1AA] leading-relaxed">
                        {t("about.subtitle")}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setIsReleaseKitOpen(true)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-[#F4F4F5] cursor-pointer transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-[#34D399]" />
                        <span>{t("about.releasePosterBtn")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleReplayIntro}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-[#0B0C0F]/55 hover:bg-white/[0.06] border border-white/[0.06] text-xs font-medium text-[#E4E4E7] cursor-pointer transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 text-[#A1A1AA]" />
                        <span>{t("about.replayIntroBtn")}</span>
                      </button>
                    </div>

                    {/* Cross-Platform Parity Pill List */}
                    <div className="pt-3 border-t border-white/[0.07] space-y-2">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A1A1AA]">
                        Cross-Platform Parity
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: "Web Studio", active: true },
                          { label: "Keyflow .kfplug", active: true },
                          { label: "After Effects .ffx / Native v1.0", active: false },
                        ].map((pill) => (
                          <span
                            key={pill.label}
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono border ${
                              pill.active
                                ? "bg-white/[0.06] border-white/[0.09] text-[#F4F4F5]"
                                : "bg-[#0B0C0F]/55 border-white/[0.06] text-[#D4D4D8]"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                pill.active ? "bg-[#34D399]" : "bg-[#A1A1AA]"
                              }`}
                            />
                            <span>{pill.label}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Privacy Guarantee Badge */}
                    <div className="rounded-md bg-[#0B0C0F]/55 border border-white/[0.06] p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#F4F4F5]">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#34D399] shrink-0" />
                        <span>{t("about.privacyTitle")}</span>
                      </div>
                      <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                        {t("about.privacyDesc")}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/[0.07] flex justify-center">
                    <button
                      type="button"
                      onClick={() => setActiveTab("support")}
                      className="cursor-pointer opacity-90 hover:opacity-100 transition-opacity"
                    >
                      <TfbagasWordmark compact />
                    </button>
                  </div>
                </aside>

                {/* Right Architecture Bento + 3-Tier Engine Matrix + Changelog Column */}
                <div className="space-y-4">
                  {/* Engine & Format Architecture 3-Card Bento Grid */}
                  <div className="studio-card-enter studio-stagger-1 m3-panel bg-[#0B0C0F]/72 backdrop-blur-2xl border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_12px_32px_rgba(0,0,0,0.55)] overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#F4F4F5]">
                        Engine &amp; Format Architecture
                      </h3>
                      <span className="text-[10px] font-mono text-[#A1A1AA]">
                        1:1 Deterministic Pipeline
                      </span>
                    </div>
                    <div className="p-4 space-y-4">
                      <p className="text-xs text-[#A1A1AA] leading-relaxed">
                        {t("about.heroParagraph1")}{" "}
                        <code className="text-[#F4F4F5] font-mono bg-white/[0.06] px-1.5 py-0.5 rounded border border-white/[0.08]">
                          .kfplug
                        </code>{" "}
                        {t("about.heroParagraph2")}
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="rounded-md bg-[#0B0C0F]/55 border border-white/[0.06] p-3.5 space-y-1.5">
                          <div className="text-[10px] font-mono text-[#34D399]">01 · SOLVER</div>
                          <div className="text-xs font-semibold text-[#F4F4F5]">Altair 4.0 ULTRA</div>
                          <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                            Scene-linear Rec.709 + 16-direction 3D OKLab Optimal Transport, 5-zone tonal curve, and skin-tone cluster lock.
                          </p>
                        </div>
                        <div className="rounded-md bg-[#0B0C0F]/55 border border-white/[0.06] p-3.5 space-y-1.5">
                          <div className="text-[10px] font-mono text-[#A1A1AA]">02 · EXPORTERS</div>
                          <div className="text-xs font-semibold text-[#F4F4F5]">.kfplug Native Shader</div>
                          <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                            Pure GLSL ES 1.00 shaders with 1:1 parity across WebGL preview, Keyflow Mobile, 33³/65³ .cube LUTs, and AE .ffx.
                          </p>
                        </div>
                        <div className="rounded-md bg-[#0B0C0F]/55 border border-white/[0.06] p-3.5 space-y-1.5">
                          <div className="text-[10px] font-mono text-[#A1A1AA]">03 · LOG &amp; RENDER</div>
                          <div className="text-xs font-semibold text-[#F4F4F5]">Camera Log &amp; Cloud</div>
                          <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                            Mathematical S-Log3, C-Log3, D-Log M &amp; Apple Log linearization plus Local WebCodecs &amp; Kaggle Turbo FFmpeg.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3-Tier Engine Comparison Matrix */}
                  <div className="studio-card-enter studio-stagger-2 m3-panel bg-[#0B0C0F]/72 backdrop-blur-2xl border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_12px_32px_rgba(0,0,0,0.55)] overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Layers className="w-3.5 h-3.5 text-[#A1A1AA]" />
                        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#F4F4F5]">
                          3-Tier Engine Comparison Matrix
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono text-[#A1A1AA]">
                        Sirius · Polaris · Altair
                      </span>
                    </div>
                    <div className="p-4 overflow-x-auto">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="border-b border-white/[0.07] text-[10px] font-mono uppercase tracking-[0.06em] text-[#A1A1AA]">
                            <th className="pb-2 pr-3 font-medium">Engine</th>
                            <th className="pb-2 pr-3 font-medium">Color Space</th>
                            <th className="pb-2 pr-3 font-medium">Speed</th>
                            <th className="pb-2 font-medium">Best Use Case</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                          {[
                            {
                              id: "v2",
                              name: "Sirius 2.5",
                              space: "Rec.709 + CIE Lab",
                              speed: "Ultra-Fast (<25ms)",
                              useCase: "Instant mobile drafts & lightweight look transfer",
                            },
                            {
                              id: "v3",
                              name: "Polaris 3.5 PRO",
                              space: "3D OKLab + AgX Roll-Off",
                              speed: "Fast (~60ms)",
                              useCase: "Balanced cinema matching with smooth highlight knee",
                            },
                            {
                              id: "altair",
                              name: "Altair 4.0 ULTRA",
                              space: "Scene-Linear + 16-Dir Sliced OT",
                              speed: "Precision · ~12ms (Sample-First)",
                              useCase: "Reference-grade color matching & skin-tone cluster lock",
                            },
                          ].map((row) => {
                            const isCurrent = activeEngineId === row.id;
                            return (
                              <tr
                                key={row.id}
                                className={isCurrent ? "bg-white/[0.04]" : ""}
                              >
                                <td className="py-2.5 pr-3 font-medium text-[#F4F4F5] whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1.5">
                                    {isCurrent && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
                                    )}
                                    <span>{row.name}</span>
                                  </span>
                                </td>
                                <td className="py-2.5 pr-3 font-mono text-[#D4D4D8] whitespace-nowrap">
                                  {row.space}
                                </td>
                                <td className="py-2.5 pr-3 font-mono text-[#A1A1AA] whitespace-nowrap">
                                  {row.speed}
                                </td>
                                <td className="py-2.5 text-[#A1A1AA]">
                                  {row.useCase}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Release History / Changelog Timeline */}
                  <div className="studio-card-enter studio-stagger-3 m3-panel bg-[#0B0C0F]/72 backdrop-blur-2xl border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_12px_32px_rgba(0,0,0,0.55)] overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <History className="w-3.5 h-3.5 text-[#A1A1AA]" />
                        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#F4F4F5]">
                          {t("about.changelogTitle")}
                        </h3>
                      </div>
                      <span className="text-[11px] font-mono text-[#A1A1AA]">v0.5.0 – v0.9.6a</span>
                    </div>
                    <div className="p-4">
                      <div className="max-h-[250px] overflow-y-auto pr-2 space-y-3">
                        <div className="rounded-md bg-[#0B0C0F]/55 border border-white/[0.06] p-3.5 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-[#F4F4F5]">v0.9.6a</span>
                            <span className="text-[10px] font-mono text-[#34D399]">
                              {t("about.preReleasePolish")}
                            </span>
                          </div>
                          <ul className="text-xs text-[#A1A1AA] space-y-1 list-disc pl-4">
                            {(dict?.about?.v095Items || []).map((item, idx) => (
                              <li key={idx}>
                                <span className="text-[#F4F4F5] font-medium">{item.bold}</span> {item.text}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <Suspense fallback={null}>
                          <ReleaseHistoryAccordion />
                        </Suspense>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SUPPORT STUDIO VIEW */}
            {activeTab === "support" && (
              <div className="studio-view-enter w-full">
                <Suspense fallback={null}>
                  <SupportTab />
                </Suspense>
              </div>
            )}
          </div>
          </InteractiveStudioBackdrop>
        </Suspense>
      )}
      </>
      )}

      {/* UNIFIED MULTI-FORMAT EXPORT MODAL */}
      {hasExportModalMounted && (
        <Suspense fallback={null}>
          <ExportModal
            isOpen={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
            presetName={presetName}
            setPresetName={setPresetName}
            authorName={authorName}
            setAuthorName={setAuthorName}
            description={description}
            setDescription={setDescription}
            onExportKfplug={handleExport}
            onExportFfx={handleExportFfx}
            onExportCube={handleExportCube}
            onExportLut={handleExportLut3d}
            onExportZipPack={handleExportZipPack}
            onOpenShare={() => setIsShareOpen(true)}
            isExportingPreset={isExporting}
            hasLook={hasLook}
            isCalibrationActive={isCalibrationActive}
            onOpenCalibration={handleOpenCalibration}
            fallbackName={referenceImage?.baseName || importedLook?.name || "Custom Look"}
            isNeutralGrade={isNeutralGrade}
            hasPreviewMedia={hasPreviewImage}
            isVideo={Boolean(videoEl)}
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
            nativeWidth={targetImage?.width || referenceImage?.width || 0}
            nativeHeight={targetImage?.height || referenceImage?.height || 0}
            targetBaseName={targetImage?.baseName || referenceImage?.baseName || "Target"}
            engineId={activeEngineId}
            splitPos={exportSplitPos}
            params={effectiveParams}
            logProfile={simulateLogInput}
            matchStrength={matchStrength}
          />
        </Suspense>
      )}

      {/* MODALS & DRAWERS */}
      {hasChangelogMounted && (
        <Suspense fallback={null}>
          <ChangelogModal
            open={isChangelogOpen}
            onClose={() => setIsChangelogOpen(false)}
            onViewFullHistory={() => setActiveTab("about")}
          />
        </Suspense>
      )}

      {hasShortcutsMounted && (
        <Suspense fallback={null}>
          <ShortcutsModal
            isOpen={isShortcutsOpen}
            onClose={() => setIsShortcutsOpen(false)}
          />
        </Suspense>
      )}

      {hasLooksMounted && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {hasShareMounted && (
        <Suspense fallback={null}>
          <ShareModal
            isOpen={isShareOpen}
            onClose={() => setIsShareOpen(false)}
            engineId={activeEngineId}
            logProfile={simulateLogInput}
            matchStrength={matchStrength}
            params={effectiveParams}
            onShareFile={handleShare}
            canShareFile={
              typeof navigator !== "undefined" &&
              typeof navigator.share === "function" &&
              typeof navigator.canShare === "function"
            }
          />
        </Suspense>
      )}

      {hasReleaseKitMounted && (
        <Suspense fallback={null}>
          <ReleaseMediaKitModal
            isOpen={isReleaseKitOpen}
            onClose={() => setIsReleaseKitOpen(false)}
          />
        </Suspense>
      )}

      {hasCommandPaletteMounted && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {/* Minimalist Status Toast (top-center below header so it never overlaps telemetry strip) */}
      {mobileToastPresence.isMounted && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div
            data-state={mobileToastPresence.state}
            className="studio-toast-top px-3 py-1.5 rounded-full bg-[#15171C]/96 backdrop-blur-md border border-white/[0.12] text-[11px] font-mono text-[#F4F4F5] flex items-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_24px_rgba(0,0,0,0.65)]"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
            <span>{mobileToast || lastMobileToast}</span>
          </div>
        </div>
      )}

      <SupportToast
        visible={exportToast.visible}
        filename={exportToast.filename}
        onClose={() => setExportToast({ visible: false, filename: "" })}
      />
    </div>
  );
}
