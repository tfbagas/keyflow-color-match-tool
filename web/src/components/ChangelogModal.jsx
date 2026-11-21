/* eslint-disable react-refresh/only-export-components */
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Sparkles,
  ShieldCheck,
  Cpu,
  Layers,
  Rocket,
  ChevronDown,
  History,
  Droplets,
} from "lucide-react";
import BrandLogo from "./BrandLogo";
import { useLanguage } from "../i18n/LanguageContext";
import { usePresence } from "../hooks/usePresence";

export const CHANGELOG_HISTORY = [
  {
    version: "v0.9.0 Beta",
    subtitle: "Engine v3 Punch Calibration, UI Hierarchy Overhaul, Monitoring Scopes & Touch UX",
    subtitleId: "Kalibrasi Punch Engine v3, Desain Ulang Hierarki UI, Monitoring Scopes & UX Sentuh",
    isLatest: true,
    icon: Sparkles,
    items: [
      "Calibrated Engine v3 (Cinema Hybrid Pro) default 100% punch by relaxing hue retention to 36%, expanding max hue rotation to 40 degrees, widening primary slider clamps, and tightening shadowMask to smoothstep(0.015, 0.16) so deep blacks stay anchored while midtones receive richer film split-toning.",
      "Overhauled workstation hierarchy with a dedicated top ENGINE & MATCH STRENGTH card, 3-column interactive engine cards, a Live Engine Info Strip with side-by-side comparison popover, collapsible TONE & CONTRAST / COLOR & SATURATION slider groups, and a sticky desktop preview column.",
      "Added WebGL preview-only Monitoring Scopes (Zebra/Clipping and False Color IRE), Touch Eyedropper (RGB/IRE), Fine (0.01) slider mode, Tap-to-Edit numeric readouts, and individual parameter/wheel reset buttons.",
      "Added in-memory Undo/Redo (up to 25 steps with Ctrl+Z / Ctrl+Shift+Z), upgraded A/B snapshots with Copy to B and auto-backup on engine switch, 1-frame video stepping (-1f/+1f) with Match Current Frame, engine-suffixed exports, and optional Web Share for .kfplug.",
    ],
    itemsId: [
      "Kalibrasi karakter warna Engine v3 (Cinema Hybrid Pro) agar area hitam pekat tetap bersih sambil memberikan split-toning film yang lebih kaya pada midtone.",
      "Desain ulang tata letak studio dengan kartu khusus ENGINE & KEKUATAN MATCH di bagian atas, 3 kartu engine interaktif, info bar dengan popover perbandingan langsung, serta grup slider TONE & KONTRAS / WARNA & SATURASI.",
      "Menambahkan overlay monitor WebGL (Zebra Clipping dan False Color IRE), Touch Eyedropper (RGB/IRE), mode slider presisi (0.01), input angka ketuk-langsung, dan tombol reset per parameter.",
      "Menambahkan riwayat Undo/Redo hingga 25 langkah (Ctrl+Z / Ctrl+Shift+Z), slot snapshot A/B dengan tombol Salin ke B, navigasi video 1-frame (-1f/+1f) dengan Match Frame Ini, serta fitur bagikan file .kfplug.",
    ],
  },
  {
    version: "v0.8.1 Beta",
    subtitle: "Mobile 60fps Video & Pro Scopes Performance Hotfix",
    subtitleId: "Optimasi Performa Video 60fps di HP & Pro Scopes",
    isLatest: false,
    icon: Sparkles,
    items: [
      "Optimized Pro Scopes (Luma/RGB, RGB Parade, Vectorscope) by locking 2D canvas backing to 1x DPR, deferring calculations during slider drags, downsampling to 96x54 integer math, throttling video scope updates to 6fps, and adding a collapsible toggle.",
      "Streamlined WebGL video playback using requestVideoFrameCallback with single-allocation texSubImage2D uploads and zero-rerender DOM transport scrubber updates.",
      "Rebuilt Side by Side comparison into a single-pass WebGL shader view using a single media source, eliminating dual-video sync lag on mobile browsers.",
      "Capped mobile live preview canvas pixel ratio and buffer dimensions with coalesced requestAnimationFrame slider updates while keeping full native resolution for Save Image exports.",
    ],
    itemsId: [
      "Mengoptimalkan Pro Scopes (Luma/RGB, RGB Parade, Vectorscope) dengan mengunci canvas 2D ke 1x DPR, menunda kalkulasi saat slider digeser, serta membatasi pembaruan scope video ke 6fps.",
      "Memperhalus pemutaran video WebGL menggunakan requestVideoFrameCallback dan update timeline tanpa membebani render React.",
      "Membangun ulang mode Side by Side dalam satu pass shader WebGL sehingga bebas lag di browser HP.",
      "Mengoptimalkan resolusi simulasi live preview di HP agar tetap 60fps sambil mempertahankan resolusi asli penuh saat menyimpan gambar.",
    ],
  },
  {
    version: "v0.8.0 Beta",
    subtitle: "Color Match Engine v2, RAW & Video Support, Mobile Sticky Preview, Pro Scopes & Multi-Format Export",
    subtitleId: "Color Match Engine v2, Dukungan RAW & Video, Preview Semat di HP, Pro Scopes & Ekspor Multi-Format",
    isLatest: false,
    icon: Sparkles,
    items: [
      "Rebuilt the color matching engine with dynamic range spread detection for flat and Log-like references, OKLab residual split-toning, soft highlight roll-off, and strict Keyflow-safe GLSL clamping.",
      "Added client-side support for Camera RAW (DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2), extended raster formats, and real-time 60fps WebGL video target previews (MP4, WEBM, MOV, M4V, MKV).",
      "Added full-resolution graded image and video frame export (PNG, JPG, WEBP) with quality control and Before/After split export, alongside two-way 3D LUT .cube and .lut I/O and .kfplug re-importing.",
      "Redesigned mobile viewports with a sticky top preview and compact dual-column media slots, paired with desktop 100vh fit, circular 3-Way Color Wheels, RGB Parade and Vectorscope scopes, Master Match Strength (0% to 150%), A/B snapshot slots, live RGB/IRE pixel readout, and a preview-only Simulate Log Input toggle.",
    ],
    itemsId: [
      "Membangun ulang engine color matching dengan deteksi rentang dinamis untuk referensi flat/Log, split-toning OKLab, dan highlight roll-off halus.",
      "Menambahkan dukungan file Camera RAW (DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2) serta pratinjau video target WebGL 60fps (MP4, WEBM, MOV, M4V, MKV).",
      "Menambahkan fitur simpan gambar hasil grade resolusi penuh (PNG, JPG, WEBP) serta impor/ekspor dua arah 3D LUT (.cube, .lut) dan .kfplug.",
      "Mendesain ulang tampilan HP dengan preview tersemat di atas, 3-Way Color Wheels melingkar, RGB Parade, Vectorscope, Match Strength (0% hingga 150%), dan slot A/B.",
    ],
  },
  {
    version: "v0.6.5 Beta",
    subtitle: "Performance Fix & Minimalist Intro",
    subtitleId: "Perbaikan Performa & Intro Minimalis",
    isLatest: false,
    icon: Cpu,
    items: [
      "Removed heavy full-screen SVG filters, animated blur passes, and nested backdrop blurs to restore smooth 60fps rendering across mid-range laptops and mobile devices.",
      "Redesigned the entrance screen into a lightweight, full-bleed minimalist studio header with faster spring transitions.",
    ],
    itemsId: [
      "Menghapus filter SVG berat dan blur berlapis agar performa tetap mulus 60fps di laptop menengah dan HP.",
      "Mendesain ulang layar pembuka menjadi tampilan studio minimalis yang ringan dan responsif.",
    ],
  },
  {
    version: "v0.6.4 Beta",
    subtitle: "Bouncy Spring & Liquid Morph Motion",
    subtitleId: "Animasi Pegas & Transisi Liquid Morph",
    isLatest: false,
    icon: Sparkles,
    items: [
      "Added an interactive cursor-reactive monochrome liquid glass entrance intro with bouncy capsule morphing and a Replay Intro trigger in About.",
      "Upgraded navigation pills, preview switchers, collapsible panels, buttons, and view transitions with hybrid Material You bouncy spring and liquid morph physics.",
    ],
    itemsId: [
      "Menambahkan animasi pembuka monochrome liquid glass interaktif beserta tombol Putar Ulang Intro di menu Tentang.",
      "Memperbarui navigasi pill, pemilih mode preview, dan panel lipat dengan animasi pegas yang halus.",
    ],
  },
  {
    version: "v0.6.3 Beta",
    subtitle: "Monochrome Liquid Glass & Analysis Recovery",
    subtitleId: "Monochrome Liquid Glass & Pemulihan Hasil Analisis",
    isLatest: false,
    icon: Droplets,
    items: [
      "Added an achromatic black-and-white animated liquid glass background with translucent frosted workstation panels (zero color-cast).",
      "Added the Reload Analysis button next to Reset All to instantly restore reference-matched parameters after resetting or manual tweaks.",
    ],
    itemsId: [
      "Menambahkan latar liquid glass monokrom netral agar penilaian warna grading tetap akurat tanpa bias warna.",
      "Menambahkan tombol Muat Ulang di sebelah Reset untuk mengembalikan parameter hasil analisis referensi secara instan.",
    ],
  },
  {
    version: "v0.6.2 Beta",
    subtitle: "Security & Integrity Hardening",
    subtitleId: "Penguatan Keamanan & Integritas File",
    isLatest: false,
    icon: ShieldCheck,
    items: [
      "Added Cloudflare HTTP security headers (CSP, X-Frame-Options, nosniff, Permissions-Policy) to protect against XSS and clickjacking.",
      "Enforced strict image MIME validation on upload/paste and sanitized preset metadata prior to .kfplug packaging.",
      "Hardened production build (sourcemap: false) and added runtime integrity protection for core Rec. 709 and .kfplug modules.",
    ],
    itemsId: [
      "Menambahkan header keamanan HTTP (CSP, X-Frame-Options, nosniff) untuk perlindungan ekstra di browser.",
      "Memperketat validasi format gambar saat pilih/tempel file serta membersihkan metadata sebelum membungkus .kfplug.",
      "Mengamankan build produksi dan menjaga integritas modul inti Rec. 709 serta .kfplug.",
    ],
  },
  {
    version: "v0.6.1 Beta",
    subtitle: "Calibration, Custom Controls & Brand Identity",
    subtitleId: "Kalibrasi, Kontrol Kustom & Identitas Brand",
    isLatest: false,
    icon: Cpu,
    items: [
      "Added Engine & Export Calibration in Settings (synthetic Canvas/Web Worker self-test with cache flush and .kfplug output multipliers).",
      "Replaced OS-native <select> dropdowns with custom Material 3 achromatic dropdown menus.",
      "Aligned VISUAL PREVIEW height flush with EXPORT PLUGIN, removed duplicate sample buttons, and added focus/hover-aware Ctrl+V clipboard routing.",
      "Updated browser favicons/PWA icons to achromatic dark and introduced the tfbagas geometric wordmark.",
    ],
    itemsId: [
      "Menambahkan Kalibrasi Engine & Ekspor di menu Pengaturan beserta pengali output .kfplug.",
      "Mengganti dropdown bawaan OS dengan menu dropdown kustom bernuansa gelap netral.",
      "Menyelaraskan tinggi panel pratinjau dan mendukung tempel gambar langsung (Ctrl+V) sesuai slot yang dipilih.",
      "Memperbarui ikon aplikasi dan memperkenalkan wordmark geometris tfbagas.",
    ],
  },
  {
    version: "v0.6.0 Beta",
    subtitle: "Material 3 Achromatic UI Overhaul",
    subtitleId: "Desain Ulang Antarmuka Gelap Akromatik",
    isLatest: false,
    icon: Layers,
    items: [
      "Redesigned the interface into a color-accurate Material 3 Achromatic Dark workstation (#0E0E11-#1E1E24) with a 48px Top App Bar and segmented navigation.",
      "Added bipolar center-zero sliders with functional Temp/Tint micro-chroma tracks, real-time RGB/Luma histogram, collapsible panels, Hold Before (\\) preview comparison, and fixed graded canvas rendering across all preview modes.",
      "Upgraded typography (Bricolage Grotesque, Instrument Sans, IBM Plex Mono) and added the Developer & Support hub.",
    ],
    itemsId: [
      "Mendesain ulang antarmuka menjadi studio gelap akromatik (#0E0E11-#1E1E24) agar mata tetap akurat menilai warna.",
      "Menambahkan slider bipolar titik-tengah, indikator warna Temp/Tint, histogram RGB/Luma real-time, dan tombol Tahan Before (\\).",
      "Memperbarui tipografi studio dan menambahkan halaman Profil Developer & Dukungan.",
    ],
  },
  {
    version: "v0.5.0 Beta",
    subtitle: "Initial Web Release",
    subtitleId: "Rilis Web Perdana",
    isLatest: false,
    icon: Rocket,
    items: [
      "Launched the 100% client-side browser edition with Rec. 709 reference color matching, multithreaded Web Worker pixel analysis, real-time Before/After preview, 3-Way Color Wheels swatches, and direct .kfplug plugin export.",
    ],
    itemsId: [
      "Meluncurkan edisi web 100% di browser dengan pencocokan warna referensi Rec. 709, analisis piksel Web Worker, pratinjau Before/After real-time, 3-Way Color Wheels, dan ekspor langsung ke plugin .kfplug.",
    ],
  },
];

