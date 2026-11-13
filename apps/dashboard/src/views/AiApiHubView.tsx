/**
 * AI API & Custom Agents Hub (Screen 9)
 * Reconstructed with pure JXUI primitives, motion/react, and lucide-react.
 * ZERO inline styles. ZERO custom CSS.
 */

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  JXAlert,
  JXCard,
  JXCardHeader,
  JXCardContent,
  JXButton,
  JXBadge,
  JXSelect,
  JXTextField,
  JXGrid,
  JXGridItem,
} from "../ui";
import {
  Bot,
  Cpu,
  Zap,
  Shield,
  Activity,
  Copy,
  Check,
  Play,
  Terminal,
  Code2,
  Radio,
  Sparkles,
  RefreshCw,
  Server,
  Layers,
  KeyRound,
  CheckCircle2,
  Pause,
  Trash2,
  Clock3,
  ChevronDown,
  ChevronUp,
  Network,
  Plus,
  Wrench,
  Globe,
  Link2,
  Pencil,
  X,
  Send,
  MessageSquare,
} from "lucide-react";
import { useDashboardStore } from "../state/dashboardStore";
import { api, sessionToken, token } from "../api";

interface ProviderConnector {
  id: string;
  name: string;
  defaultModel: string;
  models: string[];
  status: "healthy" | "degraded" | "offline";
  latencyMs: number;
  keyMasked: string;
  endpoint: string;
  isPinging?: boolean;
}

interface AiSettingsResponse {
  provider: string;
  model: string;
  keys_configured: Record<string, boolean>;
  masked_keys: Record<string, string>;
  custom_base_url: string;
  custom_model: string;
  is_connected: boolean;
}

// Backend accepts these through /api/settings/ai; "custom" is any
// OpenAI-compatible endpoint (OpenRouter, LiteLLM, vLLM, LM Studio...).
const AI_PROVIDER_OPTIONS = [
  { id: "custom", label: "Custom AI (OpenAI-compatible)" },
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic Claude" },
  { id: "gemini", label: "Google Gemini" },
  { id: "groq", label: "Groq" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "ollama", label: "Ollama / local" },
];

interface McpServerTool {
  name: string;
  description: string;
  inputSchema?: any;
}

interface McpServerItem {
  id: string;
  name: string;
  url: string;
  transport: string;
  auth_type?: string;
  enabled: boolean;
  status: "healthy" | "offline" | "pending_auth" | "unknown";
  last_checked_at?: number | null;
  last_error?: string;
  tools_count: number;
  tools: McpServerTool[];
  token_masked?: string;
  oauth_connected?: boolean;
  oauth_has_refresh_token?: boolean;
}

interface McpTemplate {
  id: string;
  name: string;
  url: string;
  description: string;
  requires_auth: boolean;
  auth_type?: string;
  oauth_auth_url?: string;
  oauth_token_url?: string;
  oauth_scopes?: string;
  category?: string;
  auth_placeholder?: string;
}

const DEVICE_TOOL_OPTIONS = [
  { id: "take_screenshot", label: "Desktop Screenshot", category: "gui" },
  { id: "set_of_marks_screenshot", label: "Set-of-Marks Screenshot", category: "gui" },
  { id: "click_element", label: "GUI Click Element", category: "gui" },
  { id: "mouse_click", label: "Mouse Click", category: "gui" },
  { id: "keyboard_type", label: "Keyboard Type Text", category: "gui" },
  { id: "launch_approved_application", label: "Launch Application", category: "gui" },
  { id: "run_shell", label: "Run Shell / Terminal", category: "system" },
  { id: "list_processes", label: "Process Inventory", category: "system" },
  { id: "get_system_info", label: "System Info", category: "system" },
  { id: "get_network_info", label: "Network Telemetry", category: "system" },
  { id: "file_read", label: "Read Workspace File", category: "files" },
  { id: "file_write", label: "Write Workspace File", category: "files" },
  { id: "file_list", label: "List Directory Files", category: "files" },
  { id: "git_status", label: "Git Repository Status", category: "git" },
];

interface CustomAgent {
  id: string;
  name: string;
  instruction: string;
  provider: string;
  model?: string | null;
  base_url?: string | null;
  device_ids: string[];
  devices: Array<{ id: string; name?: string; hostname?: string; os?: string; status?: string }>;
  interval_seconds: number;
  enabled: boolean;
  status: string;
  last_run_at?: number | null;
  last_result?: string;
  last_error?: string;
  run_count: number;
  consecutive_failures?: number;
  memory?: string;
  allowed_tools?: string[];
  mcp_server_ids?: string[];
  mcp_servers?: McpServerItem[];
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function relativeTime(timestamp?: number | null): string {
  if (!timestamp) return "never";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatInterval(seconds: number): string {
  if (seconds >= 86400) return "once a day";
  if (seconds >= 3600) return `every ${Math.round(seconds / 3600)}h`;
  return `every ${Math.max(1, Math.round(seconds / 60))} min`;
}

const AGENT_INTERVAL_OPTIONS = [
  { id: "60", label: "Every minute" },
  { id: "300", label: "Every 5 minutes" },
  { id: "900", label: "Every 15 minutes" },
  { id: "3600", label: "Every hour" },
  { id: "21600", label: "Every 6 hours" },
  { id: "86400", label: "Once a day" },
];

const SDK_SNIPPETS = {
  python: `# Python SDK Integration
from ai_bridge import BridgeClient

client = BridgeClient(
    api_key="brg_live_sk99214a08bc71",
    gateway_url="https://bridge.internal/v1",
    tls_verify=True
)

# Dispatch desktop observation tool
response = client.tools.execute(
    target_node="srv-us-east-412",
    tool="desktop.capture_screen",
    arguments={"include_som": True, "format": "png"}
)

print(f"Captured screen hash: {response.result['image_hash']}")
print(f"Detected {len(response.result['som_marks'])} UI elements")`,

  typescript: `// TypeScript / Node.js SDK Integration
import { BridgeClient } from '@ai-bridge/sdk';

const client = new BridgeClient({
  apiKey: process.env.AI_BRIDGE_API_KEY!,
  endpoint: 'https://bridge.internal/v1',
  timeoutMs: 15000,
});

async function main() {
  const result = await client.tools.dispatch({
    deviceId: 'srv-us-east-412',
    tool: 'process.list',
    riskTier: 'tier1_safe',
  });

  console.log('Top processes:', result.processes.slice(0, 5));
}

main().catch(console.error);`,

  curl: `# cURL / REST HTTP Endpoint
curl -X POST "https://bridge.internal/v1/tools/dispatch" \\
  -H "Authorization: Bearer brg_live_sk99214a08bc71" \\
  -H "Content-Type: application/json" \\
  -d '{
    "device_id": "srv-us-east-412",
    "tool": "desktop.capture_screen",
    "arguments": {
      "format": "png",
      "include_som": true
    }
  }'`,

  mcp: `// MCP (Model Context Protocol) JSON-RPC 2.0 Payload
{
  "jsonrpc": "2.0",
  "id": 10842,
  "method": "tools/call",
  "params": {
    "name": "desktop.capture_screen",
    "arguments": {
      "target_node": "srv-us-east-412",
      "include_som": true,
      "format": "png"
    }
  }
}`,
};

export const AiApiHubView: React.FC = () => {
  const devices = useDashboardStore((s) => s.devices);

  // Provider connector state
  const [providers, setProviders] = useState<ProviderConnector[]>([
    {
      id: "anthropic",
      name: "Anthropic Claude",
      defaultModel: "claude-3-5-sonnet-20241022",
      models: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku", "claude-3-opus"],
      status: "healthy",
      latencyMs: 18,
      keyMasked: "sk-ant-api03-***9a4",
      endpoint: "https://api.anthropic.com/v1/messages",
    },
    {
      id: "openai",
      name: "OpenAI",
      defaultModel: "gpt-4o",
      models: ["gpt-4o", "gpt-4o-mini", "o1-preview", "gpt-4-turbo"],
      status: "healthy",
      latencyMs: 24,
      keyMasked: "sk-proj-***410f",
      endpoint: "https://api.openai.com/v1/chat/completions",
    },
    {
      id: "gemini",
      name: "Google Gemini",
      defaultModel: "gemini-1.5-pro",
      models: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-ultra"],
      status: "healthy",
      latencyMs: 22,
      keyMasked: "AIzaSy***71b9",
      endpoint: "https://generativelanguage.googleapis.com/v1beta",
    },
    {
      id: "ollama",
      name: "Local Ollama / vLLM",
      defaultModel: "llama3.1:8b-instruct",
      models: ["llama3.1:8b-instruct", "qwen2.5-coder:14b", "deepseek-coder:6.7b"],
      status: "healthy",
      latencyMs: 6,
      keyMasked: "local-enclave-bound",
      endpoint: "http://127.0.0.1:11434/v1",
    },
  ]);

  // SDK Code Generator state
  const [sdkLang, setSdkLang] = useState<"python" | "typescript" | "curl" | "mcp">("python");
  const [copiedCode, setCopiedCode] = useState(false);

  // Interactive Execution Studio state
  const [selectedNode, setSelectedNode] = useState(devices[0]?.id || "srv-us-east-412");
  const [selectedModel, setSelectedModel] = useState("claude-3-5-sonnet-20241022");
  const [selectedTool, setSelectedTool] = useState("desktop.capture_screen");
  const [promptText, setPromptText] = useState(
    JSON.stringify(
      {
        format: "png",
        include_som: true,
        compression_level: 4,
      },
      null,
      2
    )
  );

  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    status: string;
    nodeId: string;
    tool: string;
    model: string;
    durationMs: number;
    tokens: { input: number; output: number; cost: string };
    output: Record<string, unknown>;
  } | null>(null);

  // Live provider settings: the provider cards above are demo data, so this
  // panel is how a real key or self-hosted endpoint gets connected.
  const isLive = typeof window !== "undefined" && Boolean(token() || sessionToken());
  const [aiSettings, setAiSettings] = useState<AiSettingsResponse | null>(null);
  const [aiProvider, setAiProvider] = useState("custom");
  const [aiModel, setAiModel] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiSaving, setAiSaving] = useState(false);
  const [aiClearing, setAiClearing] = useState(false);
  const [aiNotice, setAiNotice] = useState<{ severity: "success" | "error" | "info"; text: string } | null>(null);

