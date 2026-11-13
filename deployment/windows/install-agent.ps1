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
# Requires Python 3.12, 3.13 or 3.14 (the range the agent is exercised on).
# The venv is built from an explicitly selected interpreter: 'py -3' resolves
# to the newest installed build, so it silently chose an untested 3.15 here.
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
# --- Interpreter selection ---------------------------------------------------
# pyproject.toml allows >=3.11, but the agent is only exercised on 3.12-3.14.
# Resolve to a tested minor explicitly; never fall back to 'py -3', which
# resolves to the newest installed build whatever that is.
$SupportedPythons = @("3.12", "3.13", "3.14")
$script:DetectedPythonMinors = @()

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

function Resolve-AgentPython {
    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($launcher) {
        try {
            $listing = & $launcher.Source -0 2>$null
            foreach ($line in $listing) {
                if ($line -match '-V:(\d+\.\d+)') { $script:DetectedPythonMinors += $Matches[1] }
            }
        } catch { }
    }

    $probes = @()
    if ($launcher) {
        foreach ($minor in $SupportedPythons) {
            $probes += [pscustomobject]@{ Exe = $launcher.Source; Prefix = @("-$minor"); Minor = $minor; Label = "py -$minor" }
        }
    }
    foreach ($minor in $SupportedPythons) {
        $tag = "Python" + ($minor -replace '\.', '')
        if ($env:LOCALAPPDATA) {
            $exe = Join-Path $env:LOCALAPPDATA "Programs\Python\$tag\python.exe"
            if (Test-Path $exe) {
                $probes += [pscustomobject]@{ Exe = $exe; Prefix = @(); Minor = $minor; Label = $exe }
            }
        }
        if ($env:ProgramFiles) {
            $exe = Join-Path $env:ProgramFiles "$tag\python.exe"
            if (Test-Path $exe) {
                $probes += [pscustomobject]@{ Exe = $exe; Prefix = @(); Minor = $minor; Label = $exe }
            }
        }
    }
    foreach ($name in @("python.exe", "python3.exe")) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) {
            $probes += [pscustomobject]@{ Exe = $cmd.Source; Prefix = @(); Minor = ""; Label = $cmd.Source }
        }
    }

    foreach ($probe in $probes) {
        $minor = Get-PythonMinor -Exe $probe.Exe -Prefix $probe.Prefix
        if (-not $minor) { continue }
        if ($SupportedPythons -notcontains $minor) { continue }
        if ($probe.Minor -and $minor -ne $probe.Minor) { continue }
        return [pscustomobject]@{ Exe = $probe.Exe; Prefix = $probe.Prefix; Minor = $minor; Label = $probe.Label }
    }
    return $null
}

$PythonSelection = Resolve-AgentPython
if (-not $PythonSelection) {
    $seen = if ($script:DetectedPythonMinors.Count -gt 0) { $script:DetectedPythonMinors -join ", " } else { "none detected" }
    Write-Host "[FAIL] No supported Python interpreter (3.12, 3.13 or 3.14) was found." -ForegroundColor Red
    Write-Host "       Installed versions seen: $seen" -ForegroundColor Red
    Write-Host "       'py -3' would silently pick the newest build, which is not tested, so this script refuses to guess." -ForegroundColor Red
    Write-Host "       Install Python 3.12 from https://www.python.org/downloads/windows/ and rerun." -ForegroundColor Red
    Invoke-AiBridgeDiagnose -Reason "No supported Python (3.12-3.14) found; installed: $seen"
    exit 1
}
Write-Host "[OK] Using Python $($PythonSelection.Minor) via $($PythonSelection.Label)" -ForegroundColor Green

$VenvDir = Join-Path $env:ProgramData "ai-bridge\.venv"
$VenvPy = Join-Path $VenvDir "Scripts\python.exe"
if (Test-Path $VenvPy) {
    $existingMinor = Get-PythonMinor -Exe $VenvPy
    if ($existingMinor -ne $PythonSelection.Minor) {
        Write-Host "[REBUILD] Existing venv runs Python $existingMinor; recreating it with $($PythonSelection.Minor)." -ForegroundColor Yellow
        Remove-Item -Path $VenvDir -Recurse -Force
    }
}
if (-not (Test-Path $VenvPy)) {
    $venvArgs = @()
    if ($PythonSelection.Prefix) { $venvArgs += $PythonSelection.Prefix }
    $venvArgs += @("-m", "venv", $VenvDir)
    & $PythonSelection.Exe @venvArgs
    if ($LASTEXITCODE -ne 0) { throw "venv creation failed (exit $LASTEXITCODE) using $($PythonSelection.Label)." }
}
$venvMinor = Get-PythonMinor -Exe $VenvPy
if ($SupportedPythons -notcontains $venvMinor) {
    throw "The new venv reports Python $venvMinor, which is outside the supported 3.12-3.14 range."
}
Write-Host "[OK] Venv ready on Python $venvMinor at $VenvPy" -ForegroundColor Green
# Resolve the repo root from this script's location so the install works
# no matter which folder the installer is launched from, and so the
# scheduled task gets an ABSOLUTE agent path (scheduled tasks do not
# start in the repo folder, so a relative script path fails instantly).
$RepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
Set-Location $RepoRoot
& $VenvPy -m pip install --upgrade pip
$ReqFile = Join-Path $PSScriptRoot "requirements.txt"
if (Test-Path $ReqFile) {
    & $VenvPy -m pip install -r $ReqFile
}
& $VenvPy -m pip install -e .
$AgentPath = Join-Path $RepoRoot "agents\windows\agent_main.py"
$taskCmd = "'$VenvPy' '$AgentPath' --control-url $ControlUrl --device-token $DeviceToken"
schtasks /create /tn "AI Bridge Agent" /tr $taskCmd /sc onstart /ru $User /rl limited /f
Write-Host "Agent scheduled to run as '$User'. Start it with: schtasks /run /tn 'AI Bridge Agent'"
Write-Host "Desktop automation is a separate interactive helper (agents/windows/desktop_helper.py) and must be started in a logged-in session."
