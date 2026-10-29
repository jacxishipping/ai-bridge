# ==============================================================================
# AI Bridge Windows Agent — Clean Uninstaller
# ==============================================================================
[CmdletBinding()]
param(
    [switch]$PurgeConfig,
    [switch]$Silent
)

Write-Host "=====================================================================" -ForegroundColor Yellow
Write-Host "         AI Bridge — Windows Agent Uninstaller                       " -ForegroundColor White
Write-Host "=====================================================================" -ForegroundColor Yellow

# 1. Stop running processes
Write-Host "Stopping any running AI Bridge processes..." -ForegroundColor DarkGray
Get-Process python, pythonw -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*gui_app.py*" -or $_.CommandLine -like "*agent_main.py*"
} | Stop-Process -Force -ErrorAction SilentlyContinue

# 2. Remove HKCU Autostart Registry entry
$RegRunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
try {
    $Val = Get-ItemPropertyValue -Path $RegRunKey -Name "AIBridgeWindowsClient" -ErrorAction SilentlyContinue
    if ($Val) {
        Remove-ItemProperty -Path $RegRunKey -Name "AIBridgeWindowsClient" -ErrorAction SilentlyContinue
        Write-Host "Removed Windows Startup entry from HKCU." -ForegroundColor Green
    }
} catch {}

# 3. Remove Scheduled Task if present
try {
    schtasks /delete /tn "AI Bridge Agent" /f 2>$null
    Write-Host "Removed Scheduled Task 'AI Bridge Agent'." -ForegroundColor Green
} catch {}

# 4. Remove Shortcuts
$DesktopDir = [Environment]::GetFolderPath("Desktop")
$StartMenuDir = [Environment]::GetFolderPath("Programs")
foreach ($Dir in @($DesktopDir, $StartMenuDir)) {
    if ($Dir) {
        $LnkPath = Join-Path $Dir "AI Bridge Agent.lnk"
        if (Test-Path $LnkPath) {
            Remove-Item -Path $LnkPath -Force -ErrorAction SilentlyContinue
            Write-Host "Removed shortcut: $LnkPath" -ForegroundColor Green
        }
    }
}

# 5. Config purge option
$ConfigDir = Join-Path $HOME ".ai-bridge"
if ($PurgeConfig -and (Test-Path $ConfigDir)) {
    Remove-Item -Path $ConfigDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Purged configuration directory: $ConfigDir" -ForegroundColor Green
} elseif (Test-Path $ConfigDir) {
    Write-Host "Preserved configuration files at $ConfigDir (pass -PurgeConfig to remove)." -ForegroundColor DarkGray
}

Write-Host "Uninstallation completed successfully." -ForegroundColor Green
