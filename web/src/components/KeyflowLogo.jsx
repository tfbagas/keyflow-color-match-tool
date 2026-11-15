import React from "react";

/**
 * Material 3 Achromatic Keyflow Logo
 * Preserves the signature Keyflow prism diamond + orbital ring + satellite diamond
 * rendered in neutral silver (#E2E4E9) and slate gray (#9CA3AF) inside a #1E1E24 tonal container.
 */
export function KeyflowLogo({ size = 28, className = "" }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-lg bg-[#1E1E24] border border-white/10 flex items-center justify-center shrink-0 select-none ${className}`}
    >
      <svg
        width={Math.round(size * 0.72)}
        height={Math.round(size * 0.72)}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Upper & main prism diamond */}
        <path
          d="M32 6L46 31L32 45.5L18 31L32 6Z"
          fill="#E2E4E9"
        />
        {/* Lower prism tip below orbital cut */}
        <path
          d="M25.5 44L32 58L37.5 46.5C33.5 46 29.3 45.2 25.5 44Z"
          fill="#9CA3AF"
        />
        {/* Sweeping orbital ring */}
        <path
          d="M17 29.5C9.5 30.2 6.2 33.2 8.2 36.8C11.2 42.2 26.5 46.8 45.5 46.2C31.5 45.2 18.2 41.2 14.5 36.2C12.5 33.5 13.8 31.2 17 29.5Z"
          fill="#9CA3AF"
        />
        {/* Satellite micro-diamond */}
        <path
          d="M52.5 41L56 46.5L52.5 52L49 46.5L52.5 41Z"
          fill="#E2E4E9"
        />
      </svg>
    </div>
  );
}

/**
 * Geometric Monogram Logo for TFBAGAS (Achromatic Neutral)
 */
export function TfbagasMonogram({ size = 56, className = "" }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-2xl bg-[#1E1E24] border border-white/10 flex items-center justify-center shrink-0 select-none ${className}`}
    >
      <svg
        width={Math.round(size * 0.58)}
        height={Math.round(size * 0.58)}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer geometric hexagon frame */}
        <path
          d="M24 3L43 13.5V34.5L24 45L5 34.5V13.5L24 3Z"
          stroke="#9CA3AF"
          strokeWidth="2"
          strokeOpacity="0.45"
        />
        {/* Geometric T + F / B interlocking prism bars */}
        <path
          d="M12 15H36V19.5H26.2V35H21.8V19.5H12V15Z"
          fill="#E2E4E9"
        />
        <path
          d="M28.5 23.5H35.5V27.5H28.5V23.5ZM28.5 30.5H34V35H28.5V30.5Z"
          fill="#9CA3AF"
        />
      </svg>
    </div>
  );
}

export default KeyflowLogo;
