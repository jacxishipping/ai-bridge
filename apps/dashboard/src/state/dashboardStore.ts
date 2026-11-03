/**
 * AI Bridge Enterprise Dashboard — Reactive State Store & Mock Data
 * Realistic operational state for 40 fleet nodes, tasks, urgent approvals,
 * workflows, audit ledger, MCP streams, and system logs.
 */

import { useSyncExternalStore } from "react";
import type {
  EnrolledDevice,
  DeviceTelemetry,
  TaskInvocation,
  ApprovalRequest,
  WorkflowPlan,
  AuditEvent,
  MCPConnection,
  OAuthClient,
  LogRecord,
  ViewId,
  TaskDispatchParams,
  DashboardStoreState,
  OperatorProfile,
} from "../types/dashboard";

// Helper to generate deterministic telemetry
function createTelemetry(
  index: number,
  isOnline: boolean,
  isGpu = false
): DeviceTelemetry {
  const baseCpu = isOnline ? 18 + (index * 7) % 55 : 0;
  const memTotal = isGpu ? 128 : (index % 3 === 0 ? 64 : 32);
  const memUsed = isOnline ? Math.round((memTotal * (0.25 + (index * 9) % 55) / 100) * 10) / 10 : 0;
  const diskTotal = isGpu ? 2048 : (index % 2 === 0 ? 1000 : 500);
  const diskUsed = isOnline ? Math.round(diskTotal * (0.35 + (index * 4) % 45) / 100) : 0;

  return {
    cpuPercent: baseCpu,
    cpuCores: isGpu
      ? [baseCpu + 5, baseCpu - 3, baseCpu + 8, baseCpu, baseCpu - 5, baseCpu + 2, baseCpu - 1, baseCpu + 4, 20, 22, 18, 25, 30, 28, 15, 12]
      : [baseCpu + 4, baseCpu - 2, baseCpu + 6, baseCpu - 5, baseCpu + 1, baseCpu, baseCpu - 3, baseCpu + 2],
    cpuClockGhz: isGpu ? 4.2 : 3.6 + (index % 4) * 0.2,
    memoryUsedGb: memUsed,
    memoryTotalGb: memTotal,
    swapUsedGb: isOnline ? (index % 2 === 0 ? 0.4 : 1.2) : 0,
    swapTotalGb: 8.0,
    diskUsedGb: diskUsed,
    diskTotalGb: diskTotal,
    diskPercent: Math.round((diskUsed / diskTotal) * 100),
    networkRxMbps: isOnline ? Math.round((2.4 + (index * 1.3) % 8.5) * 10) / 10 : 0,
    networkTxMbps: isOnline ? Math.round((0.8 + (index * 0.9) % 4.2) * 10) / 10 : 0,
    ipAddress: `10.244.${Math.floor(index / 10) + 12}.${(index % 250) + 10}`,
    uptimeSeconds: isOnline ? 345600 + index * 43200 : 0,
    tpmStatus: index % 5 === 0 ? "inactive" : "active",
    certExpiryDays: 42 + (index * 3) % 90,
    fingerprintSha256: `sha256:${(index * 9876543210 + 123456789).toString(16).padStart(64, "0")}`,
  };
}

