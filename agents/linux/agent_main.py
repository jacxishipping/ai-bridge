"""AI Bridge Linux Agent — Advanced Server Management, Deployment & Runner.

Provides a comprehensive, enterprise-grade Linux agent runtime designed for servers,
cloud droplets, infrastructure automation, DevOps maintenance, and container hosts.

Key Capabilities:
- Unrestricted Server Mode: Runs with full unattended autonomy (Tier 4, writes, shell,
  packages, services, and file deletion permitted without manual approval blocks).
- Multi-Command CLI: run, status, doctor, config, policy, rotate-token, service, enroll, update.
- Automated Maintenance: Proactive token rotation, heartbeat telemetry, self-healing backoff.
- Production Systemd Management: One-command install/uninstall, status inspection, and live logs.
- Environment & Health Auditing: Comprehensive system doctor verifying network, disk, and runtime.

Usage:
  python agents/linux/agent_main.py [command] [options]
  # Or use the all-in-one runner:
  deployment/linux/run-agent.sh [command] [options]
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import platform
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# Insert source and common agent paths
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common.poller import Poller  # noqa: E402
from ai_bridge.policy import Policy  # noqa: E402

# Configuration Paths
if os.name != "nt" and os.geteuid() == 0:
    DEFAULT_CONFIG_DIR = Path("/etc/ai-bridge")
    DEFAULT_WORKSPACE = Path("/home/ai-bridge/ai-bridge-workspace")
else:
    DEFAULT_CONFIG_DIR = Path.home() / ".ai-bridge"
    DEFAULT_WORKSPACE = Path.home() / ".ai-bridge" / "workspace"

CONFIG_JSON_FILE = DEFAULT_CONFIG_DIR / "agent.json"
CONFIG_ENV_FILE = DEFAULT_CONFIG_DIR / "agent.env"
TOKEN_FILE = DEFAULT_CONFIG_DIR / "device.token"
DEFAULT_CONTROL_URL = "https://jxiptvplayer.app"

# Terminal Colors
HAS_TTY = sys.stdout.isatty()
CLR_RESET = "\033[0m" if HAS_TTY else ""
CLR_BOLD = "\033[1m" if HAS_TTY else ""
CLR_RED = "\033[0;31m" if HAS_TTY else ""
CLR_GREEN = "\033[0;32m" if HAS_TTY else ""
CLR_YELLOW = "\033[1;33m" if HAS_TTY else ""
CLR_BLUE = "\033[0;34m" if HAS_TTY else ""
CLR_CYAN = "\033[0;36m" if HAS_TTY else ""
CLR_MAGENTA = "\033[0;35m" if HAS_TTY else ""


def log_info(msg: str) -> None:
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"{CLR_CYAN}[INFO {ts}]{CLR_RESET} {msg}")


def log_ok(msg: str) -> None:
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"{CLR_GREEN}[OK   {ts}]{CLR_RESET} {msg}")


def log_warn(msg: str) -> None:
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"{CLR_YELLOW}[WARN {ts}]{CLR_RESET} {msg}")


def log_error(msg: str) -> None:
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"{CLR_RED}[FAIL {ts}]{CLR_RESET} {msg}", file=sys.stderr)


# -----------------------------------------------------------------------------
# Unrestricted Server Policy Builder
# -----------------------------------------------------------------------------
def get_linux_server_policy() -> Policy:
    """Return default unconfined policy for Linux servers (all operations pre-authorized)."""
    return Policy(
        allow_writes=True,
        allow_tier3=True,
        desktop_enabled=True,
        max_tier_unattended=4,
        unrestricted=True,
        allowed_apps=frozenset({"*"}),
        allowed_services=frozenset({"*"}),
        allowed_test_commands=frozenset({"*"}),
        allowed_tools=None,
        denied_tools=frozenset(),
    )


def sync_linux_server_policy(control_url: str, token: str, notify: bool = False) -> bool:
    """Synchronize Unrestricted Server Policy to the Control Plane."""
    if not control_url or not token:
        return False
    payload = {
        "inherit_global": False,
        "unrestricted": True,
        "allow_writes": True,
        "allow_tier3": True,
        "desktop_enabled": True,
        "allow_shell": True,
        "allow_package_install": True,
        "allow_file_deletion": True,
        "max_tier_unattended": 4,
        "allowed_apps": ["*"],
        "allowed_services": ["*"],
        "note": "Unrestricted Linux Server Policy (Autonomous DevOps & Maintenance)",
    }
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{control_url.rstrip('/')}/api/agent/policy",
            data=data,
            headers={
                "Content-Type": "application/json",
                "X-Device-Token": token,
                "User-Agent": "AI-Bridge-Linux-Agent/2.0",
            },
            method="PUT",
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            if resp.status == 200:
                if notify:
                    log_ok("Synchronized Unrestricted Server Policy with Control Plane (Full Autonomy).")
                return True
    except Exception as exc:
        if notify:
            log_warn(f"Could not push server policy to Control Plane: {exc}")
    return False


# -----------------------------------------------------------------------------
# Configuration Resolution & Persistence
# -----------------------------------------------------------------------------
def _resolve_token_and_file(explicit_token: str, explicit_file: str) -> tuple[str, Path | None]:
    token = explicit_token.strip()
    token_path = Path(explicit_file).expanduser().resolve() if explicit_file else None

    # 1. If explicit token provided, find or establish an appropriate token file to persist rotations
    if token:
        if token_path is None:
            candidate = Path.home() / ".ai-bridge" / "device.token"
            if Path("/etc/ai-bridge").is_dir() and os.access("/etc/ai-bridge", os.W_OK):
                candidate = Path("/etc/ai-bridge") / "device.token"
            token_path = candidate
        return token, token_path

    # 2. Check explicit token file
    if token_path and token_path.is_file():
        try:
            tok = token_path.read_text(encoding="utf-8").strip()
            if tok:
                return tok, token_path
        except OSError:
            pass

    # 3. Check environment variable AI_BRIDGE_TOKEN_FILE
    env_file = os.environ.get("AI_BRIDGE_TOKEN_FILE")
    if env_file:
        p = Path(env_file).expanduser().resolve()
        if p.is_file():
            try:
                tok = p.read_text(encoding="utf-8").strip()
                if tok:
                    return tok, p
            except OSError:
                pass

    # 4. Check standard device.token candidate locations
    candidates = [
        Path("/etc/ai-bridge/device.token"),
        Path.home() / ".ai-bridge" / "device.token",
    ]
    for cand in candidates:
        if cand.is_file():
            try:
                tok = cand.read_text(encoding="utf-8").strip()
                if tok:
                    return tok, cand
            except OSError:
                pass

    # 5. Check agent.json candidate locations
    json_candidates = [
        Path("/etc/ai-bridge/agent.json"),
        Path.home() / ".ai-bridge" / "agent.json",
    ]
    for jcand in json_candidates:
        if jcand.is_file():
            try:
                cfg = json.loads(jcand.read_text(encoding="utf-8"))
                tok = (cfg.get("device_token") or "").strip()
                if tok:
                    return tok, jcand.parent / "device.token"
            except Exception:
                pass

    # 6. Check agent.env files for AI_BRIDGE_DEVICE_TOKEN
    env_candidates = [
        Path("/etc/ai-bridge/agent.env"),
        Path.home() / ".ai-bridge" / "agent.env",
    ]
    for ecand in env_candidates:
        if ecand.is_file():
            try:
                for line in ecand.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if line.startswith("AI_BRIDGE_DEVICE_TOKEN="):
                        val = line.split("=", 1)[1].strip().strip('"').strip("'")
                        if val:
                            token_p = ecand.parent / "device.token"
                            return val, token_p
            except OSError:
                pass

    return "", token_path


def load_agent_config(config_dir: Path | None = None) -> dict:
    """Load configuration from agent.json, agent.env, or environment variables."""
    target_dir = config_dir or DEFAULT_CONFIG_DIR
    cfg = {
        "control_url": os.environ.get("AI_BRIDGE_CONTROL_URL", DEFAULT_CONTROL_URL),
        "device_token": os.environ.get("AI_BRIDGE_DEVICE_TOKEN", ""),
        "device_name": platform.node(),
        "workspace": str(DEFAULT_WORKSPACE),
        "poll_wait_s": 10,
        "unrestricted": True,
        "max_tier_unattended": 4,
        "log_level": "INFO",
    }

    # Load from agent.json
    for cand in [target_dir / "agent.json", Path("/etc/ai-bridge/agent.json"), Path.home() / ".ai-bridge" / "agent.json"]:
        if cand.is_file():
            try:
                saved = json.loads(cand.read_text(encoding="utf-8"))
                if isinstance(saved, dict):
                    cfg.update(saved)
                break
            except Exception:
                pass

    # Fallback to agent.env
    for ecand in [target_dir / "agent.env", Path("/etc/ai-bridge/agent.env"), Path.home() / ".ai-bridge" / "agent.env"]:
        if ecand.is_file():
            try:
                for line in ecand.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k == "AI_BRIDGE_CONTROL_URL":
                            cfg["control_url"] = v
                        elif k == "AI_BRIDGE_DEVICE_TOKEN":
                            cfg["device_token"] = v
                        elif k == "AI_BRIDGE_WORKSPACE":
                            cfg["workspace"] = v
                break
            except OSError:
                pass

    # Resolve token if not loaded
    if not cfg.get("device_token"):
        tok, _ = _resolve_token_and_file("", str(target_dir / "device.token"))
        if tok:
            cfg["device_token"] = tok

    return cfg


def save_agent_config(cfg: dict, config_dir: Path | None = None) -> Path:
    """Persist agent configuration to agent.json, agent.env, and device.token."""
    target_dir = config_dir or DEFAULT_CONFIG_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(target_dir, 0o700)
    except OSError:
        pass

    json_path = target_dir / "agent.json"
    json_path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    try:
        os.chmod(json_path, 0o600)
    except OSError:
        pass

    # Also persist agent.env for systemd EnvironmentFile compatibility
    env_path = target_dir / "agent.env"
    env_content = (
        f"# AI Bridge Linux Agent Environment Configuration\n"
        f"AI_BRIDGE_CONTROL_URL={cfg.get('control_url', DEFAULT_CONTROL_URL)}\n"
        f"AI_BRIDGE_DEVICE_TOKEN={cfg.get('device_token', '')}\n"
        f"AI_BRIDGE_WORKSPACE={cfg.get('workspace', str(DEFAULT_WORKSPACE))}\n"
        f"AI_BRIDGE_UNRESTRICTED=1\n"
        f"AI_BRIDGE_MAX_TIER_UNATTENDED=4\n"
        f"AI_BRIDGE_ALLOW_TIER3=1\n"
        f"AI_BRIDGE_DESKTOP_ENABLED=1\n"
    )
    env_path.write_text(env_content, encoding="utf-8")
    try:
        os.chmod(env_path, 0o600)
    except OSError:
        pass

    # Persist device.token
    if cfg.get("device_token"):
        token_path = target_dir / "device.token"
        token_path.write_text(cfg["device_token"].strip(), encoding="utf-8")
        try:
            os.chmod(token_path, 0o600)
        except OSError:
            pass

    return json_path


# -----------------------------------------------------------------------------
# System & Telemetry Diagnostics
# -----------------------------------------------------------------------------
def gather_linux_telemetry() -> dict:
    """Collect real-time Linux hardware, kernel, and process metrics."""
    telemetry = {
        "hostname": platform.node(),
        "os": f"{platform.system()} {platform.release()}",
        "kernel": platform.release(),
        "arch": platform.machine(),
        "python_version": platform.python_version(),
        "cpu_count": os.cpu_count() or 1,
        "cpu_percent": 0.0,
        "load_avg": [0.0, 0.0, 0.0],
        "memory_total_gb": 0.0,
        "memory_used_gb": 0.0,
        "memory_free_gb": 0.0,
        "memory_percent": 0.0,
        "disk_total_gb": 0.0,
        "disk_free_gb": 0.0,
        "disk_percent": 0.0,
        "uptime_hours": 0.0,
    }

    # Load average
    try:
        if hasattr(os, "getloadavg"):
            telemetry["load_avg"] = [round(x, 2) for x in os.getloadavg()]
    except Exception:
        pass

    # Uptime via /proc/uptime
    try:
        up_p = Path("/proc/uptime")
        if up_p.exists():
            secs = float(up_p.read_text(encoding="utf-8").split()[0])
            telemetry["uptime_hours"] = round(secs / 3600.0, 1)
    except Exception:
        pass

    # Memory via /proc/meminfo or psutil
    try:
        import psutil  # type: ignore

        vm = psutil.virtual_memory()
        telemetry["memory_total_gb"] = round(vm.total / (1024**3), 2)
        telemetry["memory_used_gb"] = round(vm.used / (1024**3), 2)
        telemetry["memory_free_gb"] = round(vm.available / (1024**3), 2)
        telemetry["memory_percent"] = vm.percent
        telemetry["cpu_percent"] = psutil.cpu_percent(interval=0.1)

        du = psutil.disk_usage("/")
        telemetry["disk_total_gb"] = round(du.total / (1024**3), 2)
        telemetry["disk_free_gb"] = round(du.free / (1024**3), 2)
        telemetry["disk_percent"] = du.percent
    except Exception:
        # Fallback reading /proc/meminfo
        try:
            mem_text = Path("/proc/meminfo").read_text(encoding="utf-8")
            mem_dict = {}
            for line in mem_text.splitlines():
                parts = line.split(":")
                if len(parts) == 2:
                    k = parts[0].strip()
                    val = parts[1].strip().split()[0]
                    mem_dict[k] = int(val)
            total_kb = mem_dict.get("MemTotal", 0)
            avail_kb = mem_dict.get("MemAvailable", mem_dict.get("MemFree", 0))
            if total_kb > 0:
                telemetry["memory_total_gb"] = round(total_kb / 1048576, 2)
                telemetry["memory_free_gb"] = round(avail_kb / 1048576, 2)
                used_kb = total_kb - avail_kb
                telemetry["memory_used_gb"] = round(used_kb / 1048576, 2)
                telemetry["memory_percent"] = round((used_kb / total_kb) * 100, 1)
        except Exception:
            pass
        # Fallback disk usage
        try:
            total, used, free = shutil.disk_usage("/")
            telemetry["disk_total_gb"] = round(total / (1024**3), 2)
            telemetry["disk_free_gb"] = round(free / (1024**3), 2)
            telemetry["disk_percent"] = round((used / total) * 100, 1)
        except Exception:
            pass

    return telemetry


# -----------------------------------------------------------------------------
# Doctor & Diagnostics Subcommand
# -----------------------------------------------------------------------------
def run_doctor(control_url: str, token: str) -> bool:
    """Run comprehensive environment, capability, and connectivity audit."""
    print(f"\n{CLR_BOLD}{CLR_BLUE}===================================================================={CLR_RESET}")
    print(f"{CLR_BOLD}{CLR_BLUE}  AI Bridge Linux Agent — System Doctor & Health Audit{CLR_RESET}")
    print(f"{CLR_BOLD}{CLR_BLUE}===================================================================={CLR_RESET}\n")

    all_ok = True

    def check_item(title: str, ok: bool, details: str = "", warn: bool = False) -> None:
        nonlocal all_ok
        if ok:
            badge = f"{CLR_GREEN}[✓ PASS]{CLR_RESET}"
        elif warn:
            badge = f"{CLR_YELLOW}[! WARN]{CLR_RESET}"
        else:
            badge = f"{CLR_RED}[✗ FAIL]{CLR_RESET}"
            all_ok = False
        print(f"  {badge} {CLR_BOLD}{title}{CLR_RESET}")
        if details:
            print(f"         {CLR_CYAN}{details}{CLR_RESET}")

    # 1. Host & Platform
    distro = "Linux"
    if Path("/etc/os-release").exists():
        for line in Path("/etc/os-release").read_text(encoding="utf-8").splitlines():
            if line.startswith("PRETTY_NAME="):
                distro = line.split("=", 1)[1].strip('"')
                break
    check_item("Operating System & Kernel", True, f"{distro} (Kernel: {platform.release()}, Arch: {platform.machine()})")

    # 2. Python Runtime
    py_ver = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    check_item("Python Environment", sys.version_info >= (3, 9), f"Python {py_ver} at {sys.executable}")

    # 3. Virtual Environment
    in_venv = sys.prefix != getattr(sys, "base_prefix", sys.prefix)
    check_item("Virtual Environment Isolation", in_venv, f"Prefix: {sys.prefix}", warn=not in_venv)

    # 4. Core Package Dependencies
    missing_deps = []
    for pkg in ["mcp", "fastapi", "psutil"]:
        try:
            __import__(pkg)
        except ImportError:
            missing_deps.append(pkg)
    check_item(
        "Python Dependencies",
        len(missing_deps) == 0,
        "All required libraries installed" if not missing_deps else f"Missing: {', '.join(missing_deps)} (run: pip install -e .)",
        warn=len(missing_deps) > 0,
    )

    # 5. Control Plane Reachability
    clean_url = control_url.rstrip("/")
    t0 = time.time()
    reach_ok = False
    status_text = ""
    try:
        req = urllib.request.Request(f"{clean_url}/health", headers={"User-Agent": "AI-Bridge-Linux-Doctor"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            lat = (time.time() - t0) * 1000
            reach_ok = resp.status == 200
            status_text = f"HTTP {resp.status} in {lat:.1f}ms ({clean_url})"
    except Exception as exc:
        status_text = f"Connection failed: {exc}"
    check_item("Control Plane Connectivity", reach_ok, status_text)

    # 6. Authentication & Device Verification
    auth_ok = False
    auth_details = ""
    if token:
        try:
            req = urllib.request.Request(
                f"{clean_url}/api/agent/whoami",
                headers={"X-Device-Token": token, "User-Agent": "AI-Bridge-Linux-Doctor"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                did = data.get("device_id")
                if did:
                    auth_ok = True
                    auth_details = f"Authenticated as Device ID: {did}"
        except Exception as exc:
            auth_details = f"Authentication rejected: {exc}"
    else:
        auth_details = "No device token configured. Run 'ai-bridge-agent enroll' to connect."
    check_item("Device Token Verification", auth_ok, auth_details)

    # 7. Policy Mode
    pol_ok = False
    pol_details = ""
    if auth_ok:
        try:
            req = urllib.request.Request(
                f"{clean_url}/api/agent/policy",
                headers={"X-Device-Token": token, "User-Agent": "AI-Bridge-Linux-Doctor"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                pdata = json.loads(resp.read().decode("utf-8"))
                eff = pdata.get("effective_policy") or {}
                is_unrest = eff.get("unrestricted") is True or eff.get("max_tier_unattended", 1) >= 4
                pol_ok = is_unrest
                pol_details = (
                    "⚡ Active Mode: UNRESTRICTED SERVER (Tier 4 / Full Autonomy - No Policy Blocks)"
                    if is_unrest
                    else f"Restricted Mode (Ceiling: Tier {eff.get('max_tier_unattended', 2)})"
                )
        except Exception as exc:
            pol_details = f"Policy lookup failed: {exc}"
    check_item("Execution Policy Guardrails", pol_ok, pol_details, warn=not pol_ok)

    # 8. Server Capabilities & Utilities
    utils = ["systemctl", "journalctl", "docker", "git", "curl"]
    found_utils = [u for u in utils if shutil.which(u)]
    check_item("Server Management Binaries", True, f"Found: {', '.join(found_utils)}")

    # 9. Hardware Telemetry
    telem = gather_linux_telemetry()
    check_item(
        "System Resource Headroom",
        telem["disk_free_gb"] > 1.0 and telem["memory_free_gb"] > 0.2,
        f"RAM Free: {telem['memory_free_gb']} GB ({telem['memory_percent']}% used) | "
        f"Disk Free: {telem['disk_free_gb']} GB ({telem['disk_percent']}% used) | Load: {telem['load_avg']}",
    )

    print()
    if all_ok:
        log_ok("All critical server checks PASSED. Agent is ready for autonomous operations.")
    else:
        log_warn("One or more checks failed or require attention. See diagnostics above.")
    return all_ok


# -----------------------------------------------------------------------------
# Status Subcommand
# -----------------------------------------------------------------------------
def show_status(control_url: str, token: str) -> None:
    """Display comprehensive status dashboard for this Linux device."""
    print(f"\n{CLR_BOLD}{CLR_BLUE}===================================================================={CLR_RESET}")
    print(f"{CLR_BOLD}{CLR_BLUE}  AI Bridge Linux Agent — Status & Identity Dashboard{CLR_RESET}")
    print(f"{CLR_BOLD}{CLR_BLUE}===================================================================={CLR_RESET}\n")

    cfg = load_agent_config()
    clean_url = (control_url or cfg.get("control_url", DEFAULT_CONTROL_URL)).rstrip("/")
    dev_token = token or cfg.get("device_token", "")

    # Host & Telemetry
    telem = gather_linux_telemetry()
    print(f"  {CLR_BOLD}Host Platform:{CLR_RESET}        {telem['hostname']} ({telem['os']})")
    print(f"  {CLR_BOLD}Kernel & Arch:{CLR_RESET}        {telem['kernel']} ({telem['arch']})")
    print(f"  {CLR_BOLD}System Uptime:{CLR_RESET}        {telem['uptime_hours']} hours | Load: {telem['load_avg']}")
    print(f"  {CLR_BOLD}CPU & Memory:{CLR_RESET}         {telem['cpu_count']} Cores ({telem['cpu_percent']}%) | RAM: {telem['memory_used_gb']}/{telem['memory_total_gb']} GB ({telem['memory_percent']}%)")
    print(f"  {CLR_BOLD}Storage Space:{CLR_RESET}        {telem['disk_free_gb']} GB Free / {telem['disk_total_gb']} GB Total ({telem['disk_percent']}%)")
    print()

    # Control Plane & Token
    print(f"  {CLR_BOLD}Control Plane:{CLR_RESET}        {clean_url}")
    if not dev_token:
        print(f"  {CLR_BOLD}Device Token:{CLR_RESET}         {CLR_YELLOW}[Not Configured]{CLR_RESET}")
        print(f"  {CLR_BOLD}Status:{CLR_RESET}               {CLR_YELLOW}Unregistered (Run 'ai-bridge-agent enroll --admin-token <TOK>'){CLR_RESET}\n")
        return

    masked_tok = dev_token[:8] + "..." + dev_token[-6:] if len(dev_token) > 16 else "***"
    print(f"  {CLR_BOLD}Device Token:{CLR_RESET}         {masked_tok}")

    # Query Control Plane
    try:
        req = urllib.request.Request(
            f"{clean_url}/api/agent/whoami",
            headers={"X-Device-Token": dev_token, "User-Agent": "AI-Bridge-Linux-Agent"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            did = data.get("device_id", "—")
            print(f"  {CLR_BOLD}Device ID:{CLR_RESET}            {CLR_GREEN}{did}{CLR_RESET}")
            print(f"  {CLR_BOLD}Cloud Status:{CLR_RESET}         {CLR_GREEN}CONNECTED & AUTHENTICATED ✓{CLR_RESET}")
    except Exception as exc:
        print(f"  {CLR_BOLD}Cloud Status:{CLR_RESET}         {CLR_RED}DISCONNECTED ({exc}){CLR_RESET}")

    # Query Policy
    try:
        req = urllib.request.Request(
            f"{clean_url}/api/agent/policy",
            headers={"X-Device-Token": dev_token, "User-Agent": "AI-Bridge-Linux-Agent"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            pdata = json.loads(resp.read().decode("utf-8"))
            eff = pdata.get("effective_policy") or {}
            is_unrest = eff.get("unrestricted") is True or eff.get("max_tier_unattended", 1) >= 4
            if is_unrest:
                print(f"  {CLR_BOLD}Policy Mode:{CLR_RESET}          {CLR_GREEN}⚡ UNRESTRICTED SERVER (Tier 4 / Full Autonomy - No Policy Blocks){CLR_RESET}")
            else:
                print(f"  {CLR_BOLD}Policy Mode:{CLR_RESET}          {CLR_YELLOW}Restricted (Ceiling: Tier {eff.get('max_tier_unattended', 2)}){CLR_RESET}")
    except Exception:
        pass

    # Systemd Service State
    if shutil.which("systemctl"):
        try:
            res = subprocess.run(["systemctl", "is-active", "ai-bridge-agent"], capture_output=True, text=True)
            svc_state = res.stdout.strip()
            color = CLR_GREEN if svc_state == "active" else (CLR_YELLOW if svc_state == "inactive" else CLR_RED)
            print(f"  {CLR_BOLD}Systemd Service:{CLR_RESET}      {color}{svc_state.upper()}{CLR_RESET} (ai-bridge-agent.service)")
        except Exception:
            pass
    print()


# -----------------------------------------------------------------------------
# Systemd Service Management
# -----------------------------------------------------------------------------
def manage_service(action: str) -> None:
    """Handle install, uninstall, start, stop, restart, status, or logs for systemd."""
    is_root = os.name != "nt" and os.geteuid() == 0
    unit_path = Path("/etc/systemd/system/ai-bridge-agent.service") if is_root else (Path.home() / ".config" / "systemd" / "user" / "ai-bridge-agent.service")
    systemctl_cmd = ["systemctl"] if is_root else ["systemctl", "--user"]
    journalctl_cmd = ["journalctl", "-u", "ai-bridge-agent.service"] if is_root else ["journalctl", "--user-unit", "ai-bridge-agent.service"]

    if action == "install":
        log_info(f"Generating hardened Linux Server systemd service at {unit_path}...")
        repo_root = Path(__file__).resolve().parents[2]
        exec_py = repo_root / ".venv" / "bin" / "python3"
        if not exec_py.exists():
            exec_py = repo_root / ".venv" / "bin" / "python"
        if not exec_py.exists():
            exec_py = Path(sys.executable)

        unit_path.parent.mkdir(parents=True, exist_ok=True)
        env_file_path = "/etc/ai-bridge/agent.env" if is_root else f"{Path.home()}/.ai-bridge/agent.env"

        # Generate service definition optimized for server autonomy & DevOps tasks
        user_line = "User=root\nGroup=root\n" if is_root else ""
        content = f"""[Unit]
