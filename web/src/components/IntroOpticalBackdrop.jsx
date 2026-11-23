import React, { useEffect, useRef } from "react";
import { useMotionValueEvent } from "motion/react";

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

const DOT_SPACING = 22;

function createHalftonePattern(ctx, scaleAlpha) {
  if (typeof document === "undefined") return null;
  const tile = document.createElement("canvas");
  const size = DOT_SPACING * 2;
  tile.width = size;
  tile.height = size;
  const tctx = tile.getContext("2d");
  if (!tctx) return null;

  // Two-tone staggered optical halftone dot matrix (#4A6B86 & #AAB7C5 at 4%-7% opacity)
  const primaryAlpha = clamp(0.072 * scaleAlpha, 0.032, 0.085);
  const secondaryAlpha = clamp(0.044 * scaleAlpha, 0.022, 0.056);

  tctx.fillStyle = `rgba(74, 107, 134, ${primaryAlpha.toFixed(4)})`;
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const cx = col * DOT_SPACING + DOT_SPACING * 0.5;
      const cy = row * DOT_SPACING + DOT_SPACING * 0.5;
      tctx.beginPath();
      tctx.arc(cx, cy, 1.05, 0, Math.PI * 2);
      tctx.fill();
    }
  }

  // Offset secondary halftone dither dots for subtle film contact-sheet cadence
  tctx.fillStyle = `rgba(170, 183, 197, ${secondaryAlpha.toFixed(4)})`;
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const cx = (col * DOT_SPACING + DOT_SPACING) % size;
      const cy = (row * DOT_SPACING + DOT_SPACING) % size;
      tctx.beginPath();
      tctx.arc(cx, cy, 0.72, 0, Math.PI * 2);
      tctx.fill();
    }
  }

  return ctx.createPattern(tile, "repeat");
}

function createMicroGrainPattern(ctx) {
  if (typeof document === "undefined") return null;
  const tile = document.createElement("canvas");
  const size = 96;
  tile.width = size;
  tile.height = size;
  const tctx = tile.getContext("2d");
  if (!tctx) return null;

  const img = tctx.createImageData(size, size);
  const data = img.data;
  let seed = 0x6d2b79f5;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const n = nextRand();
      data[i] = 170;
      data[i + 1] = 183;
      data[i + 2] = 197;
      data[i + 3] = Math.round(n * 4);
    }
  }
  tctx.putImageData(img, 0, 0);
  return ctx.createPattern(tile, "repeat");
}

/**
 * Interactive Halftone / Dot-Matrix Optical Backdrop (Steel Night x Arctic Ink)
 * - Deep #0A0C10 base with calibrated 4%-8% halftone dot-matrix in #4A6B86 & #AAB7C5
 * - Pointer proximity (x, y) and scroll velocity smoothly modulate local halftone dot scale & contrast
 * - Zero neon blobs, zero floating AI particles, respects prefers-reduced-motion
 */
