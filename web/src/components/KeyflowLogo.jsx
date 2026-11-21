import React from "react";

/**
 * Keyflow Achromatic Material 3 Vector Logo
 * Preserves the original Keyflow diamond/prism + orbital ring + satellite dot geometry,
 * adapted to the Material 3 Achromatic neutral dark palette (#1E1E24 container, #E2E4E9 & #9CA3AF vectors).
 */
export default function KeyflowLogo({ size = 32, className = "" }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`relative rounded-md bg-[#15171C] border border-white/[0.09] flex items-center justify-center shrink-0 select-none ${className}`}
    >
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-[76%] h-[76%]"
      >
        {/* Outer Orbital Ring (Tilted Ellipse) */}
        <ellipse
          cx="20"
          cy="20"
          rx="14.5"
          ry="6"
          transform="rotate(-28 20 20)"
          stroke="#9CA3AF"
          strokeOpacity="0.55"
          strokeWidth="1.6"
        />

        {/* Central Keyflow Diamond / Prism */}
        <path
          d="M20 6L28 20L20 34L12 20L20 6Z"
          fill="#E2E4E9"
        />
        {/* Subtle Right Facet Tonal Shade for 3D Prism Depth */}
        <path
          d="M20 6L28 20L20 34V6Z"
          fill="#9CA3AF"
          fillOpacity="0.35"
        />

        {/* Satellite Diamond Dot (Bottom-Right) */}
        <path
          d="M31 26.5L33 29.5L31 32.5L29 29.5L31 26.5Z"
          fill="#E2E4E9"
        />
      </svg>
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
