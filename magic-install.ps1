# ==============================================================================
#  AI Bridge — Universal Magic Installer & Environment Provisioner (Windows)
# ==============================================================================
#  Single-command bootstrap for completely fresh Windows Server or Desktop systems.
#  - Detects Windows version & Architecture (x64 / ARM64)
#  - Auto-elevates to Administrator
#  - Checks and silently installs Python 3.12 (with pip & PATH) if missing
#  - Checks and silently installs Git for Windows if missing
#  - Provisions isolated Python virtual environment (.venv)
#  - Installs all Windows acceleration & screen capture packages (BetterCam, PyWin32)
#  - Auto-enrolls agent with Control Plane (https://jxiptvplayer.app)
#  - Sets up automatic Windows startup (Task Scheduler / Startup)
#  - Starts the agent and verifies connection
#
#  Usage (PowerShell):
#    irm https://raw.githubusercontent.com/jacxishipping/ai-bridge/main/magic-install.ps1 | iex
#    Or locally: .\magic-install.ps1 -ControlUrl "https://jxiptvplayer.app"
#    Support report without installing anything: .\magic-install.ps1 -Diagnose
# ==============================================================================

[CmdletBinding()]
param(
    [string]$ControlUrl = "https://jxiptvplayer.app",
    [string]$AdminToken = "",
    [string]$DeviceToken = "",
    [string]$DeviceName = "",
    [string]$InstallDir = "C:\AIBridge",
    [switch]$Unattended,
    [switch]$NoAutoStart,
    [switch]$Diagnose,
    [switch]$SkipRun
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
    Invoke-AiBridgeDiagnose -Reason "magic-install.ps1 failed: $($_.Exception.Message)" -RepoRoot $InstallDir -PythonExe $PythonBin
    exit 1
}

# On-demand report: runs before elevation, so it works unelevated and changes nothing.
if ($Diagnose) {
    Invoke-AiBridgeDiagnose -Reason "Requested with -Diagnose; no installation was performed" -RepoRoot $InstallDir
    exit 0
}

# --- Elevation Check ---
$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $IsAdmin) {
    Write-Host "[INFO] Requesting Administrator elevation..." -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -NoProfile -File `"$PSCommandPath`""
    exit 0
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "   ⚡ AI Bridge Universal Windows Magic Bootstrap & Provisioner       " -ForegroundColor White
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Detect System ---
$OS = Get-CimInstance Win32_OperatingSystem
$Arch = [System.Environment]::GetEnvironmentVariable("PROCESSOR_ARCHITECTURE")
Write-Host "[INFO] Detected OS: $($OS.Caption) ($Arch)" -ForegroundColor Cyan
Write-Host "[INFO] Target Install Directory: $InstallDir" -ForegroundColor Cyan

# --- 2. Check / Install Python ---
# Only 3.12-3.14 are exercised with the Windows agent, so pick a tested minor
# explicitly: 'py -3' resolves to the newest installed build (3.15 here) and
# would silently provision an untested interpreter.
$SupportedPythons = @("3.12", "3.13", "3.14")

function Get-PythonMinor {
    param([string]$Exe, [string[]]$Prefix = @())
    try {
        $probe = @()
        if ($Prefix) { $probe += $Prefix }
        $probe += @("-c", "import sys; print('%d.%d' % sys.version_info[:2])")
        $out = & $Exe @probe 2>$null
        if ($LASTEXITCODE -eq 0 -and $out) {
            $line = @($out | Where-Object { $_ } | Select-Object -Last 1)
            if ($line.Count -gt 0) { return $line[0].ToString().Trim() }
        }
    } catch { }
    return $null
}

function Get-DetectedPythonMinors {
    $seen = @()
    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($launcher) {
        try {
            foreach ($line in (& $launcher.Source -0 2>$null)) {
                if ($line -match '-V:(\d+\.\d+)') { $seen += $Matches[1] }
            }
        } catch { }
    }
    return $seen
}

function Find-SupportedPython {
    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    foreach ($minor in $SupportedPythons) {
        if ($launcher) {
            $probe = @("-$minor", "-c", "import sys; print('%d.%d' % sys.version_info[:2]); print(sys.executable)")
            $out = & $launcher.Source @probe 2>$null
            if ($LASTEXITCODE -eq 0 -and $out) {
                $lines = @($out | Where-Object { $_ })
                if ($lines.Count -ge 2 -and $lines[0].ToString().Trim() -eq $minor) {
                    return [pscustomobject]@{ Minor = $minor; Path = $lines[-1].ToString().Trim() }
                }
            }
        }
        $tag = "Python" + ($minor -replace '\.', '')
        $candidates = @()
        if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles "$tag\python.exe") }
        if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA "Programs\Python\$tag\python.exe") }
        foreach ($exe in $candidates) {
            if ((Test-Path $exe) -and ((Get-PythonMinor -Exe $exe) -eq $minor)) {
                return [pscustomobject]@{ Minor = $minor; Path = $exe }
            }
        }
    }
    foreach ($name in @("python.exe", "python3.exe")) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) {
            $minor = Get-PythonMinor -Exe $cmd.Source
            if ($SupportedPythons -contains $minor) {
                return [pscustomobject]@{ Minor = $minor; Path = $cmd.Source }
            }
        }
    }
    return $null
}

