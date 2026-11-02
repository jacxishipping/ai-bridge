from deploy_to_droplet import run_remote_shell
import json

script = """python3 -c '
import sqlite3, json
conn = sqlite3.connect("/root/.ai-bridge/control.db")
conn.row_factory = sqlite3.Row
cur = conn.cursor()
cur.execute("SELECT id, name, hostname, os, status, is_online, last_seen, token, token_expires_at, revoked FROM devices")
rows = [dict(r) for r in cur.fetchall()]
print(json.dumps(rows, indent=2))
'"""

res = run_remote_shell(script)
print(res.get("stdout"))

