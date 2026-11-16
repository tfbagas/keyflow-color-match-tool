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
} from "lucide-react";

const ExportCard = memo(function ExportCard({
  presetName,
  setPresetName,
  authorName,
  setAuthorName,
  description,
  setDescription,
  onExport,
  isExporting,
  disabled,
  isCalibrationActive = false,
  onOpenCalibration,
  onExportCube,
  onExportLut,
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [exportedKey, setExportedKey] = useState(null);
  const timerRef = useRef(null);

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
    <div className="m3-panel rounded-2xl p-3">
      {/* Header Row with Collapse Toggle */}
      <div
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center justify-between cursor-pointer select-none group"
      >
        <div className="flex items-center gap-2">
          <Package className="w-3.5 h-3.5 text-[#9CA3AF] group-hover:text-[#E2E4E9] transition-colors" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF] group-hover:text-[#E2E4E9] transition-colors">
            EXPORT PLUGIN (.KFPLUG)
          </h3>

          {isCalibrationActive && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenCalibration) onOpenCalibration();
              }}
              title="Custom .kfplug Output Calibration Multipliers active — Click to adjust in Settings"
              className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-[#6EE7B7] border border-[#6EE7B7]/30 hover:border-[#6EE7B7]/60 transition-colors cursor-pointer"
            >
              <Sliders className="w-2.5 h-2.5" />
              <span>Calibrated</span>
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
              <span>Export</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((prev) => !prev);
            }}
            aria-expanded={isExpanded}
            aria-label="Toggle Export Plugin panel"
            className="m3-btn-morph p-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-[#9CA3AF] hover:text-[#E2E4E9] border border-white/[0.09] cursor-pointer"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-300 ${
                isExpanded ? "rotate-180" : "rotate-0"
              }`}
              style={{ transitionTimingFunction: "var(--ease-m3-spring)" }}
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
              <label className="block text-[11px] font-medium text-[#9CA3AF] mb-1">
                Look / Preset Name
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="e.g., Oppenheimer Teal Grade"
                  className="w-full bg-[#0A0A0D]/38 border border-white/[0.09] focus:border-white/25 rounded-lg pl-3 pr-9 py-2 text-xs text-[#E2E4E9] placeholder-[#9CA3AF]/40 outline-none transition-colors"
                />
                <Edit3 className="w-3.5 h-3.5 text-[#9CA3AF]/60 absolute right-3 pointer-events-none" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-[#9CA3AF] mb-1">
                  Author / Made By
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="e.g., TFBAGAS"
                    className="w-full bg-[#0A0A0D]/38 border border-white/[0.09] focus:border-white/25 rounded-lg pl-3 pr-8 py-2 text-xs text-[#E2E4E9] placeholder-[#9CA3AF]/40 outline-none transition-colors"
                  />
                  <User className="w-3.5 h-3.5 text-[#9CA3AF]/60 absolute right-2.5 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#9CA3AF] mb-1">
                  Plugin Description
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Auto-generated if left empty..."
                    className="w-full bg-[#0A0A0D]/38 border border-white/[0.09] focus:border-white/25 rounded-lg pl-3 pr-8 py-2 text-xs text-[#E2E4E9] placeholder-[#9CA3AF]/40 outline-none transition-colors"
                  />
                  <FileText className="w-3.5 h-3.5 text-[#9CA3AF]/60 absolute right-2.5 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Material 3 Filled Primary Action Button with Shape-Morphing Spring */}
            <button
              type="button"
              onClick={() => handleTrigger("kfplug", onExport)}
              disabled={disabled || isExporting}
              className={`w-full mt-1 py-2 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-[opacity,transform] duration-200 ${
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
                  <span>Exported</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 stroke-[2.25]" />
                  <span>
                    {isExporting ? "Packaging .kfplug..." : "Export to .kfplug"}
                  </span>
                </>
              )}
            </button>

            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "cube", label: "Export .cube", handler: onExportCube },
                { key: "lut", label: "Export .lut", handler: onExportLut },
              ].map((b) => {
                const isDone = exportedKey === b.key;
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => handleTrigger(b.key, b.handler)}
                    disabled={disabled || isExporting || !b.handler}
                    title="33x33x33 3D LUT (35,937 nodes) from the current grade"
                    className={`py-1.5 px-3 rounded-xl font-medium text-xs flex items-center justify-center gap-1.5 border transition-[opacity,transform] duration-200 ${
                      disabled
                        ? "bg-white/[0.035] text-[#9CA3AF]/40 border-white/[0.09] cursor-not-allowed"
                        : isDone
                        ? "m3-btn-morph bg-[#6EE7B7]/15 text-[#6EE7B7] border-[#6EE7B7]/40 scale-[0.99] cursor-pointer"
                        : "m3-btn-morph bg-white/[0.04] hover:bg-white/[0.09] text-[#E2E4E9] border-white/[0.12] cursor-pointer"
                    }`}
                  >
                    {isDone ? (
                      <>
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Exported</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>{b.label}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default ExportCard;
