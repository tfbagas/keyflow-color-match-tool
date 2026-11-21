import React, { useEffect, useRef } from "react";

// Exact cubic-bezier(0.16, 1, 0.3, 1) cinema deceleration solver (matches CSS choreography)
function sampleBezierX(u) {
  const inv = 1 - u;
  return 3 * inv * inv * u * 0.16 + 3 * inv * u * u * 0.3 + u * u * u;
}

function sampleBezierXDerivative(u) {
  const inv = 1 - u;
  return (
    3 * inv * inv * 0.16 +
    6 * inv * u * (0.3 - 0.16) +
    3 * u * u * (1 - 0.3)
  );
}

function sampleBezierY(u) {
  const inv = 1 - u;
  return 1 - inv * inv * inv;
}

function easeCinemaDecel(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let u = t;
  for (let i = 0; i < 6; i += 1) {
    const err = sampleBezierX(u) - t;
    if (Math.abs(err) < 1e-5) break;
    const d = sampleBezierXDerivative(u);
    if (Math.abs(d) < 1e-6) break;
    u -= err / d;
    if (u < 0) u = 0;
    else if (u > 1) u = 1;
  }
  return sampleBezierY(u);
}

// Unhurried, balanced oscilloscope horizontal sweep curve across R -> G -> B lanes
function easeOscilloscopeSweep(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.pow(t, 0.88));
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0, edge1, x) {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Smooth C1 soft-knee compression near 0 IRE and 100 IRE (max ~96 IRE, min ~1.5 IRE)
// so phosphor columns never pile up into a flat clipped horizontal bar
function softKneeIre(ire) {
  const highKnee = 78;
  const highLimit = 96;
  const highSpan = highLimit - highKnee;

  const lowKnee = 8;
  const lowLimit = 1.5;
  const lowSpan = lowKnee - lowLimit;

  if (ire > highKnee) {
    return highKnee + highSpan * Math.tanh((ire - highKnee) / highSpan);
  }
  if (ire < lowKnee) {
    return lowKnee - lowSpan * Math.tanh((lowKnee - ire) / lowSpan);
  }
  return ire;
}

// Calibrated cinema phosphor channel specs matching ProScopes.jsx
const PARADE_CHANNELS = [
  {
    id: "R",
    // Red #F43F5E -> (244, 63, 94)
    r: 244,
    g: 63,
    b: 94,
    stepR: 112,
    stepG: 29,
    stepB: 43,
    shadowOffset: -2.0,
    midOffset: 4.5,
    highOffset: 6.2,
    phaseOffset: 0.0,
    driftSpeed: 0.24,
  },
  {
    id: "G",
    // Emerald #34D399 -> (52, 211, 153)
    r: 52,
    g: 211,
    b: 153,
    stepR: 24,
    stepG: 98,
    stepB: 71,
    shadowOffset: 0.6,
    midOffset: 1.4,
    highOffset: 1.8,
    phaseOffset: 0.42,
    driftSpeed: 0.21,
  },
  {
    id: "B",
    // Sky-Blue #38BDF8 -> (56, 189, 248)
    r: 56,
    g: 189,
    b: 248,
    stepR: 26,
    stepG: 87,
    stepB: 114,
    shadowOffset: 4.4,
    midOffset: -1.8,
    highOffset: -4.6,
    phaseOffset: 0.88,
    driftSpeed: 0.26,
  },
];

// Deterministic Gaussian-like noise lookup table so phosphor columns look like
// genuine sampled cinema pixels without random frame-to-frame strobing
const NOISE_TABLE_SIZE = 4096;
const NOISE_GAUSS = new Float32Array(NOISE_TABLE_SIZE);
const NOISE_UNIF = new Float32Array(NOISE_TABLE_SIZE);
(() => {
  let seed = 0x9e3779b9;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < NOISE_TABLE_SIZE; i += 1) {
    const u = next();
    NOISE_UNIF[i] = u;
    // Approximate unit-variance Gaussian via Irwin-Hall (sum of 3 uniforms - 1.5)
    NOISE_GAUSS[i] = (next() + next() + next() - 1.5) * 0.92;
  }
})();

// Broadcast Rec.709 75% color target angles (degrees) for subtle vectorscope reticle ticks
const REC709_TARGET_ANGLES_DEG = [103.5, 60.8, 347.1, 283.5, 240.8, 167.1];
const SKIN_ILINE_RAD = (123 * Math.PI) / 180;

// IRE horizon layout (lower-to-mid viewport framing the hero cleanly)
const IRE_100_FRAC = 0.24;
const IRE_0_FRAC = 0.90;
const IRE_MARKS = [
  { label: "100", ire: 100, major: true },
  { label: "75", ire: 75, major: false },
  { label: "50", ire: 50, major: true },
  { label: "25", ire: 25, major: false },
  { label: "0", ire: 0, major: true },
];

