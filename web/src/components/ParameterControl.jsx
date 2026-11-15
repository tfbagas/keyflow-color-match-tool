import React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

export default function ParameterControl({
  paramKey,
  label,
  min,
  max,
  step = 0.01,
  value,
  defaultValue = 0,
  isBipolar = true,
  onChange,
  icon: Icon,
}) {
  const clamp = (val) => Math.max(min, Math.min(max, val));

  const handleSliderChange = (e) => {
    onChange(paramKey, parseFloat(e.target.value));
  };

  const handleStep = (delta) => {
    const next = clamp(Math.round((value + delta) * 100) / 100);
    onChange(paramKey, next);
  };

  const handleReset = () => {
    onChange(paramKey, defaultValue);
  };

  const range = max - min || 1;
  const valPct = Math.max(0, Math.min(100, ((value - min) / range) * 100));
  const defaultPct = Math.max(0, Math.min(100, ((defaultValue - min) / range) * 100));

  const isModified = Math.abs(value - defaultValue) > 0.004;

  // Calculate active fill start and width
  const fillLeft = isBipolar ? Math.min(valPct, defaultPct) : 0;
  const fillWidth = isBipolar ? Math.abs(valPct - defaultPct) : valPct;

  // Track background style (micro-chroma gradient for temp and tint)
  let trackBgStyle = { backgroundColor: "#1E1E24" };
  if (paramKey === "temp") {
    trackBgStyle = {
      background:
        "linear-gradient(90deg, rgba(56, 189, 248, 0.22) 0%, rgba(30, 30, 36, 0.95) 50%, rgba(251, 191, 36, 0.22) 100%)",
    };
  } else if (paramKey === "tint") {
    trackBgStyle = {
      background:
        "linear-gradient(90deg, rgba(52, 211, 153, 0.22) 0%, rgba(30, 30, 36, 0.95) 50%, rgba(232, 121, 249, 0.22) 100%)",
    };
  }

  return (
    <div
      onDoubleClick={handleReset}
      title="Double-click to reset parameter to default"
      className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-[#1E1E24]/50 transition-colors group select-none"
    >
      {/* Label & Icon + Modified Indicator Dot */}
      <div
        onDoubleClick={handleReset}
        className="flex items-center gap-2 w-36 sm:w-44 shrink-0 cursor-pointer"
      >
        {Icon && (
          <Icon className="w-3.5 h-3.5 text-[#9CA3AF] group-hover:text-[#E2E4E9] transition-colors shrink-0" />
        )}
        <span className="text-xs font-medium text-[#E2E4E9]/90 truncate">{label}</span>
        {isModified && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-[#E2E4E9] shrink-0"
            title={`Modified (Default: ${defaultValue.toFixed(2)})`}
          />
        )}
      </div>

      {/* Material 3 Bipolar Center-Zero Slider */}
      <div className="relative flex-1 flex items-center h-6">
        {/* Track Background */}
        <div
          className="w-full h-1.5 rounded-full relative overflow-hidden border border-white/[0.06]"
          style={trackBgStyle}
        >
          {/* Active Fill Bar */}
          <div
            className="absolute top-0 bottom-0 bg-[#9CA3AF] group-hover:bg-[#E2E4E9] transition-colors"
            style={{
              left: `${fillLeft}%`,
              width: `${fillWidth}%`,
            }}
          />
        </div>

        {/* Center / Default Tick Mark */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-[1.5px] h-3 bg-white/25 pointer-events-none z-10"
          style={{ left: `calc(${defaultPct}% - 0.75px)` }}
        />

        {/* Slim Vertical Bar Thumb with M3 Separation Gap */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1 h-4 rounded-full bg-[#E2E4E9] ring-2 ring-[#151519] pointer-events-none z-20 transition-transform group-hover:scale-y-110"
          style={{ left: `${valPct}%` }}
        />

        {/* Native Range Input Overlay for Full Mouse/Touch Accessibility */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleSliderChange}
          onDoubleClick={handleReset}
          aria-label={label}
          className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30 m-0"
        />
      </div>

      {/* Value Readout & Stepper */}
      <div
        onDoubleClick={(e) => e.stopPropagation()}
        className="flex items-center bg-[#1E1E24] border border-white/[0.08] rounded-md overflow-hidden shrink-0"
      >
        <span className="w-12 text-right px-1.5 py-1 text-[11px] font-mono tabular-nums text-[#E2E4E9]">
          {value >= 0 && min < 0 ? `+${value.toFixed(2)}` : value.toFixed(2)}
        </span>
        <div className="flex flex-col border-l border-white/[0.08]">
          <button
            type="button"
            onClick={() => handleStep(step * 2)}
            className="px-1 py-0.5 hover:bg-white/10 text-[#9CA3AF] hover:text-[#E2E4E9] transition-colors cursor-pointer"
            title="Increase"
          >
            <ChevronUp className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onClick={() => handleStep(-step * 2)}
            className="px-1 py-0.5 hover:bg-white/10 text-[#9CA3AF] hover:text-[#E2E4E9] transition-colors border-t border-white/[0.06] cursor-pointer"
            title="Decrease"
          >
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