export function ReleaseHistoryAccordion() {
  const { lang, t } = useLanguage();
  const [expandedMap, setExpandedMap] = useState({
    "v0.9.0 Beta": true,
  });

  const toggleVersion = (ver) => {
    setExpandedMap((prev) => ({
      ...prev,
      [ver]: !prev[ver],
    }));
  };

  return (
    <div className="space-y-2.5">
      {CHANGELOG_HISTORY.map((release) => {
        const Icon = release.icon;
        const isExpanded = Boolean(expandedMap[release.version]);
        const subtitle =
          lang === "id" && release.subtitleId ? release.subtitleId : release.subtitle;
        const items =
          lang === "id" && release.itemsId ? release.itemsId : release.items;

        return (
          <div
            key={release.version}
            className={`rounded-xl border transition-colors ${
              release.isLatest
                ? "bg-[#0B0C0F] border-white/[0.08]"
                : "bg-[#0B0C0F] border-white/[0.06] hover:border-white/[0.12]"
            }`}
          >
            <button
              type="button"
              onClick={() => toggleVersion(release.version)}
              aria-expanded={isExpanded}
              className="w-full flex items-center justify-between gap-3 p-3.5 text-left cursor-pointer select-none"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.07] flex items-center justify-center text-[#E2E4E9] shrink-0">
                  <Icon
                    className={`w-4 h-4 ${
                      release.isLatest ? "text-[#6EE7B7]" : "text-[#9CA3AF]"
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold font-mono text-[#E2E4E9]">
                      {release.version}
                    </span>
                    {release.isLatest && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/40 text-[#6EE7B7] border border-[#6EE7B7]/30">
                        <Sparkles className="w-2.5 h-2.5" />
                        {t("changelogModal.latest")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#9CA3AF] truncate mt-0.5">
                    {subtitle}
                  </div>
                </div>
              </div>

              <ChevronDown
                className={`studio-chevron w-4 h-4 text-[#9CA3AF] shrink-0 ${
                  isExpanded ? "rotate-180 text-[#E2E4E9]" : "rotate-0"
                }`}
              />
            </button>

            <div
              className="m3-collapse-grid"
              data-expanded={isExpanded}
            >
              <div className="m3-collapse-inner">
                <div className="px-3.5 pb-3.5 pt-1 border-t border-white/[0.06]">
                  <ul className="space-y-2 text-xs text-[#9CA3AF] leading-relaxed pt-2">
                    {items.map((point, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF]/60 mt-1.5 shrink-0" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ChangelogModal({ open, onClose, onViewFullHistory }) {
  const { t, dict } = useLanguage();
  const { isMounted, state: presenceState } = usePresence(open, 160);
  const v095Items = dict?.about?.v095Items || [];

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!isMounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-state={presenceState}
      onClick={onClose}
      className="studio-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
    >
      <div
        data-state={presenceState}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-modal-title"
        className="studio-modal m3-panel w-full max-w-2xl max-h-[85dvh] flex flex-col rounded-2xl p-5 sm:p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_64px_rgba(0,0,0,0.85)] bg-[#101216]/96 backdrop-blur-2xl"
      >
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-3">
            <BrandLogo size={38} />
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="changelog-modal-title"
                  className="text-base sm:text-lg font-bold font-display text-[#E2E4E9]"
                >
                  {t("changelogModal.whatsNewIn", { version: "v0.9.6a" })}
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#1E1E24] text-[#6EE7B7] border border-white/10">
                  <Sparkles className="w-2.5 h-2.5" />
                  {t("changelogModal.latest")}
                </span>
              </div>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                {t("about.preReleasePolish")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#E2E4E9] hover:bg-[#1E1E24] transition-colors cursor-pointer"
            aria-label={t("changelogModal.closeAria")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="my-4 space-y-2.5 flex-1 overflow-y-auto pr-1">
          {v095Items.map((point, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 rounded-xl bg-[#1E1E24] border border-white/[0.08]"
            >
              <div className="w-6 h-6 rounded-lg bg-[#151519] border border-white/[0.08] flex items-center justify-center text-[#E2E4E9] shrink-0 mt-0.5">
                <Droplets className="w-3.5 h-3.5 text-[#6EE7B7]" />
              </div>
              <p className="text-xs text-[#E2E4E9]/90 leading-relaxed">
                <span className="font-semibold text-[#F4F5F7]">{point.bold}</span>{" "}
                {point.text}
              </p>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3 shrink-0">
          {onViewFullHistory ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onViewFullHistory();
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#9CA3AF] hover:text-[#E2E4E9] transition-colors cursor-pointer"
            >
              <History className="w-3.5 h-3.5" />
              <span>{t("changelogModal.viewFullHistory")}</span>
            </button>
          ) : (
            <span className="text-[11px] font-mono text-[#9CA3AF]">
              {t("changelogModal.buildNote")}
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="m3-btn-morph px-4 py-2 rounded-xl text-xs font-semibold bg-[#E2E4E9] hover:bg-white text-[#0E0E11] cursor-pointer ml-auto"
          >
            {t("changelogModal.gotIt")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
