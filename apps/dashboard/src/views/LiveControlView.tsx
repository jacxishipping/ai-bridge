import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, Shield } from "lucide-react";
import { api, clearCredentials } from "../api";
import { GlassModal, JXAlert, JXBadge, JXButton, JXCard, JXCardHeader, JXCardContent } from "../ui";
import { useDashboardStore } from "../state/dashboardStore";
import { LiveWorkspace } from "./live/LiveWorkspace";
import type { LiveDevice } from "./live/shared";

interface Snapshot { identity: { actor?: string; username?: string; role?: string }; health: { version: string; emergency_stop: boolean }; devices: LiveDevice[]; checkedAt: Date }

/** Live data is deliberately separate from the local demonstration store. */
export function LiveControlView() {
  const navigate = useDashboardStore((s) => s.setCurrentView);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [identity, health, devices] = await Promise.all([api.me(), api.health(), api.devices()]);
      setSnapshot({ identity, health, devices: Array.isArray(devices) ? devices : devices.devices || [], checkedAt: new Date() });
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load the control plane."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
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
  return <main className="min-h-dvh bg-[#0B0F19] p-4 text-slate-100 sm:p-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <Shield className="h-7 w-7 text-indigo-400" />
          <div><h1 className="text-xl font-semibold">Control plane</h1></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <JXButton color="neutral" variant="outlined" onClick={refresh} disabled={loading} loading={loading} loadingLabel="Refreshing…" startIcon={<RefreshCw className="h-4 w-4" />}>Refresh</JXButton>
          <JXButton color="neutral" variant="text" onClick={signOut}>Sign out</JXButton>
        </div>
      </header>
      {error && <div className="space-y-3">
        <JXAlert severity="error" title="Control plane unavailable" description={`${error} Previously loaded data, if shown, may be stale.`} />
        <JXButton color="neutral" variant="outlined" onClick={signOut}>Return to sign in</JXButton>
      </div>}
      {loading && !snapshot && <p role="status" className="py-8 text-sm text-slate-400">Loading your control plane…</p>}
      {snapshot && <>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-slate-300">Signed in as {snapshot.identity.actor || snapshot.identity.username || "operator"} · {snapshot.identity.role}<br />
            <span className="text-xs text-slate-400">Updated {snapshot.checkedAt.toLocaleTimeString()}</span>
          </p>
          <JXBadge color={error ? "warning" : "success"} statusText={error ? "Stale data" : "Connected"} />
        </div>
        <JXCard>
          <JXCardHeader title="Fleet safety" />
          <JXCardContent>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p role="status" className="text-sm">{snapshot.health.emergency_stop ? "Emergency stop is active." : "Emergency stop is not active."}</p>
              <JXButton color={snapshot.health.emergency_stop ? "success" : "error"}
                disabled={Boolean(error) || snapshot.identity.role !== "admin"}
                onClick={() => { setActionError(""); setConfirm(true); }}>{snapshot.health.emergency_stop ? "Clear emergency stop" : "Stop fleet"}</JXButton>
            </div>
            {snapshot.identity.role !== "admin" && <p className="mt-2 text-xs text-slate-400">An administrator is required to change the emergency stop.</p>}
          </JXCardContent>
        </JXCard>
        <LiveWorkspace key={`${snapshot.identity.actor || snapshot.identity.username}:${snapshot.identity.role}`}
          identity={`${snapshot.identity.actor || snapshot.identity.username || "operator"}:${snapshot.identity.role}`}
          role={snapshot.identity.role || "viewer"} devices={snapshot.devices} stale={Boolean(error) || loading}
          stopped={snapshot.health.emergency_stop} refresh={() => { void refresh(); }} />
      </>}
      <div className="space-y-2 border-t border-slate-800 pt-5">
        <JXButton color="neutral" variant="text" onClick={() => navigate("overview")} startIcon={<ArrowLeft className="h-4 w-4" />}>Explore dashboard preview</JXButton>
        <p className="text-xs leading-relaxed text-slate-400">The preview uses sample data, not your live fleet.</p>
      </div>
    </div>
    <GlassModal open={confirm} onClose={() => { if (!acting) setConfirm(false); }} title={snapshot?.health.emergency_stop ? "Clear the real emergency stop?" : "Stop the real fleet?"}>
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-slate-300">This sends an authenticated request to your control plane and affects real devices. Continue only if you are authorized.</p>
        {actionError && <JXAlert severity="error" title="Change not confirmed" description={actionError} />}
        <div className="flex flex-wrap justify-end gap-3">
          <JXButton color="neutral" variant="outlined" disabled={acting} onClick={() => setConfirm(false)}>Cancel</JXButton>
          <JXButton color="error" loading={acting} disabled={acting} onClick={changeStop}>Confirm change</JXButton>
        </div>
      </div>
    </GlassModal>
  </main>;
}
