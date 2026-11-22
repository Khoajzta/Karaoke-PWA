import React, { useEffect, useRef, useState, useCallback } from "react";
import YouTube from "react-youtube";
import { 
  Volume2, 
  VolumeX, 
  Play, 
  Pause, 
  RotateCcw, 
  Sparkles, 
  ShieldAlert, 
  Info,
  Radio,
  CheckCircle2,
  Tv,
  Maximize2,
  Minimize2,
  RotateCw,
  Expand
} from "lucide-react";
import { getServerTime, getServerTimeOffset, rtdb, ref, update } from "../../../firebase";
import { getFastestPlaybackTarget } from "../../../utils/playbackSync";

export const KaraokePlayer = ({
  roomId,
  memberId,
  peerPositions = {},
  isHost,
  playback,
  nextSongTitle,
  onSongEnd,
  onFullscreenChange,
  externalPlayerRef
}) => {
  const internalPlayerRef = useRef(null);
  const playerRef = externalPlayerRef || internalPlayerRef;
  const containerRef = useRef(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false); // Mặc định BẬT tiếng, member tự quyết
  const [currentDiff, setCurrentDiff] = useState(0);
  const [syncStatus, setSyncStatus] = useState("Đang kết nối...");
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [secondsRemaining, setSecondsRemaining] = useState(Infinity);
  const isAdjustingRateRef = useRef(false);
  const rateAdjustTimeoutRef = useRef(null);
  const peerPositionsRef = useRef(peerPositions);
  const lastSeekTriggerRef = useRef(playback?.seekTrigger);
  peerPositionsRef.current = peerPositions;
  const lastStateRef = useRef(playback?.state || "paused");
  const playbackStartTimerRef = useRef(null);
  const playbackRecoveryTimerRef = useRef(null);

  // Fullscreen & Orientation state for Member
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRotated, setIsRotated] = useState(false);
  const [autoFullscreenEnabled, setAutoFullscreenEnabled] = useState(true);
  const lastVideoIdRef = useRef(playback?.videoId);

  // Notify parent component about fullscreen state to hide header
  useEffect(() => {
    if (onFullscreenChange) {
      onFullscreenChange(isFullscreen);
    }
  }, [isFullscreen, onFullscreenChange]);

  // Helper to verify that YouTube internal iframe is completely mounted and safe to interact with
  const isPlayerUsable = useCallback((player) => {
    try {
      return Boolean(
        player &&
        typeof player.getIframe === "function" &&
        player.getIframe() &&
        typeof player.pauseVideo === "function"
      );
    } catch (e) {
      return false;
    }
  }, []);

  // Safe caller to prevent YouTube www-widgetapi.js from throwing uncaught TypeError
  const safeCall = useCallback((action) => {
    try {
      const p = playerRef.current;
      if (isPlayerUsable(p)) {
        return action(p);
      }
    } catch (err) {
      console.warn("YouTube safeCall handled error:", err);
    }
  }, [isPlayerUsable]);

  const applySharedPlayback = useCallback(() => {
    if (playbackStartTimerRef.current) {
      clearTimeout(playbackStartTimerRef.current);
      playbackStartTimerRef.current = null;
    }

    safeCall((player) => {
      if (playback?.state !== "playing") return;
      const anchor = playback.anchorServerTime;
      const delay = Number.isFinite(anchor) ? anchor - getServerTime() : 0;

      if (delay > 0) {
        player.pauseVideo();
        player.seekTo(0, true);
        playbackStartTimerRef.current = setTimeout(() => {
          safeCall((readyPlayer) => readyPlayer.playVideo());
          playbackStartTimerRef.current = null;
        }, delay);
        return;
      }

      if (Number.isFinite(anchor)) {
        player.seekTo(Math.max(0, (getServerTime() - anchor) / 1000), true);
      }
      player.playVideo();
    });
  }, [playback?.state, playback?.anchorServerTime, safeCall]);

  useEffect(() => () => {
    if (playbackStartTimerRef.current) clearTimeout(playbackStartTimerRef.current);
    if (playbackRecoveryTimerRef.current) clearTimeout(playbackRecoveryTimerRef.current);
  }, []);

  // Mobile browsers may suspend the YouTube iframe while another app or screen
  // is active. Re-apply the room's server-time position when this player returns.
  useEffect(() => {
    if (isHost) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && playback?.state === "playing") {
        applySharedPlayback();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isHost, playback?.state, playback?.anchorServerTime, playback?.videoId, applySharedPlayback]);

  useEffect(() => {
    if (playback?.state !== "playing" || !playerReady) {
      setSecondsRemaining(Infinity);
      return;
    }

    const updateRemaining = () => {
      safeCall((player) => {
        const duration = player.getDuration();
        const currentTime = player.getCurrentTime();
        if (Number.isFinite(duration) && duration > 0 && Number.isFinite(currentTime)) {
          setSecondsRemaining(Math.max(0, duration - currentTime));
        }
      });
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 500);
    return () => clearInterval(timer);
  }, [playback?.videoId, playback?.state, playerReady, safeCall]);

  const isPreparingCurrentSong = playback?.state === "playing" &&
    Number.isFinite(playback?.anchorServerTime) && getServerTime() < playback.anchorServerTime;
  const titleToDisplay = playback?.state === "playing"
    ? (isPreparingCurrentSong ? playback?.title : secondsRemaining <= 10 ? nextSongTitle : "")
    : playback?.title;

  // Keep track of playback state
  useEffect(() => {
    lastStateRef.current = playback?.state || "paused";
  }, [playback?.state]);

  // Watch for phone physical rotation (resize / orientation change)
  useEffect(() => {
    const handleOrientation = () => {
      if (window.innerWidth > window.innerHeight) {
        setIsRotated(false); // Physically landscape, no CSS rotation needed
      }
    };
    window.addEventListener("resize", handleOrientation);
    window.addEventListener("orientationchange", handleOrientation);
    return () => {
      window.removeEventListener("resize", handleOrientation);
      window.removeEventListener("orientationchange", handleOrientation);
    };
  }, []);

  // ==========================================
  // AUTO FULLSCREEN ON NEW SONG FOR MEMBER
  // ==========================================
  useEffect(() => {
    if (isHost) return; // Only Member triggers auto-fullscreen
    if (!playback?.videoId) return;

    // Detect when videoId changes
    if (lastVideoIdRef.current && playback.videoId !== lastVideoIdRef.current) {
      lastVideoIdRef.current = playback.videoId;
      if (autoFullscreenEnabled) {
        setIsFullscreen(true);
        if (window.innerHeight > window.innerWidth) {
          setIsRotated(true);
        }
        // Also attempt native Fullscreen if allowed
        try {
          if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
        } catch (e) {}
      }
    } else if (!lastVideoIdRef.current) {
      lastVideoIdRef.current = playback.videoId;
    }
  }, [playback?.videoId, isHost, autoFullscreenEnabled]);

  // Report each active player's position so every device can follow the one
  // furthest ahead. The room presence effect removes this data on disconnect.
  useEffect(() => {
    if (!roomId || !memberId || !playerReady || !playback?.videoId) return;

    const reportPosition = () => {
      if (playback?.state !== "playing") return;
      if (playback?.anchorServerTime && getServerTime() < playback.anchorServerTime) return;
      if (playback?.seekTrigger && getServerTime() - playback.seekTrigger < 700) return;
      const currentTime = safeCall((player) => player.getCurrentTime());
      if (!Number.isFinite(currentTime)) return;

      update(ref(rtdb, `rooms/${roomId}/members/${memberId}/playbackPosition`), {
        videoId: playback.videoId,
        seconds: Math.max(0, currentTime),
        reportedAt: getServerTime(),
        seekTrigger: playback.seekTrigger || 0
      }).catch((error) => console.warn("Playback position report failed:", error));
    };

    reportPosition();
    const interval = setInterval(reportPosition, 1000);
    return () => clearInterval(interval);
  }, [roomId, memberId, playerReady, playback?.videoId, playback?.state, safeCall]);

  // ==========================================
  // HOST REMOTE FULLSCREEN COMMAND LISTENER
  // ==========================================
  const lastRemoteTriggerRef = useRef(playback?.memberFullscreenTrigger);

  useEffect(() => {
    if (isHost) return; // Only Member reacts to Host's remote command
    if (playback?.memberFullscreenTrigger && playback.memberFullscreenTrigger !== lastRemoteTriggerRef.current) {
      lastRemoteTriggerRef.current = playback.memberFullscreenTrigger;
      if (playback.memberFullscreen) {
        setIsFullscreen(true);
        if (window.innerHeight > window.innerWidth) {
          setIsRotated(true);
        }
        try {
          if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
        } catch (e) {}
      } else {
        setIsFullscreen(false);
        setIsRotated(false);
        try {
          if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          }
        } catch (e) {}
      }
    }
  }, [playback?.memberFullscreenTrigger, playback?.memberFullscreen, isHost]);

  // ==========================================
  // HOST REMOTE MUTE / UNMUTE LISTENER
  // ==========================================
  // Handle Fullscreen toggle
  const toggleFullscreen = () => {
    if (isFullscreen) {
      setIsFullscreen(false);
      setIsRotated(false);
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      } catch (e) {}
    } else {
      setIsFullscreen(true);
      if (window.innerHeight > window.innerWidth) {
        setIsRotated(true);
      }
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } catch (e) {}
    }
  };

  // Request Native Browser Fullscreen on user click
  const requestNativeFullscreen = () => {
    try {
      const el = containerRef.current || document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } catch (e) {
      console.warn("Native fullscreen request error:", e);
    }
  };

  // Listen to native exit fullscreen (e.g. user pressed ESC or swipe)
  useEffect(() => {
    const handleNativeFsChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        // Native exited, keep theater mode or update
      }
    };
    document.addEventListener("fullscreenchange", handleNativeFsChange);
    return () => document.removeEventListener("fullscreenchange", handleNativeFsChange);
  }, [isFullscreen]);

  // YouTube player onReady handler
  const handleReady = (event) => {
    const player = event.target;
    playerRef.current = player;
    setPlayerReady(true);

    // Give YouTube Iframe API 150ms to finish DOM binding before sending postMessages
    setTimeout(() => {
      safeCall((p) => {
        // Luôn bật tiếng khi video sẵn sàng — member tự mute nếu muốn
        if (!isHost) {
          p.setVolume(hostVolume);
          if (playback?.memberMuted || hostVolume === 0) {
            p.mute();
            setIsMuted(true);
          } else {
            p.unMute();
            setIsMuted(false);
          }
        }

        // Apply current playback state right away
        if (playback?.state === "playing") {
          applySharedPlayback();
        } else if (playback?.state === "paused") {
          p.pauseVideo();
          if (typeof playback.pausedAt === "number") {
            p.seekTo(playback.pausedAt, true);
          }
        }
      });
    }, 150);
  };

  // Toggle local mute
  const toggleMute = () => {
    safeCall((p) => {
      if (isMuted) {
        p.unMute();
        setIsMuted(false);
      } else {
        p.mute();
        setIsMuted(true);
      }
    });
  };

  // Listen to remote playback state changes (for Member & Host)
  useEffect(() => {
    if (!playerReady || !playback) return;

    if (playback.state !== "playing" && playbackStartTimerRef.current) {
      clearTimeout(playbackStartTimerRef.current);
      playbackStartTimerRef.current = null;
    }

    safeCall((player) => {
      if (playback.state === "paused") {
        player.pauseVideo();
        if (typeof playback.pausedAt === "number") {
          const current = player.getCurrentTime();
          if (typeof current === "number" && Math.abs(current - playback.pausedAt) > 0.3) {
            player.seekTo(playback.pausedAt, true);
          }
        }
        setSyncStatus("Tạm dừng");
      } else if (playback.state === "playing") {
        applySharedPlayback();
        setSyncStatus("Đang đồng bộ...");
      }
    });
  }, [playback?.state, playback?.pausedAt, playback?.anchorServerTime, playback?.videoId, playerReady, safeCall, applySharedPlayback]);

  const hostVolume = Number.isFinite(Number(peerPositions?.[memberId]?.hostVolume))
    ? Math.max(0, Math.min(100, Number(peerPositions[memberId].hostVolume)))
    : 100;

  useEffect(() => {
    if (isHost || !playerReady) return;
    safeCall((player) => {
      player.setVolume(hostVolume);
      if (playback?.memberMuted || hostVolume === 0) {
        player.mute();
        setIsMuted(true);
      } else {
        player.unMute();
        setIsMuted(false);
      }
    });
  }, [hostVolume, playback?.memberMuted, isHost, playerReady, safeCall]);

  // An explicit host seek is intentional, so reset every device to that point.
  useEffect(() => {
    if (!playerReady || !playback?.seekTrigger || playback.seekTrigger === lastSeekTriggerRef.current) return;
    lastSeekTriggerRef.current = playback.seekTrigger;

    safeCall((player) => {
      const target = playback.state === "playing" && playback.anchorServerTime
        ? Math.max(0, (getServerTime() - playback.anchorServerTime) / 1000)
        : Math.max(0, playback.pausedAt || 0);
      player.seekTo(target, true);
    });
  }, [playerReady, playback?.seekTrigger, playback?.state, playback?.anchorServerTime, playback?.pausedAt, safeCall]);

  // ==========================================
  // Follow the furthest active player. Corrections only move playback forward,
  // so a device that is already ahead never gets pulled back.
  // ==========================================
  useEffect(() => {
    if (!playerReady) return;

    const interval = setInterval(() => {
      safeCall((player) => {
        if (playback?.state !== "playing" || !playback.anchorServerTime) {
          return;
        }

        const currentServerTime = getServerTime();
        if (currentServerTime < playback.anchorServerTime) {
          player.pauseVideo();
          player.seekTo(0, true);
          return;
        }

        // Calculate target time from the shared start point.
        const currentTime = player.getCurrentTime();

        if (typeof currentTime !== "number" || isNaN(currentTime)) return;

        const targetTime = getFastestPlaybackTarget({
          currentServerTime,
          anchorServerTime: playback.anchorServerTime,
          currentTime,
          videoId: playback.videoId,
          seekTrigger: playback.seekTrigger,
          peerPositions: peerPositionsRef.current
        });

        const diff = targetTime - currentTime;
        setCurrentDiff(diff);

        // Never seek backwards; wait for other devices to catch up instead.
        if (diff > 0.4) {
          player.seekTo(targetTime, true);
          setSyncStatus(`Bắt kịp thiết bị nhanh nhất (+${diff.toFixed(2)}s)`);
        } 
        // Close small positive gaps by briefly increasing playback speed.
        else if (diff > 0.1) {
          if (!isAdjustingRateRef.current) {
            isAdjustingRateRef.current = true;
            const rate = 1.05;
            player.setPlaybackRate(rate);
            setPlaybackRate(rate);
            setSyncStatus(`Lệch nhẹ (${(diff * 1000).toFixed(0)}ms) -> Chỉnh tốc độ ${rate}x`);

            rateAdjustTimeoutRef.current = setTimeout(() => {
              safeCall((p) => {
                p.setPlaybackRate(1.0);
                setPlaybackRate(1.0);
                isAdjustingRateRef.current = false;
                setSyncStatus("Đã theo kịp thiết bị nhanh nhất");
              });
            }, 1500);
          }
        } else {
          setSyncStatus("Đang theo thiết bị nhanh nhất");
        }
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      if (rateAdjustTimeoutRef.current) clearTimeout(rateAdjustTimeoutRef.current);
      safeCall((player) => player.setPlaybackRate(1.0));
      isAdjustingRateRef.current = false;
    };
  }, [playerReady, playback?.state, playback?.anchorServerTime, playback?.videoId, playback?.seekTrigger, safeCall]);

  // Handle Video Ended
  const handleEnd = () => {
    if (onSongEnd && playback?.videoId) {
      const endedAt = safeCall((player) => player.getCurrentTime());
      safeCall((player) => player.pauseVideo());
      onSongEnd(
        typeof endedAt === "number" && Number.isFinite(endedAt) ? endedAt : undefined,
        playback.videoId
      );
    }
  };

  // A new video can load after the room update has already triggered the first
  // play/seek calls. If YouTube reports it paused or cued, retry against the
  // current shared anchor once the iframe has had time to load the new video.
  const handlePlayerStateChange = (event) => {
    if (isHost || playback?.state !== "playing") return;

    const playerState = event.data;
    const isNotPlaying = playerState === -1 || playerState === 2 || playerState === 5;
    if (!isNotPlaying) {
      if (playbackRecoveryTimerRef.current) {
        clearTimeout(playbackRecoveryTimerRef.current);
        playbackRecoveryTimerRef.current = null;
      }
      return;
    }

    if (playbackRecoveryTimerRef.current) clearTimeout(playbackRecoveryTimerRef.current);
    const expectedVideoId = playback.videoId;
    playbackRecoveryTimerRef.current = setTimeout(() => {
      playbackRecoveryTimerRef.current = null;
      if (playback?.state !== "playing" || playback?.videoId !== expectedVideoId) return;

      safeCall((player) => {
        if (player.getPlayerState() === 1) return;
        const anchor = playback.anchorServerTime;
        const target = Number.isFinite(anchor)
          ? Math.max(0, (getServerTime() - anchor) / 1000)
          : 0;
        player.seekTo(target, true);
        player.playVideo();
      });
    }, 900);
  };

  // YouTube Player Options
  const playerOpts = {
    height: "100%",
    width: "100%",
    playerVars: {
      autoplay: 1,
      // On mobile/member, disable native controls so users don't break sync accidentally
      controls: isHost ? 1 : 0,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
      fs: 1,
      disablekb: isHost ? 0 : 1
    }
  };

  if (!playback?.videoId) {
    return (
      <div className="w-full aspect-video bg-slate-900/90 rounded-2xl md:rounded-3xl border border-slate-800 flex flex-col items-center justify-center p-6 text-center shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-slate-800/80 flex items-center justify-center text-red-400 mb-4 animate-pulse">
          <Tv className="w-8 h-8" />
        </div>
        <h3 className="text-base md:text-lg font-bold text-white mb-1">
          Chưa có bài hát nào được chọn
        </h3>
        <p className="text-xs md:text-sm text-slate-400 max-w-sm mb-4">
          {isHost
            ? "Tìm kiếm bài hát hoặc dán link YouTube bên cạnh để bắt đầu hát ngay!"
            : "Đang chờ Host chọn bài hát đầu tiên..."}
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full flex flex-col space-y-2">
      {/* Video Container (Normal or 100% Fullscreen Theater Mode) */}
      <div 
        className={
          isFullscreen
            ? "player-fullscreen fixed inset-0 z-[100] bg-black flex items-center justify-center overflow-hidden animate-fade-in"
            : "relative w-full aspect-video bg-black rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl border border-slate-800"
        }
      >
        <div 
          className={
            isFullscreen
              ? isRotated
                ? "rotate-landscape-mode yt-wrapper flex items-center justify-center"
                : "w-full h-full yt-wrapper flex items-center justify-center"
              : "w-full h-full yt-wrapper relative"
          }
        >
          <YouTube
            videoId={playback.videoId}
            opts={playerOpts}
            onReady={handleReady}
            onEnd={handleEnd}
            onStateChange={handlePlayerStateChange}
            onError={(e) => {
              console.warn("YouTube Player error:", e);
              setSyncStatus("Lỗi tải video YouTube (vui lòng chọn bài khác)");
            }}
            className="w-full h-full"
            iframeClassName="w-full h-full"
          />

          {/* Sync status overlay badge (hidden in fullscreen for cleaner view) */}
          {!isHost && !isFullscreen && (
            <div className="absolute top-3 left-3 pointer-events-none flex items-center gap-1.5 px-3 py-1.5 bg-black/80 backdrop-blur-md rounded-full border border-white/20 text-xs text-white z-30 shadow-xl">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 sync-live"></span>
              <span className="font-mono text-emerald-300 font-bold">{syncStatus}</span>
            </div>
          )}

          {/* Top Right Floating Controls in Fullscreen or Normal mode */}
          <div className="absolute top-3 right-3 z-[110] flex items-center gap-2">
            {/* If in fullscreen on portrait phone: Button to Rotate screen */}
            {isFullscreen && (
              <button
                onClick={() => setIsRotated(!isRotated)}
                title={isRotated ? "Chuyển về khung dọc" : "Xoay ngang màn hình để xem to nhất"}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 hover:bg-black/95 backdrop-blur-md text-amber-300 border border-amber-400/30 text-xs font-bold shadow-xl transition active:scale-95"
              >
                <RotateCw className="w-4 h-4 text-amber-400" />
                <span>{isRotated ? "Xoay dọc" : "Xoay ngang"}</span>
              </button>
            )}

            {/* Native browser fullscreen button on tap */}
            {isFullscreen && (
              <button
                onClick={requestNativeFullscreen}
                title="Toàn màn hình trình duyệt"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/80 hover:bg-black/95 backdrop-blur-md text-white border border-white/20 text-xs font-semibold shadow-xl transition active:scale-95"
              >
                <Expand className="w-3.5 h-3.5 text-red-400" />
                <span className="hidden sm:inline">Tràn viền</span>
              </button>
            )}

            {/* Fullscreen / Minimize toggle button */}
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "Thu nhỏ màn hình" : "Phóng to toàn màn hình"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-xl transition active:scale-95 ${
                isFullscreen
                  ? "bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700"
                  : "bg-red-500 hover:bg-red-600 text-white shadow-red-500/30"
              }`}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-4 h-4 text-red-400" />
                  <span>Thu nhỏ</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4" />
                  <span>Toàn màn hình</span>
                </>
              )}
            </button>

            {/* Member Mute toggle in overlay */}
            {!isHost && (
              <button
                onClick={toggleMute}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md text-xs font-bold shadow-xl transition active:scale-95 ${
                  isMuted
                    ? "bg-rose-500 text-white animate-bounce"
                    : "bg-black/80 text-slate-200 border border-white/20"
                }`}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                <span className="hidden sm:inline">{isMuted ? "Bật tiếng" : "Tắt tiếng"}</span>
              </button>
            )}
          </div>

          {/* Fullscreen song title banner */}
          {isFullscreen && (
            <div className="absolute bottom-4 left-4 right-4 z-[110] flex items-center justify-between gap-3 pointer-events-none">
              <div className="bg-black/85 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-white/15 max-w-[50%] sm:max-w-md shadow-2xl">
                {titleToDisplay && <h3 className="text-white font-extrabold text-xs sm:text-sm truncate">{titleToDisplay}</h3>}
                <p className="text-[10px] sm:text-[11px] text-red-400 font-semibold mt-0.5">🎤 Karaoke Realtime Sync</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Member Audio Notice Banner (If Muted on mobile) */}
      {!isHost && isMuted && !isFullscreen && (
        <div className="flex items-center justify-between gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-300">
          <div className="flex items-center gap-2">
            <VolumeX className="w-4 h-4 flex-shrink-0" />
            <span>Bạn đang tắt tiếng. Nhấn nút để bật lại âm thanh.</span>
          </div>
          <button
            onClick={toggleMute}
            className="px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium text-xs whitespace-nowrap transition"
          >
            Bật tiếng
          </button>
        </div>
      )}

      {/* Song Title & Status bar */}
      {!isFullscreen && (
        <div className="flex items-center justify-between gap-3 px-1 py-1">
          <div className="min-w-0 flex-1">
            {titleToDisplay && (
              <h2 className="text-sm md:text-base font-bold text-white truncate" title={titleToDisplay}>
                {titleToDisplay || `Video ${playback.videoId}`}
              </h2>
            )}
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <span
                  className={`w-2 h-2 rounded-full ${
                    playback.state === "playing" ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                ></span>
                <span className="capitalize">{playback.state === "playing" ? "Đang phát" : "Tạm dừng"}</span>
              </span>
              {!isHost && (
                <span className="text-[11px] font-mono text-slate-500">
                  | Lệch: {(currentDiff * 1000).toFixed(0)}ms
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Auto-fullscreen preference toggle for member */}
            {!isHost && (
              <button
                onClick={() => setAutoFullscreenEnabled(!autoFullscreenEnabled)}
                title="Bật/Tắt tự động full màn hình khi qua bài mới"
                className={`text-[11px] px-2.5 py-1 rounded-lg border flex items-center gap-1 transition ${
                  autoFullscreenEnabled
                    ? "bg-red-500/20 border-red-500/40 text-red-300 font-semibold"
                    : "bg-slate-800/60 border-slate-700 text-slate-400"
                }`}
              >
                <Maximize2 className="w-3 h-3" />
                <span>Auto-Full: {autoFullscreenEnabled ? "Bật" : "Tắt"}</span>
              </button>
            )}

            {/* Host Indicator */}
            {isHost && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/60 px-2.5 py-1 rounded-lg border border-slate-700/60">
                <span className="font-semibold text-slate-300">Màn hình Host</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
