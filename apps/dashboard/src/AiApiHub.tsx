import React, { useEffect, useState } from "react";
import { api, token, sessionToken } from "./api";

interface AiApiHubProps {
  devices: any[];
}

export const AiApiHub: React.FC<AiApiHubProps> = ({ devices }) => {
  const [activeSubTab, setActiveSubTab] = useState<"invoker" | "agent" | "docs">("invoker");
  const [tools, setTools] = useState<any[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string>("auto");
  const [selectedTool, setSelectedTool] = useState<string>("run_shell");
  const [toolArgsStr, setToolArgsStr] = useState<string>('{\n  "command": "uname -a"\n}');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [execDuration, setExecDuration] = useState<number | null>(null);

  // Agent State
  const [agentPrompt, setAgentPrompt] = useState<string>("List directory contents on windows-pc and check memory usage on ubuntu");
  const [agentProvider, setAgentProvider] = useState<string>("openai");
  const [agentModel, setAgentModel] = useState<string>("gpt-4o");
  const [agentApiKey, setAgentApiKey] = useState<string>("");
  const [isRunningAgent, setIsRunningAgent] = useState(false);
  const [agentResult, setAgentResult] = useState<any>(null);

  // Docs State
  const [codeLang, setCodeLang] = useState<"python" | "openai" | "claude" | "curl" | "typescript">("python");
  const [copied, setCopied] = useState(false);

  // Active Origin & Token
  const activeToken = sessionToken() || token() || "YOUR_AI_BRIDGE_TOKEN";
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://jxiptvplayer.app";

  useEffect(() => {
    loadTools();
  }, [selectedDevice]);

  async function loadTools() {
    setLoadingTools(true);
    try {
      const devParam = selectedDevice === "auto" ? undefined : selectedDevice;
      const res = await api.aiTools("raw", devParam);
      if (res && res.tools) {
        setTools(res.tools);
      }
    } catch (err) {
      console.error("Failed to load tools catalog", err);
    } finally {
      setLoadingTools(false);
    }
  }

  // Pre-fill args when tool changes
  function handleToolChange(toolName: string) {
    setSelectedTool(toolName);
    const found = tools.find(t => t.name === toolName);
    if (toolName === "run_shell") {
      setToolArgsStr('{\n  "command": "uptime"\n}');
    } else if (toolName === "take_screenshot" || toolName === "capture_desktop_screenshot") {
      setToolArgsStr('{\n  "quality": 70\n}');
    } else if (toolName === "mouse_click") {
      setToolArgsStr('{\n  "x": 500,\n  "y": 300,\n  "button": "left",\n  "clicks": 1\n}');
    } else if (toolName === "keyboard_type") {
      setToolArgsStr('{\n  "text": "Hello from AI Bridge!\\n"\n}');
    } else if (toolName === "read_file") {
      setToolArgsStr('{\n  "path": "/etc/os-release"\n}');
    } else if (toolName === "focus_window") {
      setToolArgsStr('{\n  "title": "Notepad"\n}');
    } else if (found && found.parameters && found.parameters.properties) {
      const props = found.parameters.properties;
      const defaults: Record<string, any> = {};
      Object.keys(props).forEach(k => {
        if (k !== "device") {
          defaults[k] = props[k].default !== undefined ? props[k].default : "";
        }
      });
      setToolArgsStr(JSON.stringify(defaults, null, 2));
    } else {
      setToolArgsStr("{}");
    }
  }

  async function handleExecuteTool() {
    setIsExecuting(true);
    setExecutionResult(null);
    setExecDuration(null);
    const start = performance.now();

    let parsedArgs = {};
    try {
      parsedArgs = toolArgsStr.trim() ? JSON.parse(toolArgsStr) : {};
    } catch (err: any) {
      alert("Invalid JSON arguments: " + err.message);
      setIsExecuting(false);
      return;
    }

    try {
      const dev = selectedDevice === "auto" ? undefined : selectedDevice;
      const res = await api.aiExecute({
        tool: selectedTool,
        device: dev,
        args: parsedArgs,
        timeout: 30,
      });
      setExecDuration(Math.round(performance.now() - start));
      setExecutionResult(res);
    } catch (err: any) {
      setExecDuration(Math.round(performance.now() - start));
      setExecutionResult({ ok: false, error: err.message || String(err) });
    } finally {
      setIsExecuting(false);
    }
  }

  async function handleRunAgent() {
    if (!agentPrompt.trim()) return;
    setIsRunningAgent(true);
    setAgentResult(null);

    try {
      const res = await api.aiAgent({
        prompt: agentPrompt,
        device: selectedDevice === "auto" ? undefined : selectedDevice,
        provider: agentProvider,
        model: agentModel,
        api_key: agentApiKey.trim() || undefined,
      });
      setAgentResult(res);
    } catch (err: any) {
      setAgentResult({ ok: false, error: err.message || String(err) });
    } finally {
      setIsRunningAgent(false);
    }
  }

  function renderCodeSnippet() {
    const isWin = selectedDevice.includes("win");
    const sampleDev = selectedDevice !== "auto" ? selectedDevice : (isWin ? "windows-pc" : "ubuntu");

    if (codeLang === "python") {
      return `# Install: pip install ai-bridge
from ai_bridge import AIBridgeClient

client = AIBridgeClient(
    base_url="${baseUrl}",
    token="${activeToken}"
)

# 1. Discover online fleet devices
devices = client.list_devices()
print("Connected fleet:", [d["name"] for d in devices])

# 2. Run shell command on Linux
res = client.run_shell("uname -a", device="ubuntu")
print("Linux output:", res)

# 3. Take screenshot & control Windows GUI
shot = client.take_screenshot(device="windows-pc", quality=75)
print(f"Windows screen: {shot.get('width')}x{shot.get('height')}")

client.mouse_click(x=350, y=200, device="windows-pc")
client.keyboard_type("notepad.exe\\n", device="windows-pc")`;
    }

    if (codeLang === "openai") {
      return `import json
from openai import OpenAI
from ai_bridge import AIBridgeClient

# Initialize AI Bridge and OpenAI clients
bridge = AIBridgeClient(base_url="${baseUrl}", token="${activeToken}")
client = OpenAI(api_key="your-openai-api-key")

# 1. Fetch live tool definitions formatted for OpenAI Function Calling
tools = bridge.get_tools(format="openai")

# 2. Send prompt to GPT-4o
messages = [{"role": "user", "content": "Check uptime on ubuntu and capture windows-pc screenshot"}]
resp = client.chat.completions.create(
    model="gpt-4o",
    messages=messages,
    tools=tools,
    tool_choice="auto"
)

# 3. Execute requested tool calls against your devices
for call in resp.choices[0].message.tool_calls or []:
    args = json.loads(call.function.arguments)
    target = args.pop("device", None)
    result = bridge.execute(call.function.name, device=target, args=args)
    print(f"Executed {call.function.name} on {target}:", result)`;
    }

    if (codeLang === "claude") {
      return `from anthropic import Anthropic
from ai_bridge import AIBridgeClient

bridge = AIBridgeClient(base_url="${baseUrl}", token="${activeToken}")
claude = Anthropic(api_key="your-anthropic-api-key")

# Fetch tools formatted for Claude
tools = bridge.get_tools(format="anthropic")

response = claude.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=4096,
    messages=[{"role": "user", "content": "List running docker containers on ubuntu"}],
    tools=tools
)
print(response.content)`;
    }

    if (codeLang === "curl") {
      return `# 1. Synchronously execute any tool on any device:
curl -X POST "${baseUrl}/api/ai/execute" \\
  -H "Authorization: Bearer ${activeToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tool": "run_shell",
    "device": "${sampleDev}",
    "args": { "command": "uname -a" },
    "timeout": 30
  }'

# 2. Get OpenAI-compatible tools JSON:
curl -s -H "Authorization: Bearer ${activeToken}" "${baseUrl}/api/ai/tools?format=openai"

# 3. Query OpenAI-compatible completions endpoint:
curl -X POST "${baseUrl}/v1/chat/completions" \\
  -H "Authorization: Bearer ${activeToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "ai-bridge-agent",
    "messages": [{"role": "user", "content": "list devices"}]
  }'`;
    }

    if (codeLang === "typescript") {
      return `// Direct Fetch API in Node.js or Browser
const BASE_URL = "${baseUrl}";
const TOKEN = "${activeToken}";

async function executeDeviceTool(tool: string, device: string, args: Record<string, any>) {
  const resp = await fetch(\`\${BASE_URL}/api/ai/execute\`, {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${TOKEN}\`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ tool, device, args, timeout: 30 })
  });
  return await resp.json();
}

// Example: run command on ubuntu server
executeDeviceTool("run_shell", "ubuntu", { command: "df -h" })
  .then(res => console.log("Output:", res));`;
    }

    return "";
  }

  function copyCode() {
    const text = renderCodeSnippet();
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const selectedToolMeta = tools.find(t => t.name === selectedTool);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Top Banner & Quick Status */}
      <div
        className="f2-card"
        style={{
          background: "linear-gradient(135deg, rgba(0,120,212,0.1) 0%, rgba(135,100,184,0.1) 100%)",
          border: "1px solid var(--colorBrandStroke1)",
          padding: 18,
          borderRadius: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>🤖</span>
            <span style={{ fontSize: 16, fontWeight: 600 }}>AI API & Custom LLM Integration Hub</span>
            <span className="f2-badge" style={{ background: "var(--colorBrandBackground)", color: "#fff", fontSize: 11, padding: "2px 8px" }}>
              v1.0 Ready
            </span>
          </div>
          <div style={{ color: "var(--colorNeutralForeground3)", fontSize: 13, marginTop: 4 }}>
            Connect custom AI agents, OpenAI, Anthropic Claude, Gemini, DeepSeek, or local Ollama to control your Windows & Linux fleet.
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--colorNeutralForeground3)", textTransform: "uppercase" }}>Base URL</div>
            <code style={{ fontSize: 12, fontWeight: 600 }}>{baseUrl}</code>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--colorNeutralForeground3)", textTransform: "uppercase" }}>Online Devices</div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--colorStatusSuccessForeground1)" }}>
              {devices.filter(d => d.status === "online").length} of {devices.length} Online
            </span>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="f2-tabs" style={{ borderBottom: "1px solid var(--colorNeutralStroke2)" }}>
        <button
          type="button"
          className="f2-tab-btn"
          data-active={String(activeSubTab === "invoker")}
          onClick={() => setActiveSubTab("invoker")}
        >
          ⚡ Live Tool Runner & Tester
        </button>
        <button
          type="button"
          className="f2-tab-btn"
          data-active={String(activeSubTab === "agent")}
          onClick={() => setActiveSubTab("agent")}
        >
          🧠 Autonomous Agent Playground
        </button>
        <button
          type="button"
          className="f2-tab-btn"
          data-active={String(activeSubTab === "docs")}
          onClick={() => setActiveSubTab("docs")}
        >
          💻 SDK & Integration Code Generator
        </button>
      </div>

      {/* ================= TAB 1: LIVE TOOL RUNNER ================= */}
      {activeSubTab === "invoker" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.8fr", gap: 16, alignItems: "start" }}>
          {/* Left Form */}
          <div className="f2-card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
              <span>Execute Tool Synchronously</span>
              <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>POST /api/ai/execute</span>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {/* Target Device */}
              <div>
                <label className="f2-label" style={{ display: "block", marginBottom: 4 }}>Target Device</label>
                <select
                  className="f2-input"
                  style={{ width: "100%" }}
                  value={selectedDevice}
                  onChange={e => setSelectedDevice(e.target.value)}
                >
                  <option value="auto">⚡ Auto (Auto-route based on tool type)</option>
                  <option value="local">🖥️ local (Droplet / MCP Host)</option>
                  {devices.map(d => (
                    <option key={d.id} value={d.name || d.id}>
                      {d.os && d.os.toLowerCase().includes("win") ? "🪟" : "🐧"} {d.name} ({d.os || "Unknown OS"}, {d.status})
                    </option>
                  ))}
                </select>
              </div>

              {/* Tool Selector */}
              <div>
                <label className="f2-label" style={{ display: "block", marginBottom: 4 }}>
                  Select Tool ({loadingTools ? "Loading..." : `${tools.length} available`})
                </label>
                <select
                  className="f2-input"
                  style={{ width: "100%" }}
                  value={selectedTool}
                  onChange={e => handleToolChange(e.target.value)}
                >
                  <optgroup label="Terminal & Shell">
                    <option value="run_shell">run_shell (Execute Bash / PowerShell)</option>
                    <option value="install_package">install_package (apt, pip, npm, winget)</option>
                  </optgroup>
                  <optgroup label="Windows Desktop GUI Automation">
                    <option value="take_screenshot">take_screenshot (Desktop Screen Capture)</option>
                    <option value="mouse_click">mouse_click (Click coordinates)</option>
                    <option value="mouse_move">mouse_move (Move cursor)</option>
                    <option value="mouse_scroll">mouse_scroll (Wheel scroll)</option>
                    <option value="keyboard_type">keyboard_type (Type keystrokes)</option>
                    <option value="keyboard_press">keyboard_press (Hotkeys: win, enter, ctrl+c)</option>
                    <option value="list_desktop_windows">list_desktop_windows (Open windows)</option>
                    <option value="focus_window">focus_window (Bring app to front)</option>
                    <option value="get_screen_size">get_screen_size (Resolution)</option>
                  </optgroup>
                  <optgroup label="Files & Workspace">
                    <option value="read_file">read_file (Read contents from path)</option>
                    <option value="write_file">write_file (Write file)</option>
                    <option value="list_workspace">list_workspace (Directory listing)</option>
                  </optgroup>
                  <optgroup label="System Telemetry & Health">
                    <option value="list_devices">list_devices (Fleet summary)</option>
                    <option value="get_system_info">get_system_info (Hardware specs)</option>
                    <option value="get_resource_usage">get_resource_usage (CPU, RAM, Uptime)</option>
                    <option value="get_disk_usage">get_disk_usage (Drive storage)</option>
                    <option value="list_processes">list_processes (Top processes)</option>
                    <option value="list_docker_containers">list_docker_containers (Docker)</option>
                  </optgroup>
                </select>
              </div>

              {/* Tool Meta Info */}
              {selectedToolMeta && (
                <div style={{ background: "var(--colorNeutralBackground3)", padding: 8, borderRadius: 6, fontSize: 12 }}>
                  <div style={{ color: "var(--colorNeutralForeground2)" }}>{selectedToolMeta.description}</div>
                  <div style={{ marginTop: 4, display: "flex", gap: 8, fontSize: 11 }}>
                    <span className="f2-badge" style={{ background: "rgba(0,120,212,0.15)", color: "var(--colorBrandForeground1)" }}>
                      Tier {selectedToolMeta.tier}
                    </span>
                    <span className="f2-badge" style={{ background: "rgba(0,0,0,0.08)" }}>
                      Category: {selectedToolMeta.category}
                    </span>
                  </div>
                </div>
              )}

              {/* Arguments JSON */}
              <div>
                <label className="f2-label" style={{ display: "block", marginBottom: 4 }}>Arguments (JSON)</label>
                <textarea
                  className="f2-input"
                  style={{ width: "100%", height: 120, fontFamily: "monospace", fontSize: 12 }}
                  value={toolArgsStr}
                  onChange={e => setToolArgsStr(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="f2-btn f2-btn-primary"
                style={{ width: "100%", padding: "8px 0" }}
                disabled={isExecuting}
                onClick={handleExecuteTool}
              >
                {isExecuting ? "Executing on Device..." : "▶ Execute Tool"}
              </button>
            </div>
          </div>

          {/* Right Output Viewer */}
          <div className="f2-card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Real-Time Execution Result</span>
              {execDuration !== null && (
                <span className="f2-badge" style={{ background: "rgba(16,124,65,0.15)", color: "var(--colorStatusSuccessForeground1)" }}>
                  {execDuration} ms
                </span>
              )}
            </div>

            {!executionResult && !isExecuting && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--colorNeutralForeground3)", fontSize: 13 }}>
                Click <strong>"Execute Tool"</strong> to submit a synchronous call to your target computer and view the immediate output.
              </div>
            )}

            {isExecuting && (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Executing task on device...</div>
                <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 4 }}>
                  Control plane is dispatching to agent poller via task queue.
                </div>
              </div>
            )}

            {executionResult && (
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <span
                    className="f2-badge"
                    style={{
                      background: executionResult.ok ? "rgba(16,124,65,0.15)" : "rgba(197,34,31,0.15)",
                      color: executionResult.ok ? "var(--colorStatusSuccessForeground1)" : "var(--colorStatusDangerForeground1)",
                    }}
                  >
                    Status: {executionResult.status || (executionResult.ok ? "success" : "failed")}
                  </span>
                  {executionResult.device_name && (
                    <span className="f2-badge">Device: {executionResult.device_name}</span>
                  )}
                  {executionResult.task_id && (
                    <span className="f2-badge" style={{ fontFamily: "monospace" }}>Task ID: {executionResult.task_id}</span>
                  )}
                </div>

                {/* If result contains screenshot, render image! */}
                {executionResult.result && executionResult.result.screenshot && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Live Captured Screen:</div>
                    <img
                      src={`data:image/jpeg;base64,${executionResult.result.screenshot}`}
                      alt="Captured Display"
                      style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 6, border: "1px solid var(--colorNeutralStroke1)" }}
                    />
                  </div>
                )}

                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--colorNeutralForeground3)", marginBottom: 4 }}>
                  JSON Response Payload
                </div>
                <pre
                  style={{
                    background: "var(--colorNeutralBackground3)",
                    padding: 12,
                    borderRadius: 6,
                    maxHeight: 380,
                    overflow: "auto",
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}
                >
                  {JSON.stringify(executionResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 2: AGENT PLAYGROUND ================= */}
      {activeSubTab === "agent" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.8fr", gap: 16, alignItems: "start" }}>
          {/* Agent Settings & Prompt */}
          <div className="f2-card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
              Autonomous ReAct Fleet Agent
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label className="f2-label" style={{ display: "block", marginBottom: 4 }}>Natural Language Instruction</label>
                <textarea
                  className="f2-input"
                  style={{ width: "100%", height: 90, fontSize: 13 }}
                  placeholder="e.g. List files in workspace on windows-pc, then inspect uptime on ubuntu"
                  value={agentPrompt}
                  onChange={e => setAgentPrompt(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label className="f2-label" style={{ display: "block", marginBottom: 4 }}>LLM Provider</label>
                  <select
                    className="f2-input"
                    style={{ width: "100%" }}
                    value={agentProvider}
                    onChange={e => {
                      setAgentProvider(e.target.value);
                      if (e.target.value === "groq") setAgentModel("llama-3.3-70b-versatile");
                      else if (e.target.value === "deepseek") setAgentModel("deepseek-chat");
                      else if (e.target.value === "ollama") setAgentModel("llama3.2");
                      else setAgentModel("gpt-4o");
                    }}
                  >
                    <option value="openai">OpenAI (GPT-4o, o1)</option>
                    <option value="groq">Groq (Ultra-Fast Llama 3.3)</option>
                    <option value="deepseek">DeepSeek (V3, R1)</option>
                    <option value="ollama">Ollama (Local Offline)</option>
                  </select>
                </div>

                <div>
                  <label className="f2-label" style={{ display: "block", marginBottom: 4 }}>Model</label>
                  <input
                    type="text"
                    className="f2-input"
                    style={{ width: "100%" }}
                    value={agentModel}
                    onChange={e => setAgentModel(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="f2-label" style={{ display: "block", marginBottom: 4 }}>
                  API Key (BYOK - Bring Your Own Key)
                </label>
                <input
                  type="password"
                  className="f2-input"
                  style={{ width: "100%" }}
                  placeholder="Optional if configured on server via env"
                  value={agentApiKey}
                  onChange={e => setAgentApiKey(e.target.value)}
                />
                <div style={{ fontSize: 11, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                  Keys stay confidential and are used only to drive the tool calling loop.
                </div>
              </div>

              <button
                type="button"
                className="f2-btn f2-btn-primary"
                style={{ width: "100%", padding: "8px 0" }}
                disabled={isRunningAgent}
                onClick={handleRunAgent}
              >
                {isRunningAgent ? "Agent Running Loop..." : "🚀 Run Fleet Instruction"}
              </button>
            </div>
          </div>

          {/* Agent Output & Steps Tree */}
          <div className="f2-card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
              Agent Reasoning & Action Trajectory
            </div>

            {!agentResult && !isRunningAgent && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--colorNeutralForeground3)", fontSize: 13 }}>
                Enter an instruction and click <strong>"Run Fleet Instruction"</strong>. The agent will inspect devices, invoke tools, and report the answer.
              </div>
            )}

            {isRunningAgent && (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>Autonomous agent reasoning...</div>
                <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 4 }}>
                  Interacting with LLM and dispatching tool tasks to enrolled agents.
                </div>
              </div>
            )}

            {agentResult && (
              <div style={{ display: "grid", gap: 12 }}>
                {/* Final AI Answer */}
                <div
                  style={{
                    background: "rgba(0,120,212,0.08)",
                    border: "1px solid var(--colorBrandStroke1)",
                    borderRadius: 6,
                    padding: 14,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--colorBrandForeground1)", marginBottom: 4 }}>
                    Final AI Response
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {agentResult.response || agentResult.error || "Execution finished."}
                  </div>
                </div>

                {/* Steps Traces */}
                {agentResult.steps && agentResult.steps.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                      Action Trace ({agentResult.steps.length} Tool Calls)
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {agentResult.steps.map((st: any, idx: number) => (
                        <div
                          key={idx}
                          style={{
                            background: "var(--colorNeutralBackground3)",
                            padding: 10,
                            borderRadius: 6,
                            fontSize: 12,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, color: "var(--colorBrandForeground1)" }}>
                              Step {st.step || idx + 1}: {st.tool}
                            </span>
                            <span className="f2-badge">Device: {st.device}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--colorNeutralForeground2)", fontFamily: "monospace" }}>
                            Args: {JSON.stringify(st.args || {})}
                          </div>
                          {st.result && (
                            <div style={{ marginTop: 4, maxHeight: 80, overflow: "auto", fontFamily: "monospace", fontSize: 11 }}>
                              Result: {JSON.stringify(st.result)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 3: CODE GENERATOR ================= */}
      {activeSubTab === "docs" && (
        <div className="f2-card" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Ready-to-Use SDK & API Code Snippets</div>
              <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                Pre-configured with your current base URL and authentication token.
              </div>
            </div>

            <button
              type="button"
              className="f2-btn"
              onClick={copyCode}
              style={{ padding: "6px 14px", fontWeight: 600 }}
            >
              {copied ? "✓ Copied to Clipboard!" : "📋 Copy Code"}
            </button>
          </div>

          {/* Lang Selector Pills */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              { id: "python", label: "Python SDK" },
              { id: "openai", label: "OpenAI Function Calling" },
              { id: "claude", label: "Anthropic Claude 3.5" },
              { id: "curl", label: "cURL / Bash" },
              { id: "typescript", label: "TypeScript / Fetch" },
            ].map(item => (
              <button
                key={item.id}
                type="button"
                className="f2-btn f2-btn-sm"
                data-active={String(codeLang === item.id)}
                onClick={() => setCodeLang(item.id as any)}
                style={{
                  background: codeLang === item.id ? "var(--colorBrandBackground)" : undefined,
                  color: codeLang === item.id ? "#fff" : undefined,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <pre
            style={{
              background: "var(--colorNeutralBackground3)",
              padding: 16,
              borderRadius: 6,
              fontFamily: "monospace",
              fontSize: 13,
              lineHeight: 1.5,
              overflow: "auto",
              maxHeight: 450,
            }}
          >
            {renderCodeSnippet()}
          </pre>
        </div>
      )}
    </div>
  );
};
