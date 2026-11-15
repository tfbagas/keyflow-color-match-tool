import { useRef, useState, useLayoutEffect, useCallback } from "react";

/**
 * Measures the active segmented tab button (offsetLeft + offsetWidth)
 * so a shared-element floating glass pill can slide and stretch-morph cleanly.
 */
export function usePillIndicator(activeKey) {
  const containerRef = useRef(null);
  const tabRefs = useRef({});
  const [pillStyle, setPillStyle] = useState({
    left: 2,
    width: 0,
    opacity: 0,
  });

  const updatePill = useCallback(() => {
    const activeEl = tabRefs.current[activeKey];
    if (!activeEl) return;
    const nextLeft = activeEl.offsetLeft;
    const nextWidth = activeEl.offsetWidth;
    setPillStyle((prev) => {
      if (
        prev.left === nextLeft &&
        prev.width === nextWidth &&
        prev.opacity === 1
      ) {
        return prev;
      }
      return {
        left: nextLeft,
        width: nextWidth,
        opacity: 1,
      };
    });
  }, [activeKey]);

  const registerTabRef = useCallback((key) => {
    return (el) => {
      if (el) {
        tabRefs.current[key] = el;
      }
    };
  }, []);

  useLayoutEffect(() => {
    updatePill();
    const rafId = requestAnimationFrame(updatePill);

    const container = containerRef.current;
    let ro;
    if (typeof ResizeObserver !== "undefined" && container) {
      ro = new ResizeObserver(() => {
        updatePill();
      });
      ro.observe(container);
      ro.observe(document.documentElement);
      Object.values(tabRefs.current).forEach((el) => {
        if (el) ro.observe(el);
      });
    }

    const mq =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(min-width: 640px)")
        : null;
    if (mq?.addEventListener) {
      mq.addEventListener("change", updatePill);
    }

    let cancelled = false;
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) updatePill();
      });
    }

    window.addEventListener("resize", updatePill);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (ro) ro.disconnect();
      if (mq?.removeEventListener) {
        mq.removeEventListener("change", updatePill);
      }
      window.removeEventListener("resize", updatePill);
    };
  }, [updatePill]);

  return { containerRef, registerTabRef, pillStyle };
}
