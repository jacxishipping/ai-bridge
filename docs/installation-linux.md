# Installation — Ubuntu/Debian Linux
1. Prerequisites: `sudo apt-get update && sudo apt-get install -y python3 python3-venv git`
2. Clone/copy this repo to `/opt/ai-bridge` (or run `deployment/linux/install.sh`).
3. Create the service account: `sudo useradd --system --create-home --shell /usr/sbin/nologin ai-bridge`
4. Virtualenv + install: `sudo -u ai-bridge python3 -m venv /opt/ai-bridge/.venv && sudo -u ai-bridge /opt/ai-bridge/.venv/bin/pip install -e /opt/ai-bridge`
5. Configure: copy `.env.example` to `/etc/ai-bridge/control.env` and
   `/etc/ai-bridge/agent.env`, set `AI_BRIDGE_ADMIN_TOKEN` (generate with
   `python -c "import secrets; print(secrets.token_urlsafe(32))"`), set
   `AI_BRIDGE_WORKSPACE=/home/ai-bridge/ai-bridge-workspace`, `chmod 600` both files.
6. Database: SQLite is created automatically at `~/.ai-bridge/control.db`.
   For Postgres, run `migrations/001_initial.sql` and point the deployment
   at it (see docs/operations.md).
7. systemd: `sudo cp deployment/systemd/*.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now ai-bridge-control ai-bridge-agent`
8. Firewall: allow only the reverse-proxy port (443) inbound; keep 8000/8001 on loopback.
9. TLS/reverse proxy: see docs/remote-access.md (nginx + certbot example).
10. Enroll a device: open the dashboard (or `POST /api/devices/enroll` with
    the admin token), copy the one-time device token, put it in the
    agent's env file, restart the agent.
11. MCP client: point your client at the stdio config in
    integrations/generic-mcp/mcp-config.json (replace paths).
12. Health: `curl http://127.0.0.1:8000/health` and `pytest -q` from the repo.
13. Logs: `journalctl -u ai-bridge-agent -f` / `journalctl -u ai-bridge-control -f`.
14. Upgrade/rollback: pull the new tag, reinstall, restart; roll back by
    checking out the previous tag and restarting (docs/operations.md).
15. Backup/recovery: back up `/home/ai-bridge/ai-bridge-workspace/.ai-bridge-backups/`
    and `~/.ai-bridge/control.db` (or the Postgres dump) regularly.
