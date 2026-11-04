import React, { useState } from "react";
import { AlertTriangle, Menu, Search, Square, Play } from "lucide-react";
import { GlassModal, JXButton } from "../ui";
import { useDashboardStore } from "../state/dashboardStore";

export const TopHeader: React.FC<{ onMenu: () => void }> = ({ onMenu }) => {
  const stopped = useDashboardStore((s) => s.isEmergencyStopActive);
  const stop = useDashboardStore((s) => s.triggerEmergencyStop);
  const resume = useDashboardStore((s) => s.resumeFleet);
  const setCommandPaletteOpen = useDashboardStore((s) => s.setCommandPaletteOpen);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K";

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900/90 px-4 py-3 sm:px-6">
      <button type="button" onClick={onMenu} aria-label="Open navigation"
        className="lg:hidden flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 hover:bg-slate-800">
        <Menu className="h-5 w-5" />
      </button>
      <JXButton variant="outlined" color="neutral" size="sm"
        onClick={() => setCommandPaletteOpen(true)}
        aria-label="Search pages and devices"
        className="min-w-0! flex-1! justify-start! text-slate-300"
        startIcon={<Search className="h-4 w-4 shrink-0" />}>
        <span>Search</span>
        <kbd className="hidden md:inline ml-auto rounded border border-slate-700 px-1.5 py-0.5 text-xs">{shortcut}</kbd>
      </JXButton>
      <JXButton variant="outlined" color={stopped ? "success" : "error"} size="sm"
        onClick={() => setConfirmOpen(true)}
        aria-label={stopped ? "Resume demo fleet" : "Emergency All-Stop"}
        startIcon={stopped ? <Play className="h-4 w-4" /> : <Square className="h-4 w-4" />}>
        <span className="hidden sm:inline">{stopped ? "Resume demo" : "Emergency stop"}</span>
        <span className="sm:hidden">{stopped ? "Resume" : "Stop"}</span>
      </JXButton>
      <GlassModal open={confirmOpen} onClose={() => setConfirmOpen(false)} title={stopped ? "Resume demo fleet?" : "Stop demo fleet?"}>
        <div className="space-y-5">
          <p className="flex items-start gap-3 text-sm leading-relaxed text-slate-300">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" />
            {stopped ? "Resume the simulated fleet. Cancelled tasks will not restart." : "Cancel pending and running sample tasks. This affects only this browser, not real computers."}
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <JXButton variant="outlined" color="neutral" onClick={() => setConfirmOpen(false)}>Cancel</JXButton>
            <JXButton color={stopped ? "success" : "error"} onClick={async () => {
              if (stopped) await resume(); else await stop();
              setConfirmOpen(false);
            }}>{stopped ? "Resume demo fleet" : "Stop demo fleet"}</JXButton>
          </div>
        </div>
      </GlassModal>
      <span role="status" className="sr-only">{stopped ? "Demo fleet stopped" : "Demo fleet running"}</span>
    </header>
  );
};
