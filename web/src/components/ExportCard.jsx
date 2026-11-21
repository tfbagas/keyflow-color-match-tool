import React, { memo, useEffect, useRef, useState } from "react";
import {
  Download,
  Check,
  Edit3,
  User,
  FileText,
  Package,
  ChevronDown,
  Sliders,
  AlertTriangle,
  Share2,
} from "lucide-react";
import { DEFAULT_ENGINE_ID, getEngineCodename } from "../utils/engineRegistry";
import { useLanguage } from "../i18n/LanguageContext";

const ExportCard = memo(function ExportCard({
  presetName,
  setPresetName,
  authorName,
  setAuthorName,
  description,
  setDescription,
  onExport,
  onShare,
  isExporting,
  disabled,
  isCalibrationActive = false,
  onOpenCalibration,
  onExportFfx,
  onExportCube,
  onExportLut,
  onExportZipPack,
  engineId = DEFAULT_ENGINE_ID,
  fallbackName = "Custom Look",
  isNeutralGrade = false,
}) {
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMetaExpanded, setIsMetaExpanded] = useState(false);
  const [cubeSize, setCubeSize] = useState(32);
  const [exportedKey, setExportedKey] = useState(null);
  const timerRef = useRef(null);
  const canShare = typeof onShare === "function";

  const rawBase = (presetName || fallbackName || "Custom Look").trim();
  const safeBase = rawBase.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "Custom_Look";
  const codename = getEngineCodename(engineId);
  const engineSuffix = codename ? `_${codename}` : "";
  const previewFilename = /_(altair45|altair_refresh|altair|vega|sirius|polaris|v[1234])$/i.test(safeBase)
    ? `${safeBase}.kfplug`
    : `${safeBase}${engineSuffix}.kfplug`;

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const handleTrigger = async (key, handler) => {
    if (!handler || disabled || isExporting) return;
    await handler();
    if (timerRef.current) clearTimeout(timerRef.current);
    setExportedKey(key);
    timerRef.current = setTimeout(() => setExportedKey(null), 1200);
  };

  return (
    <div
      data-open={isExpanded}
      className="capsule-disclosure m3-panel rounded-2xl p-3"
    >
      {/* Header Row with Collapse Toggle */}
      <div
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center justify-between cursor-pointer select-none group"
      >
        <div className="flex items-center gap-2">
          <Package className="w-3.5 h-3.5 text-[#9CA3AF] group-hover:text-[#E2E4E9] transition-colors" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF] group-hover:text-[#E2E4E9] transition-colors">
            {t("exportCard.title")}
          </h3>

          {isCalibrationActive && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenCalibration) onOpenCalibration();
              }}
              title={t("exportCard.calibratedTitle")}
              className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-[#6EE7B7] border border-[#6EE7B7]/30 hover:border-[#6EE7B7]/60 transition-colors cursor-pointer"
            >
              <Sliders className="w-2.5 h-2.5" />
              <span>{t("exportCard.calibrated")}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isExpanded && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExport();
              }}
              disabled={disabled || isExporting}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 ${
                disabled
                  ? "bg-white/[0.035] text-[#9CA3AF]/40 border border-white/[0.09] cursor-not-allowed"
                  : "m3-btn-primary-morph bg-[#6EE7B7] hover:bg-[#86EFAC] text-[#042F1E] cursor-pointer"
              }`}
            >
              <Download className="w-3 h-3" />
              <span>{t("exportCard.exportShort")}</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((prev) => !prev);
            }}
            aria-expanded={isExpanded}
            aria-label={t("exportCard.toggleAria")}
            className="m3-btn-morph p-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-[#9CA3AF] hover:text-[#E2E4E9] border border-white/[0.09] cursor-pointer"
          >
            <ChevronDown
              className={`studio-chevron w-3.5 h-3.5 ${
                isExpanded ? "rotate-180" : "rotate-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Smooth Collapsible Form Inputs */}
      <div
        className={`m3-collapse-grid ${isExpanded ? "mt-3" : "mt-0"}`}
        data-expanded={isExpanded}
      >
        <div className="m3-collapse-inner">
          <div className="space-y-2.5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-medium text-[#9CA3AF]">
                  {t("exportCard.presetNameLabel")}
                </label>
                <span className="text-[10px] font-mono text-[#9CA3AF]/75 truncate max-w-[180px]">
                  {previewFilename}
                </span>
              </div>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder={t("exportCard.presetNamePlaceholder")}
                  className="w-full bg-[#0A0A0D]/38 border border-white/[0.09] focus:border-white/25 rounded-lg pl-3 pr-9 py-2 text-xs text-[#E2E4E9] placeholder-[#9CA3AF]/40 outline-none transition-colors"
                />
                <Edit3 className="w-3.5 h-3.5 text-[#9CA3AF]/60 absolute right-3 pointer-events-none" />
              </div>
            </div>

            {/* Collapsible Metadata (Optional) */}
            <div className="rounded-lg bg-[#0A0A0D]/30 border border-white/[0.07]">
              <button
                type="button"
                onClick={() => setIsMetaExpanded((v) => !v)}
                aria-expanded={isMetaExpanded}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-medium text-[#9CA3AF] hover:text-[#E2E4E9] cursor-pointer select-none"
              >
                <span>{t("exportCard.metadataOptional")}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isMetaExpanded ? "rotate-180" : "rotate-0"
                  }`}
                />
              </button>
              <div className="m3-collapse-grid" data-expanded={isMetaExpanded}>
                <div className="m3-collapse-inner">
                  <div className="px-2.5 pb-2.5 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5 border-t border-white/[0.06]">
                    <div>
                      <label className="block text-[11px] font-medium text-[#9CA3AF] mb-1">
                        {t("exportCard.authorLabel")}
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={authorName}
                          onChange={(e) => setAuthorName(e.target.value)}
                          placeholder={t("exportCard.authorPlaceholder")}
                          className="w-full bg-[#0A0A0D]/38 border border-white/[0.09] focus:border-white/25 rounded-lg pl-3 pr-8 py-2 text-xs text-[#E2E4E9] placeholder-[#9CA3AF]/40 outline-none transition-colors"
                        />
                        <User className="w-3.5 h-3.5 text-[#9CA3AF]/60 absolute right-2.5 pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-[#9CA3AF] mb-1">
                        {t("exportCard.descLabel")}
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder={t("exportCard.descPlaceholder")}
                          className="w-full bg-[#0A0A0D]/38 border border-white/[0.09] focus:border-white/25 rounded-lg pl-3 pr-8 py-2 text-xs text-[#E2E4E9] placeholder-[#9CA3AF]/40 outline-none transition-colors"
                        />
                        <FileText className="w-3.5 h-3.5 text-[#9CA3AF]/60 absolute right-2.5 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {!disabled && isNeutralGrade && (
              <div className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center gap-2 text-[11px] text-amber-200/90">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-300" />
                <span>{t("exportCard.neutralWarning")}</span>
              </div>
            )}

            {/* Material 3 Filled Primary Action Button with Shape-Morphing Spring */}
            <div className={canShare ? "flex items-center gap-2 mt-1" : "mt-1"}>
              <button
                type="button"
                onClick={() => handleTrigger("kfplug", onExport)}
                disabled={disabled || isExporting}
                className={`flex-1 w-full py-2 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-[opacity,transform] duration-200 ${
                  disabled
                    ? "bg-white/[0.035] text-[#9CA3AF]/40 border border-white/[0.09] cursor-not-allowed"
                    : exportedKey === "kfplug"
                    ? "m3-btn-primary-morph bg-[#86EFAC] text-[#042F1E] scale-[0.99] cursor-pointer"
                    : "m3-btn-primary-morph bg-[#6EE7B7] hover:bg-[#86EFAC] text-[#042F1E] cursor-pointer"
                }`}
              >
                {exportedKey === "kfplug" ? (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5] transition-transform duration-200 scale-105" />
                    <span>{t("exportCard.exported")}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 stroke-[2.25]" />
                    <span>
                      {isExporting
                        ? t("exportCard.packagingKfplug")
                        : t("exportCard.exportToKfplug")}
                    </span>
                  </>
                )}
              </button>

              {canShare && (
                <button
                  type="button"
                  onClick={() => handleTrigger("share", onShare)}
                  disabled={disabled || isExporting}
                  title={t("exportCard.shareTitle")}
                  aria-label={t("exportCard.shareTitle")}
                  className={`py-2 px-3 rounded-xl font-medium text-xs flex items-center justify-center gap-1.5 border transition-[opacity,transform] duration-200 shrink-0 ${
                    disabled
                      ? "bg-white/[0.035] text-[#9CA3AF]/40 border-white/[0.09] cursor-not-allowed"
                      : "m3-btn-morph bg-white/[0.04] hover:bg-white/[0.09] text-[#E2E4E9] border-white/[0.12] cursor-pointer"
                  }`}
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("exportCard.share")}</span>
                </button>
              )}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleTrigger("ffx", onExportFfx)}
                disabled={disabled || isExporting || !onExportFfx}
                title={t("exportCard.exportFfxTitle")}
                className={`w-full py-2 px-3 rounded-xl font-medium text-xs flex items-center justify-between gap-2 border transition-[opacity,transform] duration-200 ${
                  disabled
                    ? "bg-white/[0.035] text-[#9CA3AF]/40 border-white/[0.09] cursor-not-allowed"
                    : exportedKey === "ffx"
                    ? "m3-btn-morph bg-[#6EE7B7]/15 text-[#6EE7B7] border-[#6EE7B7]/40 scale-[0.99] cursor-pointer"
                    : "m3-btn-morph bg-white/[0.04] hover:bg-white/[0.09] text-[#E2E4E9] border-white/[0.12] cursor-pointer"
                }`}
              >
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  {exportedKey === "ffx" ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>{t("exportCard.exportedFfx")}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>{t("exportCard.exportFfx")}</span>
                    </>
                  )}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-[#9CA3AF] border border-white/[0.09]">
                  {t("exportCard.aeLumetriBadge")}
                </span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleTrigger("cube", () => onExportCube?.(cubeSize))}
                  disabled={disabled || isExporting || !onExportCube}
                  title={t("exportCard.exportCubeTitle", { size: cubeSize })}
                  className={`flex-1 py-1.5 px-3 rounded-xl font-medium text-xs flex items-center justify-center gap-1.5 border transition-[opacity,transform] duration-200 ${
                    disabled
                      ? "bg-white/[0.035] text-[#9CA3AF]/40 border-white/[0.09] cursor-not-allowed"
                      : exportedKey === "cube"
                      ? "m3-btn-morph bg-[#6EE7B7]/15 text-[#6EE7B7] border-[#6EE7B7]/40 scale-[0.99] cursor-pointer"
                      : "m3-btn-morph bg-white/[0.04] hover:bg-white/[0.09] text-[#E2E4E9] border-white/[0.12] cursor-pointer"
                  }`}
                >
                  {exportedKey === "cube" ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>{t("exportCard.exported")}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>{t("exportCard.exportCube")}</span>
                    </>
                  )}
                </button>

                <div
                  title={t("exportCard.cubeGridTitle")}
                  className="inline-flex items-center p-0.5 rounded-lg bg-[#0A0A0D]/70 border border-white/[0.09] text-[10px] font-mono shrink-0"
                >
                  {[17, 32, 33, 65].map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setCubeSize(sz)}
                      className={`px-1.5 py-1 rounded-md transition-colors cursor-pointer ${
                        cubeSize === sz
                          ? "bg-[#E2E4E9] text-[#0E0E11] font-semibold"
                          : "text-[#9CA3AF] hover:text-[#E2E4E9]"
                      }`}
                    >
                      {sz}x{sz}x{sz}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleTrigger("lut", onExportLut)}
                  disabled={disabled || isExporting || !onExportLut}
                  title={t("exportCard.exportLutTitle")}
                  className={`py-1.5 px-3 rounded-xl font-medium text-xs flex items-center justify-center gap-1.5 border transition-[opacity,transform] duration-200 ${
                    disabled
                      ? "bg-white/[0.035] text-[#9CA3AF]/40 border-white/[0.09] cursor-not-allowed"
                      : exportedKey === "lut"
                      ? "m3-btn-morph bg-[#6EE7B7]/15 text-[#6EE7B7] border-[#6EE7B7]/40 scale-[0.99] cursor-pointer"
                      : "m3-btn-morph bg-white/[0.04] hover:bg-white/[0.09] text-[#E2E4E9] border-white/[0.12] cursor-pointer"
                  }`}
                >
                  {exportedKey === "lut" ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>{t("exportCard.exported")}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>{t("exportCard.exportLut")}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleTrigger("zip", () => onExportZipPack?.(cubeSize))}
                  disabled={disabled || isExporting || !onExportZipPack}
                  title={t("exportCard.exportZipTitle")}
                  className={`py-1.5 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 border transition-[opacity,transform] duration-200 ${
                    disabled
                      ? "bg-white/[0.035] text-[#9CA3AF]/40 border-white/[0.09] cursor-not-allowed"
                      : exportedKey === "zip"
                      ? "m3-btn-morph bg-[#6EE7B7]/20 text-[#6EE7B7] border-[#6EE7B7]/45 scale-[0.99] cursor-pointer"
                      : "m3-btn-morph bg-white/[0.06] hover:bg-white/[0.11] text-[#F4F5F7] border-white/[0.16] cursor-pointer"
                  }`}
                >
                  {exportedKey === "zip" ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>{t("exportCard.packSaved")}</span>
                    </>
                  ) : (
                    <>
                      <Package className="w-3.5 h-3.5 text-[#6EE7B7]" />
                      <span className="truncate">{t("exportCard.exportZipPack")}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default ExportCard;
