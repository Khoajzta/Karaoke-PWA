import React, { useState, useEffect } from "react";
import { 
  Mic2, 
  Settings, 
  LogOut, 
  User, 
  QrCode, 
  Copy, 
  Check, 
  Radio, 
  ShieldCheck, 
  Zap,
  Smartphone,
  Users
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { subscribeServerTimeOffset } from "../../firebase";

export const Navbar = ({ 
  roomId, 
  isHost, 
  isRoomOwner = false,
  ownerUid,
  onOpenConfig, 
  onOpenQR, 
  onLeaveRoom,
  onAddHost,
  onRemoveHost,
  onSetMemberVolume,
  wakeLockActive,
  memberCount = 1,
  membersList = []
}) => {
  const { user, logout } = useAuth();
  const [copied, setCopied] = useState(false);
  const [offsetMs, setOffsetMs] = useState(0);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 639px)").matches);

  useEffect(() => {
    const unsub = subscribeServerTimeOffset((val) => {
      setOffsetMs(Math.round(val));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const updateViewport = () => setIsMobile(media.matches);
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  const handleCopyRoom = () => {
    if (!roomId) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-2 sm:px-4 py-1.5 sm:py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-1 sm:gap-2">

        {/* Brand: Logo Only */}
        <div className="flex-shrink-0">
            <div className="w-8 h-8 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-tr from-red-500 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-red-500/25">
            <Mic2 className="w-4 h-4" />
          </div>
        </div>

        {/* Center: Room & Sync Info (if in room) */}
        {roomId && (
          <div className={`flex items-center gap-1 sm:gap-2 min-w-0 ${isHost ? "flex-none justify-start sm:flex-1 sm:justify-center" : "flex-1 justify-center"}`}>
            {/* Room code badge */}
            <div className={`${isHost ? "hidden sm:flex" : "flex"} h-9 items-center gap-0.5 sm:gap-1 bg-slate-800/80 border border-slate-700/80 px-1 sm:px-2 rounded-xl text-xs min-w-0`}>
              <span className="font-mono font-bold text-red-400 tracking-wider text-[11px] sm:text-xs truncate">#{roomId}</span>
              <button
                onClick={handleCopyRoom}
                title="Sao chép link mời"
                className="w-8 h-8 sm:w-auto sm:h-auto sm:p-1 flex items-center justify-center hover:text-white text-slate-400 transition flex-shrink-0 rounded-lg hover:bg-slate-700/70"
              >
                {copied ? <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" /> : <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              </button>
              {isHost && !isMobile && <button
                onClick={onOpenQR}
                title="Mã QR phòng"
                className="w-8 h-8 sm:w-auto sm:h-auto sm:p-1 flex items-center justify-center hover:text-white text-slate-400 transition flex-shrink-0 rounded-lg hover:bg-slate-700/70"
              >
                <QrCode className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-red-400" />
              </button>}
            </div>

            {/* Member count badge */}
            <div className="relative">
              <button
                onClick={() => setIsMembersOpen(!isMembersOpen)}
                title="Bấm để xem danh sách thành viên"
                className="w-9 h-9 sm:w-auto sm:min-w-10 sm:h-9 flex items-center justify-center gap-1 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 px-1 sm:px-2 rounded-xl text-xs text-white transition active:scale-95 flex-shrink-0"
              >
                <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-red-400" />
                <span className="font-bold text-red-300 font-mono text-[11px] sm:text-xs">{memberCount}</span>
              </button>

              {/* Dropdown members list */}
              {isMembersOpen && (
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-0 w-56 sm:w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3 z-50">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                      <Users className="w-3.5 h-3.5 text-red-400" />
                      <span>Thành viên ({memberCount})</span>
                    </div>
                    <button
                      onClick={() => setIsMembersOpen(false)}
                      className="text-slate-400 hover:text-white text-xs p-1"
                    >✕</button>
                  </div>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {membersList.length > 0 ? membersList.map((m) => (
                      <div key={m.uid} className="flex flex-col gap-1.5 p-1.5 rounded-xl hover:bg-slate-800/60 transition">
                       <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {m.photoURL ? (
                            <img src={m.photoURL} alt={m.name} className="w-6 h-6 rounded-full flex-shrink-0" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 flex-shrink-0">
                              <User className="w-3.5 h-3.5" />
                            </div>
                          )}
                          <span className="text-xs text-slate-200 truncate font-medium">{m.name || "Khách"}</span>
                        </div>
                        {m.isHost && (
                          <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded flex-shrink-0">HOST</span>
                        )}
                        {isHost && !m.isHost && (
                          <button
                            onClick={async () => {
                              const added = await onAddHost?.(m);
                              if (added) setIsMembersOpen(false);
                            }}
                            title={`Thêm ${m.name || "khách"} làm host`}
                            aria-label={`Thêm ${m.name || "khách"} làm host`}
                            className="flex-shrink-0 flex items-center gap-1 px-1.5 py-1 rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 text-[10px] font-semibold transition"
                          >
                            <ShieldCheck className="w-3 h-3" />
                            <span>Thêm host</span>
                          </button>
                        )}
                        {isRoomOwner && m.isHost && m.uid !== ownerUid && (
                          <button
                            onClick={async () => {
                              const removed = await onRemoveHost?.(m);
                              if (removed) setIsMembersOpen(false);
                            }}
                            title={`Gỡ quyền host của ${m.name || "thành viên"}`}
                            aria-label={`Gỡ quyền host của ${m.name || "thành viên"}`}
                            className="flex-shrink-0 flex items-center gap-1 px-1.5 py-1 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-[10px] font-semibold transition"
                          >
                            <ShieldCheck className="w-3 h-3" />
                            <span>Gỡ host</span>
                          </button>
                        )}
                       </div>
                       {isHost && !m.isHost && (
                         <label className="flex items-center gap-2 pl-8 text-[10px] text-slate-400">
                           <span className="whitespace-nowrap">Âm lượng {m.hostVolume ?? 100}%</span>
                           <input
                             type="range"
                             min="0"
                             max="100"
                             step="1"
                             value={m.hostVolume ?? 100}
                             onChange={(event) => onSetMemberVolume?.(m, event.target.value)}
                             aria-label={`Điều chỉnh âm lượng của ${m.name || "khách"}`}
                             className="min-w-0 flex-1 accent-red-500 h-1 cursor-pointer"
                           />
                         </label>
                       )}
                      </div>
                    )) : (
                      <div className="text-xs text-slate-500 text-center py-2">Đang kết nối...</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sync badge — desktop only */}
            <div
              title="Trạng thái phát video trên các thiết bị"
              className="hidden md:flex h-9 items-center gap-1 px-2 rounded-xl bg-slate-800/50 border border-slate-700/50 text-[11px] font-mono text-emerald-400"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 sync-live"></span>
              <span>Đang khớp</span>
            </div>

            {/* Wake lock — desktop only */}
            {wakeLockActive && (
              <div
                title="Màn hình luôn sáng (Wake Lock)"
                className="hidden lg:flex h-9 items-center gap-1 px-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-400"
              >
                <Zap className="w-3 h-3" />
                <span>Luôn sáng</span>
              </div>
            )}
          </div>
        )}

        {/* Right: User + actions */}
        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
          {user && (
            <>
              {/* Avatar chip — icon + HOST badge only on mobile, full name on sm+ */}
              <div className="h-9 sm:h-9 flex items-center gap-1 bg-slate-800/60 border border-slate-700/60 px-1.5 sm:px-2 py-1 rounded-xl">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || "User"} className="w-5 h-5 rounded-full flex-shrink-0" />
                ) : (
                  <User className="w-5 h-5 text-slate-400 flex-shrink-0" />
                )}
                {isHost && (
                  <span className="text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1 py-px rounded leading-none">
                    HOST
                  </span>
                )}
                <span className="hidden sm:block text-xs font-medium text-slate-200 max-w-[72px] truncate">
                  {user.displayName || "Khách"}
                </span>
              </div>

              {!user.isAnonymous && (
                <button onClick={() => logout()} title="Đăng xuất tài khoản Google" aria-label="Đăng xuất tài khoản Google" className="w-9 h-9 sm:w-auto sm:h-9 sm:px-2 rounded-xl border border-rose-500/30 text-rose-300 hover:text-white hover:bg-rose-500 transition flex items-center justify-center sm:gap-1">
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-[11px] font-semibold">Đăng xuất</span>
                </button>
              )}

              {/* Leave button — icon only on mobile */}
              {roomId && (
                <button
                  onClick={onLeaveRoom}
                  title={isRoomOwner ? "Rời & giải tán phòng" : "Rời phòng"}
                  className={`w-9 h-9 sm:w-auto sm:h-9 sm:px-2 rounded-xl transition text-xs flex items-center justify-center sm:gap-1 ${
                    isRoomOwner
                      ? "text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-500 border border-rose-500/30"
                      : "text-slate-400 hover:text-rose-400 hover:bg-slate-800 border border-slate-700/60"
                  }`}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-[11px] font-semibold">{isRoomOwner ? "Giải tán" : "Rời"}</span>
                </button>
              )}
            </>
          )}

          {/* Settings */}
          <button
            onClick={onOpenConfig}
            title="Cài đặt Firebase & YouTube Key"
            className="w-9 h-9 sm:w-auto sm:h-9 sm:px-2 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition border border-slate-700/60"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};

