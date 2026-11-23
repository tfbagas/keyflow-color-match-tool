import React, { useEffect, useState, useCallback } from "react";
import { X, Download, Image as ImageIcon, Loader2 } from "lucide-react";
import { renderReleasePosterBlob } from "../utils/releaseKitGenerator";
import { downloadBlob } from "../utils/download";
import { useLanguage } from "../i18n/LanguageContext";
import { usePresence } from "../hooks/usePresence";

export default function ReleaseMediaKitModal({ isOpen, onClose }) {
  const { lang, setLang, t } = useLanguage();
  const { isMounted, state: presenceState } = usePresence(isOpen, 160);
  const [posterData, setPosterData] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isRendering, setIsRendering] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    let createdUrl = "";

    setIsRendering(true);
    setErrorMsg("");

    const timer = setTimeout(async () => {
      try {
        const res = await renderReleasePosterBlob(lang);
        if (cancelled) return;
        createdUrl = URL.createObjectURL(res.blob);
        setPosterData(res);
        setPreviewUrl(createdUrl);
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err?.message || "Failed to generate release poster.");
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    }, 20);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
      setPreviewUrl("");
      setPosterData(null);
    };
  }, [isOpen, lang]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const handleDownload = useCallback(() => {
    if (!posterData?.blob) return;
    downloadBlob(posterData.blob, posterData.fileName);
  }, [posterData]);

  if (!isMounted) return null;

  return (
    <div
      data-state={presenceState}
      className="studio-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#07090D]/80 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="release-poster-modal-title"
    >
      <div
        data-state={presenceState}
        className="studio-modal optical-refract-glass relative w-full max-w-5xl rounded-2xl bg-[#11161F]/95 border border-[#AAB7C5]/16 p-4 sm:p-6 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#AAB7C5]/12 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#4A6B86]/18 border border-[#4A6B86]/38 flex items-center justify-center">
              <ImageIcon className="w-4 h-4 text-[#93B8D8]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="release-poster-modal-title"
                  className="text-sm sm:text-base font-bold font-display text-[#F4F7FB]"
                >
                  {t("releaseModal.title")}
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#4A6B86]/18 text-[#93B8D8] border border-[#4A6B86]/38">
                  2400 x 1350 PNG
                </span>
              </div>
              <p className="text-[11px] text-[#AAB7C5]">
                {t("releaseModal.subtitle")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Instant EN | ID Poster Language Switcher */}
            <div
              role="group"
              aria-label={t("nav.langSwitchTitle")}
              className="inline-flex items-center p-0.5 rounded-full bg-[#0A0C10] border border-[#AAB7C5]/14 text-[10px] font-mono"
            >
              {["en", "id"].map((code) => {
                const active = lang === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setLang(code)}
                    className={`px-2 py-0.5 rounded-full uppercase transition-colors cursor-pointer ${
                      active
                        ? "bg-[#F4F7FB] text-[#0A0C10] font-bold"
                        : "text-[#AAB7C5] hover:text-[#F4F7FB]"
                    }`}
                  >
                    {code.toUpperCase()}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label={t("releaseModal.closeAria")}
              className="m3-btn-morph w-8 h-8 rounded-xl bg-[#1C2430]/60 hover:bg-[#1C2430] border border-[#AAB7C5]/14 flex items-center justify-center text-[#AAB7C5] hover:text-[#F4F7FB] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Preview Frame */}
        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-[#07090D] border border-[#AAB7C5]/14 flex items-center justify-center">
          {isRendering && (
            <div className="flex flex-col items-center gap-2 text-xs text-[#AAB7C5]">
              <Loader2 className="w-5 h-5 text-[#93B8D8] animate-spin" />
              <span className="font-mono">{t("releaseModal.rendering")}</span>
            </div>
          )}

          {!isRendering && errorMsg && (
            <div className="text-xs text-rose-400 font-mono px-4 text-center">
              {errorMsg}
            </div>
          )}

          {!isRendering && !errorMsg && previewUrl && (
            <img
              src={previewUrl}
              alt="ToneBench v1.0.0 Release Poster"
              className="w-full h-full object-contain select-none"
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="text-[11px] font-mono text-[#AAB7C5]">
            {posterData
              ? `${posterData.fileName} (${Math.round(posterData.blob.size / 1024)} KB)`
              : t("releaseModal.preparing")}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="m3-btn-morph px-4 py-2 rounded-xl bg-[#1C2430]/60 hover:bg-[#1C2430] border border-[#AAB7C5]/14 text-xs font-medium text-[#C9D7E2] cursor-pointer"
            >
              {t("releaseModal.close")}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!posterData || isRendering}
              className="m3-btn-primary-morph inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#F4F7FB] hover:bg-[#FBFDFF] disabled:opacity-45 disabled:cursor-not-allowed text-[#0A0C10] text-xs font-semibold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t("releaseModal.download")}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
