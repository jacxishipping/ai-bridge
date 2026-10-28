import React, { useState, useEffect } from "react";
import { api } from "./api";

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
      console.error("Failed loading workflow data:", err);
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
      alert("Workflow must contain at least one step.");
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
      alert("Failed to cancel: " + err.message);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* ================= HEADER & TEMPLATES ================= */}
      <div className="f2-card" style={{ padding: "18px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              <span>⚡</span> Autonomous Workflows & Multi-Turn Plan Execution
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--colorNeutralForeground2)" }}>
              Compose, verify, and execute multi-step agentic plans on remote Windows & Linux devices with automatic OCR verification and retry.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--colorNeutralForeground2)" }}>Target:</span>
            <select
              className="f2-select"
              value={selectedDevice}
              onChange={e => setSelectedDevice(e.target.value)}
              style={{ fontSize: 13, padding: "5px 10px" }}
            >
              <option value="auto">Auto (Online Workstation)</option>
              {devices.map(d => (
                <option key={d.id} value={d.name || d.id}>
                  {d.name || d.id} ({d.os || "Device"})
                </option>
              ))}
              <option value="local">Local Control Plane</option>
            </select>
          </div>
        </div>

        {/* Template Quick Chips */}
        {templates.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--colorNeutralStroke2)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--colorNeutralForeground2)" }}>Templates:</span>
            {templates.map(tpl => (
              <button
                key={tpl.id}
                type="button"
                className="f2-btn f2-btn-sm"
                style={{ fontSize: 12, padding: "4px 10px", borderRadius: 16 }}
                onClick={() => handleSelectTemplate(tpl)}
              >
                {tpl.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ================= WORKFLOW BUILDER + ACTIVE RUNNER GRID ================= */}
      <div style={{ display: "grid", gridTemplateColumns: activeWorkflow ? "1.2fr 1fr" : "1fr", gap: 16 }}>
        {/* Step Builder Panel */}
        <div className="f2-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <input
              type="text"
              className="f2-input"
              value={workflowName}
              onChange={e => setWorkflowName(e.target.value)}
              placeholder="Workflow Name"
              style={{ fontSize: 15, fontWeight: 600, flex: 1, marginRight: 12 }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={stopOnFailure}
                  onChange={e => setStopOnFailure(e.target.checked)}
                />
                Stop on Fail
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Retries:
                <input
                  type="number"
                  className="f2-input"
                  style={{ width: 44, padding: "2px 6px", fontSize: 12 }}
                  min="0"
                  max="3"
                  value={maxRetries}
                  onChange={e => setMaxRetries(parseInt(e.target.value) || 0)}
                />
              </label>
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
                  <input
                    type="text"
                    className="f2-input"
                    value={st.name}
                    onChange={e => handleUpdateStep(idx, "name", e.target.value)}
                    placeholder="Step description"
                    style={{ flex: 1, fontSize: 13, padding: "4px 8px" }}
                  />
                  <select
                    className="f2-select"
                    value={st.action}
                    onChange={e => handleUpdateStep(idx, "action", e.target.value)}
                    style={{ fontSize: 12, padding: "4px 8px" }}
                  >
                    <option value="launch_approved_application">launch_approved_application</option>
                    <option value="wait_for_text">wait_for_text (OCR Poll)</option>
                    <option value="click_text">click_text (Grounding)</option>
                    <option value="click_element">click_element (Mark)</option>
                    <option value="keyboard_type">keyboard_type</option>
                    <option value="press_hotkey">press_hotkey</option>
                    <option value="take_screenshot">take_screenshot</option>
                    <option value="run_shell">run_shell</option>
                    <option value="verify_screen_contains">verify_screen_contains</option>
                    <option value="list_ui_elements">list_ui_elements</option>
                  </select>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      className="f2-btn f2-btn-sm"
                      style={{ padding: "2px 6px" }}
                      disabled={idx === 0}
                      onClick={() => handleMoveStep(idx, "up")}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="f2-btn f2-btn-sm"
                      style={{ padding: "2px 6px" }}
                      disabled={idx === steps.length - 1}
                      onClick={() => handleMoveStep(idx, "down")}
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      className="f2-btn f2-btn-sm"
                      style={{ padding: "2px 6px", color: "var(--colorPaletteRedForeground1)" }}
                      onClick={() => handleRemoveStep(idx)}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Arguments Editor */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span style={{ color: "var(--colorNeutralForeground2)", minWidth: 40 }}>Args:</span>
                  <input
                    type="text"
                    className="f2-input"
                    value={JSON.stringify(st.args)}
                    onChange={e => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        handleUpdateStep(idx, "args", parsed);
                      } catch (_) {
                        // user typing raw JSON
                      }
                    }}
                    style={{ flex: 1, fontFamily: "monospace", fontSize: 12, padding: "4px 8px" }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Builder Buttons */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              className="f2-btn f2-btn-sm"
              onClick={handleAddStep}
              style={{ fontSize: 13 }}
            >
              ➕ Add Step
            </button>
            <button
              type="button"
              className="f2-btn f2-btn-primary"
              disabled={isRunning || !steps.length}
              onClick={handleExecuteWorkflow}
              style={{ fontSize: 14, padding: "8px 20px" }}
            >
              {isRunning ? "🔄 Executing Autonomous Plan..." : "🚀 Run Plan on Device"}
            </button>
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
                        ? "#107c41"
                        : activeWorkflow.status === "failed"
                        ? "#d83b01"
                        : "#0078d4",
                  }}
                >
                  {activeWorkflow.status === "running" ? "🔄 Running" : activeWorkflow.status}
                </span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{activeWorkflow.name}</span>
              </div>
              {activeWorkflow.status === "running" && (
                <button
                  type="button"
                  className="f2-btn f2-btn-sm"
                  onClick={handleCancelActive}
                  style={{ color: "var(--colorPaletteRedForeground1)", fontSize: 12 }}
                >
                  Cancel Plan
                </button>
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
                              ? "#107c41"
                              : wf.status === "failed"
                              ? "#d83b01"
                              : "#0078d4",
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
                      <button
                        type="button"
                        className="f2-btn f2-btn-sm"
                        style={{ fontSize: 11, padding: "2px 8px" }}
                        onClick={() => setActiveWorkflow(wf)}
                      >
                        Inspect
                      </button>
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

