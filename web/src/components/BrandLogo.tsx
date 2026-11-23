import { useId, type CSSProperties } from "react";

interface ToneBenchCubeSvgProps {
  className?: string;
  style?: CSSProperties;
}

export function ToneBenchCubeSvg({ className = "", style }: ToneBenchCubeSvgProps) {
  const uid = useId().replace(/:/g, "");
  const topFacetGradId = `tbTopFacet-${uid}`;

  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <defs>
        <linearGradient
          id={topFacetGradId}
          x1="15"
          y1="13.5"
          x2="33"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#F4F7FB" />
          <stop offset="100%" stopColor="#C9D7E2" />
        </linearGradient>
      </defs>

      {/* Outer calibration wireframe cube */}
      <polygon
        points="24,4 41,14 41,34 24,44 7,34 7,14"
        fill="none"
        stroke="rgba(201, 215, 226, 0.50)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <line
        x1="24"
        y1="4"
        x2="24"
        y2="13.5"
        stroke="rgba(127, 163, 194, 0.44)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="41"
        y1="34"
        x2="33"
        y2="29.3"
        stroke="rgba(127, 163, 194, 0.44)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="7"
        y1="34"
        x2="15"
        y2="29.3"
        stroke="rgba(127, 163, 194, 0.44)"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Inner solid 3D LUT cube in Steel Night x Arctic Ink tones */}
      <polygon
        points="24,13.5 33,18.7 24,24 15,18.7"
        fill={`url(#${topFacetGradId})`}
      />
      <polygon
        points="15,18.7 24,24 24,34.5 15,29.3"
        fill="#7FA3C2"
      />
      <polygon
        points="24,24 33,18.7 33,29.3 24,34.5"
        fill="#4A6B86"
      />

      {/* Inner ridge highlight */}
      <polyline
        points="15,18.7 24,24 33,18.7"
        fill="none"
        stroke="rgba(244, 247, 251, 0.68)"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="24"
        y1="24"
        x2="24"
        y2="34.5"
        stroke="rgba(244, 247, 251, 0.68)"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface BrandLogoProps {
  size?: number;
  className?: string;
}

export default function BrandLogo({ size = 32, className = "" }: BrandLogoProps) {
  const radius = Math.max(4, Math.round(size * 0.24));
  const iconPx = Math.round(size * 0.74);

  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 select-none border border-[#AAB7C5]/20 ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background:
          "linear-gradient(160deg, rgba(28, 36, 48, 0.92) 0%, rgba(17, 22, 31, 0.96) 52%, rgba(10, 12, 16, 1) 100%)",
        boxShadow:
          "inset 0 1px 0 rgba(244, 247, 251, 0.16), inset 0 -1px 0 rgba(170, 183, 197, 0.04), 0 6px 16px rgba(0, 0, 0, 0.45)",
      }}
    >
      <ToneBenchCubeSvg style={{ width: iconPx, height: iconPx }} />
    </div>
  );
}
