# 🤖 AI Bridge MCP Chatbot Integration Guide

Connect Claude, ChatGPT, Gemini, Grok, Codex, Cursor, Windsurf, and any MCP-compatible AI to your AI Bridge fleet.

---

## Quick Start

Pick the public base URL for your deployment:

| Deployment | MCP URL |
|------------|---------|
| Render (this Blueprint) | `https://ai-bridge-control.onrender.com/mcp` |
| Production droplet example | `https://jxiptvplayer.app/mcp` |

Below, `BASE` means that origin (no trailing slash), e.g. `https://ai-bridge-control.onrender.com`.

### Option 1: Admin Token (Fastest, for testing)
Use your `AI_BRIDGE_ADMIN_TOKEN` directly as a Bearer token:
```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  "$BASE/mcp"
```

### Option 2: OAuth Clients (Recommended for production)
Register dedicated OAuth clients per chatbot for secure, scoped access.

---

## 📋 Supported Chatbots

| Chatbot | MCP Support | Method | Status |
|---------|-------------|--------|--------|
| **Claude Desktop** | ✅ Native | stdio / Remote HTTP | Ready |
| **Claude Code** | ✅ Native | stdio | Ready |
| **ChatGPT** | ⚠️ Limited | Remote HTTP (Plus/Enterprise) | Ready |
| **Gemini CLI** | ✅ Native | stdio / Remote HTTP | Ready |
| **Codex CLI** | ✅ Native | stdio | Ready |
| **Cursor IDE** | ✅ Native | stdio | Ready |
| **Windsurf IDE** | ✅ Native | stdio | Ready |
| **Grok** | ❌ No native | Python SDK / OpenAI API | Ready |
| **Custom AI** | ✅ Via SDK | Python SDK | Ready |

---

## 🔐 OAuth Client Registration

### Step 1: Register Clients

Run the setup script from your local machine:

```bash
python scripts/setup_mcp_chatbots.py \
  --url https://jxiptvplayer.app \
  --token YOUR_ADMIN_TOKEN
```

This creates `mcp-chatbot-clients.json` with client IDs for each chatbot.

### Step 2: Authorize Each Client

Visit the generated authorization URLs in your browser. You'll see a secure approval page:

