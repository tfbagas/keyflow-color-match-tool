import React, { useState, useRef, useEffect, useCallback, useId } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowUp,
  MoveHorizontal,
  ShieldCheck,
  RotateCcw,
  ChevronDown,
} from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { CURATED_SAMPLE_PLATES } from "../utils/samplePlates";

const SOLVER_PROFILES = [
  {
    id: "altair_refresh",
    label: "Altair 4.5 Refresh",
    gridSpecKey: "showcase.gridSpecOklab",
    contrastMul: 1.0,
    satMul: 1.0,
    tempOffset: 0.0,
    shadowShift: [0, 0, 0],
    highShift: [0, 0, 0],
  },
  {
    id: "altair",
    label: "Altair 4.0",
    gridSpecKey: "showcase.gridSpecSplit",
    contrastMul: 1.08,
    satMul: 1.08,
    tempOffset: -0.025,
    shadowShift: [-0.032, 0.012, 0.042],
    highShift: [0.038, 0.014, -0.034],
  },
  {
    id: "polaris",
    label: "Polaris 3.5",
    gridSpecKey: "showcase.gridSpecParametric",
    contrastMul: 1.04,
    satMul: 1.24,
    tempOffset: 0.018,
    shadowShift: [-0.016, 0.004, 0.032],
    highShift: [0.024, 0.016, 0.008],
  },
];

const LAB_MODES = [
  {
    id: "curves",
    labelKey: "showcase.modeCurvesTitle",
  },
  {
    id: "wheels",
    labelKey: "showcase.modeWheelsTitle",
  },
  {
    id: "skin",
    labelKey: "showcase.modeSkinTitle",
  },
];

const WHEEL_PRESETS = [
  {
    id: "teal_orange",
    label: "Teal & Orange",
    lift: { x: -0.34, y: 0.28 },
    gamma: { x: 0.08, y: -0.06 },
    gain: { x: 0.36, y: -0.24 },
  },
  {
    id: "bleach_bypass",
    label: "Bleach Bypass",
    lift: { x: -0.14, y: 0.08 },
    gamma: { x: -0.06, y: 0.12 },
    gain: { x: 0.12, y: -0.08 },
  },
  {
    id: "neutral",
    label: "Neutral",
    lift: { x: 0, y: 0 },
    gamma: { x: 0, y: 0 },
    gain: { x: 0, y: 0 },
  },
];

const EASE_SHUTTER = [0.16, 1, 0.3, 1];
const WORKBENCH_W = 1120;
const WORKBENCH_H = 630;
const HIST_BINS = 20;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function rgbToHueSat(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 1e-5) return [0, 0, max];
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  const s = max > 1e-5 ? d / max : 0;
  return [h, s, max];
}

function computeSkinMask(r, g, b) {
  const [h, s, v] = rgbToHueSat(r, g, b);
  if (v < 0.14 || v > 0.96 || s < 0.08 || s > 0.68) return 0;
  const dh = Math.abs(h - 26);
  const hueW = Math.max(0, 1 - dh / 24);
  if (hueW <= 0) return 0;
  if (r <= g * 0.96) return 0;
  const satW = s < 0.14 ? (s - 0.08) / 0.06 : s > 0.52 ? (0.68 - s) / 0.16 : 1;
  const valW = v < 0.24 ? (v - 0.14) / 0.1 : 1;
  return clamp01(hueW * hueW * satW * valW);
}

/**
 * Precision 2px Hairline Grading Slider (Steel Night x Arctic Ink)
 */
