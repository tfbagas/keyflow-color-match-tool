import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Check, X, ArrowUpRight } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { usePresence } from "../hooks/usePresence";

function resolveFormatBadge(name) {
  const clean = String(name || "").trim();
  const dotIdx = clean.lastIndexOf(".");
  if (dotIdx > 0 && dotIdx < clean.length - 1) {
    return `.${clean.slice(dotIdx + 1).toLowerCase()}`;
  }
  return "EXPORT";
}

export default function SupportToast({ visible, filename, formatBadge, onClose }) {
  const { t } = useLanguage();
  const { isMounted, state: presenceState } = usePresence(visible, 150);
  const [lastFilename, setLastFilename] = useState(filename);
  const [lastBadge, setLastBadge] = useState(formatBadge);
  const [isHovered, setIsHovered] = useState(false);

  if (filename && filename !== lastFilename) {
    setLastFilename(filename);
  }
  if (formatBadge && formatBadge !== lastBadge) {
    setLastBadge(formatBadge);
  }

  useEffect(() => {
    if (!visible || isHovered) return undefined;
    const timer = setTimeout(() => {
      onClose?.();
    }, 12000);
    return () => clearTimeout(timer);
  }, [visible, filename, isHovered, onClose]);

  if (!isMounted || typeof document === "undefined") return null;

  const displayFilename = filename || lastFilename || "ToneBench_Export.cube";
  const displayBadge = formatBadge || lastBadge || resolveFormatBadge(displayFilename);

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      data-state={presenceState}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="studio-toast fixed bottom-5 right-5 z-[120] w-[340px] max-w-[calc(100vw-32px)] rounded-xl bg-[#11161F]/95 backdrop-blur-md border border-[#AAB7C5]/20 p-4 shadow-[0_16px_40px_rgba(3,6,12,0.7)] font-sans text-left"
    >
      {/* Top Row: Crisp Check Icon (#7FA3C2), Export Complete Title, Filename + Format Badge, Close Button */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#0A0C10] border border-[#4A6B86]/50 flex items-center justify-center text-[#7FA3C2] shrink-0 mt-0.5">
            <Check className="w-3.5 h-3.5 stroke-[2.25]" />
          </div>
          <div className="min-w-0">
            <h4 className="font-sans text-xs font-semibold text-[#F4F7FB] leading-tight">
              {t("supportToast.title")}
            </h4>
            <div className="mt-1 flex items-center gap-1.5 min-w-0">
              <span
                title={displayFilename}
                className="font-mono text-[11px] text-[#C9D7E2] truncate max-w-[180px]"
              >
                {displayFilename}
              </span>
              {displayBadge && (
                <span className="shrink-0 px-1.5 py-0.5 rounded bg-[#0A0C10] border border-[#AAB7C5]/18 font-mono text-[9.5px] font-medium text-[#93B8D8]">
                  {displayBadge}
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
          aria-label={t("supportToast.closeAria")}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Subtle Creator Support & Pack Strip */}
      <div className="mt-3 pt-3 border-t border-[#AAB7C5]/12 space-y-2.5">
        <p className="font-sans text-[11px] text-[#AAB7C5] leading-relaxed">
          {t("supportToast.desc")}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <a
            href="https://sociabuzz.com/tfbagas/shop"
            target="_blank"
            rel="noopener noreferrer"
            className="studio-tactile min-h-[32px] px-2.5 py-1.5 rounded-lg bg-[#0A0C10] hover:bg-[#1C2430] border border-[#AAB7C5]/18 hover:border-[#7FA3C2]/50 font-sans text-[11px] font-medium text-[#C9D7E2] hover:text-[#F4F7FB] inline-flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
          >
            <span className="truncate">{t("supportToast.presetPacksBtn")}</span>
            <ArrowUpRight className="w-3 h-3 text-[#7FA3C2] shrink-0" />
          </a>
          <a
            href="https://sociabuzz.com/tfbagas/donate"
            target="_blank"
            rel="noopener noreferrer"
            className="studio-tactile min-h-[32px] px-2.5 py-1.5 rounded-lg bg-[#1C2430] hover:bg-[#4A6B86]/35 border border-[#4A6B86]/50 hover:border-[#7FA3C2]/60 font-sans text-[11px] font-semibold text-[#F4F7FB] inline-flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
          >
            <span className="truncate">{t("supportToast.supportDonateBtn")}</span>
            <ArrowUpRight className="w-3 h-3 text-[#93B8D8] shrink-0" />
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
