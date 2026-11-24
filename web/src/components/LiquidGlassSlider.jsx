import React, { memo, useEffect, useRef, useState } from "react";

function triggerHaptic(ms = 8) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(ms);
    } catch {
      // Ignore blocked vibration contexts
    }
  }
}

const LiquidGlassSlider = memo(function LiquidGlassSlider({
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
  onChange,
  onDragChange,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [justReset, setJustReset] = useState(false);

  const trackRef = useRef(null);
  const fillRef = useRef(null);
  const edgeRef = useRef(null);
  const readoutRef = useRef(null);

  const draggingRef = useRef(false);
  const rafRef = useRef(0);
  const pendingValRef = useRef(null);
  const latestValRef = useRef(value);
  const pointerDownXRef = useRef(0);
  const pointerMovedRef = useRef(false);
  const lastTapTimeRef = useRef(0);
  const resetFlashTimerRef = useRef(0);

  const onChangeRef = useRef(onChange);
  const onDragChangeRef = useRef(onDragChange);

  useEffect(() => {
    onChangeRef.current = onChange;
    onDragChangeRef.current = onDragChange;
  }, [onChange, onDragChange]);

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
    if (edgeRef.current) {
      // Keep the subtle leading edge hairline cleanly inside the pill without clipping at 0% / 100%
      const clampedEdge = Math.max(1.5, Math.min(98.5, pct));
      edgeRef.current.style.left = `${clampedEdge}%`;
      edgeRef.current.style.opacity = width > 0.6 ? "1" : "0";
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

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (resetFlashTimerRef.current) clearTimeout(resetFlashTimerRef.current);
      if (draggingRef.current) {
        draggingRef.current = false;
        onDragChangeRef.current?.(false);
      }
    },
    []
  );

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

  const performReset = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    pendingValRef.current = null;
    latestValRef.current = defaultValue;
    syncDomVisuals(defaultValue);
    onChangeRef.current(paramKey, defaultValue);
    triggerHaptic(8);

    setJustReset(true);
    if (resetFlashTimerRef.current) clearTimeout(resetFlashTimerRef.current);
    resetFlashTimerRef.current = setTimeout(() => setJustReset(false), 360);
  };

  const registerTapForReset = () => {
    const now = performance.now();
    if (now - lastTapTimeRef.current <= 300) {
      lastTapTimeRef.current = 0;
      performReset();
      return true;
    }
    lastTapTimeRef.current = now;
    return false;
  };

  const computeValueFromClientX = (clientX) => {
    const track = trackRef.current;
    if (!track) return latestValRef.current;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return latestValRef.current;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    let raw = min + pct * range;
    raw = Math.round(raw / step) * step;
    raw = clampVal(Number(raw.toFixed(4)));

    // Gentle magnetic snap to center zero on bipolar axes
    if (isBipolar && Math.abs(raw - defaultValue) <= range * 0.022) {
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
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    pointerDownXRef.current = e.clientX;
    pointerMovedRef.current = false;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic pointer environments
    }

    if (!draggingRef.current) {
      draggingRef.current = true;
      setIsDragging(true);
      onDragChangeRef.current?.(true);
    }
    const nextVal = computeValueFromClientX(e.clientX);
    emitValue(nextVal);
  };

  const handleTrackPointerMove = (e) => {
    if (!draggingRef.current) return;
    if (Math.abs(e.clientX - pointerDownXRef.current) > 6) {
      pointerMovedRef.current = true;
    }
    const nextVal = computeValueFromClientX(e.clientX);
    emitValue(nextVal);
  };

  const handleTrackPointerUp = (e) => {
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore capture errors
    }

    const wasTap = !pointerMovedRef.current;
    if (draggingRef.current) {
      draggingRef.current = false;
      setIsDragging(false);
      flushPending();
      onDragChangeRef.current?.(false);
    }

    if (wasTap && e.pointerType !== "mouse") {
      registerTapForReset();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      emitValue(clampVal(Number((value + step).toFixed(4))));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      emitValue(clampVal(Number((value - step).toFixed(4))));
    } else if (e.key === "Home") {
      e.preventDefault();
      emitValue(min);
    } else if (e.key === "End") {
      e.preventDefault();
      emitValue(max);
    } else if (e.key === "0" || e.key === "Backspace") {
      e.preventDefault();
      performReset();
    }
  };

  const valPct = Math.max(0, Math.min(100, ((value - min) / range) * 100));
  const fillLeft = isBipolar ? Math.min(valPct, defaultPct) : 0;
  const fillWidth = isBipolar ? Math.abs(valPct - defaultPct) : valPct;
  const isModified = Math.abs(value - defaultValue) > (decimals === 0 ? 0.5 : 0.004);
  const clampedEdgePct = Math.max(1.5, Math.min(98.5, valPct));

  // Subtle calibrated functional axis tint strictly for white-balance axes (Temp & Tint)
  let fillBgStyle;
  if (paramKey === "temp") {
    fillBgStyle = {
      background:
        value < defaultValue
          ? "linear-gradient(90deg, rgba(147, 197, 253, 0.28), rgba(147, 197, 253, 0.14))"
          : "linear-gradient(90deg, rgba(251, 191, 36, 0.14), rgba(251, 191, 36, 0.28))",
    };
  } else if (paramKey === "tint") {
    fillBgStyle = {
      background:
        value < defaultValue
          ? "linear-gradient(90deg, rgba(134, 239, 172, 0.26), rgba(134, 239, 172, 0.12))"
          : "linear-gradient(90deg, rgba(232, 121, 249, 0.12), rgba(232, 121, 249, 0.26))",
    };
  }

  return (
    <div
      data-testid={`mobile-glass-slider-${paramKey}`}
      onDoubleClick={(e) => {
        e.stopPropagation();
        performReset();
      }}
      className="select-none"
    >
      {/* ToneBench Midnight-Slate & Sky-Cyan Enclosed Bipolar Pill Track (h-11 rounded-2xl) */}
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
        onKeyDown={handleKeyDown}
        style={{ touchAction: "none" }}
        className={`relative h-11 w-full rounded-2xl overflow-hidden cursor-ew-resize outline-none border transition-[background-color,border-color,box-shadow,transform] duration-150 focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
          justReset
            ? "bg-[#131C2B] border-[#38BDF8]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_0_16px_-3px_rgba(56,189,248,0.52)]"
            : isDragging
            ? "bg-[#131A26] border-[#38BDF8]/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_0_18px_-4px_rgba(56,189,248,0.44)] scale-[1.01]"
            : "bg-[#0E131D]/92 border-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.45)]"
        }`}
      >
        {/* Signature Sky-Cyan (#38BDF8) Translucent Gradient Fill Bar */}
        <div
          ref={fillRef}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 transition-opacity duration-150 ${
            isDragging
              ? "bg-gradient-to-r from-[#0284C7]/35 via-[#38BDF8]/36 to-[#7DD3FC]/32"
              : "bg-gradient-to-r from-[#0284C7]/22 via-[#38BDF8]/26 to-[#7DD3FC]/22"
          }`}
          style={{
            left: `${fillLeft}%`,
            width: `${fillWidth}%`,
            ...fillBgStyle,
          }}
        />

        {/* Center Zero Detent Hairline on Bipolar Axes */}
        {isBipolar && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-2.5 w-px bg-white/20"
            style={{ left: `${defaultPct}%` }}
          />
        )}

        {/* Crisp Luminous Sky-Cyan Leading-Edge Pill Marker (Never clips at 0% or 100%) */}
        <div
          ref={edgeRef}
          aria-hidden="true"
          className="pointer-events-none absolute top-2 bottom-2 w-[3px] -translate-x-1/2 rounded-full bg-[#7DD3FC] shadow-[0_0_10px_rgba(56,189,248,0.85)]"
          style={{
            left: `${clampedEdgePct}%`,
            opacity: fillWidth > 0.6 ? 1 : 0,
          }}
        />

        {/* In-Bar Content Overlay: Left Label + Glowing Cyan Dot + Right Tabular Value */}
        <div className="pointer-events-none relative z-10 h-full px-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`text-[13px] font-sans font-medium tracking-[-0.01em] truncate transition-colors ${
                isDragging || isModified ? "text-[#F8FAFC]" : "text-[#CBD5E1]"
              }`}
            >
              {label}
            </span>
            {isModified && (
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] shadow-[0_0_6px_rgba(56,189,248,0.85)] shrink-0"
              />
            )}
          </div>

          <span
            ref={readoutRef}
            className={`text-[12.5px] font-mono tabular-nums tracking-tight shrink-0 transition-colors ${
              justReset
                ? "text-[#7DD3FC] font-semibold"
                : isDragging || isModified
                ? "text-[#F8FAFC] font-medium"
                : "text-[#94A3B8]"
            }`}
          >
            {formatReadout(value)}
          </span>
        </div>
      </div>
    </div>
  );
});

export default LiquidGlassSlider;
