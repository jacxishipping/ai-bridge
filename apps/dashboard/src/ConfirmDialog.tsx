import React, { useEffect, useRef, useState } from "react";

export interface ConfirmRequest {
  title: string;
  /** Plain-language explanation of what will happen. */
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for irreversible actions (delete, revoke). */
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

/**
 * Shared in-app confirmation dialog, replacing the browser's built-in prompt.
 * Renders nothing when request is null. Closes on Esc or backdrop click,
 * focuses Cancel first so Enter/Space cannot accidentally confirm a
 * destructive action, and disables both buttons while confirming.
 */
export const ConfirmDialog: React.FC<{
  request: ConfirmRequest | null;
  onClose: () => void;
}> = ({ request, onClose }) => {
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!request) return;
    setBusy(false);
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, onClose]);

  if (!request) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await request.onConfirm();
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <div
      className="f2-dialog-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="f2-dialog"
        style={{ maxWidth: 480 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="f2-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="f2-confirm-title" className="f2-section-title" style={{ marginBottom: 8 }}>
          {request.title}
        </h3>
        <p style={{ fontSize: 13, color: "var(--colorNeutralForeground2)", margin: "0 0 20px", lineHeight: 1.5 }}>
          {request.message}
        </p>
        <div className="f2-dialog-actions">
          <button
            type="button"
            ref={cancelRef}
            className="f2-btn"
            disabled={busy}
            onClick={onClose}
          >
            {request.cancelLabel || "Cancel"}
          </button>
          <button
            type="button"
            className={`f2-btn ${request.danger ? "f2-btn-danger" : "f2-btn-primary"}`}
            disabled={busy}
            onClick={handleConfirm}
          >
            {busy ? "Working…" : request.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
};
