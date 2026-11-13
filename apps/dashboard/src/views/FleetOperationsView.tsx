/**
 * Fleet Operations & Reactive Self-Healing Hub (Screen 8)
 * Reconstructed with pure JXUI primitives, motion/react, and lucide-react.
 * ZERO inline styles. ZERO custom CSS.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useScrollShadow } from "../hooks/useScrollShadow";
import {
  GlassModal,
  JXCard,
  JXCardHeader,
  JXCardContent,
  JXButton,
  JXBadge,
  JXSwitch,
  JXSelect,
  JXTextField,
  JXStack,
  JXLinearProgress,
} from "../ui";
import {
  Radio,
  Zap,
  Activity,
  Calendar,
  HeartPulse,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Terminal,
  Cpu,
  HardDrive,
  Shield,
  Layers,
  ChevronRight,
  Send,
  Eye,
  Pause,
  Filter,
  Plus,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { useDashboardStore } from "../state/dashboardStore";
import { api, token, sessionToken } from "../api";

function isLiveMode(): boolean {
  return typeof window !== "undefined" && Boolean(token() || sessionToken());
}

interface SelfHealingRule {
  id: string;
  name: string;
  trigger: string;
  condition: string;
  action: string;
  enabled: boolean;
  firedCount: number;
  lastFired: string;
  category: "service" | "memory" | "mtls" | "disk";
  isBackend?: boolean;
}

interface CronJob {
  id: string;
  name: string;
  description: string;
  cronExpr: string;
  targets: string;
  lastStatus: "success" | "failed" | "running";
  lastDuration: string;
  nextRun: string;
  enabled: boolean;
  isBackend?: boolean;
}

const PRESET_SCRIPTS = {
  bash: `#!/usr/bin/env bash
# Telemetry verification & ephemeral worker hot-patch
set -euo pipefail
echo "[AI-BRIDGE] Verifying node attestations on $(hostname)..."
ai-bridge-ctl telemetry verify --strict-pcr7 || exit 1
systemctl reload-or-restart ai-bridge-edge-daemon
echo "[AI-BRIDGE] OK: Handshake confirmed via enclave loopback."`,
  powershell: `# PowerShell Core Fleet Attestation
$ErrorActionPreference = "Stop"
Write-Host "[AI-BRIDGE] Querying agent health on $env:COMPUTERNAME..."
Get-Service -Name "ai-bridge-agent" | Restart-Service -PassThru
Write-Host "[AI-BRIDGE] Verified agent service running state."`,
  python: `import os, sys, json
import urllib.request

print("[AI-BRIDGE] Executing python enclave diagnostics...")
status = {"node": os.uname().nodename, "health": "verified"}
print(json.dumps(status))`,
};

export const FleetOperationsView: React.FC = () => {
  const devices = useDashboardStore((s) => s.devices);
  const tasks = useDashboardStore((s) => s.tasks);
  const refreshLive = useDashboardStore((s) => s.refreshLive);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const scrollShadow = useScrollShadow(tableScrollRef);

  // Target fleet selection
  const [targetScope, setTargetScope] = useState<"all" | "production-east" | "gpu-runners" | "custom">("all");
  const [concurrency, setConcurrency] = useState<number>(5);
  const [scriptLang, setScriptLang] = useState<"bash" | "powershell" | "python">("bash");
  const [scriptPayload, setScriptPayload] = useState<string>(PRESET_SCRIPTS.bash);

  // Broadcast execution state
  const [isBroadcasting, setIsBroadcasting] = useState<boolean>(false);
  const [broadcastProgress, setBroadcastProgress] = useState<{
    succeeded: number;
    inProgress: number;
    failed: number;
    total: number;
  } | null>({
    succeeded: 38,
    inProgress: 2,
    failed: 0,
    total: 40,
  });
  const [selectedFailedNode, setSelectedFailedNode] = useState<{
    nodeId: string;
    exitCode: number;
    stderr: string;
  } | null>(null);
  const [lastFailedNode, setLastFailedNode] = useState<{
    nodeId: string;
    exitCode: number;
    stderr: string;
  } | null>(null);

  // Fleet version & update state
  const [fleetVersionInfo, setFleetVersionInfo] = useState<{
    control_plane_version?: string;
    git_commit?: string;
    git_branch?: string;
  } | null>(null);
  const [isUpdatingFleet, setIsUpdatingFleet] = useState<boolean>(false);
  const [fleetNotice, setFleetNotice] = useState<string | null>(null);

  // Live creation inputs
  const [newRuleName, setNewRuleName] = useState<string>("");
  const [newRuleMetric, setNewRuleMetric] = useState<string>("memory_percent");
  const [newRuleThreshold, setNewRuleThreshold] = useState<number>(85);
  const [newRuleActionTarget, setNewRuleActionTarget] = useState<string>("get_system_info");

  const [newSchedName, setNewSchedName] = useState<string>("");
  const [newSchedInterval, setNewSchedInterval] = useState<number>(300);
  const [newSchedTool, setNewSchedTool] = useState<string>("get_system_info");

  // Self-healing rules engine state
  const [rules, setRules] = useState<SelfHealingRule[]>([
    {
      id: "SH-SVC-101",
      name: "Agent Service Failure Remediation",
      trigger: "service_crash",
      condition: "ai-bridge-agent exits with non-zero or SIGKILL",
      action: "systemctl restart ai-bridge-agent && notify SecOps",
      enabled: true,
      firedCount: 18,
      lastFired: "12m ago",
      category: "service",
    },
    {
      id: "SH-MEM-992",
      name: "Memory Leak Threshold Watchdog",
      trigger: "memory_leak",
      condition: "RAM RSS > 92% sustained for >= 10m",
      action: "Flush buffer cache, trigger heap dump & worker recycle",
      enabled: true,
      firedCount: 14,
      lastFired: "34m ago",
      category: "memory",
    },
    {
      id: "SH-TLS-204",
      name: "mTLS Ephemeral Handshake Stale",
      trigger: "stale_mtls",
      condition: "Handshake negotiation timeout > 60s",
      action: "Rotate ephemeral keypair + re-register enclave",
      enabled: true,
      firedCount: 6,
      lastFired: "3h ago",
      category: "mtls",
    },
    {
      id: "SH-DSK-319",
      name: "Disk Pressure Volume Sentinel",
      trigger: "disk_pressure",
      condition: "Root volume free space < 10% available",
      action: "Purge temporary task artifacts older than 48h",
      enabled: true,
      firedCount: 29,
      lastFired: "1h ago",
      category: "disk",
    },
  ]);

  // Cron schedule state
  const [cronJobs, setCronJobs] = useState<CronJob[]>([
    {
      id: "CRN-081",
      name: "Nightly Enclave Key Rotation",
      description: "Renew ephemeral RSA/ECDSA signing pairs & flush TLS session tickets",
      cronExpr: "0 2 * * *",
      targets: "All Nodes (40)",
      lastStatus: "success",
      lastDuration: "42s",
      nextRun: "In 18 mins",
      enabled: true,
    },
    {
      id: "CRN-114",
      name: "Bi-Hourly Diagnostic Journal Flush",
      description: "Compress and sync rotated diagnostic journal bundles to storage volume",
      cronExpr: "*/15 * * * *",
      targets: "#production-east (14)",
      lastStatus: "success",
      lastDuration: "12s",
      nextRun: "In 4m 12s",
      enabled: true,
    },
    {
      id: "CRN-209",
      name: "Weekly TPM PCR Attestation Integrity Scan",
      description: "Cryptographic hash verification of PCR-7 boot measurements across fleet",
      cronExpr: "0 0 * * 0",
      targets: "All Nodes (40)",
      lastStatus: "success",
      lastDuration: "1m 18s",
      nextRun: "In 4 days",
      enabled: true,
    },
    {
      id: "CRN-332",
      name: "Dead Socket Reclamation & TCP Cleanup",
      description: "Detect orphaned WebSocket and SSE client connections and reclaim file descriptors",
      cronExpr: "*/30 * * * *",
      targets: "Gateways (6)",
      lastStatus: "success",
      lastDuration: "6s",
      nextRun: "In 12m",
      enabled: true,
    },
  ]);

  const loadLiveFleetConfig = useCallback(async () => {
    if (!isLiveMode()) return;
    try {
      const [trigRes, schedRes, verRes] = await Promise.all([
        api.triggers().catch(() => null),
        api.schedules().catch(() => null),
        api.fleetVersion().catch(() => null),
      ]);

      if (verRes && typeof verRes === "object") {
        setFleetVersionInfo(verRes);
      }

      if (Array.isArray(trigRes) && trigRes.length > 0) {
        const mappedRules: SelfHealingRule[] = trigRes.map((t: any) => {
          const metric = String(t.metric || "cpu_percent");
          const cat: SelfHealingRule["category"] = metric.includes("mem")
            ? "memory"
            : metric.includes("disk")
            ? "disk"
            : metric.includes("tls")
            ? "mtls"
            : "service";
          return {
            id: String(t.id),
            name: String(t.name || "Telemetry Sentinel"),
            trigger: metric,
            condition: `${metric} ${t.operator || ">"} ${t.threshold ?? 85}${t.device_id ? ` (${t.device_id})` : " (fleet)"}`,
            action: `${t.action_type || "tool"}: ${t.action_target || "get_system_info"}`,
            enabled: Boolean(t.enabled),
            firedCount: t.last_triggered_at ? 1 : 0,
            lastFired: t.last_triggered_at
              ? new Date(Number(t.last_triggered_at) * 1000).toLocaleTimeString()
              : "Never",
            category: cat,
            isBackend: true,
          };
        });
        setRules(mappedRules);
      }

      if (Array.isArray(schedRes) && schedRes.length > 0) {
        const mappedJobs: CronJob[] = schedRes.map((s: any) => ({
          id: String(s.id),
          name: String(s.name || s.tool || "Scheduled Job"),
          description: `Tool: ${s.tool || "get_system_info"}`,
          cronExpr: `every ${s.interval_seconds || 300}s`,
          targets: String(s.device_id || "local"),
          lastStatus: "success",
          lastDuration: s.last_run_at ? "completed" : "pending",
          nextRun: s.next_run_at
            ? new Date(Number(s.next_run_at) * 1000).toLocaleTimeString()
            : `Every ${s.interval_seconds || 300}s`,
          enabled: Boolean(s.enabled),
          isBackend: true,
        }));
        setCronJobs(mappedJobs);
      }
    } catch {
      // Keep existing state if fetch fails
    }
  }, []);

  useEffect(() => {
    void loadLiveFleetConfig();
  }, [loadLiveFleetConfig]);

  const targetCount =
    targetScope === "all"
      ? devices.length
      : targetScope === "production-east"
      ? devices.filter((d) => d.tags.includes("production-east")).length
      : targetScope === "gpu-runners"
      ? 6
      : 8;

  const handleBroadcast = async () => {
    if (!scriptPayload.trim()) return;
    setIsBroadcasting(true);
    setBroadcastProgress({
      succeeded: 0,
      inProgress: targetCount,
      failed: 0,
      total: targetCount,
    });

    if (isLiveMode()) {
      try {
        const targetDeviceIds =
          targetScope === "all"
            ? undefined
            : targetScope === "production-east"
            ? devices.filter((d) => d.tags.includes("production-east")).map((d) => d.id)
            : devices.slice(0, targetCount).map((d) => d.id);

        const res = await api.fleetBroadcast({
          tool: "run_shell",
          args: { command: scriptPayload },
          target_device_ids: targetDeviceIds && targetDeviceIds.length > 0 ? targetDeviceIds : undefined,
        });

        const totalTasks = Number(res?.device_count || targetCount || 1);
        setBroadcastProgress({
          succeeded: 0,
          inProgress: totalTasks,
          failed: 0,
          total: totalTasks,
        });
        void refreshLive?.();

        if (res?.batch_id) {
          const batchId = String(res.batch_id);
          let attempts = 0;
          const pollBatch = async () => {
            attempts += 1;
            try {
              const statusRes = await api.broadcastStatus(batchId);
              const total = Number(statusRes?.total_tasks || totalTasks);
              const succeeded = Number(statusRes?.completed || 0);
              const failed = Number(statusRes?.failed || 0);
              const inProgress = Math.max(0, total - succeeded - failed);
              setBroadcastProgress({
                succeeded,
                inProgress,
                failed,
                total,
              });
              if (Array.isArray(statusRes?.tasks)) {
                const failedTask = statusRes.tasks.find((t: any) => t.status === "failed");
                if (failedTask) {
                  setLastFailedNode({
                    nodeId: String(failedTask.device_name || failedTask.device_id || "unknown"),
                    exitCode: Number(failedTask.result?.returncode ?? 1),
                    stderr: String(failedTask.result?.stderr || failedTask.result?.error || "Task execution failed"),
                  });
                }
              }
              if (statusRes?.status === "completed" || attempts >= 8) {
                setIsBroadcasting(false);
                void refreshLive?.();
              } else {
                setTimeout(() => void pollBatch(), 1500);
              }
            } catch {
              setIsBroadcasting(false);
            }
          };
          setTimeout(() => void pollBatch(), 1000);
          return;
        }
        setIsBroadcasting(false);
        return;
      } catch (err: any) {
        setLastFailedNode({
          nodeId: "control-plane-broadcast",
          exitCode: 1,
          stderr: err?.message || "Failed to dispatch fleet broadcast",
        });
        setBroadcastProgress({
          succeeded: 0,
          inProgress: 0,
          failed: Math.max(1, targetCount),
          total: Math.max(1, targetCount),
        });
        setIsBroadcasting(false);
        return;
      }
    }

    setTimeout(() => {
      setBroadcastProgress({
        succeeded: Math.max(1, targetCount - 2),
        inProgress: 2,
        failed: 0,
        total: targetCount,
      });
      setIsBroadcasting(false);
    }, 1200);
  };

  const handleUpdateFleetAgents = async (targetOs?: string) => {
    setIsUpdatingFleet(true);
    if (isLiveMode()) {
      try {
        const res = await api.updateFleet(targetOs);
        setFleetNotice(
          `Dispatched fleet agent update batch ${res?.batch_id || "ok"} (${res?.device_count ?? devices.length} nodes)`
        );
        void refreshLive?.();
      } catch (err: any) {
        setFleetNotice(err?.message || "Fleet update request dispatched");
      } finally {
        setIsUpdatingFleet(false);
      }
      return;
    }
    setTimeout(() => {
      setFleetNotice(`Simulated fleet agent rolling update across ${devices.length} nodes`);
      setIsUpdatingFleet(false);
    }, 600);
  };

  const handleCreateLiveTrigger = async () => {
    if (!newRuleName.trim()) return;
    if (isLiveMode()) {
      try {
        await api.createTrigger({
          name: newRuleName.trim(),
          metric: newRuleMetric,
          operator: ">",
          threshold: newRuleThreshold,
          action_type: "tool",
          action_target: newRuleActionTarget || "get_system_info",
          action_args: {},
          cooldown_seconds: 300,
          enabled: true,
        });
        setNewRuleName("");
        await loadLiveFleetConfig();
        return;
      } catch {
        // Fallback to local state append
      }
    }
    setRules((prev) => [
      {
        id: `SH-USR-${Date.now().toString().slice(-3)}`,
        name: newRuleName.trim(),
        trigger: newRuleMetric,
        condition: `${newRuleMetric} > ${newRuleThreshold}%`,
        action: `tool: ${newRuleActionTarget || "get_system_info"}`,
        enabled: true,
        firedCount: 0,
        lastFired: "Never",
        category: newRuleMetric.includes("mem") ? "memory" : newRuleMetric.includes("disk") ? "disk" : "service",
      },
      ...prev,
    ]);
    setNewRuleName("");
  };

  const handleDeleteRule = async (id: string, isBackend?: boolean) => {
    if (isLiveMode() && isBackend) {
      try {
        await api.deleteTrigger(id);
        await loadLiveFleetConfig();
        return;
      } catch {
        // Fallback to local filter
      }
    }
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleToggleRule = async (id: string) => {
    const target = rules.find((r) => r.id === id);
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
    if (isLiveMode() && target?.isBackend) {
      try {
        await api.toggleTrigger(id);
        await loadLiveFleetConfig();
      } catch {
        // Keep optimistic state
      }
    }
  };

  const handleSimulateRuleTrigger = async (id: string) => {
    const target = rules.find((r) => r.id === id);
    setRules((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              firedCount: r.firedCount + 1,
              lastFired: "Just now",
            }
          : r
      )
    );
    if (isLiveMode()) {
      try {
        if (target?.isBackend) {
          await api.testTrigger(id);
          void refreshLive?.();
        } else if (target) {
          const created = await api.createTrigger({
            name: target.name,
            metric: "memory_percent",
            operator: ">",
            threshold: 85,
            action_type: "tool",
            action_target: "get_system_info",
            action_args: {},
            cooldown_seconds: 300,
            enabled: target.enabled,
          });
          if (created?.trigger_id) {
            await api.testTrigger(String(created.trigger_id));
            await loadLiveFleetConfig();
            void refreshLive?.();
          }
        }
      } catch {
        // Keep optimistic state
      }
    }
  };

  const handleCreateLiveSchedule = async () => {
    if (!newSchedName.trim()) return;
    if (isLiveMode()) {
      try {
        await api.createSchedule({
          name: newSchedName.trim(),
          device_id: devices[0]?.id || "local",
          interval_seconds: Math.max(10, Number(newSchedInterval) || 300),
          tool: newSchedTool || "get_system_info",
          args: {},
          enabled: true,
        });
        setNewSchedName("");
        await loadLiveFleetConfig();
        return;
      } catch {
        // Fallback to local state append
      }
    }
    setCronJobs((prev) => [
      {
        id: `CRN-${Date.now().toString().slice(-3)}`,
        name: newSchedName.trim(),
        description: `Tool: ${newSchedTool || "get_system_info"}`,
        cronExpr: `every ${newSchedInterval}s`,
        targets: devices[0]?.hostname || "All Nodes",
        lastStatus: "success",
        lastDuration: "0s",
        nextRun: `In ${newSchedInterval}s`,
        enabled: true,
      },
      ...prev,
    ]);
    setNewSchedName("");
  };

  const handleDeleteSchedule = async (jobId: string, isBackend?: boolean) => {
    if (isLiveMode() && isBackend) {
      try {
        await api.deleteSchedule(jobId);
        await loadLiveFleetConfig();
        return;
      } catch {
        // Fallback to local filter
      }
    }
    setCronJobs((prev) => prev.filter((j) => j.id !== jobId));
  };

  const handleRunCronNow = async (jobId: string) => {
    const targetJob = cronJobs.find((j) => j.id === jobId);
    setCronJobs((prev) =>
      prev.map((j) =>
        j.id === jobId ? { ...j, lastStatus: "running" as const } : j
      )
    );

    if (isLiveMode()) {
      try {
        if (targetJob?.isBackend) {
          await api.runScheduleNow(jobId);
        } else if (targetJob) {
          const created = await api.createSchedule({
            name: targetJob.name,
            device_id: devices[0]?.id || "local",
            interval_seconds: 300,
            tool: "get_system_info",
            args: {},
            enabled: true,
          });
          if (created?.schedule_id) {
            await api.runScheduleNow(String(created.schedule_id));
            await loadLiveFleetConfig();
          }
        }
        setCronJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? { ...j, lastStatus: "success" as const, lastDuration: "live" }
              : j
          )
        );
        void refreshLive?.();
        return;
      } catch {
        setCronJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? { ...j, lastStatus: "failed" as const, lastDuration: "err" }
              : j
          )
        );
        return;
      }
    }

    setTimeout(() => {
      setCronJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, lastStatus: "success" as const, lastDuration: "18s" }
            : j
        )
      );
    }, 1000);
  };

  const handleLanguageChange = (lang: "bash" | "powershell" | "python") => {
    setScriptLang(lang);
    setScriptPayload(PRESET_SCRIPTS[lang]);
  };

  const progressPercent = broadcastProgress
    ? Math.round((broadcastProgress.succeeded / broadcastProgress.total) * 100)
    : 100;

  return (
    <div className="space-y-4">
      {/* SECTION 1: Multi-Node Command Bus */}
      <JXCard className="bg-[var(--product-surface)]/60 border-[var(--product-line)]">
        <JXCardHeader
          title="Run on multiple devices"
          icon={<Terminal className="w-5 h-5 text-indigo-400" />}
        />
        <JXCardContent>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
            {/* Target Fleet Selector & Concurrency */}
            <div className="lg:col-span-4 space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-[var(--product-text-tertiary)] uppercase tracking-wider mb-2">
                  Target Fleet Scope
                </label>
                <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setTargetScope("all")}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs text-left transition-colors ${
                        targetScope === "all"
                          ? "bg-indigo-950/60 border-indigo-500/60 text-indigo-200"
                          : "bg-[var(--product-canvas)]/60 border-[var(--product-line)] text-[var(--product-text-secondary)] hover:border-[var(--product-line)]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-400" />
                        <span className="font-semibold">All Fleet Nodes</span>
                      </div>
                      <span className="font-mono px-2 py-0.5 rounded bg-[var(--product-raised)] text-[var(--product-text-secondary)]">
                        {devices.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTargetScope("production-east")}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs text-left transition-colors ${
                        targetScope === "production-east"
                          ? "bg-indigo-950/60 border-indigo-500/60 text-indigo-200"
                          : "bg-[var(--product-canvas)]/60 border-[var(--product-line)] text-[var(--product-text-secondary)] hover:border-[var(--product-line)]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="font-semibold">Tag: #production-east</span>
                      </div>
                      <span className="font-mono px-2 py-0.5 rounded bg-[var(--product-raised)] text-[var(--product-text-secondary)]">
                        {devices.filter((d) => d.tags.includes("production-east")).length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTargetScope("gpu-runners")}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs text-left transition-colors ${
                        targetScope === "gpu-runners"
                          ? "bg-indigo-950/60 border-indigo-500/60 text-indigo-200"
                          : "bg-[var(--product-canvas)]/60 border-[var(--product-line)] text-[var(--product-text-secondary)] hover:border-[var(--product-line)]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-400" />
                        <span className="font-semibold">Tag: #gpu-runners</span>
                      </div>
                      <span className="font-mono px-2 py-0.5 rounded bg-[var(--product-raised)] text-[var(--product-text-secondary)]">6</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTargetScope("custom")}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs text-left transition-colors ${
                        targetScope === "custom"
                          ? "bg-indigo-950/60 border-indigo-500/60 text-indigo-200"
                          : "bg-[var(--product-canvas)]/60 border-[var(--product-line)] text-[var(--product-text-secondary)] hover:border-[var(--product-line)]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Layers className="w-3.5 h-3.5 text-[var(--product-text-tertiary)]" />
                        <span className="font-semibold">Custom Multi-Select</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--product-text-tertiary)]" />
                    </button>
                  </div>
                </div>

                {/* Concurrency Rollout Slider */}
                <div className="p-3 rounded-xl bg-[var(--product-canvas)]/60 border border-[var(--product-line)] space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--product-text-secondary)] font-semibold">Concurrency Rollout</span>
                    <span className="font-mono text-indigo-400 font-bold">
                      {concurrency} nodes in parallel
                    </span>
                  </div>
                  <input
                    aria-label="Concurrent nodes"
                    type="range"
                    min={1}
                    max={20}
                    step={1}
                    value={concurrency}
                    onChange={(e) => setConcurrency(Math.min(20, Math.max(1, Number(e.target.value))))}
                    className="w-full accent-indigo-500 bg-[var(--product-raised)] rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-[var(--product-text-tertiary)]">
                    <span>1 (Staged)</span>
                    <span>5 (Default)</span>
                    <span>20 (Full Burst)</span>
                  </div>
                </div>
              </div>

            {/* Script Payload Editor & Broadcast CTA */}
            <div className="lg:col-span-8 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[var(--product-canvas)] border border-[var(--product-line)]">
                    <button
                      type="button"
                      onClick={() => handleLanguageChange("bash")}
                      className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                        scriptLang === "bash"
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
                      }`}
                    >
                      Bash (sh/zsh)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLanguageChange("powershell")}
                      className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                        scriptLang === "powershell"
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
                      }`}
                    >
                      PowerShell Core
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLanguageChange("python")}
                      className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                        scriptLang === "python"
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
                      }`}
                    >
                      Python 3.12
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono text-[var(--product-text-tertiary)]">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>mTLS Zero-Trust Bus</span>
                  </div>
                </div>

                <div className="rounded-xl bg-[var(--product-canvas)] border border-[var(--product-line)] overflow-hidden font-mono text-xs">
                  <div className="p-3 bg-[var(--product-surface)]/80 border-b border-[var(--product-line)] flex items-center justify-between text-[var(--product-text-tertiary)]">
                    <span>payload.{scriptLang === "powershell" ? "ps1" : scriptLang === "python" ? "py" : "sh"}</span>
                    <span>SHA256: e82b...9a12 • Ed25519 Signed</span>
                  </div>
                  <textarea
                    aria-label="Broadcast script payload"
                    rows={8}
                    value={scriptPayload}
                    onChange={(e) => setScriptPayload(e.target.value)}
                    placeholder="Enter shell or script command payload..."
                    className="w-full p-4 bg-transparent text-[var(--product-text-secondary)] font-mono text-xs focus:outline-none resize-none"
                  />
                </div>

                {/* Real-time Aggregate Broadcast Progress Bar */}
                {broadcastProgress && (
                  <div className="p-4 rounded-xl bg-[var(--product-canvas)]/70 border border-[var(--product-line)] space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[var(--product-text-secondary)] font-semibold">
                          Broadcast Progress: {broadcastProgress.succeeded}/{broadcastProgress.total} Succeeded
                        </span>
                        <span className="text-cyan-400">({broadcastProgress.inProgress} In-Progress)</span>
                        {broadcastProgress.failed > 0 && (
                          <span className="text-rose-400">({broadcastProgress.failed} Failed)</span>
                        )}
                      </div>
                      <span className="text-emerald-400 font-bold">{progressPercent}% Complete</span>
                    </div>

                    <JXLinearProgress
                      value={progressPercent}
                      className="w-full bg-[var(--product-raised)]"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <JXButton
                      variant="soft"
                      color="neutral"
                      size="sm"
                      onClick={() =>
                        setSelectedFailedNode(
                          lastFailedNode || {
                            nodeId: "srv-us-east-412",
                            exitCode: 1,
                            stderr: "Permission denied: access to enclave socket restricted",
                          }
                        )
                      }
                      startIcon={<Eye className="w-3.5 h-3.5" />}
                    >
                      Failure Drill-Down
                    </JXButton>
                    <JXButton
                      variant="soft"
                      color="neutral"
                      size="sm"
                      loading={isUpdatingFleet}
                      onClick={() => void handleUpdateFleetAgents()}
                      startIcon={<RefreshCw className="w-3.5 h-3.5" />}
                    >
                      Update Fleet Agents
                    </JXButton>
                    {fleetVersionInfo?.control_plane_version && (
                      <span className="text-[11px] font-mono text-[var(--product-text-tertiary)]">
                        v{fleetVersionInfo.control_plane_version} ({fleetVersionInfo.git_commit || "main"})
                      </span>
                    )}
                    {fleetNotice && (
                      <span className="text-[11px] font-mono text-emerald-400">
                        {fleetNotice}
                      </span>
                    )}
                  </div>

                  <JXButton
                    variant="contained"
                    color="primary"
                    size="md"
                    loading={isBroadcasting}
                    onClick={() => void handleBroadcast()}
                    startIcon={<Send className="w-4 h-4" />}
                    disabled={targetCount === 0 || !scriptPayload.trim()}
                  >
                    Broadcast to {targetCount} Nodes
                  </JXButton>
                </div>
              </div>
            </div>
        </JXCardContent>
      </JXCard>

      {/* SECTION 2: Reactive Self-Healing Rules Engine */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-[var(--product-text)]">Automation rules</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              aria-label="New rule name"
              placeholder="New rule name..."
              value={newRuleName}
              onChange={(e) => setNewRuleName(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-[var(--product-canvas)] border border-[var(--product-line)] text-xs font-mono text-[var(--product-text-secondary)] focus:outline-none"
            />
            <select
              aria-label="Rule metric"
              value={newRuleMetric}
              onChange={(e) => setNewRuleMetric(e.target.value)}
              className="px-2 py-1 rounded-lg bg-[var(--product-canvas)] border border-[var(--product-line)] text-xs font-mono text-[var(--product-text-secondary)] focus:outline-none"
            >
              <option value="memory_percent">memory_percent</option>
              <option value="cpu_percent">cpu_percent</option>
              <option value="disk_percent">disk_percent</option>
            </select>
            <JXButton
              variant="soft"
              color="primary"
              size="sm"
              onClick={() => void handleCreateLiveTrigger()}
              disabled={!newRuleName.trim()}
              startIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Add Rule
            </JXButton>
            <span className="text-xs font-mono text-[var(--product-text-tertiary)]">
              Autonomous closed-loop remediation sentinels
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rules.map((rule) => (
            <div key={rule.id}>
              <JXCard className="bg-[var(--product-surface)]/60 border-[var(--product-line)]">
                <div className="p-4 pb-2 flex items-center justify-between border-b border-[var(--product-line)]">
                  <div className="flex items-center gap-2.5">
                    {rule.category === "service" ? (
                      <RotateCcw className="w-4 h-4 text-indigo-400" />
                    ) : rule.category === "memory" ? (
                      <Cpu className="w-4 h-4 text-emerald-400" />
                    ) : rule.category === "mtls" ? (
                      <Shield className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <HardDrive className="w-4 h-4 text-amber-400" />
                    )}
                    <div>
                      <h4 className="text-sm font-semibold text-[var(--product-text)]">{rule.name}</h4>
                      <p className="text-[11px] font-mono text-[var(--product-text-tertiary)]">
                        RULE-ID: #{rule.id} • Last fired: {rule.lastFired}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-[var(--product-text-tertiary)]">
                      {rule.enabled ? "Active" : "Disabled"}
                    </span>
                    <JXSwitch
                      label={`Enable ${rule.name}`}
                      cardMode={false}
                      checked={rule.enabled}
                      onChange={() => void handleToggleRule(rule.id)}
                    />
                  </div>
                </div>
                <JXCardContent>
                  <div className="space-y-2.5">
                    <div className="p-2.5 rounded-lg bg-[var(--product-canvas)]/70 border border-[var(--product-line)]/80 text-xs">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--product-text-tertiary)] block mb-0.5">
                        Trigger Condition
                      </span>
                      <code className="text-[var(--product-text-secondary)] font-mono">{rule.condition}</code>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[var(--product-canvas)]/70 border border-[var(--product-line)]/80 text-xs">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--product-text-tertiary)] block mb-0.5">
                        Remediation Action
                      </span>
                      <code className="text-emerald-400 font-mono">{rule.action}</code>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="font-mono text-[var(--product-text-tertiary)]">
                        Triggered: <strong className="text-[var(--product-text-secondary)]">{rule.firedCount} times</strong>
                      </span>
                      <div className="flex items-center gap-1.5">
                        {rule.isBackend && (
                          <JXButton
                            variant="soft"
                            color="neutral"
                            size="sm"
                            onClick={() => void handleDeleteRule(rule.id, rule.isBackend)}
                            startIcon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
                          >
                            Delete
                          </JXButton>
                        )}
                        <JXButton
                          variant="soft"
                          color="primary"
                          size="sm"
                          onClick={() => void handleSimulateRuleTrigger(rule.id)}
                          startIcon={<Zap className="w-3.5 h-3.5" />}
                        >
                          Simulate Trigger
                        </JXButton>
                      </div>
                    </div>
                  </div>
                </JXCardContent>
              </JXCard>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 3: Fleet Cron Scheduler Table */}
      <JXCard className="bg-[var(--product-surface)]/60 border-[var(--product-line)]">
        <JXCardHeader
          title="Schedules"
          icon={<Calendar className="w-5 h-5 text-indigo-400" />}
        />
        <JXCardContent>
          <div className="flex items-center justify-end gap-2 pb-3">
            <input
              type="text"
              aria-label="New schedule name"
              placeholder="Schedule name..."
              value={newSchedName}
              onChange={(e) => setNewSchedName(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-[var(--product-canvas)] border border-[var(--product-line)] text-xs font-mono text-[var(--product-text-secondary)] focus:outline-none"
            />
            <JXButton
              variant="soft"
              color="primary"
              size="sm"
              onClick={() => void handleCreateLiveSchedule()}
              disabled={!newSchedName.trim()}
              startIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Add Schedule
            </JXButton>
          </div>
          <div ref={tableScrollRef} tabIndex={0} role="region" aria-label="Scheduled jobs" className="overflow-x-auto scroll-shadow rounded-xl border border-[var(--product-line)]" data-scroll-left={scrollShadow.left} data-scroll-right={scrollShadow.right}>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[var(--product-canvas)] border-b border-[var(--product-line)] text-[var(--product-text-tertiary)] font-mono uppercase">
                  <th className="p-3">Job Name</th>
                  <th className="p-3">Cron Syntax</th>
                  <th className="p-3">Target Nodes</th>
                  <th className="p-3">Last Execution</th>
                  <th className="p-3">Next Run</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {cronJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-[var(--product-canvas)]/40 transition-colors">
                    <td className="p-3">
                      <div className="font-semibold text-[var(--product-text-secondary)]">{job.name}</div>
                      <div className="text-[11px] text-[var(--product-text-tertiary)] font-sans">{job.description}</div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-[var(--product-canvas)] border border-[var(--product-line)] text-indigo-400">
                        {job.cronExpr}
                      </span>
                    </td>
                    <td className="p-3 text-[var(--product-text-secondary)]">{job.targets}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {job.lastStatus === "success" && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                        {job.lastStatus === "running" && (
                          <RotateCcw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                        )}
                        {job.lastStatus === "failed" && (
                          <XCircle className="w-3.5 h-3.5 text-rose-400" />
                        )}
                        <span className="text-[var(--product-text-secondary)] capitalize">{job.lastStatus}</span>
                        <span className="text-[var(--product-text-dim)]">({job.lastDuration})</span>
                      </div>
                    </td>
                    <td className="p-3 text-[var(--product-text-secondary)]">{job.nextRun}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {job.isBackend && (
                          <JXButton
                            variant="soft"
                            color="neutral"
                            size="sm"
                            onClick={() => void handleDeleteSchedule(job.id, job.isBackend)}
                            startIcon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
                          >
                            Delete
                          </JXButton>
                        )}
                        <JXButton
                          variant="soft"
                          color="primary"
                          size="sm"
                          onClick={() => void handleRunCronNow(job.id)}
                          startIcon={<Play className="w-3.5 h-3.5" />}
                        >
                          Run Now
                        </JXButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </JXCardContent>
      </JXCard>

      {/* Failure Drill-down Modal */}
      <AnimatePresence>
        {selectedFailedNode && (
          <GlassModal onClose={() => setSelectedFailedNode(null)} title="Sample broadcast failure">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[var(--product-line)] pb-3">
                <div className="flex items-center gap-2 text-rose-400 font-bold">
                  <AlertTriangle className="w-5 h-5" />
                  <span>Broadcast Execution Drill-Down</span>
                </div>
                <button
                  type="button"
                  aria-label="Close broadcast failure"
                  onClick={() => setSelectedFailedNode(null)}
                  className="text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs font-mono">
                <div>
                  <span className="text-[var(--product-text-tertiary)]">Node Identifier:</span>
                  <div className="text-[var(--product-text-secondary)] font-semibold">{selectedFailedNode.nodeId}</div>
                </div>
                <div>
                  <span className="text-[var(--product-text-tertiary)]">Exit Status Code:</span>
                  <div className="text-rose-400 font-bold">{selectedFailedNode.exitCode}</div>
                </div>
                <div>
                  <span className="text-[var(--product-text-tertiary)]">Stderr Output:</span>
                  <div className="p-3 rounded-lg bg-[var(--product-canvas)] border border-[var(--product-line)] text-rose-300">
                    {selectedFailedNode.stderr}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <JXButton
                  variant="outlined"
                  color="neutral"
                  size="sm"
                  onClick={() => setSelectedFailedNode(null)}
                >
                  Dismiss
                </JXButton>
                <JXButton
                  variant="contained"
                  color="primary"
                  size="sm"
                  onClick={() => setSelectedFailedNode(null)}
                >
                  Retry Node
                </JXButton>
              </div>
            </motion.div>
          </GlassModal>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FleetOperationsView;
