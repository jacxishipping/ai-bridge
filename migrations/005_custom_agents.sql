-- Custom AI agents: each row binds an instruction to a provider and devices.
CREATE TABLE IF NOT EXISTS custom_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  instruction TEXT NOT NULL,
  tenant TEXT NOT NULL DEFAULT 'default',
  provider TEXT NOT NULL DEFAULT 'openai',
  model TEXT,
  base_url TEXT,
  device_ids_json TEXT NOT NULL DEFAULT '[]',
  interval_seconds INTEGER NOT NULL DEFAULT 300,
  enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'idle',
  last_run_at REAL,
  next_run_at REAL NOT NULL,
  last_result TEXT DEFAULT '',
  last_error TEXT DEFAULT '',
  run_count INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  tenant TEXT NOT NULL DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'running',
  started_at REAL NOT NULL,
  finished_at REAL,
  duration_ms INTEGER,
  response TEXT DEFAULT '',
  steps_json TEXT NOT NULL DEFAULT '[]',
  error TEXT DEFAULT '');

CREATE INDEX IF NOT EXISTS idx_custom_agents_due ON custom_agents(enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id, started_at DESC);
