import React, { useRef, useEffect, useCallback, useId } from "react";

interface InteractiveStudioBackdropProps {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "main" | "section";
  refreshKey?: string | number;
}

interface WaveformHarmonic {
  freq: number;
  amp: number;
  speed: number;
  phase: number;
}

interface WaveformChannel {
  id: "r" | "g" | "b";
  baseIre: number;
  idleStroke: string;
  fillTop: string;
  fillBottom: string;
  peakRgb: string;
  nodeRgb: string;
  harmonics: readonly WaveformHarmonic[];
}

const STUDIO_BASE_BG = "#07080A";
const LOUPE_DIAMETER = 130;
const LOUPE_RADIUS = LOUPE_DIAMETER * 0.5;
const CURSOR_LERP_60FPS = 0.22;
const LEAVE_FADE_SECONDS = 0.85;
const SAMPLE_STEP_PX = 4;

// Vertical waveform graticule spanning the lower-to-mid viewport
const IRE_100_FRAC = 0.24;
const IRE_50_FRAC = 0.57;
const IRE_0_FRAC = 0.90;

const WAVEFORM_CHANNELS: readonly WaveformChannel[] = [
  {
    id: "r",
    baseIre: 41,
    idleStroke: "rgba(244, 63, 94, 0.22)",
    fillTop: "rgba(244, 63, 94, 0.06)",
    fillBottom: "rgba(244, 63, 94, 0)",
    peakRgb: "244, 63, 94",
    nodeRgb: "253, 164, 175",
    harmonics: [
      { freq: 1.45, amp: 13.0, speed: 0.34, phase: 0.4 },
      { freq: 2.85, amp: 7.4, speed: -0.51, phase: 1.85 },
      { freq: 5.05, amp: 3.7, speed: 0.76, phase: 3.15 },
      { freq: 8.35, amp: 1.65, speed: -1.04, phase: 0.75 },
    ],
  },
  {
    id: "g",
    baseIre: 46,
    idleStroke: "rgba(52, 211, 153, 0.24)",
    fillTop: "rgba(52, 211, 153, 0.06)",
    fillBottom: "rgba(52, 211, 153, 0)",
    peakRgb: "52, 211, 153",
    nodeRgb: "167, 243, 208",
    harmonics: [
      { freq: 1.32, amp: 13.5, speed: 0.30, phase: 1.68 },
      { freq: 2.62, amp: 7.0, speed: -0.45, phase: 3.42 },
      { freq: 4.78, amp: 3.5, speed: 0.71, phase: 0.72 },
      { freq: 7.85, amp: 1.55, speed: -0.95, phase: 2.48 },
    ],
  },
  {
    id: "b",
    baseIre: 38,
    idleStroke: "rgba(56, 189, 248, 0.22)",
    fillTop: "rgba(56, 189, 248, 0.06)",
    fillBottom: "rgba(56, 189, 248, 0)",
    peakRgb: "56, 189, 248",
    nodeRgb: "186, 230, 253",
    harmonics: [
      { freq: 1.56, amp: 12.4, speed: 0.28, phase: 3.12 },
      { freq: 3.12, amp: 6.7, speed: -0.48, phase: 0.62 },
      { freq: 5.38, amp: 3.4, speed: 0.67, phase: 4.35 },
      { freq: 8.75, amp: 1.45, speed: -1.10, phase: 1.72 },
    ],
  },
];

