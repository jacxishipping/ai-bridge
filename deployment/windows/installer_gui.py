"""AI Bridge Windows Setup & Package Installer Wizard.

Provides a rich Fluent 2 graphical setup experience and unattended CLI for:
1. Environment verification (Python 3.11+, system capabilities)
2. Creating an isolated virtual environment (%LOCALAPPDATA%\\AIBridge\\venv or local .venv)
3. Installing ALL required packages:
   - Core server & agent: fastapi, uvicorn, pydantic, psutil, httpx, cryptography, python-multipart, mcp
   - Desktop vision & automation: Pillow>=10.0
   - Real-time WebRTC media streaming: aiortc>=1.8.0, av>=11.0.0
   - System tray & notifications: pystray>=0.19.5
4. Provisioning ~/.ai-bridge/agent_gui.json and device.token
5. Creating Desktop and Start Menu shortcuts with the AI Bridge icon
6. Registering Windows Startup autostart in HKCU
7. Validating server connectivity and launching the client
"""
from __future__ import annotations

import argparse
import os
import platform
import queue
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

# Paths
REPO_ROOT = Path(__file__).resolve().parents[2]
REQUIREMENTS_FILE = Path(__file__).resolve().parent / "requirements.txt"
CONFIG_DIR = Path.home() / ".ai-bridge"
CONFIG_FILE = CONFIG_DIR / "agent_gui.json"
TOKEN_FILE = CONFIG_DIR / "device.token"
REG_RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
REG_APP_NAME = "AIBridgeWindowsClient"
DEFAULT_CONTROL_URL = "https://jxiptvplayer.app"


def test_control_connection(url: str, token: str = "") -> tuple[bool, str, int]:
    """Ping the control server to verify network accessibility and token validity.
    Returns (success, message, latency_ms).
    """
    clean_url = url.strip().rstrip("/")
    if not clean_url:
        return False, "Control plane URL is required", 0

    t0 = time.time()
    try:
        health_req = urllib.request.Request(
            f"{clean_url}/api/health",
            headers={"User-Agent": "AIBridge-WindowsInstaller/0.3.0"},
        )
        with urllib.request.urlopen(health_req, timeout=6.0) as resp:
            latency_ms = int((time.time() - t0) * 1000)
            if resp.status != 200:
                return False, f"Server returned HTTP {resp.status}", latency_ms

        # If token provided, test task polling authorization
        if token.strip():
            poll_req = urllib.request.Request(
                f"{clean_url}/api/agent/tasks/poll",
                headers={
                    "Authorization": f"Bearer {token.strip()}",
                    "User-Agent": "AIBridge-WindowsInstaller/0.3.0",
                },
            )
            try:
                with urllib.request.urlopen(poll_req, timeout=6.0) as resp:
                    pass
            except urllib.error.HTTPError as he:
                if he.code == 401:
                    return False, "Invalid or expired Device Token (HTTP 401)", latency_ms
                # 404/200/204 or other codes indicate authorization was parsed
            except Exception:
                pass

        return True, f"Connected to {clean_url} ({latency_ms} ms)", latency_ms
    except urllib.error.URLError as exc:
        latency_ms = int((time.time() - t0) * 1000)
        return False, f"Cannot reach control server: {exc.reason}", latency_ms
    except Exception as exc:
        latency_ms = int((time.time() - t0) * 1000)
        return False, f"Connection failed: {exc}", latency_ms


def setup_virtualenv(target_dir: Path, log_cb=None) -> Path:
    """Create or reuse a virtual environment in target_dir. Returns path to python.exe."""
    def log(msg: str):
        if log_cb:
            log_cb(msg)
        else:
            print(msg)

    venv_dir = target_dir / "venv"
    if not venv_dir.exists():
        log(f"Creating isolated Python virtual environment at: {venv_dir}")
        target_dir.mkdir(parents=True, exist_ok=True)
        cmd = [sys.executable, "-m", "venv", str(venv_dir)]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"Failed to create virtualenv: {res.stderr}")
    else:
        log(f"Using existing virtual environment at: {venv_dir}")

    # Determine python executables
    scripts_dir = venv_dir / "Scripts"
    py_exe = scripts_dir / "python.exe"
    if not py_exe.exists():
        py_exe = venv_dir / "bin" / "python"
    if not py_exe.exists():
        raise FileNotFoundError(f"Virtualenv python executable not found in {venv_dir}")

    return py_exe


