import React from "react";
import { ToneBenchCubeSvg } from "./BrandLogo";

/**
 * ToneBench Isometric 3D LUT Cube Logo
 * Uses the ToneBench 3D LUT Cube vector mark inside the obsidian squircle container.
 */
export default function KeyflowLogo({ size = 32, className = "" }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`relative rounded-md bg-[#08090c] border border-white/[0.12] flex items-center justify-center shrink-0 select-none ${className}`}
    >
      <ToneBenchCubeSvg className="w-[74%] h-[74%]" />
    </div>
  );
}

/**
 * TFBAGAS Geometric Wordmark Logo (`tfbagas•`)
 * Lowercase geometric sans-serif bold ("tfbagas", font-weight: 800, letter-spacing: -0.03em)
 * in silver-white (#E2E4E9) with a solid superscript circle at the top-right of the "s",
 * housed inside a Material 3 tonal container (#1E1E24, border-white/[0.08], rounded-xl).
 */
export function TfbagasWordmark({ compact = false, className = "" }) {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-xl bg-[#1E1E24] border border-white/[0.08] shrink-0 select-none ${
        compact ? "px-3 py-1.5" : "px-4 py-3"
      } ${className}`}
    >
      <svg
        viewBox="0 0 156 42"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={compact ? "h-5 w-auto" : "h-7 sm:h-8 w-auto"}
        role="img"
        aria-label="tfbagas logo"
      >
        <text
          x="2"
          y="31"
          fill="#E2E4E9"
          fontFamily="'Bricolage Grotesque', 'Instrument Sans', -apple-system, BlinkMacSystemFont, sans-serif"
          fontWeight="800"
          fontSize="33"
          letterSpacing="-0.03em"
        >
          tfbagas
        </text>
        {/* Solid Superscript Circle at Top-Right of 's' */}
        <circle cx="144" cy="11" r="4.8" fill="#E2E4E9" />
      </svg>
    </div>
  );
}

// Keep alias for compatibility
export const TfbagasMonogram = TfbagasWordmark;
