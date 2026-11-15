import React, { useState } from "react";
import { Download, Pencil, User, FileText, CheckCircle2 } from "lucide-react";

export default function ExportCard({
  presetName,
  setPresetName,
  author,
  setAuthor,
  description,
  setDescription,
  onExport,
  disabled
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(null);

  const handleExportClick = async () => {
    setIsExporting(true);
    setExportSuccess(null);
    try {
      const res = await onExport();
      setExportSuccess(res);
      setTimeout(() => setExportSuccess(null), 5000);
    } catch (err) {
      alert("Failed to export plugin: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="liquid-glass rounded-2xl p-4 flex flex-col gap-2.5">
      {/* Header bar */}
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-[#00E987] text-[#080D0B] font-bold text-[11px] flex items-center justify-center">
          4
        </span>
        <span className="text-xs font-bold text-white">Export Plugin (.kfplug)</span>
      </div>

      {/* Preset Name */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold text-[#91A69A]">Look / Preset Name</label>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#09100D]/90 border border-[#20352B] focus-within:border-[#00E987]">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="e.g. Barbie, Breaking Bad"
            className="flex-1 bg-transparent text-xs text-white outline-none"
          />
          <Pencil size={13} className="text-[#91A69A]" />
        </div>
      </div>

      {/* Author / Made By */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold text-[#91A69A]">Author / Made By</label>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#09100D]/90 border border-[#20352B] focus-within:border-[#00E987]">
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="e.g. TFBAGAS, John Doe"
            className="flex-1 bg-transparent text-xs text-white outline-none"
          />
          <User size={13} className="text-[#91A69A]" />
        </div>
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold text-[#91A69A]">Plugin Description</label>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#09100D]/90 border border-[#20352B] focus-within:border-[#00E987]">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter plugin description for Keyflow..."
            className="flex-1 bg-transparent text-xs text-white outline-none"
          />
          <FileText size={13} className="text-[#91A69A]" />
        </div>
      </div>

      {/* Big Export Button */}
      <button
        type="button"
        disabled={disabled || isExporting}
        onClick={handleExportClick}
        className="mt-2 w-full h-11 rounded-xl bg-[#00E987] hover:bg-[#16FFA0] disabled:bg-[#1A3026] text-[#080D0B] disabled:text-[#4A6356] font-bold text-xs flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(0,233,135,0.2)] transition-all cursor-pointer disabled:cursor-not-allowed"
      >
        <Download size={16} />
        {isExporting ? "Exporting Plugin..." : "Export to .kfplug"}
      </button>

      {/* Success Notification */}
      {exportSuccess && (
        <div className="mt-2 p-2.5 rounded-xl bg-[#0E2017] border border-[#00E987]/40 flex items-start gap-2 text-[11px] text-[#E8F2ED]">
          <CheckCircle2 size={16} className="text-[#00E987] shrink-0 mt-0.5" />
          <div className="flex flex-col">
            <span className="font-bold text-[#00E987]">Plugin Downloaded!</span>
            <span className="text-[10px] text-[#91A69A]">
              File <strong>{exportSuccess.fileName}</strong> is ready to import into Keyflow Mobile.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
