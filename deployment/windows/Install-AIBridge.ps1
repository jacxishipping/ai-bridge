# ==============================================================================
# AI Bridge Windows Agent — Complete Standalone All-In-One Installer
# ==============================================================================
# Installs all required packages, runtime dependencies, creates shortcuts,
# configures credentials, and sets up Windows auto-start.
#
# Usage (Unattended / Scripted):
#   powershell -ExecutionPolicy Bypass -File .\Install-AIBridge.ps1 -ControlUrl "https://jxiptvplayer.app" -DeviceToken "YOUR_TOKEN" -AutoStart -CreateShortcuts
#
# Usage (Interactive GUI):
#   powershell -ExecutionPolicy Bypass -File .\Install-AIBridge.ps1
#   (or double-click Setup.bat)
# ==============================================================================

[CmdletBinding()]
param(
    [string]$ControlUrl = "https://jxiptvplayer.app",
    [string]$DeviceToken = "",
    [string]$InstallDir = "",
    [switch]$AutoStart,
    [switch]$CreateShortcuts,
    [switch]$NoGui,
    [switch]$HeadlessService,
    [switch]$SkipPackageInstall,
    [switch]$LaunchAfterInstall,
    [switch]$Silent
)

$ErrorActionPreference = "Stop"

# Resolve Repository Root
$RepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
if (-not $InstallDir) {
    $InstallDir = $RepoRoot
}

function Write-Badge {
    param([string]$Badge, [string]$Message, [string]$Color = "Cyan")
    Write-Host "[$Badge] " -ForegroundColor $Color -NoNewline
    Write-Host $Message
}

function Write-Header {
    Write-Host ""
    Write-Host "=====================================================================" -ForegroundColor Cyan
    Write-Host "         AI Bridge — Complete Windows Agent Installer                " -ForegroundColor White
    Write-Host "=====================================================================" -ForegroundColor Cyan
    Write-Host " Repository Root: $RepoRoot"
    Write-Host " Install Target:  $InstallDir"
    Write-Host " Control Server:  $ControlUrl"
    Write-Host "=====================================================================" -ForegroundColor DarkGray
    Write-Host ""
}

