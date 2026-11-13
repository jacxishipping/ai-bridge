"""AI Bridge Windows Agent — Advanced Native Fluent 2 Desktop Application.

Provides a rich, zero-terminal graphical interface for running, monitoring,
diagnosing, and inspecting the AI Bridge Windows agent in unprivileged user mode:
- Fluent 2 Multi-Tab Navigation (Overview, Task Explorer, System Monitor, Desktop Vision, Security, Settings)
- Real-time Hardware Telemetry (live CPU, Memory, Disk, Network usage gauges)
- Interactive Task Explorer & Inspector (full arguments, payloads, timing, and copy actions)
- Desktop Vision Preview (instant test screenshot capture, thumbnail display, metadata)
- One-click Server Ping & Latency Diagnostics
- Windows System Integration (Auto-start on Windows login via HKCU registry, native System Tray with menu, toast notifications)
- Security Guardrail Transparency & Policy Viewer
- Auto Token Rotation & Least-Privilege User Client Operation

Launch with:
    pythonw agents\\windows\\gui_app.py
"""
from __future__ import annotations

import argparse
import ctypes
import json
import logging
import os
import platform
import queue
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request
import webbrowser
import zipfile
from pathlib import Path

try:  # Keep this module importable for --diagnose on hosts without Tk/Tcl.
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
except ImportError:  # pragma: no cover - headless support hosts
    tk = None  # type: ignore[assignment]
    filedialog = messagebox = ttk = None  # type: ignore[assignment]

# Insert source paths
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app_runtime as runtime  # noqa: E402
import diagnose  # noqa: E402
from common.poller import Poller  # noqa: E402

# Shared with the on-disk log written by app_runtime.configure_file_logging().
_LOGGER = logging.getLogger("ai_bridge.gui")
_LOG_LEVELS = {"err": logging.ERROR, "warn": logging.WARNING, "ok": logging.INFO, "info": logging.INFO}

# Configuration paths & registry constants
CONFIG_DIR = Path.home() / ".ai-bridge"
CONFIG_FILE = CONFIG_DIR / "agent_gui.json"


def _resource_root() -> Path:
    """Directory holding bundled resources (the assets folder).

    A PyInstaller onefile build extracts to a temporary ``sys._MEIPASS``, so
    ``__file__``-relative maths would point outside the bundle.
    """
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parents[2]
TOKEN_FILE = CONFIG_DIR / "device.token"
REG_RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
REG_APP_NAME = "AIBridgeWindowsClient"
WINDOW_TITLE = "AI Bridge Windows Client (User App)"
TASK_HISTORY_FILE = CONFIG_DIR / "task_history.json"
TASK_HISTORY_LIMIT = 500
TASK_RESULT_PREVIEW = 4000

try:  # Single source of truth for the version shown in Settings.
    from ai_bridge import __version__ as APP_VERSION
except Exception:  # pragma: no cover - source tree unavailable
    APP_VERSION = "0.0.0"

# Design tokens and view builders live in the sibling gui_ui module.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from gui_ui import (  # noqa: E402  (path setup must run first)
    COMMON_WINDOWS_APPS,
    NAV_PAGES,
    THEMES,
    build_monitor,
    build_overview,
    build_security,
    build_settings,
    build_shell,
    build_tasks,
    build_vision,
    mono_font,
    paint_status_pill,
    redraw_gauges,
    ui_font,
)
from gui_ui import select_tab as ui_select_tab  # noqa: E402


def _enable_dpi_awareness() -> None:
    """Enable per-monitor DPI awareness on Windows for crisp high-DPI rendering."""
    if platform.system() != "Windows":
        return
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


def get_windows_autostart() -> bool:
    """Check if AI Bridge is configured to run on Windows startup in HKCU."""
    if platform.system() != "Windows":
        return False
    try:
        import winreg

        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_RUN_KEY, 0, winreg.KEY_READ)
        try:
            val, _ = winreg.QueryValueEx(key, REG_APP_NAME)
            return bool(val)
        finally:
            winreg.CloseKey(key)
    except Exception:
        return False


def set_windows_autostart(enable: bool) -> bool:
    """Add or remove AI Bridge from Windows startup in HKCU."""
    if platform.system() != "Windows":
        return False
    try:
        import winreg

        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_RUN_KEY, 0, winreg.KEY_ALL_ACCESS)
        try:
            if enable:
                if getattr(sys, "frozen", False):
                    # Frozen: sys.executable is the exe itself; __file__ is temporary.
                    cmd = f'"{sys.executable}"'
                else:
                    script_path = str(Path(__file__).resolve())
                    pyw = sys.executable.replace("python.exe", "pythonw.exe")
                    if not Path(pyw).exists():
                        pyw = sys.executable
                    cmd = f'"{pyw}" "{script_path}"'
                winreg.SetValueEx(key, REG_APP_NAME, 0, winreg.REG_SZ, cmd)
            else:
                try:
                    winreg.DeleteValue(key, REG_APP_NAME)
                except FileNotFoundError:
                    pass
            return True
        finally:
            winreg.CloseKey(key)
    except Exception:
        return False


def test_connection_ping(url: str) -> tuple[bool, float, str]:
    """Test HTTP connection to the control plane and return (ok, latency_ms, status_text)."""
    t0 = time.time()
    try:
        clean_url = url.strip().rstrip("/")
        req = urllib.request.Request(f"{clean_url}/healthz", method="GET")
        req.add_header("User-Agent", "AI-Bridge-Windows-Client/2.0")
        with urllib.request.urlopen(req, timeout=5) as resp:
            latency = (time.time() - t0) * 1000
            return (resp.status == 200, latency, f"HTTP {resp.status} OK")
    except urllib.error.HTTPError as exc:
        latency = (time.time() - t0) * 1000
        return False, latency, f"HTTP {exc.code}: {exc.reason}"
    except Exception as exc:
        latency = (time.time() - t0) * 1000
        return False, latency, str(exc)


def gather_system_telemetry() -> dict:
    """Collect real-time CPU, RAM, Disk, Host, and Network telemetry."""
    data = {
        "cpu_percent": 0.0,
        "cpu_count": os.cpu_count() or 1,
        "memory_percent": 0.0,
        "memory_used_gb": 0.0,
        "memory_total_gb": 0.0,
        "disk_percent": 0.0,
        "disk_free_gb": 0.0,
        "disk_total_gb": 0.0,
        "hostname": platform.node(),
        "system": platform.system(),
        "release": platform.release(),
        "version": platform.version(),
        "machine": platform.machine(),
        "processor": platform.processor() or platform.machine(),
        "python_version": platform.python_version(),
        "uptime": "—",
        "ip_address": "127.0.0.1",
    }
    try:
        import psutil

        data["cpu_percent"] = psutil.cpu_percent(interval=0.02)
        vm = psutil.virtual_memory()
        data["memory_percent"] = round(vm.percent, 1)
        data["memory_used_gb"] = round((vm.total - vm.available) / (1024**3), 2)
        data["memory_total_gb"] = round(vm.total / (1024**3), 2)

        boot_s = psutil.boot_time()
        uptime_s = int(time.time() - boot_s)
        hours, remainder = divmod(uptime_s, 3600)
        minutes, _ = divmod(remainder, 60)
        data["uptime"] = f"{hours}h {minutes}m"

        drive = "C:\\" if platform.system() == "Windows" else "/"
        du = psutil.disk_usage(drive)
        data["disk_percent"] = round(du.percent, 1)
        data["disk_free_gb"] = round(du.free / (1024**3), 1)
        data["disk_total_gb"] = round(du.total / (1024**3), 1)
    except Exception:
        try:
            drive = "C:\\" if platform.system() == "Windows" else "/"
            total, used, free = shutil.disk_usage(drive)
            data["disk_total_gb"] = round(total / (1024**3), 1)
            data["disk_free_gb"] = round(free / (1024**3), 1)
            data["disk_percent"] = round((used / total) * 100, 1) if total else 0
        except Exception:
            pass

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        data["ip_address"] = s.getsockname()[0]
        s.close()
    except Exception:
        try:
            data["ip_address"] = socket.gethostbyname(socket.gethostname())
        except Exception:
            pass

    return data


def _detect_scheduled_task_defaults() -> tuple[str, str]:
    """Read Control URL and Device Token from the existing Scheduled Task if present."""
    if platform.system() != "Windows":
        return "", ""
    try:
        cmd = [
            "powershell",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-ScheduledTask -TaskName 'AI Bridge Agent' -ErrorAction SilentlyContinue).Actions.Arguments",
        ]
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=5,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        args_str = (proc.stdout or "").strip()
        url_m = re.search(r"--control-url\s+(\S+)", args_str)
        tok_m = re.search(r"--device-token\s+(\S+)", args_str)
        return (
            url_m.group(1).strip("\"'") if url_m else "",
            tok_m.group(1).strip("\"'") if tok_m else "",
        )
    except Exception:
        return "", ""


