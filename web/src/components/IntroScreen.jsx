import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import Lenis from "lenis";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useMotionValueEvent,
  useReducedMotion,
} from "motion/react";
import { ArrowRight, ArrowDown, HelpCircle, Search } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import BrandLogo from "./BrandLogo";
import IntroOpticalBackdrop from "./IntroOpticalBackdrop";
import IntroProScopesCanvas from "./IntroProScopesCanvas";
import IntroShowcaseSections from "./IntroShowcaseSections";

const LUMINANCE_STEPS = [
  { ire: 0, hex: "#0A0C10" },
  { ire: 11, hex: "#121822" },
  { ire: 22, hex: "#1C2430" },
  { ire: 33, hex: "#2A384B" },
  { ire: 44, hex: "#3B4F66" },
  { ire: 56, hex: "#4A6B86" },
  { ire: 67, hex: "#6B8BA7" },
  { ire: 78, hex: "#93B8D8" },
  { ire: 89, hex: "#C9D7E2" },
  { ire: 100, hex: "#F4F7FB" },
];

const REC709_TICKS = [
  { id: "R", name: "Rec.709 Red", hex: "#B64A54" },
  { id: "Y", name: "Rec.709 Yellow", hex: "#B59C4E" },
  { id: "G", name: "Rec.709 Green", hex: "#4B9770" },
  { id: "C", name: "Rec.709 Cyan", hex: "#4B8C9E" },
  { id: "B", name: "Rec.709 Blue", hex: "#4A6B86" },
  { id: "M", name: "Rec.709 Magenta", hex: "#945988" },
];

const SOLVER_TIERS = [
  { id: "altair_refresh", label: "Altair 4.5 Refresh" },
  { id: "altair", label: "Altair 4.0" },
  { id: "polaris", label: "Polaris 3.5" },
];

const EASE_HERO = [0.16, 1, 0.3, 1];

