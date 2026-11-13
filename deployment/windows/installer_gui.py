"""AI Bridge Windows Setup Wizard (all-in-one installer).

One installer for everything the Windows agent needs:

1. A tested Python runtime (3.12-3.14). Newer builds are refused, matching
   install-agent.ps1: 'py -3' would otherwise silently pick an untested 3.15.
2. An isolated virtual environment plus every required package (fastapi, mcp,
   aiortc, av, Pillow, pystray, cryptography...).
3. The desktop client config in ~/.ai-bridge, with the device token sealed by
   DPAPI through the client's own runtime store - never in agent_gui.json.
4. The background agent, registered to start at logon (scheduled task when
   elevated, HKCU Run otherwise).
5. Shortcuts, plus uninstall and repair when an installation already exists.

The wizard is the default entry point; --silent runs the same steps headlessly
and is what the tests drive.
"""
from __future__ import annotations

import argparse
import ctypes
import json
import os
import platform
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

APP_VERSION = "0.3.0"
# Where the application sources live: the repository when run as a script, or
# the onefile extraction directory (sys._MEIPASS) inside AIBridge-Setup.exe.
SOURCE_ROOT = (
    Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    if getattr(sys, "frozen", False)
    else Path(__file__).resolve().parents[2]
)
REPO_ROOT = SOURCE_ROOT
REQUIREMENTS_FILE = Path(__file__).resolve().parent / "requirements.txt"
HOME_DIR = Path.home() / ".ai-bridge"
CONFIG_FILE = HOME_DIR / "agent_gui.json"
TOKEN_FILE = HOME_DIR / "device.token"
REG_RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
REG_CLIENT_NAME = "AIBridgeWindowsClient"
REG_AGENT_NAME = "AIBridgeWindowsAgent"
DEFAULT_CONTROL_URL = "https://jxiptvplayer.app"
TASK_NAME = "AI Bridge Agent"
SUPPORTED_PYTHONS = ("3.12", "3.13", "3.14")
USER_AGENT = f"AIBridge-WindowsInstaller/{APP_VERSION}"

CLIENT_SCRIPT = REPO_ROOT / "agents" / "windows" / "gui_app.py"
AGENT_SCRIPT = REPO_ROOT / "agents" / "windows" / "agent_main.py"
APP_RUNTIME_DIR = REPO_ROOT / "agents" / "windows"
ICON_PATH = REPO_ROOT / "assets" / "ai-bridge.ico"

# Directories and files the installed agent runs from. Inside the onefile exe
# they only exist in the temporary bundle, so a frozen install copies them into
# the install folder first.
APP_PAYLOAD = ("agents", "src")
APP_METADATA = ("pyproject.toml", "README.md")
# The standalone tray client is embedded by build_exe.py and installed beside
# the setup folder, so one exe delivers both the installer and the client.
BUNDLED_CLIENT_DIR = "payload"
BUNDLED_CLIENT_NAME = "AIBridge-Agent.exe"
CLIENT_EXE: Path | None = None


def installed_client_exe() -> Path | None:
    """The installed standalone tray client, when the bundle carried one."""
    return CLIENT_EXE if CLIENT_EXE is not None and CLIENT_EXE.exists() else None


class InstallerError(RuntimeError):
    """A step failed in a way the operator must fix before retrying."""


def point_runtime_at(root: Path) -> None:
    """Repoint the scripts the installer launches at ``root``."""
    global REPO_ROOT, CLIENT_SCRIPT, AGENT_SCRIPT, APP_RUNTIME_DIR, ICON_PATH
    REPO_ROOT = root
    CLIENT_SCRIPT = root / "agents" / "windows" / "gui_app.py"
    AGENT_SCRIPT = root / "agents" / "windows" / "agent_main.py"
    APP_RUNTIME_DIR = root / "agents" / "windows"
    ICON_PATH = root / "assets" / "ai-bridge.ico"


def stage_application(install_dir: Path, log) -> Path:
    """Make the application sources permanent at install time.

    A frozen installer extracts its payload to a temporary directory that is
    deleted when the process exits, so shortcuts, the autostart entry and the
    background agent would all point at nothing. Copy the sources into
    ``install_dir/app`` and resolve every runtime path against that copy.
    """
    global CLIENT_EXE
    if not getattr(sys, "frozen", False):
        log(f"Running from the source tree at {REPO_ROOT}; nothing to copy.")
        return REPO_ROOT

    target = install_dir / "app"
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)
    target.mkdir(parents=True, exist_ok=True)
    ignore = shutil.ignore_patterns("__pycache__", "*.pyc", "*.egg-info")
    for name in APP_PAYLOAD:
        source = SOURCE_ROOT / name
        if not source.exists():
            raise InstallerError(f"Installer payload is incomplete: {name} is missing.")
        if source.is_dir():
            shutil.copytree(source, target / name, ignore=ignore)
        else:
            shutil.copy2(source, target / name)
    for name in APP_METADATA:
        source = SOURCE_ROOT / name
        if source.exists():
            shutil.copy2(source, target / name)
    assets = SOURCE_ROOT / "assets"
    if assets.is_dir():
        shutil.copytree(assets, target / "assets", ignore=ignore)
    bundled_reqs = SOURCE_ROOT / "deployment" / "windows" / "requirements.txt"
    if bundled_reqs.exists():
        dest = target / "deployment" / "windows"
        dest.mkdir(parents=True, exist_ok=True)
        shutil.copy2(bundled_reqs, dest / "requirements.txt")

    bundled_client = SOURCE_ROOT / BUNDLED_CLIENT_DIR / BUNDLED_CLIENT_NAME
    if bundled_client.exists():
        CLIENT_EXE = install_dir / BUNDLED_CLIENT_NAME
        shutil.copy2(bundled_client, CLIENT_EXE)
        log(f"Installed the standalone tray client: {CLIENT_EXE}")
    else:
        log("[WARN] No bundled tray client in this installer; shortcuts will run from the virtual environment.")

    point_runtime_at(target)
    log(f"Copied the application sources to {target}")
    return target


