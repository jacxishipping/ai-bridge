import React, { useCallback, useState } from "react";
import { api } from "../../api";
import { GlassModal, JXButton } from "../../ui";
import { Empty, Field, fieldClass, message, Pagination, Payload, ReadState, time, useRead } from "./shared";

export function AuditPanel({ admin }: { admin: boolean }) {
  const load = useCallback(() => api.audit(), []);
  const state = useRead<any[]>(load);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const rows = (state.data || []).filter(row => [row.actor, row.tool, row.decision, row.device_id].some(value => String(value || "").toLowerCase().includes(query.toLowerCase())));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 25)));
  return <section aria-label="Live audit log" className="space-y-4">
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Find audit event" className="grow"><input className={fieldClass} value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></Field>
      <JXButton color="neutral" variant="outlined" disabled={state.loading} onClick={state.refresh}>Refresh audit</JXButton>
      {admin && <JXButton color="neutral" variant="outlined" onClick={async () => {
        try {
          const result = await api.exportAudit();
          const url = URL.createObjectURL(new Blob([result.events.map((event: unknown) => JSON.stringify(event)).join("\n")], { type: "application/x-ndjson" }));
          const link = document.createElement("a"); link.href = url; link.download = "ai-bridge-audit.jsonl"; link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000); setError("");
        } catch (err) { setError(message(err)); }
      }}>Export audit</JXButton>}
    </div>
    <ReadState {...state} />
    {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
    {state.data && !rows.length && <Empty title="No matching events" />}
    <ul className="divide-y divide-slate-800">{rows.slice((currentPage - 1) * 25, currentPage * 25).map(row => <li key={row.id} className="space-y-2 py-3">
      <p className="break-words text-sm">{row.tool} · {row.decision}</p>
      <p className="break-words text-xs text-slate-400">{row.actor} · {time(row.ts)}{row.device_id ? ` · ${row.device_id}` : ""}</p>
      <Payload title="Event details" value={row} />
    </li>)}</ul>
    <Pagination page={currentPage} total={rows.length} onPage={setPage} />
    <p className="text-xs text-slate-400">Search covers the latest 500 events. Admin export includes up to 10,000 events. Treat downloaded logs as sensitive.</p>
  </section>;
}

export function PoliciesPanel({ admin }: { admin: boolean }) {
  const load = useCallback(() => api.policies(), []);
  const state = useRead<{ version: number; policy: Record<string, any> }>(load);
  const [draft, setDraft] = useState<{ allow_tier3: boolean; desktop_enabled: boolean; allowed_apps: string[]; allowed_services: string[]; note: string }>();
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <section aria-label="Live policy" className="space-y-4">
    <ReadState {...state} />
    <JXButton color="neutral" variant="outlined" disabled={state.loading} onClick={state.refresh}>Refresh policy</JXButton>
    {state.data && <>
      <p className="text-sm">Global policy · Version {state.data.version}</p>
      <Payload title="Current global policy" value={state.data.policy} />
      <p className="text-xs text-slate-400">Device overrides may differ. Inspect Effective policy on the device before submitting a task.</p>
      <JXButton disabled={!admin || !!state.error || state.loading} onClick={() => {
        const policy = state.data!.policy;
        setDraft({ allow_tier3: !!policy.allow_tier3, desktop_enabled: !!policy.desktop_enabled,
          allowed_apps: policy.allowed_apps || [], allowed_services: policy.allowed_services || [], note: "" });
        setError(""); setReview(false);
      }}>Edit global policy</JXButton>
    </>}
    {!admin && <p className="text-xs text-slate-400">Only administrators can change policy.</p>}
    {draft && <GlassModal title={review ? "Review policy change" : "Edit global policy"} onClose={() => { if (!busy) setDraft(undefined); }}>
      <div className="space-y-4">
        {review ? <>
          <p className="text-sm text-amber-300">This creates a new global policy version for real devices. Enabling sensitive operations reduces approval requirements.</p>
          <Payload title="Proposed policy" value={draft} />
        </> : <>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.allow_tier3} onChange={e => setDraft({ ...draft, allow_tier3: e.target.checked })} />Allow sensitive Tier-3 operations</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.desktop_enabled} onChange={e => setDraft({ ...draft, desktop_enabled: e.target.checked })} />Enable desktop tools</label>
          <Field label="Allowed applications (one per line)"><textarea className={fieldClass} value={draft.allowed_apps.join("\n")} onChange={e => setDraft({ ...draft, allowed_apps: e.target.value.split("\n") })} /></Field>
          <Field label="Allowed services (one per line)"><textarea className={fieldClass} value={draft.allowed_services.join("\n")} onChange={e => setDraft({ ...draft, allowed_services: e.target.value.split("\n") })} /></Field>
          <Field label="Reason for change"><input className={fieldClass} value={draft.note} maxLength={500} onChange={e => setDraft({ ...draft, note: e.target.value })} /></Field>
        </>}
        {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <JXButton color="neutral" variant="outlined" disabled={busy} onClick={() => review ? setReview(false) : setDraft(undefined)}>{review ? "Back" : "Cancel"}</JXButton>
          <JXButton disabled={busy || !draft.note.trim() || !!error} onClick={async () => {
            if (!review) { setReview(true); return; }
            setBusy(true);
            try {
              await api.createPolicy({ ...draft, allowed_apps: draft.allowed_apps.map(s => s.trim()).filter(Boolean), allowed_services: draft.allowed_services.map(s => s.trim()).filter(Boolean) });
              setDraft(undefined); void state.refresh();
            } catch (err) { setError(message(err)); }
            finally { setBusy(false); }
          }}>{review ? "Publish policy" : "Review change"}</JXButton>
        </div>
      </div>
    </GlassModal>}
  </section>;
}

