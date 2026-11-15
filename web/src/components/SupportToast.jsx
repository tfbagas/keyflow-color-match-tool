import React from "react";
import { CheckCircle2, Heart, X, ExternalLink } from "lucide-react";

export default function SupportToast({ visible, filename, onClose }) {
  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-50">
      <div className="m3-panel m3-toast-enter rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.75)] bg-[#151519]/95 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#1E1E24] border border-white/[0.08] flex items-center justify-center text-[#6EE7B7] shrink-0 mt-0.5">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#E2E4E9]">
                Plugin Exported Successfully!
              </h4>
              {filename && (
                <p className="text-[11px] font-mono text-[#9CA3AF] truncate max-w-[230px] mt-0.5">
                  {filename}
                </p>
              )}
              <p className="text-xs text-[#9CA3AF] mt-1.5 leading-relaxed">
                Saved your time? Support{" "}
                <span className="text-[#E2E4E9] font-semibold">@tfbagas</span> so
                this tool stays free &amp; keeps getting better!
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#9CA3AF]/60 hover:text-[#E2E4E9] hover:bg-white/5 transition-colors cursor-pointer shrink-0"
            aria-label="Close notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3 pt-2.5 border-t border-white/[0.08] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-[#9CA3AF] hover:text-[#E2E4E9] hover:bg-white/5 transition-colors cursor-pointer"
          >
            Maybe Later
          </button>
          <a
            href="https://sociabuzz.com/tfbagas/tribe"
            target="_blank"
            rel="noopener noreferrer"
            className="m3-btn-primary-morph inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#6EE7B7] hover:bg-[#86EFAC] text-[#042F1E]"
          >
            <Heart className="w-3.5 h-3.5" />
            <span>Support on SociaBuzz</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