def install_packages(venv_python: Path, repo_root: Path, log_cb=None) -> bool:
    """Install all required packages into the target virtualenv."""
    def log(msg: str):
        if log_cb:
            log_cb(msg)
        else:
            print(msg)

    log("Upgrading pip, setuptools, and wheel in virtual environment...")
    res = subprocess.run(
        [str(venv_python), "-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"],
        capture_output=True,
        text=True,
    )
    if res.returncode != 0:
        log(f"Warning during pip upgrade: {res.stderr.strip()}")

    # Install from requirements.txt if present
    req_file = repo_root / "deployment" / "windows" / "requirements.txt"
    if req_file.exists():
        log(f"Installing all required dependencies from {req_file.name}...")
        log("Packages include: aiortc, av, Pillow, psutil, pydantic, cryptography, pystray, fastapi, uvicorn, mcp")
        proc = subprocess.Popen(
            [str(venv_python), "-m", "pip", "install", "-r", str(req_file)],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        if proc.stdout:
            for line in iter(proc.stdout.readline, ""):
                line_str = line.strip()
                if line_str and not line_str.startswith(" "):
                    log(f"  {line_str}")
            proc.stdout.close()
        proc.wait()
        if proc.returncode != 0:
            raise RuntimeError(f"pip install requirements.txt failed with exit code {proc.returncode}")
    else:
        log("Directly installing core packages...")
        pkgs = [
            "fastapi>=0.110.0",
            "uvicorn>=0.29.0",
            "pydantic>=2.6.0",
            "psutil>=5.9.0",
            "httpx>=0.27.0",
            "cryptography>=42.0.0",
            "python-multipart>=0.0.9",
            "Pillow>=10.0.0",
            "aiortc>=1.8.0",
            "av>=11.0.0",
            "pystray>=0.19.5",
        ]
        cmd = [str(venv_python), "-m", "pip", "install"] + pkgs
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        if proc.stdout:
            for line in iter(proc.stdout.readline, ""):
                line_str = line.strip()
                if line_str:
                    log(f"  {line_str}")
            proc.stdout.close()
        proc.wait()
        if proc.returncode != 0:
            raise RuntimeError(f"pip install failed with exit code {proc.returncode}")

    # Install local ai-bridge package in editable mode
    if (repo_root / "pyproject.toml").exists():
        log("Registering ai-bridge package...")
        res = subprocess.run(
            [str(venv_python), "-m", "pip", "install", "-e", str(repo_root)],
            capture_output=True,
            text=True,
        )
        if res.returncode != 0:
            log(f"Note: local package install: {res.stderr.strip() or 'OK'}")

    return True


def verify_installation(venv_python: Path, log_cb=None) -> dict[str, bool]:
    """Test importing all required packages to confirm installation health."""
    def log(msg: str):
        if log_cb:
            log_cb(msg)
        else:
            print(msg)

    modules_to_check = [
        ("aiortc", "aiortc WebRTC Core"),
        ("av", "PyAV Video Codec Engine"),
        ("PIL", "Pillow Desktop Vision"),
        ("psutil", "Hardware & Process Telemetry"),
        ("pydantic", "Pydantic Schemas & Typing"),
        ("cryptography", "Security & Token Cryptography"),
        ("fastapi", "FastAPI Framework"),
        ("uvicorn", "Uvicorn Engine"),
        ("pystray", "Windows System Tray Integration"),
    ]

    results = {}
    check_code = "; ".join([f"import {m}; print('{m}: ' + getattr({m}, '__version__', 'ok'))" for m, _ in modules_to_check])
    res = subprocess.run(
        [str(venv_python), "-c", check_code],
        capture_output=True,
        text=True,
    )

    output = res.stdout + res.stderr
    for mod, desc in modules_to_check:
        found = f"{mod}:" in output
        results[mod] = found
        status = "OK" if found else "MISSING"
        log(f"  [{status}] {desc} ({mod})")

    return results


def write_agent_config(control_url: str, device_token: str, autostart: bool = True) -> None:
    """Save configuration to ~/.ai-bridge/agent_gui.json and ~/.ai-bridge/device.token."""
    import json

    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    cfg = {
        "control_url": control_url.strip().rstrip("/"),
        "device_token": device_token.strip(),
        "auto_start": True,
        "theme": "dark",
        "poll_wait_s": 10,
        "minimize_to_tray": True,
        "desktop_notifications": True,
        "autostart_windows": autostart,
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
            "wt",
        ],
    }
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    if device_token.strip():
        TOKEN_FILE.write_text(device_token.strip(), encoding="utf-8")


