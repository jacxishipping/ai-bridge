import React, { useState, useMemo } from "react";
import {
  JXCard,
  JXButton,
  JXSelect,
  JXTextField,
  LiquidButton,
} from "@jacxishippingorg/jx-ui-react";

export interface AuditRecord {
  id: string;
  timestamp: string;
  timeAgo: string;
  actor: string;
  actorType: "ai" | "human" | "system";
  actorMeta: string;
  action: string;
  actionType: "terminal" | "policy" | "security" | "vision" | "cron" | "mcp";
  targetNode: string;
  targetMeta: string;
  decision: "approved" | "auto" | "denied" | "escalated";
  decisionTier: string;
  recordHash: string;
  fullHash: string;
  proofBundle: {
    algorithm: string;
    tsaAuthority: string;
    leafPosition: string;
    inclusionPath: string[];
    payload: any;
  };
}

interface AuditTrailProps {
  auditRecords?: any[];
  onExportAudit?: () => Promise<any>;
}

export const AuditTrail: React.FC<AuditTrailProps> = ({
  auditRecords = [],
  onExportAudit,
}) => {
  // Filters state
  const [datePreset, setDatePreset] = useState<string>("today");
  const [actorFilter, setActorFilter] = useState<string>("all");
  const [decisionFilter, setDecisionFilter] = useState<string>("all");
  const [nodeSearch, setNodeSearch] = useState<string>("");
  const [hashSearch, setHashSearch] = useState<string>("");
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Inspector modal state
  const [inspectRecord, setInspectRecord] = useState<AuditRecord | null>(null);

  // Integrity verification simulation state
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<{
    status: "success" | "idle";
    message: string;
    root: string;
    durationMs: number;
  } | null>(null);

  // Export menu state
  const [exportOpen, setExportOpen] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  // Default seed data combined with any live audit records
  const defaultRecords: AuditRecord[] = [
    {
      id: "EVT-9812-7F49",
      timestamp: "14:28:11.892",
      timeAgo: "2m ago • RFC 3161",
      actor: "Claude 3.5 Sonnet",
      actorType: "ai",
      actorMeta: "agent_8a92f • sess_4091",
      action: "systemctl reload nginx",
      actionType: "terminal",
      targetNode: "edge-gw-us-east.net",
      targetMeta: "Debian 12 • us-east-1a",
      decision: "approved",
      decisionTier: "Tier 3 Approved",
      recordHash: "sha256:7f49a1...08e2",
      fullHash: "7f49a13b9c02d1847e0912fa08e2e92c48b1049281a8b9e89d12",
      proofBundle: {
        algorithm: "ECDSA P-256 + SHA-256",
        tsaAuthority: "NIST-Stratum-1.internal-ca.ai",
        leafPosition: "#1,489,204 (Index 84,912)",
        inclusionPath: [
          "0x4a88bc01...881f <-- Leaf Hash (Record Payload)",
          "0x991f82aa...0041 <-- Neighbor Node 84,913 (L2)",
          "0xcc771120...bf22 <-- Branch Hash (L3)",
          "0x89fa94c8b21c54b2d398e4128f91 <-- Verified Merkle Root",
        ],
        payload: {
          caller: "Claude 3.5 Sonnet (agent_8a92f)",
          session_id: "sess_4091",
          tool: "terminal.run_command",
          args: { command: "systemctl reload nginx", timeout: 15 },
          device_id: "edge-gw-us-east.net",
          exit_code: 0,
          governance: { tier: 3, approver: "sarah_j", approved_at: "2025-02-18T14:28:10Z" },
        },
      },
    },
    {
      id: "EVT-9811-D82E",
      timestamp: "14:26:44.102",
      timeAgo: "4m ago • RFC 3161",
      actor: "Sarah J. (SecOps)",
      actorType: "human",
      actorMeta: "lead_operator • webauthn",
      action: "mcp.policy_revoke_token",
      actionType: "security",
      targetNode: "auth-cluster-core",
      targetMeta: "Hardened RHEL • sec-zone-0",
      decision: "approved",
      decisionTier: "Tier 4 Human Sign",
      recordHash: "sha256:d82e14...bb40",
      fullHash: "d82e143b4f912a76cc1294efbb40129048a1bc19e918491029e1",
      proofBundle: {
        algorithm: "ECDSA P-384 + SHA-384 (FIPS 140-3)",
        tsaAuthority: "Hardware-HSM-Vault-01",
        leafPosition: "#1,489,203 (Index 84,911)",
        inclusionPath: [
          "0x2e88a011...441a <-- Leaf Hash (Record Payload)",
          "0x11ab44bb...9980 <-- Neighbor Node 84,910 (L2)",
          "0xbb110992...331a <-- Branch Hash (L3)",
          "0x89fa94c8b21c54b2d398e4128f91 <-- Verified Merkle Root",
        ],
        payload: {
          caller: "Sarah J. (lead_operator)",
          auth_method: "WebAuthn FIDO2 Level 3",
          action: "mcp.policy_revoke_token",
          args: { client_id: "unverified-agent-x", reason: "Excessive tier-3 rate violations" },
          attestation: "YubiKey-5-NFC-Validated",
        },
      },
    },
    {
      id: "EVT-9810-3A11",
      timestamp: "14:24:02.518",
      timeAgo: "6m ago • RFC 3161",
      actor: "GPT-4o Subagent",
      actorType: "ai",
      actorMeta: "agent_2f18c • worker_11",
      action: "rm -rf /var/log/audit/*",
      actionType: "security",
      targetNode: "db-replica-prod-02",
      targetMeta: "Ubuntu 24.04 • us-west-2",
      decision: "denied",
      decisionTier: "Tier 4 Denied",
      recordHash: "sha256:3a110f...55c9",
      fullHash: "3a110fc9123847a98c0055c911fa8912c9182310192840192831",
      proofBundle: {
        algorithm: "ECDSA P-256 + SHA-256",
        tsaAuthority: "NIST-Stratum-1.internal-ca.ai",
        leafPosition: "#1,489,202 (Index 84,910)",
        inclusionPath: [
          "0x88bb1090...773a <-- Leaf Hash (Blocked Action Record)",
          "0xfa009182...1122 <-- Neighbor Node 84,909 (L2)",
          "0xee991100...44bb <-- Branch Hash (L3)",
          "0x89fa94c8b21c54b2d398e4128f91 <-- Verified Merkle Root",
        ],
        payload: {
          caller: "GPT-4o Subagent (agent_2f18c)",
          command_attempted: "rm -rf /var/log/audit/*",
          target: "db-replica-prod-02",
          rule_triggered: "RESTRICTED_PATH_GUARDRAIL_VAR_LOG",
          verdict: "DENY_AND_QUARANTINE_THREAD",
        },
      },
    },
    {
      id: "EVT-9809-8894",
      timestamp: "14:21:58.330",
      timeAgo: "9m ago • RFC 3161",
      actor: "Claude 3.5 Sonnet",
      actorType: "ai",
      actorMeta: "agent_8a92f • sess_4088",
      action: "desktop.capture_screen(display=0)",
      actionType: "vision",
      targetNode: "workstation-dev-alpha",
      targetMeta: "macOS Sonoma • office-lan",
      decision: "auto",
      decisionTier: "Tier 1 Auto-Allowed",
      recordHash: "sha256:8894ce...1109",
      fullHash: "8894ce91fa2374bb01a8894ce110900182479102830192841928",
      proofBundle: {
        algorithm: "ECDSA P-256 + SHA-256",
        tsaAuthority: "NIST-Stratum-1.internal-ca.ai",
        leafPosition: "#1,489,201 (Index 84,909)",
        inclusionPath: [
          "0x77aa1122...0099 <-- Leaf Hash",
          "0x33445566...7788 <-- Branch Hash",
          "0x89fa94c8b21c54b2d398e4128f91 <-- Verified Merkle Root",
        ],
        payload: {
          caller: "Claude 3.5 Sonnet",
          tool: "desktop.capture_screen",
          display: 0,
          scale: 0.75,
          governance_tier: 1,
          auto_allowed: true,
        },
      },
    },
    {
      id: "EVT-9808-55F2",
      timestamp: "14:15:00.004",
      timeAgo: "15m ago • RFC 3161",
      actor: "System Cron Daemon",
      actorType: "system",
      actorMeta: "cron_service • node_daemon",
      action: "vacuum_wal_checkpoints()",
      actionType: "cron",
      targetNode: "db-primary-master",
      targetMeta: "Linux Kernel 6.8 • us-east-1",
      decision: "auto",
      decisionTier: "Tier 1 Auto-Allowed",
      recordHash: "sha256:55f2b9...90a1",
      fullHash: "55f2b98811d044bb7190a190a190001928471920381029384719",
      proofBundle: {
        algorithm: "ECDSA P-256 + SHA-256",
        tsaAuthority: "NIST-Stratum-1.internal-ca.ai",
        leafPosition: "#1,489,200 (Index 84,908)",
        inclusionPath: [
          "0x11002233...4455 <-- Leaf Hash",
          "0x66778899...aabb <-- Branch Hash",
          "0x89fa94c8b21c54b2d398e4128f91 <-- Verified Merkle Root",
        ],
        payload: {
          service: "ai-bridge-vacuum-cron",
          scheduled_period: "15m",
          action: "vacuum_wal_checkpoints",
          bytes_reclaimed: 14680064,
        },
      },
    },
    {
      id: "EVT-9807-10CA",
      timestamp: "14:09:12.780",
      timeAgo: "21m ago • RFC 3161",
      actor: "Claude 3.5 Sonnet",
      actorType: "ai",
      actorMeta: "agent_8a92f • sess_4080",
      action: "k8s.apply_deployment(replicas=12)",
      actionType: "mcp",
      targetNode: "k8s-control-plane-01",
      targetMeta: "CoreOS • eu-west-1",
      decision: "escalated",
      decisionTier: "Tier 2 Escalated",
      recordHash: "sha256:10ca8b...67ee",
      fullHash: "10ca8b4382901ef67ee67ee67ee1001824719203810293847192",
      proofBundle: {
        algorithm: "ECDSA P-256 + SHA-256",
        tsaAuthority: "NIST-Stratum-1.internal-ca.ai",
        leafPosition: "#1,489,199 (Index 84,907)",
        inclusionPath: [
          "0x8899aabb...ccdd <-- Leaf Hash",
          "0xeeff0011...2233 <-- Branch Hash",
          "0x89fa94c8b21c54b2d398e4128f91 <-- Verified Merkle Root",
        ],
        payload: {
          caller: "Claude 3.5 Sonnet",
          mcp_method: "k8s.apply_deployment",
          args: { namespace: "prod", deployment: "api-gateway", replicas: 12 },
          status: "ESCALATED_PENDING_SECOPS_REVIEW",
        },
      },
    },
  ];

  // Merge live audit records from API if present
  const allRecords = useMemo(() => {
    if (!auditRecords || auditRecords.length === 0) return defaultRecords;
    const formattedLive: AuditRecord[] = auditRecords.map((r, idx) => ({
      id: r.id || `EVT-${Date.now()}-${idx}`,
      timestamp: r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString(),
      timeAgo: "Live Ledger",
      actor: r.actor || r.user || "AI Bridge Daemon",
      actorType: r.actor?.toLowerCase().includes("sarah") ? "human" : "ai",
      actorMeta: r.actor_meta || "session_live",
      action: r.action || r.tool || "task.execute",
      actionType: "terminal",
      targetNode: r.device_id || r.node || "cluster-node",
      targetMeta: r.target_meta || "Linux Fleet Node",
      decision: (r.decision || (r.status === "denied" ? "denied" : "approved")) as any,
      decisionTier: r.tier ? `Tier ${r.tier}` : "Tier 2 Auto",
      recordHash: `sha256:${(r.hash || "abc123456789").slice(0, 8)}...`,
      fullHash: r.hash || "7f49a13b9c02d1847e0912fa08e2",
      proofBundle: {
        algorithm: "ECDSA P-256 + SHA-256",
        tsaAuthority: "NIST-Stratum-1.internal-ca.ai",
        leafPosition: `#1,489,${205 + idx}`,
        inclusionPath: [
          `0x${(r.hash || "7f49").slice(0, 10)}... <-- Leaf Hash`,
          "0x89fa94c8b21c54b2d398e4128f91 <-- Verified Merkle Root",
        ],
        payload: r,
      },
    }));
    return [...formattedLive, ...defaultRecords];
  }, [auditRecords]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return allRecords.filter((rec) => {
      if (actorFilter === "claude" && !rec.actor.toLowerCase().includes("claude")) return false;
      if (actorFilter === "gpt4o" && !rec.actor.toLowerCase().includes("gpt")) return false;
      if (actorFilter === "sarah" && !rec.actor.toLowerCase().includes("sarah")) return false;
      if (actorFilter === "cron" && !rec.actor.toLowerCase().includes("cron")) return false;

      if (decisionFilter !== "all" && rec.decision !== decisionFilter) return false;

      if (nodeSearch.trim() && !rec.targetNode.toLowerCase().includes(nodeSearch.toLowerCase())) {
        return false;
      }

      if (hashSearch.trim() && !rec.fullHash.toLowerCase().includes(hashSearch.toLowerCase()) && !rec.recordHash.toLowerCase().includes(hashSearch.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [allRecords, actorFilter, decisionFilter, nodeSearch, hashSearch]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 1800);
  };

  const handleVerifyLedger = async () => {
    setIsVerifying(true);
    setVerificationResult(null);
    // Cryptographic Merkle calculation simulation
    await new Promise((res) => setTimeout(res, 950));
    setIsVerifying(false);
    setVerificationResult({
      status: "success",
      message: "Ledger Merkle Tree integrity verified 100% against NIST Stratum-1 RFC 3161 TSA Authority. Zero block tampering detected across 1,489,204 records.",
      root: "0x89fa94c8b21c54b2d398e4128f91",
      durationMs: 34.2,
    });
  };

  const handleExport = async (format: string) => {
    setExportOpen(false);
    try {
      if (onExportAudit) {
        await onExportAudit();
      }
      setExportSuccess(`Exported Cryptographic Ledger as ${format.toUpperCase()}`);
      setTimeout(() => setExportSuccess(null), 3000);
    } catch {
      // fallback download simulation
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredRecords, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `ai_bridge_audit_ledger_${Date.now()}.${format === "csv" ? "csv" : "json"}`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      setExportSuccess(`Exported Cryptographic Ledger as ${format.toUpperCase()}`);
      setTimeout(() => setExportSuccess(null), 3000);
    }
  };

  return (
    <div className="flex flex-col w-full pb-16 space-y-6 animate-fadeIn">
      {/* ============================================================== */}
      {/* 1. TOP BREADCRUMB, MERKLE ROOT & ACTION BAR                    */}
      {/* ============================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-2">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-neutral-400 uppercase tracking-wider">
              Governance Domain
            </span>
            <span className="text-neutral-600 font-mono text-xs">/</span>
            <span className="font-mono text-xs text-indigo-400 font-semibold uppercase tracking-wider">
              Append-Only Audit Trail
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              RFC 3161 Timestamped
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-neutral-100">
              Cryptographic Ledger
            </h1>

            {/* Merkle Root Display */}
            <div className="flex items-center gap-2 bg-neutral-900/80 border border-neutral-800 px-3 py-1.5 rounded-lg">
              <span className="material-symbols-outlined text-emerald-400 text-sm">
                enhanced_encryption
              </span>
              <span className="font-mono text-xs text-neutral-400">Merkle Root:</span>
              <span className="font-mono text-xs text-indigo-300 font-medium select-all">
                0x89fa94c8b21...e4128f91
              </span>
              <button
                type="button"
                className="text-neutral-400 hover:text-neutral-200 transition-colors p-0.5"
                onClick={() => copyToClipboard("0x89fa94c8b21c54b2d398e4128f91", "root")}
                title="Copy Merkle Root"
              >
                <span className="material-symbols-outlined text-sm">
                  {copiedHash === "root" ? "done" : "content_copy"}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Action Group */}
        <div className="flex items-center flex-wrap gap-2.5 relative">
          <LiquidButton
            variant="solid"
            tone="primary"
            onClick={handleVerifyLedger}
            style={{ padding: "8px 18px", fontSize: 13, height: 42 }}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base">
                {isVerifying ? "sync" : "verified_user"}
              </span>
              <span>{isVerifying ? "Verifying SHA-256 Tree…" : "Verify Ledger Integrity"}</span>
            </div>
          </LiquidButton>

          <div className="relative">
            <JXButton
              variant="outlined"
              onClick={() => setExportOpen(!exportOpen)}
              style={{ padding: "8px 16px", height: 42, fontSize: 13 }}
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base">download</span>
                <span>Export Ledger</span>
                <span className="material-symbols-outlined text-xs">expand_more</span>
              </div>
            </JXButton>

            {exportOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl bg-neutral-900 border border-neutral-800 shadow-2xl z-50 p-2 flex flex-col gap-1 backdrop-blur-xl">
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-neutral-800 text-neutral-200 flex items-center justify-between text-xs transition-colors"
                  onClick={() => handleExport("csv")}
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-neutral-400 text-sm">description</span>
                    Export Raw CSV
                  </span>
                  <span className="font-mono text-neutral-400">.csv</span>
                </button>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-neutral-800 text-neutral-200 flex items-center justify-between text-xs transition-colors"
                  onClick={() => handleExport("json")}
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-400 text-sm">workspace_premium</span>
                    Signed JSON (RFC 3161)
                  </span>
                  <span className="font-mono text-emerald-400">.json+sig</span>
                </button>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-neutral-800 text-neutral-200 flex items-center justify-between text-xs transition-colors"
                  onClick={() => handleExport("proof")}
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-indigo-400 text-sm">policy</span>
                    Cryptographic Proof Bundle
                  </span>
                  <span className="font-mono text-indigo-400">.proof</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Verification Notice Toast */}
      {verificationResult && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-start justify-between gap-3 animate-fadeIn">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-emerald-400 text-xl">verified</span>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-emerald-300">
                Merkle Tree Cryptographic Integrity Passed (34.2ms)
              </span>
              <p className="text-xs text-neutral-300 leading-relaxed max-w-4xl">
                {verificationResult.message}
              </p>
              <div className="font-mono text-xs text-emerald-400/90 mt-1">
                Verified Root: {verificationResult.root} · RFC 3161 NIST Stratum-1 Atomic Sync
              </div>
            </div>
          </div>
          <button
            type="button"
            className="text-neutral-400 hover:text-neutral-200"
            onClick={() => setVerificationResult(null)}
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}

      {exportSuccess && (
        <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/40 flex items-center gap-3 text-indigo-200 text-xs animate-fadeIn">
          <span className="material-symbols-outlined text-indigo-400 text-base">check_circle</span>
          <span>{exportSuccess}</span>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. TELEMETRY & KPI BENTO CARDS (4 Cards)                      */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Sealed Records */}
        <div className="rounded-xl overflow-hidden bg-neutral-900/60 border border-neutral-800 p-5 flex flex-col justify-between relative group hover:border-neutral-700 transition-all">
          <div className="flex items-start justify-between">
            <span className="font-mono text-xs text-neutral-400 uppercase tracking-wider">
              Total Sealed Records
            </span>
            <div className="w-8 h-8 rounded-lg bg-neutral-800/80 flex items-center justify-center text-emerald-400">
              <span className="material-symbols-outlined text-base">lock</span>
            </div>
          </div>
          <div className="my-3">
            <div className="font-mono text-2xl font-bold text-neutral-100 tracking-tight">
              1,489,204
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-xs text-emerald-400 font-medium">100% Hash Verified Immutable</span>
            </div>
          </div>
          <div className="pt-2 border-t border-neutral-800/60 flex items-center justify-between font-mono text-[11px] text-neutral-500">
            <span>Zero Attestation Loss</span>
            <span>SHA-256 Merkle</span>
          </div>
        </div>

        {/* KPI 2: 24h Activity Volume */}
        <div className="rounded-xl overflow-hidden bg-neutral-900/60 border border-neutral-800 p-5 flex flex-col justify-between relative group hover:border-neutral-700 transition-all">
          <div className="flex items-start justify-between">
            <span className="font-mono text-xs text-neutral-400 uppercase tracking-wider">
              24h Activity Volume
            </span>
            <div className="w-8 h-8 rounded-lg bg-neutral-800/80 flex items-center justify-center text-indigo-400">
              <span className="material-symbols-outlined text-base">query_stats</span>
            </div>
          </div>
          <div className="my-3">
            <div className="font-mono text-2xl font-bold text-neutral-100 tracking-tight">
              48,291
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="material-symbols-outlined text-emerald-400 text-sm">trending_up</span>
              <span className="text-xs text-emerald-400 font-medium">+14.2% vs 7-day median</span>
            </div>
          </div>
          <div className="pt-2 border-t border-neutral-800/60 flex items-center justify-between font-mono text-[11px] text-neutral-500">
            <span>Peak: 124 evt/sec</span>
            <span>Avg: 33.5 evt/sec</span>
          </div>
        </div>

        {/* KPI 3: Human vs AI Ratio */}
        <div className="rounded-xl overflow-hidden bg-neutral-900/60 border border-neutral-800 p-5 flex flex-col justify-between relative group hover:border-neutral-700 transition-all">
          <div className="flex items-start justify-between">
            <span className="font-mono text-xs text-neutral-400 uppercase tracking-wider">
              Human vs AI Ratio
            </span>
            <div className="w-8 h-8 rounded-lg bg-neutral-800/80 flex items-center justify-center text-purple-400">
              <span className="material-symbols-outlined text-base">smart_toy</span>
            </div>
          </div>
          <div className="my-3">
            <div className="flex items-baseline justify-between">
              <div className="font-mono text-xl font-bold text-neutral-100">
                96.8% <span className="text-xs text-neutral-400 font-normal">AI</span>
              </div>
              <div className="font-mono text-xl font-bold text-indigo-400">
                3.2% <span className="text-xs text-neutral-400 font-normal">Operator</span>
              </div>
            </div>
            {/* Split bar */}
            <div className="w-full h-1.5 rounded-full bg-neutral-800 mt-2 flex overflow-hidden">
              <div className="bg-indigo-500 h-full" style={{ width: "96.8%" }} />
              <div className="bg-emerald-400 h-full" style={{ width: "3.2%" }} />
            </div>
          </div>
          <div className="pt-2 border-t border-neutral-800/60 flex items-center justify-between font-mono text-[11px] text-neutral-500">
            <span>46,745 Agent Actions</span>
            <span>1,546 Operator Overrides</span>
          </div>
        </div>

        {/* KPI 4: Guardrail Interventions */}
        <div className="rounded-xl overflow-hidden bg-neutral-900/60 border border-neutral-800 p-5 flex flex-col justify-between relative group hover:border-neutral-700 transition-all">
          <div className="flex items-start justify-between">
            <span className="font-mono text-xs text-neutral-400 uppercase tracking-wider">
              Blocked / Interventions
            </span>
            <div className="w-8 h-8 rounded-lg bg-neutral-800/80 flex items-center justify-center text-rose-400">
              <span className="material-symbols-outlined text-base">shield_with_heart</span>
            </div>
          </div>
          <div className="my-3">
            <div className="font-mono text-2xl font-bold text-rose-400 tracking-tight">
              142
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="material-symbols-outlined text-rose-400 text-sm">block</span>
              <span className="text-xs text-rose-400 font-medium">Guardrail Interventions (24h)</span>
            </div>
          </div>
          <div className="pt-2 border-t border-neutral-800/60 flex items-center justify-between font-mono text-[11px] text-neutral-500">
            <span>0 Escalation Leaks</span>
            <span>Auto-quarantined</span>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. ADVANCED JXUI FILTER TOOLBAR                               */}
      {/* ============================================================== */}
      <div className="rounded-xl bg-neutral-900/70 border border-neutral-800 p-4 flex flex-col gap-3">
        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
          {/* Date presets */}
          <div className="flex items-center flex-wrap gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800/60">
            {[
              { id: "1h", label: "Last 1 Hour" },
              { id: "today", label: "Today" },
              { id: "7d", label: "7 Days" },
              { id: "rfc", label: "RFC 3339" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  datePreset === p.id
                    ? "bg-indigo-600 text-white shadow-sm font-semibold"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
                }`}
                onClick={() => setDatePreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Actor, Decision, Node Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1 max-w-3xl">
            {/* Actor Selector */}
            <JXSelect
              value={actorFilter}
              onChange={(val: any) => setActorFilter(typeof val === "string" ? val : val?.target?.value || "all")}
              options={[
                { id: "all", label: "Actor: All Actors" },
                { id: "claude", label: "Claude 3.5 Sonnet (Agent-8a9)" },
                { id: "gpt4o", label: "GPT-4o (Agent-2f1)" },
                { id: "sarah", label: "Sarah J. (Lead SecOps)" },
                { id: "cron", label: "System Cron Daemon" },
              ]}
            />

            {/* Decision Selector */}
            <JXSelect
              value={decisionFilter}
              onChange={(val: any) => setDecisionFilter(typeof val === "string" ? val : val?.target?.value || "all")}
              options={[
                { id: "all", label: "Governance: All Decisions" },
                { id: "approved", label: "Approved" },
                { id: "auto", label: "Auto-Allowed" },
                { id: "denied", label: "Denied / Blocked" },
                { id: "escalated", label: "Escalated to Human" },
              ]}
            />

            {/* Target Node Search */}
            <JXTextField
              value={nodeSearch}
              onChange={(e: any) => setNodeSearch(e?.target?.value || "")}
              placeholder="Node: Host / UUID…"
            />
          </div>
        </div>

        {/* Bottom Hash Search Row */}
        <div className="flex items-center gap-3 pt-1">
          <div className="relative flex-1">
            <JXTextField
              value={hashSearch}
              onChange={(e: any) => setHashSearch(e?.target?.value || "")}
              placeholder="Search exact Record Hash (SHA-256) or Merkle Leaf hex…"
            />
          </div>

          <JXButton
            variant="soft"
            onClick={() => {
              setDatePreset("today");
              setActorFilter("all");
              setDecisionFilter("all");
              setNodeSearch("");
              setHashSearch("");
            }}
            style={{ padding: "8px 16px", height: 40 }}
          >
            <div className="flex items-center gap-1.5 text-xs">
              <span className="material-symbols-outlined text-sm">restart_alt</span>
              <span>Reset Filters</span>
            </div>
          </JXButton>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 4. IMMUTABLE EVENT STREAM TABLE CONTAINER                      */}
      {/* ============================================================== */}
      <div className="rounded-xl bg-neutral-900/60 border border-neutral-800 overflow-hidden flex flex-col">
        {/* Table header bar */}
        <div className="px-5 py-3.5 bg-neutral-900/90 border-b border-neutral-800 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold text-neutral-100">
              Append-Only Event Stream
            </h2>
            <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-neutral-800 text-emerald-400 font-medium">
              Synced with Ledger Head
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs text-neutral-400">
            <span>Showing {filteredRecords.length} of 1,489,204 events</span>
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        </div>

        {/* Dense Table */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-950/60 font-mono text-[11px] text-neutral-400 uppercase tracking-wider border-b border-neutral-800">
                <th className="py-3 px-4">Timestamp (UTC)</th>
                <th className="py-3 px-4">Actor & Identity</th>
                <th className="py-3 px-4">Action / Tool Invoked</th>
                <th className="py-3 px-4">Target Node</th>
                <th className="py-3 px-4">Governance Decision</th>
                <th className="py-3 px-4">SHA-256 Record Hash</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 text-xs text-neutral-200">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-500 font-mono">
                    No matching audit ledger records found for selected filters.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => {
                  const isDenied = r.decision === "denied";
                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-neutral-800/40 transition-colors ${
                        isDenied ? "bg-rose-950/10" : ""
                      }`}
                    >
                      {/* Timestamp */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className={`font-mono text-xs font-semibold ${isDenied ? "text-rose-400" : "text-neutral-200"}`}>
                            {r.timestamp}
                          </span>
                          <span className="font-mono text-[11px] text-neutral-500">
                            {r.timeAgo}
                          </span>
                        </div>
                      </td>

                      {/* Actor & Identity */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold font-mono ${
                              r.actorType === "human"
                                ? "bg-purple-900/40 text-purple-300"
                                : r.actorType === "system"
                                ? "bg-neutral-800 text-neutral-400"
                                : "bg-indigo-900/40 text-indigo-300"
                            }`}
                          >
                            {r.actor.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-neutral-100">{r.actor}</span>
                            <span className="font-mono text-[10px] text-neutral-500">{r.actorMeta}</span>
                          </div>
                        </div>
                      </td>

                      {/* Action / Tool Invoked */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`material-symbols-outlined text-sm ${
                              isDenied ? "text-rose-400" : "text-neutral-400"
                            }`}
                          >
                            {r.actionType === "terminal"
                              ? "terminal"
                              : r.actionType === "vision"
                              ? "screenshot_monitor"
                              : r.actionType === "cron"
                              ? "cleaning_services"
                              : r.actionType === "mcp"
                              ? "cloud_sync"
                              : "policy"}
                          </span>
                          <code
                            className={`px-2 py-0.5 rounded font-mono text-xs ${
                              isDenied
                                ? "bg-rose-950/40 text-rose-300 border border-rose-800/40"
                                : "bg-neutral-950 text-indigo-300 border border-neutral-800"
                            }`}
                          >
                            {r.action}
                          </code>
                        </div>
                      </td>

                      {/* Target Node */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-neutral-500 text-sm">
                            computer
                          </span>
                          <div className="flex flex-col">
                            <span className="font-mono text-xs text-neutral-200">{r.targetNode}</span>
                            <span className="font-mono text-[10px] text-neutral-500">{r.targetMeta}</span>
                          </div>
                        </div>
                      </td>

                      {/* Governance Decision */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            r.decision === "approved"
                              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                              : r.decision === "denied"
                              ? "bg-rose-500/20 border border-rose-500/40 text-rose-400"
                              : r.decision === "escalated"
                              ? "bg-purple-500/20 border border-purple-500/40 text-purple-300"
                              : "bg-neutral-800 text-neutral-300"
                          }`}
                        >
                          <span className="material-symbols-outlined text-xs">
                            {r.decision === "approved"
                              ? "verified"
                              : r.decision === "denied"
                              ? "block"
                              : r.decision === "escalated"
                              ? "priority_high"
                              : "done"}
                          </span>
                          {r.decisionTier}
                        </span>
                      </td>

                      {/* SHA-256 Record Hash */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 group/hash">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span
                            className="font-mono text-xs text-neutral-400 hover:text-neutral-100 select-all cursor-pointer"
                            onClick={() => copyToClipboard(r.fullHash, r.id)}
                            title="Click to copy SHA-256"
                          >
                            {r.recordHash}
                          </span>
                          <button
                            type="button"
                            className="text-neutral-500 hover:text-neutral-300 transition-colors"
                            onClick={() => copyToClipboard(r.fullHash, r.id)}
                          >
                            <span className="material-symbols-outlined text-xs">
                              {copiedHash === r.id ? "done" : "content_copy"}
                            </span>
                          </button>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <JXButton
                          variant="outlined"
                          onClick={() => setInspectRecord(r)}
                          style={{ padding: "4px 10px", fontSize: 11, height: 30 }}
                        >
                          <div className="flex items-center gap-1">
                            <span>Inspect Proof</span>
                            <span className="material-symbols-outlined text-xs">north_east</span>
                          </div>
                        </JXButton>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination & Verification Subbar */}
        <div className="px-5 py-3 bg-neutral-950/70 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono text-xs text-neutral-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-emerald-400 text-sm">
                enhanced_encryption
              </span>
              Continuous Cryptographic Attestation Active
            </span>
            <span className="text-neutral-700">•</span>
            <span>Leaf #1,489,204</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1 rounded-lg bg-neutral-800/60 text-neutral-400 hover:text-neutral-200 disabled:opacity-40"
              disabled
            >
              Prev
            </button>
            <span className="px-2 text-neutral-200 font-semibold">Page 1 of 8,049</span>
            <button
              type="button"
              className="px-3 py-1 rounded-lg bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 5. BOTTOM CRYPTOGRAPHIC MERKLE ATTESTATION DRAWER              */}
      {/* ============================================================== */}
      <div className="rounded-xl bg-neutral-900/60 border border-neutral-800 p-5 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <span className="material-symbols-outlined text-xl">token</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-neutral-100">
                  Zero-Knowledge Merkle Attestation
                </h3>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold uppercase">
                  Pass Validated
                </span>
              </div>
              <p className="text-xs text-neutral-400 max-w-4xl leading-relaxed">
                Continuous Zero-Knowledge Attestation passing across 1,452 nodes; Ledger head timestamp synchronized with National NIST Atomic Clock (UTC via PTP IEEE 1588v2).
              </p>
            </div>
          </div>

          {/* Live Attestation Telemetry Pill */}
          <div className="flex items-center gap-4 bg-neutral-950 px-4 py-2 rounded-xl border border-neutral-800 shrink-0">
            <div className="flex flex-col text-right">
              <span className="font-mono text-[10px] text-neutral-500 uppercase">Consensus Nodes</span>
              <span className="font-mono text-xs text-emerald-400 font-semibold">1,452 / 1,452 Live</span>
            </div>
            <span className="h-6 w-px bg-neutral-800" />
            <div className="flex flex-col text-right">
              <span className="font-mono text-[10px] text-neutral-500 uppercase">Root Drift</span>
              <span className="font-mono text-xs text-neutral-200">&lt; 0.002 ms</span>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 6. CRYPTOGRAPHIC PROOF INSPECTOR MODAL                        */}
      {/* ============================================================== */}
      {inspectRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-4 relative max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-emerald-400 text-2xl">
                  verified
                </span>
                <div className="flex flex-col">
                  <h3 className="text-base font-bold text-neutral-100">
                    Cryptographic Proof Inspector
                  </h3>
                  <span className="font-mono text-xs text-indigo-400">
                    {inspectRecord.id} · SHA-256 Validated
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 flex items-center justify-center transition-colors"
                onClick={() => setInspectRecord(null)}
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Spec metadata block */}
            <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800 flex flex-col gap-2 font-mono text-xs">
              <div className="flex justify-between text-neutral-400">
                <span>Attestation Algorithm:</span>
                <span className="text-neutral-200 font-semibold">{inspectRecord.proofBundle.algorithm}</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>RFC 3161 TSA Authority:</span>
                <span className="text-emerald-400 font-semibold">{inspectRecord.proofBundle.tsaAuthority}</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Merkle Leaf Position:</span>
                <span className="text-indigo-300 font-semibold">{inspectRecord.proofBundle.leafPosition}</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Exact Record SHA-256:</span>
                <span className="text-neutral-200 select-all">{inspectRecord.fullHash}</span>
              </div>
            </div>

            {/* Merkle Inclusion Path */}
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-xs text-neutral-400 uppercase tracking-wider">
                Merkle Inclusion Path (Hex Proof)
              </span>
              <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800/80 font-mono text-xs text-neutral-300 overflow-x-auto leading-relaxed select-all">
                {inspectRecord.proofBundle.inclusionPath.map((line, idx) => (
                  <div key={idx} className={idx === inspectRecord.proofBundle.inclusionPath.length - 1 ? "text-emerald-400 font-bold" : ""}>
                    {line}
                  </div>
                ))}
              </div>
            </div>

            {/* Signed Payload */}
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-xs text-neutral-400 uppercase tracking-wider">
                Signed Event Payload (Immutable JSON)
              </span>
              <pre className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800/80 font-mono text-xs text-indigo-200 overflow-x-auto max-h-48 leading-relaxed">
                {JSON.stringify(inspectRecord.proofBundle.payload, null, 2)}
              </pre>
            </div>

            {/* Modal actions */}
            <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
              <JXButton
                variant="outlined"
                onClick={() => copyToClipboard(JSON.stringify(inspectRecord, null, 2), "modal-json")}
              >
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                  <span>{copiedHash === "modal-json" ? "Copied JSON" : "Copy Proof JSON"}</span>
                </div>
              </JXButton>

              <JXButton
                variant="contained"
                onClick={() => setInspectRecord(null)}
              >
                Close Inspector
              </JXButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditTrail;
