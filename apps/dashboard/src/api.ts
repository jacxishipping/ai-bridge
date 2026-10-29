const envBase = (import.meta as any).env?.VITE_API_URL || "";
const isProdOrigin =
  typeof window !== "undefined" &&
  window.location.port !== "5173" &&
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1";
const BASE =
  envBase || (isProdOrigin ? window.location.origin : "http://127.0.0.1:8000");

export function token() { return localStorage.getItem("ai_bridge_admin_token") || ""; }
export function sessionToken() { return localStorage.getItem("ai_bridge_session_token") || ""; }

async function call(path: string, method = "GET", body?: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const st = sessionToken();
  const at = token();
  if (st) headers["X-Session-Token"] = st;
  else if (at) headers["X-Admin-Token"] = at;
  let res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) {
    localStorage.removeItem("ai_bridge_session_token");
    if (st && at) {
      // Expired session token in localStorage; clear it and retry with admin token
      delete headers["X-Session-Token"];
      headers["X-Admin-Token"] = at;
      res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    }
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
  devicePolicy: (id: string) => call(`/api/devices/${encodeURIComponent(id)}/policy`),
  setDevicePolicy: (id: string, body: any) => call(`/api/devices/${encodeURIComponent(id)}/policy`, "PUT", body),
  resetDevicePolicy: (id: string) => call(`/api/devices/${encodeURIComponent(id)}/policy`, "DELETE"),
  deviceOverview: (id: string) => call(`/api/devices/${encodeURIComponent(id)}/overview`),
  refreshDeviceTelemetry: (id: string, tools?: string[]) =>
    call(`/api/devices/${encodeURIComponent(id)}/refresh`, "POST", { tools }),
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
  aiTools: (format = "raw", device?: string) =>
    call(`/api/ai/tools?format=${encodeURIComponent(format)}${device ? `&device=${encodeURIComponent(device)}` : ""}`),
  aiExecute: (body: { tool: string; device?: string; args?: any; timeout?: number }) =>
    call("/api/ai/execute", "POST", body),
  aiAgent: (body: { prompt: string; device?: string; provider?: string; model?: string; api_key?: string; base_url?: string }) =>
    call("/api/ai/agent", "POST", body),
  aiFleet: () => call("/api/ai/devices"),
  getAiSettings: () => call("/api/settings/ai"),
  saveAiSettings: (body: { provider: string; model?: string; api_key?: string; base_url?: string; test_connection?: boolean; clear?: boolean }) =>
    call("/api/settings/ai", "POST", body),
  aiChat: (body: { messages: any[]; provider?: string; model?: string; api_key?: string; base_url?: string; device?: string }) =>
    call("/api/ai/chat", "POST", body),
  workflowTemplates: () => call("/api/workflows/templates"),
  workflows: (status?: string) => call(`/api/workflows${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  workflowDetail: (id: string) => call(`/api/workflows/${encodeURIComponent(id)}`),
  submitWorkflow: (body: { name: string; device_id?: string; steps: any[]; stop_on_failure?: boolean; max_retries?: number }) =>
    call("/api/workflows", "POST", body),
  cancelWorkflow: (id: string) => call(`/api/workflows/${encodeURIComponent(id)}/cancel`, "POST", {}),
  streamWorkflowUrl: (id: string) => `${BASE}/api/workflows/${encodeURIComponent(id)}/stream`,
  fleetTelemetry: () => call("/api/fleet/telemetry"),
  deviceTelemetry: (id: string, limit = 50) => call(`/api/devices/${encodeURIComponent(id)}/telemetry?limit=${limit}`),
  fleetBroadcast: (body: { tool: string; args?: any; target_os?: string; target_device_ids?: string[] }) =>
    call("/api/fleet/broadcast", "POST", body),
  broadcastStatus: (batch_id: string) => call(`/api/fleet/broadcast/${encodeURIComponent(batch_id)}`),
  triggers: () => call("/api/triggers"),
  createTrigger: (body: any) => call("/api/triggers", "POST", body),
  deleteTrigger: (id: string) => call(`/api/triggers/${encodeURIComponent(id)}`, "DELETE"),
  toggleTrigger: (id: string) => call(`/api/triggers/${encodeURIComponent(id)}/toggle`, "POST", {}),
  testTrigger: (id: string) => call(`/api/triggers/${encodeURIComponent(id)}/test`, "POST", {}),
  schedules: () => call("/api/schedules"),
  createSchedule: (body: any) => call("/api/schedules", "POST", body),
  deleteSchedule: (id: string) => call(`/api/schedules/${encodeURIComponent(id)}`, "DELETE"),
  runScheduleNow: (id: string) => call(`/api/schedules/${encodeURIComponent(id)}/run-now`, "POST", {}),
  desktopFrame: (deviceId: string, scale = 0.75, quality = 70) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/desktop/frame?scale=${scale}&quality=${quality}`),
  createWebrtcSession: (deviceId: string, scale = 0.75, fps = 10) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/desktop/webrtc/session`, "POST", { scale, fps }),
  getWebrtcSession: (deviceId: string, sessionId: string) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/desktop/webrtc/${encodeURIComponent(sessionId)}`),
  postWebrtcAnswer: (deviceId: string, sessionId: string, answer: any) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/desktop/webrtc/${encodeURIComponent(sessionId)}/answer`, "POST", answer),
  postWebrtcCandidate: (deviceId: string, sessionId: string, candidate: any) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/desktop/webrtc/${encodeURIComponent(sessionId)}/candidates`, "POST", { candidate }),
  endWebrtcSession: (deviceId: string, sessionId: string) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/desktop/webrtc/${encodeURIComponent(sessionId)}`, "DELETE"),
  sendDesktopInput: (deviceId: string, body: any) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/desktop/input`, "POST", body),
  fleetVersion: () => call("/api/fleet/version"),
  updateFleet: (targetOs?: string) =>
    call(`/api/fleet/update${targetOs ? `?target_os=${encodeURIComponent(targetOs)}` : ""}`, "POST", {}),
  updateDeviceAgent: (deviceId: string) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/update`, "POST", {}),
};
