import React from "react";
import {
  Heart,
  Coffee,
  Globe,
  ExternalLink,
  Sparkles,
  Zap,
  Layers,
  CheckCircle2
} from "lucide-react";

export function YoutubeIcon({ size = 16, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export function InstagramIcon({ size = 16, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

export default function SupportTab() {
  return (
    <div className="flex flex-col gap-6 max-w-3xl w-full">
      {/* ------------------------------------------------------------- */}
      {/* CARD 1: DEVELOPER PROFILE (TFBAGAS)                          */}
      {/* ------------------------------------------------------------- */}
      <div className="liquid-glass rounded-2xl p-6 sm:p-7 flex flex-col gap-6 relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -top-16 -right-16 w-44 h-44 bg-[#00E987]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 relative z-10">
          {/* Avatar / Badge */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[#162920] to-[#0A140F] border-2 border-[#00E987]/50 flex items-center justify-center shrink-0 shadow-[0_0_24px_rgba(0,233,135,0.25)]">
            <span className="font-display font-bold text-2xl sm:text-3xl text-[#00E987] tracking-tight">
              TB
            </span>
          </div>

          <div className="flex flex-col gap-1.5 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-bold text-white font-display tracking-tight">
                TFBAGAS
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-[#00E987]/15 border border-[#00E987]/30 text-[#00E987] text-[11px] font-mono font-bold">
                @tfbagas
              </span>
            </div>

            <p className="text-xs sm:text-sm text-[#91A69A] leading-relaxed">
              Editor &amp; Tool Developer — After Effects &amp; Keyflow |{" "}
              <span className="text-[#E8F2ED] italic">Different vision, distinctive creation.</span>
            </p>
          </div>
        </div>

        {/* Social Media Link Buttons */}
        <div className="flex flex-col gap-2.5 pt-2 border-t border-[#20352B]/60">
          <span className="text-[11px] font-bold text-[#91A69A] uppercase tracking-wider">
            Connect &amp; Follow:
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* YouTube */}
            <a
              href="https://www.youtube.com/@tfbagas"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between px-4 py-3 rounded-xl bg-[#0E1914]/85 hover:bg-[#15251E] border border-[#20352B] hover:border-[#FF0000]/60 transition-all cursor-pointer shadow-sm"
            >
              <div className="flex items-center gap-2.5">
                <YoutubeIcon size={18} className="text-[#FF4D4D] group-hover:scale-110 transition-transform" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white group-hover:text-[#FF4D4D] transition-colors">
                    YouTube
                  </span>
                  <span className="text-[10px] text-[#91A69A] font-mono">@tfbagas</span>
                </div>
              </div>
              <ExternalLink size={13} className="text-[#91A69A] group-hover:text-white transition-colors" />
            </a>

            {/* Instagram */}
            <a
              href="https://www.instagram.com/tfbagas/"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between px-4 py-3 rounded-xl bg-[#0E1914]/85 hover:bg-[#15251E] border border-[#20352B] hover:border-[#E1306C]/60 transition-all cursor-pointer shadow-sm"
            >
              <div className="flex items-center gap-2.5">
                <InstagramIcon size={18} className="text-[#FF5B99] group-hover:scale-110 transition-transform" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white group-hover:text-[#FF5B99] transition-colors">
                    Instagram
                  </span>
                  <span className="text-[10px] text-[#91A69A] font-mono">@tfbagas</span>
                </div>
              </div>
              <ExternalLink size={13} className="text-[#91A69A] group-hover:text-white transition-colors" />
            </a>

            {/* Carrd / Portfolio */}
            <a
              href="https://tfbagas.carrd.co"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between px-4 py-3 rounded-xl bg-[#0E1914]/85 hover:bg-[#15251E] border border-[#20352B] hover:border-[#00E987]/60 transition-all cursor-pointer shadow-sm"
            >
              <div className="flex items-center gap-2.5">
                <Globe size={18} className="text-[#00E987] group-hover:scale-110 transition-transform" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white group-hover:text-[#00E987] transition-colors">
                    Portfolio
                  </span>
                  <span className="text-[10px] text-[#91A69A] font-mono">tfbagas.carrd.co</span>
                </div>
              </div>
              <ExternalLink size={13} className="text-[#91A69A] group-hover:text-white transition-colors" />
            </a>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* CARD 2: SUPPORT & DONATION (SOCIABUZZ)                        */}
      {/* ------------------------------------------------------------- */}
      <div className="liquid-glass rounded-2xl p-6 sm:p-7 flex flex-col gap-6 relative overflow-hidden border-[#00E987]/40 shadow-[0_8px_32px_rgba(0,233,135,0.08)]">
        {/* Glow backdrop */}
        <div className="absolute -bottom-16 -left-16 w-52 h-52 bg-[#00E987]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col gap-2 relative z-10">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#00E987]/15 border border-[#00E987]/30 text-[#00E987]">
              <Coffee size={18} />
            </span>
            <h3 className="text-lg sm:text-xl font-bold text-white font-display tracking-tight">
              Support Development
            </h3>
          </div>

          <p className="text-xs sm:text-sm text-[#E8F2ED]/90 leading-relaxed mt-1">
            This tool is <strong>100% free</strong> and runs directly in your browser with{" "}
            <strong>zero ads</strong>. If it helps speed up your editing workflow, consider supporting future updates (including .cube LUT &amp; After Effects export).
          </p>
        </div>

        {/* Feature & Roadmap highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
          <div className="p-3.5 rounded-xl bg-[#09120E]/80 border border-[#20352B] flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-[#00E987] shrink-0 mt-0.5" />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white">100% Free Forever</span>
              <span className="text-[11px] text-[#91A69A]">
                No paywalls, no limits, no locked presets.
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#09120E]/80 border border-[#20352B] flex items-start gap-2.5">
            <Sparkles size={16} className="text-[#00E987] shrink-0 mt-0.5" />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white">Upcoming Features</span>
              <span className="text-[11px] text-[#91A69A]">
                .cube 3D LUT export &amp; After Effects toolchain.
              </span>
            </div>
          </div>
        </div>

        {/* Big Prominent CTA */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 relative z-10">
          <a
            href="https://sociabuzz.com/tfbagas/support"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:flex-1 h-12 rounded-xl bg-[#00E987] hover:bg-[#16FFA0] text-[#080D0B] font-bold text-sm flex items-center justify-center gap-2.5 shadow-[0_0_24px_rgba(0,233,135,0.35)] hover:shadow-[0_0_32px_rgba(0,233,135,0.5)] transition-all cursor-pointer active:scale-[0.99]"
          >
            <Coffee size={18} className="fill-[#080D0B]" />
            <span>Support on SociaBuzz ☕</span>
            <ExternalLink size={15} />
          </a>
        </div>

        <span className="text-[11px] text-[#91A69A] text-center relative z-10">
          Supports QRIS, GoPay, OVO, DANA, ShopeePay, Bank Transfer, Credit Card, and PayPal.
        </span>
      </div>
    </div>
  );
}
