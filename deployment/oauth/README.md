# OAuth gateway for the AI Bridge MCP endpoint

ChatGPT's remote MCP connectors accept OAuth or no authentication, not a
static Bearer token. This gateway adds a minimal OAuth 2.1 authorization
server in front of the Streamable HTTP MCP server so such clients can
connect.

## What it provides

- `/.well-known/oauth-protected-resource` (+ `/mcp` variant)
- `/.well-known/oauth-authorization-server`
- `/oauth/register` — dynamic client registration (public clients, PKCE)
- `/oauth/authorize` — approval page; the admin token is the only
  approval credential (checked once, never stored)
- `/oauth/token` — authorization-code + PKCE (S256) and refresh-token
  grants, with refresh rotation and reuse rejection
- `/oauth/revoke`
- `/internal/verify` — for nginx `auth_request`; accepts OAuth access
  tokens and the admin token. Mark this location `internal` in nginx.

## Run

```bash
# needs fastapi + uvicorn (the ai-bridge venv has both)
AI_BRIDGE_OAUTH_ISSUER=https://your-domain \
AI_BRIDGE_ADMIN_TOKEN=<admin-token> \
python -m uvicorn gateway:app --host 127.0.0.1 --port 8002
```

`AI_BRIDGE_OAUTH_ISSUER` defaults to `https://jxiptvplayer.app`.
Only SHA-256 hashes of codes and tokens are stored (SQLite, next to the
service). Keep the gateway on loopback; expose it only through a TLS
reverse proxy.

## nginx sketch

```nginx
location /.well-known/oauth-protected-resource { proxy_pass http://127.0.0.1:8002; }
location /.well-known/oauth-authorization-server { proxy_pass http://127.0.0.1:8002; }
location /oauth/ { proxy_pass http://127.0.0.1:8002; }
location = /internal/verify {
    internal;
    proxy_pass http://127.0.0.1:8002/internal/verify;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header Authorization $http_authorization;
}
location = /mcp {
    auth_request /internal/verify;
    proxy_pass http://127.0.0.1:8001/mcp;
    # SSE settings: proxy_http_version 1.1, proxy_buffering off,
    # long proxy_read_timeout. Do NOT override the Host header: the
    # MCP server rejects non-local Host values (DNS-rebinding guard).
}
```

## Notes

- The MCP server itself stays on loopback (`127.0.0.1:8001`); only the
  proxy is public, behind TLS.
- The approval page is the only human-facing part: whoever holds the
  admin token can authorize clients. Guard it accordingly.
