/**
 * AI Bridge Enterprise Dashboard — Core Domain Types
 * Strictly aligned with DASHBOARD_DESIGN_SPEC.md and PROJECT.md.
 */

export type ViewId =
  | "overview"
  | "live"
  | "devices"
  | "device-360-system"
  | "task-queue-and-vision"
  | "live-desktop-studio"
  | "interactive-terminal"
  | "autonomous-workflows"
  | "fleet-operations"
  | "ai-api-and-agents"
  | "human-approvals"
  | "security-policies"
  | "audit-trail"
  | "mcp-and-oauth"
  | "diagnostics-and-logs"
  | "login";

export type NavDomain = "operations" | "governance";

export interface NavDestination {
  id: ViewId;
  label: string;
  domain: NavDomain;
  description: string;
  badge?: string;
  badgeColor?: "primary" | "success" | "warning" | "error";
}

export interface DeviceTelemetry {
  cpuPercent: number;
  cpuCores: number[];
  cpuClockGhz: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  swapUsedGb: number;
  swapTotalGb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  diskPercent: number;
  networkRxMbps: number;
  networkTxMbps: number;
  ipAddress: string;
  uptimeSeconds: number;
  tpmStatus: "active" | "inactive" | "unsupported";
  certExpiryDays: number;
  fingerprintSha256: string;
}

export type PlatformType = "linux" | "windows" | "darwin";
export type DeviceStatus = "online" | "offline" | "unresponsive" | "pending_auth";

export interface EnrolledDevice {
  id: string;
  hostname: string;
  name: string;
  platform: PlatformType;
  osRelease: string;
  arch: "x86_64" | "aarch64";
  status: DeviceStatus;
  lastHeartbeat: string;
  pollIntervalSec: number;
  latencyMs: number;
  workspacePath: string;
  assignedModels: string[];
  tags: string[];
  telemetry: DeviceTelemetry;
  revoked?: boolean;
}

export type TaskRiskTier = "tier1_safe" | "tier2_workspace" | "tier3_shell" | "tier4_kernel";
export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "needs_approval"
  | "denied"
  | "cancelled";

export interface TaskInvocation {
  id: string;
  deviceId: string;
  deviceHostname?: string;
  tool: string;
  args: Record<string, unknown>;
  riskTier: TaskRiskTier;
  status: TaskStatus;
  approvalId?: string;
  invoker: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  result?: {
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    screenshotBase64?: string;
    somBoxes?: Array<{ id: number; label: string; bounds: [number, number, number, number] }>;
    outputJson?: unknown;
    error?: string;
  };
}

export interface ApprovalRequest {
  id: string;
  taskId: string;
  deviceId: string;
  deviceHostname: string;
  command: string;
  argsDiff?: {
    original: string;
    proposed: string;
    dangerousTokens: string[];
  };
  riskTier: TaskRiskTier;
  reason: string;
  requester: string;
  requestedAt: string;
  expiresAt: string;
  screenshotUrl?: string;
  status: "pending" | "approved" | "denied";
  decidedBy?: string;
  decidedAt?: string;
  decisionReason?: string;
}

export interface WorkflowStep {
  id: string;
  stepNumber: number;
  name: string;
  tool: string;
  args: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  reasoningTrace?: string;
  durationMs?: number;
  screenshotBase64?: string;
  somMarks?: Array<{ id: number; label: string; bounds: [number, number, number, number] }>;
  output?: unknown;
  error?: string;
}

export interface WorkflowPlan {
  id: string;
  title: string;
  description: string;
  targetDeviceId: string;
  status: "draft" | "running" | "paused" | "completed" | "failed" | "aborted";
  currentStepIndex: number;
  totalSteps: number;
  steps: WorkflowStep[];
  startedAt: string;
  completedAt?: string;
}

export interface AuditEvent {
  blockNumber: number;
  timestamp: string;
  actor: string;
  action: string;
  targetHost: string;
  governanceVerdict: "auto_allowed" | "human_approved" | "denied" | "flagged";
  sha256Hash: string;
  prevHash: string;
  payloadSummary: string;
}

export interface MCPConnection {
  id: string;
  name: string;
  route: string;
  specVersion: string;
  transport: "sse" | "stdio";
  connectedClients: number;
  throughputReqMin: number;
  latencyP99Ms: number;
  status: "online" | "degraded" | "offline";
  exportedSchemas: string[];
}

export interface OAuthClient {
  id: string;
  clientName: string;
  pkceType: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  status: "active" | "expired" | "revoked";
  tokenSecretMasked: string;
}

export interface LogRecord {
  id: string;
  timestamp: string;
  service: string;
  moduleTag: string;
  workerThread: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
  message: string;
  pid: number;
  traceId?: string;
  details?: Record<string, unknown>;
}

export interface TaskDispatchParams {
  deviceId: string;
  tool: string;
  args?: Record<string, unknown>;
  riskTier?: TaskRiskTier;
}

export interface OperatorProfile {
  name: string;
  role: string;
  email: string;
  avatarUrl?: string;
  workstationMtlsPinned: boolean;
}

export interface DashboardStoreState {
  currentView: ViewId;
  setCurrentView: (view: ViewId) => void;
  devices: EnrolledDevice[];
  selectedDeviceId: string;
  setSelectedDeviceId: (id: string) => void;
  tasks: TaskInvocation[];
  dispatchTask: (params: TaskDispatchParams) => Promise<TaskInvocation>;
  approvals: ApprovalRequest[];
  resolveApproval: (id: string, verdict: "approved" | "denied", reason?: string) => Promise<void>;
  workflows: WorkflowPlan[];
  auditEvents: AuditEvent[];
  mcpConnections: MCPConnection[];
  oauthClients: OAuthClient[];
  logs: LogRecord[];
  isEmergencyStopActive: boolean;
  triggerEmergencyStop: () => Promise<void>;
  resumeFleet: () => Promise<void>;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  autoPollEnabled: boolean;
  setAutoPollEnabled: (enabled: boolean) => void;
  operatorProfile: OperatorProfile;
  gatewayLatencyMs: number;
  gatewayStatus: "online" | "degraded" | "offline";
  refreshLive?: () => Promise<void>;
}

