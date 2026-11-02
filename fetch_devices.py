from deploy_to_droplet import run_remote_shell
import json

res = run_remote_shell("curl -s -H 'Authorization: Bearer a0f63388f83290e1dec8cdba8a140a2bacfa4e6801d916bd' http://127.0.0.1:8000/api/devices > /tmp/devices.json && cat /tmp/devices.json")
out = res.get("stdout", "")
try:
    data = json.loads(out)
    print(json.dumps(data, indent=2))
except Exception as e:
    print("Raw output:", out)