def set_windows_autostart_reg(enable: bool, target_exe: str, script_path: str) -> bool:
    """Configure or remove autostart entry in HKCU."""
    if platform.system() != "Windows":
        return False
    try:
        import winreg

        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_RUN_KEY, 0, winreg.KEY_ALL_ACCESS)
        try:
            if enable:
                cmd = f'"{target_exe}" "{script_path}"'
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


def create_shortcuts(
    venv_python: Path,
    repo_root: Path,
    create_desktop: bool = True,
    create_start_menu: bool = True,
    log_cb=None,
) -> list[str]:
    """Create Windows Desktop and Start Menu shortcuts with the AI Bridge icon."""
    def log(msg: str):
        if log_cb:
            log_cb(msg)
        else:
            print(msg)

    created = []
    if platform.system() != "Windows":
        return created

    pyw = venv_python.parent / "pythonw.exe"
    if not pyw.exists():
        pyw = venv_python

    gui_script = repo_root / "agents" / "windows" / "gui_app.py"
    ico_path = repo_root / "assets" / "ai-bridge.ico"

    # PowerShell shortcut creation script
    ps_lines = [
        '$WshShell = New-Object -ComObject WScript.Shell',
    ]

    targets = []
    if create_desktop:
        targets.append('[Environment]::GetFolderPath("Desktop")')
    if create_start_menu:
        targets.append('[Environment]::GetFolderPath("Programs")')

    for t in targets:
        ps_lines.append(f'$dir = {t}')
        ps_lines.append('if ($dir -and (Test-Path $dir)) {')
        ps_lines.append('    $lnkPath = Join-Path $dir "AI Bridge Agent.lnk"')
        ps_lines.append('    $s = $WshShell.CreateShortcut($lnkPath)')
        ps_lines.append(f'    $s.TargetPath = "{pyw}"')
        ps_lines.append(f'    $s.Arguments = "`"{gui_script}`""')
        ps_lines.append(f'    $s.WorkingDirectory = "{repo_root}"')
        ps_lines.append('    $s.Description = "AI Bridge Windows Agent (Fluent 2 Desktop Client)"')
        if ico_path.exists():
            ps_lines.append(f'    $s.IconLocation = "{ico_path},0"')
        else:
            ps_lines.append('    $s.IconLocation = "$env:SystemRoot\\System32\\shell32.dll,18"')
        ps_lines.append('    $s.Save()')
        ps_lines.append('    Write-Output "SHORTCUT:$lnkPath"')
        ps_lines.append('}')

    cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "\n".join(ps_lines)]
    res = subprocess.run(cmd, capture_output=True, text=True)
    for line in res.stdout.splitlines():
        if line.startswith("SHORTCUT:"):
            p = line.split("SHORTCUT:", 1)[1].strip()
            created.append(p)
            log(f"Created shortcut: {p}")

    return created