# If run interactively with no token and not suppressed, launch the GUI installer wizard
if (-not $Silent -and -not $NoGui -and -not $DeviceToken -and [Environment]::UserInteractive) {
    Write-Host "Launching graphical Fluent 2 setup wizard..." -ForegroundColor Cyan
    $GuiInstaller = Join-Path $PSScriptRoot "installer_gui.py"
    if (Test-Path $GuiInstaller) {
        # Check if Python is available to launch GUI
        $PyCmd = Get-Command pythonw.exe -ErrorAction SilentlyContinue
        if (-not $PyCmd) { $PyCmd = Get-Command python.exe -ErrorAction SilentlyContinue }
        if ($PyCmd) {
            Start-Process -FilePath $PyCmd.Source -ArgumentList "`"$GuiInstaller`""
            exit 0
        }
    }
}

Write-Header

# ------------------------------------------------------------------------------
# STEP 1: Verify / Provision Python Runtime (3.11+)
# ------------------------------------------------------------------------------
Write-Badge "1/6" "Detecting Python Runtime (Python 3.11+ required)..." "Cyan"

$PythonExe = $null

# Check current python in PATH
$CheckExe = Get-Command python.exe -ErrorAction SilentlyContinue
if ($CheckExe) {
    try {
        $VerOutput = & $CheckExe.Source -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        $Parts = $VerOutput.Split('.')
        if ([int]$Parts[0] -ge 3 -and [int]$Parts[1] -ge 11) {
            $PythonExe = $CheckExe.Source
            Write-Badge "OK" "Found compatible Python $VerOutput at $PythonExe" "Green"
        }
    } catch {}
}

# Check py launcher
if (-not $PythonExe) {
    $PyLauncher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($PyLauncher) {
        try {
            $PathFromPy = & $PyLauncher.Source -3.11 -c "import sys; print(sys.executable)" 2>$null
            if ($PathFromPy -and (Test-Path $PathFromPy)) {
                $PythonExe = $PathFromPy
                Write-Badge "OK" "Found Python via py launcher: $PythonExe" "Green"
            }
        } catch {}
    }
}

# Check standard installation directories
if (-not $PythonExe) {
    $CandidateDirs = @(
        "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "C:\Python313\python.exe",
        "C:\Python312\python.exe",
        "C:\Python311\python.exe",
        "C:\Program Files\Python312\python.exe",
        "C:\Program Files\Python311\python.exe"
    )
    foreach ($Cand in $CandidateDirs) {
        if (Test-Path $Cand) {
            $PythonExe = $Cand
            Write-Badge "OK" "Located Python at $PythonExe" "Green"
            break
        }
    }
}

# If still not found, offer or perform auto-installation via winget
if (-not $PythonExe) {
    Write-Badge "WARN" "Python 3.11+ was not detected on this system." "Yellow"
    $Winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if ($Winget) {
        Write-Badge "INSTALL" "Installing Python 3.12 via winget (unattended)..." "Cyan"
        Start-Process winget -ArgumentList "install Python.Python.3.12 --silent --accept-source-agreements --accept-package-agreements" -Wait -NoNewWindow
        # Refresh path
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        $PythonExe = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
        if (-not (Test-Path $PythonExe)) {
            $PythonExe = (Get-Command python.exe -ErrorAction SilentlyContinue).Source
        }
    }
    if (-not $PythonExe -or -not (Test-Path $PythonExe)) {
        Write-Host "Error: Python 3.11+ is required. Please install Python from https://www.python.org/downloads/ and rerun." -ForegroundColor Red
        exit 1
    }
}

# ------------------------------------------------------------------------------
# STEP 2: Create Isolated Virtual Environment
# ------------------------------------------------------------------------------
Write-Badge "2/6" "Setting up isolated virtual environment..." "Cyan"
$VenvDir = Join-Path $InstallDir "venv"
if (-not (Test-Path $VenvDir)) {
    # Check if local .venv exists
    $LocalVenv = Join-Path $InstallDir ".venv"
    if (Test-Path $LocalVenv) {
        $VenvDir = $LocalVenv
        Write-Badge "INFO" "Reusing existing virtual environment at $VenvDir" "Gray"
    } else {
        Write-Badge "CREATE" "Creating virtualenv at $VenvDir" "Cyan"
        & $PythonExe -m venv $VenvDir
    }
} else {
    Write-Badge "INFO" "Using virtual environment at $VenvDir" "Gray"
}

$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPythonW = Join-Path $VenvDir "Scripts\pythonw.exe"
if (-not (Test-Path $VenvPython)) {
    Write-Host "Error: Virtual environment python executable not found at $VenvPython" -ForegroundColor Red
    exit 1
}

# ------------------------------------------------------------------------------
# STEP 3: Install All Required Packages
# ------------------------------------------------------------------------------
if (-not $SkipPackageInstall) {
    Write-Badge "3/6" "Installing all required packages into virtual environment..." "Cyan"
    Write-Host "  -> Upgrading pip, setuptools, wheel..." -ForegroundColor DarkGray
    & $VenvPython -m pip install --quiet --upgrade pip setuptools wheel

    $ReqFile = Join-Path $PSScriptRoot "requirements.txt"
    if (Test-Path $ReqFile) {
        Write-Host "  -> Installing dependencies from requirements.txt..." -ForegroundColor DarkGray
        Write-Host "     (fastapi, uvicorn, pydantic, psutil, Pillow, aiortc, av, cryptography, pystray)" -ForegroundColor DarkCyan
        & $VenvPython -m pip install --upgrade -r $ReqFile
    } else {
        Write-Host "  -> Installing dependencies directly..." -ForegroundColor DarkGray
        & $VenvPython -m pip install "fastapi>=0.110" "uvicorn>=0.29" "pydantic>=2.6" "psutil>=5.9" "Pillow>=10.0" "aiortc>=1.8" "av>=11.0" "cryptography>=42.0" "pystray>=0.19.5"
    }

    # Install local ai-bridge package
    if (Test-Path (Join-Path $RepoRoot "pyproject.toml")) {
        Write-Host "  -> Registering ai-bridge package..." -ForegroundColor DarkGray
        & $VenvPython -m pip install --no-deps -e $RepoRoot
    }

    Write-Badge "OK" "Packages successfully installed and linked." "Green"
} else {
    Write-Badge "3/6" "Skipping package installation as requested." "Yellow"
}

# ------------------------------------------------------------------------------
# STEP 4: Configure Agent Credentials & Settings
# ------------------------------------------------------------------------------
Write-Badge "4/6" "Configuring agent credentials & settings..." "Cyan"
$ConfigDir = Join-Path $HOME ".ai-bridge"
if (-not (Test-Path $ConfigDir)) {
    New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null
}

$ConfigFile = Join-Path $ConfigDir "agent_gui.json"
$TokenFile = Join-Path $ConfigDir "device.token"

# Read existing or generate config
$ConfigObj = @{
    control_url = $ControlUrl.Trim().TrimEnd('/')
    device_token = $DeviceToken.Trim()
    auto_start = $true
    theme = "dark"
    poll_wait_s = 10
    minimize_to_tray = $true
    desktop_notifications = $true
    autostart_windows = [bool]$AutoStart
    desktop_enabled = $true
    allow_tier3 = $true
    max_tier_unattended = 3
    allow_writes = $true
    allow_shell = $true
    allow_package_install = $true
    allowed_apps = @("chrome", "msedge", "notepad", "calc", "code", "powershell", "cmd", "explorer", "mspaint", "wt")
}

# If file exists, update while preserving user customizations
if (Test-Path $ConfigFile) {
    try {
        $ExistingJson = Get-Content $ConfigFile -Raw | ConvertFrom-Json
        if ($ExistingJson.control_url -and -not $PSBoundParameters.ContainsKey('ControlUrl')) {
            $ConfigObj.control_url = $ExistingJson.control_url
        }
        if (-not $DeviceToken -and $ExistingJson.device_token) {
            $ConfigObj.device_token = $ExistingJson.device_token
        }
    } catch {}
}

if (-not $ConfigObj.device_token -and (Test-Path $TokenFile)) {
    $ConfigObj.device_token = (Get-Content $TokenFile -Raw).Trim()
}

$ConfigObj | ConvertTo-Json -Depth 5 | Set-Content $ConfigFile -Encoding UTF8
if ($ConfigObj.device_token) {
    $ConfigObj.device_token | Set-Content $TokenFile -Encoding UTF8
}
Write-Badge "OK" "Saved configuration to $ConfigFile" "Green"

# ------------------------------------------------------------------------------
# STEP 5: Shortcuts, Autostart & Service Registration
# ------------------------------------------------------------------------------
Write-Badge "5/6" "Setting up Windows shortcuts & autostart..." "Cyan"

$GuiScript = Join-Path $RepoRoot "agents\windows\gui_app.py"
$IcoPath = Join-Path $RepoRoot "assets\ai-bridge.ico"

# Shortcuts
if ($CreateShortcuts -or -not $Silent) {
    $WshShell = New-Object -ComObject WScript.Shell
    $DesktopDir = [Environment]::GetFolderPath("Desktop")
    $StartMenuDir = [Environment]::GetFolderPath("Programs")

    foreach ($Dir in @($DesktopDir, $StartMenuDir)) {
        if ($Dir -and (Test-Path $Dir)) {
            $LnkPath = Join-Path $Dir "AI Bridge Agent.lnk"
            $S = $WshShell.CreateShortcut($LnkPath)
            $S.TargetPath = if (Test-Path $VenvPythonW) { $VenvPythonW } else { $VenvPython }
            $S.Arguments = "`"$GuiScript`""
            $S.WorkingDirectory = $RepoRoot
            $S.Description = "AI Bridge Windows Agent (Fluent 2 Desktop Client)"
            if (Test-Path $IcoPath) {
                $S.IconLocation = "$IcoPath,0"
            } else {
                $S.IconLocation = "$env:SystemRoot\System32\shell32.dll,18"
            }
            $S.Save()
            Write-Badge "SHORTCUT" "Created $LnkPath" "Green"
        }
    }
}

