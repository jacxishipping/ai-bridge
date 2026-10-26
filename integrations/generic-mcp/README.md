# Generic MCP client
Any MCP-compatible client that supports stdio servers can use
`mcp-config.json`. Remote clients can point directly at the hosted MCP endpoint:
```json
{
  "mcpServers": {
    "ai-bridge-remote": {
      "url": "https://jxiptvplayer.app/mcp"
    }
  }
}
```
The hosted endpoint uses OAuth. In your MCP client, add the URL and start
its **Connect** or **Authenticate** flow. Complete the browser approval page
using your Bridge admin token; the gateway uses it for approval and does not
store it. Keep the token out of the MCP config and chat. This requires a client
that supports OAuth for remote Streamable HTTP MCP servers.

If you are self-hosting, run the Streamable HTTP server with
`python -m ai_bridge.server --http --port 8001` (loopback by default;
put TLS + auth in front for any non-local exposure — docs/remote-access.md).
