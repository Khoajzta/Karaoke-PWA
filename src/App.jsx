import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  rtdb, 
  ref, 
  onValue, 
  get,
  runTransaction,
  update, 
  remove, 
  push, 
  getServerTime,
  onDisconnect 
} from "./firebase";
import { useAuth } from "./context/AuthContext";
import { requestWakeLock, releaseWakeLock } from "./utils/wakeLock";
import { Navbar } from "./components/Navbar";
import { RoomLobby } from "./components/RoomLobby";
import { KaraokePlayer } from "./components/KaraokePlayer";
import { HostControls } from "./components/HostControls";
import { SongSearch } from "./components/SongSearch";
import { QueueList } from "./components/QueueList";
import { QRCodeModal } from "./components/QRCodeModal";
import { AuthModal } from "./components/AuthModal";
import { ConfigModal } from "./components/ConfigModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { isRoomHost, isRoomOwner as checkRoomOwner } from "./utils/roomRoles";
import { 
  Sparkles, 
  QrCode, 
  Copy, 
  Check, 
  Users, 
  Search, 
  ListMusic, 
  Tv, 
  Smartphone,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  RefreshCw,
  LogOut
} from "lucide-react";

export function App() {
  const { user, loading: authLoading, isConfigured } = useAuth();
  const hostPlayerRef = useRef(null);

  // App Navigation & Room State
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [guestRoomName, setGuestRoomName] = useState("");
  const [createdRoomId, setCreatedRoomId] = useState(null); // Keeps Host identity even while fetching
  const [roomData, setRoomData] = useState(null);
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomError, setRoomError] = useState(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [pendingCreateRoom, setPendingCreateRoom] = useState(false);
  const [copiedRule, setCopiedRule] = useState(false);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);

  // Modals state
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isQROpen, setIsQROpen] = useState(false);
  const [authModalConfig, setAuthModalConfig] = useState({
    isOpen: false,
    requiredGoogle: false,
    title: "ÄÄƒng nháº­p",
    pendingRoomCode: null,
    pendingAction: null
  });

  // Mobile Tab switch for Member and Host
  const [mobileTab, setMobileTab] = useState("queue"); // 'queue' | 'search'
  const [hostMobileTab, setHostMobileTab] = useState("queue"); // 'queue' | 'search' | 'info'

  // Keep a shared-room link pending until anonymous guests provide a room name.
  const [urlRoomCode, setUrlRoomCode] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    let code = roomParam?.trim().toUpperCase() || "";
    if (roomParam) setUrlRoomCode(code);
    if (!code) {
      try {
        code = localStorage.getItem("karaoke_host_room_id") || "";
      } catch (error) {
        console.warn("Could not read the remembered host room:", error);
      }
    }
    if (!code) return;

    // Wait until Firebase Auth finishes loading session before making any decisions!
    if (authLoading || !isConfigured) return;

    if (user && !user.isAnonymous) {
      if (roomParam) {
        setCurrentRoomId(code);
        try {
          localStorage.setItem("karaoke_host_room_id", code);
        } catch (error) {
          console.warn("Could not remember the host room:", error);
        }
      } else {
        let cancelled = false;
        get(ref(rtdb, `rooms/${code}`))
          .then((snapshot) => {
            if (cancelled) return;
            if (snapshot.exists() && snapshot.val()?.info?.hostUid === user.uid) {
              setCurrentRoomId(code);
            } else {
              localStorage.removeItem("karaoke_host_room_id");
            }
          })
          .catch((error) => {
            console.warn("Could not restore the host room:", error);
          });
        return () => {
          cancelled = true;
        };
      }
    }
  }, [user, isConfigured, authLoading]);

  // Determine if current user is Host
  const isHost = useMemo(() => {
    return isRoomHost({
      userId: user?.uid,
      hostUid: roomData?.info?.hostUid,
      coHosts: roomData?.info?.coHosts,
      createdRoomId,
      currentRoomId
    });
  }, [user, createdRoomId, currentRoomId, roomData?.info?.hostUid, roomData?.info?.coHosts]);

  const isRoomOwner = useMemo(() => checkRoomOwner({
    userId: user?.uid,
    hostUid: roomData?.info?.hostUid,
    createdRoomId,
    currentRoomId
  }), [user, createdRoomId, currentRoomId, roomData?.info?.hostUid]);

  // Keep a host's active room recoverable if the query string is lost on reload.
  useEffect(() => {
    if (!currentRoomId || !isRoomOwner) return;
    try {
      localStorage.setItem("karaoke_host_room_id", currentRoomId);
    } catch (error) {
      console.warn("Could not remember the host room:", error);
    }
  }, [currentRoomId, isRoomOwner]);

  // Listen to Room in Firebase RTDB
  useEffect(() => {
    if (!currentRoomId || !rtdb) {
      setRoomData(null);
      setRoomError(null);
      setRoomLoading(false);
      return;
    }

    setRoomLoading(true);
    setRoomError(null);

    const roomRef = ref(rtdb, `rooms/${currentRoomId}`);
    const unsubscribe = onValue(
      roomRef, 
      (snapshot) => {
        setRoomLoading(false);
        if (snapshot.exists()) {
          setRoomData(snapshot.val());
          setRoomError(null);
        } else {
          setRoomError(`Chá»§ phÃ²ng Ä‘Ã£ rá»i hoáº·c phÃ²ng "${currentRoomId}" Ä‘Ã£ Ä‘Æ°á»£c giáº£i tÃ¡n!`);
          setRoomData(null);
          setRoomError(null);
          setCurrentRoomId(null);
          setCreatedRoomId(null);
          setGuestRoomName("");
          window.history.pushState({ path: window.location.pathname }, "", window.location.pathname);
        }
      },
      (error) => {
        setRoomLoading(false);
        console.error("RTDB Room Listener Error:", error);
        setRoomError(error.message || "Lá»—i Ä‘á»c dá»¯ liá»‡u phÃ²ng tá»« Firebase RTDB");
      }
    );

    return () => unsubscribe();
  }, [currentRoomId]);

  // Screen WakeLock management
  useEffect(() => {
    if (currentRoomId) {
      requestWakeLock().then((active) => setWakeLockActive(active));
    } else {
      releaseWakeLock();
      setWakeLockActive(false);
    }

    return () => {
      releaseWakeLock();
    };
  }, [currentRoomId]);

  // Realtime Presence: Track user in rooms/${currentRoomId}/members/${user.uid}
  useEffect(() => {
    if (!currentRoomId || !user?.uid || !rtdb) return;

    const memberRef = ref(rtdb, `rooms/${currentRoomId}/members/${user.uid}`);
    const membersRef = ref(rtdb, `rooms/${currentRoomId}/members`);
    const connectedRef = ref(rtdb, ".info/connected");
    const memberData = {
      uid: user.uid,
      name: user.isAnonymous
        ? guestRoomName || user.displayName || (isHost ? "Host" : "KhÃ¡ch")
        : user.displayName || "ThÃ nh viÃªn",
      photoURL: user.photoURL || null,
      isHost: Boolean(isHost),
      joinedAt: Date.now()
    };

    let active = true;
    let disconnectRef = null;
    let registering = false;
    let connectionGeneration = 0;
    const unsubscribe = onValue(connectedRef, async (snapshot) => {
      if (!snapshot.val()) {
        connectionGeneration += 1;
        registering = false;
        return;
      }
      if (registering) return;
      registering = true;
      const generation = connectionGeneration;
      try {
        disconnectRef = onDisconnect(memberRef);
        await disconnectRef.remove();
        if (!active || generation !== connectionGeneration) return;

        const result = await runTransaction(membersRef, (members) => {
          if (members?._state === "deleting") return;
          return { ...(members || {}), [user.uid]: memberData };
        });
        if (!active || generation !== connectionGeneration) {
          if (result.committed) await remove(memberRef);
          return;
        }
        if (!result.committed && active) {
          setRoomError("PhÃ²ng nÃ y Ä‘ang Ä‘Æ°á»£c Ä‘Ã³ng vÃ¬ khÃ´ng cÃ²n ngÆ°á»i tham gia.");
        }
      } catch (error) {
        console.error("Failed to register room presence:", error);
      } finally {
        if (generation === connectionGeneration) registering = false;
      }
    });

    return () => {
      active = false;
      unsubscribe();
      remove(memberRef).catch((error) => console.warn("Failed to clear room presence:", error));
      disconnectRef?.cancel().catch(() => {});
    };
  }, [currentRoomId, user?.uid, user?.displayName, user?.isAnonymous, guestRoomName, isHost]);

  // Sorted list of current members in room
  const membersList = useMemo(() => {
    if (!roomData?.members) return [];
    return Object.entries(roomData.members)
      .filter(([key, member]) => key !== "_state" && member != null)
      .map(([, member]) => member)
      .sort((a, b) => {
      if (a.isHost) return -1;
      if (b.isHost) return 1;
      return (a.joinedAt || 0) - (b.joinedAt || 0);
      });
  }, [roomData?.members]);

  const memberCount = membersList.length;

  // Convert queue object to sorted array by `order`
  const queueItems = useMemo(() => {
    if (!roomData?.queue) return [];
    return Object.entries(roomData.queue)
      .map(([id, item]) => ({
        id,
        ...item
      }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [roomData?.queue]);

  // Handle Join Room from Lobby
  const handleJoinRoom = (code, asCreator = false, roomGuestName = "") => {
    setGuestRoomName(roomGuestName.trim());
    if (asCreator) {
      setCreatedRoomId(code);
      try {
        localStorage.setItem("karaoke_host_room_id", code);
      } catch (error) {
        console.warn("Could not remember the host room:", error);
      }
    }
    setCurrentRoomId(code);
    setRoomError(null);
    // Update browser URL query without reload
    const newUrl = `${window.location.pathname}?room=${code}`;
    window.history.pushState({ path: newUrl }, "", newUrl);
  };

  const handleAddHost = async (member) => {
    if (!isHost || !currentRoomId || !user?.uid || !member?.uid || member.uid === user.uid) return false;
    if (!window.confirm(`ThÃªm ${member.name || "khÃ¡ch"} lÃ m host? Báº¡n váº«n giá»¯ quyá»n host.`)) {
      return false;
    }

    try {
      const targetRef = ref(rtdb, `rooms/${currentRoomId}/members/${member.uid}`);
      const targetSnapshot = await get(targetRef);
      if (!targetSnapshot.exists()) {
        window.alert("ThÃ nh viÃªn nÃ y Ä‘Ã£ rá»i phÃ²ng.");
        return false;
      }

      const infoRef = ref(rtdb, `rooms/${currentRoomId}/info`);
      const result = await runTransaction(infoRef, (info) => {
        const actorIsHost = info?.hostUid === user.uid || Boolean(info?.coHosts?.[user.uid]);
        if (!info || !actorIsHost || info.hostUid === member.uid || info.coHosts?.[member.uid]) return;
        return {
          ...info,
          coHosts: {
            ...(info.coHosts || {}),
            [member.uid]: true
          }
        };
      });

      if (!result.committed) {
        window.alert("KhÃ´ng thá»ƒ thÃªm host. NgÆ°á»i nÃ y cÃ³ thá»ƒ Ä‘Ã£ Ä‘Æ°á»£c cáº¥p quyá»n hoáº·c quyá»n host Ä‘Ã£ thay Ä‘á»•i.");
        return false;
      }

      return true;
    } catch (error) {
      console.error("Failed to transfer host role:", error);
      window.alert(error.message || "KhÃ´ng thá»ƒ chuyá»ƒn quyá»n host lÃºc nÃ y.");
      return false;
    }
  };

  const handleRemoveHost = async (member) => {
    if (!isRoomOwner || !currentRoomId || !user?.uid || !member?.uid || member.uid === user.uid) return false;
    if (!window.confirm(`Gá»¡ quyá»n host cá»§a ${member.name || "thÃ nh viÃªn"}? NgÆ°á»i nÃ y váº«n á»Ÿ láº¡i phÃ²ng.`)) {
      return false;
    }

    try {
      const infoRef = ref(rtdb, `rooms/${currentRoomId}/info`);
      const result = await runTransaction(infoRef, (info) => {
        if (info?.hostUid !== user.uid || !info.coHosts?.[member.uid]) return;
        const coHosts = { ...info.coHosts };
        delete coHosts[member.uid];
        return { ...info, coHosts };
      });

      if (!result.committed) {
        window.alert("KhÃ´ng thá»ƒ gá»¡ quyá»n host. HÃ£y kiá»ƒm tra danh sÃ¡ch host rá»“i thá»­ láº¡i.");
        return false;
      }

      return true;
    } catch (error) {
      console.error("Failed to remove co-host:", error);
      window.alert(error.message || "KhÃ´ng thá»ƒ gá»¡ quyá»n host lÃºc nÃ y.");
      return false;
    }
  };

  const handleSetMemberVolume = async (member, volume) => {
    if (!isHost || !currentRoomId || !member?.uid || member.isHost) return;
    await update(ref(rtdb, `rooms/${currentRoomId}/members/${member.uid}`), {
      hostVolume: Math.max(0, Math.min(100, Number(volume)))
    });
  };

  // Handle Leave Room: If Host leaves, remove the room completely from RTDB
  const handleLeaveRoom = async () => {
    const targetRoomId = currentRoomId;

    if (isRoomOwner && targetRoomId) {
      const confirmDelete = window.confirm(
        `Báº¡n lÃ  Chá»§ phÃ²ng (Host).\nNáº¿u báº¡n rá»i phÃ²ng, phÃ²ng "${targetRoomId}" sáº½ bá»‹ XÃ“A vÃ  toÃ n bá»™ thÃ nh viÃªn sáº½ Ä‘Æ°á»£c giáº£i tÃ¡n.\nBáº¡n cÃ³ cháº¯c cháº¯n muá»‘n rá»i vÃ  xÃ³a phÃ²ng khÃ´ng?`
      );
      if (!confirmDelete) return;

      try {
        await remove(ref(rtdb, `rooms/${targetRoomId}`));
      } catch (err) {
        console.error("Lá»—i khi xÃ³a phÃ²ng khá»i RTDB:", err);
        window.alert(err.message || "Không thể giải tán phòng. Vui lòng thử lại.");
        return;
      }
    }

    if (!isHost && targetRoomId && user?.uid && rtdb) {
      try {
        await remove(ref(rtdb, `rooms/${targetRoomId}/members/${user.uid}`));
        const membersRef = ref(rtdb, `rooms/${targetRoomId}/members`);
        const result = await runTransaction(membersRef, (members) => {
          const activeMembers = Object.entries(members || {})
            .filter(([key, member]) => key !== "_state" && member != null);
          if (activeMembers.length > 0) return;
          return { _state: "deleting" };
        });
        if (result.committed) {
          await remove(ref(rtdb, `rooms/${targetRoomId}`));
        }
      } catch (err) {
        console.error("Failed to clean up the empty room:", err);
      }
    }

    setCurrentRoomId(null);
    setCreatedRoomId(null);
    setRoomData(null);
    setRoomError(null);
    setGuestRoomName("");
    try {
      if (localStorage.getItem("karaoke_host_room_id") === targetRoomId) {
        localStorage.removeItem("karaoke_host_room_id");
      }
    } catch (error) {
      console.warn("Could not clear the remembered host room:", error);
    }
    const cleanUrl = window.location.pathname;
    window.history.pushState({ path: cleanUrl }, "", cleanUrl);
  };

  // Add song to Queue
  const handleAddToQueue = async (song) => {
    if (!currentRoomId) return;
    const maxOrder = queueItems.length > 0 
      ? Math.max(...queueItems.map((q) => q.order || 0)) 
      : 0;

    const queueRef = ref(rtdb, `rooms/${currentRoomId}/queue`);
    await push(queueRef, {
      videoId: song.videoId,
      title: song.title,
      thumbnail: song.thumbnail,
      addedBy: song.addedBy || user?.displayName || "KhÃ¡ch",
      addedByUid: song.addedByUid || user?.uid || "anon",
      order: maxOrder + 1,
      createdAt: getServerTime()
    });
  };

  // Host: Play a song immediately (Play Now)
  const handlePlayNow = async (song) => {
    if (!isHost || !currentRoomId) return;
    // Give every YouTube iframe time to load the new video before its shared start.
    const startAtServerTime = getServerTime() + 3000;

    await update(ref(rtdb, `rooms/${currentRoomId}/playback`), {
      videoId: song.videoId,
      title: song.title,
      state: "playing",
      anchorServerTime: startAtServerTime,
      pausedAt: 0
    });

    // If item was in queue, remove it
    if (song.id) {
      await remove(ref(rtdb, `rooms/${currentRoomId}/queue/${song.id}`));
    }
  };

  // Host: Next song (take top of queue)
  const handleNextSong = async (endedAt) => {
    if (!isHost || !currentRoomId) return;

    if (queueItems.length > 0) {
      const nextSong = queueItems[0];
      const startAtServerTime = getServerTime() + 3000;

      await update(ref(rtdb, `rooms/${currentRoomId}/playback`), {
        videoId: nextSong.videoId,
        title: nextSong.title,
        state: "playing",
        anchorServerTime: startAtServerTime,
        pausedAt: 0
      });

      // Remove from queue
      await remove(ref(rtdb, `rooms/${currentRoomId}/queue/${nextSong.id}`));
    } else {
      // Pause if no more songs
      await update(ref(rtdb, `rooms/${currentRoomId}/playback`), {
        state: "paused",
        pausedAt: typeof endedAt === "number" ? endedAt : roomData?.playback?.pausedAt || 0
      });
    }
  };

  // Host: Reorder Queue items (drag & drop)
  const handleReorderQueue = async (newOrderedItems) => {
    if (!isHost || !currentRoomId) return;
    const updates = {};
    newOrderedItems.forEach((item, index) => {
      updates[`rooms/${currentRoomId}/queue/${item.id}/order`] = index + 1;
    });
    await update(ref(rtdb), updates);
  };

  // Host: Remove from Queue
  const handleRemoveFromQueue = async (itemId) => {
    if (!isHost || !currentRoomId) return;
    await remove(ref(rtdb, `rooms/${currentRoomId}/queue/${itemId}`));
  };

  const copyRuleSnippet = () => {
    const rulesJson = JSON.stringify({
      rules: {
        rooms: {
          $roomId: {
            ".read": true,
            ".write": "auth != null"
          }
        }
      }
    }, null, 2);
    navigator.clipboard.writeText(rulesJson);
    setCopiedRule(true);
    setTimeout(() => setCopiedRule(false), 2000);
  };

  if (authLoading && isConfigured) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-center p-4">
        <div className="w-12 h-12 rounded-full border-4 border-pink-500/20 border-t-pink-500 animate-spin mb-4"></div>
        <p className="text-sm font-semibold text-slate-300">Äang Ä‘á»“ng bá»™ phiÃªn Ä‘Äƒng nháº­p...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-pink-500 selection:text-white">
      {/* Top Navigation: Hidden when player is in fullscreen mode */}
      {!isPlayerFullscreen && (
        <Navbar
          roomId={currentRoomId}
          isHost={isHost}
          isRoomOwner={isRoomOwner}
          ownerUid={roomData?.info?.hostUid}
          onOpenConfig={() => setIsConfigOpen(true)}
          onOpenQR={() => setIsQROpen(true)}
          onLeaveRoom={handleLeaveRoom}
          onAddHost={handleAddHost}
          onRemoveHost={handleRemoveHost}
          onSetMemberVolume={handleSetMemberVolume}
          wakeLockActive={wakeLockActive}
          memberCount={memberCount}
          membersList={membersList}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        {!currentRoomId ? (
          /* Lobby Screen (Create / Join Room) */
          <RoomLobby
            onJoinRoom={handleJoinRoom}
            urlRoomCode={urlRoomCode}
            pendingCreateRoom={pendingCreateRoom}
            onClearPendingCreate={() => setPendingCreateRoom(false)}
            onRequireAuth={({ requiredGoogle, title, pendingRoomCode, pendingAction }) => {
              setAuthModalConfig({
                isOpen: true,
                requiredGoogle,
                title,
                pendingRoomCode,
                pendingAction
              });
            }}
          />
        ) : roomLoading && !roomData ? (
          /* Loading Room State */
          <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-14 h-14 rounded-full border-4 border-pink-500/20 border-t-pink-500 animate-spin mb-4"></div>
            <h3 className="text-xl font-bold text-white mb-1">
              Äang káº¿t ná»‘i phÃ²ng {currentRoomId}...
            </h3>
            <p className="text-xs text-slate-400 max-w-sm">
              Äang Ä‘á»“ng bá»™ tráº¡ng thÃ¡i video vÃ  dá»¯ liá»‡u thá»i gian thá»±c tá»« Firebase
            </p>
          </div>
        ) : roomError ? (
          /* Error State (e.g. Permission Denied) */
          <div className="flex-1 max-w-2xl mx-auto p-6 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">KhÃ´ng thá»ƒ táº£i dá»¯ liá»‡u phÃ²ng</h3>
            <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 px-4 py-2.5 rounded-xl mb-6 font-mono">
              {roomError}
            </p>

            {/* If Permission Denied: Provide instant instructions */}
            {(roomError.toLowerCase().includes("permission_denied") || roomError.toLowerCase().includes("permission denied")) && (
              <div className="w-full text-left bg-slate-900 border border-amber-500/30 rounded-2xl p-4 mb-6 text-xs text-amber-200 space-y-3">
                <div className="font-bold text-amber-300 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  <span>CÃ¡ch kháº¯c phá»¥c lá»—i Permission Denied trong Firebase Console:</span>
                </div>
                <p>
                  VÃ o <strong>Firebase Console</strong> &gt; Chá»n dá»± Ã¡n <strong>karaoke-pwa-1221e</strong> &gt; <strong>Realtime Database</strong> &gt; tab <strong>Rules</strong>, dÃ¡n Ä‘oáº¡n rules sau vÃ  báº¥m <strong>Publish</strong>:
                </p>
                <div className="relative bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300">
                  <pre>{`{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": "auth != null"
      }
    }
  }
}`}</pre>
                  <button
                    onClick={copyRuleSnippet}
                    className="absolute right-2 top-2 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1 text-[10px]"
                  >
                    {copiedRule ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedRule ? "ÄÃ£ chÃ©p" : "Sao chÃ©p"}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 px-4 py-2.5 bg-pink-500 hover:bg-pink-600 text-white rounded-xl text-xs font-semibold shadow-lg shadow-pink-500/20 transition"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Táº£i láº¡i trang</span>
              </button>
              <button
                onClick={handleLeaveRoom}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700 transition"
              >
                <LogOut className="w-4 h-4" />
                <span>Vá» sáº£nh chÃ­nh</span>
              </button>
            </div>
          </div>
        ) : (
          /* Room Active View */
          <div className="flex-1 max-w-7xl w-full mx-auto p-3 md:p-6 flex flex-col">
            {/* Host Layout: Responsive 2-column on PC, Tab-based on Mobile */}
            {isHost ? (
              <div className="flex flex-col flex-1 pb-16 lg:pb-0">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 items-start">
                  {/* Left Column (Desktop 8 cols, Mobile 1 col): Player, Controls & Mobile Tabs */}
                  <div className="lg:col-span-8 flex flex-col space-y-4">
                    <ErrorBoundary>
                      <KaraokePlayer
                        roomId={currentRoomId}
                        memberId={user?.uid}
                        peerPositions={roomData?.members}
                        isHost={true}
                        externalPlayerRef={hostPlayerRef}
                        playback={roomData?.playback}
                        nextSongTitle={queueItems[0]?.title}
                        onSongEnd={handleNextSong}
                        onFullscreenChange={setIsPlayerFullscreen}
                      />
                    </ErrorBoundary>

                    <HostControls
                      roomId={currentRoomId}
                      playback={roomData?.playback}
                      onNextSong={handleNextSong}
                      playerRef={hostPlayerRef}
                    />

                    {/* Mobile Host Tab Switcher (<lg only) */}
                    <div className="lg:hidden flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                      <button
                        onClick={() => setHostMobileTab("queue")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition ${
                          hostMobileTab === "queue"
                            ? "bg-pink-500 text-white shadow-md shadow-pink-500/25"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <ListMusic className="w-4 h-4" />
                        <span>HÃ ng chá» ({queueItems.length})</span>
                      </button>

                      <button
                        onClick={() => setHostMobileTab("search")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition ${
                          hostMobileTab === "search"
                            ? "bg-pink-500 text-white shadow-md shadow-pink-500/25"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Search className="w-4 h-4" />
                        <span>TÃ¬m bÃ i má»›i</span>
                      </button>

                      <button
                        onClick={() => setHostMobileTab("info")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition ${
                          hostMobileTab === "info"
                            ? "bg-pink-500 text-white shadow-md shadow-pink-500/25"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <QrCode className="w-4 h-4" />
                        <span>MÃ£ QR</span>
                      </button>
                    </div>

                    {/* Mobile Tab Content for Host (<lg only) */}
                    <div className="lg:hidden">
                      {hostMobileTab === "queue" && (
                        <QueueList
                          queueItems={queueItems}
                          isHost={true}
                          onReorder={handleReorderQueue}
                          onPlayNow={handlePlayNow}
                          onRemove={handleRemoveFromQueue}
                        />
                      )}

                      {hostMobileTab === "search" && (
                        <SongSearch
                          isHost={true}
                          onAddToQueue={handleAddToQueue}
                          onPlayNow={handlePlayNow}
                          onOpenConfig={() => setIsConfigOpen(true)}
                        />
                      )}

                      {hostMobileTab === "info" && (
                        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400">
                              <Users className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-slate-400">MÃ£ phÃ²ng:</span>
                                <span className="font-mono text-pink-400 font-bold text-base">{currentRoomId}</span>
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                  {memberCount} ngÆ°á»i Ä‘ang cÃ³ máº·t
                                </span>
                              </div>
                              <div className="text-xs text-slate-400 mt-1">
                                QuÃ©t mÃ£ QR hoáº·c chia sáº» link Ä‘á»ƒ báº¡n bÃ¨ cÃ¹ng hÃ¡t vÃ  chá»n bÃ i
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => setIsQROpen(true)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white rounded-xl font-bold transition text-xs shadow-lg shadow-pink-500/25"
                          >
                            <QrCode className="w-4 h-4" />
                            <span>Má»Ÿ MÃ£ QR ToÃ n MÃ n HÃ¬nh</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Room Info & QR Banner on Host Screen (Desktop only >= lg) */}
                    <div className="hidden lg:flex bg-slate-900/60 border border-slate-800 rounded-2xl p-4 items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400">
                          <Users className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-slate-400">PhÃ²ng:</span>
                            <span className="font-mono text-pink-400 font-bold">{currentRoomId}</span>
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                              {memberCount} ngÆ°á»i trong phÃ²ng
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            QuÃ©t mÃ£ QR hoáº·c nháº­p mÃ£ Ä‘á»ƒ báº¡n bÃ¨ cÃ¹ng hÃ¡t vÃ  thÃªm bÃ i
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => setIsQROpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-pink-500/20 hover:bg-pink-500 text-pink-300 hover:text-white rounded-xl border border-pink-500/30 transition text-xs font-semibold"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>Xem MÃ£ QR Chi Tiáº¿t</span>
                      </button>
                    </div>
                  </div>

                  {/* Right 30% (4 columns): Search & Queue for Host (Desktop only >= lg) */}
                  <div className="hidden lg:flex lg:col-span-4 flex-col space-y-4 h-[calc(100vh-100px)] sticky top-16">
                    {/* Search Section */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <SongSearch
                        isHost={true}
                        onAddToQueue={handleAddToQueue}
                        onPlayNow={handlePlayNow}
                        onOpenConfig={() => setIsConfigOpen(true)}
                      />
                    </div>

                    {/* Drag & Drop Queue Section */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <QueueList
                        queueItems={queueItems}
                        isHost={true}
                        onReorder={handleReorderQueue}
                        onPlayNow={handlePlayNow}
                        onRemove={handleRemoveFromQueue}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Member UX Layout (Responsive for Mobile & Desktop - Single Player Instance) */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 items-start pb-16 md:pb-6">
                {/* Left/Top: KaraokePlayer & Mobile Tabs */}
                <div className="lg:col-span-8 flex flex-col space-y-4">
                  <div className={isPlayerFullscreen ? "relative z-50" : "sticky top-14 z-30 lg:static bg-slate-950/95 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none pb-2 lg:pb-0 -mx-3 px-3 lg:mx-0 lg:px-0"}>
                    <ErrorBoundary>
                      <KaraokePlayer
                        roomId={currentRoomId}
                        memberId={user?.uid}
                        peerPositions={roomData?.members}
                        isHost={false}
                        playback={roomData?.playback}
                        nextSongTitle={queueItems[0]?.title}
                        onSongEnd={handleNextSong}
                        onFullscreenChange={setIsPlayerFullscreen}
                        onSwitchToSearch={() => {
                          setMobileTab("search");
                          setTimeout(() => {
                            window.scrollTo({ top: 320, behavior: "smooth" });
                          }, 100);
                        }}
                      />
                    </ErrorBoundary>

                    {/* Mobile Tab Switcher (<lg only) */}
                    <div className="lg:hidden flex bg-slate-900 p-1 rounded-xl mt-3 border border-slate-800">
                      <button
                        onClick={() => setMobileTab("queue")}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition ${
                          mobileTab === "queue"
                            ? "bg-pink-500 text-white shadow-md"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <ListMusic className="w-4 h-4" />
                        <span>Danh sÃ¡ch chá» ({queueItems.length})</span>
                      </button>

                      <button
                        onClick={() => setMobileTab("search")}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition ${
                          mobileTab === "search"
                            ? "bg-pink-500 text-white shadow-md"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Search className="w-4 h-4" />
                        <span>Chá»n bÃ i má»›i</span>
                      </button>
                    </div>
                  </div>

                  {/* Content on Mobile based on Tab (<lg) */}
                  <div className="lg:hidden flex-1 mt-2">
                    {mobileTab === "queue" ? (
                      <QueueList
                        queueItems={queueItems}
                        isHost={false}
                        onReorder={handleReorderQueue}
                        onPlayNow={handlePlayNow}
                        onRemove={handleRemoveFromQueue}
                      />
                    ) : (
                      <SongSearch
                        isHost={false}
                        onAddToQueue={handleAddToQueue}
                        onPlayNow={handlePlayNow}
                        onOpenConfig={() => setIsConfigOpen(true)}
                      />
                    )}
                  </div>
                </div>

                {/* Right on PC (>=lg): Both Search & Queue */}
                <div className="hidden lg:flex lg:col-span-4 flex-col space-y-4 h-[calc(100vh-100px)] sticky top-16">
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <SongSearch
                      isHost={false}
                      onAddToQueue={handleAddToQueue}
                      onPlayNow={handlePlayNow}
                      onOpenConfig={() => setIsConfigOpen(true)}
                    />
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <QueueList
                      queueItems={queueItems}
                      isHost={false}
                      onReorder={handleReorderQueue}
                      onPlayNow={handlePlayNow}
                      onRemove={handleRemoveFromQueue}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Global Modals */}
      <AuthModal
        isOpen={authModalConfig.isOpen}
        requiredGoogle={authModalConfig.requiredGoogle}
        title={authModalConfig.title}
        onClose={(googleLoginSucceeded = false) => {
          const action = authModalConfig.pendingAction;
          const code = authModalConfig.pendingRoomCode;
          setAuthModalConfig((prev) => ({ 
            ...prev, 
            isOpen: false, 
            pendingRoomCode: null, 
            pendingAction: null 
          }));

          if (action === "create" && googleLoginSucceeded) {
            setPendingCreateRoom(true);
          } else if (code && googleLoginSucceeded) {
            handleJoinRoom(code, false);
          }
        }}
      />

      <QRCodeModal
        isOpen={isQROpen}
        roomId={currentRoomId}
        onClose={() => setIsQROpen(false)}
      />

      <ConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
      />
    </div>
  );
}
