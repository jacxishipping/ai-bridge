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

