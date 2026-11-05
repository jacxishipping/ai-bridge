import React, { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw, ShieldCheck } from "lucide-react";
import { api, clearCredentials } from "../api";
import { GlassModal, JXAlert, JXBadge, JXButton } from "../ui";
import { Brand } from "../Brand";
import { DensityControl } from "../DensityControl";
import { LanguageControl } from "../LanguageControl";
import { useLanguage } from "../i18n";
import { useDashboardStore } from "../state/dashboardStore";
import { LiveWorkspace } from "./live/LiveWorkspace";
import type { LiveDevice } from "./live/shared";

interface Snapshot { identity: { actor?: string; username?: string; role?: string }; health: { version: string; emergency_stop: boolean }; devices: LiveDevice[]; checkedAt: Date }

/** Live data is deliberately separate from the local demonstration store. */
export function LiveControlView() {
  const { t, date } = useLanguage();
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
          <h1>{t("Control plane")}</h1>
          {snapshot && <p lang="en" dir="ltr" className="text-xs text-slate-400">Updated <bdi>{date(snapshot.checkedAt, { timeStyle: "medium" })}</bdi></p>}
        </div>
        {snapshot && <div className="flex min-w-0 flex-wrap items-center gap-4">
          <p lang="en" dir="ltr" className="max-w-full break-words text-xs text-slate-300 [overflow-wrap:anywhere]">Signed in as <bdi>{snapshot.identity.actor || snapshot.identity.username || "operator"}</bdi> · {snapshot.identity.role}</p>
          <JXBadge color={error ? "warning" : "success"} statusText={t(error ? "Stale data" : "Connected")} />
        </div>}
      </div>
      {error && <div lang="en" dir="ltr" className="space-y-3">
        <JXAlert severity="error" title="Control plane unavailable" description={`${error} Previously loaded data, if shown, may be stale.`} />
        <JXButton color="neutral" variant="outlined" onClick={signOut}>Return to sign in</JXButton>
      </div>}
      {loading && !snapshot && <p role="status" lang="en" dir="ltr" className="py-8 text-sm text-slate-400">Loading your control plane…</p>}
      {snapshot && <>
        <section lang="en" dir="ltr" aria-label="Fleet safety" className="product-safety relative px-3 py-2" data-stopped={snapshot.health.emergency_stop}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <ShieldCheck className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <p role="status" className="text-sm text-slate-300">{snapshot.health.emergency_stop ? "Emergency stop is active." : "Emergency stop is not active."}</p>
              </div>
              <JXButton variant="outlined" color={snapshot.health.emergency_stop ? "success" : "error"}
                disabled={Boolean(error) || snapshot.identity.role !== "admin"}
                onClick={() => { setActionError(""); setConfirm(true); }}>{snapshot.health.emergency_stop ? "Clear emergency stop" : "Stop fleet"}</JXButton>
            </div>
            {snapshot.identity.role !== "admin" && <p className="mt-2 text-xs text-slate-400">An administrator is required to change the emergency stop.</p>}
        </section>
        <LiveWorkspace key={`${snapshot.identity.actor || snapshot.identity.username}:${snapshot.identity.role}`}
          identity={`${snapshot.identity.actor || snapshot.identity.username || "operator"}:${snapshot.identity.role}`}
          role={snapshot.identity.role || "viewer"} devices={snapshot.devices} stale={Boolean(error) || loading}
          stopped={snapshot.health.emergency_stop} refresh={() => { void refresh(); }} />
      </>}
      <footer lang="en" dir="ltr" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-5">
        <p className="text-xs leading-relaxed text-slate-400">The preview uses sample data, not your live fleet.</p>
        <JXButton color="neutral" variant="text" onClick={() => navigate("overview")} endIcon={<ArrowUpRight className="h-4 w-4" />}>Explore dashboard preview</JXButton>
      </footer>
    </div>
    <div lang="en" dir="ltr"><GlassModal open={confirm} onClose={() => { if (!acting) setConfirm(false); }} title={snapshot?.health.emergency_stop ? "Clear the real emergency stop?" : "Stop the real fleet?"}>
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-slate-300">This sends an authenticated request to your control plane and affects real devices. Continue only if you are authorized.</p>
        {actionError && <JXAlert severity="error" title="Change not confirmed" description={actionError} />}
        <div className="flex flex-wrap justify-end gap-3">
          <JXButton color="neutral" variant="outlined" disabled={acting} onClick={() => setConfirm(false)}>Cancel</JXButton>
          <JXButton color="error" loading={acting} disabled={acting} onClick={changeStop}>Confirm change</JXButton>
        </div>
      </div>
    </GlassModal></div>
  </main>;
}
