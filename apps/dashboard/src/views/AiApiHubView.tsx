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

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
                      className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                        sdkLang === "python"
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
                      }`}
                    >
                      Python
                    </button>
                    <button
                      type="button"
                      onClick={() => setSdkLang("typescript")}
                      className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                        sdkLang === "typescript"
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
                      }`}
                    >
                      TypeScript
                    </button>
                    <button
                      type="button"
                      onClick={() => setSdkLang("curl")}
                      className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                        sdkLang === "curl"
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
                      }`}
                    >
                      cURL
                    </button>
                    <button
                      type="button"
                      onClick={() => setSdkLang("mcp")}
                      className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                        sdkLang === "mcp"
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
    </div>
  );
};

export default AiApiHubView;

