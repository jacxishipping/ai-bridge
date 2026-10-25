# AI Bridge Windows agent installer (run in an elevated PowerShell, once).
# Installs the agent as a scheduled task. By default it runs as the
# account you run the installer with (e.g. your main user account).
# Pass -User to run as a different existing account, e.g. a dedicated
# low-privilege 'ai-bridge' user (create it first if you use one).
# Desktop automation is never enabled by default.
# Usage: .\install-agent.ps1 -ControlUrl https://your-domain -DeviceToken <token-from-dashboard>
#        .\install-agent.ps1 -ControlUrl https://your-domain -DeviceToken <token> -User ai-bridge
# NOTE: the token is passed on the scheduled task's command line, so it is
# visible to local administrators via the task definition. For a personal
# machine that is acceptable; for a shared machine, prefer a token
# file readable only by the service account instead.
param([Parameter(Mandatory=$true)][string]$ControlUrl, [Parameter(Mandatory=$true)][string]$DeviceToken, [string]$User = $env:USERNAME)
$ErrorActionPreference = "Stop"
if (-not (Get-LocalUser -Name $User -ErrorAction SilentlyContinue)) {
    Write-Host "User '$User' does not exist. Create it first, or pass an existing account with -User."
    exit 1
}
py -3 -m venv "$env:ProgramData\ai-bridge\.venv"
& "$env:ProgramData\ai-bridge\.venv\Scripts\python.exe" -m pip install -e .
$taskCmd = "'$env:ProgramData\ai-bridge\.venv\Scripts\python.exe' agents\windows\agent_main.py --control-url $ControlUrl --device-token $DeviceToken"
schtasks /create /tn "AI Bridge Agent" /tr $taskCmd /sc onstart /ru $User /rl limited /f
Write-Host "Agent scheduled to run as '$User'. Start it with: schtasks /run /tn 'AI Bridge Agent'"
Write-Host "Desktop automation is a separate interactive helper (agents/windows/desktop_helper.py) and must be started in a logged-in session."
