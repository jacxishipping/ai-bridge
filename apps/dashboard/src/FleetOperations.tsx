import React, { useState, useEffect } from "react";
import { api } from "./api";
import {
  JXTabs,
  JXButton,
  JXSelect,
  JXTextField,
  JXSwitch,
  JXChip,
} from "@jacxishippingorg/jx-ui-react";
import { ConfirmDialog, type ConfirmRequest } from "./ConfirmDialog";
import { Pager } from "./Pager";

interface DeviceSummary {
  id: string;
  name: string;
  os: string;
  is_online: boolean;
  last_seen: number | null;
  telemetry: {
    cpu_percent: number | null;
    memory_percent: number | null;
    disk_percent: number | null;
    recorded_at: number;
  } | null;
}

interface FleetTelemetryData {
  total_devices: number;
  online_devices: number;
  avg_cpu_percent: number | null;
  avg_memory_percent: number | null;
  avg_disk_percent: number | null;
  active_triggers: number;
  active_schedules: number;
  devices: DeviceSummary[];
}

interface TriggerItem {
  id: string;
  name: string;
  device_id: string | null;
  metric: string;
  operator: string;
  threshold: number;
  action_type: string;
  action_target: string;
  action_args: any;
  cooldown_seconds: number;
  last_triggered_at: number | null;
  enabled: number;
}

interface ScheduleItem {
  id: string;
  name: string;
  device_id: string | null;
  interval_seconds: number;
  tool: string;
  args: any;
  last_run_at: number | null;
  next_run_at: number;
  enabled: number;
}

