/* eslint-disable react-refresh/only-export-components */
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Check,
  ShieldCheck,
  Cpu,
  Layers,
  Rocket,
  ChevronDown,
  History,
  Droplets,
} from "lucide-react";
import BrandLogo from "./BrandLogo";
import { useLanguage } from "../i18n/LanguageContext";
import { usePresence } from "../hooks/usePresence";

export const CHANGELOG_HISTORY = [
  {
    version: "v1.0.0",
    subtitle: "Initial Public Release",
    subtitleId: "Rilis Publik Perdana",
    isLatest: true,
    icon: Rocket,
    items: [
      "Deterministic two-stage 3D OKLab color transfer solver (Source Normalize + 16-direction Optimal Transport + Sigma Style Transfer) baked into a 32³ tetrahedral LUT in under 8ms.",
      "Editable LUT lab with 5-zone tonal curve, 3-way color wheels, 6-vector Hue 6V, and Rec.709 I-Line skin-tone protection.",
      "Pro Scopes: Histogram, RGB Parade, Vectorscope, Zebra / Clipping and False Color IRE overlays, eyedropper and pixel loupe.",
      "Universal export to .cube, .lut, .ffx and .kfplug, plus hardware WebCodecs video export, bilingual EN | ID interface, and 100% client-side processing.",
    ],
    itemsId: [
      "Solver transfer warna 3D OKLab deterministik dua-tahap (Source Normalize + Optimal Transport 16 arah + Sigma Style Transfer) yang di-bake ke LUT tetrahedral 32³ dalam waktu kurang dari 8ms.",
      "Lab LUT yang dapat diedit dengan kurva tonal 5-zona, 3-way color wheels, Hue 6V, dan proteksi warna kulit Rec.709 I-Line.",
      "Pro Scopes: Histogram, RGB Parade, Vectorscope, overlay Zebra / Clipping dan False Color IRE, eyedropper, dan pixel loupe.",
      "Ekspor universal ke .cube, .lut, .ffx dan .kfplug, plus ekspor video WebCodecs, antarmuka dua bahasa EN | ID, dan 100% diproses di browser.",
    ],
  },
];

export function ReleaseHistoryAccordion() {
  const { lang, t } = useLanguage();
  const [expandedMap, setExpandedMap] = useState({
    "v1.0.0": true,
  });

  const toggleVersion = (ver) => {
    setExpandedMap((prev) => ({
      ...prev,
      [ver]: !prev[ver],
    }));
  };

  return (
    <div className="space-y-2.5">
      {CHANGELOG_HISTORY.map((release) => {
        const Icon = release.icon;
        const isExpanded = Boolean(expandedMap[release.version]);
        const subtitle =
          lang === "id" && release.subtitleId ? release.subtitleId : release.subtitle;
        const items =
          lang === "id" && release.itemsId ? release.itemsId : release.items;

        return (
          <div
            key={release.version}
            className={`rounded-xl border transition-colors ${
              release.isLatest
                ? "bg-[#0A0C10] border-[#4A6B86]/35"
                : "bg-[#0A0C10] border-[#AAB7C5]/12 hover:border-[#4A6B86]/35"
            }`}
          >
            <button
              type="button"
              onClick={() => toggleVersion(release.version)}
              aria-expanded={isExpanded}
              className="w-full flex items-center justify-between gap-3 p-3.5 text-left cursor-pointer select-none"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#1C2430]/60 border border-[#AAB7C5]/14 flex items-center justify-center text-[#F4F7FB] shrink-0">
                  <Icon
                    className={`w-4 h-4 ${
                      release.isLatest ? "text-[#93B8D8]" : "text-[#AAB7C5]"
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold font-mono text-[#F4F7FB]">
                      {release.version}
                    </span>
                    {release.isLatest && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#4A6B86]/18 text-[#93B8D8] border border-[#4A6B86]/40">
                        <Check className="w-2.5 h-2.5" />
                        {t("changelogModal.latest")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#AAB7C5] truncate mt-0.5">
                    {subtitle}
                  </div>
                </div>
              </div>

              <ChevronDown
                className={`studio-chevron w-4 h-4 text-[#AAB7C5] shrink-0 ${
                  isExpanded ? "rotate-180 text-[#F4F7FB]" : "rotate-0"
                }`}
              />
            </button>

            <div
              className="m3-collapse-grid"
              data-expanded={isExpanded}
            >
              <div className="m3-collapse-inner">
                <div className="px-3.5 pb-3.5 pt-1 border-t border-[#AAB7C5]/12">
                  <ul className="space-y-2 text-xs text-[#C9D7E2] leading-relaxed pt-2">
                    {items.map((point, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#7FA3C2]/70 mt-1.5 shrink-0" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ChangelogModal({ open, onClose, onViewFullHistory }) {
  const { t, dict } = useLanguage();
  const { isMounted, state: presenceState } = usePresence(open, 160);
  const v095Items = dict?.about?.v095Items || [];

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!isMounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-state={presenceState}
      onClick={onClose}
      className="studio-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#07090D]/80 backdrop-blur-md"
    >
      <div
        data-state={presenceState}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-modal-title"
        className="studio-modal m3-panel w-full max-w-2xl max-h-[85dvh] flex flex-col rounded-2xl p-5 sm:p-6 shadow-[inset_0_1px_0_rgba(244,247,251,0.08),0_24px_64px_rgba(0,0,0,0.85)] bg-[#11161F]/96 backdrop-blur-2xl border border-[#AAB7C5]/16"
      >
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#AAB7C5]/12 shrink-0">
          <div className="flex items-center gap-3">
            <BrandLogo size={38} />
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="changelog-modal-title"
                  className="text-base sm:text-lg font-bold font-display text-[#F4F7FB]"
                >
                  {t("changelogModal.whatsNewIn", { version: "v1.0.0" })}
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#4A6B86]/18 text-[#93B8D8] border border-[#4A6B86]/40">
                  <Check className="w-2.5 h-2.5" />
                  {t("changelogModal.latest")}
                </span>
              </div>
              <p className="text-xs text-[#AAB7C5] mt-0.5">
                {t("about.preReleasePolish")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] transition-colors cursor-pointer"
            aria-label={t("changelogModal.closeAria")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="my-4 space-y-2.5 flex-1 overflow-y-auto pr-1">
          {v095Items.map((point, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 rounded-xl bg-[#0A0C10]/75 border border-[#AAB7C5]/14"
            >
              <div className="w-6 h-6 rounded-lg bg-[#1C2430]/75 border border-[#AAB7C5]/14 flex items-center justify-center text-[#F4F7FB] shrink-0 mt-0.5">
                <Droplets className="w-3.5 h-3.5 text-[#93B8D8]" />
              </div>
              <p className="text-xs text-[#C9D7E2] leading-relaxed">
                <span className="font-semibold text-[#F4F7FB]">{point.bold}</span>{" "}
                {point.text}
              </p>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-[#AAB7C5]/12 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {onViewFullHistory ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onViewFullHistory();
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#AAB7C5] hover:text-[#F4F7FB] transition-colors cursor-pointer"
            >
              <History className="w-3.5 h-3.5" />
              <span>{t("changelogModal.viewFullHistory")}</span>
            </button>
          ) : (
            <span className="text-[11px] font-mono text-[#AAB7C5]">
              {t("changelogModal.buildNote")}
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="m3-btn-morph px-4 py-2 rounded-xl text-xs font-semibold bg-[#F4F7FB] hover:bg-[#FBFDFF] text-[#0A0C10] cursor-pointer ml-auto"
          >
            {t("changelogModal.gotIt")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
