import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Sparkles,
  ShieldCheck,
  Cpu,
  Layers,
  Rocket,
  ChevronDown,
  History,
  Droplets,
} from "lucide-react";
import KeyflowLogo from "./KeyflowLogo";

export const CHANGELOG_HISTORY = [
  {
    version: "v0.9.0 Beta",
    subtitle: "Engine v3 Punch Calibration, UI Hierarchy Overhaul, Monitoring Scopes & Touch UX",
    isLatest: true,
    icon: Sparkles,
    items: [
      "Calibrated Engine v3 (Cinema Hybrid Pro) default 100% punch by relaxing hue retention to 36%, expanding max hue rotation to 40 degrees, widening primary slider clamps, and tightening shadowMask to smoothstep(0.015, 0.16) so deep blacks stay anchored while midtones receive richer film split-toning.",
      "Overhauled workstation hierarchy with a dedicated top ENGINE & MATCH STRENGTH card, 3-column interactive engine cards, a Live Engine Info Strip with side-by-side comparison popover, collapsible TONE & CONTRAST / COLOR & SATURATION slider groups, and a sticky desktop preview column.",
      "Added WebGL preview-only Monitoring Scopes (Zebra/Clipping and False Color IRE), Touch Eyedropper (RGB/IRE), Fine (0.01) slider mode, Tap-to-Edit numeric readouts, and individual parameter/wheel reset buttons.",
      "Added in-memory Undo/Redo (up to 25 steps with Ctrl+Z / Ctrl+Shift+Z), upgraded A/B snapshots with Copy to B and auto-backup on engine switch, 1-frame video stepping (-1f/+1f) with Match Current Frame, engine-suffixed exports, and optional Web Share for .kfplug.",
    ],
  },
  {
    version: "v0.8.1 Beta",
    subtitle: "Mobile 60fps Video & Pro Scopes Performance Hotfix",
    isLatest: false,
    icon: Sparkles,
    items: [
      "Optimized Pro Scopes (Luma/RGB, RGB Parade, Vectorscope) by locking 2D canvas backing to 1x DPR, deferring calculations during slider drags, downsampling to 96x54 integer math, throttling video scope updates to 6fps, and adding a collapsible toggle.",
      "Streamlined WebGL video playback using requestVideoFrameCallback with single-allocation texSubImage2D uploads and zero-rerender DOM transport scrubber updates.",
      "Rebuilt Side by Side comparison into a single-pass WebGL shader view using a single media source, eliminating dual-video sync lag on mobile browsers.",
      "Capped mobile live preview canvas pixel ratio and buffer dimensions with coalesced requestAnimationFrame slider updates while keeping full native resolution for Save Image exports.",
    ],
  },
  {
    version: "v0.8.0 Beta",
    subtitle: "Color Match Engine v2, RAW & Video Support, Mobile Sticky Preview, Pro Scopes & Multi-Format Export",
    isLatest: false,
    icon: Sparkles,
    items: [
      "Rebuilt the color matching engine with dynamic range spread detection for flat and Log-like references, OKLab residual split-toning, soft highlight roll-off, and strict Keyflow-safe GLSL clamping.",
      "Added client-side support for Camera RAW (DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2), extended raster formats, and real-time 60fps WebGL video target previews (MP4, WEBM, MOV, M4V, MKV).",
      "Added full-resolution graded image and video frame export (PNG, JPG, WEBP) with quality control and Before/After split export, alongside two-way 3D LUT .cube and .lut I/O and .kfplug re-importing.",
      "Redesigned mobile viewports with a sticky top preview and compact dual-column media slots, paired with desktop 100vh fit, circular 3-Way Color Wheels, RGB Parade and Vectorscope scopes, Master Match Strength (0% to 150%), A/B snapshot slots, live RGB/IRE pixel readout, and a preview-only Simulate Log Input toggle.",
    ],
  },
  {
    version: "v0.6.5 Beta",
    subtitle: "Performance Fix & Minimalist Intro",
    isLatest: false,
    icon: Cpu,
    items: [
      "Removed heavy full-screen SVG filters, animated blur passes, and nested backdrop blurs to restore smooth 60fps rendering across mid-range laptops and mobile devices.",
      "Redesigned the entrance screen into a lightweight, full-bleed minimalist studio header with faster spring transitions.",
    ],
  },
  {
    version: "v0.6.4 Beta",
    subtitle: "Bouncy Spring & Liquid Morph Motion",
    isLatest: false,
    icon: Sparkles,
    items: [
      "Added an interactive cursor-reactive monochrome liquid glass entrance intro with bouncy capsule morphing and a Replay Intro trigger in About.",
      "Upgraded navigation pills, preview switchers, collapsible panels, buttons, and view transitions with hybrid Material You bouncy spring and liquid morph physics.",
    ],
  },
  {
    version: "v0.6.3 Beta",
    subtitle: "Monochrome Liquid Glass & Analysis Recovery",
    isLatest: false,
    icon: Droplets,
    items: [
      "Added an achromatic black-and-white animated liquid glass background with translucent frosted workstation panels (zero color-cast).",
      "Added the Reload Analysis button next to Reset All to instantly restore reference-matched parameters after resetting or manual tweaks.",
    ],
  },
  {
    version: "v0.6.2 Beta",
    subtitle: "Security & Integrity Hardening",
    isLatest: false,
    icon: ShieldCheck,
    items: [
      "Added Cloudflare HTTP security headers (CSP, X-Frame-Options, nosniff, Permissions-Policy) to protect against XSS and clickjacking.",
      "Enforced strict image MIME validation on upload/paste and sanitized preset metadata prior to .kfplug packaging.",
      "Hardened production build (sourcemap: false) and added runtime integrity protection for core Rec. 709 and .kfplug modules.",
    ],
  },
  {
    version: "v0.6.1 Beta",
    subtitle: "Calibration, Custom Controls & Brand Identity",
    isLatest: false,
    icon: Cpu,
    items: [
      "Added Engine & Export Calibration in Settings (synthetic Canvas/Web Worker self-test with cache flush and .kfplug output multipliers).",
      "Replaced OS-native <select> dropdowns with custom Material 3 achromatic dropdown menus.",
      "Aligned VISUAL PREVIEW height flush with EXPORT PLUGIN, removed duplicate sample buttons, and added focus/hover-aware Ctrl+V clipboard routing.",
      "Updated browser favicons/PWA icons to achromatic dark and introduced the tfbagas• geometric wordmark.",
    ],
  },
  {
    version: "v0.6.0 Beta",
    subtitle: "Material 3 Achromatic UI Overhaul",
    isLatest: false,
    icon: Layers,
    items: [
      "Redesigned the interface into a color-accurate Material 3 Achromatic Dark workstation (#0E0E11–#1E1E24) with a 48px Top App Bar and segmented navigation.",
      "Added bipolar center-zero sliders with functional Temp/Tint micro-chroma tracks, real-time RGB/Luma histogram, collapsible panels, Hold Before (\\) preview comparison, and fixed graded canvas rendering across all preview modes.",
      "Upgraded typography (Bricolage Grotesque, Instrument Sans, IBM Plex Mono) and added the Developer & Support hub.",
    ],
  },
  {
    version: "v0.5.0 Beta",
    subtitle: "Initial Web Release",
    isLatest: false,
    icon: Rocket,
    items: [
      "Launched the 100% client-side browser edition with Rec. 709 reference color matching, multithreaded Web Worker pixel analysis, real-time Before/After preview, 3-Way Color Wheels swatches, and direct .kfplug plugin export.",
    ],
  },
];

