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
    <div
      onClick={handleCopy}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCopy();
        }
      }}
      title={`Click to copy ${hex}`}
      className={`relative flex flex-col items-center bg-white/[0.035] border rounded-lg p-2.5 transition-all cursor-pointer select-none active:scale-[0.98] ${
        copied
          ? "border-[#6EE7B7]/40 bg-white/[0.08]"
          : "border-white/[0.09] hover:border-white/20 hover:bg-white/[0.06]"
      }`}
    >
      <span className="text-[11px] font-medium text-[#9CA3AF] mb-1.5">
        {title}
      </span>

      {/* Color Swatch Box with Copied Feedback Overlay */}
      <div
        className="relative w-full h-9 rounded-md border border-white/10 shadow-inner mb-2 transition-colors duration-200 flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
      >
        <div
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0E0E11]/90 border border-[#6EE7B7]/40 text-[10px] font-mono font-semibold text-[#6EE7B7] transition-all duration-200 ${
            copied
              ? "opacity-100 scale-100"
              : "opacity-0 scale-90 pointer-events-none"
          }`}
        >
          <Check className="w-2.5 h-2.5" />
          <span>Copied</span>
        </div>
      </div>

      {/* Hex Code + Copy Icon */}
      <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums font-semibold text-[#E2E4E9] transition-colors">
        <span>{hex}</span>
        {copied ? (
          <Check className="w-3 h-3 text-[#6EE7B7]" />
        ) : (
          <Copy className="w-3 h-3 text-[#9CA3AF]" />
        )}
      </div>

      {/* RGB Readout */}
      <span className="text-[10px] font-mono tabular-nums text-[#9CA3AF]/70 mt-0.5">
        {r}, {g}, {b}
      </span>
    </div>
  );
}
