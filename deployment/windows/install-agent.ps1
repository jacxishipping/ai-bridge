# AI Bridge Windows agent installer (run in an elevated PowerShell, once).
# Installs the agent as a scheduled task. By default it runs as the
# account you run the installer with (e.g. your main user account).
# Pass -User to run as a different existing account, e.g. a dedicated
# low-privilege 'ai-bridge' user (create it first if you use one).
# Desktop automation is never enabled by default.
# Usage: .\install-agent.ps1 -ControlUrl https://your-domain -DeviceToken <token-from-dashboard>
#        .\install-agent.ps1 -ControlUrl https://your-domain -DeviceToken <token> -User ai-bridge
#        .\install-agent.ps1 -Diagnose    (print a support report; installs nothing)
# NOTE: the token is passed on the scheduled task's command line, so it is
# visible to local administrators via the task definition. For a personal
# machine that is acceptable; for a shared machine, prefer a token
# file readable only by the service account instead.
param(
    [string]$ControlUrl = "",
    [string]$DeviceToken = "",
    [string]$User = $env:USERNAME,
    [switch]$Diagnose
)
$ErrorActionPreference = "Stop"

# --- Failure diagnostics -----------------------------------------------------
# Any failure runs the desktop client's headless report, so the operator gets
# platform / token-backend / config / connectivity state instead of only a stack
# trace. Best effort: never throws and never changes the installer's exit code.
function Invoke-AiBridgeDiagnose {
    param([string]$Reason = "Installation failed", [string]$RepoRoot = "", [string]$PythonExe = "")
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        Write-Host ""
        Write-Host "=============== AI Bridge diagnostics ===============" -ForegroundColor Yellow
        Write-Host "Reason: $Reason" -ForegroundColor Yellow

        $roots = @()
        if ($RepoRoot) { $roots += $RepoRoot }
        foreach ($relative in @("..\..", ".")) {
            $resolved = Resolve-Path (Join-Path $PSScriptRoot $relative) -ErrorAction SilentlyContinue
            if ($resolved) { $roots += $resolved.Path }
        }

        $GuiScript = ""
        foreach ($root in $roots) {
            $candidateScript = Join-Path $root "agents\windows\gui_app.py"
            if (Test-Path $candidateScript) { $GuiScript = $candidateScript; break }
        }

        $candidates = @()
        if ($PythonExe) { $candidates += $PythonExe }
        foreach ($root in $roots) {
            $candidates += (Join-Path $root ".venv\Scripts\python.exe")
            $candidates += (Join-Path $root "venv\Scripts\python.exe")
        }
        if ($env:ProgramData) { $candidates += (Join-Path $env:ProgramData "ai-bridge\.venv\Scripts\python.exe") }

        $python = $null
        foreach ($candidate in $candidates) {
            if ($candidate -and (Test-Path $candidate)) { $python = $candidate; break }
        }
        if (-not $python) {
            $onPath = Get-Command python.exe -ErrorAction SilentlyContinue
            if ($onPath) { $python = $onPath.Source }
        }

        if (-not $python) {
            Write-Host "No Python interpreter found, so the report cannot be generated." -ForegroundColor DarkYellow
            return
        }
        if (-not $GuiScript) {
            Write-Host "gui_app.py not found under: $($roots -join ', ')" -ForegroundColor DarkYellow
            Write-Host "Interpreter available at: $python"
            return
        }

        Write-Host "Interpreter: $python"
        Write-Host "Command:     $GuiScript --diagnose"
        $report = & $python $GuiScript --diagnose 2>&1 | Out-String
        if ($report.Trim()) {
            Write-Host $report.Trim()
        } else {
            Write-Host "The diagnose command produced no output (exit code $LASTEXITCODE)." -ForegroundColor DarkYellow
        }
        Write-Host "=====================================================" -ForegroundColor Yellow
    } catch {
        Write-Host "Diagnostics could not be collected: $($_.Exception.Message)" -ForegroundColor DarkYellow
    } finally {
        $ErrorActionPreference = $previousPreference
    }
}

trap {
    Invoke-AiBridgeDiagnose -Reason "install-agent.ps1 failed: $($_.Exception.Message)" -PythonExe $VenvPy
    exit 1
}

# On-demand report: no account, venv or scheduled task is touched.
if ($Diagnose) {
    Invoke-AiBridgeDiagnose -Reason "Requested with -Diagnose; no installation was performed"
    exit 0
}

# Parameters were mandatory while -Diagnose could not be passed alone; validate here
# so the report stays usable on a machine where nothing is installed yet.
if (-not $ControlUrl -or -not $DeviceToken) {
    Write-Host "Both -ControlUrl and -DeviceToken are required (or use -Diagnose alone for a report)." -ForegroundColor Red
    Invoke-AiBridgeDiagnose -Reason "Missing -ControlUrl or -DeviceToken"
    exit 1
}

if (-not (Get-LocalUser -Name $User -ErrorAction SilentlyContinue)) {
    Write-Host "User '$User' does not exist. Create it first, or pass an existing account with -User."
    Invoke-AiBridgeDiagnose -Reason "Requested account '$User' does not exist"
    exit 1
}
py -3 -m venv "$env:ProgramData\ai-bridge\.venv"
# Resolve the repo root from this script's location so the install works
# no matter which folder the installer is launched from, and so the
# scheduled task gets an ABSOLUTE agent path (scheduled tasks do not
# start in the repo folder, so a relative script path fails instantly).
$RepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
Set-Location $RepoRoot
$VenvPy = "$env:ProgramData\ai-bridge\.venv\Scripts\python.exe"
& $VenvPy -m pip install --upgrade pip
$ReqFile = Join-Path $PSScriptRoot "requirements.txt"
if (Test-Path $ReqFile) {
    & $VenvPy -m pip install -r $ReqFile
}
& $VenvPy -m pip install -e .
$AgentPath = Join-Path $RepoRoot "agents\windows\agent_main.py"
$taskCmd = "'$env:ProgramData\ai-bridge\.venv\Scripts\python.exe' '$AgentPath' --control-url $ControlUrl --device-token $DeviceToken"
schtasks /create /tn "AI Bridge Agent" /tr $taskCmd /sc onstart /ru $User /rl limited /f
Write-Host "Agent scheduled to run as '$User'. Start it with: schtasks /run /tn 'AI Bridge Agent'"
Write-Host "Desktop automation is a separate interactive helper (agents/windows/desktop_helper.py) and must be started in a logged-in session."
