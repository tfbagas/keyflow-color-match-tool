import React, { useState, useEffect } from "react";
import { Heart, X, ExternalLink } from "lucide-react";

const STORAGE_KEY = "kf_hide_support_banner_v1";

export default function SupportBanner({ onOpenSupport }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "true") {
        setDismissed(true);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore storage errors
    }
  };

  if (dismissed) return null;

  return (
    <div className="m3-panel rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 text-xs text-[#9CA3AF]">
        <span className="w-6 h-6 rounded-lg bg-white/[0.04] border border-white/[0.09] flex items-center justify-center text-[#E2E4E9] shrink-0">
          <Heart className="w-3.5 h-3.5 text-[#6EE7B7]" />
        </span>
        <p className="leading-snug">
          Enjoying <span className="font-semibold text-[#E2E4E9]">Color Match Tool</span>? Built for free by{" "}
          <button
            type="button"
            onClick={onOpenSupport}
            className="font-semibold text-[#E2E4E9] underline decoration-white/30 hover:decoration-white transition-colors cursor-pointer"
          >
            @tfbagas
          </button>{" "}
          — support future updates if this tool saves you time!
        </p>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <a
          href="https://sociabuzz.com/tfbagas/tribe"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-[#E2E4E9] border border-white/[0.09] text-xs font-medium transition-colors"
        >
          <span>Support on SociaBuzz</span>
          <ExternalLink className="w-3 h-3 text-[#9CA3AF]" />
        </a>

        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 rounded-lg text-[#9CA3AF]/60 hover:text-[#E2E4E9] hover:bg-white/5 transition-colors cursor-pointer"
          title="Dismiss"
          aria-label="Dismiss support banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
