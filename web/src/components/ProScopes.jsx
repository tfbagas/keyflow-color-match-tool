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

const SCOPE_MODES = [
  { id: "histogram", label: "Luma / RGB" },
  { id: "parade", label: "RGB Parade" },
  { id: "vectorscope", label: "Vectorscope" },
];

const SCOPE_W = 320;
const SCOPE_H = 68;
const SCOPE_DPR = 1; // Locked to 1x DPR to eliminate 3x retina 2D canvas fill-rate overhead
const VIDEO_SCOPE_INTERVAL_MS = 165; // Max ~6 FPS during video playback

const ProScopes = memo(
  forwardRef(function ProScopes(
    {
      hasMedia,
      isDragging = false,
      isVideoPlaying = false,
      isCollapsed: controlledCollapsed,
      onToggleCollapse,
    },
    ref
  ) {
    const [mode, setMode] = useState("histogram");
    const [fading, setFading] = useState(false);
    const [localCollapsed, setLocalCollapsed] = useState(false);
    const isCollapsed =
      typeof controlledCollapsed === "boolean"
        ? controlledCollapsed
        : localCollapsed;

    const canvasRef = useRef(null);
    const offscreenRef = useRef(null);
    const binsRef = useRef(null);
    const lastDrawAtRef = useRef(0);
    const latestFrameRef = useRef(null);
    const modeTimerRef = useRef(null);
    const stateRef = useRef({
      mode,
      isCollapsed,
      isDragging,
      isVideoPlaying,
    });
    stateRef.current = { mode, isCollapsed, isDragging, isVideoPlaying };
    const prevStateRef = useRef({
      mode: "histogram",
      isCollapsed: false,
      isDragging: false,
    });

    const handleToggleCollapse = () => {
      if (onToggleCollapse) {
        onToggleCollapse();
      } else {
        setLocalCollapsed((v) => !v);
      }
    };

    const handleModeChange = (nextMode) => {
      if (nextMode === mode) return;
      if (modeTimerRef.current) clearTimeout(modeTimerRef.current);
      setFading(true);
      modeTimerRef.current = setTimeout(() => {
        modeTimerRef.current = null;
        setMode(nextMode);
        setFading(false);
      }, 80);
    };

    useEffect(
      () => () => {
        if (modeTimerRef.current) clearTimeout(modeTimerRef.current);
      },
      []
    );

    const drawScope = useCallback((imageData, force = false) => {
      const {
        mode: curMode,
        isCollapsed: collapsed,
        isDragging: dragging,
        isVideoPlaying: playing,
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

      if (collapsed || dragging || document.hidden) {
        return;
      }

      const now = performance.now();
      if (
        !force &&
        playing &&
        !modeChanged &&
        !justExpanded &&
        !justReleasedDrag &&
        now - lastDrawAtRef.current < VIDEO_SCOPE_INTERVAL_MS
      ) {
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      // Enforce strict 1x DPR buffer dimensions
      const targetW = SCOPE_W * SCOPE_DPR;
      const targetH = SCOPE_H * SCOPE_DPR;
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Subtle background grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.lineWidth = 1;
      if (curMode !== "vectorscope") {
        [0.25, 0.5, 0.75].forEach((frac) => {
          const y = Math.round(h * frac) + 0.5;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        });
      }

      if (!imageData || !imageData.data || imageData.data.length === 0) {
        return;
      }

      lastDrawAtRef.current = now;
      const { data, width: imgW, height: imgH } = imageData;

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
          ctx.moveTo(0, h);
          for (let i = 0; i < 256; i++) {
            const x = (i / 255) * w;
            const norm = Math.min(1, bins[i] / maxBin);
            const y = h - norm * (h - 6);
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1.1;
          ctx.stroke();
        };

        ctx.globalCompositeOperation = "screen";
        drawChannel(rBins, "rgba(248, 113, 113, 0.75)", "rgba(248, 113, 113, 0.16)");
        drawChannel(gBins, "rgba(110, 231, 183, 0.75)", "rgba(110, 231, 183, 0.16)");
        drawChannel(bBins, "rgba(96, 165, 250, 0.75)", "rgba(96, 165, 250, 0.16)");
        ctx.globalCompositeOperation = "source-over";
        drawChannel(lBins, "rgba(244, 245, 247, 0.65)", "rgba(244, 245, 247, 0.06)");
        return;
      }

      // Lazily allocate reusable 1x DPR offscreen pixel buffer for Parade & Vectorscope
      if (!offscreenRef.current) {
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

      if (curMode === "parade") {
        const gap = 6;
        const colW = Math.floor((w - gap * 2) / 3);
        const off0 = 0;
        const off1 = colW + gap;
        const off2 = (colW + gap) * 2;

        // Column dividers
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.beginPath();
        ctx.moveTo(colW + gap / 2, 0);
        ctx.lineTo(colW + gap / 2, h);
        ctx.moveTo(colW * 2 + gap * 1.5, 0);
        ctx.lineTo(colW * 2 + gap * 1.5, h);
        ctx.stroke();

        const safeW = Math.max(1, imgW || 1);
        const safeH = Math.max(1, imgH || Math.round((data.length >> 2) / safeW));
        const xStep = Math.max(1, Math.floor(safeW / colW));
        const yStep = Math.max(1, Math.floor(safeH / 54));
        const hSpan = h - 2;

        for (let py = 0; py < safeH; py += yStep) {
          const rowOffset = py * safeW;
          for (let px = 0; px < safeW; px += xStep) {
            const idx = (rowOffset + px) << 2;
            if (idx + 2 >= data.length) continue;
            const localX = Math.min(colW - 1, ((px * colW) / safeW) | 0);

            // R channel
            const yr = Math.max(1, Math.min(hSpan, h - 1 - ((data[idx] * hSpan) >> 8)));
            const pr = (yr * w + (off0 + localX)) << 2;
            out[pr] = Math.min(255, out[pr] + 92);
            out[pr + 1] = Math.min(255, out[pr + 1] + 40);
            out[pr + 2] = Math.min(255, out[pr + 2] + 40);
            out[pr + 3] = Math.min(255, out[pr + 3] + 100);

            // G channel
            const yg = Math.max(1, Math.min(hSpan, h - 1 - ((data[idx + 1] * hSpan) >> 8)));
            const pg = (yg * w + (off1 + localX)) << 2;
            out[pg] = Math.min(255, out[pg] + 40);
            out[pg + 1] = Math.min(255, out[pg + 1] + 88);
            out[pg + 2] = Math.min(255, out[pg + 2] + 68);
            out[pg + 3] = Math.min(255, out[pg + 3] + 100);

            // B channel
            const yb = Math.max(1, Math.min(hSpan, h - 1 - ((data[idx + 2] * hSpan) >> 8)));
            const pb = (yb * w + (off2 + localX)) << 2;
            out[pb] = Math.min(255, out[pb] + 36);
            out[pb + 1] = Math.min(255, out[pb + 1] + 62);
            out[pb + 2] = Math.min(255, out[pb + 2] + 94);
            out[pb + 3] = Math.min(255, out[pb + 3] + 100);
          }
        }

        octx.putImageData(imgBuf, 0, 0);
        ctx.drawImage(oc, 0, 0);
        return;
      }

      if (curMode === "vectorscope") {
        const cx = w * 0.5;
        const cy = h * 0.5;
        const radius = Math.min(w, h) * 0.44;
        const scale2R = (2 * radius) / 255;

        // Graticule circle & axes
        ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - radius, cy);
        ctx.lineTo(cx + radius, cy);
        ctx.moveTo(cx, cy - radius);
        ctx.lineTo(cx, cy + radius);
        ctx.stroke();

        // Skin-tone line (I-line ~ 123 deg in Cb/Cr plane)
        const skinAngle = (123 * Math.PI) / 180;
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = "rgba(251, 191, 36, 0.45)";
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(
          cx + Math.cos(skinAngle) * radius,
          cy - Math.sin(skinAngle) * radius
        );
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = "rgba(251, 191, 36, 0.55)";
        ctx.font = "8px monospace";
        ctx.fillText(
          "SKIN",
          cx + Math.cos(skinAngle) * (radius * 0.72) - 18,
          cy - Math.sin(skinAngle) * (radius * 0.72) - 2
        );

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
          const a = out[p + 3] + 115;
          out[p + 3] = a > 255 ? 255 : a;
        }

        octx.putImageData(imgBuf, 0, 0);
        ctx.drawImage(oc, 0, 0);
      }
    }, []);

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

  return (
    <div
      className="rounded-xl bg-white/[0.02] border border-white/[0.08] p-2"
      style={{ contain: "layout paint" }}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleToggleCollapse}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "Expand Pro Scopes" : "Collapse Pro Scopes"}
          className="flex items-center gap-1.5 text-left cursor-pointer group select-none"
        >
          <Activity className="w-3.5 h-3.5 text-[#9CA3AF] group-hover:text-[#E2E4E9] transition-colors" />
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#9CA3AF] group-hover:text-[#E2E4E9] transition-colors">
            Pro Scopes
          </span>
        </button>

        <div className="flex items-center gap-1.5">
          {!isCollapsed && (
            <div className="inline-flex items-center p-0.5 rounded-lg bg-[#0E0E12] border border-white/[0.08]">
              {SCOPE_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleModeChange(m.id)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                    mode === m.id
                      ? "bg-white/[0.12] text-[#F4F5F7]"
                      : "text-[#9CA3AF] hover:text-[#F4F5F7]"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleToggleCollapse}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? "Expand Pro Scopes" : "Collapse Pro Scopes"}
            title={isCollapsed ? "Expand Pro Scopes" : "Collapse Pro Scopes"}
            className="m3-btn-morph p-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-[#9CA3AF] hover:text-[#E2E4E9] border border-white/[0.09] cursor-pointer"
          >
            <ChevronDown
              className={`w-3 h-3 transition-transform duration-300 ${
                !isCollapsed ? "rotate-180" : "rotate-0"
              }`}
              style={{ transitionTimingFunction: "var(--ease-m3-spring)" }}
            />
          </button>
        </div>
      </div>

      <div
        className={`m3-collapse-grid ${!isCollapsed ? "mt-1.5" : "mt-0"}`}
        data-expanded={!isCollapsed}
      >
        <div className="m3-collapse-inner">
          <div className="relative w-full h-[68px] rounded-lg bg-[#09090C] border border-white/[0.06] overflow-hidden flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={SCOPE_W}
              height={SCOPE_H}
              className={`w-full h-full object-fill transition-opacity duration-[160ms] ${
                fading ? "opacity-0" : "opacity-100"
              }`}
            />
            {!hasMedia && (
              <span className="absolute text-[10px] font-mono text-[#9CA3AF]/50 pointer-events-none">
                Load target media to inspect scopes
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
  })
);

export default ProScopes;
