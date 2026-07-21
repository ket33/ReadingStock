"use client";

// 가벼운 확인 다이얼로그 — 워치리스트 종목 빼기·리스트 삭제 등에 공용
export default function ConfirmDialog({ open, message, confirmLabel = "확인", onConfirm, onCancel }: {
  open: boolean;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl border border-outline-variant shadow-lg p-6 max-w-xs w-full"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-sm text-on-surface leading-relaxed mb-5 whitespace-pre-line">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded-full text-sm text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 rounded-full text-sm font-medium bg-primary text-on-primary hover:opacity-90 transition-opacity"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
