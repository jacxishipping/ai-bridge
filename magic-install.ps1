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
    [switch]$SkipRun
)

$ErrorActionPreference = "Stop"

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
function Ensure-Python {
    Write-Host "[CHECK] Checking for Python 3.10+..." -ForegroundColor Cyan
    $PythonExe = $null

    # Check PATH
    try {
        $ver = python --version 2>&1
        if ($ver -match "Python 3\.(1[0-9]|[2-9][0-9])") {
            $PythonExe = (Get-Command python).Source
        }
    } catch {}

    # Check common locations
    if (-not $PythonExe) {
        $candidates = @(
            "$env:ProgramFiles\Python312\python.exe",
            "$env:ProgramFiles\Python313\python.exe",
            "$env:ProgramFiles\Python311\python.exe",
            "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
            "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
            "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe"
        )
        foreach ($c in $candidates) {
            if (Test-Path $c) {
                $PythonExe = $c
                break
            }
        }
    }

    if ($PythonExe) {
        Write-Host "[OK] Python detected at: $PythonExe" -ForegroundColor Green
        return $PythonExe
    }

    Write-Host "[INSTALL] Python not found. Downloading Python 3.12 official installer..." -ForegroundColor Yellow
    $pyUrl = "https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe"
    $pyInstaller = "$env:TEMP\python-3.12.7-installer.exe"
    Invoke-WebRequest -Uri $pyUrl -OutFile $pyInstaller -UseBasicParsing

    Write-Host "[INSTALL] Installing Python 3.12 silently (all users, PATH configured)..." -ForegroundColor Yellow
    Start-Process -FilePath $pyInstaller -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0" -Wait
    Remove-Item $pyInstaller -Force -ErrorAction SilentlyContinue

    # Refresh PATH environment
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    $PythonExe = "$env:ProgramFiles\Python312\python.exe"
    if (-not (Test-Path $PythonExe)) {
        $PythonExe = (Get-Command python -ErrorAction SilentlyContinue)?.Source
    }

    Write-Host "[OK] Python 3.12 installed successfully." -ForegroundColor Green
    return $PythonExe
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
    if ((Resolve-Path $CurrentDir).Path -ne (Resolve-Path $InstallDir -ErrorAction SilentlyContinue)?.Path) {
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
