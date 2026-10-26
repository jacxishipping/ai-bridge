#!/usr/bin/env bash
# Ubuntu/Debian install for the control plane + Linux agent (see docs/installation-linux.md).
set -euo pipefail

echo "==> Installing system prerequisites..."
sudo apt-get update && sudo apt-get install -y python3 python3-venv git curl

echo "==> Creating ai-bridge service user..."
sudo useradd --system --create-home --shell /usr/sbin/nologin ai-bridge || true

echo "==> Deploying files to /opt/ai-bridge..."
sudo mkdir -p /opt/ai-bridge /etc/ai-bridge /home/ai-bridge/ai-bridge-workspace /var/lib/ai-bridge
sudo cp -r . /opt/ai-bridge/
sudo chmod +x /opt/ai-bridge/deployment/linux/*.sh /opt/ai-bridge/agents/linux/*.sh 2>/dev/null || true
sudo chown -R ai-bridge:ai-bridge /opt/ai-bridge /home/ai-bridge/ai-bridge-workspace /var/lib/ai-bridge

echo "==> Setting up Python virtual environment..."
sudo -u ai-bridge python3 -m venv /opt/ai-bridge/.venv
sudo -u ai-bridge /opt/ai-bridge/.venv/bin/pip install --upgrade pip
sudo -u ai-bridge /opt/ai-bridge/.venv/bin/pip install -e /opt/ai-bridge

echo "==> Installation complete!"
echo ""
echo "To run and manage the Linux agent with the all-in-one wizard:"
echo "  sudo /opt/ai-bridge/deployment/linux/run-agent.sh"
echo ""
echo "Or start as a background service:"
echo "  sudo /opt/ai-bridge/deployment/linux/run-agent.sh start"
echo ""
