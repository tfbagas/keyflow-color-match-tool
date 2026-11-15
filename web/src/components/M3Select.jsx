import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

export default function M3Select({ value, onChange, options = [], ariaLabel }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedOption =
    options.find((opt) => opt.value === value) || options[0] || { label: "" };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full select-none">
      {/* Trigger Button */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
        className={`m3-btn-morph w-full flex items-center justify-between gap-2 bg-[#0A0A0D]/38 hover:bg-white/[0.08] border rounded-xl px-3.5 py-2.5 text-xs text-[#E2E4E9] cursor-pointer ${
          open
            ? "border-white/25 bg-white/[0.08]"
            : "border-white/[0.09] hover:border-white/20"
        }`}
      >
        <span className="truncate font-medium">{selectedOption.label}</span>
        <ChevronDown
          className={`w-4 h-4 text-[#9CA3AF] shrink-0 transition-transform duration-300 ${
            open ? "rotate-180 text-[#E2E4E9]" : ""
          }`}
          style={{ transitionTimingFunction: "var(--ease-m3-spring)" }}
        />
      </button>

      {/* Dropdown Menu with Smooth Grid Height & Liquid Morph Transition */}
      <div
        aria-hidden={!open}
        data-expanded={open}
        className="m3-collapse-grid absolute left-0 right-0 mt-1.5 z-40"
      >
        <div
          role="listbox"
          className="m3-collapse-inner rounded-xl bg-[#15151B] border border-white/[0.14] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18),0_14px_34px_rgba(0,0,0,0.75)]"
        >
          <div className="p-1 space-y-0.5">
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={open ? 0 : -1}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`m3-btn-morph w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs text-left cursor-pointer ${
                    isSelected
                      ? "bg-white/[0.12] text-[#E2E4E9] font-semibold"
                      : "text-[#9CA3AF] hover:bg-white/[0.07] hover:text-[#E2E4E9]"
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-[#E2E4E9] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
