import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Copy, Check, Share2, QrCode } from "lucide-react";
import { encodeGradeToHash, generateQrMatrix } from "../utils/shareCodec";
import { getLogProfile } from "../utils/logProfiles";
import { useLanguage } from "../i18n/LanguageContext";

function formatEngineName(engineId) {
  if (engineId === "v1") return "Altair v1";
  if (engineId === "v2") return "Vega v2";
  return "Polaris v3 PRO";
}

export default function ShareModal({
  isOpen,
  onClose,
  engineId,
  logProfile,
  matchStrength,
  params,
  onShareFile,
  canShareFile = false,
}) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef(null);

  const hash = isOpen
    ? encodeGradeToHash({ engineId, logProfile, matchStrength, params })
    : "";
  const shareUrl =
    isOpen && typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}${hash}`
      : "";

  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !shareUrl || !canvasRef.current) return;
    const matrix = generateQrMatrix(shareUrl);
    const size = matrix.length;
    const quietZone = 4;
    const totalModules = size + quietZone * 2;
    const scale = Math.max(3, Math.floor(220 / totalModules));
    const px = totalModules * scale;

    const canvas = canvasRef.current;
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = "#000000";
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r][c]) {
          ctx.fillRect((c + quietZone) * scale, (r + quietZone) * scale, scale, scale);
        }
      }
    }
  }, [isOpen, shareUrl]);

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("shareModal.title")}
        className="w-full max-w-sm rounded-2xl bg-[#131419] border border-white/[0.16] shadow-2xl p-4 space-y-3.5 text-left"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-[#6EE7B7]" />
            <h2 className="text-sm font-bold font-display text-[#F4F5F7]">
              {t("shareModal.title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("shareModal.closeAria")}
            className="p-1 rounded-lg text-[#9CA3AF] hover:text-[#F4F5F7] hover:bg-white/[0.06] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
          <span className="px-2 py-0.5 rounded bg-[#6EE7B7]/12 text-[#6EE7B7] border border-[#6EE7B7]/35">
            {formatEngineName(engineId)}
          </span>
          <span className="px-2 py-0.5 rounded bg-white/[0.06] text-[#E2E4E9] border border-white/[0.1]">
            {getLogProfile(logProfile).shortLabel}
          </span>
          <span className="px-2 py-0.5 rounded bg-white/[0.06] text-[#9CA3AF] border border-white/[0.1]">
            {t("shareModal.strengthBadge", { pct: matchStrength })}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-white border border-white/20">
          <canvas ref={canvasRef} className="w-[196px] h-[196px] image-rendering-pixelated" />
          <span className="mt-2 text-[10px] font-mono text-[#18181B]">
            {t("shareModal.scanHint")}
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-[#0A0A0D] border border-white/[0.1] rounded-lg p-1.5">
          <input
            type="text"
            readOnly
            value={shareUrl}
            onFocus={(e) => e.target.select()}
            className="flex-1 bg-transparent text-[11px] font-mono text-[#9CA3AF] outline-none px-1.5 truncate"
          />
          <button
            type="button"
            onClick={handleCopy}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0 transition-colors ${
              copied
                ? "bg-[#86EFAC] text-[#042F1E]"
                : "bg-[#6EE7B7] hover:bg-[#86EFAC] text-[#042F1E]"
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>
              {copied ? t("shareModal.copied") : t("shareModal.copyShareLink")}
            </span>
          </button>
        </div>

        {canShareFile && onShareFile && (
          <button
            type="button"
            onClick={onShareFile}
            className="w-full py-2 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-[#E2E4E9] border border-white/[0.12] text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>{t("shareModal.shareKfplugFile")}</span>
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
