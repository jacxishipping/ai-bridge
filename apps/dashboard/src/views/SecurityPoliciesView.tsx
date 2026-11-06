import { SimulatedNotice } from "../shell/SimulatedNotice";
/**
 * Security Policies & Webhooks Manager (Screen 11)
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
  JXGrid,
  JXGridItem,
} from "../ui";
import {
  ShieldCheck,
  Lock,
  FileCode,
  Sliders,
  GitCompare,
  Webhook,
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Upload,
  Radio,
  Layers,
  Activity,
  Terminal,
} from "lucide-react";

interface AllowedBinary {
  id: string;
  name: string;
  path: string;
  sha256: string;
  status: "allowed" | "blocked" | "escalated";
  tier: string;
}

interface RestrictedPath {
  id: string;
  glob: string;
  description: string;
  enforcement: "kernel_block" | "audit_warn";
}

interface WebhookChannel {
  id: string;
  name: string;
  type: "slack" | "discord" | "teams" | "pagerduty";
  urlMasked: string;
  subscriptions: {
    highRiskApproval: boolean;
    agentOffline: boolean;
    selfHealingFired: boolean;
    auditBreach: boolean;
  };
  lastPingStatus?: {
    code: number;
    latencyMs: number;
    timestamp: string;
  } | null;
  isPinging?: boolean;
}

export const SecurityPoliciesView: React.FC = () => {
  // 4-Tab Policy Rule Matrix
  const [activeTab, setActiveTab] = useState<"binaries" | "paths" | "tiers" | "diff">("binaries");

  // Versioned Policy state
  const [policyVersion, setPolicyVersion] = useState<string>("v3.4.1");
  const [rollbackSuccess, setRollbackSuccess] = useState<string | null>(null);

  // Executable Allowlists state
  const [binaries, setBinaries] = useState<AllowedBinary[]>([
    {
      id: "bin-01",
      name: "git",
      path: "/usr/bin/git",
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      status: "allowed",
      tier: "Tier 1: Safe",
    },
    {
      id: "bin-02",
      name: "Google Chrome",
      path: "C:\\Program Files\\Google\\Chrome\\chrome.exe",
      sha256: "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
      status: "allowed",
      tier: "Tier 1: Safe",
    },
    {
      id: "bin-03",
      name: "systemctl",
      path: "/bin/systemctl",
      sha256: "9f8a4b01e29810a9c84912fa0981e4b1049281a8b9e89d1234567890abcdef12",
      status: "allowed",
      tier: "Tier 2: Workspace Mod",
    },
    {
      id: "bin-04",
      name: "docker",
      path: "/usr/bin/docker",
      sha256: "d87a331f4a9801b9c84912fa0981e4b1049281a8b9e89d1234567890abcdef34",
      status: "allowed",
      tier: "Tier 2: Workspace Mod",
    },
    {
      id: "bin-05",
      name: "powershell_ise.exe",
      path: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell_ise.exe",
      sha256: "49a1c098df9812a0c84912fa0981e4b1049281a8b9e89d1234567890abcdef56",
      status: "blocked",
      tier: "Blocked: Unauthorized Shell",
    },
    {
      id: "bin-06",
      name: "nc (netcat)",
      path: "/usr/bin/nc",
      sha256: "1098df49a1c09812a0c84912fa0981e4b1049281a8b9e89d1234567890abcdef78",
      status: "blocked",
      tier: "Blocked: Raw Socket Listener",
    },
    {
      id: "bin-07",
      name: "nmap",
      path: "/usr/bin/nmap",
      sha256: "781098df49a1c09812a0c84912fa0981e4b1049281a8b9e89d1234567890abcdef",
      status: "blocked",
      tier: "Blocked: Port Scanner",
    },
  ]);

  // New Binary Modal state
  const [showAddBinary, setShowAddBinary] = useState<boolean>(false);
  const [newBinaryPath, setNewBinaryPath] = useState<string>("/usr/bin/node");
  const [newBinarySha, setNewBinarySha] = useState<string>("7f49a13b9c02d1847e0912fa08e2e92c48b1049281a8b9e89d1234567890abcdef");

  // Restricted Paths state
  const [paths, setPaths] = useState<RestrictedPath[]>([
    {
      id: "p-01",
      glob: "/etc/shadow",
      description: "Linux password hash database (Zero read/write)",
      enforcement: "kernel_block",
    },
    {
      id: "p-02",
      glob: "C:\\Windows\\System32\\**",
      description: "Core Windows kernel subsystem binaries and drivers",
      enforcement: "kernel_block",
    },
    {
      id: "p-03",
      glob: "~/.ssh/**",
      description: "User private keypairs and authorized_keys",
      enforcement: "kernel_block",
    },
    {
      id: "p-04",
      glob: "/etc/sudoers*",
      description: "Sudoers privilege escalation definitions",
      enforcement: "kernel_block",
    },
    {
      id: "p-05",
      glob: "/var/log/audit/**",
      description: "Immutable operating system audit logs",
      enforcement: "kernel_block",
    },
  ]);

  // Tier Overrides & Throttles state
  const [tier3Timeout, setTier3Timeout] = useState<number>(120);
  const [burstRateLimit, setBurstRateLimit] = useState<number>(60);
  const [entropySensitivity, setEntropySensitivity] = useState<number>(0.85);

  // Webhook Integration state
  const [webhooks, setWebhooks] = useState<WebhookChannel[]>([
    {
      id: "wh-01",
      name: "Slack #secops-alerts",
      type: "slack",
      urlMasked: "https://hooks.slack.com/services/T00/B00/***9a4",
      subscriptions: {
        highRiskApproval: true,
        agentOffline: true,
        selfHealingFired: true,
        auditBreach: true,
      },
      lastPingStatus: { code: 200, latencyMs: 42, timestamp: "2026-11-02T19:30:00Z" },
    },
    {
      id: "wh-02",
      name: "Discord Operations Hub",
      type: "discord",
      urlMasked: "https://discord.com/api/webhooks/112/***441",
      subscriptions: {
        highRiskApproval: true,
        agentOffline: false,
        selfHealingFired: true,
        auditBreach: true,
      },
      lastPingStatus: { code: 200, latencyMs: 38, timestamp: "2026-11-02T18:15:00Z" },
    },
    {
      id: "wh-03",
      name: "Microsoft Teams Incident Bridge",
      type: "teams",
      urlMasked: "https://outlook.office.com/webhook/***teams",
      subscriptions: {
        highRiskApproval: true,
        agentOffline: true,
        selfHealingFired: false,
        auditBreach: true,
      },
      lastPingStatus: { code: 200, latencyMs: 51, timestamp: "2026-11-02T17:00:00Z" },
    },
    {
      id: "wh-04",
      name: "PagerDuty On-Call Sentinel",
      type: "pagerduty",
      urlMasked: "https://events.pagerduty.com/v2/enqueue/***pd",
      subscriptions: {
        highRiskApproval: true,
        agentOffline: true,
        selfHealingFired: true,
        auditBreach: true,
      },
      lastPingStatus: { code: 200, latencyMs: 29, timestamp: "2026-11-02T19:42:00Z" },
    },
  ]);

  const [deliveryLogs, setDeliveryLogs] = useState<Array<{
    id: string;
    event: string;
    channel: string;
    status: string;
    time: string;
  }>>([
    { id: "del-01", event: "HIGH_RISK_APPROVAL_NEEDED", channel: "Slack #secops-alerts", status: "delivered (200 OK)", time: "14:28:09 UTC" },
    { id: "del-02", event: "SELF_HEALING_TRIGGERED", channel: "PagerDuty On-Call", status: "delivered (200 OK)", time: "14:14:20 UTC" },
    { id: "del-03", event: "AGENT_OFFLINE", channel: "Microsoft Teams", status: "delivered (200 OK)", time: "13:50:11 UTC" },
  ]);

  const handleAddBinary = () => {
    if (!newBinaryPath.trim() || !newBinarySha.trim()) return;
    const name = newBinaryPath.split("/").pop() || newBinaryPath;
    setBinaries((prev) => [
      ...prev,
      {
        id: `bin-${Date.now()}`,
        name,
        path: newBinaryPath,
        sha256: newBinarySha,
        status: "allowed",
        tier: "Tier 1: Safe",
      },
    ]);
    setShowAddBinary(false);
    setNewBinaryPath("");
    setNewBinarySha("");
  };

  const handleRemoveBinary = (id: string) => {
    setBinaries((prev) => prev.filter((b) => b.id !== id));
  };

  const handleTestPing = (whId: string) => {
    setWebhooks((prev) =>
      prev.map((w) => (w.id === whId ? { ...w, isPinging: true } : w))
    );

    setTimeout(() => {
      const now = new Date().toISOString();
      const latency = Math.floor(35 + Math.random() * 20);
      setWebhooks((prev) =>
        prev.map((w) =>
          w.id === whId
            ? {
                ...w,
                isPinging: false,
                lastPingStatus: { code: 200, latencyMs: latency, timestamp: now },
              }
            : w
        )
      );

      const target = webhooks.find((w) => w.id === whId);
      if (target) {
        setDeliveryLogs((prev) => [
          {
            id: `del-${Date.now().toString(16)}`,
            event: "TEST_PING",
            channel: target.name,
            status: `delivered (200 OK - ${latency}ms)`,
            time: new Date().toLocaleTimeString() + " UTC",
          },
          ...prev,
        ]);
      }
    }, 700);
  };

  const handleToggleSubscription = (
    whId: string,
    key: keyof WebhookChannel["subscriptions"]
  ) => {
    setWebhooks((prev) =>
      prev.map((w) =>
        w.id === whId
          ? {
              ...w,
              subscriptions: {
                ...w.subscriptions,
                [key]: !w.subscriptions[key],
              },
            }
          : w
      )
    );
  };

  const handleRollback = () => {
    setPolicyVersion("v3.4.0");
    setRollbackSuccess("Successfully rolled back to Policy Release v3.4.0");
    setTimeout(() => setRollbackSuccess(null), 4000);
  };

  const handlePublishNewVersion = () => {
    setPolicyVersion("v3.4.2");
    setRollbackSuccess("Successfully published and distributed Policy Release v3.4.2 to 40 nodes.");
    setTimeout(() => setRollbackSuccess(null), 4000);
  };

  return (
    <div className="space-y-4">
      <SimulatedNotice feature="The policy rule matrix and executable allow-list" />
      {/* 4-Tab Policy Rule Matrix */}
      <JXCard className="bg-slate-900/60 border-slate-800">
        <div className="p-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 p-1 rounded-lg bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab("binaries")}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                activeTab === "binaries"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Executable Allowlists
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("paths")}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                activeTab === "paths"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Restricted Paths
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("tiers")}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                activeTab === "tiers"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Tier Overrides & Throttles
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("diff")}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                activeTab === "diff"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Semantic Policy Diff
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === "binaries" && (
              <JXButton
                variant="contained"
                color="primary"
                size="sm"
                onClick={() => setShowAddBinary(true)}
                startIcon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Binary
              </JXButton>
            )}
          </div>
        </div>

        <JXCardContent>
          <div className="pt-2">
            {rollbackSuccess && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
                {rollbackSuccess}
              </div>
            )}

            {/* Tab 1: Executable Allowlists */}
            {activeTab === "binaries" && (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-mono uppercase">
                      <th className="p-3">Binary Name</th>
                      <th className="p-3">Filesystem Path</th>
                      <th className="p-3">SHA-256 Cryptographic Hash</th>
                      <th className="p-3">Governance Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {binaries.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-950/40 transition-colors">
                        <td className="p-3 font-semibold text-slate-200">{b.name}</td>
                        <td className="p-3 text-slate-300">
                          <code>{b.path}</code>
                        </td>
                        <td className="p-3 text-slate-400 font-mono text-[11px] truncate max-w-xs">
                          {b.sha256}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                              b.status === "allowed"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <JXButton
                            variant="soft"
                            color="error"
                            size="sm"
                            onClick={() => handleRemoveBinary(b.id)}
                            startIcon={<Trash2 className="w-3.5 h-3.5" />}
                          >
                            Remove
                          </JXButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 2: Restricted Paths */}
            {activeTab === "paths" && (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-mono uppercase">
                      <th className="p-3">Protected Filesystem Glob</th>
                      <th className="p-3">Protection Description</th>
                      <th className="p-3">Kernel Enforcement Level</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {paths.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-950/40 transition-colors">
                        <td className="p-3 text-rose-400 font-bold">
                          <code>{p.glob}</code>
                        </td>
                        <td className="p-3 text-slate-300 font-sans">{p.description}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] uppercase font-bold">
                            Zero-Bypass Kernel Hook
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 3: Tier Overrides & Throttles */}
            {activeTab === "tiers" && (
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-slate-200">
                      Tier 3 Execution Timeout
                    </span>
                    <span className="font-mono text-indigo-400 font-bold">{tier3Timeout}s</span>
                  </div>
                  <input
                    aria-label="Tier 3 execution timeout in seconds"
                    type="range"
                    min={30}
                    max={300}
                    step={10}
                    value={tier3Timeout}
                    onChange={(e) => setTier3Timeout(Number(e.target.value))}
                    className="w-full accent-indigo-500 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <p className="text-[11px] font-mono text-slate-400">
                    Maximum wall-clock execution time permitted for arbitrary shell jobs
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-slate-200">
                      Burst Rate Limit
                    </span>
                    <span className="font-mono text-cyan-400 font-bold">
                      {burstRateLimit} calls/min
                    </span>
                  </div>
                  <input
                    aria-label="Burst rate limit in calls per minute"
                    type="range"
                    min={10}
                    max={120}
                    step={5}
                    value={burstRateLimit}
                    onChange={(e) => setBurstRateLimit(Number(e.target.value))}
                    className="w-full accent-cyan-500 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <p className="text-[11px] font-mono text-slate-400">
                    Per-agent tool execution throttling across edge gateway
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-slate-200">
                      AST Entropy Sensitivity
                    </span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {entropySensitivity}
                    </span>
                  </div>
                  <input
                    aria-label="Entropy sensitivity"
                    type="range"
                    min={0.5}
                    max={0.99}
                    step={0.01}
                    value={entropySensitivity}
                    onChange={(e) => setEntropySensitivity(Number(e.target.value))}
                    className="w-full accent-emerald-500 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <p className="text-[11px] font-mono text-slate-400">
                    Threshold for detecting obfuscated bash and base64 payloads
                  </p>
                </div>
              </div>
            )}

            {/* Tab 4: Semantic Policy Diff */}
            {activeTab === "diff" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="font-mono font-bold text-slate-300">Release v3.4.0 (Baseline)</span>
                      <span className="text-xs font-mono text-slate-500">2026-10-15</span>
                    </div>
                    <div className="text-xs font-mono text-slate-400 space-y-1">
                      <div>+ Binary: /usr/bin/git (sha256:e3b0...)</div>
                      <div>+ Binary: /usr/bin/docker (sha256:d87a...)</div>
                      <div>+ Path: /etc/shadow (enforcement: block)</div>
                      <div>+ Path: ~/.ssh/** (enforcement: block)</div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="font-mono font-bold text-emerald-400">Release v3.4.1 (Current Active)</span>
                      <span className="text-xs font-mono text-emerald-400">2026-11-02</span>
                    </div>
                    <div className="text-xs font-mono text-slate-400 space-y-1">
                      <div className="text-emerald-400">+ Added: Google Chrome (chrome.exe allowlist)</div>
                      <div className="text-rose-400">+ Blocked: nc (netcat raw socket listener)</div>
                      <div className="text-rose-400">+ Blocked: nmap (network scanner)</div>
                      <div className="text-cyan-400">+ Throttling: Elevated burst rate limit to 60 calls/min</div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <JXButton
                    variant="outlined"
                    color="warning"
                    size="md"
                    onClick={handleRollback}
                    startIcon={<RotateCcw className="w-4 h-4" />}
                  >
                    Rollback to Version v3.4.0
                  </JXButton>

                  <JXButton
                    variant="contained"
                    color="primary"
                    size="md"
                    onClick={handlePublishNewVersion}
                    startIcon={<Upload className="w-4 h-4" />}
                  >
                    Publish Release v3.4.2
                  </JXButton>
                </div>
              </div>
            )}
          </div>
        </JXCardContent>
      </JXCard>

      {/* Webhook Integration Manager */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Webhook className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-100">Webhooks</h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Outbound SecOps alerting and incident automation
          </span>
        </div>

        <JXGrid columns={12} gap="md">
          {webhooks.map((wh) => (
            <JXGridItem key={wh.id} colSpan={6}>
              <JXCard className="bg-slate-900/60 border-slate-800">
                <div className="p-4 border-b border-slate-800/60 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-slate-100">{wh.name}</h4>
                    <span className="text-[11px] font-mono text-slate-400 truncate block max-w-xs">
                      {wh.urlMasked}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {wh.lastPingStatus && (
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        {wh.lastPingStatus.code} OK ({wh.lastPingStatus.latencyMs}ms)
                      </span>
                    )}

                    <JXButton
                      variant="soft"
                      color="primary"
                      size="sm"
                      loading={wh.isPinging}
                      onClick={() => handleTestPing(wh.id)}
                      startIcon={<Send className="w-3.5 h-3.5" />}
                    >
                      Send Test Ping
                    </JXButton>
                  </div>
                </div>

                <JXCardContent>
                  <div className="space-y-2 pt-1 text-xs">
                    <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                      Subscribed Incident Events
                    </span>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={wh.subscriptions.highRiskApproval}
                          onChange={() => handleToggleSubscription(wh.id, "highRiskApproval")}
                          className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-700 accent-indigo-500 cursor-pointer"
                        />
                        <span className="text-slate-300">High-Risk Approvals</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={wh.subscriptions.agentOffline}
                          onChange={() => handleToggleSubscription(wh.id, "agentOffline")}
                          className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-700 accent-indigo-500 cursor-pointer"
                        />
                        <span className="text-slate-300">Node Disconnected</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={wh.subscriptions.selfHealingFired}
                          onChange={() => handleToggleSubscription(wh.id, "selfHealingFired")}
                          className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-700 accent-indigo-500 cursor-pointer"
                        />
                        <span className="text-slate-300">Self-Healing Triggered</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={wh.subscriptions.auditBreach}
                          onChange={() => handleToggleSubscription(wh.id, "auditBreach")}
                          className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-700 accent-indigo-500 cursor-pointer"
                        />
                        <span className="text-slate-300">Audit Integrity Breach</span>
                      </label>
                    </div>
                  </div>
                </JXCardContent>
              </JXCard>
            </JXGridItem>
          ))}
        </JXGrid>

        {/* Live Delivery Log Stream */}
        <JXCard className="bg-slate-900/60 border-slate-800">
          <JXCardHeader
            title="Delivery log"
            icon={<Activity className="w-5 h-5 text-indigo-400" />}
          />
          <JXCardContent>
            <div className="space-y-2 font-mono text-xs">
              {deliveryLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-indigo-400 font-bold">{log.id}</span>
                    <span className="text-slate-200 font-semibold">{log.event}</span>
                    <span className="text-slate-400">→ {log.channel}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400 font-bold">{log.status}</span>
                    <span className="text-slate-400">{log.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </JXCardContent>
        </JXCard>
      </div>

      {/* Add Binary Modal */}
      <AnimatePresence>
        {showAddBinary && (
          <GlassModal onClose={() => setShowAddBinary(false)} title="Add sample executable">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-indigo-400 font-bold">
                  <Plus className="w-5 h-5" />
                  <span>Add Executable to Allowlist</span>
                </div>
                <button
                  type="button"
                  aria-label="Close executable form"
                  onClick={() => setShowAddBinary(false)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs font-mono">
                <div>
                  <label className="block text-slate-400 mb-1">Absolute Binary Path:</label>
                  <input
                    type="text"
                    value={newBinaryPath}
                    onChange={(e) => setNewBinaryPath(e.target.value)}
                    placeholder="/usr/bin/node"
                    className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">SHA-256 Digest:</label>
                  <input
                    type="text"
                    value={newBinarySha}
                    onChange={(e) => setNewBinarySha(e.target.value)}
                    placeholder="7f49a13b..."
                    className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <JXButton
                  variant="outlined"
                  color="neutral"
                  size="sm"
                  onClick={() => setShowAddBinary(false)}
                >
                  Cancel
                </JXButton>
                <JXButton
                  variant="contained"
                  color="primary"
                  size="sm"
                  disabled={!newBinaryPath.trim() || !newBinarySha.trim()}
                  onClick={handleAddBinary}
                >
                  Register Binary
                </JXButton>
              </div>
            </motion.div>
          </GlassModal>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SecurityPoliciesView;

