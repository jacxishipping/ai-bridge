"""Deploy the latest origin/main to AI Bridge on AWS EC2.

Supports EC2 instances running Ubuntu with Docker and Docker Compose.
Uses AWS SSM or direct SSH for connectivity.

Usage:
    # Direct SSH (key-based)
    set AI_BRIDGE_SSH_KEY=C:\\path\\to\\aws-key.pem
    set AI_BRIDGE_SSH_HOST=ubuntu@ec2-instance
    set AI_BRIDGE_DOMAIN=app.mydomain.com
    python deploy_to_aws.py

    # AWS SSM Session Manager (no public IP needed)
    set AI_BRIDGE_SSM_INSTANCE_ID=i-1234567890abcdef0
    set AI_BRIDGE_DOMAIN=app.mydomain.com
    python deploy_to_aws.py

    # One-time EC2 bootstrap (first-time setup)
    set AI_BRIDGE_BOOTSTRAP=1
    python deploy_to_aws.py

Environment:
    AI_BRIDGE_SSH_KEY           Path to the EC2 private key (.pem) for SSH
    AI_BRIDGE_SSH_HOST          SSH user@host (default ubuntu@ec2-instance)
    AI_BRIDGE_SSM_INSTANCE_ID   EC2 instance ID for AWS SSM (alternative to SSH)
    AI_BRIDGE_APP_DIR           Target directory (default /opt/ai-bridge)
    AI_BRIDGE_AWS_REGION        AWS region (default us-east-2)
    AI_BRIDGE_DOMAIN            Public domain (e.g. app.mydomain.com)
    AI_BRIDGE_ACM_ARN           ACM certificate ARN for ALB (optional)
    AI_BRIDGE_BOOTSTRAP         Set to 1 for first-time EC2 setup
"""
import os
import subprocess
import sys

KEY = os.environ.get("AI_BRIDGE_SSH_KEY", "")
HOST = os.environ.get("AI_BRIDGE_SSH_HOST", "ubuntu@ec2-instance")
SSM_INSTANCE_ID = os.environ.get("AI_BRIDGE_SSM_INSTANCE_ID", "")
APP_DIR = os.environ.get("AI_BRIDGE_APP_DIR", "/opt/ai-bridge")
AWS_REGION = os.environ.get("AI_BRIDGE_AWS_REGION", "us-east-2")
DOMAIN = os.environ.get("AI_BRIDGE_DOMAIN", "")
BOOTSTRAP = os.environ.get("AI_BRIDGE_BOOTSTRAP", "")
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
            sys.exit("Set AI_BRIDGE_SSH_KEY to the path of your EC2 private key, or set AI_BRIDGE_SSM_INSTANCE_ID for SSM.")
        ssh = ["ssh", "-o", "StrictHostKeyChecking=accept-new", "-i", KEY, HOST, f"cd {APP_DIR} && {cmd}"]
        proc = subprocess.run(ssh, capture_output=True, text=True, timeout=1800)
        if proc.stdout.strip():
            print(proc.stdout.strip())
        if proc.stderr.strip():
            print(proc.stderr.strip(), file=sys.stderr)
        if proc.returncode != 0:
            sys.exit(f"Step '{step}' failed with exit code {proc.returncode}")


def bootstrap_ec2() -> None:
    """First-time setup for a fresh EC2 instance."""
    steps = [
        ("Update system", "sudo apt-get update -qq && sudo apt-get upgrade -y -qq"),
        ("Install Docker", "curl -fsSL https://get.docker.com | sudo bash"),
        ("Install Docker Compose plugin",
         "sudo mkdir -p /usr/local/lib/docker/cli-plugins && "
         "sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m) "
         "-o /usr/local/lib/docker/cli-plugins/docker-compose && sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose"),
        ("Add ubuntu to docker group", "sudo usermod -aG docker ubuntu"),
        ("Clone repo", f"sudo git clone https://github.com/jacxishipping/ai-bridge.git {APP_DIR} && sudo chown -R ubuntu:ubuntu {APP_DIR}"),
        ("Create data dirs",
         f"sudo mkdir -p {APP_DIR}/data {{APP_DIR}}/workspace && sudo chown -R ubuntu:ubuntu {APP_DIR}/data {APP_DIR}/workspace"),
    ]
    for step, cmd in steps:
        run_remote(step, cmd)
    print("\n✅ EC2 bootstrap complete. Set up your .env.production and deploy.")


def main() -> None:
    if not KEY and not SSM_INSTANCE_ID:
        sys.exit("Set AI_BRIDGE_SSH_KEY or AI_BRIDGE_SSM_INSTANCE_ID.")

    if BOOTSTRAP:
        bootstrap_ec2()
        return

    run_remote("Pull origin/main", "sudo git pull --ff-only origin main && sudo git log -1 --oneline")
    run_remote("Build image", f"{COMPOSE} build control-api")
    run_remote("Restart app services", f"{COMPOSE} up -d --no-deps control-api mcp-http oauth-gateway")
    run_remote("Recreate nginx (reload config)", f"{COMPOSE} up -d --no-deps --force-recreate nginx")
    run_remote("Status", "sudo docker ps --format '{{.Names}} {{.Status}}'")
    print("\n✅ AWS EC2 deployment finished.")


if __name__ == "__main__":
    main()
