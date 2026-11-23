import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Activity, ChevronDown } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { usePillIndicator } from "../hooks/usePillIndicator";

// Fixed studio scope canvas resolution (crisp & undistorted at h-[188px])
const SCOPE_W = 264;
const SCOPE_H = 188;
const VIDEO_SCOPE_INTERVAL_MS = 165;

function drawIreGraticules(ctx, w, h) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.065)";
  ctx.lineWidth = 1;
  ctx.font = "500 8px 'IBM Plex Mono', monospace";
  ctx.fillStyle = "rgba(161, 161, 170, 0.72)";

  const marks = [
    { label: "100", frac: 0.04, yOff: 8 },
    { label: "75", frac: 0.27, yOff: 3 },
    { label: "50", frac: 0.5, yOff: 3 },
    { label: "25", frac: 0.73, yOff: 3 },
    { label: "0", frac: 0.96, yOff: -2 },
  ];

  marks.forEach(({ label, frac, yOff }) => {
    const y = Math.round(h * frac) + 0.5;
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.fillText(label, 2, y + yOff);
  });
  ctx.restore();
}

function drawVectorscopeGraticuleAndSkinLine(ctx, w, h) {
  const cx = w * 0.5;
  const cy = h * 0.5;
  const radius = Math.min(w, h) * 0.43;

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.stroke();

  // Rec.709 Skin-Tone Reference I-Line (~123 deg)
  const skinAngle = (123 * Math.PI) / 180;
  const endX = cx + Math.cos(skinAngle) * radius;
  const endY = cy - Math.sin(skinAngle) * radius;

  ctx.setLineDash([3, 2]);
  ctx.strokeStyle = "rgba(251, 191, 36, 0.72)";
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(251, 191, 36, 0.9)";
  ctx.beginPath();
  ctx.arc(endX, endY, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "500 8px 'IBM Plex Mono', monospace";
  ctx.fillStyle = "rgba(251, 191, 36, 0.85)";
  ctx.fillText(
    "I-LINE",
    cx + Math.cos(skinAngle) * (radius * 0.68) - 26,
    cy - Math.sin(skinAngle) * (radius * 0.68) + 2
  );
  ctx.restore();
}

const ProScopes = memo(
  forwardRef(function ProScopes(
    {
      hasMedia,
      isDragging = false,
      isVideoPlaying = false,
      isDesktopRealtime = false,
      isCollapsed = false,
      skinSafe = true,
      skinProtect = 75,
    },
    ref
  ) {
    const { t } = useLanguage();
    const [mode, setMode] = useState("parade");
    const [isTelemetryOpen, setIsTelemetryOpen] = useState(true);
    const {
      containerRef: scopeTabContainerRef,
      registerTabRef: registerScopeTabRef,
      pillStyle: scopeTabPillStyle,
    } = usePillIndicator(mode);

    const scopeModes = [
      { id: "parade", label: "Parade", title: "RGB Parade" },
      { id: "waveform", label: "Wave", title: "Luma Waveform" },
      { id: "histogram", label: "Hist", title: "RGB Histogram" },
      { id: "vectorscope", label: "Vector", title: "Vectorscope (Skin I-Line)" },
    ];

    const canvasRef = useRef(null);
    const offscreenRef = useRef(null);
    const binsRef = useRef(null);
    const lastDrawAtRef = useRef(0);
    const latestFrameRef = useRef(null);

    // Direct DOM refs for 60fps zero-rerender Signal Telemetry readouts
    const peakIreRef = useRef(null);
    const blackIreRef = useRef(null);
    const dynamicRangeRef = useRef(null);
    const avgChromaRef = useRef(null);
    const gamutStatusRef = useRef(null);
    const gamutDotRef = useRef(null);

    const stateRef = useRef({
      mode,
      isCollapsed,
      isDragging,
      isVideoPlaying,
      isDesktopRealtime,
    });
    stateRef.current = {
      mode,
      isCollapsed,
      isDragging,
      isVideoPlaying,
      isDesktopRealtime,
    };
    const prevStateRef = useRef({
      mode: "parade",
      isCollapsed: false,
      isDragging: false,
    });

    const syncTelemetryDom = useCallback((imageData) => {
      if (!imageData || !imageData.data || imageData.data.length === 0) {
        if (peakIreRef.current) peakIreRef.current.textContent = "-";
        if (blackIreRef.current) blackIreRef.current.textContent = "-";
        if (dynamicRangeRef.current) dynamicRangeRef.current.textContent = "-";
        if (avgChromaRef.current) avgChromaRef.current.textContent = "-";
        if (gamutStatusRef.current) gamutStatusRef.current.textContent = "Standby";
        if (gamutDotRef.current) gamutDotRef.current.style.backgroundColor = "#4A6B86";
        return;
      }

      const data = imageData.data;
      const totalPixels = data.length >> 2;
      const step = Math.max(1, (totalPixels / 2048) | 0);
      const lumaHist = new Uint32Array(256);
      let sampled = 0;
      let chromaSum = 0;
      let clippedPixels = 0;

      for (let i = 0; i < totalPixels; i += step) {
        const idx = i << 2;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const luma = (r * 54 + g * 183 + b * 19) >> 8;
        lumaHist[luma]++;

        const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
        const minC = r < g ? (r < b ? r : b) : g < b ? g : b;
        const span = maxC - minC;
        chromaSum += maxC > 0 ? span / maxC : 0;

        if ((maxC >= 253 || minC <= 1) && span > 56) {
          clippedPixels++;
        }
        sampled++;
      }

      if (sampled === 0) return;

      const p01Target = Math.max(1, Math.floor(sampled * 0.01));
      const p99Target = Math.max(1, Math.floor(sampled * 0.99));
      let acc = 0;
      let blackBin = 0;
      let peakBin = 255;
      let foundBlack = false;
      for (let b = 0; b < 256; b++) {
        acc += lumaHist[b];
        if (!foundBlack && acc >= p01Target) {
          blackBin = b;
          foundBlack = true;
        }
        if (acc >= p99Target) {
          peakBin = b;
          break;
        }
      }

      const peakIre = ((peakBin / 255) * 100).toFixed(1);
      const blackIre = ((blackBin / 255) * 100).toFixed(1);
      const peakLin = Math.max(Math.pow(peakBin / 255, 2.2), 0.001);
      const blackLin = Math.max(Math.pow(blackBin / 255, 2.2), 0.0005);
      const evStops = Math.max(0, Math.min(14, Math.log2(peakLin / blackLin))).toFixed(1);
      const avgChromaPct = Math.round((chromaSum / sampled) * 100);
      const clipRatio = clippedPixels / sampled;

      if (peakIreRef.current) peakIreRef.current.textContent = `${peakIre} IRE`;
      if (blackIreRef.current) blackIreRef.current.textContent = `${blackIre} IRE`;
      if (dynamicRangeRef.current) dynamicRangeRef.current.textContent = `${evStops} EV`;
      if (avgChromaRef.current) avgChromaRef.current.textContent = `${avgChromaPct}%`;

      if (gamutStatusRef.current && gamutDotRef.current) {
        if (clipRatio > 0.04) {
          gamutStatusRef.current.textContent = "Gamut Clip";
          gamutDotRef.current.style.backgroundColor = "#F59E0B";
        } else if (peakBin >= 253) {
          gamutStatusRef.current.textContent = "Peak >99";
          gamutDotRef.current.style.backgroundColor = "#FBBF24";
        } else {
          gamutStatusRef.current.textContent = "Rec.709 Safe";
          gamutDotRef.current.style.backgroundColor = "#93B8D8";
        }
      }
    }, []);

    const drawScope = useCallback(
      (imageData, force = false) => {
        const {
          mode: curMode,
          isCollapsed: collapsed,
          isDragging: dragging,
          isVideoPlaying: playing,
          isDesktopRealtime: desktopRealtime,
        } = stateRef.current;

        const prev = prevStateRef.current;
        const modeChanged = prev.mode !== curMode;
        const justExpanded = prev.isCollapsed && !collapsed;
        const justReleasedDrag = prev.isDragging && !dragging;
        prevStateRef.current = {
          mode: curMode,
          isCollapsed: collapsed,
          isDragging: dragging,
        };

        if (collapsed || (dragging && !desktopRealtime) || document.hidden) {
          return;
        }

        const now = performance.now();
        if (
          !force &&
          !desktopRealtime &&
          playing &&
          !modeChanged &&
          !justExpanded &&
          !justReleasedDrag &&
          now - lastDrawAtRef.current < VIDEO_SCOPE_INTERVAL_MS
        ) {
          return;
        }

        syncTelemetryDom(imageData);

        const canvas = canvasRef.current;
        if (!canvas) return;

        if (canvas.width !== SCOPE_W || canvas.height !== SCOPE_H) {
          canvas.width = SCOPE_W;
          canvas.height = SCOPE_H;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        if (curMode !== "vectorscope") {
          drawIreGraticules(ctx, w, h);
        }

        if (!imageData || !imageData.data || imageData.data.length === 0) {
          if (curMode === "vectorscope") {
            drawVectorscopeGraticuleAndSkinLine(ctx, w, h);
          }
          return;
        }

        lastDrawAtRef.current = now;
        const { data, width: imgW, height: imgH } = imageData;
        const plotLeft = 20;
        const plotW = w - plotLeft - 2;
        const plotTop = Math.round(h * 0.04);
        const plotBottom = Math.round(h * 0.96);
        const plotH = Math.max(8, plotBottom - plotTop);

        if (curMode === "histogram") {
          if (!binsRef.current) {
            binsRef.current = {
              r: new Uint32Array(256),
              g: new Uint32Array(256),
              b: new Uint32Array(256),
              l: new Uint32Array(256),
            };
          }
          const { r: rBins, g: gBins, b: bBins, l: lBins } = binsRef.current;
          rBins.fill(0);
          gBins.fill(0);
          bBins.fill(0);
          lBins.fill(0);

          const totalPixels = data.length >> 2;
          const step = Math.max(1, (totalPixels / 6000) | 0);
          for (let i = 0; i < totalPixels; i += step) {
            const idx = i << 2;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const l = (r * 77 + g * 150 + b * 29) >> 8;
            rBins[r]++;
            gBins[g]++;
            bBins[b]++;
            lBins[l]++;
          }

          let maxBin = 1;
          for (let i = 2; i < 254; i++) {
            if (rBins[i] > maxBin) maxBin = rBins[i];
            if (gBins[i] > maxBin) maxBin = gBins[i];
            if (bBins[i] > maxBin) maxBin = bBins[i];
            if (lBins[i] > maxBin) maxBin = lBins[i];
          }

          const drawChannel = (bins, stroke, fill) => {
            ctx.beginPath();
            ctx.moveTo(plotLeft, plotBottom);
            for (let i = 0; i < 256; i++) {
              const x = plotLeft + (i / 255) * plotW;
              const norm = Math.min(1, bins[i] / maxBin);
              const y = plotBottom - norm * (plotH - 4);
              ctx.lineTo(x, y);
            }
            ctx.lineTo(plotLeft + plotW, plotBottom);
            ctx.closePath();
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1;
            ctx.stroke();
          };

          ctx.globalCompositeOperation = "screen";
          drawChannel(rBins, "rgba(239, 68, 68, 0.8)", "rgba(239, 68, 68, 0.16)");
          drawChannel(gBins, "rgba(52, 211, 153, 0.76)", "rgba(52, 211, 153, 0.16)");
          drawChannel(bBins, "rgba(96, 165, 250, 0.8)", "rgba(96, 165, 250, 0.16)");
          ctx.globalCompositeOperation = "source-over";
          drawChannel(lBins, "rgba(244, 244, 245, 0.58)", "rgba(244, 244, 245, 0.05)");
          return;
        }

        if (
          !offscreenRef.current ||
          offscreenRef.current.oc.width !== w ||
          offscreenRef.current.oc.height !== h
        ) {
          const oc = document.createElement("canvas");
          oc.width = w;
          oc.height = h;
          const octx = oc.getContext("2d");
          const imgBuf = octx.createImageData(w, h);
          const buf32 = new Uint32Array(imgBuf.data.buffer);
          offscreenRef.current = { oc, octx, imgBuf, buf32 };
        }
        const { oc, octx, imgBuf, buf32 } = offscreenRef.current;
        const out = imgBuf.data;
        buf32.fill(0);

        const safeW = Math.max(1, imgW || 1);
        const safeH = Math.max(1, imgH || Math.round((data.length >> 2) / safeW));

        if (curMode === "parade") {
          const gap = 4;
          const colW = Math.floor((plotW - gap * 2) / 3);
          const off0 = plotLeft;
          const off1 = plotLeft + colW + gap;
          const off2 = plotLeft + (colW + gap) * 2;

          ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
          ctx.beginPath();
          ctx.moveTo(off0 + colW + gap / 2, plotTop);
          ctx.lineTo(off0 + colW + gap / 2, plotBottom);
          ctx.moveTo(off1 + colW + gap / 2, plotTop);
          ctx.lineTo(off1 + colW + gap / 2, plotBottom);
          ctx.stroke();

          const xStep = Math.max(1, Math.floor(safeW / colW));
          const yStep = Math.max(1, Math.floor(safeH / 88));

          for (let py = 0; py < safeH; py += yStep) {
            const rowOffset = py * safeW;
            for (let px = 0; px < safeW; px += xStep) {
              const idx = (rowOffset + px) << 2;
              if (idx + 2 >= data.length) continue;
              const localX = Math.min(colW - 1, ((px * colW) / safeW) | 0);

              const yr = Math.max(
                plotTop,
                Math.min(plotBottom, plotBottom - ((data[idx] * plotH) >> 8))
              );
              const pr = (yr * w + (off0 + localX)) << 2;
              out[pr] = Math.min(255, out[pr] + 95);
              out[pr + 1] = Math.min(255, out[pr + 1] + 34);
              out[pr + 2] = Math.min(255, out[pr + 2] + 34);
              out[pr + 3] = Math.min(255, out[pr + 3] + 108);

              const yg = Math.max(
                plotTop,
                Math.min(plotBottom, plotBottom - ((data[idx + 1] * plotH) >> 8))
              );
              const pg = (yg * w + (off1 + localX)) << 2;
              out[pg] = Math.min(255, out[pg] + 32);
              out[pg + 1] = Math.min(255, out[pg + 1] + 92);
              out[pg + 2] = Math.min(255, out[pg + 2] + 66);
              out[pg + 3] = Math.min(255, out[pg + 3] + 108);

              const yb = Math.max(
                plotTop,
                Math.min(plotBottom, plotBottom - ((data[idx + 2] * plotH) >> 8))
              );
              const pb = (yb * w + (off2 + localX)) << 2;
              out[pb] = Math.min(255, out[pb] + 36);
              out[pb + 1] = Math.min(255, out[pb + 1] + 64);
              out[pb + 2] = Math.min(255, out[pb + 2] + 104);
              out[pb + 3] = Math.min(255, out[pb + 3] + 108);
            }
          }

          octx.putImageData(imgBuf, 0, 0);
          ctx.drawImage(oc, 0, 0);
          return;
        }

        if (curMode === "waveform") {
          const xStep = Math.max(1, Math.floor(safeW / plotW));
          const yStep = Math.max(1, Math.floor(safeH / 88));

          for (let py = 0; py < safeH; py += yStep) {
            const rowOffset = py * safeW;
            for (let px = 0; px < safeW; px += xStep) {
              const idx = (rowOffset + px) << 2;
              if (idx + 2 >= data.length) continue;
              const sx = plotLeft + Math.min(plotW - 1, ((px * plotW) / safeW) | 0);
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];
              const luma = (r * 54 + g * 183 + b * 19) >> 8;
              const sy = Math.max(
                plotTop,
                Math.min(plotBottom, plotBottom - ((luma * plotH) >> 8))
              );
              const p = (sy * w + sx) << 2;
              out[p] = Math.min(255, out[p] + ((r + 185) >> 2));
              out[p + 1] = Math.min(255, out[p + 1] + ((g + 195) >> 2));
              out[p + 2] = Math.min(255, out[p + 2] + ((b + 205) >> 2));
              out[p + 3] = Math.min(255, out[p + 3] + 112);
            }
          }

          octx.putImageData(imgBuf, 0, 0);
          ctx.drawImage(oc, 0, 0);
          return;
        }

        if (curMode === "vectorscope") {
          const cx = w * 0.5;
          const cy = h * 0.5;
          const radius = Math.min(w, h) * 0.43;
          const scale2R = (2 * radius) / 255;

          const totalPixels = data.length >> 2;
          const step = Math.max(1, (totalPixels / 5184) | 0);
          for (let i = 0; i < totalPixels; i += step) {
            const idx = i << 2;
            const r8 = data[idx];
            const g8 = data[idx + 1];
            const b8 = data[idx + 2];
            const cb = -0.1687 * r8 - 0.3313 * g8 + 0.5 * b8;
            const cr = 0.5 * r8 - 0.4187 * g8 - 0.0813 * b8;
            const px = (cx + cb * scale2R) | 0;
            const py = (cy - cr * scale2R) | 0;
            if (px < 0 || px >= w || py < 0 || py >= h) continue;
            const p = (py * w + px) << 2;
            out[p] = out[p] ? (out[p] + r8) >> 1 : r8;
            out[p + 1] = out[p + 1] ? (out[p + 1] + g8) >> 1 : g8;
            out[p + 2] = out[p + 2] ? (out[p + 2] + b8) >> 1 : b8;
            const a = out[p + 3] + 118;
            out[p + 3] = a > 255 ? 255 : a;
          }

          octx.putImageData(imgBuf, 0, 0);
          ctx.drawImage(oc, 0, 0);
          drawVectorscopeGraticuleAndSkinLine(ctx, w, h);
        }
      },
      [syncTelemetryDom]
    );

    useImperativeHandle(
      ref,
      () => ({
        updateFrame: (nextImageData) => {
          latestFrameRef.current = nextImageData;
          drawScope(nextImageData, false);
        },
      }),
      [drawScope]
    );

    useEffect(() => {
      if (!hasMedia) {
        latestFrameRef.current = null;
      }
      drawScope(latestFrameRef.current, true);
    }, [mode, isCollapsed, isDragging, isVideoPlaying, hasMedia, drawScope]);

    const skinLockLabel =
      !hasMedia
        ? "Standby"
        : skinProtect <= 0
        ? "Bypassed"
        : skinSafe
        ? `Locked ${skinProtect}%`
        : `Shift (${skinProtect}%)`;
    const skinLockColor =
      !hasMedia || skinProtect <= 0
        ? "#4A6B86"
        : skinSafe
        ? "#93B8D8"
        : "#F59E0B";

    return (
      <div
        className="flex-1 min-h-0 flex flex-col gap-3 px-3 py-2.5 select-none"
        style={{ contain: "layout paint" }}
      >
        <div className="flex flex-col shrink-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-1.5 mb-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-[#7FA3C2]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#AAB7C5]">
                {t("scopes.title")}
              </span>
            </div>
            {mode === "vectorscope" ? (
              <span className="text-[9px] font-mono text-amber-300/85">I-LINE</span>
            ) : (
              <span className="text-[9px] font-mono text-[#AAB7C5]">IRE 0-100</span>
            )}
          </div>

          {/* 4 Equal-Width Unclipped Scope Tabs with Sliding Hardware Indicator Pill: Parade / Wave / Hist / Vector */}
          <div
            ref={scopeTabContainerRef}
            className="relative grid grid-cols-4 gap-0.5 p-0.5 rounded-md bg-[#0A0C10] border border-[#AAB7C5]/14 shrink-0"
          >
            <div
              aria-hidden="true"
              className="studio-sliding-pill pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-[4px] bg-[#1C2430] border border-[#4A6B86]/55"
              style={scopeTabPillStyle}
            />
            {scopeModes.map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  ref={registerScopeTabRef(m.id)}
                  type="button"
                  title={m.title}
                  onClick={() => setMode(m.id)}
                  className={`relative z-10 py-1 rounded-[4px] text-[10px] font-medium transition-[color,transform] duration-150 ease-[var(--ease-shutter)] active:scale-[0.96] cursor-pointer whitespace-nowrap text-center ${
                    active
                      ? "text-[#F4F7FB]"
                      : "text-[#AAB7C5] hover:text-[#F4F7FB]"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Flexible Studio Scope Well (Fills naturally, zero gap above Signal Telemetry) */}
        <div className="relative w-full flex-1 min-h-[172px] max-h-[220px] rounded-md bg-[#07090D] border border-[#AAB7C5]/14 overflow-hidden flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={SCOPE_W}
            height={SCOPE_H}
            className="w-full h-full block"
          />
          {!hasMedia && mode !== "vectorscope" && (
            <span className="absolute text-[10px] font-mono text-[#AAB7C5]/80 pointer-events-none text-center px-3">
              {t("scopes.emptyHint")}
            </span>
          )}
        </div>

        {/* Compact Collapsible Signal Telemetry Readout (CSS Grid 0fr -> 1fr) */}
        <div className="pt-2.5 border-t border-[#AAB7C5]/14 shrink-0">
          <button
            type="button"
            aria-expanded={isTelemetryOpen}
            onClick={() => setIsTelemetryOpen((v) => !v)}
            className="w-full flex items-center justify-between text-[9.5px] font-sans font-semibold uppercase tracking-[0.08em] text-[#AAB7C5] hover:text-[#F4F7FB] transition-colors duration-150 cursor-pointer"
          >
            <span>{t("scopes.signalTelemetry")}</span>
            <span className="inline-flex items-center gap-1.5 font-mono font-normal text-[#AAB7C5]">
              <span>Rec.709</span>
              <ChevronDown
                className={`studio-chevron w-3 h-3 text-[#AAB7C5] ${
                  isTelemetryOpen ? "rotate-180" : "rotate-0"
                }`}
              />
            </span>
          </button>
          <div
            className="studio-collapse-grid"
            data-expanded={isTelemetryOpen}
            aria-hidden={!isTelemetryOpen}
          >
            <div className="studio-collapse-inner">
              <div className="mt-1.5 divide-y divide-[#AAB7C5]/12 text-[10px] font-mono tabular-nums">
                <div className="flex items-center justify-between py-1.5">
                  <span className="font-sans text-[#AAB7C5]">{t("scopes.peakLuma")}</span>
                  <span ref={peakIreRef} className="text-[#F4F7FB]">-</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="font-sans text-[#AAB7C5]">{t("scopes.blackFloor")}</span>
                  <span ref={blackIreRef} className="text-[#F4F7FB]">-</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="font-sans text-[#AAB7C5]">{t("scopes.dynamicRange")}</span>
                  <span ref={dynamicRangeRef} className="text-[#F4F7FB]">-</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="font-sans text-[#AAB7C5]">{t("scopes.avgChroma")}</span>
                  <span ref={avgChromaRef} className="text-[#F4F7FB]">-</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="font-sans text-[#AAB7C5]">{t("scopes.skinToneLock")}</span>
                  <span className="inline-flex items-center gap-1.5 text-[#F4F7FB]">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: skinLockColor }}
                    />
                    <span>{skinLockLabel}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="font-sans text-[#AAB7C5]">{t("scopes.gamutStatus")}</span>
                  <span className="inline-flex items-center gap-1.5 text-[#F4F7FB]">
                    <span
                      ref={gamutDotRef}
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: "#4A6B86" }}
                    />
                    <span ref={gamutStatusRef}>Standby</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  })
);

export default ProScopes;
