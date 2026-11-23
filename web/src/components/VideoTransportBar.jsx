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

function fmtTimecode(t) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const f = Math.floor((t % 1) * 30);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}

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

  const trackRef = useRef(null);
  const fillRef = useRef(null);
  const thumbRef = useRef(null);
  const curTimeRef = useRef(null);
  const durTimeRef = useRef(null);
  const scrubbingRef = useRef(false);
  const durationRef = useRef(0);
  const lastUiSyncRef = useRef(0);

  const syncDomTime = (tm, d) => {
    const safeDur = Number.isFinite(d) && d > 0 ? d : 0;
    const safeTm = safeDur > 0 ? Math.max(0, Math.min(tm, safeDur)) : 0;
    durationRef.current = safeDur;
    const pct = safeDur > 0 ? (safeTm / safeDur) * 100 : 0;
    if (fillRef.current) {
      fillRef.current.style.width = `${pct}%`;
    }
    if (thumbRef.current) {
      thumbRef.current.style.left = `${pct}%`;
    }
    if (curTimeRef.current) {
      curTimeRef.current.textContent = fmtTimecode(safeTm);
    }
    if (durTimeRef.current) {
      durTimeRef.current.textContent = fmtTimecode(safeDur);
    }
  };

  useEffect(() => {
    if (!videoEl) return undefined;
    videoEl.loop = true;
    videoEl.muted = true;
    setLoop(true);
    setMuted(true);
    setPlaying(!videoEl.paused);

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
      if (now - lastUiSyncRef.current < 80) return;
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

  const seekFromClientX = (clientX) => {
    const track = trackRef.current;
    const dur = durationRef.current;
    if (!track || dur <= 0) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const nextTime = pct * dur;
    videoEl.currentTime = nextTime;
    syncDomTime(nextTime, dur);
  };

  const handleTrackPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    scrubbingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    seekFromClientX(e.clientX);
  };

  const handleTrackPointerMove = (e) => {
    if (!scrubbingRef.current) return;
    seekFromClientX(e.clientX);
  };

  const handleTrackPointerUp = (e) => {
    scrubbingRef.current = false;
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
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
    syncDomTime(next, durationRef.current);
  };

  return (
    <div className="shrink-0 h-9 px-3 bg-[#0D1118] border-t border-[#AAB7C5]/14 flex items-center gap-2.5 select-none">
      {/* Play / Pause & Frame Step */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? t("transport.pause") : t("transport.play")}
          title={playing ? t("transport.pause") : t("transport.play")}
          className="w-6 h-6 rounded flex items-center justify-center bg-[#F4F7FB] hover:bg-[#FBFDFF] text-[#0A0C10] transition-colors cursor-pointer"
        >
          {playing ? (
            <Pause className="w-3 h-3 fill-current" />
          ) : (
            <Play className="w-3 h-3 fill-current ml-0.5" />
          )}
        </button>

        <button
          type="button"
          onClick={() => stepFrame(-1)}
          title={t("transport.prevFrameTitle")}
          aria-label={t("transport.prevFrameAria")}
          className="hidden sm:inline-flex items-center justify-center w-6 h-6 rounded text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => stepFrame(1)}
          title={t("transport.nextFrameTitle")}
          aria-label={t("transport.nextFrameAria")}
          className="hidden sm:inline-flex items-center justify-center w-6 h-6 rounded text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] transition-colors cursor-pointer"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Current Timecode */}
      <span
        ref={curTimeRef}
        className="text-[11px] font-mono tabular-nums text-[#F4F7FB] shrink-0"
      >
        00:00:00
      </span>

      {/* Thin Precision Video Scrubber with Steel Night Playhead */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={t("transport.timelineAria")}
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handleTrackPointerMove}
        onPointerUp={handleTrackPointerUp}
        onPointerCancel={handleTrackPointerUp}
        style={{ touchAction: "none" }}
        className="relative flex-1 min-w-[70px] h-5 flex items-center cursor-ew-resize group"
      >
        <div className="relative w-full h-[2px] rounded-full bg-[#AAB7C5]/20 overflow-hidden">
          <div
            ref={fillRef}
            className="absolute top-0 bottom-0 left-0 bg-[#7FA3C2]"
            style={{ width: "0%" }}
          />
        </div>
        <div
          ref={thumbRef}
          aria-hidden="true"
          className="absolute top-1/2 w-2.5 h-2.5 rounded-full bg-[#93B8D8] ring-2 ring-[#0D1118] group-hover:scale-125 transition-transform pointer-events-none"
          style={{ left: "0%", transform: "translate(-50%, -50%)" }}
        />
      </div>

      {/* Total Duration */}
      <span
        ref={durTimeRef}
        className="text-[11px] font-mono tabular-nums text-[#AAB7C5] shrink-0"
      >
        00:00:00
      </span>

      {/* Secondary Transport Actions */}
      <div className="flex items-center gap-1 shrink-0 border-l border-[#AAB7C5]/14 pl-2">
        {onMatchCurrentFrame && (
          <button
            type="button"
            onClick={onMatchCurrentFrame}
            disabled={!canMatchFrame || isAnalyzing}
            title={t("transport.matchFrameTitle")}
            className={`hidden md:inline-flex items-center gap-1 px-2 h-6 rounded text-[10px] font-medium transition-colors whitespace-nowrap ${
              !canMatchFrame || isAnalyzing
                ? "text-[#AAB7C5]/35 cursor-not-allowed"
                : "text-[#C9D7E2] hover:text-[#F4F7FB] hover:bg-[#1C2430] cursor-pointer"
            }`}
          >
            <Crosshair className="w-3 h-3" />
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
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors cursor-pointer ${
            loop
              ? "text-[#F4F7FB] bg-[#1C2430]"
              : "text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430]"
          }`}
        >
          <Repeat className="w-3 h-3" />
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
          className="w-6 h-6 rounded flex items-center justify-center text-[#AAB7C5] hover:text-[#F4F7FB] hover:bg-[#1C2430] transition-colors cursor-pointer"
        >
          {muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
        </button>

        {resolution && (
          <span className="hidden xl:inline text-[10px] font-mono text-[#AAB7C5] pl-1 tabular-nums">
            {resolution}
          </span>
        )}
      </div>
    </div>
  );
}
