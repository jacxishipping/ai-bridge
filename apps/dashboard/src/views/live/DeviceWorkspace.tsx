import React, { useCallback, useState } from "react";
import { api } from "../../api";
import { JXButton } from "../../ui";
import { TasksPanel } from "./TasksPanel";
import { deviceName, deviceStatus, LiveDevice, Payload, time, useRead } from "./shared";

function DeviceDetails({ device }: { device: LiveDevice }) {
  const load = useCallback(() => api.deviceOverview(device.id), [device.id]);
  const { data, error, loading, refresh } = useRead(load);
  return <section aria-label="Device details" className="space-y-5">
    <dl className="grid gap-5 text-sm sm:grid-cols-2">
      {[
        ["Hostname", device.hostname || "Not reported"], ["Operating system", device.os || "Not reported"],
        ["Status", deviceStatus(device)], ["Last seen", time(device.last_seen)],
      ].map(([label, value]) => <div key={label}><dt className="text-slate-400">{label}</dt><dd className="mt-1 break-all">{value}</dd></div>)}
    </dl>
    <JXButton color="neutral" variant="outlined" disabled={loading} onClick={refresh}>Refresh details</JXButton>
    {loading && !data && <p role="status" className="text-sm text-slate-400">Loading device details…</p>}
    {error && <p role="alert" className="text-sm text-amber-300">{error} Inventory details above are from the last fleet refresh.</p>}
    <Payload title="Device identifiers" value={{ id: device.id, tenant: device.tenant }} />
    {data && <>
      <Payload title="System information" value={data.system_info || { note: "No system information reported." }} />
      <Payload title="Resource usage" value={data.resource_usage || { note: "No resource usage reported." }} />
      <Payload title="Effective policy" value={data.device?.effective_policy || { note: "Policy not returned." }} />
    </>}
  </section>;
}

export function DeviceWorkspace({ device, devices, tab, canAct, setTab, back }:
  { device: LiveDevice; devices: LiveDevice[]; tab: string; canAct: boolean; setTab: (tab: string) => void; back: () => void }) {
  const [status, setStatus] = useState("all");
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="break-all text-base font-semibold">{deviceName(device)}</h2>
      <JXButton color="neutral" variant="text" onClick={back}>All devices</JXButton>
    </div>
    <nav aria-label="Device workspace" className="flex flex-wrap gap-2 border-b border-slate-700 pb-3">
      {["details", "tasks", "terminal", "desktop"].map((value) => <JXButton key={value} color="neutral"
        variant={tab === value ? "contained" : "text"} aria-current={tab === value ? "page" : undefined}
        onClick={() => { setStatus("all"); setTab(value); }}>{value.charAt(0).toUpperCase() + value.slice(1)}</JXButton>)}
    </nav>
    {tab === "details" ? <DeviceDetails device={device} /> : <>
      {tab === "terminal" && <p className="text-sm text-slate-400">Commands run as device tasks and may require approval. An interactive remote shell is not available here.</p>}
      {tab === "desktop" && <p className="text-sm text-slate-400">Snapshots, not a live stream. Capturing screen contents may require approval.</p>}
      <TasksPanel key={`${device.id}:${tab}`} devices={devices} device={device} canAct={canAct}
        onlyTool={tab === "terminal" ? "run_shell" : tab === "desktop" ? "capture_desktop_frame" : undefined}
        status={status} onStatus={setStatus} />
    </>}
  </div>;
}