# Auto-start with Windows Login (HKCU)
if ($AutoStart) {
    $RegRunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    $TargetExe = if (Test-Path $VenvPythonW) { $VenvPythonW } else { $VenvPython }
    $RunCmd = "`"$TargetExe`" `"$GuiScript`""
    Set-ItemProperty -Path $RegRunKey -Name "AIBridgeWindowsClient" -Value $RunCmd -Type String
    Write-Badge "AUTOSTART" "Registered Windows sign-in auto-start in HKCU" "Green"
}

# Headless service option (Scheduled Task)
if ($HeadlessService) {
    $AgentMain = Join-Path $RepoRoot "agents\windows\agent_main.py"
    $TaskCmd = "`"$VenvPython`" `"$AgentMain`" --control-url $($ConfigObj.control_url) --device-token $($ConfigObj.device_token)"
    schtasks /create /tn "AI Bridge Agent" /tr $TaskCmd /sc onstart /ru $env:USERNAME /rl limited /f | Out-Null
    Write-Badge "SERVICE" "Registered headless Scheduled Task 'AI Bridge Agent'" "Green"
}

# ------------------------------------------------------------------------------
# STEP 6: Package Verification & Health Check
# ------------------------------------------------------------------------------
Write-Badge "6/6" "Verifying installed packages & health check..." "Cyan"

$VerifyScript = Join-Path $PSScriptRoot "installer_gui.py"
if (Test-Path $VerifyScript) {
    & $VenvPython $VerifyScript --verify-only
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "              AI BRIDGE INSTALLATION COMPLETE!                       " -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "  Control Server: $($ConfigObj.control_url)" -ForegroundColor White
Write-Host "  Virtualenv:     $VenvDir" -ForegroundColor White
Write-Host "  Agent Client:   $GuiScript" -ForegroundColor White
Write-Host ""
Write-Host "  To launch the agent client now, run:" -ForegroundColor Cyan
Write-Host "    & '$VenvPythonW' '$GuiScript'" -ForegroundColor Yellow
Write-Host ""

if ($LaunchAfterInstall -or (-not $Silent -and -not $HeadlessService)) {
    Write-Badge "LAUNCH" "Starting AI Bridge Windows Client..." "Cyan"
    Start-Process -FilePath (if (Test-Path $VenvPythonW) { $VenvPythonW } else { $VenvPython }) -ArgumentList "`"$GuiScript`"" -WorkingDirectory $RepoRoot
}
