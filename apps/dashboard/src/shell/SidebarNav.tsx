import React from "react";
import { Shield } from "lucide-react";
import { useDashboardStore } from "../state/dashboardStore";
import { navigationItems } from "./navigation";
import type { ViewId } from "../types/dashboard";

export const SidebarNav: React.FC<{ onNavigate?: () => void }> = ({ onNavigate }) => {
  const currentView = useDashboardStore((s) => s.currentView);
  const setCurrentView = useDashboardStore((s) => s.setCurrentView);
  const approvals = useDashboardStore((s) => s.approvals);
  const pending = approvals.filter((approval) => approval.status === "pending").length;
  const navigate = (view: ViewId) => { setCurrentView(view); onNavigate?.(); };

  return <nav aria-label="Main navigation" className="flex h-full w-full shrink-0 flex-col border-r border-slate-800 bg-slate-950 lg:w-56">
    <div className="flex h-[69px] shrink-0 items-center gap-3 px-6">
      <Shield className="h-5 w-5 text-indigo-400" aria-hidden="true" />
      <span className="text-sm font-semibold text-slate-100">AI Bridge</span>
    </div>
    <div className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {["Workspace", "Manage"].map((group) => <div key={group}>
        <p className="mb-2 px-3 text-xs text-slate-400">{group}</p>
        <ul className="space-y-1">
          {navigationItems.filter((item) => item.group === group).map((item) => {
            const Icon = item.icon;
            const selected = currentView === item.id;
            return <li key={item.id}>
              <button type="button" onClick={() => navigate(item.id)} aria-current={selected ? "page" : undefined}
                className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${selected ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"}`}>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                {item.id === "human-approvals" && pending > 0 && <span className="text-xs tabular-nums text-amber-200" aria-label={`${pending} pending`}>{pending}</span>}
              </button>
            </li>;
          })}
        </ul>
      </div>)}
    </div>
    <div className="border-t border-slate-800 p-3">
      <button type="button" onClick={() => navigate("login")} className="min-h-10 w-full rounded-lg px-3 text-left text-sm text-slate-400 hover:bg-slate-900 hover:text-slate-100">Connect to server</button>
    </div>
  </nav>;
};
