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
  const { isMounted, state: presenceState } = usePresence(isOpen, 160);
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
  const fileInputRef = useRef(null);

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

  const visibleBuiltInLooks =
    engineFilter === "all"
      ? BUILT_IN_LOOKS
      : BUILT_IN_LOOKS.filter((look) => look.engine === engineFilter);

  const flashFeedback = (msg) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(""), 2000);
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
          swatches: Array.isArray(l.swatches) && l.swatches.length === 5
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

  if (!isMounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-state={presenceState}
      onClick={onClose}
      className="studio-backdrop fixed inset-0 z-[110] flex justify-end bg-black/70 backdrop-blur-md"
    >
      <aside
        data-state={presenceState}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("looksDrawer.title")}
        className="studio-drawer-right w-full max-w-md h-full bg-[#11161F]/98 backdrop-blur-2xl border-l border-[#AAB7C5]/18 shadow-[inset_1px_0_0_rgba(244,247,251,0.06),-20px_0_60px_rgba(0,0,0,0.75)] flex flex-col text-left"
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-[#AAB7C5]/14 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-[#93B8D8]" />
            <h2 className="text-sm font-bold font-display text-[#F4F7FB]">
              {t("looksDrawer.title")}
            </h2>
            {feedbackMsg && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#4A6B86]/28 text-[#C9D7E2] border border-[#7FA3C2]/45">
                {feedbackMsg}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("looksDrawer.closeAria")}
            className="p-1.5 rounded-lg text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Save Current Grade Form */}
        <form
          onSubmit={handleSaveCurrent}
          className="px-4 py-3 border-b border-[#AAB7C5]/14 bg-[#0A0C10]/65 space-y-2 shrink-0"
        >
          <div className="text-[10.5px] font-sans font-semibold uppercase tracking-[0.08em] text-[#AAB7C5]">
            {t("looksDrawer.saveCurrentGrade")}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={lookNameInput}
              onChange={(e) => setLookNameInput(e.target.value)}
              placeholder={currentGrade?.presetName || t("looksDrawer.lookNamePlaceholder")}
              className="flex-1 bg-[#11161F] border border-[#AAB7C5]/18 focus:border-[#7FA3C2] rounded-lg px-2.5 py-1.5 text-xs text-[#F4F7FB] placeholder-[#AAB7C5]/75 outline-none"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-[#F4F7FB] hover:bg-[#FBFDFF] text-[#0A0C10] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t("looksDrawer.save")}</span>
            </button>
          </div>
        </form>

        {/* Tabs */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div
            ref={looksTabContainerRef}
            className="relative grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-[#0A0C10] border border-[#AAB7C5]/14"
          >
            <div
              aria-hidden="true"
              className="studio-sliding-pill pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-md bg-[#F4F7FB]"
              style={looksTabPillStyle}
            />
            <button
              ref={registerLooksTabRef("builtin")}
              type="button"
              onClick={() => setActiveTab("builtin")}
              className={`relative z-10 py-1.5 px-2.5 rounded-md text-xs font-medium transition-[color,transform] duration-150 ease-[var(--ease-shutter)] active:scale-[0.96] cursor-pointer ${
                activeTab === "builtin"
                  ? "text-[#0A0C10] font-semibold"
                  : "text-[#AAB7C5] hover:text-[#F4F7FB]"
              }`}
            >
              {t("looksDrawer.builtinTab", { count: BUILT_IN_LOOKS.length })}
            </button>
            <button
              ref={registerLooksTabRef("saved")}
              type="button"
              onClick={() => setActiveTab("saved")}
              className={`relative z-10 py-1.5 px-2.5 rounded-md text-xs font-medium transition-[color,transform] duration-150 ease-[var(--ease-shutter)] active:scale-[0.96] cursor-pointer ${
                activeTab === "saved"
                  ? "text-[#0A0C10] font-semibold"
                  : "text-[#AAB7C5] hover:text-[#F4F7FB]"
              }`}
            >
              {t("looksDrawer.savedTab", { count: savedLooks.length })}
            </button>
          </div>
        </div>

        {/* Built-in Looks Engine Filter */}
        {activeTab === "builtin" && (
          <div
            role="tablist"
            aria-label={t("looksDrawer.filterAria")}
            className="px-4 pb-2 flex flex-wrap items-center gap-1.5 shrink-0"
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
                  className={`relative px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                    isActive
                      ? "text-[#0A0C10] border-transparent font-semibold"
                      : "bg-[#0A0C10] text-[#AAB7C5] border-[#AAB7C5]/16 hover:text-[#F4F7FB] hover:bg-[#1C2430]"
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="looks-engine-filter-pill"
                      transition={{ type: "spring", stiffness: 460, damping: 36 }}
                      className="absolute inset-0 rounded-full bg-[#F4F7FB]"
                    />
                  )}
                  <span className="relative z-10">
                    {f.id === "all" ? t("looksDrawer.filterAll") : f.label}
                    <span className="ml-1 font-mono text-[10px] opacity-70">{count}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Saved Looks Toolbar */}
        {activeTab === "saved" && (
          <div className="px-4 pb-2 flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleExportJson}
              disabled={savedLooks.length === 0}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#0A0C10] hover:bg-[#1C2430] text-[#C9D7E2] border border-[#AAB7C5]/16 disabled:opacity-40 cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>{t("looksDrawer.exportJson")}</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#0A0C10] hover:bg-[#1C2430] text-[#C9D7E2] border border-[#AAB7C5]/16 cursor-pointer"
            >
              <Upload className="w-3 h-3" />
              <span>{t("looksDrawer.importJson")}</span>
            </button>
            <button
              type="button"
              onClick={handleBatchPackZip}
              disabled={savedLooks.length === 0 || isBatchPackExporting || isBatchExporting}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#4A6B86]/28 hover:bg-[#4A6B86]/42 text-[#F4F7FB] border border-[#7FA3C2]/45 disabled:opacity-40 cursor-pointer"
            >
              <Package className="w-3 h-3 text-[#93B8D8]" />
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
                className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#4A6B86]/28 hover:bg-[#4A6B86]/42 text-[#F4F7FB] border border-[#7FA3C2]/45 cursor-pointer"
              >
                <Package className="w-3 h-3 text-[#93B8D8]" />
                <span>
                  {isBatchExporting
                    ? t("looksDrawer.zipping")
                    : t("looksDrawer.batchExportSelected", { count: selectedIds.size })}
                </span>
              </button>
            )}
          </div>
        )}

        {/* Content List */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2.5">
          {activeTab === "builtin" ? (
            visibleBuiltInLooks.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#AAB7C5]">
                {t("looksDrawer.filterEmpty")}
              </div>
            ) : (
            visibleBuiltInLooks.map((look) => (
              <div
                key={look.id}
                className="p-3 rounded-xl bg-[#0A0C10]/70 hover:bg-[#1C2430]/70 border border-[#AAB7C5]/14 transition-colors space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-[#F4F7FB]">
                        {look.name}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#11161F] text-[#AAB7C5] border border-[#AAB7C5]/14">
                        {look.category}
                      </span>
                      <span className="text-[9.5px] font-mono font-semibold tracking-[0.06em] px-1.5 py-0.5 rounded border border-[#7FA3C2]/40 bg-[#4A6B86]/25 text-[#C9D7E2]">
                        {LOOK_ENGINE_BADGES[look.engine] || formatEngineTag(look.engineId)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#AAB7C5] mt-0.5 leading-snug">
                      {lang === "id" && BUILT_IN_LOOK_DESCRIPTIONS_ID[look.id]
                        ? BUILT_IN_LOOK_DESCRIPTIONS_ID[look.id]
                        : look.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onApplyLook(look);
                      onClose();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#F4F7FB] hover:bg-[#FBFDFF] text-[#0A0C10] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Check className="w-3 h-3" />
                    <span>{t("looksDrawer.apply")}</span>
                  </button>
                </div>

                {/* Preview Gradient & Swatches */}
                <div className="flex items-center justify-between gap-2">
                  <div
                    className="h-2.5 flex-1 rounded-full border border-[#AAB7C5]/16"
                    style={{
                      background: `linear-gradient(90deg, ${look.swatches.join(", ")})`,
                    }}
                  />
                  <span className="text-[10px] font-mono text-[#AAB7C5]">
                    σ {look.sigma} · SKIN {look.skinProtect}
                  </span>
                </div>
              </div>
            ))
            )
          ) : savedLooks.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#AAB7C5] space-y-1.5">
              <p>{t("looksDrawer.emptyTitle")}</p>
              <p className="text-[11px] text-[#AAB7C5]">
                {t("looksDrawer.emptySub")}
              </p>
            </div>
          ) : (
            savedLooks.map((look) => {
              const isSelected = selectedIds.has(look.id);
              const dateStr = look.timestamp
                ? new Date(look.timestamp).toLocaleDateString()
                : "";
              return (
                <div
                  key={look.id}
                  className={`p-3 rounded-xl border transition-colors space-y-2 ${
                    isSelected
                      ? "bg-[#4A6B86]/20 border-[#7FA3C2]/55"
                      : "bg-[#0A0C10]/70 border-[#AAB7C5]/14"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => toggleSelect(look.id)}
                      aria-label={t("looksDrawer.selectAria", { name: look.name })}
                      className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer ${
                        isSelected
                          ? "bg-[#F4F7FB] border-[#F4F7FB] text-[#0A0C10]"
                          : "border-[#AAB7C5]/30 bg-[#0A0C10]"
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#F4F7FB] truncate">
                          {look.name}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onApplyLook(look);
                              onClose();
                            }}
                            className="px-2 py-0.5 rounded-md bg-[#F4F7FB] hover:bg-[#FBFDFF] text-[#0A0C10] text-[10px] font-semibold cursor-pointer"
                          >
                            {t("looksDrawer.apply")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLook(look.id)}
                            aria-label={t("looksDrawer.deleteAria", { name: look.name })}
                            className="p-1 rounded-md text-[#AAB7C5] hover:text-red-400 hover:bg-[#1C2430] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 mt-1 text-[10px] font-mono text-[#AAB7C5]">
                        <span>{formatEngineTag(look.engineId)}</span>
                        <span>·</span>
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

                  {Array.isArray(look.swatches) && look.swatches.length > 0 && (
                    <div className="flex items-center gap-1.5 pl-6">
                      {look.swatches.map((hex, i) => (
                        <span
                          key={`${hex}-${i}`}
                          title={hex}
                          className="w-4 h-4 rounded border border-[#F4F7FB]/20"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
