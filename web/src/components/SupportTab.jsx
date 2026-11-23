import React from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Globe,
  Code2,
} from "lucide-react";
import { TfbagasWordmark } from "./KeyflowLogo";
import { useLanguage } from "../i18n/LanguageContext";

function YouTubeIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="2" y="4" width="20" height="16" rx="4" />
      <polygon points="10 9 15 12 10 15 10 9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function InstagramIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function SupportTab({
  onReturnToWorkspace,
  activeEngineName = "Altair 4.5 Refresh",
  isWebglActive = true,
}) {
  const { t } = useLanguage();

  const socialLinks = [
    {
      label: "YouTube",
      handle: "@tfbagas",
      url: "https://www.youtube.com/@tfbagas",
      icon: YouTubeIcon,
    },
    {
      label: "Instagram",
      handle: "@tfbagas",
      url: "https://www.instagram.com/tfbagas/",
      icon: InstagramIcon,
    },
    {
      label: t("support.portfolioLabel"),
      handle: "tfbagas.carrd.co",
      url: "https://tfbagas.carrd.co",
      icon: Globe,
    },
  ];

  const ecosystemItems = [
    {
      idx: "01",
      ext: ".cube / .lut",
      title: "Editable 3D LUTs",
      desc: "Unlike standard editors that lock LUTs as static filters, ToneBench exposes editable curves, color wheels, and hue vectors before exporting 17³ / 33³ / 65³ files for DaVinci Resolve, Premiere Pro, Final Cut, and CapCut.",
    },
    {
      idx: "02",
      ext: ".ffx",
      title: "After Effects Presets",
      desc: "Binary Lumetri Color presets formatted for direct drag-and-drop grading in Adobe After Effects.",
    },
    {
      idx: "03",
      ext: ".kfplug",
      title: "Keyflow Mobile Shaders",
      desc: "Self-contained GLSL ES 1.00 shader plugins compiled for zero-lag grading in Keyflow Mobile.",
    },
  ];

  const roadmapItems = [
    {
      stage: "NEXT · NATIVE AE",
      accent: true,
      title: "After Effects C++ SmartFX Plugin v1.0",
      desc: "Native 32-bit float GPU/CPU SmartFX plugin for Adobe After Effects with direct Keyflow preset parity.",
    },
    {
      stage: "R&D · HDR COLOR",
      accent: false,
      title: "32-Bit HDR Scene-Linear Pipeline",
      desc: "Extended dynamic range ACEScg / Rec.2020 grading pipeline with highlight-preserving filmic roll-off.",
    },
    {
      stage: "R&D · VIDEO",
      accent: false,
      title: "Temporal Multi-Frame Flicker Stabilization",
      desc: "Optical-flow aware inter-frame grade smoothing to eliminate exposure breathing across long clips.",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8 items-start">
      {/* Left Column: Aligned Studio Summary Card (Zero Jump-to-Section clutter) */}
      <aside className="lg:sticky lg:top-8 bg-[#11161F]/92 border border-[#AAB7C5]/14 rounded-xl p-5 flex flex-col gap-5">
        <div className="pb-4 border-b border-[#AAB7C5]/14 space-y-1.5">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-[#7FA3C2]">
            TONEBENCH PROJECT
          </div>
          <h1 className="font-display text-xl font-semibold text-[#F4F7FB] tracking-tight text-balance">
            {t("nav.support")}
          </h1>
          <p className="font-sans text-xs text-[#AAB7C5] leading-relaxed">
            {t("support.railSub")}
          </p>
        </div>

        <div className="space-y-3">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#AAB7C5]">
            {t("settings.engineStatusLabel")}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className={`w-2 h-2 rounded-full shrink-0 ${
                isWebglActive ? "bg-[#93B8D8]" : "bg-amber-400"
              }`}
            />
            <span className="font-sans font-medium text-[#F4F7FB] truncate">
              {activeEngineName} · {isWebglActive ? "WebGL GPU" : "CPU 2D"}
            </span>
          </div>

          <dl className="pt-2 border-t border-[#AAB7C5]/12 space-y-2 font-mono text-[11px] tabular-nums">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[#AAB7C5]">Creator</dt>
              <dd className="text-[#F4F7FB]">@tfbagas</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[#AAB7C5]">Build</dt>
              <dd className="text-[#C9D7E2]">v1.0.0</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[#AAB7C5]">Model</dt>
              <dd className="text-[#93B8D8]">100% Client-Side</dd>
            </div>
          </dl>
        </div>

        {onReturnToWorkspace && (
          <div className="pt-4 border-t border-[#AAB7C5]/14">
            <button
              type="button"
              onClick={onReturnToWorkspace}
              className="w-full min-h-[42px] inline-flex items-center justify-between gap-2 px-4 py-2 rounded-lg bg-[#F4F7FB] hover:bg-[#FBFDFF] font-sans text-xs font-semibold text-[#0A0C10] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93B8D8]"
            >
              <span>{t("settings.returnToWorkspace")}</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#0A0C10] shrink-0" strokeWidth={1.75} />
            </button>
          </div>
        )}
      </aside>

      {/* Right Column: Aligned Studio Console Cards */}
      <div className="space-y-5 min-w-0">
        {/* Card 01: Creator Identity, Mission & Channels */}
        <section
          id="support-mission"
          className="rounded-xl border border-[#AAB7C5]/14 bg-[#11161F]/92 p-5 space-y-5"
        >
          <div className="pb-4 border-b border-[#AAB7C5]/14 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-3">
                <TfbagasWordmark />
                <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-[#0A0C10] text-[#C9D7E2] border border-[#AAB7C5]/16">
                  @tfbagas
                </span>
              </div>
              <p className="font-sans text-xs sm:text-[13px] text-[#C9D7E2]">
                <span>{t("support.roleText")}</span>
                <span className="mx-2 text-[#AAB7C5]/50" aria-hidden="true">
                  ·
                </span>
                <span className="text-[#AAB7C5]">{t("support.mottoText")}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <a
                href="https://sociabuzz.com/tfbagas/support"
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-sans font-semibold text-xs bg-[#F4F7FB] hover:bg-[#FBFDFF] text-[#0A0C10] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93B8D8]"
              >
                <span>{t("support.supportBtn")}</span>
                <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </a>

              <a
                href="https://sociabuzz.com/tfbagas/shop"
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg font-sans text-xs font-medium bg-[#0A0C10]/65 hover:bg-[#1C2430] text-[#F4F7FB] border border-[#AAB7C5]/18 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
              >
                <span>{t("showcase.toolsAndPacks")}</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#93B8D8]" strokeWidth={1.5} />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            <div className="md:col-span-7 space-y-2">
              <div className="inline-flex items-center gap-2.5">
                <span className="font-mono text-xs font-semibold text-[#7FA3C2] tabular-nums">
                  01
                </span>
                <h2 className="font-display text-[15px] font-semibold text-[#F4F7FB] tracking-tight">
                  {t("support.supportHeading")}
                </h2>
              </div>
              <p className="font-sans text-xs text-[#AAB7C5]">
                {t("support.supportSub")}
              </p>
              <p className="font-sans text-xs sm:text-[13px] text-[#C9D7E2] leading-relaxed pt-1">
                {t("support.supportDesc")}
              </p>
              <div className="pt-2 flex items-center gap-2 font-sans text-xs text-[#93B8D8]">
                <Code2 className="w-3.5 h-3.5 text-[#7FA3C2] shrink-0" strokeWidth={1.5} />
                <span>{t("support.supportNote")}</span>
              </div>
            </div>

            <div className="md:col-span-5 md:border-l md:border-[#AAB7C5]/14 md:pl-6 space-y-2.5">
              <h3 className="font-sans text-xs font-semibold text-[#F4F7FB]">
                Creator Channels
              </h3>
              <div className="divide-y divide-[#AAB7C5]/12 border-y border-[#AAB7C5]/12">
                {socialLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.url}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[42px] py-2.5 flex items-center justify-between gap-3 hover:text-[#F4F7FB] transition-colors group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className="w-4 h-4 text-[#AAB7C5] group-hover:text-[#93B8D8] shrink-0 transition-colors" />
                        <span className="font-sans text-xs font-medium text-[#C9D7E2] group-hover:text-[#F4F7FB] truncate">
                          {item.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-xs text-[#AAB7C5]">
                          {item.handle}
                        </span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-[#7FA3C2] group-hover:text-[#F4F7FB]" strokeWidth={1.5} />
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Card 02: Universal Export Ecosystem */}
        <section
          id="support-ecosystem"
          className="rounded-xl border border-[#AAB7C5]/14 bg-[#11161F]/92 p-5 space-y-4"
        >
          <div className="pb-3.5 border-b border-[#AAB7C5]/14 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2.5">
              <span className="font-mono text-xs font-semibold text-[#7FA3C2] tabular-nums">
                02
              </span>
              <h2 className="font-display text-[15px] font-semibold text-[#F4F7FB] tracking-tight">
                Creator Ecosystem &amp; Universal Formats
              </h2>
            </div>
            <span className="font-mono text-xs text-[#C9D7E2]">
              .cube · .lut · .ffx · .kfplug
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-0 md:divide-x md:divide-[#AAB7C5]/14">
            {ecosystemItems.map((item, idx) => (
              <div
                key={item.title}
                className={`${
                  idx === 0
                    ? "md:pr-6"
                    : idx === 1
                    ? "md:px-6"
                    : "md:pl-6"
                } space-y-1.5`}
              >
                <div className="flex items-center justify-between gap-2 font-mono text-xs tabular-nums">
                  <span className="text-[#7FA3C2]">{item.idx}</span>
                  <span className="text-[#C9D7E2]">{item.ext}</span>
                </div>
                <h3 className="font-sans text-xs font-semibold text-[#F4F7FB]">
                  {item.title}
                </h3>
                <p className="font-sans text-xs text-[#AAB7C5] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Card 03: Partner Studio Tool (SeeThrough Studio) */}
        <section
          id="support-partner"
          className="rounded-xl border border-[#AAB7C5]/14 bg-[#11161F]/92 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-xs font-semibold text-[#7FA3C2] tabular-nums">
                03
              </span>
              <h2 className="font-display text-[15px] font-semibold text-[#F4F7FB] tracking-tight">
                SeeThrough Studio
              </h2>
              <span className="font-sans text-[11px] font-medium px-2 py-0.5 rounded-md bg-[#4A6B86]/25 text-[#C9D7E2] border border-[#7FA3C2]/35">
                Partner Tool
              </span>
            </div>
            <p className="font-sans text-xs text-[#C9D7E2] leading-relaxed">
              Turn flat anime and character PNGs into separated Hair, Eyes, Face, and Outfit layers for instant{" "}
              <span className="font-mono text-[#F4F7FB]">.PSD</span> rigging in Live2D Cubism or After Effects.
            </p>
          </div>

          <a
            href="https://seethrough-studio.pages.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] self-start sm:self-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#0A0C10]/65 hover:bg-[#1C2430] border border-[#AAB7C5]/18 font-sans text-xs font-medium text-[#F4F7FB] transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA3C2]"
          >
            <span>Open SeeThrough Studio</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-[#93B8D8]" strokeWidth={1.5} />
          </a>
        </section>

        {/* Card 04: 2026 Development Roadmap */}
        <section
          id="support-roadmap"
          className="rounded-xl border border-[#AAB7C5]/14 bg-[#11161F]/92 p-5 space-y-4"
        >
          <div className="pb-3.5 border-b border-[#AAB7C5]/14 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2.5">
              <span className="font-mono text-xs font-semibold text-[#7FA3C2] tabular-nums">
                04
              </span>
              <h2 className="font-display text-[15px] font-semibold text-[#F4F7FB] tracking-tight">
                Development Roadmap
              </h2>
            </div>
            <span className="font-mono text-xs text-[#C9D7E2] tabular-nums">
              2026 Pipeline
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-0 md:divide-x md:divide-[#AAB7C5]/14">
            {roadmapItems.map((item, idx) => (
              <div
                key={item.title}
                className={`${
                  idx === 0
                    ? "md:pr-6"
                    : idx === 1
                    ? "md:px-6"
                    : "md:pl-6"
                } space-y-1.5`}
              >
                <div
                  className={`font-mono text-xs ${
                    item.accent ? "text-[#93B8D8]" : "text-[#C9D7E2]"
                  }`}
                >
                  {item.stage}
                </div>
                <h3 className="font-sans text-xs font-semibold text-[#F4F7FB] leading-snug">
                  {item.title}
                </h3>
                <p className="font-sans text-xs text-[#AAB7C5] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-[#AAB7C5]/14 flex flex-wrap items-center justify-between gap-4 font-sans text-xs text-[#AAB7C5]">
            <div className="inline-flex items-center gap-2">
              <Code2 className="w-3.5 h-3.5 text-[#7FA3C2]" strokeWidth={1.5} />
              <span>{t("support.footerNote")}</span>
            </div>
            <span className="font-mono text-xs text-[#C9D7E2] tabular-nums">v1.0.0</span>
          </div>
        </section>
      </div>
    </div>
  );
}
