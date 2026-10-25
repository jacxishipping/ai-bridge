import { useEffect, useState } from "react";
import { api, token, sessionToken } from "./api";

type View = "overview" | "devices" | "tasks" | "approvals" | "audit" | "policies" | "connections" | "logs";

const TOOLS = [
  "list_devices", "get_device_status", "get_system_info", "get_resource_usage",
  "list_workspace", "read_workspace_file", "search_workspace", "get_service_status",
  "get_recent_logs", "list_processes", "get_disk_usage", "get_memory_usage",
  "list_docker_containers", "git_status", "git_diff", "get_task_status",
  "get_task_result", "get_desktop_status", "create_workspace_file",
  "run_project_tests", "run_linter", "edit_workspace_file", "move_workspace_file",
  "create_backup", "deploy_application", "capture_desktop_screenshot",
  "launch_approved_application", "perform_approved_ui_action",
  "delete_workspace_file", "submit_task", "request_approval", "approve_task", "cancel_task",
  "install_package",
];

function fmt(ts: any): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

function rel(ts: any): string {
  if (!ts) return "never";
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

function Badge({ value, tone }: { value: string; tone?: string }) {
  const colors: Record<string, string> = {
    green: "#0a7d33", red: "#b00", amber: "#8a5a00", grey: "#666", blue: "#1a4d8f",
  };
  const pick = tone || (value === "online" || value === "completed" || value === "approved" || value === "allowed"
    ? "green" : value === "failed" || value === "denied" || value === "revoked" || value === "cancelled"
    ? "red" : value === "pending" || value === "needs_approval" || value === "queued" || value === "running"
    ? "amber" : "grey");
  return <span style={{ background: colors[pick] + "22", color: colors[pick], border: `1px solid ${colors[pick]}55`, borderRadius: 12, padding: "1px 8px", fontSize: 12, fontWeight: 600 }}>{value}</span>;
}

function Card({ title, children }: { title: string; children: any }) {
  return <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, background: "#fff" }}>
    <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>{title}</h3>
    {children}
  </section>;
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: 13 }}>
    <span style={{ width: 130, color: "#444" }}>{label}</span>
    <div style={{ flex: 1, background: "#eee", borderRadius: 4, height: 14, overflow: "hidden" }}>
      <div style={{ width: pct + "%", background: "#1a4d8f", height: "100%" }} />
    </div>
    <span style={{ width: 40, textAlign: "right", fontWeight: 600 }}>{value}</span>
  </div>;
}

