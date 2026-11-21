import React, { useState, useEffect, useRef, useCallback } from "react";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import IntroProScopesCanvas from "./IntroProScopesCanvas";
import { ToneBenchCubeSvg } from "./BrandLogo";

const LUMINANCE_STEPS = [
  { ire: 0, hex: "#0A0B0E" },
  { ire: 11, hex: "#16181D" },
  { ire: 22, hex: "#252830" },
  { ire: 33, hex: "#373B45" },
  { ire: 44, hex: "#4C515D" },
  { ire: 56, hex: "#656B79" },
  { ire: 67, hex: "#828897" },
  { ire: 78, hex: "#A1A7B5" },
  { ire: 89, hex: "#C5CAD5" },
  { ire: 100, hex: "#ECEEF2" },
];

const REC709_TICKS = [
  { id: "R", name: "Rec.709 Red", hex: "#B64A54" },
  { id: "Y", name: "Rec.709 Yellow", hex: "#B59C4E" },
  { id: "G", name: "Rec.709 Green", hex: "#4B9770" },
  { id: "C", name: "Rec.709 Cyan", hex: "#4B8C9E" },
  { id: "B", name: "Rec.709 Blue", hex: "#4E6EA8" },
  { id: "M", name: "Rec.709 Magenta", hex: "#945988" },
];

const SOLVER_TIERS = [
  { id: "altair45", label: "Altair 4.5 Refresh", active: true },
  { id: "altair4", label: "Altair 4.0", active: false },
  { id: "polaris", label: "Polaris 3.5", active: false },
];

/**
 * Cinema Viewfinder, Phosphor Pro Scopes & Unhurried 3.2s Boot Splash (v0.9.5)
 * Precision color-grading instrument intro inspired by DaVinci Resolve,
 * Apple Pro Display XDR, and Tektronix broadcast scopes:
 *  - Full-viewport phosphor-style Pro Scopes canvas with 1500ms L->R oscilloscope beam sweep
 *    across RGB Parade (#F43F5E / #34D399 / #38BDF8) + 380px Vectorscope reticle & IRE graticules
 *  - Unhurried 0ms -> 3200ms cinema shutter & optical calibration choreography (cubic-bezier(0.16, 1, 0.3, 1))
 *  - Exclusive CTA ("Open Studio ->") and Enter / Space dismissal with silky 350ms fade-scale exit;
 *    clicking the background never dismisses the intro so users can freely test the Pro Scopes cursor probe
 */