  // Custom 24/7 agents
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [agentFormOpen, setAgentFormOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState("");
  const [agentInstruction, setAgentInstruction] = useState("");
  const [agentProvider, setAgentProvider] = useState("openai");
  const [agentModel, setAgentModel] = useState("");
  const [agentBaseUrl, setAgentBaseUrl] = useState("");
  const [agentInterval, setAgentInterval] = useState("300");
  const [agentDeviceIds, setAgentDeviceIds] = useState<string[]>([]);
  const [agentMcpServerIds, setAgentMcpServerIds] = useState<string[]>([]);
  const [agentAllowedTools, setAgentAllowedTools] = useState<string[]>([]);
  const [agentMemory, setAgentMemory] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentNotice, setAgentNotice] = useState<{ severity: "success" | "error" | "info"; text: string } | null>(null);
  const [agentRunsOpen, setAgentRunsOpen] = useState<Record<string, boolean>>({});
  const [expandedRunTrace, setExpandedRunTrace] = useState<Record<string, boolean>>({});
  const [askTargetAgent, setAskTargetAgent] = useState<CustomAgent | null>(null);
  const [askPrompt, setAskPrompt] = useState("");
  const [askResult, setAskResult] = useState<{ response: string; steps: any[] } | null>(null);
  const [askBusy, setAskBusy] = useState(false);
  const [memoryTargetAgent, setMemoryTargetAgent] = useState<CustomAgent | null>(null);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [agentRuns, setAgentRuns] = useState<Record<string, any[]>>({});
  const [agentRunsLoading, setAgentRunsLoading] = useState<Record<string, boolean>>({});