function countBy(rows: any[], key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows || []) out[String(r[key] ?? "unknown")] = (out[String(r[key] ?? "unknown")] || 0) + 1;
  return out;
}

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [err, setErr] = useState("");
  const [tok, setTok] = useState(token());
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [me, setMe] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [policy, setPolicy] = useState<any>(null);
  const [policyHistory, setPolicyHistory] = useState<any[]>([]);
  const [connections, setConnections] = useState<any>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [deviceName, setDeviceName] = useState("");
  const [enrolled, setEnrolled] = useState<any>(null);
  const [taskDevice, setTaskDevice] = useState("");
  const [taskTool, setTaskTool] = useState("get_system_info");
  const [taskArgs, setTaskArgs] = useState("");
  const [taskStatus, setTaskStatus] = useState("all");
  const [auditQuery, setAuditQuery] = useState("");
  const [auditTool, setAuditTool] = useState("all");
  const [logService, setLogService] = useState("control");
  const [logCount, setLogCount] = useState(100);
  const [autoRefresh, setAutoRefresh] = useState(false);

  async function load(v: View = view) {
    setErr("");
    try {
      api.me().then(setMe).catch(() => {});
      if (v === "overview") {
        const [h, c, d, t, a, ap] = await Promise.all([
          api.health().catch(() => null), api.connections().catch(() => null),
          api.devices().catch(() => []), api.tasks().catch(() => []),
          api.audit().catch(() => []), api.approvals().catch(() => []),
        ]);
        setHealth(h); setConnections(c); setDevices(d); setTasks(t); setAudit(a); setApprovals(ap);
      } else if (v === "devices") setDevices(await api.devices());
      else if (v === "tasks") { setTasks(await api.tasks()); setDevices(await api.devices()); }
      else if (v === "approvals") setApprovals(await api.approvals());
      else if (v === "audit") setAudit(await api.audit());
      else if (v === "policies") { setPolicy(await api.policies()); setPolicyHistory(await api.policyHistory()); }
      else if (v === "connections") { setConnections(await api.connections()); setHealth(await api.health().catch(() => null)); }
      else if (v === "logs") { const r = await api.logs(logService, logCount); setLogLines(r.lines || []); }
    } catch (e: any) { setErr(e.message); }
  }

  useEffect(() => { if (tok || sessionToken()) load(); }, [view, tok]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const st = params.get("session_token");
    if (st) {
      localStorage.setItem("ai_bridge_session_token", st);
      setTok("session");
      window.history.replaceState({}, "", window.location.pathname);
    }
    api.oidcConfigured().then(r => setOidcEnabled(!!r.enabled)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!autoRefresh || !(tok || sessionToken())) return;
    const id = setInterval(() => load(), 15000);
    return () => clearInterval(id);
  }, [autoRefresh, view, tok, logService, logCount]);

  const authed = !!(tok || sessionToken());
  if (!authed) return (
    <main style={{ fontFamily: "system-ui", maxWidth: 480, margin: "4rem auto", padding: 16 }}>
      <h1>AI Bridge</h1><p>Sign in with the admin token from <code>AI_BRIDGE_ADMIN_TOKEN</code>.</p>
      <form onSubmit={async e => { e.preventDefault(); const f = e.target as any; try { const s = await api.login(f.u.value, f.p.value); localStorage.setItem("ai_bridge_session_token", s.session_token); setTok("session"); } catch { alert("Login failed"); } }}>
        <input name="u" placeholder="Username" style={{ width: "100%", padding: 8 }} />
        <input name="p" type="password" placeholder="Password" style={{ width: "100%", padding: 8, marginTop: 4 }} />
        <button style={{ marginTop: 8, padding: "8px 16px" }}>Sign in as user</button>
      </form>
      <p style={{ color: "#666", fontSize: 13 }}>Or sign in with the legacy admin token:</p>
      <form onSubmit={e => { e.preventDefault(); const v = (e.target as any).t.value; localStorage.setItem("ai_bridge_admin_token", v); setTok(v); }}>
        <input name="t" type="password" placeholder="Admin token" style={{ width: "100%", padding: 8 }} />
        <button style={{ marginTop: 8, padding: "8px 16px" }}>Sign in</button>
      </form>
      {oidcEnabled && <>
        <p style={{ color: "#666", fontSize: 13 }}>Or sign in with single sign-on:</p>
        <button style={{ marginTop: 8, padding: "8px 16px" }} onClick={() => api.oidcLogin()}>Log in with SSO</button>
      </>}
      <p style={{ color: "#666", fontSize: 13 }}>The token is stored only in this browser. Never paste device tokens or API keys into chat.</p>
    </main>
  );

  const online = devices.filter(d => d.status === "online" && !d.revoked);
  const taskByStatus = countBy(tasks, "status");
  const auditByDecision = countBy(audit, "decision");
  const auditByTool = countBy(audit, "tool");
  const topTools = Object.entries(auditByTool).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const audit24h = audit.filter(a => a.ts && Date.now() / 1000 - a.ts < 86400).length;
  const pending = approvals.filter(a => a.status === "pending");
  const maxTask = Math.max(1, ...Object.values(taskByStatus));
  const filteredTasks = taskStatus === "all" ? tasks : tasks.filter(t => t.status === taskStatus);
  const filteredAudit = audit.filter(a => {
    if (auditTool !== "all" && a.tool !== auditTool) return false;
    if (!auditQuery) return true;
    const hay = `${a.actor || ""} ${a.tool || ""} ${a.decision || ""} ${a.device_id || ""}`.toLowerCase();
    return hay.includes(auditQuery.toLowerCase());
  }).slice(0, 100);
  const deviceNameOf = (id: string) => (devices.find(d => d.id === id)?.name || id || "").slice(0, 24);
  const origin = window.location.origin;

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 1100, margin: "0 auto", padding: 16, background: "#f7f7f7", minHeight: "100vh" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>AI Bridge Dashboard</h1>
        <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {me && <span style={{ fontSize: 13 }}>Signed in as <b>{me.username}</b> ({me.role})</span>}
          {health && <Badge value={health.emergency_stop ? "EMERGENCY STOP" : "live"} tone={health.emergency_stop ? "red" : "green"} />}
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} /> auto-refresh</label>
          <button onClick={() => load()}>Refresh</button>
          <button onClick={() => { localStorage.removeItem("ai_bridge_admin_token"); localStorage.removeItem("ai_bridge_session_token"); setTok(""); }}>Log out</button>
          <button style={{ background: "#b00", color: "#fff" }} onClick={async () => { await api.emergencyStop(); alert("Emergency stop active: no new tasks will be accepted."); load(); }}>Emergency stop</button>
          <button onClick={async () => { await api.emergencyClear(); alert("Emergency stop cleared."); load(); }}>Clear stop</button>
        </span>
      </header>
      <nav style={{ display: "flex", gap: 6, margin: "12px 0", flexWrap: "wrap" }}>
        {(["overview", "devices", "tasks", "approvals", "audit", "policies", "connections", "logs"] as View[]).map(v => (
          <button key={v} onClick={() => setView(v)} style={{ fontWeight: view === v ? 700 : 400, textTransform: "capitalize" }}>{v}{v === "approvals" && pending.length > 0 ? ` (${pending.length})` : ""}</button>
        ))}
      </nav>
      {err && <p style={{ color: "#b00" }}>{err} — check that the control plane is reachable and the token is correct.</p>}

      {view === "overview" && <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <Card title="Devices"><div style={{ fontSize: 28, fontWeight: 700 }}>{online.length} / {devices.length}</div><div style={{ fontSize: 13, color: "#666" }}>online</div></Card>
          <Card title="Tasks"><div style={{ fontSize: 28, fontWeight: 700 }}>{tasks.length}</div><div style={{ fontSize: 13, color: "#666" }}>{taskByStatus["queued"] || 0} queued · {taskByStatus["completed"] || 0} done · {taskByStatus["failed"] || 0} failed</div></Card>
          <Card title="Pending approvals"><div style={{ fontSize: 28, fontWeight: 700 }}>{pending.length}</div><div style={{ fontSize: 13, color: "#666" }}>need a human decision</div></Card>
          <Card title="Audit (24 h)"><div style={{ fontSize: 28, fontWeight: 700 }}>{audit24h}</div><div style={{ fontSize: 13, color: "#666" }}>events in the last day</div></Card>
          <Card title="ChatGPT link"><div style={{ fontSize: 15, fontWeight: 700 }}>{connections ? (connections.mcp.up ? "Connected" : "MCP down") : "…"}</div><div style={{ fontSize: 13, color: "#666" }}>{connections ? `${connections.chatgpt.clients.length} OAuth client(s) · ${connections.chatgpt.active_access_tokens} live token(s)` : "loading"}</div></Card>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          <Card title="Tasks by status">{Object.entries(taskByStatus).map(([k, v]) => <Bar key={k} label={k} value={v} max={maxTask} />)}</Card>
          <Card title="Audit by decision">{Object.entries(auditByDecision).map(([k, v]) => <Bar key={k} label={k} value={v} max={Math.max(1, ...Object.values(auditByDecision))} />)}</Card>
          <Card title="Most used tools">{topTools.map(([k, v]) => <Bar key={k} label={k} value={v} max={topTools[0]?.[1] || 1} />)}</Card>
        </div>
        <Card title="Recent activity">
          {audit.slice(0, 10).map(a => <div key={a.id} style={{ fontSize: 13, padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
            <span style={{ color: "#666" }}>{rel(a.ts)}</span> · <b>{a.actor || "?"}</b> · {a.tool} · <Badge value={a.decision || "?"} />
          </div>)}
          {audit.length === 0 && <p style={{ color: "#666", fontSize: 13 }}>No audit events yet.</p>}
        </Card>
        <Card title="Devices at a glance">
          {devices.map(d => <div key={d.id} style={{ fontSize: 13, padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
            <Badge value={d.revoked ? "revoked" : d.status} /> <b>{d.name}</b> <span style={{ color: "#666" }}>{d.hostname || ""} {d.os || ""} · last seen {rel(d.last_seen)}</span>
          </div>)}
          {devices.length === 0 && <p style={{ color: "#666", fontSize: 13 }}>No devices enrolled yet.</p>}
        </Card>
      </div>}

      {view === "devices" && <div style={{ display: "grid", gap: 12 }}>
        <Card title="Enroll a device">
          {me?.role === "viewer" && <p style={{ fontSize: 13, color: "#8a5a00" }}>Enrolling requires admin — your account is viewer. Log in with the admin token, or use an admin account.</p>}
          <form onSubmit={async e => { e.preventDefault(); try { setEnrolled(await api.enroll(deviceName)); setDeviceName(""); load(); } catch (ex: any) { alert(`Enroll failed: ${ex.message}`); } }}>
            <input value={deviceName} onChange={e => setDeviceName(e.target.value)} placeholder="New device name" required />
            <button style={{ marginLeft: 8 }}>Enroll device</button>
          </form>
          {enrolled && <p style={{ background: "#ffe", padding: 8 }}><b>Device token (shown once — copy it now):</b> <code>{enrolled.device_token}</code><br />Device ID: {enrolled.device_id}</p>}
        </Card>
        <Card title={`Devices (${devices.length})`}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead><tr style={{ textAlign: "left", color: "#666" }}><th>Name</th><th>Host / OS</th><th>Status</th><th>Last seen</th><th>Token expires</th><th></th></tr></thead>
            <tbody>{devices.map(d => {
              const expSoon = d.token_expires_at && Date.now() / 1000 > d.token_expires_at - 86400;
              return <tr key={d.id} style={{ borderTop: "1px solid #eee" }}>
                <td><b>{d.name}</b><br /><span style={{ color: "#888" }}>{String(d.id).slice(0, 8)}</span></td>
                <td>{d.hostname || "—"}<br /><span style={{ color: "#888" }}>{d.os || ""}</span></td>
                <td><Badge value={d.revoked ? "revoked" : d.status} /></td>
                <td>{rel(d.last_seen)}<br /><span style={{ color: "#888" }}>{fmt(d.last_seen)}</span></td>
                <td style={{ color: expSoon ? "#b00" : undefined }}>{d.token_expires_at ? rel(d.token_expires_at) : "—"}</td>
                <td>{!d.revoked && <button onClick={async () => { if (confirm(`Revoke device ${d.name}?`)) { try { await api.revoke(d.id); load(); } catch (ex: any) { alert(`Revoke failed: ${ex.message}`); } } }}>Revoke</button>}</td>
              </tr>;
            })}</tbody>
          </table>
        </Card>
      </div>}

      {view === "tasks" && <div style={{ display: "grid", gap: 12 }}>
        <Card title="New task">
          <form onSubmit={async e => { e.preventDefault(); try { let args: any = {}; if (taskArgs.trim()) { try { args = JSON.parse(taskArgs); } catch { alert("Args must be valid JSON, e.g. {\"package_id\": \"Microsoft.VisualStudioCode\"}"); return; } } const r = await api.submitTask(taskDevice, taskTool, args); alert(`Task ${r.task_id} → ${r.status}`); load(); } catch (ex: any) { alert(ex.message); } }}>
            <select value={taskDevice} onChange={e => setTaskDevice(e.target.value)} required>
              <option value="">Select device…</option>
              {devices.filter(d => !d.revoked).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>{" "}
            <select value={taskTool} onChange={e => setTaskTool(e.target.value)}>
              {TOOLS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>{" "}
            <input value={taskArgs} onChange={e => setTaskArgs(e.target.value)} placeholder='Args JSON, e.g. {"package_id": "Microsoft.VisualStudioCode"}' style={{ width: 340 }} />{" "}
            <button>Submit task</button>
            <span style={{ fontSize: 12, color: "#666", marginLeft: 8 }}>High-risk tools need approval first.</span>
          </form>
        </Card>
        <Card title={`Tasks (${filteredTasks.length})`}>
          <div style={{ marginBottom: 8 }}>{["all", "queued", "running", "needs_approval", "completed", "failed", "cancelled"].map(s => (
            <button key={s} onClick={() => setTaskStatus(s)} style={{ fontWeight: taskStatus === s ? 700 : 400, marginRight: 4 }}>{s}</button>
          ))}</div>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead><tr style={{ textAlign: "left", color: "#666" }}><th>ID</th><th>Device</th><th>Tool</th><th>Tier</th><th>Status</th><th>Created</th><th></th></tr></thead>
            <tbody>{filteredTasks.slice(0, 100).map(t => <tr key={t.id} style={{ borderTop: "1px solid #eee" }}>
              <td>{String(t.id).slice(0, 8)}</td><td>{deviceNameOf(t.device_id)}</td><td>{t.tool}</td><td>{t.tier ?? "—"}</td>
              <td><Badge value={t.status} /></td><td>{rel(t.created_at)}</td>
              <td>{!["completed", "failed", "cancelled"].includes(t.status) && <button onClick={async () => { await api.cancelTask(t.id); load(); }}>Cancel</button>}</td>
            </tr>)}</tbody>
          </table>
        </Card>
      </div>}

      {view === "approvals" && <Card title={`Approvals (${approvals.length})`}>
        {approvals.map(a => <div key={a.id} style={{ border: "1px solid #eee", borderRadius: 6, padding: 8, marginBottom: 8, fontSize: 13 }}>
          <Badge value={a.status} /> <b>{a.tool}</b> <span style={{ color: "#666" }}>{a.reason} · {rel(a.created_at)}</span>
          {a.status === "pending" && <span style={{ float: "right" }}>
            <button onClick={async () => { try { await api.decide(a.id, "approved"); load(); } catch (ex: any) { alert(`Decide failed: ${ex.message}`); } }}>Approve</button>{" "}
            <button onClick={async () => { try { await api.decide(a.id, "denied"); load(); } catch (ex: any) { alert(`Decide failed: ${ex.message}`); } }}>Deny</button>
          </span>}
        </div>)}
        {approvals.length === 0 && <p style={{ color: "#666", fontSize: 13 }}>No approvals yet.</p>}
      </Card>}

      {view === "audit" && <Card title={`Audit (${filteredAudit.length} shown)`}>
        <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
          <input value={auditQuery} onChange={e => setAuditQuery(e.target.value)} placeholder="Search actor, tool, decision…" style={{ flex: 1, padding: 6 }} />
          <select value={auditTool} onChange={e => setAuditTool(e.target.value)}>
            <option value="all">All tools</option>
            {[...new Set(audit.map(a => a.tool).filter(Boolean))].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead><tr style={{ textAlign: "left", color: "#666" }}><th>Time</th><th>Actor</th><th>Device</th><th>Tool</th><th>Decision</th></tr></thead>
          <tbody>{filteredAudit.map(a => <tr key={a.id} style={{ borderTop: "1px solid #eee" }}>
            <td>{fmt(a.ts)}</td><td>{a.actor || "—"}</td><td>{a.device_id ? String(a.device_id).slice(0, 8) : "—"}</td><td>{a.tool}</td><td><Badge value={a.decision || "?"} /></td>
          </tr>)}</tbody>
        </table>
      </Card>}

      {view === "policies" && <div style={{ display: "grid", gap: 12 }}>
        <Card title={`Current policy (v${policy?.version ?? "?"})`}>
          {policy ? <>
            <p style={{ fontSize: 13 }}>Tier-3 allowed: <b>{String(policy.policy?.allow_tier3)}</b> · Desktop enabled: <b>{String(policy.policy?.desktop_enabled)}</b></p>
            <p style={{ fontSize: 13 }}>Allowed apps: {(policy.policy?.allowed_apps || []).join(", ") || "none"}</p>
            <p style={{ fontSize: 13 }}>Allowed services: {(policy.policy?.allowed_services || []).join(", ") || "none"}</p>
            <button onClick={async () => { const cur = policy.policy?.allow_tier3; await api.createPolicy(!cur); load(); }}>Toggle Tier-3 (currently {String(policy.policy?.allow_tier3)})</button>
          </> : <p style={{ color: "#666", fontSize: 13 }}>Loading…</p>}
        </Card>
        <Card title="Policy history">
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead><tr style={{ textAlign: "left", color: "#666" }}><th>Version</th><th>Created</th><th>By</th><th>Note</th><th>Summary</th></tr></thead>
            <tbody>{policyHistory.map(p => { let pol: any = {}; try { pol = JSON.parse(p.policy_json); } catch { /* keep empty */ } return <tr key={p.version} style={{ borderTop: "1px solid #eee" }}>
              <td>v{p.version}</td><td>{fmt(p.created_at)}</td><td>{p.created_by || "—"}</td><td>{p.note || "—"}</td>
              <td>tier3={String(pol.allow_tier3)} desktop={String(pol.desktop_enabled)}</td>
            </tr>; })}</tbody>
          </table>
        </Card>
      </div>}

      {view === "connections" && <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <Card title="Control plane"><Badge value={health ? (health.emergency_stop ? "emergency stop" : "up") : "unknown"} /><p style={{ fontSize: 13 }}>Version {health?.version || "?"}</p><p style={{ fontSize: 13, wordBreak: "break-all" }}>{origin}/api</p></Card>
          <Card title="MCP server (ChatGPT path)"><Badge value={connections ? (connections.mcp.up ? "up" : "down") : "unknown"} /><p style={{ fontSize: 13 }}>Loopback :{connections?.mcp.port || 8001} · proxied at</p><p style={{ fontSize: 13, wordBreak: "break-all" }}>{origin}/mcp</p></Card>
          <Card title="OAuth gateway"><Badge value={connections ? (connections.oauth_gateway.up ? "up" : "down") : "unknown"} /><p style={{ fontSize: 13 }}>Loopback :{connections?.oauth_gateway.port || 8002}</p><p style={{ fontSize: 13 }}>Issues ChatGPT tokens, refresh rotation on</p></Card>
          <Card title="Dashboard"><Badge value="up" tone="green" /><p style={{ fontSize: 13, wordBreak: "break-all" }}>{origin}/</p><p style={{ fontSize: 13 }}>Health: {origin}/health</p></Card>
        </div>
        <Card title="ChatGPT connection">
          {connections ? <>
            <p style={{ fontSize: 13 }}>OAuth clients: <b>{connections.chatgpt.clients.length}</b> · Active access tokens: <b>{connections.chatgpt.active_access_tokens}</b> · Active refresh tokens: <b>{connections.chatgpt.active_refresh_tokens}</b> · Last token activity: <b>{rel(connections.chatgpt.last_token_at)}</b></p>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead><tr style={{ textAlign: "left", color: "#666" }}><th>Client</th><th>ID prefix</th><th>Redirect URIs</th><th>Registered</th></tr></thead>
              <tbody>{connections.chatgpt.clients.map((c: any, i: number) => <tr key={i} style={{ borderTop: "1px solid #eee" }}>
                <td>{c.client_name || "ChatGPT client"}</td><td><code>{c.client_id_prefix}…</code></td><td style={{ wordBreak: "break-all" }}>{c.redirect_uris}</td><td>{fmt(c.created_at)}</td>
              </tr>)}</tbody>
            </table>
            {connections.chatgpt.clients.length === 0 && <p style={{ color: "#666", fontSize: 13 }}>No OAuth clients registered yet — connect ChatGPT to see it here.</p>}
          </> : <p style={{ color: "#666", fontSize: 13 }}>Loading…</p>}
        </Card>
        <Card title="Endpoints">
          <ul style={{ fontSize: 13, lineHeight: 1.8 }}>
            <li>Dashboard: <code>{origin}/</code></li>
            <li>MCP (ChatGPT): <code>{origin}/mcp</code></li>
            <li>Control API: <code>{origin}/api</code> (health at <code>{origin}/health</code>)</li>
            <li>Enrolled devices poll the control API; ChatGPT talks to the MCP endpoint through OAuth.</li>
          </ul>
        </Card>
      </div>}

      {view === "logs" && <Card title="Service logs">
        <div style={{ marginBottom: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={logService} onChange={e => { setLogService(e.target.value); }}>
            <option value="control">Control plane</option>
            <option value="mcp">MCP server</option>
            <option value="oauth">OAuth gateway</option>
            <option value="nginx">nginx (MCP/API traffic)</option>
          </select>
          <select value={logCount} onChange={e => setLogCount(Number(e.target.value))}>
            <option value={50}>50 lines</option>
            <option value={100}>100 lines</option>
            <option value={200}>200 lines</option>
          </select>
          <button onClick={() => load()}>Refresh logs</button>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} /> auto-refresh (15 s)</label>
        </div>
        <pre style={{ whiteSpace: "pre-wrap", background: "#111", color: "#ddd", padding: 12, borderRadius: 6, fontSize: 12, maxHeight: 600, overflow: "auto" }}>{logLines.join("\n") || "No log lines (or the service has not logged yet)."}</pre>
      </Card>}
    </main>
  );
}
