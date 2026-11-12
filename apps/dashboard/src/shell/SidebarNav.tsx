import React from "react";
import { ArrowUpRight, Server } from "lucide-react";
import { Brand } from "../Brand";
import { useDashboardStore } from "../state/dashboardStore";
import { navigationItems } from "./navigation";
import { token, sessionToken, clearCredentials, api } from "../api";
import type { ViewId } from "../types/dashboard";

export const SidebarNav: React.FC<{ onNavigate?: () => void }> = ({ onNavigate }) => {
  const currentView = useDashboardStore((s) => s.currentView);
  const setCurrentView = useDashboardStore((s) => s.setCurrentView);
  const approvals = useDashboardStore((s) => s.approvals);
  const pending = approvals.filter((approval) => approval.status === "pending").length;
  const navigate = (view: ViewId) => { setCurrentView(view); onNavigate?.(); };
  const isAuth = Boolean(token() || sessionToken());

  return <nav aria-label="Main navigation" className="product-sidebar flex h-full w-full shrink-0 flex-col border-r lg:w-52">
    <div className="flex h-14 shrink-0 items-center px-4">
      <Brand />
    </div>
    <div className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
      {["Workspace", "Manage"].map((group) => <div key={group}>
        <p className="product-kicker mb-2 px-3">{group}</p>
        <ul className="space-y-1">
          {navigationItems.filter((item) => item.group === group).map((item) => {
            const Icon = item.icon;
            const selected = currentView === item.id;
            return <li key={item.id}>
              <button type="button" onClick={() => navigate(item.id)} aria-current={selected ? "page" : undefined}
                className="product-nav-link">
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                {item.id === "human-approvals" && pending > 0 && <span className="text-xs tabular-nums text-amber-200" aria-label={`${pending} pending`}>{pending}</span>}
              </button>
            </li>;
          })}
        </ul>
      </div>)}
    </div>
    <div className="border-t border-[color:var(--product-line)] p-3 space-y-1">
      {isAuth ? (
        <>
          <button type="button" onClick={() => navigate("live")}
            className={`product-nav-link ${currentView === "live" ? "text-[color:var(--product-accent)]!" : "text-[color:var(--product-status-online)]!"}`}>
            <Server className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">Live Workspace</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              try { await api.logout(); } catch {}
              clearCredentials();
              navigate("login");
            }}
            className="product-nav-link text-[color:var(--product-text-dim)]!"
          >
            <span className="flex-1 text-left">Sign Out</span>
          </button>
        </>
      ) : (
        <button type="button" onClick={() => navigate("login")} className="product-nav-link">
          Connect to server<ArrowUpRight className="ms-auto h-4 w-4" aria-hidden="true" /></button>
      )}
    </div>
  </nav>;
};
