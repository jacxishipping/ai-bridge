"""Deploy the latest origin/main to AI Bridge on a remote server (Docker stack) over SSH.

Supports DigitalOcean Droplets, AWS EC2, and any Linux server with Docker + Docker Compose.

Usage:
    # DigitalOcean Droplet
    set AI_BRIDGE_SSH_KEY=C:\\path\\to\\do-key.pem
    set AI_BRIDGE_SSH_HOST=ubuntu@your-droplet-ip
    python deploy_to_droplet.py

    # AWS EC2
    set AI_BRIDGE_SSH_KEY=C:\\path\\to\\aws-key.pem
    set AI_BRIDGE_SSH_HOST=ubuntu@ec2-instance
    python deploy_to_droplet.py

    # AWS SSM Session Manager (no public IP needed)
    set AI_BRIDGE_SSM_INSTANCE_ID=i-1234567890abcdef0
    python deploy_to_droplet.py

Environment:
    AI_BRIDGE_SSH_KEY           Path to the SSH private key (required for SSH)
    AI_BRIDGE_SSH_HOST          SSH user@host (default ubuntu@your-server)
    AI_BRIDGE_SSM_INSTANCE_ID   EC2 instance ID for AWS SSM (alternative to SSH)
    AI_BRIDGE_APP_DIR           Target directory (default /opt/ai-bridge)
    AI_BRIDGE_AWS_REGION        AWS region for SSM (default us-east-2)
    AI_BRIDGE_DOMAIN            Public domain for nginx/cert config (default auto)
"""
import os
import subprocess
import sys

KEY = os.environ.get("AI_BRIDGE_SSH_KEY", "")
HOST = os.environ.get("AI_BRIDGE_SSH_HOST", "ubuntu@jxiptvplayer.app")
SSM_INSTANCE_ID = os.environ.get("AI_BRIDGE_SSM_INSTANCE_ID", "")
APP_DIR = os.environ.get("AI_BRIDGE_APP_DIR", "/opt/ai-bridge")
AWS_REGION = os.environ.get("AI_BRIDGE_AWS_REGION", "us-east-2")
COMPOSE = f"sudo docker compose --env-file .env.production -f docker-compose.prod.yml"


def run_remote(step: str, cmd: str) -> None:
    print(f"\n=== {step} ===\n$ {cmd}")
    if SSM_INSTANCE_ID:
        ssm_cmd = [
            "aws", "ssm", "send-command",
            "--instance-ids", SSM_INSTANCE_ID,
            "--document-name", "AWS-RunShellScript",
            "--parameters", f"commands=['cd {APP_DIR} && {cmd}']",
            "--region", AWS_REGION,
            "--output", "text",
        ]
        proc = subprocess.run(ssm_cmd, capture_output=True, text=True, timeout=30)
        if proc.stdout.strip():
            print(proc.stdout.strip())
        if proc.stderr.strip():
            print(proc.stderr.strip(), file=sys.stderr)
        if proc.returncode != 0:
            sys.exit(f"Step '{step}' failed with exit code {proc.returncode}")
    else:
        if not KEY:
            sys.exit("Set AI_BRIDGE_SSH_KEY to the path of your SSH private key, or set AI_BRIDGE_SSM_INSTANCE_ID for AWS SSM.")
        ssh = ["ssh", "-o", "StrictHostKeyChecking=accept-new", "-i", KEY, HOST, f"cd {APP_DIR} && {cmd}"]
        proc = subprocess.run(ssh, capture_output=True, text=True, timeout=1800)
        if proc.stdout.strip():
            print(proc.stdout.strip())
        if proc.stderr.strip():
            print(proc.stderr.strip(), file=sys.stderr)
        if proc.returncode != 0:
            sys.exit(f"Step '{step}' failed with exit code {proc.returncode}")


def main() -> None:
    if not KEY and not SSM_INSTANCE_ID:
        sys.exit("Set AI_BRIDGE_SSH_KEY or AI_BRIDGE_SSM_INSTANCE_ID.")
    run_remote("Pull origin/main", "sudo git pull --ff-only origin main && sudo git log -1 --oneline")
    run_remote("Build image", f"{COMPOSE} build control-api")
    run_remote("Restart app services", f"{COMPOSE} up -d --no-deps control-api mcp-http oauth-gateway")
    run_remote("Recreate nginx (reload config)", f"{COMPOSE} up -d --no-deps --force-recreate nginx")
    run_remote("Status", "sudo docker ps --format '{{.Names}} {{.Status}}'")
    print("\nDeployment finished.")


if __name__ == "__main__":
    main()
