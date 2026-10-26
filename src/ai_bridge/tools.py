"""Shared tool implementations used by the MCP server, the agent, and
the control plane. Each function enforces policy before doing work.
No function here trusts its caller: device_revoked / approval flags are
inputs the *server* supplies, never values an AI tool argument can set
for itself (see policy.decide and server wrappers)."""
from __future__ import annotations

import base64
import io
import os
import platform
import re
import shutil
import subprocess
import time
import uuid
import zipfile

from . import diagnostics
from .config import get_settings
from .execution import RUNNER
from .policy import Policy, decide
from .security import confined_path, is_secret_name, workspace_root


def default_policy() -> Policy:
    s = get_settings()
    allowed_apps = frozenset(a.strip() for a in os.environ.get("AI_BRIDGE_ALLOWED_APPS", "").split(",") if a.strip())
    allowed_services = frozenset(a.strip() for a in os.environ.get("AI_BRIDGE_ALLOWED_SERVICES", "").split(",") if a.strip())
    return Policy(allow_writes=True, allow_tier3=s.allow_tier3,
                  allowed_services=allowed_services, allowed_apps=allowed_apps,
                  desktop_enabled=s.desktop_enabled)

def _check(tool: str, *, approval_granted: bool = False, is_admin: bool = False, policy: Policy | None = None):
    d = decide(policy or default_policy(), tool, approval_granted=approval_granted, is_admin=is_admin)
    if not d.allowed:
        raise PermissionError(d.reason)
    return d

def get_system_info() -> dict:
    _check("get_system_info")
    info = diagnostics.system_info(); info["workspace"] = str(workspace_root())
    return info

def get_resource_usage() -> dict:
    _check("get_resource_usage"); return diagnostics.resource_usage()

def create_backup(relative_directory: str = ".", *, approval_granted: bool = False, policy: Policy | None = None) -> dict:
    _check("create_backup", approval_granted=approval_granted, policy=policy)
    src = confined_path(relative_directory)
    if not src.is_dir():
        raise ValueError("Directory does not exist inside the workspace.")
    root = workspace_root()
    out_dir = root / ".ai-bridge-backups"; out_dir.mkdir(parents=True, exist_ok=True)
    name = f"backup-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}.zip"
    dest = out_dir / name
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(src.rglob("*")):
            if ".ai-bridge-backups" in p.parts or not p.is_file() or is_secret_name(p):
                continue
            try:
                zf.write(p, p.relative_to(src))
            except OSError:
                continue
    return {"backup": str(dest.relative_to(root)), "size_bytes": dest.stat().st_size}

def deploy_application(project_directory: str = ".", target_directory: str = "deploy-staging", *, approval_granted: bool = False, policy: Policy | None = None) -> dict:
    """Staging-only deploy inside the workspace: backup, then copy.
    Production deploys are Tier 4 and must go through the control-plane
    approval queue (docs/security.md); this tool never deploys to prod."""
    _check("deploy_application", approval_granted=approval_granted, policy=policy)
    backup = create_backup(project_directory, approval_granted=approval_granted, policy=policy)
    src = confined_path(project_directory); dst = confined_path(target_directory)
    if dst.resolve() == src.resolve():
        raise ValueError("Target must differ from the project directory.")
    dst.mkdir(parents=True, exist_ok=True)
    copied = 0
    for p in sorted(src.rglob("*")):
        if ".ai-bridge-backups" in p.parts or not p.is_file() or is_secret_name(p):
            continue
        rel = p.relative_to(src); out = dst / rel
        out.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(p, out); copied += 1
    return {"backup": backup["backup"], "target": target_directory, "files_copied": copied,
            "note": "Staging deploy inside the workspace only."}

def run_project_tests(test_command: str = "pytest", timeout: int = 120) -> dict:
    _check("run_project_tests")
    result = RUNNER.submit("run_project_tests", timeout=timeout, test_command=test_command)
    deadline = time.time() + min(timeout, 300) + 5
    while time.time() < deadline and result.status in {"pending", "running"}:
        time.sleep(0.2)
    return {"task_id": result.task_id, "status": result.status, "output": result.output[:8000]}

def run_linter(timeout: int = 60) -> dict:
    _check("run_linter")
    result = RUNNER.submit("run_linter", timeout=timeout)
    deadline = time.time() + timeout + 5
    while time.time() < deadline and result.status in {"pending", "running"}:
        time.sleep(0.2)
    return {"task_id": result.task_id, "status": result.status, "output": result.output[:8000]}

