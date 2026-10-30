-- v0.4 Fleet Automation: workflows, telemetry metrics, self-healing triggers, and scheduler.
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tenant TEXT NOT NULL DEFAULT 'default',
  device_id TEXT,
  steps_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  current_step INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL DEFAULT 0,
  results_json TEXT NOT NULL DEFAULT '[]',
  error TEXT DEFAULT '',
  created_at DOUBLE PRECISION NOT NULL,
  updated_at DOUBLE PRECISION NOT NULL,
  completed_at DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS telemetry (
  id SERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  tenant TEXT NOT NULL DEFAULT 'default',
  cpu_percent DOUBLE PRECISION,
  memory_percent DOUBLE PRECISION,
  disk_percent DOUBLE PRECISION,
  recorded_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS triggers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tenant TEXT NOT NULL DEFAULT 'default',
  device_id TEXT,
  metric TEXT NOT NULL,
  operator TEXT NOT NULL DEFAULT '>',
  threshold DOUBLE PRECISION NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'tool',
  action_target TEXT NOT NULL,
  action_args_json TEXT NOT NULL DEFAULT '{}',
  cooldown_seconds INTEGER NOT NULL DEFAULT 300,
  last_triggered_at DOUBLE PRECISION,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tenant TEXT NOT NULL DEFAULT 'default',
  device_id TEXT,
  interval_seconds INTEGER NOT NULL DEFAULT 300,
  tool TEXT NOT NULL,
  args_json TEXT NOT NULL DEFAULT '{}',
  last_run_at DOUBLE PRECISION,
  next_run_at DOUBLE PRECISION NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DOUBLE PRECISION NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_tenant_ts ON workflows(tenant, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry(device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_triggers_tenant ON triggers(tenant, enabled);
CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(enabled, next_run_at);

