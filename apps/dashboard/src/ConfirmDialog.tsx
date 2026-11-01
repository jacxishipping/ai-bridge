import React, { useState } from "react";
import { GlassModal, JXButton } from "@jacxishippingorg/jx-ui-react";

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
 * Shared confirmation dialog powered by JXUI GlassModal and JXButton.
 */
export const ConfirmDialog: React.FC<{
  request: ConfirmRequest | null;
  onClose: () => void;
}> = ({ request, onClose }) => {
  const [busy, setBusy] = useState(false);

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
    <GlassModal open={true} onClose={onClose} title={request.title}>
      <p style={{ fontSize: 13, color: "var(--jx-text-secondary, #94a3b8)", margin: "0 0 20px", lineHeight: 1.6 }}>
        {request.message}
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <JXButton
          type="button"
          variant="outlined"
          size="sm"
          disabled={busy}
          onClick={onClose}
        >
          {request.cancelLabel || "Cancel"}
        </JXButton>
        <JXButton
          type="button"
          variant="contained"
          size="sm"
          color={request.danger ? "error" : "primary"}
          disabled={busy}
          loading={busy}
          loadingLabel="Working…"
          onClick={handleConfirm}
        >
          {request.confirmLabel || "Confirm"}
        </JXButton>
      </div>
    </GlassModal>
  );
};
