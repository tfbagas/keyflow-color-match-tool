import { useRef, useState, useLayoutEffect, useCallback } from "react";

/**
 * Measures the active segmented button (horizontal or vertical) and outputs a
 * GPU-composited transform style so a sliding active pill glides cleanly at
 * 260ms var(--ease-shutter) with zero initial fly-in jump on first mount.
 */
export function usePillIndicator(
  activeKey,
  { orientation = "horizontal", refreshKey = null, duration = "var(--dur-pill, 260ms)" } = {}
) {
  const containerRef = useRef(null);
  const tabRefs = useRef({});
  const isVertical = orientation === "vertical";

  const [metrics, setMetrics] = useState({
    offset: 0,
    size: 0,
    ready: false,
    animate: false,
  });

  const updatePill = useCallback(() => {
    const activeEl = tabRefs.current[activeKey];
    if (!activeEl) return;

    const nextOffset = isVertical ? activeEl.offsetTop : activeEl.offsetLeft;
    const nextSize = isVertical ? activeEl.offsetHeight : activeEl.offsetWidth;

    // Ignore measurements while container is display:none (e.g., hidden tab)
    if (nextSize <= 0) return;

    setMetrics((prev) => {
      if (prev.ready && prev.offset === nextOffset && prev.size === nextSize) {
        return prev;
      }
      return {
        offset: nextOffset,
        size: nextSize,
        ready: true,
        // Enable smooth sliding only after the first valid measurement is painted
        animate: prev.ready,
      };
    });
  }, [activeKey, isVertical]);

  const registerTabRef = useCallback((key) => {
    return (el) => {
      if (el) {
        tabRefs.current[key] = el;
      } else {
        delete tabRefs.current[key];
      }
    };
  }, []);

  useLayoutEffect(() => {
    updatePill();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      updatePill();
      raf2 = requestAnimationFrame(() => {
        setMetrics((prev) =>
          prev.ready && !prev.animate ? { ...prev, animate: true } : prev
        );
      });
    });

    const container = containerRef.current;
    let ro;
    if (typeof ResizeObserver !== "undefined" && container) {
      ro = new ResizeObserver(() => {
        updatePill();
      });
      ro.observe(container);
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

    window.addEventListener("resize", updatePill, { passive: true });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      if (ro) ro.disconnect();
      if (mq?.removeEventListener) {
        mq.removeEventListener("change", updatePill);
      }
      window.removeEventListener("resize", updatePill);
    };
  }, [updatePill, refreshKey]);

  const pillStyle = isVertical
    ? {
        transform: `translate3d(0, ${metrics.offset}px, 0)`,
        height: `${metrics.size}px`,
        opacity: metrics.ready ? 1 : 0,
        transition: metrics.animate
          ? `transform ${duration} var(--ease-shutter), height ${duration} var(--ease-shutter), opacity 140ms var(--ease-aperture)`
          : "none",
      }
    : {
        transform: `translate3d(${metrics.offset}px, 0, 0)`,
        width: `${metrics.size}px`,
        opacity: metrics.ready ? 1 : 0,
        transition: metrics.animate
          ? `transform ${duration} var(--ease-shutter), width ${duration} var(--ease-shutter), opacity 140ms var(--ease-aperture)`
          : "none",
      };

  return { containerRef, registerTabRef, pillStyle };
}
