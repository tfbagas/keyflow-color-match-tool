import React, { useState } from "react";
import { Coffee, ExternalLink, X } from "lucide-react";

export default function SupportBanner() {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem("kf_banner_dismissed") === "true";
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("kf_banner_dismissed", "true");
  };

  return (
    <div className="w-full mt-2 liquid-glass-subtle rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 border border-[#00E987]/30 shadow-[0_4px_16px_rgba(0,233,135,0.06)]">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="p-1 rounded-md bg-[#00E987]/15 text-[#00E987] shrink-0">
          <Coffee size={14} />
        </span>
        <p className="text-[11px] sm:text-xs text-[#E8F2ED] truncate">
          100% free &amp; ad-free tool by <strong className="text-[#00E987]">TFBAGAS</strong>. Enjoying it?{" "}
          <a
            href="https://sociabuzz.com/tfbagas/support"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#00E987] hover:text-[#16FFA0] underline underline-offset-2 font-semibold inline-flex items-center gap-1 ml-1"
          >
            Support future updates →
          </a>
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <a
          href="https://sociabuzz.com/tfbagas/support"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#00E987]/15 hover:bg-[#00E987] text-[#00E987] hover:text-[#080D0B] border border-[#00E987]/30 text-[10px] font-bold transition-all"
        >
          <span>Support ☕</span>
          <ExternalLink size={10} />
        </a>
        <button
          type="button"
          onClick={handleDismiss}
          title="Dismiss banner"
          className="p-1 rounded-md text-[#91A69A] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
