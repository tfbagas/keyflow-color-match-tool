import React, { useEffect, useState } from "react";
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
  valueSuffix = "",
  onChange,
  icon: Icon,
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Shift") setShiftHeld(true);
    };
    const onKeyUp = (e) => {
      if (e.key === "Shift") setShiftHeld(false);
    };
    const onBlur = () => setShiftHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const effectiveStep = shiftHeld ? 0.01 : step;

  const clamp = (val) => Math.max(min, Math.min(max, val));
  const range = max - min || 1;

  const handleSliderChange = (e) => {
    let nextVal = parseFloat(e.target.value);

    // Soft magnetic snap toward center/default value on bipolar sliders
    if (isBipolar && Math.abs(nextVal - defaultValue) <= range * 0.016) {
      nextVal = defaultValue;
    }

    onChange(paramKey, nextVal);
  };

  const handleStep = (delta) => {
    const next = clamp(Math.round((value + delta) * 100) / 100);
    onChange(paramKey, next);
  };

  const handleReset = () => {
    onChange(paramKey, defaultValue);
  };

  const valPct = Math.max(0, Math.min(100, ((value - min) / range) * 100));
  const defaultPct = Math.max(0, Math.min(100, ((defaultValue - min) / range) * 100));

  const isModified = Math.abs(value - defaultValue) > 0.004;
  const isActive = isHovered || isDragging;

  // Calculate active fill start and width
  const fillLeft = isBipolar ? Math.min(valPct, defaultPct) : 0;
  const fillWidth = isBipolar ? Math.abs(valPct - defaultPct) : valPct;

  // Track background style (micro-chroma gradient for temp and tint)
  let trackBgStyle = { backgroundColor: "rgba(10, 10, 13, 0.45)" };
  if (paramKey === "temp") {
    trackBgStyle = {
      background:
        "linear-gradient(90deg, rgba(56, 189, 248, 0.24) 0%, rgba(18, 18, 24, 0.65) 50%, rgba(251, 191, 36, 0.24) 100%)",
    };
  } else if (paramKey === "tint") {
    trackBgStyle = {
      background:
        "linear-gradient(90deg, rgba(52, 211, 153, 0.24) 0%, rgba(18, 18, 24, 0.65) 50%, rgba(232, 121, 249, 0.24) 100%)",
    };
  }

  return (
    <div
      onDoubleClick={handleReset}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsDragging(false);
      }}
      title="Double-click to reset parameter to default"
      className="flex items-center gap-2.5 py-[3px] px-2 rounded-lg hover:bg-white/[0.035] transition-colors group select-none"
    >
      {/* Label & Icon + Modified Indicator Dot */}
      <div
        onDoubleClick={handleReset}
        className="flex items-center gap-2 w-36 sm:w-44 shrink-0 cursor-pointer"
      >
        {Icon && (
          <Icon className="w-3.5 h-3.5 text-[#9CA3AF] group-hover:text-[#E2E4E9] transition-colors shrink-0" />
        )}
        <span className="text-xs font-medium text-[#E2E4E9]/90 truncate">
          {label}
        </span>
        {isModified && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-[#E2E4E9] shrink-0 transition-transform duration-200 scale-100"
            title={`Modified (Default: ${defaultValue.toFixed(2)})`}
          />
        )}
      </div>

      {/* Material 3 Bipolar Center-Zero Slider with Tactile Handle Morph */}
      <div className="relative flex-1 flex items-center h-6">
        {/* Track Background */}
        <div
          className={`w-full rounded-full relative overflow-hidden border border-white/[0.08] transition-[height,border-color] duration-200 ${
            isDragging ? "h-2 border-white/20" : isActive ? "h-2" : "h-1.5"
          }`}
          style={{
            ...trackBgStyle,
            transitionTimingFunction: "var(--ease-m3-spring)",
          }}
        >
          {/* Active Fill Bar (no transition on left/width for 0-lag 60fps drag) */}
          <div
            className={`absolute top-0 bottom-0 transition-colors duration-150 ${
              isDragging
                ? "bg-white"
                : isActive
                ? "bg-[#E2E4E9]"
                : "bg-[#9CA3AF]"
            }`}
            style={{
              left: `${fillLeft}%`,
              width: `${fillWidth}%`,
            }}
          />
        </div>

        {/* Center / Default Tick Mark */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-[1.5px] pointer-events-none z-10 transition-[height,background-color] duration-200 ${
            !isModified ? "h-3.5 bg-[#E2E4E9]/60" : "h-3 bg-white/25"
          }`}
          style={{ left: `calc(${defaultPct}% - 0.75px)` }}
        />

        {/* Tactile Vertical Bar Thumb: morphs thicker + monochrome glass glow on drag, springs back cleanly; left stays instant for 0 lag */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full ring-2 ring-[#0E0E12]/90 pointer-events-none z-20 transition-[width,height,box-shadow,background-color] duration-200 ${
            isDragging
              ? "w-2 h-5 bg-white shadow-[0_0_14px_rgba(255,255,255,0.58),0_0_0_3px_rgba(255,255,255,0.16)]"
              : isHovered
              ? "w-1.5 h-5 bg-white shadow-[0_0_10px_rgba(226,228,233,0.45)]"
              : "w-1 h-4 bg-[#E2E4E9]"
          }`}
          style={{
            left: `${valPct}%`,
            transitionTimingFunction: "var(--ease-m3-spring)",
          }}
        />

        {/* Native Range Input Overlay for Full Mouse/Touch Accessibility */}
        <input
          type="range"
          min={min}
          max={max}
          step={effectiveStep}
          value={value}
          onChange={handleSliderChange}
          onMouseDown={(e) => {
            setIsDragging(true);
            setShiftHeld(Boolean(e.shiftKey));
          }}
          onMouseMove={(e) => {
            if (isDragging) setShiftHeld(Boolean(e.shiftKey));
          }}
          onMouseUp={() => setIsDragging(false)}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setIsDragging(false)}
          onDoubleClick={handleReset}
          aria-label={label}
          className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30 m-0"
        />
      </div>

      {/* Value Readout & Stepper */}
      <div
        onDoubleClick={(e) => e.stopPropagation()}
        className={`flex items-center bg-[#0A0A0D]/38 border rounded-md overflow-hidden shrink-0 transition-colors ${
          isDragging && shiftHeld
            ? "border-[#6EE7B7]/60"
            : isDragging
            ? "border-white/25"
            : "border-white/[0.09]"
        }`}
      >
        <span className="w-13 text-right px-1.5 py-1 text-[11px] font-mono tabular-nums text-[#E2E4E9]">
          {value >= 0 && min < 0
            ? `+${value.toFixed(2)}${valueSuffix}`
            : `${value.toFixed(2)}${valueSuffix}`}
        </span>
        <div className="flex flex-col border-l border-white/[0.08]">
          <button
            type="button"
            onClick={() => handleStep(step * 2)}
            className="px-1 py-0.5 hover:bg-white/10 active:scale-90 text-[#9CA3AF] hover:text-[#E2E4E9] transition-all cursor-pointer"
            title="Increase"
          >
            <ChevronUp className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onClick={() => handleStep(-step * 2)}
            className="px-1 py-0.5 hover:bg-white/10 active:scale-90 text-[#9CA3AF] hover:text-[#E2E4E9] transition-all border-t border-white/[0.06] cursor-pointer"
            title="Decrease"
          >
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
