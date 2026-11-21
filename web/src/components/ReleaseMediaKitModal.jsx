import React, { useEffect, useState, useCallback } from "react";
import { X, Download, Sparkles, Loader2 } from "lucide-react";
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
      className="studio-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="release-poster-modal-title"
    >
      <div
        data-state={presenceState}
        className="studio-modal optical-refract-glass relative w-full max-w-5xl rounded-2xl bg-[#0C0E13]/92 border border-white/[0.14] p-4 sm:p-6 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#6EE7B7]/12 border border-[#6EE7B7]/35 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[#6EE7B7]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="release-poster-modal-title"
                  className="text-sm sm:text-base font-bold font-display text-[#F4F5F7]"
                >
                  {t("releaseModal.title")}
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-[#6EE7B7] border border-[#6EE7B7]/30">
                  2400 x 1350 PNG
                </span>
              </div>
              <p className="text-[11px] text-[#9CA3AF]">
                {t("releaseModal.subtitle")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Instant EN | ID Poster Language Switcher */}
            <div
              role="group"
              aria-label={t("nav.langSwitchTitle")}
              className="inline-flex items-center p-0.5 rounded-full bg-white/[0.06] border border-white/[0.12] text-[10px] font-mono"
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
                        ? "bg-[#E2E4E9] text-[#0E0E11] font-bold"
                        : "text-[#9CA3AF] hover:text-[#F4F5F7]"
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
              className="m3-btn-morph w-8 h-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.11] border border-white/[0.10] flex items-center justify-center text-[#9CA3AF] hover:text-[#F4F5F7] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Preview Frame */}
        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-[#060709] border border-white/[0.10] flex items-center justify-center">
          {isRendering && (
            <div className="flex flex-col items-center gap-2 text-xs text-[#9CA3AF]">
              <Loader2 className="w-5 h-5 text-[#6EE7B7] animate-spin" />
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
              alt="Color Match for Keyflow v0.9.5 Beta Release Poster"
              className="w-full h-full object-contain select-none"
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="text-[11px] font-mono text-[#9CA3AF]">
            {posterData
              ? `${posterData.fileName} (${Math.round(posterData.blob.size / 1024)} KB)`
              : t("releaseModal.preparing")}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="m3-btn-morph px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.10] text-xs font-medium text-[#E2E4E9] cursor-pointer"
            >
              {t("releaseModal.close")}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!posterData || isRendering}
              className="m3-btn-primary-morph inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#6EE7B7] hover:bg-[#5EEAD4] disabled:opacity-45 disabled:cursor-not-allowed text-[#060709] text-xs font-semibold cursor-pointer"
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