// Generate the 40 realistic enrolled nodes
export const SEED_DEVICES: EnrolledDevice[] = Array.from({ length: 40 }, (_, i) => {
  const index = i + 1;
  const isOnline = index <= 38;
  const isUnresponsive = index === 39;
  const isOffline = index === 40;

  const status = isOffline ? "offline" : isUnresponsive ? "unresponsive" : "online";

  if (index === 1) {
    // Primary showcase node
    return {
      id: "srv-us-east-412",
      hostname: "srv-us-east-412.infra.internal",
      name: "US-East Core Controller 412",
      platform: "linux",
      osRelease: "Ubuntu 24.04.1 LTS",
      arch: "x86_64",
      status: "online",
      lastHeartbeat: new Date(Date.now() - 4000).toISOString(),
      pollIntervalSec: 10,
      latencyMs: 14,
      workspacePath: "/opt/ai-bridge/workspace",
      assignedModels: ["Claude 3.5 Sonnet", "GPT-4o"],
      tags: ["production-east", "core-gateway", "pci-compliant"],
      telemetry: {
        cpuPercent: 28.4,
        cpuCores: [32, 24, 30, 26, 34, 22, 28, 21],
        cpuClockGhz: 3.8,
        memoryUsedGb: 18.4,
        memoryTotalGb: 64.0,
        swapUsedGb: 0.4,
        swapTotalGb: 8.0,
        diskUsedGb: 210,
        diskTotalGb: 500,
        diskPercent: 42,
        networkRxMbps: 4.2,
        networkTxMbps: 1.1,
        ipAddress: "10.244.18.99",
        uptimeSeconds: 846200,
        tpmStatus: "active",
        certExpiryDays: 42,
        fingerprintSha256: "sha256:d9a4f2108b1e43cb98016b01e38921a4fa0c558913b8e434220b22f0981e4b3c",
      },
    };
  }

  // 24 Windows nodes total (indices 2..24 + ws/cad)
  if (index <= 12) {
    const num = String(index).padStart(2, "0");
    return {
      id: `srv-win-prod-${num}`,
      hostname: `srv-win-prod-${num}.ad.internal`,
      name: `Prod Windows Server ${num}`,
      platform: "windows",
      osRelease: "Windows Server 2022 Datacenter",
      arch: "x86_64",
      status,
      lastHeartbeat: new Date(Date.now() - (index * 2000)).toISOString(),
      pollIntervalSec: 10,
      latencyMs: 12 + (index % 5) * 3,
      workspacePath: `C:\\ai-bridge\\workspace`,
      assignedModels: ["Claude 3.5 Sonnet"],
      tags: ["production-windows", "active-directory"],
      telemetry: createTelemetry(index, isOnline),
    };
  }

  if (index <= 18) {
    const num = String(index - 12).padStart(2, "0");
    return {
      id: `ws-fin-win-${num}`,
      hostname: `ws-fin-win-${num}.finance.internal`,
      name: `Finance Workstation ${num}`,
      platform: "windows",
      osRelease: "Windows 11 Pro 23H2",
      arch: "x86_64",
      status,
      lastHeartbeat: new Date(Date.now() - (index * 3000)).toISOString(),
      pollIntervalSec: 15,
      latencyMs: 18 + (index % 4) * 2,
      workspacePath: `C:\\Users\\Operator\\Workspace`,
      assignedModels: ["GPT-4o"],
      tags: ["finance-enclave", "restricted"],
      telemetry: createTelemetry(index, isOnline),
    };
  }

  if (index <= 24) {
    const num = String(index - 18).padStart(2, "0");
    return {
      id: `cad-gpu-win-${num}`,
      hostname: `cad-gpu-win-${num}.design.internal`,
      name: `CAD GPU Node ${num}`,
      platform: "windows",
      osRelease: "Windows 11 Pro 23H2",
      arch: "x86_64",
      status,
      lastHeartbeat: new Date(Date.now() - (index * 2500)).toISOString(),
      pollIntervalSec: 10,
      latencyMs: 16 + (index % 3) * 4,
      workspacePath: `D:\\ai-bridge\\render-cache`,
      assignedModels: ["Claude 3.5 Sonnet", "Gemini 1.5 Pro"],
      tags: ["gpu-rendering", "high-memory"],
      telemetry: createTelemetry(index, isOnline, true),
    };
  }

  // 12 Linux nodes (indices 25..36)
  if (index <= 30) {
    const num = String(index - 24).padStart(2, "0");
    return {
      id: `srv-us-west-${num}`,
      hostname: `srv-us-west-${num}.cloud.internal`,
      name: `US-West Compute ${num}`,
      platform: "linux",
      osRelease: "Ubuntu 24.04.1 LTS",
      arch: "x86_64",
      status,
      lastHeartbeat: new Date(Date.now() - (index * 1500)).toISOString(),
      pollIntervalSec: 10,
      latencyMs: 38 + (index % 6) * 2,
      workspacePath: `/var/ai-bridge/worker`,
      assignedModels: ["Claude 3.5 Sonnet"],
      tags: ["production-west", "cloud-worker"],
      telemetry: createTelemetry(index, isOnline),
    };
  }

  if (index <= 34) {
    const num = String(index - 30).padStart(2, "0");
    return {
      id: `k8s-node-worker-${num}`,
      hostname: `k8s-worker-${num}.cluster.internal`,
      name: `Kubernetes Node ${num}`,
      platform: "linux",
      osRelease: "Debian 12 Bookworm",
      arch: "x86_64",
      status,
      lastHeartbeat: new Date(Date.now() - (index * 2200)).toISOString(),
      pollIntervalSec: 5,
      latencyMs: 8 + (index % 3) * 2,
      workspacePath: `/data/k8s/ai-bridge`,
      assignedModels: ["GPT-4o"],
      tags: ["k8s-cluster", "ephemeral"],
      telemetry: createTelemetry(index, isOnline),
    };
  }

  if (index <= 36) {
    const num = String(index - 34).padStart(2, "0");
    return {
      id: `gpu-infer-h100-${num}`,
      hostname: `gpu-h100-${num}.ml.internal`,
      name: `NVIDIA H100 Node ${num}`,
      platform: "linux",
      osRelease: "Ubuntu 22.04 LTS",
      arch: "x86_64",
      status,
      lastHeartbeat: new Date(Date.now() - (index * 1200)).toISOString(),
      pollIntervalSec: 5,
      latencyMs: 6 + (index % 2) * 2,
      workspacePath: `/opt/models/cache`,
      assignedModels: ["Claude 3.5 Sonnet", "Gemini 1.5 Pro"],
      tags: ["h100-cluster", "ml-inference"],
      telemetry: createTelemetry(index, isOnline, true),
    };
  }

  // 4 macOS nodes (indices 37..40)
  const macNum = String(index - 36).padStart(2, "0");
  return {
    id: `mac-builder-m3-${macNum}`,
    hostname: `mac-m3-${macNum}.build.internal`,
    name: `Apple Silicon Builder ${macNum}`,
    platform: "darwin",
    osRelease: "macOS Sonoma 14.5",
    arch: "aarch64",
    status,
    lastHeartbeat: isOnline ? new Date(Date.now() - 6000).toISOString() : new Date(Date.now() - 3600000).toISOString(),
    pollIntervalSec: 15,
    latencyMs: isOnline ? 22 : 999,
    workspacePath: `/Users/builder/ai-bridge/runner`,
    assignedModels: ["Claude 3.5 Sonnet"],
    tags: ["macos-runner", "xcode-ci"],
    telemetry: createTelemetry(index, isOnline),
  };
});

