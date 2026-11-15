import React, { useState, useRef, useEffect, useCallback } from "react";
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
  BarChart3,
  ChevronDown,
} from "lucide-react";

import ImageDropCard from "./components/ImageDropCard";
import ComparisonSlider from "./components/ComparisonSlider";
import ParameterControl from "./components/ParameterControl";
import ColorSwatchCard from "./components/ColorSwatchCard";
import ExportCard from "./components/ExportCard";
import SupportTab from "./components/SupportTab";
import SupportBanner from "./components/SupportBanner";
import SupportToast from "./components/SupportToast";
import KeyflowLogo from "./components/KeyflowLogo";
import ChangelogModal, { ChangelogList } from "./components/ChangelogModal";
import { DEFAULT_PARAMS, simulateGradePixels } from "./utils/colorGrading";
import { generateKfplug, downloadBlob } from "./utils/kfplugPackager";

const PARAM_CONTROLS = [
  { key: "exposure", label: "Exposure (EV)", min: -2.0, max: 2.0, step: 0.01, icon: Sun, isBipolar: true },
  { key: "contrast", label: "Contrast", min: 0.2, max: 2.0, step: 0.01, icon: Contrast, isBipolar: true },
  { key: "pivot", label: "Contrast Pivot", min: 0.1, max: 0.9, step: 0.01, icon: SlidersHorizontal, isBipolar: false },
  { key: "shadows", label: "Shadows Tint/Level", min: -0.5, max: 0.5, step: 0.01, icon: Droplet, isBipolar: true },
  { key: "highlights", label: "Highlights Tint/Level", min: -0.5, max: 0.5, step: 0.01, icon: Sparkles, isBipolar: true },
  { key: "temp", label: "Color Temperature", min: -1.0, max: 1.0, step: 0.01, icon: Thermometer, isBipolar: true },
  { key: "tint", label: "Color Tint", min: -1.0, max: 1.0, step: 0.01, icon: Palette, isBipolar: true },
  { key: "sat", label: "Saturation", min: 0.0, max: 2.0, step: 0.01, icon: Droplet, isBipolar: true },
  { key: "vib", label: "Vibrance", min: -0.8, max: 0.8, step: 0.01, icon: Activity, isBipolar: true },
];

