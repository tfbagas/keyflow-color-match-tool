import React from "react";
import {
  Heart,
  ExternalLink,
  Globe,
  Sparkles,
  Code2,
} from "lucide-react";
import { TfbagasWordmark } from "./KeyflowLogo";

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
      label: "Portfolio & Presets",
      handle: "tfbagas.carrd.co",
      url: "https://tfbagas.carrd.co",
      icon: Globe,
    },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* 1. Developer Profile Card (TFBAGAS) */}
      <div className="m3-panel rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-5">
          {/* Custom Geometric Wordmark (tfbagas•) */}
          <TfbagasWordmark />

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold font-display text-[#E2E4E9] tracking-tight">
                TFBAGAS
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-[#1E1E24] text-[#9CA3AF] border border-white/[0.08]">
                @tfbagas
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#9CA3AF] leading-relaxed">
              Editor &amp; Tool Developer — After Effects &amp; Keyflow{" "}
              <span className="text-white/25">|</span>{" "}
              <span className="text-[#E2E4E9] font-medium">
                Different vision, distinctive creation.
              </span>
            </p>
          </div>
        </div>

        {/* Social Media Links */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-4 border-t border-white/[0.08]">
          {socialLinks.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.label}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-xl bg-[#1E1E24] border border-white/[0.08] hover:border-white/20 hover:bg-[#1E1E24]/80 transition-all group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 text-[#9CA3AF] group-hover:text-[#E2E4E9] transition-colors shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#E2E4E9] truncate">
                      {item.label}
                    </div>
                    <div className="text-[11px] font-mono text-[#9CA3AF] truncate">
                      {item.handle}
                    </div>
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-[#9CA3AF]/60 group-hover:text-[#E2E4E9] transition-colors shrink-0 ml-2" />
              </a>
            );
          })}
        </div>
      </div>

      {/* 2. Support / Donation Card (SociaBuzz) */}
      <div className="m3-panel rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-9 h-9 rounded-xl bg-[#1E1E24] border border-white/[0.08] flex items-center justify-center text-[#E2E4E9]">
            <Heart className="w-4 h-4 text-[#6EE7B7]" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold font-display text-[#E2E4E9]">
              Support Development
            </h3>
            <p className="text-[11px] font-mono text-[#9CA3AF]">
              100% Free &amp; Open Client-Side Web Tool
            </p>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-[#9CA3AF] leading-relaxed mb-5">
          This tool is 100% free with no ads or paywalls. If it helps your
          editing workflow or saves you time, consider supporting future updates
          and new tools!
        </p>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-white/[0.08]">
          <div className="flex items-center gap-2 text-xs text-[#9CA3AF]">
            <Sparkles className="w-4 h-4 text-[#9CA3AF] shrink-0" />
            <span>Every contribution fuels new presets &amp; Keyflow tools</span>
          </div>

          <a
            href="https://sociabuzz.com/tfbagas/tribe"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs bg-[#6EE7B7] hover:bg-[#86EFAC] active:scale-[0.99] text-[#042F1E] transition-all shrink-0"
          >
            <span>Support on SociaBuzz</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Footer Note */}
      <div className="flex items-center justify-center gap-2 text-xs text-[#9CA3AF]/60 py-1">
        <Code2 className="w-3.5 h-3.5" />
        <span>Crafted by TFBAGAS for the Keyflow community</span>
      </div>
    </div>
  );
}
