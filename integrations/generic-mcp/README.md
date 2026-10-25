# Generic MCP client
Any MCP-compatible client that supports stdio servers can use
`mcp-config.json`. For remote clients, run the Streamable HTTP server:
`python -m ai_bridge.server --http --port 8001` (loopback by default;
put TLS + auth in front for any non-local exposure — docs/remote-access.md).
