-- External MCP service connectors and per-agent tool/MCP bindings.
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  transport TEXT NOT NULL DEFAULT 'http',
  auth_header TEXT DEFAULT '',
  auth_token TEXT DEFAULT '',
  headers_json TEXT NOT NULL DEFAULT '{}',
  tools_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_checked_at REAL,
  last_error TEXT DEFAULT '',
  tenant TEXT NOT NULL DEFAULT 'default',
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_tenant ON mcp_servers(tenant, enabled);
ALTER TABLE custom_agents ADD COLUMN IF NOT EXISTS allowed_tools_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE custom_agents ADD COLUMN IF NOT EXISTS mcp_server_ids_json TEXT NOT NULL DEFAULT '[]';

