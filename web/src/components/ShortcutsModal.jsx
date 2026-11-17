import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Keyboard } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

export default function ShortcutsModal({ isOpen, onClose }) {
  const { t, dict } = useLanguage();

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

  if (!isOpen) return null;

  const shortcuts = dict?.shortcutsModal?.shortcuts || [];
  const touchTips = dict?.shortcutsModal?.touchTips || [];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85dvh] flex flex-col rounded-2xl bg-[#131419] border border-white/[0.12] shadow-2xl overflow-hidden m3-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-[#F4F5F7]" />
            <h2 className="text-xs font-mono uppercase tracking-[0.14em] text-[#F4F5F7]">
              {t("shortcutsModal.title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#9CA3AF] hover:text-[#F4F5F7] hover:bg-white/[0.06] transition-colors cursor-pointer"
            aria-label={t("shortcutsModal.closeAria")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2 flex-1 overflow-y-auto">
          {shortcuts.map((item) => (
            <div
              key={item.keys}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06]"
            >
              <span className="text-xs text-[#D1D5DB]">{item.desc}</span>
              <kbd className="shrink-0 px-2 py-0.5 rounded-md bg-white/[0.07] border border-white/[0.14] text-[10px] font-mono text-[#F4F5F7]">
                {item.keys}
              </kbd>
            </div>
          ))}

          <div className="pt-2 mt-2 border-t border-white/[0.08] space-y-1.5">
            <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#9CA3AF] px-1">
              {t("shortcutsModal.touchTipsHeader")}
            </div>
            {touchTips.map((tip) => (
              <div
                key={tip.gesture}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06]"
              >
                <span className="text-xs text-[#D1D5DB]">{tip.desc}</span>
                <span className="shrink-0 px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.12] text-[10px] font-mono text-[#6EE7B7]">
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
