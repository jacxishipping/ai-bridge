# MCP clients
- **Claude / Claude Code**: stdio, see integrations/claude/.
- **Codex CLI**: stdio via config.toml, see integrations/codex/.
- **Gemini CLI**: stdio via settings.json, see integrations/gemini/.
- **Generic MCP apps**: stdio config in integrations/generic-mcp/.
- **ChatGPT web**: no local stdio support. Use remote Streamable HTTP
  where your plan supports remote MCP/developer connectors, behind TLS
  + bearer auth (docs/remote-access.md). See integrations/chatgpt/.
- **Remote HTTP server**: `python -m ai_bridge.server --http --port 8001`
  (binds 127.0.0.1 by default). A bearer-token check in front of it is
  required for any non-loopback exposure; the control plane's admin
  token is the intended credential, enforced by your reverse proxy.
Tool list (stable, versioned in code): system_info, resource usage,
workspace list/read/search/create/edit/move/delete, service status,
logs, processes, disk/memory, Docker, git status/diff, tests, linter,
backup, staging deploy, task submit/status/result/cancel, approvals,
desktop status/screenshot/launch (opt-in), device list/status.