Description=AI Bridge Linux Server Agent (autonomous server maintenance & orchestration)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
{user_line}WorkingDirectory={repo_root}
EnvironmentFile=-{env_file_path}
ExecStart={exec_py} agents/linux/agent_main.py run
Restart=always
RestartSec=5
KillMode=process
LimitNOFILE=65536
TasksMax=infinity

[Install]
WantedBy={'multi-user.target' if is_root else 'default.target'}
"""
        unit_path.write_text(content, encoding="utf-8")
        subprocess.run(systemctl_cmd + ["daemon-reload"], check=True)
        subprocess.run(systemctl_cmd + ["enable", "ai-bridge-agent.service"], check=True)
        log_ok("Systemd service installed and enabled on boot.")
        print(f"\nTo start the service now:\n  {'sudo ' if not is_root else ''}{' '.join(systemctl_cmd)} start ai-bridge-agent\n")

    elif action == "uninstall":
        log_info("Stopping and removing systemd service...")
        subprocess.run(systemctl_cmd + ["stop", "ai-bridge-agent.service"], check=False)
        subprocess.run(systemctl_cmd + ["disable", "ai-bridge-agent.service"], check=False)
        if unit_path.exists():
            unit_path.unlink()
        subprocess.run(systemctl_cmd + ["daemon-reload"], check=False)
        log_ok("Systemd service successfully uninstalled.")

    elif action in ("start", "stop", "restart", "status"):
        res = subprocess.run(systemctl_cmd + [action, "ai-bridge-agent.service"])
        sys.exit(res.returncode)

    elif action == "logs":
        cmd = journalctl_cmd + ["-f", "--no-tail"]
        try:
            subprocess.run(cmd)
        except KeyboardInterrupt:
            pass


# -----------------------------------------------------------------------------
# Automated Token Rotation
# -----------------------------------------------------------------------------
def rotate_token_cmd(control_url: str, token: str) -> None:
    """Manually rotate the device token with the Control Plane."""
    cfg = load_agent_config()
    target_url = (control_url or cfg.get("control_url", DEFAULT_CONTROL_URL)).rstrip("/")
    dev_token = token or cfg.get("device_token", "")
    if not dev_token:
        log_error("No device token configured to rotate.")
        sys.exit(1)

    log_info(f"Rotating device token with {target_url} ...")
    try:
        req = urllib.request.Request(
            f"{target_url}/api/agent/rotate",
            headers={"X-Device-Token": dev_token, "User-Agent": "AI-Bridge-Linux-Agent"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            new_tok = data.get("device_token")
            exp = data.get("token_expires_at")
            if new_tok:
                cfg["device_token"] = new_tok
                save_agent_config(cfg)
                exp_str = f"in {max(0, int((exp - time.time()) / 86400))} days" if exp else "never"
                log_ok(f"Device token successfully rotated and persisted securely! (Expires: {exp_str})")
            else:
                log_error("No new token returned by server.")
                sys.exit(1)
    except Exception as exc:
        log_error(f"Token rotation failed: {exc}")
        sys.exit(1)


# -----------------------------------------------------------------------------
# Automated Device Enrollment
# -----------------------------------------------------------------------------
def enroll_cmd(control_url: str, admin_token: str, name: str) -> None:
    """Automate one-step enrollment with the Control Plane using Admin Token."""
    clean_url = (control_url or DEFAULT_CONTROL_URL).rstrip("/")
    if not admin_token:
        log_error("Admin token is required for enrollment (--admin-token).")
        sys.exit(1)

    device_name = name or platform.node()
    log_info(f"Enrolling device '{device_name}' with {clean_url} ...")

    payload = {
        "name": device_name,
        "hostname": platform.node(),
        "os": "linux",
        "tenant": "default",
    }
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{clean_url}/api/devices/enroll",
            data=data,
            headers={
                "Content-Type": "application/json",
                "X-Admin-Token": admin_token,
                "User-Agent": "AI-Bridge-Linux-Agent",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            dev_tok = res.get("device_token")
            dev_id = res.get("device_id")
            if dev_tok:
                cfg = load_agent_config()
                cfg["control_url"] = clean_url
                cfg["device_token"] = dev_tok
                cfg["device_name"] = device_name
                cfg_path = save_agent_config(cfg)
                log_ok(f"Successfully enrolled as Device ID: {dev_id}")
                log_ok(f"Configuration and credentials saved to {cfg_path}")

                # Sync Unrestricted Server Policy
                sync_linux_server_policy(clean_url, dev_tok, notify=True)
            else:
                log_error(f"Enrollment response did not contain device_token: {res}")
                sys.exit(1)
    except Exception as exc:
        log_error(f"Enrollment failed: {exc}")
        sys.exit(1)


# -----------------------------------------------------------------------------
# Codebase Self-Update
# -----------------------------------------------------------------------------
def update_cmd() -> None:
    """Pull latest changes from git, update virtualenv, and restart systemd service."""
    repo_root = Path(__file__).resolve().parents[2]
    log_info(f"Updating AI Bridge repository at {repo_root}...")

    # Git pull
    try:
        subprocess.run(["git", "fetch", "origin", "main"], cwd=repo_root, check=True)
        subprocess.run(["git", "reset", "--hard", "origin/main"], cwd=repo_root, check=True)
        log_ok("Git repository updated to latest origin/main.")
    except Exception as exc:
        log_warn(f"Git update warning: {exc}")

    # Virtualenv update
    exec_pip = repo_root / ".venv" / "bin" / "pip"
    if exec_pip.exists():
        try:
            log_info("Updating dependencies in virtualenv...")
            subprocess.run([str(exec_pip), "install", "-e", str(repo_root), "--quiet"], check=True)
            log_ok("Dependencies updated.")
        except Exception as exc:
            log_warn(f"Pip update warning: {exc}")

    # Restart service if active
    if shutil.which("systemctl"):
        is_root = os.name != "nt" and os.geteuid() == 0
        cmd = ["systemctl"] if is_root else ["systemctl", "--user"]
        try:
            chk = subprocess.run(cmd + ["is-active", "ai-bridge-agent.service"], capture_output=True, text=True)
            if chk.stdout.strip() == "active":
                log_info("Restarting background systemd service...")
                subprocess.run(cmd + ["restart", "ai-bridge-agent.service"], check=True)
                log_ok("AI Bridge agent service restarted with latest code.")
        except Exception:
            pass


# -----------------------------------------------------------------------------
# Foreground Runner Loop
# -----------------------------------------------------------------------------
def run_agent_loop(control_url: str, token: str, token_file: Path | None, once: bool = False) -> None:
    """Execute the core polling loop with Unrestricted Server Policy."""
    server_policy = get_linux_server_policy()
    poller = Poller(control_url, token, policy=server_policy, token_file=token_file)

    log_info(f"Starting AI Bridge Linux Agent ({control_url})")
    log_info("⚡ Policy Mode: UNRESTRICTED SERVER (All operations pre-authorized / No manual approval blocks)")

    # Push unrestricted policy to Control Plane in background
    sync_linux_server_policy(control_url, token, notify=True)

    # Signal handling for clean exit
    def _handle_signal(signum, frame):
        log_warn(f"Received signal {signum}. Shutting down agent loop gracefully...")
        sys.exit(0)

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    if once:
        log_info("Executing single poll cycle (--once)...")
        res = poller.run_once()
        print(json.dumps(res, indent=2))
        return

    log_ok("Agent poller listening for incoming tasks...")
    try:
        poller.run_forever()
    except KeyboardInterrupt:
        log_warn("Agent interrupted by user. Exiting.")


# -----------------------------------------------------------------------------
# Main CLI Entrypoint
# -----------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        prog="ai-bridge-agent",
        description="AI Bridge Linux Agent — Advanced Server Management, Deployment & Runner.",
    )
    subparsers = parser.add_subparsers(dest="subcommand", help="Available commands")

    # Global options
    parser.add_argument("--control-url", default=os.environ.get("AI_BRIDGE_CONTROL_URL", DEFAULT_CONTROL_URL))
    parser.add_argument("--device-token", default=os.environ.get("AI_BRIDGE_DEVICE_TOKEN", ""))
    parser.add_argument("--token-file", default=os.environ.get("AI_BRIDGE_TOKEN_FILE", ""))
    parser.add_argument("--once", action="store_true", help="Run a single poll cycle, then exit.")
    parser.add_argument("--check-update", action="store_true", help="Verify release manifest and exit.")
    parser.add_argument("--manifest-url", default="")
    parser.add_argument("--signature-url", default="")
    parser.add_argument("--public-key", default="")

    # Subcommand: run
    p_run = subparsers.add_parser("run", help="Run agent poller in foreground")
    p_run.add_argument("--control-url", default="")
    p_run.add_argument("--device-token", default="")
    p_run.add_argument("--token-file", default="")
    p_run.add_argument("--once", action="store_true")

    # Subcommand: status
    p_status = subparsers.add_parser("status", help="Show system status and device identity")
    p_status.add_argument("--control-url", default="")
    p_status.add_argument("--device-token", default="")

    # Subcommand: doctor
    p_doc = subparsers.add_parser("doctor", help="Run complete server and connectivity health audit")
    p_doc.add_argument("--control-url", default="")
    p_doc.add_argument("--device-token", default="")

    # Subcommand: config
    p_cfg = subparsers.add_parser("config", help="View or modify agent configuration")
    p_cfg.add_argument("action", choices=["show", "get", "set", "path"], default="show", nargs="?")
    p_cfg.add_argument("key", nargs="?", default="")
    p_cfg.add_argument("value", nargs="?", default="")

    # Subcommand: policy
    p_pol = subparsers.add_parser("policy", help="Inspect or sync unrestricted server policy")
    p_pol.add_argument("action", choices=["get", "sync"], default="get", nargs="?")

    # Subcommand: rotate-token
    p_rot = subparsers.add_parser("rotate-token", help="Rotate device token with the Control Plane")
    p_rot.add_argument("--control-url", default="")
    p_rot.add_argument("--device-token", default="")

    # Subcommand: service
    p_svc = subparsers.add_parser("service", help="Manage systemd background service")
    p_svc.add_argument("action", choices=["install", "uninstall", "start", "stop", "restart", "status", "logs"])

    # Subcommand: enroll
    p_enr = subparsers.add_parser("enroll", help="Enroll device using Admin Token")
    p_enr.add_argument("--control-url", default="")
    p_enr.add_argument("--admin-token", required=True, help="Control plane admin token")
    p_enr.add_argument("--name", default="", help="Device name (defaults to hostname)")

    # Subcommand: update
    subparsers.add_parser("update", help="Update codebase from git and restart service")

    args = parser.parse_args()

    # Legacy manifest verification check
    if args.check_update:
        if not (args.manifest_url and args.signature_url and args.public_key):
            parser.error("--check-update requires --manifest-url, --signature-url and --public-key.")
        from ai_bridge.updates import verify_manifest
        with urllib.request.urlopen(args.manifest_url, timeout=15) as r:
            manifest = json.loads(r.read())
        with urllib.request.urlopen(args.signature_url, timeout=15) as r:
            signature = r.read().decode().strip()
        ok = verify_manifest(manifest, signature, Path(args.public_key))
        print(f"update manifest {manifest.get('name')} {manifest.get('version')}: {'VERIFIED' if ok else 'SIGNATURE INVALID - refusing'}")
        sys.exit(0 if ok else 1)

    # Dispatch subcommands
    subcmd = args.subcommand

    if subcmd == "doctor":
        cfg = load_agent_config()
        url = getattr(args, "control_url", "") or cfg.get("control_url", DEFAULT_CONTROL_URL)
        tok = getattr(args, "device_token", "") or cfg.get("device_token", "")
        run_doctor(url, tok)
        return

    if subcmd == "status":
        cfg = load_agent_config()
        url = getattr(args, "control_url", "") or cfg.get("control_url", DEFAULT_CONTROL_URL)
        tok = getattr(args, "device_token", "") or cfg.get("device_token", "")
        show_status(url, tok)
        return

    if subcmd == "service":
        manage_service(args.action)
        return

    if subcmd == "rotate-token":
        cfg = load_agent_config()
        url = getattr(args, "control_url", "") or cfg.get("control_url", DEFAULT_CONTROL_URL)
        tok = getattr(args, "device_token", "") or cfg.get("device_token", "")
        rotate_token_cmd(url, tok)
        return

    if subcmd == "enroll":
        cfg = load_agent_config()
        url = getattr(args, "control_url", "") or cfg.get("control_url", DEFAULT_CONTROL_URL)
        enroll_cmd(url, args.admin_token, args.name)
        return

    if subcmd == "update":
        update_cmd()
        return

    if subcmd == "policy":
        cfg = load_agent_config()
        url = cfg.get("control_url", DEFAULT_CONTROL_URL)
        tok = cfg.get("device_token", "")
        if args.action == "sync":
            sync_linux_server_policy(url, tok, notify=True)
        else:
            show_status(url, tok)
        return

    if subcmd == "config":
        cfg = load_agent_config()
        action = args.action
        if action == "show":
            masked = dict(cfg)
            if masked.get("device_token"):
                masked["device_token"] = masked["device_token"][:6] + "..." + masked["device_token"][-4:]
            print(json.dumps(masked, indent=2))
        elif action == "path":
            print(f"Config directory: {DEFAULT_CONFIG_DIR}")
            print(f"JSON config:      {CONFIG_JSON_FILE}")
            print(f"ENV config:       {CONFIG_ENV_FILE}")
            print(f"Token file:       {TOKEN_FILE}")
            print(f"Workspace root:   {DEFAULT_WORKSPACE}")
        elif action == "get":
            if not args.key:
                print(json.dumps(cfg, indent=2))
            else:
                print(cfg.get(args.key, ""))
        elif action == "set":
            if not args.key or not args.value:
                log_error("Usage: ai-bridge-agent config set <key> <value>")
                sys.exit(1)
            cfg[args.key] = args.value
            saved_p = save_agent_config(cfg)
            log_ok(f"Saved {args.key} = {args.value} to {saved_p}")
        return

    # Default / 'run' command
    cfg = load_agent_config()
    cli_url = getattr(args, "control_url", "") or ""
    cli_token = getattr(args, "device_token", "") or ""
    cli_file = getattr(args, "token_file", "") or ""
    once_flag = bool(getattr(args, "once", False))

    target_url = cli_url or cfg.get("control_url", DEFAULT_CONTROL_URL)
    token, token_file = _resolve_token_and_file(cli_token, cli_file)
    if not token:
        token = cfg.get("device_token", "")

    if not token:
        log_error("A device token is required to run the agent.")
        print("\nTo enroll this device now:")
        print(f"  {sys.executable} agents/linux/agent_main.py enroll --admin-token <ADMIN_TOKEN>")
        print("Or configure a token manually:")
        print(f"  {sys.executable} agents/linux/agent_main.py config set device_token <DEVICE_TOKEN>\n")
        sys.exit(1)

    run_agent_loop(target_url, token, token_file, once=once_flag)


if __name__ == "__main__":
    main()
