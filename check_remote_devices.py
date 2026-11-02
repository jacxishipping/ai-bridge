from deploy_to_droplet import run_remote_shell
import json

cmd = """python3 -c '
import sqlite3, json
conn = sqlite3.connect("/root/.ai-bridge/control.db")
conn.row_factory = sqlite3.Row
cur = conn.cursor()
cur.execute("SELECT id, name, token, is_online, last_seen FROM devices")
rows = [dict(r) for r in cur.fetchall()]
print(json.dumps(rows, indent=2))
'"""

res = run_remote_shell(cmd)
print(res.get("stdout"))

