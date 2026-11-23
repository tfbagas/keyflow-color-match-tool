import React, { forwardRef, useRef } from "react";
import IntroOpticalBackdrop from "./IntroOpticalBackdrop";

interface InteractiveStudioBackdropProps {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "main" | "section";
  refreshKey?: string | number;
}

const InteractiveStudioBackdrop = forwardRef<
  HTMLElement,
  InteractiveStudioBackdropProps
>(function InteractiveStudioBackdrop(
  { children, className = "", as: Component = "div" },
  forwardedRef
) {
  const internalRef = useRef<HTMLElement | null>(null);

  const setMergedRef = (node: HTMLElement | null) => {
    internalRef.current = node;
    if (typeof forwardedRef === "function") {
      forwardedRef(node);
    } else if (forwardedRef) {
      forwardedRef.current = node;
    }
  };

  return (
    <Component
      ref={setMergedRef as never}
      className={`interactive-studio-backdrop relative bg-[#0A0C10] ${className}`.trim()}
    >
      <IntroOpticalBackdrop scrollContainerRef={internalRef} intensity={0.62} />

      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-[1]"
        style={{
          background:
            "radial-gradient(ellipse 88% 72% at 50% 28%, rgba(10, 12, 16, 0.14) 0%, rgba(7, 9, 13, 0.46) 100%)",
        }}
      />

      {/* Restrained Steel Night Corner Calibration Reticles (~5%-14% opacity) */}
      <div
        aria-hidden="true"
        className="fixed inset-4 sm:inset-6 pointer-events-none z-[2]"
      >
        <span className="absolute top-12 left-0 w-3.5 h-3.5 border-t border-l border-[#AAB7C5]/18" />
        <span className="absolute top-12 right-0 w-3.5 h-3.5 border-t border-r border-[#AAB7C5]/18" />
        <span className="absolute bottom-0 left-0 w-3.5 h-3.5 border-b border-l border-[#AAB7C5]/18" />
        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 border-b border-r border-[#AAB7C5]/18" />
        <span className="hidden lg:block absolute top-1/2 left-0 w-2 h-px bg-[#7FA3C2]/22" />
        <span className="hidden lg:block absolute top-1/2 right-0 w-2 h-px bg-[#7FA3C2]/22" />
      </div>

      <div className="relative z-10">{children}</div>
    </Component>
  );
});

export default InteractiveStudioBackdrop;