// Seed urgent approvals
export const SEED_APPROVALS: ApprovalRequest[] = [
  {
    id: "APR-4891",
    taskId: "TSK-89214",
    deviceId: "srv-us-east-412",
    deviceHostname: "srv-us-east-412.infra.internal",
    command: "rm -rf /opt/cache/node-modules-backup",
    argsDiff: {
      original: "rm -f /opt/cache/temp.log",
      proposed: "rm -rf /opt/cache/node-modules-backup",
      dangerousTokens: ["-rf", "/opt/cache/node-modules-backup"],
    },
    riskTier: "tier3_shell",
    reason: "Free up disk space following CI build artifacts cleanup",
    requester: "agent:claude-3.5-sub",
    requestedAt: new Date(Date.now() - 120000).toISOString(),
    expiresAt: new Date(Date.now() + 272000).toISOString(), // 4m 32s remaining
    status: "pending",
  },
  {
    id: "APR-4892",
    taskId: "TSK-89215",
    deviceId: "srv-win-prod-08",
    deviceHostname: "srv-win-prod-08.ad.internal",
    command: "powershell.exe -ExecutionPolicy Bypass -File C:\\Setup\\deploy-driver.ps1",
    argsDiff: {
      original: "powershell.exe -Command Get-Service",
      proposed: "powershell.exe -ExecutionPolicy Bypass -File C:\\Setup\\deploy-driver.ps1",
      dangerousTokens: ["-ExecutionPolicy Bypass", "deploy-driver.ps1"],
    },
    riskTier: "tier4_kernel",
    reason: "Install updated hypervisor display driver for WebRTC desktop studio",
    requester: "agent:gpt-4o-copilot",
    requestedAt: new Date(Date.now() - 180000).toISOString(),
    expiresAt: new Date(Date.now() + 495000).toISOString(), // 8m 15s remaining
    status: "pending",
  },
  {
    id: "APR-4893",
    taskId: "TSK-89216",
    deviceId: "k8s-node-worker-03",
    deviceHostname: "k8s-worker-03.cluster.internal",
    command: "iptables -F && iptables -t nat -F",
    argsDiff: {
      original: "iptables -L -n",
      proposed: "iptables -F && iptables -t nat -F",
      dangerousTokens: ["iptables -F", "-t nat -F"],
    },
    riskTier: "tier3_shell",
    reason: "Flushing stale NAT forwarding rules following network partition recovery",
    requester: "workflow:auto-heal-daemon",
    requestedAt: new Date(Date.now() - 60000).toISOString(),
    expiresAt: new Date(Date.now() + 760000).toISOString(), // 12m 40s remaining
    status: "pending",
  },
];

