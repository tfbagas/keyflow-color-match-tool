import React, { memo, useEffect, useRef, useState } from "react";
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
  decimals = 2,
  showPlusSign = null,
  colorDot = null,
  onChange,
  onDragChange,
  compact = true,
  accentEmerald = false,
}) {
  const { t } = useLanguage();
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");

  const trackRef = useRef(null);
  const fillRef = useRef(null);
  const thumbRef = useRef(null);
  const readoutRef = useRef(null);
  const editInputRef = useRef(null);

  const draggingRef = useRef(false);
  const rafRef = useRef(0);
  const pendingValRef = useRef(null);
  const latestValRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onDragChangeRef = useRef(onDragChange);
  onChangeRef.current = onChange;
  onDragChangeRef.current = onDragChange;

  const range = max - min || 1;
  const defaultPct = Math.max(0, Math.min(100, ((defaultValue - min) / range) * 100));
  const usePlus = showPlusSign !== null ? showPlusSign : min < 0;

  const clampVal = (v) => Math.max(min, Math.min(max, v));

  const formatReadout = (v) => {
    const safe = Number.isFinite(v) ? v : defaultValue;
    const fixed = decimals === 0 ? String(Math.round(safe)) : safe.toFixed(decimals);
    const cleaned = Number(fixed) === 0 ? (decimals === 0 ? "0" : (0).toFixed(decimals)) : fixed;
    return Number(cleaned) > 0 && usePlus
      ? `+${cleaned}${valueSuffix}`
      : `${cleaned}${valueSuffix}`;
  };

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
    latestValRef.current = value;
    if (!draggingRef.current) {
      syncDomVisuals(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, min, max, defaultValue, isBipolar, valueSuffix, decimals]);

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

  const computeValueFromClientX = (clientX, shiftKey) => {
    const track = trackRef.current;
    if (!track) return latestValRef.current;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return latestValRef.current;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const effStep = shiftKey ? Math.min(step, decimals === 0 ? 1 : 0.01) : step;
    let raw = min + pct * range;
    raw = Math.round(raw / effStep) * effStep;
    raw = clampVal(Number(raw.toFixed(4)));

    // Subtle magnetic snap to center/default on bipolar controls
    if (isBipolar && !shiftKey && Math.abs(raw - defaultValue) <= range * 0.018) {
      raw = defaultValue;
    }
    return raw;
  };

  const emitValue = (nextVal) => {
    latestValRef.current = nextVal;
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

  const handleTrackPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if capture unavailable
    }
    if (!draggingRef.current) {
      draggingRef.current = true;
      setIsDragging(true);
      onDragChangeRef.current?.(true);
    }
    const nextVal = computeValueFromClientX(e.clientX, e.shiftKey);
    emitValue(nextVal);
  };

  const handleTrackPointerMove = (e) => {
    if (!draggingRef.current) return;
    const nextVal = computeValueFromClientX(e.clientX, e.shiftKey);
    emitValue(nextVal);
  };

  const handleTrackPointerUp = (e) => {
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    endDrag();
  };

  const handleKeyDown = (e) => {
    const effStep = e.shiftKey ? Math.min(step, decimals === 0 ? 1 : 0.01) : step;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      emitValue(clampVal(Number((value + effStep).toFixed(4))));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      emitValue(clampVal(Number((value - effStep).toFixed(4))));
    } else if (e.key === "Home") {
      e.preventDefault();
      emitValue(min);
    } else if (e.key === "End") {
      e.preventDefault();
      emitValue(max);
    } else if (e.key === "0" || e.key === "Backspace") {
      e.preventDefault();
      onChangeRef.current(paramKey, defaultValue);
    }
  };

  const handleReset = (e) => {
    e?.stopPropagation?.();
    onChangeRef.current(paramKey, defaultValue);
  };

  const startEditing = (e) => {
    e.stopPropagation();
    setEditDraft(decimals === 0 ? String(Math.round(value)) : Number(value).toFixed(decimals));
    setIsEditing(true);
    requestAnimationFrame(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    });
  };

  const commitEdit = () => {
    setIsEditing(false);
    const normalized = String(editDraft).replace(/,/g, ".").replace(/%/g, "").trim();
    const parsed = parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      const clamped = clampVal(decimals === 0 ? Math.round(parsed) : Number(parsed.toFixed(2)));
      onChangeRef.current(paramKey, clamped);
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

  const valPct = Math.max(0, Math.min(100, ((value - min) / range) * 100));
  const fillLeft = isBipolar ? Math.min(valPct, defaultPct) : 0;
  const fillWidth = isBipolar ? Math.abs(valPct - defaultPct) : valPct;
  const isModified = Math.abs(value - defaultValue) > (decimals === 0 ? 0.5 : 0.004);

  // Subtle calibrated track tint only for white balance axes (Temp / Tint)
  let trackBgStyle = undefined;
  if (paramKey === "temp") {
    trackBgStyle = {
      background:
        "linear-gradient(90deg, rgba(96, 165, 250, 0.32) 0%, rgba(255, 255, 255, 0.09) 50%, rgba(251, 191, 36, 0.32) 100%)",
    };
  } else if (paramKey === "tint") {
    trackBgStyle = {
      background:
        "linear-gradient(90deg, rgba(74, 222, 128, 0.28) 0%, rgba(255, 255, 255, 0.09) 50%, rgba(232, 121, 249, 0.30) 100%)",
    };
  }

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`select-none group ${compact ? "py-1" : "py-1.5"}`}
    >
      {/* Label & Tabular Numeric Readout */}
      <div className="flex items-center justify-between gap-1.5 mb-1">
        <button
          type="button"
          onDoubleClick={handleReset}
          title={t("slider.doubleClickReset")}
          className="flex items-center gap-1.5 min-w-0 text-left cursor-pointer focus:outline-none"
        >
          {colorDot && (
            <span
              className="w-2 h-2 rounded-full shrink-0 border border-white/20"
              style={{ backgroundColor: colorDot }}
            />
          )}
          <span
            className={`text-[11px] font-medium tracking-[-0.01em] truncate transition-colors ${
              isDragging || isModified
                ? "text-[#F4F7FB]"
                : "text-[#AAB7C5] group-hover:text-[#F4F7FB]"
            }`}
          >
            {label}
          </span>
          {isModified && (
            <span
              aria-hidden="true"
              title={t("slider.modifiedTooltip", { val: defaultValue.toFixed(decimals) })}
              className="w-1.5 h-1.5 rounded-full bg-[#93B8D8] shrink-0"
            />
          )}
        </button>

        {isEditing ? (
          <input
            ref={editInputRef}
            type="text"
            inputMode="decimal"
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleEditKeyDown}
            aria-label={t("slider.editAria", { label })}
            className="w-14 text-right px-1 py-0 text-[11px] font-mono tabular-nums text-[#F4F7FB] bg-[#0A0C10] border border-[#7FA3C2]/65 rounded outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            onDoubleClick={handleReset}
            title="Click to type exact value · Double-click to reset"
            className={`text-[11px] font-mono tabular-nums tracking-tight px-1 -mr-1 rounded transition-colors cursor-text ${
              isDragging
                ? "text-[#F4F7FB] bg-[#1C2430]"
                : isModified
                ? "text-[#F4F7FB] hover:bg-[#1C2430]"
                : "text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430]/75"
            }`}
          >
            <span ref={readoutRef}>{formatReadout(value)}</span>
          </button>
        )}
      </div>

      {/* Custom Precision 2px Hairline Scrubber Track */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={formatReadout(value)}
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handleTrackPointerMove}
        onPointerUp={handleTrackPointerUp}
        onPointerCancel={handleTrackPointerUp}
        onDoubleClick={handleReset}
        onKeyDown={handleKeyDown}
        style={{ touchAction: "none" }}
        className="relative h-4 flex items-center cursor-ew-resize outline-none focus-visible:ring-1 focus-visible:ring-[#7FA3C2] rounded"
      >
        {/* 2px Neutral Track */}
        <div
          className="relative w-full h-[2px] rounded-full bg-[#AAB7C5]/20 overflow-hidden"
          style={trackBgStyle}
        >
          {/* Active Hairline Fill (0ms instant during drag) */}
          <div
            ref={fillRef}
            className={`absolute top-0 bottom-0 ${
              accentEmerald
                ? isDragging
                  ? "transition-none bg-[#93B8D8]"
                  : "transition-colors duration-100 bg-[#7FA3C2]"
                : isDragging
                ? "transition-none bg-[#F4F7FB]"
                : isHovered
                ? "transition-colors duration-100 bg-[#C9D7E2]"
                : "transition-colors duration-100 bg-[#7FA3C2]"
            }`}
            style={{
              left: `${fillLeft}%`,
              width: `${fillWidth}%`,
            }}
          />
        </div>

        {/* Center-Zero Tick Mark for Bipolar Controls */}
        {isBipolar && (
          <div
            aria-hidden="true"
            className={`absolute top-1/2 -translate-y-1/2 w-px pointer-events-none transition-colors ${
              !isModified ? "h-2 bg-[#AAB7C5]/40" : "h-2 bg-[#AAB7C5]/25"
            }`}
            style={{ left: `${defaultPct}%` }}
          />
        )}

        {/* Crisp Circular Thumb (0ms instant during pointer drag) */}
        <div
          ref={thumbRef}
          aria-hidden="true"
          className={`absolute top-1/2 rounded-full pointer-events-none ${
            accentEmerald
              ? isDragging
                ? "w-3 h-3 transition-none bg-[#F4F7FB] border-2 border-[#93B8D8] ring-4 ring-[#4A6B86]/35"
                : isHovered || isModified
                ? "w-3 h-3 transition-[box-shadow,background-color] duration-100 bg-[#F4F7FB] border-2 border-[#7FA3C2]"
                : "w-3 h-3 transition-[box-shadow,background-color] duration-100 bg-[#C9D7E2] border-2 border-[#7FA3C2]/80"
              : isDragging
              ? "w-2.5 h-2.5 transition-none bg-[#F4F7FB] ring-4 ring-[#7FA3C2]/25"
              : isHovered
              ? "w-2.5 h-2.5 transition-[box-shadow,background-color] duration-100 bg-[#F4F7FB] ring-4 ring-[#4A6B86]/25"
              : isModified
              ? "w-2.5 h-2.5 transition-[box-shadow,background-color] duration-100 bg-[#F4F7FB]"
              : "w-2.5 h-2.5 transition-[box-shadow,background-color] duration-100 bg-[#C9D7E2]"
          }`}
          style={{
            left: `${valPct}%`,
            transform: isDragging
              ? "translate(-50%, -50%) scale(1.12)"
              : "translate(-50%, -50%)",
          }}
        />
      </div>
    </div>
  );
});

export default ParameterSlider;