# ---------------------------------------------------------------------------
# Python runtime selection
# ---------------------------------------------------------------------------
def _probe_python(exe: Path, args: tuple[str, ...] = ()) -> tuple[str, str] | None:
    """Run an interpreter and return (major.minor, sys.executable)."""
    code = "import sys; print('%d.%d' % sys.version_info[:2]); print(sys.executable)"
    try:
        res = subprocess.run(
            [str(exe), *args, "-c", code], capture_output=True, text=True, timeout=25
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if res.returncode != 0:
        return None
    lines = [line.strip() for line in res.stdout.splitlines() if line.strip()]
    if len(lines) < 2:
        return None
    return lines[0], lines[1]


def detect_installed_pythons() -> list[tuple[str, str]]:
    """Best-effort list of (minor, path) for every interpreter found."""
    found: list[tuple[str, str]] = []
    launcher = shutil.which("py")
    if launcher:
        try:
            listing = subprocess.run(
                [launcher, "-0"], capture_output=True, text=True, timeout=15
            ).stdout
        except (OSError, subprocess.SubprocessError):
            listing = ""
        for line in listing.splitlines():
            if "-V:" not in line:
                continue
            minor = line.split("-V:", 1)[1].split()[0].strip()
            probe = _probe_python(Path(launcher), (f"-{minor}",))
            if probe:
                found.append(probe)
    for minor in SUPPORTED_PYTHONS:
        tag = "Python" + minor.replace(".", "")
        for base in (os.environ.get("LOCALAPPDATA"), os.environ.get("ProgramFiles")):
            if not base:
                continue
            exe = Path(base) / ("Programs/Python/" + tag if "LOCALAPPDATA" in base else tag) / "python.exe"
            probe = _probe_python(exe) if exe.exists() else None
            if probe:
                found.append(probe)
    for name in ("python.exe", "python3.exe"):
        exe = shutil.which(name)
        if exe:
            probe = _probe_python(Path(exe))
            if probe:
                found.append(probe)
    seen: set[str] = set()
    unique = []
    for minor, path in found:
        key = path.lower()
        if key not in seen:
            seen.add(key)
            unique.append((minor, path))
    return unique


def resolve_supported_python() -> tuple[Path, str]:
    """Return the first interpreter on a tested minor, else raise InstallerError."""
    for minor in SUPPORTED_PYTHONS:
        tag = "Python" + minor.replace(".", "")
        candidates: list[tuple[Path, tuple[str, ...]]] = []
        launcher = shutil.which("py")
        if launcher:
            candidates.append((Path(launcher), (f"-{minor}",)))
        local = os.environ.get("LOCALAPPDATA")
        if local:
            candidates.append((Path(local) / "Programs" / "Python" / tag / "python.exe", ()))
        machine = os.environ.get("ProgramFiles")
        if machine:
            candidates.append((Path(machine) / tag / "python.exe", ()))
        for exe, args in candidates:
            if not exe.exists():
                continue
            probe = _probe_python(exe, args)
            if probe and probe[0] == minor:
                return Path(probe[1]), minor
    for name in ("python.exe", "python3.exe"):
        exe = shutil.which(name)
        if not exe:
            continue
        probe = _probe_python(Path(exe))
        if probe and probe[0] in SUPPORTED_PYTHONS:
            return Path(probe[1]), probe[0]
    installed = ", ".join(f"{minor} ({path})" for minor, path in detect_installed_pythons()) or "none detected"
    raise InstallerError(
        "No supported Python interpreter "
        f"({', '.join(SUPPORTED_PYTHONS)}) was found. Installed: {installed}. "
        "Install Python 3.12 from https://www.python.org/downloads/windows/ and rerun."
    )


# ---------------------------------------------------------------------------
# Control plane
# ---------------------------------------------------------------------------
def check_control_plane(url: str, token: str = "") -> tuple[bool, str, int, bool]:
    """Probe /health and, with a token, whether the agent route accepts it.

    Returns (reachable, message, latency_ms, token_accepted).
    """
    base = (url or "").strip().rstrip("/")
    if not base:
        return False, "Control plane URL is required", 0, False
    started = time.time()
    try:
        req = urllib.request.Request(f"{base}/health", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=6.0) as resp:
            resp.read(2048)
        latency = int((time.time() - started) * 1000)
    except urllib.error.HTTPError as exc:
        return False, f"Control plane returned HTTP {exc.code} from /health", 0, False
    except urllib.error.URLError as exc:
        return False, f"Cannot reach {base}: {exc.reason}", 0, False
    except Exception as exc:  # noqa: BLE001 - surface any transport error verbatim
        return False, f"Connection failed: {exc}", 0, False

    if not token.strip():
        return True, f"Reached {base} in {latency} ms (no token to check)", latency, False

    route = f"{base}/api/agent/tasks/next?wait=0"
    req = urllib.request.Request(
        route, headers={"Authorization": f"Bearer {token.strip()}", "User-Agent": USER_AGENT}
    )
    try:
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            resp.read(64)
        return True, f"Reached {base} in {latency} ms - device token accepted", latency, True
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            return False, f"Device token rejected (HTTP {exc.code})", latency, False
        if exc.code == 404:
            return True, f"Reached {base} in {latency} ms - token not verified (route missing)", latency, False
        return True, f"Reached {base} in {latency} ms - agent route returned HTTP {exc.code}", latency, False
    except Exception:  # noqa: BLE001 - token check is advisory, reachability is not
        return True, f"Reached {base} in {latency} ms - token not verified", latency, False


# ---------------------------------------------------------------------------
# Installation steps
# ---------------------------------------------------------------------------
def create_environment(python: Path, venv_dir: Path, log) -> Path:
    """Create (or rebuild) the venv on the chosen interpreter. Returns its python."""
    venv_py = venv_dir / "Scripts" / "python.exe"
    if venv_py.exists():
        existing = _probe_python(venv_py)
        minor = existing[0] if existing else "unknown"
        target = _probe_python(python)
        wanted = target[0] if target else "unknown"
        if minor != wanted:
            log(f"[REBUILD] Existing venv runs Python {minor}; recreating it with {wanted}.")
            shutil.rmtree(venv_dir, ignore_errors=True)
        else:
            log(f"Reusing existing virtual environment ({minor}) at {venv_dir}")
    if not venv_py.exists():
        venv_dir.mkdir(parents=True, exist_ok=True)
        log(f"Creating virtual environment at {venv_dir} using {python}")
        res = subprocess.run([str(python), "-m", "venv", str(venv_dir)], capture_output=True, text=True)
        if res.returncode != 0:
            raise InstallerError(f"Could not create the virtual environment: {res.stderr.strip()}")
    if not venv_py.exists():
        raise InstallerError(f"Virtual environment python missing at {venv_py}")
    probe = _probe_python(venv_py)
    if not probe or probe[0] not in SUPPORTED_PYTHONS:
        raise InstallerError(f"The new virtual environment reports Python {probe[0] if probe else 'unknown'}.")
    return venv_py


def install_packages(venv_python: Path, repo_root: Path, log) -> None:
    """Install the agent's dependencies and the project itself into the venv."""
    log("Updating pip, setuptools and wheel...")
    subprocess.run(
        [str(venv_python), "-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"],
        capture_output=True,
        text=True,
    )
    req = repo_root / "deployment" / "windows" / "requirements.txt"
    if not req.exists():
        raise InstallerError(f"requirements.txt not found at {req}")
    log(f"Installing dependencies from {req.name}...")
    proc = subprocess.Popen(
        [str(venv_python), "-m", "pip", "install", "-r", str(req)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    if proc.stdout:
        for line in iter(proc.stdout.readline, ""):
            line = line.strip()
            if line:
                log(f"  {line}")
        proc.stdout.close()
    proc.wait()
    if proc.returncode != 0:
        raise InstallerError(f"pip install failed (exit {proc.returncode}); see the log above.")
    if (repo_root / "pyproject.toml").exists():
        log("Registering the ai-bridge package...")
        res = subprocess.run(
            [str(venv_python), "-m", "pip", "install", "-e", str(repo_root)],
            capture_output=True,
            text=True,
        )
        if res.returncode != 0:
            raise InstallerError(f"pip install -e failed: {res.stderr.strip()}")


def verify_installation(venv_python: Path, log) -> dict[str, bool]:
    """Import the packages the agent needs and report each one."""
    modules = [
        ("fastapi", "FastAPI"),
        ("uvicorn", "Uvicorn"),
        ("pydantic", "Pydantic"),
        ("psutil", "psutil telemetry"),
        ("cryptography", "cryptography"),
        ("PIL", "Pillow"),
        ("aiortc", "aiortc WebRTC"),
        ("av", "PyAV codecs"),
        ("pystray", "pystray tray"),
    ]
    results: dict[str, bool] = {}
    for module, label in modules:
        res = subprocess.run(
            [str(venv_python), "-c", f"import {module}"], capture_output=True, text=True
        )
        results[module] = res.returncode == 0
        log(f"  [{'OK' if results[module] else 'MISSING'}] {label} ({module})")
    return results


def client_config(control_url: str, options: dict) -> dict:
    """Config JSON for the desktop client, deliberately without any credential."""
    return {
        "control_url": (control_url or "").strip().rstrip("/"),
        "auto_start": True,
        "theme": "dark",
        "poll_wait_s": 10,
        "minimize_to_tray": True,
        "desktop_notifications": True,
        "autostart_windows": bool(options.get("autostart_client")),
        "desktop_enabled": bool(options.get("desktop_enabled", True)),
        "allow_tier3": bool(options.get("allow_tier3")),
        "max_tier_unattended": int(options.get("max_tier_unattended", 2)),
        "allow_writes": bool(options.get("allow_writes")),
        "allow_shell": bool(options.get("allow_shell")),
        "allow_package_install": False,
        "allowed_apps": list(options.get("allowed_apps") or []),
    }


def write_client_config(control_url: str, options: dict, log) -> None:
    HOME_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(client_config(control_url, options), indent=2), encoding="utf-8")
    log(f"Wrote client configuration to {CONFIG_FILE} (no token stored in JSON)")


def seal_device_token(venv_python: Path, token: str, log) -> str:
    """Seal the token with the client's own store; returns the backend used."""
    if not token.strip():
        log("No device token supplied; the client will prompt for one.")
        return "none"
    HOME_DIR.mkdir(parents=True, exist_ok=True)
    helper_runtime = APP_RUNTIME_DIR / "app_runtime.py"
    if not helper_runtime.exists():
        raise InstallerError(f"Token store helper missing: {helper_runtime}")
    code = (
        "import sys, pathlib;"
        f"sys.path.insert(0, {str(APP_RUNTIME_DIR)!r});"
        "import app_runtime;"
        "app_runtime.save_token(open(sys.argv[1], encoding='utf-8').read().strip(),"
        " pathlib.Path(sys.argv[2]))"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".token", delete=False, encoding="utf-8") as handle:
        handle.write(token.strip())
        temp_path = handle.name
    try:
        res = subprocess.run(
            [str(venv_python), "-c", code, temp_path, str(TOKEN_FILE)],
            capture_output=True,
            text=True,
        )
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass
    if res.returncode != 0:
        raise InstallerError(f"Could not store the device token: {res.stderr.strip()}")
    head = TOKEN_FILE.read_bytes()[:16] if TOKEN_FILE.exists() else b""
    backend = "dpapi" if head.startswith(b"aib-dpapi-v1:") else "file"
    log(f"Device token stored at {TOKEN_FILE} ({'sealed with DPAPI' if backend == 'dpapi' else 'plaintext'})")
    if backend != "dpapi":
        log("[WARN] DPAPI sealing did not take effect; the token file is plaintext.")
    return backend


def _restrict_launcher_acl(launcher: Path) -> tuple[bool, str]:
    """Make the launcher read-only for the installing user, with no inheritance.

    The DACL is set through .NET rather than 'icacls /grant:r': passing the grant
    as a quoted token makes icacls reject the whole command (exit 87, "Invalid
    parameter"), and '/inheritance:r' on its own leaves the inherited
    full-control entries in place, so the file kept the write access this is
    meant to remove. The result is read back and described, because the old
    invocation failed silently and nobody noticed until the ACL was inspected.
    """
    script = """
$ErrorActionPreference = 'Stop'
$p = '__PATH__'
$acl = Get-Acl -LiteralPath $p
$acl.SetAccessRuleProtection($true, $false)
foreach ($r in @($acl.Access)) { [void]$acl.RemoveAccessRule($r) }
$sys = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
$adm = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')
$me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sys, 'FullControl', 'Allow')))
$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($adm, 'FullControl', 'Allow')))
$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($me, 'ReadAndExecute', 'Allow')))
Set-Acl -LiteralPath $p -AclObject $acl
$after = Get-Acl -LiteralPath $p
$aces = @($after.Access | ForEach-Object {
    [pscustomobject]@{
        sid = $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
        rights = $_.FileSystemRights.ToString()
        inherited = $_.IsInherited
    }
})
[pscustomobject]@{ protected = $after.AreAccessRulesProtected; userSid = $me.Value; aces = $aces } | ConvertTo-Json -Compress -Depth 5
"""
    path = str(launcher).replace("'", "''")
    res = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script.replace("__PATH__", path)],
        capture_output=True,
        text=True,
    )
    output = (res.stdout or "").strip()
    if res.returncode != 0:
        return False, (res.stderr or output).strip()[:200] or f"powershell exited {res.returncode}"
    try:
        report = json.loads(output.splitlines()[-1])
    except (IndexError, ValueError):
        return False, f"unexpected ACL report: {output[:160]}"

    aces = report.get("aces") or []
    mine = next((a for a in aces if a.get("sid") == report.get("userSid")), None)
    rights = (mine or {}).get("rights", "none")
    detail = "; ".join(f"{a.get('sid')}={a.get('rights')}" for a in aces)
    problems = []
    if not report.get("protected"):
        problems.append("inheritance is still enabled")
    inherited = [a for a in aces if a.get("inherited")]
    if inherited:
        problems.append(f"{len(inherited)} inherited entr{'y' if len(inherited) == 1 else 'ies'} remain")
    if mine is None:
        problems.append("the current user has no explicit entry")
    elif any(word in rights for word in ("Write", "Modify", "FullControl")):
        problems.append(f"the current user can still write ({rights})")
    if problems:
        return False, "; ".join(problems) + f" [{detail}]"
    return True, detail


