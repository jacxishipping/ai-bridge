import {
  LayoutDashboard, Server, Cpu, ListChecks, MonitorPlay, Terminal, Workflow,
  Zap, Bot, ShieldCheck, Lock, ScrollText, Network, Activity,
} from "lucide-react";
import type { ViewId } from "../types/dashboard";

export const navigationItems = [
  { id: "overview", label: "Overview", group: "Workspace", icon: LayoutDashboard },
  { id: "devices", label: "Devices", group: "Workspace", icon: Server },
  { id: "device-360-system", label: "Device details", group: "Workspace", icon: Cpu },
  { id: "task-queue-and-vision", label: "Tasks", group: "Workspace", icon: ListChecks },
  { id: "live-desktop-studio", label: "Desktop", group: "Workspace", icon: MonitorPlay },
  { id: "interactive-terminal", label: "Terminal", group: "Workspace", icon: Terminal },
  { id: "autonomous-workflows", label: "Workflows", group: "Workspace", icon: Workflow },
  { id: "fleet-operations", label: "Fleet operations", group: "Workspace", icon: Zap },
  { id: "ai-api-and-agents", label: "AI providers", group: "Workspace", icon: Bot },
  { id: "human-approvals", label: "Approvals", group: "Manage", icon: ShieldCheck },
  { id: "security-policies", label: "Policies", group: "Manage", icon: Lock },
  { id: "audit-trail", label: "Audit log", group: "Manage", icon: ScrollText },
  { id: "mcp-and-oauth", label: "Connections", group: "Manage", icon: Network },
  { id: "diagnostics-and-logs", label: "Logs", group: "Manage", icon: Activity },
] satisfies { id: ViewId; label: string; group: string; icon: typeof Server }[];
