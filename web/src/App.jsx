import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Home,
  Settings,
  Info,
  RotateCcw,
  Sparkles,
  Layers,
  Heart,
  Coffee
} from "lucide-react";

import ImageDropCard from "./components/ImageDropCard";
import ComparisonSlider from "./components/ComparisonSlider";
import ParameterControl from "./components/ParameterControl";
import ColorSwatchCard from "./components/ColorSwatchCard";
import ExportCard from "./components/ExportCard";
import SupportTab from "./components/SupportTab";
import SupportBanner from "./components/SupportBanner";
import SupportToast from "./components/SupportToast";

import {
  DEFAULT_PARAMS,
  simulateGradePixels
} from "./utils/colorGrading";
import { generateKfplug, downloadBlob } from "./utils/kfplugPackager";

export default function App() {
  const [activeTab, setActiveTab] = useState("home"); // "home" | "settings" | "about" | "support"

  // Images state
  const [refImage, setRefImage] = useState(null);
  const [targetImage, setTargetImage] = useState(null);

  // Status & Worker state
  const [statusText, setStatusText] = useState("Ready");
  const [isBusy, setIsBusy] = useState(false);

  // Grading Parameters
  const [params, setParams] = useState({ ...DEFAULT_PARAMS });
  const [autoParams, setAutoParams] = useState({ ...DEFAULT_PARAMS });

  // Export metadata
  const [presetName, setPresetName] = useState("Custom Look");
  const [author, setAuthor] = useState(() => {
    return localStorage.getItem("kf_author") || "TFBAGAS";
  });
  const [description, setDescription] = useState(
    "Grading preset matched from reference 'Custom Look'."
  );

  // Post-Export Toast state
  const [showSupportToast, setShowSupportToast] = useState(false);

  // Canvas refs
  const previewCanvasRef = useRef(null);
  const workerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Initialize Web Worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL("./workers/colorMatchWorker.js", import.meta.url),
      { type: "module" }
    );

    workerRef.current.onmessage = (e) => {
      const { type, stage, params: detectedParams, error } = e.data;

      if (type === "stage") {
        setStatusText(stage);
      } else if (type === "success") {
        setParams({ ...detectedParams });
        setAutoParams({ ...detectedParams });
        setStatusText("Ready");
        setIsBusy(false);
      } else if (type === "error") {
        alert("Error analyzing image: " + error);
        setStatusText("Ready");
        setIsBusy(false);
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Save author to localStorage whenever it changes
  useEffect(() => {
    if (author) localStorage.setItem("kf_author", author);
  }, [author]);

  // Sync description when preset name changes
  const handlePresetNameChange = (name) => {
    setPresetName(name);
    const clean = name.trim() || "Custom Look";
    if (
      !description ||
      description.startsWith("Grading preset matched from reference")
    ) {
      setDescription(`Grading preset matched from reference '${clean}'.`);
    }
  };

  // Render graded preview to visible canvas
  const updatePreviewSimulation = useCallback(() => {
    const activeImg = targetImage?.imgElement || refImage?.imgElement;
    const canvas = previewCanvasRef.current;
    if (!activeImg || !canvas) return;

    // Use optimal resolution for preview (max 1024px)
    const maxDim = 1024;
    let w = activeImg.naturalWidth;
    let h = activeImg.naturalHeight;
    if (Math.max(w, h) > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(activeImg, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const targetData = ctx.createImageData(w, h);

    simulateGradePixels(imgData.data, targetData.data, params);
    ctx.putImageData(targetData, 0, 0);
  }, [refImage, targetImage, params]);

  // Debounce live simulation on parameter changes
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      updatePreviewSimulation();
    }, 25);
    return () => clearTimeout(debounceTimerRef.current);
  }, [params, updatePreviewSimulation]);

  // Re-run simulation when switching back to Home tab
  useEffect(() => {
    if (activeTab === "home") {
      updatePreviewSimulation();
    }
  }, [activeTab, updatePreviewSimulation]);

  // Handle Reference Image Loaded -> Trigger Worker
  const handleRefImageSelected = (imgData) => {
    setRefImage(imgData);
    setIsBusy(true);
    setStatusText("Optimizing image cache...");

    // Downscale for fast statistical analysis (~1280px max)
    const maxDim = 1280;
    let w = imgData.width;
    let h = imgData.height;
    if (Math.max(w, h) > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = w;
    offscreenCanvas.height = h;
    const ctx = offscreenCanvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(imgData.imgElement, 0, 0, w, h);

    const rawData = ctx.getImageData(0, 0, w, h);

    // Auto-populate clean name from file
    const baseName = imgData.name.replace(/\.[^/.]+$/, "");
    const cleanName = baseName
      .replace(/[_-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
      .slice(0, 24);

    handlePresetNameChange(cleanName);

    // Offload analysis to Web Worker
    workerRef.current.postMessage({
      type: "analyze",
      rgbaData: rawData.data,
      numPixels: w * h
    });
  };

  const handleRefImageRemoved = () => {
    setRefImage(null);
    setParams({ ...DEFAULT_PARAMS });
    setAutoParams({ ...DEFAULT_PARAMS });
  };

  const handleTargetImageSelected = (imgData) => {
    setTargetImage(imgData);
  };

  const handleTargetImageRemoved = () => {
    setTargetImage(null);
  };

  const handleParamChange = (key, val) => {
    setParams((prev) => ({ ...prev, [key]: val }));
  };

  const handleSwatchChange = (prefix, r, g, b) => {
    setParams((prev) => ({
      ...prev,
      [`${prefix}R`]: r,
      [`${prefix}G`]: g,
      [`${prefix}B`]: b
    }));
  };

  const handleResetAll = () => {
    setParams({ ...autoParams });
  };

  const handleExport = async () => {
    if (!refImage) {
      alert("Please select a reference image first!");
      return;
    }
    const { blob, fileName, displayName } = await generateKfplug(
      params,
      presetName,
      author,
      description
    );
    downloadBlob(blob, fileName);
    setShowSupportToast(true);
    return { fileName, displayName };
  };

  const PARAM_DEFS = [
    { key: "exposure", label: "Exposure (EV)", iconName: "sun", min: -2.0, max: 2.0, step: 0.05 },
    { key: "contrast", label: "Contrast", iconName: "contrast", min: 0.2, max: 2.0, step: 0.05 },
    { key: "pivot", label: "Contrast Pivot", iconName: "pivot", min: 0.1, max: 0.9, step: 0.01 },
    { key: "shadows", label: "Shadows Tint/Level", iconName: "droplet", min: -0.5, max: 0.5, step: 0.02 },
    { key: "highlights", label: "Highlights Tint/Level", iconName: "highlights", min: -0.5, max: 0.5, step: 0.02 },
    { key: "temp", label: "Color Temperature", iconName: "thermometer", min: -1.0, max: 1.0, step: 0.02 },
    { key: "tint", label: "Color Tint", iconName: "palette", min: -1.0, max: 1.0, step: 0.02 },
    { key: "sat", label: "Saturation", iconName: "droplet", min: 0.0, max: 2.0, step: 0.05 },
    { key: "vib", label: "Vibrance", iconName: "activity", min: -0.8, max: 0.8, step: 0.05 }
  ];

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#080D0B] text-[#E8F2ED]">
      {/* ------------------------------------------------------------- */}
      {/* SIDEBAR (Desktop) / TOPBAR (Mobile)                           */}
      {/* ------------------------------------------------------------- */}
      <aside className="w-full md:w-44 bg-[#060B08]/85 border-b md:border-b-0 md:border-r border-[#00E987]/20 flex flex-row md:flex-col items-center justify-between p-3 md:p-5 shrink-0 z-20">
        {/* Logo & Brand */}
        <div className="flex items-center gap-2.5 md:flex-col md:gap-3">
          <img
            src="/keyflow_logo.png"
            alt="Keyflow"
            className="w-8 h-8 md:w-14 md:h-14 object-contain drop-shadow-[0_0_12px_rgba(0,233,135,0.3)]"
          />
          <div className="flex flex-col md:hidden">
            <span className="text-xs font-bold text-white leading-tight font-display">Color Match</span>
            <span className="text-[10px] text-[#00E987] font-semibold font-display">for Keyflow</span>
          </div>
        </div>

        {/* Navigation Buttons */}
        <nav className="flex md:flex-col gap-1.5 md:w-full md:mt-6">
          <button
            onClick={() => setActiveTab("home")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "home"
                ? "bg-[#00E987] text-[#05120B] shadow-[0_0_12px_rgba(0,233,135,0.3)]"
                : "text-[#91A69A] hover:text-[#E8F2ED] hover:bg-[#16231D]/60"
            }`}
          >
            <Home size={15} />
            <span>Home</span>
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "settings"
                ? "bg-[#00E987] text-[#05120B] shadow-[0_0_12px_rgba(0,233,135,0.3)]"
                : "text-[#91A69A] hover:text-[#E8F2ED] hover:bg-[#16231D]/60"
            }`}
          >
            <Settings size={15} />
            <span>Settings</span>
          </button>

          <button
            onClick={() => setActiveTab("about")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "about"
                ? "bg-[#00E987] text-[#05120B] shadow-[0_0_12px_rgba(0,233,135,0.3)]"
                : "text-[#91A69A] hover:text-[#E8F2ED] hover:bg-[#16231D]/60"
            }`}
          >
            <Info size={15} />
            <span>About</span>
          </button>

          <button
            onClick={() => setActiveTab("support")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "support"
                ? "bg-[#00E987] text-[#05120B] shadow-[0_0_12px_rgba(0,233,135,0.3)]"
                : "text-[#91A69A] hover:text-[#E8F2ED] hover:bg-[#16231D]/60"
            }`}
          >
            <Heart size={15} className={activeTab === "support" ? "fill-current" : ""} />
            <span>Support</span>
          </button>
        </nav>

        {/* Desktop Sidebar Watermark */}
        <div className="hidden md:flex flex-col items-center text-center mt-auto pt-6 border-t border-[#20352B]/40 w-full">
          <span className="text-[9px] font-bold text-[#00E987]/50 tracking-wider font-display">
            Color Match for Keyflow
          </span>
          <span className="text-[8px] font-bold text-[#00E987]/40 tracking-wider font-mono">
            V.0.5 Beta
          </span>
        </div>
      </aside>

      {/* ------------------------------------------------------------- */}
      {/* MAIN CONTENT AREA                                             */}
      {/* ------------------------------------------------------------- */}
      <main className="flex-1 flex flex-col p-4 sm:p-6 lg:p-7 max-w-7xl mx-auto w-full overflow-y-auto">
        {/* Header Bar */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-display">
                Color Match Tool
              </h1>
              <span className="text-xl sm:text-2xl font-bold text-[#00E987] tracking-tight font-display">
                for Keyflow
              </span>
            </div>
            <p className="text-xs text-[#91A69A]">
              Extract Look & Grading from Reference Image and Export as Keyflow Mobile Plugin (.kfplug)
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            {/* Quick-Access Support Button */}
            <button
              onClick={() => setActiveTab("support")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer active:scale-95 ${
                activeTab === "support"
                  ? "bg-[#00E987] text-[#05120B] border-[#00E987] shadow-[0_0_12px_rgba(0,233,135,0.4)]"
                  : "bg-[#00E987]/15 hover:bg-[#00E987]/25 text-[#00E987] border-[#00E987]/35 shadow-[0_0_10px_rgba(0,233,135,0.1)]"
              }`}
              title="Support Developer & Tool"
            >
              <Heart size={12} className={activeTab === "support" ? "fill-[#05120B]" : "fill-[#00E987]"} />
              <span>Support</span>
            </button>

            {/* Non-blocking Status Pill */}
            <div
              className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all ${
                isBusy
                  ? "bg-[#162D22] text-[#16FFA0] border-[#00E987] shadow-[0_0_12px_rgba(0,233,135,0.3)] animate-pulse"
                  : "bg-[#0E1C16]/85 text-[#00E987] border-[#00E987]/35"
              }`}
            >
              {statusText}
            </div>

            {/* Version Badge */}
            <div className="px-2.5 py-1 rounded-full text-[11px] font-bold font-mono bg-[#0E1C16]/80 text-[#91A69A] border border-[#00E987]/20">
              v0.5 Beta
            </div>
          </div>
        </header>

        {/* --------------------------------------------------------- */}
        {/* TAB 1: HOME PAGE                                          */}
        {/* --------------------------------------------------------- */}
        <div className={activeTab === "home" ? "flex flex-col gap-4" : "hidden"}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-start">
            {/* LEFT COLUMN: Input Images & Before/After Comparison */}
            <div className="flex flex-col gap-4">
              <ImageDropCard
                stepNum="1"
                title="Reference Image (Required)"
                isRequired={true}
                imageData={refImage}
                statusText={refImage ? "✓ Loaded" : ""}
                disabled={isBusy}
                onImageSelected={handleRefImageSelected}
                onImageRemoved={handleRefImageRemoved}
              />

              <ImageDropCard
                stepNum="2"
                title="Target Image / Preview (Optional)"
                isRequired={false}
                imageData={targetImage}
                statusText={targetImage ? "✓ Loaded" : ""}
                disabled={isBusy}
                onImageSelected={handleTargetImageSelected}
                onImageRemoved={handleTargetImageRemoved}
              />

              <ComparisonSlider
                originalImage={targetImage?.dataUrl || refImage?.dataUrl}
                gradedCanvasRef={previewCanvasRef}
              />
            </div>

            {/* RIGHT COLUMN: Grading Parameters, Swatches & Export */}
            <div className="flex flex-col gap-4">
              {/* Card 3: Detected Grading Parameters */}
              <div className="liquid-glass rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#00E987] text-[#080D0B] font-bold text-[11px] flex items-center justify-center">
                      3
                    </span>
                    <span className="text-xs font-bold text-white">
                      Detected Grading Parameters
                    </span>
                  </div>

                  <button
                    onClick={handleResetAll}
                    disabled={isBusy}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#20352B] hover:border-[#00E987] text-[#91A69A] hover:text-[#00E987] text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw size={12} />
                    Reset All
                  </button>
                </div>

                {/* 9 Sliders */}
                <div className="flex flex-col divide-y divide-[#20352B]/40">
                  {PARAM_DEFS.map((p) => (
                    <ParameterControl
                      key={p.key}
                      paramKey={p.key}
                      label={p.label}
                      iconName={p.iconName}
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      value={params[p.key]}
                      onChange={handleParamChange}
                      disabled={isBusy}
                    />
                  ))}
                </div>

                {/* 3-Way Color Wheels Swatches */}
                <div className="mt-1 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <Layers size={14} className="text-[#00E987]" />
                    <span className="text-[11px] font-bold text-white">
                      3-Way Color Wheels Swatches:
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <ColorSwatchCard
                      title="Shadows (Lift)"
                      rNorm={params.liftR}
                      gNorm={params.liftG}
                      bNorm={params.liftB}
                      onChange={(r, g, b) => handleSwatchChange("lift", r, g, b)}
                      disabled={isBusy}
                    />
                    <ColorSwatchCard
                      title="Midtones (Gamma)"
                      rNorm={params.gammaR}
                      gNorm={params.gammaG}
                      bNorm={params.gammaB}
                      onChange={(r, g, b) => handleSwatchChange("gamma", r, g, b)}
                      disabled={isBusy}
                    />
                    <ColorSwatchCard
                      title="Highs (Gain)"
                      rNorm={params.gainR}
                      gNorm={params.gainG}
                      bNorm={params.gainB}
                      onChange={(r, g, b) => handleSwatchChange("gain", r, g, b)}
                      disabled={isBusy}
                    />
                  </div>
                </div>
              </div>

              {/* Card 4: Export Plugin */}
              <ExportCard
                presetName={presetName}
                setPresetName={handlePresetNameChange}
                author={author}
                setAuthor={setAuthor}
                description={description}
                setDescription={setDescription}
                onExport={handleExport}
                disabled={!refImage || isBusy}
              />
            </div>
          </div>

          {/* Slim Dismissible Support Banner on Home */}
          <SupportBanner />
        </div>

        {/* --------------------------------------------------------- */}
        {/* TAB 2: SETTINGS PAGE                                      */}
        {/* --------------------------------------------------------- */}
        {activeTab === "settings" && (
          <div className="flex flex-col gap-4 max-w-2xl">
            <div className="liquid-glass rounded-2xl p-6 flex flex-col gap-4">
              <h2 className="text-base font-bold text-white font-display">Default Export Preferences</h2>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#E8F2ED]">
                  Default Creator Name (Made By):
                </label>
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="e.g. TFBAGAS"
                  className="px-3.5 py-2 rounded-xl bg-[#09100D]/90 border border-[#20352B] focus:border-[#00E987] text-white text-xs outline-none"
                />
                <span className="text-[11px] text-[#91A69A]">
                  This author name will be embedded as the plugin creator in Keyflow Mobile.
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#16231D]/60 border border-[#20352B] text-xs text-[#91A69A] flex flex-col gap-1">
                <span className="font-bold text-[#00E987]">Multi-Plugin Co-existence Active</span>
                <span>
                  Every exported look automatically generates an isolated package ID (e.g.{" "}
                  <code className="text-[#00E987] font-mono">com.keyflow.matchgrade.&lt;slug&gt;</code>) to prevent
                  overwriting your existing installed plugins in Keyflow.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------- */}
        {/* TAB 3: ABOUT PAGE                                         */}
        {/* --------------------------------------------------------- */}
        {activeTab === "about" && (
          <div className="flex flex-col gap-4 max-w-2xl">
            <div className="liquid-glass rounded-2xl p-6 flex flex-col gap-5">
              <div className="flex items-center gap-4">
                <img src="/keyflow_logo.png" alt="Keyflow" className="w-14 h-14 object-contain" />
                <div className="flex flex-col">
                  <h2 className="text-lg font-bold text-white font-display">Color Match Tool for Keyflow</h2>
                  <span className="text-xs text-[#91A69A]">
                    Web Client-Side Edition (PWA Ready)
                  </span>
                  <span className="text-[11px] text-[#00E987] italic mt-0.5">
                    Target Engine: Keyflow Mobile 1.5.x+ (OpenGL ES Pipeline)
                  </span>
                </div>
              </div>

              {/* Credit Card */}
              <div className="p-4 rounded-xl bg-[#0E1C16] border border-[#00E987]/30 flex flex-col gap-1">
                <span className="text-[10px] font-bold text-[#00E987] uppercase tracking-wider">
                  CREDIT & DEVELOPMENT
                </span>
                <span className="text-sm font-bold text-white">Created & Developed by: TFBAGAS</span>
                <span className="text-xs text-[#91A69A]">
                  Reverse-engineered from Keyflow DEX runtime bytecode & mobile GLSL engine.
                </span>
              </div>

              {/* Specifications */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-white">Engine Specifications:</span>
                <ul className="text-xs text-[#91A69A] flex flex-col gap-1.5 list-disc pl-4">
                  <li>
                    <strong className="text-[#E8F2ED]">100% Client-Side Processing:</strong> No server upload, zero backend costs, runs directly inside your browser.
                  </li>
                  <li>
                    <strong className="text-[#E8F2ED]">Web Worker Multithreading:</strong> Heavy pixel statistics run on background threads without freezing the UI.
                  </li>
                  <li>
                    <strong className="text-[#E8F2ED]">Rec. 709 Computer Vision:</strong> Exposure EV curve, dynamic contrast pivot, Planckian white balance, and 3-way Lift/Gamma/Gain swatches.
                  </li>
                  <li>
                    <strong className="text-[#E8F2ED]">Mobile Friendly:</strong> Works on desktop and touchscreens (Android/iOS) with PWA install support.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------- */}
        {/* TAB 4: SUPPORT PAGE                                       */}
        {/* --------------------------------------------------------- */}
        {activeTab === "support" && <SupportTab />}

        {/* Post-Export Toast Notification */}
        <SupportToast
          show={showSupportToast}
          onClose={() => setShowSupportToast(false)}
        />
      </main>
    </div>
  );
}