def load_agent_config() -> dict:
    """Load configuration from ~/.ai-bridge/agent_gui.json, token file, or defaults."""
    cfg = {
        "control_url": os.environ.get("AI_BRIDGE_CONTROL_URL", "https://jxiptvplayer.app"),
        "device_token": os.environ.get("AI_BRIDGE_DEVICE_TOKEN", ""),
        "auto_start": True,
        "theme": "dark",
        "poll_wait_s": 10,
        "minimize_to_tray": True,
        "desktop_notifications": True,
        "autostart_windows": get_windows_autostart(),
        "desktop_enabled": True,
        "allow_tier3": True,
        "max_tier_unattended": 3,
        "allow_writes": True,
        "allow_shell": True,
        "allow_package_install": True,
        "allowed_apps": [
            "chrome",
            "msedge",
            "notepad",
            "calc",
            "code",
            "powershell",
            "cmd",
            "explorer",
            "mspaint",
        ],
    }
    if CONFIG_FILE.exists():
        try:
            saved = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            if isinstance(saved, dict):
                cfg.update(saved)
        except Exception:
            pass
    if TOKEN_FILE.exists():
        try:
            saved_tok = runtime.load_token(TOKEN_FILE)
            if saved_tok:
                cfg["device_token"] = saved_tok
            # Upgrade a legacy plaintext token to DPAPI on first successful load.
            runtime.migrate_token_file(TOKEN_FILE)
        except runtime.TokenStoreError as exc:
            _LOGGER.warning("Stored device token is unreadable: %s", exc)
        except Exception:
            pass
    if not cfg.get("device_token"):
        st_url, st_tok = _detect_scheduled_task_defaults()
        if st_url:
            cfg["control_url"] = st_url
        if st_tok:
            cfg["device_token"] = st_tok
    if "allowed_apps" not in cfg or not isinstance(cfg.get("allowed_apps"), list) or not cfg.get("allowed_apps"):
        cfg["allowed_apps"] = [
            "chrome",
            "msedge",
            "notepad",
            "calc",
            "code",
            "powershell",
            "cmd",
            "explorer",
            "mspaint",
        ]
    return cfg


def save_agent_config(cfg: dict) -> None:
    """Persist settings to ~/.ai-bridge/agent_gui.json and device.token."""
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        # The bearer token never goes into the JSON config: it lives in its own
        # DPAPI-sealed file, so a copied config leaks nothing usable.
        CONFIG_FILE.write_text(json.dumps(runtime.strip_token_from_config(cfg), indent=2), encoding="utf-8")
        token = (cfg.get("device_token") or "").strip()
        if token:
            runtime.save_token(token, TOKEN_FILE)
    except (OSError, runtime.TokenStoreError) as exc:
        _LOGGER.warning("Could not persist agent configuration: %s", exc)


