/**
 * AI Bridge Enterprise Dashboard — Sidebar Navigation Rail
 * Strict JXUI Primitives & Lucide Icons. ZERO inline styles.
 */

import React from "react";
import {
  JXBox,
  JXStack,
  JXBadge,
  JXButton,
} from "@jacxishippingorg/jx-ui-react";
import {
  Shield,
  LayoutDashboard,
  Server,
  Cpu,
  ListChecks,
  MonitorPlay,
  Terminal,
  Workflow,
  Zap,
  Bot,
  ShieldCheck,
  Lock,
  ScrollText,
  Network,
  Activity,
  CheckCircle2,
} from "lucide-react";
import { useDashboardStore } from "../state/dashboardStore";
import type { ViewId, NavDomain } from "../types/dashboard";

interface NavEntry {
  id: ViewId;
  label: string;
  domain: NavDomain;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeColor?: "primary" | "success" | "warning" | "error";
}

const NAV_ITEMS: NavEntry[] = [
  // Operations Domain
  { id: "overview", label: "Command Overview", domain: "operations", icon: LayoutDashboard },
  { id: "devices", label: "Enrolled Devices", domain: "operations", icon: Server },
  { id: "device-360-system", label: "Device 360 System", domain: "operations", icon: Cpu },
  { id: "task-queue-and-vision", label: "Task Queue & Vision", domain: "operations", icon: ListChecks, badge: "12 active", badgeColor: "primary" },
  { id: "live-desktop-studio", label: "Live Desktop Studio", domain: "operations", icon: MonitorPlay },
  { id: "interactive-terminal", label: "Interactive Terminal", domain: "operations", icon: Terminal },
  { id: "autonomous-workflows", label: "Autonomous Workflows", domain: "operations", icon: Workflow },
  { id: "fleet-operations", label: "Fleet Operations", domain: "operations", icon: Zap },
  { id: "ai-api-and-agents", label: "AI API & Agents", domain: "operations", icon: Bot },

  // Governance Domain
  { id: "human-approvals", label: "Human Approvals", domain: "governance", icon: ShieldCheck, badge: "3 urgent", badgeColor: "warning" },
  { id: "security-policies", label: "Security Policies", domain: "governance", icon: Lock },
  { id: "audit-trail", label: "Audit Trail", domain: "governance", icon: ScrollText },
  { id: "mcp-and-oauth", label: "MCP & OAuth", domain: "governance", icon: Network },
  { id: "diagnostics-and-logs", label: "Diagnostics & Logs", domain: "governance", icon: Activity },
];

export const SidebarNav: React.FC = () => {
  const currentView = useDashboardStore((s) => s.currentView);
  const setCurrentView = useDashboardStore((s) => s.setCurrentView);
  const approvals = useDashboardStore((s) => s.approvals);

  const pendingApprovalsCount = approvals.filter((a) => a.status === "pending").length;

  const operationsItems = NAV_ITEMS.filter((item) => item.domain === "operations");
  const governanceItems = NAV_ITEMS.filter((item) => item.domain === "governance");

  return (
    <JXBox
      surface="subtle"
      border
      className="w-72 h-screen flex-shrink-0 flex flex-col justify-between bg-slate-950/80 border-r border-slate-800/80 select-none"
    >
      {/* Brand Header */}
      <JXBox padding="md" className="border-b border-slate-800/60">
        <JXStack direction="row" spacing="sm" className="items-center justify-between">
          <JXStack direction="row" spacing="sm" className="items-center min-w-0">
            <JXBox surface="elevated" radius="md" padding="sm" className="bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Shield className="w-5 h-5 text-indigo-400" />
            </JXBox>
            <JXStack direction="col" spacing="xs" className="min-w-0">
              <span className="font-semibold text-sm tracking-tight text-slate-100 truncate">
                AI Bridge
              </span>
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 truncate">
                Control Plane
              </span>
            </JXStack>
          </JXStack>

          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/60 font-semibold">
            v2.1.0
          </span>
        </JXStack>
      </JXBox>

      {/* Scrollable Navigation List */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Operations Section */}
        <div>
          <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
            Operations Domain
          </div>
          <JXStack direction="col" spacing="xs">
            {operationsItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;

              return (
                <JXButton
                  key={item.id}
                  variant={isActive ? "contained" : "text"}
                  color={isActive ? "primary" : "neutral"}
                  size="sm"
                  fullWidth
                  onClick={() => setCurrentView(item.id)}
                  className={`justify-between text-left font-medium transition-all ${
                    isActive
                      ? "bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-500/20"
                      : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                  }`}
                  startIcon={<Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400"}`} />}
                >
                  <span className="flex-1 text-xs truncate ml-1">{item.label}</span>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        isActive
                          ? "bg-indigo-700/80 text-white"
                          : "bg-slate-800 text-slate-300 border border-slate-700/50"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </JXButton>
              );
            })}
          </JXStack>
        </div>

        {/* Governance Section */}
        <div>
          <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
            Governance Domain
          </div>
          <JXStack direction="col" spacing="xs">
            {governanceItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              const isApprovals = item.id === "human-approvals";
              const dynamicBadge = isApprovals
                ? pendingApprovalsCount > 0
                  ? `${pendingApprovalsCount} urgent`
                  : undefined
                : item.badge;

              return (
                <JXButton
                  key={item.id}
                  variant={isActive ? "contained" : "text"}
                  color={isActive ? "primary" : "neutral"}
                  size="sm"
                  fullWidth
                  onClick={() => setCurrentView(item.id)}
                  className={`justify-between text-left font-medium transition-all ${
                    isActive
                      ? "bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-500/20"
                      : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                  }`}
                  startIcon={<Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400"}`} />}
                >
                  <span className="flex-1 text-xs truncate ml-1">{item.label}</span>
                  {dynamicBadge && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        isApprovals
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          : isActive
                          ? "bg-indigo-700/80 text-white"
                          : "bg-slate-800 text-slate-300 border border-slate-700/50"
                      }`}
                    >
                      {dynamicBadge}
                    </span>
                  )}
                </JXButton>
              );
            })}
          </JXStack>
        </div>
      </div>

      {/* Footer: mTLS Zero-Trust Indicator */}
      <JXBox padding="sm" className="border-t border-slate-800/60 bg-slate-950/60">
        <JXStack direction="row" spacing="sm" className="items-center justify-between px-2 py-1">
          <JXStack direction="row" spacing="xs" className="items-center">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[11px] font-mono text-slate-300 font-medium">
              mTLS v1.3 Zero-Trust
            </span>
          </JXStack>

          <JXBadge color="success" statusText="Active" />
        </JXStack>
      </JXBox>
    </JXBox>
  );
};

