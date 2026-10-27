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

import ctypes
import json
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
import tkinter as tk
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

# Insert source paths
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common.poller import Poller  # noqa: E402

# Configuration paths & registry constants
CONFIG_DIR = Path.home() / ".ai-bridge"
CONFIG_FILE = CONFIG_DIR / "agent_gui.json"
TOKEN_FILE = CONFIG_DIR / "device.token"
REG_RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
REG_APP_NAME = "AIBridgeWindowsClient"

# Fluent 2 Color Palette
THEMES = {
    "dark": {
        "bg": "#141414",
        "card": "#202020",
        "card_alt": "#292929",
        "card_subtle": "#1a1a1a",
        "border": "#383838",
        "border_subtle": "#2c2c2c",
        "fg": "#ffffff",
        "fg_muted": "#a0a0a0",
        "fg_subtle": "#707070",
        "brand": "#0f6cbd",
        "brand_hover": "#115ea3",
        "brand_active": "#0c5494",
        "brand_light": "#1e3a5f",
        "brand_fg": "#ffffff",
        "success_bg": "#052505",
        "success_fg": "#54b054",
        "success_border": "#0e700e",
        "warn_bg": "#381a04",
        "warn_fg": "#f8965d",
        "danger_bg": "#c50f1f",
        "danger_fg": "#ffffff",
        "danger_light": "#3b1115",
        "log_bg": "#0d0d0d",
        "log_fg": "#e6e6e6",
        "input_bg": "#1b1b1b",
        "tab_active_bg": "#2b2b2b",
        "tab_inactive_bg": "#181818",
        "table_header_bg": "#262626",
        "table_row_even": "#1d1d1d",
        "table_row_odd": "#222222",
        "gauge_track": "#2a2a2a",
    },
    "light": {
        "bg": "#f5f5f5",
        "card": "#ffffff",
        "card_alt": "#f0f0f0",
        "card_subtle": "#fafafa",
        "border": "#e0e0e0",
        "border_subtle": "#ebebeb",
        "fg": "#242424",
        "fg_muted": "#616161",
        "fg_subtle": "#8a8a8a",
        "brand": "#0f6cbd",
        "brand_hover": "#115ea3",
        "brand_active": "#0c5494",
        "brand_light": "#ebf3fc",
        "brand_fg": "#ffffff",
        "success_bg": "#eefbee",
        "success_fg": "#0e700e",
        "success_border": "#92d892",
        "warn_bg": "#fff8f2",
        "warn_fg": "#bc4b09",
        "danger_bg": "#c50f1f",
        "danger_fg": "#ffffff",
        "danger_light": "#fdf2f2",
        "log_bg": "#1a1a1a",
        "log_fg": "#f0f0f0",
        "input_bg": "#ffffff",
        "tab_active_bg": "#ffffff",
        "tab_inactive_bg": "#e8e8e8",
        "table_header_bg": "#f0f0f0",
        "table_row_even": "#ffffff",
        "table_row_odd": "#f9f9f9",
        "gauge_track": "#e6e6e6",
    },
}


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
            saved_tok = TOKEN_FILE.read_text(encoding="utf-8").strip()
            if saved_tok:
                cfg["device_token"] = saved_tok
        except Exception:
            pass
    if not cfg.get("device_token"):
        st_url, st_tok = _detect_scheduled_task_defaults()
        if st_url:
            cfg["control_url"] = st_url
        if st_tok:
            cfg["device_token"] = st_tok
    return cfg


