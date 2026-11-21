import { useId } from "react";

interface BrandLogoProps {
  size?: number;
  className?: string;
}

export default function BrandLogo({ size = 32, className = "" }: BrandLogoProps) {
  const uid = useId().replace(/:/g, "");
  const edgeGradId = `kfOpticalEdge-${uid}`;
  const facetGradId = `kfOpticalFacet-${uid}`;

  const radius = Math.max(4, Math.round(size * 0.24));

  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 select-none border border-white/[0.14] ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background:
          "linear-gradient(160deg, rgba(255, 255, 255, 0.085) 0%, rgba(16, 18, 24, 0.88) 46%, rgba(8, 9, 12, 0.96) 100%)",
        boxShadow:
          "inset 0 1px 0 rgba(255, 255, 255, 0.22), inset 0 -1px 0 rgba(255, 255, 255, 0.03), 0 6px 16px rgba(0, 0, 0, 0.45)",
      }}
    >
      <svg
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
        style={{ width: Math.round(size * 0.58), height: Math.round(size * 0.58) }}
      >
        <defs>
          <linearGradient
            id={edgeGradId}
            x1="10"
            y1="6"
            x2="38"
            y2="40"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.96" />
            <stop offset="56%" stopColor="#D4D8E2" stopOpacity="0.72" />
            <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0.82" />
          </linearGradient>
          <linearGradient
            id={facetGradId}
            x1="24"
            y1="7"
            x2="37"
            y2="38"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon
          points="24,6.5 40.5,37.5 7.5,37.5"
          fill={`url(#${facetGradId})`}
          stroke={`url(#${edgeGradId})`}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <line
          x1="24"
          y1="6.5"
          x2="24"
          y2="37.5"
          stroke="rgba(255, 255, 255, 0.36)"
          strokeWidth="1.1"
        />
        <path
          d="M14.5 25L24 21L34.5 26.2"
          stroke="rgba(110, 231, 183, 0.78)"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
