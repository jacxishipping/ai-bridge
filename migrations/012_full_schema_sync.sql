-- Synchronize full control-plane schema for both PostgreSQL and SQLite deployments.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS capabilities_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS mtls_fingerprint TEXT;

ALTER TABLE audit ADD COLUMN IF NOT EXISTS prev_hash TEXT;
ALTER TABLE audit ADD COLUMN IF NOT EXISTS entry_hash TEXT;

CREATE TABLE IF NOT EXISTS device_metadata (
  device_id TEXT PRIMARY KEY,
  group_name TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  event TEXT NOT NULL,
  detail_json TEXT,
  created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, created_at);

CREATE TABLE IF NOT EXISTS agent_memory_chunks (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  tenant TEXT NOT NULL DEFAULT 'default',
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  project_tag TEXT,
  task_tag TEXT,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent ON agent_memory_chunks(agent_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_agent_memory_tags ON agent_memory_chunks(agent_id, project_tag, task_tag);

CREATE TABLE IF NOT EXISTS workflow_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  steps_json TEXT NOT NULL DEFAULT '[]',
  tenant TEXT NOT NULL DEFAULT 'default',
  created_by TEXT DEFAULT 'admin',
  created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_deliveries (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT DEFAULT '',
  created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_ts ON alert_deliveries(created_at DESC);
