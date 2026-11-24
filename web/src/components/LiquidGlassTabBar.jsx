import React, { useRef, useEffect, useLayoutEffect, useId, useCallback } from "react";

const REST_SCALE = 1;
const PRESSED_SCALE = 1.12;

const DRAG_STIFFNESS = 620;
const DRAG_DAMPING = 42;
const RELEASE_STIFFNESS = 380;
const RELEASE_DAMPING = 28;
const SCALE_STIFFNESS = 440;
const SCALE_DAMPING = 28;

const DRAG_THRESHOLD_PX = 4;

// Base muted slate (#94A3B8) -> Crisp white (#F8FAFC) under convex lens
const MUTED_RGB = [148, 163, 184];
const BRIGHT_RGB = [248, 250, 252];

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function triggerHapticPulse() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(6);
    } catch {
      // Ignore environments where Vibration API is blocked or unsupported
    }
  }
}

export default function LiquidGlassTabBar({
  tabs,
  activeTabId,
  onPreviewTab,
  onCommitTab,
  ariaLabel = "Mobile studio navigation",
}) {
  const rawId = useId();
  const refractFilterId = `lg-refract-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const trackRef = useRef(null);
  const lensRef = useRef(null);
  const lensCoreRef = useRef(null);
  const lensRimRef = useRef(null);
  const lensCausticRef = useRef(null);

  const buttonRefs = useRef([]);
  const opticalRefs = useRef([]);
  const iconRefs = useRef([]);
  const labelRefs = useRef([]);

  // Cached layout measurements (relative to trackRef)
  const metricsRef = useRef({
    ready: false,
    trackWidth: 0,
    slotWidth: 0,
    centers: [],
    lefts: [],
  });

  // rAF physics state (mutated directly at 60/120fps without React re-renders)
  const physicsRef = useRef({
    rafId: 0,
    lastTime: 0,
    x: 0,
    vx: 0,
    targetX: 0,
    scale: REST_SCALE,
    vScale: 0,
    targetScale: REST_SCALE,
    stretch: 0,
    pressed: 0,
    causticPct: 50,
    pointerVx: 0,
    isPointerDown: false,
    isDragging: false,
    activePointerId: null,
    startClientX: 0,
    lastClientX: 0,
    lastPointerTime: 0,
    fingerLocalX: 0,
    lastCrossedIndex: -1,
    activeIndex: 0,
    suppressClickUntil: 0,
    reducedMotion: false,
  });

  const tabsRef = useRef(tabs);
  const onPreviewTabRef = useRef(onPreviewTab);
  const onCommitTabRef = useRef(onCommitTab);

  useLayoutEffect(() => {
    tabsRef.current = tabs;
    onPreviewTabRef.current = onPreviewTab;
    onCommitTabRef.current = onCommitTab;
  }, [tabs, onPreviewTab, onCommitTab]);

  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeTabId)
  );

  // Measure tab slot geometry relative to trackRef
  const measureTrack = useCallback(() => {
    const track = trackRef.current;
    if (!track) return false;
    const trackWidth = track.clientWidth;
    if (trackWidth <= 0) return false;

    const count = tabsRef.current.length;
    if (count === 0) return false;

    const centers = [];
    const lefts = [];
    let measuredSlotWidth = trackWidth / count;

    for (let i = 0; i < count; i++) {
      const btn = buttonRefs.current[i];
      if (btn && btn.offsetWidth > 0) {
        lefts.push(btn.offsetLeft);
        centers.push(btn.offsetLeft + btn.offsetWidth * 0.5);
        if (i === 0) measuredSlotWidth = btn.offsetWidth;
      } else {
        const w = trackWidth / count;
        lefts.push(i * w);
        centers.push((i + 0.5) * w);
      }
    }

    metricsRef.current = {
      ready: true,
      trackWidth,
      slotWidth: measuredSlotWidth,
      centers,
      lefts,
    };

    if (lensRef.current) {
      lensRef.current.style.width = `${measuredSlotWidth}px`;
    }

    return true;
  }, []);

  // Apply visual transforms, caustic tracking, and convex lens magnification to DOM
  const paintFrame = useCallback(() => {
    const m = metricsRef.current;
    const p = physicsRef.current;
    const lens = lensRef.current;
    if (!m.ready || !lens) return;

    const leftPx = p.x - m.slotWidth * 0.5;
    const stretchFactor = p.reducedMotion ? 0 : p.stretch;
    const scaleBase = p.reducedMotion ? REST_SCALE : p.scale;

    // Velocity-proportional fluid stretch: horizontal expansion + volume-conserving vertical squeeze
    const scaleX = scaleBase * (1 + stretchFactor * 0.16);
    const scaleY = scaleBase * (1 - stretchFactor * 0.075);

    lens.style.opacity = "1";
    lens.style.transform = `translate3d(${leftPx.toFixed(2)}px, 0, 0) scale3d(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)}, 1)`;

    const pressNorm = p.reducedMotion ? (p.isPointerDown ? 1 : 0) : clamp(p.pressed, 0, 1);

    if (lensCoreRef.current) {
      lensCoreRef.current.style.setProperty("--lg-press", pressNorm.toFixed(3));
    }
    if (lensRimRef.current) {
      lensRimRef.current.style.opacity = (0.68 + pressNorm * 0.32).toFixed(3);
    }
    if (lensCausticRef.current) {
      lensCausticRef.current.style.setProperty("--caustic-x", `${p.causticPct.toFixed(1)}%`);
      lensCausticRef.current.style.setProperty("--lg-press", pressNorm.toFixed(3));
    }

    // Optical convex magnification + color brightening (#94A3B8 -> #F8FAFC) on covered tabs
    const radius = Math.max(m.slotWidth * 0.74, 1);
    const count = m.centers.length;
    for (let i = 0; i < count; i++) {
      const dist = Math.abs(p.x - m.centers[i]);
      const proximity = smoothstep(radius, 0, dist);

      const opticalEl = opticalRefs.current[i];
      if (opticalEl) {
        if (p.reducedMotion) {
          opticalEl.style.transform = "scale3d(1, 1, 1)";
        } else {
          const magScale = 1 + proximity * 0.08;
          opticalEl.style.transform = `scale3d(${magScale.toFixed(4)}, ${magScale.toFixed(4)}, 1)`;
        }
      }

      const r = Math.round(MUTED_RGB[0] + (BRIGHT_RGB[0] - MUTED_RGB[0]) * proximity);
      const g = Math.round(MUTED_RGB[1] + (BRIGHT_RGB[1] - MUTED_RGB[1]) * proximity);
      const b = Math.round(MUTED_RGB[2] + (BRIGHT_RGB[2] - MUTED_RGB[2]) * proximity);
      const colorCss = `rgb(${r}, ${g}, ${b})`;

      const labelEl = labelRefs.current[i];
      if (labelEl) {
        labelEl.style.color = colorCss;
      }

      const iconEl = iconRefs.current[i];
      if (iconEl) {
        iconEl.style.color = colorCss;
        iconEl.style.filter =
          proximity > 0.15
            ? `drop-shadow(0 0 ${(proximity * 7).toFixed(1)}px rgba(56, 189, 248, ${(proximity * 0.52).toFixed(2)}))`
            : "none";
      }
    }
  }, []);

  const findNearestTabIndex = useCallback((localX) => {
    const centers = metricsRef.current.centers;
    if (!centers.length) return 0;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < centers.length; i++) {
      const d = Math.abs(localX - centers[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }, []);

  const clampWithRubberBand = useCallback((rawX) => {
    const centers = metricsRef.current.centers;
    if (!centers.length) return rawX;
    const minX = centers[0];
    const maxX = centers[centers.length - 1];
    if (rawX < minX) {
      return minX + (rawX - minX) * 0.22;
    }
    if (rawX > maxX) {
      return maxX + (rawX - maxX) * 0.22;
    }
    return rawX;
  }, []);

  // Start or continue the 60/120fps spring rAF loop
  const ensureAnimationLoop = useCallback(() => {
    const p = physicsRef.current;
    if (p.rafId) return;

    p.lastTime = performance.now();

    const step = (now) => {
      const dt = Math.min(Math.max((now - p.lastTime) / 1000, 0.001), 0.032);
      p.lastTime = now;

      if (p.reducedMotion) {
        p.x = p.targetX;
        p.vx = 0;
        p.scale = REST_SCALE;
        p.vScale = 0;
        p.stretch = 0;
        p.pressed = p.isPointerDown ? 1 : 0;
        paintFrame();
        p.rafId = 0;
        return;
      }

      // Decay pointerVx smoothly if the user holds their finger still
      if (p.isPointerDown) {
        const idleMs = now - p.lastPointerTime;
        if (idleMs > 32) {
          p.pointerVx *= Math.exp(-16 * dt);
        }
      } else {
        p.pointerVx *= Math.exp(-18 * dt);
      }

      // Position spring
      const posK = p.isDragging ? DRAG_STIFFNESS : RELEASE_STIFFNESS;
      const posC = p.isDragging ? DRAG_DAMPING : RELEASE_DAMPING;
      const ax = posK * (p.targetX - p.x) - posC * p.vx;
      p.vx += ax * dt;
      p.x += p.vx * dt;

      // Inflation scale spring (1.0 <-> 1.12)
      const aScale = SCALE_STIFFNESS * (p.targetScale - p.scale) - SCALE_DAMPING * p.vScale;
      p.vScale += aScale * dt;
      p.scale += p.vScale * dt;

      // Velocity-proportional fluid stretch
      const effectiveVx = p.isDragging
        ? Math.max(Math.abs(p.pointerVx), Math.abs(p.vx) * 0.85)
        : Math.abs(p.vx);
      const targetStretch = clamp(effectiveVx / 1350, 0, 1);
      const stretchRate = targetStretch > p.stretch ? 22 : 12;
      p.stretch += (targetStretch - p.stretch) * (1 - Math.exp(-stretchRate * dt));

      // Pressed specular intensity ramp
      const targetPressed = p.isPointerDown ? 1 : 0;
      p.pressed += (targetPressed - p.pressed) * (1 - Math.exp(-18 * dt));

      // Caustic highlight tracks finger offset inside the droplet
      const m = metricsRef.current;
      if (m.slotWidth > 0) {
        const desiredCaustic = p.isPointerDown
          ? clamp(50 + ((p.fingerLocalX - p.x) / m.slotWidth) * 68, 14, 86)
          : clamp(50 + (p.vx / 1400) * 28, 22, 78);
        p.causticPct += (desiredCaustic - p.causticPct) * (1 - Math.exp(-20 * dt));
      }

      paintFrame();

      // Check settle condition when pointer is released
      const posSettled = Math.abs(p.targetX - p.x) < 0.08 && Math.abs(p.vx) < 0.5;
      const scaleSettled = Math.abs(p.targetScale - p.scale) < 0.0008 && Math.abs(p.vScale) < 0.005;
      const stretchSettled = p.stretch < 0.002;
      const pressSettled = Math.abs(targetPressed - p.pressed) < 0.004;

      if (!p.isPointerDown && posSettled && scaleSettled && stretchSettled && pressSettled) {
        p.x = p.targetX;
        p.vx = 0;
        p.scale = p.targetScale;
        p.vScale = 0;
        p.stretch = 0;
        p.pressed = 0;
        p.causticPct = 50;
        paintFrame();
        p.rafId = 0;
        return;
      }

      p.rafId = requestAnimationFrame(step);
    };

    p.rafId = requestAnimationFrame(step);
  }, [paintFrame]);

  // Sync reduced-motion media query
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    physicsRef.current.reducedMotion = mq.matches;
    const onChange = (e) => {
      physicsRef.current.reducedMotion = e.matches;
      paintFrame();
    };
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    return undefined;
  }, [paintFrame]);

  // Initial measurement + ResizeObserver + font-load sync
  useLayoutEffect(() => {
    const syncLayout = (snapImmediately = false) => {
      if (!measureTrack()) return;
      const m = metricsRef.current;
      const p = physicsRef.current;
      const targetCenter = m.centers[p.activeIndex] ?? m.centers[0] ?? 0;

      if (snapImmediately || !p.isPointerDown) {
        p.targetX = targetCenter;
        if (snapImmediately || p.rafId === 0) {
          p.x = targetCenter;
          p.vx = 0;
          paintFrame();
        }
      }
    };

    const initialIdx = Math.max(
      0,
      tabsRef.current.findIndex((t) => t.id === activeTabId)
    );
    physicsRef.current.activeIndex = initialIdx;
    syncLayout(true);

    const track = trackRef.current;
    let ro;
    if (typeof ResizeObserver !== "undefined" && track) {
      ro = new ResizeObserver(() => syncLayout(false));
      ro.observe(track);
    }

    const onResize = () => syncLayout(false);
    window.addEventListener("resize", onResize, { passive: true });

    let cancelled = false;
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) syncLayout(false);
      });
    }

    return () => {
      cancelled = true;
      if (ro) ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
    // Initial geometry setup & resize tracking; activeTabId transitions animate in the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureTrack, paintFrame]);

  // Animate droplet whenever activeTabId changes externally (tap, keyboard, or LooksDrawer closing)
  useEffect(() => {
    const p = physicsRef.current;
    p.activeIndex = activeIndex;
    if (p.isDragging) return;

    const m = metricsRef.current;
    if (!m.ready) {
      if (!measureTrack()) return;
    }

    const targetCenter = metricsRef.current.centers[activeIndex];
    if (typeof targetCenter !== "number") return;

    p.targetX = targetCenter;
    if (Math.abs(p.x - targetCenter) > 0.25 || p.rafId) {
      ensureAnimationLoop();
    } else {
      p.x = targetCenter;
      paintFrame();
    }
  }, [activeIndex, measureTrack, ensureAnimationLoop, paintFrame]);

  // Cleanup rAF on unmount
  useEffect(() => {
    const phys = physicsRef.current;
    return () => {
      if (phys.rafId) {
        cancelAnimationFrame(phys.rafId);
        phys.rafId = 0;
      }
    };
  }, []);

  const handlePointerDown = useCallback(
    (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;

      const track = trackRef.current;
      if (!track) return;

      measureTrack();
      const m = metricsRef.current;
      if (!m.ready) return;

      const rect = track.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const clampedX = clampWithRubberBand(localX);
      const hitIdx = findNearestTabIndex(localX);

      const p = physicsRef.current;
      p.isPointerDown = true;
      p.isDragging = false;
      p.activePointerId = e.pointerId;
      p.startClientX = e.clientX;
      p.lastClientX = e.clientX;
      p.lastPointerTime = performance.now();
      p.pointerVx = 0;
      p.fingerLocalX = clampedX;
      p.lastCrossedIndex = hitIdx;
      p.targetScale = PRESSED_SCALE;

      // Immediately glide inflated droplet toward pressed slot for tactile responsiveness
      p.targetX = m.centers[hitIdx] ?? clampedX;

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture is unavailable in synthetic tests
      }

      ensureAnimationLoop();
    },
    [measureTrack, clampWithRubberBand, findNearestTabIndex, ensureAnimationLoop]
  );

  const handlePointerMove = useCallback(
    (e) => {
      const p = physicsRef.current;
      if (!p.isPointerDown || p.activePointerId !== e.pointerId) return;

      const track = trackRef.current;
      const m = metricsRef.current;
      if (!track || !m.ready) return;

      const now = performance.now();
      const dtMs = Math.max(now - p.lastPointerTime, 1);
      const dxFrame = e.clientX - p.lastClientX;
      const instVx = (dxFrame / dtMs) * 1000;

      // Smoothed exponential moving average of pointer horizontal velocity
      p.pointerVx = p.pointerVx * 0.55 + instVx * 0.45;
      p.lastClientX = e.clientX;
      p.lastPointerTime = now;

      const totalDragDist = Math.abs(e.clientX - p.startClientX);
      if (!p.isDragging && totalDragDist > DRAG_THRESHOLD_PX) {
        p.isDragging = true;
      }

      const rect = track.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const clampedX = clampWithRubberBand(localX);
      p.fingerLocalX = clampedX;

      if (p.isDragging) {
        p.targetX = clampedX;

        // Live tab boundary crossing detection + subtle haptic tick
        const crossedIdx = findNearestTabIndex(localX);
        if (crossedIdx !== p.lastCrossedIndex) {
          p.lastCrossedIndex = crossedIdx;
          triggerHapticPulse();
          const crossedTab = tabsRef.current[crossedIdx];
          if (crossedTab && onPreviewTabRef.current) {
            onPreviewTabRef.current(crossedTab.id);
          }
        }
      }

      ensureAnimationLoop();
    },
    [clampWithRubberBand, findNearestTabIndex, ensureAnimationLoop]
  );

  const finishPointerGesture = useCallback(
    (e, isCancel) => {
      const p = physicsRef.current;
      if (!p.isPointerDown || p.activePointerId !== e.pointerId) return;

      const wasDragging = p.isDragging;
      const releaseVx = p.pointerVx;

      p.isPointerDown = false;
      p.isDragging = false;
      p.activePointerId = null;
      p.targetScale = REST_SCALE;
      p.suppressClickUntil = performance.now() + 400;

      try {
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore release errors
      }

      const track = trackRef.current;
      const m = metricsRef.current;
      if (!track || !m.ready) {
        ensureAnimationLoop();
        return;
      }

      if (isCancel) {
        p.targetX = m.centers[p.activeIndex] ?? m.centers[0] ?? 0;
        ensureAnimationLoop();
        return;
      }

      const rect = track.getBoundingClientRect();
      const localX = e.clientX - rect.left;

      let targetIdx;
      if (wasDragging) {
        // Project slight flick velocity to resolve the intended landing tab
        const flickProjection = clamp(releaseVx * 0.085, -m.slotWidth * 0.65, m.slotWidth * 0.65);
        const projectedX = clamp(
          localX + flickProjection,
          m.centers[0],
          m.centers[m.centers.length - 1]
        );
        targetIdx = findNearestTabIndex(projectedX);

        // Haptic confirmation if flick velocity carried across one more boundary
        if (targetIdx !== p.lastCrossedIndex) {
          triggerHapticPulse();
        }

        // Carry subtle damped momentum into the critically damped settle spring
        p.vx = clamp(releaseVx * 0.32, -1100, 1100);
      } else {
        targetIdx = findNearestTabIndex(localX);
        if (targetIdx !== p.activeIndex) {
          triggerHapticPulse();
        }
      }

      const chosenTab = tabsRef.current[targetIdx];
      p.activeIndex = targetIdx;
      p.targetX = m.centers[targetIdx] ?? m.centers[0] ?? 0;

      if (chosenTab && onCommitTabRef.current) {
        onCommitTabRef.current(chosenTab.id, { isTap: !wasDragging });
      }

      ensureAnimationLoop();
    },
    [findNearestTabIndex, ensureAnimationLoop]
  );

  const handlePointerUp = useCallback(
    (e) => finishPointerGesture(e, false),
    [finishPointerGesture]
  );

  const handlePointerCancel = useCallback(
    (e) => finishPointerGesture(e, true),
    [finishPointerGesture]
  );

  const handleLostPointerCapture = useCallback(
    (e) => {
      if (physicsRef.current.isPointerDown) {
        finishPointerGesture(e, true);
      }
    },
    [finishPointerGesture]
  );

  // Keyboard accessibility (Tab + ArrowLeft / ArrowRight / Home / End + Enter / Space)
  const handleButtonClick = useCallback((tabId, idx) => {
    const p = physicsRef.current;
    // Pointer interactions already committed on pointerup; prevent double-toggling (e.g. Looks drawer)
    if (performance.now() < p.suppressClickUntil) return;

    p.activeIndex = idx;
    const targetCenter = metricsRef.current.centers[idx];
    if (typeof targetCenter === "number") {
      p.targetX = targetCenter;
      ensureAnimationLoop();
    }
    onCommitTabRef.current?.(tabId, { isTap: true });
  }, [ensureAnimationLoop]);

  const handleKeyDown = useCallback(
    (e, idx) => {
      const count = tabsRef.current.length;
      if (count === 0) return;
      let nextIdx = null;
      if (e.key === "ArrowRight") nextIdx = (idx + 1) % count;
      else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + count) % count;
      else if (e.key === "Home") nextIdx = 0;
      else if (e.key === "End") nextIdx = count - 1;

      if (nextIdx !== null) {
        e.preventDefault();
        buttonRefs.current[nextIdx]?.focus();
        const nextTab = tabsRef.current[nextIdx];
        if (nextTab) {
          physicsRef.current.activeIndex = nextIdx;
          const targetCenter = metricsRef.current.centers[nextIdx];
          if (typeof targetCenter === "number") {
            physicsRef.current.targetX = targetCenter;
            ensureAnimationLoop();
          }
          onCommitTabRef.current?.(nextTab.id, { isTap: true });
        }
      }
    },
    [ensureAnimationLoop]
  );

  return (
    <nav
      aria-label={ariaLabel}
      data-testid="mobile-liquid-glass-nav"
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-x-0 bottom-4 z-[60] lg:hidden px-3 pb-[env(safe-area-inset-bottom)] flex justify-center pointer-events-none overflow-visible"
    >
      {/* Hidden SVG optical refraction filter scoped exclusively to the Liquid Lens rim */}
      <svg
        aria-hidden="true"
        focusable="false"
        className="pointer-events-none absolute w-0 h-0 overflow-hidden"
      >
        <defs>
          <filter
            id={refractFilterId}
            x="-18%"
            y="-30%"
            width="136%"
            height="160%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.032 0.065"
              numOctaves="2"
              seed="11"
              result="liquidNoise"
            />
            <feGaussianBlur in="liquidNoise" stdDeviation="1.1" result="smoothNoise" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="smoothNoise"
              scale="2.6"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      {/* Outer Floating Dock Shell (no ancestor transform; overflow-visible so inflated lens never clips) */}
      <div
        className="liquid-glass-dock pointer-events-auto relative w-full max-w-[404px] rounded-full p-1 select-none touch-none overflow-visible"
      >
        {/* Dedicated Isolated Backdrop Layer (clipped rounded-full with zero transformed/SVG children so backdrop-filter reliably blurs underlying scroll content on iOS Safari & Android Chrome) */}
        <div
          aria-hidden="true"
          data-testid="liquid-glass-dock-backdrop"
          className="liquid-glass-dock-backdrop pointer-events-none absolute inset-0 rounded-full overflow-hidden"
        >
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.07)_0%,rgba(9,11,16,0.08)_54%,rgba(56,189,248,0.045)_100%)]" />
        </div>

        {/* Interactive 5-Slot Tab Track with Full Pointer Capture (sibling above frosted backdrop) */}
        <div
          ref={trackRef}
          role="tablist"
          aria-label={ariaLabel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onLostPointerCapture={handleLostPointerCapture}
          className="relative z-10 grid grid-cols-5 items-center overflow-visible touch-none select-none"
        >
          {/* ACTIVE LIQUID LENS ("Glass Droplet") behind tab items */}
          <div
            ref={lensRef}
            aria-hidden="true"
            data-testid="liquid-glass-lens"
            className="pointer-events-none absolute top-0 bottom-0 left-0 z-[1] rounded-full opacity-0 origin-center will-change-transform overflow-visible"
          >
            {/* Layer 1: Internal top-down glass sheen, bright specular edge & Cyan chromatic glow */}
            <div
              ref={lensCoreRef}
              className="liquid-glass-lens-core absolute inset-0 rounded-full"
            />

            {/* Layer 2: SVG Optical Refraction Filter applied ONLY on the meniscus rim */}
            <div
              ref={lensRimRef}
              style={{ filter: `url(#${refractFilterId})` }}
              className="liquid-glass-lens-rim absolute -inset-[1px] rounded-full"
            />

            {/* Layer 3: Dynamic Finger-Tracking Radial Caustic Highlight */}
            <div
              ref={lensCausticRef}
              className="liquid-glass-lens-caustic absolute inset-0 rounded-full overflow-hidden"
            />

            {/* Layer 4: Crisp Top Specular Meniscus Glint with Sky-Cyan Rim */}
            <div className="pointer-events-none absolute inset-x-3 top-[1px] h-[1px] rounded-full bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.58)_28%,rgba(255,255,255,0.88)_50%,rgba(56,189,248,0.48)_76%,transparent_100%)] opacity-90" />
          </div>

          {/* 5 Tab Items */}
          {tabs.map((tab, idx) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTabId;

            return (
              <button
                key={tab.id}
                ref={(el) => {
                  buttonRefs.current[idx] = el;
                }}
                type="button"
                role="tab"
                draggable={false}
                data-tab-id={tab.id}
                aria-selected={isActive}
                aria-current={isActive ? "page" : undefined}
                onClick={() => handleButtonClick(tab.id, idx)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                className="relative z-10 min-h-[48px] rounded-full flex flex-col items-center justify-center px-1 py-1.5 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#38BDF8]"
              >
                <span
                  ref={(el) => {
                    opticalRefs.current[idx] = el;
                  }}
                  className="flex flex-col items-center justify-center gap-1 will-change-transform pointer-events-none"
                >
                  <span
                    ref={(el) => {
                      iconRefs.current[idx] = el;
                    }}
                    className="inline-flex items-center justify-center text-[#94A3B8]"
                  >
                    <Icon
                      className="w-[17px] h-[17px] shrink-0"
                      strokeWidth={1.65}
                      aria-hidden="true"
                    />
                  </span>
                  <span
                    ref={(el) => {
                      labelRefs.current[idx] = el;
                    }}
                    className="font-sans text-[10.5px] font-medium leading-none truncate tracking-[0.01em] text-[#94A3B8]"
                  >
                    {tab.label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