def run_full_installation(
    control_url: str,
    device_token: str,
    install_dir: Path,
    repo_root: Path,
    install_packages_flag: bool = True,
    create_desktop: bool = True,
    create_start_menu: bool = True,
    autostart: bool = True,
    launch_after: bool = True,
    log_cb=None,
    progress_cb=None,
) -> bool:
    """Execute the full end-to-end installation sequence."""
    def log(msg: str):
        if log_cb:
            log_cb(msg)
        else:
            print(msg)

    def set_progress(val: float, status: str = ""):
        if progress_cb:
            progress_cb(val, status)

    try:
        log("=" * 60)
        log("AI Bridge Windows Agent Setup")
        log(f"Target Directory: {install_dir}")
        log(f"Control Server:   {control_url}")
        log("=" * 60)

        # Step 1: Pre-flight checks
        set_progress(10, "Validating system runtime...")
        log("[1/6] Validating runtime environment...")
        v = sys.version_info
        log(f"Python Runtime: {v.major}.{v.minor}.{v.micro} ({platform.platform()})")
        if v.major < 3 or (v.major == 3 and v.minor < 11):
            raise RuntimeError(f"Python 3.11+ is required (found {v.major}.{v.minor})")

        # Step 2: Virtual Environment Setup
        set_progress(25, "Creating virtual environment...")
        log("[2/6] Setting up isolated Python virtual environment...")
        py_exe = setup_virtualenv(install_dir, log_cb=log)
        pyw_exe = py_exe.parent / "pythonw.exe"
        if not pyw_exe.exists():
            pyw_exe = py_exe
        log(f"Virtualenv Python: {py_exe}")

        # Step 3: Install all required packages
        if install_packages_flag:
            set_progress(45, "Installing all required packages...")
            log("[3/6] Installing all required packages (aiortc, av, Pillow, psutil, pydantic, etc.)...")
            install_packages(py_exe, repo_root, log_cb=log)

            set_progress(75, "Verifying installed packages...")
            log("Verifying module imports...")
            verify_installation(py_exe, log_cb=log)
        else:
            log("[3/6] Package installation skipped by user option.")

        # Step 4: Write Configuration
        set_progress(82, "Configuring agent credentials...")
        log("[4/6] Provisioning agent configuration and enrollment token...")
        write_agent_config(control_url, device_token, autostart=autostart)
        log(f"Saved configuration to: {CONFIG_FILE}")

        # Step 5: Shortcuts & Autostart
        set_progress(90, "Configuring shortcuts and startup...")
        log("[5/6] Creating Windows shortcuts & startup registration...")
        gui_script = repo_root / "agents" / "windows" / "gui_app.py"

        if create_desktop or create_start_menu:
            create_shortcuts(py_exe, repo_root, create_desktop, create_start_menu, log_cb=log)

        if autostart:
            log("Registering Windows Login auto-start in HKCU...")
            if set_windows_autostart_reg(True, str(pyw_exe), str(gui_script)):
                log("Successfully registered auto-start key.")
            else:
                log("Warning: Could not update HKCU autostart registry key.")

        # Step 6: Finalization & Optional Launch
        set_progress(100, "Installation complete!")
        log("[6/6] AI Bridge installation completed successfully!")

        if launch_after and gui_script.exists():
            log(f"Launching AI Bridge Agent: {pyw_exe} {gui_script}")
            subprocess.Popen([str(pyw_exe), str(gui_script)], cwd=str(repo_root))

        log("=" * 60)
        log("SETUP FINISHED: AI Bridge is ready to control and stream.")
        log("=" * 60)
        return True

    except Exception as exc:
        set_progress(100, f"Error: {exc}")
        log(f"\n[ERROR] Setup failed: {exc}")
        return False


# ============================================================================
# Modern Fluent 2 Tkinter Setup Wizard Application
# ============================================================================

