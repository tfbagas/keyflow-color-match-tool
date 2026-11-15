import React, { useEffect } from "react";
import { X, Cpu, ListFilter, Columns, Fingerprint, Sparkles } from "lucide-react";
import KeyflowLogo from "./KeyflowLogo";

export const CHANGELOG_V061_ITEMS = [
  {
    icon: Cpu,
    title: "Engine & Export Calibration (Settings)",
    description:
      "Added synthetic Canvas/Web Worker self-calibration with cache flush recovery and .kfplug output multipliers (Tone/Contrast, White Balance, Chroma).",
  },
  {
    icon: ListFilter,
    title: "Custom Material 3 Dropdowns",
    description:
      "Replaced OS-native <select> menus with tonal achromatic dropdown controls.",
  },
  {
    icon: Columns,
    title: "Workstation Layout & Smart Paste",
    description:
      "Aligned VISUAL PREVIEW height flush with EXPORT PLUGIN, removed duplicate sample buttons, and added hover/focus-aware Ctrl+V clipboard routing.",
  },
  {
    icon: Fingerprint,
    title: "Achromatic Favicon & Brand Identity",
    description:
      "Updated browser favicons/PWA icons to achromatic dark and replaced the developer badge with the tfbagas• geometric wordmark.",
  },
];

export function ChangelogList() {
  return (
    <div className="space-y-2.5">
      {CHANGELOG_V061_ITEMS.map((item) => {
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
                  What&apos;s New in v0.6.1 Beta
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
            Build v0.6.1-beta • 100% Client-Side
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
