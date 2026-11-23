import React, { useState, useEffect } from "react";
import { Heart, X, ArrowUpRight } from "lucide-react";

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
    <div className="rounded-2xl bg-[#11161F] border border-[#AAB7C5]/14 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 text-xs text-[#C9D7E2]">
        <span className="w-6 h-6 rounded-lg bg-[#0A0C10] border border-[#4A6B86]/45 flex items-center justify-center text-[#93B8D8] shrink-0">
          <Heart className="w-3.5 h-3.5" />
        </span>
        <p className="leading-snug">
          Enjoying <span className="font-semibold text-[#F4F7FB]">ToneBench</span>? Built for free by{" "}
          <button
            type="button"
            onClick={onOpenSupport}
            className="font-semibold text-[#F4F7FB] underline decoration-[#AAB7C5]/40 hover:decoration-[#F4F7FB] transition-colors cursor-pointer"
          >
            @tfbagas
          </button>{" "}
          to keep client-side grading open for everyone.
        </p>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <a
          href="https://sociabuzz.com/tfbagas/support"
          target="_blank"
          rel="noopener noreferrer"
          className="m3-btn-morph inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#0A0C10] hover:bg-[#1C2430] text-[#F4F7FB] border border-[#AAB7C5]/18 text-xs font-medium"
        >
          <span>Support on SociaBuzz</span>
          <ArrowUpRight className="w-3.5 h-3.5 text-[#93B8D8]" />
        </a>

        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 rounded-lg text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] transition-colors cursor-pointer"
          title="Dismiss"
          aria-label="Dismiss support banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
