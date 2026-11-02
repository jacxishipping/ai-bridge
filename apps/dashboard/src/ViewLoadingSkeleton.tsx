import React from "react";

export const ViewLoadingSkeleton: React.FC<{ title?: string }> = ({ title = "Loading studio…" }) => (
  <div
    style={{
      padding: 36,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 380,
      background: "var(--jx-surface-glass)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      border: "1px solid var(--jx-border-subtle)",
      borderRadius: 18,
      boxShadow: "var(--jx-shadow-1)",
      margin: "16px 0",
    }}
    role="status"
    aria-live="polite"
  >
    <div
      style={{
        width: 42,
        height: 42,
        borderRadius: "50%",
        border: "3px solid var(--jx-border-subtle)",
        borderTopColor: "var(--jx-primary)",
        animation: "jxSpin 0.8s linear infinite",
        marginBottom: 16,
      }}
    />
    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--jx-text-primary)" }}>
      {title}
    </div>
    <div style={{ fontSize: 12, color: "var(--jx-text-tertiary)", marginTop: 6 }}>
      Initializing component & connecting to fleet telemetry…
    </div>
  </div>
);

export default ViewLoadingSkeleton;
