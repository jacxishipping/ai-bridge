import React, { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw, ShieldCheck } from "lucide-react";
import { api, apiOrigin, ApiError, clearCredentials, token, sessionToken } from "../api";
import { GlassModal, HoldToConfirmButton, JXAlert, JXBadge, JXButton, ProductGlass, ProductModePill, ProductStatusDot } from "../ui";
import { Brand } from "../Brand";
import { DensityControl } from "../DensityControl";
import { LanguageControl } from "../LanguageControl";
import { PageEmpty } from "../components/PageEmpty";
import { Freshness } from "../components/Freshness";
import { useLanguage } from "../i18n";
import { useDashboardStore } from "../state/dashboardStore";
import { LiveWorkspace } from "./live/LiveWorkspace";
import type { LiveDevice } from "./live/shared";

interface Snapshot { identity: { actor?: string; username?: string; role?: string }; health: { version: string; emergency_stop: boolean }; devices: LiveDevice[]; checkedAt: Date }
interface OpsPulse {
  online_devices?: number;
  total_devices?: number;
  stale_device_count?: number;
  stale_devices?: { id: string; name?: string; heartbeat_age_sec?: number | null }[];
  unhealthy_streams?: number;
  avg_cpu_percent?: number | null;
  avg_memory_percent?: number | null;
  items?: { id: string; tool: string; status: string; role?: string; handoff_id?: string }[];
  recent_failures?: { id: string; tool: string; status: string; role?: string }[];
  running_agents?: { id: string; name: string }[];
  agents_with_errors?: { id: string; name: string; consecutive_failures?: number; last_error?: string | null }[];
  role_agents?: { id: string; name: string; role: string; enabled: boolean; status?: string }[];
  handoffs?: {
    handoff_id: string;
    profile?: string;
    mode?: string;
    goal?: string;
    roles?: string[];
    status?: string;
    blocked_reason?: string | null;
  }[];
  last_stale_sweep?: { swept?: number; ts?: number } | Record<string, unknown> | null;
  desktop_platforms?: { platform: string; stream_available?: boolean; ocr_available?: boolean; reason?: string }[];
  /** Control-plane process host only — not the selected fleet device. */
  host_os?: string;
  host_live_status?: { stream_available?: boolean; available?: boolean; reason?: string; system?: string };
  native_encode?: { available?: boolean; enabled?: boolean; reason?: string };
}