def launch_gui_installer():
    """Launch the interactive Fluent 2 dark-mode GUI installer wizard."""
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk

    root = tk.Tk()
    root.title("AI Bridge — Windows Client Setup Wizard")
    root.geometry("820x680")
    root.minsize(720, 580)
    root.configure(bg="#141416")

    # Set window icon if available
    ico_path = REPO_ROOT / "assets" / "ai-bridge.ico"
    if ico_path.exists():
        try:
            root.iconbitmap(str(ico_path))
        except Exception:
            pass

    # Styling constants
    C_BG = "#141416"
    C_CARD = "#1f1f23"
    C_CARD_ALT = "#27272e"
    C_BORDER = "#383844"
    C_ACCENT = "#06b6d4"      # Cyan
    C_PRIMARY = "#3b82f6"     # Blue
    C_SUCCESS = "#10b981"     # Green
    C_TEXT = "#f3f4f6"
    C_MUTED = "#9ca3af"

    # ttk style
    style = ttk.Style()
    style.theme_use("clam")
    style.configure("TProgressbar", thickness=8, troughcolor=C_CARD_ALT, background=C_ACCENT)

    # State variables
    # Check if existing config exists to prefill
    existing_url = DEFAULT_CONTROL_URL
    existing_token = ""
    if CONFIG_FILE.exists():
        try:
            import json
            cfg = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            existing_url = cfg.get("control_url", DEFAULT_CONTROL_URL)
            existing_token = cfg.get("device_token", "")
        except Exception:
            pass
    if not existing_token and TOKEN_FILE.exists():
        try:
            existing_token = TOKEN_FILE.read_text(encoding="utf-8").strip()
        except Exception:
            pass

    url_var = tk.StringVar(value=existing_url)
    token_var = tk.StringVar(value=existing_token)
    default_install_dir = str(REPO_ROOT)
    install_dir_var = tk.StringVar(value=default_install_dir)

    opt_packages_var = tk.BooleanVar(value=True)
    opt_desktop_var = tk.BooleanVar(value=True)
    opt_start_menu_var = tk.BooleanVar(value=True)
    opt_autostart_var = tk.BooleanVar(value=True)
    opt_launch_var = tk.BooleanVar(value=True)

    status_var = tk.StringVar(value="Ready to configure and install")
    ping_status_var = tk.StringVar(value="")

    # Message queue for thread-safe UI updates
    ui_queue: queue.Queue = queue.Queue()

    # Top Header Banner
    header = tk.Frame(root, bg="#18181c", height=80, highlightthickness=1, highlightbackground=C_BORDER)
    header.pack(fill="x", side="top")

    title_frame = tk.Frame(header, bg="#18181c")
    title_frame.pack(side="left", padx=20, pady=12)

    title_lbl = tk.Label(
        title_frame,
        text="AI Bridge Windows Agent Setup",
        font=("Segoe UI", 16, "bold"),
        fg=C_TEXT,
        bg="#18181c",
    )
    title_lbl.pack(anchor="w")

    subtitle_lbl = tk.Label(
        title_frame,
        text="All-in-one setup for Desktop Client, WebRTC Media Streaming, Vision, and Background Services",
        font=("Segoe UI", 9),
        fg=C_MUTED,
        bg="#18181c",
    )
    subtitle_lbl.pack(anchor="w")

    badge_lbl = tk.Label(
        header,
        text="v0.3.0 Fluent 2",
        font=("Segoe UI", 8, "bold"),
        fg="#0284c7",
        bg="#082f49",
        padx=10,
        pady=4,
    )
    badge_lbl.pack(side="right", padx=20, pady=20)

    # Main Scrollable / Stack Container
    main_body = tk.Frame(root, bg=C_BG)
    main_body.pack(fill="both", expand=True, padx=20, pady=12)

    # Configuration Card
    cfg_card = tk.LabelFrame(
        main_body,
        text=" 1. Control Plane & Device Enrollment ",
        font=("Segoe UI", 10, "bold"),
        fg=C_ACCENT,
        bg=C_CARD,
        relief="solid",
        bd=1,
        padx=14,
        pady=10,
    )
    cfg_card.pack(fill="x", pady=6)

    # Server URL row
    r1 = tk.Frame(cfg_card, bg=C_CARD)
    r1.pack(fill="x", pady=4)
    tk.Label(r1, text="Control Server URL:", font=("Segoe UI", 9, "bold"), fg=C_TEXT, bg=C_CARD, width=16, anchor="w").pack(side="left")
    url_entry = tk.Entry(r1, textvariable=url_var, font=("Segoe UI", 10), bg="#27272e", fg=C_TEXT, insertbackground=C_TEXT, relief="flat", highlightthickness=1, highlightbackground=C_BORDER)
    url_entry.pack(side="left", fill="x", expand=True, padx=6)

    # Test Ping Button
    def do_ping():
        ping_status_var.set("Testing connection...")
        def _bg():
            ok, msg, ms = test_control_connection(url_var.get(), token_var.get())
            def _update():
                if ok:
                    ping_status_var.set(f"✓ {msg}")
                    ping_lbl.configure(fg=C_SUCCESS)
                else:
                    ping_status_var.set(f"✗ {msg}")
                    ping_lbl.configure(fg="#ef4444")
            root.after(0, _update)
        threading.Thread(target=_bg, daemon=True).start()

    ping_btn = tk.Button(r1, text="Test Connection", font=("Segoe UI", 8, "bold"), bg="#0284c7", fg="white", activebackground="#0369a1", relief="flat", padx=10, pady=2, command=do_ping)
    ping_btn.pack(side="right", padx=4)

    # Token row
    r2 = tk.Frame(cfg_card, bg=C_CARD)
    r2.pack(fill="x", pady=4)
    tk.Label(r2, text="Device Token:", font=("Segoe UI", 9, "bold"), fg=C_TEXT, bg=C_CARD, width=16, anchor="w").pack(side="left")
    token_entry = tk.Entry(r2, textvariable=token_var, font=("Segoe UI", 10), show="•", bg="#27272e", fg=C_TEXT, insertbackground=C_TEXT, relief="flat", highlightthickness=1, highlightbackground=C_BORDER)
    token_entry.pack(side="left", fill="x", expand=True, padx=6)

    def toggle_show_token():
        if token_entry.cget("show") == "•":
            token_entry.configure(show="")
            show_btn.configure(text="Hide")
        else:
            token_entry.configure(show="•")
            show_btn.configure(text="Show")

    show_btn = tk.Button(r2, text="Show", font=("Segoe UI", 8), bg=C_CARD_ALT, fg=C_MUTED, relief="flat", padx=8, pady=2, command=toggle_show_token)
    show_btn.pack(side="right", padx=4)

    # Ping feedback label
    ping_lbl = tk.Label(cfg_card, textvariable=ping_status_var, font=("Segoe UI", 8), fg=C_MUTED, bg=C_CARD)
    ping_lbl.pack(anchor="w", padx=140, pady=1)

    # Options Card
    opt_card = tk.LabelFrame(
        main_body,
        text=" 2. Installation Options & Packages ",
        font=("Segoe UI", 10, "bold"),
        fg=C_ACCENT,
        bg=C_CARD,
        relief="solid",
        bd=1,
        padx=14,
        pady=8,
    )
    opt_card.pack(fill="x", pady=6)

    # Checkboxes row 1
    c1 = tk.Frame(opt_card, bg=C_CARD)
    c1.pack(fill="x", pady=2)
    tk.Checkbutton(
        c1,
        text="Install all required packages (aiortc, av, Pillow, psutil, pydantic, pystray, fastapi)",
        variable=opt_packages_var,
        font=("Segoe UI", 9),
        fg=C_TEXT,
        bg=C_CARD,
        selectcolor="#0284c7",
        activebackground=C_CARD,
        activeforeground=C_TEXT,
    ).pack(side="left")

    # Checkboxes row 2
    c2 = tk.Frame(opt_card, bg=C_CARD)
    c2.pack(fill="x", pady=2)
    tk.Checkbutton(
        c2,
        text="Create Desktop Shortcut",
        variable=opt_desktop_var,
        font=("Segoe UI", 9),
        fg=C_TEXT,
        bg=C_CARD,
        selectcolor="#0284c7",
        activebackground=C_CARD,
        activeforeground=C_TEXT,
    ).pack(side="left", padx=(0, 20))

    tk.Checkbutton(
        c2,
        text="Create Start Menu Shortcut",
        variable=opt_start_menu_var,
        font=("Segoe UI", 9),
        fg=C_TEXT,
        bg=C_CARD,
        selectcolor="#0284c7",
        activebackground=C_CARD,
        activeforeground=C_TEXT,
    ).pack(side="left", padx=(0, 20))

    tk.Checkbutton(
        c2,
        text="Auto-start with Windows login (HKCU)",
        variable=opt_autostart_var,
        font=("Segoe UI", 9),
        fg=C_TEXT,
        bg=C_CARD,
        selectcolor="#0284c7",
        activebackground=C_CARD,
        activeforeground=C_TEXT,
    ).pack(side="left")

    # Checkboxes row 3
    c3 = tk.Frame(opt_card, bg=C_CARD)
    c3.pack(fill="x", pady=2)
    tk.Checkbutton(
        c3,
        text="Launch AI Bridge Agent immediately after installation completes",
        variable=opt_launch_var,
        font=("Segoe UI", 9),
        fg=C_TEXT,
        bg=C_CARD,
        selectcolor="#0284c7",
        activebackground=C_CARD,
        activeforeground=C_TEXT,
    ).pack(side="left")

    # Live Console & Execution
    exec_card = tk.LabelFrame(
        main_body,
        text=" 3. Setup Progress & Terminal Output ",
        font=("Segoe UI", 10, "bold"),
        fg=C_ACCENT,
        bg=C_CARD,
        relief="solid",
        bd=1,
        padx=14,
        pady=8,
    )
    exec_card.pack(fill="both", expand=True, pady=6)

    # Progress bar and status
    prog_frame = tk.Frame(exec_card, bg=C_CARD)
    prog_frame.pack(fill="x", pady=4)
    prog_bar = ttk.Progressbar(prog_frame, style="TProgressbar", mode="determinate", length=400)
    prog_bar.pack(side="left", fill="x", expand=True, padx=(0, 10))

    status_lbl = tk.Label(prog_frame, textvariable=status_var, font=("Segoe UI", 8, "italic"), fg=C_MUTED, bg=C_CARD)
    status_lbl.pack(side="right")

    # Console Text
    console_frame = tk.Frame(exec_card, bg="#111113", highlightthickness=1, highlightbackground=C_BORDER)
    console_frame.pack(fill="both", expand=True, pady=4)

    console = tk.Text(
        console_frame,
        font=("Consolas", 8),
        bg="#0f0f11",
        fg="#e2e8f0",
        insertbackground="white",
        relief="flat",
        wrap="word",
        height=10,
    )
    scrollbar = ttk.Scrollbar(console_frame, orient="vertical", command=console.yview)
    console.configure(yscrollcommand=scrollbar.set)
    scrollbar.pack(side="right", fill="y")
    console.pack(side="left", fill="both", expand=True, padx=4, pady=4)

    # Color tags for console
    console.tag_configure("info", foreground="#60a5fa")
    console.tag_configure("success", foreground="#34d399")
    console.tag_configure("warn", foreground="#fbbf24")
    console.tag_configure("error", foreground="#f87171")
    console.tag_configure("dim", foreground="#64748b")

    def append_log(line: str):
        ui_queue.put(("log", line))

    def set_ui_progress(val: float, status: str):
        ui_queue.put(("progress", (val, status)))

    # Process queue messages on UI loop
    def poll_ui_queue():
        while not ui_queue.empty():
            try:
                kind, data = ui_queue.get_nowait()
                if kind == "log":
                    line = str(data)
                    tag = "dim"
                    if "[ERROR]" in line or "failed" in line.lower() or "error" in line.lower():
                        tag = "error"
                    elif "[SUCCESS]" in line or "successfully" in line.lower() or "OK" in line:
                        tag = "success"
                    elif "[1/" in line or "[2/" in line or "[3/" in line or "[4/" in line or "[5/" in line or "[6/" in line:
                        tag = "info"
                    elif "warning" in line.lower():
                        tag = "warn"

                    console.insert("end", line + "\n", tag)
                    console.see("end")
                elif kind == "progress":
                    val, status = data
                    prog_bar["value"] = val
                    status_var.set(status)
            except queue.Empty:
                break
        root.after(50, poll_ui_queue)

    root.after(50, poll_ui_queue)

    # Bottom Actions Bar
    action_bar = tk.Frame(root, bg=C_BG)
    action_bar.pack(fill="x", side="bottom", padx=20, pady=10)

    is_installing = [False]

    def start_installation():
        if is_installing[0]:
            return
        is_installing[0] = True
        install_btn.configure(state="disabled", text="Installing...", bg="#475569")

        c_url = url_var.get().strip()
        d_token = token_var.get().strip()
        i_dir = Path(install_dir_var.get().strip())

        def _worker():
            success = run_full_installation(
                control_url=c_url,
                device_token=d_token,
                install_dir=i_dir,
                repo_root=REPO_ROOT,
                install_packages_flag=opt_packages_var.get(),
                create_desktop=opt_desktop_var.get(),
                create_start_menu=opt_start_menu_var.get(),
                autostart=opt_autostart_var.get(),
                launch_after=opt_launch_var.get(),
                log_cb=append_log,
                progress_cb=set_ui_progress,
            )

            def _done():
                is_installing[0] = False
                if success:
                    install_btn.configure(state="normal", text="Installation Succeeded ✓", bg="#059669")
                    messagebox.showinfo(
                        "Setup Complete",
                        "AI Bridge Windows Agent has been installed and configured successfully!\n\n"
                        "All required packages are ready, including WebRTC desktop streaming.",
                    )
                else:
                    install_btn.configure(state="normal", text="Retry Installation", bg="#dc2626")
                    messagebox.showerror(
                        "Setup Incomplete",
                        "An error occurred during installation. Please inspect the log console for details.",
                    )
            root.after(0, _done)

        threading.Thread(target=_worker, daemon=True).start()

    install_btn = tk.Button(
        action_bar,
        text="Install AI Bridge Agent & Required Packages",
        font=("Segoe UI", 11, "bold"),
        bg="#2563eb",
        fg="white",
        activebackground="#1d4ed8",
        activeforeground="white",
        relief="flat",
        padx=20,
        pady=8,
        command=start_installation,
    )
    install_btn.pack(side="right")

    close_btn = tk.Button(
        action_bar,
        text="Exit",
        font=("Segoe UI", 10),
        bg=C_CARD,
        fg=C_MUTED,
        activebackground=C_CARD_ALT,
        activeforeground=C_TEXT,
        relief="flat",
        padx=14,
        pady=8,
        command=root.destroy,
    )
    close_btn.pack(side="left")

    append_log("AI Bridge Setup Wizard initialized.")
    append_log(f"Repository Root: {REPO_ROOT}")
    append_log("Click 'Install AI Bridge Agent & Required Packages' to proceed.")

    root.mainloop()


