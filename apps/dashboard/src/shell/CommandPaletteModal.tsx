/**
 * AI Bridge Enterprise Dashboard — Command Palette Modal (⌘K)
 * Fuzzy search across all 15 screens, 40 device nodes, and administrative actions.
 * Powered by GlassModal, JXTextField, JXStack, JXButton. ZERO inline styles.
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  GlassModal,
  JXTextField,
  JXStack,
  JXButton,
} from "@jacxishippingorg/jx-ui-react";
import {
  Search,
  Server,
  Layers,
  Zap,
  Shield,
  Activity,
  ArrowRight,
  Terminal,
  Monitor,
  Lock,
  Workflow,
  Cpu,
  Bot,
  ScrollText,
} from "lucide-react";
import { useDashboardStore } from "../state/dashboardStore";
import type { ViewId } from "../types/dashboard";

interface CommandItem {
  id: string;
  title: string;
  subtitle: string;
  category: "Screens" | "Devices" | "Actions";
  icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  badge?: string;
}

export const CommandPaletteModal: React.FC = () => {
  const isOpen = useDashboardStore((s) => s.commandPaletteOpen);
  const setOpen = useDashboardStore((s) => s.setCommandPaletteOpen);
  const setCurrentView = useDashboardStore((s) => s.setCurrentView);
  const devices = useDashboardStore((s) => s.devices);
  const setSelectedDeviceId = useDashboardStore((s) => s.setSelectedDeviceId);
  const isEmergencyStopActive = useDashboardStore((s) => s.isEmergencyStopActive);
  const triggerEmergencyStop = useDashboardStore((s) => s.triggerEmergencyStop);
  const resumeFleet = useDashboardStore((s) => s.resumeFleet);
  const autoPollEnabled = useDashboardStore((s) => s.autoPollEnabled);
  const setAutoPollEnabled = useDashboardStore((s) => s.setAutoPollEnabled);

  const [query, setQuery] = useState("");

  // Global keyboard shortcut listener for ⌘K / Ctrl+K and Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!isOpen);
      } else if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, setOpen]);

  // Reset query on open
  useEffect(() => {
    if (isOpen) setQuery("");
  }, [isOpen]);

  const allItems = useMemo<CommandItem[]>(() => {
    const screenItems: CommandItem[] = [
      {
        id: "screen-overview",
        title: "Command Overview",
        subtitle: "Fleet Bento metrics, throughput, risk-tier volume",
        category: "Screens",
        icon: Layers,
        onSelect: () => setCurrentView("overview"),
      },
      {
        id: "screen-devices",
        title: "Enrolled Devices",
        subtitle: "All 40 managed agent nodes and enrollment scripts",
        category: "Screens",
        icon: Server,
        onSelect: () => setCurrentView("devices"),
      },
      {
        id: "screen-device-360",
        title: "Device 360 System Dashboard",
        subtitle: "Hardware gauges, processes, daemons, socket inspector",
        category: "Screens",
        icon: Cpu,
        onSelect: () => setCurrentView("device-360-system"),
      },
      {
        id: "screen-task-queue",
        title: "Task Queue & Vision Inspector",
        subtitle: "Tool dispatch studio & Set-of-Marks overlay",
        category: "Screens",
        icon: Activity,
        onSelect: () => setCurrentView("task-queue-and-vision"),
      },
      {
        id: "screen-live-desktop",
        title: "Live Desktop Studio",
        subtitle: "Low-latency WebRTC streaming & dual-control takeover",
        category: "Screens",
        icon: Monitor,
        onSelect: () => setCurrentView("live-desktop-studio"),
      },
      {
        id: "screen-terminal",
        title: "Interactive Live Terminal",
        subtitle: "Monospace ANSI PTY console and administrative snippets",
        category: "Screens",
        icon: Terminal,
        onSelect: () => setCurrentView("interactive-terminal"),
      },
      {
        id: "screen-workflows",
        title: "Autonomous Workflows",
        subtitle: "Multi-turn DAG stepper with OCR checkpoints and plans",
        category: "Screens",
        icon: Workflow,
        onSelect: () => setCurrentView("autonomous-workflows"),
      },
      {
        id: "screen-fleet-ops",
        title: "Fleet Operations & Self-Healing",
        subtitle: "Multi-node broadcast bus and reactive self-healing rules",
        category: "Screens",
        icon: Zap,
        onSelect: () => setCurrentView("fleet-operations"),
      },
      {
        id: "screen-ai-api",
        title: "AI API & Custom Agents Hub",
        subtitle: "LLM providers, multi-language SDKs, tool playground",
        category: "Screens",
        icon: Bot,
        onSelect: () => setCurrentView("ai-api-and-agents"),
      },
      {
        id: "screen-approvals",
        title: "Human-in-the-Loop Approvals",
        subtitle: "Review Tier-3/4 dangerous shell commands and AST diffs",
        category: "Screens",
        icon: Shield,
        onSelect: () => setCurrentView("human-approvals"),
        badge: "3 urgent",
      },
      {
        id: "screen-policies",
        title: "Security Policies & Webhooks",
        subtitle: "Binary allowlist, restricted paths, Slack/Teams webhooks",
        category: "Screens",
        icon: Lock,
        onSelect: () => setCurrentView("security-policies"),
      },
      {
        id: "screen-audit",
        title: "Append-Only Audit Trail",
        subtitle: "Cryptographic Merkle root ledger & RFC 3161 timestamps",
        category: "Screens",
        icon: ScrollText,
        onSelect: () => setCurrentView("audit-trail"),
      },
      {
        id: "screen-mcp",
        title: "MCP & OAuth Connections",
        subtitle: "Model Context Protocol SSE streams & OAuth token vault",
        category: "Screens",
        icon: Server,
        onSelect: () => setCurrentView("mcp-and-oauth"),
      },
      {
        id: "screen-diagnostics",
        title: "Diagnostics & Live Logs",
        subtitle: "Systemd journald streaming and ring buffer inspector",
        category: "Screens",
        icon: Activity,
        onSelect: () => setCurrentView("diagnostics-and-logs"),
      },
      {
        id: "screen-login",
        title: "Zero-Trust Auth Console",
        subtitle: "Operator dual-auth and token login gateway",
        category: "Screens",
        icon: Lock,
        onSelect: () => setCurrentView("login"),
      },
    ];

    const deviceItems: CommandItem[] = devices.map((d) => ({
      id: `device-${d.id}`,
      title: d.name,
      subtitle: `${d.hostname} (${d.osRelease} • ${d.platform})`,
      category: "Devices",
      icon: Server,
      badge: d.status,
      onSelect: () => {
        setSelectedDeviceId(d.id);
        setCurrentView("device-360-system");
      },
    }));

    const actionItems: CommandItem[] = [
      {
        id: "action-emergency-stop",
        title: isEmergencyStopActive ? "Resume Fleet Operations" : "Trigger Emergency All-Stop",
        subtitle: isEmergencyStopActive
          ? "Lift emergency lockdown and restore fleet activity"
          : "Immediately halts all running tasks across fleet",
        category: "Actions",
        icon: Zap,
        onSelect: () => {
          if (isEmergencyStopActive) resumeFleet();
          else triggerEmergencyStop();
        },
      },
      {
        id: "action-toggle-poll",
        title: autoPollEnabled ? "Disable 15s Auto-Poll" : "Enable 15s Auto-Poll",
        subtitle: "Toggles background metric refresh cadence",
        category: "Actions",
        icon: Activity,
        onSelect: () => setAutoPollEnabled(!autoPollEnabled),
      },
      {
        id: "action-review-approvals",
        title: "Review Urgent Approvals",
        subtitle: "Jump directly to pending SecOps authorizations",
        category: "Actions",
        icon: Shield,
        onSelect: () => setCurrentView("human-approvals"),
      },
    ];

    return [...actionItems, ...screenItems, ...deviceItems];
  }, [
    setCurrentView,
    devices,
    setSelectedDeviceId,
    isEmergencyStopActive,
    resumeFleet,
    triggerEmergencyStop,
    autoPollEnabled,
    setAutoPollEnabled,
  ]);

  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems.slice(0, 20);
    const q = query.toLowerCase();
    return allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [allItems, query]);

  if (!isOpen) return null;

  return (
    <GlassModal
      open={isOpen}
      onClose={() => setOpen(false)}
      title="Global Command Palette"
    >
      <div className="space-y-4 max-w-xl w-full">
        {/* Search input with ⌘K badge */}
        <JXTextField
          value={query}
          onChange={(val) => setQuery(val)}
          placeholder="Search screens, nodes, or actions (e.g. srv-us-east, audit, stop)…"
          startIcon={<Search className="w-4 h-4 text-slate-400" />}
          size="md"
          clearable
        />

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs font-mono">
              No matching destinations or commands found for &quot;{query}&quot;.
            </div>
          ) : (
            filteredItems.map((item) => {
              const Icon = item.icon;
              return (
                <JXButton
                  key={item.id}
                  variant="soft"
                  color="neutral"
                  size="sm"
                  fullWidth
                  onClick={() => {
                    item.onSelect();
                    setOpen(false);
                  }}
                  className="justify-between text-left p-2.5 bg-slate-900/60 hover:bg-indigo-950/60 border border-slate-800/80 hover:border-indigo-500/40 rounded-lg group transition-all"
                  startIcon={<Icon className="w-4 h-4 text-indigo-400 flex-shrink-0" />}
                >
                  <div className="flex-1 min-w-0 ml-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-200 group-hover:text-white truncate">
                        {item.title}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                        {item.category}
                      </span>
                      {item.badge && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5 font-normal">
                      {item.subtitle}
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 flex-shrink-0 ml-2" />
                </JXButton>
              );
            })
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1 py-0.5 bg-slate-800 text-slate-300 rounded">↵</kbd> Select</span>
            <span><kbd className="px-1 py-0.5 bg-slate-800 text-slate-300 rounded">ESC</kbd> Close</span>
          </div>
          <span>{filteredItems.length} options</span>
        </div>
      </div>
    </GlassModal>
  );
};

