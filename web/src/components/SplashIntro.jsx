import React, { useState, useEffect, useRef, useCallback } from "react";
import { ArrowRight } from "lucide-react";
import KeyflowLogo from "./KeyflowLogo";

/**
 * Apple-Style Spatial Liquid Glass Interactive Intro — 4.8s Cinematic Choreography (v0.6.4 Beta)
 * - Act 1 (0.0s – 1.5s): 3 white/silver liquid droplets coalesce into the frosted glass monolith
 * - Act 2 (1.3s – 3.0s): Keyflow prism emblem blur-to-sharp spring reveal + diagonal specular light sweep
 * - Act 3 (2.6s – 4.2s): Masked vertical typography reveal (Color Match Tool, v0.6.4 Beta, subtitle, by tfbagas•)
 * - Act 4 (4.0s – 4.8s): Progress bar fills to 100% and morphs into the persistent "Enter Workstation" capsule button
 * - Never auto-closes: waits for user interaction (Click, Scroll, or Enter/Space) -> 700ms Portal Zoom-Through Exit
 */
export default function SplashIntro({ onStartExit, onComplete }) {
  // Phase: "enter" -> "compress" (110ms) -> "exit" (590ms = 700ms total portal exit)
  const [phase, setPhase] = useState("enter");
  const [progress, setProgress] = useState(0);
  const [isGateReady, setIsGateReady] = useState(false);

  // 3D Spatial Tilt & Cursor Spotlight coordinates
  const cardRef = useRef(null);
  const [spatial, setSpatial] = useState({
    rotX: 0,
    rotY: 0,
    pullX: 0,
    pullY: 0,
    spotX: 200,
    spotY: 160,
    hasMoved: false,
  });

  const exitingRef = useRef(false);
  const timersRef = useRef([]);

  const triggerPortalExit = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;

    // 110ms tactile compression (scale 0.95) -> portal zoom-through expansion (scale 1.25 + blur 24px)
    // Trigger onStartExit() simultaneously with the portal zoom-through so the workstation morphs in seamlessly
    setPhase("compress");
    const t1 = setTimeout(() => {
      setPhase("exit");
      if (onStartExit) onStartExit();
    }, 110);
    const t2 = setTimeout(() => {
      if (onComplete) onComplete();
    }, 700);
    timersRef.current.push(t1, t2);
  }, [onStartExit, onComplete]);

  // 4.8s Choreography Progress & Gate Morph Timer (Never auto-closes!)
  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setProgress(100);
      setIsGateReady(true);
    } else {
      const startTime = performance.now();
      const durationMs = 4050; // reaches 100% at ~4.05s, then morphs into Enter Workstation button (4.0s - 4.8s)
      let rafId;

      const tick = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / durationMs);
        // Smooth ease-out curve for progress readout
        const eased = 1 - Math.pow(1 - t, 2.4);
        setProgress(Math.round(eased * 100));

        if (t < 1) {
          rafId = requestAnimationFrame(tick);
        } else {
          setProgress(100);
          const readyTimer = setTimeout(() => {
            setIsGateReady(true);
          }, 120);
          timersRef.current.push(readyTimer);
        }
      };

      rafId = requestAnimationFrame(tick);
      return () => {
        cancelAnimationFrame(rafId);
      };
    }
  }, []);

  // Keyboard & Wheel Scroll Listeners (Enter, Space, or Wheel triggers Portal Exit)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        e.preventDefault();
        triggerPortalExit();
      }
    };

    const handleWheel = (e) => {
      if (Math.abs(e.deltaY) > 6 || Math.abs(e.deltaX) > 6) {
        triggerPortalExit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      timersRef.current.forEach(clearTimeout);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", handleWheel);
    };
  }, [triggerPortalExit]);

  const handleMouseMove = (e) => {
    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    const normX = (e.clientX / vw - 0.5) * 2; // -1 .. 1
    const normY = (e.clientY / vh - 0.5) * 2; // -1 .. 1

    let spotX = 200;
    let spotY = 160;
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      spotX = e.clientX - rect.left;
      spotY = e.clientY - rect.top;
    }

    setSpatial({
      rotX: Number((-normY * 6).toFixed(2)),
      rotY: Number((normX * 6).toFixed(2)),
      pullX: Number((normX * 14).toFixed(1)),
      pullY: Number((normY * 10).toFixed(1)),
      spotX: Math.round(spotX),
      spotY: Math.round(spotY),
      hasMoved: true,
    });
  };

  const stageLabel =
    progress < 34
      ? "COALESCING LIQUID OPTICS..."
      : progress < 68
      ? "CALIBRATING REC. 709 PIPELINE..."
      : progress < 99
      ? "PREPARING ACHROMATIC WORKSPACE..."
      : "WORKSTATION READY";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Color Match Tool Spatial Liquid Glass Intro"
      onClick={triggerPortalExit}
      onMouseMove={handleMouseMove}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 select-none cursor-pointer overflow-hidden transition-opacity duration-500 ${
        phase === "exit" ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{
        backgroundColor: "rgba(7, 7, 9, 0.88)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
      }}
    >
      {/* ACT 1 (0.0s - 1.5s): 3 Coalescing Monochrome Liquid Droplets & Cursor Ambient Orbs (R=G=B, 0 Color Cast) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
      >
        {/* Droplet 1: Top-Left -> Center Coalescence */}
        <div
          className="m3-droplet-1 absolute w-80 h-80"
          style={{
            background:
              "radial-gradient(circle, rgba(255, 255, 255, 0.36) 0%, rgba(235, 235, 235, 0.14) 48%, transparent 72%)",
            filter: "blur(30px)",
          }}
        />
        {/* Droplet 2: Bottom-Right -> Center Coalescence */}
        <div
          className="m3-droplet-2 absolute w-72 h-72"
          style={{
            background:
              "radial-gradient(circle, rgba(242, 242, 242, 0.30) 0%, rgba(205, 205, 205, 0.11) 50%, transparent 74%)",
            filter: "blur(32px)",
          }}
        />
        {/* Droplet 3: Top-Right -> Center Coalescence */}
        <div
          className="m3-droplet-3 absolute w-64 h-64"
          style={{
            background:
              "radial-gradient(circle, rgba(255, 255, 255, 0.32) 0%, rgba(220, 220, 220, 0.10) 45%, transparent 70%)",
            filter: "blur(26px)",
          }}
        />

        {/* Real-Time Cursor-Following Ambient Liquid Refraction Orb */}
        <div
          className="absolute w-80 h-80 rounded-full transition-transform duration-150 ease-out"
          style={{
            background:
              "radial-gradient(circle, rgba(255, 255, 255, 0.24) 0%, rgba(225, 225, 225, 0.08) 45%, transparent 70%)",
            filter: "blur(30px)",
            transform: `translate3d(${spatial.pullX * 3.4}px, ${spatial.pullY * 3.4}px, 0)`,
          }}
        />
      </div>

      {/* 3D Spatial Tilt & Magnetic Pull Wrapper (±6deg perspective(1000px)) */}
      <div
        style={{
          transform: `translate3d(${spatial.pullX}px, ${spatial.pullY}px, 0) perspective(1000px) rotateX(${spatial.rotX}deg) rotateY(${spatial.rotY}deg)`,
          transition: "transform 160ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {/* Frosted Glass Monolith Capsule */}
        <div
          ref={cardRef}
          onClick={(e) => {
            e.stopPropagation();
            triggerPortalExit();
          }}
          className={`relative w-[340px] sm:w-[410px] px-7 py-7 overflow-hidden ${
            phase === "enter"
              ? "m3-splash-capsule-enter"
              : phase === "compress"
              ? "m3-splash-capsule-compress"
              : "m3-splash-capsule-exit"
          }`}
          style={{
            background:
              "linear-gradient(155deg, rgba(255, 255, 255, 0.11) 0%, rgba(20, 20, 26, 0.64) 46%, rgba(11, 11, 15, 0.78) 100%)",
            backdropFilter: "blur(32px) saturate(110%)",
            WebkitBackdropFilter: "blur(32px) saturate(110%)",
            border: "1px solid rgba(255, 255, 255, 0.28)",
            boxShadow:
              "inset 0 1px 0 0 rgba(255, 255, 255, 0.38), inset 0 -1px 0 0 rgba(255, 255, 255, 0.08), 0 28px 72px rgba(0, 0, 0, 0.78)",
          }}
        >
          {/* Cursor-Reactive Radial Specular Spotlight Directly Under Cursor */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 transition-opacity duration-200"
            style={{
              opacity: spatial.hasMoved ? 1 : 0.65,
              background: `radial-gradient(320px circle at ${spatial.spotX}px ${spatial.spotY}px, rgba(255, 255, 255, 0.17) 0%, rgba(255, 255, 255, 0.04) 42%, transparent 70%)`,
            }}
          />

          {/* ACT 2 (1.3s - 3.0s): Diagonal Specular Light Sweep Across Glass Surface */}
          <div
            aria-hidden="true"
            className="m3-specular-sweep pointer-events-none absolute -top-24 -bottom-24 left-0 w-28"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.22) 50%, transparent 100%)",
              filter: "blur(8px)",
            }}
          />

          <div className="relative z-10 flex flex-col items-center text-center">
            {/* ACT 2 (1.3s - 3.0s): Keyflow Prism Emblem Blur-to-Sharp + Spring Scale */}
            <div className="m3-prism-reveal mb-4 p-1.5 rounded-2xl bg-white/[0.05] border border-white/[0.16] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_10px_28px_rgba(0,0,0,0.45)]">
              <KeyflowLogo size={52} />
            </div>

            {/* ACT 3 (2.6s - 4.2s): Masked Vertical Typography & Feature Pill Reveal */}
            {/* 1. Title + v0.6.4 Beta Pill (2.6s) */}
            <div className="overflow-hidden py-0.5">
              <div
                className="m3-masked-reveal flex items-center justify-center gap-2 flex-wrap"
                style={{ animationDelay: "2600ms" }}
              >
                <h2 className="text-lg sm:text-xl font-bold font-display tracking-tight text-[#E2E4E9]">
                  Color Match Tool
                </h2>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-white/[0.08] text-[#E2E4E9] border border-white/[0.2] shadow-inner">
                  v0.6.4 Beta
                </span>
              </div>
            </div>

            {/* 2. Subtitle (3.0s) */}
            <div className="overflow-hidden mt-1 py-0.5">
              <p
                className="m3-masked-reveal text-xs text-[#9CA3AF] tracking-wide"
                style={{ animationDelay: "3000ms" }}
              >
                Rec. 709 Achromatic Grading Workstation
              </p>
            </div>

            {/* 3. Feature Capability Micro-Pills (3.35s) */}
            <div className="overflow-hidden mt-3 py-0.5">
              <div
                className="m3-masked-reveal flex flex-wrap items-center justify-center gap-1.5"
                style={{ animationDelay: "3350ms" }}
              >
                {["R=G=B Zero Cast", "Web Worker 60fps", "Native .kfplug"].map(
                  (tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.04] text-[#9CA3AF] border border-white/[0.09]"
                    >
                      {tag}
                    </span>
                  )
                )}
              </div>
            </div>

            {/* 4. Developer Badge by tfbagas• (3.7s) */}
            <div className="overflow-hidden mt-3 py-0.5">
              <div
                className="m3-masked-reveal inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.045] border border-white/[0.12] text-[11px] font-mono text-[#9CA3AF]"
                style={{ animationDelay: "3700ms" }}
              >
                <span>by</span>
                <span className="font-sans font-extrabold tracking-tight text-[#E2E4E9]">
                  tfbagas
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#E2E4E9] -ml-1 -mt-1.5" />
              </div>
            </div>

            {/* ACT 4 (4.0s - 4.8s): Progress Bar -> Interactive "Enter Workstation" Gate Morph */}
            <div className="w-full mt-6 min-h-[64px] flex flex-col items-center justify-center">
              {!isGateReady ? (
                <div className="w-full space-y-2 transition-all duration-300">
                  <div className="h-1.5 w-full rounded-full bg-white/[0.08] border border-white/[0.08] overflow-hidden p-[1px]">
                    <div
                      className="h-full rounded-full bg-[#E2E4E9] shadow-[0_0_12px_rgba(255,255,255,0.65)] transition-[width] duration-75 ease-out"
                      style={{ width: `${Math.max(4, progress)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[#9CA3AF]/80 px-0.5">
                    <span>{stageLabel}</span>
                    <span className="text-[#E2E4E9] font-semibold">
                      {progress}%
                    </span>
                  </div>
                </div>
              ) : (
                <div className="w-full flex flex-col items-center m3-tab-enter">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerPortalExit();
                    }}
                    className="m3-btn-morph group relative w-full py-2.5 px-5 rounded-full bg-[#E2E4E9] hover:bg-white text-[#070709] font-semibold text-xs flex items-center justify-center gap-2 shadow-[0_0_28px_rgba(255,255,255,0.28),inset_0_1px_0_rgba(255,255,255,0.9)] overflow-hidden cursor-pointer"
                  >
                    {/* Continuous Shimmer Sweep */}
                    <span
                      aria-hidden="true"
                      className="m3-cta-shimmer pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-transparent via-white/75 to-transparent"
                    />
                    <span className="relative z-10 tracking-tight">
                      Enter Workstation
                    </span>
                    <ArrowRight className="relative z-10 w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                  </button>

                  <span className="mt-2 text-[10px] font-mono text-[#9CA3AF]/75 tracking-wide">
                    Click, Scroll, or Press Enter
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
