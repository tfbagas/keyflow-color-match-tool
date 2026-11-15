import React from "react";
import {
  Sun,
  Contrast,
  Sliders,
  Droplets,
  Sparkles,
  Thermometer,
  Palette,
  Activity
} from "lucide-react";

const ICON_MAP = {
  sun: Sun,
  contrast: Contrast,
  pivot: Sliders,
  droplet: Droplets,
  highlights: Sparkles,
  thermometer: Thermometer,
  palette: Palette,
  activity: Activity,
};

export default function ParameterControl({
  paramKey,
  label,
  iconName,
  min,
  max,
  step = 0.01,
  value,
  onChange,
  disabled
}) {
  const IconComponent = ICON_MAP[iconName] || Sliders;

  return (
    <div className="flex items-center gap-2.5 py-1">
      {/* Icon */}
      <IconComponent size={15} className="text-[#E8F2ED] shrink-0" />

      {/* Label */}
      <span className="text-[11px] text-[#E8F2ED] w-32 sm:w-36 shrink-0 truncate">
        {label}
      </span>

      {/* Slider */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(paramKey, parseFloat(e.target.value))}
        className="flex-1 h-1 bg-[#172A20] rounded-lg cursor-pointer disabled:opacity-50"
      />

      {/* Numeric Input */}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(paramKey, parseFloat(e.target.value) || 0)}
        className="w-14 px-1.5 py-0.5 rounded-md bg-[#09100D]/90 border border-[#20352B] focus:border-[#00E987] text-[#00E987] text-[11px] font-bold font-mono text-right outline-none disabled:opacity-50"
      />
    </div>
  );
}
