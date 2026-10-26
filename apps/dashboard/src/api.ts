const envBase = (import.meta as any).env?.VITE_API_URL || "";
const isProdOrigin =
  typeof window !== "undefined" &&
  window.location.port !== "5173" &&
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1";
const BASE =
  isProdOrigin
    ? window.location.origin
    : envBase || (typeof window !== "undefined" && window.location.port !== "5173" ? window.location.origin : "http://127.0.0.1:8000");

export function token() { return localStorage.getItem("ai_bridge_admin_token") || ""; }
export function sessionToken() { return localStorage.getItem("ai_bridge_session_token") || ""; }

async function call(path: string, method = "GET", body?: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const st = sessionToken();
  const at = token();
  if (st) headers["X-Session-Token"] = st;
  else if (at) headers["X-Admin-Token"] = at;
  let res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && st && at) {
    // Expired session token in localStorage; clear it and retry with admin token
    localStorage.removeItem("ai_bridge_session_token");
    delete headers["X-Session-Token"];
    headers["X-Admin-Token"] = at;
    res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  }
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
  deleteApproval: (id: string) => call(`/api/approvals/${encodeURIComponent(id)}`, "DELETE"),
  audit: () => call("/api/audit"),
  exportAudit: () => call("/api/audit/export"),
  logout: () => call("/api/auth/logout", "POST", {}),
  emergencyStop: () => call("/api/emergency-stop", "POST", {}),
  emergencyClear: () => call("/api/emergency-stop/clear", "POST", {}),
  login: (username: string, password: string) => fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) }).then(async r => { if (!r.ok) throw new Error("Login failed"); return r.json(); }),
  logout: () => call("/api/auth/logout", "POST", {}),
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
