import React from "react";
import { Download, Edit3, User, FileText, Package } from "lucide-react";

export default function ExportCard({
  presetName,
  setPresetName,
  authorName,
  setAuthorName,
  description,
  setDescription,
  onExport,
  isExporting,
  disabled,
}) {
  return (
    <div className="m3-panel rounded-2xl p-3.5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Package className="w-3.5 h-3.5 text-[#9CA3AF]" />
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">
          EXPORT PLUGIN (.KFPLUG)
        </h3>
      </div>

      {/* Form Inputs */}
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
              className="w-full bg-[#1E1E24] border border-white/[0.08] focus:border-white/25 rounded-lg pl-3 pr-9 py-2 text-xs text-[#E2E4E9] placeholder-[#9CA3AF]/40 outline-none transition-colors"
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
                className="w-full bg-[#1E1E24] border border-white/[0.08] focus:border-white/25 rounded-lg pl-3 pr-8 py-2 text-xs text-[#E2E4E9] placeholder-[#9CA3AF]/40 outline-none transition-colors"
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
                className="w-full bg-[#1E1E24] border border-white/[0.08] focus:border-white/25 rounded-lg pl-3 pr-8 py-2 text-xs text-[#E2E4E9] placeholder-[#9CA3AF]/40 outline-none transition-colors"
              />
              <FileText className="w-3.5 h-3.5 text-[#9CA3AF]/60 absolute right-2.5 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Material 3 Filled Primary Action Button (Calm Mint #6EE7B7 + #042F1E Text) */}
        <button
          type="button"
          onClick={onExport}
          disabled={disabled || isExporting}
          className={`w-full mt-1 py-2.5 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
            disabled
              ? "bg-[#1E1E24] text-[#9CA3AF]/40 border border-white/[0.06] cursor-not-allowed"
              : "bg-[#6EE7B7] hover:bg-[#86EFAC] active:scale-[0.99] text-[#042F1E]"
          }`}
        >
          <Download className="w-4 h-4 stroke-[2.25]" />
          <span>{isExporting ? "Packaging .kfplug..." : "Export to .kfplug"}</span>
        </button>
      </div>
    </div>
  );
}
