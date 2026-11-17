import React, { memo, useEffect, useRef, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

const WHEEL_SCALE = 0.42;
const SQRT3 = Math.sqrt(3);

function rgbToWheelXY(rgb) {
  const [r = 0.5, g = 0.5, b = 0.5] = rgb || [0.5, 0.5, 0.5];
  let x = (r - 0.5 * (g + b)) / (1.5 * WHEEL_SCALE);
  let y = -(g - b) / (SQRT3 * WHEEL_SCALE);
  const mag = Math.hypot(x, y);
  if (mag > 0.94) {
    x = (x / mag) * 0.94;
    y = (y / mag) * 0.94;
  }
  return { x, y };
}

function wheelXYToRgb(x, y) {
  const mag = Math.hypot(x, y);
  let nx = x;
  let ny = y;
  if (mag > 1) {
    nx = x / mag;
    ny = y / mag;
  }
  const nyUp = -ny;
  const r = Math.max(0, Math.min(1, 0.5 + WHEEL_SCALE * nx));
  const g = Math.max(
    0,
    Math.min(1, 0.5 + WHEEL_SCALE * (-0.5 * nx + (SQRT3 / 2) * nyUp))
  );
  const b = Math.max(
    0,
    Math.min(1, 0.5 + WHEEL_SCALE * (-0.5 * nx - (SQRT3 / 2) * nyUp))
  );
  return [
    Number(r.toFixed(4)),
    Number(g.toFixed(4)),
    Number(b.toFixed(4)),
  ];
}

const ColorWheel = memo(function ColorWheel({
  title,
  rgb = [0.5, 0.5, 0.5],
  onChange,
  onReset,
  onDragChange,
}) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const wheelRef = useRef(null);
  const draggingRef = useRef(false);
  const rafRef = useRef(0);
  const copyTimerRef = useRef(null);
  const pendingCoordsRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onDragChangeRef = useRef(onDragChange);
  onChangeRef.current = onChange;
  onDragChangeRef.current = onDragChange;

  const safeRgb =
    Array.isArray(rgb) && rgb.length >= 3 ? rgb : [0.5, 0.5, 0.5];

  const r255 = Math.round(Math.max(0, Math.min(1, safeRgb[0])) * 255);
  const g255 = Math.round(Math.max(0, Math.min(1, safeRgb[1])) * 255);
  const b255 = Math.round(Math.max(0, Math.min(1, safeRgb[2])) * 255);

  const hex = `#${[r255, g255, b255]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;

  const { x: puckX, y: puckY } = rgbToWheelXY(safeRgb);

  const updateFromPointer = (clientX, clientY) => {
    if (!wheelRef.current || typeof onChangeRef.current !== "function") return;
    const rect = wheelRef.current.getBoundingClientRect();
    const radius = rect.width / 2;
    if (radius <= 0) return;
    const dx = (clientX - (rect.left + radius)) / radius;
    const dy = (clientY - (rect.top + radius)) / radius;
    const nextRgb = wheelXYToRgb(dx, dy);
    onChangeRef.current(nextRgb);
  };

  const flushPending = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (pendingCoordsRef.current) {
      const { x, y } = pendingCoordsRef.current;
      pendingCoordsRef.current = null;
      updateFromPointer(x, y);
    }
  };

  const handlePointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    if (!draggingRef.current) {
      draggingRef.current = true;
      setIsDragging(true);
      onDragChangeRef.current?.(true);
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable
    }
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e) => {
    if (!draggingRef.current) return;
    pendingCoordsRef.current = { x: e.clientX, y: e.clientY };
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        if (pendingCoordsRef.current) {
          const { x, y } = pendingCoordsRef.current;
          pendingCoordsRef.current = null;
          updateFromPointer(x, y);
        }
      });
    }
  };

  const handlePointerUp = (e) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    flushPending();
    onDragChangeRef.current?.(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (draggingRef.current) {
        draggingRef.current = false;
        onDragChangeRef.current?.(false);
      }
    },
    []
  );

  const handleDoubleClick = () => {
    if (typeof onReset === "function") {
      onReset();
    } else if (typeof onChange === "function") {
      onChange([0.5, 0.5, 0.5]);
    }
  };

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText?.(hex)?.catch?.(() => {});
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    setCopied(true);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1200);
  };

  const isNeutral =
    Math.abs(safeRgb[0] - 0.5) < 0.004 &&
    Math.abs(safeRgb[1] - 0.5) < 0.004 &&
    Math.abs(safeRgb[2] - 0.5) < 0.004;

  return (
    <div className="relative flex flex-col items-center gap-1 px-1.5 py-2 rounded-2xl bg-white/[0.025] border border-white/[0.09] hover:border-white/[0.18] transition-[border-color] duration-150 select-none">
      <div className="w-full flex items-center justify-center gap-1 relative">
        <span className="text-[10px] font-medium text-[#9CA3AF] tracking-wide truncate max-w-full">
          {title}
        </span>
        {!isNeutral && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDoubleClick();
            }}
            title={t("wheel.resetTitle", { title })}
            aria-label={t("wheel.resetTitle", { title })}
            className="absolute right-0 p-0.5 rounded text-[#9CA3AF] hover:text-[#E2E4E9] hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-2.5 h-2.5" />
          </button>
        )}
      </div>

      <div
        ref={wheelRef}
        role="slider"
        aria-label={`${title} color wheel`}
        aria-valuetext={hex}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        title={t("wheel.wheelTooltip")}
        className="relative w-[72px] h-[72px] rounded-full border border-white/[0.18] cursor-crosshair touch-none overflow-visible shadow-inner"
        style={{
          background:
            "radial-gradient(circle at center, rgba(255,255,255,0.065) 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.45) 100%)",
          boxShadow:
            "inset 0 1px 2px rgba(0, 0, 0, 0.72), inset 0 -1px 0 rgba(255, 255, 255, 0.08)",
        }}
      >
        {/* Subtle radial color spectrum ring hint */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full opacity-30"
          style={{
            background:
              "conic-gradient(from 90deg, rgba(248,113,113,0.45), rgba(250,204,21,0.4), rgba(74,222,128,0.45), rgba(56,189,248,0.45), rgba(167,139,250,0.45), rgba(244,114,182,0.45), rgba(248,113,113,0.45))",
            WebkitMaskImage:
              "radial-gradient(circle, transparent 56%, black 72%, transparent 98%)",
            maskImage:
              "radial-gradient(circle, transparent 56%, black 72%, transparent 98%)",
          }}
        />
        {/* Subtle inner ring */}
        <div className="pointer-events-none absolute inset-[24%] rounded-full border border-white/[0.08]" />
        {/* Fine crosshair axes */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/[0.09]" />
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/[0.09]" />

        {/* Subtle radial tint indicator */}
        {!isNeutral && (
          <div
            className="pointer-events-none absolute inset-0 rounded-full opacity-25"
            style={{
              background: `radial-gradient(circle at ${50 + puckX * 44}% ${
                50 + puckY * 44
              }%, rgb(${r255}, ${g255}, ${b255}) 0%, transparent 65%)`,
            }}
          />
        )}

        {/* Draggable Puck -> Morphs via scale3d(1.55, 1.55, 1) into a Transparent Refractive Glass Loupe on Drag */}
        <div
          className={`pointer-events-none absolute w-4 h-4 rounded-full flex items-center justify-center z-20 ${
            isDragging
              ? "optical-refract-glass border-[1.5px] border-white/95 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.95),0_6px_18px_rgba(0,0,0,0.75),0_0_0_3.5px_rgba(255,255,255,0.16)]"
              : "border-2 border-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_1px_5px_rgba(0,0,0,0.85)]"
          }`}
          style={{
            left: `${50 + puckX * 40}%`,
            top: `${50 + puckY * 40}%`,
            backgroundColor: isDragging
              ? `rgba(${r255}, ${g255}, ${b255}, 0.34)`
              : hex,
            transform: isDragging
              ? "translate3d(-50%, -50%, 0) scale3d(1.55, 1.55, 1)"
              : "translate3d(-50%, -50%, 0) scale3d(1, 1, 1)",
            transition:
              "transform 420ms var(--spring-bouncy), box-shadow 240ms var(--spring-liquid), border-color 220ms var(--spring-liquid), background-color 180ms var(--spring-liquid)",
          }}
        >
          {/* Precision Loupe Center Dot */}
          <span
            className={`w-1.5 h-1.5 rounded-full border border-white/90 transition-opacity duration-150 ${
              isDragging ? "opacity-100" : "opacity-0"
            }`}
            style={{ backgroundColor: hex }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        title={t("wheel.clickCopyHex")}
        className="relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.05] hover:bg-white/[0.11] border border-white/[0.12] text-[10px] font-mono text-[#F4F5F7] transition-colors cursor-pointer"
      >
        {copied && (
          <span
            aria-hidden="true"
            className="frosted-soft-edge pointer-events-none absolute -inset-2 rounded-full bg-white/[0.12]"
          />
        )}
        <span
          className="w-2 h-2 rounded-full border border-white/25 shrink-0"
          style={{ backgroundColor: hex }}
        />
        {copied ? (
          <span className="liquid-droplet-badge relative z-10 inline-flex items-center gap-0.5 text-[#6EE7B7]">
            <Check className="w-2.5 h-2.5" />
            {t("wheel.copied", { hex })}
          </span>
        ) : (
          <span>{hex}</span>
        )}
      </button>
    </div>
  );
});

export default ColorWheel;
