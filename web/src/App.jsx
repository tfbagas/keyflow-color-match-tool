import React, { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import {
  Settings,
  RotateCcw,
  Cpu,
  CheckCircle2,
  RefreshCw,
  Check,
  Play,
  HelpCircle,
  Undo2,
  Redo2,
  Bookmark,
  Share2,
  Search,
  X,
  Download,
  Upload,
  Image as ImageIcon,
  QrCode,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Layers,
  ChevronDown,
  Activity,
  Sliders,
  Package,
  Film,
  AlertCircle,
  FileCog,
  ArrowRight,
  ArrowUpRight,
  MoreHorizontal,
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
import IntroScreen from "./components/IntroScreen";
import VideoTransportBar from "./components/VideoTransportBar";
import LiquidGlassTabBar from "./components/LiquidGlassTabBar";
import LiquidGlassSlider from "./components/LiquidGlassSlider";
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
const HowToUseModal = lazy(() => import("./components/HowToUseModal"));
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
  stepIndex = "",
  subtitle = "",
  sampleLabel = "Sample",
  tapToLoadLabel = "Tap to load",
  replaceLabel = "Replace",
  clearLabel = "Clear",
  imageInfo,
  onSelect,
  onClear,
  onTrySample,
  allowPresets = false,
  importedLook = null,
  onClearImportedLook,
  onOpenLooks = null,
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
        className={`relative w-full h-[116px] md:h-[104px] rounded-2xl md:rounded-lg overflow-hidden transition-all select-none ${
          isDragging
            ? "ring-1 ring-[#38BDF8]/75 bg-[#131D2D]"
            : imageInfo || importedLook
            ? "bg-[#0E131D] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] border border-white/[0.08] md:border-[#AAB7C5]/18 md:bg-[#0A0C10]"
            : "bg-[#0E131D] border border-dashed border-white/16 md:border-[#AAB7C5]/22 md:bg-[#07090D] hover:border-[#38BDF8]/55 md:hover:border-[#4A6B86]/60"
        }`}
      >
        {/* Primary Tile Trigger Button (Tapping active Reference preset opens Looks Library to swap looks) */}
        <button
          type="button"
          onClick={() => {
            if (importedLook && onOpenLooks) {
              onOpenLooks();
            } else {
              inputRef.current?.click();
            }
          }}
          aria-label={
            importedLook && onOpenLooks
              ? `${label}: ${importedLook.name}. Tap to browse Looks Library`
              : `${label}: ${subtitle || tapToLoadLabel}`
          }
          className="relative w-full h-full block text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#38BDF8]"
        >
          {imageInfo ? (
            <>
              <img
                src={imageInfo.thumbUrl || imageInfo.dataUrl}
                alt={label}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-x-0 top-0 p-2 pr-[70px] flex items-start justify-between gap-1 bg-gradient-to-b from-[#090B10]/80 via-[#090B10]/35 to-transparent pointer-events-none">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full md:rounded bg-[#090B10]/72 backdrop-blur-md border border-white/12 text-[9px] font-sans font-semibold uppercase tracking-[0.03em] text-[#F8FAFC] truncate">
                  {stepIndex && (
                    <span className="font-mono tabular-nums text-[#38BDF8] md:text-[#93B8D8]">
                      {stepIndex}
                    </span>
                  )}
                  {(imageInfo.kind === "video" || imageInfo.sourceKind === "video") && (
                    <Film className="w-2.5 h-2.5 text-[#38BDF8]" />
                  )}
                  <span className="truncate">{label}</span>
                </span>
              </div>

              <div
                data-testid={`mobile-tile-footer-${stepIndex || "media"}`}
                className="absolute inset-x-0 bottom-0 px-2.5 py-2 bg-gradient-to-t from-[#090B10]/92 via-[#090B10]/62 to-transparent flex items-center justify-between gap-2 pointer-events-none"
              >
                <span className="min-w-0 flex-1 text-[11px] font-sans font-medium text-[#F8FAFC] truncate">
                  {imageInfo.name}
                </span>
                {imageInfo.formatBadge && (
                  <span className="shrink-0 text-[8.5px] font-mono uppercase tracking-[0.04em] px-1.5 py-0.5 rounded-md bg-[#090B10]/75 border border-white/12 text-[#CBD5E1]">
                    {imageInfo.formatBadge}
                  </span>
                )}
              </div>
            </>
          ) : importedLook ? (
            (() => {
              const presetSwatches =
                Array.isArray(importedLook.swatches) && importedLook.swatches.length >= 2
                  ? importedLook.swatches
                  : ["#1B3440", "#3F6268", "#A37E5B", "#D9A46E", "#F2DFC2"];
              const s0 = presetSwatches[0] || "#1B2A30";
              const s1 = presetSwatches[1] || "#3F5A5C";
              const s2 = presetSwatches[Math.floor(presetSwatches.length / 2)] || "#8A7A62";
              const s3 = presetSwatches[presetSwatches.length - 2] || "#D2A878";
              const s4 = presetSwatches[presetSwatches.length - 1] || "#F3E3C6";
              const formatBadge =
                importedLook.kind === "cube"
                  ? "CUBE"
                  : importedLook.kind === "lut"
                  ? "LUT"
                  : importedLook.kind === "kfplug"
                  ? "KFPLUG"
                  : importedLook.kind === "ffx"
                  ? "FFX"
                  : "PRESET";

              return (
                <div
                  data-testid="mobile-reference-preset-card"
                  className="relative w-full h-full flex flex-col justify-between overflow-hidden bg-[#0E131D] md:bg-[#11161F]"
                >
                  {/* Alive Mesh / Aurora Tonal Gradient Derived Directly from Active Preset / LUT Colors */}
                  <div
                    data-testid="mobile-reference-aurora"
                    aria-hidden="true"
                    className="md:hidden pointer-events-none absolute inset-0"
                    style={{
                      background: `
                        radial-gradient(125% 110% at 12% 14%, ${s1} 0%, transparent 62%),
                        radial-gradient(115% 105% at 88% 22%, ${s4}CC 0%, transparent 58%),
                        radial-gradient(120% 100% at 62% 92%, ${s3}DD 0%, transparent 64%),
                        linear-gradient(135deg, ${s0} 0%, ${s2} 52%, ${s3} 100%)
                      `,
                    }}
                  />
                  {/* Soft depth vignette for legible white typography */}
                  <div
                    aria-hidden="true"
                    className="md:hidden pointer-events-none absolute inset-0 bg-gradient-to-b from-[#090B10]/30 via-[#090B10]/10 to-[#090B10]/80"
                  />

                  {/* Top-left step badge matching Target with cyan 02 index */}
                  <div className="relative z-10 p-2 pr-[70px] flex items-start justify-between gap-1 pointer-events-none">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full md:rounded bg-[#090B10]/72 backdrop-blur-md border border-white/12 text-[9px] font-sans font-semibold uppercase tracking-[0.03em] text-[#F8FAFC] truncate">
                      {stepIndex && (
                        <span className="font-mono tabular-nums text-[#38BDF8] md:text-[#93B8D8]">
                          {stepIndex}
                        </span>
                      )}
                      <span className="truncate">{label}</span>
                    </span>
                  </div>

                  {/* Bottom: Clean Truncated Look Name & Sky-Cyan Format Badge */}
                  <div className="relative z-10 px-2.5 py-2 pointer-events-none">
                    <div
                      data-testid={`mobile-tile-footer-${stepIndex || "preset"}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0 flex-1 text-[11px] font-sans font-semibold text-[#F8FAFC] drop-shadow-[0_1px_4px_rgba(0,0,0,0.65)] truncate">
                        {importedLook.name}
                      </span>
                      <span className="shrink-0 text-[8.5px] font-mono uppercase tracking-[0.04em] px-1.5 py-0.5 rounded-md bg-[#090B10]/75 border border-[#38BDF8]/35 text-[#7DD3FC]">
                        {formatBadge}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="w-full h-full p-2.5 md:p-3 flex flex-col justify-between">
              <div className="pr-[72px] min-w-0">
                <div className="flex items-center gap-1 min-w-0">
                  {stepIndex && (
                    <span className="text-[9.5px] font-mono tabular-nums font-semibold text-[#38BDF8] md:text-[#93B8D8] shrink-0">
                      {stepIndex}
                    </span>
                  )}
                  <span className="text-[9.5px] font-sans font-semibold uppercase tracking-[0.04em] md:tracking-[0.06em] text-[#F8FAFC] truncate">
                    {label}
                  </span>
                </div>
                {subtitle && (
                  <div className="text-[10px] font-sans text-[#94A3B8] md:text-[#AAB7C5] leading-tight truncate mt-0.5">
                    {subtitle}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-left">
                <div className="w-7 h-7 rounded-lg bg-[#131A26] md:bg-[#11161F] border border-white/10 md:border-[#AAB7C5]/14 flex items-center justify-center shrink-0">
                  <Upload className="w-3.5 h-3.5 text-[#7DD3FC] md:text-[#AAB7C5]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-sans font-medium text-[#F8FAFC] leading-tight truncate">
                    {tapToLoadLabel}
                  </div>
                  <div className="text-[9.5px] font-mono text-[#94A3B8] md:text-[#AAB7C5] truncate mt-0.5">
                    {allowPresets ? "Photo · .cube · .lut" : "Photo · Video · RAW"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </button>

        {/* Sibling Overlay Action Controls (Mirrored Replace + Clear on both Target and active Reference) */}
        {imageInfo ? (
          <div className="absolute top-0 right-0 z-10 flex items-center">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              title={`${replaceLabel} ${label}`}
              aria-label={`${replaceLabel} ${label}`}
              className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center cursor-pointer group"
            >
              <span className="w-7 h-7 rounded-full md:rounded-md bg-black/55 md:bg-[#0A0C10]/85 backdrop-blur-md border border-white/15 md:border-[#AAB7C5]/22 text-[#E4E4E7] group-hover:text-white inline-flex items-center justify-center">
                <RefreshCw className={`w-3 h-3 ${isAnalyzing ? "animate-spin" : ""}`} />
              </span>
            </button>
            <button
              type="button"
              onClick={() => onClear?.()}
              title={`${clearLabel} ${label}`}
              aria-label={`${clearLabel} ${label}`}
              className="min-w-[44px] min-h-[44px] -ml-1.5 inline-flex items-center justify-center cursor-pointer group"
            >
              <span className="w-7 h-7 rounded-full md:rounded-md bg-black/55 md:bg-[#0A0C10]/85 backdrop-blur-md border border-white/15 md:border-[#AAB7C5]/22 text-[#E4E4E7] group-hover:text-red-400 inline-flex items-center justify-center">
                <X className="w-3 h-3" />
              </span>
            </button>
          </div>
        ) : importedLook ? (
          <div className="absolute top-0 right-0 z-10 flex items-center">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              title={`${replaceLabel} ${label}`}
              aria-label={`${replaceLabel} ${label}`}
              className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center cursor-pointer group"
            >
              <span className="w-7 h-7 rounded-full md:rounded-md bg-black/55 md:bg-[#0A0C10]/85 backdrop-blur-md border border-white/15 md:border-[#AAB7C5]/22 text-[#E4E4E7] group-hover:text-white inline-flex items-center justify-center">
                <RefreshCw className={`w-3 h-3 ${isAnalyzing ? "animate-spin" : ""}`} />
              </span>
            </button>
            <button
              type="button"
              onClick={() => onClearImportedLook?.()}
              aria-label={`${clearLabel} preset`}
              className="min-w-[44px] min-h-[44px] -ml-1.5 inline-flex items-center justify-center cursor-pointer group"
            >
              <span className="w-7 h-7 rounded-full md:rounded-md bg-black/55 md:bg-[#0A0C10]/85 backdrop-blur-md border border-white/15 md:border-[#AAB7C5]/22 text-[#E4E4E7] group-hover:text-red-400 inline-flex items-center justify-center">
                <X className="w-3 h-3" />
              </span>
            </button>
          </div>
        ) : (
          onTrySample && (
            <div className="absolute top-0 right-0 z-10 flex items-center">
              <button
                type="button"
                onClick={() => onTrySample()}
                className="min-h-[44px] px-2 inline-flex items-center justify-center cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] rounded-xl"
              >
                <span className="px-2 py-0.5 rounded-full md:rounded bg-[#131A26] md:bg-[#11161F] group-hover:bg-[#1B2536] md:group-hover:bg-[#1C2430] border border-white/12 md:border-[#AAB7C5]/18 text-[9.5px] md:text-[10px] font-sans font-medium text-[#F8FAFC] md:text-[#C9D7E2] inline-flex items-center gap-1">
                  <ImageIcon className="w-2.5 h-2.5 text-[#38BDF8] md:text-[#93B8D8]" />
                  <span>{sampleLabel}</span>
                </span>
              </button>
            </div>
          )
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
  const secondaryScrollRef = useRef(null);

  useEffect(() => {
    if (activeTab === "home") return;
    const scroller = secondaryScrollRef.current;
    if (scroller) {
      scroller.scrollTo({ top: 0, behavior: "auto" });
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [activeTab]);
  const [gradingTab, setGradingTab] = useState("primary"); // "primary" | "wheels" | "hue6v"
  const [mobileDeckTab, setMobileDeckTab] = useState("match"); // "match" | "adjust" | "scopes" | "export"
  const [mobileCubeSize, setMobileCubeSize] = useState(33);
  const [mobilePromoAspect, setMobilePromoAspect] = useState("16:9");
  const [mobileExportedKey, setMobileExportedKey] = useState(null);
  const [mobileShowRefSamples, setMobileShowRefSamples] = useState(false);
  const [mobileCopiedHex, setMobileCopiedHex] = useState("");
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);
  const [isMobileInputProfileOpen, setIsMobileInputProfileOpen] = useState(false);
  const [isMobilePaletteOpen, setIsMobilePaletteOpen] = useState(false);
  const [isMobileEngineExtrasOpen, setIsMobileEngineExtrasOpen] = useState(false);
  const [mobileShareFormat, setMobileShareFormat] = useState("kfplug"); // "kfplug" | "cube" | "image"
  const [isMobileSharingFile, setIsMobileSharingFile] = useState(false);
  const mobileMoreRef = useRef(null);
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
  const [isToneRollOffOpen, setIsToneRollOffOpen] = useState(false);
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
  const [isGuideOpen, setIsGuideOpen] = useState(false);
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
  const [exportToast, setExportToast] = useState({
    visible: false,
    filename: "",
    formatBadge: "",
  });
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
      const imgRes = await exportGradedImage({
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
      setExportToast({
        visible: true,
        filename: imgRes?.fileName || `${baseName}-${layout}.${format}`,
        formatBadge: layout === "promo" ? "PROMO PNG" : `.${format.toLowerCase()}`,
      });
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
        setExportToast({
          visible: true,
          filename: res.fileName || "ToneBench_Video.mp4",
          formatBadge: ".mp4",
        });
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
      if (showSplash) return;
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
        handleEngineChange("altair_refresh");
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "2") {
        handleEngineChange("altair");
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "3") {
        handleEngineChange("v3");
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
  }, [showSplash, handleEngineChange, handleRedo, handleUndo, videoEl]);

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
  const canExportGrade = Boolean(hasLook || targetImage || !isNeutralGrade);

  const handleExportLut = useCallback(
    async (ext, size = 32) => {
      if (!canExportGrade) return false;
      try {
        const { generateLutFile } = await import("./utils/lutExporter");
        const defaultBase =
          activeEngineId === "altair_refresh" && !presetName
            ? "Keyflow_Altair_Refresh"
            : withEngineSuffix(
                presetName || referenceImage?.baseName || importedLook?.name || targetImage?.baseName || "Custom Look",
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
        setExportToast({
          visible: true,
          filename: fileName,
          formatBadge: `.${ext} · ${size}³`,
        });
        return true;
      } catch {
        setStatusText("Export Error");
        return false;
      }
    },
    [
      canExportGrade,
      presetName,
      referenceImage,
      importedLook,
      targetImage,
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
    if (!canExportGrade) return false;
    setIsExporting(true);
    setStatusText("Exporting .ffx...");
    try {
      const calibratedParams = applyCalibrationToParams(effectiveParams, calibration);
      const rawName = withEngineSuffix(
        presetName || referenceImage?.baseName || importedLook?.name || targetImage?.baseName || "Custom Look",
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
      setExportToast({ visible: true, filename: fileName, formatBadge: ".ffx" });
      return true;
    } catch {
      setStatusText("Export Error");
      return false;
    } finally {
      setIsExporting(false);
    }
  }, [
    canExportGrade,
    effectiveParams,
    calibration,
    presetName,
    referenceImage,
    importedLook,
    targetImage,
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
    if (!canExportGrade) return false;
    setIsExporting(true);
    setStatusText("Exporting...");
    try {
      const calibratedParams = applyCalibrationToParams(effectiveParams, calibration);
      const rawName = withEngineSuffix(
        presetName || referenceImage?.baseName || importedLook?.name || targetImage?.baseName || "Custom Look",
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
        matchStrength / 100,
        { skinProtect: skinProtect / 100 }
      );
      downloadBlob(blob, fileName);
      setStatusText("Exported!");
      showMobileToast(t("toasts.exportedFile", { file: fileName }));
      setExportToast({ visible: true, filename: fileName, formatBadge: ".kfplug" });
      return true;
    } catch {
      setStatusText("Export Error");
      return false;
    } finally {
      setIsExporting(false);
    }
  }, [
    canExportGrade,
    effectiveParams,
    calibration,
    presetName,
    referenceImage,
    importedLook,
    targetImage,
    activeEngineId,
    authorName,
    description,
    simulateLogInput,
    activeLut,
    matchStrength,
    skinProtect,
    showMobileToast,
    t,
  ]);

  const handleExportZipPack = useCallback(
    async (cubeSize = 32) => {
      if (!canExportGrade || isExporting) return false;
      setIsExporting(true);
      setStatusText("Packaging .zip...");
      try {
        const calibratedParams = applyCalibrationToParams(effectiveParams, calibration);
        const rawBase =
          presetName || referenceImage?.baseName || importedLook?.name || targetImage?.baseName || "Custom Look";
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
            matchStrength / 100,
            { skinProtect: skinProtect / 100 }
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
        setExportToast({ visible: true, filename: zipName, formatBadge: "PACK .zip" });
        return true;
      } catch {
        setStatusText("Export Error");
        return false;
      } finally {
        setIsExporting(false);
      }
    },
    [
      canExportGrade,
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
      skinProtect,
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
      // Drop any baked LUT so the look drives the live parametric pipeline.
      activeLutRef.current = null;
      setActiveLut(null);
      glPreviewRef.current?.setActiveLut?.(null);
      // Switch solver engine to the preset's calibrated engine (legacy ids resolve safely).
      const nextEngineId = resolveEngineId(look.engineId || look.engine);
      activeEngineIdRef.current = nextEngineId;
      setActiveEngineId(nextEngineId);
      if (look.logProfile) setSimulateLogInput(resolveLogProfileId(look.logProfile));
      if (typeof look.matchStrength === "number") {
        const maxStrength = getEngine(nextEngineId).usesLut32 ? 100 : 150;
        const nextStrength = clamp(Math.round(look.matchStrength), 0, maxStrength);
        liveStrengthRef.current = nextStrength;
        setMatchStrength(nextStrength);
        glPreviewRef.current?.setLutMix?.(nextStrength / 100);
      }
      if (typeof look.sigma === "number") {
        const nextSigma = clamp(Math.round(look.sigma), 0, 100);
        styleSigmaRef.current = nextSigma;
        setStyleSigma(nextSigma);
      }
      if (typeof look.skinProtect === "number") {
        const nextSkin = clamp(Math.round(look.skinProtect), 0, 100);
        liveSkinProtectRef.current = nextSkin;
        setSkinProtect(nextSkin);
      }
      const nextParams = { ...DEFAULT_PARAMS, ...look.params };
      liveParamsRef.current = nextParams;
      setGradingParams(nextParams);
      setPresetName(look.name || "Custom Look");
      setImportedLook({
        name: look.name || "Custom Look",
        source: "looks-drawer",
        swatches:
          Array.isArray(look.swatches) && look.swatches.length >= 2 ? look.swatches : null,
      });
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

  const handleLoadLocalSamplePhoto = useCallback(
    async ({
      sampleUrl = "/samples/sample-portrait.webp",
      sampleFileName = "Sample_Studio_Portrait.webp",
      lookId = "kodak-2383-print",
      forceLook = false,
    } = {}) => {
      try {
        const res = await fetch(sampleUrl);
        if (!res.ok) throw new Error(`Sample fetch failed (${res.status})`);
        const blob = await res.blob();
        const file = new File([blob], sampleFileName, {
          type: blob.type || "image/webp",
        });
        await loadImageFile(file, "target");

        const shouldApplyLook =
          forceLook || (!referenceImage && !importedLook);
        if (shouldApplyLook && lookId) {
          const { BUILT_IN_LOOKS } = await import("./utils/builtInLooks");
          const matchedLook =
            BUILT_IN_LOOKS.find((l) => l.id === lookId) || BUILT_IN_LOOKS[0];
          if (matchedLook) {
            handleApplyLook(matchedLook);
          }
        }
      } catch {
        handleTrySample("target");
      }
    },
    [loadImageFile, referenceImage, importedLook, handleApplyLook, handleTrySample]
  );

  const handleTrySampleInStudio = useCallback(
    (demo) => {
      if (!demo) return;
      setActiveTab("home");
      handleLoadLocalSamplePhoto({
        sampleUrl: demo.sampleUrl,
        sampleFileName: demo.sampleFileName,
        lookId: demo.lookId,
        forceLook: true,
      });
    },
    [handleLoadLocalSamplePhoto]
  );

  const handleLoadStudioSamplePhoto = useCallback(() => {
    handleLoadLocalSamplePhoto({
      sampleUrl: "/samples/sample-portrait.webp",
      sampleFileName: "Sample_Studio_Portrait.webp",
      lookId: "kodak-2383-print",
      forceLook: false,
    });
  }, [handleLoadLocalSamplePhoto]);

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
        matchStrength / 100,
        { skinProtect: skinProtect / 100 }
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
    skinProtect,
    showMobileToast,
    t,
  ]);

  // Mobile (< 768px): close streamlined top-bar "More" popover on outside click / Escape
  useEffect(() => {
    if (!isMobileMoreOpen) return undefined;
    const onPointerDown = (e) => {
      if (mobileMoreRef.current && !mobileMoreRef.current.contains(e.target)) {
        setIsMobileMoreOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setIsMobileMoreOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isMobileMoreOpen]);

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
      engineOptions[0],
    [engineOptions, activeEngineId]
  );

  const activeLogProfileMeta = useMemo(
    () => getLogProfile(simulateLogInput),
    [simulateLogInput]
  );

  const hasPreviewImage = Boolean(activePreviewImageUrl) || Boolean(videoEl);

  // Native Web Share API file sharing for mobile Export tab (.kfplug, .cube, or graded PNG)
  const handleMobileNativeShare = useCallback(
    async (format = mobileShareFormat) => {
      if (isMobileSharingFile) return;
      if (format === "image" && !hasPreviewImage) return;
      if (format !== "image" && !canExportGrade) return;

      setIsMobileSharingFile(true);
      try {
        let blob;
        let fileName;
        let mimeType;
        const rawName = withEngineSuffix(
          presetName || referenceImage?.baseName || importedLook?.name || "Custom Look",
          activeEngineId
        );
        const safePreset = sanitizeMetadataText(rawName, "Custom Look", 64);

        if (format === "kfplug") {
          const calibratedParams = applyCalibrationToParams(effectiveParams, calibration);
          const { generateKfplug } = await import("./utils/kfplugPackager");
          const res = await generateKfplug(
            calibratedParams,
            safePreset,
            sanitizeMetadataText(authorName, "TFBAGAS", 64),
            sanitizeMetadataText(description, "", 200),
            simulateLogInput,
            activeLut,
            matchStrength / 100,
            { skinProtect: skinProtect / 100 }
          );
          blob = res.blob;
          fileName = res.fileName;
          mimeType = "application/zip";
        } else if (format === "cube") {
          const calibratedParams = applyCalibrationToParams(effectiveParams, calibration);
          const { generateLutFile } = await import("./utils/lutExporter");
          const res = generateLutFile(
            calibratedParams,
            safePreset,
            "cube",
            simulateLogInput,
            mobileCubeSize,
            activeLut,
            matchStrength / 100,
            { skinProtect: skinProtect / 100 }
          );
          blob = res.blob;
          fileName = res.fileName;
          mimeType = "text/plain";
        } else {
          const isVideo = targetImage?.kind === "video" && videoEl;
          const activeImg = isVideo ? null : targetImage?.imgElement || referenceImage?.imgElement;
          const w = isVideo ? videoEl.videoWidth : activeImg?.naturalWidth;
          const h = isVideo ? videoEl.videoHeight : activeImg?.naturalHeight;
          if (!w || !h) return;
          const { exportGradedImage } = await import("./utils/imageExporter");
          const res = await exportGradedImage({
            source: isVideo ? videoEl : activeImg,
            width: w,
            height: h,
            params: effectiveParams,
            format: "png",
            quality: 95,
            layout: "graded",
            splitPos: exportSplitPos,
            simulateLogInput,
            baseName: withEngineSuffix(
              targetImage?.baseName || referenceImage?.baseName || presetName || "Target",
              activeEngineId
            ),
            presetTitle: safePreset,
            engineId: activeEngineId,
            activeLut,
            lutMix: matchStrength / 100,
            returnBlobOnly: true,
          });
          blob = res.blob;
          fileName = res.fileName;
          mimeType = "image/png";
        }

        const shareFile = new File([blob], fileName, { type: mimeType });
        const canShareFile =
          typeof navigator !== "undefined" &&
          typeof navigator.share === "function" &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [shareFile] });

        if (canShareFile) {
          try {
            navigator.vibrate?.(6);
          } catch {
            // ignore
          }
          await navigator.share({ files: [shareFile], title: safePreset });
          setStatusText("Shared!");
          showMobileToast(`Shared ${fileName}`);
        } else {
          downloadBlob(blob, fileName);
          setStatusText("Exported!");
          showMobileToast(`Saved ${fileName}`);
        }
      } catch (err) {
        if (err?.name !== "AbortError") {
          setStatusText("Share Error");
        }
      } finally {
        setIsMobileSharingFile(false);
      }
    },
    [
      mobileShareFormat,
      isMobileSharingFile,
      hasPreviewImage,
      canExportGrade,
      presetName,
      referenceImage,
      importedLook,
      activeEngineId,
      effectiveParams,
      calibration,
      authorName,
      description,
      simulateLogInput,
      activeLut,
      matchStrength,
      skinProtect,
      mobileCubeSize,
      targetImage,
      videoEl,
      exportSplitPos,
      showMobileToast,
    ]
  );

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
  const hasGuideMounted = useMountOnce(isGuideOpen);
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
    containerRef: mobileAdjustTabContainerRef,
    registerTabRef: registerMobileAdjustTabRef,
    pillStyle: mobileAdjustTabPillStyle,
  } = usePillIndicator(gradingTab, { refreshKey: `${activeTab}-${mobileDeckTab}-${hasEnteredStudio}` });

  const handleEnterViewFromSplash = useCallback((view) => {
    if (view) setActiveTab(view);
  }, []);

  const handleCommandNavigateView = useCallback(
    (view) => {
      if (view) setActiveTab(view);
      if (showSplash) handleSplashComplete();
    },
    [showSplash, handleSplashComplete]
  );

  const handleCommandLoadSamplePlate = useCallback(
    (plate) => {
      handleTrySampleInStudio(plate);
      if (showSplash) handleSplashComplete();
    },
    [handleTrySampleInStudio, showSplash, handleSplashComplete]
  );

  const handleCommandTryInstantDemo = useCallback(() => {
    setActiveTab("home");
    handleTryInstantDemo();
    if (showSplash) handleSplashComplete();
  }, [handleTryInstantDemo, showSplash, handleSplashComplete]);

  const handleCommandRunCalibration = () => {
    setActiveTab("settings");
    if (showSplash) handleSplashComplete();
    handleRunPipelineCalibration();
  };

  const handleCommandOpenExportModal = useCallback(() => {
    setActiveTab("home");
    if (showSplash) handleSplashComplete();
    setIsExportModalOpen(true);
  }, [showSplash, handleSplashComplete]);

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
        activeTab === "home"
          ? "h-[100dvh] overflow-hidden md:h-auto md:overflow-visible lg:h-screen lg:overflow-hidden"
          : ""
      } flex flex-col bg-[#090B10] md:bg-[#0A0C10] text-[#F8FAFC] md:text-[#F4F7FB] font-sans`}
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
          onNavigateView={handleEnterViewFromSplash}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onTrySampleInStudio={handleTrySampleInStudio}
          onOpenGuide={() => setIsGuideOpen(true)}
          isGuideOpen={isGuideOpen}
          isCommandPaletteOpen={isCommandPaletteOpen}
        />
      )}

      {hasEnteredStudio && (
      <>
      {/* TIER 1: DESKTOP TOP BAR WITH FLOATING PILL NAV + STREAMLINED LIQUID GLASS MOBILE HEADER (<768px) */}
      <header
        className={`mobile-glass-header sticky top-0 ${
          activeTab === "home" ? "md:relative lg:sticky lg:top-0" : ""
        } z-40 shrink-0 w-full bg-[#0A0C10]/95 backdrop-blur-md border-b border-[#AAB7C5]/14 flex flex-col font-sans ${
          workspacePhase === "hidden"
            ? "opacity-0 pointer-events-none"
            : workspacePhase === "entering"
            ? "workstation-header-enter"
            : "opacity-100"
        }`}
      >
        <div className="h-14 md:h-12 w-full px-3 sm:px-4 flex items-center justify-between gap-3 sm:gap-3.5">
        {/* Left: Collapse Left + Original 3D Cube Brand Logo + Live Engine Status */}
        <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
          {activeTab === "home" && (
            <button
              type="button"
              onClick={() => setIsLeftCollapsed((v) => !v)}
              title={isLeftCollapsed ? "Expand Left Inspector ([)" : "Collapse Left Inspector ([)"}
              aria-label={isLeftCollapsed ? "Expand Left Inspector" : "Collapse Left Inspector"}
              aria-pressed={isLeftCollapsed}
              className="hidden lg:inline-flex items-center justify-center w-7 h-7 rounded-md text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
            >
              {isLeftCollapsed ? (
                <PanelLeftOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
              ) : (
                <PanelLeftClose className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab("home")}
            className="flex items-center gap-2 shrink-0 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2] rounded-md pr-1"
          >
            <BrandLogo size={24} />
            <span className="font-display text-[14px] font-semibold tracking-[-0.02em] text-[#F4F7FB] whitespace-nowrap">
              ToneBench
            </span>
          </button>

          {/* Subtle Live Engine Status Pill (xl+) */}
          <div className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#11161F] border border-[#AAB7C5]/14 text-[10px] font-mono text-[#AAB7C5] shrink-0">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isAnalyzing ? "bg-amber-400 animate-pulse" : "bg-[#93B8D8]"
              }`}
            />
            <span className="text-[#F4F7FB]">
              {activeEngine.name} {activeEngine.versionBadge}
            </span>
            <span className="text-[#AAB7C5]/35">·</span>
            <span className="text-[#AAB7C5]">
              {isAnalyzing ? "Analyzing" : "Active"}
            </span>
          </div>

          {restorableSession && (
            <div className="hidden xl:inline-flex items-center rounded-full bg-[#11161F] border border-[#AAB7C5]/18 text-[10px] text-[#C9D7E2] overflow-hidden shrink-0">
              <button
                type="button"
                onClick={handleRestoreSession}
                className="px-2.5 py-1 hover:bg-[#1C2430] hover:text-[#F4F7FB] cursor-pointer transition-colors"
              >
                {t("nav.restoreSession")}
              </button>
              <button
                type="button"
                onClick={() => setRestorableSession(null)}
                aria-label={t("nav.dismissRestore")}
                className="px-1.5 py-1 border-l border-[#AAB7C5]/14 text-[#AAB7C5] hover:text-[#F4F7FB] cursor-pointer"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
        </div>

        {/* Center: Floating Pill Navigation (Desktop lg+) */}
        <nav
          aria-label={t("nav.primaryLabel")}
          className="hidden lg:flex items-center gap-1.5 shrink-0"
        >
          <div
            ref={topNavContainerRef}
            className="relative flex items-center gap-0.5 p-0.5 rounded-full bg-[#11161F]/92 border border-[#AAB7C5]/15 shadow-[inset_0_1px_0_rgba(244,247,251,0.06)]"
          >
            <div
              aria-hidden="true"
              className="studio-sliding-pill pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-full bg-[#4A6B86]/35 border border-[#7FA3C2]/50"
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
                className={`relative z-10 px-3 py-1 rounded-full text-[11.5px] font-medium transition-[color,transform] duration-150 ease-[var(--ease-shutter)] active:scale-[0.97] cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2] ${
                  activeTab === item.id
                    ? "text-[#F4F7FB] font-semibold"
                    : "text-[#AAB7C5] hover:text-[#F4F7FB]"
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
            aria-label={t("nav.commandPaletteTitle")}
            className="studio-tactile h-7 inline-flex items-center gap-1.5 px-2.5 rounded-full bg-[#11161F] hover:bg-[#1C2430] border border-[#AAB7C5]/16 text-[#C9D7E2] hover:text-[#F4F7FB] cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
          >
            <Search className="w-3 h-3 text-[#93B8D8]" strokeWidth={1.5} />
            <kbd className="font-mono text-[10px] text-[#AAB7C5]">Ctrl+K</kbd>
          </button>

          <button
            type="button"
            onClick={handleOpenChangelog}
            title={t("nav.whatsNewTitle")}
            className="studio-tactile hidden 2xl:inline-flex relative px-2 py-1 rounded-full text-[10px] font-mono text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] cursor-pointer shrink-0"
          >
            v1.0.0
            {hasUnreadUpdate && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#93B8D8]" />
            )}
          </button>
        </nav>

        {/* Right: Mobile (< 768px) Streamlined Midnight-Slate & Sky-Cyan Controls (Undo, Redo, More Popover) */}
        <div ref={mobileMoreRef} className="relative flex md:hidden items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (!historyState.canUndo) return;
              try {
                navigator.vibrate?.(5);
              } catch {
                // ignore
              }
              handleUndo();
            }}
            disabled={!historyState.canUndo}
            title={t("paramsCard.undoTitle")}
            aria-label={t("paramsCard.undoTitle")}
            className={`mobile-glass-pill min-w-[40px] min-h-[40px] rounded-full inline-flex items-center justify-center transition-all active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
              historyState.canUndo
                ? "text-[#F8FAFC] hover:text-white cursor-pointer"
                : "text-[#94A3B8]/35 opacity-55 cursor-not-allowed"
            }`}
          >
            <Undo2 className="w-4 h-4" strokeWidth={1.7} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (!historyState.canRedo) return;
              try {
                navigator.vibrate?.(5);
              } catch {
                // ignore
              }
              handleRedo();
            }}
            disabled={!historyState.canRedo}
            title={t("paramsCard.redoTitle")}
            aria-label={t("paramsCard.redoTitle")}
            className={`mobile-glass-pill min-w-[40px] min-h-[40px] rounded-full inline-flex items-center justify-center transition-all active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
              historyState.canRedo
                ? "text-[#F8FAFC] hover:text-white cursor-pointer"
                : "text-[#94A3B8]/35 opacity-55 cursor-not-allowed"
            }`}
          >
            <Redo2 className="w-4 h-4" strokeWidth={1.7} aria-hidden="true" />
          </button>

          <button
            type="button"
            data-testid="mobile-more-trigger"
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={isMobileMoreOpen}
            onClick={() => {
              try {
                navigator.vibrate?.(5);
              } catch {
                // ignore
              }
              setIsMobileMoreOpen((v) => !v);
            }}
            className={`mobile-glass-pill min-w-[40px] min-h-[40px] rounded-full inline-flex items-center justify-center transition-all active:scale-[0.94] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
              isMobileMoreOpen
                ? "mobile-glass-active text-[#E0F2FE]"
                : "text-[#F8FAFC] hover:text-white"
            }`}
          >
            <MoreHorizontal className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
          </button>

          {/* Compact Mobile Liquid Glass More Popover */}
          {isMobileMoreOpen && (
            <div
              role="menu"
              data-testid="mobile-more-menu"
              className="mobile-glass-popover studio-popover-enter absolute right-0 top-full mt-2 z-50 w-52 rounded-2xl p-1.5 space-y-0.5 text-left"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  handleLoadStudioSamplePhoto();
                }}
                className="w-full min-h-[44px] px-3 rounded-xl flex items-center gap-2.5 text-xs font-medium text-[#F8FAFC] hover:bg-white/[0.08] active:scale-[0.98] transition-all cursor-pointer"
              >
                <ImageIcon className="w-4 h-4 text-[#38BDF8] shrink-0" aria-hidden="true" />
                <span>Load Sample</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  setIsGuideOpen(true);
                }}
                className="w-full min-h-[44px] px-3 rounded-xl flex items-center gap-2.5 text-xs font-medium text-[#F8FAFC] hover:bg-white/[0.08] active:scale-[0.98] transition-all cursor-pointer"
              >
                <HelpCircle className="w-4 h-4 text-[#38BDF8] shrink-0" aria-hidden="true" />
                <span>How to Use</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  setIsShareOpen(true);
                }}
                className="w-full min-h-[44px] px-3 rounded-xl flex items-center gap-2.5 text-xs font-medium text-[#F8FAFC] hover:bg-white/[0.08] active:scale-[0.98] transition-all cursor-pointer"
              >
                <Share2 className="w-4 h-4 text-[#38BDF8] shrink-0" aria-hidden="true" />
                <span>Share App Link</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  setActiveTab(activeTab === "home" ? "settings" : "home");
                }}
                className="w-full min-h-[44px] px-3 rounded-xl flex items-center gap-2.5 text-xs font-medium text-[#F8FAFC] hover:bg-white/[0.08] active:scale-[0.98] transition-all cursor-pointer"
              >
                <Settings className="w-4 h-4 text-[#38BDF8] shrink-0" aria-hidden="true" />
                <span>{activeTab === "home" ? t("nav.settings") : t("nav.workspace")}</span>
              </button>

              <div className="my-1 border-t border-white/[0.08]" />

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  presetImportInputRef.current?.click();
                }}
                className="w-full min-h-[44px] px-3 rounded-xl flex items-center gap-2.5 text-xs font-medium text-[#CBD5E1] hover:text-white hover:bg-white/[0.08] active:scale-[0.98] transition-all cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" aria-hidden="true" />
                <span>Import Preset</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Clean Utility Cluster (Tablet & Desktop >= 768px untouched) */}
        <div className="hidden md:flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Mobile Command Palette Trigger (< lg) */}
          <button
            type="button"
            onClick={() => setIsCommandPaletteOpen(true)}
            title={t("nav.commandPaletteTitle")}
            aria-label={t("nav.commandPaletteTitle")}
            className="lg:hidden min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg text-[#C9D7E2] hover:text-[#F4F7FB] hover:bg-[#1C2430] border border-[#AAB7C5]/15 cursor-pointer"
          >
            <Search className="w-4 h-4 text-[#93B8D8]" strokeWidth={1.5} />
          </button>

          {/* Partner Tool: SeeThrough Studio + Hover Popover (Desktop xl+) */}
          <div className="relative hidden xl:block group/seethrough shrink-0">
            <a
              href="https://seethrough-studio.pages.dev"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="SeeThrough Studio: Split PNG illustrations into layered PSD parts for Live2D"
              className="studio-tactile inline-flex items-center gap-1.5 border border-[#4A6B86]/45 bg-[#11161F] hover:bg-[#1C2430] hover:border-[#7FA3C2]/55 text-[#C9D7E2] hover:text-[#F4F7FB] text-[11px] font-medium px-2.5 h-7 rounded-full shrink-0"
            >
              <Layers className="w-3 h-3 text-[#93B8D8] shrink-0" strokeWidth={1.5} />
              <span>SeeThrough · PNG to PSD</span>
              <ArrowUpRight className="w-3 h-3 text-[#93B8D8] shrink-0" strokeWidth={1.5} />
            </a>

            <div
              role="tooltip"
              className="origin-top-right absolute right-0 top-full mt-2 z-50 w-[300px] rounded-xl bg-[#11161F]/96 backdrop-blur-xl border border-[#AAB7C5]/18 shadow-[inset_0_1px_0_rgba(244,247,251,0.08),0_18px_48px_rgba(0,0,0,0.82)] p-3.5 text-left pointer-events-none opacity-0 -translate-y-[6px] scale-[0.96] group-hover/seethrough:opacity-100 group-hover/seethrough:translate-y-0 group-hover/seethrough:scale-100 group-focus-within/seethrough:opacity-100 group-focus-within/seethrough:translate-y-0 group-focus-within/seethrough:scale-100 transition-[opacity,transform] duration-[280ms] ease-[var(--ease-shutter)] motion-reduce:transition-none motion-reduce:transform-none"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Layers className="w-3.5 h-3.5 text-[#93B8D8] shrink-0" strokeWidth={1.5} />
                  <span className="text-xs font-semibold text-[#F4F7FB] truncate">
                    SeeThrough Studio
                  </span>
                </div>
                <span className="text-[9px] font-mono font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full bg-[#4A6B86]/28 text-[#C9D7E2] border border-[#7FA3C2]/35 shrink-0">
                  LIVE2D / PSD TOOL
                </span>
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-[#C9D7E2]">
                Automatically split flat PNG character art into clean, separated layers and export a rig-ready .PSD file in seconds.
              </p>

              <ul className="mt-2.5 space-y-1.5 text-[11px] text-[#C9D7E2]">
                <li className="flex items-start gap-1.5">
                  <Check className="w-3 h-3 text-[#93B8D8] shrink-0 mt-0.5" />
                  <span>Smart Part Separation (Hair, Eyes, Face, Outfit)</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="w-3 h-3 text-[#93B8D8] shrink-0 mt-0.5" />
                  <span>One-Click Multi-Layer .PSD Export for Live2D &amp; AE</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="w-3 h-3 text-[#93B8D8] shrink-0 mt-0.5" />
                  <span>100% Free Web Tool for Illustrators &amp; Riggers</span>
                </li>
              </ul>

              <div className="mt-3 pt-2 border-t border-[#AAB7C5]/14 flex items-center justify-between text-[10px] font-mono text-[#93B8D8]">
                <span>Open seethrough-studio.pages.dev</span>
                <ArrowUpRight className="w-3 h-3 text-[#93B8D8]" strokeWidth={1.5} />
              </div>
            </div>
          </div>

          {/* Guide Modal Trigger */}
          <button
            type="button"
            onClick={() => setIsGuideOpen(true)}
            title="How to Use ToneBench Guide"
            aria-label="How to Use ToneBench Guide"
            className="studio-tactile shrink-0 inline-flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px] lg:min-w-0 lg:min-h-0 lg:h-7 lg:px-2.5 rounded-lg lg:rounded-md text-[11px] font-medium text-[#C9D7E2] hover:text-[#F4F7FB] hover:bg-[#1C2430] border border-[#AAB7C5]/15 cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 text-[#93B8D8]" strokeWidth={1.5} />
            <span className="hidden lg:inline">Guide</span>
          </button>

          {/* Desktop Looks Drawer (Mobile accesses Looks via Bottom Tab Bar) */}
          <button
            type="button"
            onClick={() => setIsLooksOpen(true)}
            title={t("nav.looksTitle")}
            className="hidden lg:inline-flex studio-tactile shrink-0 items-center gap-1.5 px-2.5 h-7 rounded-md text-[11px] font-medium text-[#C9D7E2] hover:text-[#F4F7FB] hover:bg-[#1C2430] border border-[#AAB7C5]/15 cursor-pointer"
          >
            <Bookmark className="w-3 h-3 text-[#AAB7C5]" strokeWidth={1.5} />
            <span>{t("nav.looks")}</span>
            <span className="text-[10px] font-mono text-[#AAB7C5]">
              {SAMPLE_LOOKS.length}
            </span>
          </button>

          {/* Import Preset (.cube / .kfplug / .ffx / .lut) */}
          <button
            type="button"
            onClick={() => presetImportInputRef.current?.click()}
            title="Import .cube, .kfplug, .ffx, or .lut preset"
            aria-label="Import .cube, .kfplug, .ffx, or .lut preset"
            className="studio-tactile shrink-0 inline-flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px] lg:min-w-0 lg:min-h-0 lg:h-7 lg:px-2.5 rounded-lg lg:rounded-md text-[11px] font-medium text-[#C9D7E2] hover:text-[#F4F7FB] hover:bg-[#1C2430] border border-[#AAB7C5]/15 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 lg:w-3 lg:h-3 text-[#AAB7C5]" strokeWidth={1.5} />
            <span className="hidden xl:inline">Import Preset</span>
            <span className="hidden lg:inline xl:hidden">Import</span>
          </button>

          {/* Share Link / QR */}
          <button
            type="button"
            onClick={() => setIsShareOpen(true)}
            title={t("nav.shareTitle")}
            aria-label={t("nav.shareTitle")}
            className="studio-tactile shrink-0 inline-flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px] lg:min-w-0 lg:min-h-0 lg:h-7 lg:px-2.5 rounded-lg lg:rounded-md text-[11px] font-medium text-[#C9D7E2] hover:text-[#F4F7FB] hover:bg-[#1C2430] border border-[#AAB7C5]/15 cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5 lg:w-3 lg:h-3 text-[#AAB7C5]" strokeWidth={1.5} />
            <span className="hidden xl:inline">Share</span>
            <span className="hidden lg:inline xl:hidden">Share</span>
          </button>

          {/* Mobile Settings / Studio Toggle (< lg) */}
          <button
            type="button"
            onClick={() => setActiveTab(activeTab === "home" ? "settings" : "home")}
            title={activeTab === "home" ? t("nav.settings") : t("nav.workspace")}
            aria-label={activeTab === "home" ? t("nav.settings") : t("nav.workspace")}
            className={`lg:hidden min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
              activeTab !== "home"
                ? "bg-[#4A6B86]/30 border-[#7FA3C2]/55 text-[#F4F7FB]"
                : "text-[#C9D7E2] hover:text-[#F4F7FB] hover:bg-[#1C2430] border-[#AAB7C5]/15"
            }`}
          >
            <Settings className="w-4 h-4" strokeWidth={1.5} />
          </button>

          {/* Collapse Right Inspector Toggle (]) */}
          {activeTab === "home" && (
            <button
              type="button"
              onClick={() => setIsRightCollapsed((v) => !v)}
              title={isRightCollapsed ? "Expand Right Inspector (])" : "Collapse Right Inspector (])"}
              aria-label={isRightCollapsed ? "Expand Right Inspector" : "Collapse Right Inspector"}
              aria-pressed={isRightCollapsed}
              className="studio-tactile hidden lg:inline-flex items-center justify-center w-7 h-7 ml-0.5 rounded-md text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
            >
              {isRightCollapsed ? (
                <PanelRightOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
              ) : (
                <PanelRightClose className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
            </button>
          )}
        </div>
        </div>
      </header>

      {/* WORKSPACE VIEW: Edge-to-Edge 3-Column 100vh on Desktop, Fixed-Split 100dvh Layout on <768px */}
      <div
        className={
          activeTab === "home"
            ? `flex-1 min-h-0 flex flex-col overflow-hidden md:overflow-visible lg:grid ${desktopGridColsClass} ${
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
        {/* A. LEFT INSPECTOR (280px on desktop, collapsible via '[') - Inputs & Live Scopes */}
        <aside
          className={`hidden lg:order-1 bg-[#11161F] border-t lg:border-t-0 lg:border-r border-[#AAB7C5]/14 shadow-[inset_0_1px_0_rgba(244,247,251,0.04)] ${
            isLeftCollapsed ? "lg:hidden" : "lg:flex"
          } flex-col lg:min-h-0 lg:overflow-y-auto divide-y divide-[#AAB7C5]/14 ${
            workspacePhase === "entering" ? "workstation-col-left-enter" : ""
          }`}
        >
          {/* 01 Target Footage + Input Profile Dropdown (Placed First to match 01 Load Target -> 02 Reference) */}
          <ImageDropCard
            stepIndex="01"
            title={t("dropCard.targetFootageTitle")}
            subtitle={t("dropCard.targetRoleSub")}
            allowVideo
            imageInfo={targetImage}
            onSelectImage={handleSelectTarget}
            onClearImage={handleClearTarget}
            onTrySample={handleTryTargetSample}
            inputProfile={simulateLogInput}
            onInputProfileChange={handleTargetInputProfileChange}
            isPasteTarget={
              hoveredSlot === "target" ||
              (!hoveredSlot && (focusedSlot === "target" || !focusedSlot))
            }
            onHoverChange={handleHoverTarget}
            onFocusSlot={handleFocusTarget}
            errorMessage={targetError}
          />

          {/* 02 Reference Input + 6 Dominant Palette Droplets */}
          <ImageDropCard
            stepIndex="02"
            title={t("dropCard.referenceTitle")}
            subtitle={t("dropCard.referenceRoleSub")}
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

        {/* B. CENTER VIEWPORT (Fluid on desktop, Fixed Non-Scrolling Top Region on <768px for zero scroll shutter) */}
        <section
          data-testid="studio-preview-section"
          className={`order-1 lg:order-2 shrink-0 md:sticky md:top-0 z-30 md:z-20 lg:static lg:z-auto bg-[#090B10] md:bg-[#07090D] lg:bg-[#0A0C10] flex flex-col lg:min-h-0 lg:overflow-hidden border-b border-white/[0.08] md:border-[#AAB7C5]/14 lg:border-b-0 ${
            workspacePhase === "entering" ? "workstation-col-center-enter" : ""
          }`}
        >
          <ComparisonSlider
            onResetGrade={handleResetParams}
            originalImage={activePreviewImageUrl}
            imageEl={activePreviewImgElement}
            gradedCanvasRef={gradedCanvasRef}
            glPreviewRef={glPreviewRef}
            useWebGLPhoto={!webglPhotoError}
            previewMaxDim={previewMaxDim}
            onWebGLPhotoError={() => setWebglPhotoError(true)}
            hasImage={hasPreviewImage}
            hasTargetImage={Boolean(targetImage)}
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
            onLoadSamplePhoto={handleLoadStudioSamplePhoto}
            onLoadSamplePlate={handleTrySampleInStudio}
            onOpenGuide={() => setIsGuideOpen(true)}
            isNeutralGrade={isNeutralGrade}
            onOpenLooks={() => setIsLooksOpen(true)}
            onImportPreset={() => presetImportInputRef.current?.click()}
            onLoadSampleReference={() => handleTryReferenceSample(SAMPLE_LOOKS[0]?.id)}
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
                <div className="hidden lg:flex shrink-0 mt-2.5 pt-2 pb-2 px-3 bg-[#0D1118] border-t border-[#AAB7C5]/10 items-center justify-between gap-2 text-[11px] font-mono tabular-nums overflow-x-auto no-scrollbar">
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-[#F4F7FB] font-medium">
                      {activeEngine.name} {activeEngine.versionBadge}
                    </span>
                    <span className="text-[#AAB7C5]/30">|</span>
                    <span className="text-[#AAB7C5]">
                      ΔE{" "}
                      <span className="text-[#F4F7FB]">
                        {liveMetrics.deltaE !== null ? liveMetrics.deltaE.toFixed(2) : "-"}
                      </span>
                    </span>
                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-[#C9D7E2] px-1.5 py-0.5 rounded bg-[#11161F] border border-[#AAB7C5]/14">
                      <ShieldCheck
                        className={`w-3 h-3 ${
                          liveMetrics.skinSafe ? "text-[#93B8D8]" : "text-amber-400"
                        }`}
                      />
                      <span>
                        {liveMetrics.skinSafe ? "Skin-Tone Safe" : "Skin Shift"}
                      </span>
                    </span>
                    <span className="hidden md:inline text-[#AAB7C5]/30">|</span>
                    <span className="hidden md:inline text-[#AAB7C5]">
                      {activeLogProfileMeta.shortLabel}
                    </span>
                    {statusText && statusText !== "Ready" && (
                      <span className="hidden xl:inline text-[10px] text-[#93B8D8]">
                        · {translateStatusText(statusText, lang)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Compact A/B Slot Toggle with Sliding Active Pill */}
                    <div
                      ref={slotContainerRef}
                      className="relative inline-flex items-center p-0.5 rounded bg-[#11161F] border border-[#AAB7C5]/14 text-[10px]"
                    >
                      <div
                        aria-hidden="true"
                        className="studio-sliding-pill pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-[3px] bg-[#F4F7FB]"
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
                              ? "text-[#0A0C10] font-semibold"
                              : "text-[#AAB7C5] hover:text-[#F4F7FB]"
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
                          ? "text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] cursor-pointer"
                          : "text-[#AAB7C5]/35 cursor-not-allowed"
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
                          ? "text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] cursor-pointer"
                          : "text-[#AAB7C5]/35 cursor-not-allowed"
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
                          ? "text-[#AAB7C5]/35 border-[#AAB7C5]/10 cursor-not-allowed"
                          : reloadedFeedback
                          ? "bg-[#F4F7FB] text-[#0A0C10] border-[#F4F7FB] cursor-pointer"
                          : "bg-[#11161F] hover:bg-[#1C2430] text-[#C9D7E2] hover:text-[#F4F7FB] border-[#AAB7C5]/16 cursor-pointer"
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
                        className="hidden lg:inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-sans font-semibold bg-[#F4F7FB] hover:bg-[#FBFDFF] text-[#0A0C10] transition-colors cursor-pointer"
                      >
                        <Download className="w-2.5 h-2.5 stroke-[2]" />
                        <span>Export</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            }
          />
        </section>

        {/* MOBILE / TABLET TOOL DECK (< lg, driven by Fixed Mobile Studio Bottom Tab Bar) */}
        <div
          data-testid="mobile-tool-deck-scroll"
          className="order-2 lg:hidden flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-none md:h-auto md:overflow-visible pb-[calc(8rem+env(safe-area-inset-bottom))] md:pb-24 flex flex-col bg-[#090B10] md:bg-[#0A0C10]"
        >
          {/* TAB 1: MATCH (Target & Reference, Color Engine + Match Strength, Borderless Accordions on <768px) */}
          {mobileDeckTab === "match" && (
            <div className="md:divide-y md:divide-[#AAB7C5]/14 studio-panel-fade">
              <div className="px-4 pt-4 pb-2 md:p-3 space-y-2.5">
                {/* 2-Column Media Cards (Target & Reference) */}
                <div className="grid grid-cols-2 gap-3 md:gap-2.5">
                  <MobileMediaTile
                    stepIndex="01"
                    label={t("dropCard.targetShort")}
                    subtitle={t("dropCard.targetRoleSub")}
                    sampleLabel={t("dropCard.sample")}
                    tapToLoadLabel={t("dropCard.tapToLoad")}
                    replaceLabel={t("dropCard.replace")}
                    clearLabel={t("dropCard.remove")}
                    imageInfo={targetImage}
                    onSelect={handleSelectTarget}
                    onClear={handleClearTarget}
                    onTrySample={handleTryTargetSample}
                    errorMessage={targetError}
                  />
                  <MobileMediaTile
                    stepIndex="02"
                    label={t("dropCard.referenceTitle")}
                    subtitle={t("dropCard.referenceRoleSub")}
                    sampleLabel={t("dropCard.sample")}
                    tapToLoadLabel={t("dropCard.tapToLoad")}
                    replaceLabel={t("dropCard.replace")}
                    clearLabel={t("dropCard.remove")}
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
                    onOpenLooks={() => setIsLooksOpen(true)}
                    isAnalyzing={isAnalyzing}
                    errorMessage={referenceError}
                  />
                </div>

                {/* Quick Sample Look Strip (when Reference Sample is toggled) */}
                {mobileShowRefSamples && !referenceImage && (
                  <div className="pt-3 mt-1 border-t border-white/[0.08] md:border-[#AAB7C5]/14 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-sans font-medium text-[#94A3B8]">
                      <span>{t("inspector.sampleReferenceLooks")}</span>
                      <button
                        type="button"
                        onClick={() => setMobileShowRefSamples(false)}
                        aria-label={t("changelogModal.closeAria")}
                        className="p-1 text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {SAMPLE_LOOKS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setMobileShowRefSamples(false);
                            handleTryReferenceSample(opt.id);
                          }}
                          className="min-h-[42px] px-3 py-1.5 rounded-xl md:rounded-md bg-[#131A26] md:bg-[#11161F] hover:bg-[#1B2536] md:hover:bg-[#1C2430] border border-white/[0.08] md:border-[#AAB7C5]/14 text-xs font-sans font-medium text-[#F8FAFC] text-left truncate cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
                        >
                          {lang === "id" && SAMPLE_LOOK_LABELS_ID[opt.id]
                            ? SAMPLE_LOOK_LABELS_ID[opt.id]
                            : opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* MOBILE (< 768px): De-Boxed Midnight-Slate & Sky-Cyan Match Workspace */}
              <div className="md:hidden px-4 pt-3 pb-4 space-y-5">
                {/* Color Engine & Match Strength (Flat, de-boxed separation) */}
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between gap-2 px-0.5">
                    <div>
                      <div className="text-[13px] font-sans font-semibold text-[#F8FAFC]">
                        Color Engine
                      </div>
                      <div className="text-[11.5px] font-sans text-[#94A3B8] mt-0.5">
                        {activeEngineId === "altair_refresh"
                          ? "Balanced film tone & skin fidelity"
                          : activeEngineId === "altair"
                          ? "Filmic highlight roll-off"
                          : activeEngineId === "v3"
                          ? "High-contrast stylized curve"
                          : "Neutral color match"}
                      </div>
                    </div>
                    {liveMetrics.deltaE !== null && (
                      <span className="text-[11px] font-mono text-[#7DD3FC] tabular-nums shrink-0">
                        ΔE {liveMetrics.deltaE.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Midnight-Slate Segmented Engine Switcher with Sky-Cyan Active Pill */}
                  <div
                    role="tablist"
                    aria-label={t("engineCard.selectorAria")}
                    className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-[#0E131D] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  >
                    {engineOptions.map((eng) => {
                      const isActive = activeEngineId === eng.id;
                      const shortName =
                        eng.id === "altair_refresh"
                          ? "Altair 4.5"
                          : `${eng.name} ${eng.versionBadge}`;
                      return (
                        <button
                          key={eng.id}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => {
                            try {
                              navigator.vibrate?.(5);
                            } catch {
                              // ignore
                            }
                            handleEngineChange(eng.id);
                          }}
                          className={`min-h-[38px] px-2 py-1 rounded-xl text-center transition-all cursor-pointer active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                            isActive
                              ? "mobile-glass-active text-[#F8FAFC] font-semibold"
                              : "bg-transparent text-[#94A3B8] hover:text-[#F8FAFC] font-medium"
                          }`}
                        >
                          <div className="text-[12px] font-sans leading-tight truncate">
                            {shortName}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Thick iOS Control-Center Master Match Strength Pill Slider */}
                  <LiquidGlassSlider
                    paramKey="matchStrength"
                    label="Match Strength"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.min(100, matchStrength)}
                    defaultValue={100}
                    isBipolar={false}
                    decimals={0}
                    valueSuffix="%"
                    onChange={handleMatchStrengthChange}
                    onDragChange={handleControlDragChange}
                  />
                </div>

                {/* Borderless Tonal Collapsible Accordions (Midnight-Slate Harmony) */}
                <div className="space-y-2.5">
                  {/* Accordion 1: Input Profile */}
                  <div className="rounded-2xl bg-[#0E131D] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] overflow-hidden">
                    <button
                      type="button"
                      data-testid="mobile-accordion-input-profile"
                      aria-expanded={isMobileInputProfileOpen}
                      onClick={() => {
                        try {
                          navigator.vibrate?.(5);
                        } catch {
                          // ignore
                        }
                        setIsMobileInputProfileOpen((v) => !v);
                      }}
                      className="w-full min-h-[50px] px-4 py-3 flex items-center justify-between gap-2 text-left cursor-pointer active:bg-white/[0.03] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#38BDF8]"
                    >
                      <span className="text-[13px] font-sans font-medium text-[#F8FAFC]">
                        {t("dropCard.inputProfileTitle")}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-mono text-[#7DD3FC]">
                          {getLogProfile(simulateLogInput).shortLabel}
                        </span>
                        <ChevronDown
                          className={`studio-chevron w-4 h-4 text-[#94A3B8] ${
                            isMobileInputProfileOpen ? "rotate-180 text-[#38BDF8]" : "rotate-0"
                          }`}
                          aria-hidden="true"
                        />
                      </div>
                    </button>
                    <div
                      className="studio-collapse-grid"
                      data-expanded={isMobileInputProfileOpen}
                      aria-hidden={!isMobileInputProfileOpen}
                    >
                      <div className="studio-collapse-inner">
                        <div className="px-4 pb-4 pt-1">
                          <InputProfileDropdown
                            value={simulateLogInput}
                            onChange={handleTargetInputProfileChange}
                            ariaLabel={t("dropCard.targetInputProfileAria")}
                            compact
                            className="w-full"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Accordion 2: Extracted Palette */}
                  <div className="rounded-2xl bg-[#0E131D] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] overflow-hidden">
                    <button
                      type="button"
                      data-testid="mobile-accordion-palette"
                      aria-expanded={isMobilePaletteOpen}
                      onClick={() => {
                        try {
                          navigator.vibrate?.(5);
                        } catch {
                          // ignore
                        }
                        setIsMobilePaletteOpen((v) => !v);
                      }}
                      className="w-full min-h-[50px] px-4 py-3 flex items-center justify-between gap-2 text-left cursor-pointer active:bg-white/[0.03] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#38BDF8]"
                    >
                      <span className="text-[13px] font-sans font-medium text-[#F8FAFC]">
                        {t("inspector.extractedPalette")}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="inline-flex items-center gap-1" aria-hidden="true">
                          {(Array.isArray(referencePalette) && referencePalette.length > 0
                            ? referencePalette.slice(0, 5)
                            : ["#1E293B", "#334155", "#475569", "#334155", "#1E293B"]
                          ).map((hex, i) => (
                            <span
                              key={`${hex}-${i}`}
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: hex }}
                            />
                          ))}
                        </span>
                        <ChevronDown
                          className={`studio-chevron w-4 h-4 text-[#94A3B8] ${
                            isMobilePaletteOpen ? "rotate-180 text-[#38BDF8]" : "rotate-0"
                          }`}
                          aria-hidden="true"
                        />
                      </div>
                    </button>
                    <div
                      className="studio-collapse-grid"
                      data-expanded={isMobilePaletteOpen}
                      aria-hidden={!isMobilePaletteOpen}
                    >
                      <div className="studio-collapse-inner">
                        <div className="px-4 pb-4 pt-1 space-y-2">
                          {mobileCopiedHex && (
                            <div className="inline-flex items-center gap-1 text-[11px] font-mono text-[#7DD3FC]">
                              <Check className="w-3 h-3 text-[#38BDF8]" aria-hidden="true" />
                              <span>{t("toasts.copiedHex", { hex: mobileCopiedHex })}</span>
                            </div>
                          )}
                          <div className="grid grid-cols-6 gap-1.5">
                            {Array.isArray(referencePalette) && referencePalette.length > 0
                              ? referencePalette.slice(0, 6).map((hex, idx) => (
                                  <button
                                    key={`${hex}-${idx}`}
                                    type="button"
                                    onClick={() => handleMobileSwatchCopy(hex)}
                                    title={t("dropCard.copyHexTitle", { hex })}
                                    aria-label={t("dropCard.copyHexTitle", { hex })}
                                    className="min-h-[46px] flex flex-col items-center justify-center gap-1 py-1 rounded-xl hover:bg-[#38BDF8]/10 active:scale-95 transition-[transform,background-color] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
                                  >
                                    <span
                                      className="w-5 h-5 rounded-full"
                                      style={{
                                        backgroundColor: hex,
                                        boxShadow:
                                          "inset 0 1px 1px rgba(255,255,255,0.3), 0 2px 5px rgba(0,0,0,0.6)",
                                      }}
                                    />
                                    <span className="text-[8.5px] font-mono tabular-nums text-[#94A3B8] tracking-tight">
                                      {String(hex).toUpperCase()}
                                    </span>
                                  </button>
                                ))
                              : Array.from({ length: 6 }).map((_, idx) => (
                                  <div
                                    key={idx}
                                    className="flex flex-col items-center gap-1 py-1"
                                  >
                                    <span className="w-5 h-5 rounded-full bg-white/[0.06]" />
                                    <span className="text-[9px] font-mono text-[#64748B]">-</span>
                                  </div>
                                ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* TABLET (768px..1023px): Preserved Original Match Controls */}
              <div className="hidden md:block divide-y divide-[#AAB7C5]/14">
              {/* Compact Single-Row Segmented Solver Tier Bar (Altair 4.5 · Altair 4.0 · Polaris 3.5) */}
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-sans font-semibold uppercase tracking-[0.08em] text-[#AAB7C5] inline-flex items-center gap-1.5">
                    <Cpu className="w-3 h-3 text-[#7FA3C2]" />
                    <span>{t("inspector.solverTier")}</span>
                  </span>
                  <span className="text-[10px] font-mono text-[#AAB7C5] tabular-nums">
                    ΔE {liveMetrics.deltaE !== null ? liveMetrics.deltaE.toFixed(2) : "-"}
                  </span>
                </div>
                <div
                  role="tablist"
                  aria-label={t("engineCard.selectorAria")}
                  className="grid grid-cols-3 gap-0.5 p-0.5 rounded-lg bg-[#07090D] border border-[#AAB7C5]/14"
                >
                  {engineOptions.map((eng) => {
                    const isActive = activeEngineId === eng.id;
                    const shortName =
                      eng.id === "altair_refresh"
                        ? "Altair 4.5"
                        : `${eng.name} ${eng.versionBadge}`;
                    return (
                      <button
                        key={eng.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => handleEngineChange(eng.id)}
                        className={`min-h-[42px] px-2 py-1.5 rounded-[6px] text-center transition-colors cursor-pointer ${
                          isActive
                            ? "bg-[#4A6B86]/32 border border-[#7FA3C2]/55 text-[#F4F7FB]"
                            : "bg-transparent hover:bg-[#1C2430]/75 border border-transparent text-[#AAB7C5] hover:text-[#F4F7FB]"
                        }`}
                      >
                        <div className="text-[11px] font-sans font-semibold leading-tight truncate">
                          {shortName}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-2 text-[10.5px] text-[#AAB7C5]">
                  <span className="font-sans truncate">{activeEngine.subtitle}</span>
                  <span className="font-mono text-[9.5px] text-[#93B8D8] shrink-0">
                    {activeEngine.functionalTag || activeEngine.shortTag}
                  </span>
                </div>
              </div>

              {/* Input Profile (Flush Row) */}
              <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-sans font-medium text-[#C9D7E2]">
                  {t("dropCard.inputProfileTitle")}
                </span>
                <InputProfileDropdown
                  value={simulateLogInput}
                  onChange={handleTargetInputProfileChange}
                  ariaLabel={t("dropCard.targetInputProfileAria")}
                  compact
                  className="w-[168px]"
                />
              </div>

              {/* Extracted Palette with Monospace HEX Codes (Flush Section) */}
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-sans font-semibold uppercase tracking-[0.06em] text-[#AAB7C5]">
                    {t("inspector.extractedPalette")}
                  </span>
                  {mobileCopiedHex && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[#93B8D8]">
                      <Check className="w-3 h-3" />
                      <span>{t("toasts.copiedHex", { hex: mobileCopiedHex })}</span>
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
                          className="min-h-[44px] flex flex-col items-center justify-center gap-1 py-1 rounded-md hover:bg-[#1C2430]/75 active:scale-95 transition-[transform,background-color] cursor-pointer"
                        >
                          <span
                            className="w-5 h-5 rounded-full border border-[#F4F7FB]/20"
                            style={{
                              backgroundColor: hex,
                              boxShadow:
                                "inset 0 1px 1px rgba(255,255,255,0.35), 0 1px 3px rgba(0,0,0,0.6)",
                            }}
                          />
                          <span className="text-[9px] font-mono tabular-nums text-[#AAB7C5] tracking-tight">
                            {String(hex).toUpperCase()}
                          </span>
                        </button>
                      ))
                    : Array.from({ length: 6 }).map((_, idx) => (
                        <div
                          key={idx}
                          className="flex flex-col items-center gap-1 py-1"
                        >
                          <span className="w-5 h-5 rounded-full bg-[#11161F] border border-[#AAB7C5]/14" />
                          <span className="text-[9px] font-mono text-[#AAB7C5]">-</span>
                        </div>
                      ))}
                </div>
              </div>
              </div>
            </div>
          )}

          {/* TAB 2: ADJUST (Mobile <768px Liquid Glass Basic/Wheels/Curves + Thick Glass Sliders; Tablet preserved) */}
          {mobileDeckTab === "adjust" && (
            <div className="studio-panel-fade">
              {/* MOBILE (< 768px): De-Boxed Midnight-Slate & Sky-Cyan Adjust Workspace */}
              <div className="md:hidden px-4 pt-4 pb-4 space-y-5">
                {/* Midnight-Slate Segmented Sub-Tab Switcher: Basic | Wheels | Curves */}
                <div
                  role="tablist"
                  aria-label="Adjust sub-tabs"
                  data-testid="mobile-adjust-subtabs"
                  className="rounded-2xl bg-[#0E131D] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] p-1 grid grid-cols-3 gap-1"
                >
                  {[
                    { id: "primary", label: "Basic", modified: isPrimaryModified },
                    { id: "wheels", label: "Wheels", modified: isWheelsModified },
                    { id: "hue6v", label: "Curves", modified: isHue6VModified },
                  ].map((tab) => {
                    const active = gradingTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => {
                          try {
                            navigator.vibrate?.(5);
                          } catch {
                            // ignore
                          }
                          setGradingTab(tab.id);
                        }}
                        className={`min-h-[38px] px-2 rounded-xl text-[12px] font-sans inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                          active
                            ? "mobile-glass-active text-[#F8FAFC] font-semibold"
                            : "bg-transparent text-[#94A3B8] hover:text-[#F8FAFC] font-medium"
                        }`}
                      >
                        <span>{tab.label}</span>
                        {tab.modified && (
                          <span
                            aria-hidden="true"
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              active
                                ? "bg-[#38BDF8] shadow-[0_0_6px_rgba(56,189,248,0.85)]"
                                : "bg-[#38BDF8]/80"
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Quiet Sub-Header: Double-Tap Hint + Midnight-Slate Reset Pill */}
                <div className="flex items-center justify-between gap-2 px-0.5">
                  <span className="text-[11px] font-sans text-[#94A3B8]">
                    Double-tap any bar to reset
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        navigator.vibrate?.(8);
                      } catch {
                        // ignore
                      }
                      handleResetParams();
                    }}
                    className="min-h-[34px] inline-flex items-center gap-1.5 px-3 rounded-full bg-[#131A26] hover:bg-[#1B2536] border border-white/[0.1] text-[11px] font-sans font-medium text-[#F8FAFC] active:scale-[0.96] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
                  >
                    <RotateCcw className="w-3 h-3 text-[#38BDF8]" aria-hidden="true" />
                    <span>{t("paramsCard.reset")}</span>
                  </button>
                </div>

                {/* SUB-TAB 1: BASIC (Flat Stack of Thick iOS Control-Center Bipolar Pill Sliders) */}
                {gradingTab === "primary" && (
                  <div className="space-y-5 studio-panel-fade">
                    <div className="space-y-2">
                      {primaryControls.map((ctrl) => (
                        <LiquidGlassSlider
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

                    {/* Borderless Tonal Accordion: Engine & Tone Roll-Off */}
                    <div className="rounded-2xl bg-[#0E131D] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] overflow-hidden">
                      <button
                        type="button"
                        aria-expanded={isMobileEngineExtrasOpen}
                        onClick={() => {
                          try {
                            navigator.vibrate?.(5);
                          } catch {
                            // ignore
                          }
                          setIsMobileEngineExtrasOpen((v) => !v);
                        }}
                        className="w-full min-h-[50px] px-4 py-3 flex items-center justify-between gap-2 text-left cursor-pointer active:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#38BDF8]"
                      >
                        <span className="text-[13px] font-sans font-medium text-[#F8FAFC]">
                          Tone Roll-Off &amp; Skin
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-mono text-[#7DD3FC]">
                            Skin {skinProtect}%
                          </span>
                          <ChevronDown
                            className={`studio-chevron w-4 h-4 text-[#94A3B8] ${
                              isMobileEngineExtrasOpen ? "rotate-180 text-[#38BDF8]" : "rotate-0"
                            }`}
                            aria-hidden="true"
                          />
                        </div>
                      </button>
                      <div
                        className="studio-collapse-grid"
                        data-expanded={isMobileEngineExtrasOpen}
                        aria-hidden={!isMobileEngineExtrasOpen}
                      >
                        <div className="studio-collapse-inner">
                          <div className="px-3 pb-3 pt-1 space-y-2">
                            {activeEngineId === "altair_refresh" && (
                              <>
                                <LiquidGlassSlider
                                  paramKey="sourceNormalize"
                                  label={t("inspector.sourceNormalize")}
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
                                <LiquidGlassSlider
                                  paramKey="styleSigma"
                                  label={t("inspector.styleSigma")}
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
                            <LiquidGlassSlider
                              paramKey="skinProtect"
                              label={t("inspector.skinProtect")}
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
                            <LiquidGlassSlider
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
                            <LiquidGlassSlider
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
                            <LiquidGlassSlider
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
                    </div>
                  </div>
                )}

                {/* SUB-TAB 2: WHEELS (De-Boxed Midnight-Slate Surface + Thick Cyan Pill Sliders) */}
                {gradingTab === "wheels" && (
                  <div className="space-y-4 studio-panel-fade">
                    <div className="rounded-2xl bg-[#0E131D] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] p-4 grid grid-cols-3 gap-2">
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
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-0.5 pb-1">
                        <span className="text-[12px] font-sans font-medium text-[#94A3B8]">
                          {t("inspector.masterLevelsOffset")}
                        </span>
                        <button
                          type="button"
                          onClick={handleResetAllWheels}
                          disabled={!isWheelsModified}
                          className={`text-[11px] font-sans font-medium ${
                            isWheelsModified
                              ? "text-[#7DD3FC] hover:text-[#BAE6FD] cursor-pointer"
                              : "text-[#64748B] cursor-not-allowed"
                          }`}
                        >
                          {t("inspector.resetWheels")}
                        </button>
                      </div>
                      <LiquidGlassSlider
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
                      <LiquidGlassSlider
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
                      <LiquidGlassSlider
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

                {/* SUB-TAB 3: CURVES (6-Vector HSL Precision Curves) */}
                {gradingTab === "hue6v" && (
                  <div className="rounded-2xl bg-[#0E131D] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] p-3.5 space-y-3 studio-panel-fade">
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

              {/* TABLET (768px..1023px): Preserved Original Adjust Workspace */}
              <div className="hidden md:block divide-y divide-[#AAB7C5]/14">
              {/* Match Intensity & Skin Protect + Reset */}
              <div className="p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2 pb-1">
                  <span className="text-[10px] font-sans font-semibold uppercase tracking-[0.08em] text-[#AAB7C5]">
                    {t("inspector.matchIntensity")}
                  </span>
                  <button
                    type="button"
                    onClick={handleResetParams}
                    className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#11161F] hover:bg-[#1C2430] border border-[#AAB7C5]/16 text-[10.5px] font-sans font-medium text-[#C9D7E2] hover:text-[#F4F7FB] cursor-pointer"
                  >
                    <RotateCcw className="w-2.5 h-2.5 text-[#93B8D8]" />
                    <span>{t("paramsCard.reset")}</span>
                  </button>
                </div>
                {activeEngineId === "altair_refresh" && (
                  <>
                    <ParameterSlider
                      paramKey="sourceNormalize"
                      label={t("inspector.sourceNormalize")}
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
                      label={t("inspector.styleSigma")}
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
                  label={
                    activeEngine?.usesLut32
                      ? t("inspector.matchIntensity")
                      : t("engineCard.matchStrengthLabel")
                  }
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
                  label={t("inspector.skinProtect")}
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

              <div className="p-3 space-y-4">
                {/* Segmented Grading Sub-Tabs: Primary · Wheels · Hue 6V */}
                <div
                  ref={mobileAdjustTabContainerRef}
                  className="relative grid grid-cols-3 gap-0.5 p-0.5 rounded-lg bg-[#07090D] border border-[#AAB7C5]/14"
                >
                  <div
                    aria-hidden="true"
                    className="studio-sliding-pill pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-[6px] bg-[#1C2430] border border-[#4A6B86]/55"
                    style={mobileAdjustTabPillStyle}
                  />
                  {[
                    { id: "primary", label: t("inspector.tabPrimary"), modified: isPrimaryModified },
                    { id: "wheels", label: t("inspector.tabColorWheels"), modified: isWheelsModified },
                    { id: "hue6v", label: t("inspector.tabHue6V"), modified: isHue6VModified },
                  ].map((tab) => {
                    const active = gradingTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        ref={registerMobileAdjustTabRef(tab.id)}
                        type="button"
                        onClick={() => setGradingTab(tab.id)}
                        className={`relative z-10 min-h-[40px] py-1.5 rounded-[6px] text-[11px] font-sans font-medium transition-[color,transform] duration-150 ease-[var(--ease-shutter)] active:scale-[0.96] cursor-pointer inline-flex items-center justify-center gap-1 ${
                          active
                            ? "text-[#F4F7FB]"
                            : "text-[#AAB7C5] hover:text-[#F4F7FB]"
                        }`}
                      >
                        <span>{tab.label}</span>
                        {tab.modified && (
                          <span
                            aria-hidden="true"
                            className="w-1.5 h-1.5 rounded-full bg-[#93B8D8] shrink-0"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {gradingTab === "primary" && (
                  <div className="space-y-4 studio-panel-fade">
                    <div className="grid grid-cols-2 gap-x-3.5 gap-y-2">
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
                    <div className="pt-3 border-t border-[#AAB7C5]/14">
                      <button
                        type="button"
                        aria-expanded={isToneRollOffOpen}
                        onClick={() => setIsToneRollOffOpen((v) => !v)}
                        className="w-full py-0.5 flex items-center justify-between gap-2 text-left group cursor-pointer"
                      >
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-sans font-semibold uppercase tracking-[0.08em] text-[#AAB7C5] group-hover:text-[#F4F7FB] transition-colors duration-150">
                          <span>{t("inspector.toneAndRollOff")}</span>
                          <ChevronDown
                            className={`studio-chevron w-3 h-3 text-[#AAB7C5] group-hover:text-[#F4F7FB] ${
                              isToneRollOffOpen ? "rotate-180" : "rotate-0"
                            }`}
                          />
                        </span>
                        <span className="text-[10px] font-mono text-[#AAB7C5]">
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
                          <div className="pt-2.5 space-y-2">
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
                    <div className="pt-2.5 border-t border-[#AAB7C5]/14 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-sans font-semibold uppercase tracking-[0.08em] text-[#AAB7C5]">
                          {t("inspector.masterLevelsOffset")}
                        </span>
                        <button
                          type="button"
                          onClick={handleResetAllWheels}
                          disabled={!isWheelsModified}
                          className={`text-[10.5px] font-sans font-medium ${
                            isWheelsModified
                              ? "text-[#C9D7E2] hover:text-[#F4F7FB] cursor-pointer"
                              : "text-[#AAB7C5]/35 cursor-not-allowed"
                          }`}
                        >
                          {t("inspector.resetWheels")}
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
              </div>
            </div>
          )}

          {/* TAB 3: SCOPES (Borderless Midnight-Slate ProScopes on <768px) */}
          <div
            className={
              mobileDeckTab === "scopes"
                ? "w-full px-4 pt-4 md:px-0 md:pt-0 studio-panel-fade"
                : "hidden"
            }
          >
            <div className="rounded-2xl bg-[#0E131D] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] md:shadow-none md:rounded-none md:bg-transparent overflow-hidden">
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
          </div>

          {/* TAB 4: EXPORT (Mobile <768px De-Boxed Midnight-Slate & Sky-Cyan + Native Web Share; Tablet preserved) */}
          {mobileDeckTab === "export" && (
            <div className="studio-panel-fade">
              {/* MOBILE (< 768px): De-Boxed Midnight-Slate & Sky-Cyan Export Workspace */}
              <div className="md:hidden px-4 pt-4 pb-4 space-y-6">
                {/* Look / Preset Name Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <label
                      htmlFor="mobile-glass-preset-name"
                      className="text-[12px] font-sans font-medium text-[#94A3B8]"
                    >
                      Look Name
                    </label>
                    <span className="text-[10.5px] font-mono text-[#7DD3FC]/80 truncate max-w-[190px]">
                      {withEngineSuffix(
                        presetName || referenceImage?.baseName || importedLook?.name || "Custom Look",
                        activeEngineId
                      ).replace(/[^a-zA-Z0-9._-]+/g, "_")}.kfplug
                    </span>
                  </div>
                  <input
                    id="mobile-glass-preset-name"
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder={referenceImage?.baseName || importedLook?.name || "Custom Look"}
                    className="w-full h-11 px-3.5 rounded-2xl bg-[#0E131D] border border-white/[0.1] text-[13px] text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#38BDF8]"
                  />
                  {isNeutralGrade && hasLook && (
                    <div className="px-3 py-2 rounded-xl bg-amber-500/10 text-[11px] text-amber-200">
                      {t("exportCard.neutralWarning")}
                    </div>
                  )}
                </div>

                {/* 1. Primary Mobile Formats (.kfplug, .cube LUT, Graded Image) */}
                <div data-testid="mobile-export-primary" className="space-y-3">
                  <div className="text-[12px] font-sans font-medium text-[#94A3B8] px-0.5">
                    Mobile Formats
                  </div>

                  {/* Primary .kfplug CTA */}
                  <button
                    type="button"
                    disabled={!canExportGrade || isExporting}
                    onClick={() => handleMobileExportTrigger("kfplug", handleExport)}
                    className={`w-full min-h-[48px] px-4 rounded-2xl text-[13px] font-sans font-semibold inline-flex items-center justify-between transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                      !canExportGrade || isExporting
                        ? "bg-[#0E131D] text-[#64748B] cursor-not-allowed"
                        : "bg-[#F8FAFC] hover:bg-white text-[#090B10] shadow-[0_6px_20px_rgba(56,189,248,0.16)] cursor-pointer"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      {mobileExportedKey === "kfplug" ? (
                        <Check className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Download className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
                      )}
                      <span>
                        {mobileExportedKey === "kfplug"
                          ? t("exportCard.exported")
                          : t("exportCard.exportToKfplug")}
                      </span>
                    </span>
                    <span className="text-[11px] font-mono opacity-65">.kfplug</span>
                  </button>

                  {/* .cube 3D LUT with Sky-Cyan Resolution Pills */}
                  <div className="rounded-2xl bg-[#0E131D] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] p-3.5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-sans font-medium text-[#F8FAFC]">
                        3D LUT (.cube)
                      </span>
                      <div className="inline-flex items-center gap-1 p-0.5 rounded-full bg-[#131A26] border border-white/[0.08]">
                        {[17, 33, 65].map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => {
                              try {
                                navigator.vibrate?.(5);
                              } catch {
                                // ignore
                              }
                              setMobileCubeSize(sz);
                            }}
                            className={`min-w-[38px] min-h-[32px] px-2.5 rounded-full text-[11px] font-mono tabular-nums inline-flex items-center justify-center cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                              mobileCubeSize === sz
                                ? "mobile-glass-active text-[#F8FAFC] font-semibold"
                                : "text-[#94A3B8] hover:text-[#F8FAFC]"
                            }`}
                          >
                            {sz}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!canExportGrade || isExporting}
                      onClick={() =>
                        handleMobileExportTrigger("cube", () => handleExportCube(mobileCubeSize))
                      }
                      className={`w-full min-h-[44px] px-3 rounded-xl text-[12.5px] font-sans font-medium inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                        !canExportGrade || isExporting
                          ? "bg-[#131A26] text-[#64748B] cursor-not-allowed"
                          : "bg-[#131A26] hover:bg-[#1B2536] border border-white/[0.09] text-[#F8FAFC] cursor-pointer"
                      }`}
                    >
                      {mobileExportedKey === "cube" ? (
                        <Check className="w-4 h-4 text-[#38BDF8]" aria-hidden="true" />
                      ) : (
                        <Download className="w-4 h-4 text-[#38BDF8]" aria-hidden="true" />
                      )}
                      <span>
                        {mobileExportedKey === "cube"
                          ? t("exportCard.exported")
                          : `Export .cube (${mobileCubeSize}³)`}
                      </span>
                    </button>
                  </div>

                  {/* Export Graded Image / Frame */}
                  <button
                    type="button"
                    disabled={!hasPreviewImage || isSavingFrame}
                    onClick={() =>
                      handleMobileExportTrigger("gradedImage", () =>
                        handleSaveImage({
                          format: "png",
                          quality: 95,
                          layout: "graded",
                          splitPos: exportSplitPos,
                        })
                      )
                    }
                    className={`w-full min-h-[48px] px-4 rounded-2xl text-[13px] font-sans font-medium inline-flex items-center justify-between transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                      !hasPreviewImage || isSavingFrame
                        ? "bg-[#0E131D] text-[#64748B] cursor-not-allowed"
                        : "bg-[#0E131D] hover:bg-[#131A26] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-[#F8FAFC] cursor-pointer"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2.5">
                      {mobileExportedKey === "gradedImage" ? (
                        <Check className="w-4 h-4 text-[#38BDF8]" aria-hidden="true" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-[#38BDF8]" aria-hidden="true" />
                      )}
                      <span>
                        {isSavingFrame
                          ? t("savePopover.rendering")
                          : mobileExportedKey === "gradedImage"
                          ? "Graded Frame Saved"
                          : "Export Graded Frame"}
                      </span>
                    </span>
                    <span className="text-[11px] font-mono text-[#7DD3FC]">PNG</span>
                  </button>
                </div>

                {/* 2. Native Share File */}
                <div
                  data-testid="mobile-native-share-card"
                  className="rounded-2xl bg-[#0E131D] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-sans font-semibold text-[#F8FAFC]">
                        Share File
                      </div>
                      <div className="text-[11px] font-sans text-[#94A3B8] truncate">
                        Send to KeyFlow, Messages, or Files
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-full bg-[#131A26] border border-white/[0.08] shrink-0">
                      {[
                        { id: "kfplug", label: ".kfplug" },
                        { id: "cube", label: ".cube" },
                        { id: "image", label: "PNG" },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setMobileShareFormat(opt.id)}
                          className={`min-h-[30px] px-2.5 rounded-full text-[10.5px] font-mono cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                            mobileShareFormat === opt.id
                              ? "mobile-glass-active text-[#F8FAFC] font-semibold"
                              : "text-[#94A3B8] hover:text-[#F8FAFC]"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="mobile-share-file-btn"
                    disabled={
                      isMobileSharingFile ||
                      (mobileShareFormat === "image" ? !hasPreviewImage : !canExportGrade)
                    }
                    onClick={() => handleMobileNativeShare(mobileShareFormat)}
                    className={`w-full min-h-[46px] px-4 rounded-xl text-[13px] font-sans font-semibold inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                      isMobileSharingFile ||
                      (mobileShareFormat === "image" ? !hasPreviewImage : !canExportGrade)
                        ? "bg-[#131A26] text-[#64748B] cursor-not-allowed"
                        : "bg-[#38BDF8]/18 hover:bg-[#38BDF8]/26 border border-[#38BDF8]/40 text-[#F8FAFC] shadow-[inset_0_1px_0_rgba(186,230,253,0.3)] cursor-pointer"
                    }`}
                  >
                    <Share2 className="w-4 h-4 text-[#7DD3FC]" aria-hidden="true" />
                    <span>
                      {isMobileSharingFile
                        ? "Preparing File..."
                        : `Share ${
                            mobileShareFormat === "image"
                              ? "Graded PNG"
                              : `.${mobileShareFormat}`
                          }`}
                    </span>
                  </button>
                </div>

                {/* 3. Secondary Desktop & Bundles (.ffx, Promo Card, Full .ZIP Bundle) */}
                <div data-testid="mobile-export-secondary" className="space-y-3">
                  <div className="text-[12px] font-sans font-medium text-[#94A3B8] px-0.5">
                    Desktop &amp; Bundles
                  </div>

                  {/* Export .ffx (AE Lumetri) */}
                  <button
                    type="button"
                    disabled={!canExportGrade || isExporting}
                    onClick={() => handleMobileExportTrigger("ffx", handleExportFfx)}
                    className={`w-full min-h-[46px] px-4 rounded-2xl text-[13px] font-sans font-medium inline-flex items-center justify-between transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                      !canExportGrade || isExporting
                        ? "bg-[#0E131D] text-[#64748B] cursor-not-allowed"
                        : "bg-[#0E131D] hover:bg-[#131A26] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-[#F8FAFC] cursor-pointer"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2.5">
                      {mobileExportedKey === "ffx" ? (
                        <Check className="w-4 h-4 text-[#38BDF8]" aria-hidden="true" />
                      ) : (
                        <Download className="w-4 h-4 text-[#94A3B8]" aria-hidden="true" />
                      )}
                      <span>
                        {mobileExportedKey === "ffx"
                          ? t("exportCard.exportedFfx")
                          : "After Effects Lumetri"}
                      </span>
                    </span>
                    <span className="text-[11px] font-mono text-[#7DD3FC]">.ffx</span>
                  </button>

                  {/* Promo Card with Sky-Cyan Aspect Pills */}
                  <div className="rounded-2xl bg-[#0E131D] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] p-3.5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-sans font-medium text-[#F8FAFC]">
                        {t("savePopover.promoCard")}
                      </span>
                      <div className="inline-flex items-center gap-1 p-0.5 rounded-full bg-[#131A26] border border-white/[0.08]">
                        {["16:9", "9:16", "1:1"].map((ar) => (
                          <button
                            key={ar}
                            type="button"
                            onClick={() => setMobilePromoAspect(ar)}
                            className={`min-h-[30px] px-2.5 rounded-full text-[10.5px] font-mono tabular-nums cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                              mobilePromoAspect === ar
                                ? "mobile-glass-active text-[#F8FAFC] font-semibold"
                                : "text-[#94A3B8] hover:text-[#F8FAFC]"
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
                      className={`w-full min-h-[44px] px-3 rounded-xl text-[12.5px] font-sans font-medium inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                        !hasPreviewImage || isSavingFrame
                          ? "bg-[#131A26] text-[#64748B] cursor-not-allowed"
                          : "bg-[#131A26] hover:bg-[#1B2536] border border-white/[0.09] text-[#F8FAFC] cursor-pointer"
                      }`}
                    >
                      {mobileExportedKey === "promo" ? (
                        <Check className="w-4 h-4 text-[#38BDF8]" aria-hidden="true" />
                      ) : (
                        <QrCode className="w-4 h-4 text-[#38BDF8]" aria-hidden="true" />
                      )}
                      <span>
                        {isSavingFrame
                          ? t("savePopover.rendering")
                          : mobileExportedKey === "promo"
                          ? t("inspector.promoCardSaved")
                          : t("inspector.exportPromoCard")}
                      </span>
                    </button>
                  </div>

                  {/* Full .ZIP Bundle + Video / More */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={!canExportGrade || isExporting}
                      onClick={() =>
                        handleMobileExportTrigger("zip", () => handleExportZipPack(mobileCubeSize))
                      }
                      className={`min-h-[46px] px-3 rounded-2xl text-[12px] font-sans font-medium inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                        !canExportGrade || isExporting
                          ? "bg-[#0E131D] text-[#64748B] cursor-not-allowed"
                          : "bg-[#0E131D] hover:bg-[#131A26] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-[#F8FAFC] cursor-pointer"
                      }`}
                    >
                      {mobileExportedKey === "zip" ? (
                        <Check className="w-3.5 h-3.5 text-[#38BDF8]" aria-hidden="true" />
                      ) : (
                        <Package className="w-3.5 h-3.5 text-[#38BDF8]" aria-hidden="true" />
                      )}
                      <span>Full .ZIP Pack</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsExportModalOpen(true)}
                      className="min-h-[46px] px-3 rounded-2xl bg-[#0E131D] hover:bg-[#131A26] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-[12px] font-sans font-medium text-[#CBD5E1] hover:text-[#F8FAFC] inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
                    >
                      <Film className="w-3.5 h-3.5 text-[#94A3B8]" aria-hidden="true" />
                      <span>Video &amp; More</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* TABLET (768px..1023px): Preserved Original Export Workspace */}
              <div className="hidden md:block divide-y divide-[#AAB7C5]/14">
              {/* Preset Name Input (Flush Section) */}
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="mobile-preset-name"
                    className="text-[10px] font-sans font-semibold uppercase tracking-[0.08em] text-[#AAB7C5]"
                  >
                    {t("exportCard.presetNameLabel")}
                  </label>
                  <span className="text-[10px] font-mono text-[#AAB7C5] truncate max-w-[175px]">
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
                  className="w-full h-10 px-2.5 rounded-md bg-[#11161F] border border-[#AAB7C5]/18 text-xs text-[#F4F7FB] placeholder:text-[#AAB7C5]/75 focus:outline-none focus:border-[#7FA3C2]"
                />

                {isNeutralGrade && hasLook && (
                  <div className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[10.5px] text-amber-200">
                    {t("exportCard.neutralWarning")}
                  </div>
                )}

                {/* Primary .kfplug Plugin Export */}
                <button
                  type="button"
                  disabled={!canExportGrade || isExporting}
                  onClick={() => handleMobileExportTrigger("kfplug", handleExport)}
                  className={`w-full min-h-[44px] px-3 rounded-lg text-xs font-sans font-semibold inline-flex items-center justify-between transition-colors ${
                    !canExportGrade || isExporting
                      ? "bg-[#11161F] text-[#AAB7C5]/40 border border-[#AAB7C5]/10 cursor-not-allowed"
                      : "bg-[#F4F7FB] hover:bg-[#FBFDFF] text-[#0A0C10] cursor-pointer"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    {mobileExportedKey === "kfplug" ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Download className="w-4 h-4 stroke-[2]" />
                    )}
                    <span>
                      {mobileExportedKey === "kfplug"
                        ? t("exportCard.exported")
                        : t("exportCard.exportToKfplug")}
                    </span>
                  </span>
                  <span className="text-[10px] font-mono opacity-75">.kfplug</span>
                </button>
              </div>

              {/* .cube 3D LUT + Grid Selector & .ffx Lumetri */}
              <div className="p-3 grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-mono font-semibold text-[#F4F7FB]">.cube LUT</span>
                    <div className="flex items-center gap-1">
                      {[17, 33, 65].map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setMobileCubeSize(sz)}
                          className={`min-w-[36px] min-h-[40px] px-2 rounded-md text-[10.5px] font-mono tabular-nums inline-flex items-center justify-center cursor-pointer transition-colors ${
                            mobileCubeSize === sz
                              ? "bg-[#F4F7FB] text-[#0A0C10] font-semibold"
                              : "bg-[#11161F] text-[#AAB7C5] hover:text-[#F4F7FB] border border-[#AAB7C5]/14"
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!canExportGrade || isExporting}
                    onClick={() =>
                      handleMobileExportTrigger("cube", () => handleExportCube(mobileCubeSize))
                    }
                    className={`w-full min-h-[44px] px-2.5 rounded-md text-[11px] font-sans font-medium inline-flex items-center justify-center gap-1.5 border transition-colors ${
                      !canExportGrade || isExporting
                        ? "bg-[#11161F]/60 text-[#AAB7C5]/35 border-[#AAB7C5]/10 cursor-not-allowed"
                        : "bg-[#11161F] hover:bg-[#1C2430] text-[#F4F7FB] border-[#AAB7C5]/18 cursor-pointer"
                    }`}
                  >
                    {mobileExportedKey === "cube" ? (
                      <Check className="w-3.5 h-3.5 text-[#93B8D8]" />
                    ) : (
                      <Download className="w-3.5 h-3.5 text-[#93B8D8]" />
                    )}
                    <span>
                      {mobileExportedKey === "cube"
                        ? t("exportCard.exported")
                        : t("exportCard.exportCube")}
                    </span>
                  </button>
                </div>

                <div className="flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between gap-1 min-h-[40px]">
                    <span className="text-[11px] font-mono font-semibold text-[#F4F7FB]">.ffx</span>
                    <span className="text-[10px] font-sans text-[#AAB7C5]">AE Lumetri</span>
                  </div>
                  <button
                    type="button"
                    disabled={!canExportGrade || isExporting}
                    onClick={() => handleMobileExportTrigger("ffx", handleExportFfx)}
                    className={`w-full min-h-[44px] px-2.5 rounded-md text-[11px] font-sans font-medium inline-flex items-center justify-center gap-1.5 border transition-colors ${
                      !canExportGrade || isExporting
                        ? "bg-[#11161F]/60 text-[#AAB7C5]/35 border-[#AAB7C5]/10 cursor-not-allowed"
                        : "bg-[#11161F] hover:bg-[#1C2430] text-[#F4F7FB] border-[#AAB7C5]/18 cursor-pointer"
                    }`}
                  >
                    {mobileExportedKey === "ffx" ? (
                      <Check className="w-3.5 h-3.5 text-[#93B8D8]" />
                    ) : (
                      <Download className="w-3.5 h-3.5 text-[#93B8D8]" />
                    )}
                    <span>
                      {mobileExportedKey === "ffx"
                        ? t("exportCard.exportedFfx")
                        : t("exportCard.exportFfx")}
                    </span>
                  </button>
                </div>
              </div>

              {/* Export Promo Card (Flush Section) */}
              <div className="p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-sans font-semibold text-[#F4F7FB]">
                      {t("savePopover.promoCard")}
                    </div>
                    <div className="text-[10.5px] font-sans text-[#AAB7C5] truncate">
                      {t("inspector.promoCardDesc")}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {["16:9", "9:16", "1:1"].map((ar) => (
                      <button
                        key={ar}
                        type="button"
                        onClick={() => setMobilePromoAspect(ar)}
                        className={`min-h-[40px] px-2.5 rounded-md text-[10.5px] font-mono tabular-nums inline-flex items-center justify-center cursor-pointer transition-colors ${
                          mobilePromoAspect === ar
                            ? "bg-[#F4F7FB] text-[#0A0C10] font-semibold"
                            : "bg-[#11161F] text-[#AAB7C5] hover:text-[#F4F7FB] border border-[#AAB7C5]/14"
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
                  className={`w-full min-h-[44px] px-3 rounded-md text-xs font-sans font-medium inline-flex items-center justify-center gap-1.5 border transition-colors ${
                    !hasPreviewImage || isSavingFrame
                      ? "bg-[#11161F]/60 text-[#AAB7C5]/35 border-[#AAB7C5]/10 cursor-not-allowed"
                      : "bg-[#11161F] hover:bg-[#1C2430] text-[#F4F7FB] border-[#AAB7C5]/18 cursor-pointer"
                  }`}
                >
                  {mobileExportedKey === "promo" ? (
                    <Check className="w-3.5 h-3.5 text-[#93B8D8]" />
                  ) : (
                    <QrCode className="w-3.5 h-3.5 text-[#93B8D8]" />
                  )}
                  <span>
                    {isSavingFrame
                      ? t("savePopover.rendering")
                      : mobileExportedKey === "promo"
                      ? t("inspector.promoCardSaved")
                      : t("inspector.exportPromoCard")}
                  </span>
                </button>

                {/* Full Export Modal (Video / Frame / ZIP / Calibration) */}
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(true)}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-transparent hover:bg-[#1C2430] border border-[#AAB7C5]/16 text-[11px] font-sans font-medium text-[#C9D7E2] hover:text-[#F4F7FB] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Package className="w-3.5 h-3.5 text-[#93B8D8]" />
                  <span>{t("inspector.moreExportOptions")}</span>
                </button>
              </div>
              </div>
            </div>
          )}
        </div>

        {/* C. RIGHT INSPECTOR (340px on desktop, collapsible via ']') - Engine, Grading & Pinned Export Footer */}
        <aside
          className={`hidden lg:order-3 bg-[#11161F] border-t lg:border-t-0 lg:border-l border-[#AAB7C5]/14 shadow-[inset_0_1px_0_rgba(244,247,251,0.04)] ${
            isRightCollapsed ? "lg:hidden" : "lg:flex"
          } flex-col lg:min-h-0 ${
            workspacePhase === "entering" ? "workstation-col-right-enter" : ""
          }`}
        >
          {/* Scrollable Inspector Controls (Flush DaVinci-style panels separated by 1px hairline dividers) */}
          <div className="flex-1 lg:min-h-0 lg:overflow-y-auto divide-y divide-[#AAB7C5]/14">
            {/* 1. Compact Single-Row Segmented Solver Bar + Concise Single-Line Description */}
            <section className="px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-expanded={isEngineSectionOpen}
                  onClick={() => setIsEngineSectionOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-left group cursor-pointer"
                >
                  <Cpu className="w-3 h-3 text-[#7FA3C2] group-hover:text-[#F4F7FB] transition-colors duration-150" />
                  <h3 className="text-[10.5px] font-sans font-semibold uppercase tracking-[0.06em] text-[#F4F7FB] transition-colors duration-150">
                    {t("inspector.colorMatchEngine")}
                  </h3>
                  <ChevronDown
                    className={`studio-chevron w-3 h-3 text-[#AAB7C5] group-hover:text-[#F4F7FB] ${
                      isEngineSectionOpen ? "rotate-180" : "rotate-0"
                    }`}
                  />
                </button>

                <div className="flex items-center gap-1.5">
                  {!isEngineSectionOpen && (
                    <span className="text-[10px] font-mono text-[#F4F7FB] px-1.5 py-0.5 rounded bg-[#0A0C10] border border-[#4A6B86]/55">
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
                          ? "bg-[#F4F7FB] text-[#0A0C10] border-[#F4F7FB]"
                          : "bg-[#0A0C10] text-[#AAB7C5] hover:text-[#F4F7FB] border-[#AAB7C5]/16"
                      }`}
                    >
                      ?
                    </button>

                    {engineComparePresence.isMounted && (
                      <div
                        data-state={engineComparePresence.state}
                        className="studio-popover origin-top-right absolute right-0 top-full mt-1.5 w-72 z-50 rounded-lg bg-[#11161F]/96 backdrop-blur-xl border border-[#AAB7C5]/18 shadow-[inset_0_1px_0_rgba(244,247,251,0.06),0_16px_40px_rgba(0,0,0,0.85)] p-3 space-y-2 text-left"
                      >
                        <div className="text-[10px] font-sans font-semibold uppercase tracking-[0.08em] text-[#AAB7C5] border-b border-[#AAB7C5]/14 pb-1.5">
                          {t("inspector.enginePipelines")}
                        </div>
                        {engineOptions.map((eng) => (
                          <div
                            key={eng.id}
                            className={`p-2 rounded-md border ${
                              activeEngineId === eng.id
                                ? "bg-[#1C2430] border-[#4A6B86]/65"
                                : "bg-[#0A0C10] border-[#AAB7C5]/12"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-sans font-semibold text-[#F4F7FB]">
                                {eng.name} {eng.versionBadge}
                              </span>
                              <span className="text-[10px] font-sans text-[#AAB7C5]">{eng.subtitle}</span>
                            </div>
                            <p className="text-[10px] font-sans text-[#AAB7C5] mt-0.5 leading-snug">
                              {eng.summary}
                            </p>
                            {Array.isArray(eng.pipelineBadges) && eng.pipelineBadges.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {eng.pipelineBadges.map((badge) => (
                                  <span
                                    key={badge}
                                    className="px-1.5 py-0.5 rounded bg-[#0A0C10]/80 border border-[#AAB7C5]/14 text-[9px] font-mono text-[#C9D7E2]"
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

              {/* Single-Row Segmented Solver Bar (Altair 4.5 · Altair 4.0 · Polaris 3.5) + Single-Line Subtitle */}
              <div
                className="studio-collapse-grid"
                data-expanded={isEngineSectionOpen}
                aria-hidden={!isEngineSectionOpen}
              >
                <div className="studio-collapse-inner">
                  <div className="mt-2.5 space-y-2">
                    <div
                      ref={engineTierContainerRef}
                      role="tablist"
                      aria-label={t("engineCard.selectorAria")}
                      className="relative grid grid-cols-3 gap-0.5 p-0.5 rounded-md bg-[#0A0C10] border border-[#AAB7C5]/14"
                    >
                      <div
                        aria-hidden="true"
                        className="studio-sliding-pill pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-[4px] bg-[#4A6B86]/32 border border-[#7FA3C2]/55"
                        style={engineTierPillStyle}
                      />
                      {engineOptions.map((eng) => {
                        const isActive = activeEngineId === eng.id;
                        const shortName =
                          eng.id === "altair_refresh"
                            ? "Altair 4.5"
                            : `${eng.name} ${eng.versionBadge}`;
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
                            className={`relative z-10 py-1.5 px-1.5 rounded-[4px] text-[11px] font-sans font-medium transition-[color,transform] duration-150 ease-[var(--ease-shutter)] active:scale-[0.96] cursor-pointer inline-flex items-center justify-center gap-1 truncate ${
                              isActive
                                ? "text-[#F4F7FB] font-semibold"
                                : "text-[#AAB7C5] hover:text-[#F4F7FB]"
                            }`}
                          >
                            <span className="truncate">{shortName}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Concise Single-Line Solver Description + Telemetry */}
                    <div className="flex items-center justify-between gap-2 text-[10.5px] text-[#AAB7C5]">
                      <span className="font-sans truncate" title={activeEngine.subtitle}>
                        {activeEngine.subtitle}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-[#C9D7E2]">
                        ΔE {liveMetrics.deltaE !== null ? liveMetrics.deltaE.toFixed(2) : "-"}
                      </span>
                    </div>
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
                    className="studio-popover-enter hidden lg:block pointer-events-none z-[85] rounded-lg bg-[#11161F]/96 backdrop-blur-md border border-[#AAB7C5]/18 shadow-[inset_0_1px_0_rgba(244,247,251,0.06),0_14px_34px_rgba(0,0,0,0.85)] p-2.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-sans font-semibold text-[#F4F7FB]">
                        {hoveredEngineTip.eng.name} {hoveredEngineTip.eng.versionBadge}
                      </span>
                      <span className="text-[10px] font-mono text-[#93B8D8]">
                        {hoveredEngineTip.eng.functionalTag || hoveredEngineTip.eng.shortTag}
                      </span>
                    </div>
                    <p className="text-[10px] font-sans text-[#AAB7C5] leading-snug">
                      {hoveredEngineTip.eng.bestFor}
                    </p>
                    {Array.isArray(hoveredEngineTip.eng.pipelineBadges) && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {hoveredEngineTip.eng.pipelineBadges.map((badge) => (
                          <span
                            key={badge}
                            className="px-1.5 py-0.5 rounded bg-[#0A0C10] border border-[#AAB7C5]/14 text-[9px] font-mono text-[#C9D7E2]"
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
            <section className="px-3.5 py-3 space-y-2.5">
              {activeEngineId === "altair_refresh" && (
                <>
                  <ParameterSlider
                    paramKey="sourceNormalize"
                    label={t("inspector.sourceNormalize")}
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
                    label={t("inspector.styleSigma")}
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
                label={
                  activeEngine?.usesLut32
                    ? t("inspector.matchIntensity")
                    : t("engineCard.matchStrengthLabel")
                }
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
                label={t("inspector.skinProtect")}
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
            <section className="px-3.5 py-3 space-y-4">
              {/* Segmented Grading Tab Switcher */}
              <div
                ref={gradingTabContainerRef}
                className="relative grid grid-cols-3 gap-0.5 p-0.5 rounded-md bg-[#0A0C10] border border-[#AAB7C5]/14"
              >
                <div
                  aria-hidden="true"
                  className="studio-sliding-pill pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-[4px] bg-[#1C2430] border border-[#4A6B86]/55"
                  style={gradingTabPillStyle}
                />
                {[
                  { id: "primary", label: t("inspector.tabPrimary"), modified: isPrimaryModified },
                  { id: "wheels", label: t("inspector.tabWheels"), modified: isWheelsModified },
                  { id: "hue6v", label: t("inspector.tabHue6V"), modified: isHue6VModified },
                ].map((tab) => {
                  const active = gradingTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      ref={registerGradingTabRef(tab.id)}
                      type="button"
                      onClick={() => setGradingTab(tab.id)}
                      className={`relative z-10 py-1 rounded-[4px] text-[11px] font-sans font-medium transition-[color,transform] duration-150 ease-[var(--ease-shutter)] active:scale-[0.96] cursor-pointer inline-flex items-center justify-center gap-1.5 ${
                        active
                          ? "text-[#F4F7FB]"
                          : "text-[#AAB7C5] hover:text-[#F4F7FB]"
                      }`}
                    >
                      <span>{tab.label}</span>
                      {tab.modified && (
                        <span
                          aria-hidden="true"
                          className="w-1.5 h-1.5 rounded-full bg-[#93B8D8] shrink-0"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* PRIMARY TAB: Compact 2-Column Grid of all 10 Hairline Scrubbers + Collapsible Tone & Roll-Off */}
              {gradingTab === "primary" && (
                <div key="primary" className="studio-panel-fade space-y-4">
                  <div className="grid grid-cols-2 gap-x-3.5 gap-y-2">
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
                  <div className="pt-3 border-t border-[#AAB7C5]/14">
                    <button
                      type="button"
                      aria-expanded={isToneRollOffOpen}
                      onClick={() => setIsToneRollOffOpen((v) => !v)}
                      className="w-full py-0.5 flex items-center justify-between gap-2 text-left group cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-sans font-semibold uppercase tracking-[0.08em] text-[#AAB7C5] group-hover:text-[#F4F7FB] transition-colors duration-150">
                        <span>{t("inspector.toneAndRollOff")}</span>
                        <ChevronDown
                          className={`studio-chevron w-3 h-3 text-[#AAB7C5] group-hover:text-[#F4F7FB] ${
                            isToneRollOffOpen ? "rotate-180" : "rotate-0"
                          }`}
                        />
                      </span>
                      <span className="text-[10px] font-mono text-[#AAB7C5]">
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

                          {/* Auto-Normalize Target Toggle Flush Row */}
                          <div className="pt-2 mt-1 border-t border-[#AAB7C5]/14">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={autoNormalizeTarget}
                              tabIndex={isToneRollOffOpen ? 0 : -1}
                              title={t("engineCard.autoNormalizeTooltip")}
                              onClick={() => handleToggleAutoNormalizeTarget(!autoNormalizeTarget)}
                              className="w-full py-1.5 flex items-center justify-between gap-2 text-left cursor-pointer group"
                            >
                              <div className="min-w-0">
                                <div className="text-[11px] font-sans font-medium text-[#C9D7E2] group-hover:text-[#F4F7FB] leading-tight">
                                  {t("engineCard.autoNormalizeTitle")}
                                </div>
                                <div className="text-[10px] font-sans text-[#AAB7C5] truncate mt-0.5">
                                  {t("engineCard.autoNormalizeSub")}
                                </div>
                              </div>
                              <span
                                className={`nle-switch relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border ${
                                  autoNormalizeTarget
                                    ? "bg-[#4A6B86]/45 border-[#7FA3C2]/65"
                                    : "bg-[#0A0C10] border-[#AAB7C5]/20"
                                }`}
                              >
                                <span
                                  className={`inline-block h-3 w-3 rounded-full transition-transform ${
                                    autoNormalizeTarget
                                      ? "translate-x-3 bg-[#93B8D8]"
                                      : "translate-x-0.5 bg-[#AAB7C5]"
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
                  <div className="pt-3 border-t border-[#AAB7C5]/14">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-expanded={isMasterLevelsOpen}
                        onClick={() => setIsMasterLevelsOpen((v) => !v)}
                        className="inline-flex items-center gap-1.5 text-[10px] font-sans font-semibold uppercase tracking-[0.08em] text-[#AAB7C5] hover:text-[#F4F7FB] transition-colors duration-150 cursor-pointer"
                      >
                        <span>{t("inspector.masterLevelsOffset")}</span>
                        <ChevronDown
                          className={`studio-chevron w-3 h-3 text-[#AAB7C5] ${
                            isMasterLevelsOpen ? "rotate-180" : "rotate-0"
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={handleResetAllWheels}
                        disabled={!isWheelsModified}
                        className={`text-[10.5px] font-sans font-medium transition-colors ${
                          isWheelsModified
                            ? "text-[#C9D7E2] hover:text-[#F4F7FB] cursor-pointer"
                            : "text-[#AAB7C5]/35 cursor-not-allowed"
                        }`}
                      >
                        {t("inspector.resetWheels")}
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
                  <div className="pt-3 border-t border-[#AAB7C5]/14">
                    <button
                      type="button"
                      aria-expanded={isToneRollOffOpen}
                      onClick={() => setIsToneRollOffOpen((v) => !v)}
                      className="w-full flex items-center justify-between gap-2 text-left group cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-sans font-semibold uppercase tracking-[0.08em] text-[#AAB7C5] group-hover:text-[#F4F7FB] transition-colors duration-150">
                        <span>{t("inspector.toneAndRollOff")}</span>
                        <ChevronDown
                          className={`studio-chevron w-3 h-3 text-[#AAB7C5] group-hover:text-[#F4F7FB] ${
                            isToneRollOffOpen ? "rotate-180" : "rotate-0"
                          }`}
                        />
                      </span>
                      <span className="text-[10px] font-mono text-[#AAB7C5]">
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

                          <div className="pt-2 mt-1 border-t border-[#AAB7C5]/14">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={autoNormalizeTarget}
                              tabIndex={isToneRollOffOpen ? 0 : -1}
                              title={t("engineCard.autoNormalizeTooltip")}
                              onClick={() => handleToggleAutoNormalizeTarget(!autoNormalizeTarget)}
                              className="w-full py-1.5 flex items-center justify-between gap-2 text-left cursor-pointer group"
                            >
                              <div className="min-w-0">
                                <div className="text-[11px] font-sans font-medium text-[#C9D7E2] group-hover:text-[#F4F7FB] leading-tight">
                                  {t("engineCard.autoNormalizeTitle")}
                                </div>
                                <div className="text-[10px] font-sans text-[#AAB7C5] truncate mt-0.5">
                                  {t("engineCard.autoNormalizeSub")}
                                </div>
                              </div>
                              <span
                                className={`nle-switch relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border ${
                                  autoNormalizeTarget
                                    ? "bg-[#4A6B86]/45 border-[#7FA3C2]/65"
                                    : "bg-[#0A0C10] border-[#AAB7C5]/20"
                                }`}
                              >
                                <span
                                  className={`inline-block h-3 w-3 rounded-full transition-transform ${
                                    autoNormalizeTarget
                                      ? "translate-x-3 bg-[#93B8D8]"
                                      : "translate-x-0.5 bg-[#AAB7C5]"
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

          {/* 4. Pinned Bottom Action Bar: Reset + Crisp Arctic Ink Export CTA */}
          <div className="shrink-0 px-3.5 py-2.5 bg-[#11161F] border-t border-[#AAB7C5]/14 flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetParams}
              title={t("paramsCard.resetTitle")}
              className="flex-1 h-8 rounded-md bg-[#0A0C10] hover:bg-[#1C2430] border border-[#AAB7C5]/16 text-xs font-sans font-medium text-[#C9D7E2] hover:text-[#F4F7FB] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#93B8D8]" />
              <span>{t("paramsCard.reset")}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className="m3-btn-primary-morph flex-[1.5] h-8 rounded-md bg-[#F4F7FB] hover:bg-[#FBFDFF] text-[#0A0C10] text-xs font-sans font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 stroke-[2]" />
              <span>{t("exportCard.exportShort")}</span>
            </button>
          </div>
        </aside>
      </div>

      {/* TIER 2: FLOATING LIQUID-GLASS MOBILE STUDIO BOTTOM PILL (< lg when in Studio) */}
      {activeTab === "home" && workspacePhase !== "hidden" && (
        <LiquidGlassTabBar
          ariaLabel="Mobile studio navigation"
          activeTabId={isLooksOpen ? "looks" : mobileDeckTab}
          tabs={[
            { id: "match", label: t("inspector.tabMatch"), icon: Cpu },
            { id: "adjust", label: t("inspector.tabAdjust"), icon: Sliders },
            { id: "scopes", label: t("inspector.tabScopes"), icon: Activity },
            { id: "looks", label: t("nav.looks"), icon: Bookmark },
            { id: "export", label: t("inspector.tabExport"), icon: Package },
          ]}
          onPreviewTab={(tabId) => {
            if (tabId !== "looks") {
              setIsLooksOpen(false);
              setMobileDeckTab(tabId);
            }
          }}
          onCommitTab={(tabId, { isTap }) => {
            if (tabId === "looks") {
              setIsLooksOpen((prev) => (isTap ? !prev : true));
            } else {
              setIsLooksOpen(false);
              setMobileDeckTab(tabId);
            }
          }}
        />
      )}

      {/* SECONDARY VIEWS (Settings / About / Support): Aligned 2-Column Layout without Jump-to-Section */}
      {activeTab !== "home" && (
        <Suspense fallback={null}>
          <InteractiveStudioBackdrop
            ref={secondaryScrollRef}
            as="main"
            refreshKey={activeTab}
            className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8"
          >
          <div className="py-6 sm:py-10 lg:py-12">
            {/* Mobile (< lg) Single-Row Secondary View Switcher */}
            <nav
              aria-label="Mobile page switcher"
              className="lg:hidden max-w-6xl mx-auto mb-6 flex items-center gap-1 p-1 rounded-full bg-[#11161F]/92 border border-[#AAB7C5]/15 overflow-x-auto no-scrollbar"
            >
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
                  className={`flex-1 min-h-[40px] px-3 py-1.5 rounded-full font-sans text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    activeTab === item.id
                      ? "bg-[#4A6B86]/35 border border-[#7FA3C2]/55 text-[#F4F7FB] font-semibold"
                      : "border border-transparent text-[#AAB7C5] hover:text-[#F4F7FB]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            {/* SETTINGS STUDIO VIEW */}
            {activeTab === "settings" && (
              <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8 items-start studio-view-enter">
                {/* Left Column: Aligned Studio Summary Card (Zero Jump-to-Section) */}
                <aside className="lg:sticky lg:top-8 bg-[#11161F]/92 border border-[#AAB7C5]/14 rounded-xl p-5 flex flex-col gap-5">
                  <div className="pb-4 border-b border-[#AAB7C5]/14 space-y-1.5">
                    <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-[#7FA3C2]">
                      STUDIO PREFERENCES
                    </div>
                    <h1 className="font-display text-xl font-semibold text-[#F4F7FB] tracking-tight text-balance">
                      {t("nav.settings")}
                    </h1>
                    <p className="font-sans text-xs text-[#AAB7C5] leading-relaxed">
                      {t("settings.railSub")}
                    </p>
                  </div>

                  {/* Live Engine & Calibration Summary */}
                  <div className="space-y-3">
                    <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#AAB7C5]">
                      {t("settings.engineStatusLabel")}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        aria-hidden="true"
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          webglPhotoError ? "bg-amber-400" : "bg-[#93B8D8]"
                        }`}
                      />
                      <span className="font-sans font-medium text-[#F4F7FB] truncate">
                        {activeEngine.name} · {webglPhotoError ? "CPU 2D" : "WebGL GPU"}
                      </span>
                    </div>

                    <dl className="pt-2 border-t border-[#AAB7C5]/12 space-y-2 font-mono text-[11px] tabular-nums">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-[#AAB7C5]">Calibration</dt>
                        <dd className={isCalibrationActive ? "text-[#93B8D8]" : "text-[#C9D7E2]"}>
                          {isCalibrationActive ? "Custom" : "1.00x"}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-[#AAB7C5]">Pipeline ΔE</dt>
                        <dd className="text-[#F4F7FB]">
                          {calibrationStatus.deltaE} · {calibrationStatus.latencyMs}ms
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-[#AAB7C5]">Resolution</dt>
                        <dd className="text-[#C9D7E2]">
                          {analysisMaxDim} / {previewMaxDim}px
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-[#AAB7C5]">Language</dt>
                        <dd className="text-[#C9D7E2]">{lang.toUpperCase()}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="pt-4 border-t border-[#AAB7C5]/14">
                    <button
                      type="button"
                      onClick={() => setActiveTab("home")}
                      className="w-full min-h-[42px] inline-flex items-center justify-between gap-2 px-4 py-2 rounded-lg bg-[#F4F7FB] hover:bg-[#FBFDFF] font-sans text-xs font-semibold text-[#0A0C10] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93B8D8]"
                    >
                      <span>{t("settings.returnToWorkspace")}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#0A0C10] shrink-0" strokeWidth={1.75} />
                    </button>
                  </div>
                </aside>

                {/* Right Column: Aligned Studio Preference Cards */}
                <div className="space-y-5 min-w-0">
                  {/* Card 01: Interface & Language */}
                  <section
                    id="settings-interface"
                    className="rounded-xl border border-[#AAB7C5]/14 bg-[#11161F]/92 p-5 space-y-4"
                  >
                    <div className="pb-3.5 border-b border-[#AAB7C5]/14 flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-2.5">
                        <span className="font-mono text-xs font-semibold text-[#7FA3C2] tabular-nums">
                          01
                        </span>
                        <h2 className="font-display text-[15px] font-semibold text-[#F4F7FB] tracking-tight">
                          {t("settings.secInterface")}
                        </h2>
                      </div>
                      <span className="font-mono text-xs text-[#C9D7E2] tabular-nums">
                        {lang.toUpperCase()}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-8 items-start md:items-center">
                      <div className="md:col-span-7 space-y-1">
                        <h3 className="font-sans text-sm font-semibold text-[#F4F7FB]">
                          {t("settings.languageHeading")}
                        </h3>
                        <p className="font-sans text-xs text-[#AAB7C5] leading-relaxed">
                          {t("settings.languageDesc")}
                        </p>
                      </div>

                      <div className="md:col-span-5 flex md:justify-end">
                        <div
                          role="group"
                          aria-label={t("settings.languageHeading")}
                          className="inline-flex items-center p-1 rounded-xl bg-[#0A0C10] border border-[#AAB7C5]/14"
                        >
                          {[
                            { code: "en", label: "English", badge: "EN" },
                            { code: "id", label: "Indonesia", badge: "ID" },
                          ].map((opt) => {
                            const isSelected = lang === opt.code;
                            return (
                              <button
                                key={opt.code}
                                type="button"
                                onClick={() => handleSwitchLanguage(opt.code)}
                                aria-pressed={isSelected}
                                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg font-sans text-xs inline-flex items-center gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2] ${
                                  isSelected
                                    ? "bg-[#4A6B86]/35 border border-[#7FA3C2]/55 text-[#F4F7FB] font-semibold"
                                    : "border border-transparent text-[#AAB7C5] hover:text-[#F4F7FB] font-medium"
                                }`}
                              >
                                <span>{opt.label}</span>
                                <span className="font-mono text-[11px] text-[#C9D7E2] tabular-nums">
                                  {opt.badge}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Card 02: Pipeline & Resolution */}
                  <section
                    id="settings-resolution"
                    className="rounded-xl border border-[#AAB7C5]/14 bg-[#11161F]/92 p-5"
                  >
                    <div className="pb-3.5 border-b border-[#AAB7C5]/14 flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-2.5">
                        <span className="font-mono text-xs font-semibold text-[#7FA3C2] tabular-nums">
                          02
                        </span>
                        <h2 className="font-display text-[15px] font-semibold text-[#F4F7FB] tracking-tight">
                          {t("settings.secResolution")}
                        </h2>
                      </div>
                      <span className="font-mono text-xs text-[#C9D7E2] tabular-nums">
                        {analysisMaxDim}px · {previewMaxDim}px
                      </span>
                    </div>

                    <div className="divide-y divide-[#AAB7C5]/14">
                      {/* Row 1: Reference Analysis Resolution */}
                      <div className="py-4 grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-8 items-start md:items-center">
                        <div className="md:col-span-7 space-y-1">
                          <h3 className="font-sans text-sm font-semibold text-[#F4F7FB]">
                            {t("settings.refResLabel")}
                          </h3>
                          <p className="font-sans text-xs text-[#AAB7C5] leading-relaxed">
                            {t("settings.refResDesc")}
                          </p>
                        </div>

                        <div className="md:col-span-5 flex md:justify-end">
                          <div
                            role="group"
                            aria-label={t("settings.refResLabel")}
                            className="inline-flex items-center p-1 rounded-xl bg-[#0A0C10] border border-[#AAB7C5]/14"
                          >
                            {[720, 1280, 1920].map((dim) => {
                              const isSelected = analysisMaxDim === dim;
                              return (
                                <button
                                  key={dim}
                                  type="button"
                                  onClick={() => setAnalysisMaxDim(dim)}
                                  aria-pressed={isSelected}
                                  className={`min-h-[38px] px-3 py-1.5 rounded-lg font-mono text-xs tabular-nums transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2] ${
                                    isSelected
                                      ? "bg-[#4A6B86]/35 border border-[#7FA3C2]/55 text-[#F4F7FB] font-semibold"
                                      : "border border-transparent text-[#AAB7C5] hover:text-[#F4F7FB]"
                                  }`}
                                >
                                  {dim} px
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Row 2: Live Preview Simulation Resolution */}
                      <div className="pt-4 grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-8 items-start md:items-center">
                        <div className="md:col-span-7 space-y-1">
                          <h3 className="font-sans text-sm font-semibold text-[#F4F7FB]">
                            {t("settings.previewResLabel")}
                          </h3>
                          <p className="font-sans text-xs text-[#AAB7C5] leading-relaxed">
                            {t("settings.previewResDesc")}
                          </p>
                        </div>

                        <div className="md:col-span-5 flex md:justify-end">
                          <div
                            role="group"
                            aria-label={t("settings.previewResLabel")}
                            className="inline-flex items-center p-1 rounded-xl bg-[#0A0C10] border border-[#AAB7C5]/14"
                          >
                            {[640, 960, 1440].map((dim) => {
                              const isSelected = previewMaxDim === dim;
                              return (
                                <button
                                  key={dim}
                                  type="button"
                                  onClick={() => setPreviewMaxDim(dim)}
                                  aria-pressed={isSelected}
                                  className={`min-h-[38px] px-3 py-1.5 rounded-lg font-mono text-xs tabular-nums transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2] ${
                                    isSelected
                                      ? "bg-[#4A6B86]/35 border border-[#7FA3C2]/55 text-[#F4F7FB] font-semibold"
                                      : "border border-transparent text-[#AAB7C5] hover:text-[#F4F7FB]"
                                  }`}
                                >
                                  {dim} px
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Card 03: Self-Calibration & Diagnostics */}
                  <section
                    id="settings-calibration"
                    className="relative rounded-xl border border-[#AAB7C5]/14 bg-[#11161F]/92 p-5 space-y-4 overflow-hidden"
                  >
                    {calibScanKey > 0 && calibScanKey !== completedCalibScanKey && (
                      <div key={calibScanKey} aria-hidden="true" className="studio-scanline-overlay">
                        <div
                          className="studio-scanline-sweep"
                          onAnimationEnd={() => setCompletedCalibScanKey(calibScanKey)}
                        />
                      </div>
                    )}

                    <div className="pb-3.5 border-b border-[#AAB7C5]/14 flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-2.5">
                        <span className="font-mono text-xs font-semibold text-[#7FA3C2] tabular-nums">
                          03
                        </span>
                        <h2 className="font-display text-[15px] font-semibold text-[#F4F7FB] tracking-tight">
                          {t("settings.selfCalTitle")}
                        </h2>
                      </div>
                      <span className="font-mono text-xs text-[#C9D7E2] tabular-nums">
                        ΔE {calibrationStatus.deltaE} · {calibrationStatus.latencyMs} ms
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-8 items-start md:items-center">
                      <div className="md:col-span-7 space-y-2">
                        <p className="font-sans text-xs text-[#AAB7C5] leading-relaxed">
                          {t("settings.selfCalDesc")}
                        </p>
                        <div className="flex flex-wrap items-center gap-2.5 text-xs">
                          <span className="inline-flex items-center gap-1.5 font-sans text-[#C9D7E2]">
                            {calibrationStatus.running ? (
                              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#93B8D8] shrink-0" />
                            )}
                            <span>
                              {calibrationStatus.running
                                ? t("settings.calRunningMsg")
                                : t("settings.calOkMsg")}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="md:col-span-5 flex flex-wrap items-center md:justify-end gap-2">
                        <button
                          type="button"
                          onClick={handleResetCalibration}
                          className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0A0C10]/65 hover:bg-[#1C2430] border border-[#AAB7C5]/18 font-sans text-xs font-medium text-[#C9D7E2] hover:text-[#F4F7FB] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-[#93B8D8]" />
                          <span>{t("settings.resetCal")}</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleRunPipelineCalibration}
                          disabled={calibrationStatus.running}
                          className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg font-sans text-xs font-semibold bg-[#F4F7FB] hover:bg-[#FBFDFF] text-[#0A0C10] disabled:opacity-60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93B8D8]"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${
                              calibrationStatus.running ? "animate-spin" : ""
                            }`}
                          />
                          <span>{t("settings.runCalBtn")}</span>
                        </button>
                      </div>
                    </div>

                    {/* 2px Calibration Progress Hairline */}
                    <div className="relative h-[2px] w-full rounded-full bg-[#AAB7C5]/15 overflow-hidden">
                      {calibrationStatus.running && (
                        <div className="studio-calib-beam absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-transparent via-amber-300/90 to-transparent" />
                      )}
                      {!calibrationStatus.running && calibrationJustLocked && (
                        <div className="studio-calib-lock-flash absolute inset-0 bg-[#93B8D8]" />
                      )}
                    </div>
                  </section>

                  {/* Card 04: Keyflow .kfplug Output Calibration Multipliers */}
                  <section
                    id="settings-multipliers"
                    className="rounded-xl border border-[#AAB7C5]/14 bg-[#11161F]/92 p-5 space-y-4"
                  >
                    <div className="pb-3.5 border-b border-[#AAB7C5]/14 flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-2.5">
                        <span className="font-mono text-xs font-semibold text-[#7FA3C2] tabular-nums">
                          04
                        </span>
                        <h2 className="font-display text-[15px] font-semibold text-[#F4F7FB] tracking-tight">
                          {t("settings.multipliersTitle")}
                        </h2>
                      </div>
                      <span className="font-mono text-xs text-[#C9D7E2] tabular-nums">
                        {t("settings.multipliersRange")}
                      </span>
                    </div>

                    <p className="font-sans text-xs text-[#AAB7C5] leading-relaxed">
                      {t("settings.multipliersDesc")}
                    </p>

                    <div className="pt-1 grid grid-cols-1 sm:grid-cols-3 gap-5 sm:divide-x sm:divide-[#AAB7C5]/14">
                      <div>
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
                          accentEmerald
                          onChange={handleCalibrationChange}
                        />
                      </div>
                      <div className="sm:pl-5">
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
                          accentEmerald
                          onChange={handleCalibrationChange}
                        />
                      </div>
                      <div className="sm:pl-5">
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
                          accentEmerald
                          onChange={handleCalibrationChange}
                        />
                      </div>
                    </div>
                  </section>

                  {/* Card 05: Studio Keyboard Shortcuts */}
                  <section
                    id="settings-shortcuts"
                    className="rounded-xl border border-[#AAB7C5]/14 bg-[#11161F]/92 p-5 space-y-3"
                  >
                    <div className="pb-3.5 border-b border-[#AAB7C5]/14 flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-2.5">
                        <span className="font-mono text-xs font-semibold text-[#7FA3C2] tabular-nums">
                          05
                        </span>
                        <h2 className="font-display text-[15px] font-semibold text-[#F4F7FB] tracking-tight">
                          {t("settings.shortcutsHeading")}
                        </h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsShortcutsOpen(true)}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A0C10]/65 hover:bg-[#1C2430] border border-[#AAB7C5]/18 font-sans text-xs font-medium text-[#C9D7E2] hover:text-[#F4F7FB] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
                      >
                        <span>{t("settings.fullReference")}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-[#93B8D8]" strokeWidth={1.5} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10">
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
                          className="py-2.5 border-b border-[#AAB7C5]/12 last:border-b-0 flex items-center justify-between gap-4"
                        >
                          <span className="font-sans text-xs text-[#C9D7E2] truncate">
                            {sc.desc}
                          </span>
                          <kbd className="px-2 py-0.5 rounded-md bg-[#0A0C10] border border-[#AAB7C5]/18 font-mono text-[11px] text-[#F4F7FB] tabular-nums shrink-0">
                            {sc.keys}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {/* ABOUT STUDIO VIEW */}
            {activeTab === "about" && (
              <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8 items-start studio-view-enter">
                {/* Left Column: Aligned Studio Summary Card (Zero Jump-to-Section) */}
                <aside className="lg:sticky lg:top-8 bg-[#11161F]/92 border border-[#AAB7C5]/14 rounded-xl p-5 flex flex-col gap-5">
                  <div className="pb-4 border-b border-[#AAB7C5]/14 space-y-1.5">
                    <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-[#7FA3C2]">
                      ARCHITECTURE &amp; SPEC
                    </div>
                    <h1 className="font-display text-xl font-semibold text-[#F4F7FB] tracking-tight text-balance">
                      {t("nav.about")}
                    </h1>
                    <p className="font-sans text-xs text-[#AAB7C5] leading-relaxed">
                      {t("about.subtitle")}
                    </p>
                  </div>

                  {/* Live Engine Status & Build Details */}
                  <div className="space-y-3">
                    <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#AAB7C5]">
                      {t("settings.engineStatusLabel")}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        aria-hidden="true"
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          webglPhotoError ? "bg-amber-400" : "bg-[#93B8D8]"
                        }`}
                      />
                      <span className="font-sans font-medium text-[#F4F7FB] truncate">
                        {activeEngine.name} · {webglPhotoError ? "CPU 2D" : "WebGL GPU"}
                      </span>
                    </div>

                    <dl className="pt-2 border-t border-[#AAB7C5]/12 space-y-2 font-mono text-[11px] tabular-nums">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-[#AAB7C5]">Version</dt>
                        <dd className="text-[#F4F7FB]">v1.0.0</dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-[#AAB7C5]">Color Space</dt>
                        <dd className="text-[#C9D7E2]">3D OKLab / Rec.709</dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-[#AAB7C5]">Exports</dt>
                        <dd className="text-[#93B8D8]">.cube · .ffx · .kfplug</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="pt-4 border-t border-[#AAB7C5]/14 space-y-2">
                    <button
                      type="button"
                      onClick={() => setIsReleaseKitOpen(true)}
                      className="w-full min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0A0C10]/65 hover:bg-[#1C2430] border border-[#AAB7C5]/18 font-sans text-xs font-medium text-[#C9D7E2] hover:text-[#F4F7FB] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-[#93B8D8]" strokeWidth={1.5} />
                      <span>{t("about.releasePosterBtn")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleReplayIntro}
                      className="w-full min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0A0C10]/65 hover:bg-[#1C2430] border border-[#AAB7C5]/16 font-sans text-xs font-medium text-[#C9D7E2] hover:text-[#F4F7FB] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
                    >
                      <Play className="w-3.5 h-3.5 text-[#93B8D8]" strokeWidth={1.5} />
                      <span>{t("about.replayIntroBtn")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("home")}
                      className="w-full min-h-[42px] inline-flex items-center justify-between gap-2 px-4 py-2 rounded-lg bg-[#F4F7FB] hover:bg-[#FBFDFF] font-sans text-xs font-semibold text-[#0A0C10] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93B8D8]"
                    >
                      <span>{t("settings.returnToWorkspace")}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#0A0C10] shrink-0" strokeWidth={1.75} />
                    </button>
                  </div>
                </aside>

                {/* Right Column: Aligned Studio Architecture Cards */}
                <div className="space-y-5 min-w-0">
                  {/* Card 01: Brand Overview & Format Architecture */}
                  <section
                    id="about-architecture"
                    className="rounded-xl border border-[#AAB7C5]/14 bg-[#11161F]/92 p-5 space-y-5"
                  >
                    <div className="pb-4 border-b border-[#AAB7C5]/14 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5">
                        <BrandLogo size={40} />
                        <div>
                          <div className="flex items-center gap-2.5">
                            <h2 className="font-display text-lg sm:text-xl font-semibold text-[#F4F7FB] tracking-tight">
                              ToneBench
                            </h2>
                            <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-[#0A0C10] text-[#C9D7E2] border border-[#AAB7C5]/16 tabular-nums">
                              v1.0.0
                            </span>
                          </div>
                          <p className="font-sans text-xs text-[#AAB7C5] mt-0.5">
                            1:1 Deterministic 3D OKLab Color Science &amp; Editable LUT Pipeline
                          </p>
                        </div>
                      </div>

                      <span className="font-mono text-xs text-[#C9D7E2]">
                        .cube · .lut · .ffx · .kfplug
                      </span>
                    </div>

                    <p className="font-sans text-xs sm:text-[13px] text-[#C9D7E2] leading-relaxed">
                      {t("about.architectureParagraph")}
                    </p>

                    <div className="pt-4 border-t border-[#AAB7C5]/14 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-0 md:divide-x md:divide-[#AAB7C5]/14">
                      <div className="md:pr-6 space-y-1.5">
                        <div className="font-mono text-xs text-[#7FA3C2] tabular-nums">
                          01 · Solver
                        </div>
                        <h3 className="font-sans text-xs font-semibold text-[#F4F7FB]">
                          Altair 4.5 Refresh
                        </h3>
                        <p className="font-sans text-xs text-[#AAB7C5] leading-relaxed">
                          Two-stage source normalization with 16-direction 3D OKLab Optimal Transport, 5-zone tonal curve, and skin-tone cluster lock.
                        </p>
                      </div>
                      <div className="md:px-6 space-y-1.5">
                        <div className="font-mono text-xs text-[#C9D7E2] tabular-nums">
                          02 · Exporters
                        </div>
                        <h3 className="font-sans text-xs font-semibold text-[#F4F7FB]">
                          Editable LUT &amp; Shader Export
                        </h3>
                        <p className="font-sans text-xs text-[#AAB7C5] leading-relaxed">
                          Edit internal tone curves, wheels, and hue vectors on{" "}
                          <span className="font-mono text-[#F4F7FB]">.cube</span> and{" "}
                          <span className="font-mono text-[#F4F7FB]">.lut</span> workflows with 1:1 visual parity across WebGL, After Effects (
                          <span className="font-mono text-[#F4F7FB]">.ffx</span>), and Keyflow (
                          <span className="font-mono text-[#F4F7FB]">.kfplug</span>).
                        </p>
                      </div>
                      <div className="md:pl-6 space-y-1.5">
                        <div className="font-mono text-xs text-[#C9D7E2] tabular-nums">
                          03 · Log &amp; Render
                        </div>
                        <h3 className="font-sans text-xs font-semibold text-[#F4F7FB]">
                          Camera Log &amp; Local WebCodecs
                        </h3>
                        <p className="font-sans text-xs text-[#AAB7C5] leading-relaxed">
                          Mathematical S-Log3, C-Log3, D-Log M, and Apple Log linearization plus client-side WebCodecs video rendering.
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* Card 02: 3-Tier Engine Comparison Matrix */}
                  <section
                    id="about-matrix"
                    className="rounded-xl border border-[#AAB7C5]/14 bg-[#11161F]/92 p-5 space-y-4"
                  >
                    <div className="pb-3.5 border-b border-[#AAB7C5]/14 flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-2.5">
                        <span className="font-mono text-xs font-semibold text-[#7FA3C2] tabular-nums">
                          02
                        </span>
                        <h2 className="font-display text-[15px] font-semibold text-[#F4F7FB] tracking-tight">
                          3-Tier Engine Comparison Matrix
                        </h2>
                      </div>
                      <span className="font-mono text-xs text-[#AAB7C5]">
                        Altair 4.5 · Altair 4.0 · Polaris 3.5
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[#AAB7C5]/14 font-sans text-[#AAB7C5]">
                            <th className="py-2 pr-4 font-medium">Engine</th>
                            <th className="py-2 pr-4 font-medium">Color Space</th>
                            <th className="py-2 pr-4 font-medium">Latency</th>
                            <th className="py-2 font-medium">Best Use Case</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#AAB7C5]/12">
                          {[
                            {
                              id: "altair_refresh",
                              name: "Altair 4.5 Refresh",
                              space: "Two-Stage OKLab SOT + Sigma Style",
                              speed: "<8ms · 32³ LUT",
                              useCase:
                                "Cinema color matching across mismatched lighting & 1:1 .aex parity",
                            },
                            {
                              id: "altair",
                              name: "Altair 4.0",
                              space: "Scene-Linear + 16-Dir Sliced OT",
                              speed: "~12ms · Sample-First",
                              useCase:
                                "Creative, mood-preserving stylized looks with skin-tone cluster lock",
                            },
                            {
                              id: "v3",
                              name: "Polaris 3.5",
                              space: "3D OKLab + AgX Roll-Off",
                              speed: "~60ms · Parametric",
                              useCase:
                                "Anime & cel-shaded palette anchoring with smooth highlight knee",
                            },
                          ].map((row) => {
                            const isCurrent = activeEngineId === row.id;
                            return (
                              <tr
                                key={row.id}
                                className={isCurrent ? "bg-[#4A6B86]/12" : ""}
                              >
                                <td className="py-3 pr-4 font-sans font-semibold text-[#F4F7FB] whitespace-nowrap">
                                  <span className="inline-flex items-center gap-2">
                                    {isCurrent && (
                                      <span
                                        aria-hidden="true"
                                        className="w-1.5 h-1.5 rounded-full bg-[#93B8D8]"
                                      />
                                    )}
                                    <span>{row.name}</span>
                                  </span>
                                </td>
                                <td className="py-3 pr-4 font-mono text-[#C9D7E2] whitespace-nowrap">
                                  {row.space}
                                </td>
                                <td className="py-3 pr-4 font-mono text-[#AAB7C5] tabular-nums whitespace-nowrap">
                                  {row.speed}
                                </td>
                                <td className="py-3 font-sans text-[#C9D7E2]">
                                  {row.useCase}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* Card 03: How to Install .kfplug on Keyflow */}
                  <section
                    id="about-install"
                    className="rounded-xl border border-[#AAB7C5]/14 bg-[#11161F]/92 p-5 space-y-4"
                  >
                    <div className="pb-3.5 border-b border-[#AAB7C5]/14 flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-2.5">
                        <span className="font-mono text-xs font-semibold text-[#7FA3C2] tabular-nums">
                          03
                        </span>
                        <h2 className="font-display text-[15px] font-semibold text-[#F4F7FB] tracking-tight">
                          {t("about.installGuideTitle")}
                        </h2>
                      </div>
                      <span className="font-mono text-xs text-[#AAB7C5]">
                        .kfplug · GLSL ES 1.00
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-0 md:divide-x md:divide-[#AAB7C5]/14">
                      <div className="md:pr-6 space-y-1.5">
                        <div className="font-mono text-xs text-[#7FA3C2] tabular-nums">
                          01 · {t("about.step01")}
                        </div>
                        <h3 className="font-sans text-xs font-semibold text-[#F4F7FB]">
                          {t("about.step01Title")}
                        </h3>
                        <p className="font-sans text-xs text-[#AAB7C5] leading-relaxed">
                          {t("about.step01Desc")}
                        </p>
                      </div>
                      <div className="md:px-6 space-y-1.5">
                        <div className="font-mono text-xs text-[#C9D7E2] tabular-nums">
                          02 · {t("about.step02")}
                        </div>
                        <h3 className="font-sans text-xs font-semibold text-[#F4F7FB]">
                          {t("about.step02Title")}
                        </h3>
                        <p className="font-sans text-xs text-[#AAB7C5] leading-relaxed">
                          {t("about.step02Desc")}
                        </p>
                      </div>
                      <div className="md:pl-6 space-y-1.5">
                        <div className="font-mono text-xs text-[#C9D7E2] tabular-nums">
                          03 · {t("about.step03")}
                        </div>
                        <h3 className="font-sans text-xs font-semibold text-[#F4F7FB]">
                          {t("about.step03Title")}
                        </h3>
                        <p className="font-sans text-xs text-[#AAB7C5] leading-relaxed">
                          {t("about.step03Desc")}
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* Card 04: Privacy Guarantee & Release History */}
                  <section
                    id="about-changelog"
                    className="rounded-xl border border-[#AAB7C5]/14 bg-[#11161F]/92 p-5 space-y-5"
                  >
                    <div className="pb-4 border-b border-[#AAB7C5]/14 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1 max-w-xl">
                        <div className="flex items-center gap-2 font-display text-[15px] font-semibold text-[#F4F7FB]">
                          <span className="font-mono text-xs font-semibold text-[#7FA3C2] tabular-nums">
                            04
                          </span>
                          <ShieldCheck className="w-4 h-4 text-[#93B8D8] shrink-0" />
                          <span>{t("about.privacyTitle")}</span>
                        </div>
                        <p className="font-sans text-xs text-[#AAB7C5] leading-relaxed">
                          {t("about.privacyDesc")}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveTab("support")}
                        className="self-start sm:self-auto cursor-pointer opacity-90 hover:opacity-100 transition-opacity shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2] rounded-md"
                      >
                        <TfbagasWordmark compact />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <h2 className="font-sans text-sm font-semibold text-[#F4F7FB]">
                          {t("about.changelogTitle")}
                        </h2>
                        <span className="font-mono text-xs text-[#AAB7C5] tabular-nums">
                          v1.0.0
                        </span>
                      </div>

                      <div className="space-y-3">
                        <div className="py-3 border-b border-[#AAB7C5]/14 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono font-semibold text-[#F4F7FB] tabular-nums">
                              v1.0.0
                            </span>
                            <span className="font-sans text-xs text-[#93B8D8]">
                              {t("about.preReleasePolish")}
                            </span>
                          </div>
                          <ul className="font-sans text-xs text-[#AAB7C5] space-y-1.5 list-disc pl-4">
                            {(dict?.about?.v095Items || []).map((item, idx) => (
                              <li key={idx}>
                                <span className="text-[#F4F7FB] font-medium">
                                  {item.bold}
                                </span>{" "}
                                {item.text}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <Suspense fallback={null}>
                          <ReleaseHistoryAccordion />
                        </Suspense>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            )}

            {/* SUPPORT STUDIO VIEW */}
            {activeTab === "support" && (
              <div className="studio-view-enter w-full">
                <Suspense fallback={null}>
                  <SupportTab
                    onReturnToWorkspace={() => setActiveTab("home")}
                    activeEngineName={activeEngine.name}
                    isWebglActive={!webglPhotoError}
                  />
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
            hasLook={canExportGrade}
            isCalibrationActive={isCalibrationActive}
            onOpenCalibration={handleOpenCalibration}
            fallbackName={referenceImage?.baseName || importedLook?.name || targetImage?.baseName || "Custom Look"}
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
            exportToast={exportToast}
            onDismissExportToast={() =>
              setExportToast({ visible: false, filename: "", formatBadge: "" })
            }
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
            activeView={activeTab}
            onNavigateView={handleCommandNavigateView}
            activeEngineId={activeEngineId}
            onSelectEngine={(id) => {
              handleEngineChange(id);
              if (showSplash) handleSplashComplete();
            }}
            activeLogProfile={simulateLogInput}
            onSelectLogProfile={handleTargetInputProfileChange}
            autoNormalizeTarget={autoNormalizeTarget}
            onToggleAutoNormalizeTarget={handleToggleAutoNormalizeTarget}
            onApplyLook={(look) => {
              handleApplyLook(look);
              if (showSplash) handleSplashComplete();
            }}
            onTryInstantDemo={handleCommandTryInstantDemo}
            onLoadSamplePlate={handleCommandLoadSamplePlate}
            onRunCalibration={handleCommandRunCalibration}
            onOpenExportModal={handleCommandOpenExportModal}
            onExportKfplug={handleExport}
            onExportFfx={handleExportFfx}
            onExportCube={handleExportCube}
            onExportZip={handleExportZipPack}
            hasLook={canExportGrade}
          />
        </Suspense>
      )}

      {/* Minimalist Status Toast (top-center below header so it never overlaps telemetry strip) */}
      {mobileToastPresence.isMounted && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div
            data-state={mobileToastPresence.state}
            className="studio-toast-top px-3.5 py-1.5 rounded-full bg-[#11161F]/96 backdrop-blur-md border border-[#AAB7C5]/18 text-[11px] font-mono text-[#F4F7FB] flex items-center gap-2 shadow-[inset_0_1px_0_rgba(244,247,251,0.08),0_8px_24px_rgba(0,0,0,0.65)]"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#93B8D8]" />
            <span>{mobileToast || lastMobileToast}</span>
          </div>
        </div>
      )}

      <SupportToast
        visible={exportToast.visible}
        filename={exportToast.filename}
        formatBadge={exportToast.formatBadge}
        onClose={() => setExportToast({ visible: false, filename: "", formatBadge: "" })}
      />

      {/* Global 3-Tab How to Use Guide Modal (accessible from both Intro and Studio) */}
      {hasGuideMounted && (
        <Suspense fallback={null}>
          <HowToUseModal
            isOpen={isGuideOpen}
            onClose={() => setIsGuideOpen(false)}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
          />
        </Suspense>
      )}
    </div>
  );
}
