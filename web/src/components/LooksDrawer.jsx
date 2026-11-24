import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import {
  X,
  Bookmark,
  Plus,
  Trash2,
  Download,
  Upload,
  Check,
  Package,
} from "lucide-react";
import {
  BUILT_IN_LOOKS,
  LOOK_ENGINE_BADGES,
  LOOK_ENGINE_FILTERS,
} from "../utils/builtInLooks";
import {
  DEFAULT_ENGINE_ID,
  formatEngineLabel,
  resolveEngineId,
} from "../utils/engineMetadata";
import { getLogProfile } from "../utils/logProfiles";
import { downloadBlob } from "../utils/download";
import { sanitizeMetadataText } from "../utils/hostGuard";
import { useLanguage } from "../i18n/LanguageContext";
import { BUILT_IN_LOOK_DESCRIPTIONS_ID } from "../i18n/translations";
import { usePresence } from "../hooks/usePresence";
import { usePillIndicator } from "../hooks/usePillIndicator";

const SAVED_LOOKS_STORAGE_KEY = "kf_saved_looks_v1";

function loadSavedLooks() {
  try {
    const raw = localStorage.getItem(SAVED_LOOKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedLooks(looks) {
  try {
    localStorage.setItem(SAVED_LOOKS_STORAGE_KEY, JSON.stringify(looks));
  } catch {
    // ignore storage errors
  }
}

function formatEngineTag(engineId) {
  return formatEngineLabel(engineId);
}

export default function LooksDrawer({
  isOpen,
  onClose,
  onApplyLook,
  currentGrade,
  onComputeSwatches,
  authorName = "TFBAGAS",
}) {
  const { lang, t } = useLanguage();
  const { isMounted, state: presenceState } = usePresence(isOpen, 170);
  const [activeTab, setActiveTab] = useState("builtin");
  const [engineFilter, setEngineFilter] = useState("all");
  const {
    containerRef: looksTabContainerRef,
    registerTabRef: registerLooksTabRef,
    pillStyle: looksTabPillStyle,
  } = usePillIndicator(activeTab, { refreshKey: `${isMounted}-${lang}` });
  const [savedLooks, setSavedLooks] = useState(() => loadSavedLooks());
  const [lookNameInput, setLookNameInput] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const [isBatchPackExporting, setIsBatchPackExporting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [justAppliedId, setJustAppliedId] = useState(null);
  const fileInputRef = useRef(null);
  const applyTimerRef = useRef(0);
  const feedbackTimerRef = useRef(0);
  const sheetDragStartYRef = useRef(null);

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
    return () => {
      if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const visibleBuiltInLooks =
    engineFilter === "all"
      ? BUILT_IN_LOOKS
      : BUILT_IN_LOOKS.filter((look) => look.engine === engineFilter);

  const activePresetNameNormalized = (currentGrade?.presetName || "").trim().toLowerCase();

  const flashFeedback = (msg) => {
    setFeedbackMsg(msg);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedbackMsg(""), 2200);
  };

  const handleApplyWithFeedback = (look) => {
    setJustAppliedId(look.id);
    onApplyLook(look);
    if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
    applyTimerRef.current = setTimeout(() => {
      setJustAppliedId(null);
      onClose();
    }, 180);
  };

  const handleSaveCurrent = (e) => {
    e.preventDefault();
    const name =
      (lookNameInput || currentGrade?.presetName || "").trim() ||
      `Saved Look ${savedLooks.length + 1}`;
    const swatches = onComputeSwatches
      ? onComputeSwatches()
      : ["#1B263B", "#415A77", "#778DA9", "#D4A373", "#E9ECEF"];

    const newLook = {
      id: `look_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      timestamp: Date.now(),
      engineId: resolveEngineId(currentGrade.engineId || DEFAULT_ENGINE_ID),
      logProfile: currentGrade.logProfile || "rec709",
      matchStrength: currentGrade.matchStrength ?? 100,
      params: { ...currentGrade.params },
      swatches,
    };

    const next = [newLook, ...savedLooks];
    setSavedLooks(next);
    persistSavedLooks(next);
    setLookNameInput("");
    setActiveTab("saved");
    flashFeedback(t("looksDrawer.feedbackSaved", { name }));
  };

  const handleDeleteLook = (id) => {
    const next = savedLooks.filter((l) => l.id !== id);
    setSavedLooks(next);
    persistSavedLooks(next);
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      copy.delete(id);
      return copy;
    });
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  };

  const handleExportJson = () => {
    const payload = {
      version: 1,
      app: "ToneBench",
      exportedAt: new Date().toISOString(),
      looks: savedLooks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, `ToneBench_Saved_Looks_${new Date().toISOString().slice(0, 10)}.json`);
    flashFeedback(t("looksDrawer.feedbackExportedJson"));
  };

  const handleImportJson = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Looks file too large");
      const text = await file.text();
      const parsed = JSON.parse(text, (key, value) =>
        key === "__proto__" || key === "constructor" || key === "prototype" ? undefined : value
      );
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.looks)
        ? parsed.looks
        : [];
      if (list.length === 0) {
        flashFeedback(t("looksDrawer.feedbackNoValidLooks"));
        return;
      }
      const valid = list
        .slice(0, 500)
        .filter((l) => l && typeof l.name === "string" && l.params && typeof l.params === "object")
        .map((l) => ({
          ...l,
          id: l.id || `look_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: l.timestamp || Date.now(),
          swatches:
            Array.isArray(l.swatches) && l.swatches.length === 5
              ? l.swatches
              : ["#1B263B", "#415A77", "#778DA9", "#D4A373", "#E9ECEF"],
        }));
      const next = [...valid, ...savedLooks];
      setSavedLooks(next);
      persistSavedLooks(next);
      setActiveTab("saved");
      flashFeedback(t("looksDrawer.feedbackImported", { count: valid.length }));
    } catch {
      flashFeedback(t("looksDrawer.feedbackInvalidJson"));
    } finally {
      e.target.value = "";
    }
  };

  const handleBatchExportZip = async () => {
    const chosen = savedLooks.filter((l) => selectedIds.has(l.id));
    if (chosen.length === 0 || isBatchExporting) return;
    setIsBatchExporting(true);
    try {
      const [{ generateKfplug }, { generateLutFile }, { buildZipBlob }] = await Promise.all([
        import("../utils/kfplugPackager"),
        import("../utils/lutExporter"),
        import("../utils/zipBuilder"),
      ]);
      const entries = [];
      for (const look of chosen) {
        const cleanName =
          sanitizeMetadataText(look.name, "Custom_Look", 48).replace(/[^a-zA-Z0-9._-]+/g, "_") ||
          "Custom_Look";
        const { blob: kfBlob, fileName: kfName } = await generateKfplug(
          look.params,
          look.name,
          sanitizeMetadataText(authorName, "TFBAGAS", 64),
          `Saved look (${formatEngineTag(look.engineId)})`,
          look.logProfile || "rec709",
          null,
          1.0,
          { skinProtect: (look.skinProtect ?? 75) / 100 }
        );
        const { blob: cubeBlob } = generateLutFile(
          look.params,
          look.name,
          "cube",
          look.logProfile || "rec709",
          33
        );
        entries.push({ name: `${cleanName}/${kfName}`, data: kfBlob });
        entries.push({ name: `${cleanName}/${cleanName}.cube`, data: cubeBlob });
      }
      const zipBlob = await buildZipBlob(entries);
      downloadBlob(zipBlob, `ToneBench_Batch_Looks_${chosen.length}.zip`);
      flashFeedback(t("looksDrawer.feedbackBatchExported", { count: chosen.length }));
    } catch {
      flashFeedback(t("looksDrawer.feedbackBatchFailed"));
    } finally {
      setIsBatchExporting(false);
    }
  };

  const handleBatchPackZip = async () => {
    if (savedLooks.length === 0 || isBatchPackExporting || isBatchExporting) return;
    setIsBatchPackExporting(true);
    try {
      const [{ default: JSZip }, { generateKfplug }, { generateLutFile }] = await Promise.all([
        import("jszip"),
        import("../utils/kfplugPackager"),
        import("../utils/lutExporter"),
      ]);
      const zip = new JSZip();
      const usedNames = new Map();
      const safeAuthor = sanitizeMetadataText(authorName, "TFBAGAS", 64);

      for (const look of savedLooks) {
        const baseName =
          sanitizeMetadataText(look.name, "Custom_Look", 48)
            .replace(/[^a-zA-Z0-9_-]+/g, "_")
            .replace(/^_+|_+$/g, "") || "Custom_Look";
        const count = (usedNames.get(baseName) || 0) + 1;
        usedNames.set(baseName, count);
        const uniqueName = count > 1 ? `${baseName}_${count}` : baseName;

        const { blob: kfBlob } = await generateKfplug(
          look.params,
          look.name,
          safeAuthor,
          `Saved look (${formatEngineTag(look.engineId)})`,
          look.logProfile || "rec709",
          null,
          1.0,
          { skinProtect: (look.skinProtect ?? 75) / 100 }
        );
        const { blob: cubeBlob } = generateLutFile(
          look.params,
          look.name,
          "cube",
          look.logProfile || "rec709",
          33
        );

        zip.file(`kfplug/${uniqueName}.kfplug`, kfBlob);
        zip.file(`cube/${uniqueName}.cube`, cubeBlob);
      }

      const readmeText = [
        "ToneBench by TFBAGAS - Preset Pack",
        "==================================",
        `Packaged Looks: ${savedLooks.length}`,
        `Exported: ${new Date().toISOString()}`,
        "",
        "Contents:",
        "- kfplug/<name>.kfplug : Native Keyflow Mobile shader plugins",
        "- cube/<name>.cube     : 33x33x33 3D LUTs for desktop NLEs",
        "",
        "How to Install .kfplug on Keyflow (Mobile):",
        "1. Unzip this archive on your phone or computer.",
        "2. Open Keyflow on mobile > Effects / Plugins > Import Plugin (.kfplug).",
        "3. Select any .kfplug file from the kfplug/ folder to load it into the Warna category.",
        "",
      ].join("\n");
      zip.file("README.txt", readmeText);

      const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      downloadBlob(zipBlob, "ToneBench_PresetPack.zip");
      flashFeedback(t("looksDrawer.feedbackPacked", { count: savedLooks.length }));
    } catch {
      flashFeedback(t("looksDrawer.feedbackPackFailed"));
    } finally {
      setIsBatchPackExporting(false);
    }
  };

  // Optional swipe-down-to-dismiss on the mobile bottom-sheet handle/header
  const handleSheetPointerDown = (e) => {
    sheetDragStartYRef.current = e.clientY;
  };

  const handleSheetPointerUp = (e) => {
    if (sheetDragStartYRef.current === null) return;
    const deltaY = e.clientY - sheetDragStartYRef.current;
    sheetDragStartYRef.current = null;
    if (deltaY > 64) {
      onClose();
    }
  };

  if (!isMounted || typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Backdrop overlay: z-40 (below mobile bottom sheet z-50 and Liquid Glass pill z-[60]) */}
      <div
        data-state={presenceState}
        data-testid="looks-library-backdrop"
        onClick={onClose}
        aria-hidden="true"
        className="studio-backdrop fixed inset-0 z-40 bg-black/65 backdrop-blur-md"
      />

      {/* Responsive positioning shell: z-50 so mobile bottom sheet sits above backdrop (z-40) and below Liquid Glass pill (z-[60]) */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6 pointer-events-none"
      >
        <section
          data-state={presenceState}
          data-testid="looks-library-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t("looksDrawer.title")}
          className="looks-sheet-panel pointer-events-auto w-full max-h-[86dvh] rounded-t-3xl md:w-[92vw] md:max-w-4xl md:max-h-[84vh] md:rounded-2xl bg-[#0B0F17]/95 backdrop-blur-2xl border-t border-white/14 md:border md:border-white/15 shadow-2xl shadow-[0_28px_80px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.16)] flex flex-col text-left overflow-hidden"
        >
        {/* Mobile iOS Drag Handle Pill */}
        <div
          onPointerDown={handleSheetPointerDown}
          onPointerUp={handleSheetPointerUp}
          onPointerCancel={() => {
            sheetDragStartYRef.current = null;
          }}
          className="md:hidden flex items-center justify-center pt-2.5 pb-1 shrink-0 touch-none cursor-grab active:cursor-grabbing"
          aria-hidden="true"
        >
          <span className="w-10 h-1 rounded-full bg-white/25" />
        </div>

        {/* Sleek Studio Header */}
        <div
          onPointerDown={handleSheetPointerDown}
          onPointerUp={handleSheetPointerUp}
          className="px-4 sm:px-6 pt-2 pb-3 md:pt-4 md:pb-3.5 border-b border-white/10 flex items-center justify-between gap-3 shrink-0"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-[#38BDF8]/12 border border-[#38BDF8]/30 flex items-center justify-center shrink-0">
              <Bookmark className="w-3.5 h-3.5 text-[#38BDF8]" aria-hidden="true" />
            </span>
            <h2 className="text-[15px] font-semibold font-display text-white tracking-[-0.015em] truncate">
              {t("looksDrawer.title")}
            </h2>
            {feedbackMsg && (
              <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-full bg-[#38BDF8]/15 text-[#7DD3FC] border border-[#38BDF8]/35 truncate">
                {feedbackMsg}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("looksDrawer.closeAria")}
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/12 flex items-center justify-center transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Compact Unified Control Bar: Save Current Grade + Segmented Tabs + Solver Filter Pills */}
        <div className="px-4 sm:px-6 py-3 border-b border-white/10 bg-[#070A10]/65 space-y-3 shrink-0">
          {/* Row 1: Inline Save Current Grade */}
          <form onSubmit={handleSaveCurrent} className="flex items-center gap-2">
            <label htmlFor="looks-save-name-input" className="sr-only">
              {t("looksDrawer.saveCurrentGrade")}
            </label>
            <input
              id="looks-save-name-input"
              type="text"
              value={lookNameInput}
              onChange={(e) => setLookNameInput(e.target.value)}
              placeholder={currentGrade?.presetName || t("looksDrawer.lookNamePlaceholder")}
              className="flex-1 min-w-0 h-9 rounded-xl bg-[#131A26]/90 border border-white/12 focus:border-[#38BDF8]/70 focus:ring-2 focus:ring-[#38BDF8]/20 px-3 text-xs text-slate-100 placeholder:text-slate-400 outline-none transition-colors"
            />
            <button
              type="submit"
              className="h-9 px-3.5 rounded-xl bg-[#F8FAFC] hover:bg-white text-[#090B10] text-xs font-semibold inline-flex items-center gap-1.5 shadow-[0_1px_12px_rgba(248,250,252,0.14)] active:scale-[0.97] transition-[background-color,transform] cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F17]"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.25]" aria-hidden="true" />
              <span>{t("looksDrawer.save")}</span>
            </button>
          </form>

          {/* Row 2: Segmented Toggle + Horizontally Scrollable Filter / Saved Controls */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 min-w-0">
            {/* Segmented Toggle: Built-in Looks vs Saved */}
            <div
              ref={looksTabContainerRef}
              className="relative grid grid-cols-2 gap-1 p-0.5 rounded-xl bg-[#090B10] border border-white/12 shrink-0 md:min-w-[264px]"
            >
              <div
                aria-hidden="true"
                className="studio-sliding-pill pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-[10px] bg-[#F8FAFC]"
                style={looksTabPillStyle}
              />
              <button
                ref={registerLooksTabRef("builtin")}
                type="button"
                onClick={() => setActiveTab("builtin")}
                className={`relative z-10 min-h-[34px] py-1.5 px-3 rounded-[10px] text-xs font-medium whitespace-nowrap transition-[color,transform] duration-150 ease-[var(--ease-shutter)] active:scale-[0.97] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#38BDF8] ${
                  activeTab === "builtin"
                    ? "text-[#090B10] font-semibold"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {t("looksDrawer.builtinTab", { count: BUILT_IN_LOOKS.length })}
              </button>
              <button
                ref={registerLooksTabRef("saved")}
                type="button"
                onClick={() => setActiveTab("saved")}
                className={`relative z-10 min-h-[34px] py-1.5 px-3 rounded-[10px] text-xs font-medium whitespace-nowrap transition-[color,transform] duration-150 ease-[var(--ease-shutter)] active:scale-[0.97] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#38BDF8] ${
                  activeTab === "saved"
                    ? "text-[#090B10] font-semibold"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {t("looksDrawer.savedTab", { count: savedLooks.length })}
              </button>
            </div>

            {/* Built-in Solver Filter Pills (Single-row horizontal scroll on mobile, no awkward wrapping) */}
            {activeTab === "builtin" && (
              <div
                role="tablist"
                aria-label={t("looksDrawer.filterAria")}
                className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 min-w-0"
              >
                {LOOK_ENGINE_FILTERS.map((f) => {
                  const isActive = engineFilter === f.id;
                  const count =
                    f.id === "all"
                      ? BUILT_IN_LOOKS.length
                      : BUILT_IN_LOOKS.filter((l) => l.engine === f.id).length;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setEngineFilter(f.id)}
                      className={`relative px-3 py-1.5 rounded-full text-[11px] font-medium border whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                        isActive
                          ? "text-[#E0F2FE] border-[#38BDF8]/55 font-semibold"
                          : "bg-[#131A26]/80 text-slate-300 border-white/10 hover:text-white hover:border-white/20 hover:bg-white/[0.06]"
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="looks-engine-filter-pill"
                          transition={{ type: "spring", stiffness: 460, damping: 36 }}
                          className="absolute inset-0 rounded-full bg-[#38BDF8]/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                        />
                      )}
                      <span className="relative z-10 inline-flex items-center gap-1">
                        <span>{f.id === "all" ? t("looksDrawer.filterAll") : f.label}</span>
                        <span className="font-mono text-[10px] opacity-75">{count}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Saved Looks Action Toolbar */}
            {activeTab === "saved" && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 min-w-0">
                <button
                  type="button"
                  onClick={handleExportJson}
                  disabled={savedLooks.length === 0}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[#111723] hover:bg-white/10 text-slate-200 border border-white/12 disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                >
                  <Download className="w-3 h-3" aria-hidden="true" />
                  <span>{t("looksDrawer.exportJson")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[#111723] hover:bg-white/10 text-slate-200 border border-white/12 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                >
                  <Upload className="w-3 h-3" aria-hidden="true" />
                  <span>{t("looksDrawer.importJson")}</span>
                </button>
                <button
                  type="button"
                  onClick={handleBatchPackZip}
                  disabled={savedLooks.length === 0 || isBatchPackExporting || isBatchExporting}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#38BDF8]/15 hover:bg-[#38BDF8]/25 text-[#E0F2FE] border border-[#38BDF8]/40 disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                >
                  <Package className="w-3 h-3 text-[#38BDF8]" aria-hidden="true" />
                  <span>
                    {isBatchPackExporting
                      ? t("looksDrawer.packing")
                      : t("looksDrawer.batchPackZip")}
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportJson}
                  className="hidden"
                />
                {selectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleBatchExportZip}
                    disabled={isBatchExporting}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#38BDF8]/20 hover:bg-[#38BDF8]/30 text-white border border-[#38BDF8]/55 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Package className="w-3 h-3 text-[#38BDF8]" aria-hidden="true" />
                    <span>
                      {isBatchExporting
                        ? t("looksDrawer.zipping")
                        : t("looksDrawer.batchExportSelected", { count: selectedIds.size })}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Multi-Column Preset Grid (Desktop 2-3 cols, Mobile 1 col with pb-36 clearance above Liquid Glass pill) */}
        <div
          data-testid="looks-scroll-area"
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 pt-3.5 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-6"
        >
          {activeTab === "builtin" ? (
            visibleBuiltInLooks.length === 0 ? (
              <div className="py-16 text-center text-xs text-[#A1A1AA] md:text-slate-400">
                {t("looksDrawer.filterEmpty")}
              </div>
            ) : (
              <div
                data-testid="looks-card-grid"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-3.5"
              >
                {visibleBuiltInLooks.map((look) => {
                  const isJustApplied = justAppliedId === look.id;
                  const isActiveLook =
                    isJustApplied ||
                    (activePresetNameNormalized.length > 0 &&
                      activePresetNameNormalized === look.name.trim().toLowerCase());
                  const descriptionText =
                    lang === "id" && BUILT_IN_LOOK_DESCRIPTIONS_ID[look.id]
                      ? BUILT_IN_LOOK_DESCRIPTIONS_ID[look.id]
                      : look.description;

                  return (
                    <article
                      key={look.id}
                      className={`group flex flex-col justify-between p-3.5 rounded-2xl md:rounded-xl border transition-all duration-200 hover:-translate-y-0.5 ${
                        isActiveLook
                          ? "bg-[#111927]/95 border-[#38BDF8]/65 shadow-[0_0_24px_-6px_rgba(56,189,248,0.42),inset_0_1px_0_rgba(255,255,255,0.14)]"
                          : "bg-[#0E131D]/90 md:bg-[#101622]/78 hover:bg-[#131C2B]/95 border-white/[0.08] md:border-white/10 hover:border-[#38BDF8]/45 hover:shadow-[0_12px_28px_-10px_rgba(0,0,0,0.75),0_0_20px_-8px_rgba(56,189,248,0.34)]"
                      }`}
                    >
                      {/* Top: Title + Category Pill + Solver Badge + Clamped 2-line Description */}
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-[13px] font-semibold text-white leading-snug truncate">
                            {look.name}
                          </h3>
                          <span className="text-[9.5px] font-mono font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-md bg-[#38BDF8]/12 text-[#7DD3FC] border border-[#38BDF8]/30 shrink-0">
                            {LOOK_ENGINE_BADGES[look.engine] || formatEngineTag(look.engineId)}
                          </span>
                        </div>

                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-300 border border-white/10">
                            {look.category}
                          </span>
                        </div>

                        <p className="mt-2 text-xs text-slate-400 leading-relaxed line-clamp-2 min-h-[2.45rem]">
                          {descriptionText}
                        </p>
                      </div>

                      {/* Bottom: Prominent Color-Grade Gradient Bar + Metadata + Crisp Apply CTA */}
                      <div className="mt-3 pt-2.5 border-t border-white/[0.07] space-y-2.5">
                        <div
                          aria-hidden="true"
                          className="h-2 w-full rounded-full border border-white/12 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]"
                          style={{
                            background: `linear-gradient(90deg, ${look.swatches.join(", ")})`,
                          }}
                        />

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10.5px] font-mono text-slate-400 tabular-nums truncate">
                            σ {look.sigma} · SKIN {look.skinProtect}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleApplyWithFeedback(look)}
                            className={`min-h-[32px] md:min-h-[30px] px-3 py-1 rounded-full md:rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0 transition-all active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                              isJustApplied
                                ? "bg-[#38BDF8] text-[#090B10] shadow-[0_0_14px_rgba(56,189,248,0.55)]"
                                : isActiveLook
                                ? "bg-[#38BDF8]/20 hover:bg-[#38BDF8]/30 text-[#E0F2FE] border border-[#38BDF8]/55"
                                : "bg-[#F8FAFC] hover:bg-white text-[#090B10]"
                            }`}
                          >
                            <Check className="w-3 h-3 stroke-[2.4]" aria-hidden="true" />
                            <span>{t("looksDrawer.apply")}</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )
          ) : savedLooks.length === 0 ? (
            <div className="py-16 text-center space-y-1.5">
              <p className="text-sm font-medium text-slate-200">{t("looksDrawer.emptyTitle")}</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                {t("looksDrawer.emptySub")}
              </p>
            </div>
          ) : (
            <div
              data-testid="looks-card-grid"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-3.5"
            >
              {savedLooks.map((look) => {
                const isSelected = selectedIds.has(look.id);
                const isJustApplied = justAppliedId === look.id;
                const isActiveLook =
                  isJustApplied ||
                  (activePresetNameNormalized.length > 0 &&
                    activePresetNameNormalized === look.name.trim().toLowerCase());
                const dateStr = look.timestamp
                  ? new Date(look.timestamp).toLocaleDateString()
                  : "";
                const swatches =
                  Array.isArray(look.swatches) && look.swatches.length > 0
                    ? look.swatches
                    : ["#1B263B", "#415A77", "#778DA9", "#D4A373", "#E9ECEF"];

                return (
                  <article
                    key={look.id}
                    className={`flex flex-col justify-between p-3.5 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 ${
                      isSelected || isActiveLook
                        ? "bg-[#111927]/95 border-[#38BDF8]/65 shadow-[0_0_24px_-6px_rgba(56,189,248,0.40)]"
                        : "bg-[#101622]/78 hover:bg-[#131C2B]/95 border-white/10 hover:border-[#38BDF8]/45 hover:shadow-[0_12px_28px_-10px_rgba(0,0,0,0.75)]"
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleSelect(look.id)}
                        aria-label={t("looksDrawer.selectAria", { name: look.name })}
                        aria-pressed={isSelected}
                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                          isSelected
                            ? "bg-[#38BDF8] border-[#38BDF8] text-[#090B10]"
                            : "border-white/25 bg-[#0B0F17] hover:border-[#38BDF8]/60"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" aria-hidden="true" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-[13px] font-semibold text-white leading-snug truncate">
                            {look.name}
                          </h3>
                          <span className="text-[9.5px] font-mono font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-md bg-[#38BDF8]/12 text-[#7DD3FC] border border-[#38BDF8]/30 shrink-0">
                            {formatEngineTag(look.engineId)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5 text-[10.5px] font-mono text-slate-400 flex-wrap">
                          <span>{getLogProfile(look.logProfile).shortLabel}</span>
                          {dateStr && (
                            <>
                              <span>·</span>
                              <span>{dateStr}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-white/[0.07] space-y-2.5">
                      <div
                        aria-hidden="true"
                        className="h-2 w-full rounded-full border border-white/12 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]"
                        style={{
                          background: `linear-gradient(90deg, ${swatches.join(", ")})`,
                        }}
                      />

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          {swatches.map((hex, i) => (
                            <span
                              key={`${hex}-${i}`}
                              title={hex}
                              className="w-3 h-3 rounded-full border border-white/20"
                              style={{ backgroundColor: hex }}
                            />
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDeleteLook(look.id)}
                            aria-label={t("looksDrawer.deleteAria", { name: look.name })}
                            className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/12 flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplyWithFeedback(look)}
                            className={`min-h-[30px] px-3 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-all active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                              isJustApplied
                                ? "bg-[#38BDF8] text-[#090B10] shadow-[0_0_14px_rgba(56,189,248,0.55)]"
                                : "bg-[#F8FAFC] hover:bg-white text-[#090B10]"
                            }`}
                          >
                            <Check className="w-3 h-3 stroke-[2.4]" aria-hidden="true" />
                            <span>{t("looksDrawer.apply")}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
        </section>
      </div>
    </>,
    document.body
  );
}
