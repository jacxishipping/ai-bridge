const BASE = (import.meta as any).env?.VITE_API_URL || "http://127.0.0.1:8000";
export function token() { return localStorage.getItem("ai_bridge_admin_token") || ""; }
export function sessionToken() { return localStorage.getItem("ai_bridge_session_token") || ""; }
async function call(path: string, method = "GET", body?: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionToken()) headers["X-Session-Token"] = sessionToken(); else if (token()) headers["X-Admin-Token"] = token();
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  return res.json();
}
export const api = {
  health: () => fetch(BASE + "/health").then(r => r.json()),
  devices: () => call("/api/devices"),
  enroll: (name: string) => call("/api/devices/enroll", "POST", { name }),
  revoke: (id: string) => call(`/api/devices/${id}/revoke`, "POST", {}),
  tasks: () => call("/api/tasks"),
  submitTask: (device_id: string, tool: string) => call("/api/tasks", "POST", { device_id, tool, args: {} }),
  cancelTask: (id: string) => call(`/api/tasks/${id}/cancel`, "POST", {}),
  approvals: () => call("/api/approvals"),
  decide: (id: string, decision: string) => call(`/api/approvals/${id}/decide`, "POST", { decision }),
  audit: () => call("/api/audit"),
  emergencyStop: () => call("/api/emergency-stop", "POST", {}),
  emergencyClear: () => call("/api/emergency-stop/clear", "POST", {}),
  login: (username: string, password: string) => fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) }).then(async r => { if (!r.ok) throw new Error("Login failed"); return r.json(); }),
  policies: () => call("/api/policies"),
  createPolicy: (allow_tier3: boolean) => call("/api/policies", "POST", { allow_tier3, desktop_enabled: false, allowed_apps: [], allowed_services: [], note: "Set from dashboard" }),
  oidcConfigured: () => fetch(BASE + "/api/auth/oidc/configured").then(r => r.json()),
  oidcLogin: () => { window.location.href = BASE + "/api/auth/oidc/login"; },
};
