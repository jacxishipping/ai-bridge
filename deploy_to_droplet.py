"""Deploy the latest origin/main to the AI Bridge server (Docker stack) over SSH.

Usage:
    set AI_BRIDGE_SSH_KEY=C:\\path\\to\\key.pem
    python deploy_to_droplet.py

Environment:
    AI_BRIDGE_SSH_KEY   path to the private key (required)
    AI_BRIDGE_SSH_HOST  default ubuntu@18.188.153.166
    AI_BRIDGE_APP_DIR   default /opt/ai-bridge
"""
import os
import subprocess
import sys

KEY = os.environ.get("AI_BRIDGE_SSH_KEY", "")
HOST = os.environ.get("AI_BRIDGE_SSH_HOST", "ubuntu@18.188.153.166")
APP_DIR = os.environ.get("AI_BRIDGE_APP_DIR", "/opt/ai-bridge")
COMPOSE = f"sudo docker compose --env-file .env.production -f docker-compose.prod.yml"


def run_remote(step: str, cmd: str) -> None:
    print(f"\n=== {step} ===\n$ {cmd}")
    ssh = ["ssh", "-o", "StrictHostKeyChecking=accept-new", "-i", KEY, HOST, f"cd {APP_DIR} && {cmd}"]
    proc = subprocess.run(ssh, capture_output=True, text=True, timeout=1800)
    if proc.stdout.strip():
        print(proc.stdout.strip())
    if proc.stderr.strip():
        print(proc.stderr.strip(), file=sys.stderr)
    if proc.returncode != 0:
        sys.exit(f"Step '{step}' failed with exit code {proc.returncode}")


def main() -> None:
    if not KEY:
        sys.exit("Set AI_BRIDGE_SSH_KEY to the path of your SSH private key.")
    run_remote("Pull origin/main", "sudo git pull --ff-only origin main && sudo git log -1 --oneline")
    run_remote("Build image", f"{COMPOSE} build control-api")
    run_remote("Restart app services", f"{COMPOSE} up -d --no-deps control-api mcp-http oauth-gateway")
    run_remote("Recreate nginx (reload config)", f"{COMPOSE} up -d --no-deps --force-recreate nginx")
    run_remote("Status", "sudo docker ps --format '{{.Names}} {{.Status}}'")
    print("\nDeployment finished.")


if __name__ == "__main__":
    main()