// Seed active and recent tasks
export const SEED_TASKS: TaskInvocation[] = [
  {
    id: "TSK-89216",
    deviceId: "k8s-node-worker-03",
    deviceHostname: "k8s-worker-03.cluster.internal",
    tool: "shell.exec",
    args: { command: "iptables -F && iptables -t nat -F" },
    riskTier: "tier3_shell",
    status: "needs_approval",
    invoker: "workflow:auto-heal-daemon",
    createdAt: new Date(Date.now() - 60000).toISOString(),
  },
  {
    id: "TSK-89215",
    deviceId: "srv-win-prod-08",
    deviceHostname: "srv-win-prod-08.ad.internal",
    tool: "shell.exec",
    args: { command: "powershell.exe -ExecutionPolicy Bypass -File C:\\Setup\\deploy-driver.ps1" },
    riskTier: "tier4_kernel",
    status: "needs_approval",
    invoker: "agent:gpt-4o-copilot",
    createdAt: new Date(Date.now() - 180000).toISOString(),
  },
  {
    id: "TSK-89214",
    deviceId: "srv-us-east-412",
    deviceHostname: "srv-us-east-412.infra.internal",
    tool: "shell.exec",
    args: { command: "rm -rf /opt/cache/node-modules-backup" },
    riskTier: "tier3_shell",
    status: "needs_approval",
    invoker: "agent:claude-3.5-sub",
    createdAt: new Date(Date.now() - 120000).toISOString(),
  },
  {
    id: "TSK-89213",
    deviceId: "srv-us-east-412",
    deviceHostname: "srv-us-east-412.infra.internal",
    tool: "desktop.capture_screen",
    args: { format: "png", quality: 90 },
    riskTier: "tier1_safe",
    status: "completed",
    invoker: "operator:sarah.j",
    createdAt: new Date(Date.now() - 240000).toISOString(),
    startedAt: new Date(Date.now() - 239000).toISOString(),
    completedAt: new Date(Date.now() - 238000).toISOString(),
    durationMs: 980,
    result: {
      exitCode: 0,
      stdout: "Screen captured: 2560x1440 24bpp",
      somBoxes: [
        { id: 12, label: "Chrome Search Bar", bounds: [120, 48, 640, 84] },
        { id: 14, label: "Submit Button", bounds: [680, 48, 760, 84] },
      ],
    },
  },
  {
    id: "TSK-89212",
    deviceId: "srv-win-prod-01",
    deviceHostname: "srv-win-prod-01.ad.internal",
    tool: "process.list",
    args: { sort: "cpu", limit: 20 },
    riskTier: "tier1_safe",
    status: "running",
    invoker: "agent:claude-3.5-sub",
    createdAt: new Date(Date.now() - 45000).toISOString(),
    startedAt: new Date(Date.now() - 44000).toISOString(),
  },
  {
    id: "TSK-89211",
    deviceId: "ws-fin-win-02",
    deviceHostname: "ws-fin-win-02.finance.internal",
    tool: "file.read",
    args: { path: "C:\\ai-bridge\\config.json" },
    riskTier: "tier1_safe",
    status: "completed",
    invoker: "workflow:audit-scan",
    createdAt: new Date(Date.now() - 320000).toISOString(),
    startedAt: new Date(Date.now() - 319000).toISOString(),
    completedAt: new Date(Date.now() - 318000).toISOString(),
    durationMs: 312,
  },
  {
    id: "TSK-89210",
    deviceId: "gpu-infer-h100-01",
    deviceHostname: "gpu-h100-01.ml.internal",
    tool: "pty.spawn",
    args: { shell: "/bin/bash", term: "xterm-256color" },
    riskTier: "tier3_shell",
    status: "running",
    invoker: "operator:sarah.j",
    createdAt: new Date(Date.now() - 150000).toISOString(),
    startedAt: new Date(Date.now() - 149000).toISOString(),
  },
  {
    id: "TSK-89209",
    deviceId: "cad-gpu-win-03",
    deviceHostname: "cad-gpu-win-03.design.internal",
    tool: "desktop.click_coordinate",
    args: { x: 740, y: 480, button: "left" },
    riskTier: "tier2_workspace",
    status: "completed",
    invoker: "agent:claude-3.5-sub",
    createdAt: new Date(Date.now() - 420000).toISOString(),
    startedAt: new Date(Date.now() - 419000).toISOString(),
    completedAt: new Date(Date.now() - 418000).toISOString(),
    durationMs: 210,
  },
];

