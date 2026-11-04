/**
 * Fleet Operations & Reactive Self-Healing Hub (Screen 8)
 * Reconstructed with pure JXUI primitives, motion/react, and lucide-react.
 * ZERO inline styles. ZERO custom CSS.
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
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
  JXGrid,
  JXGridItem,
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
} from "lucide-react";
import { useDashboardStore } from "../state/dashboardStore";

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

  const targetCount =
    targetScope === "all"
      ? devices.length
      : targetScope === "production-east"
      ? devices.filter((d) => d.tags.includes("production-east")).length
      : targetScope === "gpu-runners"
      ? 6
      : 8;

  const handleBroadcast = () => {
    if (!scriptPayload.trim()) return;
    setIsBroadcasting(true);
    setBroadcastProgress({
      succeeded: 0,
      inProgress: targetCount,
      failed: 0,
      total: targetCount,
    });

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

  const handleToggleRule = (id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const handleSimulateRuleTrigger = (id: string) => {
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
  };

  const handleRunCronNow = (jobId: string) => {
    setCronJobs((prev) =>
      prev.map((j) =>
        j.id === jobId ? { ...j, lastStatus: "running" as const } : j
      )
    );
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
      <JXCard className="bg-slate-900/60 border-slate-800">
        <JXCardHeader
          title="Run on multiple devices"
          icon={<Terminal className="w-5 h-5 text-indigo-400" />}
        />
        <JXCardContent>
          <JXGrid columns={12} gap="lg">
            {/* Target Fleet Selector & Concurrency */}
            <JXGridItem colSpan={4}>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Target Fleet Scope
                  </label>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setTargetScope("all")}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs text-left transition-colors ${
                        targetScope === "all"
                          ? "bg-indigo-950/60 border-indigo-500/60 text-indigo-200"
                          : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-400" />
                        <span className="font-semibold">All Fleet Nodes</span>
                      </div>
                      <span className="font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {devices.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTargetScope("production-east")}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs text-left transition-colors ${
                        targetScope === "production-east"
                          ? "bg-indigo-950/60 border-indigo-500/60 text-indigo-200"
                          : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="font-semibold">Tag: #production-east</span>
                      </div>
                      <span className="font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {devices.filter((d) => d.tags.includes("production-east")).length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTargetScope("gpu-runners")}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs text-left transition-colors ${
                        targetScope === "gpu-runners"
                          ? "bg-indigo-950/60 border-indigo-500/60 text-indigo-200"
                          : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-400" />
                        <span className="font-semibold">Tag: #gpu-runners</span>
                      </div>
                      <span className="font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">6</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTargetScope("custom")}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs text-left transition-colors ${
                        targetScope === "custom"
                          ? "bg-indigo-950/60 border-indigo-500/60 text-indigo-200"
                          : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Layers className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold">Custom Multi-Select</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </div>
                </div>

                {/* Concurrency Rollout Slider */}
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-semibold">Concurrency Rollout</span>
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
                    className="w-full accent-indigo-500 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-400">
                    <span>1 (Staged)</span>
                    <span>5 (Default)</span>
                    <span>20 (Full Burst)</span>
                  </div>
                </div>
              </div>
            </JXGridItem>

            {/* Script Payload Editor & Broadcast CTA */}
            <JXGridItem colSpan={8}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-950 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleLanguageChange("bash")}
                      className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                        scriptLang === "bash"
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-slate-400 hover:text-slate-200"
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
                          : "text-slate-400 hover:text-slate-200"
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
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Python 3.12
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>mTLS Zero-Trust Bus</span>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden font-mono text-xs">
                  <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-slate-400">
                    <span>payload.{scriptLang === "powershell" ? "ps1" : scriptLang === "python" ? "py" : "sh"}</span>
                    <span>SHA256: e82b...9a12 • Ed25519 Signed</span>
                  </div>
                  <textarea
                    aria-label="Broadcast script payload"
                    rows={8}
                    value={scriptPayload}
                    onChange={(e) => setScriptPayload(e.target.value)}
                    placeholder="Enter shell or script command payload..."
                    className="w-full p-4 bg-transparent text-slate-200 font-mono text-xs focus:outline-none resize-none"
                  />
                </div>

                {/* Real-time Aggregate Broadcast Progress Bar */}
                {broadcastProgress && (
                  <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-slate-200 font-semibold">
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
                      className="w-full bg-slate-800"
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
                        setSelectedFailedNode({
                          nodeId: "srv-us-east-412",
                          exitCode: 1,
                          stderr: "Permission denied: access to enclave socket restricted",
                        })
                      }
                      startIcon={<Eye className="w-3.5 h-3.5" />}
                    >
                      Failure Drill-Down
                    </JXButton>
                  </div>

                  <JXButton
                    variant="contained"
                    color="primary"
                    size="md"
                    loading={isBroadcasting}
                    onClick={handleBroadcast}
                    startIcon={<Send className="w-4 h-4" />}
                    disabled={targetCount === 0 || !scriptPayload.trim()}
                  >
                    Broadcast to {targetCount} Nodes
                  </JXButton>
                </div>
              </div>
            </JXGridItem>
          </JXGrid>
        </JXCardContent>
      </JXCard>

      {/* SECTION 2: Reactive Self-Healing Rules Engine */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-slate-100">Automation rules</h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Autonomous closed-loop remediation sentinels
          </span>
        </div>

        <JXGrid columns={12} gap="md">
          {rules.map((rule) => (
            <JXGridItem key={rule.id} colSpan={6}>
              <JXCard className="bg-slate-900/60 border-slate-800">
                <div className="p-4 pb-2 flex items-center justify-between border-b border-slate-800/60">
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
                      <h4 className="text-sm font-semibold text-slate-100">{rule.name}</h4>
                      <p className="text-[11px] font-mono text-slate-400">
                        RULE-ID: #{rule.id} • Last fired: {rule.lastFired}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-400">
                      {rule.enabled ? "Active" : "Disabled"}
                    </span>
                    <JXSwitch
                      label={`Enable ${rule.name}`}
                      cardMode={false}
                      checked={rule.enabled}
                      onChange={() => handleToggleRule(rule.id)}
                    />
                  </div>
                </div>
                <JXCardContent>
                  <div className="space-y-2.5">
                    <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 text-xs">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-0.5">
                        Trigger Condition
                      </span>
                      <code className="text-slate-200 font-mono">{rule.condition}</code>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 text-xs">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-0.5">
                        Remediation Action
                      </span>
                      <code className="text-emerald-400 font-mono">{rule.action}</code>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="font-mono text-slate-400">
                        Triggered: <strong className="text-slate-200">{rule.firedCount} times</strong>
                      </span>
                      <JXButton
                        variant="soft"
                        color="primary"
                        size="sm"
                        onClick={() => handleSimulateRuleTrigger(rule.id)}
                        startIcon={<Zap className="w-3.5 h-3.5" />}
                      >
                        Simulate Trigger
                      </JXButton>
                    </div>
                  </div>
                </JXCardContent>
              </JXCard>
            </JXGridItem>
          ))}
        </JXGrid>
      </div>

      {/* SECTION 3: Fleet Cron Scheduler Table */}
      <JXCard className="bg-slate-900/60 border-slate-800">
        <JXCardHeader
          title="Schedules"
          icon={<Calendar className="w-5 h-5 text-indigo-400" />}
        />
        <JXCardContent>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-mono uppercase">
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
                  <tr key={job.id} className="hover:bg-slate-950/40 transition-colors">
                    <td className="p-3">
                      <div className="font-semibold text-slate-200">{job.name}</div>
                      <div className="text-[11px] text-slate-400 font-sans">{job.description}</div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-indigo-400">
                        {job.cronExpr}
                      </span>
                    </td>
                    <td className="p-3 text-slate-300">{job.targets}</td>
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
                        <span className="text-slate-300 capitalize">{job.lastStatus}</span>
                        <span className="text-slate-500">({job.lastDuration})</span>
                      </div>
                    </td>
                    <td className="p-3 text-slate-300">{job.nextRun}</td>
                    <td className="p-3 text-right">
                      <JXButton
                        variant="soft"
                        color="primary"
                        size="sm"
                        onClick={() => handleRunCronNow(job.id)}
                        startIcon={<Play className="w-3.5 h-3.5" />}
                      >
                        Run Now
                      </JXButton>
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
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-rose-400 font-bold">
                  <AlertTriangle className="w-5 h-5" />
                  <span>Broadcast Execution Drill-Down</span>
                </div>
                <button
                  type="button"
                  aria-label="Close broadcast failure"
                  onClick={() => setSelectedFailedNode(null)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs font-mono">
                <div>
                  <span className="text-slate-400">Node Identifier:</span>
                  <div className="text-slate-200 font-semibold">{selectedFailedNode.nodeId}</div>
                </div>
                <div>
                  <span className="text-slate-400">Exit Status Code:</span>
                  <div className="text-rose-400 font-bold">{selectedFailedNode.exitCode}</div>
                </div>
                <div>
                  <span className="text-slate-400">Stderr Output:</span>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-rose-300">
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
