import React, { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";

const SCOPE_MODES = [
  { id: "histogram", label: "Luma / RGB" },
  { id: "parade", label: "RGB Parade" },
  { id: "vectorscope", label: "Vectorscope" },
];

export default function ProScopes({ imageData, hasMedia }) {
  const [mode, setMode] = useState("histogram");
  const [fading, setFading] = useState(false);
  const canvasRef = useRef(null);

  const handleModeChange = (nextMode) => {
    if (nextMode === mode) return;
    setFading(true);
    setTimeout(() => {
      setMode(nextMode);
      setFading(false);
    }, 80);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Subtle background grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 1;
    if (mode !== "vectorscope") {
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

    const { data, width: imgW, height: imgH } = imageData;

    if (mode === "histogram") {
      const rBins = new Uint32Array(256);
      const gBins = new Uint32Array(256);
      const bBins = new Uint32Array(256);
      const lBins = new Uint32Array(256);

      const totalPixels = data.length / 4;
      const step = Math.max(1, Math.floor(totalPixels / 12000));
      for (let i = 0; i < totalPixels; i += step) {
        const idx = i * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const l = Math.min(255, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b));
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

    if (mode === "parade") {
      const gap = 6;
      const colW = Math.floor((w - gap * 2) / 3);
      const offsets = [0, colW + gap, (colW + gap) * 2];
      const colors = [
        "rgba(248, 113, 113, 0.28)",
        "rgba(110, 231, 183, 0.28)",
        "rgba(96, 165, 250, 0.28)",
      ];

      // Column dividers
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.beginPath();
      ctx.moveTo(colW + gap / 2, 0);
      ctx.lineTo(colW + gap / 2, h);
      ctx.moveTo(colW * 2 + gap * 1.5, 0);
      ctx.lineTo(colW * 2 + gap * 1.5, h);
      ctx.stroke();

      const safeW = Math.max(1, imgW || 1);
      const safeH = Math.max(1, imgH || Math.round(data.length / 4 / safeW));
      const xStep = Math.max(1, Math.floor(safeW / colW));
      const yStep = Math.max(1, Math.floor(safeH / 64));

      for (let py = 0; py < safeH; py += yStep) {
        const rowOffset = py * safeW;
        for (let px = 0; px < safeW; px += xStep) {
          const idx = (rowOffset + px) * 4;
          if (idx + 2 >= data.length) continue;
          const localX = Math.min(colW - 1, Math.floor((px / safeW) * colW));
          for (let c = 0; c < 3; c++) {
            const val = data[idx + c];
            const plotY = Math.max(1, Math.min(h - 2, h - 1 - (val / 255) * (h - 2)));
            ctx.fillStyle = colors[c];
            ctx.fillRect(offsets[c] + localX, plotY, 1.2, 1.2);
          }
        }
      }
      return;
    }

    if (mode === "vectorscope") {
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.44;

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

      // Skin-tone line (I-line ~ 123 deg in Cb/Cr plane where +Cb right, +Cr up)
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

      const totalPixels = data.length / 4;
      const step = Math.max(1, Math.floor(totalPixels / 6500));
      for (let i = 0; i < totalPixels; i += step) {
        const idx = i * 4;
        const r = data[idx] / 255;
        const g = data[idx + 1] / 255;
        const b = data[idx + 2] / 255;
        // Rec.709 Cb/Cr in [-0.5, 0.5]
        const cb = -0.1687 * r - 0.3313 * g + 0.5 * b;
        const cr = 0.5 * r - 0.4187 * g - 0.0813 * b;
        const px = cx + cb * 2 * radius;
        const py = cy - cr * 2 * radius;
        ctx.fillStyle = `rgba(${data[idx]}, ${data[idx + 1]}, ${data[idx + 2]}, 0.35)`;
        ctx.fillRect(px, py, 1.4, 1.4);
      }
    }
  }, [imageData, mode]);

  return (
    <div
      className="rounded-xl bg-white/[0.02] border border-white/[0.08] p-2"
      style={{ contain: "layout paint" }}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-[#9CA3AF]" />
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#9CA3AF]">
            Pro Scopes
          </span>
        </div>

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
      </div>

      <div className="relative w-full h-[68px] rounded-lg bg-[#09090C] border border-white/[0.06] overflow-hidden flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={320}
          height={68}
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
  );
}