function Ensure-Python {
    Write-Host "[CHECK] Checking for a supported Python (3.12, 3.13 or 3.14)..." -ForegroundColor Cyan
    $found = Find-SupportedPython
    if ($found) {
        Write-Host "[OK] Python $($found.Minor) detected at: $($found.Path)" -ForegroundColor Green
        return $found.Path
    }

    # Nothing supported on this machine: install 3.12, a tested build. A newer
    # interpreter that happens to be present is deliberately not used.
    Write-Host "[INSTALL] No supported Python found. Downloading Python 3.12 official installer..." -ForegroundColor Yellow
    $installError = ""
    try {
        $pyUrl = "https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe"
        $pyInstaller = "$env:TEMP\python-3.12.7-installer.exe"
        Invoke-WebRequest -Uri $pyUrl -OutFile $pyInstaller -UseBasicParsing
        Write-Host "[INSTALL] Installing Python 3.12 silently (all users, PATH configured)..." -ForegroundColor Yellow
        Start-Process -FilePath $pyInstaller -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0" -Wait
        Remove-Item $pyInstaller -Force -ErrorAction SilentlyContinue
        # Refresh PATH environment
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    } catch {
        $installError = $_.Exception.Message
    }

    $found = Find-SupportedPython
    if ($found) {
        Write-Host "[OK] Python $($found.Minor) installed at: $($found.Path)" -ForegroundColor Green
        return $found.Path
    }

    $seen = Get-DetectedPythonMinors
    $seenText = if ($seen.Count -gt 0) { $seen -join ", " } else { "none detected" }
    Write-Host "[FAIL] No supported Python interpreter (3.12, 3.13 or 3.14) is available." -ForegroundColor Red
    Write-Host "       Installed versions seen: $seenText" -ForegroundColor Red
    Write-Host "       'py -3' would silently pick the newest build, which is not tested, so this refuses to guess." -ForegroundColor Red
    Write-Host "       Install Python 3.12 from https://www.python.org/downloads/windows/ and rerun." -ForegroundColor Red
    if ($installError) {
        Write-Host "       Automatic install failed: $installError" -ForegroundColor Red
    }
    Invoke-AiBridgeDiagnose -Reason "No supported Python (3.12-3.14) found; installed: $seenText" -RepoRoot $InstallDir
    exit 1
}

# --- 3. Check / Install Git ---
function Ensure-Git {
    Write-Host "[CHECK] Checking for Git..." -ForegroundColor Cyan
    if (Get-Command git -ErrorAction SilentlyContinue) {
        Write-Host "[OK] Git detected." -ForegroundColor Green
        return
    }

    Write-Host "[INSTALL] Git not found. Attempting installation via winget..." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements --silent
    } else {
        Write-Host "[INSTALL] Downloading Git for Windows installer..." -ForegroundColor Yellow
        $gitUrl = "https://github.com/git-for-windows/git/releases/download/v2.47.0.windows.2/Git-2.47.0.2-64-bit.exe"
        $gitInstaller = "$env:TEMP\git-installer.exe"
        Invoke-WebRequest -Uri $gitUrl -OutFile $gitInstaller -UseBasicParsing
        Start-Process -FilePath $gitInstaller -ArgumentList "/VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS" -Wait
        Remove-Item $gitInstaller -Force -ErrorAction SilentlyContinue
    }

    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    Write-Host "[OK] Git installed." -ForegroundColor Green
}

$PythonBin = Ensure-Python
Ensure-Git