def _write_agent_launcher(
    install_dir: Path, venv_python: Path, control_url: str, token: str
) -> tuple[Path, bool, str]:
    """Write a launcher holding the credential, so the task definition does not.

    Returns the path, whether it was locked down to read-only for this user, and
    a description of the resulting entries.
    """
    launcher = install_dir / "run-agent.cmd"
    body = (
        "@echo off\r\n"
        "setlocal\r\n"
        f'set "AI_BRIDGE_CONTROL_URL={(control_url or "").strip().rstrip("/")}"\r\n'
        f'set "AI_BRIDGE_DEVICE_TOKEN={token.strip()}"\r\n'
        f'"{venv_python}" "{AGENT_SCRIPT}"\r\n'
    )
    launcher.write_text(body, encoding="utf-8")
    if platform.system() != "Windows":
        return launcher, False, "not Windows"
    ok, detail = _restrict_launcher_acl(launcher)
    return launcher, ok, detail


def is_elevated() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:  # noqa: BLE001 - non-Windows or restricted token
        return False


def register_agent(install_dir: Path, venv_python: Path, control_url: str, token: str, log) -> str:
    """Register the background agent at logon. Returns how it was registered."""
    launcher, acl_ok, acl_detail = _write_agent_launcher(install_dir, venv_python, control_url, token)
    log(f"Agent launcher written to {launcher} (token kept out of the task definition)")
    if platform.system() != "Windows":
        return "unsupported"
    if acl_ok:
        log(f"[OK] Launcher ACL: read-only for this user ({acl_detail})")
    else:
        log(f"[WARN] Launcher ACL is not read-only ({acl_detail}); the token in this file may be writable by this account.")

    if is_elevated():
        ps = (
            f"$a = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c \"{launcher}\"' -WorkingDirectory '{install_dir}';"
            f"$t = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME;"
            f"$p = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited;"
            f"$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries "
            f"-RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 0);"
            f"Register-ScheduledTask -TaskName '{TASK_NAME}' -Action $a -Trigger $t -Principal $p -Settings $s -Force | Out-Null;"
            f"Start-ScheduledTask -TaskName '{TASK_NAME}'"
        )
        res = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
                             capture_output=True, text=True)
        if res.returncode == 0:
            log(f"Scheduled task '{TASK_NAME}' registered to run at logon as {os.environ.get('USERNAME')} (limited).")
            return "task"
        log(f"[WARN] Task registration failed: {res.stderr.strip() or res.stdout.strip()}")

    try:
        import winreg

        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_RUN_KEY, 0, winreg.KEY_ALL_ACCESS)
        try:
            winreg.SetValueEx(key, REG_AGENT_NAME, 0, winreg.REG_SZ, f'cmd.exe /c "{launcher}"')
        finally:
            winreg.CloseKey(key)
        log("[WARN] Not elevated, so the agent was added to HKCU Run instead of a scheduled task.")
        return "hkcu"
    except Exception as exc:  # noqa: BLE001 - report why autostart could not be set
        log(f"[WARN] Could not register agent autostart: {exc}")
        return "none"


