/**
 * AI Bridge Enterprise Dashboard — Root Application
 * Mounts AppShell with active view routing connected to dashboardStore.
 * Strict JXUI Primitives & Lucide Icons. ZERO inline styles.
 */

import React from "react";
import { BreadcrumbTrail } from "@jacxishippingorg/jx-ui-react";
import { AppShell } from "./shell/AppShell";
import { useDashboardStore } from "./state/dashboardStore";
import type { ViewId } from "./types/dashboard";

// Import all 15 operational screen views
import { LoginView } from "./views/LoginView";
import { OverviewView } from "./views/OverviewView";
import { DevicesView } from "./views/DevicesView";
import { Device360View } from "./views/Device360View";
import { TaskQueueVisionView } from "./views/TaskQueueVisionView";
import { LiveDesktopView } from "./views/LiveDesktopView";
import { TerminalView } from "./views/TerminalView";
import { WorkflowsView } from "./views/WorkflowsView";
import { FleetOperationsView } from "./views/FleetOperationsView";
import { AiApiHubView } from "./views/AiApiHubView";
import { HumanApprovalsView } from "./views/HumanApprovalsView";
import { SecurityPoliciesView } from "./views/SecurityPoliciesView";
import { AuditTrailView } from "./views/AuditTrailView";
import { ConnectionsView } from "./views/ConnectionsView";
import { DiagnosticsLogsView } from "./views/DiagnosticsLogsView";

export interface ViewMetadata {
  title: string;
  domain: string;
  breadcrumbs: string[];
}

const VIEWS_WITH_OWN_HEADER: ViewId[] = [
  "overview",
  "devices",
  "device-360-system",
  "task-queue-and-vision",
  "live-desktop-studio",
  "interactive-terminal",
  "autonomous-workflows",
];

export const App: React.FC = () => {
  const currentView = useDashboardStore((s) => s.currentView);
  const devices = useDashboardStore((s) => s.devices);
  const selectedDeviceId = useDashboardStore((s) => s.selectedDeviceId);

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId) || devices[0];
  const selectedHostname = selectedDevice?.hostname || "srv-us-east-412";

  // View titles and navigation breadcrumbs metadata for all 15 routes
  const viewMeta: Record<ViewId, ViewMetadata> = {
    overview: {
      title: "Command Overview & Bento Metrics",
      domain: "Operations Domain",
      breadcrumbs: ["AI Bridge", "Operations", "Overview"],
    },
    devices: {
      title: "Enrolled Devices & Node Inventory",
      domain: "Operations Domain",
      breadcrumbs: ["AI Bridge", "Operations", "Devices"],
    },
    "device-360-system": {
      title: "Device 360 System Dashboard & Hardware Gauges",
      domain: "Operations Domain",
      breadcrumbs: ["AI Bridge", "Operations", "Device 360", selectedHostname],
    },
    "task-queue-and-vision": {
      title: "Task Queue & Vision Inspector (SoM Overlay)",
      domain: "Operations Domain",
      breadcrumbs: ["AI Bridge", "Operations", "Task Queue & Vision"],
    },
    "live-desktop-studio": {
      title: "Live Desktop Studio & Dual-Control Takeover",
      domain: "Operations Domain",
      breadcrumbs: ["AI Bridge", "Operations", "Live Desktop"],
    },
    "interactive-terminal": {
      title: "Interactive ANSI Live Terminal Studio",
      domain: "Operations Domain",
      breadcrumbs: ["AI Bridge", "Operations", "Terminal"],
    },
    "autonomous-workflows": {
      title: "Autonomous Workflows & Multi-Turn DAG Stepper",
      domain: "Operations Domain",
      breadcrumbs: ["AI Bridge", "Operations", "Workflows"],
    },
    "fleet-operations": {
      title: "Multi-Node Broadcast & Self-Healing Hub",
      domain: "Operations Domain",
      breadcrumbs: ["AI Bridge", "Operations", "Fleet Operations"],
    },
    "ai-api-and-agents": {
      title: "AI API & Custom Agents Hub",
      domain: "Operations Domain",
      breadcrumbs: ["AI Bridge", "Operations", "AI API & Agents"],
    },
    "human-approvals": {
      title: "Human-in-the-Loop Approvals & AST Diff Inspector",
      domain: "Governance Domain",
      breadcrumbs: ["AI Bridge", "Governance", "Human Approvals"],
    },
    "security-policies": {
      title: "Security Policies, Allowlist & Webhook Manager",
      domain: "Governance Domain",
      breadcrumbs: ["AI Bridge", "Governance", "Security Policies"],
    },
    "audit-trail": {
      title: "Merkle Root Ledger & Cryptographic Verifier",
      domain: "Governance Domain",
      breadcrumbs: ["AI Bridge", "Governance", "Audit Trail"],
    },
    "mcp-and-oauth": {
      title: "MCP Protocol Gateway & OAuth Credential Vault",
      domain: "Governance Domain",
      breadcrumbs: ["AI Bridge", "Governance", "MCP & OAuth"],
    },
    "diagnostics-and-logs": {
      title: "Systemd Log Stream & Ring Buffer Inspector",
      domain: "Governance Domain",
      breadcrumbs: ["AI Bridge", "Governance", "Diagnostics & Logs"],
    },
    login: {
      title: "Zero-Trust Dual-Auth Console",
      domain: "Authentication",
      breadcrumbs: ["AI Bridge", "Authentication", "Login"],
    },
  };

  const currentMeta = viewMeta[currentView] || viewMeta.overview;

  const renderActiveView = () => {
    switch (currentView) {
      case "login":
        return <LoginView />;
      case "overview":
        return <OverviewView />;
      case "devices":
        return <DevicesView />;
      case "device-360-system":
        return <Device360View />;
      case "task-queue-and-vision":
        return <TaskQueueVisionView />;
      case "live-desktop-studio":
        return <LiveDesktopView />;
      case "interactive-terminal":
        return <TerminalView />;
      case "autonomous-workflows":
        return <WorkflowsView />;
      case "fleet-operations":
        return <FleetOperationsView />;
      case "ai-api-and-agents":
        return <AiApiHubView />;
      case "human-approvals":
        return <HumanApprovalsView />;
      case "security-policies":
        return <SecurityPoliciesView />;
      case "audit-trail":
        return <AuditTrailView />;
      case "mcp-and-oauth":
        return <ConnectionsView />;
      case "diagnostics-and-logs":
        return <DiagnosticsLogsView />;
      default:
        return <OverviewView />;
    }
  };

  // If current view is login, render full Zero-Trust Login Console
  if (currentView === "login") {
    return <LoginView />;
  }

  return (
    <AppShell currentView={currentView} viewMeta={currentMeta}>
      <div className="w-full">
        {!VIEWS_WITH_OWN_HEADER.includes(currentView) && (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/60 mb-6">
            <div>
              <BreadcrumbTrail crumbs={currentMeta.breadcrumbs} />
              <h1 className="text-xl font-bold tracking-tight text-slate-100 mt-1">
                {currentMeta.title}
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {currentMeta.domain} • 40 Managed Nodes • mTLS v1.3 Zero-Trust Synchronized
              </p>
            </div>
          </div>
        )}
        {renderActiveView()}
      </div>
    </AppShell>
  );
};

export default App;
