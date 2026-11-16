import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, Repeat, Volume2, VolumeX } from "lucide-react";

function fmt(t) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Minimalist achromatic transport bar bound to the target <video>.
export default function VideoTransportBar({ videoEl, resolution }) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [loop, setLoop] = useState(true);
  const [muted, setMuted] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const rangeRef = useRef(null);
  const timeTextRef = useRef(null);
  const lastUiSyncRef = useRef(0);

  useEffect(() => {
    if (!videoEl) return undefined;
    videoEl.loop = true;
    videoEl.muted = true;
    setLoop(true);
    setMuted(true);
    const dur = videoEl.duration || 0;
    setDuration(dur);
    setPlaying(!videoEl.paused);

    const syncDomTime = (t, d) => {
      if (rangeRef.current) rangeRef.current.value = String(Math.min(t, d || 0));
      if (timeTextRef.current) timeTextRef.current.textContent = `${fmt(t)} / ${fmt(d)}`;
    };
    syncDomTime(videoEl.currentTime || 0, dur);

    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      syncDomTime(videoEl.currentTime || 0, videoEl.duration || 0);
    };
    const onMeta = () => {
      const d = videoEl.duration || 0;
      setDuration(d);
      syncDomTime(videoEl.currentTime || 0, d);
    };
    const onTime = () => {
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

  const btn =
    "m3-btn-morph inline-flex items-center justify-center w-7 h-7 rounded-lg border cursor-pointer";

  return (
    <div className="mt-2.5 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#0A0A0D]/55 border border-white/[0.09]">
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
        className={`${btn} bg-[#E2E4E9] text-[#0E0E11] border-[#E2E4E9]`}
      >
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      </button>

      <input
        ref={rangeRef}
        type="range"
        min={0}
        max={duration || 0}
        step={0.01}
        defaultValue={0}
        onMouseDown={() => setScrubbing(true)}
        onMouseUp={() => setScrubbing(false)}
        onTouchStart={() => setScrubbing(true)}
        onTouchEnd={() => setScrubbing(false)}
        onChange={(e) => {
          const v = Number(e.target.value);
          videoEl.currentTime = v;
          if (timeTextRef.current) {
            timeTextRef.current.textContent = `${fmt(v)} / ${fmt(duration)}`;
          }
        }}
        aria-label="Video timeline"
        className="flex-1 min-w-[60px] h-1 accent-[#E2E4E9] cursor-pointer"
        data-scrubbing={scrubbing}
      />

      <span
        ref={timeTextRef}
        className="text-[11px] font-mono text-[#9CA3AF] tabular-nums whitespace-nowrap"
      >
        00:00 / {fmt(duration)}
      </span>

      <button
        type="button"
        onClick={() => {
          videoEl.loop = !loop;
          setLoop(!loop);
        }}
        aria-pressed={loop}
        aria-label="Toggle loop"
        title={loop ? "Loop on" : "Loop off"}
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
        aria-label={muted ? "Unmute" : "Mute"}
        title={muted ? "Unmute" : "Mute"}
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