def set_client_autostart(venv_python: Path, enable: bool, log) -> bool:
    if platform.system() != "Windows":
        return False
    client = installed_client_exe()
    if client:
        command = f'"{client}"'
    else:
        pyw = venv_python.parent / "pythonw.exe"
        exe = pyw if pyw.exists() else venv_python
        command = f'"{exe}" "{CLIENT_SCRIPT}"'
    try:
        import winreg

        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_RUN_KEY, 0, winreg.KEY_ALL_ACCESS)
        try:
            if enable:
                winreg.SetValueEx(key, REG_CLIENT_NAME, 0, winreg.REG_SZ, command)
            else:
                try:
                    winreg.DeleteValue(key, REG_CLIENT_NAME)
                except FileNotFoundError:
                    pass
        finally:
            winreg.CloseKey(key)
        log("Client autostart " + ("registered in HKCU Run." if enable else "removed."))
        return True
    except Exception as exc:  # noqa: BLE001 - autostart is optional
        log(f"[WARN] Could not update client autostart: {exc}")
        return False


def create_shortcuts(venv_python: Path, desktop: bool, start_menu: bool, log) -> list[str]:
    if platform.system() != "Windows" or not (desktop or start_menu):
        return []
    client = installed_client_exe()
    if client:
        exe = str(client)
        arguments_line = '    $s.Arguments = ""'
        working_dir = str(client.parent)
        icon_line = f'    $s.IconLocation = "{client},0"'
    else:
        pyw = venv_python.parent / "pythonw.exe"
        exe = str(pyw if pyw.exists() else venv_python)
        arguments_line = f'    $s.Arguments = "`"{CLIENT_SCRIPT}`""'
        working_dir = str(REPO_ROOT)
        icon_line = (f'    $s.IconLocation = "{ICON_PATH},0"' if ICON_PATH.exists()
                     else '    $s.IconLocation = "$env:SystemRoot\\System32\\shell32.dll,18"')
    folders = []
    if desktop:
        folders.append('[Environment]::GetFolderPath("Desktop")')
    if start_menu:
        folders.append('[Environment]::GetFolderPath("Programs")')
    lines = ['$w = New-Object -ComObject WScript.Shell']
    for folder in folders:
        lines += [
            f"$dir = {folder}",
            "if ($dir -and (Test-Path $dir)) {",
            '    $lnk = Join-Path $dir "AI Bridge Agent.lnk"',
            "    $s = $w.CreateShortcut($lnk)",
            f'    $s.TargetPath = "{exe}"',
            arguments_line,
            f'    $s.WorkingDirectory = "{working_dir}"',
            '    $s.Description = "AI Bridge Windows Agent"',
            icon_line,
            "    $s.Save()",
            '    Write-Output "SHORTCUT:$lnk"',
            "}",
        ]
    res = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "\n".join(lines)],
                         capture_output=True, text=True)
    created = [line.split("SHORTCUT:", 1)[1].strip() for line in res.stdout.splitlines() if line.startswith("SHORTCUT:")]
    for path in created:
        log(f"Created shortcut: {path}")
    return created


def existing_installation() -> dict:
    """What is already installed, so the wizard can offer repair or uninstall."""
    state = {"config": CONFIG_FILE.exists(), "token": TOKEN_FILE.exists(), "task": False, "client_autostart": False}
    if platform.system() != "Windows":
        return state
    try:
        res = subprocess.run(["powershell", "-NoProfile", "-Command",
                              f"(Get-ScheduledTask -TaskName '{TASK_NAME}' -ErrorAction SilentlyContinue).State"],
                             capture_output=True, text=True)
        state["task"] = res.stdout.strip().lower() in ("ready", "running", "disabled")
    except Exception:  # noqa: BLE001 - detection is advisory
        pass
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_RUN_KEY) as key:
            for name in (REG_CLIENT_NAME, REG_AGENT_NAME):
                try:
                    winreg.QueryValueEx(key, name)
                    state["client_autostart"] = True
                except FileNotFoundError:
                    pass
    except Exception:  # noqa: BLE001 - detection is advisory
        pass
    return state


