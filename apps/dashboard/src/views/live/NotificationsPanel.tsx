import React, { useCallback } from "react";
import { api } from "../../api";
import { JXButton } from "../../ui";
import { ReadState, useRead } from "./shared";

export function NotificationsPanel({ open }: { open: (section: "devices" | "tasks" | "approvals", filter?: string) => void }) {
  const load = useCallback(() => api.notifications(), []);
  const state = useRead<{ offline_devices: number; failed_tasks_24h: number; pending_approvals: number }>(load, true);
  return <section aria-label="Fleet attention" className="space-y-4">
    <ReadState {...state} />
    <JXButton color="neutral" variant="outlined" disabled={state.loading} onClick={state.refresh}>Refresh notifications</JXButton>
    {state.data && <ul className="divide-y divide-slate-800">
      {[
        { label: "Offline or stale devices", count: state.data.offline_devices, section: "devices" as const, filter: "attention" },
        { label: "Failed tasks in the last 24 hours", count: state.data.failed_tasks_24h, section: "tasks" as const, filter: "failed" },
        { label: "Pending approvals", count: state.data.pending_approvals, section: "approvals" as const },
      ].map(item => <li key={item.label} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <span className="text-sm">{item.label}</span>
        <JXButton color="neutral" variant="text" onClick={() => open(item.section, item.filter)}>{item.count.toLocaleString()} · View</JXButton>
      </li>)}
    </ul>}
    <p className="text-xs text-[var(--product-text-tertiary)]">Refreshed every five seconds while this tab is visible. These are current attention counts, not a historical notification inbox. A device is stale after two minutes without a heartbeat.</p>
  </section>;
}
