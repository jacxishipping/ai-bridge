# Operations
- Health: `GET /health` on the plane; `GET /api/devices` shows online/offline.
- Logs: `journalctl -u ai-bridge-*`; audit via `GET /api/audit`.
- Emergency stop: dashboard button or `POST /api/emergency-stop` (admin
  token). Clears with `POST /api/emergency-stop/clear`. While active,
  new tasks are rejected (403) and agents report `emergency_stop: true`.
- Upgrades: `git fetch --tags && git checkout vX.Y.Z`, reinstall the venv,
  restart services, re-run `pytest -q`. Roll back the same way to the
  previous tag; the SQLite/Postgres schema is additive in v0.2.
- Backups: workspace backups live in `<workspace>/.ai-bridge-backups/`
  (timestamped ZIPs). Copy them off-device; also back up `control.db`
  (or `pg_dump ai_bridge`) nightly.
- Rate limiting: 120 req/min per token/IP in-process. For production,
  add proxy-level limiting and per-tenant quotas.
