<#
.SYNOPSIS
    Installs the AI Bridge Two-Process Windows Architecture:
    - Process A: AIBridgeWindowsService (Session 0 Windows Service)
    - Process B: AIBridgeDesktopAgent (Interactive User Session Scheduled Task / HKLM Run)
#>
param(
    [string]$ControlUrl = "http://127.0.0.1:8000",
    [string]$DeviceToken = "",
    [string]$BuildDir = "$PSScriptRoot\..\build\Release"
)

$ErrorActionPreference = "Stop"
$ServiceExe = Join-Path $BuildDir "ai_bridge_service.exe"
$DesktopExe = Join-Path $BuildDir "ai_bridge_desktop.exe"

Write-Host "[AI Bridge] Verifying native Windows Agent binaries in $BuildDir ..."
if (-not (Test-Path $ServiceExe)) {
    Write-Host "Building native C++ Windows Agent via CMake..."
    cmake -S "$PSScriptRoot\.." -B "$PSScriptRoot\..\build"
    cmake --build "$PSScriptRoot\..\build" --config Release
}

Write-Host "[AI Bridge] Native binaries verified:"
Write-Host "  - Service (Session 0): $ServiceExe"
Write-Host "  - Desktop Agent (Interactive Session): $DesktopExe"
