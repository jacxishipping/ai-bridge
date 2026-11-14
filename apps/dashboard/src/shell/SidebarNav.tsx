import React from "react";
import { ArrowUpRight, Server } from "lucide-react";
import { Brand } from "../Brand";
import { useDashboardStore } from "../state/dashboardStore";
import { navigationItems, navGroupOrder } from "./navigation";
import { token, sessionToken, clearCredentials, api } from "../api";
import type { ViewId } from "../types/dashboard";

export const SidebarNav: React.FC<{ onNavigate?: () => void }> = ({ onNavigate }) => {
  const currentView = useDashboardStore((s) => s.currentView);
  const setCurrentView = useDashboardStore((s) => s.setCurrentView);
  const approvals = useDashboardStore((s) => s.approvals);
  const pending = approvals.filter((approval) => approval.status === "pending").length;
  const navigate = (view: ViewId) => { setCurrentView(view); onNavigate?.(); };
  const isAuth = Boolean(token() || sessionToken());

  return <nav aria-label="Main navigation" className="product-sidebar flex h-full w-full shrink-0 flex-col border-r lg:w-56">
    <div className="flex h-14 shrink-0 items-center px-4">
      <Brand />
    </div>
    <div className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
      {navGroupOrder.map((group) => {
        const items = navigationItems.filter((item) => item.group === group && !item.nestedUnder);
        if (!items.length) return null;
        return <div key={group}>
          <p className="product-kicker mb-2 px-3">{group}</p>
          <ul className="space-y-1">
            {items.map((item) => {
              const Icon = item.icon;
              const nested = navigationItems.filter((child) => child.nestedUnder === item.id);
              const selected = currentView === item.id || nested.some((child) => child.id === currentView);
              return <li key={item.id}>
                <button type="button" onClick={() => navigate(item.id)} aria-current={currentView === item.id ? "page" : undefined}
                  className="product-nav-link">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.id === "human-approvals" && pending > 0 && (
                    <span className="text-xs tabular-nums text-amber-200" aria-label={`${pending} pending`}>{pending}</span>
                  )}
                </button>
                {selected && nested.length > 0 && (
                  <ul className="mt-1 space-y-1 border-l border-[color:var(--product-line)] ms-4 ps-2">
                    {nested.map((child) => {
                      const ChildIcon = child.icon;
                      return <li key={child.id}>
                        <button type="button" onClick={() => navigate(child.id)}
                          aria-current={currentView === child.id ? "page" : undefined}
                          className="product-nav-link text-sm!">
                          <ChildIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span className="flex-1 text-left">{child.label}</span>
                        </button>
                      </li>;
                    })}
                  </ul>
                )}
              </li>;
            })}
          </ul>
        </div>;
      })}
    </div>
    <div className="border-t border-[color:var(--product-line)] p-3 space-y-1">
      {isAuth ? (
        <>
          <button type="button" onClick={() => navigate("live")}
            className={`product-nav-link ${currentView === "live" ? "text-[color:var(--product-accent)]!" : "text-[color:var(--product-status-online)]!"}`}>
            <Server className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">Live home</span>
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
