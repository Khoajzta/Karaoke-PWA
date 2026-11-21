import React, { useState } from "react";
import { X, User, LogIn, AlertCircle, ShieldAlert, Sparkles, PlusCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export const AuthModal = ({ isOpen, onClose, requiredGoogle = false, title = "Đăng nhập" }) => {
  const { loginWithGoogle, loginAsGuest, isConfigured } = useAuth();
  const [guestName, setGuestName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDomainError, setIsDomainError] = useState(false);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError("");
      setIsDomainError(false);
      await loginWithGoogle();
      onClose(true);
    } catch (err) {
      console.error(err);
      let msg = err.message || "Đăng nhập Google thất bại!";
      if (err.code === "auth/unauthorized-domain") {
        setIsDomainError(true);
        msg = `Domain "${window.location.hostname}" chưa được thêm vào Authorized Domains của Firebase Authentication.`;
      } else if (err.code === "auth/operation-not-allowed") {
        msg = "Google Provider chưa được bật trong Firebase Console! Bạn có thể tạo phòng nhanh bằng tên Khách bên dưới.";
      } else if (err.code === "auth/popup-closed-by-user") {
        msg = "Cửa sổ đăng nhập Google đã bị đóng.";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async (e) => {
    e.preventDefault();
    if (!guestName.trim()) {
      setError("Vui lòng nhập tên hiển thị của bạn!");
      return;
    }
    try {
      setLoading(true);
      setError("");
      await loginAsGuest(guestName);
      onClose(false);
    } catch (err) {
      console.error(err);
      setError(err.message || "Đăng nhập khách thất bại!");
    } finally {
      setLoading(false);
    }
  };

  const currentHost = typeof window !== "undefined" ? window.location.hostname : "192.168.1.30";
  const isCreatingRoom = title.toLowerCase().includes("tạo phòng");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-800/50 flex-shrink-0">
          <h3 className="font-bold text-white text-base">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-xs space-y-2">
              <div className="flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>

              {isDomainError && (
                <div className="bg-slate-950/80 p-2.5 rounded-lg border border-amber-500/30 text-[11px] text-amber-200 space-y-1.5 leading-relaxed">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>2 Cách xử lý nhanh:</span>
                  </div>
                  <div>
                    <strong>👉 Cách 1 (Nhanh nhất):</strong> Nhập tên vào ô <em>"Tham gia bằng tên Khách"</em> bên dưới để tạo phòng ngay lập tức mà không cần Google!
                  </div>
                  <div>
                    <strong>👉 Cách 2 (Nếu muốn dùng Google trên điện thoại):</strong> Vào <strong>Firebase Console</strong> &gt; <strong>Authentication</strong> &gt; tab <strong>Settings</strong> &gt; mục <strong>Authorized domains</strong> &gt; bấm <strong>Add domain</strong> và nhập: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-pink-400 font-bold">{currentHost}</code>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isConfigured && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl text-xs">
              ⚠️ Firebase chưa được cấu hình. Vui lòng bấm vào biểu tượng bánh răng ở góc trên để nhập thông tin Firebase.
            </div>
          )}

          {/* Google Sign In */}
          <div>
            <button
              onClick={handleGoogleLogin}
              disabled={loading || !isConfigured}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-800 font-semibold py-3 px-4 rounded-xl transition shadow-md disabled:opacity-50 active:scale-[0.98] text-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>Đăng nhập với Google</span>
            </button>
            <p className="text-center text-[11px] text-slate-400 mt-2">
              Khuyên dùng khi chạy trên máy tính (localhost)
            </p>
          </div>

          {!requiredGoogle && <>
          <div className="relative flex items-center justify-center pt-1">
            <hr className="w-full border-slate-800" />
            <span className="absolute bg-slate-900 px-3 text-xs text-slate-500 uppercase tracking-wider font-semibold">
              Hoặc
            </span>
          </div>

          {/* Guest Sign In (Works everywhere including phone LAN IP without domain whitelist) */}
          <form onSubmit={handleGuestLogin} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {isCreatingRoom ? "Tạo phòng nhanh bằng tên hiển thị (Không cần Google):" : "Tham gia nhanh bằng tên Khách:"}
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Nhập tên của bạn (VD: Tuấn Ca Sĩ)..."
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !isConfigured}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500/20 to-rose-500/20 hover:from-pink-500 hover:to-rose-500 text-pink-300 hover:text-white font-semibold py-2.5 px-4 rounded-xl transition border border-pink-500/30 disabled:opacity-50 active:scale-[0.98] text-xs"
            >
              {isCreatingRoom ? (
                <>
                  <PlusCircle className="w-4 h-4" />
                  <span>Tạo phòng ngay với tên này</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Vào phòng với tên Khách</span>
                </>
              )}
            </button>
          </form>
          </>}
        </div>
      </div>
    </div>
  );
};
