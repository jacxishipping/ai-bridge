import { useEffect, useState } from "react";
import { api, token, sessionToken } from "./api";

type View = "devices" | "tasks" | "approvals" | "audit" | "policies";
export default function App() {
  const [view, setView] = useState<View>("devices");
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [tok, setTok] = useState(token());
  const [deviceName, setDeviceName] = useState("");
  const [enrolled, setEnrolled] = useState<any>(null);

  async function load(v: View = view) {
    setErr("");
    try {
      const fn = { devices: api.devices, tasks: api.tasks, approvals: api.approvals, audit: api.audit, policies: api.policies }[v];
      setData(await fn());
    } catch (e: any) { setErr(e.message); setData(null); }
  }
  useEffect(() => { if (tok || sessionToken()) load(); }, [view, tok]);

  if (!tok && !sessionToken()) return (
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
      <p style={{ color: "#666", fontSize: 13 }}>The token is stored only in this browser. Never paste device tokens or API keys into chat.</p>
    </main>
  );

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1>AI Bridge Dashboard</h1>
        <span>
          <button onClick={() => { localStorage.removeItem("ai_bridge_admin_token"); localStorage.removeItem("ai_bridge_session_token"); setTok(""); }}>Log out</button>{" "}
          <button style={{ background: "#b00", color: "#fff" }} onClick={async () => { await api.emergencyStop(); alert("Emergency stop active: no new tasks will be accepted."); }}>Emergency stop</button>{" "}
          <button onClick={async () => { await api.emergencyClear(); alert("Emergency stop cleared."); }}>Clear stop</button>
        </span>
      </header>
      <nav style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        {(["devices", "tasks", "approvals", "audit", "policies"] as View[]).map(v => (
          <button key={v} onClick={() => setView(v)} style={{ fontWeight: view === v ? 700 : 400 }}>{v}</button>
        ))}
        <button onClick={() => load()}>Refresh</button>
      </nav>
      {err && <p style={{ color: "#b00" }}>{err} — check that the control plane is running on :8000 and the token is correct.</p>}
      {view === "policies" && (
        <section>
          <p>Current versioned policy. Toggling Tier 3 creates a new versioned policy record (audited).</p>
          <button onClick={async () => { const cur = (data as any)?.policy?.allow_tier3; await api.createPolicy(!cur); load(); }}>Toggle Tier-3 allowed (currently {String((data as any)?.policy?.allow_tier3)})</button>
        </section>
      )}
      {view === "devices" && (
        <section>
          <form onSubmit={async e => { e.preventDefault(); setEnrolled(await api.enroll(deviceName)); setDeviceName(""); load(); }}>
            <input value={deviceName} onChange={e => setDeviceName(e.target.value)} placeholder="New device name" required />
            <button>Enroll device</button>
          </form>
          {enrolled && <p style={{ background: "#ffe", padding: 8 }}><b>Device token (shown once — copy it now):</b> <code>{enrolled.device_token}</code><br/>Device ID: {enrolled.device_id}</p>}
        </section>
      )}
      <pre style={{ whiteSpace: "pre-wrap", background: "#f4f4f4", padding: 12, overflowX: "auto" }}>{JSON.stringify(data, null, 2)}</pre>
      {view === "approvals" && Array.isArray(data) && data.map((a: any) => (
        <div key={a.id} style={{ border: "1px solid #ddd", padding: 8, marginBottom: 8 }}>
          {a.tool} — {a.status} — {a.reason}
          {a.status === "pending" && <>
            <button onClick={async () => { await api.decide(a.id, "approved"); load(); }}>Approve</button>{" "}
            <button onClick={async () => { await api.decide(a.id, "denied"); load(); }}>Deny</button>
          </>}
        </div>
      ))}
      {view === "tasks" && Array.isArray(data) && data.map((t: any) => (
        <div key={t.id} style={{ border: "1px solid #ddd", padding: 8, marginBottom: 8 }}>
          {t.tool} on {t.device_id} — <b>{t.status}</b>
          {["queued", "running"].includes(t.status) && <button onClick={async () => { await api.cancelTask(t.id); load(); }}>Cancel</button>}
          {t.result && <pre style={{ whiteSpace: "pre-wrap" }}>{t.result}</pre>}
        </div>
      ))}
      {view === "devices" && Array.isArray(data) && data.map((d: any) => (
        <div key={d.id} style={{ border: "1px solid #ddd", padding: 8, marginBottom: 8 }}>
          {d.name} ({d.os}) — {d.status}{d.revoked ? " — REVOKED" : ""}
          {!d.revoked && <button onClick={async () => { if (confirm(`Revoke ${d.name}? Its token stops working immediately.`)) { await api.revoke(d.id); load(); } }}>Revoke</button>}
        </div>
      ))}
    </main>
  );
}
