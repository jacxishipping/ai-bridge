-- PostgreSQL mirror of the SQLite schema in src/ai_bridge/control/db.py.
-- Run with psql against your production database; the SQLite store is
-- for local dev / single-owner use only.
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, hostname TEXT, os TEXT,
  tenant TEXT NOT NULL DEFAULT 'default', token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline', last_seen DOUBLE PRECISION,
  policy_json TEXT NOT NULL DEFAULT '{}', revoked INTEGER NOT NULL DEFAULT 0,
  created_at DOUBLE PRECISION NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, device_id TEXT NOT NULL, tenant TEXT NOT NULL DEFAULT 'default',
  tool TEXT NOT NULL, args_json TEXT NOT NULL DEFAULT '{}', tier INTEGER,
  status TEXT NOT NULL DEFAULT 'queued', result TEXT DEFAULT '',
  approval_id TEXT, created_at DOUBLE PRECISION NOT NULL, updated_at DOUBLE PRECISION NOT NULL);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, task_id TEXT, tool TEXT, reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending', created_at DOUBLE PRECISION NOT NULL, decided_by TEXT);
CREATE TABLE IF NOT EXISTS audit (
  id SERIAL PRIMARY KEY, ts DOUBLE PRECISION NOT NULL, tenant TEXT,
  actor TEXT, device_id TEXT, tool TEXT, args_json TEXT, decision TEXT, result TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE INDEX IF NOT EXISTS idx_tasks_device_status ON tasks (device_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_ts ON audit (tenant, ts DESC);
