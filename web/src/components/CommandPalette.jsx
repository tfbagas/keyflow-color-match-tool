import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  Cpu,
  Film,
  Sparkles,
  Download,
  Bookmark,
  Sliders,
  X,
  Check,
  Package,
  Globe,
  Layers,
} from "lucide-react";
import { listEngines } from "../utils/engineMetadata";
import { LOG_PROFILES } from "../utils/logProfiles";
import { BUILT_IN_LOOKS } from "../utils/builtInLooks";
import { useLanguage } from "../i18n/LanguageContext";
import { usePresence } from "../hooks/usePresence";

const SAVED_LOOKS_STORAGE_KEY = "kf_saved_looks_v1";

function getSavedLooksSnapshot() {
  try {
    const raw = localStorage.getItem(SAVED_LOOKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function CommandPalette({
  isOpen,
  onClose,
  activeEngineId,
  onSelectEngine,
  activeLogProfile,
  onSelectLogProfile,
  autoNormalizeTarget,
  onToggleAutoNormalizeTarget,
  onApplyLook,
  onTryInstantDemo,
  onExportKfplug,
  onExportFfx,
  onExportCube,
  onExportZip,
  hasLook = false,
}) {
  const { lang, setLang, t } = useLanguage();
  const { isMounted, state: presenceState } = usePresence(isOpen, 160);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    setQuery("");
    setActiveIndex(0);
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  const commands = useMemo(() => {
    if (!isMounted) return [];
    const items = [];
    const engines = listEngines();

    // 0. Language Toggle (EN | ID)
    items.push({
      id: "toggle-language",
      category: t("commandPalette.catLanguage"),
      title:
        lang === "id"
          ? t("commandPalette.switchLangEn")
          : t("commandPalette.switchLangId"),
      subtitle: t("commandPalette.switchLangSub"),
      keywords: "language bahasa indonesia english en id translate",
      badge: lang === "id" ? "EN" : "ID",
      icon: Globe,
      action: () => setLang(lang === "id" ? "en" : "id"),
    });

    // 1. Color Match Engines (Altair 4.5 Refresh, Altair 4.0, Polaris 3.5)
    engines.forEach((eng) => {
      const sub = t(`engines.${eng.id}.subtitle`) || eng.subtitle;
      const best = t(`engines.${eng.id}.bestFor`) || eng.bestFor;
      items.push({
        id: `engine-${eng.id}`,
        category: t("commandPalette.catEngine"),
        title: t("commandPalette.switchEngineTitle", {
          name: eng.name,
          badge: eng.versionBadge,
        }),
        subtitle: `${sub} - ${best}`,
        keywords: `${eng.name} ${eng.codename} ${eng.id} ${sub} engine match`,
        badge:
          activeEngineId === eng.id
            ? t("commandPalette.activeBadge")
            : eng.shortcutKey,
        isActive: activeEngineId === eng.id,
        icon: Cpu,
        action: () => onSelectEngine?.(eng.id),
      });
    });

    // 2. Pre-Match Auto-Normalize Target & Instant Demo
    items.push({
      id: "toggle-auto-normalize",
      category: t("commandPalette.catPipeline"),
      title: autoNormalizeTarget
        ? t("commandPalette.autoNormTitleOn")
        : t("commandPalette.autoNormTitleOff"),
      subtitle: t("commandPalette.autoNormSub"),
      keywords: "auto normalize target exposure white balance neutral pre-match",
      badge: autoNormalizeTarget ? "ON" : "OFF",
      isActive: Boolean(autoNormalizeTarget),
      icon: Sliders,
      action: () => onToggleAutoNormalizeTarget?.(!autoNormalizeTarget),
    });

    items.push({
      id: "try-instant-demo",
      category: t("commandPalette.catQuickStart"),
      title: t("commandPalette.instantDemoTitle"),
      subtitle: t("commandPalette.instantDemoSub"),
      keywords: "try instant demo sample reference target test coba demo sampel",
      badge: "DEMO",
      icon: Sparkles,
      action: () => onTryInstantDemo?.(),
    });

    // 3. Camera Log Input Profiles
    LOG_PROFILES.forEach((prof) => {
      const isCurrent = activeLogProfile === prof.id;
      const profLabel = t(`logProfiles.${prof.id}.label`) || prof.label;
      const profDesc = t(`logProfiles.${prof.id}.description`) || prof.description;
      items.push({
        id: `log-${prof.id}`,
        category: t("commandPalette.catInputProfile"),
        title: t("commandPalette.inputProfileTitle", { label: profLabel }),
        subtitle: profDesc,
        keywords: `input profile camera log ${profLabel} ${prof.shortLabel} ${prof.id}`,
        badge: isCurrent ? t("commandPalette.activeBadge") : prof.shortLabel,
        isActive: isCurrent,
        icon: Film,
        action: () => onSelectLogProfile?.(prof.id),
      });
    });

    // 4. Exports (.kfplug, .ffx, .cube, .zip)
    items.push(
      {
        id: "export-kfplug",
        category: t("commandPalette.catExport"),
        title: t("commandPalette.exportKfplugTitle"),
        subtitle: hasLook
          ? t("commandPalette.exportKfplugSubReady")
          : t("commandPalette.exportSubDisabled"),
        keywords: "export ekspor kfplug keyflow plugin shader download",
        badge: ".KFPLUG",
        disabled: !hasLook,
        icon: Download,
        action: () => hasLook && onExportKfplug?.(),
      },
      {
        id: "export-ffx",
        category: t("commandPalette.catExport"),
        title: t("commandPalette.exportFfxTitle"),
        subtitle: hasLook
          ? t("commandPalette.exportFfxSubReady")
          : t("commandPalette.exportSubDisabled"),
        keywords: "export ekspor ffx after effects premiere lumetri preset",
        badge: ".FFX",
        disabled: !hasLook,
        icon: Download,
        action: () => hasLook && onExportFfx?.(),
      },
      {
        id: "export-cube",
        category: t("commandPalette.catExport"),
        title: t("commandPalette.exportCubeTitle"),
        subtitle: hasLook
          ? t("commandPalette.exportCubeSubReady")
          : t("commandPalette.exportSubDisabled"),
        keywords: "export ekspor cube 3d lut davinci resolve premiere",
        badge: ".CUBE",
        disabled: !hasLook,
        icon: Download,
        action: () => hasLook && onExportCube?.(33),
      },
      {
        id: "export-zip",
        category: t("commandPalette.catExport"),
        title: t("commandPalette.exportZipTitle"),
        subtitle: hasLook
          ? t("commandPalette.exportZipSubReady")
          : t("commandPalette.exportSubDisabled"),
        keywords: "export ekspor zip pack bundle all in one promo card",
        badge: ".ZIP",
        disabled: !hasLook,
        icon: Package,
        action: () => hasLook && onExportZip?.(33),
      }
    );

    // 5. Saved & Built-in Reference Looks
    const saved = getSavedLooksSnapshot();
    saved.forEach((look) => {
      items.push({
        id: `saved-look-${look.id}`,
        category: t("commandPalette.catSavedLooks"),
        title: t("commandPalette.applySavedLookTitle", { name: look.name }),
        subtitle: t("commandPalette.savedLookSub", {
          engine: look.engineId || "altair",
        }),
        keywords: `saved look preset ${look.name}`,
        badge: "SAVED",
        icon: Bookmark,
        action: () => onApplyLook?.(look),
      });
    });

    BUILT_IN_LOOKS.forEach((look) => {
      items.push({
        id: `builtin-look-${look.id}`,
        category: t("commandPalette.catBuiltinLooks"),
        title: t("commandPalette.applyLookTitle", { name: look.name }),
        subtitle: look.category || "Cinema",
        keywords: `built-in look preset ${look.name} ${look.category || ""}`,
        badge: "LOOK",
        icon: Bookmark,
        action: () => onApplyLook?.(look),
      });
    });

    // 6. Partner Ecosystem Tools
    items.push({
      id: "partner-seethrough-studio",
      category: "Partner Tool",
      title: "Open SeeThrough Studio",
      subtitle: "Split flat PNG illustrations into layered .psd parts for Live2D rigging",
      keywords: "seethrough studio partner png psd layer split live2d vtuber external",
      badge: "PARTNER ↗",
      icon: Layers,
      action: () => window.open("https://seethrough-studio.pages.dev", "_blank", "noopener,noreferrer"),
    });

    return items;
  }, [
    isMounted,
    lang,
    setLang,
    t,
    activeEngineId,
    onSelectEngine,
    activeLogProfile,
    onSelectLogProfile,
    autoNormalizeTarget,
    onToggleAutoNormalizeTarget,
    onApplyLook,
    onTryInstantDemo,
    onExportKfplug,
    onExportFfx,
    onExportCube,
    onExportZip,
    hasLook,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    const tokens = q.split(/\s+/);
    return commands.filter((cmd) => {
      const hay = `${cmd.title} ${cmd.subtitle} ${cmd.category} ${cmd.keywords}`.toLowerCase();
      return tokens.every((tok) => hay.includes(tok));
    });
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) =>
          filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        const chosen = filtered[activeIndex];
        if (chosen && !chosen.disabled) {
          chosen.action?.();
          onClose?.();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filtered, activeIndex, onClose]);

  if (!isMounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("commandPalette.ariaLabel")}
      data-state={presenceState}
      onClick={onClose}
      className="studio-backdrop fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-black/68 backdrop-blur-md"
    >
      <div
        data-state={presenceState}
        onClick={(e) => e.stopPropagation()}
        className="studio-modal w-full max-w-xl rounded-2xl bg-[#101216]/95 backdrop-blur-2xl border border-white/[0.11] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_64px_rgba(0,0,0,0.85)] overflow-hidden"
      >
        {/* Spotlight Search Input Row */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.1]">
          <Search className="w-4 h-4 text-[#6EE7B7] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("commandPalette.searchPlaceholder")}
            aria-label={t("commandPalette.ariaLabel")}
            className="flex-1 bg-transparent text-xs sm:text-sm text-[#F4F5F7] placeholder-[#9CA3AF]/55 outline-none"
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.12] text-[10px] font-mono text-[#9CA3AF]">
            ESC
          </kbd>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("commandPalette.closeAria")}
            className="p-1 rounded-lg text-[#9CA3AF] hover:text-[#F4F5F7] hover:bg-white/[0.08] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Filtered Command List */}
        <div
          ref={listRef}
          className="max-h-[58vh] overflow-y-auto p-2 space-y-1"
        >
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-xs font-mono text-[#9CA3AF]/65">
              {t("commandPalette.noMatch", { query })}
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const isHighlighted = idx === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.disabled}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    if (item.disabled) return;
                    item.action?.();
                    onClose?.();
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                    item.disabled
                      ? "opacity-40 cursor-not-allowed"
                      : isHighlighted
                      ? "bg-white/[0.11] border border-white/[0.18] cursor-pointer"
                      : "hover:bg-white/[0.06] border border-transparent cursor-pointer"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                        item.isActive
                          ? "bg-[#6EE7B7]/18 border-[#6EE7B7]/40 text-[#6EE7B7]"
                          : "bg-white/[0.05] border-white/[0.1] text-[#E2E4E9]"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#F4F5F7] truncate">
                          {item.title}
                        </span>
                        <span className="text-[9px] font-mono uppercase tracking-wider text-[#9CA3AF]/75">
                          {item.category}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#9CA3AF] truncate">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.isActive && (
                      <Check className="w-3.5 h-3.5 text-[#6EE7B7]" />
                    )}
                    {item.badge && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                          item.isActive
                            ? "bg-[#6EE7B7]/15 text-[#6EE7B7] border-[#6EE7B7]/35"
                            : "bg-white/[0.05] text-[#D1D5DB] border-white/[0.12]"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hint Strip */}
        <div className="px-4 py-2 border-t border-white/[0.08] bg-black/25 flex items-center justify-between text-[10px] font-mono text-[#9CA3AF]">
          <span>{t("commandPalette.footerNavigate")}</span>
          <span>Ctrl+K / Cmd+K</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