export default function IntroScreen({ onStartExit, onComplete }) {
  const { t } = useLanguage();
  const [isExiting, setIsExiting] = useState(false);

  const stageRef = useRef(null);
  const calibBezelRef = useRef(null);
  const emblemBezelRef = useRef(null);
  const exitingRef = useRef(false);
  const timersRef = useRef([]);

  const triggerExit = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;

    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    setIsExiting(true);
    if (onStartExit) onStartExit();

    if (reducedMotion) {
      if (onComplete) onComplete();
      return;
    }

    const tmr = setTimeout(() => {
      if (onComplete) onComplete();
    }, 380);
    timersRef.current.push(tmr);
  }, [onStartExit, onComplete]);

  // Capture-phase keyboard dismissal (Enter / Space only, when no input is focused)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;

      const active = document.activeElement;
      const tag = active?.tagName?.toUpperCase();
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        active?.isContentEditable
      ) {
        return;
      }

      if (e.key === "Enter" || e.key === " " || e.code === "Space") {
        e.preventDefault();
        e.stopPropagation();
        triggerExit();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    const activeTimers = timersRef.current;
    return () => {
      activeTimers.forEach(clearTimeout);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [triggerExit]);

  return (
    <div
      ref={stageRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("intro.dialogLabel")}
      className="fixed inset-0 z-50 w-screen h-dvh text-zinc-100 select-none overflow-hidden cursor-default"
      style={{
        "--mx": "50vw",
        "--my": "44vh",
        "--sweep-pct": "50%",
        "--cursor-presence": "0",
        pointerEvents: isExiting ? "none" : "auto",
      }}
    >
      <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
        {/* Background Layer: Obsidian Canvas + Phosphor Pro Scopes + Vignette (fades smoothly 340ms on exit) */}
        <div
          className={`absolute inset-0 z-0 bg-[#060709] ${
            isExiting ? "intro-exit-bg" : ""
          }`}
        >
          {/* Layer 0: Full-Viewport Authentic Phosphor-Style Pro Scopes Canvas (450ms - 1950ms L->R Oscilloscope Sweep) */}
          <IntroProScopesCanvas
            stageRef={stageRef}
            calibBezelRef={calibBezelRef}
            emblemBezelRef={emblemBezelRef}
          />

          {/* Layer 1: Smooth Dark Center Readability Vignette & Monochrome Cursor Specular */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1]">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 52% 48% at 50% 50%, rgba(6,7,9,0.90) 0%, rgba(6,7,9,0.48) 65%, transparent 100%)",
              }}
            />
            <div
              className="absolute inset-0 transition-opacity duration-300"
              style={{
                opacity: "var(--cursor-presence, 0)",
                background:
                  "radial-gradient(520px circle at var(--mx, 50%) var(--my, 44%), rgba(255, 255, 255, 0.028), rgba(255, 255, 255, 0.006) 40%, transparent 70%)",
              }}
            />
          </div>
        </div>

        {/* Beat 1 (300ms - 950ms): Dual Cinema Shutter Curtains & Horizon Line (z-[12], behind hero text so LCP paints unoccluded at t=0) */}
        <div
          className={`pointer-events-none absolute inset-0 z-[12] ${
            isExiting ? "intro-exit-chrome" : ""
          }`}
        >
          {/* Beat 1 (300ms - 950ms): Dual Dark Obsidian Cinema Shutter Curtains Parting Upward & Downward */}
          <div
            aria-hidden="true"
            className="intro-shutter-top pointer-events-none absolute top-0 inset-x-0 h-1/2 bg-[#060709] border-b border-white/[0.06] z-[12]"
          />
          <div
            aria-hidden="true"
            className="intro-shutter-bottom pointer-events-none absolute bottom-0 inset-x-0 h-1/2 bg-[#060709] border-t border-white/[0.06] z-[12]"
          />

          {/* Beat 1 (0ms - 450ms expand, 450ms - 950ms dissolve): Razor-Thin 1px Silver Optical Horizon Line */}
          <div
            aria-hidden="true"
            className="intro-horizon-wrap pointer-events-none absolute top-1/2 -mt-[0.5px] inset-x-0 h-px z-[15]"
          >
            <div className="intro-horizon-scanline w-full h-full" />
          </div>
        </div>

        {/* Viewfinder & Telemetry Chrome Layer (fades cleanly on exit without fighting boot keyframes) */}
        <div
          className={`pointer-events-none absolute inset-0 z-[25] ${
            isExiting ? "intro-exit-chrome" : ""
          }`}
        >

          {/* Beat 1 (100ms - 950ms): Cinema Viewfinder Registration Marks (4 Corner L-Brackets scale 1.06 -> 1) */}
          <div
            aria-hidden="true"
            className="intro-vf-frame pointer-events-none absolute inset-6 z-[30]"
          >
            {/* Top-Left L-Bracket */}
            <span className="absolute top-0 left-0 w-[20px] h-[20px] border-t border-l border-white/[0.18]" />
            {/* Top-Right L-Bracket */}
            <span className="absolute top-0 right-0 w-[20px] h-[20px] border-t border-r border-white/[0.18]" />
            {/* Bottom-Left L-Bracket */}
            <span className="absolute bottom-0 left-0 w-[20px] h-[20px] border-b border-l border-white/[0.18]" />
            {/* Bottom-Right L-Bracket */}
            <span className="absolute bottom-0 right-0 w-[20px] h-[20px] border-b border-r border-white/[0.18]" />

            {/* Restrained Viewfinder Axis Center Ticks */}
            <span className="hidden sm:block absolute top-0 left-1/2 -translate-x-1/2 w-px h-1.5 bg-white/[0.10]" />
            <span className="hidden sm:block absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-1.5 bg-white/[0.10]" />
            <span className="hidden sm:block absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-px bg-white/[0.10]" />
            <span className="hidden sm:block absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-px bg-white/[0.10]" />
          </div>

          {/* Beat 1 (100ms - 950ms): Top Telemetry Strip (10px Monospace Studio Metadata) */}
          <header className="intro-boot-telemetry pointer-events-none absolute top-[32px] inset-x-[36px] sm:inset-x-[40px] z-[30] flex flex-col sm:flex-row items-center sm:items-start justify-between gap-1.5 sm:gap-4 font-mono text-[10px] leading-none tracking-[0.12em] uppercase text-zinc-400/90">
            <div className="flex items-center gap-1.5 text-center sm:text-left">
              <span>D65</span>
              <span className="text-zinc-600" aria-hidden="true">·</span>
              <span>6504K</span>
              <span className="text-zinc-600" aria-hidden="true">·</span>
              <span>REC.709 / LOG SCENE-LINEAR</span>
            </div>
            <div className="flex items-center gap-1.5 text-center sm:text-right text-zinc-400/80">
              <span>V0.9.6A</span>
              <span className="text-zinc-600" aria-hidden="true">·</span>
              <span>60FPS WEBGL</span>
              <span className="text-zinc-600" aria-hidden="true">·</span>
              <span className="text-zinc-300">.KFPLUG · .FFX · .CUBE</span>
            </div>
          </header>

          {/* Bottom Calibrated Studio Footer Note (2500ms - 3200ms) */}
          <footer
            className="m3-intro-item pointer-events-none absolute bottom-[30px] inset-x-[36px] sm:inset-x-[40px] z-20 flex items-center justify-center font-mono text-[10px] leading-relaxed tracking-[0.13em] uppercase text-zinc-500 text-center"
            style={{ animationDelay: "2500ms", animationDuration: "700ms" }}
          >
            <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5">
              <span>ZERO SERVER UPLOAD</span>
              <span className="text-zinc-700" aria-hidden="true">·</span>
              <span>LOCAL WEBGPU/WEBGL PIPELINE</span>
              <span className="text-zinc-700" aria-hidden="true">·</span>
              <span>CRAFTED BY TFBAGAS</span>
            </p>
          </footer>
        </div>

        {/* Center Precision Optical Stage (280ms Optical Depth Dive on Exit: scale 1 -> 1.07, blur 0 -> 8px, opacity 1 -> 0) */}
        <main
          className={`relative z-20 flex flex-col items-center text-center max-w-[600px] px-8 sm:px-10 ${
            isExiting ? "intro-exit-dive" : ""
          }`}
        >
          {/* Beat 3 (900ms - 1950ms): Sequential 16-Step Colorimeter Cascade (55ms stagger + silver specular pulse) */}
          <div className="intro-boot-colorimeter w-full max-w-[336px] mb-7">
            <div
              ref={calibBezelRef}
              className="intro-specular-bezel relative rounded-[5px] bg-[#0B0C10]/90 border border-white/[0.11] p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_8px_24px_rgba(0,0,0,0.45)]"
              aria-label="10-step luminance ramp 0 to 100 IRE and Rec.709 6-axis optical calibration strip"
            >
              <div className="relative flex items-center w-full overflow-hidden rounded-[2px]">
                {/* 10-Step Grayscale Luminance Ramp (0% to 100% IRE) */}
                <div className="grid grid-cols-10 gap-[1.5px] flex-[10] h-[6px]">
                  {LUMINANCE_STEPS.map((step, idx) => (
                    <span
                      key={step.ire}
                      title={`${step.ire}% IRE`}
                      className="intro-calib-chip block w-full h-full rounded-[1px]"
                      style={{
                        backgroundColor: step.hex,
                        animationDelay: `${900 + idx * 55}ms`,
                      }}
                    />
                  ))}
                </div>

                {/* Calibrated Hairline Separator */}
                <span
                  aria-hidden="true"
                  className="w-px h-[8px] mx-[5px] bg-white/[0.16] shrink-0"
                />

                {/* 6 Muted Rec.709 Primary/Secondary Calibration Ticks */}
                <div className="grid grid-cols-6 gap-[1.5px] flex-[5] h-[6px]">
                  {REC709_TICKS.map((tick, idx) => (
                    <span
                      key={tick.id}
                      title={tick.name}
                      className="intro-calib-chip block w-full h-full rounded-[1px]"
                      style={{
                        backgroundColor: tick.hex,
                        animationDelay: `${900 + (LUMINANCE_STEPS.length + idx) * 55}ms`,
                      }}
                    />
                  ))}
                </div>

                {/* Post-Ignition Left-to-Right Silver Specular Sheen Sweep */}
                <div
                  aria-hidden="true"
                  className="intro-calib-boot-sweep pointer-events-none absolute inset-y-0 left-0 mix-blend-screen"
                />

                {/* Interactive Cursor-Driven Brushed-Silver Specular Sweep Overlay */}
                <div
                  aria-hidden="true"
                  className="intro-calib-sweep pointer-events-none absolute inset-0 mix-blend-screen"
                />
              </div>
            </div>

            {/* Micro-Scale Calibration Index Labels */}
            <div
              aria-hidden="true"
              className="mt-1.5 flex items-center justify-between px-0.5 font-mono text-[9px] tracking-[0.1em] uppercase text-zinc-500/85"
            >
              <div className="flex items-center justify-between flex-[10] pr-2">
                <span>0 IRE</span>
                <span className="text-zinc-600">50</span>
                <span>100</span>
              </div>
              <div className="flex-[5] text-right text-zinc-500/75">
                REC.709
              </div>
            </div>
          </div>

          {/* Beat 3 (1250ms - 2050ms): Sculpted Emblem Container Optical Aperture Lock (scale 0.88 -> 1, 800ms) */}
          <div className="intro-boot-emblem mb-6">
            <div
              ref={emblemBezelRef}
              className="intro-specular-bezel relative w-[68px] h-[68px] sm:w-[74px] sm:h-[74px] rounded-[18px] flex items-center justify-center border border-white/[0.14]"
              style={{
                background:
                  "linear-gradient(160deg, rgba(255, 255, 255, 0.085) 0%, rgba(16, 18, 24, 0.88) 46%, rgba(8, 9, 12, 0.96) 100%)",
                boxShadow:
                  "inset 0 1px 0 rgba(255, 255, 255, 0.22), inset 0 -1px 0 rgba(255, 255, 255, 0.03), 0 18px 42px rgba(0, 0, 0, 0.65)",
              }}
            >
              <ToneBenchCubeSvg className="w-10 h-10 sm:w-11 sm:h-11" />
            </div>
          </div>

          {/* Beat 4 (1550ms - 2250ms): Editorial Masked Display Wordmark with Tracking Settle */}
          <h1
            className="intro-kinetic-mask pb-1 text-3xl sm:text-[42px] leading-[1.08] font-semibold font-display tracking-tight text-zinc-100"
            style={{ animationDelay: "1550ms", animationDuration: "700ms" }}
          >
            {t("intro.title")}
          </h1>

          {/* Beat 4 (1800ms - 2500ms): Editorial Masked Subtitle (250ms after title) */}
          <p
            className="intro-kinetic-subtitle mt-3 pb-1 max-w-[490px] text-[13px] sm:text-[14.5px] leading-relaxed text-zinc-400 font-normal"
            style={{ animationDelay: "1800ms", animationDuration: "700ms" }}
          >
            {t("intro.subtitle")}
          </p>

          {/* Beat 5 (2250ms - 2950ms): 3-Tier Solver Readiness Strip */}
          <div
            className="m3-intro-item mt-6 max-w-full"
            style={{ animationDelay: "2250ms", animationDuration: "700ms" }}
          >
            <div className="inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 px-3.5 py-1.5 rounded-full bg-white/[0.025] border border-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] font-mono text-[10.5px] sm:text-[11px] tracking-[0.02em]">
              {SOLVER_TIERS.map((tier, idx) => (
                <React.Fragment key={tier.id}>
                  {idx > 0 && (
                    <span className="text-zinc-600" aria-hidden="true">
                      ·
                    </span>
                  )}
                  <span
                    className={
                      tier.active
                        ? "inline-flex items-center gap-1.5 text-zinc-100 font-medium"
                        : "text-zinc-400"
                    }
                  >
                    {tier.active && (
                      <span
                        aria-hidden="true"
                        className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)] shrink-0"
                      />
                    )}
                    <span>{tier.label}</span>
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Beat 5 (2380ms - 3080ms + 2950ms Final Specular Sheen): Brushed-Silver Tactile CTA + [Enter] Hint */}
          <div
            className="m3-intro-item mt-7 flex flex-col items-center"
            style={{ animationDelay: "2380ms", animationDuration: "700ms" }}
          >
            <button
              type="button"
              onClick={triggerExit}
              className="group relative overflow-hidden inline-flex items-center justify-center gap-2.5 h-11 px-7 rounded-full bg-zinc-100 text-zinc-950 hover:bg-white font-medium text-[13.5px] tracking-[-0.01em] border border-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_1px_2px_rgba(0,0,0,0.6),0_10px_28px_rgba(0,0,0,0.45)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_0_0_1px_rgba(255,255,255,0.34),0_0_30px_rgba(255,255,255,0.16),0_12px_32px_rgba(0,0,0,0.5)] transition-all duration-200 active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060709]"
            >
              <span
                aria-hidden="true"
                className="intro-cta-boot-sweep pointer-events-none absolute inset-y-0 left-0 z-20"
              />
              <span className="relative z-10">{t("intro.openStudio")}</span>
              <ArrowRight className="relative z-10 w-3.5 h-3.5 text-zinc-900 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>

            <div className="mt-3.5 inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.06em] text-zinc-500">
              <span>{t("intro.pressKey")}</span>
              <kbd className="inline-flex items-center gap-1 px-1.5 py-[2px] rounded-[4px] bg-white/[0.035] border border-white/[0.12] text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] leading-none">
                <span aria-hidden="true" className="text-zinc-500">
                  ↵
                </span>
                <span>Enter</span>
              </kbd>
            </div>
          </div>
        </main>

        {/* Exit Calibration Scan-Beam (0ms -> 360ms): Crisp 1px horizontal silver sweep across vertical midpoint */}
        {isExiting && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 -mt-[0.5px] inset-x-0 h-px z-[40] overflow-hidden"
          >
            <div className="intro-handoff-rail absolute inset-0" />
            <div className="intro-handoff-beam absolute top-0 left-0" />
          </div>
        )}
      </div>
    </div>
  );
}
