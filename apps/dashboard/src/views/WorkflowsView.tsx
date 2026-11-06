/**
 * Autonomous Workflows — live mode talks to the real control plane
 * (/api/workflows*, /api/ai/tools). Demo mode (not signed in) renders the seeded
 * preview from WorkflowsDemoView, which is the only place fixtures live.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Workflow, Plus, Search, RefreshCw, StopCircle, X, AlertTriangle, Copy, Check, Trash2 } from "lucide-react";
import { api, token, sessionToken } from "../api";
import WorkflowsDemoView from "./WorkflowsDemoView";

interface WfStepDef { name?: string; action: string; args?: Record<string, unknown>; verify?: { text: string; timeout_seconds?: number }; retries?: number }
interface WfStepResult {
  index: number; name: string; action: string; args?: Record<string, unknown>;
  status: "running" | "completed" | "failed"; duration_seconds?: number;
  result?: unknown; error?: string | null; verification?: unknown;
}
interface Wf {
  id: string; name: string; device_id?: string | null; status: string;
  current_step: number; total_steps: number; steps: WfStepDef[]; results: WfStepResult[];
  error?: string | null; created_at?: number; updated_at?: number; completed_at?: number | null;
}
interface Template { id: string; name: string; description?: string; steps: WfStepDef[] }
interface ToolSpec { name: string; description?: string; category?: string; tier?: number; parameters?: any }
interface DraftStep { name: string; action: string; args: string; verifyText: string }

const TERMINAL = new Set(["completed", "failed", "cancelled"]);
const FILTERS = ["all", "running", "completed", "failed", "cancelled"] as const;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Request failed.";
}
function normalize(raw: any): Wf {
  return {
    ...raw,
    id: raw.id ?? raw.workflow_id,
    name: raw.name || raw.id,
    steps: Array.isArray(raw.steps) ? raw.steps : [],
    results: Array.isArray(raw.results) ? raw.results : [],
    current_step: Number(raw.current_step || 0),
    total_steps: Number(raw.total_steps || (raw.steps?.length ?? 0)),
  };
}
function fmtTime(ts?: number | null) {
  if (!ts) return "—";
  return new Date(ts * (ts < 1e12 ? 1000 : 1)).toLocaleString();
}
function statusClass(s: string) {
  if (s === "running") return "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40";
  if (s === "completed") return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40";
  if (s === "failed") return "bg-rose-500/20 text-rose-300 border border-rose-500/40";
  return "bg-slate-800 text-slate-400 border border-slate-700";
}
const draftFromDef = (s: WfStepDef): DraftStep => ({
  name: s.name || "",
  action: s.action,
  args: JSON.stringify(s.args || {}, null, 2),
  verifyText: s.verify?.text || "",
});

function WorkflowsLive() {
  const [workflows, setWorkflows] = useState<Wf[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tools, setTools] = useState<ToolSpec[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState(1);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [streamMode, setStreamMode] = useState<"stream" | "polling" | "idle">("idle");
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [name, setName] = useState("");
  const [deviceId, setDeviceId] = useState("local");
  const [stopOnFailure, setStopOnFailure] = useState(true);
  const [maxRetries, setMaxRetries] = useState(1);
  const [draft, setDraft] = useState<DraftStep[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [builderError, setBuilderError] = useState<string | null>(null);

  const upsert = useCallback((wf: Wf) => {
    setWorkflows((prev) => {
      const i = prev.findIndex((w) => w.id === wf.id);
      if (i < 0) return [wf, ...prev];
      const next = prev.slice();
      next[i] = { ...prev[i], ...wf };
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [wfs, tpls, tl, devs] = await Promise.allSettled([
      api.workflows(), api.workflowTemplates(), api.aiTools("raw"), api.devices(),
    ]);
    if (wfs.status === "fulfilled") {
      const list = (Array.isArray(wfs.value) ? wfs.value : []).map(normalize);
      setWorkflows(list);
      setSelectedId((cur) => (cur && list.some((w) => w.id === cur) ? cur : list[0]?.id ?? null));
    } else {
      setLoadError(errMsg(wfs.reason));
    }
    if (tpls.status === "fulfilled") setTemplates(tpls.value?.templates || []);
    if (tl.status === "fulfilled") setTools(Array.isArray(tl.value?.tools) ? tl.value.tools : []);
    if (devs.status === "fulfilled") setDevices(Array.isArray(devs.value) ? devs.value : devs.value?.devices || []);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const selected = useMemo(() => workflows.find((w) => w.id === selectedId) || null, [workflows, selectedId]);
  const selectedActive = !!selected && !TERMINAL.has(selected.status);

  // Live progress: authenticated fetch stream (EventSource cannot send auth headers), polling fallback.
  const activeId = selectedActive ? selected!.id : null;
  useEffect(() => {
    if (!activeId) { setStreamMode("idle"); return; }
    let stopped = false;
    const ctrl = new AbortController();
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (stopped || pollTimer) return;
      setStreamMode("polling");
      pollTimer = setInterval(async () => {
        try {
          const wf = normalize(await api.workflowDetail(activeId));
          if (!stopped) upsert(wf);
          if (TERMINAL.has(wf.status) && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        } catch { /* keep polling */ }
      }, 2000);
    };

    (async () => {
      try {
        const headers: Record<string, string> = { Accept: "text/event-stream" };
        const st = sessionToken(); const at = token();
        if (st) headers["X-Session-Token"] = st; else if (at) headers["X-Admin-Token"] = at;
        const res = await fetch(api.streamWorkflowUrl(activeId), { headers, signal: ctrl.signal });
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
        setStreamMode("stream");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            try {
              const p = JSON.parse(line.slice(5).trim());
              upsert({
                id: p.workflow_id, status: p.status, current_step: p.current_step,
                total_steps: p.total_steps, results: p.results || [], error: p.error,
              } as Wf);
            } catch { /* ignore malformed frame */ }
          }
        }
        if (!stopped) {
          // Stream ended: confirm final state from the server (falls back to polling if still active).
          const wf = normalize(await api.workflowDetail(activeId));
          upsert(wf);
          if (!TERMINAL.has(wf.status)) startPolling(); else setStreamMode("idle");
        }
      } catch {
        if (!stopped) startPolling();
      }
    })();

    return () => { stopped = true; ctrl.abort(); if (pollTimer) clearInterval(pollTimer); };
  }, [activeId, upsert]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workflows.filter((w) =>
      (filter === "all" || w.status === filter) &&
      (!q || w.name.toLowerCase().includes(q) || w.id.toLowerCase().includes(q) ||
        (w.device_id || "").toLowerCase().includes(q) ||
        w.steps.some((s) => s.action.toLowerCase().includes(q))));
  }, [workflows, filter, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: workflows.length };
    for (const w of workflows) c[w.status] = (c[w.status] || 0) + 1;
    return c;
  }, [workflows]);

  const toolMap = useMemo(() => new Map(tools.map((t) => [t.name, t])), [tools]);

  const stepRows = useMemo(() => {
    if (!selected) return [];
    const n = Math.max(selected.total_steps, selected.steps.length);
    return Array.from({ length: n }, (_, i) => {
      const def = selected.steps[i];
      const res = selected.results.find((r) => r.index === i + 1);
      const status = res?.status || (selected.status === "cancelled" ? "cancelled" : selected.current_step === i + 1 && selectedActive ? "running" : "pending");
      return {
        number: i + 1,
        name: res?.name || def?.name || `Step ${i + 1}`,
        action: res?.action || def?.action || "",
        args: res?.args || def?.args || {},
        status, res,
      };
    });
  }, [selected, selectedActive]);
  const activeStep = stepRows.find((s) => s.number === selectedStep) || stepRows[0];

  const cancel = async () => {
    if (!selected) return;
    setCancelling(true);
    try {
      await api.cancelWorkflow(selected.id);
      upsert(normalize(await api.workflowDetail(selected.id)));
      setNotice({ kind: "ok", text: `Workflow ${selected.id} cancelled.` });
    } catch (e) {
      setNotice({ kind: "error", text: errMsg(e) });
    } finally { setCancelling(false); }
  };

  const openBuilder = (tpl?: Template) => {
    setName(tpl ? tpl.name : "");
    setDraft(tpl ? tpl.steps.map(draftFromDef) : [{ name: "", action: tools[0]?.name || "", args: "{}", verifyText: "" }]);
    setBuilderError(null);
    setBuilderOpen(true);
  };

  const highTier = draft.filter((s) => (toolMap.get(s.action)?.tier ?? 0) >= 3);

  const submit = async () => {
    setBuilderError(null);
    if (!name.trim()) return setBuilderError("Give the workflow a name.");
    if (!draft.length) return setBuilderError("Add at least one step.");
    const steps: WfStepDef[] = [];
    for (let i = 0; i < draft.length; i++) {
      const d = draft[i];
      if (!d.action) return setBuilderError(`Step ${i + 1}: choose a tool.`);
      if (tools.length && !toolMap.has(d.action)) return setBuilderError(`Step ${i + 1}: unknown tool "${d.action}".`);
      let args: Record<string, unknown> = {};
      try {
        const parsed = d.args.trim() ? JSON.parse(d.args) : {};
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        args = parsed;
      } catch { return setBuilderError(`Step ${i + 1}: arguments must be a JSON object.`); }
      const step: WfStepDef = { name: d.name.trim() || `Step ${i + 1}`, action: d.action, args };
      if (d.verifyText.trim()) step.verify = { text: d.verifyText.trim(), timeout_seconds: 8 };
      steps.push(step);
    }
    setSubmitting(true);
    try {
      const out = await api.submitWorkflow({
        name: name.trim(), device_id: deviceId || "local", steps,
        stop_on_failure: stopOnFailure, max_retries: Math.max(0, maxRetries),
      });
      const wf = normalize(await api.workflowDetail(out.workflow_id).catch(() => ({ ...out, id: out.workflow_id, steps, results: [] })));
      upsert(wf);
      setSelectedId(wf.id); setSelectedStep(1);
      setBuilderOpen(false);
      setNotice({ kind: "ok", text: `Workflow ${wf.id} submitted (${steps.length} steps).` });
    } catch (e: any) {
      const m = errMsg(e);
      setBuilderError(/40[13]/.test(m) ? `Not permitted / approval required: ${m}` : m);
    } finally { setSubmitting(false); }
  };

  const copy = (v: unknown) => {
    navigator.clipboard?.writeText(JSON.stringify(v, null, 2));
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const inputCls = "w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono outline-none focus:border-indigo-500";

  return (
    <div className="space-y-4" data-testid="workflows-live">
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-800/60">
        <div className="flex items-center gap-2 text-slate-100 font-semibold text-sm"><Workflow className="w-4 h-4 text-indigo-400" /> Workflows</div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void refresh()} className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs flex items-center gap-2">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button type="button" onClick={() => openBuilder()} className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-2">
            <Plus className="w-4 h-4" /> New workflow
          </button>
        </div>
      </div>

      {notice && (
        <div role={notice.kind === "error" ? "alert" : "status"} className={`p-3 rounded-xl border text-xs font-mono flex items-center justify-between ${notice.kind === "error" ? "bg-rose-950/50 border-rose-500/40 text-rose-300" : "bg-indigo-950/70 border-indigo-500/40 text-indigo-300"}`}>
          <span>{notice.text}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {loadError && (
        <div role="alert" className="p-3 rounded-xl border border-rose-500/40 bg-rose-950/40 text-xs text-rose-300 flex items-center justify-between gap-3">
          <span>Could not load workflows: {loadError}</span>
          <button type="button" onClick={() => void refresh()} className="underline">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-4 rounded-2xl bg-slate-900/70 border border-slate-800 p-4 space-y-3" aria-label="Workflow directory">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3 pointer-events-none" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, id, device, tool..." aria-label="Search workflows" className={`${inputCls} pl-8`} />
          </div>
          <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px]">
            {FILTERS.map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} className={`flex-1 py-1 px-1.5 rounded-lg capitalize ${filter === f ? "bg-slate-800 text-slate-100 font-semibold" : "text-slate-400 hover:text-slate-200"}`}>
                {f} ({counts[f] || 0})
              </button>
            ))}
          </div>
          <div tabIndex={0} aria-label="Workflow plans" className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
            {loading && !workflows.length && <p className="text-xs text-slate-500">Loading workflows…</p>}
            {!loading && !loadError && !workflows.length && <p className="text-xs text-slate-500">No workflows yet. Create one or start from a template.</p>}
            {!loading && workflows.length > 0 && !filtered.length && <p className="text-xs text-slate-500">No workflows match this filter.</p>}
            {filtered.map((w) => (
              <button key={w.id} type="button" onClick={() => { setSelectedId(w.id); setSelectedStep(1); }}
                className={`w-full text-left p-3 rounded-xl border text-xs ${w.id === selectedId ? "bg-indigo-950/50 border-indigo-500/60" : "bg-slate-950/70 border-slate-800 hover:border-slate-700"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-bold text-slate-100 block truncate">{w.name}</span>
                    <span className="font-mono text-[10px] text-indigo-400">{w.id} • {w.device_id || "local"}</span>
                  </div>
                  <span className={`font-mono text-[10px] px-2 py-0.5 rounded font-semibold uppercase shrink-0 ${statusClass(w.status)}`}>
                    {w.status === "running" ? `Step ${w.current_step}/${w.total_steps}` : w.status}
                  </span>
                </div>
                <div className="mt-2 text-[10px] font-mono text-slate-500">{w.total_steps} steps • {fmtTime(w.created_at)}</div>
              </button>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-800 space-y-1.5">
            <span className="text-[10px] uppercase text-slate-500 font-mono">Templates</span>
            {!templates.length && <p className="text-xs text-slate-500">No templates available.</p>}
            {templates.map((t) => (
              <button key={t.id} type="button" onClick={() => openBuilder(t)} className="w-full text-left p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-indigo-500/50 text-xs">
                <span className="text-slate-200 font-semibold block">{t.name}</span>
                <span className="text-[10px] text-slate-500">{t.description} ({t.steps.length} steps)</span>
              </button>
            ))}
          </div>
        </section>

        <section className="lg:col-span-8 space-y-5" aria-label="Workflow detail">
          {!selected ? (
            <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-8 text-center text-xs text-slate-500">
              {loading ? "Loading…" : "Select a workflow to inspect its steps and results."}
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-100">{selected.name}</h2>
                    <p className="text-[11px] font-mono text-slate-500">{selected.id} • device {selected.device_id || "local"} • started {fmtTime(selected.created_at)}{selected.completed_at ? ` • finished ${fmtTime(selected.completed_at)}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${statusClass(selected.status)}`}>{selected.status}</span>
                    {selectedActive && (
                      <button type="button" disabled={cancelling} onClick={() => void cancel()} className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-300 font-mono text-xs flex items-center gap-1.5 disabled:opacity-50">
                        <StopCircle className="w-3.5 h-3.5" /> {cancelling ? "Cancelling…" : "Cancel"}
                      </button>
                    )}
                  </div>
                </div>
                {selectedActive && (
                  <div className="font-mono text-[11px] text-slate-400" role="status">
                    Step {selected.current_step} of {selected.total_steps} • progress via {streamMode === "stream" ? "live stream" : streamMode === "polling" ? "polling (stream unavailable)" : "connecting…"}
                  </div>
                )}
                {selected.error && <div role="alert" className="p-2 rounded-lg bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 font-mono">{selected.error}</div>}
                {!stepRows.length && <p className="text-xs text-slate-500">This workflow has no recorded steps.</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {stepRows.map((s) => (
                    <button key={s.number} type="button" onClick={() => setSelectedStep(s.number)}
                      className={`text-left p-3 rounded-xl border text-xs min-h-[96px] ${activeStep?.number === s.number ? "bg-indigo-950/60 border-indigo-500 ring-1 ring-indigo-500/50" : "bg-slate-950/80 border-slate-800 hover:border-slate-700"}`}>
                      <div className="flex items-center justify-between">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-bold ${s.status === "completed" ? "bg-emerald-600 text-white" : s.status === "running" ? "bg-indigo-600 text-white" : s.status === "failed" ? "bg-rose-600 text-white" : "bg-slate-800 text-slate-400"}`}>{s.status === "completed" ? <Check className="w-3.5 h-3.5" /> : s.number}</span>
                        <span className="font-mono text-[10px] text-slate-400">{s.res?.duration_seconds != null ? `${s.res.duration_seconds}s` : "--"}</span>
                      </div>
                      <span className="font-semibold text-slate-200 block truncate mt-2">{s.name}</span>
                      <span className="font-mono text-[10px] text-slate-400 block truncate">{s.action}</span>
                      <span className="font-mono text-[10px] text-slate-500">{s.status}</span>
                    </button>
                  ))}
                </div>
              </div>

              {activeStep && (
                <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-4 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-200 font-bold">Step {activeStep.number}: {activeStep.name} <span className="text-slate-500">({activeStep.action})</span></span>
                    <button type="button" onClick={() => copy({ action: activeStep.action, args: activeStep.args, result: activeStep.res?.result })} className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-[11px] flex items-center gap-1.5">
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />} {copied ? "Copied" : "Copy step JSON"}
                    </button>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">Arguments</span>
                    <pre className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 overflow-x-auto max-h-32"><code>{JSON.stringify(activeStep.args, null, 2)}</code></pre>
                  </div>
                  {activeStep.res?.error && <div role="alert" className="p-2 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300">{activeStep.res.error}</div>}
                  <div>
                    <span className="text-slate-400 block mb-1">Result</span>
                    {activeStep.res?.result !== undefined && activeStep.res?.result !== null ? (
                      <pre className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 overflow-auto max-h-64"><code>{JSON.stringify(activeStep.res.result, null, 2)}</code></pre>
                    ) : <p className="text-slate-500">{activeStep.status === "running" ? "Running…" : activeStep.status === "pending" ? "Not run yet." : "No result recorded."}</p>}
                  </div>
                  {activeStep.res?.verification !== undefined && (
                    <div>
                      <span className="text-slate-400 block mb-1">Verification</span>
                      <pre className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 overflow-auto max-h-32"><code>{JSON.stringify(activeStep.res.verification, null, 2)}</code></pre>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {builderOpen && (
        <div role="dialog" aria-modal="true" aria-label="New workflow" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4 text-xs font-mono text-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-slate-100">New workflow</h3>
              <button type="button" aria-label="Close workflow builder" onClick={() => setBuilderOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 block"><span className="text-slate-400 uppercase text-[10px] block mb-1">Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></label>
              <label className="block"><span className="text-slate-400 uppercase text-[10px] block mb-1">Target device</span>
                <select aria-label="Workflow target device" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className={inputCls}>
                  <option value="local">local (control plane host)</option>
                  {devices.map((d) => <option key={d.id} value={d.id}>{d.name || d.hostname || d.id}</option>)}
                </select></label>
              <label className="block"><span className="text-slate-400 uppercase text-[10px] block mb-1">Default retries per step</span>
                <input type="number" min={0} max={5} value={maxRetries} onChange={(e) => setMaxRetries(Number(e.target.value))} className={inputCls} /></label>
              <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={stopOnFailure} onChange={(e) => setStopOnFailure(e.target.checked)} /> Stop on first failed step</label>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 uppercase text-[10px]">Steps ({draft.length})</span>
                <button type="button" onClick={() => setDraft((p) => [...p, { name: "", action: tools[0]?.name || "", args: "{}", verifyText: "" }])} className="text-indigo-400 font-bold flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add step</button>
              </div>
              {!tools.length && <p className="text-amber-400">Tool catalog unavailable; step tools can only come from templates.</p>}
              {draft.map((d, i) => {
                const t = toolMap.get(d.action);
                const upd = (patch: Partial<DraftStep>) => setDraft((p) => p.map((s, j) => (j === i ? { ...s, ...patch } : s)));
                return (
                  <div key={i} className="p-2 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-indigo-400">{i + 1}.</span>
                      <input aria-label={`Step ${i + 1} name`} placeholder={`Step ${i + 1}`} value={d.name} onChange={(e) => upd({ name: e.target.value })} className={inputCls} />
                      <select aria-label={`Step ${i + 1} tool`} value={d.action} onChange={(e) => upd({ action: e.target.value })} className={inputCls}>
                        {d.action && !t && <option value={d.action}>{d.action}</option>}
                        {tools.map((tl) => <option key={tl.name} value={tl.name}>{tl.name} (tier {tl.tier ?? "?"})</option>)}
                      </select>
                      <button type="button" aria-label={`Remove step ${i + 1}`} onClick={() => setDraft((p) => p.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4 text-slate-500 hover:text-rose-400" /></button>
                    </div>
                    {t?.description && <p className="text-[10px] text-slate-500">{t.description}</p>}
                    <textarea aria-label={`Step ${i + 1} arguments`} rows={2} value={d.args} onChange={(e) => upd({ args: e.target.value })} className={inputCls} />
                    {t?.parameters?.properties && <p className="text-[10px] text-slate-600">Params: {Object.keys(t.parameters.properties).join(", ") || "none"}{t.parameters.required?.length ? ` (required: ${t.parameters.required.join(", ")})` : ""}</p>}
                    <input aria-label={`Step ${i + 1} verify text`} placeholder="Optional: verify this text appears on screen after the step" value={d.verifyText} onChange={(e) => upd({ verifyText: e.target.value })} className={inputCls} />
                  </div>
                );
              })}
            </div>

            {highTier.length > 0 && (
              <div role="alert" className="p-2 rounded-lg bg-amber-950/40 border border-amber-600/40 text-amber-300 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{highTier.length} step(s) use tier 3+ (sensitive) tools. Workflows run with approvals pre-granted by the operator who submits them; review carefully before submitting.</span>
              </div>
            )}
            {builderError && <div role="alert" className="p-2 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300">{builderError}</div>}
            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
              <button type="button" onClick={() => setBuilderOpen(false)} className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-400">Cancel</button>
              <button type="button" disabled={submitting} onClick={() => void submit()} className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-50">{submitting ? "Submitting…" : "Submit workflow"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const WorkflowsView: React.FC = () => {
  const live = !!(token() || sessionToken());
  return live ? <WorkflowsLive /> : <WorkflowsDemoView />;
};

export default WorkflowsView;
