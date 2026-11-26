import React, { useRef } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { useModalAccessibility } from "../../hooks/useModalAccessibility";

export const AppDialog = ({
  config,
  onConfirm,
  onCancel
}) => {
  const dialogRef = useRef(null);
  const isOpen = Boolean(config);
  const isAlert = config?.type === "alert";
  useModalAccessibility(isOpen, onCancel, dialogRef);

  if (!isOpen) return null;

  const Icon = isAlert ? Info : AlertTriangle;
  const isDanger = config.variant === "danger";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div
        ref={dialogRef}
        role={isAlert ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
        tabIndex={-1}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${isDanger ? "border-rose-500/30 bg-rose-500/10 text-rose-400" : "border-amber-500/30 bg-amber-500/10 text-amber-400"}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="app-dialog-title" className="text-base font-bold text-white">
              {config.title || (isAlert ? "Thông báo" : "Xác nhận")}
            </h2>
            <p id="app-dialog-message" className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-300">
              {config.message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          {!isAlert && (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-10 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              {config.cancelLabel || "Hủy"}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-10 rounded-xl px-4 py-2 text-sm font-bold text-white transition ${isDanger ? "bg-rose-600 hover:bg-rose-500" : "bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600"}`}
          >
            {config.confirmLabel || (isAlert ? "Đóng" : "Đồng ý")}
          </button>
        </div>
      </div>
    </div>
  );
};