  // Interactive AI Copilot Chat state (persisted in localStorage)
  interface CopilotMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    steps?: any[];
    provider?: string;
    model?: string;
    createdAt: string;
  }
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>(() => {
    try {
      const raw = window.localStorage.getItem("ai_bridge_copilot_messages");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore localStorage read errors
    }
    return [];
  });
  const [copilotInput, setCopilotInput] = useState("");
  const [copilotDevice, setCopilotDevice] = useState("");
  const [copilotProvider, setCopilotProvider] = useState("");
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copilotError, setCopilotError] = useState<string | null>(null);
  const [copilotExpandedSteps, setCopilotExpandedSteps] = useState<Record<string, boolean>>({});
  const [copilotLiveEvents, setCopilotLiveEvents] = useState<Array<{ step?: number; tool?: string; device?: string; status: string }>>([]);
  const [copilotSaveNotice, setCopilotSaveNotice] = useState<string | null>(null);
  const [mcpToolPolicies, setMcpToolPolicies] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "ai_bridge_copilot_messages",
        JSON.stringify(copilotMessages.slice(-40))
      );
    } catch {
      // ignore localStorage quota errors
    }
  }, [copilotMessages]);

  const handleCopilotSend = async (e?: React.FormEvent): Promise<void> => {
    if (e) e.preventDefault();
    const prompt = copilotInput.trim();
    if (!prompt || copilotBusy) return;
    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: prompt,
      createdAt: new Date().toISOString(),
    };
    const nextHistory = [...copilotMessages, userMsg];
    setCopilotMessages(nextHistory);
    setCopilotInput("");
    setCopilotError(null);
    setCopilotSaveNotice(null);
    setCopilotLiveEvents([]);
    setCopilotBusy(true);
    try {
      const payloadMessages = nextHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "text/event-stream" };
      const st = sessionToken();
      const at = token();
      if (st) headers["X-Session-Token"] = st;
      else if (at) headers["X-Admin-Token"] = at;

      let res: {
        ok?: boolean;
        message?: { role?: string; content?: string };
        steps?: any[];
        provider?: string;
        model?: string;
      } | null = null;

      try {
        const streamRes = await fetch(api.aiChatStreamUrl(), {
          method: "POST",
          headers,
          body: JSON.stringify({
            messages: payloadMessages,
            provider: copilotProvider || undefined,
            device: copilotDevice || undefined,
          }),
        });
        if (!streamRes.ok || !streamRes.body) {
          throw new Error(`HTTP ${streamRes.status}`);
        }
        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            try {
              const ev = JSON.parse(dataLine.slice(5).trim());
              if (ev.type === "tool_start") {
                setCopilotLiveEvents((prev) => [...prev, { step: ev.step, tool: ev.tool, device: ev.device, status: "running" }]);
              } else if (ev.type === "tool_result") {
                setCopilotLiveEvents((prev) =>
                  prev.map((item, i) =>
                    i === prev.length - 1 && item.tool === ev.tool
                      ? { ...item, status: ev.ok ? "done" : "error" }
                      : item
                  )
                );
              } else if (ev.type === "error") {
                throw new Error(ev.error || "Streaming error");
              } else if (ev.type === "done") {
                res = ev;
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== "Unexpected end of JSON input") {
                throw parseErr;
              }
            }
          }
        }
      } catch {
        res = (await api.aiChat({
          messages: payloadMessages,
          provider: copilotProvider || undefined,
          device: copilotDevice || undefined,
        })) as any;
      }

      const replyContent =
        res?.message?.content?.trim() || "(No response returned)";
      const assistantMsg: CopilotMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: replyContent,
        steps: Array.isArray(res?.steps) ? res.steps : [],
        provider: res?.provider,
        model: res?.model,
        createdAt: new Date().toISOString(),
      };
      setCopilotMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      setCopilotError(describeError(error));
    } finally {
      setCopilotBusy(false);
      setCopilotLiveEvents([]);
    }
  };

  const handleSaveCopilotAsWorkflow = async (msg: CopilotMessage): Promise<void> => {
    const steps = (msg.steps || [])
      .filter((s: any) => s && s.tool)
      .map((s: any, idx: number) => ({
        name: `Copilot Step ${idx + 1}: ${s.tool}`,
        action: s.tool,
        args: s.args && typeof s.args === "object" ? s.args : {},
      }));
    if (steps.length === 0) return;
    try {
      const tpl = await api.createWorkflowTemplate({
        name: `Copilot Flow (${new Date().toLocaleTimeString()})`,
        description: msg.content.slice(0, 140),
        steps,
      });
      setCopilotSaveNotice(`Saved workflow template "${tpl.name}" (${steps.length} step${steps.length === 1 ? "" : "s"}).`);
    } catch (error) {
      setCopilotError(describeError(error));
    }
  };

  const handleMcpPolicyChange = async (srvId: string, toolName: string, policy: string): Promise<void> => {
    const key = `${srvId}:${toolName}`;
    const next = { ...mcpToolPolicies };
    if (policy === "allow") delete next[key];
    else next[key] = policy;
    setMcpToolPolicies(next);
    try {
      const res = await api.updateMcpToolPolicies(next);
      if (res?.policies) setMcpToolPolicies(res.policies);
    } catch (error) {
      setMcpNotice({ severity: "error", text: describeError(error) });
    }
  };

  const handleCopilotClear = (): void => {
    setCopilotMessages([]);
    setCopilotError(null);
    try {
      window.localStorage.removeItem("ai_bridge_copilot_messages");
    } catch {
      // ignore
    }
  };

  // MCP Services state
  const [mcpServers, setMcpServers] = useState<McpServerItem[]>([]);
  const [mcpTemplates, setMcpTemplates] = useState<McpTemplate[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpFormOpen, setMcpFormOpen] = useState(false);
  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpAuthType, setMcpAuthType] = useState("bearer");
  const [mcpAuthToken, setMcpAuthToken] = useState("");
  const [mcpAuthHeader, setMcpAuthHeader] = useState("");
  const [mcpOAuthClientId, setMcpOAuthClientId] = useState("");
  const [mcpOAuthClientSecret, setMcpOAuthClientSecret] = useState("");
  const [mcpOAuthAuthUrl, setMcpOAuthAuthUrl] = useState("");
  const [mcpOAuthTokenUrl, setMcpOAuthTokenUrl] = useState("");
  const [mcpOAuthScopes, setMcpOAuthScopes] = useState("");
  const [mcpDiscovering, setMcpDiscovering] = useState(false);
  const [mcpSyncing, setMcpSyncing] = useState<Record<string, boolean>>({});
  const [mcpNotice, setMcpNotice] = useState<{ severity: "success" | "error" | "info"; text: string } | null>(null);
  const [mcpToolsExpanded, setMcpToolsExpanded] = useState<Record<string, boolean>>({});

  const loadAiSettings = async (): Promise<void> => {
    if (!isLive) return;
    try {
      const settings = (await api.getAiSettings()) as AiSettingsResponse;
      setAiSettings(settings);
      if (settings.provider) setAiProvider(settings.provider);
      if (settings.provider === "custom") {
        setAiModel(settings.custom_model || settings.model || "");
        setAiBaseUrl(settings.custom_base_url || "");
      } else {
        setAiModel(settings.model || "");
      }
    } catch (error) {
      setAiNotice({ severity: "error", text: describeError(error) });
    }
  };

  useEffect(() => {
    void loadAiSettings();
    // Reload only when the sign-in state changes; the endpoint is admin-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive]);

  const handleSaveAi = async (): Promise<void> => {
    if (aiProvider === "custom" && !aiBaseUrl.trim()) {
      setAiNotice({ severity: "error", text: "A base URL is required for a custom AI provider, e.g. https://openrouter.ai/api/v1" });
      return;
    }
    setAiSaving(true);
    setAiNotice(null);
    try {
      const result = await api.saveAiSettings({
        provider: aiProvider,
        model: aiModel.trim() || undefined,
        api_key: aiApiKey.trim() || undefined,
        base_url: aiProvider === "custom" ? aiBaseUrl.trim() : undefined,
        test_connection: true,
      });
      setAiNotice({ severity: "success", text: result?.message || "AI provider connected." });
      setAiApiKey("");
      await loadAiSettings();
    } catch (error) {
      const text = describeError(error);
      setAiNotice({ severity: "error", text });
    } finally {
      setAiSaving(false);
    }
  };

  const handleClearAi = async (): Promise<void> => {
    setAiClearing(true);
    setAiNotice(null);
    try {
      const result = await api.saveAiSettings({ provider: aiProvider, clear: true });
      setAiNotice({ severity: "success", text: result?.message || "Provider settings cleared." });
      setAiApiKey("");
      await loadAiSettings();
    } catch (error) {
      setAiNotice({ severity: "error", text: describeError(error) });
    } finally {
      setAiClearing(false);
    }
  };

  const loadAgents = async (silent = false): Promise<void> => {
    if (!isLive) return;
    try {
      const result = await api.agents();
      setAgents(result.agents || []);
    } catch (error) {
      if (!silent) setAgentNotice({ severity: "error", text: describeError(error) });
    }
  };

  const loadMcpServers = async (): Promise<void> => {
    if (!isLive) return;
    setMcpLoading(true);
    try {
      const [res, polRes] = await Promise.all([
        api.mcpServers(),
        api.mcpToolPolicies().catch(() => ({ policies: {} })),
      ]);
      setMcpServers(res.servers || []);
      if (polRes?.policies) setMcpToolPolicies(polRes.policies);
    } catch (error) {
      setMcpNotice({ severity: "error", text: describeError(error) });
    } finally {
      setMcpLoading(false);
    }
  };

  const loadMcpTemplates = async (): Promise<void> => {
    if (!isLive) return;
    try {
      const res = await api.mcpTemplates();
      setMcpTemplates(res.templates || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!isLive) return;
    void loadAgents(true);
    void loadMcpServers();
    void loadMcpTemplates();
    const timer = window.setInterval(() => {
      void loadAgents(true);
      void loadMcpServers();
    }, 10000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive]);

  const openAgentForm = (): void => {
    setEditingAgentId(null);
    setAgentName("");
    setAgentInstruction("");
    setAgentDeviceIds(devices.filter((d) => d.status === "online").map((d) => d.id));
    setAgentInterval("300");
    const provider = aiSettings?.provider || "openai";
    setAgentProvider(provider);
    setAgentModel(provider === "custom" ? aiSettings?.custom_model || "" : aiSettings?.model || "");
    setAgentBaseUrl(aiSettings?.custom_base_url || "");
    setAgentMcpServerIds(mcpServers.filter((s) => s.enabled).map((s) => s.id));
    setAgentAllowedTools([]);
    setAgentMemory("");
    setAgentFormOpen(true);
    setAgentNotice(null);
  };

  const handleEditAgent = (agent: CustomAgent): void => {
    setEditingAgentId(agent.id);
    setAgentName(agent.name);
    setAgentInstruction(agent.instruction);
    setAgentProvider(agent.provider || "openai");
    setAgentModel(agent.model || "");
    setAgentBaseUrl(agent.base_url || "");
    setAgentInterval(String(agent.interval_seconds || 300));
    setAgentDeviceIds(agent.device_ids || []);
    setAgentMcpServerIds(agent.mcp_server_ids || []);
    setAgentAllowedTools(agent.allowed_tools || []);
    setAgentMemory(agent.memory || "");
    setAgentFormOpen(true);
    setAgentNotice(null);
  };

  const handleCloseAgentForm = (): void => {
    setAgentFormOpen(false);
    setEditingAgentId(null);
    setAgentName("");
    setAgentInstruction("");
    setAgentDeviceIds([]);
    setAgentMcpServerIds([]);
    setAgentAllowedTools([]);
    setAgentMemory("");
  };

  const handleDiscoverMcpOAuth = async (): Promise<void> => {
    if (!mcpUrl.trim()) {
      setMcpNotice({ severity: "error", text: "Enter the MCP Endpoint URL first to auto-discover OAuth2 endpoints." });
      return;
    }
    setMcpDiscovering(true);
    setMcpNotice(null);
    try {
      const meta = await api.discoverMcpOAuth(mcpUrl.trim());
      if (meta.ok) {
        if (meta.authorization_endpoint) setMcpOAuthAuthUrl(meta.authorization_endpoint);
        if (meta.token_endpoint) setMcpOAuthTokenUrl(meta.token_endpoint);
        setMcpNotice({ severity: "success", text: `Discovered OAuth2 endpoints from ${meta.issuer || mcpUrl}.` });
      } else {
        setMcpNotice({ severity: "info", text: meta.error || "No .well-known OAuth metadata found; enter endpoints manually." });
      }
    } catch (error) {
      setMcpNotice({ severity: "error", text: describeError(error) });
    } finally {
      setMcpDiscovering(false);
    }
  };

  const handleStartMcpOAuth = async (serverId: string): Promise<void> => {
    setMcpLoading(true);
    setMcpNotice(null);
    try {
      const res = await api.startMcpOAuth(serverId);
      if (!res.authorize_url) {
        throw new Error("OAuth2 authorization URL was not returned.");
      }
      const onMsg = (evt: MessageEvent) => {
        if (evt.data && evt.data.type === "mcp_oauth_complete" && evt.data.server_id === serverId) {
          window.removeEventListener("message", onMsg);
          setMcpNotice({
            severity: evt.data.ok ? "success" : "error",
            text: evt.data.message || (evt.data.ok ? "OAuth2 authorized." : "OAuth2 failed."),
          });
          void loadMcpServers();
        }
      };
      window.addEventListener("message", onMsg);
      const popup = window.open(res.authorize_url, "ai_bridge_mcp_oauth", "width=620,height=740");
      if (!popup) {
        window.removeEventListener("message", onMsg);
        window.location.href = res.authorize_url;
      } else {
        setMcpNotice({ severity: "info", text: "Complete OAuth2 authorization in the popup window." });
      }
    } catch (error) {
      setMcpNotice({ severity: "error", text: describeError(error) });
    } finally {
      setMcpLoading(false);
    }
  };

  const handleCreateMcpServer = async (): Promise<void> => {
    if (!mcpName.trim() || !mcpUrl.trim()) {
      setMcpNotice({ severity: "error", text: "MCP service name and URL are required." });
      return;
    }
    setMcpLoading(true);
    setMcpNotice(null);
    try {
      const res = await api.createMcpServer({
        name: mcpName.trim(),
        url: mcpUrl.trim(),
        auth_type: mcpAuthType,
        auth_token: mcpAuthType === "bearer" ? mcpAuthToken.trim() || undefined : undefined,
        auth_header: mcpAuthType === "bearer" ? mcpAuthHeader.trim() || undefined : undefined,
        oauth_client_id: mcpAuthType.startsWith("oauth2_") ? mcpOAuthClientId.trim() || undefined : undefined,
        oauth_client_secret: mcpAuthType.startsWith("oauth2_") ? mcpOAuthClientSecret.trim() || undefined : undefined,
        oauth_auth_url: mcpAuthType === "oauth2_pkce" ? mcpOAuthAuthUrl.trim() || undefined : undefined,
        oauth_token_url: mcpAuthType.startsWith("oauth2_") ? mcpOAuthTokenUrl.trim() || undefined : undefined,
        oauth_scopes: mcpAuthType.startsWith("oauth2_") ? mcpOAuthScopes.trim() || undefined : undefined,
        enabled: true,
      });
      const createdId = res.server?.id;
      setMcpNotice({ severity: "success", text: res.message || `Connected to ${mcpName}. Discovered ${res.tools_count} tools.` });
      setMcpName("");
      setMcpUrl("");
      setMcpAuthType("bearer");
      setMcpAuthToken("");
      setMcpAuthHeader("");
      setMcpOAuthClientId("");
      setMcpOAuthClientSecret("");
      setMcpOAuthAuthUrl("");
      setMcpOAuthTokenUrl("");
      setMcpOAuthScopes("");
      setMcpFormOpen(false);
      await loadMcpServers();
      if (mcpAuthType === "oauth2_pkce" && createdId && !res.server?.oauth_connected) {
        await handleStartMcpOAuth(createdId);
      }
    } catch (error) {
      setMcpNotice({ severity: "error", text: describeError(error) });
    } finally {
      setMcpLoading(false);
    }
  };

  const handleSyncMcpServer = async (serverId: string): Promise<void> => {
    setMcpSyncing((prev) => ({ ...prev, [serverId]: true }));
    try {
      const res = await api.syncMcpServer(serverId);
      setMcpNotice({ severity: res.ok ? "success" : "error", text: res.message || "MCP server synchronized." });
      await loadMcpServers();
    } catch (error) {
      setMcpNotice({ severity: "error", text: describeError(error) });
    } finally {
      setMcpSyncing((prev) => ({ ...prev, [serverId]: false }));
    }
  };

  const handleDeleteMcpServer = async (server: McpServerItem): Promise<void> => {
    if (!window.confirm(`Disconnect MCP service "${server.name}"? Agents using it will lose access to its tools.`)) return;
    setMcpLoading(true);
    try {
      await api.deleteMcpServer(server.id);
      setMcpNotice({ severity: "success", text: `MCP service "${server.name}" removed.` });
      await loadMcpServers();
    } catch (error) {
      setMcpNotice({ severity: "error", text: describeError(error) });
    } finally {
      setMcpLoading(false);
    }
  };

  const handleSaveAgent = async (): Promise<void> => {
    if (!agentName.trim() || !agentInstruction.trim() || agentDeviceIds.length === 0) {
      setAgentNotice({ severity: "error", text: "Give the agent a name, an objective, and at least one device." });
      return;
    }
    if (agentProvider === "custom" && !agentBaseUrl.trim()) {
      setAgentNotice({ severity: "error", text: "A base URL is required for the custom AI provider." });
      return;
    }
    setAgentBusy(true);
    setAgentNotice(null);
    try {
      if (editingAgentId) {
        await api.updateAgent(editingAgentId, {
          name: agentName.trim(),
          instruction: agentInstruction.trim(),
          provider: agentProvider,
          model: agentModel.trim() || undefined,
          base_url: agentProvider === "custom" ? agentBaseUrl.trim() || undefined : undefined,
          device_ids: agentDeviceIds,
          interval_seconds: Math.max(30, parseInt(agentInterval, 10) || 300),
          allowed_tools: agentAllowedTools,
          mcp_server_ids: agentMcpServerIds,
          memory: agentMemory,
        });
        setAgentNotice({ severity: "success", text: `${agentName.trim()} updated successfully.` });
      } else {
        await api.createAgent({
          name: agentName.trim(),
          instruction: agentInstruction.trim(),
          provider: agentProvider,
          model: agentModel.trim() || undefined,
          base_url: agentProvider === "custom" ? agentBaseUrl.trim() || undefined : undefined,
          device_ids: agentDeviceIds,
          interval_seconds: Math.max(30, parseInt(agentInterval, 10) || 300),
          enabled: true,
          allowed_tools: agentAllowedTools.length > 0 ? agentAllowedTools : undefined,
          mcp_server_ids: agentMcpServerIds,
        });
        setAgentNotice({ severity: "success", text: `${agentName.trim()} is live and will run on its interval.` });
      }
      handleCloseAgentForm();
      await loadAgents(true);
    } catch (error) {
      setAgentNotice({ severity: "error", text: describeError(error) });
    } finally {
      setAgentBusy(false);
    }
  };

  const handleToggleAgent = async (agent: CustomAgent): Promise<void> => {
    setAgentBusy(true);
    try {
      await api.updateAgent(agent.id, { enabled: !agent.enabled });
      setAgentNotice({ severity: "success", text: agent.enabled ? `${agent.name} paused.` : `${agent.name} resumed.` });
      await loadAgents(true);
    } catch (error) {
      setAgentNotice({ severity: "error", text: describeError(error) });
    } finally {
      setAgentBusy(false);
    }
  };

  const handleRunAgent = async (agent: CustomAgent): Promise<void> => {
    setAgentBusy(true);
    try {
      await api.runAgentNow(agent.id);
      setAgentNotice({ severity: "info", text: `Run queued for ${agent.name}. Results appear after the next cycle.` });
      window.setTimeout(() => void loadAgents(true), 2500);
    } catch (error) {
      setAgentNotice({ severity: "error", text: describeError(error) });
    } finally {
      setAgentBusy(false);
    }
  };

  const handleDeleteAgent = async (agent: CustomAgent): Promise<void> => {
    if (!window.confirm(`Delete ${agent.name}? Its run history is removed too.`)) return;
    setAgentBusy(true);
    try {
      await api.deleteAgent(agent.id);
      setAgentNotice({ severity: "success", text: `${agent.name} deleted.` });
      await loadAgents(true);
    } catch (error) {
      setAgentNotice({ severity: "error", text: describeError(error) });
    } finally {
      setAgentBusy(false);
    }
  };

  const handleToggleAgentRuns = async (agent: CustomAgent): Promise<void> => {
    const open = !agentRunsOpen[agent.id];
    setAgentRunsOpen((prev) => ({ ...prev, [agent.id]: open }));
    if (open && !agentRuns[agent.id]) {
      setAgentRunsLoading((prev) => ({ ...prev, [agent.id]: true }));
      try {
        const result = await api.agentRuns(agent.id);
        setAgentRuns((prev) => ({ ...prev, [agent.id]: result.runs || [] }));
      } catch (error) {
        setAgentNotice({ severity: "error", text: describeError(error) });
      } finally {
        setAgentRunsLoading((prev) => ({ ...prev, [agent.id]: false }));
      }
    }
  };

  const handleClearAgentMemory = async (agent: CustomAgent): Promise<void> => {
    setAgentBusy(true);
    try {
      await api.updateAgent(agent.id, { memory: "" });
      setAgentNotice({ severity: "success", text: `Memory cleared for ${agent.name}.` });
      await loadAgents(true);
    } catch (error) {
      setAgentNotice({ severity: "error", text: describeError(error) });
    } finally {
      setAgentBusy(false);
    }
  };

  const handleSaveAgentMemory = async (): Promise<void> => {
    if (!memoryTargetAgent) return;
    setAgentBusy(true);
    try {
      await api.updateAgent(memoryTargetAgent.id, { memory: memoryDraft });
      setAgentNotice({ severity: "success", text: `Updated memory for ${memoryTargetAgent.name}.` });
      setMemoryTargetAgent(null);
      await loadAgents(true);
    } catch (error) {
      setAgentNotice({ severity: "error", text: describeError(error) });
    } finally {
      setAgentBusy(false);
    }
  };

  const handleAskAgentSubmit = async (): Promise<void> => {
    if (!askTargetAgent || !askPrompt.trim()) return;
    setAskBusy(true);
    setAskResult(null);
    try {
      const res = await api.askAgent(askTargetAgent.id, askPrompt.trim());
      setAskResult({ response: res?.response || "", steps: Array.isArray(res?.steps) ? res.steps : [] });
      await loadAgents(true);
    } catch (error) {
      setAgentNotice({ severity: "error", text: describeError(error) });
    } finally {
      setAskBusy(false);
    }
  };

  const handlePing = (providerId: string) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === providerId ? { ...p, isPinging: true } : p))
    );
    setTimeout(() => {
      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId
            ? {
              ...p,
              isPinging: false,
              latencyMs: Math.floor(12 + Math.random() * 18),
              status: "healthy",
            }
            : p
        )
      );
    }, 600);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(SDK_SNIPPETS[sdkLang]);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleExecuteTool = () => {
    setIsExecuting(true);
    setTimeout(() => {
      setIsExecuting(false);
      setExecutionResult({
        status: "fulfilled",
        nodeId: selectedNode,
        tool: selectedTool,
        model: selectedModel,
        durationMs: Math.floor(110 + Math.random() * 80),
        tokens: {
          input: Math.floor(380 + Math.random() * 150),
          output: Math.floor(60 + Math.random() * 80),
          cost: "$0.0021",
        },
        output: {
          execution_id: `inv-${Date.now().toString(16)}`,
          node: selectedNode,
          tool: selectedTool,
          exit_code: 0,
          payload_hash: `sha256:${Date.now().toString(16).padStart(64, "0")}`,
          verified_by: "mTLS Enclave Gateway",
        },
      });
    }, 900);
  };

  return (
    <div className="space-y-4">
      {/* SECTION 1: Provider Connector Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-[var(--product-text)]">Providers</h2>
          </div>
        </div>

        <JXCard>
          <JXCardHeader
            title="Connect your AI"
            subheader="Connect a provider key or any OpenAI-compatible endpoint. The key is stored on the server and only ever shown masked here."
            icon={<KeyRound className="w-4 h-4" />}
          />
          <JXCardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <JXSelect
                label="Provider"
                options={AI_PROVIDER_OPTIONS}
                value={aiProvider}
                onChange={(value) => {
                  setAiProvider(value);
                  if (value === "custom") {
                    setAiBaseUrl(aiSettings?.custom_base_url || "");
                    setAiModel(aiSettings?.custom_model || "");
                  }
                }}
              />
              <JXTextField
                label="Model"
                value={aiModel}
                onChange={setAiModel}
                placeholder="gpt-4o-mini, claude-3-5-sonnet, llama3.1:8b"
              />
              {aiProvider === "custom" && (
                <div className="md:col-span-2">
                  <JXTextField
                    label="Base URL"
                    value={aiBaseUrl}
                    onChange={setAiBaseUrl}
                    placeholder="https://openrouter.ai/api/v1"
                  />
                </div>
              )}
              <div className="md:col-span-2">
                <JXTextField
                  label="API key"
                  type="password"
                  value={aiApiKey}
                  onChange={setAiApiKey}
                  clearable={false}
                  placeholder={
                    aiSettings?.masked_keys?.[aiProvider]
                    || (aiProvider === "ollama" ? "Not required for local Ollama" : "Paste the provider API key")
                  }
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--product-text-tertiary)]">
              <JXBadge
                color={aiSettings?.is_connected ? "success" : "neutral"}
                statusText={aiSettings?.is_connected ? "Connected" : "Not connected"}
              />
              <span>
                {aiSettings
                  ? `Active: ${aiSettings.provider}${aiSettings.model ? ` \u00b7 ${aiSettings.model}` : ""}`
                  : "Provider settings unavailable"}
              </span>
              {aiSettings?.masked_keys?.[aiSettings.provider] && (
                <code className="font-mono">{aiSettings.masked_keys[aiSettings.provider]}</code>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <JXButton
                variant="contained"
                color="primary"
                size="md"
                loading={aiSaving}
                disabled={!isLive || aiSaving}
                onClick={handleSaveAi}
                startIcon={<CheckCircle2 className="w-4 h-4" />}
              >
                Save &amp; test
              </JXButton>
              <JXButton
                variant="outlined"
                color="neutral"
                size="sm"
                loading={aiClearing}
                disabled={!isLive || aiClearing}
                onClick={handleClearAi}
              >
                Clear
              </JXButton>
              <JXButton
                variant="soft"
                color="neutral"
                size="sm"
                disabled={!isLive}
                onClick={() => void loadAiSettings()}
                startIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Reload
              </JXButton>
            </div>

            {!isLive && (
              <p className="mt-3 text-xs text-[var(--product-text-tertiary)]">
                Sign in with an admin token to load and save provider settings. Demo data in the list below is static.
              </p>
            )}

            {aiNotice && (
              <div className="mt-3">
                <JXAlert
                  severity={aiNotice.severity}
                  title={aiNotice.severity === "success" ? "Provider saved" : aiNotice.severity === "error" ? "Could not save provider" : "Provider settings"}
                  description={aiNotice.text}
                />
              </div>
            )}
          </JXCardContent>
        </JXCard>

        <JXCard>
          <JXCardContent>
            <ul className="divide-y divide-slate-800">
              {providers.map((provider) => <li key={provider.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-[var(--product-text-secondary)]">{provider.name}</h3>
                  <p className="mt-1 break-all text-xs text-[var(--product-text-tertiary)]">{provider.defaultModel}</p>
                  <details className="mt-2 text-xs text-[var(--product-text-tertiary)]">
                    <summary>Connection details</summary>
                    <code className="mt-2 block break-all">{provider.endpoint}</code>
                    <p className="mt-1">{provider.status} · {provider.latencyMs}ms</p>
                  </details>
                </div>
                <JXButton variant="outlined" color="neutral" size="sm" loading={provider.isPinging}
                  onClick={() => handlePing(provider.id)} aria-label={`Test ${provider.name}`}>Test</JXButton>
              </li>)}
            </ul>
          </JXCardContent>
        </JXCard>

        {/* SECTION: Connected MCP Services & Tools */}
        <JXCard>
          <JXCardHeader
            title="Connected MCP Services & Tools"
            subheader="Connect external services (GitHub, Slack, Databases, Brave Search, or custom endpoints) using Model Context Protocol. Connected tools are callable by your 24/7 custom agents and AI copilot."
            icon={<Network className="w-4 h-4 text-emerald-400" />}
          />
          <JXCardContent>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--product-text-tertiary)]">
                {isLive
                  ? `${mcpServers.length} MCP service${mcpServers.length === 1 ? "" : "s"} connected (${mcpServers.reduce((sum, s) => sum + (s.tools_count || 0), 0)} tools discovered)`
                  : "Sign in with an admin token to manage MCP services."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <JXButton
                  variant="contained"
                  color="primary"
                  size="sm"
                  disabled={!isLive || mcpLoading}
                  onClick={() => {
                    setMcpFormOpen((prev) => !prev);
                    setMcpNotice(null);
                  }}
                  startIcon={<Plus className="w-4 h-4" />}
                >
                  {mcpFormOpen ? "Close form" : "Connect MCP service"}
                </JXButton>
                <JXButton
                  variant="soft"
                  color="neutral"
                  size="sm"
                  disabled={!isLive || mcpLoading}
                  onClick={() => void loadMcpServers()}
                  startIcon={<RefreshCw className="w-3.5 h-3.5" />}
                >
                  Reload
                </JXButton>
              </div>
            </div>

            {mcpFormOpen && (
              <div className="mt-4 space-y-3 rounded-lg border border-[var(--product-line)] bg-[var(--product-canvas)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-[var(--product-text-secondary)]">Add MCP Connector</h3>
                  {mcpTemplates.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-[var(--product-text-tertiary)]">Presets:</span>
                      {mcpTemplates.filter((tpl) => tpl.id !== "custom-mcp").map((tpl) => (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => {
                            setMcpName(tpl.name);
                            setMcpUrl(tpl.url);
                            if (tpl.auth_type) {
                              setMcpAuthType(tpl.auth_type);
                            } else {
                              setMcpAuthType(tpl.requires_auth ? "bearer" : "none");
                            }
                            if (tpl.oauth_auth_url) setMcpOAuthAuthUrl(tpl.oauth_auth_url);
                            if (tpl.oauth_token_url) setMcpOAuthTokenUrl(tpl.oauth_token_url);
                            if (tpl.oauth_scopes) setMcpOAuthScopes(tpl.oauth_scopes);
                            if (!tpl.requires_auth) setMcpAuthToken("");
                          }}
                          className="rounded px-2 py-0.5 text-[11px] bg-[var(--product-surface)] border border-[var(--product-line)] text-[var(--product-text-secondary)] hover:text-indigo-400"
                        >
                          {tpl.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <JXTextField
                    label="Service Name"
                    value={mcpName}
                    onChange={setMcpName}
                    placeholder="GitHub MCP, Slack MCP, Database MCP"
                  />
                  <JXTextField
                    label="MCP Endpoint URL (HTTP or SSE)"
                    value={mcpUrl}
                    onChange={setMcpUrl}
                    placeholder="http://mcp-http:8001 or https://api.service.com/mcp"
                  />
                  <JXSelect
                    label="Authentication Mode"
                    value={mcpAuthType}
                    onChange={setMcpAuthType}
                    options={[
                      { id: "bearer", label: "Bearer Token / API Key" },
                      { id: "oauth2_pkce", label: "OAuth 2.0 / 2.1 (Browser Login + PKCE)" },
                      { id: "oauth2_client_credentials", label: "OAuth 2.0 (Client Credentials M2M)" },
                      { id: "none", label: "No Authentication" },
                    ]}
                  />

                  {mcpAuthType === "bearer" && (
                    <JXTextField
                      label="Authentication Token (Optional)"
                      type="password"
                      value={mcpAuthToken}
                      onChange={setMcpAuthToken}
                      clearable={false}
                      placeholder="Bearer token or API key if required"
                    />
                  )}

                  {mcpAuthType === "oauth2_pkce" && (
                    <div className="flex items-end">
                      <JXButton
                        variant="outlined"
                        color="neutral"
                        size="sm"
                        loading={mcpDiscovering}
                        disabled={!mcpUrl.trim() || mcpDiscovering}
                        onClick={() => void handleDiscoverMcpOAuth()}
                        startIcon={<Globe className="w-3.5 h-3.5" />}
                      >
                        Auto-discover OAuth2 endpoints
                      </JXButton>
                    </div>
                  )}

                  {(mcpAuthType === "oauth2_pkce" || mcpAuthType === "oauth2_client_credentials") && (
                    <>
                      {mcpAuthType === "oauth2_pkce" && (
                        <JXTextField
                          label="Authorization URL (optional if auto-discovered)"
                          value={mcpOAuthAuthUrl}
                          onChange={setMcpOAuthAuthUrl}
                          placeholder="https://provider.com/oauth/authorize"
                        />
                      )}
                      <JXTextField
                        label="Token URL (optional if auto-discovered)"
                        value={mcpOAuthTokenUrl}
                        onChange={setMcpOAuthTokenUrl}
                        placeholder="https://provider.com/oauth/token"
                      />
                      <JXTextField
                        label={mcpAuthType === "oauth2_pkce" ? "Client ID (optional with Dynamic Registration)" : "Client ID"}
                        value={mcpOAuthClientId}
                        onChange={setMcpOAuthClientId}
                        placeholder="client_id"
                      />
                      <JXTextField
                        label={mcpAuthType === "oauth2_pkce" ? "Client Secret (optional for public PKCE)" : "Client Secret"}
                        type="password"
                        value={mcpOAuthClientSecret}
                        onChange={setMcpOAuthClientSecret}
                        clearable={false}
                        placeholder="client_secret"
                      />
                      <div className="md:col-span-2">
                        <JXTextField
                          label="Scopes (optional, space-separated)"
                          value={mcpOAuthScopes}
                          onChange={setMcpOAuthScopes}
                          placeholder="read write mcp:tools"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <JXButton
                    variant="contained"
                    color="primary"
                    size="sm"
                    loading={mcpLoading}
                    disabled={!isLive || mcpLoading || !mcpName.trim() || !mcpUrl.trim()}
                    onClick={() => void handleCreateMcpServer()}
                    startIcon={mcpAuthType === "oauth2_pkce" ? <KeyRound className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  >
                    {mcpAuthType === "oauth2_pkce" ? "Save & Authorize with OAuth2" : "Connect & probe tools"}
                  </JXButton>
                  <JXButton variant="text" color="neutral" size="sm" onClick={() => setMcpFormOpen(false)}>
                    Cancel
                  </JXButton>
                </div>
              </div>
            )}

            {mcpNotice && (
              <div className="mt-3">
                <JXAlert
                  severity={mcpNotice.severity}
                  title={mcpNotice.severity === "success" ? "MCP Service" : "MCP Service Notice"}
                  description={mcpNotice.text}
                />
              </div>
            )}

            {mcpServers.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-[var(--product-line)] p-4 text-center">
                <p className="text-xs text-[var(--product-text-tertiary)]">
                  No external MCP services connected. Click <strong>Connect MCP service</strong> to add GitHub, Slack, local AI Bridge Fleet, or custom tool endpoints.
                </p>
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  <JXButton
                    variant="soft"
                    color="primary"
                    size="sm"
                    disabled={!isLive}
                    onClick={() => {
                      setMcpName("Local AI Bridge Fleet MCP");
                      setMcpUrl("http://mcp-http:8001");
                      setMcpFormOpen(true);
                    }}
                    startIcon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Add Built-in Fleet MCP
                  </JXButton>
                </div>
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-slate-800">
                {mcpServers.map((srv) => (
                  <li key={srv.id} className="py-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="text-sm font-medium text-[var(--product-text-secondary)]">{srv.name}</h3>
                        <JXBadge
                          color={srv.status === "healthy" ? "success" : srv.status === "pending_auth" ? "warning" : srv.status === "offline" ? "error" : "neutral"}
                          statusText={srv.status === "healthy" ? "Connected" : srv.status === "pending_auth" ? "Auth Required" : srv.status === "offline" ? "Offline" : "Unknown"}
                        />
                        {srv.auth_type && srv.auth_type.startsWith("oauth2") && (
                          <JXBadge
                            color={srv.oauth_connected ? "success" : "warning"}
                            statusText={srv.auth_type === "oauth2_client_credentials" ? "OAuth2 M2M" : srv.oauth_connected ? "OAuth2 Authorized" : "OAuth2 Pending"}
                          />
                        )}
                        <JXBadge
                          color="primary"
                          statusText={`${srv.tools_count || 0} tool${srv.tools_count === 1 ? "" : "s"}`}
                        />
                        <span className="font-mono text-xs text-[var(--product-text-tertiary)] break-all">{srv.url}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {(srv.auth_type === "oauth2_pkce" || srv.status === "pending_auth") && (
                          <JXButton
                            variant="contained"
                            color="primary"
                            size="sm"
                            disabled={mcpLoading}
                            onClick={() => void handleStartMcpOAuth(srv.id)}
                            startIcon={<KeyRound className="w-3.5 h-3.5" />}
                          >
                            {srv.oauth_connected ? "Re-authorize" : "Connect OAuth2"}
                          </JXButton>
                        )}
                        <JXButton
                          variant="outlined"
                          color="neutral"
                          size="sm"
                          loading={mcpSyncing[srv.id]}
                          disabled={mcpLoading}
                          onClick={() => void handleSyncMcpServer(srv.id)}
                          startIcon={<RefreshCw className="w-3.5 h-3.5" />}
                        >
                          Sync tools
                        </JXButton>
                        <JXButton
                          variant="text"
                          color="neutral"
                          size="sm"
                          onClick={() =>
                            setMcpToolsExpanded((prev) => ({ ...prev, [srv.id]: !prev[srv.id] }))
                          }
                          startIcon={
                            mcpToolsExpanded[srv.id] ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )
                          }
                        >
                          {mcpToolsExpanded[srv.id] ? "Hide tools" : "View tools"}
                        </JXButton>
                        <JXButton
                          variant="text"
                          color="error"
                          size="sm"
                          disabled={mcpLoading}
                          onClick={() => void handleDeleteMcpServer(srv)}
                          startIcon={<Trash2 className="w-3.5 h-3.5" />}
                        >
                          Remove
                        </JXButton>
                      </div>
                    </div>

                    {srv.last_error && <p className="text-xs text-red-400">{srv.last_error}</p>}

                    {mcpToolsExpanded[srv.id] && (
                      <div className="mt-2 rounded-lg border border-[var(--product-line)] bg-[var(--product-canvas)] p-3 space-y-2">
                        <h4 className="text-xs font-semibold text-[var(--product-text-secondary)]">
                          Discovered Tools ({srv.tools?.length || 0})
                        </h4>
                        {(!srv.tools || srv.tools.length === 0) ? (
                          <p className="text-xs text-[var(--product-text-tertiary)]">No tools discovered yet. Click Sync tools to probe.</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto">
                            {srv.tools.map((t) => {
                              const policyKey = `${srv.id}:${t.name}`;
                              const curPolicy = mcpToolPolicies[policyKey] || "allow";
                              return (
                                <div key={t.name} className="p-2 rounded border border-[var(--product-line)] bg-[var(--product-surface)] space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="font-mono text-xs font-semibold text-indigo-300 truncate">
                                      mcp__{srv.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}__{t.name}
                                    </p>
                                    <select
                                      aria-label={`Policy for ${t.name}`}
                                      value={curPolicy}
                                      onChange={(e) => void handleMcpPolicyChange(srv.id, t.name, e.target.value)}
                                      className="rounded bg-black/50 border border-[var(--product-line)] px-1.5 py-0.5 text-[10px] font-mono text-neutral-200"
                                    >
                                      <option value="allow">Allow</option>
                                      <option value="require_approval">Require approval</option>
                                      <option value="deny">Deny</option>
                                    </select>
                                  </div>
                                  <p className="text-xs text-[var(--product-text-tertiary)] line-clamp-2">{t.description}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </JXCardContent>
        </JXCard>

        <JXCard>
          <JXCardHeader
            title="Custom 24/7 agents"
            subheader="Bind an objective to a connected AI provider and enrolled devices. While this control plane is online, each enabled agent keeps running on its own interval."
            icon={<Bot className="w-4 h-4" />}
          />
          <JXCardContent>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--product-text-tertiary)]">
                {isLive
                  ? `${agents.length} agent${agents.length === 1 ? "" : "s"} configured`
                  : "Sign in with an admin token to create and run agents."}
              </p>
              <JXButton
                variant="contained"
                color="primary"
                size="sm"
                disabled={!isLive || agentBusy}
                onClick={openAgentForm}
                startIcon={<Bot className="w-4 h-4" />}
              >
                New agent
              </JXButton>
            </div>

            {agents.length === 0 ? (
              <p className="mt-3 text-xs text-[var(--product-text-tertiary)]">
                No custom agents yet. Create one and it will start working through its objective on your devices.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-800">
                {agents.map((agent) => (
                  <li key={agent.id} className="space-y-2 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-medium text-[var(--product-text-secondary)]">{agent.name}</h3>
                        <JXBadge
                          color={agent.status === "error" ? "warning" : agent.enabled ? "success" : "neutral"}
                          statusText={agent.status === "running" ? "Running" : agent.status === "error" ? "Error" : agent.enabled ? "Active" : "Paused"}
                        />
                        <span className="text-xs text-[var(--product-text-tertiary)]">
                          {agent.provider}{agent.model ? ` \u00b7 ${agent.model}` : ""}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <JXButton
                          variant="outlined"
                          color="neutral"
                          size="sm"
                          disabled={agentBusy}
                          onClick={() => handleEditAgent(agent)}
                          startIcon={<Pencil className="w-3.5 h-3.5" />}
                        >
                          Edit
                        </JXButton>
                        <JXButton
                          variant="outlined"
                          color="neutral"
                          size="sm"
                          disabled={agentBusy}
                          onClick={() => void handleToggleAgent(agent)}
                          startIcon={agent.enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        >
                          {agent.enabled ? "Pause" : "Start"}
                        </JXButton>
                        <JXButton
                          variant="soft"
                          color="neutral"
                          size="sm"
                          disabled={agentBusy || !agent.enabled}
                          onClick={() => void handleRunAgent(agent)}
                          startIcon={<Zap className="w-3.5 h-3.5" />}
                        >
                          Run now
                        </JXButton>
                        <JXButton
                          variant="outlined"
                          color="primary"
                          size="sm"
                          disabled={agentBusy}
                          onClick={() => { setAskTargetAgent(agent); setAskPrompt(""); setAskResult(null); }}
                          startIcon={<Send className="w-3.5 h-3.5" />}
                        >
                          Ask
                        </JXButton>
                        <JXButton
                          variant="text"
                          color="error"
                          size="sm"
                          disabled={agentBusy}
                          onClick={() => void handleDeleteAgent(agent)}
                          startIcon={<Trash2 className="w-3.5 h-3.5" />}
                        >
                          Delete
                        </JXButton>
                      </div>
                    </div>
                    <p className="text-xs text-[var(--product-text-tertiary)]">
                      {agent.devices.map((device) => device.name || device.hostname || device.id).join(", ")}
                      {" \u00b7 "}{formatInterval(agent.interval_seconds)}
                      {" \u00b7 "}{agent.run_count} run{agent.run_count === 1 ? "" : "s"}
                      {" \u00b7 "}last {relativeTime(agent.last_run_at)}
                    </p>
                    {agent.mcp_servers && agent.mcp_servers.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] text-[var(--product-text-tertiary)] flex items-center gap-1">
                          <Network className="w-3 h-3 text-emerald-400" /> MCP:
                        </span>
                        {agent.mcp_servers.map((s) => (
                          <JXBadge
                            key={s.id}
                            color="primary"
                            statusText={`${s.name} (${s.tools_count} tools)`}
                          />
                        ))}
                      </div>
                    )}
                    {agent.last_error ? (
                      <p className="text-xs text-red-400">Last error: {agent.last_error}</p>
                    ) : agent.last_result ? (
                      <p className="line-clamp-2 text-xs text-[var(--product-text-tertiary)]">{agent.last_result}</p>
                    ) : null}
                    {(agent.consecutive_failures || 0) > 0 && (
                      <p className="text-xs text-amber-400">
                        Consecutive failures: {agent.consecutive_failures} (auto-pauses at 5)
                      </p>
                    )}
                    {agent.memory ? (
                      <div className="mt-1">
                        <p className="line-clamp-3 text-xs text-indigo-300">Memory: {agent.memory}</p>
                        <div className="flex items-center gap-2">
                          <JXButton
                            variant="text"
                            color="neutral"
                            size="sm"
                            disabled={agentBusy}
                            onClick={() => { setMemoryTargetAgent(agent); setMemoryDraft(agent.memory || ""); }}
                          >
                            Edit memory
                          </JXButton>
                          <JXButton
                            variant="text"
                            color="neutral"
                            size="sm"
                            disabled={agentBusy}
                            onClick={() => void handleClearAgentMemory(agent)}
                          >
                            Clear memory
                          </JXButton>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1">
                        <JXButton
                          variant="text"
                          color="neutral"
                          size="sm"
                          disabled={agentBusy}
                          onClick={() => { setMemoryTargetAgent(agent); setMemoryDraft(""); }}
                        >
                          Add pinned memory
                        </JXButton>
                      </div>
                    )}
                    <div className="mt-2">
                      <JXButton
                        variant="text"
                        color="neutral"
                        size="sm"
                        onClick={() => void handleToggleAgentRuns(agent)}
                        startIcon={agentRunsOpen[agent.id] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      >
                        Recent runs
                      </JXButton>
                      {agentRunsOpen[agent.id] && (
                        <div className="mt-2 space-y-2 rounded-lg border border-[var(--product-line)] bg-[var(--product-canvas)] p-3">
                          {agentRunsLoading[agent.id] ? (
                            <p className="text-xs text-[var(--product-text-tertiary)]">Loading runs…</p>
                          ) : (agentRuns[agent.id] || []).length === 0 ? (
                            <p className="text-xs text-[var(--product-text-tertiary)]">No runs yet.</p>
                          ) : (
                            <ul className="space-y-2">
                              {(agentRuns[agent.id] || []).slice(0, 10).map((run: any) => (
                                <li key={run.id} className="rounded border border-[var(--product-line)] p-2 text-xs">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <JXBadge
                                      color={run.status === "completed" ? "success" : run.status === "failed" ? "warning" : "neutral"}
                                      statusText={run.status}
                                    />
                                    <span className="text-[var(--product-text-tertiary)]">
                                      {run.started_at ? new Date(run.started_at * 1000).toLocaleString() : ""}
                                    </span>
                                    {run.duration_ms != null && (
                                      <span className="text-[var(--product-text-tertiary)]">{run.duration_ms} ms</span>
                                    )}
                                  </div>
                                  {run.error ? (
                                    <p className="mt-1 text-red-400">{run.error}</p>
                                  ) : run.response ? (
                                    <p className="mt-1 line-clamp-3 text-[var(--product-text-tertiary)]">{run.response}</p>
                                  ) : null}
                                  {Array.isArray(run.steps) && run.steps.length > 0 && (
                                    <div className="mt-1.5">
                                      <button
                                        type="button"
                                        onClick={() => setExpandedRunTrace((prev) => ({ ...prev, [run.id]: !prev[run.id] }))}
                                        className="font-mono text-[11px] text-indigo-400 hover:underline"
                                      >
                                        {expandedRunTrace[run.id] ? "Hide" : "View"} tool trace ({run.steps.length} step{run.steps.length === 1 ? "" : "s"})
                                      </button>
                                      {expandedRunTrace[run.id] && (
                                        <div className="mt-1.5 space-y-1.5 border-l-2 border-indigo-500/40 pl-2">
                                          {run.steps.map((st: any, idx: number) => (
                                            <div key={idx} className="rounded bg-[var(--product-surface)] p-1.5 font-mono text-[11px]">
                                              <div className="flex items-center justify-between text-indigo-300 gap-2 flex-wrap">
                                                <span className="flex items-center gap-1.5">
                                                  <span>{idx + 1}. {st.tool}</span>
                                                  {st.tool === "agent_delegate" && st.result?.agent_name && (
                                                    <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 text-[10px]">
                                                      Delegated → {st.result.agent_name}
                                                    </span>
                                                  )}
                                                  {st.tool === "agent_run_workflow" && st.result?.workflow_id && (
                                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px]">
                                                      Workflow {st.result.workflow_id} ({st.result.status || "ran"})
                                                    </span>
                                                  )}
                                                </span>
                                                <span className="text-[10px] text-[var(--product-text-dim)]">{st.device || "local"}</span>
                                              </div>
                                              {st.args && Object.keys(st.args).length > 0 && (
                                                <pre className="mt-0.5 text-[10px] text-[var(--product-text-tertiary)] overflow-x-auto">{JSON.stringify(st.args)}</pre>
                                              )}
                                              {st.result !== undefined && (
                                                <pre className="mt-0.5 text-[10px] text-emerald-300/90 overflow-x-auto max-h-24">{typeof st.result === "string" ? st.result : JSON.stringify(st.result)}</pre>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {agentFormOpen && (
              <div className="mt-4 space-y-3 rounded-lg border border-[var(--product-line)] bg-[var(--product-canvas)] p-4">
                <div className="flex items-center justify-between border-b border-[var(--product-line)] pb-2.5">
                  <div className="flex items-center gap-2">
                    {editingAgentId ? <Pencil className="w-4 h-4 text-primary-400" /> : <Bot className="w-4 h-4 text-primary-400" />}
                    <span className="text-sm font-semibold text-[var(--product-text-primary)]">
                      {editingAgentId ? `Edit Agent: ${agentName || "Untitled"}` : "Configure 24/7 autonomous agent"}
                    </span>
                  </div>
                  <JXButton variant="text" color="neutral" size="sm" onClick={handleCloseAgentForm}>
                    <X className="w-4 h-4" />
                  </JXButton>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <JXTextField
                    label="Agent name"
                    value={agentName}
                    onChange={setAgentName}
                    placeholder="Nightly fleet health check"
                  />
                  <JXSelect
                    label="Connected AI"
                    options={AI_PROVIDER_OPTIONS}
                    value={agentProvider}
                    onChange={(value) => {
                      setAgentProvider(value);
                      if (value === "custom") {
                        setAgentBaseUrl(aiSettings?.custom_base_url || "");
                        setAgentModel(aiSettings?.custom_model || "");
                      } else {
                        setAgentModel(aiSettings?.model || "");
                      }
                    }}
                  />
                  <JXTextField
                    label="Model (optional)"
                    value={agentModel}
                    onChange={setAgentModel}
                    placeholder={agentProvider === "custom" ? "Provider default" : "gpt-4o"}
                  />
                  <JXSelect
                    label="Run interval"
                    options={AGENT_INTERVAL_OPTIONS}
                    value={agentInterval}
                    onChange={setAgentInterval}
                  />
                </div>

                {agentProvider === "custom" && (
                  <JXTextField
                    label="Custom AI base URL"
                    value={agentBaseUrl}
                    onChange={setAgentBaseUrl}
                    placeholder="https://openrouter.ai/api/v1"
                  />
                )}

                <div>
                  <label className="mb-1 block text-xs font-mono text-[var(--product-text-tertiary)]">
                    Objective / instructions
                  </label>
                  <textarea
                    aria-label="Agent objective"
                    rows={4}
                    value={agentInstruction}
                    onChange={(event) => setAgentInstruction(event.target.value)}
                    placeholder="Check disk usage on every bound device, clean safe caches above 85%, and report anything that needs a human."
                    className="w-full resize-none rounded-lg border border-[var(--product-line)] bg-[var(--product-surface)] p-3 text-xs text-[var(--product-text-secondary)] focus:outline-none"
                  />
                </div>

                <div>
                  <p className="mb-1 text-xs font-mono text-[var(--product-text-tertiary)]">Bound devices ({agentDeviceIds.length} selected)</p>
                  <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto md:grid-cols-2">
                    {devices.map((device) => (
                      <label key={device.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs text-[var(--product-text-secondary)] hover:bg-[var(--product-surface)]">
                        <input
                          type="checkbox"
                          checked={agentDeviceIds.includes(device.id)}
                          onChange={(event) =>
                            setAgentDeviceIds((previous) =>
                              event.target.checked
                                ? [...previous, device.id]
                                : previous.filter((id) => id !== device.id)
                            )
                          }
                        />
                        <span className="truncate">
                          {device.name}{" "}
                          <span className="text-[var(--product-text-tertiary)]">({device.hostname})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {mcpServers.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-mono text-[var(--product-text-tertiary)] flex items-center gap-1">
                        <Network className="w-3.5 h-3.5 text-emerald-400" />
                        Connected MCP Services ({agentMcpServerIds.length} enabled)
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setAgentMcpServerIds(
                            agentMcpServerIds.length === mcpServers.length
                              ? []
                              : mcpServers.map((s) => s.id)
                          )
                        }
                        className="text-[11px] text-indigo-400 hover:underline"
                      >
                        {agentMcpServerIds.length === mcpServers.length ? "Deselect all" : "Select all"}
                      </button>
                    </div>
                    <div className="grid max-h-36 grid-cols-1 gap-1 overflow-y-auto md:grid-cols-2">
                      {mcpServers.map((srv) => (
                        <label key={srv.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs text-[var(--product-text-secondary)] hover:bg-[var(--product-surface)]">
                          <input
                            type="checkbox"
                            checked={agentMcpServerIds.includes(srv.id)}
                            onChange={(e) =>
                              setAgentMcpServerIds((prev) =>
                                e.target.checked ? [...prev, srv.id] : prev.filter((id) => id !== srv.id)
                              )
                            }
                          />
                          <span className="truncate">
                            {srv.name}{" "}
                            <span className="text-[var(--product-text-tertiary)]">({srv.tools_count} tools)</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-mono text-[var(--product-text-tertiary)] flex items-center gap-1">
                      <Wrench className="w-3.5 h-3.5 text-indigo-400" />
                      Device Tools Scope ({agentAllowedTools.length === 0 ? "All 49 device tools (default)" : `${agentAllowedTools.length} selected`})
                    </p>
                    {agentAllowedTools.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setAgentAllowedTools([])}
                        className="text-[11px] text-indigo-400 hover:underline"
                      >
                        Reset to All Tools
                      </button>
                    )}
                  </div>
                  <div className="grid max-h-36 grid-cols-1 gap-1 overflow-y-auto md:grid-cols-2">
                    {DEVICE_TOOL_OPTIONS.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs text-[var(--product-text-secondary)] hover:bg-[var(--product-surface)]">
                        <input
                          type="checkbox"
                          checked={agentAllowedTools.length === 0 || agentAllowedTools.includes(t.id)}
                          onChange={(e) => {
                            if (agentAllowedTools.length === 0) {
                              if (!e.target.checked) {
                                setAgentAllowedTools(DEVICE_TOOL_OPTIONS.filter((item) => item.id !== t.id).map((item) => item.id));
                              }
                            } else {
                              setAgentAllowedTools((prev) =>
                                e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)
                              );
                            }
                          }}
                        />
                        <span className="truncate font-mono text-[11px]">{t.id} <span className="text-[var(--product-text-tertiary)] font-sans">({t.label})</span></span>
                      </label>
                    ))}
                  </div>
                </div>

                {editingAgentId && (
                  <div>
                    <label className="mb-1 block text-xs font-mono text-[var(--product-text-tertiary)]">
                      Agent persistent memory / notes
                    </label>
                    <textarea
                      aria-label="Agent memory"
                      rows={2}
                      value={agentMemory}
                      onChange={(e) => setAgentMemory(e.target.value)}
                      placeholder="Agent memory or persistent operational state..."
                      className="w-full resize-none rounded-lg border border-[var(--product-line)] bg-[var(--product-surface)] p-3 text-xs text-[var(--product-text-secondary)] focus:outline-none"
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <JXButton
                    variant="contained"
                    color="primary"
                    size="md"
                    loading={agentBusy}
                    disabled={!isLive || agentBusy || !agentName.trim() || !agentInstruction.trim() || agentDeviceIds.length === 0}
                    onClick={() => void handleSaveAgent()}
                    startIcon={editingAgentId ? <Check className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                  >
                    {editingAgentId ? "Update agent" : "Create 24/7 agent"}
                  </JXButton>
                  <JXButton variant="text" color="neutral" size="sm" onClick={handleCloseAgentForm}>
                    Cancel
                  </JXButton>
                  <span className="flex items-center gap-1 text-xs text-[var(--product-text-tertiary)]">
                    <Clock3 className="w-3.5 h-3.5" /> {editingAgentId ? "Updates apply on the agent's next cycle." : "Repeats until you pause or delete it."}
                  </span>
                </div>
              </div>
            )}

            {agentNotice && (
              <div className="mt-3">
                <JXAlert
                  severity={agentNotice.severity}
                  title={agentNotice.severity === "success" ? "Custom agents" : agentNotice.severity === "error" ? "Could not update agent" : "Agent run"}
                  description={agentNotice.text}
                />
              </div>
            )}
          </JXCardContent>
        </JXCard>
      </div>

      {/* SECTION 2 & 3: Multi-Language SDK Generator & Interactive Tool Sandbox */}
      <JXGrid columns={12} gap="lg">
        {/* Multi-Language SDK Code Generator */}
        <JXGridItem colSpan={12}>
          <JXCard className="bg-[var(--product-surface)]/60 border-[var(--product-line)]">
            <details>
              <summary className="text-sm font-semibold text-[var(--product-text-secondary)]">Code examples</summary>
              <JXCardContent>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-[var(--product-canvas)] border border-[var(--product-line)]">
                      <button
                        type="button"
                        onClick={() => setSdkLang("python")}
                        className={`px-3 py-1 rounded text-xs font-mono transition-colors ${sdkLang === "python"
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
                          }`}
                      >
                        Python
                      </button>
                      <button
                        type="button"
                        onClick={() => setSdkLang("typescript")}
                        className={`px-3 py-1 rounded text-xs font-mono transition-colors ${sdkLang === "typescript"
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
                          }`}
                      >
                        TypeScript
                      </button>
                      <button
                        type="button"
                        onClick={() => setSdkLang("curl")}
                        className={`px-3 py-1 rounded text-xs font-mono transition-colors ${sdkLang === "curl"
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
                          }`}
                      >
                        cURL
                      </button>
                      <button
                        type="button"
                        onClick={() => setSdkLang("mcp")}
                        className={`px-3 py-1 rounded text-xs font-mono transition-colors ${sdkLang === "mcp"
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
                          }`}
                      >
                        MCP JSON-RPC
                      </button>
                    </div>

                    <JXButton
                      variant="soft"
                      color="primary"
                      size="sm"
                      onClick={handleCopyCode}
                      startIcon={
                        copiedCode ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )
                      }
                    >
                      {copiedCode ? "Copied" : "Copy Snippet"}
                    </JXButton>
                  </div>

                  <div tabIndex={0} role="region" aria-label="SDK code example" className="rounded-xl bg-[var(--product-canvas)] border border-[var(--product-line)] p-4 font-mono text-xs overflow-x-auto text-[var(--product-text-secondary)] leading-relaxed max-h-[380px] overflow-y-auto">
                    <pre>
                      <code>{SDK_SNIPPETS[sdkLang]}</code>
                    </pre>
                  </div>
                </div>
              </JXCardContent>
            </details>
          </JXCard>
        </JXGridItem>

        {/* Interactive AI Copilot Chat (Devices + OAuth2 MCP Connectors) */}
        <JXGridItem colSpan={12}>
          <JXCard className="bg-[var(--product-surface)]/70 border-[var(--product-line)]">
            <JXCardHeader
              title="AI Copilot Chat"
              subheader="Multi-turn troubleshooting & research across connected devices and active OAuth2/MCP servers"
              icon={<MessageSquare className="w-5 h-5 text-cyan-400" />}
            />
            <JXCardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <JXBadge color="info">
                    {mcpServers.filter((s) => s.enabled).length} active MCP
                  </JXBadge>
                  {copilotMessages.length > 0 && (
                    <JXButton
                      variant="text"
                      size="sm"
                      onClick={handleCopilotClear}
                      disabled={copilotBusy}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Clear
                    </JXButton>
                  )}
                </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-neutral-400 mb-1">
                    Target Device (Optional)
                  </label>
                  <select
                    aria-label="Copilot Target Device"
                    value={copilotDevice}
                    onChange={(e) => setCopilotDevice(e.target.value)}
                    className="w-full rounded-xl bg-black/40 border border-[var(--product-line)] px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-cyan-400/60"
                  >
                    <option value="">Auto / All fleet & MCP tools</option>
                    {devices.map((dev) => (
                      <option key={dev.id} value={dev.id}>
                        {dev.hostname || dev.id} ({dev.status})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-neutral-400 mb-1">
                    Model Provider Override
                  </label>
                  <select
                    aria-label="Copilot Provider"
                    value={copilotProvider}
                    onChange={(e) => setCopilotProvider(e.target.value)}
                    className="w-full rounded-xl bg-black/40 border border-[var(--product-line)] px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-cyan-400/60"
                  >
                    <option value="">Default configured provider</option>
                    <option value="anthropic">Anthropic Claude</option>
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="custom">Custom OpenAI-Compatible</option>
                  </select>
                </div>
              </div>

              {mcpServers.filter((s) => s.enabled).length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-400">
                  <span>Active MCP connectors:</span>
                  {mcpServers
                    .filter((s) => s.enabled)
                    .map((srv) => (
                      <JXBadge key={srv.id} color="default">
                        {srv.name} ({srv.tools_count || 0} tools)
                      </JXBadge>
                    ))}
                </div>
              )}

              {copilotError && (
                <JXAlert severity="error" title="Copilot request failed" description={copilotError} />
              )}

              {copilotSaveNotice && (
                <JXAlert severity="success" title="Workflow template saved" description={copilotSaveNotice} />
              )}

              {copilotBusy && copilotLiveEvents.length > 0 && (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 space-y-1 text-[11px] font-mono">
                  <div className="text-cyan-300 font-semibold">Live tool execution:</div>
                  {copilotLiveEvents.map((ev, i) => (
                    <div key={i} className="flex items-center justify-between text-neutral-300">
                      <span>{ev.step ? `Step ${ev.step}: ` : ""}{ev.tool} ({ev.device || "local"})</span>
                      <span className={ev.status === "done" ? "text-emerald-400" : ev.status === "error" ? "text-rose-400" : "text-amber-300"}>
                        {ev.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-[var(--product-line)] bg-black/35 p-3 max-h-96 overflow-y-auto space-y-3">
                {copilotMessages.length === 0 ? (
                  <p className="text-xs text-neutral-500 text-center py-6">
                    Ask the Copilot to inspect a device, search docs via Firecrawl MCP, or run diagnostics.
                  </p>
                ) : (
                  copilotMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`rounded-xl p-3 text-xs border ${msg.role === "user"
                        ? "bg-indigo-500/10 border-indigo-500/30 text-neutral-100 ml-6"
                        : "bg-neutral-900/80 border-[var(--product-line)] text-neutral-200 mr-6"
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1 text-[10px] uppercase tracking-wider text-neutral-400">
                        <span>{msg.role === "user" ? "You" : "Copilot"}</span>
                        {msg.model && (
                          <span className="font-mono text-neutral-500">
                            {msg.provider ? `${msg.provider}: ` : ""}
                            {msg.model}
                          </span>
                        )}
                      </div>
                      <div className="whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </div>
                      {msg.steps && msg.steps.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-[var(--product-line)]/60">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() =>
                                setCopilotExpandedSteps((prev) => ({
                                  ...prev,
                                  [msg.id]: !prev[msg.id],
                                }))
                              }
                              className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200"
                            >
                              {copilotExpandedSteps[msg.id] ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                              {msg.steps.length} tool call{msg.steps.length === 1 ? "" : "s"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSaveCopilotAsWorkflow(msg)}
                              className="text-[11px] font-mono text-indigo-300 hover:text-indigo-200 hover:underline"
                            >
                              Save as Workflow
                            </button>
                          </div>
                          {copilotExpandedSteps[msg.id] && (
                            <pre className="mt-2 p-2 rounded-lg bg-black/60 text-[11px] text-neutral-300 overflow-x-auto max-h-48">
                              {JSON.stringify(msg.steps, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleCopilotSend} className="flex items-center gap-2">
                <input
                  type="text"
                  value={copilotInput}
                  onChange={(e) => setCopilotInput(e.target.value)}
                  placeholder="Ask Copilot anything (uses connected devices & enabled MCP servers)..."
                  disabled={copilotBusy}
                  className="flex-1 rounded-xl bg-black/40 border border-[var(--product-line)] px-3 py-2 text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-cyan-400/60"
                />
                <JXButton
                  type="submit"
                  variant="contained"
                  size="sm"
                  disabled={copilotBusy || !copilotInput.trim()}
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  {copilotBusy ? "Thinking..." : "Send"}
                </JXButton>
              </form>
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>

        {/* Interactive Tool Execution Studio Sandbox */}
        <JXGridItem colSpan={12}>
          <JXCard className="bg-[var(--product-surface)]/60 border-[var(--product-line)]">
            <JXCardHeader
              title="Try a tool"
              icon={<Terminal className="w-5 h-5 text-indigo-400" />}
            />
            <JXCardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono text-[var(--product-text-tertiary)] mb-1">
                      Device
                    </label>
                    <select
                      aria-label="Target fleet node"
                      value={selectedNode}
                      onChange={(e) => setSelectedNode(e.target.value)}
                      className="w-full p-2 rounded-lg bg-[var(--product-canvas)] border border-[var(--product-line)] text-xs font-mono text-[var(--product-text-secondary)] focus:outline-none"
                    >
                      {devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.hostname} ({d.platform})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-[var(--product-text-tertiary)] mb-1">
                      Model
                    </label>
                    <select
                      aria-label="Reasoning model"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full p-2 rounded-lg bg-[var(--product-canvas)] border border-[var(--product-line)] text-xs font-mono text-[var(--product-text-secondary)] focus:outline-none"
                    >
                      <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                      <option value="gpt-4o">OpenAI GPT-4o</option>
                      <option value="gemini-1.5-pro">Google Gemini 1.5 Pro</option>
                      <option value="llama3.1:8b-instruct">Local Llama 3.1 8B</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono text-[var(--product-text-tertiary)] mb-1">
                    Tool
                  </label>
                  <select
                    aria-label="Exposed tool primitive"
                    value={selectedTool}
                    onChange={(e) => setSelectedTool(e.target.value)}
                    className="w-full p-2 rounded-lg bg-[var(--product-canvas)] border border-[var(--product-line)] text-xs font-mono text-[var(--product-text-secondary)] focus:outline-none"
                  >
                    <option value="desktop.capture_screen">desktop.capture_screen (SoM Visual)</option>
                    <option value="shell.exec">shell.exec (Arbitrary Command Execution)</option>
                    <option value="process.list">process.list (Process Inventory)</option>
                    <option value="system_info">system_info (Hardware Telemetry)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-[var(--product-text-tertiary)] mb-1">
                    Arguments (JSON)
                  </label>
                  <textarea
                    aria-label="Tool arguments JSON"
                    rows={4}
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    className="w-full p-3 rounded-lg bg-[var(--product-canvas)] border border-[var(--product-line)] font-mono text-xs text-[var(--product-text-secondary)] focus:outline-none resize-none"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <JXButton
                    variant="contained"
                    color="primary"
                    size="md"
                    loading={isExecuting}
                    onClick={handleExecuteTool}
                    startIcon={<Play className="w-4 h-4" />}
                  >
                    Run sample
                  </JXButton>
                </div>

                {/* Return Schema Response Viewer */}
                {executionResult && (
                  <div className="p-3 rounded-xl bg-[var(--product-canvas)] border border-[var(--product-line)] space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono border-b border-[var(--product-line)]/80 pb-2">
                      <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Status: {executionResult.status} ({executionResult.durationMs}ms)
                      </span>
                      <span className="text-[var(--product-text-tertiary)]">
                        {executionResult.tokens.input} in / {executionResult.tokens.output} out ({executionResult.tokens.cost})
                      </span>
                    </div>
                    <pre tabIndex={0} aria-label="Tool response" className="text-xs font-mono text-[var(--product-text-secondary)] overflow-x-auto max-h-40 overflow-y-auto">
                      <code>{JSON.stringify(executionResult.output, null, 2)}</code>
                    </pre>
                  </div>
                )}
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>
      </JXGrid>

      {askTargetAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Ask agent">
          <div className="w-full max-w-xl rounded-2xl bg-[var(--product-surface)] border border-[var(--product-line)] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--product-text)]">Ask {askTargetAgent.name}</h3>
              <button type="button" onClick={() => setAskTargetAgent(null)} className="text-xs text-[var(--product-text-tertiary)]">Close</button>
            </div>
            <textarea
              rows={3}
              value={askPrompt}
              onChange={(e) => setAskPrompt(e.target.value)}
              placeholder="Give this agent a direct instruction or question using its tools, MCP servers, and memory..."
              className="w-full rounded-xl bg-[var(--product-canvas)] border border-[var(--product-line)] p-3 text-xs text-[var(--product-text)]"
            />
            {askResult && (
              <div className="rounded-xl border border-[var(--product-line)] bg-[var(--product-canvas)] p-3 space-y-2 max-h-64 overflow-y-auto text-xs">
                <p className="whitespace-pre-wrap text-[var(--product-text-secondary)]">{askResult.response}</p>
                {askResult.steps.length > 0 && (
                  <div className="border-t border-[var(--product-line)] pt-2 space-y-1 font-mono text-[11px]">
                    <span className="text-[var(--product-text-tertiary)]">Executed {askResult.steps.length} tool step(s):</span>
                    {askResult.steps.map((s: any, i: number) => (
                      <div key={i} className="text-indigo-300">{i + 1}. {s.tool} ({s.device || "local"})</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <JXButton variant="outlined" color="neutral" size="sm" onClick={() => setAskTargetAgent(null)}>Close</JXButton>
              <JXButton variant="contained" color="primary" size="sm" disabled={askBusy || !askPrompt.trim()} onClick={() => void handleAskAgentSubmit()}>
                {askBusy ? "Running..." : "Send to Agent"}
              </JXButton>
            </div>
          </div>
        </div>
      )}

      {memoryTargetAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Edit agent memory">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--product-surface)] border border-[var(--product-line)] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--product-text)]">Memory — {memoryTargetAgent.name}</h3>
              <button type="button" onClick={() => setMemoryTargetAgent(null)} className="text-xs text-[var(--product-text-tertiary)]">Close</button>
            </div>
            <textarea
              rows={8}
              value={memoryDraft}
              onChange={(e) => setMemoryDraft(e.target.value)}
              placeholder="Pinned facts, context, or operational notes persisted across cycles..."
              className="w-full rounded-xl bg-[var(--product-canvas)] border border-[var(--product-line)] p-3 font-mono text-xs text-[var(--product-text)]"
            />
            <div className="flex justify-end gap-2">
              <JXButton variant="outlined" color="neutral" size="sm" onClick={() => setMemoryTargetAgent(null)}>Cancel</JXButton>
              <JXButton variant="contained" color="primary" size="sm" disabled={agentBusy} onClick={() => void handleSaveAgentMemory()}>
                Save Memory
              </JXButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiApiHubView;

