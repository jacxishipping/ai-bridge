from deploy_to_droplet import run_remote_shell

res = run_remote_shell("find / -name control.db 2>/dev/null")
print("Remote control.db locations:", res.get("stdout"))

res2 = run_remote_shell("curl -s -H 'Authorization: Bearer a0f63388f83290e1dec8cdba8a140a2bacfa4e6801d916bd' http://127.0.0.1:8000/api/devices")
print("API devices response:", res2.get("stdout")[:500])

