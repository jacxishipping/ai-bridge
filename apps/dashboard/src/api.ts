const defaultBase =
  typeof window !== "undefined" && window.location.port !== "5173"
    ? window.location.origin
    : "http://127.0.0.1:8000";
const BASE = (import.meta as any).env?.VITE_API_URL || defaultBase;
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
  updateDevice: (id: string, body: { name?: string; hostname?: string; os?: string; revoked?: boolean }) =>
    call(`/api/devices/${encodeURIComponent(id)}`, "PUT", body),
  deleteDevice: (id: string) => call(`/api/devices/${encodeURIComponent(id)}`, "DELETE"),
  tasks: () => call("/api/tasks"),
  taskDetail: (id: string) => call(`/api/tasks/${id}`),
  submitTask: (device_id: string, tool: string, args: any = {}) => call("/api/tasks", "POST", { device_id, tool, args }),
  cancelTask: (id: string) => call(`/api/tasks/${id}/cancel`, "POST", {}),
  updateTask: (id: string, body: { tool?: string; args?: any; status?: string }) =>
    call(`/api/tasks/${encodeURIComponent(id)}`, "PUT", body),
  deleteTask: (id: string) => call(`/api/tasks/${encodeURIComponent(id)}`, "DELETE"),
  clearTasks: (status?: string) =>
    call(`/api/tasks${status && status !== "all" ? `?status=${encodeURIComponent(status)}` : ""}`, "DELETE"),
  approvals: () => call("/api/approvals"),
  decide: (id: string, decision: string) => call(`/api/approvals/${id}/decide`, "POST", { decision }),
  updateApproval: (id: string, body: { reason?: string; status?: string }) =>
    call(`/api/approvals/${encodeURIComponent(id)}`, "PUT", body),
  deleteApproval: (id: string) => call(`/api/approvals/${encodeURIComponent(id)}`, "DELETE"),
  audit: () => call("/api/audit"),
  updateAudit: (id: number, body: { actor?: string; tool?: string; decision?: string; result?: string }) =>
    call(`/api/audit/${id}`, "PUT", body),
  deleteAudit: (id: number) => call(`/api/audit/${id}`, "DELETE"),
  clearAudit: () => call("/api/audit", "DELETE"),
  emergencyStop: () => call("/api/emergency-stop", "POST", {}),
  emergencyClear: () => call("/api/emergency-stop/clear", "POST", {}),
  login: (username: string, password: string) => fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) }).then(async r => { if (!r.ok) throw new Error("Login failed"); return r.json(); }),
  policies: () => call("/api/policies"),
  policyHistory: () => call("/api/policies/history"),
  updatePolicyVersion: (version: number, p: { allow_tier3: boolean; desktop_enabled: boolean; allowed_apps: string[]; allowed_services: string[]; note?: string }) =>
    call(`/api/policies/${version}`, "PUT", p),
  deletePolicyVersion: (version: number) => call(`/api/policies/${version}`, "DELETE"),
  connections: () => call("/api/connections"),
  updateOAuthClient: (client_id: string, body: { client_name?: string; redirect_uris?: string }) =>
    call(`/api/connections/clients/${encodeURIComponent(client_id)}`, "PUT", body),
  deleteOAuthClient: (client_id: string) =>
    call(`/api/connections/clients/${encodeURIComponent(client_id)}`, "DELETE"),
  logs: (service: string, lines: number) => call(`/api/logs?service=${service}&lines=${lines}`),
  createPolicy: (p: { allow_tier3: boolean; desktop_enabled: boolean; allowed_apps: string[]; allowed_services: string[]; note?: string }) =>
    call("/api/policies", "POST", {
      allow_tier3: p.allow_tier3,
      desktop_enabled: p.desktop_enabled,
      allowed_apps: p.allowed_apps,
      allowed_services: p.allowed_services,
      note: p.note || "Set from dashboard",
    }),
  getWebhook: () => call("/api/settings/webhook"),
  setWebhook: (webhook_url: string) => call("/api/settings/webhook", "POST", { webhook_url }),
  testWebhook: () => call("/api/settings/webhook/test", "POST", {}),
  oidcConfigured: () => fetch(BASE + "/api/auth/oidc/configured").then(r => r.json()),
  me: () => call("/api/auth/me"),
  oidcLogin: () => { window.location.href = BASE + "/api/auth/oidc/login"; },
};