// Seed autonomous workflows
export const SEED_WORKFLOWS: WorkflowPlan[] = [
  {
    id: "WF-1092",
    title: "Automated Checkout Flow Remediation",
    description: "Multi-turn visual plan inspecting checkout form, OCR validation, and clicking submit button",
    targetDeviceId: "srv-us-east-412",
    status: "running",
    currentStepIndex: 2,
    totalSteps: 4,
    startedAt: new Date(Date.now() - 300000).toISOString(),
    steps: [
      {
        id: "step-1",
        stepNumber: 1,
        name: "Observation Phase",
        tool: "desktop.capture_screen",
        args: { resolution: "native" },
        status: "completed",
        reasoningTrace: "Captured high-res viewport to locate payment confirmation button",
        durationMs: 320,
      },
      {
        id: "step-2",
        stepNumber: 2,
        name: "Verification Checkpoint",
        tool: "vision.ocr_screen",
        args: { pattern: "Confirm Order" },
        status: "completed",
        reasoningTrace: "Identified OCR text 'Confirm Order' at coordinate bounding box [740, 480, 880, 520]",
        durationMs: 410,
      },
      {
        id: "step-3",
        stepNumber: 3,
        name: "Conditional Branch Execution",
        tool: "desktop.click_coordinate",
        args: { x: 810, y: 500, button: "left" },
        status: "running",
        reasoningTrace: "Targeting center coordinate of verified confirmation button",
      },
      {
        id: "step-4",
        stepNumber: 4,
        name: "Ledger Commitment",
        tool: "audit.commit_transaction",
        args: { ledger: "merkle-core" },
        status: "pending",
        reasoningTrace: "Awaiting step 3 completion before signing transaction hash",
      },
    ],
  },
];

// Seed audit trail events
export const SEED_AUDIT_EVENTS: AuditEvent[] = [
  {
    blockNumber: 1492019,
    timestamp: new Date(Date.now() - 15000).toISOString(),
    actor: "agent:claude-3.5-sub",
    action: "desktop.capture_screen",
    targetHost: "srv-us-east-412",
    governanceVerdict: "auto_allowed",
    sha256Hash: "d9a4f2108b1e43cb98016b01e38921a4fa0c558913b8e434220b22f0981e4b3c",
    prevHash: "7fa281b94d27e8a10459c03bfe38a19280911ca739c9f0019281a8c9b91029ab",
    payloadSummary: "Captured 2560x1440 desktop frame for Set-of-Marks visual analysis",
  },
  {
    blockNumber: 1492018,
    timestamp: new Date(Date.now() - 75000).toISOString(),
    actor: "operator:sarah.j",
    action: "auth.rotate_token",
    targetHost: "srv-win-prod-01",
    governanceVerdict: "human_approved",
    sha256Hash: "7fa281b94d27e8a10459c03bfe38a19280911ca739c9f0019281a8c9b91029ab",
    prevHash: "6e84920ab39c810294f9102c819203a9810293c8192039a810293c819203a910",
    payloadSummary: "Manual token secret rotation via OAuth vault console",
  },
  {
    blockNumber: 1492017,
    timestamp: new Date(Date.now() - 140000).toISOString(),
    actor: "agent:gpt-4o-copilot",
    action: "shell.exec",
    targetHost: "k8s-node-worker-02",
    governanceVerdict: "denied",
    sha256Hash: "6e84920ab39c810294f9102c819203a9810293c8192039a810293c819203a910",
    prevHash: "5f73819ac28b709183e8091b7081920a709182b7081928a709182b7081928a09",
    payloadSummary: "Blocked unauthorized netcat reverse shell invocation (Policy POL-042)",
  },
  {
    blockNumber: 1492016,
    timestamp: new Date(Date.now() - 210000).toISOString(),
    actor: "workflow:auto-heal-daemon",
    action: "systemd.restart_service",
    targetHost: "srv-us-west-01",
    governanceVerdict: "auto_allowed",
    sha256Hash: "5f73819ac28b709183e8091b7081920a709182b7081928a709182b7081928a09",
    prevHash: "4e627089b17a608072d7080a6070819f608071a60708179f608071a60708179e",
    payloadSummary: "Restarted ai-bridge-edge-daemon service after memory watchdog trigger",
  },
];

