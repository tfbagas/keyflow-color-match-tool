import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  Cpu,
  Film,
  Image as ImageIcon,
  Download,
  Bookmark,
  Sliders,
  X,
  Check,
  Package,
  Globe,
  Layers,
  LayoutGrid,
  Settings,
  Info,
  Heart,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import { listEngines } from "../utils/engineMetadata";
import { LOG_PROFILES } from "../utils/logProfiles";
import { BUILT_IN_LOOKS } from "../utils/builtInLooks";
import { CURATED_SAMPLE_PLATES } from "../utils/samplePlates";
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
  activeView = "home",
  onNavigateView,
  activeEngineId,
  onSelectEngine,
  activeLogProfile,
  onSelectLogProfile,
  autoNormalizeTarget,
  onToggleAutoNormalizeTarget,
  onApplyLook,
  onTryInstantDemo,
  onLoadSamplePlate,
  onRunCalibration,
  onOpenExportModal,
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
  const [prevOpen, setPrevOpen] = useState(isOpen);
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) {
      setQuery("");
      setActiveIndex(0);
    }
  }
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  const commands = useMemo(() => {
    if (!isMounted) return [];
    const items = [];
    const engines = listEngines();

    // 1. Workspace & View Navigation
    if (onNavigateView) {
      const views = [
        {
          id: "home",
          title: t("nav.workspace"),
          subtitle: t("commandPalette.navStudioSub"),
          keywords: "studio workspace home grading canvas editor",
          icon: LayoutGrid,
        },
        {
          id: "settings",
          title: t("nav.settings"),
          subtitle: t("settings.railSub"),
          keywords: "settings preferences calibration language resolution pengaturan",
          icon: Settings,
        },
        {
          id: "about",
          title: t("nav.about"),
          subtitle: t("about.subtitle"),
          keywords: "about architecture solvers changelog install tentang",
          icon: Info,
        },
        {
          id: "support",
          title: t("nav.support"),
          subtitle: t("support.railSub"),
          keywords: "support roadmap sociabuzz creator tfbagas dukungan",
          icon: Heart,
        },
      ];

      views.forEach((v) => {
        const isCurrent = activeView === v.id;
        items.push({
          id: `view-${v.id}`,
          category: t("commandPalette.catNavigation"),
          title: v.title,
          subtitle: v.subtitle,
          keywords: v.keywords,
          badge: isCurrent ? t("commandPalette.activeBadge") : "VIEW",
          isActive: isCurrent,
          icon: v.icon,
          action: () => onNavigateView(v.id),
        });
      });
    }

    // 2. Color Match Solvers (Altair 4.5, Altair 4.0, Polaris 3.5)
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
        subtitle: `${sub} · ${best}`,
        keywords: `${eng.name} ${eng.codename} ${eng.id} ${sub} solver engine match 4.5 4.0 3.5`,
        badge:
          activeEngineId === eng.id
            ? t("commandPalette.activeBadge")
            : eng.shortcutKey,
        isActive: activeEngineId === eng.id,
        icon: Cpu,
        action: () => onSelectEngine?.(eng.id),
      });
    });

    // 3. Sample Plates & Calibration Actions
    items.push({
      id: "try-instant-demo",
      category: t("commandPalette.catQuickStart"),
      title: t("commandPalette.instantDemoTitle"),
      subtitle: t("commandPalette.instantDemoSub"),
      keywords: "try instant demo sample plate reference target test coba sampel",
      badge: "SAMPLE",
      icon: ImageIcon,
      action: () => onTryInstantDemo?.(),
    });

    if (onLoadSamplePlate) {
      CURATED_SAMPLE_PLATES.forEach((plate) => {
        const plateTitle = t(plate.cmdTitleKey);
        const plateSubtitle = t(plate.badgeKey);
        items.push({
          id: `sample-plate-${plate.id}`,
          category: t("commandPalette.catQuickStart"),
          title: plateTitle,
          subtitle: plateSubtitle,
          keywords: `sample plate photo ${plate.id} ${plateTitle} ${plateSubtitle}`,
          badge: "PLATE",
          icon: ImageIcon,
          action: () => onLoadSamplePlate(plate),
        });
      });
    }

    if (onRunCalibration) {
      items.push({
        id: "run-calibration",
        category: t("commandPalette.catPipeline"),
        title: t("settings.runCalBtn"),
        subtitle: t("settings.selfCalTitle"),
        keywords: "calibration calibrate diagnostic worker flush cache kalibrasi",
        badge: "DIAG",
        icon: RefreshCw,
        action: () => onRunCalibration(),
      });
    }

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

    // 4. Exports (.kfplug, .ffx, .cube, .zip, Export Modal)
    if (onOpenExportModal) {
      items.push({
        id: "open-export-modal",
        category: t("commandPalette.catExport"),
        title: t("commandPalette.openExportModalTitle"),
        subtitle: t("commandPalette.openExportModalSub"),
        keywords: "export modal video frame promo card lut plugin ekspor",
        badge: "EXPORT",
        icon: Package,
        action: () => onOpenExportModal(),
      });
    }

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

    // 5. Language Switch (EN / ID)
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

    // 6. Camera Log Input Profiles
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

    // 7. Saved & Built-in Reference Looks
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

    // 8. Partner Tool
    items.push({
      id: "partner-seethrough-studio",
      category: "Partner Tool",
      title: "Open SeeThrough Studio",
      subtitle: "Split flat PNG illustrations into layered .psd parts for Live2D rigging",
      keywords: "seethrough studio partner png psd layer split live2d vtuber external",
      badge: "PARTNER",
      isExternal: true,
      icon: Layers,
      action: () =>
        window.open("https://seethrough-studio.pages.dev", "_blank", "noopener,noreferrer"),
    });

    return items;
  }, [
    isMounted,
    activeView,
    onNavigateView,
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
    onLoadSamplePlate,
    onRunCalibration,
    onOpenExportModal,
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
      className="studio-backdrop fixed inset-0 z-[130] flex items-start justify-center pt-[10vh] sm:pt-[12vh] px-4 bg-[#07090D]/76 backdrop-blur-md"
    >
      <div
        data-state={presenceState}
        onClick={(e) => e.stopPropagation()}
        className="studio-modal w-full max-w-xl rounded-2xl bg-[#11161F] border border-[#AAB7C5]/18 shadow-[inset_0_1px_0_rgba(244,247,251,0.08),0_24px_64px_rgba(0,0,0,0.82)] overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#AAB7C5]/14 bg-[#0A0C10]/65">
          <Search className="w-4 h-4 text-[#93B8D8] shrink-0" strokeWidth={1.5} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder={t("commandPalette.searchPlaceholder")}
            aria-label={t("commandPalette.ariaLabel")}
            className="flex-1 bg-transparent font-sans text-xs sm:text-sm text-[#F4F7FB] placeholder-[#AAB7C5]/75 outline-none"
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-[#1C2430] border border-[#AAB7C5]/18 text-[10px] font-mono text-[#C9D7E2]">
            ESC
          </kbd>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("commandPalette.closeAria")}
            className="p-1.5 rounded-lg text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>

        <div
          ref={listRef}
          className="max-h-[58vh] overflow-y-auto p-2 space-y-1"
        >
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-xs font-sans text-[#AAB7C5]">
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
                  className={`w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2] ${
                    item.disabled
                      ? "opacity-45 cursor-not-allowed"
                      : isHighlighted
                      ? "bg-[#1C2430] border border-[#4A6B86]/55 cursor-pointer"
                      : "hover:bg-[#1C2430]/70 border border-transparent cursor-pointer"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                        item.isActive
                          ? "bg-[#4A6B86]/30 border-[#7FA3C2]/55 text-[#F4F7FB]"
                          : "bg-[#0A0C10]/70 border-[#AAB7C5]/15 text-[#C9D7E2]"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-sans text-xs font-semibold text-[#F4F7FB] truncate">
                          {item.title}
                        </span>
                        <span className="text-[9.5px] font-sans font-medium text-[#7FA3C2] shrink-0">
                          {item.category}
                        </span>
                      </div>
                      <div className="font-sans text-[11px] text-[#AAB7C5] truncate">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.isActive && (
                      <Check className="w-3.5 h-3.5 text-[#93B8D8]" strokeWidth={1.5} />
                    )}
                    {item.badge && (
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                          item.isActive
                            ? "bg-[#4A6B86]/30 text-[#F4F7FB] border-[#7FA3C2]/50"
                            : "bg-[#0A0C10]/70 text-[#C9D7E2] border-[#AAB7C5]/16"
                        }`}
                      >
                        <span>{item.badge}</span>
                        {item.isExternal && (
                          <ArrowUpRight className="w-2.5 h-2.5 text-[#93B8D8]" strokeWidth={1.5} />
                        )}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-[#AAB7C5]/14 bg-[#07090D]/80 flex items-center justify-between text-[10.5px] font-sans text-[#AAB7C5]">
          <span>{t("commandPalette.footerNavigate")}</span>
          <span className="font-mono text-[#C9D7E2]">Ctrl+K / Cmd+K</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