# --- Desktop (optional, separately permissioned) -------------------------
def get_desktop_status() -> dict:
    return {"desktop_enabled": get_settings().desktop_enabled, "system": platform.system(),
            "session": "interactive user session required; service-as-SYSTEM is not used for desktop work"}

def _grab_windows_desktop_fallback():
    """Fallback screenshot on Windows when PIL.ImageGrab.grab() raises OSError
    (e.g. when the RDP session is disconnected/locked and BitBlt on GetDC(0)
    fails with ERROR_INVALID_HANDLE). Composites visible windows on the
    Default desktop using PrintWindow(PW_RENDERFULLCONTENT)."""
    import ctypes
    import struct
    from ctypes import wintypes

    from PIL import Image  # type: ignore

    u = ctypes.windll.user32
    g = ctypes.windll.gdi32
    hdesk = u.OpenDesktopW("Default", 0, False, 0x01FF)
    if hdesk:
        u.SetThreadDesktop(hdesk)
    sw = max(u.GetSystemMetrics(0), 800)
    sh = max(u.GetSystemMetrics(1), 600)
    canvas = Image.new("RGB", (sw, sh), (30, 30, 30))
    wins: list[int] = []
    WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def _enum_cb(hwnd, _lparam):
        if u.IsWindowVisible(hwnd) and not u.IsIconic(hwnd):
            wins.append(hwnd)
        return True

    cb = WNDENUMPROC(_enum_cb)
    if hdesk:
        u.EnumDesktopWindows(hdesk, cb, 0)
    else:
        u.EnumWindows(cb, 0)
    rect = wintypes.RECT()
    for hwnd in reversed(wins):
        if not u.GetWindowRect(hwnd, ctypes.byref(rect)):
            continue
        w = rect.right - rect.left
        h = rect.bottom - rect.top
        if w <= 10 or h <= 10 or w > sw * 2 or h > sh * 2:
            continue
        hdc = u.GetWindowDC(hwnd)
        if not hdc:
            continue
        m = g.CreateCompatibleDC(hdc)
        b = g.CreateCompatibleBitmap(hdc, w, h)
        old = g.SelectObject(m, b)
        try:
            if u.PrintWindow(hwnd, m, 2) or u.PrintWindow(hwnd, m, 0):
                bih = ctypes.create_string_buffer(struct.pack("<IiiHHIIIIII", 40, w, -h, 1, 32, 0, 0, 0, 0, 0, 0))
                buf = ctypes.create_string_buffer(w * h * 4)
                if g.GetDIBits(m, b, 0, h, buf, bih, 0):
                    wim = Image.frombuffer("RGBA", (w, h), buf, "raw", "BGRA", 0, 1).convert("RGB")
                    canvas.paste(wim, (rect.left, rect.top))
        finally:
            g.SelectObject(m, old)
            g.DeleteObject(b)
            g.DeleteDC(m)
            u.ReleaseDC(hwnd, hdc)
    if hdesk:
        u.CloseDesktop(hdesk)
    return canvas

def _encode_image_base64(shot) -> tuple[str, str]:
    """Encode a PIL Image (or mock object) into compact base64 JPEG (or PNG fallback)."""
    try:
        img = shot.convert("RGB") if hasattr(shot, "convert") else shot
        w, h = img.size
        if w > 1280 and hasattr(img, "resize"):
            new_h = max(1, int(h * (1280 / w)))
            img = img.resize((1280, new_h))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80, optimize=True)
        return base64.b64encode(buf.getvalue()).decode("ascii"), "image/jpeg"
    except Exception:
        return "", "image/png"

def capture_desktop_screenshot(*, approval_granted: bool = False, policy: Policy | None = None) -> dict:
    _check("capture_desktop_screenshot", approval_granted=approval_granted, policy=policy)
    try:
        from PIL import ImageGrab  # type: ignore
    except Exception:
        return {"available": False, "note": "Screenshot requires Pillow (pip install Pillow) and an interactive session."}
    try:
        shot = ImageGrab.grab()
    except OSError:
        if platform.system() != "Windows":
            raise
        shot = _grab_windows_desktop_fallback()
    out = get_settings().data_dir / f"screenshot-{int(time.time())}.png"
    out.parent.mkdir(parents=True, exist_ok=True); shot.save(out)
    b64, mime = _encode_image_base64(shot)
    res = {"available": True, "path": str(out), "size": list(shot.size) if isinstance(shot.size, tuple) else shot.size}
    if b64:
        res["image_base64"] = b64
        res["mime_type"] = mime
    return res