// Seed MCP server stream connections
export const SEED_MCP_CONNECTIONS: MCPConnection[] = [
  {
    id: "mcp-stream-01",
    name: "Fleet Desktop Video Stream",
    route: "/mcp/v1/fleet-desktop",
    specVersion: "MCP v1.0.4",
    transport: "sse",
    connectedClients: 18,
    throughputReqMin: 1420,
    latencyP99Ms: 14,
    status: "online",
    exportedSchemas: ["desktop.capture_screen", "desktop.click_coordinate", "desktop.type_text"],
  },
  {
    id: "mcp-stream-02",
    name: "Host Terminal Pseudo-TTY Bridge",
    route: "/mcp/v1/host-terminal",
    specVersion: "MCP v1.0.4",
    transport: "sse",
    connectedClients: 12,
    throughputReqMin: 890,
    latencyP99Ms: 18,
    status: "online",
    exportedSchemas: ["pty.spawn", "pty.write", "pty.resize", "pty.kill"],
  },
  {
    id: "mcp-stream-03",
    name: "Hardware Telemetry Stream",
    route: "/mcp/v1/system-telemetry",
    specVersion: "MCP v1.0.4",
    transport: "sse",
    connectedClients: 8,
    throughputReqMin: 3200,
    latencyP99Ms: 8,
    status: "online",
    exportedSchemas: ["telemetry.cpu", "telemetry.memory", "telemetry.processes"],
  },
  {
    id: "mcp-stream-04",
    name: "Filesystem Sandbox Controller",
    route: "/mcp/v1/filesystem-sandbox",
    specVersion: "MCP v1.0.4",
    transport: "stdio",
    connectedClients: 4,
    throughputReqMin: 210,
    latencyP99Ms: 11,
    status: "online",
    exportedSchemas: ["file.read", "file.write", "file.apply_diff"],
  },
];

// Seed OAuth clients
export const SEED_OAUTH_CLIENTS: OAuthClient[] = [
  {
    id: "client-cur-891",
    clientName: "Cursor IDE Autonomous Agent",
    pkceType: "S256 + DPoP",
    scopes: ["fleet:read", "mcp:stream", "tools:call"],
    createdAt: "2025-01-10T08:00:00Z",
    expiresAt: "2026-01-10T08:00:00Z",
    status: "active",
    tokenSecretMasked: "sec_tok_••••••••••••3fa9",
  },
  {
    id: "client-cld-104",
    clientName: "Claude Desktop App Direct Bridge",
    pkceType: "S256 + DPoP",
    scopes: ["fleet:read", "mcp:stream"],
    createdAt: "2025-01-15T12:00:00Z",
    expiresAt: "2026-01-15T12:00:00Z",
    status: "active",
    tokenSecretMasked: "sec_tok_••••••••••••8b12",
  },
  {
    id: "client-py-092",
    clientName: "SecOps Automation Python SDK",
    pkceType: "S256",
    scopes: ["audit:read", "approvals:write"],
    createdAt: "2025-02-01T16:00:00Z",
    expiresAt: "2025-08-01T16:00:00Z",
    status: "active",
    tokenSecretMasked: "sec_tok_••••••••••••e410",
  },
];

// Seed diagnostic logs
export const SEED_LOGS: LogRecord[] = [
  {
    id: "log-1",
    timestamp: new Date(Date.now() - 5000).toISOString(),
    service: "ai-bridge-core.service",
    moduleTag: "core::mTLS",
    workerThread: "worker-01",
    level: "INFO",
    message: "Handshake verified for node srv-us-east-412 (TLS_AES_256_GCM_SHA384, 14ms)",
    pid: 1420,
    traceId: "trc-890a-112",
    details: { cipher: "TLS_AES_256_GCM_SHA384", latencyMs: 14, node: "srv-us-east-412" },
  },
  {
    id: "log-2",
    timestamp: new Date(Date.now() - 12000).toISOString(),
    service: "ai-bridge-mcp-gateway",
    moduleTag: "mcp::stream",
    workerThread: "worker-03",
    level: "DEBUG",
    message: "SSE frame dispatched to client-cur-891: method=tools/call id=TSK-89213",
    pid: 1428,
    traceId: "trc-890a-113",
    details: { client: "client-cur-891", taskId: "TSK-89213" },
  },
  {
    id: "log-3",
    timestamp: new Date(Date.now() - 25000).toISOString(),
    service: "ai-bridge-edge-daemon",
    moduleTag: "edge::pty",
    workerThread: "worker-02",
    level: "INFO",
    message: "PTY session spawned on /dev/pts/4 for operator:sarah.j",
    pid: 1502,
    traceId: "trc-890a-114",
    details: { pts: "/dev/pts/4", operator: "sarah.j" },
  },
  {
    id: "log-4",
    timestamp: new Date(Date.now() - 48000).toISOString(),
    service: "ai-bridge-core.service",
    moduleTag: "policy::guard",
    workerThread: "worker-01",
    level: "WARN",
    message: "Suspicious execution payload intercepted: 'iptables -F' flagged for human approval",
    pid: 1420,
    traceId: "trc-890a-115",
    details: { ruleId: "POL-042", riskTier: "tier3_shell" },
  },
];

