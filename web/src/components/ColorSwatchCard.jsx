import React, { useRef, useState } from "react";
import { Copy, Check } from "lucide-react";

export default function ColorSwatchCard({
  title,
  rNorm,
  gNorm,
  bNorm,
  onChange,
  disabled
}) {
  const [copied, setCopied] = useState(false);
  const colorInputRef = useRef(null);

  const rInt = Math.min(255, Math.max(0, Math.round(rNorm * 255)));
  const gInt = Math.min(255, Math.max(0, Math.round(gNorm * 255)));
  const bInt = Math.min(255, Math.max(0, Math.round(bNorm * 255)));

  const hexCode = `#${rInt.toString(16).padStart(2, "0")}${gInt.toString(16).padStart(2, "0")}${bInt.toString(16).padStart(2, "0")}`.toUpperCase();

  const handleColorChange = (e) => {
    const hex = e.target.value;
    const r = parseInt(hex.slice(1, 3), 16) / 255.0;
    const g = parseInt(hex.slice(3, 5), 16) / 255.0;
    const b = parseInt(hex.slice(5, 7), 16) / 255.0;
    onChange(r, g, b);
  };

  const handleCopyHex = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(hexCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex-1 bg-[#0E1914]/85 border border-[#20352B] rounded-xl p-2.5 flex flex-col items-center gap-1.5">
      <span className="text-[10px] font-bold text-[#91A69A]">{title}</span>

      {/* Clickable Color Block */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => colorInputRef.current?.click()}
        style={{ backgroundColor: hexCode }}
        className="w-full h-9 rounded-lg border border-white/15 cursor-pointer shadow-inner relative transition-transform active:scale-95 disabled:opacity-50"
      >
        <input
          ref={colorInputRef}
          type="color"
          value={hexCode}
          disabled={disabled}
          onChange={handleColorChange}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </button>

      {/* HEX + Copy Button */}
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-[11px] font-bold text-white tracking-wider font-mono">
          {hexCode}
        </span>
        <button
          type="button"
          onClick={handleCopyHex}
          title="Copy HEX Code"
          className="p-1 rounded hover:bg-[#00E987]/15 text-[#91A69A] hover:text-[#00E987] transition-colors cursor-pointer"
        >
          {copied ? <Check size={12} className="text-[#00E987]" /> : <Copy size={12} />}
        </button>
      </div>

      {/* RGB Readout */}
      <span className="text-[9px] text-[#91A69A]">
        {rInt}, {gInt}, {bInt}
      </span>
    </div>
  );
}
