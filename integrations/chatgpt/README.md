# ChatGPT
ChatGPT's consumer web interface does not run a local stdio MCP server
on your machine. Supported paths, in order of preference:
1. **Remote MCP (Streamable HTTP)** — where your ChatGPT plan/workspace
   supports remote MCP servers / developer mode connectors, point it at
   your control plane's Streamable HTTP endpoint behind TLS with a
   bearer token (see docs/remote-access.md). This is the honest,
   supported route; do not paste secrets into chat.
2. **ChatGPT desktop / API applications that support MCP** — use the
   generic stdio config in integrations/generic-mcp/ where the app
   documents MCP support.
3. **Codex CLI** — for coding work, use integrations/codex/ instead.
Any guide claiming ChatGPT web can directly run local stdio MCP is
incorrect; this project does not fake that integration.
