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
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    ($_.Name -match '^python(w)?\.exe$' -and ($_.CommandLine -like "*gui_app.py*" -or $_.CommandLine -like "*agent_main.py*")) -or
    ($_.Name -match '^AIBridge-(Agent|Setup)\.exe$')
} | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# 2. Remove HKCU Autostart Registry entries
$RegRunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
foreach ($RegName in @("AIBridgeWindowsClient", "AIBridgeWindowsAgent")) {
    try {
        $Val = Get-ItemPropertyValue -Path $RegRunKey -Name $RegName -ErrorAction SilentlyContinue
        if ($Val) {
            Remove-ItemProperty -Path $RegRunKey -Name $RegName -ErrorAction SilentlyContinue
            Write-Host "Removed Windows Startup entry '$RegName' from HKCU." -ForegroundColor Green
        }
    } catch {}
}

# 3. Remove Scheduled Tasks if present
foreach ($TaskName in @("AI Bridge Agent", "AIBridgeAgent")) {
    try {
        schtasks /delete /tn $TaskName /f 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Removed Scheduled Task '$TaskName'." -ForegroundColor Green
        }
    } catch {}
}

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

