import React, { useState, useEffect, useRef, useCallback } from "react";
import { ArrowRight } from "lucide-react";
import KeyflowLogo from "./KeyflowLogo";

/**
 * Minimalist Full-Bleed Pro Studio Intro (v0.6.5 Beta)
 * - Directly over #08080A without framed card clutter or AI template badges
 * - Uses only GPU-composited transform and opacity (zero mousemove 60Hz tilt or blur filters)
 */
export default function SplashIntro({ onStartExit, onComplete }) {
  const [isExiting, setIsExiting] = useState(false);
  const exitingRef = useRef(false);
  const timersRef = useRef([]);

  const triggerExit = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setIsExiting(true);

    if (onStartExit) onStartExit();

    const t = setTimeout(() => {
      if (onComplete) onComplete();
    }, 240);
    timersRef.current.push(t);
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
      aria-label="Color Match Tool Studio Intro"
      onClick={triggerExit}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center px-6 bg-[#08080A] select-none cursor-pointer transition-[opacity,transform] duration-240 ${
        isExiting
          ? "opacity-0 scale-[1.03] pointer-events-none"
          : "opacity-100 scale-100"
      }`}
      style={{
        transitionTimingFunction: "var(--ease-liquid-morph)",
      }}
    >
      {/* Subtle Static Monochrome Ambient Radial Glow (Zero Blur Filter) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
      >
        <div
          className="w-[540px] h-[540px]"
          style={{
            background:
              "radial-gradient(circle, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.025) 42%, transparent 70%)",
          }}
        />
      </div>

      {/* Full-Bleed Minimalist Studio Header Stack */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-xl">
        {/* 1. Clean Monochrome Keyflow Prism Emblem */}
        <div
          className="m3-intro-item mb-5"
          style={{ animationDelay: "40ms" }}
        >
          <KeyflowLogo size={48} />
        </div>

        {/* 2. Primary Studio Title */}
        <h1
          className="m3-intro-item text-2xl sm:text-4xl font-bold font-display tracking-tight text-[#E2E4E9]"
          style={{ animationDelay: "140ms" }}
        >
          Color Match Tool
        </h1>

        {/* 3. Single-Line Technical Monospace Metadata */}
        <p
          className="m3-intro-item mt-3 text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.2em] text-[#9CA3AF] leading-relaxed"
          style={{ animationDelay: "260ms" }}
        >
          REC. 709 COLOR WORKSTATION &nbsp;/&nbsp; V0.6.5 BETA &nbsp;/&nbsp; TFBAGAS
        </p>

        {/* 4. Sleek Monochrome Glass Capsule Action (~680ms reveal within ~1.1s total) */}
        <div
          className="m3-intro-item mt-8"
          style={{ animationDelay: "620ms" }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerExit();
            }}
            className="m3-btn-morph group inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-white/[0.07] hover:bg-[#E2E4E9] text-[#E2E4E9] hover:text-[#08080A] border border-white/[0.16] hover:border-[#E2E4E9] text-xs font-medium tracking-wide cursor-pointer"
          >
            <span>Enter Workstation</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform duration-180 group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
