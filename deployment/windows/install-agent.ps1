# AI Bridge Windows agent installer (run in an elevated PowerShell, once).
# Installs the agent as a scheduled task running as a dedicated
# low-privilege user account, NOT as SYSTEM, and never enables desktop
# automation by default.
# Usage: .\install-agent.ps1 -ControlUrl https://your-domain -DeviceToken <token-from-dashboard>
# NOTE: the token is passed on the scheduled task's command line, so it is
# visible to local administrators via the task definition. For a personal
# test machine that is acceptable; for a shared machine, prefer a token
# file readable only by the service account instead.
param([Parameter(Mandatory=$true)][string]$ControlUrl, [Parameter(Mandatory=$true)][string]$DeviceToken)
$ErrorActionPreference = "Stop"
if (-not (Get-LocalUser -Name "ai-bridge" -ErrorAction SilentlyContinue)) {
    Write-Host "Create the 'ai-bridge' local user first (a dedicated low-privilege account), then re-run this script."
    exit 1
}
py -3 -m venv "$env:ProgramData\ai-bridge\.venv"
& "$env:ProgramData\ai-bridge\.venv\Scripts\python.exe" -m pip install -e .
$taskCmd = "'$env:ProgramData\ai-bridge\.venv\Scripts\python.exe' agents\windows\agent_main.py --control-url $ControlUrl --device-token $DeviceToken"
schtasks /create /tn "AI Bridge Agent" /tr $taskCmd /sc onstart /ru ai-bridge /rl limited /f
Write-Host "Agent scheduled. Start it with: schtasks /run /tn 'AI Bridge Agent'"
Write-Host "Desktop automation is a separate interactive helper (agents/windows/desktop_helper.py) and must be started in a logged-in session."