# --- 4. Deploy Codebase ---
Write-Host "[PROVISION] Deploying AI Bridge codebase to $InstallDir..." -ForegroundColor Cyan
$CurrentDir = $PSScriptRoot
if ((Test-Path "$CurrentDir\pyproject.toml") -and (Test-Path "$CurrentDir\src\ai_bridge")) {
    $installResolved = Resolve-Path $InstallDir -ErrorAction SilentlyContinue
    if (-not $installResolved -or (Resolve-Path $CurrentDir).Path -ne $installResolved.Path) {
        New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
        Copy-Item -Path "$CurrentDir\*" -Destination $InstallDir -Recurse -Force
    }
} elseif (-not (Test-Path "$InstallDir\pyproject.toml")) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    git clone "https://github.com/jacxishipping/ai-bridge.git" $InstallDir
} else {
    Set-Location $InstallDir
    git fetch origin main 2>$null
    git reset --hard origin/main 2>$null
}

Set-Location $InstallDir

# --- 5. Virtual Environment & Packages ---
Write-Host "[PROVISION] Setting up Python virtual environment (.venv)..." -ForegroundColor Cyan
$VenvDir = Join-Path $InstallDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    & $PythonBin -m venv $VenvDir
}

Write-Host "[PROVISION] Installing AI Bridge & Windows acceleration packages..." -ForegroundColor Cyan
& $VenvPython -m pip install --upgrade pip wheel setuptools --quiet
& $VenvPython -m pip install -e . --quiet
if (Test-Path "requirements-windows.txt") {
    & $VenvPython -m pip install -r requirements-windows.txt --quiet
}

# --- 6. Enrollment & Configuration ---
$ConfigDir = "$env:ProgramData\AIBridge"
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
$ConfigFile = Join-Path $ConfigDir "agent.env"

if (-not $DeviceName) {
    $DeviceName = $env:COMPUTERNAME
}

if ($AdminToken -and -not $DeviceToken) {
    Write-Host "[ENROLL] Enrolling device '$DeviceName' with $ControlUrl..." -ForegroundColor Cyan
    $body = @{
        name = $DeviceName
        hostname = $env:COMPUTERNAME
        os = "Windows ($($OS.Caption))"
    } | ConvertTo-Json

    try {
        $resp = Invoke-RestMethod -Uri "$($ControlUrl.TrimEnd('/'))/api/devices/enroll" `
            -Method POST -Body $body -ContentType "application/json" `
            -Headers @{ "X-Admin-Token" = $AdminToken } -TimeoutSec 15
        if ($resp.device_token) {
            $DeviceToken = $resp.device_token
            Write-Host "[OK] Enrolled successfully. Device ID: $($resp.device_id)" -ForegroundColor Green
        }
    } catch {
        Write-Host "[WARN] Enrollment call failed: $_" -ForegroundColor Yellow
        Invoke-AiBridgeDiagnose -Reason "Device enrollment failed: $($_.Exception.Message)" -RepoRoot $InstallDir
    }
}

if (-not $DeviceToken -and -not $Unattended) {
    Write-Host ""
    $DeviceToken = Read-Host "Enter AI Bridge Device Token (or press Enter to configure later)"
}

$envContent = @"
AI_BRIDGE_CONTROL_URL=$ControlUrl
AI_BRIDGE_DEVICE_TOKEN=$DeviceToken
AI_BRIDGE_WORKSPACE=$InstallDir\workspace
"@
Set-Content -Path $ConfigFile -Value $envContent -Force
New-Item -ItemType Directory -Force -Path "$InstallDir\workspace" | Out-Null

# --- 7. Auto-Start Setup ---
if (-not $NoAutoStart) {
    Write-Host "[SERVICE] Registering Windows Scheduled Task for boot startup..." -ForegroundColor Cyan
    $taskName = "AIBridgeAgent"
    $action = New-ScheduledTaskAction -Execute $VenvPython -Argument "agents\windows\agent_main.py run" -WorkingDirectory $InstallDir
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)

    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
    Write-Host "[OK] Task '$taskName' registered to run on boot as SYSTEM." -ForegroundColor Green
}

# --- 8. Start Agent ---
if (-not $SkipRun) {
    Write-Host "[START] Launching AI Bridge Windows Agent in background..." -ForegroundColor Cyan
    Start-ScheduledTask -TaskName "AIBridgeAgent" -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "  ✨ AI Bridge Windows Magic Installation Completed Successfully! ✨   " -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host " Control Plane:  $ControlUrl"
Write-Host " Install Dir:    $InstallDir"
Write-Host " Python Bin:     $VenvPython"
Write-Host " Config File:    $ConfigFile"
Write-Host " Auto-Start:     Windows Scheduled Task (AIBridgeAgent)"
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host ""