def uninstall(purge: bool, log) -> None:
    """Remove the agent task, autostart entries, shortcuts and (optionally) config."""
    if platform.system() == "Windows":
        subprocess.run(["powershell", "-NoProfile", "-Command",
                        f"Stop-ScheduledTask -TaskName '{TASK_NAME}' -ErrorAction SilentlyContinue;"
                        f"Unregister-ScheduledTask -TaskName '{TASK_NAME}' -Confirm:$false -ErrorAction SilentlyContinue"],
                       capture_output=True, text=True)
        log(f"Removed scheduled task '{TASK_NAME}'.")
        try:
            import winreg

            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_RUN_KEY, 0, winreg.KEY_ALL_ACCESS)
            try:
                for name in (REG_CLIENT_NAME, REG_AGENT_NAME):
                    try:
                        winreg.DeleteValue(key, name)
                        log(f"Removed HKCU Run entry '{name}'.")
                    except FileNotFoundError:
                        pass
            finally:
                winreg.CloseKey(key)
        except Exception as exc:  # noqa: BLE001 - uninstall continues regardless
            log(f"[WARN] Could not clean HKCU Run: {exc}")
        subprocess.run(["powershell", "-NoProfile", "-Command",
                        '$w = New-Object -ComObject WScript.Shell;'
                        'foreach ($d in @([Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("Programs"))) {'
                        '$p = Join-Path $d "AI Bridge Agent.lnk"; if (Test-Path $p) { Remove-Item $p -Force } }'],
                       capture_output=True, text=True)
        log("Removed shortcuts.")
    if purge:
        for path in (CONFIG_FILE, TOKEN_FILE):
            try:
                path.unlink()
                log(f"Deleted {path}")
            except FileNotFoundError:
                pass
        log("Configuration purged.")


def run_installation(options: dict, log, progress=None) -> bool:
    """Execute the full install. Returns True on success."""
    def step(value: int, status: str) -> None:
        if progress:
            progress(value, status)

    control_url = (options.get("control_url") or "").strip()
    token = (options.get("device_token") or "").strip()
    install_dir = Path(options.get("install_dir") or (Path(os.environ.get("LOCALAPPDATA", HOME_DIR)) / "AIBridge"))
    try:
        step(5, "Checking the Python runtime...")
        log("[1/7] Resolving a supported Python interpreter (3.12-3.14)...")
        python, minor = resolve_supported_python()
        log(f"Using Python {minor} at {python}")

        step(15, "Creating the virtual environment...")
        log("[2/7] Preparing the virtual environment and application files...")
        venv_dir = install_dir / "venv"
        venv_python = create_environment(python, venv_dir, log)
        stage_application(install_dir, log)

        if options.get("install_packages", True):
            step(30, "Installing required packages...")
            log("[3/7] Installing packages (this is the slow step)...")
            install_packages(venv_python, REPO_ROOT, log)
            step(60, "Verifying installed packages...")
            log("[4/7] Verifying imports...")
            results = verify_installation(venv_python, log)
            if not all(results.values()):
                log("[WARN] Some modules failed to import; the agent may be limited.")
        else:
            log("[3/7] Package installation skipped.")
            log("[4/7] Verification skipped.")

        step(70, "Writing configuration...")
        log("[5/7] Writing configuration and sealing the device token...")
        write_client_config(control_url, options, log)
        seal_device_token(venv_python, token, log)

        step(82, "Creating shortcuts...")
        log("[6/7] Creating shortcuts and autostart entries...")
        create_shortcuts(venv_python, bool(options.get("create_desktop")),
                         bool(options.get("create_start_menu")), log)
        set_client_autostart(venv_python, bool(options.get("autostart_client")), log)
        if options.get("install_agent", True):
            register_agent(install_dir, venv_python, control_url, token, log)
        else:
            log("Background agent not installed (option disabled).")

        step(100, "Installation complete.")
        log("[7/7] Setup finished.")
        client = installed_client_exe()
        if options.get("launch_after") and client:
            subprocess.Popen([str(client)], cwd=str(client.parent))
            log("Launched the installed standalone client.")
        elif options.get("launch_after") and CLIENT_SCRIPT.exists():
            pyw = venv_python.parent / "pythonw.exe"
            subprocess.Popen([str(pyw if pyw.exists() else venv_python), str(CLIENT_SCRIPT)], cwd=str(REPO_ROOT))
            log("Launched the AI Bridge client.")
        return True
    except InstallerError as exc:
        log(f"[ERROR] {exc}")
        step(100, f"Failed: {exc}")
        return False
    except Exception as exc:  # noqa: BLE001 - never leave the wizard without a reason
        log(f"[ERROR] Unexpected failure: {exc}")
        step(100, "Failed")
        return False


# ---------------------------------------------------------------------------
# Wizard UI
# ---------------------------------------------------------------------------
C_BG = "#141416"
C_HEADER = "#18181c"
C_CARD = "#1f1f23"
C_CARD_ALT = "#27272e"
C_BORDER = "#383844"
C_ACCENT = "#06b6d4"
C_TEXT = "#f3f4f6"
C_MUTED = "#9ca3af"
C_SUCCESS = "#10b981"
C_ERROR = "#ef4444"
C_WARN = "#fbbf24"


