import React, { useEffect } from "react";
import { Coffee, ExternalLink, X, Check } from "lucide-react";

export default function SupportToast({ show, onClose }) {
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => {
      onClose();
    }, 10000); // Auto close after 10 seconds
    return () => clearTimeout(timer);
  }, [show, onClose]);

  if (!show) return null;

  return (
    <aside
      aria-label="Export Success & Support"
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 max-w-[92vw] sm:max-w-md liquid-glass rounded-2xl p-4 border border-[#00E987]/50 shadow-[0_12px_36px_rgba(0,0,0,0.6),0_0_20px_rgba(0,233,135,0.2)] flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#00E987]/20 border border-[#00E987]/40 flex items-center justify-center shrink-0 text-[#00E987] mt-0.5">
            <Check size={16} className="text-[#00E987]" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-white flex items-center gap-1.5 font-display">
              Plugin Exported Successfully!
            </span>
            <span className="text-[11px] text-[#91A69A] mt-0.5 leading-snug">
              Plugin exported! Support TFBAGAS on SociaBuzz ☕
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          title="Close notification"
          className="p-1 rounded-lg text-[#91A69A] hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-[#20352B]/60">
        <a
          href="https://sociabuzz.com/tfbagas/support"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 h-9 rounded-xl bg-[#00E987] hover:bg-[#16FFA0] text-[#080D0B] font-bold text-xs flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(0,233,135,0.3)] transition-all cursor-pointer active:scale-95"
        >
          <Coffee size={14} className="fill-[#080D0B]" />
          <span>Support on SociaBuzz ☕</span>
          <ExternalLink size={12} />
        </a>

        <button
          type="button"
          onClick={onClose}
          className="px-3 h-9 rounded-xl bg-[#16231D]/80 hover:bg-[#1C2C24] border border-[#20352B] text-[#91A69A] hover:text-white text-xs font-semibold transition-all cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    </aside>
  );
}
