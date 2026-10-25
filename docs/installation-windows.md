# Installation — Windows
1. Install Python 3.11+ from python.org (tick "Add to PATH").
2. Copy this repo to e.g. `C:\ai-bridge`.
3. `py -3 -m venv C:\ai-bridge\.venv` then `C:\ai-bridge\.venv\Scripts\pip install -e C:\ai-bridge`.
4. Create a workspace folder, e.g. `C:\Users\YOUR_USER\ai-bridge-workspace`, and set
   `AI_BRIDGE_WORKSPACE` to it in the agent's environment.
5. Choose the account the agent runs as: your own main account (default),
   or a dedicated low-privilege local user (e.g. `ai-bridge`, create it
   first) passed with `-User`.
6. Run `deployment/windows/install-agent.ps1 -ControlUrl <plane-url> -DeviceToken <token>`
   in an elevated PowerShell (token from the dashboard, shown once).
   Add `-User <account>` to run as a different existing account.
7. Logs: check the scheduled task's history and the agent's stdout log;
   the control plane's /api/audit shows every task decision.
8. Desktop automation (optional, separate): start
   `agents/windows/desktop_helper.py` in a LOGGED-IN user session with
   `AI_BRIDGE_DESKTOP_ENABLED=1`. Never run it as SYSTEM — SYSTEM cannot
   see the user's desktop, and this project does not try to bypass that.
9. Remove/revoke: run `deployment/windows/uninstall-agent.ps1`, then
   revoke the device in the dashboard so its token stops working.
Windows agent execution was verified end to end on 2026-10-25
(Windows Server 2025: heartbeat, task dispatch, system-info and
service-status tasks completing); see docs/implementation-status.md.
