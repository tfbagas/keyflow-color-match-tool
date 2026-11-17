import React, { memo, useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown, RotateCcw, Crosshair } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

const ParameterSlider = memo(function ParameterSlider({
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
  onDragChange,
  icon: Icon,
}) {
  const { t } = useLanguage();
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [fineMode, setFineMode] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const editInputRef = useRef(null);
  const draggingRef = useRef(false);
  const rafRef = useRef(0);
  const pendingValRef = useRef(null);
  const inputRef = useRef(null);
  const fillRef = useRef(null);
  const thumbRef = useRef(null);
  const readoutRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onDragChangeRef = useRef(onDragChange);
  onChangeRef.current = onChange;
  onDragChangeRef.current = onDragChange;

  const range = max - min || 1;
  const defaultPct = Math.max(0, Math.min(100, ((defaultValue - min) / range) * 100));

  const formatReadout = (v) =>
    v >= 0 && min < 0
      ? `+${v.toFixed(2)}${valueSuffix}`
      : `${v.toFixed(2)}${valueSuffix}`;

  const syncDomVisuals = (v) => {
    const pct = Math.max(0, Math.min(100, ((v - min) / range) * 100));
    const left = isBipolar ? Math.min(pct, defaultPct) : 0;
    const width = isBipolar ? Math.abs(pct - defaultPct) : pct;
    if (fillRef.current) {
      fillRef.current.style.left = `${left}%`;
      fillRef.current.style.width = `${width}%`;
    }
    if (thumbRef.current) {
      thumbRef.current.style.left = `${pct}%`;
    }
    if (readoutRef.current) {
      readoutRef.current.textContent = formatReadout(v);
    }
  };

  useEffect(() => {
    if (!draggingRef.current) {
      if (inputRef.current) {
        inputRef.current.value = String(value);
      }
      syncDomVisuals(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, min, max, defaultValue, isBipolar, valueSuffix]);

  useEffect(() => {
    if (!isDragging) {
      setShiftHeld(false);
      return undefined;
    }
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
  }, [isDragging]);

  const flushPending = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (pendingValRef.current !== null) {
      const next = pendingValRef.current;
      pendingValRef.current = null;
      onChangeRef.current(paramKey, next);
    }
  };

  const endDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    flushPending();
    onDragChangeRef.current?.(false);
  };

  const startDrag = () => {
    if (draggingRef.current) return;
    draggingRef.current = true;
    setIsDragging(true);
    onDragChangeRef.current?.(true);
  };

  useEffect(() => {
    if (!isDragging) return undefined;
    const handleEnd = () => endDrag();
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
    window.addEventListener("touchend", handleEnd);
    window.addEventListener("touchcancel", handleEnd);
    window.addEventListener("mouseup", handleEnd);
    return () => {
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
      window.removeEventListener("touchend", handleEnd);
      window.removeEventListener("touchcancel", handleEnd);
      window.removeEventListener("mouseup", handleEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (draggingRef.current) {
        draggingRef.current = false;
        onDragChangeRef.current?.(false);
      }
    },
    []
  );

  const isFineActive = shiftHeld || fineMode;
  const effectiveStep = isFineActive ? 0.01 : step;

  const clamp = (val) => Math.max(min, Math.min(max, val));

  const startEditing = (e) => {
    e.stopPropagation();
    setEditDraft(Number(value).toFixed(2));
    setIsEditing(true);
    requestAnimationFrame(() => {
      editInputRef.current?.select();
    });
  };

  const commitEdit = () => {
    setIsEditing(false);
    const parsed = parseFloat(editDraft);
    if (Number.isFinite(parsed)) {
      const clamped = clamp(Math.round(parsed * 100) / 100);
      onChange(paramKey, clamped);
    }
  };

  const handleEditKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsEditing(false);
    }
  };

  const handleSliderChange = (e) => {
    let nextVal = parseFloat(e.target.value);

    // Soft magnetic snap toward center/default value on bipolar sliders
    if (isBipolar && Math.abs(nextVal - defaultValue) <= range * 0.016) {
      nextVal = defaultValue;
    }

    syncDomVisuals(nextVal);

    if (draggingRef.current) {
      pendingValRef.current = nextVal;
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          if (pendingValRef.current !== null) {
            const val = pendingValRef.current;
            pendingValRef.current = null;
            onChangeRef.current(paramKey, val);
          }
        });
      }
    } else {
      onChangeRef.current(paramKey, nextVal);
    }
  };

  const handleStep = (delta) => {
    const next = clamp(Math.round((value + delta) * 100) / 100);
    onChange(paramKey, next);
  };

  const handleReset = () => {
    onChange(paramKey, defaultValue);
  };

  const valPct = Math.max(0, Math.min(100, ((value - min) / range) * 100));
  const pctNorm = Math.max(0, Math.min(1, (value - min) / range));
  const isModified = Math.abs(value - defaultValue) > 0.004;
  const isNeutral = !isModified;
  const isActive = isHovered || isDragging;

  let intensityLabel = t("slider.mid");
  let intensityClass = "bg-white/[0.06] text-[#E2E4E9]/85 border-white/[0.14]";
  if (isNeutral) {
    intensityLabel =
      paramKey === "matchStrength" ? t("slider.normal") : t("slider.neutral");
    intensityClass = "bg-white/[0.03] text-[#9CA3AF]/75 border-white/[0.08]";
  } else if (pctNorm <= 0.28) {
    intensityLabel = t("slider.low");
    intensityClass = "bg-sky-500/10 text-sky-300/90 border-sky-400/25";
  } else if (pctNorm >= 0.72) {
    intensityLabel = t("slider.strong");
    intensityClass = "bg-[#6EE7B7]/15 text-[#6EE7B7] border-[#6EE7B7]/35";
  }

  const fillLeft = isBipolar ? Math.min(valPct, defaultPct) : 0;
  const fillWidth = isBipolar ? Math.abs(valPct - defaultPct) : valPct;

  let trackTintStyle = undefined;
  if (paramKey === "temp") {
    trackTintStyle = {
      background:
        "linear-gradient(90deg, rgba(56, 189, 248, 0.26) 0%, rgba(14, 15, 20, 0.75) 50%, rgba(251, 191, 36, 0.26) 100%)",
    };
  } else if (paramKey === "tint") {
    trackTintStyle = {
      background:
        "linear-gradient(90deg, rgba(52, 211, 153, 0.26) 0%, rgba(14, 15, 20, 0.75) 50%, rgba(232, 121, 249, 0.26) 100%)",
    };
  }

  return (
    <div
      onDoubleClick={handleReset}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={t("slider.doubleClickReset")}
      className="flex flex-col min-[480px]:flex-row min-[480px]:items-center gap-1 min-[480px]:gap-2 py-1 min-[480px]:py-[3px] px-2 rounded-lg hover:bg-white/[0.035] transition-colors group select-none touch-pan-y"
    >
      {/* Top row on <480px / Left column on >=480px: Label, Reset, Dynamic Intensity Pill */}
      <div className="flex items-center justify-between min-[480px]:justify-start gap-1.5 min-[480px]:w-[218px] sm:w-[232px] shrink-0">
        <div
          onDoubleClick={handleReset}
          className="flex items-center gap-1.5 min-w-0 cursor-pointer"
        >
          {Icon && (
            <Icon className="w-3.5 h-3.5 text-[#9CA3AF] group-hover:text-[#E2E4E9] transition-colors shrink-0" />
          )}
          <span className="text-xs font-medium text-[#E2E4E9]/90 min-[480px]:whitespace-nowrap">
            {label}
          </span>
          {isModified && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7] shrink-0 transition-transform duration-200 scale-100"
              title={t("slider.modifiedTooltip", { val: defaultValue.toFixed(2) })}
            />
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 min-[480px]:ml-auto">
          {isModified && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleReset();
              }}
              title={t("slider.resetLabel", { label })}
              aria-label={t("slider.resetLabel", { label })}
              className="p-1 rounded hover:bg-white/[0.09] text-[#9CA3AF] hover:text-[#E2E4E9] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-mono border transition-colors ${intensityClass}`}
            title={t("slider.currentLevel", { level: intensityLabel })}
          >
            {intensityLabel}
          </span>
        </div>
      </div>

      {/* Track + Value Readout Row */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Recessed Optical Glass Channel with Bipolar Fill & Droplet Lens Thumb Morph */}
        <div className="relative flex-1 flex items-center h-6 touch-pan-y">
          {/* Recessed Optical Glass Channel */}
          <div
            className={`liquid-slider-track w-full rounded-full relative overflow-hidden transition-[height,border-color] duration-200 ${
              isDragging
                ? "h-2.5 border-white/25"
                : isActive
                ? "h-2 border-white/18"
                : "h-2"
            }`}
            style={trackTintStyle}
          >
            {/* Bipolar Active Fill Bar (0-lag 60fps drag) */}
            <div
              ref={fillRef}
              className={`absolute top-0 bottom-0 transition-colors duration-150 ${
                isDragging
                  ? "bg-gradient-to-r from-[#E2E4E9] via-white to-[#6EE7B7]"
                  : isActive
                  ? "bg-[#E2E4E9]/90"
                  : "bg-[#9CA3AF]/75"
              }`}
              style={{
                left: `${fillLeft}%`,
                width: `${fillWidth}%`,
                boxShadow: isDragging
                  ? "0 0 10px rgba(255, 255, 255, 0.45)"
                  : undefined,
              }}
            />
          </div>

          {/* Center / Default Optical Tick Mark */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-[1.5px] pointer-events-none z-10 transition-[height,background-color] duration-200 ${
              !isModified ? "h-3.5 bg-[#E2E4E9]/65" : "h-3 bg-white/30"
            }`}
            style={{ left: `calc(${defaultPct}% - 0.75px)` }}
          />

          {/* Liquid Glass Droplet Lens Thumb (Morphs via scale3d(1.45, 1.25, 1) on grab/drag with --spring-bouncy release) */}
          <div
            ref={thumbRef}
            className={`liquid-droplet-thumb absolute top-1/2 left-0 w-3.5 h-3.5 rounded-full pointer-events-none z-20 flex items-center justify-center ${
              isDragging
                ? "optical-refract-glass bg-white/[0.22] border border-white/95 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.95),inset_0_-1px_2px_rgba(255,255,255,0.35),0_6px_16px_rgba(0,0,0,0.68),0_0_0_4px_rgba(255,255,255,0.15)]"
                : isHovered
                ? "bg-[#F4F5F7] border border-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_0_12px_rgba(255,255,255,0.48)]"
                : "bg-[#E2E4E9] border border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.85),0_2px_5px_rgba(0,0,0,0.68)]"
            }`}
            style={{
              left: `${valPct}%`,
              transform: isDragging
                ? "translate3d(-50%, -50%, 0) scale3d(1.45, 1.25, 1)"
                : isHovered
                ? "translate3d(-50%, -50%, 0) scale3d(1.12, 1.12, 1)"
                : "translate3d(-50%, -50%, 0) scale3d(1, 1, 1)",
            }}
          >
            {/* Inner Optical Specular Core when morphed into Glass Droplet Lens */}
            <span
              className={`w-1.5 h-1 rounded-full transition-opacity duration-150 ${
                isDragging ? "opacity-95 bg-white/90" : "opacity-0"
              }`}
            />
          </div>

          {/* Native Range Input Overlay for Full Mouse/Touch Accessibility */}
          <input
            ref={inputRef}
            type="range"
            min={min}
            max={max}
            step={effectiveStep}
            defaultValue={value}
            onChange={handleSliderChange}
            onPointerDown={(e) => {
              startDrag();
              setShiftHeld(Boolean(e.shiftKey));
            }}
            onPointerMove={(e) => {
              if (draggingRef.current) setShiftHeld(Boolean(e.shiftKey));
            }}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onTouchStart={startDrag}
            onTouchEnd={endDrag}
            onTouchCancel={endDrag}
            onDoubleClick={handleReset}
            aria-label={label}
            className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30 m-0 touch-pan-y"
          />
        </div>

        {/* Value Readout (Tap-to-Edit) & Stepper + Fine Toggle */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFineMode((v) => !v);
            }}
            title={t("slider.fineStepTitle")}
            aria-label={t("slider.fineStepAria", { label })}
            aria-pressed={fineMode}
            className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
              fineMode
                ? "bg-[#6EE7B7]/15 text-[#6EE7B7] border-[#6EE7B7]/40"
                : "bg-[#0A0A0D]/38 text-[#9CA3AF]/70 hover:text-[#E2E4E9] border-white/[0.09] hover:border-white/20"
            }`}
          >
            <Crosshair className="w-3 h-3" />
          </button>

          <div
            onDoubleClick={(e) => e.stopPropagation()}
            className={`flex items-center bg-[#0A0A0D]/38 border rounded-md overflow-hidden shrink-0 transition-colors ${
              isFineActive
                ? "border-[#6EE7B7]/60"
                : isDragging
                ? "border-white/25"
                : "border-white/[0.09]"
            }`}
          >
            {isEditing ? (
              <input
                ref={editInputRef}
                type="number"
                step={effectiveStep}
                min={min}
                max={max}
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleEditKeyDown}
                aria-label={t("slider.editAria", { label })}
                className="w-14 text-right px-1.5 py-1 text-[11px] font-mono tabular-nums text-[#E2E4E9] bg-white/[0.08] outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={startEditing}
                title={t("slider.tapToEditTitle")}
                className="w-14 text-right px-1.5 py-1 text-[11px] font-mono tabular-nums text-[#E2E4E9] hover:bg-white/[0.06] cursor-text transition-colors"
              >
                <span ref={readoutRef}>{formatReadout(value)}</span>
              </button>
            )}
            <div className="flex flex-col border-l border-white/[0.08]">
              <button
                type="button"
                onClick={() => handleStep(effectiveStep)}
                className="px-1.5 py-1 hover:bg-white/10 active:scale-90 text-[#9CA3AF] hover:text-[#E2E4E9] transition-all cursor-pointer"
                title={t("slider.increase")}
                aria-label={`${t("slider.increase")} ${label}`}
              >
                <ChevronUp className="w-2.5 h-2.5" />
              </button>
              <button
                type="button"
                onClick={() => handleStep(-effectiveStep)}
                className="px-1.5 py-1 hover:bg-white/10 active:scale-90 text-[#9CA3AF] hover:text-[#E2E4E9] transition-all border-t border-white/[0.06] cursor-pointer"
                title={t("slider.decrease")}
                aria-label={`${t("slider.decrease")} ${label}`}
              >
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default ParameterSlider;
