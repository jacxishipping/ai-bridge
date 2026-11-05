import urllib.request
import json
import time
import sys

MCP_URL = "https://jxiptvplayer.app/mcp"
TOKEN = "a0f63388f83290e1dec8cdba8a140a2bacfa4e6801d916bd"

def run_remote_shell(cmd):
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": "run_shell",
            "arguments": {"command": cmd}
        },
        "id": 1
    }
    req = urllib.request.Request(
        MCP_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json"
        }
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        if res.get("isError"):
            raise RuntimeError(f"MCP Error: {res}")
        content_text = res["result"]["content"][0]["text"]
        out = json.loads(content_text)
        return out

def execute(step_name, cmd):
    print(f"\n=======================================================")
    print(f"STEP: {step_name}")
    print(f"CMD:  {cmd}")
    print(f"=======================================================")
    start = time.time()
    res = run_remote_shell(cmd)
    elapsed = time.time() - start
    print(f"Return code: {res.get('returncode')} ({elapsed:.2f}s)")
    if res.get("stdout"):
        print("STDOUT:\n" + res.get("stdout").strip())
    if res.get("stderr"):
        print("STDERR:\n" + res.get("stderr").strip())
    if res.get("returncode") != 0:
        raise RuntimeError(f"Step '{step_name}' failed with code {res.get('returncode')}")
    return res

def main():
    print("Starting Droplet deployment from origin/main...")
    
    # 1. Git pull / reset to origin/main
    execute("Git Fetch & Reset", "cd /opt/ai-bridge && git fetch origin && git reset --hard origin/main && git clean -fd")
    
    # 2. Check commit hash
    execute("Verify Git Commit", "cd /opt/ai-bridge && git log -n 1 --oneline")
    
    # 3. Update backend in .venv
    execute("Update Python package", "cd /opt/ai-bridge && .venv/bin/pip install -e .")
    
    # 4. Restart backend control service
    execute("Restart AI Bridge Control", "systemctl restart ai-bridge-control")
    time.sleep(2)
    execute("Check Control Service Status", "systemctl is-active ai-bridge-control")
    
    # 5. Build Dashboard
    execute("NPM Install", "cd /opt/ai-bridge/apps/dashboard && npm install --prefer-offline")
    execute("NPM Build", "cd /opt/ai-bridge/apps/dashboard && npm run build")
    
    # 6. Reload Nginx
    execute("Reload Nginx", "systemctl reload nginx")
    
    print("\nDroplet deployment finished successfully!")

if __name__ == "__main__":
    main()