// Helper to draw real-time RGB + Rec.709 Luma histogram onto the telemetry canvas
function drawHistogram(canvas, imageData) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Subtle background grid lines (25%, 50%, 75%)
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

  // Sample every 2nd pixel for instant 60fps telemetry
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

  // Find peak (ignoring extreme clipping bins 0 and 255 so midtones stay readable)
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
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isWheelsExpanded, setIsWheelsExpanded] = useState(true);

  // Image states
  const [referenceImage, setReferenceImage] = useState(null);
  const [targetImage, setTargetImage] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusText, setStatusText] = useState("Ready");

  // Grading parameter state
  const [gradingParams, setGradingParams] = useState({ ...DEFAULT_PARAMS });

  // Preview mode state lifted so mode switches always trigger canvas re-render
  const [previewMode, setPreviewMode] = useState("split");

  // Export metadata
  const [presetName, setPresetName] = useState("");
  const [authorName, setAuthorName] = useState("TFBAGAS");
  const [description, setDescription] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportToast, setExportToast] = useState({ visible: false, filename: "" });

  // Settings state
  const [analysisMaxDim, setAnalysisMaxDim] = useState(1280);
  const [previewMaxDim, setPreviewMaxDim] = useState(960);

  // Refs for Web Worker and Preview / Histogram Canvas
  const workerRef = useRef(null);
  const gradedCanvasRef = useRef(null);
  const histogramCanvasRef = useRef(null);
  const previewSourceImageDataRef = useRef(null);
  const lastRenderedImgRef = useRef(null);
  const rafRef = useRef(null);

  // Initialize Web Worker
  useEffect(() => {
    const worker = new Worker(
      new URL("./workers/colorMatchWorker.js", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (e) => {
      const { type, params, stage, error } = e.data;
      if (type === "stage") {
        setStatusText(stage || "Analyzing...");
      } else if (type === "success" && params) {
        setIsAnalyzing(false);
        setGradingParams(params);
        setStatusText("Matched");
      } else if (type === "error") {
        setIsAnalyzing(false);
        console.error("Worker error:", error);
        setStatusText("Error");
      }
    };

    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  // Helper to read image file and extract downscaled ImageData
  const loadImageFile = useCallback(
    (file, type) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const img = new Image();
        img.onload = () => {
          const ext = file.name.split(".").pop()?.toUpperCase() || "IMG";
          const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
          const baseName = file.name.replace(/\.[^/.]+$/, "");

          const info = {
            name: file.name,
            baseName,
            width: img.naturalWidth,
            height: img.naturalHeight,
            ext,
            sizeMB,
            dataUrl,
            imgElement: img,
          };

          if (type === "reference") {
            setReferenceImage(info);
            setPresetName(baseName.slice(0, 28));
            setDescription(`Grading preset matched from reference '${baseName}'.`);

            // Downscale for Web Worker analysis
            setIsAnalyzing(true);
            setStatusText("Analyzing...");

            const scale = Math.min(
              1,
              analysisMaxDim / Math.max(img.naturalWidth, img.naturalHeight)
            );
            const w = Math.max(1, Math.round(img.naturalWidth * scale));
            const h = Math.max(1, Math.round(img.naturalHeight * scale));

            const offCanvas = document.createElement("canvas");
            offCanvas.width = w;
            offCanvas.height = h;
            const ctx = offCanvas.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);
            const imgData = ctx.getImageData(0, 0, w, h);

            workerRef.current?.postMessage({
              type: "analyze",
              rgbaData: imgData.data,
              numPixels: w * h,
            });
          } else {
            setTargetImage(info);
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    },
    [analysisMaxDim]
  );

  // Generate a procedural sample image so users can test immediately
  const handleTrySample = useCallback(
    (type) => {
      const w = 960;
      const h = 540;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");

      if (type === "reference") {
        // Cinematic Teal & Amber Sunset Film Frame
        const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.68);
        skyGrad.addColorStop(0, "#0b2434");
        skyGrad.addColorStop(0.45, "#194a5a");
        skyGrad.addColorStop(0.8, "#d97736");
        skyGrad.addColorStop(1, "#f3a852");
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, h);

        // Warm sun glow
        const sunGrad = ctx.createRadialGradient(w * 0.62, h * 0.52, 10, w * 0.62, h * 0.52, 220);
        sunGrad.addColorStop(0, "rgba(255, 220, 145, 0.95)");
        sunGrad.addColorStop(0.4, "rgba(240, 135, 60, 0.45)");
        sunGrad.addColorStop(1, "rgba(20, 50, 65, 0)");
        ctx.fillStyle = sunGrad;
        ctx.fillRect(0, 0, w, h);

        // Deep teal ocean / horizon reflection
        const seaGrad = ctx.createLinearGradient(0, h * 0.65, 0, h);
        seaGrad.addColorStop(0, "#143542");
        seaGrad.addColorStop(0.5, "#0d2530");
        seaGrad.addColorStop(1, "#07141b");
        ctx.fillStyle = seaGrad;
        ctx.fillRect(0, h * 0.65, w, h * 0.35);

        // City skyline silhouettes
        ctx.fillStyle = "#091820";
        const blocks = [
          [60, 270, 55, 90],
          [125, 230, 65, 130],
          [200, 255, 48, 105],
          [260, 205, 75, 155],
          [345, 240, 60, 120],
          [420, 280, 90, 80],
          [710, 250, 65, 110],
          [785, 220, 70, 140],
        ];
        blocks.forEach(([bx, by, bw, bh]) => ctx.fillRect(bx, by, bw, bh));
      } else {
        // Neutral Daylight Scene for Target Preview
        const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.62);
        skyGrad.addColorStop(0, "#4b79a1");
        skyGrad.addColorStop(0.6, "#7fa6c9");
        skyGrad.addColorStop(1, "#c8d9e6");
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, h);

        // Soft mountains
        ctx.fillStyle = "#4d5d6c";
        ctx.beginPath();
        ctx.moveTo(0, h * 0.62);
        ctx.lineTo(w * 0.25, h * 0.36);
        ctx.lineTo(w * 0.52, h * 0.58);
        ctx.lineTo(w * 0.78, h * 0.32);
        ctx.lineTo(w, h * 0.55);
        ctx.lineTo(w, h * 0.62);
        ctx.closePath();
        ctx.fill();

        // Neutral foreground foliage & ground
        const groundGrad = ctx.createLinearGradient(0, h * 0.62, 0, h);
        groundGrad.addColorStop(0, "#5c7457");
        groundGrad.addColorStop(0.5, "#3f533d");
        groundGrad.addColorStop(1, "#273326");
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, h * 0.62, w, h * 0.38);

        // Mini color reference patches in corner
        const patches = ["#d14949", "#d98a3c", "#e0c341", "#4ba366", "#457ec4", "#e5e7eb", "#6b7280", "#1f2937"];
        patches.forEach((col, idx) => {
          ctx.fillStyle = col;
          ctx.fillRect(36 + idx * 34, h - 54, 28, 28);
        });
      }

      canvas.toBlob((blob) => {
        if (!blob) return;
        const fileName =
          type === "reference"
            ? "Sample_Cinematic_TealAmber.png"
            : "Sample_Daylight_Target.png";
        const file = new File([blob], fileName, { type: "image/png" });
        loadImageFile(file, type);
      }, "image/png");
    },
    [loadImageFile]
  );

  // Global Clipboard Paste (Ctrl+V / Cmd+V) support
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const blob = items[i].getAsFile();
          if (blob) {
            const ext = blob.type.split("/")[1] || "png";
            const file = new File([blob], `Clipboard_Image.${ext}`, {
              type: blob.type,
            });
            const targetSlot = !referenceImage ? "reference" : "target";
            loadImageFile(file, targetSlot);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [referenceImage, loadImageFile]);

  // Core function that draws graded pixels onto the active preview canvas and updates histogram
  const updatePreviewSimulation = useCallback(() => {
    const srcData = previewSourceImageDataRef.current;
    const canvas = gradedCanvasRef.current;
    if (!srcData || !canvas) return;

    const ctx = canvas.getContext("2d");
    const targetImgData = ctx.createImageData(srcData.width, srcData.height);
    simulateGradePixels(srcData.data, targetImgData.data, gradingParams);
    ctx.putImageData(targetImgData, 0, 0);
    canvas.dataset.rendered = "true";

    drawHistogram(histogramCanvasRef.current, targetImgData);
  }, [gradingParams]);

  // Prepare base preview ImageData and render whenever target/reference image, previewMode, or gradingParams change
  useEffect(() => {
    const activeImg = targetImage?.imgElement || referenceImage?.imgElement;
    const canvas = gradedCanvasRef.current;

    if (!activeImg || !canvas) {
      previewSourceImageDataRef.current = null;
      lastRenderedImgRef.current = null;
      drawHistogram(histogramCanvasRef.current, null);
      return;
    }

    const scale = Math.min(
      1,
      previewMaxDim / Math.max(activeImg.naturalWidth, activeImg.naturalHeight)
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
  }, [targetImage, referenceImage, previewMaxDim, previewMode, updatePreviewSimulation]);

  const handleParamChange = (key, value) => {
    setGradingParams((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleResetParams = () => {
    setGradingParams({ ...DEFAULT_PARAMS });
  };

  const handleExport = async () => {
    if (!referenceImage) return;
    setIsExporting(true);
    setStatusText("Exporting...");
    try {
      const { blob, fileName } = await generateKfplug(
        gradingParams,
        presetName || referenceImage.baseName || "Custom Look",
        authorName || "TFBAGAS",
        description
      );
      downloadBlob(blob, fileName);
      setStatusText("Exported!");
      setExportToast({ visible: true, filename: fileName });
    } catch (err) {
      console.error("Failed to package .kfplug:", err);
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

  const activeTabIndex = Math.max(
    0,
    navTabs.findIndex((t) => t.id === activeTab)
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#0E0E11] text-[#E2E4E9]">
      {/* Compact 48px Top App Bar (Material 3 Workstation Header) */}
      <header className="sticky top-0 z-40 min-h-12 px-3 sm:px-5 py-1.5 bg-[#151519]/95 backdrop-blur-md border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
        {/* Left: Achromatic Keyflow Logo + Brand Title + Interactive v0.6 Beta Changelog Button */}
        <div className="flex items-center gap-2.5">
          <KeyflowLogo size={28} />
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-bold font-display tracking-tight text-[#E2E4E9]">
              Color Match Tool
            </h1>
            <button
              type="button"
              onClick={() => setIsChangelogOpen(true)}
              title="View What's New in v0.6 Beta"
              className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#1E1E24] hover:bg-white/10 text-[#E2E4E9] border border-white/[0.1] hover:border-white/25 transition-all cursor-pointer active:scale-95"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7]" />
              <span>v0.6 Beta</span>
            </button>
          </div>
        </div>

        {/* Right: Material 3 Sliding Segmented Navigation Pill + Status Chip */}
        <div className="flex items-center gap-2 ml-auto">
          <nav
            aria-label="Primary Navigation"
            className="relative grid grid-cols-4 items-center bg-[#0E0E11] border border-white/[0.08] rounded-xl p-0.5"
          >
            {/* Smooth Sliding Active Pill Indicator */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 rounded-lg bg-[#E2E4E9] transition-transform duration-300"
              style={{
                width: "calc((100% - 4px) / 4)",
                transform: `translateX(${activeTabIndex * 100}%)`,
              }}
            />

            {navTabs.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative z-10 flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg text-xs font-medium transition-colors duration-200 cursor-pointer ${
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

          {/* Status Indicator */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1E1E24] border border-white/[0.08] text-[11px] font-mono text-[#E2E4E9]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isAnalyzing
                  ? "bg-amber-400 animate-ping"
                  : statusText === "Matched" || statusText === "Exported!"
                  ? "bg-[#6EE7B7]"
                  : "bg-[#9CA3AF]"
              }`}
            />
            <span>{statusText.toUpperCase()}</span>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-5 py-3.5">
        {/* WORKSPACE TAB (Kept mounted so canvas & state never reset when switching tabs) */}
        <div
          className={
            activeTab === "home" ? "space-y-3 m3-tab-enter" : "hidden"
          }
        >
          {/* Subtle Support Banner */}
          <SupportBanner onOpenSupport={() => setActiveTab("support")} />

          {/* 2-Column Workstation Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
            {/* LEFT COLUMN: Reference, Target, and Visual Preview (7 Cols) */}
            <div className="lg:col-span-7 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-3">
                <ImageDropCard
                  title="REFERENCE"
                  imageInfo={referenceImage}
                  onSelectImage={(file) => loadImageFile(file, "reference")}
                  onClearImage={() => {
                    setReferenceImage(null);
                    setStatusText("Ready");
                  }}
                  onTrySample={() => handleTrySample("reference")}
                  isAnalyzing={isAnalyzing}
                />

                <ImageDropCard
                  title="TARGET IMAGE"
                  imageInfo={targetImage}
                  onSelectImage={(file) => loadImageFile(file, "target")}
                  onClearImage={() => setTargetImage(null)}
                  onTrySample={() => handleTrySample("target")}
                />
              </div>

              <ComparisonSlider
                originalImage={activePreviewImageUrl}
                gradedCanvasRef={gradedCanvasRef}
                hasImage={Boolean(activePreviewImageUrl)}
                mode={previewMode}
                onModeChange={setPreviewMode}
              />
            </div>

            {/* RIGHT COLUMN: Telemetry Histogram + Detected Parameters + Export (5 Cols) */}
            <div className="lg:col-span-5 space-y-3">
              {/* Detected Parameters Card */}
              <div className="m3-panel rounded-2xl p-3.5">
                {/* Header */}
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5 text-[#9CA3AF]" />
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">
                      DETECTED PARAMETERS
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={handleResetParams}
                    className="flex items-center gap-1 text-[11px] font-medium text-[#9CA3AF] hover:text-[#E2E4E9] px-2 py-1 rounded-md bg-[#1E1E24] hover:bg-white/10 border border-white/[0.08] transition-colors cursor-pointer active:scale-95"
                    title="Reset all sliders to neutral defaults"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset All</span>
                  </button>
                </div>

                {/* Real-Time Mini RGB / Rec.709 Luma Histogram Telemetry */}
                <div className="mb-3 rounded-lg bg-[#0E0E11] border border-white/[0.08] p-2">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#9CA3AF] mb-1">
                    <span className="inline-flex items-center gap-1 uppercase tracking-wider">
                      <BarChart3 className="w-3 h-3 text-[#9CA3AF]" />
                      RGB / Rec.709 Luma Scope
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-red-400/90">R</span>
                      <span className="text-green-400/90">G</span>
                      <span className="text-blue-400/90">B</span>
                      <span className="text-[#E2E4E9]/90">Y</span>
                    </div>
                  </div>
                  <div className="relative h-14 w-full overflow-hidden rounded">
                    <canvas
                      ref={histogramCanvasRef}
                      width={340}
                      height={56}
                      className="w-full h-full block"
                    />
                    {!activePreviewImageUrl && (
                      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-mono text-[#9CA3AF]/50">
                        NO SIGNAL — LOAD IMAGE OR CLICK TRY SAMPLE
                      </div>
                    )}
                  </div>
                </div>

                {/* Bipolar Sliders List */}
                <div className="space-y-0.5 divide-y divide-white/[0.04]">
                  {PARAM_CONTROLS.map((ctrl) => (
                    <ParameterControl
                      key={ctrl.key}
                      paramKey={ctrl.key}
                      label={ctrl.label}
                      min={ctrl.min}
                      max={ctrl.max}
                      step={ctrl.step}
                      value={gradingParams[ctrl.key] ?? DEFAULT_PARAMS[ctrl.key]}
                      defaultValue={DEFAULT_PARAMS[ctrl.key]}
                      isBipolar={ctrl.isBipolar}
                      onChange={handleParamChange}
                      icon={ctrl.icon}
                    />
                  ))}
                </div>

                {/* Collapsible 3-Way Color Wheels Swatches */}
                <div className="mt-3 pt-3 border-t border-white/[0.08]">
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
                      {/* Mini inline swatch preview dots when collapsed */}
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
                        className="p-1 rounded-lg bg-[#1E1E24]/70 hover:bg-[#1E1E24] text-[#9CA3AF] hover:text-[#E2E4E9] border border-white/[0.06] transition-all cursor-pointer"
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
                        <ColorSwatchCard
                          title="Shadows (Lift)"
                          rgb={[
                            gradingParams.liftR,
                            gradingParams.liftG,
                            gradingParams.liftB,
                          ]}
                        />
                        <ColorSwatchCard
                          title="Midtones (Gamma)"
                          rgb={[
                            gradingParams.gammaR,
                            gradingParams.gammaG,
                            gradingParams.gammaB,
                          ]}
                        />
                        <ColorSwatchCard
                          title="Highs (Gain)"
                          rgb={[
                            gradingParams.gainR,
                            gradingParams.gainG,
                            gradingParams.gainB,
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Collapsible Export Card */}
              <ExportCard
                presetName={presetName}
                setPresetName={setPresetName}
                authorName={authorName}
                setAuthorName={setAuthorName}
                description={description}
                setDescription={setDescription}
                onExport={handleExport}
                isExporting={isExporting}
                disabled={!referenceImage}
              />
            </div>
          </div>
        </div>

        {/* SETTINGS TAB */}
        {activeTab === "settings" && (
          <div className="max-w-xl mx-auto m3-panel rounded-2xl p-5 sm:p-6 space-y-5 m3-tab-enter">
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
                <select
                  value={analysisMaxDim}
                  onChange={(e) => setAnalysisMaxDim(Number(e.target.value))}
                  className="w-full bg-[#1E1E24] border border-white/[0.08] rounded-xl px-3.5 py-2 text-xs text-[#E2E4E9] outline-none focus:border-white/25"
                >
                  <option value={720}>720 px (Ultra Fast - Low RAM)</option>
                  <option value={1280}>1280 px (Recommended Balanced)</option>
                  <option value={1920}>1920 px (Full HD Precision)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#E2E4E9] mb-1">
                  Live Preview Simulation Resolution
                </label>
                <p className="text-xs text-[#9CA3AF] mb-2">
                  Controls the internal canvas resolution when dragging sliders in real time.
                </p>
                <select
                  value={previewMaxDim}
                  onChange={(e) => setPreviewMaxDim(Number(e.target.value))}
                  className="w-full bg-[#1E1E24] border border-white/[0.08] rounded-xl px-3.5 py-2 text-xs text-[#E2E4E9] outline-none focus:border-white/25"
                >
                  <option value={640}>640 px (60fps Mobile Smoothness)</option>
                  <option value={960}>960 px (Recommended Default)</option>
                  <option value={1440}>1440 px (High Detail Desktop)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ABOUT TAB */}
        {activeTab === "about" && (
          <div className="max-w-2xl mx-auto space-y-4 m3-tab-enter">
            <div className="m3-panel rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-3.5 border-b border-white/[0.08] pb-4">
                <KeyflowLogo size={48} />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold font-display text-[#E2E4E9]">
                      Color Match for Keyflow V.0.6 Beta
                    </h2>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1E1E24] text-[#6EE7B7] border border-white/[0.08]">
                      v0.6 Beta
                    </span>
                  </div>
                  <p className="text-xs text-[#9CA3AF] mt-0.5">
                    100% Client-Side Web App • Zero Server Upload
                  </p>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-[#9CA3AF] leading-relaxed">
                This tool analyzes the luminance distribution (Rec. 709), white balance neutrality, saturation, and 3-way split toning (Shadows, Midtones, Highlights) of any reference image directly inside your browser using Web Workers, then packages a native{" "}
                <code className="text-[#E2E4E9] font-mono bg-[#1E1E24] px-1.5 py-0.5 rounded border border-white/[0.08]">
                  .kfplug
                </code>{" "}
                GLSL shader plugin for Keyflow.
              </p>

              <div className="bg-[#1E1E24] border border-white/[0.08] rounded-xl p-4 text-xs text-[#9CA3AF] space-y-1.5">
                <div className="font-semibold text-[#E2E4E9]">Privacy &amp; Architecture</div>
                <p>
                  All images are processed locally in your device&apos;s memory. No photos or presets are ever uploaded to an external server.
                </p>
              </div>
            </div>

            {/* What's New in v0.6 Beta Changelog Card inside About Tab */}
            <div className="m3-panel rounded-2xl p-5 sm:p-6 space-y-3.5">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#6EE7B7]" />
                  <h3 className="text-sm sm:text-base font-bold font-display text-[#E2E4E9]">
                    What&apos;s New in v0.6 Beta
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-[#9CA3AF]">
                  Changelog
                </span>
              </div>

              <ChangelogList />
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

      {/* Interactive "What's New in v0.6 Beta" Modal Dialog */}
      <ChangelogModal
        open={isChangelogOpen}
        onClose={() => setIsChangelogOpen(false)}
      />

      {/* Post-Export Support Toast */}
      <SupportToast
        visible={exportToast.visible}
        filename={exportToast.filename}
        onClose={() => setExportToast({ visible: false, filename: "" })}
      />
    </div>
  );
}
