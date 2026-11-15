import React, { useEffect } from "react";
import { X, Layers, Sliders, Columns, Type, Sparkles } from "lucide-react";
import KeyflowLogo from "./KeyflowLogo";

export const CHANGELOG_V06_ITEMS = [
  {
    icon: Layers,
    title: "Material 3 Achromatic UI Overhaul",
    description:
      "Replaced emerald-tinted styling and sidebar with a color-accurate neutral dark surface hierarchy (#0E0E11–#1E1E24) and a 48px Top App Bar.",
  },
  {
    icon: Sliders,
    title: "Bipolar Center-Zero Controls & Live Telemetry",
    description:
      "Added center-detent bipolar sliders with functional Temp/Tint micro-chroma tracks, double-click parameter reset, and a real-time RGB/Luma histogram.",
  },
  {
    icon: Columns,
    title: "Interactive Workstation & Preview Fixes",
    description:
      "Added collapsible panels, instant Hold Before (\\) preview comparison, clipboard image paste (Ctrl+V), sample image loader, and fixed canvas rendering across Split Slider, Side-by-Side, and Split Result modes.",
  },
  {
    icon: Type,
    title: "Typography & Support Hub",
    description:
      "Upgraded typography (Bricolage Grotesque, Instrument Sans, IBM Plex Mono with tabular-nums) and added the Developer & Support hub.",
  },
];

export function ChangelogList() {
  return (
    <div className="space-y-2.5">
      {CHANGELOG_V06_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.title}
            className="flex items-start gap-3 p-3 rounded-xl bg-[#1E1E24] border border-white/[0.08] hover:border-white/15 transition-colors"
          >
            <div className="w-7 h-7 rounded-lg bg-[#151519] border border-white/[0.08] flex items-center justify-center text-[#E2E4E9] shrink-0 mt-0.5">
              <Icon className="w-3.5 h-3.5 text-[#9CA3AF]" />
            </div>
            <div className="space-y-0.5 text-xs">
              <div className="font-semibold text-[#E2E4E9]">{item.title}</div>
              <p className="text-[#9CA3AF] leading-relaxed">{item.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ChangelogModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm transition-opacity"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-modal-title"
        className="m3-panel m3-modal-enter w-full max-w-lg rounded-2xl p-5 sm:p-6 shadow-[0_24px_60px_rgba(0,0,0,0.85)] bg-[#151519]"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <KeyflowLogo size={38} />
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="changelog-modal-title"
                  className="text-base sm:text-lg font-bold font-display text-[#E2E4E9]"
                >
                  What&apos;s New in v0.6 Beta
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#1E1E24] text-[#6EE7B7] border border-white/10">
                  <Sparkles className="w-2.5 h-2.5" />
                  Latest
                </span>
              </div>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                Color Match for Keyflow — Release Notes &amp; Technical Updates
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

        {/* Changelog Items */}
        <div className="my-4 max-h-[60vh] overflow-y-auto pr-1">
          <ChangelogList />
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between gap-3">
          <span className="text-[11px] font-mono text-[#9CA3AF]">
            Build v0.6.0-beta • 100% Client-Side
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#E2E4E9] hover:bg-white text-[#0E0E11] transition-all cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
