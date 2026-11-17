import React, { useState, useEffect, useRef, useCallback } from "react";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

/**
 * Luxury Enterprise Minimalist Intro & Spatial Zoom-Through (v0.9.5)
 * - Full-viewport obsidian optical stage (100dvh) with zero boxed cards or floating template pills
 * - Slow, GPU-composited anamorphic glass caustic light sweep in the background
 * - Centered Argan prism emblem with specular glass rim and frosted-soft-edge ambient halo
 * - Precision-tracked "Color Match for Keyflow" wordmark
 * - Minimalist technical index line: REC.709 / LOG  -  OKLAB COLOR SCIENCE  -  60FPS WEBGL
 * - One Liquid Glass capsule CTA ("Open Studio") with spatial zoom-through transition (scale(1) -> scale(1.05))
 * - Gradual blur 3-layer stack at the bottom edge of the optical stage
 */
export default function IntroScreen({ onStartExit, onComplete }) {
  const { t } = useLanguage();
  const [isExiting, setIsExiting] = useState(false);
  const exitingRef = useRef(false);
  const timersRef = useRef([]);

  const triggerExit = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setIsExiting(true);

    if (onStartExit) onStartExit();

    const tmr = setTimeout(() => {
      if (onComplete) onComplete();
    }, 380);
    timersRef.current.push(tmr);
  }, [onStartExit, onComplete]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        e.preventDefault();
        triggerExit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      timersRef.current.forEach(clearTimeout);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [triggerExit]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("intro.dialogLabel")}
      onClick={triggerExit}
      className="fixed inset-0 z-50 w-screen h-dvh flex flex-col items-center justify-center px-6 bg-[#060709] select-none cursor-pointer overflow-hidden"
      style={{
        opacity: isExiting ? 0 : 1,
        transform: isExiting ? "scale(1.05)" : "scale(1)",
        filter: isExiting ? "blur(12px)" : "blur(0px)",
        pointerEvents: isExiting ? "none" : "auto",
        transition:
          "transform 380ms cubic-bezier(0.22, 1, 0.36, 1), opacity 360ms cubic-bezier(0.22, 1, 0.36, 1), filter 380ms cubic-bezier(0.22, 1, 0.36, 1)",
        willChange: "transform, opacity, filter",
      }}
    >
      {/* Slow GPU-Composited Monochrome White/Platinum Anamorphic Glass Caustic Light Sweep */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          className="argan-caustic-sweep absolute -inset-x-[35%] top-[18%] h-[42vh] rounded-full opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 68% 36% at 50% 50%, rgba(255, 255, 255, 0.11) 0%, rgba(235, 238, 245, 0.055) 42%, rgba(255, 255, 255, 0.025) 68%, transparent 84%)",
          }}
        />
        <div
          className="argan-caustic-sweep absolute -inset-x-[25%] bottom-[16%] h-[36vh] rounded-full opacity-75"
          style={{
            animationDelay: "-7s",
            background:
              "radial-gradient(ellipse 60% 30% at 50% 50%, rgba(255, 255, 255, 0.08) 0%, rgba(226, 228, 233, 0.04) 48%, transparent 78%)",
          }}
        />
        {/* Subtle Anamorphic Horizon Line */}
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent 8%, rgba(255, 255, 255, 0.09) 50%, transparent 92%)",
          }}
        />
      </div>

      {/* Centered Editorial Stage (No Boxed Monolith or Floating Template Badges) */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-xl w-full">
        {/* Centered Argan Prism Emblem with Frosted-Soft-Edge Ambient Halo & Specular Glass Rim */}
        <div
          className="m3-intro-item mb-7 relative flex items-center justify-center"
          style={{ animationDelay: "40ms" }}
        >
          {/* Ambient Halo with Frosted Glass Soft Edges */}
          <div
            aria-hidden="true"
            className="frosted-soft-edge pointer-events-none absolute -inset-8 rounded-full bg-white/[0.08]"
          />

          <div
            className="optical-refract-glass relative w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-[22px] flex items-center justify-center border border-white/[0.18]"
            style={{
              background:
                "linear-gradient(155deg, rgba(255, 255, 255, 0.10) 0%, rgba(18, 19, 25, 0.74) 55%, rgba(9, 9, 13, 0.9) 100%)",
            }}
          >
            <svg
              viewBox="0 0 48 48"
              fill="none"
              aria-hidden="true"
              className="w-8 h-8 sm:w-9 sm:h-9"
            >
              <defs>
                <linearGradient id="arganPrismEdge" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.96" />
                  <stop offset="52%" stopColor="#D8DEE9" stopOpacity="0.72" />
                  <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0.85" />
                </linearGradient>
                <linearGradient id="arganPrismFacet" x1="24" y1="8" x2="38" y2="38" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.26" />
                  <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0.06" />
                </linearGradient>
              </defs>
              {/* Outer Precision Optical Prism */}
              <polygon
                points="24,6 41,38 7,38"
                fill="url(#arganPrismFacet)"
                stroke="url(#arganPrismEdge)"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              {/* Internal Refractive Split Axis */}
              <line
                x1="24"
                y1="6"
                x2="24"
                y2="38"
                stroke="rgba(255,255,255,0.42)"
                strokeWidth="1.15"
              />
              {/* Dispersed Caustic Ray */}
              <path
                d="M14 25L24 21L35 26.5"
                stroke="rgba(110,231,183,0.75)"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Precision-Tracked Brand Wordmark */}
        <h1
          className="m3-intro-item text-3xl sm:text-5xl font-semibold font-display tracking-[-0.025em] text-[#F4F5F7]"
          style={{ animationDelay: "110ms" }}
        >
          {t("intro.title")}
        </h1>

        {/* Single Minimalist Technical Index Line */}
        <p
          className="m3-intro-item mt-3.5 text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.22em] text-[#9CA3AF]/90"
          style={{ animationDelay: "180ms" }}
        >
          {t("intro.indexLine")}
        </p>

        {/* Single Liquid Glass Capsule CTA */}
        <div
          className="m3-intro-item mt-9"
          style={{ animationDelay: "260ms" }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerExit();
            }}
            className="optical-refract-glass group inline-flex items-center gap-2.5 px-7 py-3 rounded-full text-xs sm:text-[13px] font-medium tracking-[0.04em] text-[#F4F5F7] hover:text-[#07070A] bg-white/[0.07] hover:bg-[#F4F5F7] border border-white/[0.22] hover:border-[#F4F5F7] transition-all duration-200 hover:scale-[1.03] active:scale-[0.97] cursor-pointer"
          >
            <span>{t("intro.openStudio")}</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        </div>
      </div>

      {/* 3-Layer Gradual Blur along the Bottom Edge of the IntroScreen Optical Stage */}
      <div
        aria-hidden="true"
        className="gradual-blur-bottom pointer-events-none absolute inset-x-0 bottom-0 h-20 z-20"
      >
        <div className="gradual-blur-layer-1 absolute inset-0" />
        <div className="gradual-blur-layer-2 absolute inset-0" />
        <div className="gradual-blur-layer-3 absolute inset-0" />
      </div>
    </div>
  );
}
