CREATE TABLE IF NOT EXISTS device_metadata (
  device_id TEXT PRIMARY KEY,
  group_name TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS task_submissions (
  actor TEXT NOT NULL,
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  task_id TEXT NOT NULL,
  PRIMARY KEY (actor, request_key)
);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_created ON tasks(tenant, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_devices_tenant_name ON devices(tenant, name, id);
