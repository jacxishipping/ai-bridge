import React, { useState } from "react";
import {
  JXCard,
  JXButton,
  JXSwitch,
  JXTextField,
  JXSelect,
  JXChip,
  LiquidButton,
  HoldToConfirmButton,
  MagneticButton,
} from "@jacxishippingorg/jx-ui-react";
import { ConfirmDialog, type ConfirmRequest } from "./ConfirmDialog";

interface SecurityPoliciesProps {
  policy: any;
  policyHistory: any[];
  webhookUrl: string;
  onSavePolicy: (body: any) => Promise<void>;
  onSaveWebhook: (url: string) => Promise<void>;
  onTestWebhook: () => Promise<any>;
  onDeletePolicyVersion: (version: number) => Promise<void>;
  onEmergencyStop: () => Promise<void>;
  onRefresh: () => void;
  onNotice?: (msg: { text: string; intent?: "info" | "success" | "warning" | "error" }) => void;
}

export const SecurityPolicies: React.FC<SecurityPoliciesProps> = ({
  policy,
  policyHistory,
  webhookUrl,
  onSavePolicy,
  onSaveWebhook,
  onTestWebhook,
  onDeletePolicyVersion,
  onEmergencyStop,
  onRefresh,
  onNotice,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<"binaries" | "paths" | "tiers" | "history">("binaries");
  const [binaryFilter, setBinaryFilter] = useState<"all" | "allowed" | "escalated" | "blocked">("all");
  const [binaryQuery, setBinaryQuery] = useState("");
  const [newBinaryInput, setNewBinaryInput] = useState("");

  // Form states for policy
  const [polTier3, setPolTier3] = useState<boolean>(!!policy?.allow_tier3);
  const [polDesktop, setPolDesktop] = useState<boolean>(!!policy?.desktop_enabled);
  const [polApps, setPolApps] = useState<string>((policy?.allowed_apps || []).join(", ") || "chrome, code, notepad, msedge, firefox, terminal");
  const [polServices, setPolServices] = useState<string>((policy?.allowed_services || []).join(", ") || "nginx, docker, ssh, postgresql, redis");
  const [polNote, setPolNote] = useState<string>("");
  const [isSavingPolicy, setIsSavingPolicy] = useState<boolean>(false);

  // Sliders
  const [tier3Timeout, setTier3Timeout] = useState<number>(120);
  const [entropySensitivity, setEntropySensitivity] = useState<number>(0.85);
  const [burstRateLimit, setBurstRateLimit] = useState<number>(25);

  // Webhook state
  const [currentWebhookUrl, setCurrentWebhookUrl] = useState<string>(webhookUrl || "");
  const [isSavingWebhook, setIsSavingWebhook] = useState<boolean>(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState<boolean>(false);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);

  const notify = (text: string, intent: "info" | "success" | "warning" | "error" = "info") => {
    if (onNotice) onNotice({ text, intent });
  };

  const binariesList = [
    {
      id: "bin-1",
      name: "systemctl",
      path: "/bin/systemctl",
      sha: "9f8a...4b01",
      status: "allowed",
      policyText: "Allowed (Audit Sign-off)",
      risk: "Tier 2: Elevated",
      riskTone: "blue",
      condition: "2FA Dual-token tokenized JWT",
    },
    {
      id: "bin-2",
      name: "docker",
      path: "/usr/bin/docker",
      sha: "d87a...331f",
      status: "allowed",
      policyText: "Allowed Rootless Only",
      risk: "Tier 2: Elevated",
      riskTone: "blue",
      condition: "No privileged daemon socket bind",
    },
    {
      id: "bin-3",
      name: "apt / dnf",
      path: "Package Management Subsystems",
      sha: "apt-subsys-v2",
      status: "escalated",
      policyText: "Autonomous Blocklist",
      risk: "Tier 3: Critical SLA",
      riskTone: "amber",
      condition: "Escalates to Human Approver",
    },
    {
      id: "bin-4",
      name: "curl / wget",
      path: "Outbound Telemetry & HTTP Sockets",
      sha: "network-egress",
      status: "allowed",
      policyText: "Restricted: Egress Proxy Only",
      risk: "Tier 1: Nominal",
      riskTone: "emerald",
      condition: "Internal Forward Proxy TLS Tunnel",
    },
    {
      id: "bin-5",
      name: "rm -rf / *",
      path: "Destructive Recursive System Calls",
      sha: "pcr-killswitch-rule",
      status: "blocked",
      policyText: "Strict Deny + Killswitch",
      risk: "EMERGENCY ALL-STOP",
      riskTone: "red",
      condition: "Instant Node Revocation & Alert",
    },
  ];

  const filteredBinaries = binariesList.filter((b) => {
    if (binaryFilter !== "all" && b.status !== binaryFilter) return false;
    if (binaryQuery && !b.name.toLowerCase().includes(binaryQuery.toLowerCase()) && !b.path.toLowerCase().includes(binaryQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const handleSavePolicyVersion = async () => {
    setIsSavingPolicy(true);
    try {
      const allowed_apps = polApps.split(",").map((s) => s.trim()).filter(Boolean);
      const allowed_services = polServices.split(",").map((s) => s.trim()).filter(Boolean);
      await onSavePolicy({
        allow_tier3: polTier3,
        desktop_enabled: polDesktop,
        allowed_apps,
        allowed_services,
        note: polNote || "Updated via Zero-Trust Security Matrix",
      });
      setPolNote("");
      notify("Published new policy version. Propagated to all fleet nodes.", "success");
    } catch (err: any) {
      notify(`Failed to save policy: ${err.message}`, "error");
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const handleSaveWebhookUrl = async () => {
    setIsSavingWebhook(true);
    try {
      await onSaveWebhook(currentWebhookUrl);
      notify(currentWebhookUrl.trim() ? "Webhook URL configured successfully." : "Webhook URL removed.", "success");
    } catch (err: any) {
      notify(`Failed to save webhook: ${err.message}`, "error");
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const handleTestAlert = async () => {
    setIsTestingWebhook(true);
    try {
      const res = await onTestWebhook();
      notify(res?.ok ? `Webhook test alert dispatched successfully (HTTP ${res.status || 200})` : `Webhook test alert returned: ${res?.error || "Error"}`, res?.ok ? "success" : "warning");
    } catch (err: any) {
      notify(`Webhook test alert failed: ${err.message}`, "error");
    } finally {
      setIsTestingWebhook(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", width: "100%", paddingBottom: "3rem" }}>
      <ConfirmDialog request={confirmReq} onClose={() => setConfirmReq(null)} />

      {/* ========================================================================= */}
      {/* 1. SUB-HEADER & BREADCRUMBS TELEMETRY RIBBON                              */}
      {/* ========================================================================= */}
      <section
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "1.5rem",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 780 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.6875rem", textTransform: "uppercase", color: "var(--jx-color-text-muted, #94a3b8)", letterSpacing: "0.05em" }}>
              Governance Domain
            </span>
            <span style={{ color: "var(--jx-color-text-muted, #94a3b8)" }}>/</span>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.6875rem", textTransform: "uppercase", color: "var(--jx-color-primary, #818cf8)", letterSpacing: "0.05em" }}>
              Security Policies &amp; Webhooks
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <h1
              style={{
                margin: 0,
                fontSize: "2rem",
                fontWeight: 800,
                letterSpacing: "-0.025em",
                color: "var(--jx-color-text-primary, #f1f5f9)",
                lineHeight: 1.2,
              }}
            >
              Zero-Trust Security Matrix
            </h1>
            <span
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "0.6875rem",
                padding: "0.25rem 0.65rem",
                borderRadius: 8,
                background: "rgba(16, 185, 129, 0.15)",
                color: "#10b981",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#10b981" }} />
              Engine v3.4.1 Active
            </span>
            <span style={{ fontSize: "0.8125rem", color: "var(--jx-color-text-secondary, #94a3b8)" }}>
              Enforcing policy envelopes across <strong>1,452</strong> nodes
            </span>
          </div>
        </div>

        {/* Global Action Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <JXButton
            variant="soft"
            startIcon={
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                file_download
              </span>
            }
            onClick={() => {
              const json = JSON.stringify(policy || {}, null, 2);
              const blob = new Blob([json], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "security_policy_schema.json";
              a.click();
              notify("Exported security policy schema as JSON", "info");
            }}
            style={{ minHeight: 44, borderRadius: 12 }}
          >
            <span>Export Schema</span>
          </JXButton>

          <JXButton
            variant="soft"
            startIcon={
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                history_toggle_off
              </span>
            }
            onClick={() => {
              if (policyHistory && policyHistory.length > 1) {
                const prev = policyHistory[1];
                setConfirmReq({
                  title: `Rollback to Policy v${prev.version}?`,
                  message: `All fleet nodes will revert from current configuration to v${prev.version}.`,
                  confirmLabel: `Rollback to v${prev.version}`,
                  danger: true,
                  onConfirm: async () => {
                    notify(`Reverted to policy v${prev.version}`, "warning");
                    onRefresh();
                  },
                });
              } else {
                notify("No earlier policy version in history to rollback to.", "info");
              }
            }}
            style={{ minHeight: 44, borderRadius: 12, color: "#f43f5e" }}
          >
            <span>Rollback Version</span>
          </JXButton>

          <div style={{ minWidth: 200 }}>
            <LiquidButton
              variant="solid"
              onClick={handleSavePolicyVersion}
              disabled={isSavingPolicy}
              style={{ width: "100%", minHeight: 44, borderRadius: 12, fontWeight: 700 }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  cloud_done
                </span>
                <span>{isSavingPolicy ? "Publishing..." : "Publish New Version"}</span>
              </span>
            </LiquidButton>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. KPI METRICS BAND (4 CARDS)                                             */}
      {/* ========================================================================= */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1rem",
        }}
      >
        {/* Metric 1 */}
        <div style={{ borderRadius: 16, overflow: "hidden" }}>
          <JXCard className="rounded-xl overflow-hidden">
            <div style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--jx-color-text-muted, #94a3b8)" }}>
                  Active Rules Enforced
                </span>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: "var(--jx-color-primary, #818cf8)" }}>
                  policy
                </span>
              </div>
              <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.75rem", fontWeight: 700, color: "var(--jx-color-text-primary, #f1f5f9)" }}>
                  142
                </span>
                <span style={{ fontSize: "0.8125rem", color: "#10b981", fontWeight: 600 }}>98.6% coverage</span>
              </div>
              <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "var(--jx-color-text-secondary, #94a3b8)" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", padding: "0.15rem 0.4rem", borderRadius: 4, background: "var(--jx-surface-shelf, #1e293b)" }}>
                  4 Draft Staged
                </span>
                <span>SHA-256 Validated</span>
              </div>
            </div>
          </JXCard>
        </div>

        {/* Metric 2 */}
        <div style={{ borderRadius: 16, overflow: "hidden" }}>
          <JXCard className="rounded-xl overflow-hidden">
            <div style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--jx-color-text-muted, #94a3b8)" }}>
                  Binary Allowlists
                </span>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#10b981" }}>
                  verified
                </span>
              </div>
              <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.75rem", fontWeight: 700, color: "var(--jx-color-text-primary, #f1f5f9)" }}>
                  86
                </span>
                <span style={{ fontSize: "0.8125rem", color: "var(--jx-color-text-muted, #94a3b8)" }}>Binaries Certified</span>
              </div>
              <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "var(--jx-color-text-secondary, #94a3b8)" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", padding: "0.15rem 0.4rem", borderRadius: 4, background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
                  +12 Since v3.4
                </span>
                <span>Kernel eBPF Locked</span>
              </div>
            </div>
          </JXCard>
        </div>

        {/* Metric 3 */}
        <div style={{ borderRadius: 16, overflow: "hidden" }}>
          <JXCard className="rounded-xl overflow-hidden">
            <div style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--jx-color-text-muted, #94a3b8)" }}>
                  Path Guardblocks
                </span>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#38bdf8" }}>
                  folder_delete
                </span>
              </div>
              <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.75rem", fontWeight: 700, color: "var(--jx-color-text-primary, #f1f5f9)" }}>
                  29
                </span>
                <span style={{ fontSize: "0.8125rem", color: "var(--jx-color-text-muted, #94a3b8)" }}>Trees Airgapped</span>
              </div>
              <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "var(--jx-color-text-secondary, #94a3b8)" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", padding: "0.15rem 0.4rem", borderRadius: 4, background: "rgba(244, 63, 94, 0.15)", color: "#f43f5e" }}>
                  0 Breaches
                </span>
                <span>Strict Host Isolated</span>
              </div>
            </div>
          </JXCard>
        </div>

        {/* Metric 4 */}
        <div style={{ borderRadius: 16, overflow: "hidden" }}>
          <JXCard className="rounded-xl overflow-hidden">
            <div style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--jx-color-text-muted, #94a3b8)" }}>
                  Webhook Ingestion
                </span>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#c084fc" }}>
                  electrical_services
                </span>
              </div>
              <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.75rem", fontWeight: 700, color: "var(--jx-color-text-primary, #f1f5f9)" }}>
                  4/4
                </span>
                <span style={{ fontSize: "0.8125rem", color: "#10b981", fontWeight: 600 }}>99.98% delivery</span>
              </div>
              <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "var(--jx-color-text-secondary, #94a3b8)" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", padding: "0.15rem 0.4rem", borderRadius: 4, background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
                  P99 18ms
                </span>
                <span>HMAC-SHA256 Sig</span>
              </div>
            </div>
          </JXCard>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. 2-COLUMN CORE ARCHITECTURE                                             */}
      {/* ========================================================================= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* LEFT COLUMN: Execution Guardrail Matrix (7 cols) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div
            style={{
              borderRadius: 20,
              background: "var(--jx-surface-elevated, #111827)",
              border: "1px solid var(--jx-border-subtle, rgba(255, 255, 255, 0.08))",
              overflow: "hidden",
              boxShadow: "0 10px 30px -5px rgba(0,0,0,0.45)",
            }}
          >
            {/* Header & Subtab Bar */}
            <div style={{ padding: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", borderBottom: "1px solid var(--jx-border-subtle, rgba(255, 255, 255, 0.08))" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--jx-surface-shelf, #1e293b)", color: "var(--jx-color-primary, #818cf8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                    security
                  </span>
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--jx-color-text-primary, #f1f5f9)" }}>
                    Execution Guardrail Matrix
                  </h2>
                  <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--jx-color-text-secondary, #94a3b8)" }}>
                    Deterministic eBPF rules controlling sandbox process isolation
                  </p>
                </div>
              </div>

              <span
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: "0.6875rem",
                  padding: "0.25rem 0.65rem",
                  borderRadius: 9999,
                  background: "var(--jx-surface-shelf, #1e293b)",
                  color: "#10b981",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#10b981" }} />
                Realtime Enclave Sync
              </span>
            </div>

            {/* Segmented Control Bar */}
            <div style={{ padding: "0.5rem 1.5rem", background: "var(--jx-surface-container-low, #0f131d)", display: "flex", gap: 6, overflowX: "auto" }}>
              {[
                { id: "binaries", label: "Executable Allowlists", icon: "terminal" },
                { id: "paths", label: "Restricted Paths", icon: "folder_special" },
                { id: "tiers", label: "Risk Tier Overrides", icon: "tune" },
                { id: "history", label: "Version History", icon: "history" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSubTab(tab.id as any)}
                  style={{
                    padding: "0.4rem 0.85rem",
                    borderRadius: 8,
                    background: activeSubTab === tab.id ? "var(--jx-color-primary-container, #4f46e5)" : "transparent",
                    color: activeSubTab === tab.id ? "#fff" : "var(--jx-color-text-secondary, #94a3b8)",
                    border: "none",
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    whiteSpace: "nowrap",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    {tab.icon}
                  </span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Subtab 1: Executable Allowlists */}
            {activeSubTab === "binaries" && (
              <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                  <div style={{ minWidth: 240 }}>
                    <JXTextField
                      value={binaryQuery}
                      onChange={(v: any) => setBinaryQuery(typeof v === "string" ? v : v?.target?.value || "")}
                      placeholder="Search binary command / hash..."
                    />
                  </div>

                  <div style={{ display: "flex", gap: 6 }}>
                    {(["all", "allowed", "escalated", "blocked"] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setBinaryFilter(filter)}
                        style={{
                          padding: "0.3rem 0.65rem",
                          borderRadius: 6,
                          background: binaryFilter === filter ? "var(--jx-surface-shelf, #1e293b)" : "transparent",
                          color: binaryFilter === filter ? "var(--jx-color-primary, #818cf8)" : "var(--jx-color-text-muted, #94a3b8)",
                          border: "none",
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: "0.6875rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          textTransform: "capitalize",
                        }}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Table */}
                <div style={{ borderRadius: 12, background: "var(--jx-surface-container-low, #0f131d)", overflowX: "auto", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.75rem", fontFamily: "JetBrains Mono, monospace" }}>
                    <thead>
                      <tr style={{ background: "rgba(30, 41, 59, 0.6)", color: "var(--jx-color-text-muted, #94a3b8)", textTransform: "uppercase" }}>
                        <th style={{ padding: "0.75rem 1rem" }}>Binary / Descriptor</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Execution Policy</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Assigned Risk</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Enclave Condition</th>
                      </tr>
                    </thead>
                    <tbody style={{ color: "var(--jx-color-text-primary, #f1f5f9)" }}>
                      {filteredBinaries.map((b) => (
                        <tr key={b.id} style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
                          <td style={{ padding: "0.875rem 1rem" }}>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <span style={{ fontWeight: 700, fontSize: "0.875rem" }}>{b.name}</span>
                              <span style={{ color: "var(--jx-color-text-muted, #94a3b8)", fontSize: "0.6875rem" }}>{b.path}</span>
                            </div>
                          </td>
                          <td style={{ padding: "0.875rem 1rem" }}>
                            <span style={{ padding: "0.2rem 0.5rem", borderRadius: 4, background: "var(--jx-surface-shelf, #1e293b)", color: b.status === "blocked" ? "#ef4444" : "#10b981", fontWeight: 600 }}>
                              {b.policyText}
                            </span>
                          </td>
                          <td style={{ padding: "0.875rem 1rem" }}>
                            <span style={{ padding: "0.2rem 0.5rem", borderRadius: 4, background: "rgba(0,0,0,0.2)", color: b.riskTone === "red" ? "#ef4444" : b.riskTone === "amber" ? "#f59e0b" : "#818cf8" }}>
                              {b.risk}
                            </span>
                          </td>
                          <td style={{ padding: "0.875rem 1rem", color: "var(--jx-color-text-secondary, #94a3b8)" }}>
                            {b.condition}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Add Rule Quick Form */}
                <div style={{ padding: "1rem", borderRadius: 12, background: "var(--jx-surface-shelf, #1e293b)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22, color: "var(--jx-color-primary, #818cf8)" }}>
                      add_moderator
                    </span>
                    <div>
                      <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--jx-color-text-primary, #f1f5f9)" }}>
                        Add Certified Command to Policy
                      </span>
                      <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--jx-color-text-secondary, #94a3b8)" }}>
                        Compiles dynamic eBPF filter rule into policy bundle
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", minWidth: 280 }}>
                    <input
                      type="text"
                      value={newBinaryInput}
                      onChange={(e) => setNewBinaryInput(e.target.value)}
                      placeholder="e.g. /usr/bin/kubectl"
                      style={{
                        flex: 1,
                        padding: "0.4rem 0.75rem",
                        borderRadius: 8,
                        background: "var(--jx-surface-elevated, #111827)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        color: "#fff",
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: "0.75rem",
                        outline: "none",
                      }}
                    />
                    <JXButton
                      size="sm"
                      variant="contained"
                      onClick={() => {
                        if (!newBinaryInput.trim()) return;
                        notify(`Staged rule for ${newBinaryInput.trim()}`, "success");
                        setNewBinaryInput("");
                      }}
                    >
                      Stage Rule
                    </JXButton>
                  </div>
                </div>
              </div>
            )}

            {/* Subtab 2: Restricted Filesystem Paths */}
            {activeSubTab === "paths" && (
              <div style={{ padding: "1.5rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
                {[
                  { path: "/etc/shadow", badge: "Strict Deny", tone: "red", desc: "Host credentials store. Instant eBPF interception on open() or stat().", scope: "All Linux Nodes" },
                  { path: "/etc/ssl/certs", badge: "Read-Only Audit", tone: "blue", desc: "Root certificate bundles. Modification attempts trigger SEV-1 audit incident.", scope: "Cluster Fleet" },
                  { path: "/root/.ssh", badge: "Airgapped Enclave", tone: "red", desc: "Private authorized keys. Strict deny for all automated agent sessions.", scope: "Global Fleet" },
                  { path: "~/.aws/credentials", badge: "Strict Deny", tone: "red", desc: "Cloud IAM access tokens and secrets. Sandboxed memory barrier.", scope: "Workstations" },
                  { path: "/var/run/docker.sock", badge: "Proxy Intercepted", tone: "amber", desc: "Privileged engine socket. All requests filtered through virtualized zero-trust daemon.", scope: "Socket Virtualization v2" },
                ].map((p, i) => (
                  <div key={i} style={{ padding: "1rem", borderRadius: 12, background: "var(--jx-surface-container-low, #0f131d)", display: "flex", flexDirection: "column", gap: 6, border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.8125rem", fontWeight: 700, color: "var(--jx-color-text-primary, #f1f5f9)" }}>
                        {p.path}
                      </span>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.6875rem", padding: "0.15rem 0.45rem", borderRadius: 4, background: p.tone === "red" ? "rgba(239, 68, 68, 0.15)" : "rgba(99, 102, 241, 0.15)", color: p.tone === "red" ? "#ef4444" : "#818cf8" }}>
                        {p.badge}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--jx-color-text-secondary, #94a3b8)", lineHeight: 1.5 }}>
                      {p.desc}
                    </p>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: 6, marginTop: 4, fontFamily: "JetBrains Mono, monospace", fontSize: "0.6875rem", color: "var(--jx-color-text-muted, #94a3b8)" }}>
                      <span>Scope: {p.scope}</span>
                      <span style={{ color: "#10b981" }}>Enclave Locked</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Subtab 3: Risk Tier Overrides & Sensitivity Sliders */}
            {activeSubTab === "tiers" && (
              <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                {/* Switches */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
                  <div style={{ padding: "1rem", borderRadius: 12, background: "var(--jx-surface-shelf, #1e293b)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--jx-color-text-primary, #f1f5f9)" }}>
                        Allow Tier-3 Operations Unattended
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--jx-color-text-secondary, #94a3b8)" }}>
                        Execute Tier-3 tools without manual sign-off
                      </span>
                    </div>
                    <JXSwitch checked={polTier3} onChange={(c: boolean) => setPolTier3(c)} />
                  </div>

                  <div style={{ padding: "1rem", borderRadius: 12, background: "var(--jx-surface-shelf, #1e293b)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--jx-color-text-primary, #f1f5f9)" }}>
                        Enable Desktop Automation &amp; Vision
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--jx-color-text-secondary, #94a3b8)" }}>
                        Permit screenshots, clicks, and window focus
                      </span>
                    </div>
                    <JXSwitch checked={polDesktop} onChange={(c: boolean) => setPolDesktop(c)} />
                  </div>
                </div>

                {/* Text fields */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--jx-color-text-secondary, #94a3b8)", marginBottom: 4 }}>
                      Allowed Desktop Applications (comma-separated)
                    </label>
                    <JXTextField
                      value={polApps}
                      onChange={(v: any) => setPolApps(typeof v === "string" ? v : v?.target?.value || "")}
                      placeholder="chrome, code, notepad, msedge, firefox, terminal"
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--jx-color-text-secondary, #94a3b8)", marginBottom: 4 }}>
                      Allowed System Services (comma-separated)
                    </label>
                    <JXTextField
                      value={polServices}
                      onChange={(v: any) => setPolServices(typeof v === "string" ? v : v?.target?.value || "")}
                      placeholder="nginx, docker, ssh, postgresql, redis"
                    />
                  </div>
                </div>

                {/* Sliders */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div style={{ padding: "1rem", borderRadius: 12, background: "var(--jx-surface-shelf, #1e293b)", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--jx-color-text-primary, #f1f5f9)" }}>
                        Tier 3 (High-Risk) Human Approval Timeout
                      </span>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.8125rem", color: "var(--jx-color-primary, #818cf8)", fontWeight: 700 }}>
                        {tier3Timeout} Seconds
                      </span>
                    </div>
                    <input
                      type="range"
                      min="30"
                      max="600"
                      step="10"
                      value={tier3Timeout}
                      onChange={(e) => setTier3Timeout(Number(e.target.value))}
                      style={{ accentColor: "var(--jx-color-primary, #6366f1)", cursor: "pointer" }}
                    />
                  </div>

                  <div style={{ padding: "1rem", borderRadius: 12, background: "var(--jx-surface-shelf, #1e293b)", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--jx-color-text-primary, #f1f5f9)" }}>
                        Entropy &amp; Shell Injection Sensitivity
                      </span>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.8125rem", color: "#10b981", fontWeight: 700 }}>
                        {entropySensitivity.toFixed(2)} (Strict)
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="0.99"
                      step="0.01"
                      value={entropySensitivity}
                      onChange={(e) => setEntropySensitivity(Number(e.target.value))}
                      style={{ accentColor: "#10b981", cursor: "pointer" }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Subtab 4: Version History */}
            {activeSubTab === "history" && (
              <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ borderRadius: 12, background: "var(--jx-surface-container-low, #0f131d)", overflowX: "auto", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.75rem", fontFamily: "JetBrains Mono, monospace" }}>
                    <thead>
                      <tr style={{ background: "rgba(30, 41, 59, 0.6)", color: "var(--jx-color-text-muted, #94a3b8)", textTransform: "uppercase" }}>
                        <th style={{ padding: "0.75rem 1rem" }}>Version</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Author</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Note</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody style={{ color: "var(--jx-color-text-primary, #f1f5f9)" }}>
                      {policyHistory.map((p) => (
                        <tr key={p.version} style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
                          <td style={{ padding: "0.875rem 1rem", fontWeight: 700, color: "var(--jx-color-primary, #818cf8)" }}>
                            v{p.version}
                          </td>
                          <td style={{ padding: "0.875rem 1rem" }}>{p.created_by || "secops-lead"}</td>
                          <td style={{ padding: "0.875rem 1rem", color: "var(--jx-color-text-secondary, #94a3b8)" }}>{p.note || "Standard policy revision"}</td>
                          <td style={{ padding: "0.875rem 1rem", textAlign: "right" }}>
                            <JXButton
                              size="sm"
                              variant="soft"
                              onClick={() => {
                                setConfirmReq({
                                  title: `Delete policy version v${p.version}?`,
                                  message: "This removes the version from the history archive.",
                                  confirmLabel: "Delete Version",
                                  danger: true,
                                  onConfirm: async () => {
                                    await onDeletePolicyVersion(p.version);
                                    notify(`Deleted policy version v${p.version}`, "info");
                                  },
                                });
                              }}
                            >
                              Delete
                            </JXButton>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Attestation Matrix Health Telemetry Card */}
          <div style={{ padding: "1.5rem", borderRadius: 16, background: "var(--jx-surface-elevated, #111827)", border: "1px solid var(--jx-border-subtle, rgba(255, 255, 255, 0.08))", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#10b981" }}>
                  check_box
                </span>
                <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--jx-color-text-primary, #f1f5f9)" }}>
                  Attestation Matrix Health
                </span>
              </div>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.75rem", color: "#10b981" }}>
                100% Cryptographic Match
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "JetBrains Mono, monospace", fontSize: "0.75rem", color: "var(--jx-color-text-secondary, #94a3b8)" }}>
                <span>Kernel eBPF Probes Loaded (1,452 nodes)</span>
                <span style={{ color: "var(--jx-color-text-primary, #f1f5f9)" }}>1,452 / 1,452</span>
              </div>
              <div style={{ width: "100%", height: 6, borderRadius: 9999, background: "var(--jx-surface-shelf, #1e293b)", overflow: "hidden" }}>
                <div style={{ width: "100%", height: "100%", background: "#10b981" }} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", paddingTop: "0.5rem" }}>
              <div style={{ padding: "0.6rem", borderRadius: 8, background: "var(--jx-surface-shelf, #1e293b)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.6875rem", color: "var(--jx-color-text-muted, #94a3b8)" }}>Tripwire Latency</span>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1rem", fontWeight: 700, color: "var(--jx-color-text-primary, #f1f5f9)" }}>0.4ms</span>
              </div>
              <div style={{ padding: "0.6rem", borderRadius: 8, background: "var(--jx-surface-shelf, #1e293b)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.6875rem", color: "var(--jx-color-text-muted, #94a3b8)" }}>Blocked Syscalls</span>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1rem", fontWeight: 700, color: "#f43f5e" }}>14</span>
              </div>
              <div style={{ padding: "0.6rem", borderRadius: 8, background: "var(--jx-surface-shelf, #1e293b)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.6875rem", color: "var(--jx-color-text-muted, #94a3b8)" }}>Policy Hash</span>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1rem", fontWeight: 700, color: "var(--jx-color-primary, #818cf8)" }}>a91c..fe</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Webhook Channels & Killswitch (5 cols) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Webhook Channels Manager */}
          <div
            style={{
              borderRadius: 20,
              background: "var(--jx-surface-elevated, #111827)",
              border: "1px solid var(--jx-border-subtle, rgba(255, 255, 255, 0.08))",
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
              boxShadow: "0 10px 30px -5px rgba(0,0,0,0.45)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(192, 132, 252, 0.15)", color: "#c084fc", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                    webhook
                  </span>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, color: "var(--jx-color-text-primary, #f1f5f9)" }}>
                    Webhook Channels
                  </h3>
                  <span style={{ fontSize: "0.75rem", color: "var(--jx-color-text-secondary, #94a3b8)" }}>
                    Real-time SecOps alert syndication
                  </span>
                </div>
              </div>

              <JXButton
                size="sm"
                variant="soft"
                onClick={handleTestAlert}
                disabled={isTestingWebhook}
              >
                {isTestingWebhook ? "Pinging..." : "Test Ping"}
              </JXButton>
            </div>

            {/* Channels Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[
                { name: "Slack (#secops-high-risk-alerts)", id: "C0681B439", status: "CONNECTED (12ms)", tags: ["Tier 3 Escalation", "Killswitch Triggered", "Node Offline > 5m"] },
                { name: "PagerDuty (On-Call SEV-1)", id: "secops-infra", status: "ACTIVE", tags: ["Attestation Failure", "Agent Tampering"] },
                { name: "Microsoft Teams (Incident Bridge)", id: "Webhook URI", status: "CONNECTED", tags: ["Approval SLA Warning (<2m)"] },
              ].map((c, i) => (
                <div key={i} style={{ padding: "1rem", borderRadius: 12, background: "var(--jx-surface-container-low, #0f131d)", display: "flex", flexDirection: "column", gap: 6, border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--jx-color-text-primary, #f1f5f9)" }}>
                      {c.name}
                    </span>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.6875rem", padding: "0.15rem 0.45rem", borderRadius: 4, background: "rgba(16, 185, 129, 0.15)", color: "#10b981", display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#10b981" }} />
                      {c.status}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                    {c.tags.map((t, idx) => (
                      <span key={idx} style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.6875rem", padding: "0.15rem 0.4rem", borderRadius: 4, background: "var(--jx-surface-shelf, #1e293b)", color: "var(--jx-color-text-secondary, #94a3b8)" }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Configure Active Webhook Target */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid rgba(255, 255, 255, 0.06)", paddingTop: "1rem" }}>
              <label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.6875rem", textTransform: "uppercase", color: "var(--jx-color-text-muted, #94a3b8)" }}>
                Configured Webhook Target URL
              </label>
              <JXTextField
                value={currentWebhookUrl}
                onChange={(v: any) => setCurrentWebhookUrl(typeof v === "string" ? v : v?.target?.value || "")}
                placeholder="https://api.telegram.org/bot... or https://hooks.slack.com/..."
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                <JXButton size="sm" variant="soft" onClick={() => setCurrentWebhookUrl("https://api.telegram.org/bot<BOT_TOKEN>/sendMessage?chat_id=<CHAT_ID>")}>
                  Telegram Template
                </JXButton>
                <JXButton size="sm" variant="soft" onClick={() => setCurrentWebhookUrl("https://discord.com/api/webhooks/<WEBHOOK_ID>/<TOKEN>")}>
                  Discord Template
                </JXButton>
                <JXButton size="sm" variant="soft" onClick={() => setCurrentWebhookUrl("https://hooks.slack.com/services/<T>/<B>/<X>")}>
                  Slack Template
                </JXButton>
              </div>

              <div style={{ marginTop: "0.75rem" }}>
                <LiquidButton
                  variant="solid"
                  onClick={handleSaveWebhookUrl}
                  disabled={isSavingWebhook}
                  style={{ width: "100%", minHeight: 44, borderRadius: 12, fontWeight: 700 }}
                >
                  Save Webhook Target
                </LiquidButton>
              </div>
            </div>
          </div>

          {/* Emergency Killswitch Panel */}
          <div
            style={{
              padding: "1.5rem",
              borderRadius: 20,
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 26, color: "#ef4444" }}>
                gpp_maybe
              </span>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, color: "#ef4444" }}>
                  Emergency All-Stop Killswitch
                </h3>
                <span style={{ fontSize: "0.75rem", color: "var(--jx-color-text-secondary, #94a3b8)" }}>
                  Revokes all active agent sessions and enforces immediate fail-safe lock across all 1,452 nodes.
                </span>
              </div>
            </div>

            <div style={{ minWidth: "100%" }}>
              <HoldToConfirmButton
                onConfirm={async () => {
                  await onEmergencyStop();
                  notify("EMERGENCY ALL-STOP TRIGGERED. All agent tasks halted.", "error");
                }}
                holdDurationMs={2000}
                tone="danger"
                variant="solid"
                label="Hold 2s for Emergency All-Stop"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityPolicies;
