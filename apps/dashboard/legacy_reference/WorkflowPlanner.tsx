import React, { useState, useEffect } from "react";
import { api } from "./api";
import {
  JXButton,
  JXSelect,
  JXTextField,
  JXSwitch,
  JXCard,
} from "@jacxishippingorg/jx-ui-react";

interface WorkflowStep {
  name: string;
  action: string;
  args: Record<string, any>;
  verify?: {
    text: string;
    timeout_seconds?: number;
  };
  retries?: number;
}

interface StepExecutionResult {
  index: number;
  name: string;
  action: string;
  args: Record<string, any>;
  status: "pending" | "running" | "completed" | "failed";
  duration_seconds: number;
  result?: any;
  verification?: any;
  error?: string;
}

interface WorkflowRun {
  id: string;
  name: string;
  device_id?: string;
  status: string;
  current_step: number;
  total_steps: number;
  steps: WorkflowStep[];
  results: StepExecutionResult[];
  error?: string;
  created_at: number;
  completed_at?: number;
}

interface WorkflowPlannerProps {
  devices: any[];
  onNotice?: (notice: { intent: "success" | "error" | "info"; text: string }) => void;
}

export const WorkflowPlanner: React.FC<WorkflowPlannerProps> = ({ devices, onNotice }) => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [workflowHistory, setWorkflowHistory] = useState<WorkflowRun[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [directoryFilter, setDirectoryFilter] = useState<"all" | "active" | "scheduled" | "drafts">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [inspectedStepIndex, setInspectedStepIndex] = useState<number>(1);

  // Form State
  const [workflowName, setWorkflowName] = useState("Fleet-wide Zero-Trust Enclave Attestation");
  const [selectedDevice, setSelectedDevice] = useState<string>("auto");
  const [stopOnFailure, setStopOnFailure] = useState(true);
  const [maxRetries, setMaxRetries] = useState(1);
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      name: "Baseline Display Capture",
      action: "take_screenshot",
      args: { quality: 85, display_index: 0 },
    },
    {
      name: "Vision AI OCR & Assertion",
      action: "wait_for_text",
      args: { text: "TPM 2.0 PCR-7 Status: ACTIVE", timeout_seconds: 15 },
    },
    {
      name: "Cryptographic Peer Verification",
      action: "run_shell",
      args: { command: "ai-bridge-enclave --verify-quorum --strict" },
    },
    {
      name: "Immutable Audit Ledger Commit",
      action: "run_shell",
      args: { command: "ai-bridge-ledger commit --epoch latest" },
    },
  ]);

  useEffect(() => {
    loadTemplatesAndHistory();
  }, []);

  async function loadTemplatesAndHistory() {
    try {
      const [tRes, wRes] = await Promise.all([
        api.workflowTemplates().catch(() => ({ templates: [] })),
        api.workflows().catch(() => []),
      ]);
      if (tRes && tRes.templates) setTemplates(tRes.templates);
      if (Array.isArray(wRes)) setWorkflowHistory(wRes);
    } catch (err: any) {
      if (onNotice) onNotice({ intent: "error", text: `Failed loading workflow data: ${err.message}` });
    }
  }

  function handleSelectTemplate(tpl: any) {
    setWorkflowName(tpl.name.replace(/^[^\w\s]+\s*/, ""));
    setSteps(tpl.steps || []);
    if (onNotice) onNotice({ intent: "info", text: `Loaded template: ${tpl.name}` });
  }

  function handleAddStep() {
    setSteps([
      ...steps,
      {
        name: `Step ${steps.length + 1}`,
        action: "click_text",
        args: { text: "Submit" },
      },
    ]);
  }

  function handleRemoveStep(idx: number) {
    setSteps(steps.filter((_, i) => i !== idx));
  }

  function handleMoveStep(idx: number, direction: "up" | "down") {
    if ((direction === "up" && idx === 0) || (direction === "down" && idx === steps.length - 1)) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    const updated = [...steps];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    setSteps(updated);
  }

  function handleUpdateStep(idx: number, field: keyof WorkflowStep, val: any) {
    const updated = [...steps];
    updated[idx] = { ...updated[idx], [field]: val };
    setSteps(updated);
  }

  async function handleExecuteWorkflow() {
    if (!steps.length) {
      if (onNotice) onNotice({ intent: "error", text: "Workflow must contain at least one step." });
      return;
    }
    setIsRunning(true);
    try {
      const dev = selectedDevice === "auto" ? undefined : selectedDevice;
      const res = await api.submitWorkflow({
        name: workflowName,
        device_id: dev,
        stop_on_failure: stopOnFailure,
        max_retries: maxRetries,
        steps,
      });

      if (res && res.workflow_id) {
        if (onNotice) onNotice({ intent: "success", text: `Launched workflow: ${res.workflow_id}` });
        const runObj: WorkflowRun = {
          id: res.workflow_id,
          name: workflowName,
          device_id: dev,
          status: "running",
          current_step: 0,
          total_steps: steps.length,
          steps,
          results: [],
          created_at: Math.floor(Date.now() / 1000),
        };
        setActiveWorkflow(runObj);
        pollWorkflow(res.workflow_id);
      }
    } catch (err: any) {
      if (onNotice) onNotice({ intent: "error", text: `Execution failed: ${err.message}` });
    } finally {
      setIsRunning(false);
    }
  }

  function pollWorkflow(id: string) {
    const timer = setInterval(async () => {
      try {
        const status = await api.workflowDetail(id);
        if (status) {
          setActiveWorkflow((prev) => (prev ? { ...prev, ...status } : status));
          if (status.status === "completed" || status.status === "failed") {
            clearInterval(timer);
            loadTemplatesAndHistory();
          }
        }
      } catch {
        clearInterval(timer);
      }
    }, 1500);
  }

  async function handleCancelActive() {
    if (!activeWorkflow) return;
    try {
      await api.cancelWorkflow(activeWorkflow.id);
      if (onNotice) onNotice({ intent: "info", text: `Cancelled workflow ${activeWorkflow.id}` });
      setActiveWorkflow((prev) => (prev ? { ...prev, status: "cancelled" } : null));
    } catch (err: any) {
      if (onNotice) onNotice({ intent: "error", text: `Cancel failed: ${err.message}` });
    }
  }

  const exportWorkflowJson = () => {
    const payload = {
      name: workflowName,
      target_device: selectedDevice,
      stop_on_failure: stopOnFailure,
      max_retries: maxRetries,
      steps,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workflow-${workflowName.toLowerCase().replace(/\s+/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (onNotice) onNotice({ intent: "success", text: "Exported workflow definition as JSON." });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 1. Context Breadcrumb & Telemetry Top Ribbon */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            <span style={{ color: "var(--jx-text-secondary)" }}>Operations Domain</span>
            <span style={{ color: "var(--jx-border-subtle)" }}>/</span>
            <span style={{ color: "var(--jx-primary)", fontWeight: 600 }}>Autonomous Workflows</span>
            <span style={{ color: "var(--jx-border-subtle)" }}>/</span>
            <span style={{ color: "var(--jx-text-secondary)" }}>Daily Health &amp; Enclave Verification</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 12px",
              borderRadius: 9999,
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              color: "#10b981",
              fontSize: 10,
              fontFamily: "JetBrains Mono, monospace",
              fontWeight: 700
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} className="f2-pulse-dot" />
              ORCHESTRATOR POOL: SYNCHRONIZED
            </span>
            <span style={{
              padding: "4px 10px",
              borderRadius: 8,
              background: "var(--jx-surface-sunken)",
              border: "1px solid var(--jx-border-subtle)",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              color: "var(--jx-text-secondary)"
            }}>
              EPOCH: 171342.92
            </span>
          </div>
        </div>

        {/* Title & Top Action Controls Bar */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--jx-text-primary)" }}>
                Autonomous Workflows &amp; Multi-Turn Plans
              </h1>
              <span style={{
                padding: "3px 10px",
                borderRadius: 9999,
                background: "rgba(99, 102, 241, 0.15)",
                color: "var(--jx-primary)",
                fontSize: 10,
                fontFamily: "JetBrains Mono, monospace",
                fontWeight: 600
              }}>
                v2.4.0 High-Integrity Engine
              </span>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--jx-text-secondary)" }}>
              Deterministic DAG orchestrations, multi-turn AI reasoning, and cryptographic enclave attestation across all enrolled nodes.
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <JXButton
              size="sm"
              variant="soft"
              onClick={exportWorkflowJson}
              style={{ fontSize: 11 }}
            >
              Export JSON
            </JXButton>
            <JXButton
              size="sm"
              variant="soft"
              onClick={() => {
                if (templates[0]) handleSelectTemplate(templates[0]);
              }}
              style={{ fontSize: 11 }}
            >
              Templates
            </JXButton>
            <JXButton
              size="sm"
              variant="contained"
              color="primary"
              onClick={handleAddStep}
              style={{ fontSize: 11 }}
            >
              ➕ Create New Workflow
            </JXButton>
          </div>
        </div>

        {/* Metrics Ribbon Bento Grid (4 Cards) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
          <div style={{ padding: 14, borderRadius: 12, background: "var(--jx-surface-sunken)", border: "1px solid var(--jx-border-subtle)", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)", textTransform: "uppercase" }}>
              <span>Active Workflows</span>
              <span>🌳</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: "var(--jx-text-primary)" }}>14</span>
              <span style={{ fontSize: 11, color: "var(--jx-text-secondary)" }}>/ 16 registered</span>
            </div>
            <div style={{ width: "100%", height: 4, borderRadius: 9999, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 4 }}>
              <div style={{ width: "87.5%", height: "100%", background: "var(--jx-primary)", borderRadius: 9999 }} />
            </div>
          </div>

          <div style={{ padding: 14, borderRadius: 12, background: "var(--jx-surface-sunken)", border: "1px solid var(--jx-border-subtle)", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)", textTransform: "uppercase" }}>
              <span>Fleet Success Rate</span>
              <span>🛡️</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: "#10b981" }}>99.4%</span>
              <span style={{ fontSize: 11, color: "#10b981" }}>+0.2% vs 7d</span>
            </div>
            <div style={{ width: "100%", height: 4, borderRadius: 9999, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 4 }}>
              <div style={{ width: "99.4%", height: "100%", background: "#10b981", borderRadius: 9999 }} />
            </div>
          </div>

          <div style={{ padding: 14, borderRadius: 12, background: "var(--jx-surface-sunken)", border: "1px solid var(--jx-border-subtle)", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)", textTransform: "uppercase" }}>
              <span>Runs Today (24h)</span>
              <span>⚡</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: "var(--jx-text-primary)" }}>428</span>
              <span style={{ fontSize: 11, color: "var(--jx-text-secondary)" }}>Avg 3.8s / plan</span>
            </div>
            <div style={{ width: "100%", height: 4, borderRadius: 9999, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 4 }}>
              <div style={{ width: "68%", height: "100%", background: "#a855f7", borderRadius: 9999 }} />
            </div>
          </div>

          <div style={{ padding: 14, borderRadius: 12, background: "var(--jx-surface-sunken)", border: "1px solid var(--jx-border-subtle)", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)", textTransform: "uppercase" }}>
              <span>Pending Human Gates</span>
              <span>⚠️</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: "#f59e0b" }}>1</span>
              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" }}>Tier-3 CA Escrow</span>
            </div>
            <div style={{ width: "100%", height: 4, borderRadius: 9999, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 4 }}>
              <div style={{ width: "100%", height: "100%", background: "#f59e0b", borderRadius: 9999 }} />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Split Studio (Left 4 cols / Right 8 cols) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 20, alignItems: "start" }}>
        {/* ================= LEFT COLUMN: Directory & Pre-Saved Plans ================= */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{
            padding: 16,
            borderRadius: 14,
            background: "var(--jx-surface-sunken)",
            border: "1px solid var(--jx-border-subtle)",
            display: "flex",
            flexDirection: "column",
            gap: 12
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "var(--jx-text-primary)" }}>
                Workflow Directory
              </span>
              <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)" }}>
                14 Defined
              </span>
            </div>

            {/* Search Input */}
            <JXTextField
              value={searchQuery}
              onChange={(val: any) => setSearchQuery(typeof val === "string" ? val : val?.target?.value || "")}
              placeholder="Search plans, tools, tags…"
            />

            {/* Category Tabs */}
            <div style={{
              display: "flex",
              padding: 3,
              borderRadius: 10,
              background: "rgba(0, 0, 0, 0.2)",
              border: "1px solid var(--jx-border-subtle)"
            }}>
              {(["all", "active", "scheduled", "drafts"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setDirectoryFilter(tab)}
                  style={{
                    flex: 1,
                    padding: "4px 8px",
                    borderRadius: 8,
                    border: "none",
                    background: directoryFilter === tab ? "var(--jx-primary)" : "transparent",
                    color: directoryFilter === tab ? "#fff" : "var(--jx-text-secondary)",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "capitalize",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Workflow Plan Stack */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              {[
                {
                  id: "WF-9841",
                  name: "Fleet-wide Zero-Trust Enclave Attestation",
                  desc: "Performs TPM 2.0 PCR-7 visual window detection via Claude Vision, validates token cryptographically across edge fleet.",
                  cadence: "Every 6 hours",
                  target: "#edge-enclaves (12)",
                  status: "running",
                  success: "99.8%",
                  time: "Running now • 840ms",
                },
                {
                  id: "WF-9838",
                  name: "Automated UI Regression & Visual Checkpoint",
                  desc: "Navigates internal web portal, verifies zero regressions using Set-of-Marks grounding.",
                  cadence: "Git-Push Trigger",
                  target: "#studio-mac (4)",
                  status: "succeeded",
                  success: "98.9%",
                  time: "Ran 12m ago",
                },
                {
                  id: "WF-9830",
                  name: "Incident Self-Healing: Service Auto-Recovery",
                  desc: "Monitors agent-bridge daemon; triggers restart and log dump if heartbeat exceeds 30s.",
                  cadence: "Event: watchdog.sigkill",
                  target: "#all-nodes",
                  status: "idle",
                  success: "100%",
                  time: "Last: 2d ago",
                },
              ].map((wf) => (
                <div
                  key={wf.id}
                  onClick={() => setWorkflowName(wf.name)}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: workflowName === wf.name ? "rgba(99, 102, 241, 0.1)" : "rgba(0,0,0,0.15)",
                    border: `1px solid ${workflowName === wf.name ? "var(--jx-primary)" : "var(--jx-border-subtle)"}`,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    transition: "all 0.15s ease"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 12, color: "var(--jx-text-primary)", display: "block" }}>
                        {wf.name}
                      </span>
                      <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-primary)" }}>
                        {wf.id} • Multi-Node DAG
                      </span>
                    </div>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 9999,
                      fontSize: 10,
                      fontFamily: "JetBrains Mono, monospace",
                      fontWeight: 600,
                      background: wf.status === "running" ? "rgba(99, 102, 241, 0.2)" : "rgba(16, 185, 129, 0.15)",
                      color: wf.status === "running" ? "var(--jx-primary)" : "#10b981"
                    }}>
                      {wf.status.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--jx-text-secondary)", lineHeight: 1.4 }}>
                    {wf.desc}
                  </p>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)", marginTop: 4 }}>
                    <span>{wf.target}</span>
                    <span style={{ color: "#10b981" }}>{wf.success}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Templates Drawer */}
            {templates.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--jx-border-subtle)" }}>
                <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", color: "var(--jx-text-secondary)" }}>
                  Template Library:
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => handleSelectTemplate(tpl)}
                      style={{
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: "rgba(0,0,0,0.25)",
                        border: "1px solid var(--jx-border-subtle)",
                        color: "var(--jx-text-primary)",
                        fontSize: 10.5,
                        cursor: "pointer"
                      }}
                    >
                      ✦ {tpl.name.replace(/^[^a-zA-Z0-9]+/, "").trim()}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ================= RIGHT COLUMN: Visual Pipeline DAG & Step Inspector ================= */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Visual Step Pipeline DAG Container */}
          <div style={{
            padding: 18,
            borderRadius: 14,
            background: "var(--jx-surface-sunken)",
            border: "1px solid var(--jx-border-subtle)",
            display: "flex",
            flexDirection: "column",
            gap: 14
          }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>🌀</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--jx-text-primary)" }}>
                    {workflowName}
                  </h3>
                  <div style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)", marginTop: 2 }}>
                    Trigger: Cron 0 */6 * * * · Nodes: 12 Active · Turn 3 of 4
                  </div>
                </div>
              </div>

              <span style={{
                padding: "3px 10px",
                borderRadius: 9999,
                background: "rgba(99, 102, 241, 0.2)",
                color: "var(--jx-primary)",
                fontSize: 11,
                fontFamily: "JetBrains Mono, monospace",
                fontWeight: 700
              }}>
                ● RUNNING (DAG Turn 3/4)
              </span>
            </div>

            {/* 4-Step Interactive Pipeline Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
              {[
                { idx: 0, name: "1. Baseline Capture", tool: "take_screenshot", status: "completed", duration: "420ms" },
                { idx: 1, name: "2. Vision AI OCR", tool: "wait_for_text", status: "inspecting", duration: "1.1s" },
                { idx: 2, name: "3. Cryptographic Exch.", tool: "run_shell", status: "running", duration: "840ms..." },
                { idx: 3, name: "4. Audit Ledger Commit", tool: "run_shell", status: "pending", duration: "--" },
              ].map((stepItem) => {
                const isSelected = inspectedStepIndex === stepItem.idx;
                return (
                  <div
                    key={stepItem.idx}
                    onClick={() => setInspectedStepIndex(stepItem.idx)}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      background: isSelected ? "rgba(99, 102, 241, 0.15)" : "rgba(0,0,0,0.2)",
                      border: `1px solid ${isSelected ? "var(--jx-primary)" : "var(--jx-border-subtle)"}`,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      minHeight: 88,
                      transition: "all 0.15s ease"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: stepItem.status === "completed" ? "#10b981" : stepItem.status === "running" ? "var(--jx-primary)" : "rgba(255,255,255,0.1)",
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}>
                        {stepItem.status === "completed" ? "✓" : stepItem.idx + 1}
                      </span>
                      <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)" }}>
                        {stepItem.duration}
                      </span>
                    </div>

                    <div style={{ marginTop: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--jx-text-primary)", display: "block" }}>
                        {stepItem.name}
                      </span>
                      <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {stepItem.tool}
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                      <span style={{
                        fontSize: 9,
                        fontFamily: "JetBrains Mono, monospace",
                        color: stepItem.status === "completed" ? "#10b981" : isSelected ? "var(--jx-primary)" : "var(--jx-text-secondary)",
                        fontWeight: 600,
                        textTransform: "uppercase"
                      }}>
                        {isSelected ? "Inspecting" : stepItem.status}
                      </span>
                      {isSelected && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--jx-primary)" }} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 2 Deep Inspection Sub-Panel */}
          <div style={{
            padding: 18,
            borderRadius: 14,
            background: "var(--jx-surface-sunken)",
            border: "1px solid var(--jx-border-subtle)",
            display: "flex",
            flexDirection: "column",
            gap: 14
          }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--jx-text-primary)" }}>
                  Step {inspectedStepIndex + 1} Deep Inspection: Vision AI OCR &amp; Window Assertion
                </h4>
                <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)" }}>
                  Model: Claude 3.5 Sonnet (Vision Checkpoint Gate)
                </span>
              </div>
              <span style={{
                padding: "3px 10px",
                borderRadius: 6,
                background: "rgba(16, 185, 129, 0.15)",
                color: "#10b981",
                fontSize: 10,
                fontFamily: "JetBrains Mono, monospace",
                fontWeight: 700
              }}>
                CHECKPOINT PASSED (99.8% CONFIDENCE)
              </span>
            </div>

            {/* 2-Pane Inspection Content */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              {/* Left: Visual Verification Checkpoint with Set-of-Marks Marker */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", color: "var(--jx-text-secondary)" }}>
                  Visual Verification Checkpoint
                </span>
                <div style={{
                  position: "relative",
                  width: "100%",
                  height: 180,
                  borderRadius: 10,
                  background: "#0c0d0e",
                  border: "1px solid var(--jx-border-subtle)",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  {/* Simulated Desktop Preview Screen with SOM Bounding Mark */}
                  <div style={{ width: "100%", height: "100%", padding: 12, display: "flex", flexDirection: "column", justifyContent: "space-between", background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)" }}>
                      <span>Host: srv-us-east-412</span>
                      <span style={{ color: "#10b981" }}>● TPM 2.0 PCR-7 Active</span>
                    </div>

                    <div style={{
                      position: "relative",
                      padding: 10,
                      borderRadius: 8,
                      border: "2px solid #8b5cf6",
                      background: "rgba(139, 92, 246, 0.1)"
                    }}>
                      <span style={{
                        position: "absolute",
                        top: -10,
                        left: 8,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: "#8b5cf6",
                        color: "#fff",
                        fontSize: 9,
                        fontFamily: "JetBrains Mono, monospace",
                        fontWeight: 700
                      }}>
                        SOM Mark [04]: TPM Status
                      </span>
                      <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "#10b981", fontWeight: 700 }}>
                        TPM 2.0 PCR-7 Status: ACTIVE (Strict Enclave)
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)" }}>
                      <span>Coordinates: [1420, 840, W: 310, H: 95]</span>
                      <span>3840×2160 native</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}>
                  <div style={{ padding: "6px 8px", borderRadius: 6, background: "rgba(0,0,0,0.25)" }}>
                    <span style={{ color: "var(--jx-text-secondary)", display: "block" }}>LATENCY</span>
                    <span style={{ color: "var(--jx-text-primary)", fontWeight: 700 }}>1,120 ms</span>
                  </div>
                  <div style={{ padding: "6px 8px", borderRadius: 6, background: "rgba(0,0,0,0.25)" }}>
                    <span style={{ color: "var(--jx-text-secondary)", display: "block" }}>PEAK RAM</span>
                    <span style={{ color: "var(--jx-text-primary)", fontWeight: 700 }}>42.4 MB</span>
                  </div>
                  <div style={{ padding: "6px 8px", borderRadius: 6, background: "rgba(0,0,0,0.25)" }}>
                    <span style={{ color: "var(--jx-text-secondary)", display: "block" }}>VERIFIED</span>
                    <span style={{ color: "#10b981", fontWeight: 700 }}>12 / 12 Nodes</span>
                  </div>
                </div>
              </div>

              {/* Right: AI Reasoning Trace & Parameters */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", color: "var(--jx-text-secondary)" }}>
                  AI Reasoning Trace &amp; Tool Payload
                </span>
                <div style={{
                  padding: 10,
                  borderRadius: 8,
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid var(--jx-border-subtle)",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: "var(--jx-text-secondary)"
                }}>
                  <div style={{ color: "#10b981" }}>&gt; OCR Pass: Scanning primary display buffer...</div>
                  <div style={{ color: "var(--jx-text-primary)", marginTop: 2 }}>
                    &gt; Assertion: String match <strong style={{ color: "#10b981" }}>'TPM 2.0 PCR-7 Status: ACTIVE'</strong> detected.
                  </div>
                  <div style={{ color: "var(--jx-primary)", marginTop: 2 }}>
                    &gt; Result: Confidence 99.8%. Checkpoint satisfied. Proceeding to turn 3.
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)" }}>
                    <span>INPUT PARAMETERS PAYLOAD</span>
                    <span style={{ color: "var(--jx-primary)", cursor: "pointer" }} onClick={() => navigator.clipboard?.writeText(JSON.stringify(steps[inspectedStepIndex]?.args || {}))}>
                      Copy JSON
                    </span>
                  </div>
                  <pre style={{
                    margin: 0,
                    padding: 8,
                    borderRadius: 6,
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid var(--jx-border-subtle)",
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                    maxHeight: 90,
                    overflowY: "auto",
                    color: "var(--jx-text-primary)"
                  }}>
                    {JSON.stringify(steps[inspectedStepIndex]?.args || {}, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Step Builder & Runner */}
          <div style={{
            padding: 18,
            borderRadius: 14,
            background: "var(--jx-surface-sunken)",
            border: "1px solid var(--jx-border-subtle)",
            display: "flex",
            flexDirection: "column",
            gap: 14
          }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <JXTextField
                  value={workflowName}
                  onChange={(val: any) => setWorkflowName(typeof val === "string" ? val : val?.target?.value || "")}
                  placeholder="Plan / Workflow Name"
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ minWidth: 140 }}>
                  <JXSelect
                    value={selectedDevice}
                    onChange={(val: any) => setSelectedDevice(val)}
                    options={[
                      { id: "auto", label: "Auto (First Online)" },
                      ...devices.map((d) => ({ id: d.id, label: `${d.name} (${d.status.toUpperCase()})` })),
                    ]}
                  />
                </div>
                <JXSwitch
                  label="Stop on Fail"
                  checked={stopOnFailure}
                  onChange={(c: any) => setStopOnFailure(typeof c === "boolean" ? c : c?.target?.checked)}
                />
              </div>
            </div>

            {/* Step Timeline Rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {steps.map((st, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "rgba(0,0,0,0.2)",
                    border: "1px solid var(--jx-border-subtle)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 160 }}>
                      <span style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: "var(--jx-primary)",
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}>
                        {idx + 1}
                      </span>
                      <div style={{ flex: 1 }}>
                        <JXTextField
                          value={st.name}
                          onChange={(val: any) => handleUpdateStep(idx, "name", typeof val === "string" ? val : val?.target?.value || "")}
                          placeholder="Step description"
                        />
                      </div>
                    </div>

                    <div style={{ minWidth: 180 }}>
                      <JXSelect
                        value={st.action}
                        onChange={(val: any) => handleUpdateStep(idx, "action", val)}
                        options={[
                          { id: "take_screenshot", label: "take_screenshot (Vision)" },
                          { id: "wait_for_text", label: "wait_for_text (OCR Poll)" },
                          { id: "click_text", label: "click_text (UI Action)" },
                          { id: "click_element", label: "click_element (Mark)" },
                          { id: "keyboard_type", label: "keyboard_type" },
                          { id: "press_hotkey", label: "press_hotkey" },
                          { id: "run_shell", label: "run_shell (PTY)" },
                          { id: "launch_approved_application", label: "launch_approved_application" },
                        ]}
                      />
                    </div>

                    <div style={{ display: "flex", gap: 4 }}>
                      <JXButton
                        size="sm"
                        variant="soft"
                        disabled={idx === 0}
                        onClick={() => handleMoveStep(idx, "up")}
                      >
                        ▲
                      </JXButton>
                      <JXButton
                        size="sm"
                        variant="soft"
                        disabled={idx === steps.length - 1}
                        onClick={() => handleMoveStep(idx, "down")}
                      >
                        ▼
                      </JXButton>
                      <JXButton
                        size="sm"
                        variant="soft"
                        color="error"
                        onClick={() => handleRemoveStep(idx)}
                      >
                        ✕
                      </JXButton>
                    </div>
                  </div>

                  {/* Step Args JSON */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                    <span style={{ color: "var(--jx-text-secondary)", minWidth: 36 }}>Args:</span>
                    <div style={{ flex: 1 }}>
                      <JXTextField
                        value={JSON.stringify(st.args)}
                        onChange={(val: any) => {
                          try {
                            const parsed = JSON.parse(typeof val === "string" ? val : val?.target?.value || "{}");
                            handleUpdateStep(idx, "args", parsed);
                          } catch (_) {}
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Builder Action Buttons */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
              <JXButton
                size="sm"
                variant="soft"
                onClick={handleAddStep}
              >
                ➕ Add Step
              </JXButton>
              <JXButton
                size="md"
                variant="contained"
                color="primary"
                disabled={isRunning || !steps.length}
                onClick={handleExecuteWorkflow}
                loading={isRunning}
              >
                🚀 Dispatch Multi-Turn Plan
              </JXButton>
            </div>
          </div>

          {/* Past Workflow Execution History Table */}
          {workflowHistory.length > 0 && (
            <div style={{
              padding: 18,
              borderRadius: 14,
              background: "var(--jx-surface-sunken)",
              border: "1px solid var(--jx-border-subtle)",
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--jx-text-primary)" }}>
                  Execution History
                </span>
                <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)" }}>
                  {workflowHistory.length} total runs
                </span>
              </div>

              <div className="f2-table-wrap">
                <table className="f2-table">
                  <thead>
                    <tr>
                      <th>Plan Name</th>
                      <th>Device</th>
                      <th>Status</th>
                      <th>Steps</th>
                      <th>Created</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workflowHistory.slice(0, 8).map((wf) => (
                      <tr key={wf.id}>
                        <td style={{ fontWeight: 600 }}>{wf.name}</td>
                        <td>{wf.device_id || "auto"}</td>
                        <td>
                          <span style={{
                            padding: "2px 8px",
                            borderRadius: 9999,
                            fontSize: 10,
                            fontFamily: "JetBrains Mono, monospace",
                            fontWeight: 600,
                            background: wf.status === "completed" ? "rgba(16, 185, 129, 0.15)" : wf.status === "failed" ? "rgba(239, 68, 68, 0.15)" : "rgba(99, 102, 241, 0.15)",
                            color: wf.status === "completed" ? "#10b981" : wf.status === "failed" ? "#ef4444" : "var(--jx-primary)"
                          }}>
                            {wf.status.toUpperCase()}
                          </span>
                        </td>
                        <td>{wf.current_step} / {wf.total_steps}</td>
                        <td style={{ fontSize: 11, color: "var(--jx-text-secondary)" }}>
                          {new Date(wf.created_at * 1000).toLocaleTimeString()}
                        </td>
                        <td>
                          <JXButton
                            size="sm"
                            variant="soft"
                            onClick={() => setActiveWorkflow(wf)}
                          >
                            Inspect
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
      </div>
    </div>
  );
};

export default WorkflowPlanner;
