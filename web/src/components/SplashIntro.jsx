import React, { useState, useEffect, useRef, useCallback } from "react";
import { ArrowRight } from "lucide-react";
import KeyflowLogo from "./KeyflowLogo";

/**
 * Architectural Spatial Liquid-Morph Glass Intro (v0.8.1 Beta)
 * - #0A0A0D obsidian calibration stage with 1px Rec. 709 grid & 0.0 -> 1.0 scale
 * - Static backdrop-filter: blur(20px) monolith + organic liquid-morph membrane behind
 * - 3 floating peripheral telemetry pills + cursor-tracking specular sheen (GPU transform only)
 */
export default function SplashIntro({ onStartExit, onComplete }) {
  const [isExiting, setIsExiting] = useState(false);
  const [cursor, setCursor] = useState({ rx: 0, ry: 0, sx: 0, sy: 0 });
  const exitingRef = useRef(false);
  const timersRef = useRef([]);
  const rafRef = useRef(0);
  const pendingPointRef = useRef(null);

  const triggerExit = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setIsExiting(true);

    if (onStartExit) onStartExit();

    const t = setTimeout(() => {
      if (onComplete) onComplete();
    }, 260);
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
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      timersRef.current.forEach(clearTimeout);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [triggerExit]);

  const handlePointerMove = (e) => {
    if (exitingRef.current) return;
    pendingPointRef.current = { x: e.clientX, y: e.clientY };
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        if (exitingRef.current || !pendingPointRef.current) return;
        const { x, y } = pendingPointRef.current;
        pendingPointRef.current = null;
        const nx = (x / Math.max(1, window.innerWidth) - 0.5) * 2;
        const ny = (y / Math.max(1, window.innerHeight) - 0.5) * 2;
        setCursor({
          rx: Number((-ny * 5).toFixed(2)),
          ry: Number((nx * 6).toFixed(2)),
          sx: Number((nx * 64).toFixed(1)),
          sy: Number((ny * 44).toFixed(1)),
        });
      });
    }
  };

  const handlePointerLeave = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    pendingPointRef.current = null;
    setCursor({ rx: 0, ry: 0, sx: 0, sy: 0 });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Color Match Tool Studio Intro"
      onClick={triggerExit}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center px-5 bg-[#0A0A0D] select-none cursor-pointer overflow-hidden transition-[opacity,transform] duration-260 ${
        isExiting
          ? "opacity-0 scale-[1.03] pointer-events-none"
          : "opacity-100 scale-100"
      }`}
      style={{
        transitionTimingFunction: "var(--ease-liquid-morph)",
        perspective: "1000px",
      }}
    >
      {/* Rec. 709 Hairline Calibration Grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.032) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.032) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      {/* Hairline Center Axes */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-white/[0.04]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-white/[0.04]"
      />

      {/* Viewfinder Registration Marks & 0.0 -> 1.0 Scale */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-5 sm:inset-8">
        <span className="absolute top-0 left-0 w-4 h-4 border-t border-l border-white/20" />
        <span className="absolute top-0 right-0 w-4 h-4 border-t border-r border-white/20" />
        <span className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-white/20" />
        <span className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-white/20" />

        <div className="hidden sm:flex absolute top-0 left-1/2 -translate-x-1/2 items-center gap-3 text-[9px] font-mono tracking-[0.22em] text-white/35">
          <span>0.0</span>
          <span className="w-8 h-px bg-white/15" />
          <span>REC. 709</span>
          <span className="w-8 h-px bg-white/15" />
          <span>1.0</span>
        </div>
      </div>

      {/* Spatial Stage (Tilt + Floating Telemetry Pills + Liquid-Glass Monolith) */}
      <div
        className="relative z-10 flex items-center justify-center w-full max-w-lg"
        style={{
          transform: `rotateX(${cursor.rx}deg) rotateY(${cursor.ry}deg)`,
          transition: "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {/* 3 Floating Peripheral Liquid-Glass Telemetry Pills */}
        <div
          aria-hidden="true"
          className="hidden sm:flex items-center gap-1.5 absolute -top-9 -left-2 px-3 py-1 rounded-full bg-white/[0.045] border border-white/[0.14] text-[9px] font-mono tracking-[0.16em] text-[#D1D5DB] shadow-lg"
          style={{
            transform: `translate3d(${cursor.sx * -0.18}px, ${cursor.sy * -0.18}px, 0)`,
            transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#E2E4E9]/80" />
          <span>OKLAB ENGINE V2</span>
        </div>

        <div
          aria-hidden="true"
          className="hidden sm:flex items-center gap-1.5 absolute -top-8 -right-3 px-3 py-1 rounded-full bg-white/[0.045] border border-white/[0.14] text-[9px] font-mono tracking-[0.16em] text-[#D1D5DB] shadow-lg"
          style={{
            transform: `translate3d(${cursor.sx * 0.22}px, ${cursor.sy * -0.15}px, 0)`,
            transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <span>CAMERA RAW + 60FPS WEBGL</span>
        </div>

        <div
          aria-hidden="true"
          className="hidden sm:flex items-center gap-1.5 absolute -bottom-8 right-4 px-3 py-1 rounded-full bg-white/[0.045] border border-white/[0.14] text-[9px] font-mono tracking-[0.16em] text-[#D1D5DB] shadow-lg"
          style={{
            transform: `translate3d(${cursor.sx * 0.16}px, ${cursor.sy * 0.22}px, 0)`,
            transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <span>KEYFLOW SAFE .KFPLUG</span>
        </div>

        {/* Organic Liquid-Glass Membrane Behind Monolith (60fps GPU border-radius + transform) */}
        <div
          aria-hidden="true"
          className="kf-liquid-lens pointer-events-none absolute -inset-5 sm:-inset-7 border border-white/[0.12]"
          style={{
            background:
              "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.085) 0%, rgba(26,26,32,0.55) 55%, rgba(10,10,13,0.85) 100%)",
            transform: `translate3d(${cursor.sx * -0.1}px, ${cursor.sy * -0.1}px, 0)`,
          }}
        />

        {/* Central Liquid-Glass Monolith Card (Static blur(20px), Specular Edge + Cursor Sheen) */}
        <div
          className="relative z-10 w-full rounded-3xl px-7 py-9 sm:px-12 sm:py-11 border border-white/[0.16] overflow-hidden text-center flex flex-col items-center"
          style={{
            background:
              "linear-gradient(150deg, rgba(255,255,255,0.075) 0%, rgba(18,18,24,0.72) 52%, rgba(11,11,15,0.88) 100%)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.22), inset 1px 0 0 rgba(255,255,255,0.08), 0 28px 70px rgba(0,0,0,0.72)",
          }}
        >
          {/* Interactive Cursor-Tracking Specular Sheen (transform only) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-1/2 rounded-full opacity-50"
            style={{
              background:
                "radial-gradient(circle, rgba(255,255,255,0.09) 0%, transparent 58%)",
              transform: `translate3d(${cursor.sx}px, ${cursor.sy}px, 0)`,
              transition: "transform 160ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />

          <div className="relative z-10 flex flex-col items-center">
            <div className="m3-intro-item mb-4" style={{ animationDelay: "40ms" }}>
              <KeyflowLogo size={46} />
            </div>

            <div
              className="m3-intro-item inline-flex items-center gap-2 mb-2 px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.14] text-[10px] font-mono tracking-[0.18em] text-[#E2E4E9]"
              style={{ animationDelay: "100ms" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7]" />
              <span>v0.8.1 BETA</span>
            </div>

            <h1
              className="m3-intro-item text-2xl sm:text-4xl font-bold font-display tracking-tight text-[#F4F5F7]"
              style={{ animationDelay: "160ms" }}
            >
              Color Match Tool
            </h1>

            <p
              className="m3-intro-item mt-2 text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.2em] text-[#9CA3AF]"
              style={{ animationDelay: "230ms" }}
            >
              REC. 709 COLOR GRADING WORKSTATION
            </p>

            {/* Morphing Liquid Glass Capsule CTA */}
            <div className="m3-intro-item mt-7" style={{ animationDelay: "380ms" }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerExit();
                }}
                className="group inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-white/[0.09] hover:bg-[#F4F5F7] text-[#F4F5F7] hover:text-[#0A0A0D] border border-white/[0.22] hover:border-[#F4F5F7] text-xs font-medium tracking-wide transition-[transform,background-color,color,border-color,padding] duration-200 hover:scale-[1.04] hover:px-7 active:scale-[0.98] cursor-pointer"
                style={{
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)",
                }}
              >
                <span>Enter Workstation</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
