#!/usr/bin/env bash
# Ubuntu/Debian install for the control plane + Linux agent (see docs/installation-linux.md).
set -euo pipefail
sudo apt-get update && sudo apt-get install -y python3 python3-venv git
sudo useradd --system --create-home --shell /usr/sbin/nologin ai-bridge || true
sudo mkdir -p /opt/ai-bridge /etc/ai-bridge
sudo cp -r . /opt/ai-bridge/
sudo chown -R ai-bridge:ai-bridge /opt/ai-bridge
sudo -u ai-bridge python3 -m venv /opt/ai-bridge/.venv
sudo -u ai-bridge /opt/ai-bridge/.venv/bin/pip install -e /opt/ai-bridge
echo "Next: copy .env.example to /etc/ai-bridge/control.env, set AI_BRIDGE_ADMIN_TOKEN, then:"
echo "  sudo cp deployment/systemd/*.service /etc/systemd/system/ && sudo systemctl daemon-reload"
echo "  sudo systemctl enable --now ai-bridge-control ai-bridge-agent"
