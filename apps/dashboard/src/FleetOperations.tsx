import React, { useState, useEffect } from "react";
import { api } from "./api";

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
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadTriggers = async () => {
    try {
      const t = await api.triggers();
      setTriggersList(t);
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadSchedules = async () => {
    try {
      const s = await api.schedules();
      setSchedulesList(s);
    } catch (err: any) {
      console.error(err);
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
    if (!confirm("Delete this trigger?")) return;
    try {
      await api.deleteTrigger(id);
      loadTriggers();
    } catch (err: any) {
      setError(err.message);
    }
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
    if (!confirm("Delete this scheduled task?")) return;
    try {
      await api.deleteSchedule(id);
      loadSchedules();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top Banner & Stats Ribbon */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <span>🛰️</span> Fleet Operations & Autonomous Healing
          </h2>
          <p style={{ margin: "4px 0 0", color: "#8a8886", fontSize: 13 }}>
            Real-time fleet telemetry, multi-node command bus, self-healing reactive triggers, and automated scheduling.
          </p>
        </div>
        <button
          onClick={loadData}
          style={{
            padding: "8px 14px",
            background: "rgba(0,120,212,0.1)",
            color: "#0078d4",
            border: "1px solid rgba(0,120,212,0.3)",
            borderRadius: 6,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          🔄 Refresh Fleet
        </button>
      </div>

      {notice && (
        <div style={{ padding: "10px 14px", background: "rgba(16,124,65,0.15)", border: "1px solid #107c41", borderRadius: 8, color: "#107c41", fontSize: 13 }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{ padding: "10px 14px", background: "rgba(232,17,35,0.15)", border: "1px solid #e81123", borderRadius: 8, color: "#e81123", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Metrics Ribbon */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <div style={{ background: "rgba(125,125,125,0.06)", border: "1px solid rgba(125,125,125,0.15)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ color: "#8a8886", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Nodes Online</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: "#107c41" }}>
            {fleetData ? `${fleetData.online_devices} / ${fleetData.total_devices}` : "-"}
          </div>
        </div>
        <div style={{ background: "rgba(125,125,125,0.06)", border: "1px solid rgba(125,125,125,0.15)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ color: "#8a8886", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Fleet Avg CPU</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
            {fleetData?.avg_cpu_percent !== null && fleetData?.avg_cpu_percent !== undefined ? `${fleetData.avg_cpu_percent}%` : "Idle"}
          </div>
        </div>
        <div style={{ background: "rgba(125,125,125,0.06)", border: "1px solid rgba(125,125,125,0.15)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ color: "#8a8886", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Fleet Avg RAM</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
            {fleetData?.avg_memory_percent !== null && fleetData?.avg_memory_percent !== undefined ? `${fleetData.avg_memory_percent}%` : "Idle"}
          </div>
        </div>
        <div style={{ background: "rgba(125,125,125,0.06)", border: "1px solid rgba(125,125,125,0.15)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ color: "#8a8886", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Active Triggers</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: "#0078d4" }}>
            {fleetData ? fleetData.active_triggers : 0}
          </div>
        </div>
        <div style={{ background: "rgba(125,125,125,0.06)", border: "1px solid rgba(125,125,125,0.15)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ color: "#8a8886", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Active Schedules</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: "#8764b8" }}>
            {fleetData ? fleetData.active_schedules : 0}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid rgba(125,125,125,0.2)", paddingBottom: 6 }}>
        <button
          onClick={() => setActiveTab("telemetry")}
          style={{
            padding: "8px 16px",
            background: activeTab === "telemetry" ? "var(--accent, #0078d4)" : "transparent",
            color: activeTab === "telemetry" ? "#fff" : "inherit",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          📊 Fleet Telemetry & Nodes
        </button>
        <button
          onClick={() => setActiveTab("broadcast")}
          style={{
            padding: "8px 16px",
            background: activeTab === "broadcast" ? "var(--accent, #0078d4)" : "transparent",
            color: activeTab === "broadcast" ? "#fff" : "inherit",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ⚡ Multi-Node Broadcast Bus
        </button>
        <button
          onClick={() => setActiveTab("triggers")}
          style={{
            padding: "8px 16px",
            background: activeTab === "triggers" ? "var(--accent, #0078d4)" : "transparent",
            color: activeTab === "triggers" ? "#fff" : "inherit",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          🛡️ Self-Healing Triggers ({triggersList.length})
        </button>
        <button
          onClick={() => setActiveTab("schedules")}
          style={{
            padding: "8px 16px",
            background: activeTab === "schedules" ? "var(--accent, #0078d4)" : "transparent",
            color: activeTab === "schedules" ? "#fff" : "inherit",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ⏰ Fleet Scheduler ({schedulesList.length})
        </button>
      </div>

      {/* Tab 1: Telemetry & Nodes */}
      {activeTab === "telemetry" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {fleetData?.devices.map((dev) => (
              <div
                key={dev.id}
                style={{
                  background: "rgba(125,125,125,0.05)",
                  border: "1px solid rgba(125,125,125,0.2)",
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
                      background: dev.is_online ? "rgba(16,124,65,0.15)" : "rgba(125,125,125,0.2)",
                      color: dev.is_online ? "#107c41" : "#8a8886",
                    }}
                  >
                    ● {dev.is_online ? "Online" : "Offline"}
                  </span>
                </div>

                <div style={{ fontSize: 12, color: "#8a8886" }}>
                  OS: <span style={{ color: "inherit" }}>{dev.os || "Unknown"}</span>
                </div>

                {/* Resource Gauges */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                      <span>CPU</span>
                      <span>{dev.telemetry?.cpu_percent !== null && dev.telemetry?.cpu_percent !== undefined ? `${dev.telemetry.cpu_percent}%` : "N/A"}</span>
                    </div>
                    <div style={{ width: "100%", height: 6, background: "rgba(125,125,125,0.2)", borderRadius: 3, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${dev.telemetry?.cpu_percent || 0}%`,
                          height: "100%",
                          background: (dev.telemetry?.cpu_percent || 0) > 85 ? "#e81123" : "#0078d4",
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
                    <div style={{ width: "100%", height: 6, background: "rgba(125,125,125,0.2)", borderRadius: 3, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${dev.telemetry?.memory_percent || 0}%`,
                          height: "100%",
                          background: (dev.telemetry?.memory_percent || 0) > 85 ? "#e81123" : "#107c41",
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
                    <div style={{ width: "100%", height: 6, background: "rgba(125,125,125,0.2)", borderRadius: 3, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${dev.telemetry?.disk_percent || 0}%`,
                          height: "100%",
                          background: (dev.telemetry?.disk_percent || 0) > 85 ? "#e81123" : "#8764b8",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => viewDeviceTelemetry(dev)}
                  style={{
                    marginTop: 6,
                    padding: "6px 10px",
                    background: "rgba(125,125,125,0.1)",
                    border: "1px solid rgba(125,125,125,0.2)",
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  📈 View Metric History
                </button>
              </div>
            ))}
          </div>

          {/* Device History Modal */}
          {selectedDeviceTel && (
            <div
              style={{
                background: "rgba(125,125,125,0.08)",
                border: "1px solid rgba(125,125,125,0.25)",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 16 }}>📊 Telemetry History: {selectedDeviceTel.name}</h4>
                <button
                  onClick={() => setSelectedDeviceTel(null)}
                  style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>
              <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
                {selectedDeviceTel.history.map((pt, idx) => (
                  <div
                    key={idx}
                    style={{
                      minWidth: 80,
                      background: "rgba(125,125,125,0.1)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      fontSize: 11,
                      textAlign: "center",
                    }}
                  >
                    <div style={{ color: "#0078d4", fontWeight: 700 }}>CPU: {pt.cpu_percent}%</div>
                    <div style={{ color: "#107c41", fontWeight: 700, marginTop: 2 }}>RAM: {pt.memory_percent}%</div>
                    <div style={{ color: "#8a8886", fontSize: 10, marginTop: 4 }}>
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
          <div style={{ background: "rgba(125,125,125,0.05)", border: "1px solid rgba(125,125,125,0.2)", borderRadius: 10, padding: 16 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>⚡ One-Click Fleet Broadcast</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              <button
                onClick={() => handleBroadcast("get_system_info", {})}
                disabled={broadcasting}
                style={{ padding: "8px 14px", background: "rgba(0,120,212,0.12)", color: "#0078d4", border: "1px solid #0078d4", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
              >
                🩺 Fleet Health & Telemetry
              </button>
              <button
                onClick={() => handleBroadcast("run_shell", { command: "uptime" }, "linux")}
                disabled={broadcasting}
                style={{ padding: "8px 14px", background: "rgba(16,124,65,0.12)", color: "#107c41", border: "1px solid #107c41", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
              >
                ⏱️ Check Linux Fleet Uptime
              </button>
              <button
                onClick={() => handleBroadcast("get_disk_usage", {})}
                disabled={broadcasting}
                style={{ padding: "8px 14px", background: "rgba(135,100,184,0.12)", color: "#8764b8", border: "1px solid #8764b8", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
              >
                💾 Inspect Fleet Storage
              </button>
              <button
                onClick={() => handleBroadcast("run_shell", { command: "sync && echo 3 > /proc/sys/vm/drop_caches || true" }, "linux")}
                disabled={broadcasting}
                style={{ padding: "8px 14px", background: "rgba(232,17,35,0.12)", color: "#e81123", border: "1px solid #e81123", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
              >
                🧹 Purge Linux RAM Cache
              </button>
            </div>

            <div style={{ borderTop: "1px solid rgba(125,125,125,0.2)", paddingTop: 14 }}>
              <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>Custom Fleet Command</h4>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <select
                  value={targetFilter}
                  onChange={(e) => setTargetFilter(e.target.value as any)}
                  style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(125,125,125,0.3)", background: "transparent", color: "inherit" }}
                >
                  <option value="all">Target: All Fleet Devices</option>
                  <option value="linux">Target: Linux Nodes Only</option>
                  <option value="windows">Target: Windows Nodes Only</option>
                </select>
                <input
                  type="text"
                  placeholder="Tool (e.g. run_shell, get_system_info)"
                  value={customTool}
                  onChange={(e) => setCustomTool(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(125,125,125,0.3)", background: "transparent", color: "inherit", minWidth: 180 }}
                />
                <input
                  type="text"
                  placeholder='Args JSON (e.g. {"command": "hostname"})'
                  value={customArgs}
                  onChange={(e) => setCustomArgs(e.target.value)}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(125,125,125,0.3)", background: "transparent", color: "inherit", minWidth: 220 }}
                />
                <button
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(customArgs);
                      handleBroadcast(customTool, parsed, targetFilter);
                    } catch (e: any) {
                      setError("Invalid JSON in Args: " + e.message);
                    }
                  }}
                  disabled={broadcasting}
                  style={{ padding: "8px 16px", background: "#0078d4", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
                >
                  {broadcasting ? "Broadcasting..." : "🚀 Broadcast to Fleet"}
                </button>
              </div>
            </div>
          </div>

          {/* Broadcast Progress & Execution Results */}
          {broadcastBatch && (
            <div style={{ background: "rgba(125,125,125,0.05)", border: "1px solid rgba(125,125,125,0.2)", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 16 }}>
                  🛰️ Broadcast Batch: {broadcastBatch.batch_id} ({broadcastBatch.status || "dispatched"})
                </h4>
                <div style={{ fontSize: 12, color: "#8a8886" }}>
                  {broadcastBatch.completed || 0} completed / {broadcastBatch.total_tasks || broadcastBatch.device_count || 0} total
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(broadcastBatch.tasks || []).map((t: any) => (
                  <div
                    key={t.task_id}
                    style={{
                      background: "rgba(125,125,125,0.08)",
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
                          color: t.status === "completed" ? "#107c41" : t.status === "failed" ? "#e81123" : "#0078d4",
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
            <button
              onClick={() => setShowAddTrigger(!showAddTrigger)}
              style={{ padding: "6px 14px", background: "#0078d4", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
            >
              {showAddTrigger ? "Cancel" : "+ Add Self-Healing Rule"}
            </button>
          </div>

          {showAddTrigger && (
            <div style={{ background: "rgba(125,125,125,0.08)", border: "1px solid rgba(125,125,125,0.25)", borderRadius: 10, padding: 16 }}>
              <h4 style={{ margin: "0 0 12px" }}>Create Event Trigger</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#8a8886", marginBottom: 4 }}>Rule Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Auto-Purge Cache on High RAM"
                    value={newTrigName}
                    onChange={(e) => setNewTrigName(e.target.value)}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(125,125,125,0.3)", background: "transparent", color: "inherit" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#8a8886", marginBottom: 4 }}>Monitored Metric</label>
                  <select
                    value={newTrigMetric}
                    onChange={(e) => setNewTrigMetric(e.target.value)}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(125,125,125,0.3)", background: "transparent", color: "inherit" }}
                  >
                    <option value="memory_percent">RAM Usage (memory_percent)</option>
                    <option value="cpu_percent">CPU Load (cpu_percent)</option>
                    <option value="disk_percent">Storage Usage (disk_percent)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#8a8886", marginBottom: 4 }}>Condition</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select
                      value={newTrigOp}
                      onChange={(e) => setNewTrigOp(e.target.value)}
                      style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(125,125,125,0.3)", background: "transparent", color: "inherit" }}
                    >
                      <option value=">">&gt;</option>
                      <option value=">=">&gt;=</option>
                      <option value="<">&lt;</option>
                    </select>
                    <input
                      type="number"
                      value={newTrigThreshold}
                      onChange={(e) => setNewTrigThreshold(Number(e.target.value))}
                      style={{ flex: 1, padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(125,125,125,0.3)", background: "transparent", color: "inherit" }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#8a8886", marginBottom: 4 }}>Action Target (Tool / Webhook)</label>
                  <input
                    type="text"
                    placeholder="get_system_info or run_shell"
                    value={newTrigActionTarget}
                    onChange={(e) => setNewTrigActionTarget(e.target.value)}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(125,125,125,0.3)", background: "transparent", color: "inherit" }}
                  />
                </div>
              </div>
              <button
                onClick={handleCreateTrigger}
                style={{ marginTop: 12, padding: "8px 16px", background: "#107c41", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
              >
                Save Trigger
              </button>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {triggersList.map((trig) => (
              <div
                key={trig.id}
                style={{
                  background: "rgba(125,125,125,0.06)",
                  border: "1px solid rgba(125,125,125,0.2)",
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
                  <div style={{ fontSize: 12, color: "#8a8886", marginTop: 2 }}>
                    Condition: <code>{trig.metric} {trig.operator} {trig.threshold}%</code> ➔ Action: <code>{trig.action_target}</code>
                  </div>
                  {trig.last_triggered_at && (
                    <div style={{ fontSize: 11, color: "#0078d4", marginTop: 4 }}>
                      Last triggered: {new Date(trig.last_triggered_at * 1000).toLocaleString()}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={() => handleToggleTrigger(trig.id)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 12,
                      border: "none",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      background: trig.enabled ? "rgba(16,124,65,0.15)" : "rgba(125,125,125,0.2)",
                      color: trig.enabled ? "#107c41" : "#8a8886",
                    }}
                  >
                    {trig.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <button
                    onClick={() => handleTestTrigger(trig.id)}
                    style={{ padding: "5px 10px", background: "rgba(0,120,212,0.1)", color: "#0078d4", border: "1px solid #0078d4", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                  >
                    🧪 Test
                  </button>
                  <button
                    onClick={() => handleDeleteTrigger(trig.id)}
                    style={{ padding: "5px 10px", background: "transparent", color: "#e81123", border: "1px solid #e81123", borderRadius: 6, fontSize: 11, cursor: "pointer" }}
                  >
                    Delete
                  </button>
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
            <button
              onClick={() => setShowAddSched(!showAddSched)}
              style={{ padding: "6px 14px", background: "#0078d4", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
            >
              {showAddSched ? "Cancel" : "+ Add Scheduled Task"}
            </button>
          </div>

          {showAddSched && (
            <div style={{ background: "rgba(125,125,125,0.08)", border: "1px solid rgba(125,125,125,0.25)", borderRadius: 10, padding: 16 }}>
              <h4 style={{ margin: "0 0 12px" }}>New Scheduled Automation</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#8a8886", marginBottom: 4 }}>Job Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Periodic Fleet Health Audit"
                    value={newSchedName}
                    onChange={(e) => setNewSchedName(e.target.value)}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(125,125,125,0.3)", background: "transparent", color: "inherit" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#8a8886", marginBottom: 4 }}>Interval (seconds)</label>
                  <input
                    type="number"
                    value={newSchedInterval}
                    onChange={(e) => setNewSchedInterval(Number(e.target.value))}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(125,125,125,0.3)", background: "transparent", color: "inherit" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#8a8886", marginBottom: 4 }}>Action Tool</label>
                  <input
                    type="text"
                    placeholder="get_system_info or run_shell"
                    value={newSchedTool}
                    onChange={(e) => setNewSchedTool(e.target.value)}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(125,125,125,0.3)", background: "transparent", color: "inherit" }}
                  />
                </div>
              </div>
              <button
                onClick={handleCreateSchedule}
                style={{ marginTop: 12, padding: "8px 16px", background: "#107c41", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
              >
                Save Schedule
              </button>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {schedulesList.map((sched) => (
              <div
                key={sched.id}
                style={{
                  background: "rgba(125,125,125,0.06)",
                  border: "1px solid rgba(125,125,125,0.2)",
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
                  <div style={{ fontSize: 12, color: "#8a8886", marginTop: 2 }}>
                    Interval: Every {sched.interval_seconds}s ➔ Tool: <code>{sched.tool}</code>
                  </div>
                  <div style={{ fontSize: 11, color: "#8764b8", marginTop: 4 }}>
                    Next run: {new Date(sched.next_run_at * 1000).toLocaleTimeString()}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={() => handleRunScheduleNow(sched.id)}
                    style={{ padding: "5px 10px", background: "rgba(16,124,65,0.1)", color: "#107c41", border: "1px solid #107c41", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                  >
                    ▶️ Run Now
                  </button>
                  <button
                    onClick={() => handleDeleteSchedule(sched.id)}
                    style={{ padding: "5px 10px", background: "transparent", color: "#e81123", border: "1px solid #e81123", borderRadius: 6, fontSize: 11, cursor: "pointer" }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