/** Live data is deliberately separate from the local demonstration store. */
export function LiveControlView() {
  const { t } = useLanguage();
  const navigate = useDashboardStore((s) => s.setCurrentView);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [opsPulse, setOpsPulse] = useState<OpsPulse | null>(null);
  const [handoffGoal, setHandoffGoal] = useState("ship next milestone");
  const [handoffProfile, setHandoffProfile] = useState("code");
  const [handoffMode, setHandoffMode] = useState<"gated" | "fanout">("gated");
  const [handoffDevice, setHandoffDevice] = useState("");
  const [handoffMsg, setHandoffMsg] = useState("");
  const [handoffDetail, setHandoffDetail] = useState("");
  const [rolesCatalog, setRolesCatalog] = useState<{ id: string; name: string; enabled: boolean }[]>([]);
  // A 401 clears the stored credential, which would otherwise make the view look
  // like guest demo mode and quietly show sample data after a session ends.
  const [expired, setExpired] = useState(false);
  const isLive = typeof window !== "undefined" && Boolean(token() || sessionToken());
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const wasAuthenticated = Boolean(token() || sessionToken());
    try {
      const [identity, health, devices, fleetHealth, activity, caps, rolesResp] = await Promise.all([
        api.me(),
        api.health(),
        api.devices(),
        api.fleetHealth().catch(() => null),
        api.liveActivity().catch(() => null),
        api.desktopCapabilities().catch(() => null),
        api.roles().catch(() => null),
      ]);
      const deviceList: LiveDevice[] = Array.isArray(devices) ? devices : devices.devices || [];
      setSnapshot({ identity, health, devices: deviceList, checkedAt: new Date() });
      if (deviceList.length) {
        const online = deviceList.find((d) => String(d.status || "").toLowerCase() === "online");
        const preferred = (online || deviceList[0]).id;
        setHandoffDevice((prev) => prev || preferred);
      }
      if (rolesResp?.roles) {
        setRolesCatalog(
          (rolesResp.roles as { id: string; name: string; enabled: boolean }[]).map((r) => ({
            id: r.id,
            name: r.name,
            enabled: Boolean(r.enabled),
          }))
        );
      }
      if (fleetHealth || activity || caps) {
        const platformMap = caps?.platforms && typeof caps.platforms === "object" ? caps.platforms : {};
        const desktop_platforms = Object.entries(platformMap).map(([platform, row]) => {
          const info = (row || {}) as Record<string, unknown>;
          return {
            platform,
            stream_available: Boolean(info.webrtc_desktop_stream),
            ocr_available: Boolean(info.ocr_som),
            reason: typeof info.notes === "string" ? info.notes : undefined,
          };
        });
        const host = (caps?.host_live_status || {}) as Record<string, unknown>;
        const native = (caps?.native_encode || {}) as Record<string, unknown>;
        setOpsPulse({
          online_devices: fleetHealth?.online_devices,
          total_devices: fleetHealth?.total_devices,
          stale_device_count: fleetHealth?.stale_device_count,
          stale_devices: fleetHealth?.stale_devices,
          unhealthy_streams: fleetHealth?.unhealthy_streams,
          avg_cpu_percent: fleetHealth?.avg_cpu_percent,
          avg_memory_percent: fleetHealth?.avg_memory_percent,
          items: activity?.items,
          recent_failures: activity?.recent_failures,
          running_agents: activity?.running_agents,
          agents_with_errors: activity?.agents_with_errors,
          role_agents: activity?.role_agents,
          handoffs: activity?.handoffs,
          last_stale_sweep: activity?.last_stale_sweep,
          desktop_platforms,
          host_os: typeof caps?.host_os === "string" ? caps.host_os : undefined,
          host_live_status: {
            stream_available: Boolean(host.stream_available),
            available: Boolean(host.available),
            reason: typeof host.reason === "string" ? host.reason : undefined,
            system: typeof host.system === "string" ? host.system : undefined,
          },
          native_encode: {
            available: Boolean(native.available),
            enabled: Boolean(native.enabled),
            reason:
              typeof native.reason === "string"
                ? native.reason
                : typeof caps?.host_os === "string"
                  ? `control_plane_host=${caps.host_os}`
                  : undefined,
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load the control plane.";
      if (wasAuthenticated && err instanceof ApiError && err.status === 401) setExpired(true);
      // Suppress expected demo-mode errors from console to reduce noise
      if (!isLive && typeof console !== "undefined") {
        // eslint-disable-next-line no-console
        console.info("[Demo mode] Control plane fetch skipped — no credentials.");
      }
      setError(message);
    }
    finally { setLoading(false); }
  }, [isLive]);
  useEffect(() => { void refresh(); }, [refresh]);
  // Live activity SSE (authenticated fetch stream; EventSource cannot send auth headers).
  useEffect(() => {
    if (!isLive) return;
    let stopped = false;
    const ctrl = new AbortController();
    (async () => {
      try {
        const headers: Record<string, string> = { Accept: "text/event-stream" };
        const st = sessionToken();
        const at = token();
        if (st) headers["X-Session-Token"] = st;
        else if (at) headers["X-Admin-Token"] = at;
        const res = await fetch(api.liveActivityStreamUrl().split("?")[0], { headers, signal: ctrl.signal });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done || stopped) break;
          buf += dec.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            try {
              const payload = JSON.parse(line.slice(5).trim());
              if (stopped) break;
              setOpsPulse((prev) => ({
                ...(prev || {}),
                items: payload.items,
                recent_failures: payload.recent_failures,
                running_agents: payload.running_agents,
                agents_with_errors: payload.agents_with_errors,
                role_agents: payload.role_agents,
                handoffs: payload.handoffs,
                last_stale_sweep: payload.last_stale_sweep,
              }));
            } catch {
              /* ignore malformed frame */
            }
          }
        }
      } catch {
        /* abort / network — manual refresh remains */
      }
    })();
    return () => {
      stopped = true;
      ctrl.abort();
    };
  }, [isLive]);
  // Poll while enrolled devices exist but none are online (first-heartbeat wait).
  useEffect(() => {
    if (!snapshot?.devices?.length) return;
    const online = snapshot.devices.some((d) => String(d.status || "").toLowerCase() === "online");
    if (online) return;
    const id = window.setInterval(() => { void refresh(); }, 8_000);
    return () => window.clearInterval(id);
  }, [snapshot, refresh]);
  const signOut = async () => {
    try { await api.logout(); } catch { /* Local credentials must still be cleared if the API is offline. */ }
    clearCredentials();
    navigate("login");
  };
  const changeStop = async () => {
    if (!snapshot) return;
    setActing(true);
    setActionError("");
    try {
      if (snapshot.health.emergency_stop) await api.emergencyClear(); else await api.emergencyStop();
      setConfirm(false);
      await refresh();
    } catch (err) { setActionError(err instanceof Error ? err.message : "The server rejected this action."); }
    finally { setActing(false); }
  };
  if (expired) {
    return <main className="product-live">
      <header className="product-topbar">
        <div className="product-container flex min-h-14 flex-wrap items-center justify-between gap-3 py-2"><Brand /></div>
      </header>
      <div className="product-container space-y-4 py-6" lang="en" dir="ltr">
        <JXAlert severity="error" title="Session expired" description="Your session expired. No sample data is shown while the session is invalid." />
        <JXButton color="primary" onClick={() => { clearCredentials(); navigate("login"); }}>Return to sign in</JXButton>
      </div>
    </main>;
  }
  return <main className="product-live">
    <header className="product-topbar">
      <div className="product-container flex min-h-14 flex-wrap items-center justify-between gap-3 py-2">
        <Brand />
        <div className="flex flex-wrap items-center gap-2">
          <LanguageControl />
          <DensityControl />
          <JXButton color="neutral" variant="outlined" onClick={refresh} disabled={loading} loading={loading} loadingLabel={t("Refreshing…")} startIcon={<RefreshCw className="h-4 w-4" />}>{t("Refresh")}</JXButton>
          <JXButton color="neutral" variant="text" onClick={signOut}>{t("Sign out")}</JXButton>
        </div>
      </div>
    </header>
    <div className="product-container space-y-4 py-4 sm:py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1>{t("Control plane")}</h1>
            <ProductModePill live={isLive} detail={apiOrigin.replace(/^https?:\/\//, "")} />
          </div>
          {snapshot ? (
            <Freshness checkedAt={snapshot.checkedAt} loading={loading} label="Updated" />
          ) : (
            <p lang="en" dir="ltr" className="text-xs text-[color:var(--product-text-tertiary)]">API {apiOrigin.replace(/^https?:\/\//, "")}</p>
          )}
        </div>
        {snapshot && <div className="flex min-w-0 flex-wrap items-center gap-4">
          <p lang="en" dir="ltr" className="max-w-full break-words text-xs [overflow-wrap:anywhere] text-[color:var(--product-text-secondary)]">Signed in as <bdi>{snapshot.identity.actor || snapshot.identity.username || "operator"}</bdi> · {snapshot.identity.role}</p>
          <span className="inline-flex items-center gap-2">
            <ProductStatusDot status={error ? "warn" : "online"} pulse={!error} label={t(error ? "Stale data" : "Connected")} />
            <JXBadge color={error ? "warning" : "success"} statusText={t(error ? "Stale data" : "Connected")} />
          </span>
        </div>}
      </div>
      {error && <div lang="en" dir="ltr" className="space-y-3">
        {isLive ? (
          <JXAlert severity="error" title="Control plane unavailable" description={`${error} Previously loaded data, if shown, may be stale.`} />
        ) : (
          <PageEmpty
            demo
            title="Connect a control plane to use Live home"
            description="This page stays empty until you sign in. Sample fleet metrics live under Fleet overview — clearly labeled as demo."
            actionLabel="Connect server"
            onAction={() => navigate("login")}
            secondaryLabel="Explore demo overview"
            onSecondary={() => navigate("overview")}
          />
        )}
        {isLive && <JXButton color="neutral" variant="outlined" onClick={signOut}>Return to sign in</JXButton>}
      </div>}
      {loading && !snapshot && <p role="status" lang="en" dir="ltr" className="py-8 text-sm text-[color:var(--product-text-tertiary)]">Loading your control plane…</p>}
      {snapshot && <>
        <ProductGlass className="product-safety relative px-3 py-2">
          <section lang="en" dir="ltr" aria-label="Fleet safety" data-stopped={snapshot.health.emergency_stop}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[color:var(--product-text-tertiary)]" aria-hidden="true" />
                <ProductStatusDot
                  status={snapshot.health.emergency_stop ? "warn" : "online"}
                  pulse={!snapshot.health.emergency_stop}
                  label={snapshot.health.emergency_stop ? "Emergency stop is active." : "Emergency stop is not active."}
                />
              </div>
              <JXButton variant="outlined" color={snapshot.health.emergency_stop ? "success" : "error"}
                disabled={Boolean(error) || snapshot.identity.role !== "admin"}
                onClick={() => { setActionError(""); setConfirm(true); }}>{snapshot.health.emergency_stop ? "Clear emergency stop" : "Stop fleet"}</JXButton>
            </div>
            {snapshot.identity.role !== "admin" && <p className="mt-2 text-xs text-[color:var(--product-text-tertiary)]">An administrator is required to change the emergency stop.</p>}
          </section>
        </ProductGlass>
        {opsPulse && isLive && (
          <ProductGlass className="px-3 py-3" aria-label="Fleet activity and health">
            <p className="text-xs font-medium text-[color:var(--product-text-secondary)]">Live fleet pulse</p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-[color:var(--product-text-tertiary)]">
              <span>
                {opsPulse.online_devices ?? "—"}
                {opsPulse.total_devices != null ? ` / ${opsPulse.total_devices}` : ""} online
              </span>
              {(opsPulse.stale_device_count ?? 0) > 0 && (
                <JXBadge
                  color="warning"
                  statusText={`${opsPulse.stale_device_count} stale${
                    opsPulse.stale_devices?.length
                      ? `: ${(opsPulse.stale_devices || []).map((d) => d.name || d.id).slice(0, 3).join(", ")}`
                      : " heartbeat"
                  }`}
                />
              )}
              {(opsPulse.unhealthy_streams ?? 0) > 0 && (
                <JXBadge color="warning" statusText={`${opsPulse.unhealthy_streams} unhealthy streams`} />
              )}
              {opsPulse.avg_cpu_percent != null && <span>CPU {opsPulse.avg_cpu_percent}%</span>}
              {opsPulse.avg_memory_percent != null && <span>RAM {opsPulse.avg_memory_percent}%</span>}
              <span>{(opsPulse.items?.length ?? 0)} active tasks</span>
              {(opsPulse.agents_with_errors?.length ?? 0) > 0 && (
                <span className="text-[color:var(--product-danger,#c0392b)]">
                  {opsPulse.agents_with_errors!.length} agents with errors
                </span>
              )}
              {opsPulse.last_stale_sweep && typeof opsPulse.last_stale_sweep === "object" && (
                <span title={JSON.stringify(opsPulse.last_stale_sweep)}>
                  Stale sweep
                  {"swept" in opsPulse.last_stale_sweep && opsPulse.last_stale_sweep.swept != null
                    ? ` · ${String(opsPulse.last_stale_sweep.swept)} tasks`
                    : ""}
                </span>
              )}
              {(opsPulse.recent_failures?.length ?? 0) > 0 && (
                <span className="text-[color:var(--product-danger,#c0392b)]">{opsPulse.recent_failures!.length} recent failures</span>
              )}
              {(opsPulse.running_agents?.length ?? 0) > 0 && (
                <span>{opsPulse.running_agents!.length} agents running</span>
              )}
              {(opsPulse.handoffs?.length ?? 0) > 0 && (
                <span>{opsPulse.handoffs!.length} handoffs</span>
              )}
              {(opsPulse.desktop_platforms?.length ?? 0) > 0 && (
                <span title="Static fleet matrix — not the selected device">
                  Fleet matrix:{" "}
                  {opsPulse.desktop_platforms!
                    .map((p) => `${p.platform}${p.stream_available ? "" : " (no stream)"}`)
                    .join(" · ")}
                </span>
              )}
              <span
                title={
                  opsPulse.host_live_status?.reason ||
                  "host_live_status / native_encode reflect the control-plane process host, not the selected fleet device"
                }
              >
                Control-plane host
                {opsPulse.host_os ? ` (${opsPulse.host_os})` : ""} desktop{" "}
                {opsPulse.host_live_status?.stream_available ? "stream-capable" : "no stream"}
              </span>
              {opsPulse.native_encode?.reason && (
                <span title={opsPulse.native_encode.reason}>
                  Control-plane native encode {opsPulse.native_encode.enabled ? "on" : "off/limited"}
                </span>
              )}
            </div>
            {(opsPulse.handoffs?.length ?? 0) > 0 && (
              <div className="mt-3 space-y-2" aria-label="Active handoffs">
                <p className="text-xs font-medium text-[color:var(--product-text-secondary)]">Supervised handoffs</p>
                {opsPulse.handoffs!.slice(0, 5).map((h) => (
                  <div key={h.handoff_id} className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--product-text-tertiary)]">
                    <JXBadge color={h.status === "blocked" ? "warning" : "neutral"} statusText={h.profile || "handoff"} />
                    <span className="font-mono">{h.handoff_id.slice(0, 8)}</span>
                    <span>{(h.roles || []).join(" → ") || "—"}</span>
                    {h.blocked_reason && <span className="text-[color:var(--product-danger,#c0392b)]">{h.blocked_reason}</span>}
                    <JXButton
                      variant="soft"
                      color="neutral"
                      size="sm"
                      onClick={async () => {
                        try {
                          const res = await api.supervisorHandoffStatus(h.handoff_id);
                          const reason = res?.blocked_reason ? ` (${String(res.blocked_reason)})` : "";
                          setHandoffDetail(`${h.handoff_id.slice(0, 8)}: ${String(res?.status || h.status || "active")}${reason}`);
                        } catch (err) {
                          setHandoffDetail(`${h.handoff_id.slice(0, 8)}: ${err instanceof Error ? err.message : "status check failed"}`);
                        }
                      }}
                    >
                      Status
                    </JXButton>
                  </div>
                ))}
                {handoffDetail && (
                  <p className="text-xs font-mono text-[color:var(--product-text-secondary)]" role="status">
                    {handoffDetail}
                  </p>
                )}
              </div>
            )}
            {(opsPulse.items?.some((i) => i.role) || (opsPulse.recent_failures?.length ?? 0) > 0) && (
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Role-tagged tasks">
                {(opsPulse.items || [])
                  .filter((i) => i.role)
                  .slice(0, 8)
                  .map((i) => (
                    <JXBadge key={i.id} color="neutral" statusText={`${i.role}: ${i.tool} (${i.status})`} />
                  ))}
              </div>
            )}
          </ProductGlass>
        )}
        {isLive && snapshot && (
          <ProductGlass className="px-3 py-3" aria-label="Multi-agent supervisor">
            <p className="text-xs font-medium text-[color:var(--product-text-secondary)]">Multi-agent supervisor</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-[color:var(--product-text-tertiary)]">
                Device
                <select
                  className="rounded border border-[color:var(--product-line)] bg-transparent px-2 py-1 text-sm text-[color:var(--product-text-primary)]"
                  value={handoffDevice}
                  onChange={(e) => setHandoffDevice(e.target.value)}
                >
                  {(snapshot.devices || []).map((d) => (
                    <option key={d.id} value={d.id}>{d.name || d.id}</option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[8rem] flex-col gap-1 text-xs text-[color:var(--product-text-tertiary)]">
                Profile
                <select
                  className="rounded border border-[color:var(--product-line)] bg-transparent px-2 py-1 text-sm text-[color:var(--product-text-primary)]"
                  value={handoffProfile}
                  onChange={(e) => setHandoffProfile(e.target.value)}
                >
                  {["code", "research", "desktop", "browser", "full"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[7rem] flex-col gap-1 text-xs text-[color:var(--product-text-tertiary)]">
                Mode
                <select
                  className="rounded border border-[color:var(--product-line)] bg-transparent px-2 py-1 text-sm text-[color:var(--product-text-primary)]"
                  value={handoffMode}
                  onChange={(e) => setHandoffMode(e.target.value as "gated" | "fanout")}
                >
                  <option value="gated">gated</option>
                  <option value="fanout">fanout</option>
                </select>
              </label>
              <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs text-[color:var(--product-text-tertiary)]">
                Goal
                <input
                  className="rounded border border-[color:var(--product-line)] bg-transparent px-2 py-1 text-sm text-[color:var(--product-text-primary)]"
                  value={handoffGoal}
                  onChange={(e) => setHandoffGoal(e.target.value)}
                />
              </label>
              <JXButton
                color="primary"
                disabled={!handoffDevice || acting}
                loading={acting}
                onClick={async () => {
                  setActing(true);
                  setHandoffMsg("");
                  setActionError("");
                  try {
                    const res = await api.supervisorHandoff({
                      device_id: handoffDevice,
                      goal: handoffGoal,
                      profile: handoffProfile,
                      mode: handoffMode,
                    });
                    setHandoffMsg(`Queued ${res?.queued?.length ?? 0} step(s) · handoff ${res?.handoff_id || ""}`);
                    await refresh();
                  } catch (err) {
                    setActionError(err instanceof Error ? err.message : "Handoff failed.");
                  } finally {
                    setActing(false);
                  }
                }}
              >
                Start handoff
              </JXButton>
              <JXButton
                color="neutral"
                variant="outlined"
                disabled={acting}
                onClick={async () => {
                  setActing(true);
                  setHandoffMsg("");
                  try {
                    const failRole = opsPulse?.recent_failures?.find((f) => f.role)?.role || "developer";
                    const res = await api.supervisorRecover({ role: failRole, device_id: handoffDevice || undefined });
                    setHandoffMsg(`Recovered ${res?.count ?? 0} ${failRole} task(s)`);
                    await refresh();
                  } catch (err) {
                    setActionError(err instanceof Error ? err.message : "Recover failed.");
                  } finally {
                    setActing(false);
                  }
                }}
              >
                Recover failed role
              </JXButton>
            </div>
            {handoffMsg && <p className="mt-2 text-xs text-[color:var(--product-text-tertiary)]">{handoffMsg}</p>}
            {actionError && <p className="mt-2 text-xs text-[color:var(--product-danger,#c0392b)]">{actionError}</p>}
            {(rolesCatalog.length > 0 || (opsPulse?.role_agents?.length ?? 0) > 0) && (
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Role agents">
                {(rolesCatalog.length ? rolesCatalog : (opsPulse?.role_agents || []).map((r) => ({
                  id: r.role,
                  name: r.name,
                  enabled: r.enabled,
                }))).map((r) => (
                  <JXButton
                    key={r.id}
                    color="neutral"
                    variant={r.enabled ? "contained" : "outlined"}
                    onClick={async () => {
                      try {
                        await api.enableRole(r.id, !r.enabled);
                        await refresh();
                      } catch (err) {
                        setActionError(err instanceof Error ? err.message : "Role toggle failed.");
                      }
                    }}
                  >
                    {r.name}{r.enabled ? " · on" : " · off"}
                  </JXButton>
                ))}
              </div>
            )}
          </ProductGlass>
        )}
        {(() => {
          const enrolled = snapshot.devices;
          const online = enrolled.filter((d) => String(d.status || "").toLowerCase() === "online");
          const waiting = enrolled.length > 0 && online.length === 0;
          if (!enrolled.length) {
            return (
              <PageEmpty
                title="No devices enrolled yet"
                description="Create an enrollment token on Devices, run the control-plane install command on the host, then return here for the first heartbeat."
                actionLabel="Enroll a device"
                onAction={() => navigate("devices")}
                secondaryLabel="Open connections"
                onSecondary={() => navigate("mcp-and-oauth")}
              />
            );
          }
          if (waiting) {
            return (
              <div className="space-y-4">
                <PageEmpty
                  title="Waiting for first heartbeat"
                  description={`${enrolled.length} device${enrolled.length === 1 ? "" : "s"} enrolled, but none are online yet. Finish the install script on the host, then refresh — this page polls automatically.`}
                  actionLabel="Refresh now"
                  onAction={() => { void refresh(); }}
                  secondaryLabel="Show install commands"
                  onSecondary={() => navigate("devices")}
                />
                <LiveWorkspace key={`${snapshot.identity.actor || snapshot.identity.username}:${snapshot.identity.role}:waiting`}
                  identity={`${snapshot.identity.actor || snapshot.identity.username || "operator"}:${snapshot.identity.role}`}
                  role={snapshot.identity.role || "viewer"} devices={enrolled} stale={Boolean(error) || loading}
                  stopped={snapshot.health.emergency_stop} refresh={() => { void refresh(); }} />
              </div>
            );
          }
          return (
            <LiveWorkspace key={`${snapshot.identity.actor || snapshot.identity.username}:${snapshot.identity.role}`}
              identity={`${snapshot.identity.actor || snapshot.identity.username || "operator"}:${snapshot.identity.role}`}
              role={snapshot.identity.role || "viewer"} devices={enrolled} stale={Boolean(error) || loading}
              stopped={snapshot.health.emergency_stop} refresh={() => { void refresh(); }} />
          );
        })()}
      </>}
      <footer lang="en" dir="ltr" className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--product-line)] pt-5">
        <p className="text-xs leading-relaxed text-[color:var(--product-text-tertiary)]">Operations Dashboard: view complete fleet telemetry, charts, and device execution.</p>
        <JXButton color="neutral" variant="text" onClick={() => navigate("overview")} endIcon={<ArrowUpRight className="h-4 w-4" />}>Explore full dashboard</JXButton>
      </footer>
    </div>
    <div lang="en" dir="ltr"><GlassModal open={confirm} onClose={() => { if (!acting) setConfirm(false); }} title={snapshot?.health.emergency_stop ? "Clear the real emergency stop?" : "Stop the real fleet?"}>
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-[color:var(--product-text-secondary)]">This sends an authenticated request to your control plane and affects real devices. Continue only if you are authorized.</p>
        {actionError && <JXAlert severity="error" title="Change not confirmed" description={actionError} />}
        <div className="flex flex-wrap justify-end gap-3">
          <JXButton color="neutral" variant="outlined" disabled={acting} onClick={() => setConfirm(false)}>Cancel</JXButton>
          <HoldToConfirmButton
            label={snapshot?.health.emergency_stop ? "Hold to clear stop" : "Hold to stop fleet"}
            tone={snapshot?.health.emergency_stop ? "success" : "danger"}
            variant="solid"
            holdDurationMs={1200}
            onConfirm={() => { if (!acting) void changeStop(); }}
          />
        </div>
      </div>
    </GlassModal></div>
  </main>;
}
