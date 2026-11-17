import React, { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Repeat,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  Crosshair,
} from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

function fmt(t) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Minimalist achromatic transport bar bound to the target <video> (zero React re-renders during playback).
export default function VideoTransportBar({
  videoEl,
  resolution,
  onMatchCurrentFrame,
  canMatchFrame = false,
  isAnalyzing = false,
}) {
  const { t } = useLanguage();
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [muted, setMuted] = useState(true);
  const rangeRef = useRef(null);
  const timeTextRef = useRef(null);
  const scrubbingRef = useRef(false);
  const durationRef = useRef(0);
  const lastUiSyncRef = useRef(0);

  useEffect(() => {
    if (!videoEl) return undefined;
    videoEl.loop = true;
    videoEl.muted = true;
    setLoop(true);
    setMuted(true);
    setPlaying(!videoEl.paused);

    const syncDomTime = (tm, d) => {
      const safeDur = Number.isFinite(d) && d > 0 ? d : 0;
      durationRef.current = safeDur;
      if (rangeRef.current) {
        rangeRef.current.max = String(safeDur);
        if (!scrubbingRef.current) {
          rangeRef.current.value = String(Math.min(tm, safeDur));
        }
      }
      if (timeTextRef.current) {
        timeTextRef.current.textContent = `${fmt(tm)} / ${fmt(safeDur)}`;
      }
    };

    syncDomTime(videoEl.currentTime || 0, videoEl.duration || 0);

    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      syncDomTime(videoEl.currentTime || 0, videoEl.duration || 0);
    };
    const onMeta = () => {
      syncDomTime(videoEl.currentTime || 0, videoEl.duration || 0);
    };
    const onTime = () => {
      if (scrubbingRef.current) return;
      const now = performance.now();
      if (now - lastUiSyncRef.current < 150) return;
      lastUiSyncRef.current = now;
      syncDomTime(videoEl.currentTime || 0, videoEl.duration || 0);
    };

    videoEl.addEventListener("play", onPlay);
    videoEl.addEventListener("pause", onPause);
    videoEl.addEventListener("durationchange", onMeta);
    videoEl.addEventListener("loadedmetadata", onMeta);
    videoEl.addEventListener("timeupdate", onTime);
    return () => {
      videoEl.removeEventListener("play", onPlay);
      videoEl.removeEventListener("pause", onPause);
      videoEl.removeEventListener("durationchange", onMeta);
      videoEl.removeEventListener("loadedmetadata", onMeta);
      videoEl.removeEventListener("timeupdate", onTime);
    };
  }, [videoEl]);

  if (!videoEl) return null;

  const togglePlay = () => {
    if (videoEl.paused) videoEl.play().catch(() => {});
    else videoEl.pause();
  };

  const endScrub = () => {
    scrubbingRef.current = false;
  };

  const stepFrame = (dir) => {
    if (!videoEl) return;
    if (!videoEl.paused) videoEl.pause();
    const dur = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
    const next = Math.max(
      0,
      Math.min(dur || Infinity, (videoEl.currentTime || 0) + dir * (1 / 30))
    );
    videoEl.currentTime = next;
    if (rangeRef.current) rangeRef.current.value = String(next);
    if (timeTextRef.current) {
      timeTextRef.current.textContent = `${fmt(next)} / ${fmt(durationRef.current)}`;
    }
  };

  const btn =
    "m3-btn-morph inline-flex items-center justify-center w-7 h-7 rounded-lg border cursor-pointer shrink-0";

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 rounded-lg bg-[#0A0A0D]/55 border border-white/[0.09]">
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? t("transport.pause") : t("transport.play")}
        title={playing ? t("transport.pause") : t("transport.play")}
        className={`${btn} bg-[#E2E4E9] text-[#0E0E11] border-[#E2E4E9]`}
      >
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      </button>

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => stepFrame(-1)}
          title={t("transport.prevFrameTitle")}
          aria-label={t("transport.prevFrameAria")}
          className="m3-btn-morph inline-flex items-center justify-center px-1.5 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-[#9CA3AF] hover:text-[#E2E4E9] border border-white/[0.09] text-[10px] font-mono cursor-pointer"
        >
          <ChevronLeft className="w-3 h-3" />
          <span>1f</span>
        </button>
        <button
          type="button"
          onClick={() => stepFrame(1)}
          title={t("transport.nextFrameTitle")}
          aria-label={t("transport.nextFrameAria")}
          className="m3-btn-morph inline-flex items-center justify-center px-1.5 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-[#9CA3AF] hover:text-[#E2E4E9] border border-white/[0.09] text-[10px] font-mono cursor-pointer"
        >
          <span>1f</span>
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 min-w-[80px] py-2 flex items-center">
        <input
          ref={rangeRef}
          type="range"
          min={0}
          max={0}
          step={0.01}
          defaultValue={0}
          onPointerDown={() => {
            scrubbingRef.current = true;
          }}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
          onTouchStart={() => {
            scrubbingRef.current = true;
          }}
          onTouchEnd={endScrub}
          onChange={(e) => {
            const v = Number(e.target.value);
            videoEl.currentTime = v;
            if (timeTextRef.current) {
              timeTextRef.current.textContent = `${fmt(v)} / ${fmt(durationRef.current)}`;
            }
          }}
          aria-label={t("transport.timelineAria")}
          className="w-full h-1.5 accent-[#E2E4E9] cursor-pointer"
        />
      </div>

      <span
        ref={timeTextRef}
        className="text-[11px] font-mono text-[#9CA3AF] tabular-nums whitespace-nowrap"
      >
        00:00 / 00:00
      </span>

      {onMatchCurrentFrame && (
        <button
          type="button"
          onClick={onMatchCurrentFrame}
          disabled={!canMatchFrame || isAnalyzing}
          title={t("transport.matchFrameTitle")}
          className={`m3-btn-morph inline-flex items-center gap-1 px-2 h-7 rounded-lg text-[10px] sm:text-[11px] font-medium border whitespace-nowrap ${
            !canMatchFrame || isAnalyzing
              ? "bg-white/[0.025] text-[#9CA3AF]/35 border-white/[0.05] cursor-not-allowed"
              : "bg-white/[0.06] hover:bg-white/[0.12] text-[#E2E4E9] border-white/[0.14] cursor-pointer"
          }`}
        >
          <Crosshair className="w-3 h-3 text-[#6EE7B7]" />
          <span>{t("transport.matchFrame")}</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          videoEl.loop = !loop;
          setLoop(!loop);
        }}
        aria-pressed={loop}
        aria-label={t("transport.toggleLoopAria")}
        title={loop ? t("transport.loopOn") : t("transport.loopOff")}
        className={`${btn} ${
          loop
            ? "bg-white/[0.12] text-[#E2E4E9] border-white/25"
            : "bg-white/[0.04] text-[#9CA3AF] border-white/[0.09]"
        }`}
      >
        <Repeat className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={() => {
          videoEl.muted = !muted;
          setMuted(!muted);
        }}
        aria-pressed={!muted}
        aria-label={muted ? t("transport.unmute") : t("transport.mute")}
        title={muted ? t("transport.unmute") : t("transport.mute")}
        className={`${btn} bg-white/[0.04] text-[#9CA3AF] hover:text-[#E2E4E9] border-white/[0.09]`}
      >
        {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
      </button>

      {resolution && (
        <span className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-[#9CA3AF] border border-white/[0.09] whitespace-nowrap">
          {resolution}
        </span>
      )}
    </div>
  );
}
