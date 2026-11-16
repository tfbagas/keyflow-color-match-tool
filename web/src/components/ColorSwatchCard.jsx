import React, { memo, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

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

const ColorSwatchCard = memo(function ColorSwatchCard({
  title,
  rgb = [0.5, 0.5, 0.5],
  onChange,
  onReset,
  onDragChange,
}) {
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
    <div className="flex flex-col items-center gap-1 px-1.5 py-1.5 rounded-xl bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.16] transition-[border-color] duration-150 select-none">
      <span className="text-[10px] font-medium text-[#9CA3AF] tracking-wide truncate max-w-full">
        {title}
      </span>

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
        title="Drag to adjust tint. Double-click to reset to neutral (#808080)."
        className="relative w-[68px] h-[68px] rounded-full border border-white/[0.16] cursor-crosshair touch-none overflow-hidden shadow-inner"
        style={{
          background:
            "radial-gradient(circle at center, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.38) 100%)",
        }}
      >
        {/* Subtle inner ring */}
        <div className="pointer-events-none absolute inset-[24%] rounded-full border border-white/[0.07]" />
        {/* Fine crosshair axes */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/[0.09]" />
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/[0.09]" />

        {/* Subtle radial tint indicator */}
        {!isNeutral && (
          <div
            className="pointer-events-none absolute inset-0 rounded-full opacity-20"
            style={{
              background: `radial-gradient(circle at ${50 + puckX * 44}% ${
                50 + puckY * 44
              }%, rgb(${r255}, ${g255}, ${b255}) 0%, transparent 65%)`,
            }}
          />
        )}

        {/* Draggable Puck */}
        <div
          className="pointer-events-none absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.85)] transition-transform duration-100"
          style={{
            left: `${50 + puckX * 40}%`,
            top: `${50 + puckY * 40}%`,
            backgroundColor: hex,
            transform: `translate(-50%, -50%) ${
              isDragging ? "scale(1.2)" : "scale(1)"
            }`,
          }}
        />
      </div>

      <button
        type="button"
        onClick={handleCopy}
        title="Click to copy HEX"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-[10px] font-mono text-[#F4F5F7] transition-colors cursor-pointer"
      >
        <span
          className="w-2 h-2 rounded-full border border-white/25 shrink-0"
          style={{ backgroundColor: hex }}
        />
        {copied ? (
          <span className="inline-flex items-center gap-0.5 text-[#6EE7B7]">
            <Check className="w-2.5 h-2.5" />
            Copied
          </span>
        ) : (
          <span>{hex}</span>
        )}
      </button>
    </div>
  );
});

export default ColorSwatchCard;
