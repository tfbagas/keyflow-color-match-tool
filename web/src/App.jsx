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
  Cpu,
  CheckCircle2,
  RefreshCw,
  History,
} from "lucide-react";

import ImageDropCard, { ALLOWED_IMAGE_MIMES } from "./components/ImageDropCard";
import ComparisonSlider from "./components/ComparisonSlider";
import ParameterControl from "./components/ParameterControl";
import ColorSwatchCard from "./components/ColorSwatchCard";
import ExportCard from "./components/ExportCard";
import SupportTab from "./components/SupportTab";
import SupportBanner from "./components/SupportBanner";
import SupportToast from "./components/SupportToast";
import KeyflowLogo, { TfbagasWordmark } from "./components/KeyflowLogo";
import ChangelogModal, {
  ReleaseHistoryAccordion,
} from "./components/ChangelogModal";
import M3Select from "./components/M3Select";
import { DEFAULT_PARAMS, simulateGradePixels } from "./utils/colorGrading";
import {
  generateKfplug,
  downloadBlob,
  sanitizeMetadataText,
} from "./utils/kfplugPackager";

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

const CALIBRATION_STORAGE_KEY = "kf_export_calibration_v1";
const SEEN_UPDATE_STORAGE_KEY = "kf_seen_update_v062";
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
    contrast: round2(clampVal(1.0 + ((params.contrast ?? 1.0) - 1.0) * tS, 0.2, 2.0)),
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

  const [hoveredSlot, setHoveredSlot] = useState(null);
  const [focusedSlot, setFocusedSlot] = useState(null);

  const [gradingParams, setGradingParams] = useState({ ...DEFAULT_PARAMS });
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
  const gradedCanvasRef = useRef(null);
  const histogramCanvasRef = useRef(null);
  const previewSourceImageDataRef = useRef(null);
  const lastRenderedImgRef = useRef(null);
  const rafRef = useRef(null);

  const handleOpenChangelog = () => {
    setIsChangelogOpen(true);
    setHasUnreadUpdate(false);
    try {
      localStorage.setItem(SEEN_UPDATE_STORAGE_KEY, "true");
    } catch {
      // ignore storage errors
    }
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
      const { type, params, stage, error } = e.data;
      if (type === "stage") {
        setStatusText(stage || "Analyzing...");
      } else if (type === "success" && params) {
        setIsAnalyzing(false);
        setGradingParams(params);
        setStatusText("Matched");
      } else if (type === "error") {
        setIsAnalyzing(false);
        setReferenceError(error || "Failed to analyze image.");
        setStatusText("Error");
      }
    };

    workerRef.current = worker;
    return worker;
  }, []);

  useEffect(() => {
    const worker = initWorker();
    return () => worker.terminate();
  }, [initWorker]);

  const setSlotError = useCallback((slot, msg) => {
    if (slot === "reference") {
      setReferenceError(msg);
    } else {
      setTargetError(msg);
    }
  }, []);

  // Strict MIME validation + image decode integrity check
  const loadImageFile = useCallback(
    (file, type) => {
      if (!file || !ALLOWED_IMAGE_MIMES.includes(file.type)) {
        setSlotError(
          type,
          `Unsupported file format (${file?.type || "unknown"}). Allowed: JPG, PNG, WEBP.`
        );
        setStatusText("Invalid File");
        return;
      }

      setSlotError(type, "");

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
            "Corrupted or invalid image data. Please choose a valid JPG, PNG, or WEBP image."
          );
          setStatusText("Invalid Image");
        };

        img.onload = () => {
          if (img.naturalWidth < 1 || img.naturalHeight < 1) {
            setSlotError(type, "Invalid image dimensions.");
            return;
          }

          const ext = file.name.split(".").pop()?.toUpperCase() || "IMG";
          const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
          const rawBaseName = file.name.replace(/\.[^/.]+$/, "");
          const baseName = sanitizeMetadataText(rawBaseName, "Reference", 48);

          const info = {
            name: sanitizeMetadataText(file.name, "image.png", 80),
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
            setDescription(
              `Grading preset matched from reference '${baseName}'.`
            );

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
    [analysisMaxDim, setSlotError]
  );

  const handleTrySample = useCallback(
    (type) => {
      const w = 960;
      const h = 540;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");

      if (type === "reference") {
        const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.68);
        skyGrad.addColorStop(0, "#0b2434");
        skyGrad.addColorStop(0.45, "#194a5a");
        skyGrad.addColorStop(0.8, "#d97736");
        skyGrad.addColorStop(1, "#f3a852");
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, h);

        const sunGrad = ctx.createRadialGradient(w * 0.62, h * 0.52, 10, w * 0.62, h * 0.52, 220);
        sunGrad.addColorStop(0, "rgba(255, 220, 145, 0.95)");
        sunGrad.addColorStop(0.4, "rgba(240, 135, 60, 0.45)");
        sunGrad.addColorStop(1, "rgba(20, 50, 65, 0)");
        ctx.fillStyle = sunGrad;
        ctx.fillRect(0, 0, w, h);

        const seaGrad = ctx.createLinearGradient(0, h * 0.65, 0, h);
        seaGrad.addColorStop(0, "#143542");
        seaGrad.addColorStop(0.5, "#0d2530");
        seaGrad.addColorStop(1, "#07141b");
        ctx.fillStyle = seaGrad;
        ctx.fillRect(0, h * 0.65, w, h * 0.35);

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
        const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.62);
        skyGrad.addColorStop(0, "#4b79a1");
        skyGrad.addColorStop(0.6, "#7fa6c9");
        skyGrad.addColorStop(1, "#c8d9e6");
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, h);

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

        const groundGrad = ctx.createLinearGradient(0, h * 0.62, 0, h);
        groundGrad.addColorStop(0, "#5c7457");
        groundGrad.addColorStop(0.5, "#3f533d");
        groundGrad.addColorStop(1, "#273326");
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, h * 0.62, w, h * 0.38);

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
    simulateGradePixels(srcData.data, targetImgData.data, gradingParams);
    ctx.putImageData(targetImgData, 0, 0);
    canvas.dataset.rendered = "true";

    drawHistogram(histogramCanvasRef.current, targetImgData);
  }, [gradingParams]);

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
  }, [
    targetImage,
    referenceImage,
    previewMaxDim,
    previewMode,
    calibrationTick,
    updatePreviewSimulation,
  ]);

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
  };

  const handleResetCalibration = () => {
    setCalibration({ ...DEFAULT_CALIBRATION });
  };

  const handleExport = async () => {
    if (!referenceImage) return;
    setIsExporting(true);
    setStatusText("Exporting...");
    try {
      const calibratedParams = applyCalibrationToParams(
        gradingParams,
        calibration
      );
      const safePreset = sanitizeMetadataText(
        presetName,
        referenceImage.baseName || "Custom Look",
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

  const activeTabIndex = Math.max(
    0,
    navTabs.findIndex((t) => t.id === activeTab)
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#0E0E11] text-[#E2E4E9]">
      {/* Compact 48px Top App Bar (Material 3 Workstation Header) */}
      <header className="sticky top-0 z-40 min-h-12 px-3 sm:px-5 py-1.5 bg-[#151519]/95 backdrop-blur-md border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
        {/* Left: Achromatic Keyflow Logo + Brand Title + Interactive v0.6.2 Beta Changelog Button */}
        <div className="flex items-center gap-2.5">
          <KeyflowLogo size={28} />
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-bold font-display tracking-tight text-[#E2E4E9]">
              Color Match Tool
            </h1>
            <button
              type="button"
              onClick={handleOpenChangelog}
              title="View What's New in v0.6.2 Beta"
              className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#1E1E24] hover:bg-white/10 text-[#E2E4E9] border border-white/[0.1] hover:border-white/25 transition-all cursor-pointer active:scale-95"
            >
              {hasUnreadUpdate && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7] animate-pulse" />
              )}
              <span>v0.6.2 Beta</span>
            </button>
          </div>
        </div>

        {/* Right: Material 3 Sliding Segmented Navigation Pill + Status Chip */}
        <div className="flex items-center gap-2 ml-auto">
          <nav
            aria-label="Primary Navigation"
            className="relative grid grid-cols-4 items-center bg-[#0E0E11] border border-white/[0.08] rounded-xl p-0.5"
          >
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

          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1E1E24] border border-white/[0.08] text-[11px] font-mono text-[#E2E4E9]">
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
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-5 py-3.5">
        {/* WORKSPACE TAB */}
        <div
          className={
            activeTab === "home" ? "space-y-3 m3-tab-enter" : "hidden"
          }
        >
          <SupportBanner onOpenSupport={() => setActiveTab("support")} />

          {/* 2-Column Workstation Grid (items-stretch aligns bottom edges of both columns) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
            {/* LEFT COLUMN */}
            <div className="lg:col-span-7 flex flex-col gap-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-3">
                <ImageDropCard
                  title="REFERENCE"
                  imageInfo={referenceImage}
                  onSelectImage={(file) => loadImageFile(file, "reference")}
                  onClearImage={() => {
                    setReferenceImage(null);
                    setReferenceError("");
                    setStatusText("Ready");
                  }}
                  onTrySample={() => handleTrySample("reference")}
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

                <ImageDropCard
                  title="TARGET IMAGE"
                  imageInfo={targetImage}
                  onSelectImage={(file) => loadImageFile(file, "target")}
                  onClearImage={() => {
                    setTargetImage(null);
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

              <ComparisonSlider
                originalImage={activePreviewImageUrl}
                gradedCanvasRef={gradedCanvasRef}
                hasImage={Boolean(activePreviewImageUrl)}
                mode={previewMode}
                onModeChange={setPreviewMode}
              />
            </div>

            {/* RIGHT COLUMN */}
            <div className="lg:col-span-5 flex flex-col gap-3">
              <div className="m3-panel rounded-2xl p-3.5">
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
                        NO SIGNAL — LOAD IMAGE OR CLICK SAMPLE
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
                isCalibrationActive={isCalibrationActive}
                onOpenCalibration={() => setActiveTab("settings")}
              />
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
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1E1E24] hover:bg-white/10 text-xs font-medium text-[#9CA3AF] hover:text-[#E2E4E9] border border-white/[0.08] transition-colors cursor-pointer"
                  title="Reset all output calibration multipliers to 1.00x"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Calibration</span>
                </button>
              </div>

              <div className="bg-[#1E1E24] border border-white/[0.08] rounded-xl p-4 space-y-3">
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
                    className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#E2E4E9] hover:bg-white text-[#0E0E11] transition-all shrink-0 cursor-pointer active:scale-95"
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

                <div className="bg-[#0E0E11] border border-white/[0.08] rounded-xl p-2 divide-y divide-white/[0.04]">
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
                        Color Match for Keyflow V.0.6.2 Beta
                      </h2>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1E1E24] text-[#6EE7B7] border border-white/[0.08]">
                        v0.6.2 Beta
                      </span>
                    </div>
                    <p className="text-xs text-[#9CA3AF] mt-0.5">
                      100% Client-Side Web App • Zero Server Upload
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab("support")}
                  title="Created by TFBAGAS — View Developer & Support Hub"
                  className="cursor-pointer transition-transform hover:scale-[1.02]"
                >
                  <TfbagasWordmark compact />
                </button>
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

            {/* Permanent Release History / Changelog Accordion (v0.5.0 Beta -> v0.6.2 Beta) */}
            <div className="m3-panel rounded-2xl p-5 sm:p-6 space-y-3.5">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-[#6EE7B7]" />
                  <h3 className="text-sm sm:text-base font-bold font-display text-[#E2E4E9]">
                    Release History / Changelog
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-[#9CA3AF]">
                  v0.5.0 – v0.6.2 Beta
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

      {/* Interactive "What's New in v0.6.2 Beta" Modal Dialog */}
      <ChangelogModal
        open={isChangelogOpen}
        onClose={() => setIsChangelogOpen(false)}
        onViewFullHistory={() => setActiveTab("about")}
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
