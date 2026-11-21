import React from "react";
import {
  Heart,
  ExternalLink,
  Globe,
  Sparkles,
  Code2,
  Layers,
  Film,
  Sliders,
  Rocket,
} from "lucide-react";
import { TfbagasWordmark } from "./KeyflowLogo";
import { useLanguage } from "../i18n/LanguageContext";

function YouTubeIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
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
      strokeWidth="1.8"
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

export default function SupportTab() {
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
      icon: Sliders,
      title: "Editable 3D LUTs (.cube / .lut)",
      desc: "Unlike standard editors that lock LUTs as static filters, ToneBench exposes editable curves, color wheels, and hue vectors before exporting 17³ / 33³ / 65³ files for DaVinci Resolve, Premiere Pro, Final Cut, and CapCut.",
    },
    {
      icon: Film,
      title: "After Effects Presets (.ffx)",
      desc: "Binary Lumetri Color presets formatted for direct drag-and-drop grading in After Effects.",
    },
    {
      icon: Layers,
      title: "Keyflow Mobile Shaders (.kfplug)",
      desc: "Self-contained GLSL ES 1.00 shader plugins compiled for zero-lag grading in Keyflow.",
    },
  ];

  const creatorStats = [
    { value: "15.6K+", label: "YouTube" },
    { value: "350+", label: "Presets & Plugins" },
    { value: "Keyflow & AE", label: "Creator Tools" },
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
    <div className="max-w-7xl mx-auto w-full space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-5 items-stretch">
        {/* Left Creator Profile Column (Top-Aligned & Height-Matched) */}
        <aside className="studio-card-enter studio-stagger-0 m3-panel bg-[#0B0C0F]/72 backdrop-blur-2xl border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_12px_32px_rgba(0,0,0,0.55)] p-5 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="space-y-3 border-b border-white/[0.07] pb-4">
              <TfbagasWordmark />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-[#F4F4F5] tracking-tight">
                    TFBAGAS
                  </h2>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-[#A1A1AA] border border-white/[0.08]">
                    @tfbagas
                  </span>
                </div>
                <p className="text-xs text-[#A1A1AA] mt-1 leading-relaxed">
                  {t("support.roleText")}
                </p>
                <p className="text-[11px] font-medium text-[#E4E4E7] mt-1">
                  {t("support.mottoText")}
                </p>
              </div>
            </div>

            {/* Compact Creator Ecosystem Stat Strip */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A1A1AA]">
                Creator Footprint
              </div>
              <div className="rounded-md bg-[#0B0C0F]/55 border border-white/[0.06] divide-y divide-white/[0.06] font-mono text-[11px]">
                {creatorStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="px-2.5 py-2 flex items-center justify-between gap-2"
                  >
                    <span className="text-[#A1A1AA]">{stat.label}</span>
                    <span className="text-[#F4F4F5] font-semibold">{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5 pt-3 border-t border-white/[0.07]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A1A1AA]">
              Creator Links
            </div>
            {socialLinks.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.url}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md bg-[#0B0C0F]/55 hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.14] transition-colors group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-3.5 h-3.5 text-[#A1A1AA] group-hover:text-[#F4F4F5] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-[#E4E4E7] truncate">
                        {item.label}
                      </div>
                      <div className="text-[10px] font-mono text-[#A1A1AA] truncate">
                        {item.handle}
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="w-3 h-3 text-[#A1A1AA] group-hover:text-[#F4F4F5] shrink-0" />
                </a>
              );
            })}
          </div>
        </aside>

        {/* Right Column: Top 2-Card Grid + Full-Width Development Roadmap */}
        <div className="space-y-4 flex flex-col">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch flex-1">
            {/* Card 1: Support Open Web Tools (SociaBuzz) */}
            <div className="studio-card-enter studio-stagger-1 m3-panel bg-[#0B0C0F]/72 backdrop-blur-2xl border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_12px_32px_rgba(0,0,0,0.55)] flex flex-col justify-between overflow-hidden">
              <div>
                <div className="px-5 py-3.5 border-b border-white/[0.07] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Heart className="w-3.5 h-3.5 text-[#34D399]" />
                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#F4F4F5]">
                      Support Open Web Tools
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-[#A1A1AA]">SociaBuzz</span>
                </div>

                <div className="p-5 space-y-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[#F4F4F5]">
                      {t("support.supportHeading")}
                    </h4>
                    <p className="text-[11px] font-mono text-[#A1A1AA] mt-0.5">
                      {t("support.supportSub")}
                    </p>
                  </div>
                  <p className="text-xs text-[#A1A1AA] leading-relaxed">
                    {t("support.supportDesc")}
                  </p>
                  <div className="p-3 rounded-md bg-[#0B0C0F]/55 border border-white/[0.06] flex items-start gap-2 text-[11px] text-[#D4D4D8]">
                    <Sparkles className="w-3.5 h-3.5 text-[#34D399] shrink-0 mt-0.5" />
                    <span>{t("support.supportNote")}</span>
                  </div>
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-white/[0.06] bg-[#0B0C0F]/55">
                <a
                  href="https://sociabuzz.com/tfbagas/support"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="m3-btn-primary-morph w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md font-semibold text-xs bg-[#34D399] hover:bg-[#2CC08A] text-[#051B14] transition-colors"
                >
                  <span>{t("support.supportBtn")}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Card 2: Creator Ecosystem & Preset Packs */}
            <div className="studio-card-enter studio-stagger-2 m3-panel bg-[#0B0C0F]/72 backdrop-blur-2xl border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_12px_32px_rgba(0,0,0,0.55)] flex flex-col justify-between overflow-hidden">
              <div>
                <div className="px-5 py-3.5 border-b border-white/[0.07] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#A1A1AA]" />
                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#F4F4F5]">
                      Creator Ecosystem &amp; Packs
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-[#A1A1AA]">Universal · .cube / .lut</span>
                </div>

                <div className="p-5 space-y-2.5">
                  {ecosystemItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.title}
                        className="p-2.5 rounded-md bg-[#0B0C0F]/55 border border-white/[0.06] flex items-start gap-2.5"
                      >
                        <div className="w-6 h-6 rounded bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0 mt-0.5">
                          <Icon className="w-3.5 h-3.5 text-[#E4E4E7]" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-[#F4F4F5] leading-snug">
                            {item.title}
                          </div>
                          <p className="text-[11px] text-[#A1A1AA] mt-0.5 leading-snug">
                            {item.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {/* Featured Partner Banner: SeeThrough Studio */}
                  <a
                    href="https://seethrough-studio.pages.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded-lg bg-emerald-500/[0.05] hover:bg-emerald-500/[0.10] border border-emerald-500/25 hover:border-emerald-400/40 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                          <Layers className="w-3.5 h-3.5 text-emerald-300" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-semibold text-[#F4F4F5] leading-snug">
                              SeeThrough Studio
                            </span>
                            <span className="text-[9px] font-mono font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              PARTNER TOOL
                            </span>
                          </div>
                          <p className="text-[11px] text-[#D4D4D8] mt-1 leading-relaxed">
                            Turn flat anime &amp; character PNGs into separated Hair, Eyes, Face &amp; Outfit layers, ready for instant .PSD rigging in Live2D Cubism or After Effects.
                          </p>
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-300/80 group-hover:text-emerald-200 shrink-0 mt-1 transition-colors" />
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                      <span className="px-2 py-0.5 rounded bg-[#0B0C0F]/80 border border-white/[0.08] text-zinc-300">
                        Flat PNG
                      </span>
                      <span className="text-emerald-400" aria-hidden="true">→</span>
                      <span className="px-2 py-0.5 rounded bg-[#0B0C0F]/80 border border-white/[0.08] text-zinc-300">
                        Auto-Split Parts
                      </span>
                      <span className="text-emerald-400" aria-hidden="true">→</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
                        Layered .PSD
                      </span>
                    </div>
                  </a>
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-white/[0.06] bg-[#0B0C0F]/55 flex items-center gap-2">
                <a
                  href="https://sociabuzz.com/tfbagas/shop"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium bg-white/[0.05] hover:bg-white/[0.09] text-[#F4F4F5] border border-white/[0.08] transition-colors"
                >
                  <Globe className="w-3.5 h-3.5 text-[#A1A1AA]" />
                  <span>Explore Tools &amp; Packs</span>
                  <ExternalLink className="w-3 h-3 text-[#A1A1AA]" />
                </a>
              </div>
            </div>
          </div>

          {/* Full-Width Development Roadmap & Upcoming Releases */}
          <div className="studio-card-enter studio-stagger-3 m3-panel bg-[#0B0C0F]/72 backdrop-blur-2xl border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_12px_32px_rgba(0,0,0,0.55)] overflow-hidden">
            <div className="px-5 py-3 border-b border-white/[0.07] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Rocket className="w-3.5 h-3.5 text-[#34D399]" />
                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#F4F4F5]">
                  Development Roadmap &amp; Upcoming Releases
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[#A1A1AA]">2026 Pipeline</span>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              {roadmapItems.map((item) => (
                <div
                  key={item.title}
                  className="rounded-md bg-[#0B0C0F]/55 border border-white/[0.06] p-3.5 space-y-1.5"
                >
                  <div
                    className={`text-[10px] font-mono ${
                      item.accent ? "text-[#34D399]" : "text-[#A1A1AA]"
                    }`}
                  >
                    {item.stage}
                  </div>
                  <div className="text-xs font-semibold text-[#F4F4F5] leading-snug">
                    {item.title}
                  </div>
                  <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-[#A1A1AA] pt-1">
        <Code2 className="w-3.5 h-3.5" />
        <span>{t("support.footerNote")}</span>
      </div>
    </div>
  );
}