// Unhurried 3.2s cinema calibration & oscilloscope sweep timings
const GRATICULE_START_MS = 280;
const GRATICULE_LOCK_MS = 750;
const SWEEP_START_MS = 450;
const SWEEP_DURATION_MS = 1500; // 450ms -> 1950ms left-to-right oscilloscope beam sweep
const REDUCED_MOTION_SETTLED_MS = 3500;

/**
 * Full-viewport authentic phosphor-style Pro Scopes canvas for the Intro Screen:
 *  - Crisp 100 / 75 / 50 / 25 / 0 IRE graticules + 3-lane RGB Parade dividers
 *  - Faint centered 380px Vectorscope circular reticle with crosshairs & Rec.709 I-Line tick
 *  - Uncluttered offscreen additive ImageData phosphor RGB Parade (#F43F5E / #34D399 / #38BDF8)
 *  - Deliberate 1500ms (450ms -> 1950ms) left-to-right oscilloscope beam sweep illuminating RGB Parade columns
 *  - Cursor-reactive Gaussian signal probe + synchronized optical CSS custom properties
 */
export default function IntroProScopesCanvas({
  stageRef,
  calibBezelRef,
  emblemBezelRef,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const hoverMedia = window.matchMedia("(hover: none)");
    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");

    let isTouchOnly = hoverMedia.matches;
    let reducedMotion = motionMedia.matches;
    let isVisible = !document.hidden;
    let rafId = null;

    let width = Math.max(window.innerWidth, 1);
    let height = Math.max(window.innerHeight, 1);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let ctx = canvas.getContext("2d");

    // Offscreen additive phosphor accumulation buffer (mirrors ProScopes.jsx)
    const offscreenCanvas = document.createElement("canvas");
    let offCtx = null;
    let imgBuf = null;
    let buf32 = null;
    let bufW = 1;
    let bufH = 1;

    // Pointer tracking state (single unified rAF loop for canvas + optical CSS vars)
    let pointerInside = false;
    let targetX = width * 0.5;
    let targetY = height * 0.44;
    let mx = targetX;
    let my = targetY;
    let presence = 0;

    // Deterministic boot timestamp on every mount (initial load + Replay Intro)
    const mountTime = performance.now();
    let lastTimestamp = 0;

    const syncCanvasSize = () => {
      width = Math.max(window.innerWidth, 1);
      height = Math.max(window.innerHeight, 1);
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      const pixelW = Math.round(width * dpr);
      const pixelH = Math.round(height * dpr);
      if (canvas.width !== pixelW || canvas.height !== pixelH) {
        canvas.width = pixelW;
        canvas.height = pixelH;
      }
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      // Half-resolution crisp phosphor grid (capped for steady 60fps on 4K/5K displays)
      const nextBufW = Math.max(240, Math.min(Math.round(width * 0.5), 920));
      const nextBufH = Math.max(160, Math.min(Math.round(height * 0.5), 520));
      if (nextBufW !== bufW || nextBufH !== bufH || !imgBuf) {
        bufW = nextBufW;
        bufH = nextBufH;
        offscreenCanvas.width = bufW;
        offscreenCanvas.height = bufH;
        offCtx = offscreenCanvas.getContext("2d");
        if (offCtx) {
          imgBuf = offCtx.createImageData(bufW, bufH);
          buf32 = new Uint32Array(imgBuf.data.buffer);
        }
      }
    };

    const syncOpticalDomVars = () => {
      const stage = stageRef?.current;
      if (!stage) return;

      const sweepPct = clamp((mx / Math.max(width, 1)) * 100, 0, 100);
      stage.style.setProperty("--mx", `${mx.toFixed(1)}px`);
      stage.style.setProperty("--my", `${my.toFixed(1)}px`);
      stage.style.setProperty("--sweep-pct", `${sweepPct.toFixed(2)}%`);
      stage.style.setProperty("--cursor-presence", presence.toFixed(3));

      const calibEl = calibBezelRef?.current;
      if (calibEl) {
        const rect = calibEl.getBoundingClientRect();
        calibEl.style.setProperty("--local-mx", `${(mx - rect.left).toFixed(1)}px`);
        calibEl.style.setProperty("--local-my", `${(my - rect.top).toFixed(1)}px`);
      }

      const emblemEl = emblemBezelRef?.current;
      if (emblemEl) {
        const rect = emblemEl.getBoundingClientRect();
        emblemEl.style.setProperty("--local-mx", `${(mx - rect.left).toFixed(1)}px`);
        emblemEl.style.setProperty("--local-my", `${(my - rect.top).toFixed(1)}px`);
      }
    };

    const drawIreGraticules = (
      context,
      plotLeft,
      plotRight,
      y100,
      y0,
      colW,
      gap,
      alpha,
      channelAlphas
    ) => {
      if (alpha <= 0.002) return;
      const bandH = y0 - y100;
      const plotSpan = Math.max(1, plotRight - plotLeft);
      const featherFrac = Math.min(0.16, 120 / plotSpan);

      context.save();
      context.lineWidth = 1;

      // Full-bleed horizontal graticule gradients that dissolve smoothly over 120px at both viewport edges
      const majorGrad = context.createLinearGradient(plotLeft, 0, plotRight, 0);
      majorGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
      majorGrad.addColorStop(featherFrac, `rgba(255, 255, 255, ${(0.058 * alpha).toFixed(4)})`);
      majorGrad.addColorStop(1 - featherFrac, `rgba(255, 255, 255, ${(0.058 * alpha).toFixed(4)})`);
      majorGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

      const minorGrad = context.createLinearGradient(plotLeft, 0, plotRight, 0);
      minorGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
      minorGrad.addColorStop(featherFrac, `rgba(255, 255, 255, ${(0.032 * alpha).toFixed(4)})`);
      minorGrad.addColorStop(1 - featherFrac, `rgba(255, 255, 255, ${(0.032 * alpha).toFixed(4)})`);
      minorGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

      for (let i = 0; i < IRE_MARKS.length; i += 1) {
        const mark = IRE_MARKS[i];
        const y = Math.round(y0 - (mark.ire / 100) * bandH) + 0.5;
        context.strokeStyle = mark.major ? majorGrad : minorGrad;
        context.beginPath();
        context.moveTo(plotLeft, y);
        context.lineTo(plotRight, y);
        context.stroke();
      }

      // Crisp vertical R | G | B parade lane dividers with soft 28px vertical edge feather
      const div1X = Math.round(plotLeft + colW + gap * 0.5) + 0.5;
      const div2X = Math.round(plotLeft + colW * 2 + gap * 1.5) + 0.5;
      const vFeatherFrac = Math.min(0.18, 28 / Math.max(1, bandH));
      const divGrad = context.createLinearGradient(0, y100, 0, y0);
      divGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
      divGrad.addColorStop(vFeatherFrac, `rgba(255, 255, 255, ${(0.055 * alpha).toFixed(4)})`);
      divGrad.addColorStop(1 - vFeatherFrac, `rgba(255, 255, 255, ${(0.055 * alpha).toFixed(4)})`);
      divGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      context.strokeStyle = divGrad;
      context.beginPath();
      context.moveTo(div1X, y100);
      context.lineTo(div1X, y0);
      context.moveTo(div2X, y100);
      context.lineTo(div2X, y0);
      context.stroke();

      // Monospace IRE reference scale labels (100 / 75 / 50 / 25 / 0) inset past left feather zone
      context.font = "500 9px 'JetBrains Mono', ui-monospace, monospace";
      context.fillStyle = `rgba(161, 161, 170, ${(0.42 * alpha).toFixed(4)})`;
      context.textBaseline = "bottom";
      const labelInset = Math.max(width < 640 ? 28 : 44, Math.round(width * 0.045));
      for (let i = 0; i < IRE_MARKS.length; i += 1) {
        const mark = IRE_MARKS[i];
        const y = Math.round(y0 - (mark.ire / 100) * bandH);
        context.fillText(mark.label, labelInset, y - 3);
      }

      // Subtle R / G / B parade channel identifiers tucked cleanly along the 0 IRE baseline
      context.textBaseline = "top";
      context.font = "600 8.5px 'JetBrains Mono', ui-monospace, monospace";
      for (let c = 0; c < PARADE_CHANNELS.length; c += 1) {
        const ch = PARADE_CHANNELS[c];
        const laneLeft = plotLeft + c * (colW + gap);
        const chX = c === 0 ? labelInset : laneLeft + 4;
        const labelAlpha = (0.2 + 0.34 * (channelAlphas?.[c] ?? 1)) * alpha;
        context.fillStyle = `rgba(${ch.r}, ${ch.g}, ${ch.b}, ${labelAlpha.toFixed(4)})`;
        context.fillText(ch.id, chX, y0 + 5);
      }

      context.restore();
    };

    const drawVectorscopeReticle = (context, alpha, lockScale) => {
      if (alpha <= 0.002) return;
      const cx = width * 0.5;
      const cy = height * 0.5;
      // 380px diameter (190px radius) on desktop, responsive clamp on compact viewports
      const baseRadius = Math.min(190, Math.min(width, height) * 0.42);
      const radius = baseRadius * lockScale;

      context.save();
      context.lineWidth = 1;

      // Outer 380px circular reticle
      context.strokeStyle = `rgba(255, 255, 255, ${(0.06 * alpha).toFixed(4)})`;
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.stroke();

      // Inner 50% chroma reference ring
      context.strokeStyle = `rgba(255, 255, 255, ${(0.032 * alpha).toFixed(4)})`;
      context.beginPath();
      context.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
      context.stroke();

      // Primary center crosshairs
      context.strokeStyle = `rgba(255, 255, 255, ${(0.052 * alpha).toFixed(4)})`;
      context.beginPath();
      context.moveTo(cx - radius, cy);
      context.lineTo(cx + radius, cy);
      context.moveTo(cx, cy - radius);
      context.lineTo(cx, cy + radius);
      context.stroke();

      // Subtle graduation ticks at 25% & 75% along crosshair axes
      context.strokeStyle = `rgba(255, 255, 255, ${(0.06 * alpha).toFixed(4)})`;
      context.beginPath();
      const tickFracs = [0.25, 0.75];
      for (let i = 0; i < tickFracs.length; i += 1) {
        const d = radius * tickFracs[i];
        context.moveTo(cx - d, cy - 3);
        context.lineTo(cx - d, cy + 3);
        context.moveTo(cx + d, cy - 3);
        context.lineTo(cx + d, cy + 3);
        context.moveTo(cx - 3, cy - d);
        context.lineTo(cx + 3, cy - d);
        context.moveTo(cx - 3, cy + d);
        context.lineTo(cx + 3, cy + d);
      }
      context.stroke();

      // Subtle 75% Rec.709 color target cross-ticks around perimeter
      const targetR = radius * 0.76;
      context.strokeStyle = `rgba(255, 255, 255, ${(0.065 * alpha).toFixed(4)})`;
      context.beginPath();
      for (let i = 0; i < REC709_TARGET_ANGLES_DEG.length; i += 1) {
        const rad = (REC709_TARGET_ANGLES_DEG[i] * Math.PI) / 180;
        const tx = cx + Math.cos(rad) * targetR;
        const ty = cy - Math.sin(rad) * targetR;
        context.moveTo(tx - 3, ty);
        context.lineTo(tx + 3, ty);
        context.moveTo(tx, ty - 3);
        context.lineTo(tx, ty + 3);
      }
      context.stroke();

      // Rec.709 Skin-Tone Reference I-Line (~123 deg, matching ProScopes.jsx)
      const cosI = Math.cos(SKIN_ILINE_RAD);
      const sinI = Math.sin(SKIN_ILINE_RAD);
      const startX = cx + cosI * (radius * 0.14);
      const startY = cy - sinI * (radius * 0.14);
      const endX = cx + cosI * radius;
      const endY = cy - sinI * radius;

      context.setLineDash([3, 3]);
      context.strokeStyle = `rgba(251, 191, 36, ${(0.18 * alpha).toFixed(4)})`;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
      context.stroke();
      context.setLineDash([]);

      // Perimeter skin-tone I-Line tick pip + micro label
      context.fillStyle = `rgba(251, 191, 36, ${(0.34 * alpha).toFixed(4)})`;
      context.beginPath();
      context.arc(endX, endY, 2, 0, Math.PI * 2);
      context.fill();

      context.font = "500 8px 'JetBrains Mono', ui-monospace, monospace";
      context.fillStyle = `rgba(251, 191, 36, ${(0.28 * alpha).toFixed(4)})`;
      context.textBaseline = "middle";
      context.fillText(
        "I-LINE",
        cx + cosI * (radius * 0.86) - 34,
        cy - sinI * (radius * 0.86) - 2
      );

      context.restore();
    };

    const channelAlphas = new Float32Array(PARADE_CHANNELS.length);
    let vFeatherLut = new Float32Array(0);
    let vFeatherBufH = -1;
    let vFeatherY100 = -1;
    let vFeatherY0 = -1;

    const getVerticalFeatherLut = (curBufH, curBufY100, curBufY0, scaleY) => {
      if (
        vFeatherBufH === curBufH &&
        vFeatherY100 === curBufY100 &&
        vFeatherY0 === curBufY0 &&
        vFeatherLut.length === curBufH
      ) {
        return vFeatherLut;
      }
      if (vFeatherLut.length !== curBufH) {
        vFeatherLut = new Float32Array(curBufH);
      }
      const featherBufPx = Math.max(4, Math.min(28 * scaleY, (curBufY0 - curBufY100) * 0.18));
      for (let y = 0; y < curBufH; y += 1) {
        const topFade = smoothstep(0, featherBufPx, y - curBufY100);
        const botFade = smoothstep(0, featherBufPx, curBufY0 - y);
        vFeatherLut[y] = topFade * botFade;
      }
      vFeatherBufH = curBufH;
      vFeatherY100 = curBufY100;
      vFeatherY0 = curBufY0;
      return vFeatherLut;
    };

    const renderFrame = (nowMs) => {
      const context = ctx;
      if (!context || !offCtx || !imgBuf || !buf32) return;

      context.clearRect(0, 0, width, height);

      const elapsedMs = reducedMotion
        ? REDUCED_MOTION_SETTLED_MS
        : Math.max(0, nowMs - mountTime);
      const timeSec = reducedMotion ? 2.4 : nowMs * 0.001;

      // 280ms -> 1030ms: Graticule & Vectorscope reticle optical lock-in as shutters part
      const graticuleT = clamp(
        (elapsedMs - GRATICULE_START_MS) / GRATICULE_LOCK_MS,
        0,
        1
      );
      const graticuleAlpha = easeCinemaDecel(graticuleT);
      const reticleScale = 1 + (1 - graticuleAlpha) * 0.045;

      // Full-bleed horizontal & vertical scope layout (feathered smoothly at viewport edges)
      const plotLeft = 0;
      const plotRight = width;
      const plotW = Math.max(60, plotRight - plotLeft);
      const gap = width < 640 ? 10 : 18;
      const colW = Math.max(16, (plotW - gap * 2) / 3);
      const hFeatherPx = Math.min(120, width * 0.16);

      const y100 = Math.round(height * IRE_100_FRAC);
      const y0 = Math.round(height * IRE_0_FRAC);

      // 450ms -> 1950ms (1500ms): Deliberate left-to-right oscilloscope beam sweep
      const sweepRaw = clamp(
        (elapsedMs - SWEEP_START_MS) / SWEEP_DURATION_MS,
        0,
        1
      );
      const sweepProgress = easeOscilloscopeSweep(sweepRaw);
      const beamX = plotLeft + sweepProgress * plotW;

      // Smooth fade-in and fade-out envelope for the 1px vertical silver scan-beam
      let beamPresence = 0;
      if (!reducedMotion && sweepRaw > 0 && sweepRaw < 1) {
        const fadeIn = clamp(sweepRaw / 0.05, 0, 1);
        const fadeOut = clamp((1 - sweepRaw) / 0.1, 0, 1);
        beamPresence = easeCinemaDecel(fadeIn) * easeCinemaDecel(fadeOut);
      }

      // Illuminate each R / G / B baseline label smoothly as the scan-beam enters its lane
      for (let c = 0; c < PARADE_CHANNELS.length; c += 1) {
        const laneStartFrac = (c * (colW + gap)) / plotW;
        channelAlphas[c] =
          sweepRaw >= 1
            ? 1
            : easeCinemaDecel(
                clamp((sweepProgress - laneStartFrac) / 0.08, 0, 1)
              );
      }

      // 1. IRE Graticule Lines & 3-Lane Dividers
      drawIreGraticules(
        context,
        plotLeft,
        plotRight,
        y100,
        y0,
        colW,
        gap,
        graticuleAlpha,
        channelAlphas
      );

      // 2. Faint Centered 380px Vectorscope Circular Reticle
      drawVectorscopeReticle(context, graticuleAlpha, reticleScale);

      if (sweepRaw <= 0.0005) return;

      // 3. Pure, Uncluttered 3-Channel RGB Parade Phosphor Trace Columns (progressive L -> R sweep)
      buf32.fill(0);
      const out = imgBuf.data;

      const scaleX = bufW / width;
      const scaleY = bufH / height;
      const bufY100 = Math.max(1, Math.round(y100 * scaleY));
      const bufY0 = Math.min(bufH - 2, Math.round(y0 * scaleY));
      const bufBandH = Math.max(12, bufY0 - bufY100);
      const vFeatherTable = getVerticalFeatherLut(bufH, bufY100, bufY0, scaleY);

      const activePresence = isTouchOnly || reducedMotion ? 0 : presence;
      const sigma = clamp(width * 0.088, 86, 155);
      const sigmaSq2 = 2 * sigma * sigma;

      // Subtle vertical film-frame breathing & cinema scene contour time phases
      const tSlow = timeSec * 0.42;
      const tMed = timeSec * 0.78;
      const tDrift = timeSec * 0.22;
      const isSweepSettled = sweepRaw >= 1;

      for (let chIdx = 0; chIdx < PARADE_CHANNELS.length; chIdx += 1) {
        const ch = PARADE_CHANNELS[chIdx];
        const laneLeftPx = plotLeft + chIdx * (colW + gap);
        if (!isSweepSettled && laneLeftPx > beamX + 2) continue;

        const bufLaneStart = Math.max(0, Math.floor(laneLeftPx * scaleX));
        const bufLaneEnd = Math.min(
          bufW - 1,
          Math.floor((laneLeftPx + colW) * scaleX)
        );
        const bufLaneSpan = Math.max(1, bufLaneEnd - bufLaneStart);

        for (let bx = bufLaneStart; bx <= bufLaneEnd; bx += 1) {
          const screenX = bx / scaleX;
          if (!isSweepSettled && screenX > beamX + 2) break;

          // Smooth 120px horizontal edge feathering at both left & right viewport boundaries
          const hFeather =
            smoothstep(0, hFeatherPx, screenX) *
            smoothstep(0, hFeatherPx, width - screenX);
          if (hFeather <= 0.002) continue;

          let colAlpha = 1;
          let colEnvelope = 1;
          let beamExcite = 0;
          if (!isSweepSettled) {
            const distBehind = beamX - screenX;
            colAlpha = easeCinemaDecel(clamp((distBehind + 2) / 34, 0, 1));
            if (colAlpha <= 0.002) continue;
            colEnvelope =
              0.78 + 0.22 * easeCinemaDecel(clamp((distBehind + 2) / 56, 0, 1));
            if (distBehind >= 0 && distBehind < 96) {
              beamExcite = Math.exp(-distBehind / 30) * beamPresence;
            }
          }

          const effectiveColAlpha = colAlpha * hFeather;
          if (effectiveColAlpha <= 0.002) continue;

          const u = (bx - bufLaneStart) / bufLaneSpan; // 0..1 across cinema frame width

          // Cursor-reactive Gaussian signal boost around pointer X
          let gauss = 0;
          if (activePresence > 0.003) {
            const dx = screenX - mx;
            const distSq = dx * dx;
            if (distSq < sigmaSq2 * 6.5) {
              gauss = Math.exp(-distSq / sigmaSq2) * activePresence;
            }
          }

          // Coherent cinema scene horizontal profile shared across R, G, B with graded color separation
          const edgeVignette = 0.84 + 0.16 * Math.sin(u * Math.PI);
          const sceneMacro =
            Math.sin(u * 5.2 + tDrift) * 7.5 +
            Math.sin(u * 11.4 - tSlow * 0.85 + 1.2) * 4.2 +
            Math.cos(u * 21.0 + tMed * 0.55) * 2.1;

          // Secondary practical/highlight lobe (e.g., studio key light / window contour)
          const keyCenter = 0.34 + 0.14 * Math.sin(tDrift * 0.75);
          const keyDist = u - keyCenter;
          const keyLobe = Math.exp(-(keyDist * keyDist) / 0.045) * 16.5;

          const rimCenter = 0.76 + 0.09 * Math.cos(tDrift * 0.62 + 1.1);
          const rimDist = u - rimCenter;
          const rimLobe = Math.exp(-(rimDist * rimDist) / 0.028) * 13.0;

          // Subtle channel-specific optical grading harmonics
          const chMod =
            Math.sin(u * 7.8 + timeSec * ch.driftSpeed + ch.phaseOffset) * 2.6 +
            Math.cos(u * 16.5 - tSlow * 0.7 + ch.phaseOffset * 1.9) * 1.4;

          // 5 stratified cinema luminance bands compressed smoothly through softKneeIre (no flat 100/0 IRE pile-up)
          const shadowIre = softKneeIre(
            11.5 +
              sceneMacro * 0.32 +
              Math.sin(u * 9.0 + tDrift * 1.2) * 3.2 +
              ch.shadowOffset
          );
          const lowMidIre = softKneeIre(
            26.5 + sceneMacro * 0.68 + chMod * 0.65 + ch.shadowOffset * 0.45
          );
          const midCoreIre = softKneeIre(
            44.0 +
              (sceneMacro + keyLobe * 0.48) * edgeVignette +
              chMod +
              ch.midOffset
          );
          const upperKeyIre = softKneeIre(
            57.0 +
              (sceneMacro * 0.85 + keyLobe * 0.82 + rimLobe * 0.58) *
                edgeVignette +
              chMod * 1.1 +
              ch.highOffset * 0.78
          );
          const specPeakIre = softKneeIre(
            65.5 +
              (sceneMacro * 0.58 + keyLobe * 0.96 + rimLobe * 1.0) *
                edgeVignette +
              chMod * 1.2 +
              ch.highOffset
          );

          // Signal energy amplification + phosphor brightness boost under cursor probe & scan-beam excitation
          const energyAmp = 1 + gauss * 0.24;
          const energyLift = gauss * 5.2;
          const alphaStepBase = (48 + gauss * 62 + beamExcite * 42) * effectiveColAlpha;
          const maxColAlpha = ((146 + gauss * 106 + beamExcite * 48) * effectiveColAlpha) | 0;
          const baseScale = 0.86 + gauss * 0.14;
          const baseR = Math.min(
            255,
            (ch.r * baseScale + gauss * 34 + beamExcite * 46) | 0
          );
          const baseG = Math.min(
            255,
            (ch.g * baseScale + gauss * 34 + beamExcite * 46) | 0
          );
          const baseB = Math.min(
            255,
            (ch.b * baseScale + gauss * 34 + beamExcite * 46) | 0
          );
          const hotBoostBase = (26 + gauss * 44 + beamExcite * 22) * effectiveColAlpha;

          const baseNoiseIdx = (bx * 37 + chIdx * 521) & (NOISE_TABLE_SIZE - 1);

          // Deposit 44 vertical phosphor trace dots per column across the 5 strata + connective mist
          for (let s = 0; s < 44; s += 1) {
            const nIdx = (baseNoiseIdx + s * 17) & (NOISE_TABLE_SIZE - 1);
            const gNoise = NOISE_GAUSS[nIdx];
            const uNoise = NOISE_UNIF[(nIdx + 131) & (NOISE_TABLE_SIZE - 1)];

            let sampleIre;
            let sampleWeight = 1.0;

            if (s < 8) {
              // Shadow floor cluster
              sampleIre = shadowIre + gNoise * 3.1;
              sampleWeight = 0.92;
            } else if (s < 17) {
              // Lower-midtone ambient fill
              sampleIre = lowMidIre + gNoise * 5.4;
              sampleWeight = 0.9;
            } else if (s < 30) {
              // Dense primary midtone phosphor core
              sampleIre = midCoreIre + gNoise * 6.8;
              sampleWeight = 1.15;
            } else if (s < 38) {
              // Upper key rolloff
              sampleIre = upperKeyIre + gNoise * 5.8;
              sampleWeight = 0.94;
            } else if (s < 42) {
              // Delicate specular highlight peaks
              sampleIre = specPeakIre + gNoise * 4.2;
              sampleWeight = 0.82;
            } else {
              // Connective vertical phosphor dust spanning shadow -> highlight
              sampleIre = shadowIre + uNoise * (specPeakIre - shadowIre);
              sampleWeight = 0.56;
            }

            // Apply cursor Gaussian signal amplification + soft-knee compression (max ~96 IRE)
            const excitedIre = softKneeIre(
              (sampleIre * energyAmp + energyLift) * colEnvelope
            );
            const by = Math.max(
              1,
              Math.min(bufH - 2, bufY0 - (((excitedIre * bufBandH) / 100) | 0))
            );

            const vFeather = vFeatherTable[by];
            if (vFeather <= 0.002) continue;

            const p = (by * bufW + bx) << 2;
            const addA = (alphaStepBase * sampleWeight * vFeather) | 0;
            const dotMaxA = (maxColAlpha * vFeather) | 0;
            if (addA <= 0 || dotMaxA <= 0) continue;

            if (out[p + 3] === 0) {
              out[p] = baseR;
              out[p + 1] = baseG;
              out[p + 2] = baseB;
              out[p + 3] = addA > dotMaxA ? dotMaxA : addA;
            } else {
              const hotBoost = (hotBoostBase * vFeather) | 0;
              const stepScale = vFeather * effectiveColAlpha;
              const nr = out[p] + ((((ch.stepR >> 2) * stepScale) | 0) + hotBoost);
              const ng = out[p + 1] + ((((ch.stepG >> 2) * stepScale) | 0) + hotBoost);
              const nb = out[p + 2] + ((((ch.stepB >> 2) * stepScale) | 0) + hotBoost);
              const na = out[p + 3] + addA;
              out[p] = nr > 255 ? 255 : nr;
              out[p + 1] = ng > 255 ? 255 : ng;
              out[p + 2] = nb > 255 ? 255 : nb;
              out[p + 3] = na > dotMaxA ? dotMaxA : na;
            }

            // Subtle 1px vertical phosphor tail on dense core hits for continuous vertical trace feel
            if (sampleWeight > 1.0 && by > bufY100 + 1) {
              const pUp = ((by - 1) * bufW + bx) << 2;
              const subA = addA >> 2;
              const upMaxA = (maxColAlpha * vFeatherTable[by - 1]) | 0;
              if (subA > 0 && upMaxA > 0) {
                if (out[pUp + 3] === 0) {
                  out[pUp] = baseR;
                  out[pUp + 1] = baseG;
                  out[pUp + 2] = baseB;
                  out[pUp + 3] = subA > upMaxA ? upMaxA : subA;
                } else {
                  const sa = out[pUp + 3] + subA;
                  out[pUp + 3] = sa > upMaxA ? upMaxA : sa;
                }
              }
            }
          }
        }
      }

      offCtx.putImageData(imgBuf, 0, 0);

      // Composite crisp phosphor Parade columns onto HiDPI main canvas
      context.save();
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "medium";
      context.drawImage(offscreenCanvas, 0, 0, bufW, bufH, 0, 0, width, height);

      // 4. Crisp 1px Vertical Silver Oscilloscope Scan-Beam (450ms -> 1950ms)
      if (beamPresence > 0.004) {
        const scanX = Math.round(beamX) + 0.5;
        const trailWidth = Math.min(44, Math.max(0, beamX - plotLeft));

        if (trailWidth > 1) {
          const trailGrad = context.createLinearGradient(
            scanX - trailWidth,
            0,
            scanX,
            0
          );
          trailGrad.addColorStop(0, "rgba(244, 244, 245, 0)");
          trailGrad.addColorStop(
            0.7,
            `rgba(244, 244, 245, ${(0.03 * beamPresence).toFixed(4)})`
          );
          trailGrad.addColorStop(
            1,
            `rgba(244, 244, 245, ${(0.085 * beamPresence).toFixed(4)})`
          );
          context.fillStyle = trailGrad;
          context.fillRect(scanX - trailWidth, y100, trailWidth, y0 - y100);
        }

        const beamGrad = context.createLinearGradient(0, y100 - 10, 0, y0 + 10);
        beamGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
        beamGrad.addColorStop(
          0.12,
          `rgba(244, 244, 245, ${(0.52 * beamPresence).toFixed(4)})`
        );
        beamGrad.addColorStop(
          0.5,
          `rgba(255, 255, 255, ${(0.82 * beamPresence).toFixed(4)})`
        );
        beamGrad.addColorStop(
          0.88,
          `rgba(244, 244, 245, ${(0.52 * beamPresence).toFixed(4)})`
        );
        beamGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

        context.strokeStyle = beamGrad;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(scanX, y100 - 10);
        context.lineTo(scanX, y0 + 10);
        context.stroke();

        // Precision calibration ticks where the scan-beam intersects 100 IRE & 0 IRE
        context.strokeStyle = `rgba(255, 255, 255, ${(0.68 * beamPresence).toFixed(4)})`;
        context.beginPath();
        context.moveTo(scanX - 3, y100 + 0.5);
        context.lineTo(scanX + 3, y100 + 0.5);
        context.moveTo(scanX - 3, y0 + 0.5);
        context.lineTo(scanX + 3, y0 + 0.5);
        context.stroke();
      }

      // 5. Subtle Cursor-Reactive Vertical Signal Probe Hairline
      if (
        activePresence > 0.004 &&
        mx >= plotLeft &&
        mx <= (isSweepSettled ? plotRight : Math.min(plotRight, beamX))
      ) {
        const probeX = Math.round(mx) + 0.5;
        const probeGrad = context.createLinearGradient(0, y100, 0, y0);
        probeGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
        probeGrad.addColorStop(
          0.5,
          `rgba(244, 244, 245, ${(0.085 * activePresence).toFixed(4)})`
        );
        probeGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

        context.strokeStyle = probeGrad;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(probeX, y100);
        context.lineTo(probeX, y0);
        context.stroke();
      }

      context.restore();
    };

    const stopLoop = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      lastTimestamp = 0;
    };

    const tick = (timestamp) => {
      rafId = null;
      if (!isVisible || reducedMotion) return;

      if (lastTimestamp === 0) lastTimestamp = timestamp;
      const dt = clamp((timestamp - lastTimestamp) / 1000, 0.001, 0.05);
      lastTimestamp = timestamp;

      if (!isTouchOnly) {
        const lerpFactor = 1 - Math.pow(1 - 0.18, dt * 60);
        mx += (targetX - mx) * lerpFactor;
        my += (targetY - my) * lerpFactor;

        const targetPresence = pointerInside ? 1 : 0;
        const presenceRate = pointerInside ? 0.2 : 0.1;
        const presenceLerp = 1 - Math.pow(1 - presenceRate, dt * 60);
        presence += (targetPresence - presence) * presenceLerp;
        if (!pointerInside && presence < 0.002) {
          presence = 0;
        }
        syncOpticalDomVars();
      }

      renderFrame(timestamp);
      rafId = window.requestAnimationFrame(tick);
    };

    const ensureLoop = () => {
      if (!isVisible || reducedMotion) return;
      if (rafId === null) {
        lastTimestamp = 0;
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const onPointerMove = (e) => {
      if (e.pointerType === "touch" || isTouchOnly || reducedMotion) return;
      targetX = e.clientX;
      targetY = e.clientY;
      if (!pointerInside && presence < 0.01) {
        mx = targetX;
        my = targetY;
      }
      pointerInside = true;
      ensureLoop();
    };

    const onPointerLeave = () => {
      pointerInside = false;
    };

    const onMouseOut = (e) => {
      if (e.relatedTarget === null) {
        pointerInside = false;
      }
    };

    const onResize = () => {
      syncCanvasSize();
      if (reducedMotion) {
        renderFrame(mountTime + REDUCED_MOTION_SETTLED_MS);
      }
    };

    const onVisibilityChange = () => {
      isVisible = !document.hidden;
      if (!isVisible) {
        stopLoop();
      } else {
        ensureLoop();
      }
    };

    const onCapabilityChange = () => {
      isTouchOnly = hoverMedia.matches;
      reducedMotion = motionMedia.matches;
      if (isTouchOnly || reducedMotion) {
        pointerInside = false;
        presence = 0;
        syncOpticalDomVars();
      }
      if (reducedMotion) {
        stopLoop();
        renderFrame(mountTime + REDUCED_MOTION_SETTLED_MS);
      } else {
        ensureLoop();
      }
    };

    syncCanvasSize();
    if (reducedMotion) {
      renderFrame(mountTime + REDUCED_MOTION_SETTLED_MS);
    } else {
      ensureLoop();
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave, {
      passive: true,
    });
    window.addEventListener("mouseout", onMouseOut, { passive: true });
    window.addEventListener("blur", onPointerLeave);
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    hoverMedia.addEventListener?.("change", onCapabilityChange);
    motionMedia.addEventListener?.("change", onCapabilityChange);

    return () => {
      stopLoop();
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("blur", onPointerLeave);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      hoverMedia.removeEventListener?.("change", onCapabilityChange);
      motionMedia.removeEventListener?.("change", onCapabilityChange);
    };
  }, [stageRef, calibBezelRef, emblemBezelRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none z-0"
      style={{
        maskImage:
          "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
      }}
    />
  );
}