export default function IntroScreen({
  onStartExit,
  onComplete,
  onNavigateView,
  onOpenCommandPalette,
  onTrySampleInStudio,
  onOpenGuide,
  isGuideOpen = false,
  isCommandPaletteOpen = false,
}) {
  const { t } = useLanguage();
  const prefersReducedMotion = useReducedMotion();
  const [isExiting, setIsExiting] = useState(false);
  const [isNavRevealed, setIsNavRevealed] = useState(false);
  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [isNavCompacted, setIsNavCompacted] = useState(false);
  const [selectedEngineIdx, setSelectedEngineIdx] = useState(0);

  const scrollWrapperRef = useRef(null);
  const scrollContentRef = useRef(null);
  const lenisRef = useRef(null);
  const stageRef = useRef(null);
  const calibBezelRef = useRef(null);
  const emblemBezelRef = useRef(null);
  const exitingRef = useRef(false);
  const timersRef = useRef([]);
  const navExpandTimerRef = useRef(0);

  const { scrollY, scrollYProgress } = useScroll({
    container: scrollWrapperRef,
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 115,
    damping: 26,
    restDelta: 0.0004,
  });

  // Scroll-linked Hero phosphor scopes parallax ([0, 0.22])
  const heroScopesScale = useTransform(smoothProgress, [0, 0.22], [1, 0.95]);
  const heroScopesY = useTransform(smoothProgress, [0, 0.22], [0, 56]);
  const heroScopesOpacity = useTransform(smoothProgress, [0, 0.22], [0.82, 0.16]);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const y = Number(latest) || 0;
    const revealed = y > 120;
    setIsNavRevealed((prev) => (prev === revealed ? prev : revealed));
    const compacted = y > 220;
    setIsNavCompacted((prev) => (prev === compacted ? prev : compacted));
  });

  // Two-stage Floating Pill Navbar choreography:
  // Stage 1 (scrollY > 120px): Compact centered pill with ToneBench logo + wordmark (scale 0.9 -> 1, opacity 0 -> 1)
  // Stage 2 (~0.16s later): Smooth horizontal spring expansion revealing nav links, Ctrl+K, and Open Studio CTA
  useEffect(() => {
    if (navExpandTimerRef.current) {
      clearTimeout(navExpandTimerRef.current);
      navExpandTimerRef.current = 0;
    }
    if (!isNavRevealed) {
      setIsNavExpanded(false);
      return undefined;
    }
    if (prefersReducedMotion) {
      setIsNavExpanded(true);
      return undefined;
    }
    navExpandTimerRef.current = window.setTimeout(() => {
      setIsNavExpanded(true);
      navExpandTimerRef.current = 0;
    }, 160);
    return () => {
      if (navExpandTimerRef.current) {
        clearTimeout(navExpandTimerRef.current);
        navExpandTimerRef.current = 0;
      }
    };
  }, [isNavRevealed, prefersReducedMotion]);

  const triggerExit = useCallback(
    (targetView = "home") => {
      if (exitingRef.current) return;
      exitingRef.current = true;

      if (targetView && targetView !== "home" && onNavigateView) {
        onNavigateView(targetView);
      }

      const reducedMotion =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      setIsExiting(true);
      if (lenisRef.current) {
        lenisRef.current.stop();
      }
      if (onStartExit) onStartExit();

      if (reducedMotion) {
        if (onComplete) onComplete();
        return;
      }

      const tmr = setTimeout(() => {
        if (onComplete) onComplete();
      }, 360);
      timersRef.current.push(tmr);
    },
    [onStartExit, onComplete, onNavigateView]
  );

  const handleTrySampleAndEnter = useCallback(
    (demo) => {
      if (onTrySampleInStudio) {
        onTrySampleInStudio(demo);
      }
      triggerExit("home");
    },
    [onTrySampleInStudio, triggerExit]
  );

  const scrollToSection = useCallback((elementId) => {
    const target = document.getElementById(elementId);
    if (!target) return;
    if (lenisRef.current) {
      lenisRef.current.scrollTo(target, { offset: 0, duration: 1.0 });
    } else {
      target.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  const scrollToTop = useCallback(() => {
    if (lenisRef.current) {
      lenisRef.current.scrollTo(0, { duration: 0.9 });
    } else if (scrollWrapperRef.current) {
      scrollWrapperRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const handleHeroSelectEngine = useCallback(
    (idx) => {
      setSelectedEngineIdx(idx);
      scrollToSection("workbench");
    },
    [scrollToSection]
  );

  // Initialize Lenis smooth scroll strictly while IntroScreen is mounted
  useEffect(() => {
    const wrapper = scrollWrapperRef.current;
    const content = scrollContentRef.current;
    if (!wrapper || !content) return undefined;

    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) return undefined;

    const lenis = new Lenis({
      wrapper,
      content,
      eventsTarget: wrapper,
      smoothWheel: true,
      lerp: 0.1,
      duration: 1.15,
      autoResize: true,
    });
    lenisRef.current = lenis;

    let rafId = 0;
    const raf = (time) => {
      lenis.raf(time);
      rafId = window.requestAnimationFrame(raf);
    };
    rafId = window.requestAnimationFrame(raf);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Pause Lenis scroll while modal overlays are open above Intro
  useEffect(() => {
    const lenis = lenisRef.current;
    if (!lenis) return;
    if (isGuideOpen || isCommandPaletteOpen) {
      lenis.stop();
    } else if (!exitingRef.current) {
      lenis.start();
    }
  }, [isGuideOpen, isCommandPaletteOpen]);

  // Keyboard shortcuts while IntroScreen is active (Enter/Space to enter Studio)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isGuideOpen || isCommandPaletteOpen) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;

      const active = document.activeElement;
      const tag = active?.tagName?.toUpperCase();
      const role = active?.getAttribute?.("role");
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "BUTTON" ||
        tag === "A" ||
        role === "slider" ||
        active?.isContentEditable
      ) {
        return;
      }

      const scrollTop = scrollWrapperRef.current?.scrollTop || 0;
      if (
        e.key === "Enter" ||
        ((e.key === " " || e.code === "Space") && scrollTop < 40)
      ) {
        e.preventDefault();
        e.stopPropagation();
        triggerExit("home");
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    const activeTimers = timersRef.current;
    return () => {
      activeTimers.forEach(clearTimeout);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [triggerExit, isGuideOpen, isCommandPaletteOpen]);

  return (
    <div
      ref={scrollWrapperRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("intro.dialogLabel")}
      className={`fixed inset-0 z-50 w-screen h-dvh bg-[#0A0C10] text-[#F4F7FB] select-none overflow-y-auto overflow-x-hidden cursor-default ${
        isExiting ? "intro-exit-bg" : ""
      }`}
      style={{
        pointerEvents: isExiting ? "none" : "auto",
      }}
    >
      {/* Interactive Halftone / Dot-Matrix Optical Backdrop */}
      <IntroOpticalBackdrop
        smoothProgress={smoothProgress}
        scrollContainerRef={scrollWrapperRef}
        isExiting={isExiting}
      />

      {/* Tier 1: Scroll-Triggered Two-Stage Logo-First Expanding Pill Navbar (Hidden at top scrollY <= 120px) */}
      <div
        aria-hidden={!isNavRevealed}
        className={`fixed top-3.5 sm:top-4 inset-x-3 sm:inset-x-6 z-50 flex justify-center pointer-events-none ${
          isExiting ? "intro-exit-chrome" : ""
        }`}
      >
        <motion.header
          initial={false}
          data-nav-stage={
            isNavExpanded ? "expanded" : isNavRevealed ? "logo-pill" : "hidden"
          }
          animate={{
            opacity: isNavRevealed ? 1 : 0,
            scale: isNavRevealed ? 1 : 0.9,
            y: isNavRevealed ? 0 : -12,
            maxWidth: isNavExpanded
              ? isNavCompacted
                ? 760
                : 880
              : 164,
            paddingTop: isNavExpanded ? (isNavCompacted ? 5 : 8) : 6,
            paddingBottom: isNavExpanded ? (isNavCompacted ? 5 : 8) : 6,
            paddingLeft: isNavExpanded ? (isNavCompacted ? 10 : 12) : 12,
            paddingRight: isNavExpanded ? (isNavCompacted ? 10 : 12) : 12,
          }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : {
                  type: "spring",
                  stiffness: 260,
                  damping: 28,
                }
          }
          className={`w-full overflow-hidden rounded-full backdrop-blur-md bg-[#11161F]/84 border border-[#AAB7C5]/15 shadow-[inset_0_1px_0_rgba(244,247,251,0.08),0_16px_40px_rgba(0,0,0,0.58)] flex items-center justify-between gap-2 sm:gap-3 ${
            isNavRevealed ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          {/* Stage 1 & 2 Left: Authentic Original Blue ToneBench 3D Cube Brand Mark + Wordmark */}
          <button
            type="button"
            onClick={scrollToTop}
            aria-label="ToneBench home"
            className="min-h-[40px] sm:min-h-[34px] inline-flex items-center gap-2 pl-1 pr-2 rounded-full text-left cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
          >
            <BrandLogo size={26} />
            <span className="font-display text-sm font-semibold tracking-[-0.02em] text-[#F4F7FB] whitespace-nowrap">
              ToneBench
            </span>
          </button>

          {/* Stage 2 Center: Clean Section & View Links (Desktop md+) */}
          <motion.nav
            initial={false}
            aria-label={t("nav.primaryLabel")}
            aria-hidden={!isNavExpanded}
            animate={{
              opacity: isNavExpanded ? 1 : 0,
              x: isNavExpanded ? 0 : -6,
            }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : {
                    type: "spring",
                    stiffness: 260,
                    damping: 28,
                  }
            }
            className={`hidden md:flex items-center gap-0.5 lg:gap-1 shrink-0 ${
              isNavExpanded ? "pointer-events-auto" : "pointer-events-none"
            }`}
          >
            <button
              type="button"
              tabIndex={isNavExpanded ? 0 : -1}
              onClick={() => triggerExit("home")}
              className="px-2.5 lg:px-3 py-1.5 rounded-full font-sans text-xs font-medium text-[#C9D7E2] hover:text-[#F4F7FB] hover:bg-[#1C2430]/80 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
            >
              {t("nav.studioShort")}
            </button>
            <button
              type="button"
              tabIndex={isNavExpanded ? 0 : -1}
              onClick={() => scrollToSection("anatomy")}
              className="px-2.5 lg:px-3 py-1.5 rounded-full font-sans text-xs font-medium text-[#C9D7E2] hover:text-[#F4F7FB] hover:bg-[#1C2430]/80 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
            >
              {t("nav.lutLab")}
            </button>
            <button
              type="button"
              tabIndex={isNavExpanded ? 0 : -1}
              onClick={() => triggerExit("settings")}
              className="px-2.5 lg:px-3 py-1.5 rounded-full font-sans text-xs font-medium text-[#C9D7E2] hover:text-[#F4F7FB] hover:bg-[#1C2430]/80 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
            >
              {t("nav.settings")}
            </button>
            <button
              type="button"
              tabIndex={isNavExpanded ? 0 : -1}
              onClick={() => triggerExit("about")}
              className="px-2.5 lg:px-3 py-1.5 rounded-full font-sans text-xs font-medium text-[#C9D7E2] hover:text-[#F4F7FB] hover:bg-[#1C2430]/80 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
            >
              {t("nav.about")}
            </button>
            <button
              type="button"
              tabIndex={isNavExpanded ? 0 : -1}
              onClick={() => triggerExit("support")}
              className="px-2.5 lg:px-3 py-1.5 rounded-full font-sans text-xs font-medium text-[#C9D7E2] hover:text-[#F4F7FB] hover:bg-[#1C2430]/80 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
            >
              {t("nav.support")}
            </button>
          </motion.nav>

          {/* Stage 2 Right: Ctrl+K Command Trigger Pill + Crisp #F4F7FB Open Studio CTA */}
          <motion.div
            initial={false}
            aria-hidden={!isNavExpanded}
            animate={{
              opacity: isNavExpanded ? 1 : 0,
              x: isNavExpanded ? 0 : -6,
            }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : {
                    type: "spring",
                    stiffness: 260,
                    damping: 28,
                  }
            }
            className={`flex items-center gap-1.5 shrink-0 ${
              isNavExpanded ? "pointer-events-auto" : "pointer-events-none"
            }`}
          >
            {onOpenCommandPalette && (
              <button
                type="button"
                tabIndex={isNavExpanded ? 0 : -1}
                onClick={onOpenCommandPalette}
                title={t("nav.commandPaletteTitle")}
                aria-label={t("nav.commandPaletteTitle")}
                className="min-h-[40px] sm:min-h-[32px] min-w-[40px] sm:min-w-0 inline-flex items-center justify-center gap-1.5 px-2.5 rounded-full bg-[#0A0C10]/70 hover:bg-[#1C2430] border border-[#AAB7C5]/18 text-[#C9D7E2] hover:text-[#F4F7FB] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
              >
                <Search className="w-3.5 h-3.5 text-[#93B8D8]" strokeWidth={1.5} />
                <kbd className="hidden sm:inline font-mono text-[10px] text-[#AAB7C5]">
                  Ctrl+K
                </kbd>
              </button>
            )}

            <button
              type="button"
              tabIndex={isNavExpanded ? 0 : -1}
              onClick={() => triggerExit("home")}
              className="min-h-[40px] sm:min-h-[34px] inline-flex items-center gap-1.5 px-3.5 sm:px-4 rounded-full bg-[#F4F7FB] hover:bg-[#FBFDFF] text-[#0A0C10] font-sans font-semibold text-xs tracking-[-0.01em] whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93B8D8]"
            >
              <span>{t("intro.openStudio")}</span>
              <ArrowRight className="w-3.5 h-3.5 translate-x-[0.5px]" strokeWidth={1.75} />
            </button>
          </motion.div>
        </motion.header>
      </div>

      <div ref={scrollContentRef} className="relative z-10 w-full min-h-full">
        {/* ABOVE-THE-FOLD EDITORIAL HERO */}
        <div
          id="intro-hero"
          ref={stageRef}
          className="relative w-full min-h-dvh flex flex-col items-center justify-center overflow-hidden py-20"
          style={{
            "--mx": "50vw",
            "--my": "44vh",
            "--sweep-pct": "50%",
            "--cursor-presence": "0",
          }}
        >
          {/* Calibrated Phosphor Pro Scopes Backdrop Layer */}
          <motion.div
            style={{
              scale: heroScopesScale,
              y: heroScopesY,
              opacity: heroScopesOpacity,
            }}
            className={`absolute inset-0 z-0 will-change-transform ${
              isExiting ? "intro-exit-bg" : ""
            }`}
          >
            <IntroProScopesCanvas
              stageRef={stageRef}
              calibBezelRef={calibBezelRef}
              emblemBezelRef={emblemBezelRef}
            />

            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-[1]"
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(ellipse 56% 52% at 50% 50%, rgba(10,12,16,0.92) 0%, rgba(10,12,16,0.52) 64%, rgba(10,12,16,0.24) 100%)",
                }}
              />
            </div>
          </motion.div>

          {/* Subtle Optical Viewfinder Corner Marks */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-5 sm:inset-7 z-[15] ${
              isExiting ? "intro-exit-chrome" : ""
            }`}
          >
            <span className="absolute top-0 left-0 w-4 h-4 border-t border-l border-[#AAB7C5]/22" />
            <span className="absolute top-0 right-0 w-4 h-4 border-t border-r border-[#AAB7C5]/22" />
            <span className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-[#AAB7C5]/22" />
            <span className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-[#AAB7C5]/22" />
          </div>

          {/* Center Precision Optical Stage (LCP-Safe: opacity: 1 on primary ToneBench mark & H1) */}
          <main
            className={`relative z-20 flex flex-col items-center text-center max-w-[720px] px-5 sm:px-8 ${
              isExiting ? "intro-exit-dive" : ""
            }`}
          >
            {/* 16-Step Luminance & Rec.709 Calibration Strip */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.04, ease: EASE_HERO }}
              className="w-full max-w-[336px] mb-7"
            >
              <div
                ref={calibBezelRef}
                className="intro-specular-bezel relative rounded-[6px] bg-[#11161F]/90 border border-[#AAB7C5]/16 p-[3px]"
                aria-label="10-step luminance ramp 0 to 100 IRE and Rec.709 6-axis optical calibration strip"
              >
                <div className="relative flex items-center w-full overflow-hidden rounded-[3px]">
                  <div className="grid grid-cols-10 gap-[1.5px] flex-[10] h-[6px]">
                    {LUMINANCE_STEPS.map((step, idx) => (
                      <motion.span
                        key={step.ire}
                        title={`${step.ire}% IRE`}
                        initial={prefersReducedMotion ? false : { opacity: 0, scaleY: 0.4 }}
                        animate={{ opacity: 1, scaleY: 1 }}
                        transition={{
                          duration: 0.36,
                          delay: 0.04 + idx * 0.015,
                          ease: EASE_HERO,
                        }}
                        className="block w-full h-full rounded-[1px] origin-bottom"
                        style={{ backgroundColor: step.hex }}
                      />
                    ))}
                  </div>
                  <span
                    aria-hidden="true"
                    className="w-px h-[8px] mx-[5px] bg-[#AAB7C5]/25 shrink-0"
                  />
                  <div className="grid grid-cols-6 gap-[1.5px] flex-[5] h-[6px]">
                    {REC709_TICKS.map((tick, idx) => (
                      <motion.span
                        key={tick.id}
                        title={tick.name}
                        initial={prefersReducedMotion ? false : { opacity: 0, scaleY: 0.4 }}
                        animate={{ opacity: 1, scaleY: 1 }}
                        transition={{
                          duration: 0.36,
                          delay: 0.14 + idx * 0.016,
                          ease: EASE_HERO,
                        }}
                        className="block w-full h-full rounded-[1px] origin-bottom"
                        style={{ backgroundColor: tick.hex }}
                      />
                    ))}
                  </div>
                  <div
                    aria-hidden="true"
                    className="intro-calib-sweep pointer-events-none absolute inset-0 mix-blend-screen"
                  />
                </div>
              </div>

              <motion.div
                aria-hidden="true"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.44, delay: 0.1, ease: EASE_HERO }}
                className="mt-1.5 flex items-center justify-between px-0.5 font-mono text-[9.5px] tracking-[0.08em] uppercase text-[#AAB7C5] tabular-nums"
              >
                <div className="flex items-center justify-between flex-[10] pr-2">
                  <span>0 IRE</span>
                  <span>50</span>
                  <span>100</span>
                </div>
                <div className="flex-[5] text-right text-[#93B8D8]">
                  REC.709
                </div>
              </motion.div>
            </motion.div>

            {/* Primary LCP-Safe Display Headline (Always opacity: 1 on initial render) */}
            <div ref={emblemBezelRef} className="space-y-2.5">
              <motion.h1
                initial={prefersReducedMotion ? false : { y: 12, scale: 0.985 }}
                animate={{ y: 0, scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 260,
                  damping: 28,
                  mass: 0.85,
                }}
                className="font-display text-[44px] sm:text-[62px] lg:text-[72px] font-semibold leading-[1.02] tracking-[-0.03em] text-[#F4F7FB] text-balance"
              >
                {t("intro.title")}
              </motion.h1>
              <div className="overflow-hidden py-0.5">
                <motion.p
                  initial={prefersReducedMotion ? false : { y: "100%" }}
                  animate={{ y: "0%" }}
                  transition={{ duration: 0.6, delay: 0.1, ease: EASE_HERO }}
                  className="font-display text-xl sm:text-2xl font-medium tracking-[-0.02em] text-[#C9D7E2] text-balance"
                >
                  {t("intro.heroLine2")}
                </motion.p>
              </div>
            </div>

            {/* Concise Plain-Language Description */}
            <div className="mt-4 max-w-[520px] overflow-hidden">
              <motion.p
                initial={prefersReducedMotion ? false : { y: "100%" }}
                animate={{ y: "0%" }}
                transition={{ duration: 0.6, delay: 0.16, ease: EASE_HERO }}
                className="font-sans text-sm sm:text-[15px] leading-relaxed text-[#AAB7C5] text-balance"
              >
                {t("intro.subtitle")}
              </motion.p>
            </div>

            {/* Single-Row Solver Selector Strip */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.52, delay: 0.22, ease: EASE_HERO }}
              className="mt-7 max-w-full"
            >
              <div
                role="group"
                aria-label="Select active grading engine sample"
                className="inline-flex flex-wrap items-center justify-center gap-1 p-1 rounded-2xl sm:rounded-full bg-[#11161F]/88 border border-[#AAB7C5]/15 font-sans text-xs"
              >
                {SOLVER_TIERS.map((tier, idx) => {
                  const isActive = idx === selectedEngineIdx;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => handleHeroSelectEngine(idx)}
                      className={`min-h-[44px] sm:min-h-[34px] inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2] ${
                        isActive
                          ? "bg-[#4A6B86]/35 border border-[#7FA3C2]/50 text-[#F4F7FB] font-medium"
                          : "border border-transparent text-[#C9D7E2] hover:text-[#F4F7FB] hover:bg-[#1C2430]/75"
                      }`}
                    >
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="w-1.5 h-1.5 rounded-full bg-[#93B8D8] shrink-0"
                        />
                      )}
                      <span>{tier.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>

            {/* Primary CTA + Keyboard Hint */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.52, delay: 0.28, ease: EASE_HERO }}
              className="mt-7 flex flex-col items-center"
            >
              <motion.button
                type="button"
                whileTap={{ scale: 0.985 }}
                onClick={() => triggerExit("home")}
                className="group relative inline-flex items-center justify-center gap-2.5 h-12 px-7 rounded-full bg-[#F4F7FB] hover:bg-[#FBFDFF] text-[#0A0C10] font-sans font-semibold text-sm tracking-[-0.01em] border border-[#FBFDFF]/80 shadow-[0_12px_30px_rgba(0,0,0,0.48)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93B8D8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0C10]"
              >
                <span>{t("intro.openStudio")}</span>
                <ArrowRight
                  className="w-4 h-4 text-[#0A0C10] translate-x-[0.5px] transition-transform duration-200 group-hover:translate-x-0.5"
                  strokeWidth={1.75}
                />
              </motion.button>

              <div className="mt-3.5 inline-flex items-center gap-1.5 font-sans text-xs text-[#AAB7C5]">
                <span>{t("intro.pressKey")}</span>
                <kbd className="inline-flex items-center gap-1 px-1.5 py-[2px] rounded-[4px] bg-[#11161F] border border-[#AAB7C5]/22 font-mono text-[10px] text-[#C9D7E2] leading-none">
                  <span aria-hidden="true">↵</span>
                  <span>Enter</span>
                </kbd>
                <span className="mx-1 text-[#AAB7C5]/40" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono text-[10.5px] text-[#AAB7C5]">
                  .cube · .lut · .ffx · .kfplug
                </span>
              </div>
            </motion.div>
          </main>

          {/* Bottom Hero Strip */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.34, ease: EASE_HERO }}
            className={`absolute bottom-6 inset-x-6 z-[32] flex flex-wrap items-center justify-center gap-x-4 gap-y-2 ${
              isExiting ? "intro-exit-chrome" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => scrollToSection("workbench")}
              className="group min-h-[44px] sm:min-h-[36px] inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#11161F]/85 hover:bg-[#1C2430] border border-[#AAB7C5]/18 hover:border-[#4A6B86]/65 font-sans text-xs font-medium text-[#C9D7E2] hover:text-[#F4F7FB] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
            >
              <span>{t("intro.scrollToInspect")}</span>
              <ArrowDown
                className="w-3.5 h-3.5 text-[#93B8D8] transition-transform duration-200 group-hover:translate-y-0.5"
                strokeWidth={1.5}
              />
            </button>

            <button
              type="button"
              onClick={() => {
                if (onOpenGuide) {
                  onOpenGuide();
                } else {
                  scrollToSection("pipeline");
                }
              }}
              className="min-h-[44px] sm:min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-sans text-xs font-medium text-[#C9D7E2] hover:text-[#F4F7FB] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
            >
              <HelpCircle className="w-3.5 h-3.5 text-[#93B8D8]" strokeWidth={1.5} />
              <span>{t("preview.howToUse")}</span>
            </button>
          </motion.div>

          {isExiting && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 -mt-[0.5px] inset-x-0 h-px z-[40] overflow-hidden"
            >
              <div className="intro-handoff-rail absolute inset-0" />
              <div className="intro-handoff-beam absolute top-0 left-0" />
            </div>
          )}
        </div>

        {/* BELOW-THE-FOLD: ASK-INSPIRED EDITORIAL SHOWCASE, HORIZONTAL ROW LISTS & DOT-MATRIX FOOTER */}
        <IntroShowcaseSections
          scrollRootRef={scrollWrapperRef}
          selectedEngineIdx={selectedEngineIdx}
          onSelectEngineIdx={setSelectedEngineIdx}
          onOpenStudio={() => triggerExit("home")}
          onNavigateView={(view) => triggerExit(view)}
          onOpenCommandPalette={onOpenCommandPalette}
          onScrollToSection={scrollToSection}
          onScrollToTop={scrollToTop}
          onTrySampleInStudio={handleTrySampleAndEnter}
          onOpenGuide={onOpenGuide}
          isGuideOpen={isGuideOpen}
        />
      </div>
    </div>
  );
}
