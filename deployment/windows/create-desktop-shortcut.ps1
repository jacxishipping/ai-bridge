# Creates Desktop and Start Menu shortcuts for the AI Bridge Windows Agent GUI App.
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$GuiScript = Join-Path $RepoRoot "agents\windows\gui_app.py"
$Candidates = @(
    "$env:ProgramData\ai-bridge\.venv\Scripts\pythonw.exe",
    "$env:LOCALAPPDATA\ai-bridge\.venv\Scripts\pythonw.exe",
    "$RepoRoot\.venv\Scripts\pythonw.exe",
    (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source,
    "$env:ProgramData\ai-bridge\.venv\Scripts\python.exe",
    "$env:LOCALAPPDATA\ai-bridge\.venv\Scripts\python.exe",
    "$RepoRoot\.venv\Scripts\python.exe",
    (Get-Command python.exe -ErrorAction SilentlyContinue).Source
)
$PythonW = $Candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $PythonW) {
    throw "Could not locate pythonw.exe or python.exe to create shortcuts."
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
        $IcoPath = Join-Path $RepoRoot "assets\ai-bridge.ico"
        if (Test-Path $IcoPath) {
            $Shortcut.IconLocation = "$IcoPath,0"
        } else {
            $Shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,18"
        }
        $Shortcut.Save()
        Write-Host "Created shortcut: $ShortcutPath"
    }
}

