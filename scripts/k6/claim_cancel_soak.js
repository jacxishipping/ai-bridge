/**
 * k6 cluster soak for concurrent claim/cancel against a live control plane.
 *
 * Usage:
 *   k6 run -e BASE_URL=https://control.example -e ADMIN_TOKEN=... -e VUS=20 -e DURATION=5m \
 *     scripts/k6/claim_cancel_soak.js
 *
 * Locust alternative: scripts/locust/claim_cancel_soak.py
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE = (__ENV.BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const ADMIN = __ENV.ADMIN_TOKEN || "";
const claimLatency = new Trend("claim_latency_ms");

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "2m",
  thresholds: {
    claim_latency_ms: ["p(95)<5000"],
    http_req_failed: ["rate<0.05"],
  },
};

function adminHeaders() {
  return { "X-Admin-Token": ADMIN, "Content-Type": "application/json" };
}

export function setup() {
  if (!ADMIN) {
    throw new Error("ADMIN_TOKEN required");
  }
  const enroll = http.post(
    `${BASE}/api/devices/enroll`,
    JSON.stringify({ name: `k6-${__VU || 0}`, os: "Linux" }),
    { headers: adminHeaders() }
  );
  check(enroll, { "enroll 200": (r) => r.status === 200 });
  const body = enroll.json();
  return { device_id: body.device_id, device_token: body.device_token };
}

export default function (data) {
  const create = http.post(
    `${BASE}/api/tasks`,
    JSON.stringify({
      device_id: data.device_id,
      tool: "get_system_info",
      args: {},
    }),
    { headers: adminHeaders() }
  );
  check(create, { "task created": (r) => r.status === 200 || r.status === 201 });

  const t0 = Date.now();
  const next = http.get(`${BASE}/api/agent/tasks/next?wait=0`, {
    headers: { "X-Device-Token": data.device_token },
  });
  claimLatency.add(Date.now() - t0);
  const task = next.json("task");
  if (task && task.id) {
    if (__ITER % 3 === 0) {
      http.post(`${BASE}/api/tasks/${task.id}/cancel`, null, { headers: adminHeaders() });
    } else {
      http.post(
        `${BASE}/api/agent/tasks/${task.id}/result`,
        JSON.stringify({ status: "completed", result: "{}" }),
        { headers: { "X-Device-Token": data.device_token, "Content-Type": "application/json" } }
      );
    }
  }
  sleep(0.2);
}
