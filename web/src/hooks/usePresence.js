import { useEffect, useState } from "react";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Presence lifecycle hook that keeps overlays, modals, drawers, popovers, and toasts
 * mounted during their GPU CSS exit transition before cleanly unmounting.
 */
export function usePresence(isOpen, exitDurationMs = 150) {
  const [isPresent, setIsPresent] = useState(Boolean(isOpen));

  if (isOpen && !isPresent) {
    setIsPresent(true);
  }

  useEffect(() => {
    if (isOpen || !isPresent) return undefined;

    const delay = prefersReducedMotion() ? 0 : Math.max(0, exitDurationMs);
    const timerId = window.setTimeout(() => {
      setIsPresent(false);
    }, delay);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [isOpen, isPresent, exitDurationMs]);

  return {
    isMounted: Boolean(isOpen) || isPresent,
    state: isOpen ? "open" : "closing",
  };
}
