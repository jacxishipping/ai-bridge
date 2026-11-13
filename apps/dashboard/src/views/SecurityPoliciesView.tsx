/**
 * Security Policies (Screen 11).
 * Live mode (admin token or session present): real device policy + global policy versions from the control plane.
 * Demo mode (not signed in): seeded, clearly demo-only fixtures from ./SecurityPoliciesDemo.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, token, sessionToken } from "../api";
import { SecurityPoliciesDemo } from "./SecurityPoliciesDemo";
import { JXButton } from "../ui";
import { useScrollShadow } from "../hooks/useScrollShadow";

type Tri = "inherit" | "allow" | "deny";
interface ToolRow { tool: string; tier: number; tier_name: string; allowed: boolean }
interface DevicePolicyResponse {
  device_id: string;
  device_name: string;
  hostname: string;
  os: string;
  has_custom_policy: boolean;
  custom_policy: Record<string, any>;
  effective_policy: Record<string, any>;
  global_policy: Record<string, any>;
  tools: ToolRow[];
}
interface GlobalPolicy { allow_tier3: boolean; desktop_enabled: boolean; allowed_apps: string[]; allowed_services: string[]; note?: string }
interface HistoryRow { version: number; policy_json: string; created_by: string; created_at: string; note: string }
interface SimRow { tool: string; tier: number; allowed_unattended: boolean; requires_approval: boolean }

const TRI_FIELDS: { key: string; label: string }[] = [
  { key: "allow_writes", label: "File writes" },
  { key: "allow_tier3", label: "Tier 3 tools" },
  { key: "desktop_enabled", label: "Desktop control" },
  { key: "allow_shell", label: "Shell commands" },
  { key: "allow_package_install", label: "Package installs" },
  { key: "allow_file_deletion", label: "File deletion" },
];

const inputCls = "w-full p-2 rounded-lg bg-[var(--product-canvas)] border border-[var(--product-line)] text-[var(--product-text-secondary)] text-xs font-mono focus:outline-none";
const cardCls = "rounded-xl border border-[var(--product-line)] bg-[var(--product-surface)]/60 p-4 space-y-3";

const toTri = (v: unknown): Tri => (v === true ? "allow" : v === false ? "deny" : "inherit");
const fromTri = (v: Tri): boolean | null => (v === "allow" ? true : v === "deny" ? false : null);
const toLines = (v: unknown): string => (Array.isArray(v) ? v.join("\n") : "");
const parseLines = (s: string): string[] => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const parsePolicy = (raw: string): Partial<GlobalPolicy> => { try { return JSON.parse(raw) || {}; } catch { return {}; } };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Request failed.");
const isForbidden = (e: unknown) => (e as { status?: number })?.status === 403 || /^403:/.test(errMsg(e));

function validateList(label: string, items: string[]): string | null {
  if (items.some((i) => i.length > 200)) return `${label}: entries must be 200 characters or fewer.`;
  if (new Set(items).size !== items.length) return `${label}: duplicate entries.`;
  return null;
}

const LiveSecurityPolicies: React.FC = () => {
  const [devices, setDevices] = useState<any[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [detail, setDetail] = useState<DevicePolicyResponse | null>(null);
  const [globalPol, setGlobalPol] = useState<{ version: number; policy: GlobalPolicy; note?: string } | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const toolsScrollRef = useRef<HTMLDivElement>(null);
  const toolsScrollShadow = useScrollShadow(toolsScrollRef);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const historyScrollShadow = useScrollShadow(historyScrollRef);
  const globalScrollRef = useRef<HTMLDivElement>(null);
  const globalScrollShadow = useScrollShadow(globalScrollRef);

  // Device form
  const [inherit, setInherit] = useState(true);
  const [unrestricted, setUnrestricted] = useState(false);
  const [tri, setTri] = useState<Record<string, Tri>>({});
  const [maxTier, setMaxTier] = useState("");
  const [apps, setApps] = useState("");
  const [services, setServices] = useState("");
  const [denied, setDenied] = useState<Set<string>>(new Set());
  const [devNote, setDevNote] = useState("");
  const [probeTool, setProbeTool] = useState("");

  // Global form
  const [gTier3, setGTier3] = useState(false);
  const [gDesktop, setGDesktop] = useState(false);
  const [gApps, setGApps] = useState("");
  const [gServices, setGServices] = useState("");
  const [gNote, setGNote] = useState("");
  const [editVersion, setEditVersion] = useState<number | null>(null);
  const [sim, setSim] = useState<SimRow[] | null>(null);

  // Webhook
  const [hookUrl, setHookUrl] = useState("");
  const [hookConfigured, setHookConfigured] = useState<boolean | null>(null);
  const [hookError, setHookError] = useState("");

  const canEdit = role === "" || role === "admin";
  const flash = (kind: "ok" | "err", text: string) => setNotice({ kind, text });

  const applyDetail = useCallback((d: DevicePolicyResponse) => {
    const c = d.custom_policy || {};
    setDetail(d);
    setInherit(c.inherit_global !== false);
    setUnrestricted(Boolean(c.unrestricted));
    setTri(Object.fromEntries(TRI_FIELDS.map((f) => [f.key, toTri(c[f.key])])));
    setMaxTier(typeof c.max_tier_unattended === "number" ? String(c.max_tier_unattended) : "");
    setApps(toLines(c.allowed_apps));
    setServices(toLines(c.allowed_services));
    setDenied(new Set<string>(Array.isArray(c.denied_tools) ? c.denied_tools : []));
    setDevNote(typeof c.note === "string" ? c.note : "");
    setProbeTool((p) => p || d.tools?.[0]?.tool || "");
  }, []);

  const loadGlobal = useCallback(async () => {
    const [cur, hist] = await Promise.all([api.policies(), api.policyHistory()]);
    setGlobalPol(cur);
    setHistory(Array.isArray(hist) ? hist : []);
    const p = cur?.policy || {};
    setGTier3(Boolean(p.allow_tier3));
    setGDesktop(Boolean(p.desktop_enabled));
    setGApps(toLines(p.allowed_apps));
    setGServices(toLines(p.allowed_services));
    setEditVersion(null);
    setSim(null);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setForbidden(false);
    try {
      const [devs, me] = await Promise.all([api.devices(), api.me().catch(() => null)]);
      setRole(typeof me?.role === "string" ? me.role : "");
      const list = Array.isArray(devs) ? devs : [];
      setDevices(list);
      setDeviceId((cur) => cur || list[0]?.id || "");
      await loadGlobal();
    } catch (e) {
      if (isForbidden(e)) setForbidden(true);
      else setLoadError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [loadGlobal]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!deviceId) { setDetail(null); return; }
    let live = true;
    api.devicePolicy(deviceId).then((d) => { if (live) applyDetail(d); })
      .catch((e) => { if (live) { setDetail(null); flash("err", `Could not load device policy: ${errMsg(e)}`); } });
    return () => { live = false; };
  }, [deviceId, applyDetail]);

  useEffect(() => {
    api.getWebhook().then((w) => { setHookConfigured(Boolean(w?.configured)); setHookUrl(""); setHookError(""); })
      .catch((e) => { setHookConfigured(null); setHookError(isForbidden(e) ? "Admin role required to view webhook settings." : errMsg(e)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildDeviceBody = (): { body?: Record<string, unknown>; error?: string } => {
    let mt: number | null = null;
    if (maxTier.trim() !== "") {
      mt = Number(maxTier);
      if (!Number.isInteger(mt) || mt < 0 || mt > 4) return { error: "Max unattended tier must be a whole number from 0 to 4." };
    }
    const a = parseLines(apps);
    const s = parseLines(services);
    const e = validateList("Allowed apps", a) || validateList("Allowed services", s);
    if (e) return { error: e };
    const known = new Set((detail?.tools || []).map((t) => t.tool));
    const unknownDenied = [...denied].filter((t) => known.size > 0 && !known.has(t));
    const body: Record<string, unknown> = {
      inherit_global: inherit,
      unrestricted: unrestricted || null,
      max_tier_unattended: mt,
      allowed_apps: a.length ? a : null,
      allowed_services: s.length ? s : null,
      allowed_tools: detail?.custom_policy?.allowed_tools ?? null,
      denied_tools: denied.size ? [...denied].filter((t) => !unknownDenied.includes(t)).sort() : null,
      note: devNote.trim(),
    };
    for (const f of TRI_FIELDS) body[f.key] = fromTri(tri[f.key] || "inherit");
    return { body };
  };

  const saveDevice = async () => {
    const { body, error } = buildDeviceBody();
    if (error) return flash("err", error);
    if (unrestricted && !window.confirm("Unrestricted removes ALL policy limits for this device. Continue?")) return;
    setBusy(true);
    try {
      applyDetail(await api.setDevicePolicy(deviceId, body));
      flash("ok", "Device policy saved.");
    } catch (e) {
      flash("err", isForbidden(e) ? "Permission denied: admin role is required to change policy." : `Save failed: ${errMsg(e)}`);
    } finally { setBusy(false); }
  };

  const resetDevice = async () => {
    if (!window.confirm("Reset this device to inherit the global policy?")) return;
    setBusy(true);
    try {
      await api.resetDevicePolicy(deviceId);
      applyDetail(await api.devicePolicy(deviceId));
      flash("ok", "Device policy reset to the global policy.");
    } catch (e) {
      flash("err", isForbidden(e) ? "Permission denied: admin role is required to reset policy." : `Reset failed: ${errMsg(e)}`);
    } finally { setBusy(false); }
  };

  const buildGlobal = (): { body?: GlobalPolicy; error?: string } => {
    const a = parseLines(gApps);
    const s = parseLines(gServices);
    const e = validateList("Allowed apps", a) || validateList("Allowed services", s);
    if (e) return { error: e };
    return { body: { allow_tier3: gTier3, desktop_enabled: gDesktop, allowed_apps: a, allowed_services: s, note: gNote.trim() } };
  };

  const runGlobal = async (label: string, fn: (b: GlobalPolicy) => Promise<unknown>) => {
    const { body, error } = buildGlobal();
    if (error || !body) return flash("err", error || "Invalid policy.");
    setBusy(true);
    try {
      await fn(body);
      await loadGlobal();
      if (deviceId) applyDetail(await api.devicePolicy(deviceId));
      flash("ok", label);
    } catch (e) {
      flash("err", isForbidden(e) ? "Permission denied: admin role is required." : `Failed: ${errMsg(e)}`);
    } finally { setBusy(false); }
  };

  const simulate = async () => {
    const { body, error } = buildGlobal();
    if (error || !body) return flash("err", error || "Invalid policy.");
    setBusy(true);
    try {
      const r = await api.simulatePolicy(body);
      setSim(Array.isArray(r?.tools) ? r.tools : []);
    } catch (e) {
      flash("err", isForbidden(e) ? "Permission denied: admin role is required to simulate." : `Simulation failed: ${errMsg(e)}`);
    } finally { setBusy(false); }
  };

  const loadVersionIntoForm = (h: HistoryRow, asEdit: boolean) => {
    const p = parsePolicy(h.policy_json);
    setGTier3(Boolean(p.allow_tier3));
    setGDesktop(Boolean(p.desktop_enabled));
    setGApps(toLines(p.allowed_apps));
    setGServices(toLines(p.allowed_services));
    setGNote(asEdit ? h.note || "" : `Rollback to v${h.version}`);
    setEditVersion(asEdit ? h.version : null);
    setSim(null);
  };

  const deleteVersion = async (v: number) => {
    if (!window.confirm(`Delete policy version v${v}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.deletePolicyVersion(v);
      await loadGlobal();
      flash("ok", `Policy version v${v} deleted.`);
    } catch (e) {
      flash("err", isForbidden(e) ? "Permission denied: admin role is required." : `Delete failed: ${errMsg(e)}`);
    } finally { setBusy(false); }
  };

  const saveWebhook = async (clear = false) => {
    setBusy(true);
    try {
      const r = await api.setWebhook(clear ? "" : hookUrl.trim());
      setHookConfigured(Boolean(r?.configured));
      setHookUrl("");
      flash("ok", clear ? "Webhook removed." : "Webhook saved.");
    } catch (e) {
      flash("err", isForbidden(e) ? "Permission denied: admin role is required." : `Webhook save failed: ${errMsg(e)}`);
    } finally { setBusy(false); }
  };

  const testHook = async () => {
    setBusy(true);
    try { await api.testWebhook(); flash("ok", "Test notification sent."); }
    catch (e) { flash("err", `Webhook test failed: ${errMsg(e)}`); }
    finally { setBusy(false); }
  };

  const probe = useMemo(() => {
    const t = detail?.tools.find((x) => x.tool === probeTool);
    if (!t || !detail) return null;
    const eff = detail.effective_policy || {};
    const needsApproval = t.tier >= 4 || (t.tier === 3 && !eff.allow_tier3);
    return { ...t, needsApproval };
  }, [detail, probeTool]);

  if (loading) return <div role="status" className="p-6 text-sm text-[var(--product-text-tertiary)]">Loading policies from the control plane...</div>;
  if (forbidden) return <div role="alert" className="p-6 rounded-xl border border-rose-700/50 bg-rose-950/30 text-sm text-rose-300">Permission denied: your role cannot view security policies.</div>;
  if (loadError) {
    return (
      <div role="alert" className="p-6 rounded-xl border border-rose-700/50 bg-rose-950/30 text-sm text-rose-300 space-y-3">
        <p>Could not load policies: {loadError}</p>
        <JXButton variant="outlined" color="primary" size="sm" onClick={() => void loadAll()}>Retry</JXButton>
      </div>
    );
  }

  const gp = globalPol?.policy;
  const eff = detail?.effective_policy;

  return (
    <div className="space-y-4">
      {notice && (
        <div role={notice.kind === "err" ? "alert" : "status"}
          className={`rounded-lg border p-3 text-xs font-mono ${notice.kind === "ok" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}>
          {notice.text}
        </div>
      )}
      {!canEdit && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-xs text-amber-300">
          Your role ({role}) is read-only. Changing policy requires the admin role.
        </div>
      )}

      {/* Device policy */}
      <section className={cardCls} aria-label="Device policy">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[var(--product-text)]">Device policy</h2>
          <select aria-label="Device" className={`${inputCls} max-w-xs`} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            {devices.map((d) => <option key={d.id} value={d.id}>{d.name || d.hostname || d.id}</option>)}
          </select>
        </div>

        {devices.length === 0 && <p className="text-xs text-[var(--product-text-tertiary)]">No devices are enrolled yet. Enroll a device to manage its policy.</p>}

        {detail && eff && (
          <>
            <div className="text-xs font-mono text-[var(--product-text-tertiary)]">
              {detail.hostname || detail.device_name} {detail.os && `(${detail.os})`} - source:{" "}
              <span className="text-indigo-300">{detail.has_custom_policy ? "custom device policy" : "inherits global policy"}</span>
              {eff._source === "linux_unrestricted_server" && <span className="ml-2 text-amber-300">UNRESTRICTED</span>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs text-[var(--product-text-secondary)]">
                  <input type="checkbox" disabled={!canEdit} checked={inherit} onChange={(e) => setInherit(e.target.checked)} />
                  Inherit global policy as the base
                </label>
                <label className="flex items-center gap-2 text-xs text-amber-300">
                  <input type="checkbox" disabled={!canEdit} checked={unrestricted} onChange={(e) => setUnrestricted(e.target.checked)} />
                  Unrestricted (disables all limits)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TRI_FIELDS.map((f) => (
                    <label key={f.key} className="text-[11px] text-[var(--product-text-tertiary)] space-y-1">
                      {f.label}
                      <select className={inputCls} disabled={!canEdit} value={tri[f.key] || "inherit"}
                        onChange={(e) => setTri((p) => ({ ...p, [f.key]: e.target.value as Tri }))}>
                        <option value="inherit">Inherit</option>
                        <option value="allow">Allow</option>
                        <option value="deny">Deny</option>
                      </select>
                    </label>
                  ))}
                </div>
                <label className="block text-[11px] text-[var(--product-text-tertiary)] space-y-1">
                  Max tier run unattended (0-4, blank = inherit)
                  <input className={inputCls} disabled={!canEdit} inputMode="numeric" value={maxTier} onChange={(e) => setMaxTier(e.target.value)} />
                </label>
              </div>
              <div className="space-y-3">
                <label className="block text-[11px] text-[var(--product-text-tertiary)] space-y-1">
                  Allowed apps (one per line, blank = inherit)
                  <textarea className={inputCls} rows={3} disabled={!canEdit} value={apps} onChange={(e) => setApps(e.target.value)} />
                </label>
                <label className="block text-[11px] text-[var(--product-text-tertiary)] space-y-1">
                  Allowed services (one per line, blank = inherit)
                  <textarea className={inputCls} rows={3} disabled={!canEdit} value={services} onChange={(e) => setServices(e.target.value)} />
                </label>
                <label className="block text-[11px] text-[var(--product-text-tertiary)] space-y-1">
                  Note
                  <input className={inputCls} disabled={!canEdit} value={devNote} onChange={(e) => setDevNote(e.target.value)} />
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <JXButton variant="contained" color="primary" size="sm" loading={busy} disabled={!canEdit || busy} onClick={() => void saveDevice()}>Save device policy</JXButton>
              <JXButton variant="outlined" color="warning" size="sm" disabled={!canEdit || busy || !detail.has_custom_policy} onClick={() => void resetDevice()}>Reset to global default</JXButton>
            </div>

            <div className="rounded-lg border border-[var(--product-line)] bg-[var(--product-canvas)] p-3 space-y-2">
              <h3 className="text-xs font-semibold text-[var(--product-text-secondary)]">Effective policy (what the server enforces)</h3>
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-mono text-[var(--product-text-secondary)]">
                {["allow_writes", "allow_tier3", "desktop_enabled", "allow_shell", "allow_package_install", "allow_file_deletion"].map((k) => (
                  <div key={k}><dt className="text-[var(--product-text-dim)]">{k}</dt><dd>{eff[k] === undefined ? "n/a" : String(eff[k])}</dd></div>
                ))}
                <div><dt className="text-[var(--product-text-dim)]">max_tier_unattended</dt><dd>{eff.max_tier_unattended === undefined ? "n/a" : String(eff.max_tier_unattended)}</dd></div>
                <div><dt className="text-[var(--product-text-dim)]">allowed_apps</dt><dd>{(eff.allowed_apps || []).join(", ") || "none"}</dd></div>
                <div><dt className="text-[var(--product-text-dim)]">allowed_services</dt><dd>{(eff.allowed_services || []).join(", ") || "none"}</dd></div>
                <div><dt className="text-[var(--product-text-dim)]">denied_tools</dt><dd>{(eff.denied_tools || []).length}</dd></div>
              </dl>
            </div>

            <div className="rounded-lg border border-[var(--product-line)] bg-[var(--product-canvas)] p-3 space-y-2">
              <h3 className="text-xs font-semibold text-[var(--product-text-secondary)]">Check a tool against this device</h3>
              <select aria-label="Tool to check" className={`${inputCls} max-w-xs`} value={probeTool} onChange={(e) => setProbeTool(e.target.value)}>
                {detail.tools.map((t) => <option key={t.tool} value={t.tool}>{t.tool}</option>)}
              </select>
              {probe && (
                <p className="text-xs font-mono text-[var(--product-text-secondary)]">
                  Tier {probe.tier} ({probe.tier_name}):{" "}
                  <span className={probe.allowed ? "text-emerald-300" : "text-rose-300"}>{probe.allowed ? "permitted by policy" : "denied by policy"}</span>
                  {probe.allowed && (probe.needsApproval ? " - requires human approval" : " - may run unattended")}
                </p>
              )}
            </div>

            <div ref={toolsScrollRef} tabIndex={0} role="region" aria-label="Device tools policy" className="overflow-x-auto scroll-shadow rounded-xl border border-[var(--product-line)] max-h-80 overflow-y-auto" data-scroll-left={toolsScrollShadow.left} data-scroll-right={toolsScrollShadow.right}>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[var(--product-canvas)] border-b border-[var(--product-line)] text-[var(--product-text-tertiary)] font-mono uppercase sticky top-0">
                    <th className="p-2">Tool</th><th className="p-2">Tier</th><th className="p-2">Effective</th><th className="p-2">Deny on this device</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {detail.tools.map((t) => (
                    <tr key={t.tool}>
                      <td className="p-2 text-[var(--product-text-secondary)]">{t.tool}</td>
                      <td className="p-2 text-[var(--product-text-tertiary)]">{t.tier} {t.tier_name}</td>
                      <td className={`p-2 ${t.allowed ? "text-emerald-300" : "text-rose-300"}`}>{t.allowed ? "allowed" : "denied"}</td>
                      <td className="p-2">
                        <input type="checkbox" aria-label={`Deny ${t.tool}`} disabled={!canEdit} checked={denied.has(t.tool)}
                          onChange={(e) => setDenied((p) => { const n = new Set(p); if (e.target.checked) n.add(t.tool); else n.delete(t.tool); return n; })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Global policy */}
      <section className={cardCls} aria-label="Global policy">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-[var(--product-text)]">Global policy</h2>
          <span className="text-xs font-mono text-[var(--product-text-tertiary)]">
            {globalPol && globalPol.version > 0 ? `active version v${globalPol.version}` : "no versioned policy yet - environment defaults apply"}
          </span>
        </div>
        {gp && (
          <p className="text-[11px] font-mono text-[var(--product-text-dim)]">
            Active: tier3={String(gp.allow_tier3)} desktop={String(gp.desktop_enabled)} apps={(gp.allowed_apps || []).length} services={(gp.allowed_services || []).length}
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-[var(--product-text-secondary)]">
              <input type="checkbox" disabled={!canEdit} checked={gTier3} onChange={(e) => setGTier3(e.target.checked)} /> Allow Tier 3 tools unattended
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--product-text-secondary)]">
              <input type="checkbox" disabled={!canEdit} checked={gDesktop} onChange={(e) => setGDesktop(e.target.checked)} /> Desktop control enabled
            </label>
            <label className="block text-[11px] text-[var(--product-text-tertiary)] space-y-1">
              Note
              <input className={inputCls} disabled={!canEdit} value={gNote} onChange={(e) => setGNote(e.target.value)} />
            </label>
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] text-[var(--product-text-tertiary)] space-y-1">
              Allowed apps (one per line)
              <textarea className={inputCls} rows={3} disabled={!canEdit} value={gApps} onChange={(e) => setGApps(e.target.value)} />
            </label>
            <label className="block text-[11px] text-[var(--product-text-tertiary)] space-y-1">
              Allowed services (one per line)
              <textarea className={inputCls} rows={3} disabled={!canEdit} value={gServices} onChange={(e) => setGServices(e.target.value)} />
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <JXButton variant="outlined" color="primary" size="sm" disabled={!canEdit || busy} onClick={() => void simulate()}>Simulate impact</JXButton>
          <JXButton variant="contained" color="primary" size="sm" disabled={!canEdit || busy} onClick={() => void runGlobal("Published a new policy version.", (b) => api.createPolicy(b))}>Publish as new version</JXButton>
          {editVersion !== null && (
            <JXButton variant="soft" color="warning" size="sm" disabled={!canEdit || busy}
              onClick={() => void runGlobal(`Updated policy version v${editVersion}.`, (b) => api.updatePolicyVersion(editVersion, b))}>
              Overwrite v{editVersion}
            </JXButton>
          )}
        </div>
        {sim && (
          <div ref={globalScrollRef} tabIndex={0} role="region" aria-label="Policy simulation" className="overflow-x-auto scroll-shadow rounded-xl border border-[var(--product-line)] max-h-64 overflow-y-auto" data-scroll-left={globalScrollShadow.left} data-scroll-right={globalScrollShadow.right}>
            <table className="w-full text-left text-xs border-collapse">
              <thead><tr className="bg-[var(--product-canvas)] border-b border-[var(--product-line)] text-[var(--product-text-tertiary)] font-mono uppercase"><th className="p-2">Tool</th><th className="p-2">Tier</th><th className="p-2">Under proposed policy</th></tr></thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {sim.map((r) => (
                  <tr key={r.tool}>
                    <td className="p-2 text-[var(--product-text-secondary)]">{r.tool}</td>
                    <td className="p-2 text-[var(--product-text-tertiary)]">{r.tier}</td>
                    <td className={`p-2 ${r.allowed_unattended ? "text-emerald-300" : "text-amber-300"}`}>{r.allowed_unattended ? "runs unattended" : "requires approval"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3 className="text-sm font-semibold text-[var(--product-text-secondary)] pt-2">Version history</h3>
        {history.length === 0 ? (
          <p className="text-xs text-[var(--product-text-tertiary)]">No policy versions have been published yet.</p>
        ) : (
          <div ref={historyScrollRef} tabIndex={0} role="region" aria-label="Policy version history" className="overflow-x-auto scroll-shadow rounded-xl border border-[var(--product-line)]" data-scroll-left={historyScrollShadow.left} data-scroll-right={historyScrollShadow.right}>
            <table className="w-full text-left text-xs border-collapse">
              <thead><tr className="bg-[var(--product-canvas)] border-b border-[var(--product-line)] text-[var(--product-text-tertiary)] font-mono uppercase">
                <th className="p-2">Version</th><th className="p-2">Created</th><th className="p-2">By</th><th className="p-2">Settings</th><th className="p-2">Note</th><th className="p-2 text-right">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {history.map((h) => {
                  const p = parsePolicy(h.policy_json);
                  return (
                    <tr key={h.version}>
                      <td className="p-2 text-[var(--product-text-secondary)]">v{h.version}{globalPol?.version === h.version && <span className="ml-2 text-emerald-300">active</span>}</td>
                      <td className="p-2 text-[var(--product-text-tertiary)]">{h.created_at}</td>
                      <td className="p-2 text-[var(--product-text-tertiary)]">{h.created_by}</td>
                      <td className="p-2 text-[var(--product-text-tertiary)]">tier3={String(!!p.allow_tier3)} desktop={String(!!p.desktop_enabled)} apps={(p.allowed_apps || []).length} svc={(p.allowed_services || []).length}</td>
                      <td className="p-2 text-[var(--product-text-tertiary)]">{h.note}</td>
                      <td className="p-2 text-right space-x-1 whitespace-nowrap">
                        <JXButton variant="soft" color="primary" size="sm" disabled={!canEdit} onClick={() => loadVersionIntoForm(h, false)}>Roll back (as new)</JXButton>
                        <JXButton variant="soft" color="primary" size="sm" disabled={!canEdit} onClick={() => loadVersionIntoForm(h, true)}>Edit</JXButton>
                        <JXButton variant="soft" color="error" size="sm" disabled={!canEdit || busy} onClick={() => void deleteVersion(h.version)}>Delete</JXButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Webhook */}
      <section className={cardCls} aria-label="Alert webhook">
        <h2 className="text-base font-semibold text-[var(--product-text)]">Alert webhook</h2>
        {hookError ? (
          <p className="text-xs text-amber-300">{hookError}</p>
        ) : (
          <>
            <p className="text-xs text-[var(--product-text-tertiary)]">
              {hookConfigured === null ? "Checking..." : hookConfigured ? "A webhook is configured (URL hidden)." : "No webhook configured."}
            </p>
            <input aria-label="Webhook URL" className={inputCls} type="password" autoComplete="off" disabled={!canEdit}
              placeholder="https://hooks.example.com/..." value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <JXButton variant="contained" color="primary" size="sm" disabled={!canEdit || busy || !hookUrl.trim()} onClick={() => void saveWebhook()}>Save webhook</JXButton>
              <JXButton variant="outlined" color="primary" size="sm" disabled={busy || !hookConfigured} onClick={() => void testHook()}>Send test</JXButton>
              <JXButton variant="soft" color="error" size="sm" disabled={!canEdit || busy || !hookConfigured} onClick={() => void saveWebhook(true)}>Remove</JXButton>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export const SecurityPoliciesView: React.FC = () => {
  const live = typeof window !== "undefined" && Boolean(token() || sessionToken());
  return live ? <LiveSecurityPolicies /> : <SecurityPoliciesDemo />;
};

export default SecurityPoliciesView;