export const FleetOperations: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"telemetry" | "broadcast" | "triggers" | "schedules">("telemetry");
  const [fleetData, setFleetData] = useState<FleetTelemetryData | null>(null);
  const [selectedDeviceTel, setSelectedDeviceTel] = useState<{ id: string; name: string; history: any[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nodeQuery, setNodeQuery] = useState("");
  const [nodePage, setNodePage] = useState(0);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);

  // Broadcast state
  const [targetFilter, setTargetFilter] = useState<"all" | "linux" | "windows">("all");
  const [customTool, setCustomTool] = useState("run_shell");
  const [customArgs, setCustomArgs] = useState('{"command": "uptime"}');
  const [broadcastBatch, setBroadcastBatch] = useState<any | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);

  // Triggers state
  const [triggersList, setTriggersList] = useState<TriggerItem[]>([]);
  const [showAddTrigger, setShowAddTrigger] = useState(false);
  const [newTrigName, setNewTrigName] = useState("");
  const [newTrigMetric, setNewTrigMetric] = useState("memory_percent");
  const [newTrigOp, setNewTrigOp] = useState(">");
  const [newTrigThreshold, setNewTrigThreshold] = useState(85);
  const [newTrigActionType, setNewTrigActionType] = useState("tool");
  const [newTrigActionTarget, setNewTrigActionTarget] = useState("get_system_info");
  const [newTrigCooldown, setNewTrigCooldown] = useState(300);

  // Schedules state
  const [schedulesList, setSchedulesList] = useState<ScheduleItem[]>([]);
  const [showAddSched, setShowAddSched] = useState(false);
  const [newSchedName, setNewSchedName] = useState("");
  const [newSchedInterval, setNewSchedInterval] = useState(300);
  const [newSchedTool, setNewSchedTool] = useState("get_system_info");

  const loadData = async () => {
    try {
      const data = await api.fleetTelemetry();
      setFleetData(data);
      setError(null);
    } catch (err: any) {
      setError(`Failed to load fleet telemetry: ${err.message}. Retrying automatically every 6s.`);
    }
  };

  const loadTriggers = async () => {
    try {
      const t = await api.triggers();
      setTriggersList(t);
    } catch (err: any) {
      setError(`Failed to load triggers: ${err.message}`);
    }
  };

  const loadSchedules = async () => {
    try {
      const s = await api.schedules();
      setSchedulesList(s);
    } catch (err: any) {
      setError(`Failed to load schedules: ${err.message}`);
    }
  };

  useEffect(() => {
    loadData();
    loadTriggers();
    loadSchedules();
    const iv = setInterval(() => {
      loadData();
      if (activeTab === "triggers") loadTriggers();
      if (activeTab === "schedules") loadSchedules();
    }, 6000);
    return () => clearInterval(iv);
  }, [activeTab]);

  const viewDeviceTelemetry = async (dev: DeviceSummary) => {
    try {
      setLoading(true);
      const res = await api.deviceTelemetry(dev.id, 30);
      setSelectedDeviceTel({ id: dev.id, name: dev.name, history: res.telemetry || [] });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBroadcast = async (tool: string, argsObj: any, osFilter?: string) => {
    setBroadcasting(true);
    setError(null);
    try {
      const payload: any = { tool, args: argsObj };
      if (osFilter && osFilter !== "all") {
        payload.target_os = osFilter;
      }
      const bRes = await api.fleetBroadcast(payload);
      setBroadcastBatch(bRes);
      setNotice(`Broadcast dispatched to ${bRes.device_count} devices!`);

      // Poll status
      const pollIv = setInterval(async () => {
        try {
          const st = await api.broadcastStatus(bRes.batch_id);
          setBroadcastBatch(st);
          if (st.status === "completed") {
            clearInterval(pollIv);
            setBroadcasting(false);
          }
        } catch (e) {
          clearInterval(pollIv);
          setBroadcasting(false);
        }
      }, 1500);
    } catch (err: any) {
      setError(err.message);
      setBroadcasting(false);
    }
  };

  const handleCreateTrigger = async () => {
    if (!newTrigName) return;
    try {
      await api.createTrigger({
        name: newTrigName,
        metric: newTrigMetric,
        operator: newTrigOp,
        threshold: Number(newTrigThreshold),
        action_type: newTrigActionType,
        action_target: newTrigActionTarget,
        cooldown_seconds: Number(newTrigCooldown),
      });
      setShowAddTrigger(false);
      setNewTrigName("");
      loadTriggers();
      setNotice("Trigger created successfully.");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleTrigger = async (id: string) => {
    try {
      await api.toggleTrigger(id);
      loadTriggers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteTrigger = async (id: string) => {
    const trig = triggersList.find((t) => t.id === id);
    setConfirmReq({
      title: `Delete trigger "${trig?.name || id}"?`,
      message: "This trigger will stop firing. Any device it was watching will no longer get its automated response. This cannot be undone.",
      confirmLabel: "Delete trigger",
      danger: true,
      onConfirm: async () => {
        try {
          await api.deleteTrigger(id);
          loadTriggers();
        } catch (err: any) {
          setError(err.message);
        }
      },
    });
  };

  const handleTestTrigger = async (id: string) => {
    try {
      setNotice("Firing test trigger...");
      const res = await api.testTrigger(id);
      setNotice(`Test trigger executed: status=${res.status}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateSchedule = async () => {
    if (!newSchedName) return;
    try {
      await api.createSchedule({
        name: newSchedName,
        interval_seconds: Number(newSchedInterval),
        tool: newSchedTool,
        args: {},
      });
      setShowAddSched(false);
      setNewSchedName("");
      loadSchedules();
      setNotice("Scheduled task created.");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRunScheduleNow = async (id: string) => {
    try {
      setNotice("Executing scheduled task now...");
      const res = await api.runScheduleNow(id);
      setNotice(`Task executed: ${res.status}`);
      loadSchedules();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    const sched = schedulesList.find((s) => s.id === id);
    setConfirmReq({
      title: `Delete scheduled automation "${sched?.name || id}"?`,
      message: "This automation will stop running on its schedule. This cannot be undone.",
      confirmLabel: "Delete automation",
      danger: true,
      onConfirm: async () => {
        try {
          await api.deleteSchedule(id);
          loadSchedules();
        } catch (err: any) {
          setError(err.message);
        }
      },
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <ConfirmDialog request={confirmReq} onClose={() => setConfirmReq(null)} />
      {/* Refresh action only: the page title/subtitle are rendered once
          by the App shell, so this view no longer repeats them in a
          different size/weight. */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <JXButton variant="outlined" size="sm" onClick={loadData}>
          🔄 Refresh Fleet
        </JXButton>
      </div>

      {notice && (
        <div className="f2-messagebar" data-intent="success">
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="f2-messagebar" data-intent="error">
          <span>{error}</span>
        </div>
      )}

      {/* Metrics Ribbon */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <div className="f2-card" style={{ padding: "14px 16px" }}>
          <div style={{ color: "var(--colorNeutralForeground3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Nodes Online</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: "var(--colorActionGreen)" }}>
            {fleetData ? `${fleetData.online_devices} / ${fleetData.total_devices}` : "-"}
          </div>
        </div>
        <div className="f2-card" style={{ padding: "14px 16px" }}>
          <div style={{ color: "var(--colorNeutralForeground3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Fleet Avg CPU</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
            {fleetData?.avg_cpu_percent !== null && fleetData?.avg_cpu_percent !== undefined ? `${fleetData.avg_cpu_percent}%` : "Idle"}
          </div>
        </div>
        <div className="f2-card" style={{ padding: "14px 16px" }}>
          <div style={{ color: "var(--colorNeutralForeground3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Fleet Avg RAM</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
            {fleetData?.avg_memory_percent !== null && fleetData?.avg_memory_percent !== undefined ? `${fleetData.avg_memory_percent}%` : "Idle"}
          </div>
        </div>
        <div className="f2-card" style={{ padding: "14px 16px" }}>
          <div style={{ color: "var(--colorNeutralForeground3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Active Triggers</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: "var(--colorActionBlue)" }}>
            {fleetData ? fleetData.active_triggers : 0}
          </div>
        </div>
        <div className="f2-card" style={{ padding: "14px 16px" }}>
          <div style={{ color: "var(--colorNeutralForeground3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Active Schedules</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: "var(--colorActionPurple)" }}>
            {fleetData ? fleetData.active_schedules : 0}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ marginBottom: 12 }}>
        <JXTabs
          tabs={[
            { id: "telemetry", label: "📊 Fleet Telemetry & Nodes" },
            { id: "broadcast", label: "⚡ Multi-Node Broadcast Bus" },
            { id: "triggers", label: `🛡️ Self-Healing Triggers (${triggersList.length})` },
            { id: "schedules", label: `⏰ Fleet Scheduler (${schedulesList.length})` },
          ]}
          value={activeTab}
          onChange={(val: any) => setActiveTab(val)}
          indicatorVariant="pill"
        />
      </div>

      {/* Tab 1: Telemetry & Nodes */}
      {activeTab === "telemetry" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <JXTextField
                value={nodeQuery}
                onChange={(val: any) => { setNodeQuery(val); setNodePage(0); }}
                placeholder="Search nodes by name, OS, or ID…"
              />
            </div>
            <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", alignSelf: "center" }}>
              {(fleetData?.devices || []).filter(d => !nodeQuery || `${d.name || ""} ${d.os || ""} ${d.id || ""}`.toLowerCase().includes(nodeQuery.toLowerCase())).length} of {fleetData?.devices?.length || 0} nodes
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {(fleetData?.devices || [])
              .filter(d => !nodeQuery || `${d.name || ""} ${d.os || ""} ${d.id || ""}`.toLowerCase().includes(nodeQuery.toLowerCase()))
              .slice(nodePage * 12, nodePage * 12 + 12)
              .map((dev) => (
              <div
                key={dev.id}
                style={{
                  background: "var(--colorNeutralBackground2)",
                  border: "1px solid var(--colorNeutralStroke2)",
                  borderRadius: 10,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{dev.name}</div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 12,
                      background: dev.is_online ? "rgba(16,124,65,0.15)" : "var(--colorNeutralStroke2)",
                      color: dev.is_online ? "var(--colorActionGreen)" : "var(--colorNeutralForeground3)",
                    }}
                  >
                    ● {dev.is_online ? "Online" : "Offline"}
                  </span>
                </div>

                <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
                  OS: <span style={{ color: "inherit" }}>{dev.os || "Unknown"}</span>
                </div>

                {/* Resource Gauges */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                      <span>CPU</span>
                      <span>{dev.telemetry?.cpu_percent !== null && dev.telemetry?.cpu_percent !== undefined ? `${dev.telemetry.cpu_percent}%` : "N/A"}</span>
                    </div>
                    <div style={{ width: "100%", height: 6, background: "var(--colorNeutralStroke2)", borderRadius: 3, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${dev.telemetry?.cpu_percent || 0}%`,
                          height: "100%",
                          background: (dev.telemetry?.cpu_percent || 0) > 85 ? "var(--colorActionRed)" : "var(--colorActionBlue)",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                      <span>Memory</span>
                      <span>{dev.telemetry?.memory_percent !== null && dev.telemetry?.memory_percent !== undefined ? `${dev.telemetry.memory_percent}%` : "N/A"}</span>
                    </div>
                    <div style={{ width: "100%", height: 6, background: "var(--colorNeutralStroke2)", borderRadius: 3, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${dev.telemetry?.memory_percent || 0}%`,
                          height: "100%",
                          background: (dev.telemetry?.memory_percent || 0) > 85 ? "var(--colorActionRed)" : "var(--colorActionGreen)",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                      <span>Disk</span>
                      <span>{dev.telemetry?.disk_percent !== null && dev.telemetry?.disk_percent !== undefined ? `${dev.telemetry.disk_percent}%` : "N/A"}</span>
                    </div>
                    <div style={{ width: "100%", height: 6, background: "var(--colorNeutralStroke2)", borderRadius: 3, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${dev.telemetry?.disk_percent || 0}%`,
                          height: "100%",
                          background: (dev.telemetry?.disk_percent || 0) > 85 ? "var(--colorActionRed)" : "var(--colorActionPurple)",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                </div>

                <JXButton
                  variant="soft"
                  size="sm"
                  onClick={() => viewDeviceTelemetry(dev)}
                  fullWidth
                >
                  📈 View Metric History
                </JXButton>
              </div>
            ))}
          </div>
          <Pager
            total={(fleetData?.devices || []).filter(d => !nodeQuery || `${d.name || ""} ${d.os || ""} ${d.id || ""}`.toLowerCase().includes(nodeQuery.toLowerCase())).length}
            page={nodePage}
            pageSize={12}
            onPage={setNodePage}
          />

          {/* Device History Modal */}
          {selectedDeviceTel && (
            <div
              style={{
                background: "var(--colorNeutralBackground2)",
                border: "1px solid var(--colorNeutralStroke1)",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 16 }}>📊 Telemetry History: {selectedDeviceTel.name}</h4>
                <JXButton
                  variant="soft"
                  size="sm"
                  onClick={() => setSelectedDeviceTel(null)}
                >
                  ✕
                </JXButton>
              </div>
              <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
                {selectedDeviceTel.history.map((pt, idx) => (
                  <div
                    key={idx}
                    style={{
                      minWidth: 80,
                      background: "var(--colorNeutralBackground2)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      fontSize: 11,
                      textAlign: "center",
                    }}
                  >
                    <div style={{ color: "var(--colorActionBlue)", fontWeight: 700 }}>CPU: {pt.cpu_percent}%</div>
                    <div style={{ color: "var(--colorActionGreen)", fontWeight: 700, marginTop: 2 }}>RAM: {pt.memory_percent}%</div>
                    <div style={{ color: "var(--colorNeutralForeground3)", fontSize: 10, marginTop: 4 }}>
                      {new Date(pt.recorded_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Broadcast Bus */}
      {activeTab === "broadcast" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="f2-panel">
            <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>⚡ One-Click Fleet Broadcast</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              <JXButton
                variant="soft"
                size="md"
                onClick={() => handleBroadcast("get_system_info", {})}
                disabled={broadcasting}
              >
                🩺 Fleet Health & Telemetry
              </JXButton>
              <JXButton
                variant="soft"
                size="md"
                onClick={() => handleBroadcast("run_shell", { command: "uptime" }, "linux")}
                disabled={broadcasting}
              >
                ⏱️ Check Linux Fleet Uptime
              </JXButton>
              <JXButton
                variant="soft"
                size="md"
                onClick={() => handleBroadcast("get_disk_usage", {})}
                disabled={broadcasting}
              >
                💾 Inspect Fleet Storage
              </JXButton>
              <JXButton
                variant="soft"
                size="md"
                onClick={() => handleBroadcast("run_shell", { command: "sync && echo 3 > /proc/sys/vm/drop_caches || true" }, "linux")}
                disabled={broadcasting}
              >
                🧹 Purge Linux RAM Cache
              </JXButton>
            </div>

            <div style={{ borderTop: "1px solid var(--colorNeutralStroke2)", paddingTop: 14 }}>
              <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>Custom Fleet Command</h4>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
                <div style={{ minWidth: 200 }}>
                  <JXSelect
                    options={[
                      { id: "all", label: "Target: All Fleet Devices" },
                      { id: "linux", label: "Target: Linux Nodes Only" },
                      { id: "windows", label: "Target: Windows Nodes Only" },
                    ]}
                    value={targetFilter}
                    onChange={(val: any) => setTargetFilter(val)}
                  />
                </div>
                <div style={{ minWidth: 200 }}>
                  <JXTextField
                    placeholder="Tool (e.g. run_shell, get_system_info)"
                    value={customTool}
                    onChange={(val: any) => setCustomTool(val)}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <JXTextField
                    placeholder='Args JSON (e.g. {"command": "hostname"})'
                    value={customArgs}
                    onChange={(val: any) => setCustomArgs(val)}
                  />
                </div>
                <JXButton
                  variant="contained"
                  color="primary"
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(customArgs);
                      handleBroadcast(customTool, parsed, targetFilter);
                    } catch (e: any) {
                      setError("Invalid JSON in Args: " + e.message);
                    }
                  }}
                  loading={broadcasting}
                >
                  🚀 Broadcast to Fleet
                </JXButton>
              </div>
            </div>
          </div>

          {/* Broadcast Progress & Execution Results */}
          {broadcastBatch && (
            <div className="f2-panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 16 }}>
                  🛰️ Broadcast Batch: {broadcastBatch.batch_id} ({broadcastBatch.status || "dispatched"})
                </h4>
                <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
                  {broadcastBatch.completed || 0} completed / {broadcastBatch.total_tasks || broadcastBatch.device_count || 0} total
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(broadcastBatch.tasks || []).map((t: any) => (
                  <div
                    key={t.task_id}
                    style={{
                      background: "var(--colorNeutralBackground2)",
                      borderRadius: 8,
                      padding: "10px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600 }}>{t.device_name || t.device_id} ({t.os || "node"})</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 10,
                          background: t.status === "completed" ? "rgba(16,124,65,0.15)" : t.status === "failed" ? "rgba(232,17,35,0.15)" : "rgba(0,120,212,0.15)",
                          color: t.status === "completed" ? "var(--colorActionGreen)" : t.status === "failed" ? "var(--colorActionRed)" : "var(--colorActionBlue)",
                        }}
                      >
                        {t.status}
                      </span>
                    </div>
                    {t.result && (
                      <pre
                        style={{
                          margin: 0,
                          fontSize: 11,
                          background: "rgba(0,0,0,0.3)",
                          padding: 8,
                          borderRadius: 6,
                          overflowX: "auto",
                          maxHeight: 120,
                        }}
                      >
                        {typeof t.result === "string" ? t.result : JSON.stringify(t.result, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Self-Healing Triggers */}
      {activeTab === "triggers" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>🛡️ Event-Driven Reactive Rules</h3>
            <JXButton
              variant="contained"
              color="primary"
              size="sm"
              onClick={() => setShowAddTrigger(!showAddTrigger)}
            >
              {showAddTrigger ? "Cancel" : "+ Add Self-Healing Rule"}
            </JXButton>
          </div>

          {showAddTrigger && (
            <div style={{ background: "var(--colorNeutralBackground2)", border: "1px solid var(--colorNeutralStroke1)", borderRadius: 10, padding: 16 }}>
              <h4 style={{ margin: "0 0 12px" }}>Create Event Trigger</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "flex-end" }}>
                <div>
                  <JXTextField
                    label="Rule Name"
                    placeholder="e.g. Auto-Purge Cache on High RAM"
                    value={newTrigName}
                    onChange={(val: any) => setNewTrigName(val)}
                  />
                </div>
                <div>
                  <JXSelect
                    label="Monitored Metric"
                    options={[
                      { id: "memory_percent", label: "RAM Usage (memory_percent)" },
                      { id: "cpu_percent", label: "CPU Load (cpu_percent)" },
                      { id: "disk_percent", label: "Storage Usage (disk_percent)" },
                    ]}
                    value={newTrigMetric}
                    onChange={(val: any) => setNewTrigMetric(val)}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ width: 80 }}>
                    <JXSelect
                      label="Operator"
                      options={[
                        { id: ">", label: ">" },
                        { id: ">=", label: ">=" },
                        { id: "<", label: "<" },
                      ]}
                      value={newTrigOp}
                      onChange={(val: any) => setNewTrigOp(val)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <JXTextField
                      label="Threshold (%)"
                      type="number"
                      value={String(newTrigThreshold)}
                      onChange={(val: any) => setNewTrigThreshold(Number(val))}
                    />
                  </div>
                </div>
                <div>
                  <JXTextField
                    label="Action Target"
                    placeholder="get_system_info or run_shell"
                    value={newTrigActionTarget}
                    onChange={(val: any) => setNewTrigActionTarget(val)}
                  />
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <JXButton
                  variant="contained"
                  color="success"
                  onClick={handleCreateTrigger}
                >
                  Save Trigger
                </JXButton>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {triggersList.map((trig) => (
              <div
                key={trig.id}
                style={{
                  background: "var(--colorNeutralBackground2)",
                  border: "1px solid var(--colorNeutralStroke2)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{trig.name}</div>
                  <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                    Condition: <code>{trig.metric} {trig.operator} {trig.threshold}%</code> ➔ Action: <code>{trig.action_target}</code>
                  </div>
                  {trig.last_triggered_at && (
                    <div style={{ fontSize: 11, color: "var(--colorActionBlue)", marginTop: 4 }}>
                      Last triggered: {new Date(trig.last_triggered_at * 1000).toLocaleString()}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <JXSwitch
                    checked={Boolean(trig.enabled)}
                    onChange={() => handleToggleTrigger(trig.id)}
                    size="sm"
                    label={trig.enabled ? "Enabled" : "Disabled"}
                  />
                  <JXButton
                    variant="soft"
                    size="sm"
                    onClick={() => handleTestTrigger(trig.id)}
                  >
                    🧪 Test
                  </JXButton>
                  <JXButton
                    variant="soft"
                    color="error"
                    size="sm"
                    onClick={() => handleDeleteTrigger(trig.id)}
                  >
                    Delete
                  </JXButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Fleet Scheduler */}
      {activeTab === "schedules" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>⏰ Fleet Cron & Periodic Automations</h3>
            <JXButton
              variant="contained"
              color="primary"
              size="sm"
              onClick={() => setShowAddSched(!showAddSched)}
            >
              {showAddSched ? "Cancel" : "+ Add Scheduled Task"}
            </JXButton>
          </div>

          {showAddSched && (
            <div style={{ background: "var(--colorNeutralBackground2)", border: "1px solid var(--colorNeutralStroke1)", borderRadius: 10, padding: 16 }}>
              <h4 style={{ margin: "0 0 12px" }}>New Scheduled Automation</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                <div>
                  <JXTextField
                    label="Job Name"
                    placeholder="e.g. Periodic Fleet Health Audit"
                    value={newSchedName}
                    onChange={(val: any) => setNewSchedName(val)}
                  />
                </div>
                <div>
                  <JXTextField
                    label="Interval (seconds)"
                    type="number"
                    value={String(newSchedInterval)}
                    onChange={(val: any) => setNewSchedInterval(Number(val))}
                  />
                </div>
                <div>
                  <JXTextField
                    label="Action Tool"
                    placeholder="get_system_info or run_shell"
                    value={newSchedTool}
                    onChange={(val: any) => setNewSchedTool(val)}
                  />
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <JXButton
                  variant="contained"
                  color="success"
                  onClick={handleCreateSchedule}
                >
                  Save Schedule
                </JXButton>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {schedulesList.map((sched) => (
              <div
                key={sched.id}
                style={{
                  background: "var(--colorNeutralBackground2)",
                  border: "1px solid var(--colorNeutralStroke2)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{sched.name}</div>
                  <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                    Interval: Every {sched.interval_seconds}s ➔ Tool: <code>{sched.tool}</code>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--colorActionPurple)", marginTop: 4 }}>
                    Next run: {new Date(sched.next_run_at * 1000).toLocaleTimeString()}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <JXButton
                    variant="soft"
                    size="sm"
                    onClick={() => handleRunScheduleNow(sched.id)}
                  >
                    ▶️ Run Now
                  </JXButton>
                  <JXButton
                    variant="soft"
                    color="error"
                    size="sm"
                    onClick={() => handleDeleteSchedule(sched.id)}
                  >
                    Delete
                  </JXButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

