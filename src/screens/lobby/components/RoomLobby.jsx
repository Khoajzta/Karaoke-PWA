import React, { useState, useEffect } from "react";
import { 
  PlusCircle, 
  ArrowRight, 
  Sparkles, 
  Music, 
  Smartphone, 
  Monitor, 
  Radio, 
  HelpCircle,
  LogIn,
  AlertTriangle,
  Copy,
  Check
} from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { rtdb, ref, get, runTransaction } from "../../../firebase";
import databaseRules from "../../../../database.rules.json";

export const RoomLobby = ({ onJoinRoom, onRequireAuth, urlRoomCode, pendingCreateRoom, onClearPendingCreate }) => {
  const { user, isConfigured, loginAsGuest } = useAuth();
  const rulesText = JSON.stringify(databaseRules, null, 2);
  const [joinCode, setJoinCode] = useState(urlRoomCode || "");
  const [guestName, setGuestName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isPermissionError, setIsPermissionError] = useState(false);
  const [copiedRule, setCopiedRule] = useState(false);

  useEffect(() => {
    if (urlRoomCode) {
      setJoinCode(urlRoomCode.toUpperCase());
    }
  }, [urlRoomCode]);

  // Generate random 6-character uppercase alphanumeric room code (e.g. KARA88)
  const generateRoomCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // Host creates room
  const handleCreateRoom = async () => {
    if (!isConfigured) {
      setError("Vui lòng cấu hình Firebase trước khi tạo phòng!");
      return;
    }

    if (!user || user.isAnonymous) {
      onRequireAuth({ 
        requiredGoogle: true, 
        title: "Đăng nhập để tạo phòng (Host)",
        pendingAction: "create"
      });
      return;
    }

    try {
      setLoading(true);
      setError("");
      setIsPermissionError(false);

      const roomData = {
        info: {
          hostUid: user.uid,
          hostName: user.displayName || "Host",
          createdAt: Date.now()
        },
        playback: {
          videoId: null,
          title: "",
          state: "idle",
          anchorServerTime: null,
          pausedAt: 0,
          advanceToken: "",
          memberMuted: false
        },
        queueSequence: 0
      };

      let roomId = "";
      let created = false;
      for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
        roomId = generateRoomCode();
        const result = await runTransaction(ref(rtdb, `rooms/${roomId}`), (existingRoom) => {
          if (existingRoom != null) return;
          return roomData;
        });
        created = result.committed;
      }
      if (!created) throw new Error("Không tạo được mã phòng mới. Vui lòng thử lại.");

      onJoinRoom(roomId, true);
    } catch (err) {
      console.error("Lỗi tạo phòng:", err);
      const msg = err.message || "";
      if (msg.toLowerCase().includes("permission_denied") || msg.toLowerCase().includes("permission denied")) {
        setIsPermissionError(true);
        setError("Firebase Realtime Database chưa cấp quyền ghi (Permission Denied). Vui lòng cập nhật Rules trong Firebase Console!");
      } else {
        setError(msg || "Không thể tạo phòng lúc này");
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-trigger create room if user just logged in from "Tạo Phòng" request
  useEffect(() => {
    if (pendingCreateRoom && user && !user.isAnonymous) {
      onClearPendingCreate();
      handleCreateRoom();
    }
  }, [pendingCreateRoom, user]);

  // Join existing room
  const handleJoinRoom = async (e) => {
    e.preventDefault();
    const formattedCode = joinCode.trim().toUpperCase();
    if (!formattedCode) {
      setError("Vui lòng nhập mã phòng!");
      return;
    }
    const needsGuestName = !user || user.isAnonymous;
    if (needsGuestName && !guestName.trim()) {
      setError("Vui lòng nhập tên khách trước khi vào phòng!");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setIsPermissionError(false);

      // Guests authenticate anonymously, but their name is only stored in this room.
      if (needsGuestName) {
        try {
          await loginAsGuest(guestName);
        } catch (authErr) {
          console.warn("Guest sign in error:", authErr);
          setError(authErr.message || "Không thể đăng nhập khách. Vui lòng thử lại hoặc đăng nhập Google.");
          return;
        }
      }

      const roomRef = ref(rtdb, `rooms/${formattedCode}`);
      const snapshot = await get(roomRef);

      if (!snapshot.exists()) {
        setError(`Phòng "${formattedCode}" không tồn tại hoặc đã đóng!`);
        setLoading(false);
        return;
      }
      if (snapshot.val()?.members?._state === "deleting") {
        setError("Phòng này đang được đóng vì không còn người tham gia.");
        setLoading(false);
        return;
      }

      onJoinRoom(formattedCode, false, needsGuestName ? guestName : "");
    } catch (err) {
      console.error("Lỗi vào phòng:", err);
      const msg = err.message || "";
      if (msg.toLowerCase().includes("permission_denied") || msg.toLowerCase().includes("permission denied")) {
        setIsPermissionError(true);
        setError("Firebase Realtime Database chưa cấp quyền đọc (Permission Denied). Vui lòng kiểm tra Rules!");
      } else {
        setError(msg || "Không thể tham gia phòng");
      }
    } finally {
      setLoading(false);
    }
  };

  const copyRuleSnippet = () => {
    navigator.clipboard.writeText(rulesText);
    setCopiedRule(true);
    setTimeout(() => setCopiedRule(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-16">
      {/* Hero Header */}
      <div className="text-center mb-10 space-y-3">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Hát cùng nhau trên nhiều thiết bị</span>
        </div>
        <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white">
          Karaoke cùng nhau trên mọi thiết bị <br className="hidden sm:block" />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-400 via-rose-300 to-amber-300">
            Không Độ Trễ Trên Mọi Thiết Bị
          </span>
        </h1>
        <p className="text-sm md:text-base text-slate-400 max-w-xl mx-auto">
          Mở video trên máy tính hoặc TV, mọi người dùng điện thoại để xem lời và chọn bài hát cùng nhau.
        </p>
      </div>

      {/* Permission Denied Guide Box */}
      {isPermissionError && (
        <div className="max-w-2xl mx-auto mb-8 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-200 text-xs space-y-3">
          <div className="flex items-center gap-2 font-bold text-amber-300 text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>Cần cập nhật Rules của Firebase Realtime Database:</span>
          </div>
          <p>
            Vào <strong>Firebase Console</strong> &gt; <strong>Realtime Database</strong> &gt; tab <strong>Rules</strong>, dán đoạn cấu hình sau rồi bấm <strong>Publish (Xuất bản)</strong>:
          </p>
          <div className="relative bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300">
            <pre>{rulesText}</pre>
            <button
              onClick={copyRuleSnippet}
              className="absolute right-2 top-2 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1 text-[10px]"
            >
              {copiedRule ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedRule ? "Đã chép" : "Sao chép Rules"}</span>
            </button>
          </div>
        </div>
      )}

      {error && !isPermissionError && (
        <div className="max-w-md mx-auto mb-6 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs text-center">
          {error}
        </div>
      )}

      {/* Main Action Cards */}
      <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
        {/* Create Room (Host) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between hover:border-red-500/40 transition">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-red-500 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-red-500/25">
              <Monitor className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Tạo Phòng Hát Mới
                <span className="text-[10px] font-bold bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full uppercase border border-red-500/30">
                  Chủ phòng
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Dành cho người mở video và điều khiển buổi hát. Cần đăng nhập Google.
              </p>
            </div>

            <ul className="text-xs text-slate-400 space-y-1.5 pt-2">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                <span>Điều khiển phát, tạm dừng, tua nhạc</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                <span>Kéo thả sắp xếp danh sách chờ</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                <span>Hiển thị mã QR để khách quét nhanh</span>
              </li>
            </ul>
          </div>

          <button
            onClick={handleCreateRoom}
            disabled={loading}
            className="mt-6 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-red-500/25 transition active:scale-[0.98] disabled:opacity-50 text-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{loading ? "Đang tạo phòng..." : "Tạo phòng hát"}</span>
          </button>
        </div>

        {/* Join Room (Member) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between hover:border-slate-700 transition">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-red-400 shadow-md">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex flex-wrap items-center gap-2">
                Vào Phòng Đang Hát
                <span className="text-[10px] font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full uppercase border border-slate-700 whitespace-nowrap flex-shrink-0">
                  Người tham gia
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Dùng điện thoại hoặc máy tính bảng để xem lời và chọn bài hát.
              </p>
            </div>

            <form onSubmit={handleJoinRoom} className="space-y-3 pt-2">
              <div>
                <label htmlFor="room-code" className="block text-xs text-slate-400 mb-1 font-medium">
                  Nhập mã phòng 6 ký tự
                </label>
                <input
                  id="room-code"
                  type="text"
                  maxLength={6}
                  placeholder="VD: KARA88"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-center font-mono text-lg font-bold tracking-widest text-red-400 placeholder-slate-600 focus:outline-none focus:border-red-500"
                />
              </div>

              {(!user || user.isAnonymous) && (
                <div>
                  <label htmlFor="guest-name" className="block text-xs text-slate-400 mb-1 font-medium">
                    Tên hiển thị trong phòng (bắt buộc)
                  </label>
                  <input
                    id="guest-name"
                    type="text"
                    maxLength={32}
                    autoComplete="off"
                    placeholder="Nhập tên của bạn"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-center text-sm text-white placeholder-slate-600 focus:outline-none focus:border-red-500"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !joinCode || ((!user || user.isAnonymous) && !guestName.trim())}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 px-4 rounded-xl border border-slate-700 transition active:scale-[0.98] disabled:opacity-50 text-sm"
              >
                <span>{loading ? "Đang vào..." : "Tham Gia Phòng"}</span>
                <ArrowRight className="w-4 h-4 text-red-400" />
              </button>
            </form>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800/80 text-[11px] text-slate-500 text-center">
            Khách cần nhập tên mỗi lần vào phòng; tên không được lưu cho lần sau.
          </div>
        </div>
      </div>

      {/* Feature highlights */}
      <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto text-center">
        <div className="p-4 bg-slate-900/40 rounded-2xl border border-slate-800/60">
          <div className="text-red-400 font-bold text-sm mb-1">Video khớp trên mọi thiết bị</div>
          <p className="text-xs text-slate-400">Mọi người cùng xem video ở gần như một thời điểm.</p>
        </div>
        <div className="p-4 bg-slate-900/40 rounded-2xl border border-slate-800/60">
          <div className="text-red-400 font-bold text-sm mb-1">Âm thanh dễ điều chỉnh</div>
          <p className="text-xs text-slate-400">Mỗi người có thể tự bật hoặc tắt tiếng trên điện thoại.</p>
        </div>
        <div className="p-4 bg-slate-900/40 rounded-2xl border border-slate-800/60">
          <div className="text-red-400 font-bold text-sm mb-1">Giữ màn hình luôn sáng</div>
          <p className="text-xs text-slate-400">Màn hình điện thoại hạn chế tự tắt khi bạn đang hát.</p>
        </div>
      </div>
    </div>
  );
};