// Rec.709 skin-tone I-Line axis at 123 degrees (matching ProScopes vectorscope)
const ILINE_ANGLE_RAD = (123 * Math.PI) / 180;
const ILINE_COS = Math.cos(ILINE_ANGLE_RAD);
const ILINE_SIN = Math.sin(ILINE_ANGLE_RAD);
const ILINE_X1 = (LOUPE_RADIUS + ILINE_COS * 22).toFixed(2);
const ILINE_Y1 = (LOUPE_RADIUS - ILINE_SIN * 22).toFixed(2);
const ILINE_X2 = (LOUPE_RADIUS + ILINE_COS * (LOUPE_RADIUS - 0.5)).toFixed(2);
const ILINE_Y2 = (LOUPE_RADIUS - ILINE_SIN * (LOUPE_RADIUS - 0.5)).toFixed(2);

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function srgbToLinear(c: number): number {
  const v = clamp(c, 0, 1);
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function rgbToOklab(
  r: number,
  g: number,
  b: number
): { L: number; a: number; b: number } {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const lCbrt = Math.cbrt(Math.max(l, 0));
  const mCbrt = Math.cbrt(Math.max(m, 0));
  const sCbrt = Math.cbrt(Math.max(s, 0));

  return {
    L: 0.2104542553 * lCbrt + 0.793617785 * mCbrt - 0.0040720468 * sCbrt,
    a: 1.9779984951 * lCbrt - 2.428592205 * mCbrt + 0.4505937099 * sCbrt,
    b: 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.808675766 * sCbrt,
  };
}

function sampleChannelIre(
  channel: WaveformChannel,
  x: number,
  width: number,
  timeSec: number,
  mx: number,
  sigmaSq2: number,
  presence: number,
  verticalBias: number
): number {
  const nx = x / width;
  const edgeEnvelope = 0.82 + 0.18 * Math.sin(nx * Math.PI);
  const twoPiNx = nx * Math.PI * 2;

  let displacement = 0;
  for (let i = 0; i < channel.harmonics.length; i += 1) {
    const h = channel.harmonics[i];
    displacement +=
      Math.sin(twoPiNx * h.freq + timeSec * h.speed + h.phase) * h.amp;
  }

  // Slow organic luminance drift so idle signal breathes like live footage
  const slowDrift =
    Math.sin(nx * Math.PI * 1.15 - timeSec * 0.19 + channel.baseIre * 0.1) *
    4.2;

  let ire = channel.baseIre + (displacement + slowDrift) * edgeEnvelope;

  // Smooth Gaussian excitation directly beneath pointer X
  if (presence > 0.004) {
    const dx = x - mx;
    const gauss = Math.exp(-(dx * dx) / sigmaSq2) * presence;
    const excitedDelta = displacement * 0.62 + (11.5 + verticalBias * 5.5);
    ire += excitedDelta * gauss;
  }

  return clamp(ire, 4, 96);
}

/**
 * Interactive RGB Waveform & Optical Color Probe Backdrop
 * for secondary studio views (Settings, About, Support).
 *
 * Calibrated color-grading instrument surface on obsidian (#07080A):
 *  1. Deep calibrated obsidian base (#07080A) with subtle horizontal IRE baseline
 *     hairlines (0, 50, 100 at rgba(255,255,255,0.04)) — zero tile grids or crosshairs.
 *  2. Autonomous 60fps multi-harmonic RGB Waveform curves (cinema red, emerald green,
 *     cobalt blue) with vertical gradient fills underneath (opacity: 0.06).
 *  3. Real-time cursor signal excitation: smooth Gaussian amplitude boost + crisp 1.5px
 *     bright peak stroke + live sample nodes at the pointer's horizontal X position.
 *  4. Sleek 130px mini Vectorscope / Optical Loupe ring around the cursor with 1px
 *     hairline border, Rec.709 I-line skin-tone axis tick, live chroma dot, and
 *     tucked lower-edge monospace signal readout (e.g. `IRE 64 · OKLab 0.72`).
 *  5. Synchronizes --mx / --my / --card-border-opacity on smoked-glass studio cards (.m3-panel).
 */
export default function InteractiveStudioBackdrop({
  children,
  className = "",
  as: Component = "div",
  refreshKey,
}: InteractiveStudioBackdropProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loupeRef = useRef<HTMLDivElement | null>(null);
  const loupeReadoutRef = useRef<HTMLDivElement | null>(null);
  const vectorDotRef = useRef<SVGCircleElement | null>(null);
  const cardsRef = useRef<HTMLElement[]>([]);
  const cardsDirtyRef = useRef<boolean>(false);

  const uniqueId = useId().replace(/:/g, "");
  const noiseFilterId = `studio-noise-${uniqueId}`;

  const syncCardCache = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      cardsRef.current = [];
      return;
    }
    cardsRef.current = Array.from(
      container.querySelectorAll<HTMLElement>(".m3-panel")
    );
    cardsDirtyRef.current = true;
  }, []);

  useEffect(() => {
    syncCardCache();
  }, [refreshKey, syncCardCache]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const hoverMedia = window.matchMedia("(hover: none)");
    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");

    let isTouchOnly = hoverMedia.matches;
    let reducedMotion = motionMedia.matches;
    let isVisible = !document.hidden;
    let rafId: number | null = null;
    let lastTimestamp = 0;

    let width = Math.max(window.innerWidth, 1);
    let height = Math.max(window.innerHeight, 1);
    let ctx: CanvasRenderingContext2D | null = null;

    let sampleCount = 0;
    let sampleXs = new Float32Array(0);
    let channelYs: [Float32Array, Float32Array, Float32Array] = [
      new Float32Array(0),
      new Float32Array(0),
      new Float32Array(0),
    ];

    let pointerActive = false;
    let targetX = width * 0.5;
    let targetY = height * 0.52;
    let mx = targetX;
    let my = targetY;
    let presence = 0;
    let fadeStartPresence = 0;
    let fadeElapsed = 0;

    let lastDomMx = -9999;
    let lastDomMy = -9999;
    let lastDomPresence = -1;
    let lastReadoutText = "";

    const allocateSampleBuffers = () => {
      const count = Math.ceil(width / SAMPLE_STEP_PX) + 1;
      if (count !== sampleCount) {
        sampleCount = count;
        sampleXs = new Float32Array(count);
        channelYs = [
          new Float32Array(count),
          new Float32Array(count),
          new Float32Array(count),
        ];
      }
      for (let i = 0; i < count; i += 1) {
        sampleXs[i] = i === count - 1 ? width : i * SAMPLE_STEP_PX;
      }
    };

    const syncCanvasSize = () => {
      const canvas = canvasRef.current;
      width = Math.max(window.innerWidth, 1);
      height = Math.max(window.innerHeight, 1);
      allocateSampleBuffers();
      if (!canvas) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    };

    const applyCardSpecularLighting = (force = false) => {
      const container = containerRef.current;
      if (!container) return;

      const disabled = presence <= 0.004 || isTouchOnly || reducedMotion;
      if (disabled) {
        if (force || lastDomPresence !== 0) {
          container.style.setProperty("--card-border-opacity", "0");
          lastDomPresence = 0;
        }
        cardsDirtyRef.current = false;
        return;
      }

      const moved =
        Math.abs(mx - lastDomMx) > 0.1 ||
        Math.abs(my - lastDomMy) > 0.1 ||
        Math.abs(presence - lastDomPresence) > 0.002;

      if (!force && !cardsDirtyRef.current && !moved) return;

      container.style.setProperty("--card-border-opacity", presence.toFixed(3));

      const cards = cardsRef.current;
      const rects = new Array<DOMRect>(cards.length);
      for (let i = 0; i < cards.length; i += 1) {
        rects[i] = cards[i].getBoundingClientRect();
      }
      for (let i = 0; i < cards.length; i += 1) {
        const cr = rects[i];
        cards[i].style.setProperty("--mx", `${(mx - cr.left).toFixed(1)}px`);
        cards[i].style.setProperty("--my", `${(my - cr.top).toFixed(1)}px`);
      }

      lastDomMx = mx;
      lastDomMy = my;
      lastDomPresence = presence;
      cardsDirtyRef.current = false;
    };

    const updateLoupeOverlay = (
      rIre: number,
      gIre: number,
      bIre: number
    ) => {
      const loupe = loupeRef.current;
      if (!loupe) return;

      // Softly attenuate when cursor moves up into the sticky 44px top navbar
      const navClearance = clamp((my - 28) / 28, 0, 1);
      const effectiveOpacity =
        isTouchOnly || reducedMotion ? 0 : presence * navClearance;

      if (effectiveOpacity <= 0.004) {
        loupe.style.opacity = "0";
        return;
      }

      const lx = mx - LOUPE_RADIUS;
      const ly = my - LOUPE_RADIUS;
      loupe.style.opacity = effectiveOpacity.toFixed(3);
      loupe.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0)`;

      const rNorm = rIre / 100;
      const gNorm = gIre / 100;
      const bNorm = bIre / 100;
      const lumaIre = Math.round(
        clamp((0.2126 * rNorm + 0.7152 * gNorm + 0.0722 * bNorm) * 100, 0, 100)
      );
      const oklab = rgbToOklab(rNorm, gNorm, bNorm);

      // Update subtle live chroma pip inside mini vectorscope
      const vectorDot = vectorDotRef.current;
      if (vectorDot) {
        const vecX = clamp(oklab.a * 210, -26, 26);
        const vecY = clamp(-oklab.b * 210, -26, 26);
        vectorDot.setAttribute("cx", (LOUPE_RADIUS + vecX).toFixed(2));
        vectorDot.setAttribute("cy", (LOUPE_RADIUS + vecY).toFixed(2));
      }

      // Update tiny monospace readout tucked neatly along the lower rim
      const readoutEl = loupeReadoutRef.current;
      if (readoutEl) {
        const nextText = `IRE ${String(lumaIre).padStart(2, "0")} · OKLab ${oklab.L.toFixed(2)}`;
        if (nextText !== lastReadoutText) {
          readoutEl.textContent = nextText;
          lastReadoutText = nextText;
        }
        const flipAbove = my + LOUPE_RADIUS + 28 > height;
        readoutEl.style.top = flipAbove ? "-22px" : `${LOUPE_DIAMETER + 6}px`;
      }
    };

    const renderWaveformFrame = (nowMs: number) => {
      const context = ctx;
      if (!context) return;

      context.clearRect(0, 0, width, height);

      const timeSec = nowMs * 0.001;
      const y100 = Math.round(height * IRE_100_FRAC) + 0.5;
      const y50 = Math.round(height * IRE_50_FRAC) + 0.5;
      const y0 = Math.round(height * IRE_0_FRAC) + 0.5;
      const bandHeight = Math.max(y0 - y100, 1);

      // 1. Subtle horizontal IRE baseline hairlines (0, 50, 100 at rgba(255,255,255,0.04))
      context.save();
      context.strokeStyle = "rgba(255, 255, 255, 0.04)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, y100);
      context.lineTo(width, y100);
      context.moveTo(0, y50);
      context.lineTo(width, y50);
      context.moveTo(0, y0);
      context.lineTo(width, y0);
      context.stroke();

      // Whisper-quiet monospace IRE reference ticks along the left margin
      context.font = "500 9px 'IBM Plex Mono', ui-monospace, monospace";
      context.fillStyle = "rgba(255, 255, 255, 0.14)";
      context.textBaseline = "bottom";
      context.fillText("100", 12, y100 - 4);
      context.fillText("50", 12, y50 - 4);
      context.fillText("0", 12, y0 - 4);
      context.restore();

      const activePresence = isTouchOnly || reducedMotion ? 0 : presence;
      const sigma = clamp(width * 0.105, 105, 185);
      const sigmaSq2 = 2 * sigma * sigma;
      const verticalBias = clamp(0.5 - my / height, -0.5, 0.5);

      // Sample all 3 RGB waveform curves
      for (let chIdx = 0; chIdx < WAVEFORM_CHANNELS.length; chIdx += 1) {
        const channel = WAVEFORM_CHANNELS[chIdx];
        const ys = channelYs[chIdx];
        for (let i = 0; i < sampleCount; i += 1) {
          const ire = sampleChannelIre(
            channel,
            sampleXs[i],
            width,
            timeSec,
            mx,
            sigmaSq2,
            activePresence,
            verticalBias
          );
          ys[i] = y0 - (ire / 100) * bandHeight;
        }
      }

      // 2. Render autonomous RGB Waveform curves + subtle vertical gradient fills (opacity: 0.06)
      for (let chIdx = 0; chIdx < WAVEFORM_CHANNELS.length; chIdx += 1) {
        const channel = WAVEFORM_CHANNELS[chIdx];
        const ys = channelYs[chIdx];

        // Trace the smooth curve path
        context.beginPath();
        context.moveTo(sampleXs[0], ys[0]);
        for (let i = 1; i < sampleCount; i += 1) {
          context.lineTo(sampleXs[i], ys[i]);
        }

        // Subtle vertical gradient fill beneath curve down to 0 IRE baseline
        context.save();
        context.lineTo(width, y0);
        context.lineTo(0, y0);
        context.closePath();
        const fillGrad = context.createLinearGradient(0, y100, 0, y0);
        fillGrad.addColorStop(0, channel.fillTop);
        fillGrad.addColorStop(0.75, channel.fillTop);
        fillGrad.addColorStop(1, channel.fillBottom);
        context.fillStyle = fillGrad;
        context.fill();
        context.restore();

        // Base calibrated idle waveform stroke
        context.beginPath();
        context.moveTo(sampleXs[0], ys[0]);
        for (let i = 1; i < sampleCount; i += 1) {
          context.lineTo(sampleXs[i], ys[i]);
        }
        context.strokeStyle = channel.idleStroke;
        context.lineWidth = 1.15;
        context.lineJoin = "round";
        context.stroke();

        // 3. Crisp 1.5px bright peak stroke over the cursor-excited horizontal band
        if (activePresence > 0.004) {
          const halfSpan = sigma * 2.5;
          const minX = clamp(mx - halfSpan, 0, width);
          const maxX = clamp(mx + halfSpan, 0, width);
          const startIdx = Math.max(0, Math.floor(minX / SAMPLE_STEP_PX));
          const endIdx = Math.min(
            sampleCount - 1,
            Math.ceil(maxX / SAMPLE_STEP_PX)
          );

          if (endIdx > startIdx) {
            const peakGrad = context.createLinearGradient(
              mx - halfSpan,
              0,
              mx + halfSpan,
              0
            );
            peakGrad.addColorStop(0, `rgba(${channel.peakRgb}, 0)`);
            peakGrad.addColorStop(
              0.3,
              `rgba(${channel.peakRgb}, ${(0.28 * activePresence).toFixed(3)})`
            );
            peakGrad.addColorStop(
              0.5,
              `rgba(${channel.peakRgb}, ${(0.86 * activePresence).toFixed(3)})`
            );
            peakGrad.addColorStop(
              0.7,
              `rgba(${channel.peakRgb}, ${(0.28 * activePresence).toFixed(3)})`
            );
            peakGrad.addColorStop(1, `rgba(${channel.peakRgb}, 0)`);

            context.beginPath();
            context.moveTo(sampleXs[startIdx], ys[startIdx]);
            for (let i = startIdx + 1; i <= endIdx; i += 1) {
              context.lineTo(sampleXs[i], ys[i]);
            }
            context.strokeStyle = peakGrad;
            context.lineWidth = 1.5;
            context.lineJoin = "round";
            context.stroke();
          }
        }
      }

      // 4. Live vertical signal probe hairline & exact RGB curve intersection pips
      const probeX = clamp(mx, 0, width);
      const rProbeIre = sampleChannelIre(
        WAVEFORM_CHANNELS[0],
        probeX,
        width,
        timeSec,
        mx,
        sigmaSq2,
        activePresence,
        verticalBias
      );
      const gProbeIre = sampleChannelIre(
        WAVEFORM_CHANNELS[1],
        probeX,
        width,
        timeSec,
        mx,
        sigmaSq2,
        activePresence,
        verticalBias
      );
      const bProbeIre = sampleChannelIre(
        WAVEFORM_CHANNELS[2],
        probeX,
        width,
        timeSec,
        mx,
        sigmaSq2,
        activePresence,
        verticalBias
      );

      if (activePresence > 0.004) {
        const probeLineX = Math.round(probeX) + 0.5;
        const probeGrad = context.createLinearGradient(0, y100, 0, y0);
        probeGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
        probeGrad.addColorStop(
          0.5,
          `rgba(255, 255, 255, ${(0.08 * activePresence).toFixed(3)})`
        );
        probeGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

        context.save();
        context.strokeStyle = probeGrad;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(probeLineX, y100);
        context.lineTo(probeLineX, y0);
        context.stroke();

        const probeIres = [rProbeIre, gProbeIre, bProbeIre];
        for (let chIdx = 0; chIdx < 3; chIdx += 1) {
          const py = y0 - (probeIres[chIdx] / 100) * bandHeight;
          const channel = WAVEFORM_CHANNELS[chIdx];

          // Soft phosphor halo around sampled waveform point
          const halo = context.createRadialGradient(
            probeX,
            py,
            0,
            probeX,
            py,
            9
          );
          halo.addColorStop(
            0,
            `rgba(${channel.peakRgb}, ${(0.42 * activePresence).toFixed(3)})`
          );
          halo.addColorStop(1, `rgba(${channel.peakRgb}, 0)`);
          context.fillStyle = halo;
          context.beginPath();
          context.arc(probeX, py, 9, 0, Math.PI * 2);
          context.fill();

          // Crisp 2.2px core sample pip
          context.fillStyle = `rgba(${channel.nodeRgb}, ${(0.95 * activePresence).toFixed(3)})`;
          context.beginPath();
          context.arc(probeX, py, 2.2, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();
      }

      updateLoupeOverlay(rProbeIre, gProbeIre, bProbeIre);
    };

    const stopLoop = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      lastTimestamp = 0;
    };

    const tick = (timestamp: number) => {
      rafId = null;
      if (!isVisible || reducedMotion) return;

      if (lastTimestamp === 0) {
        lastTimestamp = timestamp;
      }
      const dt = Math.min(
        Math.max((timestamp - lastTimestamp) / 1000, 0.001),
        0.05
      );
      lastTimestamp = timestamp;

      if (!isTouchOnly) {
        const cursorLerp = 1 - Math.pow(1 - CURSOR_LERP_60FPS, dt * 60);
        mx += (targetX - mx) * cursorLerp;
        my += (targetY - my) * cursorLerp;

        if (pointerActive) {
          presence = Math.min(1, presence + dt * 7.0);
        } else if (presence > 0) {
          fadeElapsed += dt;
          const t = Math.min(fadeElapsed / LEAVE_FADE_SECONDS, 1);
          const easeOut = 1 - t;
          presence = fadeStartPresence * easeOut * easeOut;
          if (t >= 1 || presence < 0.002) {
            presence = 0;
          }
        }
      }

      applyCardSpecularLighting();
      renderWaveformFrame(timestamp);

      rafId = window.requestAnimationFrame(tick);
    };

    const ensureLoop = () => {
      if (!isVisible || reducedMotion) return;
      if (rafId === null) {
        lastTimestamp = 0;
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const beginGracefulFade = () => {
      if (!pointerActive) return;
      pointerActive = false;
      fadeStartPresence = presence;
      fadeElapsed = 0;
      cardsDirtyRef.current = true;
      ensureLoop();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || isTouchOnly || reducedMotion) return;

      const x = event.clientX;
      const y = event.clientY;

      if (!pointerActive) {
        pointerActive = true;
        targetX = x;
        targetY = y;
        if (presence <= 0.01) {
          mx = x;
          my = y;
        }
      } else {
        targetX = x;
        targetY = y;
      }

      cardsDirtyRef.current = true;
      ensureLoop();
    };

    const handleMouseOutWindow = (event: MouseEvent) => {
      if (event.relatedTarget !== null) return;
      beginGracefulFade();
    };

    const handleScroll = () => {
      if (presence <= 0.004 || isTouchOnly || reducedMotion) return;
      cardsDirtyRef.current = true;
      applyCardSpecularLighting(true);
    };

    const handleResize = () => {
      syncCanvasSize();
      cardsDirtyRef.current = true;
      applyCardSpecularLighting(true);
      if (reducedMotion) {
        renderWaveformFrame(0);
      }
    };

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
      if (!isVisible) {
        stopLoop();
      } else {
        ensureLoop();
      }
    };

    const handleCapabilityChange = () => {
      isTouchOnly = hoverMedia.matches;
      reducedMotion = motionMedia.matches;
      if (isTouchOnly || reducedMotion) {
        pointerActive = false;
        presence = 0;
        applyCardSpecularLighting(true);
      }
      if (reducedMotion) {
        stopLoop();
        renderWaveformFrame(0);
      } else {
        ensureLoop();
      }
    };

    syncCanvasSize();
    syncCardCache();
    applyCardSpecularLighting(true);
    if (reducedMotion) {
      renderWaveformFrame(0);
    } else {
      ensureLoop();
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.documentElement.addEventListener(
      "pointerleave",
      beginGracefulFade,
      { passive: true }
    );
    window.addEventListener("mouseout", handleMouseOutWindow, { passive: true });
    window.addEventListener("blur", beginGracefulFade);
    window.addEventListener("resize", handleResize, { passive: true });
    window.addEventListener("scroll", handleScroll, {
      passive: true,
      capture: true,
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    hoverMedia.addEventListener?.("change", handleCapabilityChange);
    motionMedia.addEventListener?.("change", handleCapabilityChange);

    return () => {
      stopLoop();
      window.removeEventListener("pointermove", handlePointerMove);
      document.documentElement.removeEventListener(
        "pointerleave",
        beginGracefulFade
      );
      window.removeEventListener("mouseout", handleMouseOutWindow);
      window.removeEventListener("blur", beginGracefulFade);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, { capture: true });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      hoverMedia.removeEventListener?.("change", handleCapabilityChange);
      motionMedia.removeEventListener?.("change", handleCapabilityChange);
    };
  }, [syncCardCache]);

  const setNodeRef = useCallback((node: HTMLElement | null) => {
    containerRef.current = node;
  }, []);

  return (
    <Component
      ref={setNodeRef}
      className={`interactive-studio-backdrop relative ${className}`.trim()}
    >
      {/* Layer 1: Deep calibrated obsidian base (#07080A) with subtle studio depth */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundColor: STUDIO_BASE_BG,
          backgroundImage: [
            "radial-gradient(ellipse 80% 48% at 50% 0%, rgba(255, 255, 255, 0.028), transparent 68%)",
            "radial-gradient(ellipse 90% 50% at 50% 100%, rgba(52, 211, 153, 0.02), transparent 70%)",
          ].join(", "),
        }}
      />

      {/* Layer 2: High-DPI 60fps RGB Waveform, IRE baseline hairlines (0 / 50 / 100), & excitation */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-0"
      />

      {/* Layer 3: Subtle static cinema film-grain micro-noise (prevents 8-bit dark banding) */}
      <svg
        aria-hidden="true"
        className="fixed inset-0 h-full w-full pointer-events-none z-0"
        style={{ opacity: 0.022 }}
      >
        <filter id={noiseFilterId}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="3"
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${noiseFilterId})`} />
      </svg>

      {/* Foreground sub-page studio content (smoked-glass cards refract the live RGB waveform) */}
      <div className="relative z-10">{children}</div>

      {/* Layer 4: Sleek 130px Mini Vectorscope / Optical Loupe Ring + Live Signal Readout */}
      <div
        ref={loupeRef}
        aria-hidden="true"
        className="fixed top-0 left-0 z-[15] pointer-events-none select-none will-change-transform"
        style={{
          width: `${LOUPE_DIAMETER}px`,
          height: `${LOUPE_DIAMETER}px`,
          opacity: 0,
          transform: "translate3d(-9999px, -9999px, 0)",
        }}
      >
        <svg
          width={LOUPE_DIAMETER}
          height={LOUPE_DIAMETER}
          viewBox={`0 0 ${LOUPE_DIAMETER} ${LOUPE_DIAMETER}`}
          className="overflow-visible"
        >
          {/* Outer 1px hairline optical loupe ring */}
          <circle
            cx={LOUPE_RADIUS}
            cy={LOUPE_RADIUS}
            r={LOUPE_RADIUS - 0.5}
            fill="none"
            stroke="rgba(255, 255, 255, 0.16)"
            strokeWidth="1"
          />
          {/* Subtle inner 50% vectorscope reference ring */}
          <circle
            cx={LOUPE_RADIUS}
            cy={LOUPE_RADIUS}
            r={LOUPE_RADIUS * 0.5}
            fill="none"
            stroke="rgba(255, 255, 255, 0.055)"
            strokeWidth="0.75"
            strokeDasharray="2 3"
          />
          {/* Minimal cardinal rim ticks (3.5px) */}
          <line
            x1={LOUPE_RADIUS}
            y1={0.5}
            x2={LOUPE_RADIUS}
            y2={4.5}
            stroke="rgba(255, 255, 255, 0.22)"
            strokeWidth="1"
          />
          <line
            x1={LOUPE_RADIUS}
            y1={LOUPE_DIAMETER - 4.5}
            x2={LOUPE_RADIUS}
            y2={LOUPE_DIAMETER - 0.5}
            stroke="rgba(255, 255, 255, 0.22)"
            strokeWidth="1"
          />
          <line
            x1={0.5}
            y1={LOUPE_RADIUS}
            x2={4.5}
            y2={LOUPE_RADIUS}
            stroke="rgba(255, 255, 255, 0.22)"
            strokeWidth="1"
          />
          <line
            x1={LOUPE_DIAMETER - 4.5}
            y1={LOUPE_RADIUS}
            x2={LOUPE_DIAMETER - 0.5}
            y2={LOUPE_RADIUS}
            stroke="rgba(255, 255, 255, 0.22)"
            strokeWidth="1"
          />
          {/* Subtle Rec.709 I-line skin-tone axis tick (123 deg) */}
          <line
            x1={ILINE_X1}
            y1={ILINE_Y1}
            x2={ILINE_X2}
            y2={ILINE_Y2}
            stroke="rgba(251, 191, 36, 0.42)"
            strokeWidth="1"
            strokeDasharray="2.5 2.5"
          />
          <circle
            cx={ILINE_X2}
            cy={ILINE_Y2}
            r="1.75"
            fill="rgba(251, 191, 36, 0.72)"
          />
          {/* Live chroma balance dot responding to sampled RGB waveform */}
          <circle
            ref={vectorDotRef}
            cx={LOUPE_RADIUS}
            cy={LOUPE_RADIUS}
            r="1.8"
            fill="rgba(52, 211, 153, 0.72)"
          />
        </svg>

        {/* Tiny monospace live signal readout tucked neatly along the lower rim */}
        <div
          ref={loupeReadoutRef}
          className="absolute left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-[#07080A]/75 border border-white/[0.09] font-mono text-[9.5px] leading-tight tracking-[0.04em] text-[#E4E4E7]/80 whitespace-nowrap tabular-nums shadow-[0_4px_12px_rgba(0,0,0,0.45)]"
          style={{ top: `${LOUPE_DIAMETER + 6}px` }}
        >
          IRE 45 · OKLab 0.58
        </div>
      </div>
    </Component>
  );
}
