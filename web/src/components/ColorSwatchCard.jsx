import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function ColorSwatchCard({ title, rgb = [0.5, 0.5, 0.5] }) {
  const [copied, setCopied] = useState(false);

  const clampByte = (v) =>
    Math.max(0, Math.min(255, Math.round((v ?? 0.5) * 255)));

  const r = clampByte(rgb[0]);
  const g = clampByte(rgb[1]);
  const b = clampByte(rgb[2]);

  const hex = `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();

  const handleCopy = () => {
    navigator.clipboard?.writeText(hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col items-center bg-[#1E1E24]/70 border border-white/[0.08] rounded-lg p-2.5 transition-all hover:border-white/15">
      <span className="text-[11px] font-medium text-[#9CA3AF] mb-1.5">
        {title}
      </span>

      {/* Color Swatch Box */}
      <div
        className="w-full h-9 rounded-md border border-white/10 shadow-inner mb-2 transition-colors duration-200"
        style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
      />

      {/* Hex Code + Copy Button */}
      <button
        type="button"
        onClick={handleCopy}
        className="flex items-center gap-1.5 text-xs font-mono tabular-nums font-semibold text-[#E2E4E9] hover:text-white transition-colors cursor-pointer"
        title="Copy Hex Color"
      >
        <span>{hex}</span>
        {copied ? (
          <Check className="w-3 h-3 text-[#6EE7B7]" />
        ) : (
          <Copy className="w-3 h-3 text-[#9CA3AF]" />
        )}
      </button>

      {/* RGB Readout */}
      <span className="text-[10px] font-mono tabular-nums text-[#9CA3AF]/70 mt-0.5">
        {r}, {g}, {b}
      </span>
    </div>
  );
}
