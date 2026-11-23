import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  X,
  HelpCircle,
  Pipette,
  Sliders,
  Download,
  CheckCircle2,
  Keyboard,
  Film,
  Smartphone,
  Monitor,
  ShieldCheck,
} from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

const GUIDE_TABS = [
  { id: "match", labelKey: "guide.tabMatch", icon: Pipette },
  { id: "edit", labelKey: "guide.tabEdit", icon: Sliders },
  { id: "install", labelKey: "guide.tabInstall", icon: Download },
];

const ENGINE_GUIDE = [
  {
    name: "Altair 4.5 Refresh",
    tagKey: "guide.engAltair45Tag",
    descKey: "guide.engAltair45Desc",
  },
  {
    name: "Altair 4.0",
    tagKey: "guide.engAltair40Tag",
    descKey: "guide.engAltair40Desc",
  },
  {
    name: "Polaris 3.5",
    tagKey: "guide.engPolarisTag",
    descKey: "guide.engPolarisDesc",
  },
];

const EASE_SHUTTER = [0.16, 1, 0.3, 1];

export default function HowToUseModal({
  isOpen,
  onClose,
  initialTab = "match",
  onOpenShortcuts,
}) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [prevOpen, setPrevOpen] = useState(isOpen);
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }

  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="how-to-use-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onClick={onClose}
          className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 bg-[#07090D]/80 backdrop-blur-md"
        >
          <motion.div
            key="how-to-use-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("guide.title")}
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.24, ease: EASE_SHUTTER }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[86dvh] flex flex-col rounded-2xl bg-[#11161F]/98 border border-[#AAB7C5]/16 shadow-[inset_0_1px_0_rgba(244,247,251,0.08),0_28px_72px_rgba(0,0,0,0.88)] overflow-hidden text-left"
          >
            {/* Header */}
            <div className="px-4 sm:px-5 py-3.5 border-b border-[#AAB7C5]/12 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-[#4A6B86]/18 border border-[#4A6B86]/38 flex items-center justify-center shrink-0">
                  <HelpCircle className="w-4 h-4 text-[#93B8D8]" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-sm sm:text-base font-semibold text-[#F4F7FB] leading-tight">
                    {t("guide.title")}
                  </h2>
                  <p className="font-sans text-[11px] font-medium text-[#AAB7C5] mt-0.5 truncate">
                    {t("guide.subtitle")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <kbd className="hidden sm:inline-flex keycap-hint">Esc</kbd>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t("guide.closeAria")}
                  className="p-1.5 rounded-lg text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Animated 3-Tab Switcher with layoutId pill */}
            <div className="px-4 sm:px-5 pt-3 pb-2.5 border-b border-[#AAB7C5]/12 bg-[#0A0C10]/70 shrink-0">
              <div
                role="tablist"
                aria-label="Guide sections"
                className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#07090D] border border-[#AAB7C5]/14"
              >
                {GUIDE_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveTab(tab.id)}
                      className={`relative py-2 px-2 sm:px-3 rounded-lg text-[11px] sm:text-xs font-sans font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        isActive
                          ? "text-[#0A0C10] font-semibold"
                          : "text-[#AAB7C5] hover:text-[#F4F7FB]"
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="guide-modal-tab-pill"
                          transition={{ type: "spring", stiffness: 460, damping: 36 }}
                          className="absolute inset-0 rounded-lg bg-[#F4F7FB] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_8px_rgba(0,0,0,0.45)]"
                        />
                      )}
                      <Icon
                        className={`relative z-10 w-3.5 h-3.5 shrink-0 ${
                          isActive ? "text-[#0A0C10]" : "text-[#7FA3C2]"
                        }`}
                      />
                      <span className="relative z-10 truncate">{t(tab.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
              <AnimatePresence mode="wait">
                {activeTab === "match" && (
                  <motion.div
                    key="tab-match"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: EASE_SHUTTER }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <h3 className="text-xs font-sans font-semibold uppercase tracking-[0.08em] text-[#93B8D8]">
                        {t("guide.workflowHeading")}
                      </h3>
                      <ol className="space-y-2 text-xs sm:text-[13px] text-[#C9D7E2] leading-relaxed">
                        <li className="flex gap-2.5 p-3 rounded-xl bg-[#0A0C10]/70 border border-[#AAB7C5]/12">
                          <span className="font-mono tabular-nums text-[#7FA3C2] font-semibold shrink-0">01</span>
                          <span>
                            <strong className="text-[#F4F7FB]">{t("guide.matchStep1Bold")}</strong>{" "}
                            {t("guide.matchStep1Body")}
                          </span>
                        </li>
                        <li className="flex gap-2.5 p-3 rounded-xl bg-[#0A0C10]/70 border border-[#AAB7C5]/12">
                          <span className="font-mono tabular-nums text-[#7FA3C2] font-semibold shrink-0">02</span>
                          <span>
                            <strong className="text-[#F4F7FB]">{t("guide.matchStep2Bold")}</strong>{" "}
                            {t("guide.matchStep2Body")}
                          </span>
                        </li>
                        <li className="flex gap-2.5 p-3 rounded-xl bg-[#0A0C10]/70 border border-[#AAB7C5]/12">
                          <span className="font-mono tabular-nums text-[#7FA3C2] font-semibold shrink-0">03</span>
                          <span>
                            <strong className="text-[#F4F7FB]">{t("guide.matchStep3Bold")}</strong>{" "}
                            {t("guide.matchStep3Body")}
                          </span>
                        </li>
                      </ol>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-xs font-sans font-semibold uppercase tracking-[0.08em] text-[#93B8D8]">
                        {t("guide.chooseSolverHeading")}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {ENGINE_GUIDE.map((eng) => (
                          <div
                            key={eng.name}
                            className="p-3 rounded-xl bg-[#0A0C10] border border-[#AAB7C5]/14 space-y-1.5"
                          >
                            <div className="text-xs font-sans font-semibold text-[#F4F7FB]">
                              {eng.name}
                            </div>
                            <div className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#93B8D8]">
                              {t(eng.tagKey)}
                            </div>
                            <p className="text-[11.5px] font-sans leading-snug text-[#AAB7C5]">
                              {t(eng.descKey)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === "edit" && (
                  <motion.div
                    key="tab-edit"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: EASE_SHUTTER }}
                    className="space-y-4"
                  >
                    <p className="text-xs sm:text-[13px] text-[#C9D7E2] leading-relaxed">
                      {t("guide.editIntro")}
                    </p>

                    <ol className="space-y-2 text-xs sm:text-[13px] text-[#C9D7E2] leading-relaxed">
                      <li className="flex gap-2.5 p-3 rounded-xl bg-[#0A0C10]/70 border border-[#AAB7C5]/12">
                        <span className="font-mono tabular-nums text-[#7FA3C2] font-semibold shrink-0">01</span>
                        <span>
                          <strong className="text-[#F4F7FB]">{t("guide.editStep1Bold")}</strong>{" "}
                          {t("guide.editStep1Body")}
                        </span>
                      </li>
                      <li className="flex gap-2.5 p-3 rounded-xl bg-[#0A0C10]/70 border border-[#AAB7C5]/12">
                        <span className="font-mono tabular-nums text-[#7FA3C2] font-semibold shrink-0">02</span>
                        <span>
                          <strong className="text-[#F4F7FB]">{t("guide.editStep2Bold")}</strong>{" "}
                          {t("guide.editStep2Body")}
                        </span>
                      </li>
                      <li className="flex gap-2.5 p-3 rounded-xl bg-[#0A0C10]/70 border border-[#AAB7C5]/12">
                        <span className="font-mono tabular-nums text-[#7FA3C2] font-semibold shrink-0">03</span>
                        <span>
                          <strong className="text-[#F4F7FB]">{t("guide.editStep3Bold")}</strong>{" "}
                          {t("guide.editStep3Body")}
                        </span>
                      </li>
                      <li className="flex gap-2.5 p-3 rounded-xl bg-[#0A0C10]/70 border border-[#AAB7C5]/12">
                        <span className="font-mono tabular-nums text-[#7FA3C2] font-semibold shrink-0">04</span>
                        <span>
                          <strong className="text-[#F4F7FB]">{t("guide.editStep4Bold")}</strong>{" "}
                          {t("guide.editStep4Body")}
                        </span>
                      </li>
                    </ol>

                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#4A6B86]/14 border border-[#4A6B86]/35 text-xs text-[#C9D7E2]">
                      <ShieldCheck className="w-4 h-4 text-[#93B8D8] shrink-0 mt-0.5" />
                      <span>{t("guide.editTip")}</span>
                    </div>
                  </motion.div>
                )}

                {activeTab === "install" && (
                  <motion.div
                    key="tab-install"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: EASE_SHUTTER }}
                    className="space-y-3"
                  >
                    {/* Desktop NLEs (.cube / .lut) */}
                    <div className="p-3.5 rounded-xl bg-[#0A0C10]/70 border border-[#AAB7C5]/14 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-[#F4F7FB]">
                          <Monitor className="w-4 h-4 text-[#7FA3C2]" />
                          <span>{t("guide.desktopNlesTitle")}</span>
                        </div>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#1C2430]/75 text-[#C9D7E2] border border-[#AAB7C5]/14">
                          33³ / 65³ 3D LUT
                        </span>
                      </div>
                      <ul className="space-y-1.5 text-xs text-[#C9D7E2] leading-relaxed">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#7FA3C2] shrink-0 mt-0.5" />
                          <span>
                            <strong className="text-[#F4F7FB]">DaVinci Resolve:</strong>{" "}
                            {t("guide.davinciDesc")}
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#7FA3C2] shrink-0 mt-0.5" />
                          <span>
                            <strong className="text-[#F4F7FB]">Premiere Pro:</strong>{" "}
                            {t("guide.premiereDesc")}
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#7FA3C2] shrink-0 mt-0.5" />
                          <span>
                            <strong className="text-[#F4F7FB]">Final Cut Pro &amp; CapCut:</strong>{" "}
                            {t("guide.fcpCapcutDesc")}
                          </span>
                        </li>
                      </ul>
                    </div>

                    {/* After Effects (.ffx) */}
                    <div className="p-3.5 rounded-xl bg-[#0A0C10]/70 border border-[#AAB7C5]/14 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-[#F4F7FB]">
                          <Film className="w-4 h-4 text-[#7FA3C2]" />
                          <span>Adobe After Effects (.ffx)</span>
                        </div>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#1C2430]/75 text-[#C9D7E2] border border-[#AAB7C5]/14">
                          LUMETRI PRESET
                        </span>
                      </div>
                      <p className="text-xs text-[#C9D7E2] leading-relaxed">
                        {t("guide.aeFfxDesc")}
                      </p>
                    </div>

                    {/* Keyflow Mobile (.kfplug) */}
                    <div className="p-3.5 rounded-xl bg-[#0A0C10]/70 border border-[#AAB7C5]/14 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-[#F4F7FB]">
                          <Smartphone className="w-4 h-4 text-[#7FA3C2]" />
                          <span>Keyflow Mobile (.kfplug)</span>
                        </div>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#4A6B86]/18 text-[#93B8D8] border border-[#4A6B86]/38">
                          GLSL ES 1.00
                        </span>
                      </div>
                      <ol className="space-y-1 text-xs text-[#C9D7E2] leading-relaxed list-decimal list-inside">
                        <li>{t("guide.kfStep1")}</li>
                        <li>{t("guide.kfStep2")}</li>
                        <li>{t("guide.kfStep3")}</li>
                      </ol>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-4 sm:px-5 py-3 border-t border-[#AAB7C5]/12 bg-[#0A0C10]/85 flex items-center justify-between gap-3 shrink-0">
              {onOpenShortcuts ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose?.();
                    onOpenShortcuts();
                  }}
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-sans font-medium text-[#AAB7C5] hover:text-[#F4F7FB] transition-colors cursor-pointer"
                >
                  <Keyboard className="w-3.5 h-3.5 text-[#7FA3C2]" />
                  <span>{t("guide.shortcutsBtn")}</span>
                </button>
              ) : (
                <span className="font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-[#AAB7C5]">
                  {t("guide.localFooter")}
                </span>
              )}
              <motion.button
                type="button"
                whileTap={{ scale: 0.985 }}
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-[#F4F7FB] hover:bg-[#FBFDFF] text-[#0A0C10] text-xs font-sans font-semibold transition-colors cursor-pointer"
              >
                {t("changelogModal.gotIt")}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
