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
  set,
  getServerTime,
  onDisconnect 
} from "./firebase";
import databaseRules from "../database.rules.json";
import { useAuth } from "./context/AuthContext";
import { requestWakeLock, releaseWakeLock } from "./utils/wakeLock";
import { Navbar } from "./components/shared/Navbar";
import { RoomLobby } from "./screens/lobby/components/RoomLobby";
import { KaraokePlayer } from "./screens/room/components/KaraokePlayer";
import { HostControls } from "./screens/room/components/HostControls";
import { SongSearch } from "./screens/room/components/SongSearch";
import { QueueList } from "./screens/room/components/QueueList";
import { QRCodeModal } from "./components/shared/QRCodeModal";
import { AuthModal } from "./components/shared/AuthModal";
import { ConfigModal } from "./components/shared/ConfigModal";
import { AppDialog } from "./components/shared/AppDialog";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
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

const createPlaybackToken = (userId) => `${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const DEFAULT_MEMBER_QUEUE_LIMIT = 1;
const MAX_MEMBER_QUEUE_LIMIT = 20;

const getQueueItems = (room) => {
  const legacyItems = Object.entries(room?.queue || {})
    .filter(([, item]) => item?.videoId)
    .map(([queueId, item]) => ({
      ...item,
      id: `legacy:${queueId}`,
      queueId,
      queueOwnerUid: "__legacy__",
      queueSource: "queue",
      dbPath: `queue/${queueId}`
    }));
  const memberItems = Object.entries(room?.memberQueue || {}).flatMap(([ownerUid, memberQueue]) =>
    Object.entries(memberQueue || {}).filter(([, item]) => item?.videoId).map(([queueId, item]) => ({
      ...item,
      id: `member:${ownerUid}:${queueId}`,
      queueId,
      queueOwnerUid: ownerUid,
      queueSource: "memberQueue",
      dbPath: `memberQueue/${ownerUid}/${queueId}`
    }))
  );

  return [...legacyItems, ...memberItems].sort((a, b) => (a.order || 0) - (b.order || 0));
};

export function App() {
  const { user, loading: authLoading, isConfigured, logout } = useAuth();
  const hostPlayerRef = useRef(null);
  const pendingAdvanceRequestsRef = useRef(new Set());
  const rulesText = JSON.stringify(databaseRules, null, 2);

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
  const [queueAddsInProgress, setQueueAddsInProgress] = useState(0);
  const queueAddsInProgressRef = useRef(0);
  const pendingQueueEntryIdsRef = useRef(new Set());

  // Modals state
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isQROpen, setIsQROpen] = useState(false);
  const [authModalConfig, setAuthModalConfig] = useState({
    isOpen: false,
    requiredGoogle: false,
    title: "Đăng nhập",
    pendingRoomCode: null,
    pendingAction: null
  });
  const [dialogConfig, setDialogConfig] = useState(null);
  const dialogResolverRef = useRef(null);

  const showDialog = (config) => new Promise((resolve) => {
    dialogResolverRef.current = resolve;
    setDialogConfig({
      type: "confirm",
      title: "Xác nhận",
      confirmLabel: "Đồng ý",
      cancelLabel: "Hủy",
      variant: "default",
      ...config
    });
  });

  const closeDialog = (confirmed = false) => {
    const resolve = dialogResolverRef.current;
    dialogResolverRef.current = null;
    setDialogConfig(null);
    resolve?.(confirmed);
  };

  const showAlert = (message, title = "Thông báo") => showDialog({
    type: "alert",
    title,
    message,
    confirmLabel: "Đóng"
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

  // Remember an anonymous guest's room on this device so a refresh can restore
  // the same Firebase anonymous session directly into that room.
  useEffect(() => {
    if (authLoading || !isConfigured || !user) return;

    let rememberedGuestRoom;
    try {
      rememberedGuestRoom = JSON.parse(localStorage.getItem("karaoke_guest_room") || "null");
    } catch (error) {
      console.warn("Could not read the remembered guest room:", error);
      localStorage.removeItem("karaoke_guest_room");
      return;
    }

    if (!rememberedGuestRoom) return;
    if (!user.isAnonymous || rememberedGuestRoom.uid !== user.uid) {
      localStorage.removeItem("karaoke_guest_room");
      return;
    }

    const roomId = rememberedGuestRoom.roomId?.trim().toUpperCase();
    if (!roomId || !rememberedGuestRoom.guestName?.trim()) {
      localStorage.removeItem("karaoke_guest_room");
      return;
    }

    const requestedRoom = new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase();
    if (requestedRoom && requestedRoom !== roomId) return;

    let cancelled = false;
    get(ref(rtdb, `rooms/${roomId}`))
      .then((snapshot) => {
        if (cancelled) return;
        if (!snapshot.exists() || snapshot.val()?.members?._state === "deleting") {
          localStorage.removeItem("karaoke_guest_room");
          return;
        }

        setGuestRoomName(rememberedGuestRoom.guestName.trim());
        setCurrentRoomId(roomId);
      })
      .catch((error) => {
        console.warn("Could not restore the remembered guest room:", error);
      });

    return () => {
      cancelled = true;
    };
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
          setRoomError(`Chủ phòng đã rời hoặc phòng "${currentRoomId}" đã được giải tán!`);
          setRoomData(null);
          try {
            const rememberedGuestRoom = JSON.parse(localStorage.getItem("karaoke_guest_room") || "null");
            if (rememberedGuestRoom?.roomId === currentRoomId) {
              localStorage.removeItem("karaoke_guest_room");
            }
          } catch (error) {
            localStorage.removeItem("karaoke_guest_room");
          }
        }
      },
      (error) => {
        setRoomLoading(false);
        console.error("RTDB Room Listener Error:", error);
        setRoomError(error.message || "Không thể tải thông tin phòng. Hãy kiểm tra kết nối rồi thử lại.");
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
    if (!currentRoomId || !user?.uid || !rtdb || !roomData?.info?.hostUid) return;

    const memberRef = ref(rtdb, `rooms/${currentRoomId}/members/${user.uid}`);
    const connectedRef = ref(rtdb, ".info/connected");
    const memberData = {
      uid: user.uid,
      name: user.isAnonymous
        ? guestRoomName || user.displayName || (isHost ? "Host" : "Khách")
        : user.displayName || "Thành viên",
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

        const stateSnapshot = await get(ref(rtdb, `rooms/${currentRoomId}/members/_state`));
        if (stateSnapshot.exists()) {
          setRoomError("Phòng này đang được đóng vì không còn người tham gia.");
          return;
        }
        await set(memberRef, memberData);
        if (!active || generation !== connectionGeneration) await remove(memberRef);
      } catch (error) {
        console.error("Failed to register room presence:", error);
        if (active) setRoomError(error.message || "Không thể tham gia phòng. Hãy kiểm tra kết nối rồi thử lại.");
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
  }, [currentRoomId, roomData?.info?.hostUid, user?.uid, user?.displayName, user?.isAnonymous, guestRoomName, isHost]);

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
  const queueItems = useMemo(() => getQueueItems(roomData), [roomData?.queue, roomData?.memberQueue]);
  const maxSongsPerMember = Math.min(MAX_MEMBER_QUEUE_LIMIT, Math.max(
    1,
    Number(roomData?.queueSettings?.maxSongsPerMember) || DEFAULT_MEMBER_QUEUE_LIMIT
  ));
  const currentMemberQueueCount = user?.uid
    ? queueItems.filter((item) => item.addedByUid === user.uid).length
    : 0;
  const locallyQueuedAddsInProgress = queueItems.filter((item) =>
    item.addedByUid === user?.uid && pendingQueueEntryIdsRef.current.has(item.queueId)
  ).length;
  const queueSlotsUsed = Math.max(0, currentMemberQueueCount + queueAddsInProgress - locallyQueuedAddsInProgress);
  const queueLimitReached = queueSlotsUsed >= maxSongsPerMember;

  // Handle Join Room from Lobby
  const handleJoinRoom = (code, asCreator = false, roomGuestName = "") => {
    const trimmedGuestName = roomGuestName.trim();
    setGuestRoomName(trimmedGuestName);
    if (user?.isAnonymous && trimmedGuestName) {
      try {
        localStorage.setItem("karaoke_guest_room", JSON.stringify({
          roomId: code,
          guestName: trimmedGuestName,
          uid: user.uid
        }));
      } catch (error) {
        console.warn("Could not remember the guest room:", error);
      }
    }
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
    const confirmed = await showDialog({
      title: "Thêm host?",
      message: `Thêm ${member.name || "khách"} làm host? Bạn vẫn giữ quyền host.`,
      confirmLabel: "Thêm host"
    });
    if (!confirmed) return false;

    try {
      const targetRef = ref(rtdb, `rooms/${currentRoomId}/members/${member.uid}`);
      const targetSnapshot = await get(targetRef);
      if (!targetSnapshot.exists()) {
        await showAlert("Thành viên này đã rời phòng.");
        return false;
      }

      const coHostRef = ref(rtdb, `rooms/${currentRoomId}/info/coHosts/${member.uid}`);
      const result = await runTransaction(coHostRef, (isCoHost) => {
        if (isCoHost === true) return;
        return true;
      });

      if (!result.committed) {
        await showAlert("Không thể thêm host. Người này có thể đã được cấp quyền hoặc quyền host đã thay đổi.");
        return false;
      }

      return true;
    } catch (error) {
      console.error("Failed to transfer host role:", error);
      await showAlert(error.message || "Không thể chuyển quyền host lúc này.");
      return false;
    }
  };

  const handleRemoveHost = async (member) => {
    if (!isRoomOwner || !currentRoomId || !user?.uid || !member?.uid || member.uid === user.uid) return false;
    const confirmed = await showDialog({
      title: "Gỡ quyền host?",
      message: `Gỡ quyền host của ${member.name || "thành viên"}? Người này vẫn ở lại phòng.`,
      confirmLabel: "Gỡ host",
      variant: "danger"
    });
    if (!confirmed) return false;

    try {
      const coHostRef = ref(rtdb, `rooms/${currentRoomId}/info/coHosts/${member.uid}`);
      const result = await runTransaction(coHostRef, (isCoHost) => {
        if (isCoHost !== true) return;
        return null;
      });

      if (!result.committed) {
        await showAlert("Không thể gỡ quyền host. Hãy kiểm tra danh sách host rồi thử lại.");
        return false;
      }

      return true;
    } catch (error) {
      console.error("Failed to remove co-host:", error);
      await showAlert(error.message || "Không thể gỡ quyền host lúc này.");
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

    if (isRoomOwner && targetRoomId && !roomError) {
      const confirmed = await showDialog({
        title: "Giải tán phòng?",
        message: `Bạn là Chủ phòng (Host).\nNếu bạn rời phòng, phòng "${targetRoomId}" sẽ bị XÓA và toàn bộ thành viên sẽ được giải tán.\nBạn có chắc chắn muốn rời và xóa phòng không?`,
        confirmLabel: "Rời và xóa phòng",
        variant: "danger"
      });
      if (!confirmed) return false;

      try {
        await remove(ref(rtdb, `rooms/${targetRoomId}`));
      } catch (err) {
        console.error("Lỗi khi xóa phòng khỏi RTDB:", err);
        await showAlert(err.message || "Không thể giải tán phòng. Vui lòng thử lại.");
        return false;
      }
    }

    if (targetRoomId && user?.uid && rtdb && (!isRoomOwner || roomError)) {
      try {
        await remove(ref(rtdb, `rooms/${targetRoomId}/members/${user.uid}`));
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
      const rememberedGuestRoom = JSON.parse(localStorage.getItem("karaoke_guest_room") || "null");
      if (rememberedGuestRoom?.roomId === targetRoomId) {
        localStorage.removeItem("karaoke_guest_room");
      }
      if (localStorage.getItem("karaoke_host_room_id") === targetRoomId) {
        localStorage.removeItem("karaoke_host_room_id");
      }
    } catch (error) {
      console.warn("Could not clear the remembered host room:", error);
    }
    const cleanUrl = window.location.pathname;
    window.history.pushState({ path: cleanUrl }, "", cleanUrl);
    return true;
  };

  const handleLogout = async () => {
    if (currentRoomId && !(await handleLeaveRoom())) return;
    await logout();
  };

  // Add song to Queue
  const handleAddToQueue = async (song) => {
    if (!currentRoomId || !user?.uid) return;
    const activeLimit = maxSongsPerMember;
    const limitError = `Bạn đã đạt giới hạn ${activeLimit} bài đang chờ. Hãy đợi phát bớt bài hoặc nhờ host tăng giới hạn.`;
    const queuedForMember = queueItems.filter((item) => item.addedByUid === user.uid).length;
    const visiblePendingAdds = queueItems.filter((item) =>
      item.addedByUid === user.uid && pendingQueueEntryIdsRef.current.has(item.queueId)
    ).length;
    if (queuedForMember + queueAddsInProgressRef.current - visiblePendingAdds >= activeLimit) {
      throw new Error(limitError);
    }

    queueAddsInProgressRef.current += 1;
    setQueueAddsInProgress(queueAddsInProgressRef.current);
    let pendingQueueEntryId = null;
    try {
      const memberQueueRef = ref(rtdb, `rooms/${currentRoomId}/memberQueue/${user.uid}`);
      const legacyPendingCount = queueItems.filter((item) =>
        item.queueSource === "queue" && item.addedByUid === user.uid
      ).length;

      const maxOrder = queueItems.length > 0
        ? Math.max(...queueItems.map((q) => q.order || 0))
        : 0;

      const sequenceRef = ref(rtdb, `rooms/${currentRoomId}/queueSequence`);
      const sequenceResult = await runTransaction(sequenceRef, (currentSequence) => {
        const sequence = Number.isFinite(currentSequence) ? currentSequence : 0;
        return Math.max(sequence + 1, maxOrder + 1);
      });
      if (!sequenceResult.committed) {
        throw new Error("Không thể xếp thứ tự bài hát. Vui lòng thử lại.");
      }
      const order = sequenceResult.snapshot.val();
      const queueEntryRef = push(memberQueueRef);
      pendingQueueEntryId = queueEntryRef.key;
      pendingQueueEntryIdsRef.current.add(pendingQueueEntryId);
      const queueItem = {
        videoId: song.videoId,
        title: song.title,
        thumbnail: song.thumbnail,
        addedBy: roomData?.members?.[user.uid]?.name || song.addedBy || user.displayName || "Khách",
        addedByUid: user.uid,
        order,
        createdAt: getServerTime()
      };
      let fullDuringRequest = false;
      const queueResult = await runTransaction(memberQueueRef, (currentQueue) => {
        const currentItems = currentQueue || {};
        if (Object.keys(currentItems).length + legacyPendingCount >= activeLimit) {
          fullDuringRequest = true;
          return;
        }
        return { ...currentItems, [queueEntryRef.key]: queueItem };
      });
      if (!queueResult.committed) {
        if (fullDuringRequest) throw new Error(limitError);
        throw new Error("Không thể thêm bài vào hàng chờ. Vui lòng thử lại.");
      }
      return { id: queueEntryRef.key, ownerUid: user.uid, order, position: queueItems.length + 1 };
    } finally {
      if (pendingQueueEntryId) pendingQueueEntryIdsRef.current.delete(pendingQueueEntryId);
      queueAddsInProgressRef.current = Math.max(0, queueAddsInProgressRef.current - 1);
      setQueueAddsInProgress(queueAddsInProgressRef.current);
    }
  };

  const handleUndoQueueAddition = async (itemId) => {
    if (!currentRoomId || !user?.uid || !itemId) return false;
    const itemRef = ref(rtdb, `rooms/${currentRoomId}/memberQueue/${user.uid}/${itemId}`);
    const snapshot = await get(itemRef);
    if (!snapshot.exists() || snapshot.val()?.addedByUid !== user.uid) return false;
    await remove(itemRef);
    return true;
  };

  const handleSetQueueLimit = async (limit) => {
    if (!isHost || !currentRoomId) return;
    const nextLimit = Math.min(MAX_MEMBER_QUEUE_LIMIT, Math.max(1, Number(limit) || DEFAULT_MEMBER_QUEUE_LIMIT));
    try {
      await update(ref(rtdb, `rooms/${currentRoomId}/queueSettings`), {
        maxSongsPerMember: nextLimit
      });
    } catch (error) {
      console.error("Could not update the per-member queue limit:", error);
      await showAlert(error.message || "Không thể cập nhật giới hạn bài chờ.");
    }
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
      pausedAt: 0,
      advanceToken: createPlaybackToken(user.uid)
    });

    // If item was in queue, remove it
    if (song.dbPath) {
      await remove(ref(rtdb, `rooms/${currentRoomId}/${song.dbPath}`));
    }
  };

  // Any player can advance on video end. Each device transacts against the
  // same playback record, so only the first request for the ended video wins.
  const handleNextSong = async (endedAt, endedVideoId) => {
    if (!currentRoomId || !user?.uid) return;
    const expectedVideoId = endedVideoId || (isHost ? roomData?.playback?.videoId : null);
    if (!expectedVideoId && !isHost) return;
    const requestKey = `${currentRoomId}:${expectedVideoId || "empty"}`;
    if (pendingAdvanceRequestsRef.current.has(requestKey)) return;
    pendingAdvanceRequestsRef.current.add(requestKey);

    let advanceRequestRef;
    let advanceRequestCreated = false;
    try {
      const roomSnapshot = await get(ref(rtdb, `rooms/${currentRoomId}`));
      const room = roomSnapshot.val();
      const currentPlayback = room?.playback;
      if (!currentPlayback || (expectedVideoId && currentPlayback.videoId !== expectedVideoId)) return;
      if (endedVideoId && currentPlayback.state !== "playing") return;

      let nextEntry = getQueueItems(room)[0] || null;
      const playbackRef = ref(rtdb, `rooms/${currentRoomId}/playback`);
      const previousAdvanceToken = currentPlayback.advanceToken ?? null;
      let requestToken = createPlaybackToken(user.uid);

      if (!isHost) {
        // A member can only write the exact queue item they requested for the
        // currently playing video. RTDB Rules validate this before allowing
        // the playback transaction below.
        if (!endedVideoId || currentPlayback.state !== "playing") return;
        const nextSong = nextEntry;
        advanceRequestRef = ref(rtdb, `rooms/${currentRoomId}/advanceClaims/${user.uid}`);
        const proposedClaim = {
          requestedBy: user.uid,
          videoId: currentPlayback.videoId,
          expectedAdvanceToken: previousAdvanceToken,
          queueId: nextSong?.queueId || "__none__",
          queueOwnerUid: nextSong?.queueOwnerUid || "__none__",
          queueSource: nextSong?.queueSource || "__none__",
          nextVideoId: nextSong?.videoId || "__none__",
          nextTitle: nextSong?.title || "__none__",
          requestToken,
          requestedAt: getServerTime()
        };
        const claimResult = await runTransaction(advanceRequestRef, (currentClaim) => {
          const claimIsForThisPlayback = currentClaim?.videoId === currentPlayback.videoId &&
            (currentClaim.expectedAdvanceToken ?? null) === previousAdvanceToken &&
            Number.isFinite(currentClaim.requestedAt) &&
            getServerTime() - currentClaim.requestedAt <= 15000;
          return claimIsForThisPlayback ? currentClaim : proposedClaim;
        });
        if (!claimResult.committed) return;
        advanceRequestCreated = true;
        const claim = claimResult.snapshot.val();
        requestToken = claim.requestToken;
        if (claim.queueId === "__none__") {
          nextEntry = null;
        } else {
          const claimedSong = getQueueItems(room).find((item) =>
            item.queueId === claim.queueId &&
            item.queueOwnerUid === claim.queueOwnerUid &&
            item.queueSource === claim.queueSource
          );
          if (!claimedSong || claimedSong.videoId !== claim.nextVideoId || claimedSong.title !== claim.nextTitle) return;
          nextEntry = claimedSong;
        }
      }

      const result = await runTransaction(playbackRef, (latestPlayback) => {
        if (!latestPlayback || latestPlayback.videoId !== currentPlayback.videoId) return;
        if ((latestPlayback.advanceToken ?? null) !== previousAdvanceToken) return;
        if (endedVideoId && latestPlayback.state !== "playing") return;

        if (nextEntry) {
          return {
            ...latestPlayback,
            videoId: nextEntry.videoId,
            title: nextEntry.title,
            state: "playing",
            anchorServerTime: getServerTime() + 3000,
            pausedAt: 0,
            advanceToken: requestToken
          };
        }

        return {
          ...latestPlayback,
          state: "paused",
          pausedAt: typeof endedAt === "number" ? endedAt : latestPlayback.pausedAt || 0,
          advanceToken: requestToken
        };
      });

      // Remove the queue item only after the playback transaction wins.
      if (result.committed && nextEntry) {
        await remove(ref(rtdb, `rooms/${currentRoomId}/${nextEntry.dbPath}`));
      }
    } catch (error) {
      console.warn("Could not advance the room playback:", error);
    } finally {
      if (advanceRequestRef && advanceRequestCreated) {
        await runTransaction(advanceRequestRef, (claim) => {
          if (claim?.requestToken !== requestToken) return;
          return null;
        }).catch((error) => {
          console.warn("Could not clear the playback advance request:", error);
        });
      }
      pendingAdvanceRequestsRef.current.delete(requestKey);
    }
  };

  // Host: Reorder Queue items (drag & drop)
  const handleReorderQueue = async (newOrderedItems) => {
    if (!isHost || !currentRoomId) return;
    const updates = {};
    newOrderedItems.forEach((item, index) => {
      updates[`rooms/${currentRoomId}/${item.dbPath}/order`] = index + 1;
    });
    await update(ref(rtdb), updates);
  };

  // Host: Remove from Queue
  const handleRemoveFromQueue = async (item) => {
    if (!isHost || !currentRoomId) return;
    const confirmed = await showDialog({
      title: "Xóa bài khỏi danh sách?",
      message: `Bạn có chắc chắn muốn xóa bài "${item?.title || "bài hát này"}" khỏi danh sách chờ không?`,
      confirmLabel: "Xóa bài",
      variant: "danger"
    });
    if (!confirmed) return;
    await remove(ref(rtdb, `rooms/${currentRoomId}/${item.dbPath}`));
  };

  const copyRuleSnippet = () => {
    navigator.clipboard.writeText(rulesText);
    setCopiedRule(true);
    setTimeout(() => setCopiedRule(false), 2000);
  };

  if (authLoading && isConfigured) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-center p-4">
        <div className="w-12 h-12 rounded-full border-4 border-red-500/20 border-t-red-500 animate-spin mb-4"></div>
        <p className="text-sm font-semibold text-slate-300">Đang mở ứng dụng...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-red-500 selection:text-white">
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
          onLogout={handleLogout}
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
            <div className="w-14 h-14 rounded-full border-4 border-red-500/20 border-t-red-500 animate-spin mb-4"></div>
            <h3 className="text-xl font-bold text-white mb-1">
              Đang kết nối phòng {currentRoomId}...
            </h3>
            <p className="text-xs text-slate-400 max-w-sm">
              Đang kết nối với phòng hát và tải video
            </p>
          </div>
        ) : roomError ? (
          /* Error State (e.g. Permission Denied) */
          <div className="flex-1 max-w-2xl mx-auto p-6 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Không thể tải dữ liệu phòng</h3>
            <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 px-4 py-2.5 rounded-xl mb-6 font-mono">
              {roomError}
            </p>

            {/* If Permission Denied: Provide instant instructions */}
            {(roomError.toLowerCase().includes("permission_denied") || roomError.toLowerCase().includes("permission denied")) && (
              <div className="w-full text-left bg-slate-900 border border-amber-500/30 rounded-2xl p-4 mb-6 text-xs text-amber-200 space-y-3">
                <div className="font-bold text-amber-300 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Cách khắc phục lỗi Permission Denied trong Firebase Console:</span>
                </div>
                <p>
                  Vào <strong>Firebase Console</strong> &gt; Chọn dự án <strong>karaoke-pwa-1221e</strong> &gt; <strong>Realtime Database</strong> &gt; tab <strong>Rules</strong>, dán đoạn rules sau và bấm <strong>Publish</strong>:
                </p>
                <div className="relative bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300">
                  <pre>{rulesText}</pre>
                  <button
                    onClick={copyRuleSnippet}
                    className="absolute right-2 top-2 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1 text-[10px]"
                  >
                    {copiedRule ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedRule ? "Đã chép" : "Sao chép"}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-semibold shadow-lg shadow-red-500/20 transition"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Tải lại trang</span>
              </button>
              <button
                onClick={handleLeaveRoom}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700 transition"
              >
                <LogOut className="w-4 h-4" />
                <span>Về sảnh chính</span>
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
                        isMobileSearchOpen={hostMobileTab === "search"}
                      />
                    </ErrorBoundary>

                    <HostControls
                      roomId={currentRoomId}
                      playback={roomData?.playback}
                      peerPositions={roomData?.members}
                      onNextSong={handleNextSong}
                      queueLimit={maxSongsPerMember}
                      onQueueLimitChange={handleSetQueueLimit}
                      playerRef={hostPlayerRef}
                    />

                    {/* Mobile Host Tab Switcher (<lg only) */}
                    <div className="lg:hidden flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                      <button
                        onClick={() => setHostMobileTab("queue")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition ${
                          hostMobileTab === "queue"
                            ? "bg-red-500 text-white shadow-md shadow-red-500/25"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <ListMusic className="w-4 h-4" />
                        <span>Hàng chờ ({queueItems.length})</span>
                      </button>

                      <button
                        onClick={() => setHostMobileTab("search")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition ${
                          hostMobileTab === "search"
                            ? "bg-red-500 text-white shadow-md shadow-red-500/25"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Search className="w-4 h-4" />
                        <span>Tìm bài mới</span>
                      </button>

                      <button
                        onClick={() => setHostMobileTab("info")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition ${
                          hostMobileTab === "info"
                            ? "bg-red-500 text-white shadow-md shadow-red-500/25"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <QrCode className="w-4 h-4" />
                        <span>Mã QR</span>
                      </button>
                    </div>

                    {/* Mobile Tab Content for Host (<lg only) */}
                    <div className="lg:hidden">
                      {hostMobileTab === "queue" && (
                        <QueueList
                          queueItems={queueItems}
                          isHost={true}
                          queueLimit={maxSongsPerMember}
                          onReorder={handleReorderQueue}
                          onPlayNow={handlePlayNow}
                          onRemove={handleRemoveFromQueue}
                        />
                      )}

                      {hostMobileTab === "search" && (
                        <SongSearch
                          isHost={true}
                        queueSlotsUsed={queueSlotsUsed}
                        queueLimit={maxSongsPerMember}
                          onBack={() => setHostMobileTab("queue")}
                          onAddToQueue={handleAddToQueue}
                          onUndoAdd={handleUndoQueueAddition}
                          onPlayNow={handlePlayNow}
                          playback={roomData?.playback}
                          onOpenConfig={() => setIsConfigOpen(true)}
                        />
                      )}

                      {hostMobileTab === "info" && (
                        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                              <Users className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-slate-400">Mã phòng:</span>
                                <span className="font-mono text-red-400 font-bold text-base">{currentRoomId}</span>
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                  {memberCount} người đang có mặt
                                </span>
                              </div>
                              <div className="text-xs text-slate-400 mt-1">
                                Quét mã QR hoặc chia sẻ liên kết để bạn bè cùng hát và chọn bài
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => setIsQROpen(true)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white rounded-xl font-bold transition text-xs shadow-lg shadow-red-500/25"
                          >
                            <QrCode className="w-4 h-4" />
                            <span>Mở mã QR toàn màn hình</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Room Info & QR Banner on Host Screen (Desktop only >= lg) */}
                    <div className="hidden lg:flex bg-slate-900/60 border border-slate-800 rounded-2xl p-4 items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                          <Users className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-slate-400">Phòng:</span>
                            <span className="font-mono text-red-400 font-bold">{currentRoomId}</span>
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                              {memberCount} người trong phòng
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            Quét mã QR hoặc nhập mã để bạn bè cùng hát và thêm bài
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => setIsQROpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white rounded-xl border border-red-500/30 transition text-xs font-semibold"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>Xem mã QR chi tiết</span>
                      </button>
                    </div>
                  </div>

                  {/* Right 30% (4 columns): Search & Queue for Host (Desktop only >= lg) */}
                  <div className="hidden lg:flex lg:col-span-4 flex-col space-y-4 h-[calc(100vh-100px)] sticky top-16">
                    {/* Search Section */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <SongSearch
                        isHost={true}
                        queueSlotsUsed={queueSlotsUsed}
                        queueLimit={maxSongsPerMember}
                        onAddToQueue={handleAddToQueue}
                        onUndoAdd={handleUndoQueueAddition}
                        onPlayNow={handlePlayNow}
                        playback={roomData?.playback}
                        onOpenConfig={() => setIsConfigOpen(true)}
                      />
                    </div>

                    {/* Drag & Drop Queue Section */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <QueueList
                        queueItems={queueItems}
                        isHost={true}
                        queueLimit={maxSongsPerMember}
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
                        isMobileSearchOpen={mobileTab === "search"}
                      />
                    </ErrorBoundary>

                    {/* Mobile Tab Switcher (<lg only) */}
                    <div className="lg:hidden flex bg-slate-900 p-1 rounded-xl mt-3 border border-slate-800">
                      <button
                        onClick={() => setMobileTab("queue")}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition ${
                          mobileTab === "queue"
                            ? "bg-red-500 text-white shadow-md"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <ListMusic className="w-4 h-4" />
                        <span>Danh sách chờ ({queueItems.length})</span>
                      </button>

                      <button
                        onClick={() => setMobileTab("search")}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition ${
                          mobileTab === "search"
                            ? "bg-red-500 text-white shadow-md"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Search className="w-4 h-4" />
                        <span>Chọn bài mới</span>
                      </button>
                    </div>
                  </div>

                  {/* Content on Mobile based on Tab (<lg) */}
                  <div className="lg:hidden flex-1 mt-2">
                    {mobileTab === "queue" ? (
                      <QueueList
                        queueItems={queueItems}
                        isHost={false}
                        queueLimit={maxSongsPerMember}
                        onReorder={handleReorderQueue}
                        onPlayNow={handlePlayNow}
                        onRemove={handleRemoveFromQueue}
                      />
                    ) : (
                      <SongSearch
                        isHost={false}
                        queueSlotsUsed={queueSlotsUsed}
                        queueLimit={maxSongsPerMember}
                        onBack={() => setMobileTab("queue")}
                        onAddToQueue={handleAddToQueue}
                        onUndoAdd={handleUndoQueueAddition}
                        onPlayNow={handlePlayNow}
                        playback={roomData?.playback}
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
                      queueSlotsUsed={queueSlotsUsed}
                      queueLimit={maxSongsPerMember}
                      onAddToQueue={handleAddToQueue}
                      onUndoAdd={handleUndoQueueAddition}
                      onPlayNow={handlePlayNow}
                      playback={roomData?.playback}
                      onOpenConfig={() => setIsConfigOpen(true)}
                    />
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <QueueList
                      queueItems={queueItems}
                      isHost={false}
                      queueLimit={maxSongsPerMember}
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

      <AppDialog
        config={dialogConfig}
        onConfirm={() => closeDialog(true)}
        onCancel={() => closeDialog(false)}
      />
    </div>
  );
}
