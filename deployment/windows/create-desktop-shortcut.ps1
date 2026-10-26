# Creates Desktop and Start Menu shortcuts for the AI Bridge Windows Agent GUI App.
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$GuiScript = Join-Path $RepoRoot "agents\windows\gui_app.py"
$PythonW = "$env:ProgramData\ai-bridge\.venv\Scripts\pythonw.exe"
if (-not (Test-Path $PythonW)) {
    $PythonW = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
}
if (-not $PythonW) {
    $PythonW = "$env:ProgramData\ai-bridge\.venv\Scripts\python.exe"
}

$WshShell = New-Object -ComObject WScript.Shell
$DesktopDir = [Environment]::GetFolderPath("Desktop")
$StartMenuDir = [Environment]::GetFolderPath("Programs")

foreach ($Dir in @($DesktopDir, $StartMenuDir)) {
    if ($Dir -and (Test-Path $Dir)) {
        $ShortcutPath = Join-Path $Dir "AI Bridge Agent.lnk"
        $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
        $Shortcut.TargetPath = $PythonW
        $Shortcut.Arguments = "`"$GuiScript`""
        $Shortcut.WorkingDirectory = $RepoRoot
        $Shortcut.Description = "AI Bridge Windows Agent (Fluent 2 Desktop App)"
        $Shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,18"
        $Shortcut.Save()
        Write-Host "Created shortcut: $ShortcutPath"
    }
}
