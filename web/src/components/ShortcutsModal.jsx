import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Keyboard } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { usePresence } from "../hooks/usePresence";

export default function ShortcutsModal({ isOpen, onClose }) {
  const { t, dict } = useLanguage();
  const { isMounted, state: presenceState } = usePresence(isOpen, 160);

  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isMounted || typeof document === "undefined") return null;

  const shortcuts = dict?.shortcutsModal?.shortcuts || [];
  const touchTips = dict?.shortcutsModal?.touchTips || [];

  return createPortal(
    <div
      data-state={presenceState}
      className="studio-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#07090D]/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        data-state={presenceState}
        className="studio-modal w-full max-w-2xl max-h-[85dvh] flex flex-col rounded-2xl bg-[#11161F]/96 backdrop-blur-2xl border border-[#AAB7C5]/16 shadow-[inset_0_1px_0_rgba(244,247,251,0.08),0_24px_64px_rgba(0,0,0,0.85)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#AAB7C5]/12 shrink-0">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-[#93B8D8]" />
            <h2 className="text-xs font-sans font-semibold uppercase tracking-[0.08em] text-[#F4F7FB]">
              {t("shortcutsModal.title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] transition-colors cursor-pointer"
            aria-label={t("shortcutsModal.closeAria")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2 flex-1 overflow-y-auto">
          <p className="text-xs text-[#AAB7C5] leading-relaxed px-1 pb-1">
            {t("shortcutsModal.subtitle")}
          </p>
          {shortcuts.map((item) => (
            <div
              key={item.keys}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-[#0A0C10]/70 border border-[#AAB7C5]/12"
            >
              <span className="text-xs text-[#C9D7E2]">{item.desc}</span>
              <kbd className="shrink-0 px-2 py-0.5 rounded-md bg-[#1C2430]/75 border border-[#AAB7C5]/18 text-[10px] font-mono text-[#F4F7FB]">
                {item.keys}
              </kbd>
            </div>
          ))}

          <div className="pt-2 mt-2 border-t border-[#AAB7C5]/12 space-y-1.5">
            <div className="text-[10.5px] font-sans font-semibold uppercase tracking-[0.08em] text-[#AAB7C5] px-1">
              {t("shortcutsModal.touchTipsHeader")}
            </div>
            {touchTips.map((tip) => (
              <div
                key={tip.gesture}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-[#0A0C10]/70 border border-[#AAB7C5]/12"
              >
                <span className="text-xs text-[#C9D7E2]">{tip.desc}</span>
                <span className="shrink-0 px-2 py-0.5 rounded-md bg-[#4A6B86]/16 border border-[#4A6B86]/38 text-[10px] font-mono text-[#93B8D8]">
                  {tip.gesture}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