// Inner state holder
class DashboardStore {
  private state: DashboardStoreState;
  private listeners = new Set<() => void>();
  private nextTaskSequence = 89220;

  constructor() {
    this.state = {
      currentView: "overview",
      setCurrentView: (view: ViewId) => this.setCurrentView(view),
      devices: SEED_DEVICES,
      selectedDeviceId: "srv-us-east-412",
      setSelectedDeviceId: (id: string) => this.setSelectedDeviceId(id),
      tasks: SEED_TASKS,
      dispatchTask: (params: TaskDispatchParams) => this.dispatchTask(params),
      approvals: SEED_APPROVALS,
      resolveApproval: (id: string, verdict: "approved" | "denied", reason?: string) =>
        this.resolveApproval(id, verdict, reason),
      workflows: SEED_WORKFLOWS,
      auditEvents: SEED_AUDIT_EVENTS,
      mcpConnections: SEED_MCP_CONNECTIONS,
      oauthClients: SEED_OAUTH_CLIENTS,
      logs: SEED_LOGS,
      isEmergencyStopActive: false,
      triggerEmergencyStop: () => this.triggerEmergencyStop(),
      resumeFleet: () => this.resumeFleet(),
      commandPaletteOpen: false,
      setCommandPaletteOpen: (open: boolean) => this.setCommandPaletteOpen(open),
      autoPollEnabled: true,
      setAutoPollEnabled: (enabled: boolean) => this.setAutoPollEnabled(enabled),
      operatorProfile: {
        name: "Sarah Jenkins",
        role: "Lead SecOps Engineer",
        email: "sarah.j@security.internal",
        workstationMtlsPinned: true,
      },
      gatewayLatencyMs: 14,
      gatewayStatus: "online",
    };
  }

  public getState = (): DashboardStoreState => this.state;

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify = () => {
    for (const listener of this.listeners) {
      listener();
    }
  };

  public setCurrentView = (currentView: ViewId): void => {
    if (this.state.currentView === currentView) return;
    this.state = { ...this.state, currentView };
    this.notify();
  };

  public setSelectedDeviceId = (selectedDeviceId: string): void => {
    if (this.state.selectedDeviceId === selectedDeviceId) return;
    this.state = { ...this.state, selectedDeviceId };
    this.notify();
  };

  public setCommandPaletteOpen = (commandPaletteOpen: boolean): void => {
    if (this.state.commandPaletteOpen === commandPaletteOpen) return;
    this.state = { ...this.state, commandPaletteOpen };
    this.notify();
  };

  public setAutoPollEnabled = (autoPollEnabled: boolean): void => {
    if (this.state.autoPollEnabled === autoPollEnabled) return;
    this.state = { ...this.state, autoPollEnabled };
    this.notify();
  };

  public triggerEmergencyStop = async (): Promise<void> => {
    this.state = {
      ...this.state,
      isEmergencyStopActive: true,
      tasks: this.state.tasks.map((t) =>
        t.status === "running" || t.status === "pending"
          ? { ...t, status: "cancelled", completedAt: new Date().toISOString() }
          : t
      ),
      auditEvents: [
        {
          blockNumber: this.state.auditEvents[0] ? this.state.auditEvents[0].blockNumber + 1 : 1,
          timestamp: new Date().toISOString(),
          actor: "operator:sarah.j",
          action: "fleet.emergency_all_stop",
          targetHost: "all-fleet-nodes",
          governanceVerdict: "human_approved",
          sha256Hash: `sha256:${Date.now().toString(16).padStart(64, "0")}`,
          prevHash: this.state.auditEvents[0]?.sha256Hash || "",
          payloadSummary: "EMERGENCY ALL-STOP TRIGGERED. All fleet tasks halted immediately.",
        },
        ...this.state.auditEvents,
      ],
    };
    this.notify();
  };

