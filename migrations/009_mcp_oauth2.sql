-- Automated OAuth2 (Client Credentials, PKCE, Refresh Tokens) for outbound MCP servers.
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS auth_type TEXT NOT NULL DEFAULT 'bearer';
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS oauth_client_id TEXT DEFAULT '';
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS oauth_client_secret TEXT DEFAULT '';
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS oauth_auth_url TEXT DEFAULT '';
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS oauth_token_url TEXT DEFAULT '';
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS oauth_scopes TEXT DEFAULT '';
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT DEFAULT '';
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS oauth_token_expires_at REAL;

CREATE TABLE IF NOT EXISTS mcp_oauth_states (
  state TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  created_at REAL NOT NULL
);
