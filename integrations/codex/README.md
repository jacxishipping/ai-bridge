# OpenAI Codex
Codex CLI supports MCP servers in its config (`~/.codex/config.toml`):
```toml
[mcp_servers.ai-bridge]
command = "/absolute/path/to/ai-bridge/.venv/bin/python"
args = ["-m", "ai_bridge.server"]
[ mcp_servers.ai-bridge.env ]
AI_BRIDGE_WORKSPACE = "/home/YOUR_USER/ai-bridge-workspace"
```
Codex then calls the same tools. ChatGPT's web interface does NOT run
local stdio servers; for ChatGPT use the remote Streamable HTTP path
(see integrations/chatgpt/README.md) where your plan supports it.
