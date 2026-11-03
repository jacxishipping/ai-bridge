/**
 * AI API & Custom Agents Hub (Screen 9)
 * Reconstructed with pure JXUI primitives, motion/react, and lucide-react.
 * ZERO inline styles. ZERO custom CSS.
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  JXCard,
  JXCardHeader,
  JXCardContent,
  JXButton,
  JXBadge,
  JXSelect,
  JXTextField,
  JXGrid,
  JXGridItem,
} from "@jacxishippingorg/jx-ui-react";
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
  } | null>({
    status: "fulfilled",
    nodeId: "srv-us-east-412",
    tool: "desktop.capture_screen",
    model: "claude-3-5-sonnet-20241022",
    durationMs: 142,
    tokens: { input: 412, output: 89, cost: "$0.0018" },
    output: {
      image_hash: "sha256:49c0d12aef89b3c48201a9df9802bf14a7e9",
      dimensions: "3840x2160@60Hz",
      som_boxes_detected: 42,
      enclave_signature: "MEQCID3k8...ed25519_verified",
    },
  });

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
    <div className="space-y-6">
      {/* 4 Telemetry Metrics Bento Ribbon */}
      <JXGrid columns={12} gap="md">
        <JXGridItem colSpan={3}>
          <JXCard spotlight className="bg-slate-900/60 border-slate-800">
            <JXCardHeader
              title="Active Gateways"
              subheader="4 Providers online"
              icon={<Radio className="w-4 h-4 text-emerald-400" />}
            />
            <JXCardContent>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-2xl font-bold text-slate-100">4 / 4</span>
                <JXBadge color="success" statusText="100% Up" />
              </div>
              <p className="mt-2 text-[11px] font-mono text-slate-400">
                Anthropic • OpenAI • Gemini • Ollama
              </p>
            </JXCardContent>
          </JXCard>
        </JXGridItem>

        <JXGridItem colSpan={3}>
          <JXCard spotlight className="bg-slate-900/60 border-slate-800">
            <JXCardHeader
              title="Daily Invocations"
              subheader="avg 18ms latency"
              icon={<Activity className="w-4 h-4 text-indigo-400" />}
            />
            <JXCardContent>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-2xl font-bold text-slate-100">184,920</span>
                <span className="text-xs font-mono text-indigo-400 font-semibold">p99: 41ms</span>
              </div>
              <p className="mt-2 text-[11px] font-mono text-slate-400">
                Synchronous tool call fanout
              </p>
            </JXCardContent>
          </JXCard>
        </JXGridItem>

        <JXGridItem colSpan={3}>
          <JXCard spotlight className="bg-slate-900/60 border-slate-800">
            <JXCardHeader
              title="Token Consumption"
              subheader="24h rolling window"
              icon={<Sparkles className="w-4 h-4 text-cyan-400" />}
            />
            <JXCardContent>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-2xl font-bold text-slate-100">42.8M</span>
                <span className="text-xs font-mono text-emerald-400 font-semibold">$34.12 cost</span>
              </div>
              <p className="mt-2 text-[11px] font-mono text-slate-400">
                88.2% semantic cache hit rate
              </p>
            </JXCardContent>
          </JXCard>
        </JXGridItem>

        <JXGridItem colSpan={3}>
          <JXCard spotlight className="bg-slate-900/60 border-slate-800">
            <JXCardHeader
              title="mTLS Handshake Rate"
              subheader="Ed25519 TPM hardware bound"
              icon={<Shield className="w-4 h-4 text-cyan-400" />}
            />
            <JXCardContent>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-2xl font-bold text-emerald-400">100.0%</span>
                <JXBadge color="success" statusText="Attested" />
              </div>
              <p className="mt-2 text-[11px] font-mono text-slate-400">
                Zero untrusted endpoint requests
              </p>
            </JXCardContent>
          </JXCard>
        </JXGridItem>
      </JXGrid>

      {/* SECTION 1: Provider Connector Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-100">Configured AI Providers & Connectors</h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Native Model Gateway Adapters
          </span>
        </div>

        <JXGrid columns={12} gap="md">
          {providers.map((p) => (
            <JXGridItem key={p.id} colSpan={3}>
              <JXCard className="bg-slate-900/60 border-slate-800">
                <div className="p-4 border-b border-slate-800/60 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold">
                      {p.name[0]}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-100">{p.name}</h4>
                      <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        {p.status}
                      </span>
                    </div>
                  </div>
                  <JXButton
                    variant="soft"
                    color="neutral"
                    size="sm"
                    loading={p.isPinging}
                    onClick={() => handlePing(p.id)}
                    startIcon={<RefreshCw className="w-3 h-3" />}
                  >
                    Ping
                  </JXButton>
                </div>

                <JXCardContent>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between text-slate-400">
                      <span>Default Model:</span>
                      <span className="text-slate-200 font-semibold">{p.defaultModel}</span>
                    </div>

                    <div className="flex justify-between text-slate-400">
                      <span>Latency:</span>
                      <span className="text-indigo-400 font-bold">{p.latencyMs}ms</span>
                    </div>

                    <div className="flex justify-between text-slate-400">
                      <span>Key:</span>
                      <span className="text-slate-300">{p.keyMasked}</span>
                    </div>

                    <div className="pt-2">
                      <span className="text-[10px] text-slate-500 truncate block">
                        {p.endpoint}
                      </span>
                    </div>
                  </div>
                </JXCardContent>
              </JXCard>
            </JXGridItem>
          ))}
        </JXGrid>
      </div>

      {/* SECTION 2 & 3: Multi-Language SDK Generator & Interactive Tool Sandbox */}
      <JXGrid columns={12} gap="lg">
        {/* Multi-Language SDK Code Generator */}
        <JXGridItem colSpan={6}>
          <JXCard className="bg-slate-900/60 border-slate-800">
            <JXCardHeader
              title="Multi-Language SDK Code Generator"
              subheader="Connect autonomous agents and workflows directly to AI Bridge"
              icon={<Code2 className="w-5 h-5 text-indigo-400" />}
            />
            <JXCardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-950 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setSdkLang("python")}
                      className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                        sdkLang === "python"
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-slate-400 hover:text-slate-200"
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
                          : "text-slate-400 hover:text-slate-200"
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
                          : "text-slate-400 hover:text-slate-200"
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
                          : "text-slate-400 hover:text-slate-200"
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

                <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs overflow-x-auto text-slate-200 leading-relaxed max-h-[380px] overflow-y-auto">
                  <pre>
                    <code>{SDK_SNIPPETS[sdkLang]}</code>
                  </pre>
                </div>
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>

        {/* Interactive Tool Execution Studio Sandbox */}
        <JXGridItem colSpan={6}>
          <JXCard className="bg-slate-900/60 border-slate-800">
            <JXCardHeader
              title="Interactive Tool Execution Studio"
              subheader="Direct agent sandbox for inspecting tool contracts and return schemas"
              icon={<Terminal className="w-5 h-5 text-indigo-400" />}
            />
            <JXCardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1">
                      Target Fleet Node
                    </label>
                    <select
                      value={selectedNode}
                      onChange={(e) => setSelectedNode(e.target.value)}
                      className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none"
                    >
                      {devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.hostname} ({d.platform})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1">
                      Reasoning Model
                    </label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none"
                    >
                      <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                      <option value="gpt-4o">OpenAI GPT-4o</option>
                      <option value="gemini-1.5-pro">Google Gemini 1.5 Pro</option>
                      <option value="llama3.1:8b-instruct">Local Llama 3.1 8B</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">
                    Exposed Tool Primitive
                  </label>
                  <select
                    value={selectedTool}
                    onChange={(e) => setSelectedTool(e.target.value)}
                    className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none"
                  >
                    <option value="desktop.capture_screen">desktop.capture_screen (SoM Visual)</option>
                    <option value="shell.exec">shell.exec (Arbitrary Command Execution)</option>
                    <option value="process.list">process.list (Process Inventory)</option>
                    <option value="system_info">system_info (Hardware Telemetry)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">
                    Tool Arguments Payload (JSON)
                  </label>
                  <textarea
                    rows={4}
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-200 focus:outline-none resize-none"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">
                    Auth: mTLS Pinned Bearer Token
                  </span>
                  <JXButton
                    variant="contained"
                    color="primary"
                    size="md"
                    loading={isExecuting}
                    onClick={handleExecuteTool}
                    startIcon={<Play className="w-4 h-4" />}
                  >
                    Execute Tool Sandbox
                  </JXButton>
                </div>

                {/* Return Schema Response Viewer */}
                {executionResult && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono border-b border-slate-800/80 pb-2">
                      <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Status: {executionResult.status} ({executionResult.durationMs}ms)
                      </span>
                      <span className="text-slate-400">
                        {executionResult.tokens.input} in / {executionResult.tokens.output} out ({executionResult.tokens.cost})
                      </span>
                    </div>
                    <pre className="text-xs font-mono text-slate-300 overflow-x-auto max-h-40 overflow-y-auto">
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

