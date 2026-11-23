import React from "react";
import { ToneBenchCubeSvg } from "./BrandLogo";

export default function KeyflowLogo({ size = 32, className = "" }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`relative rounded-md bg-[#0A0C10] border border-[#AAB7C5]/20 flex items-center justify-center shrink-0 select-none ${className}`}
    >
      <ToneBenchCubeSvg className="w-[74%] h-[74%]" />
    </div>
  );
}

export function TfbagasWordmark({ compact = false, className = "" }) {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-xl bg-[#1C2430] border border-[#AAB7C5]/15 shrink-0 select-none ${
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
          fill="#F4F7FB"
          fontFamily="'Bricolage Grotesque', 'Instrument Sans', -apple-system, BlinkMacSystemFont, sans-serif"
          fontWeight="800"
          fontSize="33"
          letterSpacing="-0.03em"
        >
          tfbagas
        </text>
        <circle cx="144" cy="11" r="4.8" fill="#93B8D8" />
      </svg>
    </div>
  );
}

export const TfbagasMonogram = TfbagasWordmark;
