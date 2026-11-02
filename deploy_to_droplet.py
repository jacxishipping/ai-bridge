import urllib.request
import json
import gzip
import base64
import os
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
    with urllib.request.urlopen(req, timeout=60) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        if res.get("isError"):
            raise RuntimeError(f"MCP Error: {res}")
        content_text = res["result"]["content"][0]["text"]
        out = json.loads(content_text)
        return out

def upload_file(local_path, remote_path):
    print(f"Reading {local_path}...")
    with open(local_path, "rb") as f:
        raw_data = f.read()
    
    gz_data = gzip.compress(raw_data)
    b64_str = base64.b64encode(gz_data).decode("ascii")
    print(f"Uploading {local_path} ({len(raw_data)} bytes -> {len(b64_str)} b64 gzip) to {remote_path}...")
    
    # Clean remote temp file
    run_remote_shell("rm -f /tmp/sync_chunk.b64")
    
    # Chunk size: 8000 chars per line
    chunk_size = 8000
    for i in range(0, len(b64_str), chunk_size):
        chunk = b64_str[i:i + chunk_size]
        cmd = f"printf '%s' '{chunk}' >> /tmp/sync_chunk.b64"
        run_remote_shell(cmd)
        
    # Decompress into destination
    py_cmd = f"python3 -c \"import base64, gzip; open('{remote_path}', 'wb').write(gzip.decompress(base64.b64decode(open('/tmp/sync_chunk.b64').read())))\""
    res = run_remote_shell(py_cmd)
    if res.get("returncode") != 0:
        raise RuntimeError(f"Failed to decompress {remote_path}: {res}")
    
    # Verify file size
    verify = run_remote_shell(f"wc -c {remote_path}")
    print(f"Verified: {verify.get('stdout', '').strip()}")

def main():
    files_to_sync = [
        ("apps/dashboard/src/App.tsx", "/opt/ai-bridge/apps/dashboard/src/App.tsx"),
        ("apps/dashboard/src/AiApiHub.tsx", "/opt/ai-bridge/apps/dashboard/src/AiApiHub.tsx"),
        ("apps/dashboard/src/DeviceDetailDashboard.tsx", "/opt/ai-bridge/apps/dashboard/src/DeviceDetailDashboard.tsx"),
        ("apps/dashboard/src/FleetOperations.tsx", "/opt/ai-bridge/apps/dashboard/src/FleetOperations.tsx"),
        ("apps/dashboard/src/LiveDesktopStudio.tsx", "/opt/ai-bridge/apps/dashboard/src/LiveDesktopStudio.tsx"),
        ("apps/dashboard/src/jxui.css", "/opt/ai-bridge/apps/dashboard/src/jxui.css"),
        ("apps/dashboard/src/main.tsx", "/opt/ai-bridge/apps/dashboard/src/main.tsx"),
        ("apps/dashboard/src/tailwind.css", "/opt/ai-bridge/apps/dashboard/src/tailwind.css"),
    ]
    
    for local_p, remote_p in files_to_sync:
        if os.path.exists(local_p):
            upload_file(local_p, remote_p)
        else:
            print(f"Skipping non-existent {local_p}")
            
    print("\n--- Running npm run build on Droplet ---")
    build_res = run_remote_shell("cd /opt/ai-bridge/apps/dashboard && npm run build")
    print("Build output:")
    print(build_res.get("stdout"))
    if build_res.get("stderr"):
        print("Stderr:", build_res.get("stderr"))
        
    if build_res.get("returncode") == 0:
        print("\n--- Reloading Nginx on Droplet ---")
        reload_res = run_remote_shell("systemctl reload nginx")
        print(reload_res.get("stdout"))
        print("\nSUCCESS! Droplet updated and live with authentic JXUI components!")
    else:
        print("\nBuild failed on remote droplet! Check stderr above.")

if __name__ == "__main__":
    main()