def _resolve_app_executable(app_name: str) -> str:
    """Resolve an allowlisted app name to an executable path (Windows).

    Plain names resolve through PATH when Popen runs. When that fails on
    Windows, fall back to the App Paths registry keys -- the mechanism
    Windows itself uses to resolve names like chrome/opera/msedge typed
    in Start > Run. Browsers installed outside PATH (Chrome's
    C:\\Program Files\\Google\\Chrome\\Application, Opera's install dir)
    register there, so the allowlist names keep working as typed.
    Returns the input unchanged off Windows, for full paths, or when no
    App Paths entry exists; the allowlist check on the *name* still
    gates the launch either way.
    """
    if os.name != "nt" or "\\" in app_name or "/" in app_name:
        return app_name
    try:
        import winreg
    except ImportError:
        return app_name
    key_name = app_name[:-4] if app_name.lower().endswith(".exe") else app_name
    for root in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
        try:
            with winreg.OpenKey(root, rf"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{key_name}.exe") as key:
                path, _ = winreg.QueryValueEx(key, "")
                if path:
                    return path
        except OSError:
            continue
    return app_name


def launch_approved_application(app_name: str, *, approval_granted: bool = False, url: str | None = None, policy: Policy | None = None) -> dict:
    eff_policy = policy or default_policy()
    _check("launch_approved_application", approval_granted=approval_granted, policy=eff_policy)
    allowed = eff_policy.allowed_apps | default_policy().allowed_apps
    if app_name not in allowed:
        raise PermissionError(f"Application not in the approved list: {app_name}")
    # Optional URL argument (e.g. open a site in an allowlisted browser).
    # It is passed as a single argv element with shell=False, so it cannot
    # inject extra flags -- and it must be a plain http(s) URL, nothing else.
    argv = [app_name]
    if url is not None:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError(f"URL argument must be an http(s) URL: {url}")
        argv.append(url)
    import subprocess
    try:
        subprocess.Popen(argv, shell=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except FileNotFoundError:
        resolved = _resolve_app_executable(app_name)
        if resolved == app_name:
            raise ValueError(f"Approved application not found: {app_name}")
        argv[0] = resolved
        try:
            subprocess.Popen(argv, shell=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except FileNotFoundError:
            raise ValueError(f"Approved application not found: {app_name}")
    return {"launched": app_name, "url": url} if url is not None else {"launched": app_name}


# --- Interactive UI Automation (Tier 3, desktop_enabled required) --------
_VK_MAP: dict[str, int] = {
    "backspace": 0x08, "tab": 0x09, "enter": 0x0D, "return": 0x0D,
    "shift": 0x10, "ctrl": 0x11, "control": 0x11, "alt": 0x12,
    "pause": 0x13, "capslock": 0x14, "esc": 0x1B, "escape": 0x1B,
    "space": 0x20, "pageup": 0x21, "pagedown": 0x22, "end": 0x23, "home": 0x24,
    "left": 0x25, "up": 0x26, "right": 0x27, "down": 0x28,
    "insert": 0x2D, "delete": 0x2E, "del": 0x2E,
    "win": 0x5B, "lwin": 0x5B, "f1": 0x70, "f2": 0x71, "f3": 0x72, "f4": 0x73,
    "f5": 0x74, "f6": 0x75, "f7": 0x76, "f8": 0x77, "f9": 0x78, "f10": 0x79,
    "f11": 0x7A, "f12": 0x7B,
}

def _vk_for_token(token: str) -> int:
    t = token.strip().lower()
    if t in _VK_MAP:
        return _VK_MAP[t]
    if len(t) == 1 and ("a" <= t <= "z" or "0" <= t <= "9"):
        return ord(t.upper())
    raise ValueError(f"Unsupported key token: {token!r}")

def _win32_ui_action(action: str, *, x: int | None, y: int | None, text: str | None,
                     key: str | None, title: str | None, delta: int) -> dict:
    import ctypes
    from ctypes import wintypes

    u = ctypes.windll.user32
    hdesk = u.OpenDesktopW("Default", 0, False, 0x01FF)
    if hdesk:
        u.SetThreadDesktop(hdesk)
    try:
        if action in {"list_windows", "focus_window"}:
            windows: list[dict] = []
            WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
            rect = wintypes.RECT()

            def _cb(hwnd, _lp):
                if not u.IsWindowVisible(hwnd):
                    return True
                length = u.GetWindowTextLengthW(hwnd)
                if length <= 0:
                    return True
                buf = ctypes.create_unicode_buffer(length + 1)
                u.GetWindowTextW(hwnd, buf, length + 1)
                wtitle = buf.value.strip()
                if not wtitle:
                    return True
                u.GetWindowRect(hwnd, ctypes.byref(rect))
                windows.append({
                    "hwnd": int(hwnd),
                    "title": wtitle,
                    "minimized": bool(u.IsIconic(hwnd)),
                    "bounds": [rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top],
                })
                return True

            cb = WNDENUMPROC(_cb)
            if hdesk:
                u.EnumDesktopWindows(hdesk, cb, 0)
            else:
                u.EnumWindows(cb, 0)
            if action == "list_windows":
                return {"action": "list_windows", "windows": windows[:100]}
            if not title or not title.strip():
                raise ValueError("focus_window requires a non-empty 'title' substring.")
            needle = title.strip().lower()
            match = next((w for w in windows if needle in w["title"].lower()), None)
            if match is None:
                raise ValueError(f"No visible window matching {title!r}.")
            hwnd = match["hwnd"]
            if match["minimized"]:
                u.ShowWindow(hwnd, 9)  # SW_RESTORE
            u.SetForegroundWindow(hwnd)
            return {"action": "focus_window", "focused": match["title"], "hwnd": hwnd}

        if action in {"move_mouse", "click", "double_click", "right_click"}:
            if x is None or y is None:
                raise ValueError(f"{action} requires integer x and y coordinates.")
            ix, iy = int(x), int(y)
            u.SetCursorPos(ix, iy)
            if action == "click":
                u.mouse_event(0x0002, 0, 0, 0, 0)  # MOUSEEVENTF_LEFTDOWN
                u.mouse_event(0x0004, 0, 0, 0, 0)  # MOUSEEVENTF_LEFTUP
            elif action == "double_click":
                for _ in range(2):
                    u.mouse_event(0x0002, 0, 0, 0, 0)
                    u.mouse_event(0x0004, 0, 0, 0, 0)
                    time.sleep(0.05)
            elif action == "right_click":
                u.mouse_event(0x0008, 0, 0, 0, 0)  # MOUSEEVENTF_RIGHTDOWN
                u.mouse_event(0x0010, 0, 0, 0, 0)  # MOUSEEVENTF_RIGHTUP
            return {"action": action, "x": ix, "y": iy}

        if action == "scroll":
            if x is not None and y is not None:
                u.SetCursorPos(int(x), int(y))
            u.mouse_event(0x0800, 0, 0, int(delta or -120), 0)  # MOUSEEVENTF_WHEEL
            return {"action": "scroll", "delta": int(delta or -120)}

        if action == "type_text":
            if not isinstance(text, str) or not text:
                raise ValueError("type_text requires a non-empty 'text' string.")
            if len(text) > 2000:
                raise ValueError("type_text is capped at 2000 characters per call.")
            fg = u.GetForegroundWindow()
            for ch in text:
                if ch == "\n":
                    u.keybd_event(0x0D, 0, 0, 0)
                    u.keybd_event(0x0D, 0, 0x0002, 0)
                elif fg:
                    u.PostMessageW(fg, 0x0102, ord(ch), 0)  # WM_CHAR
                time.sleep(0.005)
            return {"action": "type_text", "length": len(text)}

        if action in {"press_key", "hotkey"}:
            if not isinstance(key, str) or not key.strip():
                raise ValueError(f"{action} requires a 'key' string (e.g. 'enter' or 'ctrl+l').")
            parts = [p.strip() for p in key.split("+") if p.strip()]
            vks = [_vk_for_token(p) for p in parts]
            for vk in vks:
                u.keybd_event(vk, 0, 0, 0)
            for vk in reversed(vks):
                u.keybd_event(vk, 0, 0x0002, 0)  # KEYEVENTF_KEYUP
            return {"action": action, "key": key}
    finally:
        if hdesk:
            u.CloseDesktop(hdesk)
    raise ValueError(f"Unsupported UI action: {action!r}")


def perform_approved_ui_action(
    action: str,
    *,
    x: int | None = None,
    y: int | None = None,
    text: str | None = None,
    key: str | None = None,
    title: str | None = None,
    delta: int = -120,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Perform a bounded desktop UI action when desktop automation is enabled.

    Supported actions:
      - list_windows: list visible top-level windows with titles and bounds
      - focus_window: bring a window matching 'title' substring to the foreground
      - move_mouse, click, double_click, right_click: mouse action at (x, y)
      - scroll: mouse wheel scroll by 'delta' (optionally at x, y)
      - type_text: type 'text' into the focused window (max 2000 chars)
      - press_key / hotkey: press a key or combo like 'enter', 'esc', 'ctrl+l', 'alt+tab'
    """
    eff_policy = policy or default_policy()
    _check("perform_approved_ui_action", approval_granted=approval_granted, policy=eff_policy)
    allowed_actions = {
        "list_windows", "focus_window", "move_mouse", "click",
        "double_click", "right_click", "scroll", "type_text", "press_key", "hotkey",
    }
    if action not in allowed_actions:
        raise ValueError(f"Unsupported UI action {action!r}. Choose one of: {', '.join(sorted(allowed_actions))}")
    if platform.system() == "Windows":
        return _win32_ui_action(action, x=x, y=y, text=text, key=key, title=title, delta=delta)
    if shutil.which("xdotool") is None:
        return {"available": False, "note": "UI automation on Linux requires xdotool (or Windows user32)."}
    if action == "list_windows":
        out = diagnostics._run(["xdotool", "search", "--onlyvisible", "--name", "."])
        return {"action": "list_windows", "output": out}
    if action in {"move_mouse", "click", "double_click", "right_click"}:
        if x is None or y is None:
            raise ValueError(f"{action} requires integer x and y coordinates.")
        argv = ["xdotool", "mousemove", str(int(x)), str(int(y))]
        if action == "click":
            argv += ["click", "1"]
        elif action == "double_click":
            argv += ["click", "--repeat", "2", "1"]
        elif action == "right_click":
            argv += ["click", "3"]
        diagnostics._run(argv)
        return {"action": action, "x": int(x), "y": int(y)}
    if action == "type_text":
        if not isinstance(text, str) or not text:
            raise ValueError("type_text requires a non-empty 'text' string.")
        diagnostics._run(["xdotool", "type", "--delay", "10", "--", text[:2000]])
        return {"action": "type_text", "length": len(text[:2000])}
    if action in {"press_key", "hotkey"}:
        if not isinstance(key, str) or not key.strip():
            raise ValueError(f"{action} requires a 'key' string.")
        diagnostics._run(["xdotool", "key", "--", key.strip()])
        return {"action": action, "key": key.strip()}
    return {"action": action, "note": "Action completed."}

# --- Software installation (Windows agent only, approval-gated) -----------
_PACKAGE_ID_RE = re.compile(r"^[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+$")
_VERSION_RE = re.compile(r"^[A-Za-z0-9._-]+$")

def install_package(package_id: str, version: str | None = None, *, approval_granted: bool = False, policy: Policy | None = None) -> dict:
    """Install a package on a Windows agent via winget.

    Tier-3 (sensitive): the control plane holds the task in
    needs_approval until a human approves it, and dispatch() passes
    that approval through here. Policy is enforced by dispatch() and
    re-checked here so direct calls stay gated too.
    The package id is validated and passed as a fixed argv list
    (shell=False) — no shell text from arguments is ever executed.
    Winget ids are Publisher.App (e.g. Microsoft.VisualStudioCode).
    """
    _check("install_package", approval_granted=approval_granted, policy=policy)
    if not isinstance(package_id, str) or not _PACKAGE_ID_RE.match(package_id):
        raise ValueError("package_id must look like a winget id (Publisher.App, letters/digits/dot/dash/underscore only).")
    if version is not None and (not isinstance(version, str) or not _VERSION_RE.match(version)):
        raise ValueError("version must be letters/digits/dot/dash/underscore only.")
    if platform.system() != "Windows":
        return {"available": False, "note": "install_package is Windows-only (winget); this host is not Windows."}
    if shutil.which("winget") is None:
        return {"available": False,
                "note": "winget not found on this machine. Install App Installer (winget) from the Microsoft Store first."}
    argv = ["winget", "install", "--id", package_id, "-e",
            "--accept-source-agreements", "--accept-package-agreements"]
    if version:
        argv += ["--version", version]
    try:
        proc = subprocess.run(argv, shell=False, capture_output=True, text=True, timeout=900)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"winget install of {package_id} timed out after 900s.")
    output = ((proc.stdout or "") + (proc.stderr or "")).strip()[:8000]
    if proc.returncode != 0:
        raise RuntimeError(f"winget install of {package_id} failed (exit {proc.returncode}): {output}")
    return {"installed": package_id, "version": version, "output": output}
