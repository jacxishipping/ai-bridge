import React, { useEffect, useState, useRef } from "react";
import { api, token, sessionToken } from "./api";

interface AiApiHubProps {
  devices: any[];
}

interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  screenshot?: string | null;
  steps?: any[];
}

export const AiApiHub: React.FC<AiApiHubProps> = ({ devices }) => {
  const [activeTab, setActiveTab] = useState<"chat" | "settings" | "invoker" | "docs">("chat");

  // AI Settings State
  const [aiSettings, setAiSettings] = useState<{
    provider: string;
    model: string;
    keys_configured: Record<string, boolean>;
    masked_keys: Record<string, string>;
    custom_base_url?: string;
    custom_model?: string;
    is_connected: boolean;
  } | null>(null);

  const [inputProvider, setInputProvider] = useState<string>("openai");
  const [inputModel, setInputModel] = useState<string>("gpt-4o");
  const [inputBaseUrl, setInputBaseUrl] = useState<string>("https://openrouter.ai/api/v1");
  const [inputApiKey, setInputApiKey] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ text: string; error?: boolean } | null>(null);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "👋 **Welcome to AI Bridge Fleet Copilot!**\n\n" +
        "I am connected to your computers and servers. You can speak to me naturally to control devices:\n" +
        "- **Windows GUI**: Take screenshots, click coordinates, type keystrokes, and focus open apps.\n" +
        "- **Linux Servers**: Run terminal commands, inspect services, check Docker, and monitor CPU/RAM.\n\n" +
        "Try asking me a question or click one of the suggested actions below!",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Tool Invoker State
  const [tools, setTools] = useState<any[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string>("auto");
  const [selectedTool, setSelectedTool] = useState<string>("run_shell");
  const [toolArgsStr, setToolArgsStr] = useState<string>('{\n  "command": "uname -a"\n}');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [execDuration, setExecDuration] = useState<number | null>(null);

  // Docs State
  const [codeLang, setCodeLang] = useState<"python" | "openai" | "claude" | "curl" | "typescript">("python");
  const [copied, setCopied] = useState(false);

  const activeToken = sessionToken() || token() || "YOUR_AI_BRIDGE_TOKEN";
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://jxiptvplayer.app";

  useEffect(() => {
    loadAiSettings();
    loadTools();
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isSendingChat]);

  async function loadAiSettings() {
    try {
      const res = await api.getAiSettings();
      if (res && res.ok) {
        setAiSettings(res);
        if (res.provider) setInputProvider(res.provider);
        if (res.model) setInputModel(res.model);
        if (res.custom_base_url) setInputBaseUrl(res.custom_base_url);
      }
    } catch (err) {
      console.error("Failed to load AI settings:", err);
    }
  }

  async function loadTools() {
    setLoadingTools(true);
    try {
      const devParam = selectedDevice === "auto" ? undefined : selectedDevice;
      const res = await api.aiTools("raw", devParam);
      if (res && res.tools) {
        setTools(res.tools);
      }
    } catch (err) {
      console.error("Failed to load tools catalog:", err);
    } finally {
      setLoadingTools(false);
    }
  }

  // Handle Provider Change in Settings
  function handleProviderChange(newProv: string) {
    setInputProvider(newProv);
    if (newProv === "openai") setInputModel("gpt-4o");
    else if (newProv === "anthropic") setInputModel("claude-3-5-sonnet-20241022");
    else if (newProv === "gemini") setInputModel("gemini-1.5-flash");
    else if (newProv === "groq") setInputModel("llama-3.3-70b-versatile");
    else if (newProv === "deepseek") setInputModel("deepseek-chat");
    else if (newProv === "ollama") setInputModel("llama3.2");
    else if (newProv === "custom") {
      if (!inputModel || inputModel === "gpt-4o" || inputModel === "llama3.2") setInputModel("mistralai/mixtral-8x7b-instruct");
      if (!inputBaseUrl) setInputBaseUrl("https://openrouter.ai/api/v1");
    }
  }

  // Save / Connect API Key
  async function handleSaveKey(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (inputProvider === "custom" && !inputBaseUrl.trim()) {
      setSaveMessage({ text: "Please enter a Base URL for your custom AI provider.", error: true });
      return;
    }
    if (!inputApiKey.trim() && inputProvider !== "ollama" && inputProvider !== "custom") {
      setSaveMessage({ text: "Please enter an API key.", error: true });
      return;
    }
    setIsSavingKey(true);
    setSaveMessage(null);

    try {
      const res = await api.saveAiSettings({
        provider: inputProvider,
        model: inputModel,
        api_key: inputApiKey.trim(),
        base_url: inputBaseUrl.trim(),
        test_connection: inputProvider !== "ollama",
      });
      if (res && res.ok) {
        setSaveMessage({ text: res.message || `Connected to ${inputProvider} successfully!`, error: false });
        setInputApiKey("");
        await loadAiSettings();
      } else {
        setSaveMessage({ text: res.message || "Failed to connect.", error: true });
      }
    } catch (err: any) {
      setSaveMessage({ text: err.message || "Validation failed.", error: true });
    } finally {
      setIsSavingKey(false);
    }
  }

  // Clear / Disconnect Key
  async function handleClearKey(providerName: string) {
    if (!confirm(`Are you sure you want to disconnect the API key for ${providerName}?`)) return;
    try {
      await api.saveAiSettings({ provider: providerName, clear: true });
      await loadAiSettings();
      setSaveMessage({ text: `Disconnected ${providerName} key.`, error: false });
    } catch (err: any) {
      alert("Failed to disconnect: " + err.message);
    }
  }

  // Send Chat Message
  async function handleSendChat(customText?: string) {
    const textToSend = (customText !== undefined ? customText : chatInput).trim();
    if (!textToSend || isSendingChat) return;

    const userMsg: ChatMessageItem = {
      id: "msg-" + Date.now(),
      role: "user",
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setChatMessages(prev => [...prev, userMsg]);
    if (customText === undefined) setChatInput("");
    setIsSendingChat(true);

    try {
      // Send conversation to backend
      const historyPayload = chatMessages
        .filter(m => m.id !== "welcome")
        .concat(userMsg)
        .map(m => ({ role: m.role, content: m.content }));

      const res = await api.aiChat({
        messages: historyPayload,
        provider: aiSettings?.provider || inputProvider,
        model: aiSettings?.model || inputModel,
        base_url: aiSettings?.custom_base_url || (inputProvider === "custom" ? inputBaseUrl : undefined),
        device: selectedDevice,
      });

      const assistantMsg: ChatMessageItem = {
        id: "msg-" + (Date.now() + 1),
        role: "assistant",
        content: res?.message?.content || res?.error || "Done.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        screenshot: res?.screenshot || null,
        steps: res?.steps || [],
      };

      setChatMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessageItem = {
        id: "msg-" + (Date.now() + 1),
        role: "assistant",
        content: `⚠️ **Error communicating with AI**: ${err.message || String(err)}\n\n*Make sure your AI API key is connected in the "Connect AI API Key" tab above.*`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsSendingChat(false);
    }
  }

  // Execute Individual Tool
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

  function handleToolChange(toolName: string) {
    setSelectedTool(toolName);
    if (toolName === "run_shell") setToolArgsStr('{\n  "command": "uptime"\n}');
    else if (toolName === "take_screenshot" || toolName === "capture_desktop_screenshot") setToolArgsStr('{\n  "quality": 70\n}');
    else if (toolName === "mouse_click") setToolArgsStr('{\n  "x": 500,\n  "y": 300,\n  "button": "left",\n  "clicks": 1\n}');
    else if (toolName === "keyboard_type") setToolArgsStr('{\n  "text": "Hello from AI Bridge!\\n"\n}');
    else if (toolName === "read_file") setToolArgsStr('{\n  "path": "/etc/os-release"\n}');
    else setToolArgsStr("{}");
  }

  function renderCodeSnippet() {
    if (codeLang === "python") {
      return `from ai_bridge import AIBridgeClient

client = AIBridgeClient(base_url="${baseUrl}", token="${activeToken}")

# 1. Discover online fleet devices
devices = client.list_devices()
print("Fleet:", [d["name"] for d in devices])

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
      return `from openai import OpenAI

# Connect directly to AI Bridge using standard OpenAI SDK
client = OpenAI(
    base_url="${baseUrl}/v1",
    api_key="${activeToken}"
)

response = client.chat.completions.create(
    model="ai-bridge-agent",
    messages=[{"role": "user", "content": "Check disk space on ubuntu and take a screenshot of windows-pc"}]
)

print(response.choices[0].message.content)`;
    }
    if (codeLang === "curl") {
      return `# Synchronously execute any tool on any device:
curl -X POST "${baseUrl}/api/ai/execute" \\
  -H "Authorization: Bearer ${activeToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tool": "run_shell",
    "device": "ubuntu",
    "args": { "command": "uname -a" },
    "timeout": 30
  }'

# Query OpenAI-compatible completions endpoint:
curl -X POST "${baseUrl}/v1/chat/completions" \\
  -H "Authorization: Bearer ${activeToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "ai-bridge-agent",
    "messages": [{"role": "user", "content": "list devices"}]
  }'`;
    }
    return "";
  }

  const activeProvider = aiSettings?.provider || inputProvider;
  const isConnected = aiSettings?.is_connected || false;
  const activeMaskedKey = aiSettings?.masked_keys?.[activeProvider] || "";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* ================= TOP CONNECTION BANNER ================= */}
      <div
        className="f2-card"
        style={{
          background: isConnected
            ? "linear-gradient(135deg, rgba(16,124,65,0.08) 0%, rgba(0,120,212,0.08) 100%)"
            : "linear-gradient(135deg, rgba(255,185,0,0.1) 0%, rgba(0,120,212,0.08) 100%)",
          border: isConnected ? "1px solid rgba(16,124,65,0.4)" : "1px solid rgba(255,185,0,0.5)",
          padding: "16px 20px",
          borderRadius: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: isConnected ? "rgba(16,124,65,0.15)" : "rgba(255,185,0,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
          >
            {isConnected ? "🟢" : "🟡"}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>
                {isConnected
                  ? activeProvider === "custom"
                    ? `AI Connected: Custom AI (${aiSettings?.model || inputModel})`
                    : `AI Connected: ${activeProvider.toUpperCase()} (${aiSettings?.model || inputModel})`
                  : "No AI API Key Connected"}
              </span>
              <span
                className="f2-badge"
                style={{
                  background: isConnected ? "rgba(16,124,65,0.15)" : "rgba(255,185,0,0.2)",
                  color: isConnected ? "var(--colorStatusSuccessForeground1)" : "var(--colorStatusWarningForeground1)",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {isConnected ? "Active & Ready" : "Smart Intent Mode"}
              </span>
            </div>
            <div style={{ color: "var(--colorNeutralForeground3)", fontSize: 13, marginTop: 2 }}>
              {isConnected
                ? activeProvider === "custom"
                  ? `Key: ${activeMaskedKey || "Configured"} • Base URL: ${aiSettings?.custom_base_url || inputBaseUrl} • Full multi-step reasoning enabled across your ${devices.length} fleet device(s).`
                  : `Key: ${activeMaskedKey || "Configured"} • Full multi-step reasoning enabled across your ${devices.length} fleet device(s).`
                : "Connect your OpenAI, Claude, Gemini, Groq, or Custom AI API key below to unlock full conversational reasoning."}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            className="f2-btn f2-btn-sm"
            onClick={() => setActiveTab("settings")}
            style={{ fontWeight: 600 }}
          >
            🔑 {isConnected ? "Change / Manage Keys" : "Connect AI API Key"}
          </button>
        </div>
      </div>

      {/* ================= NAVIGATION TABS ================= */}
      <div className="f2-tabs" style={{ borderBottom: "1px solid var(--colorNeutralStroke2)" }}>
        <button
          type="button"
          className="f2-tab-btn"
          data-active={String(activeTab === "chat")}
          onClick={() => setActiveTab("chat")}
        >
          💬 Fleet Copilot Chat
        </button>
        <button
          type="button"
          className="f2-tab-btn"
          data-active={String(activeTab === "settings")}
          onClick={() => setActiveTab("settings")}
        >
          🔑 Connect AI API Key
        </button>
        <button
          type="button"
          className="f2-tab-btn"
          data-active={String(activeTab === "invoker")}
          onClick={() => setActiveTab("invoker")}
        >
          ⚡ Live Tool Tester
        </button>
        <button
          type="button"
          className="f2-tab-btn"
          data-active={String(activeTab === "docs")}
          onClick={() => setActiveTab("docs")}
        >
          💻 SDK & REST Snippets
        </button>
      </div>

      {/* ================= TAB 1: COPILOT CHAT ================= */}
      {activeTab === "chat" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          {/* Active Fleet Device Chips */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--colorNeutralForeground3)" }}>
              FLEET STATUS:
            </span>
            {devices.map(d => {
              const isWin = d.os && d.os.toLowerCase().includes("win");
              return (
                <span
                  key={d.id}
                  className="f2-badge"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "4px 10px",
                    background: "var(--colorNeutralBackground3)",
                  }}
                >
                  <span>{isWin ? "🪟" : "🐧"}</span>
                  <strong>{d.name}</strong>
                  <span style={{ fontSize: 11, color: d.status === "online" ? "green" : "gray" }}>
                    ● {d.status}
                  </span>
                </span>
              );
            })}
          </div>

          {/* Chat Messages Card */}
          <div
            className="f2-card"
            style={{
              padding: 16,
              minHeight: 460,
              maxHeight: 620,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              background: "var(--colorNeutralBackground1)",
            }}
          >
            {chatMessages.map(msg => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--colorNeutralForeground3)",
                    marginBottom: 4,
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <span>{msg.role === "user" ? "👤 You" : "🤖 AI Fleet Copilot"}</span>
                  <span>•</span>
                  <span>{msg.timestamp}</span>
                </div>

                <div
                  style={{
                    maxWidth: "85%",
                    padding: "12px 16px",
                    borderRadius: 8,
                    background:
                      msg.role === "user"
                        ? "var(--colorBrandBackground)"
                        : "var(--colorNeutralBackground3)",
                    color: msg.role === "user" ? "#ffffff" : "var(--colorNeutralForeground1)",
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  }}
                >
                  {msg.content}

                  {/* Inline Screenshot Preview if generated */}
                  {msg.screenshot && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                        📸 Captured Display Output:
                      </div>
                      <img
                        src={`data:image/jpeg;base64,${msg.screenshot}`}
                        alt="Captured Desktop"
                        style={{
                          maxWidth: "100%",
                          maxHeight: 340,
                          borderRadius: 6,
                          border: "1px solid rgba(0,0,0,0.2)",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          const w = window.open("");
                          w?.document.write(`<img src="data:image/jpeg;base64,${msg.screenshot}" style="max-width:100%" />`);
                        }}
                      />
                    </div>
                  )}

                  {/* Tool Invocations Trace */}
                  {msg.steps && msg.steps.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(0,0,0,0.1)", fontSize: 11 }}>
                      <span style={{ fontWeight: 600 }}>Tools invoked: </span>
                      {msg.steps.map((s, i) => (
                        <span
                          key={i}
                          style={{
                            display: "inline-block",
                            background: "rgba(0,0,0,0.08)",
                            padding: "2px 6px",
                            borderRadius: 4,
                            marginRight: 4,
                            fontFamily: "monospace",
                          }}
                        >
                          {s.tool} ({s.device})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isSendingChat && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--colorNeutralForeground3)", fontSize: 13 }}>
                <span style={{ animation: "spin 1s linear infinite" }}>⚙️</span>
                <span>AI Copilot is reasoning and coordinating with devices...</span>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* Quick Action Suggestion Chips */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { label: "📸 Screenshot windows-pc", prompt: "Take a screenshot of windows-pc and show me what is on screen" },
              { label: "🐧 Ubuntu Uptime & Disk", prompt: "Check uptime, CPU load, and disk space on ubuntu" },
              { label: "🪟 Windows Apps", prompt: "List open application windows on windows-pc" },
              { label: "🩺 Full Fleet Health", prompt: "Provide a complete health and telemetry status summary for all devices in our fleet" },
            ].map((chip, idx) => (
              <button
                key={idx}
                type="button"
                className="f2-btn f2-btn-sm"
                style={{ fontSize: 12, padding: "4px 10px", borderRadius: 16 }}
                onClick={() => handleSendChat(chip.prompt)}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Chat Input Bar */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              className="f2-input"
              style={{ flex: 1, padding: "10px 14px", fontSize: 14 }}
              placeholder="Ask AI to run commands, check servers, or automate Windows GUI..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendChat();
                }
              }}
              disabled={isSendingChat}
            />
            <button
              type="button"
              className="f2-btn f2-btn-primary"
              style={{ padding: "0 22px", fontWeight: 600 }}
              onClick={() => handleSendChat()}
              disabled={isSendingChat || !chatInput.trim()}
            >
              Send ➔
            </button>
          </div>
        </div>
      )}

      {/* ================= TAB 2: CONNECT AI API KEY ================= */}
      {activeTab === "settings" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16, alignItems: "start" }}>
          {/* Key Input Form */}
          <div className="f2-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              Connect Your AI API Key
            </div>
            <div style={{ fontSize: 13, color: "var(--colorNeutralForeground3)", marginBottom: 16 }}>
              Store your OpenAI, Anthropic Claude, Gemini, or Groq API key securely in AI Bridge.
              Once saved, the Dashboard Chat and all AI agent tasks use this key automatically.
            </div>

            <form onSubmit={handleSaveKey} style={{ display: "grid", gap: 14 }}>
              {/* Provider Selection */}
              <div>
                <label className="f2-label" style={{ display: "block", marginBottom: 4 }}>AI Provider</label>
                <select
                  className="f2-input"
                  style={{ width: "100%" }}
                  value={inputProvider}
                  onChange={e => handleProviderChange(e.target.value)}
                >
                  <option value="openai">OpenAI (GPT-4o, GPT-4o-mini, o1)</option>
                  <option value="anthropic">Anthropic Claude (Claude 3.5 Sonnet)</option>
                  <option value="gemini">Google Gemini (Gemini 1.5 Flash / Pro)</option>
                  <option value="groq">Groq (Ultra-Fast Llama 3.3 70B)</option>
                  <option value="deepseek">DeepSeek (DeepSeek V3 / R1)</option>
                  <option value="ollama">Local Ollama (Offline / Self-Hosted)</option>
                  <option value="custom">⚡ Custom AI Endpoint (OpenRouter, Together, LocalAI, vLLM, LM Studio)</option>
                </select>
              </div>

              {/* Custom Base URL Input if Custom AI selected */}
              {inputProvider === "custom" && (
                <div>
                  <label className="f2-label" style={{ display: "block", marginBottom: 4 }}>
                    Custom Base URL (OpenAI-compatible)
                  </label>
                  <input
                    type="text"
                    className="f2-input"
                    style={{ width: "100%", fontFamily: "monospace", fontSize: 13 }}
                    placeholder="https://openrouter.ai/api/v1 or http://localhost:8000/v1"
                    value={inputBaseUrl}
                    onChange={e => setInputBaseUrl(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--colorNeutralForeground3)", alignSelf: "center" }}>Presets:</span>
                    {[
                      { name: "OpenRouter", url: "https://openrouter.ai/api/v1", model: "mistralai/mixtral-8x7b-instruct" },
                      { name: "Together AI", url: "https://api.together.xyz/v1", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
                      { name: "Mistral", url: "https://api.mistral.ai/v1", model: "mistral-large-latest" },
                      { name: "LM Studio", url: "http://localhost:1234/v1", model: "local-model" },
                      { name: "LocalAI / vLLM", url: "http://localhost:8000/v1", model: "default" },
                    ].map(p => (
                      <button
                        key={p.name}
                        type="button"
                        className="f2-btn f2-btn-sm"
                        style={{ fontSize: 11, padding: "2px 8px" }}
                        onClick={() => {
                          setInputBaseUrl(p.url);
                          setInputModel(p.model);
                        }}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Model Input */}
              <div>
                <label className="f2-label" style={{ display: "block", marginBottom: 4 }}>Model Name</label>
                <input
                  type="text"
                  className="f2-input"
                  style={{ width: "100%" }}
                  placeholder={inputProvider === "custom" ? "e.g. mistralai/mixtral-8x7b-instruct, gpt-4o, etc." : "Model name"}
                  value={inputModel}
                  onChange={e => setInputModel(e.target.value)}
                />
              </div>

              {/* API Key Input */}
              {inputProvider !== "ollama" ? (
                <div>
                  <label className="f2-label" style={{ display: "block", marginBottom: 4 }}>
                    API Key for {inputProvider === "custom" ? "Custom AI Endpoint" : inputProvider.toUpperCase()}
                  </label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type={showApiKey ? "text" : "password"}
                      className="f2-input"
                      style={{ flex: 1, fontFamily: "monospace" }}
                      placeholder={
                        inputProvider === "openai" ? "sk-proj-..."
                        : inputProvider === "anthropic" ? "sk-ant-..."
                        : inputProvider === "gemini" ? "AIzaSy..."
                        : inputProvider === "custom" ? "Custom API key or Bearer token (optional for local/no-auth)"
                        : "Your API Key"
                      }
                      value={inputApiKey}
                      onChange={e => setInputApiKey(e.target.value)}
                    />
                    <button
                      type="button"
                      className="f2-btn"
                      onClick={() => setShowApiKey(!showApiKey)}
                      title="Show/Hide Key"
                    >
                      {showApiKey ? "🙈" : "👁️"}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--colorNeutralForeground3)", marginTop: 4 }}>
                    {inputProvider === "custom"
                      ? "Custom keys are sent via Authorization: Bearer <key> to your Base URL."
                      : "Keys travel over HTTPS only and are never exposed in client logs."}
                  </div>
                </div>
              ) : (
                <div style={{ background: "var(--colorNeutralBackground3)", padding: 10, borderRadius: 6, fontSize: 12 }}>
                  Ollama runs locally at <code>http://localhost:11434</code> without external API keys.
                </div>
              )}

              {saveMessage && (
                <div
                  style={{
                    padding: 10,
                    borderRadius: 6,
                    fontSize: 13,
                    background: saveMessage.error ? "rgba(197,34,31,0.1)" : "rgba(16,124,65,0.1)",
                    color: saveMessage.error ? "var(--colorStatusDangerForeground1)" : "var(--colorStatusSuccessForeground1)",
                    border: saveMessage.error ? "1px solid rgba(197,34,31,0.3)" : "1px solid rgba(16,124,65,0.3)",
                  }}
                >
                  {saveMessage.text}
                </div>
              )}

              <button
                type="submit"
                className="f2-btn f2-btn-primary"
                style={{ padding: "10px 0", fontWeight: 700 }}
                disabled={isSavingKey}
              >
                {isSavingKey ? "Verifying with Provider..." : "🔒 Test & Save AI Connection"}
              </button>
            </form>
          </div>

          {/* Configured Keys Card */}
          <div className="f2-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
              Configured AI Providers
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {[
                { id: "openai", name: "OpenAI", desc: "GPT-4o, GPT-4o-mini" },
                { id: "anthropic", name: "Anthropic", desc: "Claude 3.5 Sonnet" },
                { id: "gemini", name: "Google Gemini", desc: "Gemini 1.5 Flash / Pro" },
                { id: "groq", name: "Groq", desc: "Llama 3.3 70B (Fast)" },
                { id: "deepseek", name: "DeepSeek", desc: "DeepSeek V3 / R1" },
                { id: "custom", name: "Custom AI Endpoint", desc: aiSettings?.custom_base_url || "OpenRouter, Together, LocalAI, vLLM" },
              ].map(prov => {
                const isConf = aiSettings?.keys_configured?.[prov.id];
                const masked = aiSettings?.masked_keys?.[prov.id];

                return (
                  <div
                    key={prov.id}
                    style={{
                      background: "var(--colorNeutralBackground3)",
                      padding: "10px 14px",
                      borderRadius: 6,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{prov.name}</div>
                      <div style={{ fontSize: 11, color: "var(--colorNeutralForeground3)" }}>
                        {isConf
                          ? prov.id === "custom"
                            ? `Connected (${masked || "No Key"}) • ${aiSettings?.custom_base_url}`
                            : `Connected (${masked})`
                          : "Not connected"}
                      </div>
                    </div>

                    <div>
                      {isConf ? (
                        <button
                          type="button"
                          className="f2-btn f2-btn-sm"
                          style={{ color: "var(--colorStatusDangerForeground1)", fontSize: 11 }}
                          onClick={() => handleClearKey(prov.id)}
                        >
                          Disconnect
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="f2-btn f2-btn-sm"
                          style={{ fontSize: 11 }}
                          onClick={() => {
                            handleProviderChange(prov.id);
                          }}
                        >
                          Configure
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 3: LIVE TOOL RUNNER ================= */}
      {activeTab === "invoker" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.8fr", gap: 16, alignItems: "start" }}>
          <div className="f2-card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
              Execute Tool Synchronously (POST /api/ai/execute)
            </div>

            <div style={{ display: "grid", gap: 12 }}>
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

              <div>
                <label className="f2-label" style={{ display: "block", marginBottom: 4 }}>Select Tool</label>
                <select
                  className="f2-input"
                  style={{ width: "100%" }}
                  value={selectedTool}
                  onChange={e => handleToolChange(e.target.value)}
                >
                  <option value="run_shell">run_shell (Execute Bash / PowerShell)</option>
                  <option value="take_screenshot">take_screenshot (Desktop Screen Capture)</option>
                  <option value="mouse_click">mouse_click (Click coordinates)</option>
                  <option value="keyboard_type">keyboard_type (Type keystrokes)</option>
                  <option value="list_desktop_windows">list_desktop_windows (Open windows)</option>
                  <option value="read_file">read_file (Read file)</option>
                  <option value="get_system_info">get_system_info (Hardware specs)</option>
                </select>
              </div>

              <div>
                <label className="f2-label" style={{ display: "block", marginBottom: 4 }}>Arguments (JSON)</label>
                <textarea
                  className="f2-input"
                  style={{ width: "100%", height: 110, fontFamily: "monospace", fontSize: 12 }}
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

          <div className="f2-card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Real-Time Result</span>
              {execDuration !== null && (
                <span className="f2-badge" style={{ background: "rgba(16,124,65,0.15)", color: "var(--colorStatusSuccessForeground1)" }}>
                  {execDuration} ms
                </span>
              )}
            </div>

            {executionResult ? (
              <div>
                {executionResult.result?.screenshot && (
                  <div style={{ marginBottom: 12 }}>
                    <img
                      src={`data:image/jpeg;base64,${executionResult.result.screenshot}`}
                      alt="Captured Display"
                      style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 6, border: "1px solid var(--colorNeutralStroke1)" }}
                    />
                  </div>
                )}
                <pre
                  style={{
                    background: "var(--colorNeutralBackground3)",
                    padding: 12,
                    borderRadius: 6,
                    maxHeight: 340,
                    overflow: "auto",
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}
                >
                  {JSON.stringify(executionResult, null, 2)}
                </pre>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--colorNeutralForeground3)", fontSize: 13 }}>
                Click "Execute Tool" to run a command or desktop action.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 4: CODE GENERATOR ================= */}
      {activeTab === "docs" && (
        <div className="f2-card" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>SDK & REST API Code Generator</div>
              <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                Pre-filled with your current base URL and active token.
              </div>
            </div>

            <button
              type="button"
              className="f2-btn"
              onClick={() => {
                navigator.clipboard?.writeText(renderCodeSnippet());
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              style={{ padding: "6px 14px", fontWeight: 600 }}
            >
              {copied ? "✓ Copied!" : "📋 Copy Code"}
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              { id: "python", label: "Python SDK" },
              { id: "openai", label: "OpenAI Client (/v1)" },
              { id: "curl", label: "cURL / Bash" },
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
            }}
          >
            {renderCodeSnippet()}
          </pre>
        </div>
      )}
    </div>
  );
};
