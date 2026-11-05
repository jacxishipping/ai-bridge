import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { formatDate, languages, useLanguage } from "../../i18n";

export interface LiveDevice {
  id: string; name?: string; hostname?: string; os?: string; status?: string;
  revoked?: boolean; last_seen?: number | null; tenant?: string;
  group?: string; tags?: string[]; token_expires_at?: number;
}
export interface LiveTask {
  id: string; device_id: string; tool: string; status: string; tier?: number;
  args_json?: string; result?: unknown; created_at?: number; updated_at?: number;
}
export interface LiveApproval {
  id: string; task_id: string; device_id?: string; device_name?: string; tool?: string;
  status: string; args?: Record<string, unknown>; tier?: number; reason?: string;
  requested_by?: string; created_at?: number;
}

export const fieldClass = "product-input w-full min-w-0 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100";
/** Keep label text separate from option text and editable/read-only values. */
export function Field({ label, children, className = "" }:
  { label: string; children: React.ReactElement<{ id?: string }>; className?: string }) {
  const id = useId();
  return <div className={`grid min-w-0 gap-1.5 text-sm text-slate-300 ${className}`}>
    <label htmlFor={id}>{label}</label>{React.cloneElement(children, { id })}
  </div>;
}
export const text = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "";
export const message = (error: unknown) => error instanceof Error ? error.message : "Unable to complete this request.";
export const deviceName = (device: LiveDevice) => device.name || device.hostname || device.id;
export const deviceStatus = (device: LiveDevice) => device.revoked ? "revoked" : device.status || "unknown";
export const time = (timestamp?: number | null) => timestamp ? formatDate(new Date(timestamp * 1000), { dateStyle: "medium", timeStyle: "medium" }) : "Not reported";
export const taskStates = ["all", "queued", "running", "completed", "failed", "needs_approval", "canceled", "timed_out"];
export const normalizeTaskStatus = (status: string) => status === "cancelled" ? "canceled" : status;
export const taskStatus = (status: string) => ({
  queued: "Submitted", running: "Running", completed: "Completed", failed: "Failed",
  needs_approval: "Awaiting approval", canceled: "Canceled", cancelled: "Canceled", timed_out: "Timed out",
}[status] || status.replace(/_/g, " "));
export function argsOf(task: LiveTask): Record<string, unknown> {
  try { const args = JSON.parse(task.args_json || "{}"); return args && typeof args === "object" && !Array.isArray(args) ? args : {}; }
  catch { return {}; }
}

/** Ignore obsolete responses on unmount or a change of device. Keep stale data visibly marked. */
export function useRead<T>(load: () => Promise<T>, poll = false) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<Date>();
  const generation = useRef(0);
  const inFlight = useRef<number>();
  const refresh = useCallback(async () => {
    if (inFlight.current !== undefined) return;
    const current = ++generation.current;
    inFlight.current = current;
    setLoading(true);
    try {
      const next = await load();
      if (current === generation.current) { setData(next); setError(""); setCheckedAt(new Date()); }
    } catch (err) { if (current === generation.current) setError(message(err)); }
    finally {
      if (inFlight.current === current) inFlight.current = undefined;
      if (current === generation.current) setLoading(false);
    }
  }, [load]);
  useEffect(() => {
    setData(undefined); setError(""); void refresh();
    const interval = poll ? window.setInterval(() => { if (!document.hidden) void refresh(); }, 5000) : undefined;
    return () => { ++generation.current; inFlight.current = undefined; window.clearInterval(interval); };
  }, [refresh, poll]);
  return { data, error, loading, refresh, checkedAt };
}

export function ReadState({ loading, error, checkedAt }: { loading: boolean; error: string; checkedAt?: Date }) {
  const { date } = useLanguage();
  const updated = checkedAt ? date(checkedAt, { timeStyle: "medium" }) : "";
  return <div role="status" className="text-xs text-slate-400">
    {error ? <span className="text-amber-300">{error} Last successful update: {updated || "never"}. Refresh to reconnect.</span> :
      loading ? "Refreshing…" : checkedAt ? `Updated ${updated}` : "Not loaded"}
  </div>;
}

export function Pagination({ page, total, size = 25, onPage }: { page: number; total: number; size?: number; onPage: (page: number) => void }) {
  const { locale, t, number } = useLanguage();
  const pages = Math.max(1, Math.ceil(total / size));
  return <nav lang={locale} dir={languages.find(language => language.code === locale)!.dir}
    aria-label={t("{count} results · Page {page} of {pages}", { count: number(total), page: number(page), pages: number(pages) })}
    className="flex flex-wrap items-center justify-end gap-3 text-xs text-slate-300">
    <span>{t("{count} results · Page {page} of {pages}", { count: number(total), page: number(page), pages: number(pages) })}</span>
    <button className="product-button rounded border border-slate-600 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t("Previous page")}</button>
    <button className="product-button rounded border border-slate-600 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t("Next page")}</button>
  </nav>;
}

export function Payload({ title = "Technical details", value }: { title?: string; value: unknown }) {
  return <details className="min-w-0 rounded-lg border border-slate-700 p-3">
    <summary className="cursor-pointer text-sm text-slate-300">{title}</summary>
    <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-300">{text(value)}</pre>
  </details>;
}

export function Empty({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return <div className="space-y-3 py-10 text-center"><h3 className="font-medium">{title}</h3>{children}</div>;
}
