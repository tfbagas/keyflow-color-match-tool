import React, { useState } from "react";
import { CheckCircle2, Heart, X, ExternalLink } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { usePresence } from "../hooks/usePresence";

export default function SupportToast({ visible, filename, onClose }) {
  const { t } = useLanguage();
  const { isMounted, state: presenceState } = usePresence(visible, 150);
  const [lastFilename, setLastFilename] = useState(filename);

  if (filename && filename !== lastFilename) {
    setLastFilename(filename);
  }

  if (!isMounted) return null;

  const displayFilename = filename || lastFilename;

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-50">
      <div
        data-state={presenceState}
        className="studio-toast m3-panel rounded-2xl p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_40px_rgba(0,0,0,0.75)] bg-[#101216]/95 backdrop-blur-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#1E1E24] border border-white/[0.08] flex items-center justify-center text-[#6EE7B7] shrink-0 mt-0.5">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#E2E4E9]">
                {t("supportToast.title")}
              </h4>
              {displayFilename && (
                <p className="text-[11px] font-mono text-[#9CA3AF] truncate max-w-[230px] mt-0.5">
                  {displayFilename}
                </p>
              )}
              <p className="text-xs text-[#9CA3AF] mt-1.5 leading-relaxed">
                {t("supportToast.desc1")}{" "}
                <span className="text-[#E2E4E9] font-semibold">@tfbagas</span>{" "}
                {t("supportToast.desc2")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#9CA3AF]/60 hover:text-[#E2E4E9] hover:bg-white/5 transition-colors cursor-pointer shrink-0"
            aria-label={t("supportToast.closeAria")}
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
            {t("supportToast.maybeLater")}
          </button>
          <a
            href="https://sociabuzz.com/tfbagas/support"
            target="_blank"
            rel="noopener noreferrer"
            className="m3-btn-primary-morph inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#6EE7B7] hover:bg-[#86EFAC] text-[#042F1E]"
          >
            <Heart className="w-3.5 h-3.5" />
            <span>{t("supportToast.supportBtn")}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
