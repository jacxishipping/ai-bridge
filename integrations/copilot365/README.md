# Microsoft 365 Copilot / Copilot Studio

Microsoft 365 Copilot is a cloud service, so it connects to AI Bridge as a
**remote MCP server** (Streamable HTTP) through **Copilot Studio**. It can
never reach `127.0.0.1`; the endpoint must be public HTTPS (TLS 1.2+).
This is the same path used for ChatGPT (see `integrations/chatgpt/` and
`deployment/oauth/README.md`); nothing Copilot-specific is faked here.

> Not to be confused with `ai_bridge.connectors.microsoft365`, which is the
> opposite direction: AI Bridge calling Microsoft Graph (mail, calendar,
> OneDrive). Both can be used together.

## 1. Expose the bridge

1. Run the MCP server: `python -m ai_bridge.server --http --port 8001`
   (loopback only).
2. Run the OAuth gateway (`deployment/oauth/gateway.py`, port 8002) with
   `AI_BRIDGE_OAUTH_ISSUER=https://your-domain` and `AI_BRIDGE_ADMIN_TOKEN`.
3. Put both behind a TLS reverse proxy (see the nginx sketch in
   `deployment/oauth/README.md`; `/internal/verify` stays `internal`).

Verify from outside your network (non-mutating, no credentials):

```bash
python deployment/copilot_smoke_check.py https://your-domain
```

The gateway supports dynamic client registration, authorization code + PKCE
(S256) and refresh-token rotation, which is what Copilot Studio's
*Dynamic discovery* OAuth mode uses.

## 2. Add it in Copilot Studio

1. Open your agent, then Settings and turn on **Generative orchestration**.
2. **Tools** > **Add a tool** > **New tool** > **Model Context Protocol**.
3. Server name: `AI Bridge`. Description: say what it does (computer and
   fleet control for authorized devices); the orchestrator uses this to
   decide when to call it.
4. Server URL: `https://your-domain/mcp`.
5. Authentication: **OAuth 2.0**, **Dynamic discovery**. If you pick
   *Manual* instead, use the endpoints from
   `/.well-known/oauth-authorization-server`, scope `mcp`, and the client ID
   and secret you get from `POST /oauth/register`.
6. When prompted, create the connection. You are sent to the gateway's
   approval page; enter the **admin token** there (checked once, never
   stored). Optionally bind the connection to one device.
7. Publish the agent to Microsoft 365 Copilot (Channels).

If registration fails, check that the redirect URI Copilot Studio shows is
`https`; the gateway accepts any `https` redirect URI.

## Safety model (unchanged)

Copilot gets exactly the tools and policy limits every other client gets:
risk tiers, path confinement, per-device binding, and human approval for
Tier 4. Tier 3/4 tools stay disabled unless an admin opts in
(`AI_BRIDGE_ALLOW_TIER3`). Revoke access at any time via `/oauth/revoke` or
by deleting the connection in Copilot Studio.

## Status

Written from Microsoft's documented MCP onboarding flow. **Not yet tested
against a live Copilot Studio tenant**; the Copilot Studio UI labels may
differ slightly.
