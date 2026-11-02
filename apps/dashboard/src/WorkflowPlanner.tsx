import React, { useState, useEffect } from "react";
import { api } from "./api";
import {
  JXButton,
  JXSelect,
  JXTextField,
  JXSwitch,
  JXChip,
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

  // Form State
  const [workflowName, setWorkflowName] = useState("Web Navigation & Document Plan");
  const [selectedDevice, setSelectedDevice] = useState<string>("auto");
  const [stopOnFailure, setStopOnFailure] = useState(true);
  const [maxRetries, setMaxRetries] = useState(1);
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      name: "Launch Chrome Browser",
      action: "launch_approved_application",
      args: { app_name: "chrome" },
    },
    {
      name: "Wait for Browser Ready",
      action: "wait_for_text",
      args: { text: "Google", timeout_seconds: 10 },
    },
    {
      name: "Focus Address Bar",
      action: "press_hotkey",
      args: { combo: "ctrl+l" },
    },
    {
      name: "Navigate to Hacker News",
      action: "keyboard_type",
      args: { text: "https://news.ycombinator.com\n" },
    },
    {
      name: "Verify Site Loaded",
      action: "wait_for_text",
      args: { text: "Hacker News", timeout_seconds: 12 },
    },
    {
      name: "Capture Screen",
      action: "take_screenshot",
      args: { quality: 80 },
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
        steps,
        stop_on_failure: stopOnFailure,
        max_retries: maxRetries,
      });

      if (onNotice) onNotice({ intent: "success", text: `Workflow "${workflowName}" launched!` });
      pollWorkflow(res.workflow_id);
    } catch (err: any) {
      setIsRunning(false);
      if (onNotice) onNotice({ intent: "error", text: `Failed starting workflow: ${err.message}` });
    }
  }

  function pollWorkflow(wfId: string) {
    const interval = setInterval(async () => {
      try {
        const wf = await api.workflowDetail(wfId);
        setActiveWorkflow(wf);
        if (wf.status === "completed" || wf.status === "failed" || wf.status === "cancelled") {
          clearInterval(interval);
          setIsRunning(false);
          loadTemplatesAndHistory();
          if (onNotice) {
            onNotice({
              intent: wf.status === "completed" ? "success" : "error",
              text: `Workflow "${wf.name}" ${wf.status}!`,
            });
          }
        }
      } catch (err) {
        clearInterval(interval);
        setIsRunning(false);
      }
    }, 1000);
  }

  async function handleCancelActive() {
    if (!activeWorkflow) return;
    try {
      await api.cancelWorkflow(activeWorkflow.id);
      if (onNotice) onNotice({ intent: "info", text: "Workflow cancelled." });
    } catch (err: any) {
      if (onNotice) onNotice({ intent: "error", text: "Failed to cancel: " + err.message });
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* ================= HEADER & TEMPLATES ================= */}
      <div className="f2-card" style={{ padding: "18px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p className="f2-muted" style={{ margin: 0 }}>
              Compose, verify, and execute multi-step agentic plans on remote Windows & Linux devices with automatic OCR verification and retry.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--colorNeutralForeground2)" }}>Target:</span>
            <div style={{ minWidth: 220 }}>
              <JXSelect
                options={[
                  { id: "auto", label: "Auto (Online Workstation)" },
                  ...devices.map(d => ({ id: d.name || d.id, label: `${d.name || d.id} (${d.os || 'Device'})` })),
                  { id: "local", label: "Local Control Plane" }
                ]}
                value={selectedDevice}
                onChange={(val: any) => setSelectedDevice(val)}
              />
            </div>
          </div>
        </div>

        {/* Template Quick Chips */}
        {templates.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--colorNeutralStroke2)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--colorNeutralForeground2)" }}>Templates:</span>
            {templates.map(tpl => {
              const cleanName = tpl.name.replace(/^[^a-zA-Z0-9]+/, '').trim();
              return (
                <button
                  key={tpl.id}
                  type="button"
                  className="f2-suggestion-chip"
                  onClick={() => handleSelectTemplate(tpl)}
                  title={tpl.description}
                >
                  <span style={{ color: "var(--jx-primary)" }}>✦</span>
                  <span>{cleanName}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= WORKFLOW BUILDER + ACTIVE RUNNER GRID ================= */}
      <div style={{ display: "grid", gridTemplateColumns: activeWorkflow ? "1.2fr 1fr" : "1fr", gap: 16 }}>
        {/* Step Builder Panel */}
        <div className="f2-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12 }}>
            <div style={{ flex: 1 }}>
              <JXTextField
                value={workflowName}
                onChange={(val: any) => setWorkflowName(typeof val === "string" ? val : val?.target?.value || "")}
                placeholder="Workflow Name"
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <JXSwitch
                label="Stop on Fail"
                checked={stopOnFailure}
                onChange={(c: any) => setStopOnFailure(typeof c === "boolean" ? c : c?.target?.checked)}
              />
              <div style={{ width: 110 }}>
                <JXSelect
                  label="Retries"
                  value={String(maxRetries)}
                  onChange={(val: any) => setMaxRetries(parseInt(typeof val === "string" ? val : val?.target?.value) || 0)}
                  options={[
                    { id: "0", label: "0 Retries" },
                    { id: "1", label: "1 Retry" },
                    { id: "2", label: "2 Retries" },
                    { id: "3", label: "3 Retries" },
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Steps Timeline Cards */}
          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            {steps.map((st, idx) => (
              <div
                key={idx}
                style={{
                  background: "var(--colorNeutralBackground2)",
                  border: "1px solid var(--colorNeutralStroke2)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span
                    style={{
                      background: "var(--colorBrandBackground)",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: "50%",
                      width: 20,
                      height: 20,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {idx + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <JXTextField
                      value={st.name}
                      onChange={(val: any) => handleUpdateStep(idx, "name", val)}
                      placeholder="Step description"
                    />
                  </div>
                  <div style={{ minWidth: 200 }}>
                    <JXSelect
                      options={[
                        { id: "launch_approved_application", label: "launch_approved_application" },
                        { id: "wait_for_text", label: "wait_for_text (OCR Poll)" },
                        { id: "click_text", label: "click_text (Grounding)" },
                        { id: "click_element", label: "click_element (Mark)" },
                        { id: "keyboard_type", label: "keyboard_type" },
                        { id: "press_hotkey", label: "press_hotkey" },
                        { id: "take_screenshot", label: "take_screenshot" },
                        { id: "run_shell", label: "run_shell" },
                        { id: "verify_screen_contains", label: "verify_screen_contains" },
                        { id: "list_ui_elements", label: "list_ui_elements" },
                      ]}
                      value={st.action}
                      onChange={(val: any) => handleUpdateStep(idx, "action", val)}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <JXButton
                      variant="soft"
                      size="sm"
                      disabled={idx === 0}
                      onClick={() => handleMoveStep(idx, "up")}
                    >
                      ▲
                    </JXButton>
                    <JXButton
                      variant="soft"
                      size="sm"
                      disabled={idx === steps.length - 1}
                      onClick={() => handleMoveStep(idx, "down")}
                    >
                      ▼
                    </JXButton>
                    <JXButton
                      variant="soft"
                      color="error"
                      size="sm"
                      onClick={() => handleRemoveStep(idx)}
                    >
                      ✕
                    </JXButton>
                  </div>
                </div>

                {/* Arguments Editor */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span style={{ color: "var(--colorNeutralForeground2)", minWidth: 40 }}>Args:</span>
                  <div style={{ flex: 1 }}>
                    <JXTextField
                      value={JSON.stringify(st.args)}
                      onChange={(val: any) => {
                        try {
                          const parsed = JSON.parse(val);
                          handleUpdateStep(idx, "args", parsed);
                        } catch (_) {}
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Builder Buttons */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <JXButton
              variant="soft"
              size="sm"
              onClick={handleAddStep}
            >
              ➕ Add Step
            </JXButton>
            <JXButton
              variant="contained"
              color="primary"
              disabled={isRunning || !steps.length}
              onClick={handleExecuteWorkflow}
              loading={isRunning}
            >
              🚀 Run Plan on Device
            </JXButton>
          </div>
        </div>

        {/* Live Execution Monitor Panel */}
        {activeWorkflow && (
          <div className="f2-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    padding: "3px 8px",
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    background:
                      activeWorkflow.status === "completed"
                        ? "rgba(16, 124, 65, 0.15)"
                        : activeWorkflow.status === "failed"
                        ? "rgba(216, 59, 1, 0.15)"
                        : "rgba(0, 120, 212, 0.15)",
                    color:
                      activeWorkflow.status === "completed"
                        ? "var(--colorActionGreen)"
                        : activeWorkflow.status === "failed"
                        ? "#d83b01"
                        : "var(--colorActionBlue)",
                  }}
                >
                  {activeWorkflow.status === "running" ? "🔄 Running" : activeWorkflow.status}
                </span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{activeWorkflow.name}</span>
              </div>
              {activeWorkflow.status === "running" && (
                <JXButton
                  size="sm"
                  variant="soft"
                  color="error"
                  onClick={handleCancelActive}
                >
                  Cancel Plan
                </JXButton>
              )}
            </div>

            {/* Progress Bar */}
            <div
              style={{
                background: "var(--colorNeutralStroke2)",
                height: 6,
                borderRadius: 3,
                overflow: "hidden",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  background:
                    activeWorkflow.status === "failed"
                      ? "var(--colorPaletteRedBackground3)"
                      : "var(--colorBrandBackground)",
                  height: "100%",
                  width: `${
                    activeWorkflow.total_steps > 0
                      ? Math.round((activeWorkflow.current_step / activeWorkflow.total_steps) * 100)
                      : 0
                  }%`,
                  transition: "width 0.3s ease",
                }}
              />
            </div>

            {/* Step Trace Logs */}
            <div style={{ display: "grid", gap: 8, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
              {activeWorkflow.results && activeWorkflow.results.length > 0 ? (
                activeWorkflow.results.map((res, i) => (
                  <div
                    key={i}
                    style={{
                      background: "var(--colorNeutralBackground2)",
                      border: `1px solid ${
                        res.status === "completed"
                          ? "rgba(16, 124, 65, 0.3)"
                          : res.status === "failed"
                          ? "rgba(216, 59, 1, 0.3)"
                          : "var(--colorNeutralStroke2)"
                      }`,
                      borderRadius: 6,
                      padding: "8px 12px",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600 }}>
                        {res.status === "completed" ? "✅" : res.status === "failed" ? "❌" : "⏳"}{" "}
                        {res.name}
                      </span>
                      <span style={{ fontFamily: "monospace", color: "var(--colorNeutralForeground2)", fontSize: 11 }}>
                        {res.duration_seconds}s
                      </span>
                    </div>
                    {res.error && (
                      <div style={{ color: "var(--colorPaletteRedForeground1)", marginTop: 4, fontFamily: "monospace", fontSize: 11 }}>
                        {res.error}
                      </div>
                    )}
                    {res.result && (
                      <div
                        style={{
                          marginTop: 4,
                          background: "rgba(0,0,0,0.04)",
                          padding: 4,
                          borderRadius: 4,
                          fontFamily: "monospace",
                          fontSize: 11,
                          maxHeight: 80,
                          overflowY: "auto",
                        }}
                      >
                        {JSON.stringify(res.result).slice(0, 200)}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 13, color: "var(--colorNeutralForeground2)", textAlign: "center", padding: "20px 0" }}>
                  Plan initiated. Waiting for step results...
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ================= PAST WORKFLOW EXECUTIONS TABLE ================= */}
      {workflowHistory.length > 0 && (
        <div className="f2-card" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>Execution History</h3>
          <div className="f2-table-wrap">
            <table className="f2-table" style={{ fontSize: 13 }}>
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
                {workflowHistory.slice(0, 10).map(wf => (
                  <tr key={wf.id}>
                    <td style={{ fontWeight: 500 }}>{wf.name}</td>
                    <td>{wf.device_id || "local"}</td>
                    <td>
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 600,
                          background:
                            wf.status === "completed"
                              ? "rgba(16, 124, 65, 0.15)"
                              : wf.status === "failed"
                              ? "rgba(216, 59, 1, 0.15)"
                              : "rgba(0, 120, 212, 0.15)",
                          color:
                            wf.status === "completed"
                              ? "var(--colorActionGreen)"
                              : wf.status === "failed"
                              ? "#d83b01"
                              : "var(--colorActionBlue)",
                        }}
                      >
                        {wf.status}
                      </span>
                    </td>
                    <td>
                      {wf.current_step} / {wf.total_steps}
                    </td>
                    <td style={{ color: "var(--colorNeutralForeground2)", fontSize: 12 }}>
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
  );
};

