import React, { useCallback, useState } from "react";
import { api } from "../../api";
import { GlassModal, JXButton } from "../../ui";
import { Field, fieldClass, message, ReadState, useRead } from "./shared";

interface Account { username: string; role: string; disabled: boolean }
export function AccountsPanel({ admin }: { admin: boolean }) {
  const load = useCallback(() => admin ? api.users() as Promise<Account[]> : Promise.resolve([]), [admin]);
  const state = useRead(load);
  const [edit, setEdit] = useState<Account>();
  const [creating, setCreating] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!admin) return <p className="text-sm text-slate-400">User management requires an administrator.</p>;
  return <section aria-label="Live users" className="space-y-4">
    <div className="flex flex-wrap gap-2">
      <JXButton color="neutral" variant="outlined" disabled={state.loading} onClick={state.refresh}>Refresh users</JXButton>
      <JXButton disabled={state.loading || !!state.error} onClick={() => { setCreating(true); setEdit({ username: "", role: "viewer", disabled: false }); setPassword(""); setError(""); }}>Add user</JXButton>
    </div>
    <ReadState {...state} />
    <p className="text-xs text-slate-400">Google users appear after their first sign-in as viewers. Role or access changes revoke their existing sessions.</p>
    <ul className="divide-y divide-slate-800">{state.data?.map(user => <li key={user.username} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
      <span className="min-w-0 break-all" dir="auto">{user.username}</span>
      <span className="text-xs text-slate-400">{user.role} · {user.disabled ? "Disabled" : "Active"}</span>
      <JXButton color="neutral" variant="text" disabled={state.loading || !!state.error} onClick={() => { setCreating(false); setEdit({ ...user }); setError(""); }}>Edit {user.username}</JXButton>
    </li>)}</ul>
    {edit && <GlassModal title={creating ? "Add user" : "Review account access"} onClose={() => { if (!busy) { setEdit(undefined); setPassword(""); } }}>
      <form className="space-y-4" onSubmit={async event => {
        event.preventDefault(); if (busy || error) return; setBusy(true);
        try {
          if (creating) await api.createUser({ username: edit.username.trim(), password, role: edit.role });
          else await api.updateUser(edit.username, { role: edit.role, disabled: !!edit.disabled });
          setEdit(undefined); setPassword(""); void state.refresh();
        } catch (err) { setError(message(err)); }
        finally { setBusy(false); }
      }}>
        {creating ? <>
          <Field label="Username"><input className={fieldClass} required maxLength={100} value={edit.username} onChange={e => setEdit({ ...edit, username: e.target.value })} autoComplete="off" /></Field>
          <Field label="Initial password"><input className={fieldClass} required type="password" minLength={12} maxLength={200} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
        </> : <p className="break-all text-sm">{edit.username}</p>}
        <Field label="Account role"><select className={fieldClass} value={edit.role} onChange={e => setEdit({ ...edit, role: e.target.value })}>
          {["viewer", "operator", "admin"].map(role => <option key={role}>{role}</option>)}
        </select></Field>
        {!creating && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!edit.disabled} onChange={e => setEdit({ ...edit, disabled: e.target.checked })} />Disable account</label>}
        <p className="text-sm text-amber-300">Administrators can change policy, users and fleet safety. Operators can submit tasks. Viewers have read-only access.</p>
        {error && <p role="alert" className="text-sm text-amber-300">{error} Close this dialog and refresh users before trying again.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <JXButton type="button" color="neutral" variant="outlined" disabled={busy} onClick={() => { setEdit(undefined); setPassword(""); }}>Cancel</JXButton>
          <JXButton type="submit" disabled={busy || !!error || !edit.username.trim()}>{creating ? "Create user" : "Confirm access change"}</JXButton>
        </div>
      </form>
    </GlassModal>}
  </section>;
}
