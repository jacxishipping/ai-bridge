# Installation & Management — Linux Agent & Control Plane

## Fast Track: All-in-One Linux Agent Runner (A to Z)

To set up, enroll, and manage an **AI Bridge Linux Agent** on any Debian/Ubuntu, RHEL/Rocky, Fedora, or Arch Linux machine:

```bash
# 1. Clone repository (or download run-agent.sh)
git clone https://github.com/jacxishipping/ai-bridge.git
cd ai-bridge

# 2. Make executable and launch the interactive manager wizard
chmod +x deployment/linux/run-agent.sh
./deployment/linux/run-agent.sh
```

The script will automatically:
- Detect your Linux distribution and install any missing dependencies (`python3`, `python3-venv`, `curl`, `git`).
- Set up a dedicated Python virtual environment and install the required packages.
- Prompt for the Control Plane URL (defaults to `https://jxiptvplayer.app`).
- Guide you through automatic device enrollment via Admin Token or manual Device Token.
- Test and verify the device token against `/api/agent/whoami`.
- Save the configuration securely in `/etc/ai-bridge/agent.env` (or `~/.ai-bridge/agent.env`).
- Give you the choice to run the agent interactively in the foreground or as a managed systemd background service.

---

### Non-Interactive Zero-Touch Provisioning (Headless CI/CD / Bootstrap)

You can enroll and launch the background systemd service in a single command without prompts:

```bash
sudo ./deployment/linux/run-agent.sh \
  --control-url https://jxiptvplayer.app \
  --admin-token <YOUR_ADMIN_TOKEN> \
  --name "production-linux-01" \
  --daemon \
  --yes
```

---

### Agent Management Commands

| Command | Description |
|---|---|
| `./deployment/linux/run-agent.sh run` | Run the agent in foreground with live stdout |
| `./deployment/linux/run-agent.sh start` | Start the systemd background service |
| `./deployment/linux/run-agent.sh stop` | Stop the background service |
| `./deployment/linux/run-agent.sh restart` | Restart the background service |
| `./deployment/linux/run-agent.sh status` | Show service status, PID, control plane health, and authenticated device identity |
| `./deployment/linux/run-agent.sh logs` | Tail live systemd journal logs (`-f`) |
| `./deployment/linux/run-agent.sh whoami` | Verify token authorization and connectivity |
| `./deployment/linux/run-agent.sh rotate-token` | Rotate device authentication token |
| `./deployment/linux/run-agent.sh update` | Git pull latest code, update virtual environment, and restart |
| `./deployment/linux/run-agent.sh uninstall` | Stop service, remove systemd unit, and clean up |

---

## Control Plane Installation (Server Host)

If you are setting up the central **AI Bridge Control Plane** on a server:

1. **Prerequisites & Clone**:
   ```bash
   git clone https://github.com/jacxishipping/ai-bridge.git /opt/ai-bridge
   cd /opt/ai-bridge
   sudo ./deployment/linux/install.sh
   ```

2. **Configure Control Plane**:
   ```bash
   sudo cp .env.example /etc/ai-bridge/control.env
   # Generate admin token
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
   # Edit /etc/ai-bridge/control.env and set AI_BRIDGE_ADMIN_TOKEN
   sudo chmod 600 /etc/ai-bridge/control.env
   ```

3. **Systemd Services**:
   ```bash
   sudo cp deployment/systemd/*.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now ai-bridge-control
   ```

4. **Verify Health**:
   ```bash
   curl http://127.0.0.1:8000/health
   ```