  public resumeFleet = async (): Promise<void> => {
    this.state = {
      ...this.state,
      isEmergencyStopActive: false,
      auditEvents: [
        {
          blockNumber: this.state.auditEvents[0] ? this.state.auditEvents[0].blockNumber + 1 : 1,
          timestamp: new Date().toISOString(),
          actor: "operator:sarah.j",
          action: "fleet.resume_operations",
          targetHost: "all-fleet-nodes",
          governanceVerdict: "human_approved",
          sha256Hash: `sha256:${Date.now().toString(16).padStart(64, "0")}`,
          prevHash: this.state.auditEvents[0]?.sha256Hash || "",
          payloadSummary: "Fleet resumed operations following emergency review.",
        },
        ...this.state.auditEvents,
      ],
    };
    this.notify();
  };

  public resolveApproval = async (
    id: string,
    verdict: "approved" | "denied",
    reason?: string
  ): Promise<void> => {
    const approval = this.state.approvals.find((a) => a.id === id);
    if (!approval || approval.status !== "pending") return;

    const now = new Date().toISOString();
    const updatedApprovals = this.state.approvals.map((a) =>
      a.id === id
        ? {
            ...a,
            status: verdict,
            decidedBy: "operator:sarah.j",
            decidedAt: now,
            decisionReason: reason,
          }
        : a
    );

    // Update associated task status
    const updatedTasks = this.state.tasks.map((t) =>
      t.id === approval.taskId
        ? {
            ...t,
            status: verdict === "approved" ? ("running" as const) : ("denied" as const),
          }
        : t
    );

    // Append to audit ledger
    const newAuditEvent: AuditEvent = {
      blockNumber: this.state.auditEvents[0] ? this.state.auditEvents[0].blockNumber + 1 : 1,
      timestamp: now,
      actor: "operator:sarah.j",
      action: `approval.${verdict}`,
      targetHost: approval.deviceHostname,
      governanceVerdict: verdict === "approved" ? "human_approved" : "denied",
      sha256Hash: `sha256:${Date.now().toString(16).padStart(64, "0")}`,
      prevHash: this.state.auditEvents[0]?.sha256Hash || "",
      payloadSummary: `Request ${id} (${approval.command}) was ${verdict}. Reason: ${reason || "Standard SecOps review."}`,
    };

    this.state = {
      ...this.state,
      approvals: updatedApprovals,
      tasks: updatedTasks,
      auditEvents: [newAuditEvent, ...this.state.auditEvents],
    };
    this.notify();
  };

  public dispatchTask = async (params: TaskDispatchParams): Promise<TaskInvocation> => {
    const device = this.state.devices.find((d) => d.id === params.deviceId);
    const now = new Date().toISOString();
    const taskId = `TSK-${this.nextTaskSequence++}`;
    const initialStatus = this.state.isEmergencyStopActive ? "cancelled" : "running";

    const newTask: TaskInvocation = {
      id: taskId,
      deviceId: params.deviceId,
      deviceHostname: device?.hostname || params.deviceId,
      tool: params.tool,
      args: params.args || {},
      riskTier: params.riskTier || "tier1_safe",
      status: initialStatus,
      invoker: "operator:sarah.j",
      createdAt: now,
      startedAt: now,
      ...(this.state.isEmergencyStopActive ? { completedAt: now } : {}),
    };

    const newAuditEvent: AuditEvent = {
      blockNumber: this.state.auditEvents[0] ? this.state.auditEvents[0].blockNumber + 1 : 1,
      timestamp: now,
      actor: "operator:sarah.j",
      action: params.tool,
      targetHost: device?.hostname || params.deviceId,
      governanceVerdict: this.state.isEmergencyStopActive ? "denied" : "auto_allowed",
      sha256Hash: `sha256:${Date.now().toString(16).padStart(64, "0")}`,
      prevHash: this.state.auditEvents[0]?.sha256Hash || "",
      payloadSummary: this.state.isEmergencyStopActive
        ? `Blocked dispatch of ${params.tool} to ${device?.hostname || params.deviceId}: Emergency All-Stop is active`
        : `Dispatched tool ${params.tool} to ${device?.hostname || params.deviceId}`,
    };

    this.state = {
      ...this.state,
      tasks: [newTask, ...this.state.tasks],
      auditEvents: [newAuditEvent, ...this.state.auditEvents],
    };
    this.notify();

    return newTask;
  };
}

// Singleton store instance
export const dashboardStore = new DashboardStore();

// React hook for component consumption
export function useDashboardStore<T = DashboardStoreState>(
  selector?: (state: DashboardStoreState) => T
): T {
  return useSyncExternalStore(
    dashboardStore.subscribe,
    () => {
      const state = dashboardStore.getState();
      return selector ? selector(state) : (state as unknown as T);
    }
  );
}

