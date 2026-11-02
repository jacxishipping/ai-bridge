import React, { useEffect, useState, useRef } from "react";
import { api, token, sessionToken } from "./api";
import { ConfirmDialog, type ConfirmRequest } from "./ConfirmDialog";
import {
  JXCard,
  JXButton,
  JXTabs,
  JXChip,
  JXTextField,
  JXSelect,
  AIMessage,
  AIToolCall,
  AIThinkingIndicator,
  MagneticButton,
  LiquidButton,
  PulseIndicator,
  StatusIndicator,
} from "@jacxishippingorg/jx-ui-react";

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
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);

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
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<string>("auto");
  const [selectedTool, setSelectedTool] = useState<string>("run_shell");
  const [toolArgsStr, setToolArgsStr] = useState<string>('{\n  "command": "uname -a"\n}');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [execDuration, setExecDuration] = useState<number | null>(null);

  // Docs State
  const [codeLang, setCodeLang] = useState<"python" | "openai" | "curl">("python");
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
      setSaveMessage({ text: "Failed to load AI settings: " + (err as any)?.message, error: true });
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
    } catch (err: any) {
      setToolsError(`Failed to load tools catalog: ${err.message}`);
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
    setConfirmReq({
      title: `Disconnect the ${providerName} API key?`,
      message: "The stored key will be removed and Fleet Copilot will fall back to Smart Intent Mode until a new key is connected. This cannot be undone.",
      confirmLabel: "Disconnect key",
      danger: true,
      onConfirm: async () => {
        try {
          await api.saveAiSettings({ provider: providerName, clear: true });
          await loadAiSettings();
          setSaveMessage({ text: `Disconnected ${providerName} key.`, error: false });
        } catch (err: any) {
          setSaveMessage({ text: "Failed to disconnect: " + err.message, error: true });
        }
      },
    });
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
      setExecutionResult({ ok: false, error: "Invalid JSON arguments: " + err.message });
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
    else if (toolName === "click_text") setToolArgsStr('{\n  "text": "Settings",\n  "button": "left",\n  "clicks": 1\n}');
    else if (toolName === "click_element") setToolArgsStr('{\n  "mark_id": "1",\n  "button": "left"\n}');
    else if (toolName === "ocr_screen") setToolArgsStr('{\n  "lang": "en"\n}');
    else if (toolName === "set_of_marks_screenshot") setToolArgsStr('{}');
    else if (toolName === "list_ui_elements") setToolArgsStr('{}');
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

# 2. Grounded UI Automation (Zero pixel coordinate guessing!)
# Find text on screen via native Windows OCR and click it directly:
click_res = client.execute("click_text", {"text": "Settings"}, device="windows-pc")
print("Clicked button:", click_res)

# Or list all recognized buttons and menus with exact bounding boxes:
elements = client.execute("list_ui_elements", {}, device="windows-pc")
print(f"Discovered {len(elements.get('elements', []))} UI controls")

# 3. Take screenshot & type text
shot = client.take_screenshot(device="windows-pc", quality=75)
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

  const mainTabs = [
    { id: "chat", label: "Fleet Copilot Chat" },
    { id: "settings", label: "Connect AI API Key" },
    { id: "invoker", label: "Live Tool Tester" },
    { id: "docs", label: "SDK & REST Snippets" },
  ];

  const providerOptions = [
    { id: "openai", label: "OpenAI (GPT-4o, GPT-4o-mini, o1)" },
    { id: "anthropic", label: "Anthropic Claude (Claude 3.5 Sonnet)" },
    { id: "gemini", label: "Google Gemini (Gemini 1.5 Flash / Pro)" },
    { id: "groq", label: "Groq (Ultra-Fast Llama 3.3 70B)" },
    { id: "deepseek", label: "DeepSeek (DeepSeek V3 / R1)" },
    { id: "ollama", label: "Local Ollama (Offline / Self-Hosted)" },
    { id: "custom", label: "Custom AI Endpoint (OpenRouter, Together, LocalAI, vLLM)" },
  ];

  const deviceOptions = [
    { id: "auto", label: "Auto (Auto-route based on tool type)" },
    { id: "local", label: "Local (Droplet / MCP Host)" },
    ...devices.map(d => ({
      id: d.name || d.id,
      label: `${d.name} (${d.os || "node"}, ${d.status})`,
    })),
  ];

  const toolOptions = [
    { id: "run_shell", label: "run_shell (Execute Bash / PowerShell)" },
    { id: "take_screenshot", label: "take_screenshot (Desktop Screen Capture)" },
    { id: "mouse_click", label: "mouse_click (Click coordinates)" },
    { id: "keyboard_type", label: "keyboard_type (Type keystrokes)" },
    { id: "list_desktop_windows", label: "list_desktop_windows (Open windows)" },
    { id: "read_file", label: "read_file (Read file)" },
    { id: "get_system_info", label: "get_system_info (Hardware specs)" },
  ];

  const docTabs = [
    { id: "python", label: "Python SDK" },
    { id: "openai", label: "OpenAI Client (/v1)" },
    { id: "curl", label: "cURL / Bash" },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <ConfirmDialog request={confirmReq} onClose={() => setConfirmReq(null)} />

      {/* ================= TOP CONNECTION BANNER ================= */}
      <JXCard spotlight hoverLift className="f2-card">
        <div
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
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              position: "relative",
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: isConnected ? "rgba(16,124,65,0.15)" : "rgba(255,185,0,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
          >
            {isConnected ? <PulseIndicator /> : "🟡"}
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
              <JXChip
                label={isConnected ? "Active & Ready" : "Smart Intent Mode"}
                tone={isConnected ? "emerald" : "amber"}
              />
              <StatusIndicator />
            </div>
            <div style={{ color: "var(--colorNeutralForeground3)", fontSize: 13, marginTop: 4 }}>
              {isConnected
                ? activeProvider === "custom"
                  ? `Key: ${activeMaskedKey || "Configured"} • Base URL: ${aiSettings?.custom_base_url || inputBaseUrl} • Full multi-step reasoning enabled across your ${devices.length} fleet device(s).`
                  : `Key: ${activeMaskedKey || "Configured"} • Full multi-step reasoning enabled across your ${devices.length} fleet device(s).`
                : "Connect your OpenAI, Claude, Gemini, Groq, or Custom AI API key below to unlock full conversational reasoning."}
            </div>
          </div>
        </div>

        <div>
          <MagneticButton
            variant="outline"
            tone="primary"
            strength={12}
            onClick={() => setActiveTab("settings")}
            style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13 }}
          >
            🔑 {isConnected ? "Change / Manage Keys" : "Connect AI API Key"}
          </MagneticButton>
        </div>
        </div>
      </JXCard>

      {/* ================= NAVIGATION TABS ================= */}
      <JXTabs
        tabs={mainTabs}
        value={activeTab}
        onChange={(val) => setActiveTab(val as any)}
        indicatorVariant="pill"
      />

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
                <JXChip
                  key={d.id}
                  label={`${isWin ? "🪟" : "🐧"} ${d.name} ● ${d.status}`}
                  tone={d.status === "online" ? "emerald" : "neutral"}
                />
              );
            })}
          </div>

          {/* Chat Messages Card */}
          <JXCard spotlight className="f2-card">
            <div
              style={{
                padding: 18,
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
                    borderRadius: 12,
                    background:
                      msg.role === "user"
                        ? "var(--colorBrandBackground)"
                        : "var(--colorNeutralBackground3)",
                    color: msg.role === "user" ? "#ffffff" : "var(--colorNeutralForeground1)",
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
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
                          borderRadius: 8,
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
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 11, opacity: 0.85 }}>⚡ Multi-Step Autonomous Tool Invocations:</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {msg.steps.map((s, i) => (
                          <AIToolCall key={i} toolName={`${s.tool} (${s.device || 'fleet'})`} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isSendingChat && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", color: "var(--colorNeutralForeground3)", padding: 8 }}>
                <AIThinkingIndicator />
                <span style={{ fontSize: 13 }}>AI Copilot is reasoning and coordinating with devices...</span>
              </div>
            )}

            <div ref={chatBottomRef} />
            </div>
          </JXCard>

          {/* Quick Action Suggestion Chips */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { icon: "📸", label: "Screenshot windows-pc", prompt: "Take a screenshot of windows-pc and show me what is on screen" },
              { icon: "🔤", label: "Native OCR & Text Grounding", prompt: "Run OCR on windows-pc screen and list all detected text buttons with coordinates" },
              { icon: "🎯", label: "Click by Text (Zero Guesswork)", prompt: "Find and click the 'Settings' button on windows-pc" },
              { icon: "🏷️", label: "Set-of-Marks Overlay", prompt: "Generate a set of marks screenshot on windows-pc and enumerate all clickable UI elements" },
              { icon: "🐧", label: "Ubuntu Uptime & Disk", prompt: "Check uptime, CPU load, and disk space on ubuntu" },
              { icon: "🪟", label: "Windows Apps", prompt: "List open application windows on windows-pc" },
              { icon: "🩺", label: "Full Fleet Health", prompt: "Provide a complete health and telemetry status summary for all devices in our fleet" },
            ].map((chip, idx) => (
              <button
                key={idx}
                type="button"
                className="f2-suggestion-chip"
                onClick={() => handleSendChat(chip.prompt)}
              >
                <span>{chip.label}</span>
              </button>
            ))}
          </div>

          {/* Chat Input Bar */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <JXTextField
                placeholder="Ask AI to run commands, check servers, or automate Windows GUI..." showCharacterCounter={false} maxLength={4096}
                value={chatInput}
                onChange={(val) => setChatInput(val)}
                disabled={isSendingChat}
                onKeyDown={(e: any) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChat();
                  }
                }}
              />
            </div>
            <MagneticButton
              variant="solid"
              tone="primary"
              strength={15}
              onClick={() => handleSendChat()}
              disabled={isSendingChat || !chatInput.trim()}
              style={{ padding: "10px 22px", borderRadius: 8, fontWeight: 700, fontSize: 13 }}
            >
              Send ➔
            </MagneticButton>
          </div>
        </div>
      )}

      {/* ================= TAB 2: CONNECT AI API KEY ================= */}
      {activeTab === "settings" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16, alignItems: "start" }}>
          {/* Key Input Form */}
          <JXCard spotlight className="f2-card">
            <div style={{ padding: 22 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              Connect Your AI API Key
            </div>
            <div style={{ fontSize: 13, color: "var(--colorNeutralForeground3)", marginBottom: 18 }}>
              Store your OpenAI, Anthropic Claude, Gemini, or Groq API key securely in AI Bridge.
              Once saved, the Dashboard Chat and all AI agent tasks use this key automatically.
            </div>

            <form onSubmit={handleSaveKey} style={{ display: "grid", gap: 16 }}>
              {/* Provider Selection */}
              <div>
                <JXSelect
                  label="AI Provider"
                  options={providerOptions}
                  value={inputProvider}
                  onChange={(val) => handleProviderChange(val)}
                />
              </div>

              {/* Custom Base URL Input if Custom AI selected */}
              {inputProvider === "custom" && (
                <div>
                  <JXTextField
                    label="Custom Base URL (OpenAI-compatible)"
                    placeholder="https://openrouter.ai/api/v1 or http://localhost:8000/v1"
                    value={inputBaseUrl}
                    onChange={(val) => setInputBaseUrl(val)}
                  />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--colorNeutralForeground3)", alignSelf: "center" }}>Presets:</span>
                    {[
                      { name: "OpenRouter", url: "https://openrouter.ai/api/v1", model: "mistralai/mixtral-8x7b-instruct" },
                      { name: "Together AI", url: "https://api.together.xyz/v1", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
                      { name: "Mistral", url: "https://api.mistral.ai/v1", model: "mistral-large-latest" },
                      { name: "LM Studio", url: "http://localhost:1234/v1", model: "local-model" },
                      { name: "LocalAI / vLLM", url: "http://localhost:8000/v1", model: "default" },
                    ].map(p => (
                      <JXButton
                        key={p.name}
                        variant="soft"
                        size="sm"
                        onClick={() => {
                          setInputBaseUrl(p.url);
                          setInputModel(p.model);
                        }}
                      >
                        {p.name}
                      </JXButton>
                    ))}
                  </div>
                </div>
              )}

              {/* Model Input */}
              <div>
                <JXTextField
                  label="Model Name"
                  placeholder={inputProvider === "custom" ? "e.g. mistralai/mixtral-8x7b-instruct, gpt-4o, etc." : "Model name"}
                  value={inputModel}
                  onChange={(val) => setInputModel(val)}
                />
              </div>

              {/* API Key Input */}
              {inputProvider !== "ollama" ? (
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>
                      <JXTextField
                        label={`API Key for ${inputProvider === "custom" ? "Custom AI Endpoint" : inputProvider.toUpperCase()}`}
                        type={showApiKey ? "text" : "password"}
                        placeholder={
                          inputProvider === "openai" ? "sk-proj-..."
                          : inputProvider === "anthropic" ? "sk-ant-..."
                          : inputProvider === "gemini" ? "AIzaSy..."
                          : inputProvider === "custom" ? "Custom API key or Bearer token (optional for local/no-auth)"
                          : "Your API Key"
                        }
                        value={inputApiKey}
                        onChange={(val) => setInputApiKey(val)}
                      />
                    </div>
                    <JXButton
                      variant="outlined"
                      size="md"
                      onClick={() => setShowApiKey(!showApiKey)}
                      title="Show/Hide Key"
                    >
                      {showApiKey ? "🙈" : "👁️"}
                    </JXButton>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--colorNeutralForeground3)", marginTop: 6 }}>
                    {inputProvider === "custom"
                      ? "Custom keys are sent via Authorization: Bearer <key> to your Base URL."
                      : "Keys travel over HTTPS only and are never exposed in client logs."}
                  </div>
                </div>
              ) : (
                <div style={{ background: "var(--colorNeutralBackground3)", padding: 12, borderRadius: 8, fontSize: 12 }}>
                  Ollama runs locally at <code>http://localhost:11434</code> without external API keys.
                </div>
              )}

              {saveMessage && (
                <div
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    fontSize: 13,
                    background: saveMessage.error ? "rgba(197,34,31,0.1)" : "rgba(16,124,65,0.1)",
                    color: saveMessage.error ? "var(--colorStatusDangerForeground1)" : "var(--colorStatusSuccessForeground1)",
                    border: saveMessage.error ? "1px solid rgba(197,34,31,0.3)" : "1px solid rgba(16,124,65,0.3)",
                  }}
                >
                  {saveMessage.text}
                </div>
              )}

              <LiquidButton
                variant="solid"
                tone="primary"
                type="submit"
                disabled={isSavingKey}
                style={{ width: "100%", padding: "12px", borderRadius: 8, fontWeight: 700, fontSize: 14 }}
              >
                {isSavingKey ? "Connecting to AI Provider..." : "🔒 Test & Save AI Connection"}
              </LiquidButton>
            </form>
          </div>
          </JXCard>

          {/* Configured Keys Card */}
          <JXCard spotlight className="f2-card">
            <div style={{ padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
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
                      padding: "12px 14px",
                      borderRadius: 8,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{prov.name}</div>
                      <div style={{ fontSize: 11, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                        {isConf
                          ? prov.id === "custom"
                            ? `Connected (${masked || "No Key"}) • ${aiSettings?.custom_base_url}`
                            : `Connected (${masked})`
                          : "Not connected"}
                      </div>
                    </div>

                    <div>
                      {isConf ? (
                        <JXButton
                          variant="soft"
                          size="sm"
                          color="error"
                          onClick={() => handleClearKey(prov.id)}
                        >
                          Disconnect
                        </JXButton>
                      ) : (
                        <JXButton
                          variant="outlined"
                          size="sm"
                          onClick={() => {
                            handleProviderChange(prov.id);
                          }}
                        >
                          Configure
                        </JXButton>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </JXCard>
        </div>
      )}

      {/* ================= TAB 3: LIVE TOOL RUNNER ================= */}
      {activeTab === "invoker" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.8fr", gap: 16, alignItems: "start" }}>
          <JXCard spotlight className="f2-card">
            <div style={{ padding: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>
              Execute Tool Synchronously (POST /api/ai/execute)
            </div>
            {toolsError && (
              <div className="f2-messagebar" data-intent="error" style={{ marginBottom: 12 }}>
                <span>{toolsError}</span>
                <JXButton variant="soft" size="sm" onClick={() => { setToolsError(null); loadTools(); }}>Retry</JXButton>
              </div>
            )}

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <JXSelect
                  label="Target Device"
                  options={deviceOptions}
                  value={selectedDevice}
                  onChange={(val) => setSelectedDevice(val)}
                />
              </div>

              <div>
                <JXSelect
                  label="Select Tool"
                  options={toolOptions}
                  value={selectedTool}
                  onChange={(val) => handleToolChange(val)}
                />
              </div>

              <div>
                <label className="f2-label" style={{ display: "block", marginBottom: 6 }}>Arguments (JSON)</label>
                <textarea
                  className="f2-input"
                  style={{ width: "100%", height: 110, fontFamily: "monospace", fontSize: 12, borderRadius: 8 }}
                  value={toolArgsStr}
                  onChange={e => setToolArgsStr(e.target.value)}
                />
              </div>

              <MagneticButton
                variant="solid"
                tone="primary"
                strength={15}
                disabled={isExecuting}
                onClick={handleExecuteTool}
                style={{ width: "100%", padding: "12px", borderRadius: 8, fontWeight: 700, fontSize: 14 }}
              >
                {isExecuting ? "⚡ Executing Tool..." : "▶ Execute Tool"}
              </MagneticButton>
            </div>
          </div>
          </JXCard>

          <JXCard spotlight className="f2-card">
            <div style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Real-Time Result</span>
              {execDuration !== null && (
                <JXChip
                  label={`${execDuration} ms`}
                  tone="emerald"
                />
              )}
            </div>

            {executionResult ? (
              <div>
                {executionResult.result?.screenshot && (
                  <div style={{ marginBottom: 12 }}>
                    <img
                      src={`data:image/jpeg;base64,${executionResult.result.screenshot}`}
                      alt="Captured Display"
                      style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 8, border: "1px solid var(--colorNeutralStroke1)" }}
                    />
                  </div>
                )}
                <pre
                  style={{
                    background: "var(--colorNeutralBackground3)",
                    padding: 12,
                    borderRadius: 8,
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
          </JXCard>
        </div>
      )}

      {/* ================= TAB 4: CODE GENERATOR ================= */}
      {activeTab === "docs" && (
        <JXCard spotlight className="f2-card">
            <div style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>SDK & REST API Code Generator</div>
              <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                Pre-filled with your current base URL and active token.
              </div>
            </div>

            <JXButton
              variant="outlined"
              size="sm"
              onClick={() => {
                navigator.clipboard?.writeText(renderCodeSnippet());
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "✓ Copied!" : "📋 Copy Code"}
            </JXButton>
          </div>

          <div style={{ marginBottom: 14 }}>
            <JXTabs
              tabs={docTabs}
              value={codeLang}
              onChange={(val) => setCodeLang(val as any)}
              indicatorVariant="pill"
            />
          </div>

          <pre
            style={{
              background: "var(--colorNeutralBackground3)",
              padding: 16,
              borderRadius: 8,
              fontFamily: "monospace",
              fontSize: 13,
              lineHeight: 1.5,
              overflow: "auto",
            }}
          >
            {renderCodeSnippet()}
          </pre>
        </div>
          </JXCard>
      )}
    </div>
  );
};
