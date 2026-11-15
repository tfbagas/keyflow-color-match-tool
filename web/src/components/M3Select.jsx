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
        className={`w-full flex items-center justify-between gap-2 bg-[#1E1E24] hover:bg-[#2B2B33]/70 border rounded-xl px-3.5 py-2.5 text-xs text-[#E2E4E9] transition-all cursor-pointer ${
          open
            ? "border-white/25 bg-[#2B2B33]/80"
            : "border-white/10 hover:border-white/20"
        }`}
      >
        <span className="truncate font-medium">{selectedOption.label}</span>
        <ChevronDown
          className={`w-4 h-4 text-[#9CA3AF] shrink-0 transition-transform duration-200 ${
            open ? "rotate-180 text-[#E2E4E9]" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 mt-1.5 z-40 rounded-xl bg-[#1E1E24] border border-white/10 shadow-[0_14px_34px_rgba(0,0,0,0.75)] p-1 m3-modal-enter overflow-hidden"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-[#2B2B33] text-[#E2E4E9] font-semibold"
                    : "text-[#9CA3AF] hover:bg-[#2B2B33]/70 hover:text-[#E2E4E9]"
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
      )}
    </div>
  );
}