export default function IntroOpticalBackdrop({
  smoothProgress,
  scrollContainerRef,
  isExiting = false,
  intensity = 1,
}) {
  const canvasRef = useRef(null);
  const progressRef = useRef(0);
  const scrollVelocityRef = useRef(0);

  useMotionValueEvent(smoothProgress || { on: () => () => {} }, "change", (latest) => {
    const next = clamp(Number(latest) || 0, 0, 1);
    const delta = next - progressRef.current;
    progressRef.current = next;
    scrollVelocityRef.current = clamp(
      scrollVelocityRef.current * 0.62 + delta * 135,
      -1,
      1
    );
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionMedia.matches;
    let isVisible = !document.hidden;
    let rafId = 0;

    let width = Math.max(window.innerWidth, 1);
    let height = Math.max(window.innerHeight, 1);
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let ctx = canvas.getContext("2d");
    const scaleAlpha = clamp(intensity, 0.45, 1);
    let halftonePattern = ctx ? createHalftonePattern(ctx, scaleAlpha) : null;
    let grainPattern = ctx ? createMicroGrainPattern(ctx) : null;

    let targetX = width * 0.5;
    let targetY = height * 0.42;
    let mx = targetX;
    let my = targetY;
    let vx = 0;
    let vy = 0;
    let pointerActive = false;
    let pointerPresence = 0.28;
    let dampedVel = 0;
    let scrollOffsetY = 0;
    let lastScrollTop = 0;

    const syncSize = () => {
      width = Math.max(window.innerWidth, 1);
      height = Math.max(window.innerHeight, 1);
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const pw = Math.round(width * dpr);
      const ph = Math.round(height * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (!halftonePattern) halftonePattern = createHalftonePattern(ctx, scaleAlpha);
        if (!grainPattern) grainPattern = createMicroGrainPattern(ctx);
      }
    };

    const drawCrosshair = (cx, cy, arm, alpha) => {
      const rx = Math.round(cx) + 0.5;
      const ry = Math.round(cy) + 0.5;
      ctx.strokeStyle = `rgba(170, 183, 197, ${alpha.toFixed(4)})`;
      ctx.beginPath();
      ctx.moveTo(rx - arm, ry);
      ctx.lineTo(rx + arm, ry);
      ctx.moveTo(rx, ry - arm);
      ctx.lineTo(rx, ry + arm);
      ctx.stroke();
    };

    const render = () => {
      if (!ctx) return;
      const scrollP = progressRef.current;

      // Spring-damped spotlight tracking for crisp, tactile cursor response
      vx = (vx + (targetX - mx) * 0.14) * 0.72;
      vy = (vy + (targetY - my) * 0.14) * 0.72;
      mx += vx;
      my += vy;

      const targetPresence = pointerActive ? 1 : 0.24;
      pointerPresence += (targetPresence - pointerPresence) * 0.085;

      scrollVelocityRef.current *= 0.89;
      dampedVel += (scrollVelocityRef.current - dampedVel) * 0.12;
      const velAbs = Math.min(1, Math.abs(dampedVel));
      const phaseY = reducedMotion ? 0 : (scrollOffsetY * 0.12 + dampedVel * 14) % (DOT_SPACING * 2);

      // 1. Calibrated Steel Night deep canvas base (#0A0C10)
      ctx.fillStyle = "#0A0C10";
      ctx.fillRect(0, 0, width, height);

      // 2. Subtle top architectural depth gradient (#11161F -> #0A0C10)
      const topWash = ctx.createLinearGradient(0, 0, 0, Math.min(540, height * 0.65));
      topWash.addColorStop(0, `rgba(17, 22, 31, ${(0.55 * scaleAlpha).toFixed(4)})`);
      topWash.addColorStop(1, "rgba(10, 12, 16, 0)");
      ctx.fillStyle = topWash;
      ctx.fillRect(0, 0, width, Math.min(540, height * 0.65));

      // 3. Base calibrated halftone dot-matrix field (4%-7% opacity)
      if (halftonePattern) {
        ctx.save();
        ctx.translate(0, -phaseY);
        ctx.fillStyle = halftonePattern;
        ctx.fillRect(0, phaseY - DOT_SPACING * 2, width, height + DOT_SPACING * 4);
        ctx.restore();
      }

      // 4. Spring-damped ~260px halftone cursor spotlight (dots scale 1x -> 2.1x, Arctic Ink #C9D7E2 / Steel Blue #7FA3C2)
      if (!reducedMotion && pointerPresence > 0.02) {
        const radius = 264 + velAbs * 44;
        const rSq = radius * radius;
        const baseDotR = 1.05;
        const startX = Math.floor((mx - radius) / DOT_SPACING) * DOT_SPACING + DOT_SPACING * 0.5;
        const endX = mx + radius;
        const baseYShift = -phaseY;
        const startY =
          Math.floor((my - radius - baseYShift) / DOT_SPACING) * DOT_SPACING +
          DOT_SPACING * 0.5 +
          baseYShift;
        const endY = my + radius;

        for (let y = startY; y <= endY; y += DOT_SPACING) {
          if (y < -6 || y > height + 6) continue;
          const dy = y - my;
          const dySq = dy * dy;
          for (let x = startX; x <= endX; x += DOT_SPACING) {
            if (x < -6 || x > width + 6) continue;
            const dx = x - mx;
            const distSq = dx * dx + dySq;
            if (distSq >= rSq) continue;
            const falloff = 1 - Math.sqrt(distSq) / radius;
            const smooth = falloff * falloff * (3 - 2 * falloff);
            const scaleBoost = 1 + smooth * (1.12 * pointerPresence + velAbs * 0.22);
            const dotR = baseDotR * scaleBoost;
            const alpha = clamp(
              (0.065 + smooth * (0.36 * pointerPresence + velAbs * 0.06)) * scaleAlpha,
              0.02,
              0.44
            );
            // Smooth tonal transition from Steel Blue (#7FA3C2) outer ring to Arctic Ink (#C9D7E2) core
            const tCore = clamp((smooth - 0.25) / 0.75, 0, 1);
            const rCol = Math.round(127 + (201 - 127) * tCore);
            const gCol = Math.round(163 + (215 - 163) * tCore);
            const bCol = Math.round(194 + (226 - 194) * tCore);
            ctx.fillStyle = `rgba(${rCol}, ${gCol}, ${bCol}, ${alpha.toFixed(4)})`;
            ctx.beginPath();
            ctx.arc(x, y, dotR, 0, Math.PI * 2);
            ctx.fill();

            // Subtle secondary offset halftone dot response inside core radius
            if (smooth > 0.22) {
              const ox = x + DOT_SPACING * 0.5;
              const oy = y + DOT_SPACING * 0.5;
              if (ox >= -4 && ox <= width + 4 && oy >= -4 && oy <= height + 4) {
                const subR = 0.72 * (1 + smooth * 0.85 * pointerPresence);
                const subAlpha = clamp(alpha * 0.42, 0.015, 0.2);
                ctx.fillStyle = `rgba(127, 163, 194, ${subAlpha.toFixed(4)})`;
                ctx.beginPath();
                ctx.arc(ox, oy, subR, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        }
      }

      // 5. Restrained peripheral optical registration crosshairs
      ctx.save();
      ctx.lineWidth = 1;
      const marginX = width < 640 ? 24 : 44;
      const marginY = width < 640 ? 24 : 44;
      const driftY = reducedMotion ? 0 : (scrollP - 0.5) * 18;
      const xCols = [marginX, width - marginX];
      const yRows = [
        marginY,
        clamp(height * 0.5 + driftY, marginY + 36, height - marginY - 36),
        height - marginY,
      ];
      for (let yi = 0; yi < yRows.length; yi += 1) {
        for (let xi = 0; xi < xCols.length; xi += 1) {
          drawCrosshair(xCols[xi], yRows[yi], 4, 0.07 * scaleAlpha);
        }
      }
      ctx.restore();

      // 6. Subtle anti-banding micro grain
      if (grainPattern) {
        ctx.save();
        ctx.fillStyle = grainPattern;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    };

    const tick = () => {
      render();
      if (!reducedMotion && isVisible) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        rafId = 0;
      }
    };

    const startLoop = () => {
      if (!isVisible) return;
      if (reducedMotion) {
        render();
        return;
      }
      if (!rafId) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const stopLoop = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const handlePointerMove = (e) => {
      targetX = e.clientX;
      targetY = e.clientY;
      pointerActive = true;
    };

    const handlePointerLeave = () => {
      pointerActive = false;
    };

    const handleContainerScroll = () => {
      const el = scrollContainerRef?.current;
      const currentTop = el ? el.scrollTop : window.scrollY || 0;
      scrollOffsetY = currentTop;
      const maxScroll = el
        ? Math.max(1, el.scrollHeight - el.clientHeight)
        : Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const delta = currentTop - lastScrollTop;
      lastScrollTop = currentTop;
      if (!smoothProgress) {
        progressRef.current = clamp(currentTop / maxScroll, 0, 1);
        scrollVelocityRef.current = clamp(
          scrollVelocityRef.current * 0.65 + delta * 0.008,
          -1,
          1
        );
      }
    };

    const handleResize = () => {
      syncSize();
      render();
    };

    const handleVisibility = () => {
      isVisible = !document.hidden;
      if (isVisible) startLoop();
      else stopLoop();
    };

    const handleMotionChange = () => {
      reducedMotion = motionMedia.matches;
      if (reducedMotion) {
        stopLoop();
        render();
      } else {
        startLoop();
      }
    };

    syncSize();
    startLoop();

    const scrollEl = scrollContainerRef?.current;
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    window.addEventListener("resize", handleResize);
    if (scrollEl) {
      scrollEl.addEventListener("scroll", handleContainerScroll, { passive: true });
    } else {
      window.addEventListener("scroll", handleContainerScroll, { passive: true });
    }
    document.addEventListener("visibilitychange", handleVisibility);
    motionMedia.addEventListener?.("change", handleMotionChange);

    return () => {
      stopLoop();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("resize", handleResize);
      if (scrollEl) {
        scrollEl.removeEventListener("scroll", handleContainerScroll);
      } else {
        window.removeEventListener("scroll", handleContainerScroll);
      }
      document.removeEventListener("visibilitychange", handleVisibility);
      motionMedia.removeEventListener?.("change", handleMotionChange);
    };
  }, [intensity, scrollContainerRef, smoothProgress]);

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 pointer-events-none z-0 overflow-hidden ${
        isExiting ? "intro-exit-bg" : ""
      }`}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
