import React, { useState } from "react";
import { X, Key, Database, Sparkles, Check } from "lucide-react";
import { getStoredFirebaseConfig, saveFirebaseConfig } from "../firebase";

export const ConfigModal = ({ isOpen, onClose }) => {
  const currentFb = getStoredFirebaseConfig();
  const [fbConfig, setFbConfig] = useState({
    apiKey: currentFb.apiKey || "",
    authDomain: currentFb.authDomain || "",
    databaseURL: currentFb.databaseURL || "",
    projectId: currentFb.projectId || "",
    storageBucket: currentFb.storageBucket || "",
    messagingSenderId: currentFb.messagingSenderId || "",
    appId: currentFb.appId || ""
  });

  const [ytKey, setYtKey] = useState(
    localStorage.getItem("yt_api_key") || import.meta.env.VITE_YOUTUBE_API_KEY || ""
  );

  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e) => {
    e.preventDefault();
    if (ytKey.trim()) {
      localStorage.setItem("yt_api_key", ytKey.trim());
    } else {
      localStorage.removeItem("yt_api_key");
    }

    // Save Firebase Config
    saveFirebaseConfig(fbConfig);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-red-500/10 text-red-400 rounded-lg">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Cấu hình Firebase & YouTube</h3>
              <p className="text-xs text-slate-400">Kết nối Firebase RTDB và YouTube Data API</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 overflow-y-auto space-y-4 text-sm flex-1">
          {/* YouTube API Key */}
          <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 mb-2 text-red-400 font-medium">
              <Key className="w-4 h-4" />
              <span>YouTube Data API v3 Key (Tùy chọn)</span>
            </div>
            <p className="text-xs text-slate-400 mb-2">
              Dùng để tìm kiếm bài hát trực tiếp. Nếu không có key, bạn vẫn có thể dán trực tiếp link YouTube bất kỳ mà không tốn quota!
            </p>
            <input
              type="text"
              placeholder="AIzaSy..."
              value={ytKey}
              onChange={(e) => setYtKey(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 text-xs"
            />
          </div>

          {/* Firebase RTDB Config */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Firebase Realtime Database Config
              </span>
              <span className="text-[11px] text-red-400">Bắt buộc để đồng bộ</span>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">databaseURL * (URL của RTDB)</label>
              <input
                type="text"
                placeholder="https://your-app-default-rtdb.firebaseio.com"
                value={fbConfig.databaseURL}
                onChange={(e) => setFbConfig({ ...fbConfig, databaseURL: e.target.value })}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-red-500 text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">apiKey *</label>
                <input
                  type="text"
                  placeholder="AIzaSy..."
                  value={fbConfig.apiKey}
                  onChange={(e) => setFbConfig({ ...fbConfig, apiKey: e.target.value })}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-red-500 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">projectId *</label>
                <input
                  type="text"
                  placeholder="karaoke-sync-demo"
                  value={fbConfig.projectId}
                  onChange={(e) => setFbConfig({ ...fbConfig, projectId: e.target.value })}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-red-500 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">authDomain</label>
                <input
                  type="text"
                  placeholder="your-app.firebaseapp.com"
                  value={fbConfig.authDomain}
                  onChange={(e) => setFbConfig({ ...fbConfig, authDomain: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-red-500 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">appId</label>
                <input
                  type="text"
                  placeholder="1:123456789:web:abcdef..."
                  value={fbConfig.appId}
                  onChange={(e) => setFbConfig({ ...fbConfig, appId: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-red-500 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white font-medium py-2.5 rounded-xl shadow-lg shadow-red-500/25 transition active:scale-[0.98]"
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4" /> Đã lưu cấu hình! Đang tải lại...
                </>
              ) : (
                "Lưu cấu hình và Tải lại"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