function PrecisionGradingSlider({
  label,
  value,
  min,
  max,
  defaultValue,
  displayValue,
  ticks,
  onChange,
  accentReadout = false,
  compact = false,
}) {
  const pct = clamp(((value - min) / Math.max(1, max - min)) * 100, 0, 100);
  const isBipolar = min < 0 && max > 0;

  return (
    <label
      onDoubleClick={() => {
        if (typeof defaultValue === "number") onChange(defaultValue);
      }}
      title="Drag to adjust, double-click to reset"
      className={`group block cursor-pointer select-none ${
        compact ? "px-4 py-2.5 space-y-1.5" : "px-5 py-4 space-y-2.5"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`font-sans font-medium text-[#C9D7E2] group-hover:text-[#F4F7FB] transition-colors ${
            compact ? "text-xs" : "text-[13px]"
          }`}
        >
          {label}
        </span>
        <span
          className={`font-mono text-xs font-semibold tabular-nums ${
            accentReadout ? "text-[#93B8D8]" : "text-[#F4F7FB]"
          }`}
        >
          {displayValue}
        </span>
      </div>

      <div className={`relative flex items-center ${compact ? "h-4" : "h-5"}`}>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
          className="peer absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
        />

        <div className="relative w-full h-[2px] rounded-full bg-[#AAB7C5]/20 overflow-visible">
          {isBipolar && (
            <span
              aria-hidden="true"
              className="absolute left-1/2 -top-[3px] -translate-x-1/2 w-px h-2 bg-[#AAB7C5]/40"
            />
          )}

          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 rounded-full bg-[#7FA3C2]"
            style={{ width: `${pct}%` }}
          />
        </div>

        <span
          aria-hidden="true"
          style={{ left: `${pct}%` }}
          className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#F4F7FB] border-2 border-[#7FA3C2] shadow-[0_1px_6px_rgba(0,0,0,0.65)] transition-transform duration-150 group-hover:scale-125 group-active:scale-125 peer-focus-visible:scale-125 peer-focus-visible:ring-2 peer-focus-visible:ring-[#93B8D8]"
        />
      </div>

      {Array.isArray(ticks) && ticks.length > 0 && (
        <div className="flex justify-between font-mono text-[9.5px] text-[#AAB7C5] tabular-nums">
          {ticks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
      )}
    </label>
  );
}

/**
 * Section 01 - Two-Column Editorial Split + Halftone-Framed Live Cinema Grading Monitor (#workbench)
 */
function FramelessGradingMonitorSection({
  scrollRootRef,
  selectedIdx,
  onSelectIdx,
  onTrySampleInStudio,
  isGuideOpen,
}) {
  const { t } = useLanguage();
  const activeSolver = SOLVER_PROFILES[selectedIdx] || SOLVER_PROFILES[0];
  const [selectedSceneIdx, setSelectedSceneIdx] = useState(0);
  const activeSample = CURATED_SAMPLE_PLATES[selectedSceneIdx] || CURATED_SAMPLE_PLATES[0];

  const [prevSampleId, setPrevSampleId] = useState(activeSample.id);
  const [lutIntensity, setLutIntensity] = useState(
    activeSample.defaults.lutIntensity
  );
  const [toneContrast, setToneContrast] = useState(
    activeSample.defaults.toneContrast
  );
  const [colorTemp, setColorTemp] = useState(activeSample.defaults.colorTemp);
  const [skinLock, setSkinLock] = useState(activeSample.defaults.skinLock);

  if (activeSample.id !== prevSampleId) {
    setPrevSampleId(activeSample.id);
    setLutIntensity(activeSample.defaults.lutIntensity);
    setToneContrast(activeSample.defaults.toneContrast);
    setColorTemp(activeSample.defaults.colorTemp);
    setSkinLock(activeSample.defaults.skinLock);
  }

  const [splitPct, setSplitPct] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [isMonitorHovered, setIsMonitorHovered] = useState(false);
  const [isMonitorFocused, setIsMonitorFocused] = useState(false);
  const [loadedUrls, setLoadedUrls] = useState({});
  const [histogram, setHistogram] = useState(() => ({
    r: new Array(HIST_BINS).fill(0.28),
    g: new Array(HIST_BINS).fill(0.28),
    b: new Array(HIST_BINS).fill(0.28),
  }));

  const sectionRef = useRef(null);
  const previewRef = useRef(null);
  const activeImgRef = useRef(null);
  const rawCanvasRef = useRef(null);
  const gradedCanvasRef = useRef(null);
  const imgElementsRef = useRef({});
  const decodedCacheRef = useRef({});

  const isWorkbenchInView = useInView(sectionRef, {
    root: scrollRootRef,
    amount: 0.25,
  });

  const handleResetControls = useCallback(() => {
    setLutIntensity(activeSample.defaults.lutIntensity);
    setToneContrast(activeSample.defaults.toneContrast);
    setColorTemp(activeSample.defaults.colorTemp);
    setSkinLock(activeSample.defaults.skinLock);
  }, [activeSample]);

  const markUrlLoaded = useCallback((url) => {
    setLoadedUrls((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
  }, []);

  // Ensure already-cached images mark loaded immediately on scene switch
  useEffect(() => {
    const img = activeImgRef.current || imgElementsRef.current[activeSample.sampleUrl];
    if (img && img.complete && img.naturalWidth > 0) {
      imgElementsRef.current[activeSample.sampleUrl] = img;
      markUrlLoaded(activeSample.sampleUrl);
    }
  }, [activeSample.sampleUrl, markUrlLoaded]);

  const ensureDecodedImage = useCallback((url) => {
    if (decodedCacheRef.current[url]) return decodedCacheRef.current[url];
    const img = imgElementsRef.current[url];
    if (!img || !img.complete || !img.naturalWidth) return null;

    const off = document.createElement("canvas");
    off.width = WORKBENCH_W;
    off.height = WORKBENCH_H;
    const octx = off.getContext("2d", { willReadFrequently: true });
    if (!octx) return null;

    octx.drawImage(img, 0, 0, WORKBENCH_W, WORKBENCH_H);
    const src = octx.getImageData(0, 0, WORKBENCH_W, WORKBENCH_H).data;
    const pxCount = WORKBENCH_W * WORKBENCH_H;
    const skinMasks = new Float32Array(pxCount);
    const rawRgba = new Uint8ClampedArray(pxCount * 4);

    for (let p = 0; p < pxCount; p += 1) {
      const i = p * 4;
      const r0 = src[i] / 255;
      const g0 = src[i + 1] / 255;
      const b0 = src[i + 2] / 255;
      skinMasks[p] = computeSkinMask(r0, g0, b0);

      const luma = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
      const rl = 0.11 + (luma + (r0 - luma) * 0.46) * 0.72;
      const gl = 0.115 + (luma + (g0 - luma) * 0.46) * 0.72;
      const bl = 0.12 + (luma + (b0 - luma) * 0.46) * 0.72;
      rawRgba[i] = Math.round(clamp01(rl) * 255);
      rawRgba[i + 1] = Math.round(clamp01(gl) * 255);
      rawRgba[i + 2] = Math.round(clamp01(bl) * 255);
      rawRgba[i + 3] = 255;
    }

    const entry = { src, skinMasks, rawRgba };
    decodedCacheRef.current[url] = entry;
    return entry;
  }, []);

  useEffect(() => {
    const decoded = ensureDecodedImage(activeSample.sampleUrl);
    const rawCanvas = rawCanvasRef.current;
    if (!decoded || !rawCanvas) return;
    const ctx = rawCanvas.getContext("2d");
    if (!ctx) return;
    const imgData = new ImageData(decoded.rawRgba, WORKBENCH_W, WORKBENCH_H);
    ctx.putImageData(imgData, 0, 0);
  }, [activeSample.sampleUrl, loadedUrls, ensureDecodedImage]);

  useEffect(() => {
    const decoded = ensureDecodedImage(activeSample.sampleUrl);
    const gradedCanvas = gradedCanvasRef.current;
    if (!decoded || !gradedCanvas) return;
    const ctx = gradedCanvas.getContext("2d");
    if (!ctx) return;

    const { src, skinMasks } = decoded;
    const out = ctx.createImageData(WORKBENCH_W, WORKBENCH_H);
    const dst = out.data;

    const gSpec = activeSample.grade;
    const mix = lutIntensity / 100;
    const userContrast = 1 + (toneContrast / 100) * 0.72;
    const userTemp = (colorTemp / 50) * 0.15;
    const effectiveContrast = gSpec.contrast * activeSolver.contrastMul;
    const effectiveSat = gSpec.sat * activeSolver.satMul;
    const effectiveTemp = gSpec.temp + activeSolver.tempOffset;
    const sr = gSpec.shadowRgb[0] + activeSolver.shadowShift[0];
    const sg = gSpec.shadowRgb[1] + activeSolver.shadowShift[1];
    const sb = gSpec.shadowRgb[2] + activeSolver.shadowShift[2];
    const hr = gSpec.highRgb[0] + activeSolver.highShift[0];
    const hg = gSpec.highRgb[1] + activeSolver.highShift[1];
    const hb = gSpec.highRgb[2] + activeSolver.highShift[2];

    const rBins = new Uint32Array(HIST_BINS);
    const gBins = new Uint32Array(HIST_BINS);
    const bBins = new Uint32Array(HIST_BINS);

    const pxCount = WORKBENCH_W * WORKBENCH_H;
    for (let p = 0; p < pxCount; p += 1) {
      const i = p * 4;
      const r0 = src[i] / 255;
      const g0 = src[i + 1] / 255;
      const b0 = src[i + 2] / 255;

      let rl = clamp01((r0 - 0.5) * effectiveContrast + 0.5);
      let gl = clamp01((g0 - 0.5) * effectiveContrast + 0.5);
      let bl = clamp01((b0 - 0.5) * effectiveContrast + 0.5);

      const luma = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
      const shW = (1 - luma) * (1 - luma);
      const hiW = luma * luma;

      rl += sr * shW + hr * hiW + effectiveTemp * 0.14;
      gl += sg * shW + hg * hiW + gSpec.tint * 0.08;
      bl += sb * shW + hb * hiW - effectiveTemp * 0.14;

      const l2 = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
      rl = l2 + (rl - l2) * effectiveSat;
      gl = l2 + (gl - l2) * effectiveSat;
      bl = l2 + (bl - l2) * effectiveSat;

      let r = r0 + (rl - r0) * mix;
      let g = g0 + (gl - g0) * mix;
      let b = b0 + (bl - b0) * mix;

      r = clamp01((r - 0.5) * userContrast + 0.5 + userTemp);
      g = clamp01((g - 0.5) * userContrast + 0.5 + userTemp * 0.12);
      b = clamp01((b - 0.5) * userContrast + 0.5 - userTemp * 1.05);

      if (skinLock) {
        const sm = skinMasks[p];
        if (sm > 0.01) {
          const rNat = clamp01(
            (r0 - 0.5) * (1 + (userContrast - 1) * 0.5) + 0.506
          );
          const gNat = clamp01(
            (g0 - 0.5) * (1 + (userContrast - 1) * 0.5) + 0.501
          );
          const bNat = clamp01(
            (b0 - 0.5) * (1 + (userContrast - 1) * 0.5) + 0.494
          );
          const keep = sm * 0.86;
          r = r * (1 - keep) + rNat * keep;
          g = g * (1 - keep) + gNat * keep;
          b = b * (1 - keep) + bNat * keep;
        }
      }

      const rByte = Math.round(clamp01(r) * 255);
      const gByte = Math.round(clamp01(g) * 255);
      const bByte = Math.round(clamp01(b) * 255);
      dst[i] = rByte;
      dst[i + 1] = gByte;
      dst[i + 2] = bByte;
      dst[i + 3] = 255;

      if ((p & 7) === 0) {
        const rb = Math.min(HIST_BINS - 1, (rByte * HIST_BINS) >> 8);
        const gb = Math.min(HIST_BINS - 1, (gByte * HIST_BINS) >> 8);
        const bb = Math.min(HIST_BINS - 1, (bByte * HIST_BINS) >> 8);
        rBins[rb] += 1;
        gBins[gb] += 1;
        bBins[bb] += 1;
      }
    }

    ctx.putImageData(out, 0, 0);

    let maxBin = 1;
    for (let k = 0; k < HIST_BINS; k += 1) {
      if (rBins[k] > maxBin) maxBin = rBins[k];
      if (gBins[k] > maxBin) maxBin = gBins[k];
      if (bBins[k] > maxBin) maxBin = bBins[k];
    }
    const norm = (arr) =>
      Array.from(arr, (val) =>
        Math.max(0.08, Math.min(1, Math.pow(val / maxBin, 0.72)))
      );
    setHistogram({ r: norm(rBins), g: norm(gBins), b: norm(bBins) });
  }, [
    activeSample,
    activeSolver,
    loadedUrls,
    lutIntensity,
    toneContrast,
    colorTemp,
    skinLock,
    ensureDecodedImage,
  ]);

  useEffect(() => {
    if (
      (!isWorkbenchInView && !isMonitorHovered && !isMonitorFocused) ||
      isGuideOpen
    ) {
      return undefined;
    }

    const handleKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement;
      const tag = active?.tagName?.toUpperCase();
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        active?.isContentEditable
      ) {
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSplitPct((v) => Math.max(0, v - 5));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSplitPct((v) => Math.min(100, v + 5));
      } else if (e.key === "1") {
        e.preventDefault();
        onSelectIdx(0);
      } else if (e.key === "2") {
        e.preventDefault();
        onSelectIdx(1);
      } else if (e.key === "3") {
        e.preventDefault();
        onSelectIdx(2);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isWorkbenchInView,
    isMonitorHovered,
    isMonitorFocused,
    isGuideOpen,
    onSelectIdx,
  ]);

  const updateSplitFromClientX = useCallback((clientX) => {
    const el = previewRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplitPct(Math.max(0, Math.min(100, pct)));
  }, []);

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setIsDragging(true);
    updateSplitFromClientX(e.clientX);
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    updateSplitFromClientX(e.clientX);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const isCurrentSampleLoaded = Boolean(loadedUrls[activeSample.sampleUrl]);

  return (
    <motion.section
      id="workbench"
      ref={sectionRef}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12, root: scrollRootRef }}
      transition={{ duration: 0.5, ease: EASE_SHUTTER }}
      onMouseEnter={() => setIsMonitorHovered(true)}
      onMouseLeave={() => setIsMonitorHovered(false)}
      onFocus={() => setIsMonitorFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setIsMonitorFocused(false);
        }
      }}
      className="relative pt-20 scroll-mt-20 pb-6 px-4 sm:px-8 max-w-6xl mx-auto text-left"
    >
      {/* Two-Column Editorial Split Header (Compact Single-Viewport 1440x900 Fit) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 items-end mb-4">
        <div className="lg:col-span-7 space-y-1">
          <div className="font-mono text-[11px] font-medium text-[#7FA3C2] tabular-nums">
            01 · {t("showcase.section01Title")}
          </div>
          <h2 className="font-display text-2xl sm:text-3xl lg:text-[34px] font-semibold tracking-[-0.025em] leading-[1.08] text-[#F4F7FB] text-balance">
            {t("showcase.section01Headline1")}
            <br />
            <span className="text-[#C9D7E2]">{t("showcase.section01Headline2")}</span>
          </h2>
        </div>

        <div className="lg:col-span-5 flex flex-col items-start gap-2.5">
          <p className="font-sans text-xs sm:text-[13.5px] leading-snug text-[#AAB7C5]">
            {t("showcase.section01Desc")}
          </p>
          <button
            type="button"
            onClick={() => onTrySampleInStudio?.(activeSample)}
            className="min-h-[36px] px-4 py-1.5 rounded-full bg-[#F4F7FB] hover:bg-[#FBFDFF] text-[#0A0C10] font-sans font-semibold text-xs inline-flex items-center gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93B8D8]"
          >
            <span>{t("showcase.openSampleInStudio")}</span>
            <ArrowRight className="w-3.5 h-3.5 translate-x-[0.5px]" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Crisp Single-Border #11161F Instrument Chassis */}
      <div className="rounded-2xl bg-[#11161F] border border-[#AAB7C5]/14 overflow-hidden">
          {/* Top Monitor Rail: Solver Tabs + Reset */}
          <div className="border-b border-[#AAB7C5]/14 px-3.5 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2.5 bg-[#11161F]">
            <div
              role="tablist"
              aria-label="Color solver engine switcher"
              className="flex flex-wrap items-center rounded-xl p-1 border border-[#AAB7C5]/14 bg-[#0A0C10]"
            >
              {SOLVER_PROFILES.map((solver, idx) => {
                const isActive = idx === selectedIdx;
                return (
                  <button
                    key={solver.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => onSelectIdx(idx)}
                    className={`relative min-h-[34px] sm:min-h-[28px] px-3 sm:px-3.5 py-1 rounded-lg font-sans text-xs inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2] ${
                      isActive
                        ? "text-[#F4F7FB] font-semibold"
                        : "text-[#AAB7C5] hover:text-[#F4F7FB] font-medium"
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="monitor-engine-tab-indicator"
                        transition={{
                          type: "spring",
                          stiffness: 440,
                          damping: 34,
                        }}
                        className="absolute inset-0 rounded-lg bg-[#4A6B86]/35 border border-[#7FA3C2]/55"
                      />
                    )}
                    <span className="relative z-10 whitespace-nowrap">
                      {solver.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden md:inline font-mono text-[11px] text-[#AAB7C5] tabular-nums">
                {t(activeSolver.gridSpecKey)}
              </span>
              <button
                type="button"
                onClick={handleResetControls}
                className="min-h-[32px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0A0C10]/60 hover:bg-[#1C2430] border border-[#AAB7C5]/14 font-sans text-xs font-medium text-[#C9D7E2] hover:text-[#F4F7FB] transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#93B8D8]" strokeWidth={1.5} />
                <span>{t("paramsCard.reset")}</span>
              </button>
            </div>
          </div>

          {/* Slim Off-Frame Status Strip */}
          <div className="border-b border-[#AAB7C5]/12 px-3.5 sm:px-4 py-1.5 flex items-center justify-between gap-4 bg-[#07090D]">
            <span className="font-sans text-[11px] font-medium text-[#C9D7E2]">
              {t("showcase.rawLogBadge")}
            </span>
            <span className="font-mono text-[11px] text-[#AAB7C5] tabular-nums">
              {t("showcase.splitLabel")} {Math.round(splitPct)}%
            </span>
            <span className="font-sans text-[11px] font-medium text-[#93B8D8]">
              {t("showcase.gradedBadge")}
            </span>
          </div>

          {/* Uncluttered Interactive Split Monitor (Constrained <= 47vh so Section 01 fits 1440x900) */}
          <div
            ref={previewRef}
            data-lenis-prevent
            role="slider"
            tabIndex={0}
            aria-label="Before and after split comparison. Use Left and Right arrow keys to nudge split position, or 1, 2, 3 to switch solver engines."
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(splitPct)}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ touchAction: "pan-y" }}
            className="relative aspect-[16/9] max-h-[44vh] w-full overflow-hidden bg-[#07090D] cursor-ew-resize select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
          >
            {!isCurrentSampleLoaded && (
              <div
                aria-hidden="true"
                className="absolute inset-0 z-[5] sample-shimmer-skeleton flex items-center justify-center"
              >
                <span className="relative z-10 font-mono text-[11px] tracking-[0.08em] uppercase text-[#C9D7E2] px-3 py-1 rounded-md bg-[#0A0C10]/70 border border-[#AAB7C5]/16">
                  {t("showcase.loadingSample")}
                </span>
              </div>
            )}

            <img
              key={activeSample.sampleUrl}
              ref={(el) => {
                activeImgRef.current = el;
                if (el) imgElementsRef.current[activeSample.sampleUrl] = el;
              }}
              src={activeSample.sampleUrl}
              alt={activeSample.headline}
              width={1920}
              height={1080}
              loading="lazy"
              decoding="async"
              onLoad={(e) => {
                imgElementsRef.current[activeSample.sampleUrl] = e.currentTarget;
                markUrlLoaded(activeSample.sampleUrl);
              }}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-45"
            />

            <canvas
              ref={rawCanvasRef}
              width={WORKBENCH_W}
              height={WORKBENCH_H}
              className={`absolute inset-0 z-[1] w-full h-full object-cover block pointer-events-none transition-opacity duration-200 ${
                isCurrentSampleLoaded ? "opacity-100" : "opacity-0"
              }`}
            />

            <canvas
              ref={gradedCanvasRef}
              width={WORKBENCH_W}
              height={WORKBENCH_H}
              style={{
                clipPath: `inset(0 0 0 ${splitPct}%)`,
              }}
              className={`absolute inset-0 z-[2] w-full h-full object-cover block pointer-events-none transition-opacity duration-200 ${
                isCurrentSampleLoaded ? "opacity-100" : "opacity-0"
              }`}
            />

            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 z-20"
              style={{ left: `${splitPct}%` }}
            >
              <div className="absolute inset-y-0 -left-px w-[1.5px] bg-[#F4F7FB]/90 shadow-[0_0_12px_rgba(0,0,0,0.85)]" />
              <div
                className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#0A0C10]/92 border flex items-center justify-center shadow-[0_6px_20px_rgba(0,0,0,0.85)] transition-transform duration-150 ${
                  isDragging
                    ? "scale-110 border-[#93B8D8]"
                    : "border-[#C9D7E2]/75"
                }`}
              >
                <MoveHorizontal className="w-3.5 h-3.5 text-[#F4F7FB]" strokeWidth={1.5} />
              </div>
            </div>
          </div>

          {/* 4-Column Hardware Grading Console (Compact) */}
          <div
            data-lenis-prevent
            className="border-t border-[#AAB7C5]/14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-[#AAB7C5]/12 bg-[#11161F]"
          >
            <PrecisionGradingSlider
              compact
              label={t("showcase.lutIntensity")}
              value={lutIntensity}
              min={0}
              max={100}
              defaultValue={activeSample.defaults.lutIntensity}
              displayValue={`${lutIntensity}%`}
              ticks={["0%", "50%", "100%"]}
              onChange={setLutIntensity}
              accentReadout
            />

            <PrecisionGradingSlider
              compact
              label={t("showcase.toneContrast")}
              value={toneContrast}
              min={-50}
              max={50}
              defaultValue={activeSample.defaults.toneContrast}
              displayValue={toneContrast > 0 ? `+${toneContrast}` : `${toneContrast}`}
              ticks={["-50", "0", "+50"]}
              onChange={setToneContrast}
            />

            <PrecisionGradingSlider
              compact
              label={t("showcase.colorTemp")}
              value={colorTemp}
              min={-50}
              max={50}
              defaultValue={activeSample.defaults.colorTemp}
              displayValue={colorTemp > 0 ? `+${colorTemp}K` : `${colorTemp}K`}
              ticks={["-50K", "D65", "+50K"]}
              onChange={setColorTemp}
            />

            <div className="px-4 py-2.5 flex flex-col justify-between gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-sans text-xs font-medium text-[#C9D7E2]">
                  <ShieldCheck
                    className={`w-3.5 h-3.5 shrink-0 ${
                      skinLock ? "text-[#93B8D8]" : "text-[#AAB7C5]"
                    }`}
                    strokeWidth={1.5}
                  />
                  <span>{t("showcase.skinToneLock")}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={skinLock}
                  onClick={() => setSkinLock((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border font-mono text-[10.5px] font-semibold tabular-nums transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2] ${
                    skinLock
                      ? "bg-[#4A6B86]/35 border-[#7FA3C2]/55 text-[#F4F7FB]"
                      : "bg-[#0A0C10] border-[#AAB7C5]/20 text-[#AAB7C5] hover:text-[#F4F7FB]"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-1.5 h-1.5 rounded-full ${
                      skinLock ? "bg-[#93B8D8]" : "bg-[#AAB7C5]/45"
                    }`}
                  />
                  <span>{skinLock ? t("showcase.on") : t("showcase.off")}</span>
                </button>
              </div>

              {/* Literal RGB Channel Parade Signal */}
              <div className="grid grid-cols-3 gap-1.5 h-6 items-end pt-1 border-t border-[#AAB7C5]/12">
                {[
                  { key: "r", color: "bg-rose-400/85", data: histogram.r },
                  { key: "g", color: "bg-emerald-400/85", data: histogram.g },
                  { key: "b", color: "bg-sky-400/85", data: histogram.b },
                ].map((ch) => (
                  <div
                    key={ch.key}
                    className="h-full flex items-end gap-[1px] px-0.5 rounded-[3px] bg-[#07090D]"
                  >
                    {ch.data.map((val, idx) => (
                      <span
                        key={idx}
                        className={`flex-1 ${ch.color} transition-[height] duration-75`}
                        style={{ height: `${Math.round(val * 100)}%` }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom 4-Scene Curated Sample Selector Strip + Tonal Swatch Previews */}
          <div className="px-3.5 sm:px-4 py-2 border-t border-[#AAB7C5]/12 bg-[#07090D] flex flex-wrap items-center justify-between gap-2.5">
            <div
              role="group"
              aria-label="Curated high-resolution grading sample plates"
              className="flex flex-wrap items-center gap-1.5"
            >
              {CURATED_SAMPLE_PLATES.map((plate, idx) => {
                const isSceneActive = idx === selectedSceneIdx;
                return (
                  <button
                    key={plate.id}
                    type="button"
                    aria-pressed={isSceneActive}
                    onClick={() => setSelectedSceneIdx(idx)}
                    className={`min-h-[34px] sm:min-h-[30px] inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border font-sans text-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2] ${
                      isSceneActive
                        ? "bg-[#1C2430] border-[#7FA3C2]/55 text-[#F4F7FB] font-semibold"
                        : "bg-[#11161F]/70 border-[#AAB7C5]/12 text-[#AAB7C5] hover:text-[#F4F7FB] hover:border-[#AAB7C5]/26 font-medium"
                    }`}
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
                    <span className="whitespace-nowrap">{t(plate.sceneTagKey)}</span>
                  </button>
                );
              })}
            </div>

            <span className="hidden xl:inline font-mono text-[10.5px] text-[#AAB7C5]">
              {t("showcase.dragSplitKeyboardHint")}
            </span>
          </div>
      </div>
    </motion.section>
  );
}

/**
 * Section 02 - Interactive .cube / .lut Parameter Lab (#anatomy)
 */
function LutAnatomyDecomposerSection({ scrollRootRef, onOpenStudio }) {
  const { t } = useLanguage();
  const [activeMode, setActiveMode] = useState("curves");
  const [curvePreset, setCurvePreset] = useState("filmic");
  const [shadowY, setShadowY] = useState(0.185);
  const [midY, setMidY] = useState(0.5);
  const [highY, setHighY] = useState(0.82);
  const [draggingHandle, setDraggingHandle] = useState(null);

  const [wheelPresetId, setWheelPresetId] = useState("teal_orange");
  const [wheels, setWheels] = useState({
    lift: { x: -0.34, y: 0.28 },
    gamma: { x: 0.08, y: -0.06 },
    gain: { x: 0.36, y: -0.24 },
  });
  const [draggingWheel, setDraggingWheel] = useState(null);

  const [skinPhaseLocked, setSkinPhaseLocked] = useState(true);
  const [skinRetention, setSkinRetention] = useState(86);

  const sectionRef = useRef(null);
  const svgRef = useRef(null);
  const wheelRefs = useRef({});

  const updateCurvePointFromPointer = useCallback((clientY, handleId) => {
    const svg = svgRef.current;
    if (!svg || !handleId) return;
    const rect = svg.getBoundingClientRect();
    if (rect.height <= 0) return;
    const normY = 1 - (clientY - rect.top) / rect.height;
    setCurvePreset("custom");
    if (handleId === "shadow") {
      setShadowY(clamp(normY, 0.04, 0.45));
    } else if (handleId === "mid") {
      setMidY(clamp(normY, 0.22, 0.82));
    } else if (handleId === "high") {
      setHighY(clamp(normY, 0.52, 0.98));
    }
  }, []);

  const handleSvgPointerDown = (e, handleId) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDraggingHandle(handleId);
    updateCurvePointFromPointer(e.clientY, handleId);
  };

  const handleSvgPointerMove = (e) => {
    if (!draggingHandle) return;
    updateCurvePointFromPointer(e.clientY, draggingHandle);
  };

  const handleSvgPointerUp = () => {
    setDraggingHandle(null);
  };

  const updateWheelFromPointer = useCallback((clientX, clientY, wheelKey) => {
    const el = wheelRefs.current[wheelKey];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const radius = rect.width * 0.38;
    let dx = (clientX - cx) / radius;
    let dy = (clientY - cy) / radius;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    setWheelPresetId("custom");
    setWheels((prev) => ({
      ...prev,
      [wheelKey]: {
        x: Math.round(dx * 100) / 100,
        y: Math.round(dy * 100) / 100,
      },
    }));
  }, []);

  const applyWheelPreset = (preset) => {
    setWheelPresetId(preset.id);
    setWheels({
      lift: { ...preset.lift },
      gamma: { ...preset.gamma },
      gain: { ...preset.gain },
    });
  };

  const W = 580;
  const H = 220;
  const ptX = (nx) => Math.round(nx * W * 10) / 10;
  const ptY = (ny) => Math.round((1 - ny) * H * 10) / 10;

  const p0 = { x: ptX(0), y: ptY(0.03) };
  const p1 = { x: ptX(0.25), y: ptY(shadowY) };
  const p2 = { x: ptX(0.5), y: ptY(midY) };
  const p3 = { x: ptX(0.75), y: ptY(highY) };
  const p4 = { x: ptX(1), y: ptY(0.97) };

  const curvePath = `M ${p0.x} ${p0.y} C ${p0.x + 48} ${p0.y - 7}, ${
    p1.x - 44
  } ${p1.y + 9}, ${p1.x} ${p1.y} C ${p1.x + 46} ${p1.y - 9}, ${
    p2.x - 46
  } ${p2.y + 9}, ${p2.x} ${p2.y} C ${p2.x + 46} ${p2.y - 9}, ${
    p3.x - 46
  } ${p3.y + 7}, ${p3.x} ${p3.y} C ${p3.x + 46} ${p3.y - 7}, ${
    p4.x - 44
  } ${p4.y + 3}, ${p4.x} ${p4.y}`;

  const areaPath = `${curvePath} L ${W} ${H} L 0 ${H} Z`;

  const toeIre = (shadowY * 100).toFixed(1);
  const midIre = (midY * 100).toFixed(1);
  const kneeIre = (highY * 100).toFixed(1);
  const gammaReadout = (
    1.08 +
    (midY - 0.5) * 1.1 +
    (highY - shadowY - 0.635) * 0.35
  ).toFixed(2);

  const formatWheelRgb = (vec, scale) => {
    const r = (vec.x * 0.14 - vec.y * 0.08) * scale;
    const g = (-vec.x * 0.04 + vec.y * 0.05) * scale;
    const b = (-vec.x * 0.15 + vec.y * 0.1) * scale;
    const fmt = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
    return { r: fmt(r), g: fmt(g), b: fmt(b) };
  };

  const liftRgb = formatWheelRgb(wheels.lift, 1.0);
  const gammaRgb = formatWheelRgb(wheels.gamma, 0.85);
  const gainRgb = formatWheelRgb(wheels.gain, 1.15);

  const effectiveRetention = skinPhaseLocked ? skinRetention : 14;
  const lockFactor = effectiveRetention / 100;

  const activeTelemetrySummary =
    activeMode === "curves"
      ? `γ ${gammaReadout} · ${midIre} IRE`
      : activeMode === "wheels"
      ? `Lift R ${liftRgb.r} · Gain B ${gainRgb.b}`
      : `123.0° I-Line · ${effectiveRetention}%`;

  return (
    <motion.section
      id="anatomy"
      ref={sectionRef}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12, root: scrollRootRef }}
      transition={{ duration: 0.5, ease: EASE_SHUTTER }}
      className="relative pt-20 scroll-mt-20 pb-16 sm:pb-20 px-4 sm:px-8 max-w-6xl mx-auto text-left"
    >
      {/* Two-Column Editorial Header */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-10 items-end mb-8">
        <div className="lg:col-span-7 space-y-2">
          <div className="font-mono text-xs font-medium text-[#7FA3C2] tabular-nums">
            02 · {t("showcase.section02Eyebrow")}
          </div>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-[42px] font-semibold tracking-[-0.025em] leading-[1.08] text-[#F4F7FB] text-balance">
            {t("showcase.section02Headline1")}
            <br />
            <span className="text-[#C9D7E2]">{t("showcase.section02Headline2")}</span>
          </h2>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <p className="font-sans text-sm sm:text-[15px] leading-relaxed text-[#AAB7C5]">
            {t("showcase.section02Body1")}{" "}
            <span className="font-mono text-[13.5px] text-[#F4F7FB]">.cube</span>{" "}
            {t("showcase.section02BodyAnd")}{" "}
            <span className="font-mono text-[13.5px] text-[#F4F7FB]">.lut</span>{" "}
            {t("showcase.section02Body2")}
          </p>
          <button
            type="button"
            onClick={onOpenStudio}
            className="min-h-[40px] px-4 py-2 rounded-full bg-[#1C2430] hover:bg-[#4A6B86]/45 border border-[#AAB7C5]/18 text-[#F4F7FB] font-sans font-medium text-xs inline-flex items-center gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
          >
            <span>{t("intro.openStudio")}</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#93B8D8]" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Crisp Single-Border #11161F Instrument Lab */}
      <div
        data-lenis-prevent
        className="rounded-2xl bg-[#11161F] border border-[#AAB7C5]/14 overflow-hidden"
      >
          <div className="border-b border-[#AAB7C5]/14 px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div
              role="tablist"
              aria-label="Editable LUT architecture stage switcher"
              className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#0A0C10] border border-[#AAB7C5]/14"
            >
              {LAB_MODES.map((mode) => {
                const isActive = activeMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveMode(mode.id)}
                    className={`relative min-h-[38px] sm:min-h-[34px] px-3.5 sm:px-4 py-1.5 rounded-lg font-sans text-xs sm:text-[13px] inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2] ${
                      isActive
                        ? "text-[#F4F7FB] font-semibold"
                        : "text-[#AAB7C5] hover:text-[#F4F7FB] font-medium"
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="lutStageIndicator"
                        transition={{
                          type: "spring",
                          stiffness: 420,
                          damping: 34,
                        }}
                        className="absolute inset-0 rounded-lg bg-[#4A6B86]/35 border border-[#7FA3C2]/55"
                      />
                    )}
                    <span className="relative z-10 whitespace-nowrap">
                      {t(mode.labelKey)}
                    </span>
                  </button>
                );
              })}
            </div>

            <span className="font-mono text-xs text-[#C9D7E2] tabular-nums">
              {activeTelemetrySummary}
            </span>
          </div>

          <div className="px-4 sm:px-6 py-6 sm:py-8">
            <AnimatePresence mode="wait">
              {activeMode === "curves" && (
                <motion.div
                  key="lab-curves"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: EASE_SHUTTER }}
                  className="space-y-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-sans text-[15px] font-semibold text-[#F4F7FB]">
                        {t("showcase.modeCurvesTitle")}
                      </h3>
                      <p className="font-sans text-[13px] text-[#AAB7C5]">
                        {t("showcase.curvesHint")}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {[
                        { id: "filmic", label: "Filmic S", s: 0.185, m: 0.5, h: 0.82 },
                        { id: "soft", label: "Soft Knee", s: 0.23, m: 0.52, h: 0.78 },
                        { id: "linear", label: "1:1 Linear", s: 0.25, m: 0.5, h: 0.75 },
                      ].map((preset) => {
                        const isPresetActive = curvePreset === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              setCurvePreset(preset.id);
                              setShadowY(preset.s);
                              setMidY(preset.m);
                              setHighY(preset.h);
                            }}
                            className={`min-h-[36px] px-3 py-1.5 rounded-lg font-sans text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2] ${
                              isPresetActive
                                ? "bg-[#4A6B86]/35 border-[#7FA3C2]/55 text-[#F4F7FB]"
                                : "bg-[#0A0C10]/60 hover:bg-[#1C2430] border-[#AAB7C5]/14 text-[#C9D7E2]"
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="relative py-2 sm:py-3 select-none">
                    <svg
                      ref={svgRef}
                      viewBox={`0 0 ${W} ${H}`}
                      onPointerMove={handleSvgPointerMove}
                      onPointerUp={handleSvgPointerUp}
                      onPointerCancel={handleSvgPointerUp}
                      style={{ touchAction: "none" }}
                      className="w-full h-[220px] sm:h-[260px] block overflow-visible"
                    >
                      <defs>
                        <linearGradient
                          id="intro-tone-curve-fill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor="#7FA3C2" stopOpacity="0.22" />
                          <stop offset="100%" stopColor="#4A6B86" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {[0.25, 0.5, 0.75].map((frac) => (
                        <g key={frac}>
                          <line
                            x1={W * frac}
                            y1={0}
                            x2={W * frac}
                            y2={H}
                            stroke="rgba(170,183,197,0.10)"
                            strokeWidth="1"
                          />
                          <line
                            x1={0}
                            y1={H * frac}
                            x2={W}
                            y2={H * frac}
                            stroke="rgba(170,183,197,0.10)"
                            strokeWidth="1"
                          />
                        </g>
                      ))}

                      <line
                        x1={0}
                        y1={H}
                        x2={W}
                        y2={0}
                        stroke="rgba(170,183,197,0.22)"
                        strokeDasharray="3 3"
                        strokeWidth="1"
                      />

                      <path d={areaPath} fill="url(#intro-tone-curve-fill)" />

                      <path
                        d={curvePath}
                        fill="none"
                        stroke="#93B8D8"
                        strokeWidth="2.5"
                      />

                      {[
                        { id: "shadow", label: "Shadow", pt: p1, val: (shadowY * 100).toFixed(1) },
                        { id: "mid", label: "Mid", pt: p2, val: (midY * 100).toFixed(1) },
                        { id: "high", label: "Highlight", pt: p3, val: (highY * 100).toFixed(1) },
                      ].map((node) => {
                        const isGrabbed = draggingHandle === node.id;
                        return (
                          <g
                            key={node.id}
                            role="slider"
                            tabIndex={0}
                            aria-label={`${node.label} tonal curve node`}
                            aria-valuemin={4}
                            aria-valuemax={98}
                            aria-valuenow={Math.round(Number(node.val))}
                            onPointerDown={(e) => handleSvgPointerDown(e, node.id)}
                            onKeyDown={(e) => {
                              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                              e.preventDefault();
                              const step = e.key === "ArrowUp" ? 0.02 : -0.02;
                              setCurvePreset("custom");
                              if (node.id === "shadow") {
                                setShadowY((v) => clamp(v + step, 0.04, 0.45));
                              } else if (node.id === "mid") {
                                setMidY((v) => clamp(v + step, 0.22, 0.82));
                              } else if (node.id === "high") {
                                setHighY((v) => clamp(v + step, 0.52, 0.98));
                              }
                            }}
                            className="cursor-ns-resize focus:outline-none"
                          >
                            <circle cx={node.pt.x} cy={node.pt.y} r={18} fill="transparent" />
                            <circle
                              cx={node.pt.x}
                              cy={node.pt.y}
                              r={isGrabbed ? 7 : 5.5}
                              fill="#F4F7FB"
                              stroke="#4A6B86"
                              strokeWidth={isGrabbed ? "3" : "2.5"}
                            />
                            <text
                              x={node.pt.x}
                              y={Math.max(16, node.pt.y - 13)}
                              textAnchor="middle"
                              fill="#C9D7E2"
                              fontSize="10.5"
                              fontFamily="IBM Plex Mono, monospace"
                            >
                              {node.val} IRE
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  <div className="pt-4 border-t border-[#AAB7C5]/12 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:divide-x sm:divide-[#AAB7C5]/12">
                    {[
                      { label: "Toe", value: `${toeIre} IRE` },
                      { label: "Mid", value: `${midIre} IRE` },
                      { label: "Knee", value: `${kneeIre} IRE` },
                      { label: "Gamma", value: `γ ${gammaReadout}` },
                    ].map((stat, idx) => (
                      <div
                        key={stat.label}
                        className={`${idx > 0 ? "sm:pl-4" : ""} flex items-center justify-between gap-2`}
                      >
                        <span className="font-sans text-xs text-[#AAB7C5]">
                          {stat.label}
                        </span>
                        <span className="font-mono text-xs font-semibold text-[#F4F7FB] tabular-nums">
                          {stat.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {activeMode === "wheels" && (
                <motion.div
                  key="lab-wheels"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: EASE_SHUTTER }}
                  className="space-y-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-sans text-[15px] font-semibold text-[#F4F7FB]">
                        {t("showcase.modeWheelsTitle")}
                      </h3>
                      <p className="font-sans text-[13px] text-[#AAB7C5]">
                        {t("showcase.wheelsHint")}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {WHEEL_PRESETS.map((preset) => {
                        const isActive = wheelPresetId === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => applyWheelPreset(preset)}
                            className={`min-h-[36px] px-3 py-1.5 rounded-lg font-sans text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2] ${
                              isActive
                                ? "bg-[#4A6B86]/35 border-[#7FA3C2]/55 text-[#F4F7FB]"
                                : "bg-[#0A0C10]/60 hover:bg-[#1C2430] border-[#AAB7C5]/14 text-[#C9D7E2]"
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#AAB7C5]/12">
                      {[
                        { key: "lift", title: "Lift", sub: t("showcase.shadows"), vec: wheels.lift, rgb: liftRgb },
                        { key: "gamma", title: "Gamma", sub: t("showcase.midtones"), vec: wheels.gamma, rgb: gammaRgb },
                        { key: "gain", title: "Gain", sub: t("showcase.highlights"), vec: wheels.gain, rgb: gainRgb },
                      ].map((w, idx) => (
                        <div
                          key={w.key}
                          className={`flex flex-col items-center space-y-4 ${
                            idx === 0
                              ? "pb-5 sm:pb-0 sm:pr-6"
                              : idx === 1
                              ? "py-5 sm:py-0 sm:px-6"
                              : "pt-5 sm:pt-0 sm:pl-6"
                          }`}
                        >
                          <div className="w-full flex items-center justify-between">
                            <span className="font-sans text-[13px] font-semibold text-[#F4F7FB]">
                              {w.title}
                            </span>
                            <span className="font-sans text-xs text-[#AAB7C5]">
                              {w.sub}
                            </span>
                          </div>

                          <div
                            ref={(el) => {
                              if (el) wheelRefs.current[w.key] = el;
                            }}
                            onPointerDown={(e) => {
                              e.currentTarget.setPointerCapture?.(e.pointerId);
                              setDraggingWheel(w.key);
                              updateWheelFromPointer(e.clientX, e.clientY, w.key);
                            }}
                            onPointerMove={(e) => {
                              if (draggingWheel !== w.key) return;
                              updateWheelFromPointer(e.clientX, e.clientY, w.key);
                            }}
                            onPointerUp={() => setDraggingWheel(null)}
                            onPointerCancel={() => setDraggingWheel(null)}
                            onDoubleClick={() => {
                              setWheelPresetId("custom");
                              setWheels((prev) => ({
                                ...prev,
                                [w.key]: { x: 0, y: 0 },
                              }));
                            }}
                            style={{
                              touchAction: "none",
                              background:
                                "conic-gradient(from 90deg, rgba(244,63,94,0.20), rgba(245,158,11,0.20), rgba(16,185,129,0.20), rgba(56,189,248,0.20), rgba(168,85,247,0.20), rgba(244,63,94,0.20))",
                            }}
                            className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-full border border-[#AAB7C5]/22 cursor-crosshair select-none flex items-center justify-center shadow-[inset_0_0_24px_rgba(7,9,13,0.9)]"
                          >
                            <div className="absolute inset-3.5 rounded-full border border-[#AAB7C5]/14 pointer-events-none" />
                            <div className="absolute inset-x-2 top-1/2 h-px bg-[#AAB7C5]/18 pointer-events-none" />
                            <div className="absolute inset-y-2 left-1/2 w-px bg-[#AAB7C5]/18 pointer-events-none" />

                            <svg
                              viewBox="-50 -50 100 100"
                              className="absolute inset-0 w-full h-full pointer-events-none"
                            >
                              <line
                                x1="0"
                                y1="0"
                                x2={w.vec.x * 38}
                                y2={w.vec.y * 38}
                                stroke="#93B8D8"
                                strokeWidth="1.75"
                              />
                            </svg>

                            <span
                              style={{
                                transform: `translate3d(${w.vec.x * 46}px, ${
                                  w.vec.y * 46
                                }px, 0)`,
                              }}
                              className="pointer-events-none w-3.5 h-3.5 rounded-full bg-[#F4F7FB] border-2 border-[#7FA3C2] shadow-[0_1px_8px_rgba(0,0,0,0.75)]"
                            />
                          </div>

                          <div className="w-full pt-2.5 border-t border-[#AAB7C5]/12 flex items-center justify-between font-mono text-[11px] tabular-nums">
                            <span className="text-rose-300">R {w.rgb.r}</span>
                            <span className="text-emerald-300">G {w.rgb.g}</span>
                            <span className="text-sky-300">B {w.rgb.b}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeMode === "skin" && (
                <motion.div
                  key="lab-skin"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: EASE_SHUTTER }}
                  className="space-y-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-sans text-[15px] font-semibold text-[#F4F7FB]">
                        {t("showcase.skinVectorHeading")}
                      </h3>
                      <p className="font-sans text-[13px] text-[#AAB7C5]">
                        {t("showcase.skinVectorHint")}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSkinPhaseLocked(true)}
                        className={`min-h-[36px] px-3 py-1.5 rounded-lg font-sans text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2] ${
                          skinPhaseLocked
                            ? "bg-[#4A6B86]/35 border-[#7FA3C2]/55 text-[#F4F7FB]"
                            : "bg-[#0A0C10]/60 hover:bg-[#1C2430] border-[#AAB7C5]/14 text-[#C9D7E2]"
                        }`}
                      >
                        {t("showcase.phaseLockBtn")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSkinPhaseLocked(false)}
                        className={`min-h-[36px] px-3 py-1.5 rounded-lg font-sans text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 ${
                          !skinPhaseLocked
                            ? "bg-amber-500/15 border-amber-400/60 text-amber-200"
                            : "bg-[#0A0C10]/60 hover:bg-[#1C2430] border-[#AAB7C5]/14 text-[#C9D7E2]"
                        }`}
                      >
                        {t("showcase.unprotectedShiftBtn")}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                    <div className="md:col-span-6 flex items-center justify-center">
                      <svg
                        viewBox="-100 -100 200 200"
                        className="w-52 h-52 sm:w-60 sm:h-60 block overflow-visible"
                      >
                        <circle cx="0" cy="0" r="86" fill="none" stroke="rgba(170,183,197,0.18)" strokeWidth="1" />
                        <circle cx="0" cy="0" r="46" fill="none" stroke="rgba(170,183,197,0.10)" strokeWidth="1" />
                        <line x1="-86" y1="0" x2="86" y2="0" stroke="rgba(170,183,197,0.12)" strokeWidth="1" />
                        <line x1="0" y1="-86" x2="0" y2="86" stroke="rgba(170,183,197,0.12)" strokeWidth="1" />

                        <path
                          d="M 0 0 L -22.5 -83.0 A 86 86 0 0 0 -68.4 -52.2 Z"
                          fill={
                            skinPhaseLocked
                              ? "rgba(74, 107, 134, 0.24)"
                              : "rgba(245, 158, 11, 0.10)"
                          }
                          stroke={
                            skinPhaseLocked
                              ? "rgba(147, 184, 216, 0.55)"
                              : "rgba(245, 158, 11, 0.30)"
                          }
                          strokeWidth="1"
                        />

                        <line
                          x1="0"
                          y1="0"
                          x2="-46.8"
                          y2="-72.1"
                          stroke="#F59E0B"
                          strokeWidth="1.5"
                          strokeDasharray="3 3"
                        />
                        <text
                          x="-54"
                          y="-76"
                          textAnchor="end"
                          fill="#FBBF24"
                          fontSize="8.5"
                          fontFamily="IBM Plex Mono, monospace"
                        >
                          123.0° I-LINE
                        </text>

                        {[
                          { x: 26, y: 34 },
                          { x: 34, y: 42 },
                          { x: 29, y: 48 },
                          { x: 40, y: 36 },
                          { x: 22, y: 39 },
                        ].map((pt, i) => (
                          <circle
                            key={`teal-${i}`}
                            cx={pt.x}
                            cy={pt.y}
                            r="3"
                            fill="#7FA3C2"
                            fillOpacity="0.75"
                          />
                        ))}

                        {[
                          { lx: -24, ly: -37, ux: -4, uy: -19 },
                          { lx: -31, ly: -48, ux: -8, uy: -25 },
                          { lx: -37, ly: -56, ux: -11, uy: -30 },
                          { lx: -28, ly: -43, ux: -5, uy: -22 },
                          { lx: -34, ly: -52, ux: -9, uy: -27 },
                          { lx: -21, ly: -33, ux: -2, uy: -16 },
                        ].map((pt, i) => {
                          const cx = pt.ux + (pt.lx - pt.ux) * lockFactor;
                          const cy = pt.uy + (pt.ly - pt.uy) * lockFactor;
                          return (
                            <circle
                              key={`skin-${i}`}
                              cx={cx}
                              cy={cy}
                              r="4"
                              fill={skinPhaseLocked ? "#93B8D8" : "#F59E0B"}
                              stroke="#F4F7FB"
                              strokeWidth="1"
                            />
                          );
                        })}
                      </svg>
                    </div>

                    <div className="md:col-span-6 md:border-l md:border-[#AAB7C5]/12 md:pl-6 space-y-4">
                      <PrecisionGradingSlider
                        label={t("showcase.phaseRetention")}
                        value={skinRetention}
                        min={0}
                        max={100}
                        defaultValue={86}
                        displayValue={`${effectiveRetention}%`}
                        ticks={["0%", "50%", "100%"]}
                        onChange={(val) => {
                          setSkinPhaseLocked(true);
                          setSkinRetention(val);
                        }}
                        accentReadout
                      />

                      <div className="pt-3 border-t border-[#AAB7C5]/12 grid grid-cols-2 gap-3 divide-x divide-[#AAB7C5]/12 px-5">
                        <div>
                          <div className="font-sans text-xs text-[#AAB7C5]">
                            {t("showcase.targetAxis")}
                          </div>
                          <div className="font-mono text-xs font-semibold text-[#F4F7FB] mt-0.5 tabular-nums">
                            {t("showcase.phaseLockBtn")}
                          </div>
                        </div>
                        <div className="pl-3">
                          <div className="font-sans text-xs text-[#AAB7C5]">
                            {t("showcase.skinHueDrift")}
                          </div>
                          <div
                            className={`font-mono text-xs font-semibold mt-0.5 tabular-nums ${
                              skinPhaseLocked ? "text-[#93B8D8]" : "text-amber-300"
                            }`}
                          >
                            {skinPhaseLocked
                              ? `±${((1 - lockFactor) * 8.4 + 0.6).toFixed(1)}° Safe`
                              : "+18.4° Shift"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
      </div>
    </motion.section>
  );
}

/**
 * Authentic Isometric 3D Cube Emblem + High-Definition Halftone Dot-Matrix ToneBench Wordmark
 */
function OversizedDotMatrixEmblem() {
  const uid = useId().replace(/:/g, "");
  const cubeTopGradId = `tbFooterCubeTop-${uid}`;
  const dotScreenPatternId = `tbFooterDotScreen-${uid}`;
  const dotScreenMaskId = `tbFooterDotMask-${uid}`;
  const wordmarkTextMaskId = `tbFooterWordmarkMask-${uid}`;
  const wordmarkGradId = `tbFooterWordmarkGrad-${uid}`;

  return (
    <div className="w-full pt-8 pb-4 select-none overflow-hidden" aria-hidden="true">
      <svg
        viewBox="0 0 1120 176"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto block"
      >
        <defs>
          {/* Authentic ToneBench top facet gradient matching BrandLogo.tsx */}
          <linearGradient
            id={cubeTopGradId}
            x1="15"
            y1="13.5"
            x2="33"
            y2="24"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#F4F7FB" />
            <stop offset="100%" stopColor="#C9D7E2" />
          </linearGradient>

          {/* Crisp vertical Arctic Ink -> Steel Blue ramp for the halftone wordmark */}
          <linearGradient
            id={wordmarkGradId}
            x1="0"
            y1="22"
            x2="0"
            y2="156"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#C9D7E2" />
            <stop offset="48%" stopColor="#93B8D8" />
            <stop offset="82%" stopColor="#7FA3C2" />
            <stop offset="100%" stopColor="#4A6B86" />
          </linearGradient>

          {/* Dense high-definition 45-degree halftone dot screen */}
          <pattern
            id={dotScreenPatternId}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1.5" cy="1.5" r="2.05" fill="#FFFFFF" />
            <circle cx="4.5" cy="4.5" r="1.9" fill="#FFFFFF" fillOpacity="0.92" />
          </pattern>

          <mask id={dotScreenMaskId}>
            <rect width="1120" height="176" fill={`url(#${dotScreenPatternId})`} />
          </mask>

          <mask id={wordmarkTextMaskId}>
            <text
              x="174"
              y="142"
              fill="#FFFFFF"
              fontFamily="'Bricolage Grotesque', 'Instrument Sans', sans-serif"
              fontWeight="700"
              fontSize="160"
              letterSpacing="-0.042em"
            >
              ToneBench
            </text>
          </mask>
        </defs>

        {/* Exact Authentic ToneBench Isometric 3D LUT Cube Emblem (Left) */}
        <g transform="translate(8, 16) scale(3.0)">
          <polygon
            points="24,4 41,14 41,34 24,44 7,34 7,14"
            fill="rgba(17, 22, 31, 0.72)"
            stroke="rgba(201, 215, 226, 0.56)"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <line
            x1="24"
            y1="4"
            x2="24"
            y2="13.5"
            stroke="rgba(127, 163, 194, 0.52)"
            strokeWidth="0.9"
            strokeLinecap="round"
          />
          <line
            x1="41"
            y1="34"
            x2="33"
            y2="29.3"
            stroke="rgba(127, 163, 194, 0.52)"
            strokeWidth="0.9"
            strokeLinecap="round"
          />
          <line
            x1="7"
            y1="34"
            x2="15"
            y2="29.3"
            stroke="rgba(127, 163, 194, 0.52)"
            strokeWidth="0.9"
            strokeLinecap="round"
          />

          {/* Solid geometric 3D cube facets (#C9D7E2 / #7FA3C2 / #4A6B86) */}
          <polygon
            points="24,13.5 33,18.7 24,24 15,18.7"
            fill={`url(#${cubeTopGradId})`}
          />
          <polygon
            points="15,18.7 24,24 24,34.5 15,29.3"
            fill="#7FA3C2"
          />
          <polygon
            points="24,24 33,18.7 33,29.3 24,34.5"
            fill="#4A6B86"
          />

          {/* Crisp inner isometric ridge highlights */}
          <polyline
            points="15,18.7 24,24 33,18.7"
            fill="none"
            stroke="rgba(244, 247, 251, 0.72)"
            strokeWidth="0.85"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line
            x1="24"
            y1="24"
            x2="24"
            y2="34.5"
            stroke="rgba(244, 247, 251, 0.72)"
            strokeWidth="0.85"
            strokeLinecap="round"
          />
        </g>

        {/* High-Definition Halftone Dot-Matrix Filled ToneBench Wordmark */}
        <g mask={`url(#${wordmarkTextMaskId})`}>
          <rect
            x="164"
            y="0"
            width="956"
            height="176"
            fill="#4A6B86"
            fillOpacity="0.18"
          />
          <rect
            x="164"
            y="0"
            width="956"
            height="176"
            fill={`url(#${wordmarkGradId})`}
            mask={`url(#${dotScreenMaskId})`}
          />
        </g>
      </svg>
    </div>
  );
}

/**
 * Section 03 & 04 - Horizontal Row Lists (Zero Bento Boxes) + Multi-Column Closing & Oversized Dot-Matrix Footer
 */
function PipelineAndFooterSection({
  scrollRootRef,
  onOpenStudio,
  onNavigateView,
  onOpenCommandPalette,
  onScrollToSection,
  onScrollToTop,
  onOpenGuide,
}) {
  const { t } = useLanguage();
  const [openFaqId, setOpenFaqId] = useState("faq-local");

  const workflowRows = [
    {
      idx: "01",
      title: t("showcase.step01Title"),
      desc: t("showcase.step01Desc"),
      meta: "Rec.709 · S-Log3 · C-Log3 · Apple Log",
      action: onOpenStudio,
      external: false,
    },
    {
      idx: "02",
      title: `${t("showcase.step02TitlePrefix")} .cube / .lut`,
      desc: `${t("showcase.step02Desc1")} .cube ${t("showcase.step02DescOr")} .lut ${t("showcase.step02Desc2")}`,
      meta: "17³ · 33³ · 65³ 3D LUT",
      action: () => onScrollToSection?.("anatomy"),
      external: false,
    },
    {
      idx: "03",
      title: t("showcase.rowFfxTitle"),
      desc: t("showcase.step03AeDesc"),
      meta: ".ffx · Lumetri Binary",
      action: onOpenGuide || onOpenStudio,
      external: false,
    },
    {
      idx: "04",
      title: t("showcase.rowKfplugTitle"),
      desc: t("showcase.step03KfDesc"),
      meta: ".kfplug · GLSL ES 1.00",
      action: onOpenGuide || onOpenStudio,
      external: false,
    },
  ];

  const faqRows = [
    {
      id: "faq-local",
      q: t("showcase.faq1Q"),
      a: t("showcase.faq1A"),
    },
    {
      id: "faq-editable",
      q: t("showcase.faq2Q"),
      a: t("showcase.faq2A"),
    },
    {
      id: "faq-formats",
      q: t("showcase.faq3Q"),
      a: t("showcase.faq3A"),
    },
    {
      id: "faq-log",
      q: t("showcase.faq4Q"),
      a: t("showcase.faq4A"),
    },
  ];

  return (
    <motion.section
      id="pipeline"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1, root: scrollRootRef }}
      transition={{ duration: 0.5, ease: EASE_SHUTTER }}
      className="relative pt-20 scroll-mt-20 pb-6 px-4 sm:px-8 max-w-6xl mx-auto text-left"
    >
      {/* Horizontal Row List: Pipeline & Export Formats (Zero Bento Boxes) */}
      <div className="pt-8 pb-16 border-t border-[#AAB7C5]/14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-10 items-end mb-8">
          <div className="lg:col-span-7 space-y-2">
            <div className="font-mono text-xs font-medium text-[#7FA3C2] tabular-nums">
              03 · {t("showcase.section03Eyebrow")}
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-[-0.025em] leading-[1.08] text-[#F4F7FB] text-balance">
              {t("showcase.section03Headline1")}
              <br />
              <span className="text-[#C9D7E2]">{t("showcase.section03Headline2")}</span>
            </h2>
          </div>

          <div className="lg:col-span-5 flex flex-col items-start gap-3">
            <p className="font-sans text-sm sm:text-[15px] leading-relaxed text-[#AAB7C5]">
              {t("showcase.section03Desc")}
            </p>
            {onOpenGuide && (
              <button
                type="button"
                onClick={onOpenGuide}
                className="min-h-[38px] inline-flex items-center gap-1.5 font-sans text-xs font-medium text-[#93B8D8] hover:text-[#F4F7FB] transition-colors cursor-pointer"
              >
                <span>{t("preview.howToUse")}</span>
                <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-[#AAB7C5]/12">
          {workflowRows.map((row) => (
            <button
              key={row.idx}
              type="button"
              onClick={row.action}
              className="group w-full border-b border-[#AAB7C5]/12 py-4 sm:py-5 px-2 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left transition-colors hover:bg-[#4A6B86]/10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
            >
              <div className="flex items-start sm:items-center gap-4 min-w-0">
                <span className="font-mono text-xs text-[#7FA3C2] tabular-nums shrink-0 pt-0.5 sm:pt-0">
                  {row.idx}
                </span>
                <div className="min-w-0 space-y-1">
                  <div className="font-sans text-sm sm:text-[15px] font-semibold text-[#F4F7FB] group-hover:text-[#FBFDFF]">
                    {row.title}
                  </div>
                  <p className="font-sans text-xs sm:text-[13.5px] text-[#AAB7C5] leading-relaxed max-w-2xl">
                    {row.desc}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 pl-8 sm:pl-0 shrink-0">
                <span className="font-mono text-xs text-[#C9D7E2] tabular-nums">
                  {row.meta}
                </span>
                <ArrowRight
                  className="w-4 h-4 text-[#7FA3C2] group-hover:text-[#F4F7FB] group-hover:translate-x-0.5 transition-all shrink-0"
                  strokeWidth={1.5}
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Product-Specific Technical Q&A Horizontal Row List */}
      <div className="pb-16">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl sm:text-[28px] font-semibold tracking-[-0.02em] text-[#F4F7FB] text-balance">
            {t("showcase.faqHeading")}
          </h2>
          <span className="font-mono text-xs text-[#AAB7C5]">
            OKLab · WebGL · Rec.709
          </span>
        </div>

        <div className="border-t border-[#AAB7C5]/12">
          {faqRows.map((item) => {
            const isOpen = openFaqId === item.id;
            return (
              <div key={item.id} className="border-b border-[#AAB7C5]/12">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenFaqId(isOpen ? "" : item.id)}
                  className="w-full min-h-[52px] py-4 px-2 sm:px-4 flex items-center justify-between gap-4 text-left hover:bg-[#4A6B86]/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
                >
                  <span className="font-sans text-sm sm:text-[15px] font-medium text-[#F4F7FB]">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={`studio-chevron w-4 h-4 text-[#93B8D8] shrink-0 ${
                      isOpen ? "rotate-180" : "rotate-0"
                    }`}
                    strokeWidth={1.5}
                  />
                </button>
                <div className="studio-collapse-grid" data-expanded={isOpen}>
                  <div className="studio-collapse-inner">
                    <p className="px-2 sm:px-4 pb-4 font-sans text-xs sm:text-sm leading-relaxed text-[#AAB7C5] max-w-3xl">
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dramatic Multi-Column Closing Band & 3-Column Directory */}
      <footer className="border-t border-[#AAB7C5]/14 pt-16 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 pb-12 items-start">
          {/* Left: Two-Line Confident Closing Statement + Crisp Open Studio CTA */}
          <div className="lg:col-span-6 space-y-6">
            <h2 className="font-display text-3xl sm:text-4xl lg:text-[44px] font-semibold tracking-[-0.03em] leading-[1.06] text-[#F4F7FB] text-balance">
              {t("showcase.closingLine1")}
              <br />
              <span className="text-[#93B8D8]">{t("showcase.closingLine2")}</span>
            </h2>

            <button
              type="button"
              onClick={onOpenStudio}
              className="group min-h-[46px] px-6 py-3 rounded-full bg-[#F4F7FB] hover:bg-[#FBFDFF] active:scale-[0.985] text-[#0A0C10] font-sans font-semibold text-sm tracking-[-0.01em] inline-flex items-center justify-center gap-2.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93B8D8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0C10]"
            >
              <span>{t("intro.openStudio")}</span>
              <ArrowRight
                className="w-4 h-4 translate-x-[0.5px] transition-transform duration-200 group-hover:translate-x-0.5"
                strokeWidth={1.75}
              />
            </button>
          </div>

          {/* Right: Clean 3-Column Directory (STUDIO, FORMATS, PROJECT) */}
          <nav
            aria-label="ToneBench directory"
            className="lg:col-span-6 grid grid-cols-2 sm:grid-cols-3 gap-8"
          >
            <div className="space-y-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#7FA3C2]">
                STUDIO
              </div>
              <ul className="space-y-2.5 font-sans text-sm text-[#C9D7E2]">
                <li>
                  <button
                    type="button"
                    onClick={onOpenStudio}
                    className="hover:text-[#F4F7FB] transition-colors cursor-pointer"
                  >
                    {t("intro.openStudio")}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => onScrollToSection?.("anatomy")}
                    className="hover:text-[#F4F7FB] transition-colors cursor-pointer"
                  >
                    {t("nav.lutLab")}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigateView?.("settings")}
                    className="hover:text-[#F4F7FB] transition-colors cursor-pointer"
                  >
                    {t("nav.settings")}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigateView?.("about")}
                    className="hover:text-[#F4F7FB] transition-colors cursor-pointer"
                  >
                    {t("nav.about")}
                  </button>
                </li>
                {onOpenCommandPalette && (
                  <li>
                    <button
                      type="button"
                      onClick={onOpenCommandPalette}
                      className="hover:text-[#F4F7FB] transition-colors cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <span>{t("nav.commandBarShort")}</span>
                      <span className="font-mono text-[10px] text-[#AAB7C5]">Ctrl+K</span>
                    </button>
                  </li>
                )}
              </ul>
            </div>

            <div className="space-y-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#7FA3C2]">
                FORMATS
              </div>
              <ul className="space-y-2.5 font-sans text-sm text-[#C9D7E2]">
                <li>
                  <button
                    type="button"
                    onClick={onOpenGuide || onOpenStudio}
                    className="hover:text-[#F4F7FB] transition-colors cursor-pointer"
                  >
                    <span className="font-mono text-xs text-[#F4F7FB]">.cube / .lut</span>{" "}
                    <span>3D LUT</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={onOpenGuide || onOpenStudio}
                    className="hover:text-[#F4F7FB] transition-colors cursor-pointer"
                  >
                    <span className="font-mono text-xs text-[#F4F7FB]">.ffx</span>{" "}
                    <span>After Effects</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={onOpenGuide || onOpenStudio}
                    className="hover:text-[#F4F7FB] transition-colors cursor-pointer"
                  >
                    <span className="font-mono text-xs text-[#F4F7FB]">.kfplug</span>{" "}
                    <span>Keyflow</span>
                  </button>
                </li>
                {onOpenGuide && (
                  <li>
                    <button
                      type="button"
                      onClick={onOpenGuide}
                      className="hover:text-[#F4F7FB] transition-colors cursor-pointer"
                    >
                      {t("preview.howToUse")}
                    </button>
                  </li>
                )}
              </ul>
            </div>

            <div className="space-y-3 col-span-2 sm:col-span-1">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#7FA3C2]">
                PROJECT
              </div>
              <ul className="space-y-2.5 font-sans text-sm text-[#C9D7E2]">
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigateView?.("support")}
                    className="hover:text-[#F4F7FB] transition-colors cursor-pointer"
                  >
                    {t("nav.support")}
                  </button>
                </li>
                <li>
                  <a
                    href="https://sociabuzz.com/tfbagas/shop"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-[#F4F7FB] transition-colors"
                  >
                    <span>{t("showcase.toolsAndPacks")}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-[#7FA3C2]" strokeWidth={1.5} />
                  </a>
                </li>
                <li>
                  <a
                    href="https://seethrough-studio.pages.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-[#F4F7FB] transition-colors"
                  >
                    <span>SeeThrough Studio</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-[#7FA3C2]" strokeWidth={1.5} />
                  </a>
                </li>
                <li>
                  <a
                    href="https://tfbagas.carrd.co"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-[#F4F7FB] transition-colors"
                  >
                    <span>TFBAGAS</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-[#7FA3C2]" strokeWidth={1.5} />
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        {/* Bottom Anchor: Oversized Architectural Halftone Dot-Matrix ToneBench Wordmark */}
        <OversizedDotMatrixEmblem />

        <div className="pt-4 border-t border-[#AAB7C5]/12 flex flex-wrap items-center justify-between gap-4">
          <div className="font-mono text-xs text-[#AAB7C5] tabular-nums">
            v1.0.0 · TFBAGAS
          </div>

          <button
            type="button"
            onClick={onScrollToTop}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#11161F] hover:bg-[#1C2430] border border-[#AAB7C5]/15 font-sans text-xs font-medium text-[#C9D7E2] hover:text-[#F4F7FB] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
          >
            <span>{t("showcase.backToTop")}</span>
            <ArrowUp className="w-3.5 h-3.5 text-[#93B8D8]" strokeWidth={1.5} />
          </button>
        </div>
      </footer>
    </motion.section>
  );
}

export default function IntroShowcaseSections({
  scrollRootRef,
  selectedEngineIdx = 0,
  onSelectEngineIdx,
  onOpenStudio,
  onNavigateView,
  onOpenCommandPalette,
  onScrollToSection,
  onScrollToTop,
  onTrySampleInStudio,
  onOpenGuide,
  isGuideOpen = false,
}) {
  const [internalIdx, setInternalIdx] = useState(0);
  const activeIdx =
    typeof onSelectEngineIdx === "function" ? selectedEngineIdx : internalIdx;
  const handleSelectIdx =
    typeof onSelectEngineIdx === "function"
      ? onSelectEngineIdx
      : setInternalIdx;

  return (
    <div className="relative z-20 w-full border-t border-[#AAB7C5]/14">
      <FramelessGradingMonitorSection
        scrollRootRef={scrollRootRef}
        selectedIdx={activeIdx}
        onSelectIdx={handleSelectIdx}
        onTrySampleInStudio={onTrySampleInStudio}
        isGuideOpen={isGuideOpen}
      />
      <LutAnatomyDecomposerSection
        scrollRootRef={scrollRootRef}
        onOpenStudio={onOpenStudio}
      />
      <PipelineAndFooterSection
        scrollRootRef={scrollRootRef}
        onOpenStudio={onOpenStudio}
        onNavigateView={onNavigateView}
        onOpenCommandPalette={onOpenCommandPalette}
        onScrollToSection={onScrollToSection}
        onScrollToTop={onScrollToTop}
        onOpenGuide={onOpenGuide}
      />
    </div>
  );
}
