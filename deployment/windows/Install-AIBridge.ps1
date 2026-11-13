# ==============================================================================
# AI Bridge Windows — compatibility shim
# ==============================================================================
# CANONICAL INSTALLER: deployment/windows/installer_gui.py, launched by
# Setup.bat (double-click) or `installer_gui.py --silent` for automation.
# It is the only implementation: this file no longer installs anything itself.
#
# This shim exists so existing scripted call sites keep working. It accepts the
# historical parameters, resolves a tested Python, and forwards to the wizard.
# Behaviour differences worth knowing:
#   * -HeadlessService registers the agent at SIGN-IN as your own limited
#     account. The old script created an on-boot task running as your user.
#     For a boot-time service install, use deployment/windows/install-agent.ps1.
#   * -LaunchAfterInstall only applies with -Silent/-NoGui; the interactive
#     wizard asks the operator instead.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\Install-AIBridge.ps1
#   powershell -ExecutionPolicy Bypass -File .\Install-AIBridge.ps1 -ControlUrl "https://jxiptvplayer.app" -DeviceToken "YOUR_TOKEN" -Silent -HeadlessService -CreateShortcuts -AutoStart
#   powershell -ExecutionPolicy Bypass -File .\Install-AIBridge.ps1 -Diagnose
# ==============================================================================

[CmdletBinding()]
param(
    [string]$ControlUrl = "https://jxiptvplayer.app",
    [string]$DeviceToken = "",
    [string]$InstallDir = "",
    [switch]$Diagnose,
    [switch]$AutoStart,
    [switch]$CreateShortcuts,
    [switch]$NoGui,
    [switch]$HeadlessService,
    [switch]$SkipPackageInstall,
    [switch]$LaunchAfterInstall,
    [switch]$Silent
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$Wizard = Join-Path $PSScriptRoot "installer_gui.py"
$AgentInstaller = Join-Path $PSScriptRoot "install-agent.ps1"

if (-not (Test-Path $Wizard)) {
    Write-Host "[FAIL] The setup wizard is missing: $Wizard" -ForegroundColor Red
    Write-Host "       This shim forwards to it; reinstall the repository and retry." -ForegroundColor Red
    exit 1
}

# The support report lives with the agent installer, so delegate rather than
# duplicate it. It installs nothing and exits 0.
if ($Diagnose) {
    if (-not (Test-Path $AgentInstaller)) {
        Write-Host "[FAIL] Cannot produce a report: $AgentInstaller is missing." -ForegroundColor Red
        exit 1
    }
    & $AgentInstaller -Diagnose
    exit $LASTEXITCODE
}

# --- Interpreter selection ---------------------------------------------------
# Mirrors install-agent.ps1: only 3.12-3.14 are tested, and 'py -3' would
# otherwise resolve to the newest installed build whatever that is.
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

function Resolve-WizardPython {
    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    foreach ($minor in $SupportedPythons) {
        if ($launcher) {
            $found = Get-PythonMinor -Exe $launcher.Source -Prefix @("-$minor")
            if ($found -eq $minor) {
                return [pscustomobject]@{ Exe = $launcher.Source; Args = @("-$minor") }
            }
        }
        $tag = "Python" + ($minor -replace '\.', '')
        $candidates = @()
        if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA "Programs\Python\$tag\python.exe") }
        if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles "$tag\python.exe") }
        foreach ($exe in $candidates) {
            if ((Test-Path $exe) -and ((Get-PythonMinor -Exe $exe) -eq $minor)) {
                return [pscustomobject]@{ Exe = $exe; Args = @() }
            }
        }
    }
    foreach ($name in @("python.exe", "python3.exe")) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) {
            $found = Get-PythonMinor -Exe $cmd.Source
            if ($SupportedPythons -contains $found) {
                return [pscustomobject]@{ Exe = $cmd.Source; Args = @() }
            }
        }
    }
    return $null
}

$selection = Resolve-WizardPython
if (-not $selection) {
    $installed = "none detected"
    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($launcher) {
        try {
            $listing = & $launcher.Source -0 2>$null
            $seen = foreach ($line in $listing) { if ($line -match '-V:(\d+\.\d+)') { $Matches[1] } }
            if ($seen) { $installed = $seen -join ", " }
        } catch { }
    }
    Write-Host "[FAIL] No supported Python interpreter (3.12, 3.13 or 3.14) was found." -ForegroundColor Red
    Write-Host "       Installed versions seen: $installed" -ForegroundColor Red
    Write-Host "       'py -3' would silently pick the newest build, which is not tested, so this refuses to guess." -ForegroundColor Red
    Write-Host "       Install Python 3.12 from https://www.python.org/downloads/windows/ and rerun." -ForegroundColor Red
    exit 1
}

# --- Forward to the wizard ---------------------------------------------------
$forward = @($Wizard)
$interactive = -not ($Silent -or $NoGui)

if ($interactive) {
    Write-Host "[INFO] Launching the AI Bridge setup wizard (canonical installer)." -ForegroundColor Cyan
} else {
    $forward += @("--silent")
    # Native commands drop zero-length arguments, so an unset token would make
    # '--token' swallow the next flag. Only forward values that exist.
    if ($ControlUrl) { $forward += @("--url", $ControlUrl) }
    if ($DeviceToken) { $forward += @("--token", $DeviceToken) }
    if ($InstallDir) { $forward += @("--install-dir", $InstallDir) }
    if (-not $CreateShortcuts) { $forward += "--no-shortcuts" }
    if (-not $AutoStart) { $forward += "--no-autostart" }
    if (-not $HeadlessService) { $forward += "--no-agent" }
    if ($SkipPackageInstall) { $forward += "--no-packages" }
    if (-not $LaunchAfterInstall) { $forward += "--no-launch" }

    Write-Host "[INFO] Forwarding to the wizard:" -ForegroundColor Cyan
    Write-Host ("       {0} {1}" -f $selection.Exe, (($selection.Args + $forward) -join " ")) -ForegroundColor DarkGray
    Write-Host "[INFO] -HeadlessService registers the agent at SIGN-IN as your own limited account." -ForegroundColor DarkGray
    Write-Host "       For a boot-time service install, use install-agent.ps1 instead." -ForegroundColor DarkGray
}

Push-Location $RepoRoot
try {
    & $selection.Exe @($selection.Args + $forward)
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($exitCode -ne 0) {
    Write-Host "[FAIL] Setup exited with code $exitCode." -ForegroundColor Red
}
exit $exitCode
