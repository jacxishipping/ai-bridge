import React, { useRef, useState } from "react";
import { api, ApiError } from "../../api";
import { GlassModal, JXButton } from "../../ui";
import { TaskComposer } from "./TaskComposer";
import { defaultFilters, Filters } from "./preferences";
import { deviceName, deviceStatus, Empty, Field, fieldClass, LiveDevice, message, time } from "./shared";

function Enrollment({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [result, setResult] = useState<{ device_id: string; device_token: string }>();
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const create = async () => {
    if (lock.current || !name.trim()) return;
    lock.current = true; setBusy(true); setFeedback("");
    try {
      const response = await api.enroll(name.trim());
      if (!response.device_id || !response.device_token) throw new ApiError("Enrollment response incomplete. Check the device inventory before enrolling again.", true);
      setResult(response); onCreated();
    } catch (err) {
      setFeedback(message(err));
      if (!(err instanceof ApiError && err.uncertain)) lock.current = false;
    } finally { setBusy(false); }
  };
  return <GlassModal title={result ? "Enrollment credentials" : "Enroll device"} onClose={() => { if (!busy) onClose(); }}>
    <div className="space-y-4">
      {result ? <>
        <p className="text-sm text-amber-300">This token is shown once. Supply it privately to the agent, then close this dialog. Do not commit it to a repository.</p>
        <Field label="Device ID"><input className={fieldClass} readOnly value={result.device_id} /></Field>
        <Field label="Device token"><textarea className={`${fieldClass} font-mono`} readOnly value={result.device_token} /></Field>
        <p className="text-sm text-slate-400">The device stays offline until its agent connects using these credentials.</p>
        <JXButton color="neutral" variant="outlined" onClick={async () => {
          try { await navigator.clipboard.writeText(result.device_token); setFeedback("Device token copied."); }
          catch { setFeedback("Clipboard unavailable. Select and copy the token above."); }
        }}>Copy token</JXButton>
      </> : <>
        <Field label="Device name"><input className={fieldClass} value={name} maxLength={100} disabled={busy} onChange={(e) => setName(e.target.value)} /></Field>
        <p className="text-sm text-slate-400">Creates credentials for one agent. This does not install or start the agent.</p>
      </>}
      {feedback && <p role="status" className="text-sm text-slate-200">{feedback}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <JXButton color="neutral" variant="outlined" disabled={busy} onClick={onClose}>{result ? "Done" : "Cancel"}</JXButton>
        {!result && <JXButton disabled={busy || lock.current || !name.trim()} loading={busy} onClick={create}>Create enrollment</JXButton>}
      </div>
    </div>
  </GlassModal>;
}

export function Inventory({ devices, filters, onFilters, canAct, canEnroll, openDevice, refresh }:
  { devices: LiveDevice[]; filters: Filters; onFilters: (filters: Filters) => void; canAct: boolean; canEnroll: boolean;
    openDevice: (id: string, tab?: string) => void; refresh: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState(false);
  const [enroll, setEnroll] = useState(false);
  const query = filters.query.trim().toLocaleLowerCase();
  const visible = devices.filter((device) => (filters.status === "all" || deviceStatus(device) === filters.status) &&
    [device.name, device.hostname, device.id].some((value) => value?.toLocaleLowerCase().includes(query)))
    .sort((a, b) => filters.sort === "last_seen" ? (b.last_seen || 0) - (a.last_seen || 0) || deviceName(a).localeCompare(deviceName(b)) : deviceName(a).localeCompare(deviceName(b)));
  const eligible = visible.filter((device) => !device.revoked);
  const targets = devices.filter((device) => selected.includes(device.id) && !device.revoked);
  const allSelected = eligible.length > 0 && eligible.every((device) => selected.includes(device.id));
  return <section aria-label="Devices" className="space-y-4">
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Find device" className="grow basis-48"><input className={fieldClass} value={filters.query} maxLength={200} placeholder="Name, hostname or ID"
        onChange={(e) => onFilters({ ...filters, query: e.target.value })} /></Field>
      <Field label="Device status"><select className={fieldClass} value={filters.status} onChange={(e) => onFilters({ ...filters, status: e.target.value })}>
        {["all", "online", "offline", "revoked", "unknown"].map((value) => <option key={value} value={value}>{value === "all" ? "All devices" : value.charAt(0).toUpperCase() + value.slice(1)}</option>)}
      </select></Field>
      <Field label="Sort devices"><select className={fieldClass} value={filters.sort} onChange={(e) => onFilters({ ...filters, sort: e.target.value })}>
        <option value="name">Name</option><option value="last_seen">Last seen</option>
      </select></Field>
      <JXButton color="neutral" variant="outlined" disabled={!canEnroll} onClick={() => setEnroll(true)}>Enroll device</JXButton>
    </div>
    {!canEnroll && <p className="text-xs text-slate-400">Enrollment requires an administrator and current fleet data.</p>}
    {targets.length > 0 && <div role="region" aria-label="Selected devices" className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-600 bg-slate-800 p-3">
      <p className="mr-auto text-sm">{targets.length} selected{targets.some((device) => !visible.includes(device)) ? " (including hidden devices)" : ""}</p>
      <JXButton color="neutral" variant="text" onClick={() => setSelected([])}>Clear selection</JXButton>
      <JXButton disabled={!canAct} onClick={() => setBulk(true)}>Run on selected</JXButton>
    </div>}
    {!devices.length ? <Empty title="No devices enrolled yet">
      <p className="text-sm text-slate-400">Enroll an agent to get started.</p>
    </Empty> : !visible.length ? <Empty title="No matching devices">
      <JXButton color="neutral" variant="outlined" onClick={() => onFilters({ ...defaultFilters, taskStatus: filters.taskStatus })}>Clear device filters</JXButton>
    </Empty> : <div className="overflow-x-auto" role="region" aria-label="Live device inventory" tabIndex={0}>
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="border-b border-slate-700 text-xs text-slate-400"><tr>
          <th className="p-3"><input type="checkbox" aria-label="Select visible devices" disabled={!canAct || !eligible.length} checked={allSelected}
            onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...eligible.map((device) => device.id)])] : selected.filter((id) => !eligible.some((device) => device.id === id)))} /></th>
          <th className="p-3">Device</th><th className="p-3">Status</th><th className="p-3">Last seen</th><th className="relative p-3"><span className="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>{visible.map((device) => <tr key={device.id} className="border-b border-slate-800 hover:bg-slate-800/40">
          <td className="p-3"><input type="checkbox" aria-label={`Select ${deviceName(device)}`} disabled={!canAct || !!device.revoked}
            checked={targets.some((target) => target.id === device.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, device.id] : selected.filter((id) => id !== device.id))} /></td>
          <td className="p-3"><button onClick={() => openDevice(device.id)} className="text-left font-medium text-slate-100 underline decoration-slate-600 underline-offset-4">{deviceName(device)}</button></td>
          <td className="p-3 capitalize">{deviceStatus(device)}</td><td className="p-3 text-xs text-slate-400">{time(device.last_seen)}</td>
          <td className="p-3"><details><summary aria-label={`More actions for ${deviceName(device)}`} className="cursor-pointer text-slate-300">More</summary>
            <div className="mt-2 grid gap-2">{["tasks", "terminal", "desktop"].map((tab) => <button key={tab} className="py-1 text-left text-xs capitalize text-slate-300" onClick={() => openDevice(device.id, tab)}>{tab}</button>)}</div>
          </details></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {bulk && <TaskComposer devices={targets} canAct={canAct} onClose={() => { setBulk(false); setSelected([]); }} onSubmitted={refresh} />}
    {enroll && <Enrollment onClose={() => setEnroll(false)} onCreated={refresh} />}
  </section>;
}