def launch_gui_installer() -> None:
    """Launch the step-by-step Fluent installer wizard."""
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk

    root = tk.Tk()
    root.title("AI Bridge - Windows Setup")
    root.geometry("860x660")
    root.minsize(780, 620)
    root.configure(bg=C_BG)
    if ICON_PATH.exists():
        try:
            root.iconbitmap(str(ICON_PATH))
        except Exception:  # noqa: BLE001 - icon is cosmetic
            pass

    style = ttk.Style()
    style.theme_use("clam")
    style.configure("TB.Horizontal.TProgressbar", thickness=8, troughcolor=C_CARD_ALT, background=C_ACCENT)

    state = existing_installation()
    ui_queue: queue.Queue = queue.Queue()
    options: dict = {
        "control_url": DEFAULT_CONTROL_URL,
        "device_token": "",
        "install_dir": str(Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "AIBridge"),
        "create_desktop": True,
        "create_start_menu": True,
        "autostart_client": True,
        "install_agent": True,
        "install_packages": True,
        "allow_tier3": False,
        "allow_writes": False,
        "allow_shell": False,
        "max_tier_unattended": 2,
        "desktop_enabled": True,
        "launch_after": True,
    }
    if CONFIG_FILE.exists():
        try:
            saved = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            options["control_url"] = saved.get("control_url", options["control_url"])
        except Exception:  # noqa: BLE001 - corrupt config is not fatal for setup
            pass

    # -- chrome ------------------------------------------------------------
    header = tk.Frame(root, bg=C_HEADER, height=76, highlightthickness=1, highlightbackground=C_BORDER)
    header.pack(fill="x", side="top")
    tk.Label(header, text="AI Bridge Windows Setup", font=("Segoe UI", 16, "bold"),
             fg=C_TEXT, bg=C_HEADER).pack(anchor="w", padx=22, pady=(12, 0))
    step_label = tk.Label(header, text="", font=("Segoe UI", 9), fg=C_MUTED, bg=C_HEADER)
    step_label.pack(anchor="w", padx=22, pady=(2, 12))
    tk.Label(header, text=f"v{APP_VERSION}", font=("Segoe UI", 8, "bold"), fg="#0284c7",
             bg="#082f49", padx=10, pady=4).pack(side="right", padx=22)

    body = tk.Frame(root, bg=C_BG)
    body.pack(fill="both", expand=True, padx=22, pady=14)
    body.grid_rowconfigure(0, weight=1)
    body.grid_columnconfigure(0, weight=1)

    footer = tk.Frame(root, bg=C_BG)
    footer.pack(fill="x", side="bottom", padx=22, pady=(0, 14))

    pages: list[tk.Frame] = []
    current = {"index": 0}

    def new_page(title: str, subtitle: str) -> tk.Frame:
        frame = tk.Frame(body, bg=C_BG)
        frame.grid(row=0, column=0, sticky="nsew")
        tk.Label(frame, text=title, font=("Segoe UI", 14, "bold"), fg=C_TEXT, bg=C_BG).pack(anchor="w")
        tk.Label(frame, text=subtitle, font=("Segoe UI", 9), fg=C_MUTED, bg=C_BG, wraplength=760,
                 justify="left").pack(anchor="w", pady=(2, 12))
        pages.append(frame)
        return frame

    def card(parent: tk.Frame, heading: str) -> tk.Frame:
        outer = tk.Frame(parent, bg=C_CARD, highlightthickness=1, highlightbackground=C_BORDER)
        outer.pack(fill="x", pady=6)
        tk.Label(outer, text=heading.upper(), font=("Segoe UI", 8, "bold"), fg=C_ACCENT,
                 bg=C_CARD).pack(anchor="w", padx=14, pady=(10, 4))
        inner = tk.Frame(outer, bg=C_CARD)
        inner.pack(fill="x", padx=14, pady=(0, 12))
        return inner

    def field(parent: tk.Frame, label: str, value: str, show: str = "") -> tk.Entry:
        row = tk.Frame(parent, bg=C_CARD)
        row.pack(fill="x", pady=4)
        tk.Label(row, text=label, width=18, anchor="w", font=("Segoe UI", 9, "bold"),
                 fg=C_TEXT, bg=C_CARD).pack(side="left")
        var = tk.StringVar(value=value)
        entry = tk.Entry(row, textvariable=var, show=show, font=("Segoe UI", 10), bg=C_CARD_ALT,
                         fg=C_TEXT, insertbackground=C_TEXT, relief="flat", highlightthickness=1,
                         highlightbackground=C_BORDER)
        entry.pack(side="left", fill="x", expand=True, padx=6, ipady=3)
        entry.var = var  # type: ignore[attr-defined]
        return entry

    def check(parent: tk.Frame, text: str, value: bool) -> tk.BooleanVar:
        var = tk.BooleanVar(value=value)
        tk.Checkbutton(parent, text=text, variable=var, font=("Segoe UI", 9), fg=C_TEXT, bg=C_CARD,
                       selectcolor=C_CARD_ALT, activebackground=C_CARD, activeforeground=C_TEXT,
                       anchor="w", justify="left", wraplength=700).pack(fill="x", pady=2)
        return var

    # -- page 1: welcome ---------------------------------------------------
    p_welcome = new_page("Welcome", "This wizard installs the desktop client, the background agent and every "
                                    "dependency the Windows agent needs. Nothing is changed until you press Install.")
    detected = card(p_welcome, "Detected on this machine")
    detected_label = tk.Label(detected, text="", font=("Segoe UI", 9), fg=C_MUTED, bg=C_CARD,
                              anchor="w", justify="left")
    detected_label.pack(fill="x")

    def refresh_detected() -> None:
        bits = [f"Repository: {REPO_ROOT}"]
        if state["config"]:
            bits.append("Client configuration: present (~/.ai-bridge/agent_gui.json)")
        if state["token"]:
            bits.append("Device token: present (~/.ai-bridge/device.token)")
        if state["task"]:
            bits.append(f"Background agent: scheduled task '{TASK_NAME}' present")
        if state["client_autostart"]:
            bits.append("Client autostart: registered in HKCU Run")
        if not any((state["config"], state["token"], state["task"], state["client_autostart"])):
            bits.append("No existing installation found - this will be a fresh install.")
        detected_label.configure(text="\n".join(bits))

    refresh_detected()

    if any(state.values()):
        existing_card = card(p_welcome, "Existing installation")
        tk.Label(existing_card, text="Installing again repairs the environment and keeps your token. "
                                    "Uninstall removes the task, autostart entries and shortcuts.",
                 font=("Segoe UI", 9), fg=C_MUTED, bg=C_CARD, wraplength=700, justify="left",
                 anchor="w").pack(fill="x")

        def do_uninstall() -> None:
            if not messagebox.askyesno("Uninstall AI Bridge", "Remove the agent task, autostart entries and "
                                                              "shortcuts? Your configuration is kept."):
                return
            logs: list[str] = []
            uninstall(False, logs.append)
            for line in logs:
                console_insert(line)
            state.update(existing_installation())
            refresh_detected()
            messagebox.showinfo("Uninstall complete", "\n".join(logs) or "Nothing to remove.")

        tk.Button(existing_card, text="Uninstall", font=("Segoe UI", 9), bg=C_CARD_ALT, fg=C_TEXT,
                  activebackground=C_BORDER, relief="flat", padx=12, pady=4, command=do_uninstall).pack(
            anchor="w", pady=(8, 0))

    # -- page 2: control plane --------------------------------------------
    p_conn = new_page("Control plane", "Point this device at your control plane and paste the device token from the "
                                       "dashboard. The token is sealed with DPAPI; it is never written to the JSON config.")
    conn = card(p_conn, "Connection")
    url_entry = field(conn, "Control plane URL", options["control_url"])
    token_entry = field(conn, "Device token", "", show="\u2022")
    show_token_btn = tk.Button(conn, text="Show", font=("Segoe UI", 8), bg=C_CARD_ALT, fg=C_MUTED,
                               relief="flat", padx=8, pady=1)

    def toggle_token() -> None:
        hidden = token_entry.cget("show") == "\u2022"
        token_entry.configure(show="" if hidden else "\u2022")
        show_token_btn.configure(text="Hide" if hidden else "Show")

    show_token_btn.configure(command=toggle_token)
    show_token_btn.place(in_=token_entry, relx=1.0, rely=0.5, anchor="e", x=-4)

    ping_var = tk.StringVar(value="Not tested yet.")
    ping_lbl = tk.Label(conn, textvariable=ping_var, font=("Segoe UI", 9), fg=C_MUTED, bg=C_CARD,
                        anchor="w", justify="left", wraplength=700)
    ping_lbl.pack(fill="x", pady=(6, 0))

    def do_ping() -> None:
        ping_var.set("Testing connection...")
        ping_lbl.configure(fg=C_MUTED)
        url, token = url_entry.var.get(), token_entry.var.get()

        def worker() -> None:
            ok, message, _, token_ok = check_control_plane(url, token)
            def apply() -> None:
                ping_var.set(("OK - " if ok else "FAILED - ") + message)
                ping_lbl.configure(fg=C_SUCCESS if ok else C_ERROR)
                options["control_url"] = url.strip()
                options["device_token"] = token.strip()
                options["token_verified"] = token_ok
            root.after(0, apply)

        threading.Thread(target=worker, daemon=True).start()

    tk.Button(conn, text="Test connection", font=("Segoe UI", 9, "bold"), bg="#0284c7", fg="white",
              activebackground="#0369a1", relief="flat", padx=12, pady=5, command=do_ping).pack(
        anchor="w", pady=(8, 0))

    # -- page 3: runtime ---------------------------------------------------
    p_py = new_page("Python runtime", "The agent runs on Python 3.12, 3.13 or 3.14. Newer builds are refused, the same "
                                      "way install-agent.ps1 refuses them, rather than installing onto an untested interpreter.")
    py_card = card(p_py, "Interpreter for the virtual environment")
    py_var = tk.StringVar(value="Checking...")
    py_lbl = tk.Label(py_card, textvariable=py_var, font=("Segoe UI", 9), fg=C_TEXT, bg=C_CARD,
                      anchor="w", justify="left", wraplength=700)
    py_lbl.pack(fill="x")
    py_state: dict = {"python": None, "minor": None}

    def refresh_python() -> None:
        try:
            python, minor = resolve_supported_python()
        except InstallerError as exc:
            py_state["python"] = None
            py_state["minor"] = None
            py_var.set(f"{exc}")
            py_lbl.configure(fg=C_ERROR)
            return
        py_state["python"] = python
        py_state["minor"] = minor
        others = [f"{m} at {p}" for m, p in detect_installed_pythons() if p != str(python)]
        text = f"Will use Python {minor} at {python}"
        if others:
            text += "\nAlso installed (not used): " + "; ".join(others)
        py_var.set(text)
        py_lbl.configure(fg=C_SUCCESS)

    refresh_python()
    # Re-evaluate navigation too: a Python installed while this page is open must
    # re-enable Next, which was disabled when the page was first shown.
    tk.Button(py_card, text="Re-scan", font=("Segoe UI", 9), bg=C_CARD_ALT, fg=C_TEXT,
              activebackground=C_BORDER, relief="flat", padx=12, pady=4,
              command=lambda: (refresh_python(), show(current["index"]))).pack(
        anchor="w", pady=(8, 0))

    # -- page 4: components & policy --------------------------------------
    p_opt = new_page("Components and policy", "Choose what to install. The policy defaults below are the conservative "
                                              "ones: shell access and unattended file writes stay off unless you opt in.")
    comp = card(p_opt, "Components")
    v_desktop = check(comp, "Create a Desktop shortcut", True)
    v_start = check(comp, "Create a Start Menu shortcut", True)
    v_client_auto = check(comp, "Start the desktop client when you sign in", True)
    v_agent = check(comp, "Install the background agent (runs at sign-in, exchanges tasks with the control plane)", True)
    v_packages = check(comp, "Install Python packages now (skip only if the environment is already provisioned)", True)
    v_launch = check(comp, "Open the desktop client when setup finishes", True)

    pol = card(p_opt, "Execution policy (applies to the desktop client)")
    v_tier3 = check(pol, "Allow tier 3 actions (local modification) without approval", False)
    v_writes = check(pol, "Allow file writes by unattended tasks", False)
    v_shell = check(pol, "Allow shell command execution", False)

    folder_row = tk.Frame(p_opt, bg=C_BG)
    folder_row.pack(fill="x", pady=(8, 0))
    tk.Label(folder_row, text="Install folder:", font=("Segoe UI", 9, "bold"), fg=C_TEXT, bg=C_BG).pack(side="left")
    dir_var = tk.StringVar(value=options["install_dir"])
    dir_entry = tk.Entry(folder_row, textvariable=dir_var, font=("Segoe UI", 9), bg=C_CARD_ALT, fg=C_TEXT,
                         insertbackground=C_TEXT, relief="flat", highlightthickness=1,
                         highlightbackground=C_BORDER)
    dir_entry.pack(side="left", fill="x", expand=True, padx=8, ipady=3)

    def pick_dir() -> None:
        chosen = filedialog.askdirectory(initialdir=dir_var.get())
        if chosen:
            dir_var.set(chosen)

    tk.Button(folder_row, text="Browse...", font=("Segoe UI", 9), bg=C_CARD_ALT, fg=C_TEXT,
              activebackground=C_BORDER, relief="flat", padx=10, command=pick_dir).pack(side="right")

    # -- page 5: install ---------------------------------------------------
    p_run = new_page("Installing", "The wizard is provisioning the environment. You can follow each step below.")
    run_card = tk.Frame(p_run, bg=C_CARD, highlightthickness=1, highlightbackground=C_BORDER)
    run_card.pack(fill="both", expand=True, pady=6)
    prog = ttk.Progressbar(run_card, style="TB.Horizontal.TProgressbar", mode="determinate", maximum=100)
    prog.pack(fill="x", padx=14, pady=(14, 6))
    run_status = tk.StringVar(value="Waiting...")
    tk.Label(run_card, textvariable=run_status, font=("Segoe UI", 9, "italic"), fg=C_MUTED,
             bg=C_CARD, anchor="w").pack(fill="x", padx=14)
    console = tk.Text(run_card, font=("Consolas", 8), bg="#0f0f11", fg="#e2e8f0", relief="flat",
                      wrap="none", height=14, insertbackground="white")
    console_scroll = ttk.Scrollbar(run_card, orient="vertical", command=console.yview)
    console.configure(yscrollcommand=console_scroll.set)
    console_scroll.pack(side="right", fill="y", padx=(0, 12), pady=8)
    console.pack(fill="both", expand=True, padx=12, pady=(8, 12))
    console.tag_configure("error", foreground="#f87171")
    console.tag_configure("warn", foreground=C_WARN)
    console.tag_configure("ok", foreground="#34d399")

    def console_insert(line: str) -> None:
        tag = ""
        lowered = line.lower()
        if "[error]" in lowered or "failed" in lowered:
            tag = "error"
        elif "[warn]" in lowered:
            tag = "warn"
        elif "ok" in lowered and line.strip().startswith("["):
            tag = "ok"
        console.insert("end", line + "\n", tag)
        console.see("end")

    # -- page 6: finish ----------------------------------------------------
    p_done = new_page("Finished", "AI Bridge is installed.")
    done_card = card(p_done, "Summary")
    done_var = tk.StringVar(value="")
    tk.Label(done_card, textvariable=done_var, font=("Segoe UI", 9), fg=C_TEXT, bg=C_CARD, anchor="w",
             justify="left", wraplength=720).pack(fill="x")

    def open_dashboard() -> None:
        url = (options.get("control_url") or DEFAULT_CONTROL_URL).rstrip("/")
        try:
            os.startfile(url)  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001 - opening a browser is best effort
            messagebox.showinfo("Dashboard", url)

    tk.Button(done_card, text="Open the dashboard", font=("Segoe UI", 9), bg=C_CARD_ALT, fg=C_TEXT,
              activebackground=C_BORDER, relief="flat", padx=12, pady=5, command=open_dashboard).pack(
        anchor="w", pady=(10, 0))

    # -- navigation --------------------------------------------------------
    back_btn = tk.Button(footer, text="Back", font=("Segoe UI", 10), bg=C_CARD, fg=C_MUTED,
                         activebackground=C_CARD_ALT, activeforeground=C_TEXT, relief="flat", padx=16, pady=7,
                         command=lambda: show(current["index"] - 1))
    back_btn.pack(side="left")
    next_btn = tk.Button(footer, text="Next", font=("Segoe UI", 10, "bold"), bg="#2563eb", fg="white",
                         activebackground="#1d4ed8", relief="flat", padx=20, pady=7,
                         command=lambda: show(current["index"] + 1))
    next_btn.pack(side="right")
    cancel_btn = tk.Button(footer, text="Cancel", font=("Segoe UI", 10), bg=C_CARD, fg=C_MUTED,
                           activebackground=C_CARD_ALT, activeforeground=C_TEXT, relief="flat", padx=16, pady=7,
                           command=root.destroy)
    cancel_btn.pack(side="right", padx=(0, 8))

    running = {"started": False, "ok": False}

    def collect() -> None:
        options["control_url"] = url_entry.var.get().strip() or DEFAULT_CONTROL_URL
        options["device_token"] = token_entry.var.get().strip()
        options["install_dir"] = dir_var.get().strip()
        options["create_desktop"] = v_desktop.get()
        options["create_start_menu"] = v_start.get()
        options["autostart_client"] = v_client_auto.get()
        options["install_agent"] = v_agent.get()
        options["install_packages"] = v_packages.get()
        options["launch_after"] = v_launch.get()
        options["allow_tier3"] = v_tier3.get()
        options["allow_writes"] = v_writes.get()
        options["allow_shell"] = v_shell.get()
        options["max_tier_unattended"] = 3 if v_tier3.get() else 2

    def start_install() -> None:
        if running["started"]:
            return
        running["started"] = True
        collect()
        next_btn.configure(state="disabled", text="Installing...")
        back_btn.configure(state="disabled")
        cancel_btn.configure(state="disabled")
        console.delete("1.0", "end")
        console_insert("AI Bridge Setup started.")
        console_insert(f"Repository: {REPO_ROOT}")
        console_insert(f"Python: {py_state['minor']} at {py_state['python']}")
        console_insert(f"Install folder: {options['install_dir']}")
        console_insert("")

        def worker() -> None:
            def log(line: str) -> None:
                ui_queue.put(("log", line))

            def progress(value: int, status: str) -> None:
                ui_queue.put(("progress", (value, status)))

            ok = run_installation(options, log, progress)
            ui_queue.put(("done", ok))

        threading.Thread(target=worker, daemon=True).start()

    def pump() -> None:
        while True:
            try:
                kind, payload = ui_queue.get_nowait()
            except queue.Empty:
                break
            if kind == "log":
                console_insert(str(payload))
            elif kind == "progress":
                value, status = payload
                prog["value"] = value
                run_status.set(status)
            elif kind == "done":
                running["ok"] = bool(payload)
                done_var.set(
                    ("Installation finished. The desktop client and background agent are ready."
                     if payload else
                     "Installation did not finish. Review the log on the previous page, fix the cause, and run the "
                     "wizard again - it is safe to re-run.")
                    + f"\n\nClient config: {CONFIG_FILE}\nDevice token: {TOKEN_FILE}\n"
                      f"Install folder: {options['install_dir']}"
                )
                state.update(existing_installation())
                refresh_detected()
                show(len(pages) - 1)
        root.after(80, pump)

    def show(index: int) -> None:
        index = max(0, min(index, len(pages) - 1))
        current["index"] = index
        for position, page in enumerate(pages):
            if position == index:
                page.tkraise()
        step_label.configure(text=f"Step {index + 1} of {len(pages)}")
        back_btn.configure(state="normal" if index > 0 and not running["started"] else "disabled")
        if index == len(pages) - 2:
            next_btn.configure(text="Install", command=start_install)
        elif index == len(pages) - 1:
            next_btn.configure(text="Close", command=root.destroy, state="normal")
        else:
            next_btn.configure(text="Next", command=lambda: show(current["index"] + 1),
                               state="normal" if not running["started"] else "disabled")
        if index == 2 and py_state["python"] is None:
            next_btn.configure(state="disabled")

    root.after(80, pump)
    show(0)
    root.mainloop()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description="AI Bridge Windows all-in-one setup")
    parser.add_argument("--url", default=DEFAULT_CONTROL_URL, help="Control plane URL")
    parser.add_argument("--token", default="", help="Device enrollment token")
    parser.add_argument("--install-dir", default="", help="Install folder (default: %%LOCALAPPDATA%%\\AIBridge)")
    parser.add_argument("--no-packages", action="store_true", help="Skip pip installation")
    parser.add_argument("--no-shortcuts", action="store_true", help="Do not create shortcuts")
    parser.add_argument("--no-autostart", action="store_true", help="Do not register client autostart")
    parser.add_argument("--no-agent", action="store_true", help="Do not install the background agent")
    parser.add_argument("--no-launch", action="store_true", help="Do not launch the client afterwards")
    parser.add_argument("--allow-shell", action="store_true", help="Permit shell execution in the client policy")
    parser.add_argument("--allow-writes", action="store_true", help="Permit unattended file writes")
    parser.add_argument("--silent", action="store_true", help="Run headlessly without the wizard")
    parser.add_argument("--check", action="store_true", help="Report the resolved runtime and exit")
    parser.add_argument("--verify-only", action="store_true", help="Verify packages in the current interpreter")
    parser.add_argument("--uninstall", action="store_true", help="Remove the agent task, autostart entries and shortcuts")
    parser.add_argument("--purge", action="store_true", help="With --uninstall, also delete the configuration")
    args = parser.parse_args()

    if args.verify_only:
        print("Verifying packages in the current interpreter...")
        results = verify_installation(Path(sys.executable), print)
        ok = all(results.values())
        print(f"Package verification {'SUCCEEDED' if ok else 'FAILED'}")
        sys.exit(0 if ok else 1)

    if args.uninstall:
        uninstall(args.purge, print)
        sys.exit(0)

    if args.check:
        try:
            python, minor = resolve_supported_python()
        except InstallerError as exc:
            print(f"[FAIL] {exc}")
            sys.exit(1)
        print(f"[OK] Python {minor} at {python}")
        state = existing_installation()
        print(f"Existing: config={state['config']} token={state['token']} task={state['task']} "
              f"autostart={state['client_autostart']}")
        sys.exit(0)

    options = {
        "control_url": args.url,
        "device_token": args.token,
        "install_dir": args.install_dir or str(Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "AIBridge"),
        "create_desktop": not args.no_shortcuts,
        "create_start_menu": not args.no_shortcuts,
        "autostart_client": not args.no_autostart,
        "install_agent": not args.no_agent,
        "install_packages": not args.no_packages,
        "allow_tier3": False,
        "allow_writes": args.allow_writes,
        "allow_shell": args.allow_shell,
        "max_tier_unattended": 2,
        "launch_after": not args.no_launch,
    }

    if args.silent:
        ok = run_installation(options, print, lambda value, status: print(f"  [{value:3d}%] {status}"))
        sys.exit(0 if ok else 1)

    launch_gui_installer()


if __name__ == "__main__":
    main()
