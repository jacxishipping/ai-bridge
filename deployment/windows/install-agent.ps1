# AI Bridge Windows agent installer (run in an elevated PowerShell, once).
# Installs the agent as a dedicated low-privilege service account task,
# NOT as SYSTEM, and never enables desktop automation by default.
# Usage: .\install-agent.ps1 -ControlUrl http://YOUR_HOST:8000 -DeviceToken <token-from-dashboard>
param([Parameter(Mandatory=$true)][string]$ControlUrl, [Parameter(Mandatory=$true)][string]$DeviceToken)
$ErrorActionPreference = "Stop"
py -3 -m venv "$env:ProgramData\ai-bridge\.venv"
& "$env:ProgramData\ai-bridge\.venv\Scripts\python.exe" -m pip install -e .
# Store the token in the environment of the scheduled task only (not in chat, not in a script).
# Create a scheduled task running as a dedicated user; replace 'ai-bridge' with your service account.
schtasks /create /tn "AI Bridge Agent" /tr "'$env:ProgramData\ai-bridge\.venv\Scripts\python.exe' agents\windows\windows_agent.py" /sc onstart /ru ai-bridge /rl limited /f
Write-Host "Agent scheduled. Set AI_BRIDGE_CONTROL_URL=$ControlUrl and AI_BRIDGE_DEVICE_TOKEN for the ai-bridge account, then start the task."
Write-Host "Desktop automation is a separate interactive helper (agents/windows/desktop_helper.py) and must be started in a logged-in session."
