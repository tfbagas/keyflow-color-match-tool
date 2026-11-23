import React, { memo, useState } from "react";
import { RotateCcw, ShieldCheck } from "lucide-react";
import ParameterSlider from "./ParameterSlider";
import { usePillIndicator } from "../hooks/usePillIndicator";

const HUE_SECTORS = [
  { idx: 0, name: "Red", color: "#E5484D" },
  { idx: 1, name: "Yellow", color: "#E5A93B" },
  { idx: 2, name: "Green", color: "#46A758" },
  { idx: 3, name: "Cyan", color: "#36A4B8" },
  { idx: 4, name: "Blue", color: "#3E63DD" },
  { idx: 5, name: "Magenta", color: "#AB4ABA" },
];

const CHANNELS = [
  { id: "hueShift", label: "Hue", min: -0.5, max: 0.5, step: 0.01 },
  { id: "hueSat", label: "Saturation", min: -0.8, max: 0.8, step: 0.01 },
  { id: "hueLuma", label: "Luminance", min: -0.5, max: 0.5, step: 0.01 },
];

const Hue6VPanel = memo(function Hue6VPanel({
  hueShift = [0, 0, 0, 0, 0, 0],
  hueSat = [0, 0, 0, 0, 0, 0],
  hueLuma = [0, 0, 0, 0, 0, 0],
  skinProtect = 75,
  skinSafe = true,
  onChangeHueVector,
  onResetHue6V,
  onResetHueChannel,
  onDragChange,
}) {
  const [channel, setChannel] = useState("hueShift");
  const {
    containerRef: channelContainerRef,
    registerTabRef: registerChannelRef,
    pillStyle: channelPillStyle,
  } = usePillIndicator(channel);

  const activeSpec = CHANNELS.find((c) => c.id === channel) || CHANNELS[0];
  const values =
    channel === "hueShift"
      ? hueShift
      : channel === "hueSat"
      ? hueSat
      : hueLuma;

  const activeModifiedCount = (values || []).filter(
    (v) => Math.abs(v || 0) > 0.004
  ).length;
  const totalModifiedCount = [...hueShift, ...hueSat, ...hueLuma].filter(
    (v) => Math.abs(v || 0) > 0.004
  ).length;
  const isAnyModified = totalModifiedCount > 0;

  return (
    <div className="space-y-3.5 select-none">
      {/* Sub-mode switcher: Hue / Saturation / Luminance (Sliding Active Pill) */}
      <div className="flex items-center justify-between gap-2">
        <div
          ref={channelContainerRef}
          className="relative flex-1 grid grid-cols-3 gap-0.5 p-0.5 rounded-md bg-[#0A0C10] border border-[#AAB7C5]/14"
        >
          <div
            aria-hidden="true"
            className="studio-sliding-pill pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-[4px] bg-[#1C2430] border border-[#4A6B86]/55"
            style={channelPillStyle}
          />
          {CHANNELS.map((ch) => {
            const active = channel === ch.id;
            const chVals =
              ch.id === "hueShift"
                ? hueShift
                : ch.id === "hueSat"
                ? hueSat
                : hueLuma;
            const chModified = (chVals || []).some((v) => Math.abs(v || 0) > 0.004);
            return (
              <button
                key={ch.id}
                ref={registerChannelRef(ch.id)}
                type="button"
                onClick={() => setChannel(ch.id)}
                className={`relative z-10 py-1 px-1.5 rounded-[4px] text-[10px] font-medium transition-[color,transform] duration-150 ease-[var(--ease-shutter)] active:scale-[0.96] cursor-pointer inline-flex items-center justify-center gap-1 ${
                  active
                    ? "text-[#F4F7FB]"
                    : "text-[#AAB7C5] hover:text-[#F4F7FB]"
                }`}
              >
                <span>{ch.label}</span>
                {chModified && (
                  <span
                    aria-hidden="true"
                    className="w-1 h-1 rounded-full bg-[#93B8D8] shrink-0"
                  />
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onResetHue6V}
          disabled={!isAnyModified}
          title="Reset all 6 Hue Vectors"
          className={`p-1.5 rounded-md border text-[10px] transition-colors ${
            isAnyModified
              ? "bg-[#0A0C10] hover:bg-[#1C2430] text-[#AAB7C5] hover:text-[#F4F7FB] border-[#AAB7C5]/16 cursor-pointer"
              : "bg-transparent text-[#AAB7C5]/35 border-[#AAB7C5]/10 cursor-not-allowed"
          }`}
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>

      {/* 6 Vector Precision Hairline Scrubbers with balanced vertical rhythm */}
      <div className="space-y-3.5 pt-0.5">
        {HUE_SECTORS.map((sec) => (
          <ParameterSlider
            key={`${channel}-${sec.idx}`}
            paramKey={`${channel}:${sec.idx}`}
            label={sec.name}
            colorDot={sec.color}
            min={activeSpec.min}
            max={activeSpec.max}
            step={activeSpec.step}
            value={Number(values?.[sec.idx] ?? 0)}
            defaultValue={0}
            isBipolar
            decimals={2}
            onChange={(_, val) => onChangeHueVector(channel, sec.idx, val)}
            onDragChange={onDragChange}
          />
        ))}
      </div>

      {/* Hue Band Roll-Off & Skin-Tone Anchor Summary + Reset Strip */}
      <div className="pt-3 border-t border-[#AAB7C5]/14 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#AAB7C5]">
            Band Roll-Off &amp; Anchor
          </span>
          <span className="text-[10px] font-mono text-[#AAB7C5]">
            {activeModifiedCount}/6 {activeSpec.label}
          </span>
        </div>

        <div className="rounded-md bg-[#0A0C10] border border-[#AAB7C5]/14 divide-y divide-[#AAB7C5]/12 text-[10px] font-mono tabular-nums">
          <div className="px-2.5 py-1.5 flex items-center justify-between gap-2">
            <span className="text-[#AAB7C5]">Sector Roll-Off</span>
            <span className="text-[#C9D7E2]">60° Cosine Feather</span>
          </div>
          <div className="px-2.5 py-1.5 flex items-center justify-between gap-2">
            <span className="text-[#AAB7C5] inline-flex items-center gap-1">
              <ShieldCheck
                className={`w-3 h-3 ${
                  skinProtect === 0
                    ? "text-[#AAB7C5]/50"
                    : skinSafe
                    ? "text-[#93B8D8]"
                    : "text-amber-400"
                }`}
              />
              <span>Skin-Tone Anchor</span>
            </span>
            <span className="text-[#F4F7FB]">
              {skinProtect > 0 ? `R/Y · ${skinProtect}%` : "Unlocked"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onResetHueChannel?.(channel)}
            disabled={activeModifiedCount === 0}
            className={`py-1.5 px-2 rounded-md border text-[10px] font-medium transition-colors ${
              activeModifiedCount > 0
                ? "bg-[#0A0C10] hover:bg-[#1C2430] text-[#C9D7E2] hover:text-[#F4F7FB] border-[#AAB7C5]/16 cursor-pointer"
                : "bg-[#0A0C10]/60 text-[#AAB7C5]/35 border-[#AAB7C5]/10 cursor-not-allowed"
            }`}
          >
            Reset {activeSpec.label}
          </button>
          <button
            type="button"
            onClick={onResetHue6V}
            disabled={!isAnyModified}
            className={`py-1.5 px-2 rounded-md border text-[10px] font-medium transition-colors ${
              isAnyModified
                ? "bg-[#0A0C10] hover:bg-[#1C2430] text-[#C9D7E2] hover:text-[#F4F7FB] border-[#AAB7C5]/16 cursor-pointer"
                : "bg-[#0A0C10]/60 text-[#AAB7C5]/35 border-[#AAB7C5]/10 cursor-not-allowed"
            }`}
          >
            Reset All 6V
          </button>
        </div>
      </div>
    </div>
  );
});

export default Hue6VPanel;