def save_agent_config(cfg: dict) -> None:
    """Persist settings to ~/.ai-bridge/agent_gui.json and device.token."""
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
        if cfg.get("device_token"):
            TOKEN_FILE.write_text(cfg["device_token"].strip(), encoding="utf-8")
    except OSError:
        pass


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

            # Use standard application icon
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
        self.root.title("AI Bridge Windows Client (User App)")
        self.root.geometry("960x720")
        self.root.minsize(820, 600)

        self.cfg = load_agent_config()
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
        self.latency_var = tk.StringVar(value="⚡ Latency: —")
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

        # Live system telemetry
        self.cpu_var = tk.StringVar(value="0.0%")
        self.ram_var = tk.StringVar(value="0.0 / 0.0 GB (0%)")
        self.disk_var = tk.StringVar(value="0.0 GB Free (0%)")
        self.host_info_var = tk.StringVar(value=f"{platform.node()} ({platform.system()} {platform.release()})")
        self.ip_var = tk.StringVar(value="127.0.0.1")
        self.uptime_var = tk.StringVar(value="—")
        self.auto_refresh_monitor_var = tk.BooleanVar(value=True)

        # Task history structured records
        self.task_history: list[dict] = []
        self._selected_task: dict | None = None

        # Screenshot preview state
        self._preview_image_ref = None
        self._last_screenshot_path = ""

        # System tray integration
        self.tray = SystemTrayManager(self)
        self.tray.start()

        # Build Fluent 2 Interface
        self.active_tab_idx = 0
        self._tab_buttons: list[tk.Button] = []
        self._tab_frames: list[tk.Frame] = []

        self._build_shell()
        self._apply_theme()
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self.root.after(150, self._drain_logs)
        self.root.after(800, self._system_monitor_loop)

        if self.auto_start_var.get() and self.token_var.get().strip():
            self.log("Auto-start enabled. Connecting to control plane...", "info")
            self.root.after(400, self.start_agent)
        else:
            self.log("AI Bridge Windows Client ready. Click 'Start Agent' to begin polling.", "info")

    def _build_shell(self) -> None:
        """Construct the Fluent 2 Header, Navigation Tabs, and Tab Content Containers."""
        for w in self.root.winfo_children():
            w.destroy()
        t = THEMES[self.theme_name]
        self.root.configure(bg=t["bg"])

        # 1. Top Brand Header
        header = tk.Frame(self.root, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        header.pack(fill="x", padx=16, pady=(12, 6))

        hdr_left = tk.Frame(header, bg=t["card"])
        hdr_left.pack(side="left", padx=14, pady=10)

        logo = tk.Label(
            hdr_left,
            text="✓",
            bg=t["brand"],
            fg=t["brand_fg"],
            font=("Segoe UI", 12, "bold"),
            width=3,
            pady=2,
        )
        logo.pack(side="left", padx=(0, 10))

        titles = tk.Frame(hdr_left, bg=t["card"])
        titles.pack(side="left")
        tk.Label(
            titles,
            text="AI Bridge Windows Client (User App)",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 13, "bold"),
            anchor="w",
        ).pack(anchor="w")
        tk.Label(
            titles,
            text="Fluent 2 Desktop Companion • Unprivileged User Mode • Hardware & Vision Telemetry",
            bg=t["card"],
            fg=t["fg_muted"],
            font=("Segoe UI", 9),
            anchor="w",
        ).pack(anchor="w")

        hdr_right = tk.Frame(header, bg=t["card"])
        hdr_right.pack(side="right", padx=14, pady=10)

        # Realtime status badge
        self.status_badge = tk.Label(
            hdr_right,
            textvariable=self.status_var,
            bg=t["card_alt"],
            fg=t["fg"],
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=4,
        )
        self.status_badge.pack(side="left", padx=(0, 6))

        # Latency pill
        self.latency_label = tk.Label(
            hdr_right,
            textvariable=self.latency_var,
            bg=t["card_subtle"],
            fg=t["fg_muted"],
            font=("Segoe UI", 8, "bold"),
            padx=8,
            pady=4,
        )
        self.latency_label.pack(side="left", padx=(0, 6))

        tk.Button(
            hdr_right,
            text="Web Dashboard ↗",
            command=self.open_dashboard,
            bg=t["card_alt"],
            fg=t["fg"],
            activebackground=t["border"],
            relief="flat",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=4,
            cursor="hand2",
        ).pack(side="left", padx=(0, 6))

        tk.Button(
            hdr_right,
            text="Light" if self.theme_name == "dark" else "Dark",
            command=self.toggle_theme,
            bg=t["card_alt"],
            fg=t["fg"],
            activebackground=t["border"],
            relief="flat",
            font=("Segoe UI", 9),
            padx=8,
            pady=4,
            cursor="hand2",
        ).pack(side="left", padx=(0, 6))

        tk.Button(
            hdr_right,
            text="Tray 🗕",
            command=self.minimize_to_tray,
            bg=t["card_alt"],
            fg=t["fg"],
            activebackground=t["border"],
            relief="flat",
            font=("Segoe UI", 9),
            padx=8,
            pady=4,
            cursor="hand2",
        ).pack(side="left")

        # 2. Segmented Navigation Tab Bar
        tab_bar = tk.Frame(self.root, bg=t["bg"])
        tab_bar.pack(fill="x", padx=16, pady=(4, 6))

        self.tab_titles = [
            ("📌 Overview", self._build_overview_tab),
            ("📋 Task Explorer", self._build_tasks_tab),
            ("💻 System Monitor", self._build_monitor_tab),
            ("🖼️ Desktop Vision", self._build_vision_tab),
            ("🛡️ Security & Policy", self._build_security_tab),
            ("⚙️ Settings", self._build_settings_tab),
        ]

        self._tab_buttons = []
        self._tab_frames = []

        tab_btn_row = tk.Frame(tab_bar, bg=t["card_alt"], highlightthickness=1, highlightbackground=t["border"])
        tab_btn_row.pack(fill="x")

        for idx, (label, builder) in enumerate(self.tab_titles):
            btn = tk.Button(
                tab_btn_row,
                text=label,
                command=lambda i=idx: self.select_tab(i),
                bg=t["tab_active_bg"] if idx == self.active_tab_idx else t["card_alt"],
                fg=t["fg"] if idx == self.active_tab_idx else t["fg_muted"],
                activebackground=t["tab_active_bg"],
                activeforeground=t["fg"],
                relief="flat",
                font=("Segoe UI", 9, "bold" if idx == self.active_tab_idx else "normal"),
                padx=14,
                pady=7,
                cursor="hand2",
            )
            btn.pack(side="left")
            self._tab_buttons.append(btn)

        # 3. Main Content Container
        self.content_container = tk.Frame(self.root, bg=t["bg"])
        self.content_container.pack(fill="both", expand=True, padx=16, pady=(0, 12))

        # Build the initial active tab
        self.select_tab(self.active_tab_idx)

    def select_tab(self, idx: int) -> None:
        """Switch active navigation tab."""
        self.active_tab_idx = idx
        t = THEMES[self.theme_name]

        for i, btn in enumerate(self._tab_buttons):
            if i == idx:
                btn.configure(
                    bg=t["tab_active_bg"],
                    fg=t["brand"] if self.theme_name == "light" else "#5cb2ff",
                    font=("Segoe UI", 9, "bold"),
                )
            else:
                btn.configure(
                    bg=t["card_alt"],
                    fg=t["fg_muted"],
                    font=("Segoe UI", 9, "normal"),
                )

        for w in self.content_container.winfo_children():
            w.destroy()

        # Build target tab
        _, builder = self.tab_titles[idx]
        builder(self.content_container)

    # -------------------------------------------------------------------------
    # TAB 1: OVERVIEW
    # -------------------------------------------------------------------------
    def _build_overview_tab(self, parent: tk.Frame) -> None:
        t = THEMES[self.theme_name]

        # Mode Info Card
        info_card = tk.Frame(parent, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        info_card.pack(fill="x", pady=(0, 8))
        info_inner = tk.Frame(info_card, bg=t["card"])
        info_inner.pack(fill="x", padx=14, pady=8)
        tk.Label(
            info_inner,
            text=(
                "👤 User Application Mode: This desktop client operates strictly in user space using an "
                "administrator-issued Device Token. Server policies and fleet provisioning are securely managed on the Web Dashboard."
            ),
            bg=t["card"],
            fg=t["fg_muted"],
            font=("Segoe UI", 9),
            wraplength=880,
            justify="left",
        ).pack(anchor="w")

        # Telemetry KPI Row
        kpi_frame = tk.Frame(parent, bg=t["bg"])
        kpi_frame.pack(fill="x", pady=(0, 8))
        for col in range(4):
            kpi_frame.columnconfigure(col, weight=1)

        self._make_kpi_tile(kpi_frame, 0, "DEVICE ID", self.device_id_var, copy_btn=True)
        self._make_kpi_tile(kpi_frame, 1, "LAST HEARTBEAT", self.heartbeat_var)
        self._make_kpi_tile(kpi_frame, 2, "TOKEN EXPIRY", self.expiry_var)
        self._make_kpi_tile(kpi_frame, 3, "TASKS COMPLETED", self.tasks_var)

        # Connection Configuration Card
        cfg_card = tk.Frame(parent, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        cfg_card.pack(fill="x", pady=(0, 8))

        cfg_inner = tk.Frame(cfg_card, bg=t["card"])
        cfg_inner.pack(fill="x", padx=14, pady=10)
        cfg_inner.columnconfigure(1, weight=1)

        tk.Label(
            cfg_inner,
            text="Control Plane URL:",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 9, "bold"),
        ).grid(row=0, column=0, sticky="w", pady=(0, 6), padx=(0, 10))

        self.url_entry = tk.Entry(
            cfg_inner,
            textvariable=self.url_var,
            bg=t["input_bg"],
            fg=t["fg"],
            insertbackground=t["fg"],
            relief="solid",
            bd=1,
            font=("Consolas", 10),
        )
        self.url_entry.grid(row=0, column=1, sticky="ew", pady=(0, 6), ipady=3)

        tk.Button(
            cfg_inner,
            text="⚡ Ping Server",
            command=self.ping_server,
            bg=t["card_alt"],
            fg=t["fg"],
            relief="flat",
            font=("Segoe UI", 9),
            padx=10,
            pady=2,
            cursor="hand2",
        ).grid(row=0, column=2, padx=(6, 0), pady=(0, 6))

        tk.Label(
            cfg_inner,
            text="Assigned Token:",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 9, "bold"),
        ).grid(row=1, column=0, sticky="w", padx=(0, 10))

        self.tok_entry = tk.Entry(
            cfg_inner,
            textvariable=self.token_var,
            show="" if self.show_token else "•",
            bg=t["input_bg"],
            fg=t["fg"],
            insertbackground=t["fg"],
            relief="solid",
            bd=1,
            font=("Consolas", 10),
        )
        self.tok_entry.grid(row=1, column=1, sticky="ew", ipady=3)

        self.show_btn = tk.Button(
            cfg_inner,
            text="Hide" if self.show_token else "Show",
            command=self._toggle_token_vis,
            bg=t["card_alt"],
            fg=t["fg"],
            relief="flat",
            font=("Segoe UI", 9),
            padx=8,
            pady=2,
            cursor="hand2",
        )
        self.show_btn.grid(row=1, column=2, padx=(6, 0))

        tk.Button(
            cfg_inner,
            text="Copy Token",
            command=self._copy_token,
            bg=t["card_alt"],
            fg=t["fg"],
            relief="flat",
            font=("Segoe UI", 9),
            padx=8,
            pady=2,
            cursor="hand2",
        ).grid(row=1, column=3, padx=(6, 0))

        # Controls row
        ctrl_row = tk.Frame(cfg_card, bg=t["card"])
        ctrl_row.pack(fill="x", padx=14, pady=(2, 10))

        self.start_stop_btn = tk.Button(
            ctrl_row,
            text="■ Stop Agent" if self.running else "▶ Start Agent",
            command=self.toggle_agent,
            bg=t["danger_bg"] if self.running else t["brand"],
            fg="#ffffff",
            activebackground=t["brand_hover"],
            activeforeground="#ffffff",
            relief="flat",
            font=("Segoe UI", 10, "bold"),
            padx=16,
            pady=6,
            cursor="hand2",
        )
        self.start_stop_btn.pack(side="left", padx=(0, 8))

        tk.Button(
            ctrl_row,
            text="Rotate Token",
            command=self.rotate_token_manual,
            bg=t["card_alt"],
            fg=t["fg"],
            relief="flat",
            font=("Segoe UI", 9),
            padx=10,
            pady=6,
            cursor="hand2",
        ).pack(side="left", padx=(0, 6))

        tk.Button(
            ctrl_row,
            text="Save Config",
            command=self.save_current_config,
            bg=t["card_alt"],
            fg=t["fg"],
            relief="flat",
            font=("Segoe UI", 9),
            padx=10,
            pady=6,
            cursor="hand2",
        ).pack(side="left", padx=(0, 10))

        tk.Checkbutton(
            ctrl_row,
            text="Auto-start on app launch",
            variable=self.auto_start_var,
            command=self.save_current_config,
            bg=t["card"],
            fg=t["fg_muted"],
            selectcolor=t["card_alt"],
            activebackground=t["card"],
            activeforeground=t["fg"],
            font=("Segoe UI", 9),
        ).pack(side="right")

        # Live Activity Console
        log_card = tk.Frame(parent, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        log_card.pack(fill="both", expand=True)

        log_hdr = tk.Frame(log_card, bg=t["card"])
        log_hdr.pack(fill="x", padx=14, pady=(8, 4))

        tk.Label(
            log_hdr,
            text="Live Agent Activity & Execution Console",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 10, "bold"),
        ).pack(side="left")

        tk.Button(
            log_hdr,
            text="Export Logs…",
            command=self.export_logs,
            bg=t["card_alt"],
            fg=t["fg_muted"],
            relief="flat",
            font=("Segoe UI", 8, "bold"),
            padx=8,
            pady=2,
            cursor="hand2",
        ).pack(side="right", padx=(4, 0))

        tk.Button(
            log_hdr,
            text="Clear",
            command=self._clear_log,
            bg=t["card_alt"],
            fg=t["fg_muted"],
            relief="flat",
            font=("Segoe UI", 8, "bold"),
            padx=8,
            pady=2,
            cursor="hand2",
        ).pack(side="right")

        log_body = tk.Frame(log_card, bg=t["log_bg"])
        log_body.pack(fill="both", expand=True, padx=14, pady=(0, 10))

        scrollbar = tk.Scrollbar(log_body)
        scrollbar.pack(side="right", fill="y")

        self.log_text = tk.Text(
            log_body,
            bg=t["log_bg"],
            fg=t["log_fg"],
            font=("Consolas", 9),
            relief="flat",
            wrap="word",
            yscrollcommand=scrollbar.set,
            padx=10,
            pady=8,
            state="disabled",
        )
        self.log_text.pack(side="left", fill="both", expand=True)
        scrollbar.config(command=self.log_text.yview)

        self.log_text.tag_config("info", foreground="#62abf5")
        self.log_text.tag_config("ok", foreground="#54b054")
        self.log_text.tag_config("warn", foreground="#f8965d")
        self.log_text.tag_config("err", foreground="#eeacb2")

    # -------------------------------------------------------------------------
    # TAB 2: TASK EXPLORER & INSPECTOR
    # -------------------------------------------------------------------------
    def _build_tasks_tab(self, parent: tk.Frame) -> None:
        t = THEMES[self.theme_name]

        # Top Task Toolbar
        bar = tk.Frame(parent, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        bar.pack(fill="x", pady=(0, 8))
        bar_inner = tk.Frame(bar, bg=t["card"])
        bar_inner.pack(fill="x", padx=12, pady=8)

        tk.Label(
            bar_inner,
            text=f"Dispatched Tasks History ({len(self.task_history)})",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 10, "bold"),
        ).pack(side="left")

        tk.Button(
            bar_inner,
            text="Clear History",
            command=self._clear_task_history,
            bg=t["card_alt"],
            fg=t["fg_muted"],
            relief="flat",
            font=("Segoe UI", 8, "bold"),
            padx=8,
            pady=2,
            cursor="hand2",
        ).pack(side="right")

        # Split Container: Treeview List on Left, Inspector on Right
        split = tk.Frame(parent, bg=t["bg"])
        split.pack(fill="both", expand=True)
        split.columnconfigure(0, weight=3)
        split.columnconfigure(1, weight=4)
        split.rowconfigure(0, weight=1)

        # Left: Task Table
        table_card = tk.Frame(split, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        table_card.grid(row=0, column=0, sticky="nsew", padx=(0, 6))

        cols = ("time", "id", "tool", "duration", "status")
        self.task_tree = ttk.Treeview(table_card, columns=cols, show="headings", selectmode="browse")
        self.task_tree.heading("time", text="Time")
        self.task_tree.heading("id", text="Task ID")
        self.task_tree.heading("tool", text="Tool")
        self.task_tree.heading("duration", text="Duration")
        self.task_tree.heading("status", text="Status")

        self.task_tree.column("time", width=70, anchor="w")
        self.task_tree.column("id", width=80, anchor="w")
        self.task_tree.column("tool", width=140, anchor="w")
        self.task_tree.column("duration", width=70, anchor="center")
        self.task_tree.column("status", width=80, anchor="center")

        tree_scroll = tk.Scrollbar(table_card, command=self.task_tree.yview)
        self.task_tree.configure(yscrollcommand=tree_scroll.set)
        tree_scroll.pack(side="right", fill="y")
        self.task_tree.pack(side="left", fill="both", expand=True)

        self.task_tree.bind("<<TreeviewSelect>>", self._on_task_tree_select)

        # Right: Detail Inspector
        insp_card = tk.Frame(split, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        insp_card.grid(row=0, column=1, sticky="nsew", padx=(6, 0))

        insp_hdr = tk.Frame(insp_card, bg=t["card"])
        insp_hdr.pack(fill="x", padx=12, pady=(10, 6))

        tk.Label(
            insp_hdr,
            text="Task Payload Inspector",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 10, "bold"),
        ).pack(side="left")

        self.copy_payload_btn = tk.Button(
            insp_hdr,
            text="Copy Payload",
            command=self._copy_inspector_payload,
            bg=t["card_alt"],
            fg=t["fg"],
            relief="flat",
            font=("Segoe UI", 8),
            padx=8,
            pady=2,
            cursor="hand2",
        )
        self.copy_payload_btn.pack(side="right")

        self.insp_meta_label = tk.Label(
            insp_card,
            text="Select a task from the list on the left to inspect its arguments and returned result.",
            bg=t["card"],
            fg=t["fg_muted"],
            font=("Segoe UI", 9),
            anchor="w",
            padx=12,
        )
        self.insp_meta_label.pack(fill="x", pady=(0, 6))

        self.insp_text = tk.Text(
            insp_card,
            bg=t["log_bg"],
            fg=t["log_fg"],
            font=("Consolas", 9),
            relief="flat",
            wrap="word",
            padx=10,
            pady=8,
        )
        self.insp_text.pack(fill="both", expand=True, padx=12, pady=(0, 10))

        # Populate tasks into tree
        for item in reversed(self.task_history):
            self.task_tree.insert(
                "",
                "end",
                iid=item["id"],
                values=(
                    item["time"],
                    item["id"][:8],
                    item["tool"],
                    f"{item.get('duration_s', 0):.2f}s",
                    item["status"].upper(),
                ),
            )

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
        if hasattr(self, "task_tree"):
            for item in self.task_tree.get_children():
                self.task_tree.delete(item)
        if hasattr(self, "insp_text"):
            self.insp_text.delete("1.0", "end")
            self.insp_meta_label.configure(text="Task history cleared.")

    # -------------------------------------------------------------------------
    # TAB 3: SYSTEM MONITOR
    # -------------------------------------------------------------------------
    def _build_monitor_tab(self, parent: tk.Frame) -> None:
        t = THEMES[self.theme_name]

        # Top summary bar
        top_bar = tk.Frame(parent, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        top_bar.pack(fill="x", pady=(0, 8))
        inner_bar = tk.Frame(top_bar, bg=t["card"])
        inner_bar.pack(fill="x", padx=14, pady=10)

        tk.Label(
            inner_bar,
            text="Real-Time Hardware & Host Telemetry",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 11, "bold"),
        ).pack(side="left")

        tk.Button(
            inner_bar,
            text="Refresh Now",
            command=self._refresh_system_monitor,
            bg=t["card_alt"],
            fg=t["fg"],
            relief="flat",
            font=("Segoe UI", 9),
            padx=10,
            pady=3,
            cursor="hand2",
        ).pack(side="right", padx=(8, 0))

        tk.Checkbutton(
            inner_bar,
            text="Auto-refresh (every 2s)",
            variable=self.auto_refresh_monitor_var,
            bg=t["card"],
            fg=t["fg_muted"],
            selectcolor=t["card_alt"],
            activebackground=t["card"],
            activeforeground=t["fg"],
            font=("Segoe UI", 9),
        ).pack(side="right")

        # 3 Live Hardware Gauges Card
        gauges_card = tk.Frame(parent, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        gauges_card.pack(fill="x", pady=(0, 8))

        g_inner = tk.Frame(gauges_card, bg=t["card"])
        g_inner.pack(fill="x", padx=16, pady=14)
        g_inner.columnconfigure(0, weight=1)
        g_inner.columnconfigure(1, weight=1)
        g_inner.columnconfigure(2, weight=1)

        self._build_gauge_widget(g_inner, 0, "CPU UTILIZATION", self.cpu_var)
        self._build_gauge_widget(g_inner, 1, "SYSTEM RAM", self.ram_var)
        self._build_gauge_widget(g_inner, 2, "PRIMARY DISK (C:\\)", self.disk_var)

        # Host Specifications Card
        host_card = tk.Frame(parent, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        host_card.pack(fill="both", expand=True)

        h_inner = tk.Frame(host_card, bg=t["card"])
        h_inner.pack(fill="both", expand=True, padx=16, pady=14)

        tk.Label(
            h_inner,
            text="Host Environment & Network Specifications",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 10, "bold"),
        ).pack(anchor="w", pady=(0, 10))

        grid = tk.Frame(h_inner, bg=t["card"])
        grid.pack(fill="both", expand=True)
        grid.columnconfigure(1, weight=1)
        grid.columnconfigure(3, weight=1)

        specs = [
            ("Machine Node:", platform.node()),
            ("Operating System:", f"{platform.system()} {platform.release()} (Build {platform.version()})"),
            ("Processor Architecture:", f"{platform.machine()} ({os.cpu_count() or 1} Cores)"),
            ("Processor Model:", platform.processor() or "x86_64 Compatible"),
            ("Active IP Address:", self.ip_var.get()),
            ("System Uptime:", self.uptime_var.get()),
            ("Python Runtime:", f"Python {platform.python_version()} ({sys.executable})"),
            ("Security Execution Context:", "Interactive Logged-in User (Standard Privileges)"),
        ]

        for idx, (label, val) in enumerate(specs):
            row = idx // 2
            col_offset = (idx % 2) * 2

            tk.Label(
                grid,
                text=label,
                bg=t["card"],
                fg=t["fg_muted"],
                font=("Segoe UI", 9, "bold"),
            ).grid(row=row, column=col_offset, sticky="w", pady=4, padx=(0, 8))

            val_lbl = tk.Label(
                grid,
                text=val,
                bg=t["card"],
                fg=t["fg"],
                font=("Consolas", 9),
                anchor="w",
            )
            val_lbl.grid(row=row, column=col_offset + 1, sticky="w", pady=4, padx=(0, 16))

        # Trigger immediate refresh
        self._refresh_system_monitor()

    def _build_gauge_widget(self, parent: tk.Frame, col: int, title: str, var: tk.StringVar) -> None:
        t = THEMES[self.theme_name]
        box = tk.Frame(parent, bg=t["card_subtle"], highlightthickness=1, highlightbackground=t["border"])
        box.grid(row=0, column=col, sticky="nsew", padx=(0 if col == 0 else 8, 0))

        inner = tk.Frame(box, bg=t["card_subtle"])
        inner.pack(fill="both", expand=True, padx=12, pady=10)

        tk.Label(
            inner,
            text=title,
            bg=t["card_subtle"],
            fg=t["fg_muted"],
            font=("Segoe UI", 8, "bold"),
        ).pack(anchor="w")

        tk.Label(
            inner,
            textvariable=var,
            bg=t["card_subtle"],
            fg=t["fg"],
            font=("Segoe UI", 12, "bold"),
        ).pack(anchor="w", pady=(4, 6))

    def _refresh_system_monitor(self) -> None:
        data = gather_system_telemetry()
        self.cpu_var.set(f"{data['cpu_percent']:.1f}% ({data['cpu_count']} Cores)")
        self.ram_var.set(f"{data['memory_used_gb']} / {data['memory_total_gb']} GB ({data['memory_percent']}%)")
        self.disk_var.set(f"{data['disk_free_gb']} GB Free / {data['disk_total_gb']} GB ({data['disk_percent']}%)")
        self.ip_var.set(data["ip_address"])
        self.uptime_var.set(data["uptime"])

    def _system_monitor_loop(self) -> None:
        if self.auto_refresh_monitor_var.get() and self.active_tab_idx == 2:
            self._refresh_system_monitor()
        self.root.after(2000, self._system_monitor_loop)

    # -------------------------------------------------------------------------
    # TAB 4: DESKTOP VISION & SCREEN PREVIEW
    # -------------------------------------------------------------------------
    def _build_vision_tab(self, parent: tk.Frame) -> None:
        t = THEMES[self.theme_name]

        # Action Toolbar
        bar = tk.Frame(parent, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        bar.pack(fill="x", pady=(0, 8))
        inner_bar = tk.Frame(bar, bg=t["card"])
        inner_bar.pack(fill="x", padx=14, pady=10)

        tk.Label(
            inner_bar,
            text="Interactive Desktop Vision & Screenshot Diagnostics",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 11, "bold"),
        ).pack(side="left")

        tk.Button(
            inner_bar,
            text="📸 Capture Test Screenshot",
            command=self.capture_preview_screenshot,
            bg=t["brand"],
            fg="#ffffff",
            activebackground=t["brand_hover"],
            activeforeground="#ffffff",
            relief="flat",
            font=("Segoe UI", 9, "bold"),
            padx=12,
            pady=4,
            cursor="hand2",
        ).pack(side="right")

        # Split Container: Preview Canvas on Left, Diagnostics on Right
        split = tk.Frame(parent, bg=t["bg"])
        split.pack(fill="both", expand=True)
        split.columnconfigure(0, weight=5)
        split.columnconfigure(1, weight=3)
        split.rowconfigure(0, weight=1)

        # Canvas Box
        canvas_box = tk.Frame(split, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        canvas_box.grid(row=0, column=0, sticky="nsew", padx=(0, 6))

        c_hdr = tk.Frame(canvas_box, bg=t["card"])
        c_hdr.pack(fill="x", padx=12, pady=(10, 4))
        tk.Label(
            c_hdr,
            text="Live Screen Viewport Preview",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 10, "bold"),
        ).pack(side="left")

        self.vision_canvas = tk.Canvas(
            canvas_box,
            bg=t["log_bg"],
            highlightthickness=0,
        )
        self.vision_canvas.pack(fill="both", expand=True, padx=12, pady=(0, 10))

        # Initial canvas message
        self.vision_canvas.create_text(
            260,
            160,
            text="Click 'Capture Test Screenshot' above to preview what AI Bridge agents see.",
            fill=t["fg_muted"],
            font=("Segoe UI", 10),
            tags="placeholder",
        )

        # Right: Vision Diagnostics Card
        diag_box = tk.Frame(split, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        diag_box.grid(row=0, column=1, sticky="nsew", padx=(6, 0))

        d_inner = tk.Frame(diag_box, bg=t["card"])
        d_inner.pack(fill="both", expand=True, padx=14, pady=12)

        tk.Label(
            d_inner,
            text="Desktop Vision Guardrails",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 10, "bold"),
        ).pack(anchor="w", pady=(0, 8))

        diag_text = (
            "• Interactive User Session Required:\n"
            "Desktop vision (capture_desktop_screenshot) and UI automation (perform_approved_ui_action) "
            "run exclusively inside your logged-in interactive user session.\n\n"
            "• Least Privilege Guarantee:\n"
            "The agent does NOT run as SYSTEM and has no hidden background access to other user accounts.\n\n"
            "• Optimization & Privacy:\n"
            "Images are encoded in compact base64 JPEG format, scaled to max 1280px width for fast AI inference, "
            "and sensitive system credentials are never captured in headers."
        )
        tk.Label(
            d_inner,
            text=diag_text,
            bg=t["card"],
            fg=t["fg_muted"],
            font=("Segoe UI", 9),
            justify="left",
            wraplength=300,
        ).pack(anchor="w", pady=(0, 12))

        self.vision_meta_label = tk.Label(
            d_inner,
            text="No screenshot captured yet.",
            bg=t["card_subtle"],
            fg=t["fg"],
            font=("Consolas", 8),
            justify="left",
            wraplength=300,
            padx=8,
            pady=8,
        )
        self.vision_meta_label.pack(fill="x", pady=(0, 10))

        tk.Button(
            d_inner,
            text="Open in Photo Viewer",
            command=self._open_screenshot_in_viewer,
            bg=t["card_alt"],
            fg=t["fg"],
            relief="flat",
            font=("Segoe UI", 9),
            padx=10,
            pady=4,
            cursor="hand2",
        ).pack(fill="x", pady=(0, 6))

        tk.Button(
            d_inner,
            text="Copy Screenshot Path",
            command=self._copy_screenshot_path,
            bg=t["card_alt"],
            fg=t["fg"],
            relief="flat",
            font=("Segoe UI", 9),
            padx=10,
            pady=4,
            cursor="hand2",
        ).pack(fill="x")

    def capture_preview_screenshot(self) -> None:
        """Capture a live screenshot and render in the Desktop Vision tab."""
        t0 = time.time()
        try:
            from ai_bridge import tools

            res = tools.capture_desktop_screenshot()
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
                self.vision_canvas.create_image(
                    max_w // 2,
                    max_h // 2,
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

    # -------------------------------------------------------------------------
    # TAB 5: SECURITY & POLICY GUARDRAILS
    # -------------------------------------------------------------------------
    def _build_security_tab(self, parent: tk.Frame) -> None:
        t = THEMES[self.theme_name]

        # Top banner
        hdr = tk.Frame(parent, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        hdr.pack(fill="x", pady=(0, 8))
        h_inner = tk.Frame(hdr, bg=t["card"])
        h_inner.pack(fill="x", padx=14, pady=10)

        tk.Label(
            h_inner,
            text="Autonomous Safety Guardrails & Policy Transparency",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 11, "bold"),
        ).pack(side="left")

        # Policy Card
        body = tk.Frame(parent, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        body.pack(fill="both", expand=True)

        b_inner = tk.Frame(body, bg=t["card"])
        b_inner.pack(fill="both", expand=True, padx=16, pady=14)

        tiers = [
            ("🟢 Tier 1: Read-Only System Diagnostics", "Pre-Authorized", "get_system_info, get_resource_usage, list_processes, get_service_status"),
            ("🟢 Tier 2: Safe Workspace Navigation", "Confined", "read_workspace_file, search_workspace, list_workspace"),
            ("🟡 Tier 3: Local Modification & Testing", "Policy Bounded", "create_workspace_file, edit_workspace_file, run_project_tests"),
            ("🔴 Tier 4: Critical Actions & Deployments", "Approval Required", "deploy_application, high-risk system commands (require Admin Approval in Web Dashboard)"),
        ]

        tk.Label(
            b_inner,
            text="Tool Risk Classification Matrix:",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 10, "bold"),
        ).pack(anchor="w", pady=(0, 6))

        for name, badge, desc in tiers:
            row = tk.Frame(b_inner, bg=t["card_subtle"], highlightthickness=1, highlightbackground=t["border"])
            row.pack(fill="x", pady=3)
            r_in = tk.Frame(row, bg=t["card_subtle"])
            r_in.pack(fill="x", padx=10, pady=6)

            tk.Label(
                r_in,
                text=name,
                bg=t["card_subtle"],
                fg=t["fg"],
                font=("Segoe UI", 9, "bold"),
            ).pack(side="left")

            tk.Label(
                r_in,
                text=badge,
                bg=t["card_alt"],
                fg=t["brand"] if self.theme_name == "light" else "#5cb2ff",
                font=("Segoe UI", 8, "bold"),
                padx=6,
                pady=1,
            ).pack(side="right")

            tk.Label(
                row,
                text=f"Permitted tools: {desc}",
                bg=t["card_subtle"],
                fg=t["fg_muted"],
                font=("Consolas", 8),
            ).pack(anchor="w", padx=10, pady=(0, 6))

        tk.Label(
            b_inner,
            text="Active Security Guardrails:",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 10, "bold"),
        ).pack(anchor="w", pady=(12, 6))

        try:
            from ai_bridge import security

            ws_root = str(security.workspace_root())
        except Exception:
            ws_root = str(Path.home() / ".ai-bridge" / "workspace")

        guardrails = [
            ("Device Operational Mode:", "User Space Desktop Client (No device enrollment / unprivileged)"),
            ("Workspace Confinement:", ws_root),
            ("Secret Redaction:", "ACTIVE (API keys, authorization tokens, and credentials automatically masked)"),
            ("Desktop Automation:", "INTERACTIVE SESSION ONLY (Runs with logged-in user desktop credentials)"),
            ("Token Rotation:", "AUTOMATIC (Tokens rotate before expiry; stale credentials invalidated)"),
        ]

        for k, v in guardrails:
            g_row = tk.Frame(b_inner, bg=t["card"])
            g_row.pack(fill="x", pady=2)
            tk.Label(g_row, text=k, bg=t["card"], fg=t["fg_muted"], font=("Segoe UI", 9, "bold"), width=24, anchor="w").pack(side="left")
            tk.Label(g_row, text=v, bg=t["card"], fg=t["fg"], font=("Consolas", 9), anchor="w").pack(side="left")

    # -------------------------------------------------------------------------
    # TAB 6: SETTINGS & WINDOWS INTEGRATION
    # -------------------------------------------------------------------------
    def _build_settings_tab(self, parent: tk.Frame) -> None:
        t = THEMES[self.theme_name]

        # Top Bar
        top_bar = tk.Frame(parent, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        top_bar.pack(fill="x", pady=(0, 8))
        inner_bar = tk.Frame(top_bar, bg=t["card"])
        inner_bar.pack(fill="x", padx=14, pady=10)

        tk.Label(
            inner_bar,
            text="Client Preferences & Windows Integration",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 11, "bold"),
        ).pack(side="left")

        tk.Button(
            inner_bar,
            text="Save Settings",
            command=self.save_current_config,
            bg=t["brand"],
            fg="#ffffff",
            activebackground=t["brand_hover"],
            activeforeground="#ffffff",
            relief="flat",
            font=("Segoe UI", 9, "bold"),
            padx=14,
            pady=4,
            cursor="hand2",
        ).pack(side="right")

        # Body Container
        card = tk.Frame(parent, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        card.pack(fill="both", expand=True)

        c_inner = tk.Frame(card, bg=t["card"])
        c_inner.pack(fill="both", expand=True, padx=16, pady=14)

        # Windows startup checkbox
        tk.Label(
            c_inner,
            text="Windows System Integration:",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 10, "bold"),
        ).pack(anchor="w", pady=(0, 8))

        tk.Checkbutton(
            c_inner,
            text="Launch AI Bridge automatically on Windows Login (HKCU Run Key)",
            variable=self.windows_autostart_var,
            command=self._on_autostart_toggle,
            bg=t["card"],
            fg=t["fg"],
            selectcolor=t["card_alt"],
            activebackground=t["card"],
            activeforeground=t["fg"],
            font=("Segoe UI", 9),
        ).pack(anchor="w", pady=2)

        tk.Checkbutton(
            c_inner,
            text="Minimize to System Tray on window close (keep running in background)",
            variable=self.minimize_to_tray_var,
            command=self.save_current_config,
            bg=t["card"],
            fg=t["fg"],
            selectcolor=t["card_alt"],
            activebackground=t["card"],
            activeforeground=t["fg"],
            font=("Segoe UI", 9),
        ).pack(anchor="w", pady=2)

        tk.Checkbutton(
            c_inner,
            text="Show Windows desktop notifications when tasks execute",
            variable=self.notifications_var,
            command=self.save_current_config,
            bg=t["card"],
            fg=t["fg"],
            selectcolor=t["card_alt"],
            activebackground=t["card"],
            activeforeground=t["fg"],
            font=("Segoe UI", 9),
        ).pack(anchor="w", pady=2)

        tk.Label(
            c_inner,
            text="Poller Tuning:",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 10, "bold"),
        ).pack(anchor="w", pady=(14, 8))

        poll_row = tk.Frame(c_inner, bg=t["card"])
        poll_row.pack(fill="x", pady=2)
        tk.Label(
            poll_row,
            text="Long-Poll Timeout (seconds):",
            bg=t["card"],
            fg=t["fg_muted"],
            font=("Segoe UI", 9),
        ).pack(side="left", padx=(0, 10))

        tk.Spinbox(
            poll_row,
            from_=5,
            to=60,
            textvariable=self.poll_wait_var,
            width=6,
            bg=t["input_bg"],
            fg=t["fg"],
            font=("Consolas", 10),
        ).pack(side="left")

        tk.Label(
            c_inner,
            text="Configuration Backup & Diagnostics:",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 10, "bold"),
        ).pack(anchor="w", pady=(14, 8))

        btn_row = tk.Frame(c_inner, bg=t["card"])
        btn_row.pack(fill="x", pady=4)

        tk.Button(
            btn_row,
            text="Export Logs to File…",
            command=self.export_logs,
            bg=t["card_alt"],
            fg=t["fg"],
            relief="flat",
            font=("Segoe UI", 9),
            padx=10,
            pady=4,
            cursor="hand2",
        ).pack(side="left", padx=(0, 8))

        tk.Button(
            btn_row,
            text="Reset to Defaults",
            command=self._reset_defaults,
            bg=t["card_alt"],
            fg=t["fg_muted"],
            relief="flat",
            font=("Segoe UI", 9),
            padx=10,
            pady=4,
            cursor="hand2",
        ).pack(side="left")

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
        t = THEMES[self.theme_name]
        if self.running:
            self.status_badge.configure(bg=t["success_bg"], fg=t["success_fg"])
        else:
            self.status_badge.configure(bg=t["card_alt"], fg=t["fg_muted"])

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
                self.root.after(0, lambda: self.latency_var.set(f"⚡ {lat:.0f} ms"))
                self.log(f"Ping {url} -> {detail} ({lat:.1f} ms)", "ok")
            else:
                self.root.after(0, lambda: self.latency_var.set("⚡ Failed"))
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
        save_agent_config(self.cfg)
        self.log("Saved agent configuration to ~/.ai-bridge/agent_gui.json", "ok")

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

    def _drain_logs(self) -> None:
        try:
            while True:
                line, tag = self.log_queue.get_nowait()
                if hasattr(self, "log_text") and self.log_text.winfo_exists():
                    self.log_text.configure(state="normal")
                    self.log_text.insert("end", line, tag)
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
            self.start_stop_btn.configure(text="■ Stop Agent", bg=t["danger_bg"])
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
            self.start_stop_btn.configure(text="▶ Start Agent", bg=t["brand"])
        self.status_var.set("Stopped")
        self._apply_theme()
        self.log("Stopping agent polling loop...", "warn")

    def _poll_loop(self, url: str, tok: str) -> None:
        poller = Poller(url, tok, token_file=TOKEN_FILE)
        self.poller = poller
        wait_s = max(5, min(self.poll_wait_var.get(), 60))
        self.log(f"Agent started polling {url} (long-poll wait={wait_s}s)", "ok")
        had_error = False

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

                self.root.after(0, lambda d=did, n=now_str, e=exp_str: self._update_telemetry(d, n, e))

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
                self.root.after(0, lambda w=wait_time: self.status_var.set(f"● Retry in {w:.0f}s"))
                self.log(f"Connection issue (retry in {wait_time:.0f}s): {exc}", "warn")
                self.stop_event.wait(wait_time)
                poller.backoff = min(poller.backoff * 2, 60.0)

        self.log("Agent polling loop stopped.", "info")

    def _append_task_record(self, record: dict) -> None:
        self.task_history.append(record)
        if hasattr(self, "task_tree") and self.task_tree.winfo_exists():
            self.task_tree.insert(
                "",
                0,
                iid=record["id"],
                values=(
                    record["time"],
                    record["id"][:8],
                    record["tool"],
                    f"{record['duration_s']:.2f}s",
                    record["status"].upper(),
                ),
            )

    def _update_telemetry(self, did: str, hb_time: str, exp_str: str) -> None:
        self.device_id_var.set(did)
        self.heartbeat_var.set(hb_time)
        self.expiry_var.set(exp_str)
        if self.running:
            self.status_var.set("● Online & Polling")

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
        if self.minimize_to_tray_var.get() and self.running:
            self.minimize_to_tray()
        else:
            self.exit_application()

    def exit_application(self) -> None:
        """Clean shutdown."""
        self.stop_event.set()
        self.running = False
        self.tray.stop()
        self.root.destroy()


def main() -> None:
    _enable_dpi_awareness()
    root = tk.Tk()
    AgentGuiApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
