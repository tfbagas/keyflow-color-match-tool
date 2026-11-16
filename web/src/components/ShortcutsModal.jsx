import React, { useEffect } from "react";
import { X, Keyboard } from "lucide-react";

const SHORTCUTS = [
  { keys: "\\", desc: "Hold to preview original ungraded source" },
  { keys: "Space", desc: "Play or pause video preview" },
  { keys: "1 / 2", desc: "Switch A / B grading snapshot slots" },
  { keys: "Ctrl + V", desc: "Paste image from clipboard into active slot" },
  { keys: "Shift + Drag", desc: "Fine-tune parameter slider (0.01 step)" },
  { keys: "Double-Click", desc: "Reset slider or color wheel to neutral" },
  { keys: "?", desc: "Toggle this keyboard shortcuts reference" },
];

export default function ShortcutsModal({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[#131419] border border-white/[0.12] shadow-2xl overflow-hidden m3-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-[#F4F5F7]" />
            <h2 className="text-xs font-mono uppercase tracking-[0.14em] text-[#F4F5F7]">
              Keyboard &amp; Grading Shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#9CA3AF] hover:text-[#F4F5F7] hover:bg-white/[0.06] transition-colors cursor-pointer"
            aria-label="Close shortcuts"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {SHORTCUTS.map((item) => (
            <div
              key={item.keys}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06]"
            >
              <span className="text-xs text-[#D1D5DB]">{item.desc}</span>
              <kbd className="shrink-0 px-2 py-0.5 rounded-md bg-white/[0.07] border border-white/[0.14] text-[10px] font-mono text-[#F4F5F7]">
                {item.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