def load_task_history() -> list[dict]:
    """Load the persisted task history, tolerating a missing or corrupt file."""
    try:
        if not TASK_HISTORY_FILE.exists():
            return []
        data = json.loads(TASK_HISTORY_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            return []
        return [item for item in data if isinstance(item, dict) and item.get("id")][:TASK_HISTORY_LIMIT]
    except Exception:
        _LOGGER.warning("Task history at %s is unreadable; starting empty.", TASK_HISTORY_FILE)
        return []


def save_task_history(records: list[dict]) -> None:
    """Persist the bounded task history; results are stored as previews only."""
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        trimmed = []
        for record in records[-TASK_HISTORY_LIMIT:]:
            item = dict(record)
            item["result"] = str(item.get("result", ""))[:TASK_RESULT_PREVIEW]
            item["args"] = item.get("args", {})
            trimmed.append(item)
        temp = TASK_HISTORY_FILE.with_suffix(".json.tmp")
        temp.write_text(json.dumps(trimmed, default=str), encoding="utf-8")
        temp.replace(TASK_HISTORY_FILE)
    except Exception as exc:
        _LOGGER.warning("Could not persist task history: %s", exc)


def focus_existing_window(title: str = WINDOW_TITLE) -> bool:
    """Bring an already-running instance's window to the foreground."""
    if platform.system() != "Windows":
        return False
    try:
        user32 = ctypes.windll.user32
        hwnd = user32.FindWindowW(None, title)
        if not hwnd:
            return False
        user32.ShowWindow(hwnd, 9)  # SW_RESTORE
        user32.SetForegroundWindow(hwnd)
        return True
    except Exception:
        return False


class SystemTrayManager:
    """Native Windows System Tray Icon manager using win32gui with fallback."""

    WM_TRAY = 0x8000 + 20  # WM_USER + 20
    ID_SHOW = 1001
    ID_TOGGLE = 1002
    ID_SCREENSHOT = 1003
    ID_DASHBOARD = 1004
    ID_EXIT = 1005

    def __init__(self, app: AgentGuiApp) -> None:
        self.app = app
        self.hwnd: int | None = None
        self.hicon = None
        self.active = False
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()

    def start(self) -> None:
        if platform.system() != "Windows":
            return
        try:
            import win32gui  # noqa: F401

            self._thread = threading.Thread(target=self._run_tray_loop, daemon=True)
            self._thread.start()
        except Exception:
            pass

    def stop(self) -> None:
        self._stop_event.set()
        if self.hwnd and self.active:
            try:
                import win32gui

                win32gui.Shell_NotifyIcon(win32gui.NIM_DELETE, (self.hwnd, 0))
                win32gui.PostMessage(self.hwnd, win32gui.WM_CLOSE, 0, 0)
            except Exception:
                pass
            self.active = False

    def notify(self, title: str, message: str) -> None:
        """Show a native Windows balloon notification."""
        if not self.active or not self.hwnd:
            return
        try:
            import win32gui

            flags = win32gui.NIF_INFO
            nid = (
                self.hwnd,
                0,
                flags,
                0,
                0,
                "",
                message[:250],
                200,
                title[:60],
                win32gui.NIIF_INFO,
            )
            win32gui.Shell_NotifyIcon(win32gui.NIM_MODIFY, nid)
        except Exception:
            pass

    def _run_tray_loop(self) -> None:
        try:
            import win32con
            import win32gui

            wc = win32gui.WNDCLASS()
            wc.lpszClassName = "AIBridgeTrayWindow"
            wc.lpfnWndProc = self._wnd_proc

            class_atom = win32gui.RegisterClass(wc)
            self.hwnd = win32gui.CreateWindow(
                class_atom,
                "AIBridgeTrayWindow",
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                None,
            )

            # Load custom AI Bridge icon if available, fallback to standard application icon
            ico_file = _resource_root() / "assets" / "ai-bridge.ico"
            if ico_file.exists():
                try:
                    self.hicon = win32gui.LoadImage(0, str(ico_file), win32con.IMAGE_ICON, 0, 0, win32con.LR_LOADFROMFILE | win32con.LR_DEFAULTSIZE)
                except Exception:
                    self.hicon = win32gui.LoadIcon(0, win32con.IDI_APPLICATION)
            else:
                self.hicon = win32gui.LoadIcon(0, win32con.IDI_APPLICATION)
            nid = (
                self.hwnd,
                0,
                win32gui.NIF_ICON | win32gui.NIF_MESSAGE | win32gui.NIF_TIP,
                self.WM_TRAY,
                self.hicon,
                "AI Bridge Windows Client",
            )
            win32gui.Shell_NotifyIcon(win32gui.NIM_ADD, nid)
            self.active = True

            while not self._stop_event.is_set():
                win32gui.PumpWaitingMessages()
                time.sleep(0.05)

        except Exception:
            self.active = False

    def _wnd_proc(self, hwnd: int, msg: int, wparam: int, lparam: int) -> int:
        import win32con
        import win32gui

        if msg == self.WM_TRAY:
            if lparam in (win32con.WM_LBUTTONUP, win32con.WM_LBUTTONDBLCLK):
                self.app.root.after(0, self.app.restore_from_tray)
            elif lparam == win32con.WM_RBUTTONUP:
                self._show_context_menu()
            return 0
        elif msg == win32con.WM_COMMAND:
            cmd = wparam & 0xFFFF
            if cmd == self.ID_SHOW:
                self.app.root.after(0, self.app.restore_from_tray)
            elif cmd == self.ID_TOGGLE:
                self.app.root.after(0, self.app.toggle_agent)
            elif cmd == self.ID_SCREENSHOT:
                self.app.root.after(0, self.app.capture_preview_screenshot)
            elif cmd == self.ID_DASHBOARD:
                self.app.root.after(0, self.app.open_dashboard)
            elif cmd == self.ID_EXIT:
                self.app.root.after(0, self.app.exit_application)
            return 0
        return win32gui.DefWindowProc(hwnd, msg, wparam, lparam)

    def _show_context_menu(self) -> None:
        import win32con
        import win32gui

        menu = win32gui.CreatePopupMenu()
        win32gui.AppendMenu(menu, win32con.MF_STRING, self.ID_SHOW, "Show AI Bridge Client")
        toggle_label = "■ Stop Agent" if self.app.running else "▶ Start Agent"
        win32gui.AppendMenu(menu, win32con.MF_STRING, self.ID_TOGGLE, toggle_label)
        win32gui.AppendMenu(menu, win32con.MF_STRING, self.ID_SCREENSHOT, "📸 Capture Test Screenshot")
        win32gui.AppendMenu(menu, win32con.MF_STRING, self.ID_DASHBOARD, "Web Dashboard ↗")
        win32gui.AppendMenu(menu, win32con.MF_SEPARATOR, 0, "")
        win32gui.AppendMenu(menu, win32con.MF_STRING, self.ID_EXIT, "Exit AI Bridge")

        pos = win32gui.GetCursorPos()
        win32gui.SetForegroundWindow(self.hwnd)
        win32gui.TrackPopupMenu(menu, win32con.TPM_RIGHTBUTTON, pos[0], pos[1], 0, self.hwnd, None)
        win32gui.PostMessage(self.hwnd, win32con.WM_NULL, 0, 0)


class AgentGuiApp:
    """Advanced Native Fluent 2 Desktop Application for AI Bridge."""

    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title(WINDOW_TITLE)
        self.cfg = load_agent_config()
        screen_w = self.root.winfo_screenwidth()
        screen_h = self.root.winfo_screenheight()
        win_w = min(1180, max(960, screen_w - 120))
        win_h = min(780, max(620, screen_h - 110))
        pos_x = max(0, (screen_w - win_w) // 2)
        pos_y = max(0, (screen_h - win_h) // 2 - 12)
        default_geometry = f"{win_w}x{win_h}+{pos_x}+{pos_y}"
        saved_geometry = str(self.cfg.get("window_geometry") or "").strip()
        try:
            self.root.geometry(saved_geometry or default_geometry)
        except Exception:
            self.root.geometry(default_geometry)
        self.root.minsize(min(940, win_w), min(600, win_h))

        # Set custom AI Bridge branding icon
        ico_path = _resource_root() / "assets" / "ai-bridge.ico"
        if ico_path.exists():
            try:
                self.root.iconbitmap(str(ico_path))
            except Exception:
                pass

        self.theme_name = self.cfg.get("theme", "dark")
        if self.theme_name not in THEMES:
            self.theme_name = "dark"

        self.running = False
        self.stop_event = threading.Event()
        self.worker_thread: threading.Thread | None = None
        self.poller: Poller | None = None
        self.log_queue: queue.Queue[tuple[str, str]] = queue.Queue()

        # Telemetry string vars
        self.device_id_var = tk.StringVar(value="—")
        self.status_var = tk.StringVar(value="Stopped")
        self.heartbeat_var = tk.StringVar(value="Never")
        self.expiry_var = tk.StringVar(value="—")
        self.latency_var = tk.StringVar(value="Latency —")
        self.tasks_count = 0
        self.tasks_var = tk.StringVar(value="0")

        # Configuration vars
        self.url_var = tk.StringVar(value=self.cfg.get("control_url", "https://jxiptvplayer.app"))
        self.token_var = tk.StringVar(value=self.cfg.get("device_token", ""))
        self.auto_start_var = tk.BooleanVar(value=bool(self.cfg.get("auto_start", True)))
        self.poll_wait_var = tk.IntVar(value=int(self.cfg.get("poll_wait_s", 10)))
        self.minimize_to_tray_var = tk.BooleanVar(value=bool(self.cfg.get("minimize_to_tray", True)))
        self.notifications_var = tk.BooleanVar(value=bool(self.cfg.get("desktop_notifications", True)))
        self.windows_autostart_var = tk.BooleanVar(value=bool(self.cfg.get("autostart_windows", False)))
        self.show_token = False

        # Device Policy & Guardrails state
        self.policy_desktop_enabled = tk.BooleanVar(value=bool(self.cfg.get("desktop_enabled", True)))
        self.policy_allow_tier3 = tk.BooleanVar(value=bool(self.cfg.get("allow_tier3", True)))
        self.policy_max_tier = tk.IntVar(value=int(self.cfg.get("max_tier_unattended", 3)))
        self.policy_allow_writes = tk.BooleanVar(value=bool(self.cfg.get("allow_writes", True)))
        self.policy_allow_shell = tk.BooleanVar(value=bool(self.cfg.get("allow_shell", True)))
        self.policy_allow_package_install = tk.BooleanVar(value=bool(self.cfg.get("allow_package_install", True)))
        self.policy_allowed_apps: list[str] = list(self.cfg.get("allowed_apps") or [
            "chrome", "msedge", "notepad", "calc", "code", "powershell", "cmd", "explorer", "mspaint"
        ])
        self.policy_status_var = tk.StringVar(value="Policy active locally")
        self._quick_app_buttons: dict[str, tk.Button] = {}
        self._app_chips_frame: tk.Frame | None = None
        self._policy_audit: list[dict] = []
        self._policy_snapshot = self._policy_state()
        self._token_expires_at: float | None = None
        self._last_ok_poll: float | None = None
        self._last_poll_error = ""
        self._last_ui_error = ""
        self._spooler = None
        self._spool_failed = False
        self._task_filter_buttons: dict[str, tk.Button] = {}

        # Live system telemetry
        self.cpu_var = tk.StringVar(value="0.0%")
        self.ram_var = tk.StringVar(value="0.0 / 0.0 GB (0%)")
        self.disk_var = tk.StringVar(value="0.0 GB Free (0%)")
        self.host_info_var = tk.StringVar(value=f"{platform.node()} ({platform.system()} {platform.release()})")
        self.ip_var = tk.StringVar(value="127.0.0.1")
        self.uptime_var = tk.StringVar(value="—")
        self.auto_refresh_monitor_var = tk.BooleanVar(value=True)

        # Connection, queue, update and task-filter surfaces
        self.poll_note_var = tk.StringVar(value="No contact yet")
        self.expiry_note_var = tk.StringVar(value="")
        self.queued_var = tk.StringVar(value="0")
        self.update_status_var = tk.StringVar(value=f"Version {APP_VERSION}")
        self.task_search_var = tk.StringVar(value="")
        self.task_filter_var = tk.StringVar(value="all")
        self.log_errors_only_var = tk.BooleanVar(value=False)
        self.pause_scroll_var = tk.BooleanVar(value=False)
        self.task_count_label: tk.Label | None = None
        self.task_search_entry: tk.Entry | None = None

        # Task history structured records (bounded and persisted)
        self.task_history: list[dict] = load_task_history()
        self._selected_task: dict | None = None

        # Screenshot preview state
        self._preview_image_ref = None
        self._last_screenshot_path = ""

        # System tray integration
        self.tray = SystemTrayManager(self)
        self.tray.start()

        # Build Fluent 2 Interface
        try:
            self.active_tab_idx = max(0, min(int(self.cfg.get("last_tab", 0)), len(NAV_PAGES) - 1))
        except Exception:
            self.active_tab_idx = 0
        self._tab_buttons: list[tk.Button] = []
        self._tab_frames: list[tk.Frame] = []

        self._build_shell()
        self._apply_theme()
        self.root.report_callback_exception = self._on_tk_exception
        self._bind_shortcuts()
        if self.cfg.get("window_maximized"):
            try:
                self.root.state("zoomed")
            except Exception:
                pass
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self.root.after(150, self._drain_logs)
        self.root.after(800, self._system_monitor_loop)
        self.root.after(1500, self._queue_loop)
        self.root.after(4000, self.check_for_updates_async)

        if self.auto_start_var.get() and self.token_var.get().strip():
            self.log("Auto-start enabled. Connecting to control plane...", "info")
            self.root.after(400, self.start_agent)
        else:
            self.log("AI Bridge Windows Client ready. Click 'Start Agent' to begin polling.", "info")

    def _build_shell(self) -> None:
        """Compose the application shell (sidebar, header, content, activity dock)."""
        build_shell(self)

    def select_tab(self, idx: int) -> None:
        """Switch the active page."""
        ui_select_tab(self, idx)

    def _build_overview_tab(self, parent: tk.Frame) -> None:
        """Connection, session controls, KPIs and local guardrails."""
        build_overview(self, parent)

    def _build_tasks_tab(self, parent: tk.Frame) -> None:
        """Task table with the payload inspector."""
        build_tasks(self, parent)

    def _on_task_tree_select(self, event=None) -> None:
        sel = self.task_tree.selection()
        if not sel:
            return
        task_id = sel[0]
        found = next((t for t in self.task_history if t["id"] == task_id), None)
        if not found:
            return
        self._selected_task = found
        self.insp_meta_label.configure(
            text=f"Task: {found['id']} | Tool: {found['tool']} | Status: {found['status'].upper()} | Took: {found.get('duration_s', 0):.2f}s"
        )
        self.insp_text.delete("1.0", "end")
        payload = {
            "task_id": found["id"],
            "tool": found["tool"],
            "time": found["time"],
            "duration_seconds": found.get("duration_s", 0),
            "status": found["status"],
            "arguments": found.get("args", {}),
            "result": found.get("result", ""),
        }
        self.insp_text.insert("end", json.dumps(payload, indent=2, default=str))

    def _copy_inspector_payload(self) -> None:
        content = self.insp_text.get("1.0", "end").strip()
        if not content:
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(content)
        self.log("Copied task payload to clipboard.", "info")

    def _clear_task_history(self) -> None:
        self.task_history.clear()
        save_task_history(self.task_history)
        if hasattr(self, "task_tree") and self.task_tree.winfo_exists():
            for item in self.task_tree.get_children():
                self.task_tree.delete(item)
        if hasattr(self, "insp_text"):
            self.insp_text.delete("1.0", "end")
            self.insp_meta_label.configure(text="Task history cleared.")
        self._update_task_count()

    # -------------------------------------------------------------------------
    # TASK TABLE: FILTERING, BOUNDS AND PERSISTENCE
    # -------------------------------------------------------------------------
    @staticmethod
    def _needs_approval(record: dict) -> bool:
        """A task the policy refused because no human approval was attached."""
        return record.get("status") == "failed" and str(record.get("result", "")).startswith("denied:")

    def _task_matches(self, record: dict) -> bool:
        query = self.task_search_var.get().strip().lower()
        if query:
            haystack = " ".join(str(record.get(key, "")) for key in ("id", "tool", "status", "result")).lower()
            if query not in haystack:
                return False
        kind = self.task_filter_var.get()
        if kind == "completed":
            return record.get("status") == "completed"
        if kind == "failed":
            return record.get("status") == "failed"
        if kind == "approval":
            return self._needs_approval(record)
        return True

    def _set_task_filter(self, kind: str) -> None:
        self.task_filter_var.set(kind)
        self._update_task_filter_buttons()
        self._refresh_task_table()

    def _update_task_filter_buttons(self) -> None:
        t = THEMES[self.theme_name]
        active = self.task_filter_var.get()
        for kind, btn in self._task_filter_buttons.items():
            if not btn.winfo_exists():
                continue
            selected = kind == active
            btn.configure(
                bg=t["accent_soft"] if selected else t["card"],
                fg=t["brand"] if selected else t["fg_muted"],
                font=ui_font(8, "bold" if selected else "normal"),
            )

    def _refresh_task_table(self) -> None:
        if not hasattr(self, "task_tree") or not self.task_tree.winfo_exists():
            return
        for item in self.task_tree.get_children():
            self.task_tree.delete(item)
        shown = [record for record in self.task_history if self._task_matches(record)]
        for index, record in enumerate(reversed(shown)):
            self.task_tree.insert(
                "",
                "end",
                iid=record["id"],
                values=(
                    record.get("time", ""),
                    str(record["id"])[:8],
                    record.get("tool", ""),
                    f"{record.get('duration_s', 0):.2f}s",
                    str(record.get("status", "")).upper(),
                ),
                tags=("even" if index % 2 == 0 else "odd",),
            )
        self._update_task_count(len(shown))

    def _update_task_count(self, shown: int | None = None) -> None:
        label = getattr(self, "task_count_label", None)
        if label is None or not label.winfo_exists():
            return
        total = len(self.task_history)
        if shown is None or shown == total:
            label.configure(text=f"{total} received")
        else:
            label.configure(text=f"{shown} of {total} shown")

    # -------------------------------------------------------------------------
    # TAB 3: SYSTEM MONITOR
    # -------------------------------------------------------------------------
    def _build_monitor_tab(self, parent: tk.Frame) -> None:
        """Donut gauges plus the host specification grid."""
        build_monitor(self, parent)

    def _refresh_system_monitor(self) -> None:
        data = gather_system_telemetry()
        self.cpu_var.set(f"{data['cpu_percent']:.1f}% ({data['cpu_count']} Cores)")
        self.ram_var.set(f"{data['memory_used_gb']} / {data['memory_total_gb']} GB ({data['memory_percent']}%)")
        self.disk_var.set(f"{data['disk_free_gb']} GB Free / {data['disk_total_gb']} GB ({data['disk_percent']}%)")
        self.ip_var.set(data["ip_address"])
        self.uptime_var.set(data["uptime"])
        redraw_gauges(self)

    def _system_monitor_loop(self) -> None:
        if self.auto_refresh_monitor_var.get() and self.active_tab_idx == 2:
            self._refresh_system_monitor()
        self.root.after(2000, self._system_monitor_loop)

    # -------------------------------------------------------------------------
    # TAB 4: DESKTOP VISION & SCREEN PREVIEW
    # -------------------------------------------------------------------------
    def _build_vision_tab(self, parent: tk.Frame) -> None:
        """Viewport preview and capture diagnostics."""
        build_vision(self, parent)

    def get_current_policy(self):
        """Construct the active Policy instance from current UI and configuration settings."""
        from ai_bridge.policy import Policy

        return Policy(
            allow_writes=bool(self.policy_allow_writes.get()),
            allow_tier3=bool(self.policy_allow_tier3.get()),
            desktop_enabled=bool(self.policy_desktop_enabled.get()),
            max_tier_unattended=int(self.policy_max_tier.get()),
            allowed_apps=frozenset(self.policy_allowed_apps),
        )

    def capture_preview_screenshot(self) -> None:
        """Capture a live screenshot and render in the Desktop Vision tab."""
        t0 = time.time()
        try:
            from ai_bridge import tools
            from ai_bridge.policy import Policy

            cur_pol = self.get_current_policy()
            test_policy = Policy(
                allow_writes=cur_pol.allow_writes,
                allow_tier3=True,
                desktop_enabled=True,
                max_tier_unattended=max(cur_pol.max_tier_unattended, 3),
                allowed_apps=cur_pol.allowed_apps,
            )
            res = tools.capture_desktop_screenshot(approval_granted=True, policy=test_policy)
            elapsed = (time.time() - t0) * 1000

            if not res.get("available") and "path" not in res:
                self.log(f"Screenshot unavailable: {res.get('note', 'unsupported session')}", "warn")
                messagebox.showwarning("Desktop Vision", res.get("note", "Screen capture unavailable."))
                return

            path = res.get("path")
            self._last_screenshot_path = path

            # Render preview image
            from PIL import Image, ImageTk

            img = Image.open(path)
            orig_w, orig_h = img.size

            # Resize to fit viewport canvas (max 520x300)
            max_w, max_h = 520, 300
            ratio = min(max_w / orig_w, max_h / orig_h)
            new_size = (max(1, int(orig_w * ratio)), max(1, int(orig_h * ratio)))
            resized = img.resize(new_size, Image.Resampling.LANCZOS)

            self._preview_image_ref = ImageTk.PhotoImage(resized)

            if hasattr(self, "vision_canvas"):
                self.vision_canvas.delete("all")
                # Center image on canvas
                canvas_w = max(self.vision_canvas.winfo_width(), max_w)
                canvas_h = max(self.vision_canvas.winfo_height(), max_h)
                self.vision_canvas.create_image(
                    canvas_w // 2,
                    canvas_h // 2,
                    image=self._preview_image_ref,
                )

            meta_info = (
                f"Resolution: {orig_w}x{orig_h}\n"
                f"Latency: {elapsed:.1f} ms\n"
                f"File Size: {os.path.getsize(path) / 1024:.1f} KB\n"
                f"Path: {path}"
            )
            if hasattr(self, "vision_meta_label"):
                self.vision_meta_label.configure(text=meta_info)

            self.log(f"Captured test screenshot ({orig_w}x{orig_h}, {elapsed:.1f}ms)", "ok")

        except Exception as exc:
            self.log(f"Capture failed: {exc}", "err")
            messagebox.showerror("Capture Error", str(exc))

    def _open_screenshot_in_viewer(self) -> None:
        if not self._last_screenshot_path or not Path(self._last_screenshot_path).exists():
            messagebox.showinfo("Desktop Vision", "Please capture a test screenshot first.")
            return
        try:
            os.startfile(self._last_screenshot_path)
        except Exception:
            webbrowser.open(f"file:///{self._last_screenshot_path.replace(os.sep, '/')}")

    def _copy_screenshot_path(self) -> None:
        if not self._last_screenshot_path:
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(self._last_screenshot_path)
        self.log(f"Copied screenshot path ({self._last_screenshot_path})", "info")

    def _policy_state(self) -> dict:
        """The device policy as currently expressed by the UI."""
        return {
            "desktop_enabled": bool(self.policy_desktop_enabled.get()),
            "allow_tier3": bool(self.policy_allow_tier3.get()),
            "max_tier_unattended": int(self.policy_max_tier.get()),
            "allow_writes": bool(self.policy_allow_writes.get()),
            "allow_shell": bool(self.policy_allow_shell.get()),
            "allow_package_install": bool(self.policy_allow_package_install.get()),
            "allowed_apps": sorted(self.policy_allowed_apps),
        }

    def _policy_diff(self) -> list[str]:
        """Human-readable differences between the applied policy and the UI."""
        before = self._policy_snapshot
        after = self._policy_state()
        changes = [
            f"{key.replace('_', ' ')}: {before.get(key)} -> {value}"
            for key, value in after.items()
            if key != "allowed_apps" and before.get(key) != value
        ]
        added = sorted(set(after["allowed_apps"]) - set(before.get("allowed_apps") or []))
        removed = sorted(set(before.get("allowed_apps") or []) - set(after["allowed_apps"]))
        if added:
            changes.append(f"apps added: {', '.join(added)}")
        if removed:
            changes.append(f"apps removed: {', '.join(removed)}")
        return changes

    def _record_policy_change(self, changes: list[str]) -> None:
        entry = {"time": time.strftime("%H:%M:%S"), "summary": "; ".join(changes)[:200]}
        self._policy_audit.insert(0, entry)
        del self._policy_audit[6:]
        self.log(f"Policy change applied: {entry['summary']}", "ok")

    def _mark_policy_synced(self, state_text: str) -> None:
        """Record that the UI and the control plane now agree."""
        self.policy_status_var.set(state_text)
        self._policy_snapshot = self._policy_state()

    def save_and_apply_policy(self, confirm: bool = True) -> None:
        """Apply the UI policy, showing what changes before it takes effect."""
        changes = self._policy_diff()
        if changes and confirm:
            preview = "\n".join(f"\u2022  {line}" for line in changes[:12])
            if len(changes) > 12:
                preview += f"\n\u2022  and {len(changes) - 12} more"
            if not messagebox.askyesno(
                "Apply policy changes",
                f"These take effect immediately for agents on this device:\n\n{preview}\n\nApply now?",
            ):
                self.log("Policy changes discarded.", "info")
                return
        if changes:
            self._record_policy_change(changes)
        self.save_current_config()
        self._policy_snapshot = self._policy_state()
        self.sync_policy_to_server(notify_ui=True)

    def sync_policy_to_server(self, notify_ui: bool = True) -> None:
        """Push current device execution policy and allowed apps to the control plane."""
        url = self.url_var.get().strip().rstrip("/")
        tok = self.token_var.get().strip()
        if not url or not tok:
            if notify_ui:
                messagebox.showwarning("Policy Sync", "Control Plane URL and Device Token are required to sync policy.")
            return

        payload = {
            "inherit_global": False,
            "desktop_enabled": bool(self.policy_desktop_enabled.get()),
            "allow_tier3": bool(self.policy_allow_tier3.get()),
            "max_tier_unattended": int(self.policy_max_tier.get()),
            "allow_writes": bool(self.policy_allow_writes.get()),
            "allow_shell": bool(self.policy_allow_shell.get()),
            "allow_package_install": bool(self.policy_allow_package_install.get()),
            "allowed_apps": list(self.policy_allowed_apps),
            "note": "Configured via Windows Client Policy Manager",
        }

        def _do_sync():
            try:
                data = json.dumps(payload).encode("utf-8")
                req = urllib.request.Request(
                    f"{url}/api/agent/policy",
                    data=data,
                    headers={
                        "Content-Type": "application/json",
                        "X-Device-Token": tok,
                        "User-Agent": "AI-Bridge-Windows-Client/2.0",
                    },
                    method="PUT",
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    json.loads(resp.read().decode("utf-8"))
                    msg = "Policy synchronized successfully with Control Plane."
                    self.root.after(0, lambda: self._mark_policy_synced("Synced with Cloud ✓"))
                    self.log(msg, "ok")
                    if notify_ui:
                        self.root.after(0, lambda: messagebox.showinfo("Policy Synchronized", msg))
            except Exception as exc:
                err_msg = f"Policy cloud sync failed: {exc}"
                self.root.after(0, lambda: self.policy_status_var.set("Sync Failed ✕"))
                self.log(err_msg, "warn")
                if notify_ui:
                    self.root.after(0, lambda: messagebox.showerror("Sync Error", err_msg))

        threading.Thread(target=_do_sync, daemon=True).start()

    def fetch_policy_from_server(self, notify_ui: bool = True) -> None:
        """Fetch remote device execution policy and allowed apps from control plane."""
        url = self.url_var.get().strip().rstrip("/")
        tok = self.token_var.get().strip()
        if not url or not tok:
            if notify_ui:
                messagebox.showwarning("Policy Sync", "Control Plane URL and Device Token are required.")
            return

        def _do_fetch():
            try:
                req = urllib.request.Request(
                    f"{url}/api/agent/policy",
                    headers={
                        "X-Device-Token": tok,
                        "User-Agent": "AI-Bridge-Windows-Client/2.0",
                    },
                    method="GET",
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    eff = data.get("custom_policy") or data.get("effective_policy") or {}
                    if not eff:
                        return

                    def _apply():
                        if "desktop_enabled" in eff and eff["desktop_enabled"] is not None:
                            self.policy_desktop_enabled.set(bool(eff["desktop_enabled"]))
                        if "allow_tier3" in eff and eff["allow_tier3"] is not None:
                            self.policy_allow_tier3.set(bool(eff["allow_tier3"]))
                        if "max_tier_unattended" in eff and eff["max_tier_unattended"] is not None:
                            self.policy_max_tier.set(int(eff["max_tier_unattended"]))
                        if "allow_writes" in eff and eff["allow_writes"] is not None:
                            self.policy_allow_writes.set(bool(eff["allow_writes"]))
                        if "allow_shell" in eff and eff["allow_shell"] is not None:
                            self.policy_allow_shell.set(bool(eff["allow_shell"]))
                        if "allow_package_install" in eff and eff["allow_package_install"] is not None:
                            self.policy_allow_package_install.set(bool(eff["allow_package_install"]))
                        if "allowed_apps" in eff and isinstance(eff["allowed_apps"], list):
                            self.policy_allowed_apps = list(eff["allowed_apps"])
                            self._render_allowed_app_chips()
                            self._update_quick_app_buttons()

                        self.save_current_config()
                        self._mark_policy_synced("Synced from Cloud ✓")
                        self.log("Fetched and applied device policy from Control Plane.", "ok")
                        if notify_ui:
                            messagebox.showinfo("Policy Sync", "Successfully loaded policy settings from server.")

                    self.root.after(0, _apply)
            except Exception as exc:
                err_msg = f"Failed to fetch policy from server: {exc}"
                self.log(err_msg, "warn")
                if notify_ui:
                    self.root.after(0, lambda: messagebox.showerror("Sync Error", err_msg))

        threading.Thread(target=_do_fetch, daemon=True).start()

    def toggle_quick_app(self, app_id: str) -> None:
        """Toggle an application in the allowed apps list."""
        if app_id in self.policy_allowed_apps:
            self.policy_allowed_apps.remove(app_id)
            self.log(f"Disallowed app '{app_id}'.", "info")
        else:
            self.policy_allowed_apps.append(app_id)
            self.log(f"Allowed app '{app_id}'.", "ok")
        self._render_allowed_app_chips()
        self._update_quick_app_buttons()
        self.save_current_config()

    def add_custom_app(self, app_name: str) -> None:
        """Add custom executable to allowed applications."""
        clean = app_name.strip().lower()
        if clean.endswith(".exe"):
            clean = clean[:-4]
        if not clean:
            return
        if clean not in self.policy_allowed_apps:
            self.policy_allowed_apps.append(clean)
            self._render_allowed_app_chips()
            self._update_quick_app_buttons()
            self.save_current_config()
            self.log(f"Added '{clean}' to allowed Windows applications.", "ok")

    def disallow_app(self, app_name: str) -> None:
        """Remove application from allowed list."""
        if app_name in self.policy_allowed_apps:
            self.policy_allowed_apps.remove(app_name)
            self._render_allowed_app_chips()
            self._update_quick_app_buttons()
            self.save_current_config()
            self.log(f"Disallowed '{app_name}'.", "info")

    def allow_all_standard_apps(self) -> None:
        """Add all common standard Windows applications."""
        for _, app_id in COMMON_WINDOWS_APPS:
            if app_id not in self.policy_allowed_apps:
                self.policy_allowed_apps.append(app_id)
        self._render_allowed_app_chips()
        self._update_quick_app_buttons()
        self.save_current_config()
        self.log("Allowed all standard Windows applications.", "ok")

    def disallow_all_apps(self) -> None:
        """Clear all allowed applications."""
        self.policy_allowed_apps.clear()
        self._render_allowed_app_chips()
        self._update_quick_app_buttons()
        self.save_current_config()
        self.log("Disallowed all applications.", "warn")

    def apply_full_desktop_preset(self) -> None:
        """Apply Full AI Desktop Control preset (unattended mouse, keyboard, screenshots, writes, and apps)."""
        self.policy_desktop_enabled.set(True)
        self.policy_allow_tier3.set(True)
        self.policy_max_tier.set(3)
        self.policy_allow_writes.set(True)
        self.policy_allow_shell.set(True)
        self.policy_allow_package_install.set(True)
        if "*" not in self.policy_allowed_apps:
            self.policy_allowed_apps.append("*")
        self._render_allowed_app_chips()
        self._update_quick_app_buttons()
        self.save_and_apply_policy(confirm=False)
        self.log("Applied 'Full AI Desktop Control' preset (ChatGPT & Claude can control mouse/keyboard unattended).", "ok")
        messagebox.showinfo(
            "AI Desktop Control Enabled",
            "Full AI Desktop Control is now active!\n\n"
            "• ChatGPT, Claude, and MCP agents can control mouse and keyboard\n"
            "• Screenshots and live window inspection enabled\n"
            "• Unattended execution enabled (no manual approval prompts)\n"
            "• Policy synchronized with cloud control plane."
        )

    def apply_workstation_preset(self) -> None:
        """Apply Standard Workstation preset."""
        self.policy_desktop_enabled.set(True)
        self.policy_allow_tier3.set(True)
        self.policy_max_tier.set(2)
        self.policy_allow_writes.set(True)
        self.policy_allow_shell.set(True)
        self.policy_allow_package_install.set(False)
        self.save_and_apply_policy(confirm=False)
        self.log("Applied 'Standard Workstation' preset.", "ok")

    def apply_lockdown_preset(self) -> None:
        """Apply Read-Only Lockdown preset."""
        self.policy_desktop_enabled.set(False)
        self.policy_allow_tier3.set(False)
        self.policy_max_tier.set(1)
        self.policy_allow_writes.set(False)
        self.policy_allow_shell.set(False)
        self.policy_allow_package_install.set(False)
        self.save_and_apply_policy(confirm=False)
        self.log("Applied 'Read-Only Lockdown' preset.", "warn")

    def _update_quick_app_buttons(self) -> None:
        """Refresh styling and active state on the quick application toggles."""
        t = THEMES[self.theme_name]
        for label, app_id in COMMON_WINDOWS_APPS:
            btn = self._quick_app_buttons.get(app_id)
            if not btn or not btn.winfo_exists():
                continue
            allowed = app_id in self.policy_allowed_apps
            btn.configure(
                text=f"\u2713 {label}" if allowed else label,
                bg=t["success_bg"] if allowed else t["card_alt"],
                fg=t["success_fg"] if allowed else t["fg_muted"],
                activebackground=t["accent_soft"] if allowed else t["border"],
                activeforeground=t["fg"],
                highlightbackground=t["success_border"] if allowed else t["border"],
                highlightthickness=1,
                font=ui_font(8, "bold" if allowed else "normal"),
            )

    def _render_allowed_app_chips(self) -> None:
        """Render the allowlist as removable chips."""
        if not self._app_chips_frame or not self._app_chips_frame.winfo_exists():
            return
        t = THEMES[self.theme_name]
        for widget in self._app_chips_frame.winfo_children():
            widget.destroy()

        if not self.policy_allowed_apps:
            tk.Label(
                self._app_chips_frame,
                text="No applications allowed - desktop automation cannot launch any executable.",
                bg=t["card"],
                fg=t["warn_fg"],
                font=ui_font(9),
                anchor="w",
                justify="left",
            ).pack(fill="x", pady=4)
            return

        row = None
        for index, app_name in enumerate(sorted(self.policy_allowed_apps)):
            if index % 6 == 0:
                row = tk.Frame(self._app_chips_frame, bg=t["card"])
                row.pack(fill="x", pady=3)
            chip = tk.Frame(row, bg=t["card_alt"], highlightthickness=1, highlightbackground=t["border"])
            chip.pack(side="left", padx=(0, 6))
            tk.Label(
                chip, text=app_name, bg=t["card_alt"], fg=t["fg"], font=mono_font(8, "bold"), padx=8, pady=3
            ).pack(side="left")
            close = tk.Label(
                chip,
                text="\u2715",
                bg=t["card_alt"],
                fg=t["fg_subtle"],
                font=ui_font(8, "bold"),
                padx=6,
                pady=3,
                cursor="hand2",
            )
            close.pack(side="left")
            close.bind("<Button-1>", lambda _event, a=app_name: self.disallow_app(a))
            close.bind("<Enter>", lambda _event, w=close: w.configure(fg=t["danger_bg"]))
            close.bind("<Leave>", lambda _event, w=close: w.configure(fg=t["fg_subtle"]))

    def _build_security_tab(self, parent: tk.Frame) -> None:
        """Device policy: presets, guardrails, tier ceiling, allowlist and risk matrix."""
        build_security(self, parent)

    def _build_settings_tab(self, parent: tk.Frame) -> None:
        """Windows integration, poller tuning and diagnostics."""
        build_settings(self, parent)

    def _on_autostart_toggle(self) -> None:
        enabled = self.windows_autostart_var.get()
        success = set_windows_autostart(enabled)
        if success:
            self.log(f"Windows startup {'enabled' if enabled else 'disabled'} successfully.", "ok")
        else:
            self.log("Failed to update Windows startup registry entry.", "warn")
        self.save_current_config()

    def _reset_defaults(self) -> None:
        if not messagebox.askyesno("Reset Configuration", "Reset all settings to default values?"):
            return
        self.poll_wait_var.set(10)
        self.minimize_to_tray_var.set(True)
        self.notifications_var.set(True)
        self.windows_autostart_var.set(False)
        set_windows_autostart(False)
        self.save_current_config()
        self.log("Configuration reset to defaults.", "info")

    # -------------------------------------------------------------------------
    # SHARED HELPERS & LOGIC
    # -------------------------------------------------------------------------
    def _make_kpi_tile(
        self,
        parent: tk.Frame,
        col: int,
        title: str,
        var: tk.StringVar,
        *,
        copy_btn: bool = False,
    ) -> None:
        t = THEMES[self.theme_name]
        tile = tk.Frame(parent, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        tile.grid(row=0, column=col, sticky="nsew", padx=(0 if col == 0 else 6, 0))

        top_row = tk.Frame(tile, bg=t["card"])
        top_row.pack(fill="x", padx=12, pady=(6, 2))
        tk.Label(
            top_row,
            text=title,
            bg=t["card"],
            fg=t["fg_muted"],
            font=("Segoe UI", 8, "bold"),
        ).pack(side="left")

        if copy_btn:
            tk.Button(
                top_row,
                text="Copy",
                command=self._copy_device_id,
                bg=t["card_alt"],
                fg=t["fg_muted"],
                relief="flat",
                font=("Segoe UI", 7, "bold"),
                padx=5,
                pady=0,
                cursor="hand2",
            ).pack(side="right")

        tk.Label(
            tile,
            textvariable=var,
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 11, "bold"),
            anchor="w",
        ).pack(fill="x", padx=12, pady=(0, 6))

    def _apply_theme(self) -> None:
        """Repaint status surfaces that are not rebuilt on a state change."""
        paint_status_pill(self)

    def toggle_theme(self) -> None:
        self.theme_name = "light" if self.theme_name == "dark" else "dark"
        self.cfg["theme"] = self.theme_name
        save_agent_config(self.cfg)
        self._build_shell()
        self._apply_theme()

    def _toggle_token_vis(self) -> None:
        self.show_token = not self.show_token
        self.tok_entry.configure(show="" if self.show_token else "•")
        self.show_btn.configure(text="Hide" if self.show_token else "Show")

    def _copy_token(self) -> None:
        tok = self.token_var.get().strip()
        if not tok:
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(tok)
        self.log("Copied Device Token to clipboard.", "info")

    def reload_token_from_disk(self) -> None:
        """Reload device token from ~/.ai-bridge/device.token."""
        if TOKEN_FILE.exists():
            try:
                tok = runtime.load_token(TOKEN_FILE)
                if tok:
                    self.token_var.set(tok)
                    self.save_current_config()
                    self.log(f"Reloaded valid device token from disk: {runtime.mask_secret(tok)}", "ok")
                    messagebox.showinfo("Token Loaded", f"Device token reloaded successfully from {TOKEN_FILE}!")
                    return
            except Exception as exc:
                messagebox.showerror("Error", f"Failed to read token file: {exc}")
                return
        messagebox.showwarning("File Not Found", f"No token file found at {TOKEN_FILE}")

    def _copy_device_id(self) -> None:
        did = self.device_id_var.get().strip()
        if not did or did == "—":
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(did)
        self.log(f"Copied Device ID ({did}) to clipboard.", "info")

    def open_dashboard(self) -> None:
        url = self.url_var.get().strip() or "https://jxiptvplayer.app"
        webbrowser.open(url)

    def ping_server(self) -> None:
        """Execute non-blocking ping and update latency."""
        url = self.url_var.get().strip()
        if not url:
            messagebox.showwarning("Ping Server", "Please enter a Control Plane URL.")
            return

        def _do_ping():
            ok, lat, detail = test_connection_ping(url)
            if ok:
                self.root.after(0, lambda: self.latency_var.set(f"{lat:.0f} ms"))
                self.log(f"Ping {url} -> {detail} ({lat:.1f} ms)", "ok")
            else:
                self.root.after(0, lambda: self.latency_var.set("Failed"))
                self.log(f"Ping {url} failed: {detail} ({lat:.1f} ms)", "warn")

        threading.Thread(target=_do_ping, daemon=True).start()

    def save_current_config(self) -> None:
        self.cfg["control_url"] = self.url_var.get().strip()
        self.cfg["device_token"] = self.token_var.get().strip()
        self.cfg["auto_start"] = bool(self.auto_start_var.get())
        self.cfg["poll_wait_s"] = int(self.poll_wait_var.get())
        self.cfg["minimize_to_tray"] = bool(self.minimize_to_tray_var.get())
        self.cfg["desktop_notifications"] = bool(self.notifications_var.get())
        self.cfg["autostart_windows"] = bool(self.windows_autostart_var.get())
        self.cfg["theme"] = self.theme_name

        self.cfg["desktop_enabled"] = bool(self.policy_desktop_enabled.get())
        self.cfg["allow_tier3"] = bool(self.policy_allow_tier3.get())
        self.cfg["max_tier_unattended"] = int(self.policy_max_tier.get())
        self.cfg["allow_writes"] = bool(self.policy_allow_writes.get())
        self.cfg["allow_shell"] = bool(self.policy_allow_shell.get())
        self.cfg["allow_package_install"] = bool(self.policy_allow_package_install.get())
        self.cfg["allowed_apps"] = list(self.policy_allowed_apps)

        save_agent_config(self.cfg)
        if self.poller:
            cur_pol = self.get_current_policy()
            self.poller._explicit_policy = cur_pol
            self.poller.policy = cur_pol
        self.log("Saved agent configuration and policy to ~/.ai-bridge/agent_gui.json", "ok")

    def export_logs(self) -> None:
        """Export current log contents to a text file."""
        if not hasattr(self, "log_text"):
            return
        path = filedialog.asksaveasfilename(
            defaultextension=".txt",
            filetypes=[("Text files", "*.txt"), ("Log files", "*.log"), ("All files", "*.*")],
            initialfile=f"ai_bridge_logs_{time.strftime('%Y%m%d_%H%M%S')}.txt",
        )
        if not path:
            return
        try:
            content = self.log_text.get("1.0", "end")
            Path(path).write_text(content, encoding="utf-8")
            self.log(f"Exported session logs to {path}", "ok")
            messagebox.showinfo("Export Logs", f"Logs successfully exported to:\n{path}")
        except Exception as exc:
            self.log(f"Export failed: {exc}", "err")
            messagebox.showerror("Export Error", str(exc))

    def _clear_log(self) -> None:
        if hasattr(self, "log_text"):
            self.log_text.configure(state="normal")
            self.log_text.delete("1.0", "end")
            self.log_text.configure(state="disabled")

    def log(self, message: str, tag: str = "info") -> None:
        ts = time.strftime("%H:%M:%S")
        self.log_queue.put((f"[{ts}] {message}\n", tag))
        _LOGGER.log(_LOG_LEVELS.get(tag, logging.INFO), "%s", message)

    def _drain_logs(self) -> None:
        try:
            while True:
                line, tag = self.log_queue.get_nowait()
                if self.log_errors_only_var.get() and tag not in ("warn", "err"):
                    continue
                if hasattr(self, "log_text") and self.log_text.winfo_exists():
                    self.log_text.configure(state="normal")
                    self.log_text.insert("end", line, tag)
                    if not self.pause_scroll_var.get():
                        self.log_text.see("end")
                    self.log_text.configure(state="disabled")
        except queue.Empty:
            pass
        self.root.after(120, self._drain_logs)

    # -------------------------------------------------------------------------
    # AGENT POLLER WORKER LOOP
    # -------------------------------------------------------------------------
    def toggle_agent(self) -> None:
        if self.running:
            self.stop_agent()
        else:
            self.start_agent()

    def start_agent(self) -> None:
        if self.running:
            return
        # If token in memory is empty or a dummy test token, automatically reload valid token from disk
        if TOKEN_FILE.exists():
            try:
                disk_tok = runtime.load_token(TOKEN_FILE)
                if disk_tok and (not self.token_var.get().strip() or "test-token" in self.token_var.get()):
                    self.token_var.set(disk_tok)
                    self.log(f"Loaded valid device token from disk: {runtime.mask_secret(disk_tok)}", "ok")
            except Exception:
                pass
        url = self.url_var.get().strip()
        tok = self.token_var.get().strip()
        if not url or not tok:
            messagebox.showwarning(
                "Missing Credentials",
                "Please enter both the Control Plane URL and your assigned Device Token (provided by your administrator).",
            )
            return
        self.save_current_config()
        self.running = True
        self.stop_event.clear()
        t = THEMES[self.theme_name]
        if hasattr(self, "start_stop_btn"):
            if getattr(self, "start_stop_btn", None) is not None and self.start_stop_btn.winfo_exists():
                self.start_stop_btn.configure(text="■  Stop agent", bg=t["danger_bg"], fg=t["danger_fg"])
        self.status_var.set("● Connecting…")
        self._apply_theme()

        self.worker_thread = threading.Thread(target=self._poll_loop, args=(url, tok), daemon=True)
        self.worker_thread.start()

    def stop_agent(self) -> None:
        if not self.running:
            return
        self.running = False
        self.stop_event.set()
        t = THEMES[self.theme_name]
        if hasattr(self, "start_stop_btn"):
            if getattr(self, "start_stop_btn", None) is not None and self.start_stop_btn.winfo_exists():
                self.start_stop_btn.configure(text="▶  Start agent", bg=t["brand"], fg=t["brand_fg"])
        self.status_var.set("Stopped")
        self._apply_theme()
        self.log("Stopping agent polling loop...", "warn")

    def _poll_loop(self, url: str, tok: str) -> None:
        local_policy = self.get_current_policy()
        poller = Poller(
            url,
            tok,
            policy=local_policy,
            token_file=TOKEN_FILE,
            # Keep rotated tokens sealed instead of letting the poller write plaintext.
            token_saver=lambda t: runtime.save_token(t, TOKEN_FILE),
            token_loader=lambda: runtime.load_token(TOKEN_FILE, default="") or None,
        )
        self.poller = poller
        wait_s = max(5, min(self.poll_wait_var.get(), 60))
        self.log(f"Agent started polling {url} (long-poll wait={wait_s}s)", "ok")
        had_error = False

        # Attempt background cloud policy sync on connection
        self.root.after(1000, lambda: self.sync_policy_to_server(notify_ui=False))

        while not self.stop_event.is_set():
            try:
                hb = poller.heartbeat()
                if poller.device_token != self.token_var.get():
                    self.root.after(0, lambda nt=poller.device_token: self.token_var.set(nt))
                    self.log("Device token auto-rotated and saved.", "ok")

                did = hb.get("device_id") or "—"
                exp = hb.get("token_expires_at")
                exp_str = f"in {max(0, int((exp - time.time()) / 3600))}h" if isinstance(exp, (int, float)) else "—"
                now_str = time.strftime("%H:%M:%S")

                self._last_ok_poll = time.time()
                self._last_poll_error = ""
                self.root.after(
                    0,
                    lambda d=did, n=now_str, e=exp_str, x=exp: self._update_telemetry(
                        d, n, e, x if isinstance(x, (int, float)) else None
                    ),
                )

                if had_error:
                    self.log("Agent reconnected to control plane (OK).", "ok")
                    had_error = False

                nxt = poller._req("GET", f"/api/agent/tasks/next?wait={wait_s}", timeout=wait_s + 6)
                if self.stop_event.is_set():
                    break
                task = nxt.get("task")
                if not task:
                    poller.backoff = 2.0
                    continue

                task_id = task["id"]
                tool_name = task["tool"]
                self.root.after(0, lambda tl=tool_name: self.status_var.set(f"● Running {tl}"))
                self.log(f"Executing task {task_id} -> {tool_name}", "info")
                t0 = time.time()

                try:
                    from ai_bridge.control.dispatch import dispatch

                    args = json.loads(task.get("args_json") or "{}")
                    eff_policy = poller._effective_policy(task.get("policy"))
                    result = dispatch(
                        tool_name,
                        args,
                        policy=eff_policy,
                        approval_granted=bool(task.get("approval_granted")),
                    )
                    status = "completed"
                    text = json.dumps(result, default=str)[:512_000]
                except PermissionError as exc:
                    status, text = "failed", f"denied: {exc}"
                    args = {}
                except Exception as exc:
                    status, text = "failed", f"{type(exc).__name__}: {exc}"
                    args = {}

                elapsed = time.time() - t0
                poller._req("POST", f"/api/agent/tasks/{task_id}/result", {"status": status, "result": text})
                self.tasks_count += 1

                # Record task in structured history
                task_record = {
                    "id": task_id,
                    "tool": tool_name,
                    "time": time.strftime("%H:%M:%S"),
                    "duration_s": round(elapsed, 2),
                    "status": status,
                    "args": args,
                    "result": text,
                }
                self.root.after(0, lambda r=task_record: self._append_task_record(r))
                self.root.after(0, lambda c=self.tasks_count: self.tasks_var.set(str(c)))
                self.root.after(0, lambda: self.status_var.set("● Online & Polling"))

                self.log(
                    f"Task {task_id} ({tool_name}) -> {status} ({elapsed:.2f}s)",
                    "ok" if status == "completed" else "err",
                )

                if self.notifications_var.get():
                    self.tray.notify(
                        f"Task Executed: {tool_name}",
                        f"Status: {status.upper()} in {elapsed:.2f}s",
                    )

                poller.backoff = 2.0
            except Exception as exc:
                if self.stop_event.is_set():
                    break
                had_error = True
                wait_time = poller.backoff
                err_msg = str(exc)
                if "401" in err_msg:
                    self.root.after(0, lambda: self.status_var.set("✕ 401 Unauthorized"))
                    self.log(
                        "Authentication failed: Device Token is invalid or expired (HTTP 401). "
                        "Click 'Reload' next to Token or paste your valid Device Token in Settings.",
                        "err",
                    )
                else:
                    self.root.after(0, lambda w=wait_time: self.status_var.set(f"● Retry in {w:.0f}s"))
                    self.log(f"Connection issue (retry in {wait_time:.0f}s): {exc}", "warn")
                self._last_poll_error = err_msg[:80]
                self.root.after(
                    0, lambda w=wait_time, m=self._last_poll_error: self._set_poll_note(False, m, w)
                )
                self.stop_event.wait(wait_time)
                poller.backoff = min(poller.backoff * 2, 60.0)

        self.log("Agent polling loop stopped.", "info")

    def _append_task_record(self, record: dict) -> None:
        self.task_history.append(record)
        while len(self.task_history) > TASK_HISTORY_LIMIT:
            dropped = self.task_history.pop(0)
            if hasattr(self, "task_tree") and self.task_tree.exists(dropped["id"]):
                self.task_tree.delete(dropped["id"])
        save_task_history(self.task_history)
        row = (
            record.get("time", ""),
            str(record["id"])[:8],
            record.get("tool", ""),
            f"{record.get('duration_s', 0):.2f}s",
            str(record.get("status", "")).upper(),
        )
        if hasattr(self, "task_tree") and self.task_tree.winfo_exists() and self._task_matches(record):
            self.task_tree.insert("", 0, iid=record["id"], values=row, tags=("even",))
        self._update_task_count()

    def _update_telemetry(
        self, did: str, hb_time: str, exp_str: str, expires_at: float | None = None
    ) -> None:
        self.device_id_var.set(did)
        self.heartbeat_var.set(hb_time)
        self.expiry_var.set(exp_str)
        self._note_token_expiry(expires_at)
        self._set_poll_note(True)
        if self.running:
            self.status_var.set("\u25cf Online & Polling")

    def _set_poll_note(self, ok: bool, detail: str = "", retry_in: float | None = None) -> None:
        """Surface connection health, not just a colour on the capsule."""
        last = time.strftime("%H:%M:%S", time.localtime(self._last_ok_poll)) if self._last_ok_poll else "never"
        if ok:
            self.poll_note_var.set(f"Last contact {last} \u00b7 healthy")
        else:
            retry = f" \u00b7 retry in {retry_in:.0f}s" if retry_in else ""
            self.poll_note_var.set(f"Last contact {last} \u00b7 {detail[:70]}{retry}")

    def _note_token_expiry(self, expires_at: float | None) -> None:
        self._token_expires_at = expires_at
        if not expires_at:
            self.expiry_note_var.set("")
            return
        hours = (expires_at - time.time()) / 3600
        if hours <= 0:
            self.expiry_note_var.set("Token expired \u2014 rotate to reconnect")
        elif hours < 24:
            self.expiry_note_var.set(f"Token expires in {max(0, int(hours))}h \u2014 rotate to renew")
        else:
            self.expiry_note_var.set(f"Token valid for {int(hours)}h")

    def rotate_token_manual(self) -> None:
        url = self.url_var.get().strip()
        tok = self.token_var.get().strip()
        if not url or not tok:
            messagebox.showwarning("Rotate Token", "Control Plane URL and Device Token are required.")
            return
        try:
            poller = Poller(url, tok, token_file=TOKEN_FILE)
            new_tok = poller.rotate_token()
            self.token_var.set(new_tok)
            self.save_current_config()
            self.log("Successfully rotated Device Token and saved to disk.", "ok")
            messagebox.showinfo("Token Rotated", "A new Device Token has been issued and saved automatically.")
        except Exception as exc:
            self.log(f"Token rotation failed: {exc}", "err")
            messagebox.showerror("Rotation Failed", str(exc))

    # -------------------------------------------------------------------------
    # SYSTEM TRAY & LIFECYCLE
    # -------------------------------------------------------------------------
    def minimize_to_tray(self) -> None:
        """Hide window into system tray."""
        self.root.withdraw()
        if self.notifications_var.get():
            self.tray.notify(
                "AI Bridge Windows Client",
                "Application minimized to system tray. Polling continues in background.",
            )

    def restore_from_tray(self) -> None:
        """Restore window from system tray to front."""
        self.root.deiconify()
        self.root.lift()
        self.root.focus_force()

    def _on_close(self) -> None:
        self._persist_window_state()
        if self.minimize_to_tray_var.get() and self.running:
            self.minimize_to_tray()
        else:
            self.exit_application()

    def exit_application(self) -> None:
        """Clean shutdown."""
        self._persist_window_state()
        self.stop_event.set()
        self.running = False
        self.tray.stop()
        self.root.destroy()


    # -------------------------------------------------------------------------
    # DIAGNOSTICS, UPDATES AND SUPPORT
    # -------------------------------------------------------------------------
    def _on_tk_exception(self, exc_type, exc_value, exc_tb) -> None:
        """Surface Tk callback errors instead of losing them under pythonw."""
        detail = "".join(traceback.format_exception(exc_type, exc_value, exc_tb))
        self._last_ui_error = detail
        _LOGGER.error("Unhandled UI exception: %s", detail)
        self.log(f"UI error: {exc_type.__name__}: {exc_value} (use Diagnostics)", "err")
        try:
            self.tray.notify("AI Bridge UI error", f"{exc_type.__name__}: {exc_value}"[:200])
        except Exception:
            pass

    def token_storage_note(self) -> str:
        """Describe where and how the device token is stored."""
        try:
            backend = runtime.token_backend(TOKEN_FILE)
        except Exception:
            return "Token storage unavailable"
        if not TOKEN_FILE.exists():
            return f"Not stored yet \u00b7 {TOKEN_FILE}"
        if backend == "dpapi":
            return f"Sealed with Windows DPAPI \u00b7 {TOKEN_FILE}"
        return f"Owner-only file (no DPAPI) \u00b7 {TOKEN_FILE}"

    def _diagnostics_report(self) -> dict:
        try:
            report = diagnose.build_report(
                load_agent_config,
                config_file=CONFIG_FILE,
                token_file=TOKEN_FILE,
                gui_available=tk is not None,
            )
        except Exception as exc:
            report = {"report_error": str(exc)}
        report.update(
            {
                "app_version": APP_VERSION,
                "theme": self.theme_name,
                "policy": self._policy_state(),
                "token_storage": self.token_storage_note(),
                "last_ui_error": self._last_ui_error,
                "poller": {"last_contact": self._last_ok_poll, "last_error": self._last_poll_error},
            }
        )
        return report

    def copy_diagnostics(self) -> None:
        payload = json.dumps(self._diagnostics_report(), indent=2, default=str)
        if hasattr(self, "log_text") and self.log_text.winfo_exists():
            payload += "\n\n--- recent activity ---\n" + self.log_text.get("1.0", "end")[-4000:]
        self.root.clipboard_clear()
        self.root.clipboard_append(payload)
        self.log("Copied diagnostics report and recent log to clipboard.", "ok")

    def export_diagnostics_bundle(self) -> None:
        path = filedialog.asksaveasfilename(
            defaultextension=".zip",
            filetypes=[("Zip archive", "*.zip")],
            initialfile=f"ai-bridge-diagnostics-{time.strftime('%Y%m%d_%H%M%S')}.zip",
        )
        if not path:
            return
        try:
            with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("report.json", json.dumps(self._diagnostics_report(), indent=2, default=str))
                archive.writestr(
                    "config.json",
                    json.dumps(runtime.strip_token_from_config(self.cfg), indent=2, default=str),
                )
                if hasattr(self, "log_text") and self.log_text.winfo_exists():
                    archive.writestr("session-log.txt", self.log_text.get("1.0", "end"))
                log_path = runtime.configure_file_logging()
                if Path(log_path).exists():
                    archive.write(log_path, "agent-gui.log")
            self.log(f"Exported diagnostics bundle to {path}", "ok")
            messagebox.showinfo("Diagnostics", f"Bundle written to:\n{path}")
        except Exception as exc:
            self.log(f"Diagnostics export failed: {exc}", "err")
            messagebox.showerror("Diagnostics Error", str(exc))

    @staticmethod
    def _version_tuple(value: str) -> tuple[int, ...]:
        parts = []
        for chunk in str(value).lstrip("v").split("."):
            digits = "".join(ch for ch in chunk if ch.isdigit())
            parts.append(int(digits) if digits else 0)
        return tuple(parts)

    def check_for_updates(self) -> None:
        """Compare the running build against the project's latest published tag."""
        headers = {"User-Agent": "AI-Bridge-Windows-Client/2.0", "Accept": "application/vnd.github+json"}
        latest = ""
        for url in (
            "https://api.github.com/repos/jacxishipping/ai-bridge/releases/latest",
            "https://api.github.com/repos/jacxishipping/ai-bridge/tags",
        ):
            try:
                request = urllib.request.Request(url, headers=headers, method="GET")
                with urllib.request.urlopen(request, timeout=6) as response:
                    data = json.loads(response.read().decode("utf-8"))
                if isinstance(data, dict):
                    latest = str(data.get("tag_name") or data.get("name") or "")
                elif isinstance(data, list) and data:
                    latest = str(data[0].get("name") or "")
                if latest:
                    break
            except Exception:
                continue
        if not latest:
            self.root.after(0, lambda: self.update_status_var.set(f"Version {APP_VERSION} \u00b7 no channel reachable"))
            return
        if self._version_tuple(latest) > self._version_tuple(APP_VERSION):
            message = f"Version {APP_VERSION} \u00b7 {latest.lstrip('v')} available"
        else:
            message = f"Version {APP_VERSION} \u00b7 up to date"
        self.root.after(0, lambda: self.update_status_var.set(message))

    def check_for_updates_async(self) -> None:
        threading.Thread(target=self.check_for_updates, daemon=True).start()

    def _queue_loop(self) -> None:
        """Show how many results are waiting in the offline spool."""
        if not self._spool_failed:
            try:
                from common.spool import TaskSpooler

                if self._spooler is None:
                    self._spooler = TaskSpooler()
                self.queued_var.set(str(len(self._spooler.get_pending(200))))
            except Exception:
                self._spool_failed = True
                self.queued_var.set("\u2014")
        self.root.after(5000, self._queue_loop)

    # -------------------------------------------------------------------------
    # KEYBOARD AND WINDOW STATE
    # -------------------------------------------------------------------------
    def _bind_shortcuts(self) -> None:
        for index in range(len(self.tab_titles)):
            self.root.bind_all(
                f"<Control-Key-{index + 1}>",
                lambda _event, i=index: (self.select_tab(i), "break")[1],
            )
        self.root.bind_all("<Control-Key-f>", lambda _event: (self._focus_task_search(), "break")[1])
        self.root.bind_all("<Control-Key-l>", lambda _event: (self._focus_log(), "break")[1])
        self.root.bind_all("<Control-Return>", lambda _event: (self.toggle_agent(), "break")[1])
        self.root.bind_all("<Escape>", lambda _event: (self._clear_filters(), "break")[1])

    def _focus_task_search(self) -> None:
        if self.active_tab_idx != 1:
            self.select_tab(1)
        entry_widget = getattr(self, "task_search_entry", None)
        if entry_widget is not None and entry_widget.winfo_exists():
            entry_widget.focus_set()

    def _focus_log(self) -> None:
        if hasattr(self, "log_text") and self.log_text.winfo_exists():
            self.log_text.focus_set()

    def _clear_filters(self) -> None:
        self.task_search_var.set("")
        self.task_filter_var.set("all")
        if self.active_tab_idx == 1:
            self._update_task_filter_buttons()
            self._refresh_task_table()

    def _persist_window_state(self) -> None:
        try:
            self.cfg["window_geometry"] = self.root.geometry()
            self.cfg["window_maximized"] = self.root.state() == "zoomed"
            self.cfg["last_tab"] = int(self.active_tab_idx)
            save_agent_config(self.cfg)
        except Exception:
            pass


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ai-bridge-gui", description="AI Bridge Windows desktop agent")
    parser.add_argument(
        "--diagnose",
        action="store_true",
        help="print a JSON support report (platform, token backend, config, control-plane reachability) and exit",
    )
    args = parser.parse_args(argv)

    if args.diagnose:
        report = diagnose.build_report(load_agent_config, gui_available=tk is not None)
        print(json.dumps(report, indent=2, default=str))
        return 0

    if tk is None:
        print(
            "Tkinter is unavailable on this host, so the window cannot open.\n"
            "Re-run with --diagnose for a headless report, or install the python3-tk package.",
            file=sys.stderr,
        )
        return 1

    _enable_dpi_awareness()
    log_path = runtime.configure_file_logging()
    runtime.install_excepthook()
    guard = runtime.SingleInstanceGuard()

    root = tk.Tk()
    root.withdraw()
    if not guard.acquire():
        # A second launch should surface the running window, not dead-end here.
        if not focus_existing_window():
            messagebox.showwarning(
                "AI Bridge is already running",
                "Another AI Bridge window is already open.\n\n"
                "Restore it from the system tray, or close it before starting a second copy.",
            )
        root.destroy()
        return 0

    root.deiconify()
    try:
        AgentGuiApp(root)
        _LOGGER.info(
            "Desktop app started (log=%s, token backend=%s)", log_path, runtime.token_backend(TOKEN_FILE)
        )
        root.mainloop()
    finally:
        guard.release()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