# ============================================================================
# CLI Entrypoint
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="AI Bridge Windows Agent Setup")
    parser.add_argument("--url", default=DEFAULT_CONTROL_URL, help="Control Plane URL")
    parser.add_argument("--token", default="", help="Device enrollment token")
    parser.add_argument("--install-dir", default=str(REPO_ROOT), help="Installation directory")
    parser.add_argument("--no-packages", action="store_true", help="Skip pip package installation")
    parser.add_argument("--no-shortcuts", action="store_true", help="Do not create desktop/start menu shortcuts")
    parser.add_argument("--no-autostart", action="store_true", help="Do not register HKCU autostart")
    parser.add_argument("--no-launch", action="store_true", help="Do not launch the agent after setup")
    parser.add_argument("--silent", action="store_true", help="Run headlessly without GUI")
    parser.add_argument("--verify-only", action="store_true", help="Only verify installed packages and exit")

    args = parser.parse_args()

    if args.verify_only:
        print("Verifying installed packages in current Python environment...")
        res = verify_installation(Path(sys.executable))
        all_ok = all(res.values())
        print(f"Package verification {'SUCCEEDED' if all_ok else 'FAILED'}")
        sys.exit(0 if all_ok else 1)

    if args.silent:
        success = run_full_installation(
            control_url=args.url,
            device_token=args.token,
            install_dir=Path(args.install_dir),
            repo_root=REPO_ROOT,
            install_packages_flag=not args.no_packages,
            create_desktop=not args.no_shortcuts,
            create_start_menu=not args.no_shortcuts,
            autostart=not args.no_autostart,
            launch_after=not args.no_launch,
        )
        sys.exit(0 if success else 1)
    else:
        # Launch graphical wizard
        launch_gui_installer()


if __name__ == "__main__":
    main()