export function ConnectionsPanel({ admin }: { admin: boolean }) {
  const load = useCallback(() => api.connections(), []);
  const state = useRead<any>(load);
  const [edit, setEdit] = useState<{ client_id: string; client_name: string; redirect_uris: string }>();
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <section aria-label="Live connections" className="space-y-4">
    <ReadState {...state} />
    <JXButton color="neutral" variant="outlined" disabled={state.loading} onClick={state.refresh}>Check connections</JXButton>
    {state.data && <>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-400">MCP service</dt><dd>{state.data.mcp?.up ? "Reachable" : "Not reachable"} on control-plane host</dd></div>
        <div><dt className="text-slate-400">OAuth gateway</dt><dd>{state.data.oauth_gateway?.up ? "Reachable" : "Not reachable"} on control-plane host</dd></div>
      </dl>
      <p className="text-xs text-slate-400">Local port checks do not verify external routing or successful authentication.</p>
      <Payload title="Registered OAuth clients" value={state.data.chatgpt?.clients || []} />
      {admin && <ul className="space-y-2">{state.data.chatgpt?.clients?.map((client: any) => <li key={client.client_id}>
        <JXButton color="neutral" variant="outlined" disabled={state.loading || !!state.error} onClick={() => {
          setEdit({ client_id: client.client_id, client_name: client.client_name || "", redirect_uris: client.redirect_uris || "" }); setReview(false); setError("");
        }}>Edit {client.client_name || client.client_id_prefix}</JXButton>
      </li>)}</ul>}
      <p className="text-xs text-slate-400">Only administrators can edit registered clients. Google provider secrets belong in the server environment, never in this dashboard.</p>
    </>}
    {edit && <GlassModal title={review ? "Review OAuth client change" : "Edit OAuth client"} onClose={() => { if (!busy) setEdit(undefined); }}>
      <div className="space-y-4">
        {review ? <>
          <p className="text-sm text-amber-300">Changing redirect URIs affects sign-in for this registered gateway client.</p>
          <Payload title="Proposed client" value={edit} />
        </> : <>
          <Field label="Client name"><input className={fieldClass} value={edit.client_name} maxLength={200} onChange={e => setEdit({ ...edit, client_name: e.target.value })} /></Field>
          <Field label="Redirect URIs (one per line)"><textarea className={fieldClass} value={edit.redirect_uris} maxLength={4096} onChange={e => setEdit({ ...edit, redirect_uris: e.target.value })} /></Field>
          <p className="text-xs text-slate-400">HTTPS URLs or HTTP localhost callbacks only.</p>
        </>}
        {error && <p role="alert" className="text-sm text-amber-300">{error} Close and refresh connections before trying again.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <JXButton color="neutral" variant="outlined" disabled={busy} onClick={() => review ? setReview(false) : setEdit(undefined)}>{review ? "Back" : "Cancel"}</JXButton>
          <JXButton disabled={busy || !!error || !edit.client_name.trim() || !edit.redirect_uris.trim()} onClick={async () => {
            if (!review) { setReview(true); return; }
            setBusy(true);
            try { await api.updateOAuthClient(edit.client_id, { client_name: edit.client_name, redirect_uris: edit.redirect_uris }); setEdit(undefined); void state.refresh(); }
            catch (err) { setError(message(err)); }
            finally { setBusy(false); }
          }}>{review ? "Confirm client change" : "Review client change"}</JXButton>
        </div>
      </div>
    </GlassModal>}
  </section>;
}

export function LogsPanel({ admin }: { admin: boolean }) {
  const [service, setService] = useState("control");
  const load = useCallback(() => admin ? api.logs(service, 100) : Promise.resolve(undefined), [admin, service]);
  const state = useRead<{ lines: string[] } | undefined>(load);
  return <section aria-label="Live service logs" className="space-y-4">
    {!admin ? <p className="text-sm text-slate-400">Service logs require an administrator. Device telemetry is available under Devices.</p> : <>
      <Field label="Log service"><select className={fieldClass} value={service} onChange={e => setService(e.target.value)}>
        {["control", "mcp", "oauth", "nginx"].map(value => <option key={value}>{value}</option>)}
      </select></Field>
      <JXButton color="neutral" variant="outlined" disabled={state.loading} onClick={state.refresh}>Refresh logs</JXButton>
      <ReadState {...state} />
      <p className="text-xs text-slate-400">Latest 100 server log lines, redacted by the API. Log availability depends on the host.</p>
      {state.data && <pre tabIndex={0} aria-label="Service log output" className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3 text-xs text-slate-300">{state.data.lines.join("\n") || "No log lines available."}</pre>}
    </>}
  </section>;
}
