import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { LOG_PROFILES, resolveLogProfileId } from "../utils/logProfiles";
import { useLanguage } from "../i18n/LanguageContext";
import { usePresence } from "../hooks/usePresence";

export default function InputProfileDropdown({
  value,
  onChange,
  ariaLabel = "Target Input Profile",
  title = "Select Target Camera Log Input Profile",
  compact = false,
  className = "",
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const { isMounted, state: presenceState } = usePresence(open, 130);
  const [menuStyle, setMenuStyle] = useState(null);
  const [placement, setPlacement] = useState("bottom");
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const activeId = resolveLogProfileId(value);
  const activeProfile =
    LOG_PROFILES.find((p) => p.id === activeId) || LOG_PROFILES[0];
  const isNonDefault = activeId !== "rec709";

  const getProfileLabel = (prof) => {
    const loc = t(`logProfiles.${prof.id}.label`);
    return loc && !loc.startsWith("logProfiles.") ? loc : prof.label;
  };

  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const menuWidth = Math.max(rect.width, 210);
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;

      let left = rect.left;
      if (left + menuWidth > viewportW - 8) {
        left = Math.max(8, rect.right - menuWidth);
      }

      const estimatedH = LOG_PROFILES.length * 32 + 10;
      const openUpward =
        rect.bottom + estimatedH + 8 > viewportH && rect.top > estimatedH + 8;

      setPlacement(openUpward ? "top" : "bottom");
      setMenuStyle({
        position: "fixed",
        left: `${Math.round(left)}px`,
        width: `${Math.round(menuWidth)}px`,
        top: openUpward
          ? `${Math.max(8, Math.round(rect.top - estimatedH - 4))}px`
          : `${Math.round(rect.bottom + 4)}px`,
      });
    };

    updatePosition();

    const handlePointerDown = (e) => {
      const tgt = e.target;
      if (
        triggerRef.current?.contains(tgt) ||
        menuRef.current?.contains(tgt)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={`bg-[#0A0C10] hover:bg-[#1C2430] border ${
          isNonDefault
            ? "border-[#7FA3C2]/55 text-[#F4F7FB]"
            : "border-[#AAB7C5]/16 text-[#C9D7E2]"
        } ${
          compact ? "text-[11px] px-2 py-1" : "text-[11px] px-2.5 py-1.5"
        } font-medium rounded-md flex items-center justify-between gap-1.5 transition-colors cursor-pointer select-none focus:outline-none focus:border-[#7FA3C2] ${className}`}
      >
        <span className="truncate font-mono text-[11px]">
          {compact ? activeProfile.shortLabel : activeProfile.shortLabel}
        </span>
        <ChevronDown
          className={`studio-chevron w-3 h-3 shrink-0 text-[#AAB7C5] ${
            open ? "rotate-180 text-[#F4F7FB]" : "rotate-0"
          }`}
        />
      </button>

      {isMounted &&
        menuStyle &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            data-state={presenceState}
            data-placement={placement}
            style={menuStyle}
            onClick={(e) => e.stopPropagation()}
            className="studio-popover z-[90] bg-[#11161F]/96 backdrop-blur-xl border border-[#AAB7C5]/18 rounded-lg p-1 shadow-[inset_0_1px_0_rgba(244,247,251,0.06),0_14px_32px_rgba(0,0,0,0.85)]"
          >
            {LOG_PROFILES.map((prof) => {
              const isSelected = prof.id === activeId;
              return (
                <button
                  key={prof.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(prof.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-[11px] flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-[#4A6B86]/30 text-[#F4F7FB] font-medium"
                      : "text-[#AAB7C5] hover:bg-[#1C2430] hover:text-[#F4F7FB]"
                  }`}
                >
                  <span className="truncate">{getProfileLabel(prof)}</span>
                  {isSelected && (
                    <Check className="w-3 h-3 text-[#93B8D8] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
