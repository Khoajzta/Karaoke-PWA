import React, { useState } from "react";
import { X, Copy, Check, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

export const QRCodeModal = ({ isOpen, onClose, roomId }) => {
  const [copied, setCopied] = useState(false);
  if (!isOpen || !roomId) return null;

  const roomUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(roomUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Karaoke Realtime Room",
          text: `Tham gia phòng hát Karaoke với mã: ${roomId}`,
          url: roomUrl
        });
      } catch (e) {
        console.warn("Share cancelled or failed", e);
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-6 text-center relative">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="font-bold text-lg text-white mb-1">Mã QR Quét Vào Phòng</h3>
        <p className="text-xs text-slate-400 mb-5">
          Dùng camera điện thoại quét mã này để vào phòng ngay
        </p>

        {/* QR Code Container */}
        <div className="bg-white p-4 rounded-2xl inline-block shadow-xl mb-4">
          <QRCodeSVG
            value={roomUrl}
            size={200}
            level="H"
            includeMargin={true}
          />
        </div>

        {/* 6-character Room Code display */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 mb-4">
          <span className="text-xs text-slate-400 block mb-1">Mã phòng 6 ký tự:</span>
          <span className="font-mono text-2xl font-black text-red-400 tracking-widest">
            {roomId}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2.5 px-3 rounded-xl border border-slate-700 transition"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? "Đã chép link" : "Chép link mời"}</span>
          </button>

          <button
            onClick={handleShare}
            className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white text-xs font-semibold py-2.5 px-3 rounded-xl transition shadow-lg shadow-red-500/20"
          >
            <Share2 className="w-4 h-4" />
            <span>Chia sẻ</span>
          </button>
        </div>
      </div>
    </div>
  );
};
