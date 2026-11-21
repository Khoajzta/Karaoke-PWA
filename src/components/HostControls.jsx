import React, { useState, useEffect } from "react";
import { 
  Play, 
  Pause, 
  SkipForward, 
  RotateCcw, 
  FastForward, 
  Rewind,
  Volume2,
  VolumeX,
  Radio,
  Maximize2,
  Minimize2,
  Smartphone
} from "lucide-react";
import { rtdb, ref, update, getServerTime } from "../firebase";

export const HostControls = ({
  roomId,
  playback,
  onNextSong,
  playerRef
}) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Poll video time for progress bar display
  useEffect(() => {
    const timer = setInterval(() => {
      if (playback?.state === "playing" && playback?.anchorServerTime) {
        const playerTime = playerRef?.current?.getCurrentTime?.();
        const cur = Number.isFinite(playerTime)
          ? Math.max(0, playerTime)
          : Math.max(0, (getServerTime() - playback.anchorServerTime) / 1000);
        setCurrentTime(cur);
      } else if (playback?.state === "paused" && typeof playback?.pausedAt === "number") {
        setCurrentTime(playback.pausedAt);
      }
    }, 500);

    return () => clearInterval(timer);
  }, [playback?.state, playback?.anchorServerTime, playback?.pausedAt]);

  const handlePlay = async () => {
    if (!roomId || !playback?.videoId) return;
    const nowServer = getServerTime();
    const tVideo = currentTime;

    // Anchor server time = nowServer - (T_video * 1000)
    const anchor = nowServer - Math.round(tVideo * 1000);

    await update(ref(rtdb, `rooms/${roomId}/playback`), {
      state: "playing",
      anchorServerTime: anchor,
      pausedAt: tVideo
    });
  };

  const handlePause = async () => {
    if (!roomId || !playback?.videoId) return;
    const playerTime = playerRef?.current?.getCurrentTime?.();
    const tVideo = Number.isFinite(playerTime) ? Math.max(0, playerTime) : currentTime;
    setCurrentTime(tVideo);

    await update(ref(rtdb, `rooms/${roomId}/playback`), {
      state: "paused",
      pausedAt: tVideo
    });
  };

  const handleSeek = async (seconds) => {
    if (!roomId || !playback?.videoId) return;
    const target = Math.max(0, seconds);
    const nowServer = getServerTime();
    setCurrentTime(target);

    if (playback?.state === "playing") {
      const anchor = nowServer - Math.round(target * 1000);
      await update(ref(rtdb, `rooms/${roomId}/playback`), {
        anchorServerTime: anchor,
        pausedAt: target,
        seekTrigger: nowServer
      });
    } else {
      await update(ref(rtdb, `rooms/${roomId}/playback`), {
        pausedAt: target,
        seekTrigger: nowServer
      });
    }
  };

  // Re-broadcast sync beacon
  const handleForceResync = async () => {
    if (!roomId || !playback?.videoId) return;
    const playerTime = playerRef?.current?.getCurrentTime?.();
    const videoTime = Number.isFinite(playerTime) ? Math.max(0, playerTime) : currentTime;
    const nowServer = getServerTime();

    setCurrentTime(videoTime);
    await update(ref(rtdb, `rooms/${roomId}/playback`), {
      ...(playback.state === "playing" && {
        anchorServerTime: nowServer - Math.round(videoTime * 1000)
      }),
      pausedAt: videoTime,
      syncTrigger: nowServer
    });
  };

  // Host remotely toggles Fullscreen for all connected Member devices
  const handleToggleMemberFullscreen = async () => {
    if (!roomId) return;
    const nextState = !playback?.memberFullscreen;
    await update(ref(rtdb, `rooms/${roomId}/playback`), {
      memberFullscreen: nextState,
      memberFullscreenTrigger: Date.now()
    });
  };

  // Host remotely toggles Mute/Unmute for all connected Member devices
  const handleToggleMemberMute = async () => {
    if (!roomId) return;
    const nextState = !playback?.memberMuted;
    await update(ref(rtdb, `rooms/${roomId}/playback`), {
      memberMuted: nextState,
      memberMuteTrigger: Date.now()
    });
  };

  const formatTime = (secs) => {
    const s = Math.floor(secs || 0);
    const m = Math.floor(s / 60);
    const remainder = s % 60;
    return `${m}:${remainder < 10 ? "0" : ""}${remainder}`;
  };

  const hasVideo = Boolean(playback?.videoId);
  const isPlaying = playback?.state === "playing" && hasVideo;
  const isMemberFs = Boolean(playback?.memberFullscreen);
  const isMemberMuted = Boolean(playback?.memberMuted);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xl flex flex-col gap-3">
      {/* Top row: Progress bar */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-red-400 w-10 text-right">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min="0"
          max={Math.max(currentTime + 60, 300)}
          value={currentTime}
          onChange={(e) => handleSeek(parseFloat(e.target.value))}
          className="flex-1 accent-red-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
        />
        <button
          onClick={handleForceResync}
          title="Đồng bộ lại tất cả máy Member"
          className="min-h-9 px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-1 transition whitespace-nowrap"
        >
          <RotateCcw className="w-3 h-3 text-emerald-400" />
          <span>Đồng bộ host</span>
        </button>
      </div>

      {/* Main Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-2">
        <div className="flex items-center justify-center gap-2 sm:gap-2">
          {/* Rewind 5s */}
          <button
            onClick={() => handleSeek(currentTime - 5)}
            disabled={!hasVideo}
            className="w-10 h-10 sm:w-auto sm:h-auto p-2 sm:p-2.5 flex items-center justify-center text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-xl transition disabled:opacity-40 disabled:pointer-events-none"
            title="Lùi 5 giây"
          >
            <Rewind className="w-4 h-4" />
          </button>

          {/* Play / Pause */}
          {isPlaying ? (
            <button
              onClick={handlePause}
              disabled={!hasVideo}
              className="min-h-10 flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition active:scale-95 text-xs sm:text-sm disabled:opacity-40 disabled:pointer-events-none"
            >
              <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              <span>Tạm dừng</span>
            </button>
          ) : (
            <button
              onClick={handlePlay}
              disabled={!hasVideo}
              className="min-h-10 flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white font-bold rounded-xl shadow-lg shadow-red-500/25 transition active:scale-95 text-xs sm:text-sm disabled:opacity-40 disabled:pointer-events-none"
            >
              <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              <span>Phát nhạc</span>
            </button>
          )}

          {/* Forward 5s */}
          <button
            onClick={() => handleSeek(currentTime + 5)}
            disabled={!hasVideo}
            className="w-10 h-10 sm:w-auto sm:h-auto p-2 sm:p-2.5 flex items-center justify-center text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-xl transition disabled:opacity-40 disabled:pointer-events-none"
            title="Tới 5 giây"
          >
            <FastForward className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 sm:gap-2">
          {/* Host Remote Mute/Unmute for Member devices */}
          <button
            onClick={handleToggleMemberMute}
            title={isMemberMuted ? "Bấm để bật tiếng tất cả Member" : "Bấm để tắt tiếng tất cả Member"}
            className={`min-h-10 flex items-center justify-center gap-1 px-3 sm:px-3 py-2 sm:py-2.5 rounded-xl text-xs font-bold transition active:scale-95 border ${
              isMemberMuted
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
            }`}
          >
            {isMemberMuted ? (
              <>
                <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                <span className="hidden sm:inline">Member Muted</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
                <span className="hidden sm:inline">Member Audio</span>
              </>
            )}
          </button>

          {/* Host Remote Fullscreen Command for Member devices */}
          <button
            onClick={handleToggleMemberFullscreen}
            title={isMemberFs ? "Bấm để thu nhỏ màn hình tất cả Member" : "Bấm để phóng to toàn màn hình tất cả Member"}
            className={`min-h-10 flex items-center justify-center gap-1 px-3 sm:px-3 py-2 sm:py-2.5 rounded-xl text-xs font-bold transition active:scale-95 border ${
              isMemberFs
                ? "bg-red-500 text-white border-red-400 shadow-lg shadow-red-500/30"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-400" />
            {isMemberFs ? (
              <>
                <Minimize2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">Thu Member</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">Full Member</span>
              </>
            )}
          </button>

          {/* Skip to Next Song */}
          <button
            onClick={onNextSong}
            className="min-h-10 flex items-center justify-center gap-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-red-400 hover:text-red-300 font-semibold rounded-xl border border-slate-700 transition active:scale-95 text-xs sm:text-sm"
          >
            <span>Qua bài</span>
            <SkipForward className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
