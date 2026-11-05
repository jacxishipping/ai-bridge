import React, { useCallback, useState } from "react";
import { api } from "../../api";
import { GlassModal, JXButton } from "../../ui";
import { TasksPanel } from "./TasksPanel";
import { deviceName, deviceStatus, Field, fieldClass, LiveDevice, message, Payload, ReadState, time, useRead } from "./shared";

function DeviceDetails({ device, admin, refreshFleet }: { device: LiveDevice; admin: boolean; refreshFleet: () => void }) {
  const load = useCallback(() => api.deviceOverview(device.id), [device.id]);
  const state = useRead(load);
  const { data, error, loading, refresh } = state;
  const [editing, setEditing] = useState(false);
  const [group, setGroup] = useState(device.group || "");
  const [tags, setTags] = useState((device.tags || []).join(", "));
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState("");
  const expired = !!device.token_expires_at && device.token_expires_at * 1000 < Date.now();
  const stale = !device.last_seen || device.last_seen * 1000 < Date.now() - 120000;
  return <section aria-label="Device details" className="space-y-5">
    <dl className="grid gap-5 text-sm sm:grid-cols-2">
      {[
        ["Hostname", device.hostname || "Not reported"], ["Operating system", device.os || "Not reported"],
        ["Status", deviceStatus(device)], ["Last seen", time(device.last_seen)],
        ["Group", device.group || "None"], ["Tags", device.tags?.join(", ") || "None"],
      ].map(([label, value]) => <div key={label}><dt className="text-slate-400">{label}</dt><dd className="mt-1 break-all">{value}</dd></div>)}
    </dl>
    <JXButton color="neutral" variant="outlined" disabled={loading} onClick={refresh}>Refresh details</JXButton>
    <ReadState {...state} />
    <div className="space-y-2 rounded-lg border border-slate-700 p-3 text-sm">
      <h3 className="font-medium">Connection checks</h3>
      <p>{device.revoked ? "Credentials revoked. Re-enroll this device before reconnecting." : expired ? "Device token has expired. Rotate its token through the server’s authenticated agent flow or re-enroll it." :
        stale ? "No recent heartbeat. Check that the agent service is running, the control-plane URL is correct, and outbound HTTPS is allowed." : "A heartbeat was received within the last two minutes."}</p>
      <p className="text-xs text-slate-400">Heartbeat data cannot identify a network or service fault on its own. No remote diagnostics run automatically.</p>
    </div>
    <JXButton color="neutral" variant="outlined" disabled={!admin || loading || !!error} onClick={() => { setGroup(device.group || ""); setTags((device.tags || []).join(", ")); setWriteError(""); setEditing(true); }}>Edit group and tags</JXButton>
    {!admin && <p className="text-xs text-slate-400">An administrator can organize devices into groups and tags.</p>}
    {loading && !data && <p role="status" className="text-sm text-slate-400">Loading device details…</p>}
    {error && <p role="alert" className="text-sm text-amber-300">{error} Inventory details above are from the last fleet refresh.</p>}
    <Payload title="Device identifiers" value={{ id: device.id, tenant: device.tenant }} />
    {data && <>
      <Payload title="System information" value={data.system_info || { note: "No system information reported." }} />
      <Payload title="Resource usage" value={data.resource_usage || { note: "No resource usage reported." }} />
      <Payload title="Effective policy" value={data.device?.effective_policy || { note: "Policy not returned." }} />
    </>}
    {editing && <GlassModal title="Organize device" onClose={() => { if (!busy) setEditing(false); }}>
      <form className="space-y-4" onSubmit={async e => {
        e.preventDefault(); if (busy || writeError) return; setBusy(true);
        try { await api.deviceMetadata(device.id, { group, tags: tags.split(",").map(tag => tag.trim()).filter(Boolean) }); setEditing(false); refreshFleet(); }
        catch (err) { setWriteError(message(err)); }
        finally { setBusy(false); }
      }}>
        <p className="break-all text-sm">{deviceName(device)}</p>
        <Field label="Device group"><input className={fieldClass} value={group} maxLength={60} onChange={e => setGroup(e.target.value)} /></Field>
        <Field label="Device tags (comma separated)"><input className={fieldClass} value={tags} maxLength={410} onChange={e => setTags(e.target.value)} /></Field>
        <p className="text-xs text-slate-400">Up to 10 tags, 40 characters each. Labels do not grant access or change policy.</p>
        {writeError && <p role="alert" className="text-sm text-amber-300">{writeError} Close and refresh before submitting again.</p>}
        <div className="flex justify-end gap-2"><JXButton type="button" color="neutral" variant="outlined" disabled={busy} onClick={() => setEditing(false)}>Cancel</JXButton><JXButton type="submit" disabled={busy || !!writeError}>Save labels</JXButton></div>
      </form>
    </GlassModal>}
  </section>;
}

export function DeviceWorkspace({ device, devices, tab, canAct, admin, refreshFleet, setTab, back }:
  { device: LiveDevice; devices: LiveDevice[]; tab: string; canAct: boolean; admin: boolean; refreshFleet: () => void; setTab: (tab: string) => void; back: () => void }) {
  const [status, setStatus] = useState("all");
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 dir="auto" className="break-all text-base font-semibold">{deviceName(device)}</h2>
      <JXButton color="neutral" variant="text" onClick={back}>All devices</JXButton>
    </div>
    <nav aria-label="Device workspace" className="product-section-tabs flex flex-wrap gap-2 pb-1">
      {["details", "tasks", "terminal", "desktop"].map((value) => <JXButton key={value} color="neutral"
        variant={tab === value ? "contained" : "text"} aria-current={tab === value ? "page" : undefined}
        onClick={() => { setStatus("all"); setTab(value); }}>{value.charAt(0).toUpperCase() + value.slice(1)}</JXButton>)}
    </nav>
    {tab === "details" ? <DeviceDetails device={device} admin={admin} refreshFleet={refreshFleet} /> : <>
      {tab === "terminal" && <p className="text-sm text-slate-400">Commands run as device tasks and may require approval. An interactive remote shell is not available here.</p>}
      {tab === "desktop" && <p className="text-sm text-slate-400">Snapshots, not a live stream. Capturing screen contents may require approval.</p>}
      <TasksPanel key={`${device.id}:${tab}`} devices={devices} device={device} canAct={canAct}
        onlyTool={tab === "terminal" ? "run_shell" : tab === "desktop" ? "capture_desktop_frame" : undefined}
        status={status} onStatus={setStatus} />
    </>}
  </div>;
}
