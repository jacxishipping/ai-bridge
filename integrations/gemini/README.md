# Gemini / Gemini CLI
Gemini CLI supports MCP servers in `~/.gemini/settings.json`:
```json
{ "mcpServers": { "ai-bridge": {
  "command": "/absolute/path/to/ai-bridge/.venv/bin/python",
  "args": ["-m", "ai_bridge.server"],
  "env": { "AI_BRIDGE_WORKSPACE": "/home/YOUR_USER/ai-bridge-workspace" } } } }
```
The hosted Gemini web app does not run local stdio servers; use a
supported remote-MCP / connector path or Gemini CLI instead.