export function ReleaseHistoryAccordion() {
  const [expandedMap, setExpandedMap] = useState({
    "v0.9.0 Beta": true,
  });

  const toggleVersion = (ver) => {
    setExpandedMap((prev) => ({
      ...prev,
      [ver]: !prev[ver],
    }));
  };

  return (
    <div className="space-y-2.5">
      {CHANGELOG_HISTORY.map((release) => {
        const Icon = release.icon;
        const isExpanded = Boolean(expandedMap[release.version]);

        return (
          <div
            key={release.version}
            className={`rounded-xl border transition-colors ${
              release.isLatest
                ? "bg-[#1E1E24] border-white/15"
                : "bg-[#1E1E24]/70 border-white/[0.08] hover:border-white/15"
            }`}
          >
            <button
              type="button"
              onClick={() => toggleVersion(release.version)}
              aria-expanded={isExpanded}
              className="w-full flex items-center justify-between gap-3 p-3.5 text-left cursor-pointer select-none"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#151519] border border-white/[0.08] flex items-center justify-center text-[#E2E4E9] shrink-0">
                  <Icon
                    className={`w-4 h-4 ${
                      release.isLatest ? "text-[#6EE7B7]" : "text-[#9CA3AF]"
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold font-mono text-[#E2E4E9]">
                      {release.version}
                    </span>
                    {release.isLatest && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#151519] text-[#6EE7B7] border border-[#6EE7B7]/30">
                        <Sparkles className="w-2.5 h-2.5" />
                        Latest
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#9CA3AF] truncate mt-0.5">
                    {release.subtitle}
                  </div>
                </div>
              </div>

              <ChevronDown
                className={`w-4 h-4 text-[#9CA3AF] shrink-0 transition-transform duration-300 ${
                  isExpanded ? "rotate-180 text-[#E2E4E9]" : "rotate-0"
                }`}
                style={{ transitionTimingFunction: "var(--ease-m3-spring)" }}
              />
            </button>

            <div
              className="m3-collapse-grid"
              data-expanded={isExpanded}
            >
              <div className="m3-collapse-inner">
                <div className="px-3.5 pb-3.5 pt-1 border-t border-white/[0.06]">
                  <ul className="space-y-2 text-xs text-[#9CA3AF] leading-relaxed pt-2">
                    {release.items.map((point, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF]/60 mt-1.5 shrink-0" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ChangelogModal({ open, onClose, onViewFullHistory }) {
  const latestRelease = CHANGELOG_HISTORY[0];

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm transition-opacity"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-modal-title"
        className="m3-panel m3-modal-enter w-full max-w-2xl max-h-[85dvh] flex flex-col rounded-2xl p-5 sm:p-6 shadow-[0_24px_60px_rgba(0,0,0,0.85)] bg-[#151519]/95"
      >
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-3">
            <KeyflowLogo size={38} />
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="changelog-modal-title"
                  className="text-base sm:text-lg font-bold font-display text-[#E2E4E9]"
                >
                  What&apos;s New in {latestRelease.version}
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#1E1E24] text-[#6EE7B7] border border-white/10">
                  <Sparkles className="w-2.5 h-2.5" />
                  Latest
                </span>
              </div>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                {latestRelease.subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#E2E4E9] hover:bg-[#1E1E24] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="my-4 space-y-2.5 flex-1 overflow-y-auto pr-1">
          {latestRelease.items.map((point, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 rounded-xl bg-[#1E1E24] border border-white/[0.08]"
            >
              <div className="w-6 h-6 rounded-lg bg-[#151519] border border-white/[0.08] flex items-center justify-center text-[#E2E4E9] shrink-0 mt-0.5">
                <Droplets className="w-3.5 h-3.5 text-[#9CA3AF]" />
              </div>
              <p className="text-xs text-[#E2E4E9]/90 leading-relaxed">
                {point}
              </p>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3 shrink-0">
          {onViewFullHistory ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onViewFullHistory();
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#9CA3AF] hover:text-[#E2E4E9] transition-colors cursor-pointer"
            >
              <History className="w-3.5 h-3.5" />
              <span>View Full Release History (v0.5 - v0.9.0)</span>
            </button>
          ) : (
            <span className="text-[11px] font-mono text-[#9CA3AF]">
              Build v0.9.0-beta • 100% Client-Side
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="m3-btn-morph px-4 py-2 rounded-xl text-xs font-semibold bg-[#E2E4E9] hover:bg-white text-[#0E0E11] cursor-pointer ml-auto"
          >
            Got It
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
