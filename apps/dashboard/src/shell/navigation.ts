import {
  LayoutDashboard, Server, Cpu, ListChecks, MonitorPlay, Terminal, Workflow,
  Zap, Bot, ShieldCheck, Lock, ScrollText, Network, Activity,
} from "lucide-react";
import type { ViewId } from "../types/dashboard";

export type NavGroup = "Overview" | "Fleet" | "Execute" | "Govern" | "Integrate";

export const navigationItems = [
  { id: "live", label: "Home", group: "Overview", icon: Server },
  { id: "overview", label: "Fleet overview", group: "Overview", icon: LayoutDashboard },
  { id: "devices", label: "Devices", group: "Fleet", icon: Server },
  { id: "device-360-system", label: "Device details", group: "Fleet", icon: Cpu, nestedUnder: "devices" },
  { id: "fleet-operations", label: "Fleet operations", group: "Fleet", icon: Zap },
  { id: "task-queue-and-vision", label: "Tasks", group: "Execute", icon: ListChecks },
  { id: "live-desktop-studio", label: "Desktop", group: "Execute", icon: MonitorPlay },
  { id: "interactive-terminal", label: "Terminal", group: "Execute", icon: Terminal },
  { id: "autonomous-workflows", label: "Workflows", group: "Execute", icon: Workflow },
  { id: "human-approvals", label: "Approvals", group: "Govern", icon: ShieldCheck },
  { id: "security-policies", label: "Policies", group: "Govern", icon: Lock },
  { id: "audit-trail", label: "Audit log", group: "Govern", icon: ScrollText },
  { id: "ai-api-and-agents", label: "AI providers", group: "Integrate", icon: Bot },
  { id: "mcp-and-oauth", label: "Connections", group: "Integrate", icon: Network },
  { id: "diagnostics-and-logs", label: "Logs", group: "Integrate", icon: Activity },
] satisfies {
  id: ViewId;
  label: string;
  group: NavGroup;
  icon: typeof Server;
  nestedUnder?: ViewId;
}[];

export const navGroupOrder: NavGroup[] = ["Overview", "Fleet", "Execute", "Govern", "Integrate"];