![OAuth Approval](https://jxiptvplayer.app/oauth/authorize?client_id=...)

Enter your **admin token** to approve. The chatbot gets:
- Access to all fleet devices (or one specific device if `--device` was used)
- A refresh token for long-term access
- PKCE S256 security

### Step 3: Configure Each Chatbot

---

## 💬 Claude Desktop / Claude Code

### Remote HTTP (Recommended for cloud deployment)

Edit your Claude MCP config:
- **macOS**: `~/Library/Application Support/Claude/claude-config.json`
- **Windows**: `%APPDATA%/Claude/claude-config.json`
- **Linux**: `~/.config/Claude/claude-config.json`

```json
{
  "mcpServers": {
    "ai-bridge": {
      "url": "https://jxiptvplayer.app/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_ACCESS_TOKEN"
      }
    }
  }
}
```

### Local stdio (For local development)
```json
{
  "mcpServers": {
    "ai-bridge": {
      "command": "/path/to/ai-bridge/.venv/bin/python",
      "args": ["-m", "ai_bridge.server"],
      "env": {
        "AI_BRIDGE_WORKSPACE": "/path/to/workspace"
      }
    }
  }
}
```

**Restart Claude**, then ask:
> "List available tools" or "Show me connected devices"

---

## 💬 ChatGPT

ChatGPT's web interface **does not support local stdio MCP**. Options:

### Option A: Remote MCP (ChatGPT Plus/Enterprise)
If your workspace supports remote MCP connectors:
1. Go to ChatGPT Settings → MCP → Add Custom Server
2. URL: `https://jxiptvplayer.app/mcp`
3. Auth: OAuth 2.1 (use your registered client_id)

### Option B: ChatGPT Desktop App
Some desktop versions support MCP. Use the generic config:
```json
{
  "mcpServers": {
    "ai-bridge": {
      "url": "https://jxiptvplayer.app/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_ACCESS_TOKEN"
      }
    }
  }
}
```

---

## 💬 Gemini / Gemini CLI

### Gemini CLI
Edit `~/.gemini/settings.json`:
```json
{
  "mcpServers": {
    "ai-bridge": {
      "url": "https://jxiptvplayer.app/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_ACCESS_TOKEN"
      }
    }
  }
}
```

### Gemini API (Python SDK)
```python
from ai_bridge import AIBridgeClient

client = AIBridgeClient(
    base_url="https://jxiptvplayer.app",
    token="YOUR_ACCESS_TOKEN"
)

# Get tools in Gemini format
tools = client.get_tools(format="gemini")
print(f"Available tools: {len(tools)}")
```

---

## 💬 Codex CLI (OpenAI)

Edit `~/.codex/config.toml`:
```toml
[mcp_servers.ai-bridge]
url = "https://jxiptvplayer.app/mcp"
headers = { Authorization = "Bearer YOUR_ACCESS_TOKEN" }
```

Then run:
```bash
codex "Check disk space on all servers"
```

---

## 💬 Cursor IDE

1. Open Cursor → Settings → MCP
2. Add server:
   - Name: `ai-bridge`
   - URL: `https://jxiptvplayer.app/mcp`
   - Headers: `Authorization: Bearer YOUR_ACCESS_TOKEN`
3. Save and test with: "List my devices"

---

## 💬 Windsurf IDE

1. Open Windsurf → Settings → MCP
2. Add server configuration:
```json
{
  "mcpServers": {
    "ai-bridge": {
      "url": "https://jxiptvplayer.app/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_ACCESS_TOKEN"
      }
    }
  }
}
```

---

## 🦾 Grok (xAI)

Grok doesn't have native MCP support yet. Use these alternatives:

### Option A: Python SDK
```python
from ai_bridge import AIBridgeClient

client = AIBridgeClient(
    base_url="https://jxiptvplayer.app",
    token="YOUR_ACCESS_TOKEN"
)

# List devices
devices = client.list_devices()

# Execute commands
result = client.run_shell("df -h", device="ubuntu")
screenshot = client.take_screenshot(device="windows-pc")
```

### Option B: OpenAI-Compatible API
AI Bridge exposes `/v1/chat/completions`. Point any OpenAI-compatible client:
```python
from openai import OpenAI

client = OpenAI(
    base_url="https://jxiptvplayer.app/api/v1",
    api_key="YOUR_ACCESS_TOKEN"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Check server status"}],
    tools=tools  # fetched from AI Bridge
)
```

---

## 🔧 Custom AI / LangChain / CrewAI

### LangChain Integration
```python
from langchain.tools import Tool
from ai_bridge import AIBridgeClient

bridge = AIBridgeClient(base_url="https://jxiptvplayer.app", token="YOUR_TOKEN")

# Create LangChain tools
tools = [
    Tool(
        name="run_shell",
        func=lambda cmd: bridge.run_shell(cmd, device="ubuntu"),
        description="Run shell commands on Ubuntu server"
    ),
    Tool(
        name="screenshot",
        func=lambda: bridge.take_screenshot(device="windows-pc"),
        description="Take screenshot of Windows PC"
    ),
]
```

### CrewAI Integration
```python
from crewai import Agent
from ai_bridge import AIBridgeClient

bridge = AIBridgeClient(base_url="https://jxiptvplayer.app", token="YOUR_TOKEN")

sysadmin = Agent(
    role="System Administrator",
    goal="Monitor and manage fleet servers",
    tools=bridge.get_tools(format="crewai"),
    llm="gpt-4o"
)
```

---

## 🛡️ Security Best Practices

1. **Never share admin token** in chat or config files
2. **Use OAuth clients** per chatbot with device binding
3. **Rotate tokens** regularly via the OAuth revocation endpoint
4. **Enable device binding** to restrict chatbot access:
   ```bash
   python scripts/setup_mcp_chatbots.py \
     --url https://jxiptvplayer.app \
     --token YOUR_ADMIN_TOKEN \
     --device windows-pc-01
   ```
5. **Monitor access** via the AI Bridge dashboard

---

## 🧪 Testing Your Connection

```bash
# Test MCP endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://jxiptvplayer.app/mcp/

# List available tools
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://jxiptvplayer.app/mcp/tools/list

# Check OAuth discovery
curl https://jxiptvplayer.app/oauth/.well-known/oauth-authorization-server
```

---

## 📚 Available MCP Tools

Once connected, your AI can execute:

| Tool | Description |
|------|-------------|
| `system_info` | Get system information |
| `resource_usage` | CPU, memory, disk usage |
| `list_workspace` | List workspace files |
| `read_file` / `edit_file` | File operations |
| `run_shell` | Execute shell commands |
| `docker_ps` / `docker_logs` | Docker management |
| `git_status` / `git_diff` | Git operations |
| `submit_task` | Submit background tasks |
| `desktop_status` | Check desktop availability |
| `screenshot` | Capture screen |
| `mouse_click` / `keyboard_type` | GUI automation |
| `list_devices` | Show fleet devices |
| `select_device` | Target specific device |

---

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| `401 Unauthorized` | Check token validity or re-authorize |
| `404 Not Found` | Ensure `/mcp/` has trailing slash |
| Connection timeout | SSE streaming is normal — use `--max-time` with curl |
| Claude not seeing tools | Restart Claude after config changes |
| ChatGPT not connecting | Verify your plan supports remote MCP |
| Device not responding | Check agent is running on target device |

---

## 📖 References

- [MCP Protocol Docs](https://modelcontextprotocol.io)
- [AI Bridge Architecture](architecture.md)
- [Remote Access Guide](remote-access.md)
- [OAuth Gateway](deployment/oauth/gateway.py)
