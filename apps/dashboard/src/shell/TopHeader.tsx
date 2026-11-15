import React, { useState } from "react";
import { AlertTriangle, Menu, Search, Square, Play } from "lucide-react";
import { GlassModal, GlassToolbar, HoldToConfirmButton, JXButton, ProductModePill, ProductStatusDot } from "../ui";
import { Brand } from "../Brand";
import { DensityControl } from "../DensityControl";
import { LanguageControl } from "../LanguageControl";
import { ThemeControl } from "../ThemeControl";
import { useDashboardStore } from "../state/dashboardStore";
import { token, sessionToken } from "../api";

export const TopHeader: React.FC<{ onMenu: () => void }> = ({ onMenu }) => {
  const isLive = typeof window !== "undefined" && Boolean(token() || sessionToken());
  const stopped = useDashboardStore((s) => s.isEmergencyStopActive);
  const stop = useDashboardStore((s) => s.triggerEmergencyStop);
  const resume = useDashboardStore((s) => s.resumeFleet);
  const setCommandPaletteOpen = useDashboardStore((s) => s.setCommandPaletteOpen);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K";

  return (
    <header className="product-topbar flex min-h-14 shrink-0 items-center gap-2 px-3 py-2 sm:px-5">
      <button type="button" onClick={onMenu} aria-label="Open navigation"
        className="lg:hidden flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[color:var(--product-line)] hover:bg-[var(--product-raised)]">
        <Menu className="h-5 w-5 text-[color:var(--product-text)]" />
      </button>
      <div className="hidden min-[360px]:block lg:hidden"><Brand compact /></div>
      <JXButton variant="outlined" color="neutral" size="sm"
        onClick={() => setCommandPaletteOpen(true)}
        aria-label="Search pages and devices"
        className="product-search min-w-0! flex-1! max-w-xl! justify-start! text-[color:var(--product-text-tertiary)]!"
        startIcon={<Search className="h-4 w-4 shrink-0" />}>
        <span className="flex items-center justify-between gap-2">
          <span className="hidden min-[480px]:inline">Search</span>
          <kbd className="hidden md:inline rounded border border-[color:var(--product-line)] px-1.5 py-0.5 text-xs text-[color:var(--product-text-dim)]">{shortcut}</kbd>
        </span>
      </JXButton>
      <div className="hidden flex-1 lg:block" />
      <div className="hidden xl:block">
        <ProductModePill live={isLive} />
      </div>
      <GlassToolbar>
        <LanguageControl />
        <div className="hidden md:block"><DensityControl /></div>
        <ThemeControl />
      </GlassToolbar>
      <JXButton variant="outlined" color={stopped ? "success" : "error"} size="sm"
        onClick={() => { setStopError(null); setConfirmOpen(true); }}
        aria-label={stopped ? (isLive ? "Resume Fleet" : "Resume demo fleet") : "Emergency All-Stop"}
        startIcon={stopped ? <Play className="h-4 w-4" /> : <Square className="h-4 w-4" />}>
        <span className="inline-flex items-center gap-1.5">
          <ProductStatusDot status={stopped ? "warn" : "online"} pulse={!stopped} />
          <span className="hidden sm:inline">{stopped ? (isLive ? "Resume fleet" : "Resume demo") : "Emergency stop"}</span>
          <span className="sm:hidden">{stopped ? "Resume" : "Stop"}</span>
        </span>
      </JXButton>
      <GlassModal open={confirmOpen} onClose={() => setConfirmOpen(false)} title={stopped ? (isLive ? "Resume live fleet?" : "Resume sample demo?") : (isLive ? "Activate Emergency All-Stop?" : "Stop sample demo tasks?")}>
        <div className="space-y-5">
          {!isLive && (
            <p className="rounded-lg border border-amber-700/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
              Demo only — this does not control real enrolled devices.
            </p>
          )}
          <p className="flex items-start gap-3 text-sm leading-relaxed text-[color:var(--product-text-secondary)]">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
            {isLive
              ? (stopped ? "Clear the global Emergency All-Stop on the control plane and allow enrolled devices to resume picking up queued tasks." : "Immediately halt all autonomous agent execution across every enrolled device connected to the control plane.")
              : (stopped ? "Resume the simulated fleet. Cancelled sample tasks will not restart." : "Cancel pending and running sample tasks in this browser only. Real computers are not affected.")}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {stopError && (
              <p role="alert" className="w-full rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
                {stopError}
              </p>
            )}
            <JXButton variant="outlined" color="neutral" onClick={() => setConfirmOpen(false)}>Cancel</JXButton>
            <HoldToConfirmButton
              label={stopped ? (isLive ? "Hold to resume fleet" : "Hold to resume demo") : (isLive ? "Hold for Emergency All-Stop" : "Hold to stop demo tasks")}
              tone={stopped ? "success" : "danger"}
              variant="solid"
              holdDurationMs={isLive ? 1200 : 700}
              onConfirm={async () => {
                setStopError(null);
                try {
                  if (stopped) await resume(); else await stop();
                  setConfirmOpen(false);
                } catch (err: any) {
                  setStopError(err?.message || "Failed to update control-plane emergency state.");
                }
              }}
            />
          </div>
        </div>
      </GlassModal>
      <span role="status" className="sr-only">{stopped ? (isLive ? "EMERGENCY ALL-STOP ACTIVE — FLEET SUSPENDED" : "Demo fleet stopped") : (isLive ? "Live fleet running" : "Demo fleet running")}</span>
    </header>
  );
};
