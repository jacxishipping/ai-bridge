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
interface OpsPulse { online_devices?: number; stale_device_count?: number; avg_cpu_percent?: number | null; avg_memory_percent?: number | null; items?: { id: string; tool: string; status: string; role?: string }[]; recent_failures?: { id: string; tool: string; status: string }[]; running_agents?: { id: string; name: string }[] }

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
  // A 401 clears the stored credential, which would otherwise make the view look
  // like guest demo mode and quietly show sample data after a session ends.
  const [expired, setExpired] = useState(false);
  const isLive = typeof window !== "undefined" && Boolean(token() || sessionToken());
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const wasAuthenticated = Boolean(token() || sessionToken());
    try {
      const [identity, health, devices, fleetHealth, activity] = await Promise.all([
        api.me(),
        api.health(),
        api.devices(),
        api.fleetHealth().catch(() => null),
        api.liveActivity().catch(() => null),
      ]);
      setSnapshot({ identity, health, devices: Array.isArray(devices) ? devices : devices.devices || [], checkedAt: new Date() });
      if (fleetHealth || activity) {
        setOpsPulse({
          online_devices: fleetHealth?.online_devices,
          stale_device_count: fleetHealth?.stale_device_count,
          avg_cpu_percent: fleetHealth?.avg_cpu_percent,
          avg_memory_percent: fleetHealth?.avg_memory_percent,
          items: activity?.items,
          recent_failures: activity?.recent_failures,
          running_agents: activity?.running_agents,
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
              <span>{opsPulse.online_devices ?? "—"} online</span>
              {(opsPulse.stale_device_count ?? 0) > 0 && (
                <JXBadge color="warning" statusText={`${opsPulse.stale_device_count} stale heartbeat`} />
              )}
              {opsPulse.avg_cpu_percent != null && <span>CPU {opsPulse.avg_cpu_percent}%</span>}
              {opsPulse.avg_memory_percent != null && <span>RAM {opsPulse.avg_memory_percent}%</span>}
              <span>{(opsPulse.items?.length ?? 0)} active tasks</span>
              {(opsPulse.recent_failures?.length ?? 0) > 0 && (
                <span className="text-[color:var(--product-danger,#c0392b)]">{opsPulse.recent_failures!.length} recent failures</span>
              )}
              {(opsPulse.running_agents?.length ?? 0) > 0 && (
                <span>{opsPulse.running_agents!.length} agents running</span>
              )}
            </div>
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
