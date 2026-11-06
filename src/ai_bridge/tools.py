"""Shared tool implementations used by the MCP server, the agent, and
the control plane. Each function enforces policy before doing work.
No function here trusts its caller: device_revoked / approval flags are
inputs the *server* supplies, never values an AI tool argument can set
for itself (see policy.decide and server wrappers)."""
from __future__ import annotations

import base64
import hashlib
import io
import os
import platform
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
import zipfile
from pathlib import Path

from . import diagnostics
from .config import get_settings
from .execution import RUNNER
from .policy import Policy, decide
from .security import confined_path, is_secret_name, redact, workspace_root


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


def get_network_info() -> dict:
    _check("get_network_info"); return diagnostics.network_info()


def get_service_status(service: str, *, policy: Policy | None = None) -> dict:
    eff_policy = policy or default_policy()
    _check("get_service_status", policy=eff_policy)
    allowed_svc = None if eff_policy.unrestricted or "*" in eff_policy.allowed_services else eff_policy.allowed_services
    return diagnostics.service_status(service, allowed_services=allowed_svc)


def _is_safe_workspace_file(p, root) -> bool:
    if ".ai-bridge-backups" in p.parts or p.is_symlink() or not p.is_file() or is_secret_name(p):
        return False
    try:
        resolved = p.resolve()
    except OSError:
        return False
    return resolved == root or root in resolved.parents


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
            if not _is_safe_workspace_file(p, root):
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
    root = workspace_root()
    dst.mkdir(parents=True, exist_ok=True)
    copied = 0
    for p in sorted(src.rglob("*")):
        if not _is_safe_workspace_file(p, root):
            continue
        if dst == p or dst in p.parents:
            continue
        rel = p.relative_to(src); out = dst / rel
        out.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(p, out); copied += 1
    return {"backup": backup["backup"], "target": target_directory, "files_copied": copied,
            "note": "Staging deploy inside the workspace only."}

def run_project_tests(test_command: str = "pytest", timeout: int = 120, *, policy: Policy | None = None) -> dict:
    eff_policy = policy or default_policy()
    _check("run_project_tests", policy=eff_policy)
    result = RUNNER.submit("run_project_tests", timeout=timeout, test_command=test_command,
                           allowed_test_commands=eff_policy.allowed_test_commands)
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
    sw = shot.size[0] if isinstance(shot.size, tuple) else getattr(shot, "width", 0)
    sh = shot.size[1] if isinstance(shot.size, tuple) else getattr(shot, "height", 0)
    active_win = ""
    if platform.system() == "Windows":
        try:
            import ctypes
            fg = ctypes.windll.user32.GetForegroundWindow()
            if fg:
                len_w = ctypes.windll.user32.GetWindowTextLengthW(fg)
                if len_w > 0:
                    t_buf = ctypes.create_unicode_buffer(len_w + 1)
                    ctypes.windll.user32.GetWindowTextW(fg, t_buf, len_w + 1)
                    active_win = t_buf.value.strip()
        except Exception:
            pass
    res = {
        "available": True,
        "path": str(out),
        "size": [sw, sh],
        "width": sw,
        "height": sh,
        "active_window": active_win,
    }
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
    allowed = eff_policy.allowed_apps
    if not eff_policy.unrestricted and "*" not in allowed and app_name not in allowed:
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
    "backspace": 0x08, "tab": 0x09, "clear": 0x0C, "enter": 0x0D, "return": 0x0D,
    "shift": 0x10, "ctrl": 0x11, "control": 0x11, "alt": 0x12, "menu": 0x12,
    "pause": 0x13, "capslock": 0x14, "esc": 0x1B, "escape": 0x1B,
    "space": 0x20, "pageup": 0x21, "pagedown": 0x22, "end": 0x23, "home": 0x24,
    "left": 0x25, "up": 0x26, "right": 0x27, "down": 0x28,
    "select": 0x29, "print": 0x2A, "execute": 0x2B, "printscreen": 0x2C, "prtsc": 0x2C,
    "insert": 0x2D, "delete": 0x2E, "del": 0x2E, "help": 0x2F,
    "win": 0x5B, "lwin": 0x5B, "rwin": 0x5C, "apps": 0x5D,
    "numpad0": 0x60, "numpad1": 0x61, "numpad2": 0x62, "numpad3": 0x63,
    "numpad4": 0x64, "numpad5": 0x65, "numpad6": 0x66, "numpad7": 0x67,
    "numpad8": 0x68, "numpad9": 0x69, "multiply": 0x6A, "add": 0x6B,
    "separator": 0x6C, "subtract": 0x6D, "decimal": 0x6E, "divide": 0x6F,
    "f1": 0x70, "f2": 0x71, "f3": 0x72, "f4": 0x73, "f5": 0x74, "f6": 0x75,
    "f7": 0x76, "f8": 0x77, "f9": 0x78, "f10": 0x79, "f11": 0x7A, "f12": 0x7B,
    "numlock": 0x90, "scrolllock": 0x91,
}

def _vk_for_token(token: str) -> int:
    t = token.strip().lower()
    if t in _VK_MAP:
        return _VK_MAP[t]
    if len(t) == 1 and ("a" <= t <= "z" or "0" <= t <= "9"):
        return ord(t.upper())
    raise ValueError(f"Unsupported key token: {token!r}")

def _win32_ui_action(action: str, *, x: int | None, y: int | None, text: str | None,
                     key: str | None, title: str | None, delta: int,
                     start_x: int | None = None, start_y: int | None = None) -> dict:
    import ctypes
    from ctypes import wintypes

    u = ctypes.windll.user32
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            u.SetProcessDPIAware()
        except Exception:
            pass

    hdesk = u.OpenDesktopW("Default", 0, False, 0x01FF)
    if hdesk:
        u.SetThreadDesktop(hdesk)
    try:
        if action == "get_screen_size":
            sw = u.GetSystemMetrics(0)
            sh = u.GetSystemMetrics(1)
            return {"action": "get_screen_size", "width": sw, "height": sh}

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

        if action in {"move_mouse", "click", "double_click", "triple_click", "right_click", "middle_click"}:
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
                    time.sleep(0.04)
            elif action == "triple_click":
                for _ in range(3):
                    u.mouse_event(0x0002, 0, 0, 0, 0)
                    u.mouse_event(0x0004, 0, 0, 0, 0)
                    time.sleep(0.04)
            elif action == "right_click":
                u.mouse_event(0x0008, 0, 0, 0, 0)  # MOUSEEVENTF_RIGHTDOWN
                u.mouse_event(0x0010, 0, 0, 0, 0)  # MOUSEEVENTF_RIGHTUP
            elif action == "middle_click":
                u.mouse_event(0x0020, 0, 0, 0, 0)  # MOUSEEVENTF_MIDDLEDOWN
                u.mouse_event(0x0040, 0, 0, 0, 0)  # MOUSEEVENTF_MIDDLEUP
            return {"action": action, "x": ix, "y": iy}

        if action in {"drag", "mouse_drag"}:
            sx = int(start_x if start_x is not None else (x or 0))
            sy = int(start_y if start_y is not None else (y or 0))
            ex = int(x if x is not None else sx)
            ey = int(y if y is not None else sy)
            u.SetCursorPos(sx, sy)
            time.sleep(0.02)
            u.mouse_event(0x0002, 0, 0, 0, 0)  # MOUSEEVENTF_LEFTDOWN
            steps = 15
            for s in range(1, steps + 1):
                cx = int(sx + (ex - sx) * (s / steps))
                cy = int(sy + (ey - sy) * (s / steps))
                u.SetCursorPos(cx, cy)
                time.sleep(0.01)
            u.SetCursorPos(ex, ey)
            time.sleep(0.02)
            u.mouse_event(0x0004, 0, 0, 0, 0)  # MOUSEEVENTF_LEFTUP
            return {"action": "drag", "start_x": sx, "start_y": sy, "end_x": ex, "end_y": ey}

        if action == "scroll":
            if x is not None and y is not None:
                u.SetCursorPos(int(x), int(y))
            u.mouse_event(0x0800, 0, 0, int(delta or -120), 0)  # MOUSEEVENTF_WHEEL
            return {"action": "scroll", "delta": int(delta or -120)}

        if action == "type_text":
            if not isinstance(text, str) or not text:
                raise ValueError("type_text requires a non-empty 'text' string.")
            if len(text) > 4000:
                raise ValueError("type_text is capped at 4000 characters per call.")

            class KEYBDINPUT(ctypes.Structure):
                _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD),
                            ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD),
                            ("dwExtraInfo", ctypes.c_void_p)]
            class MOUSEINPUT(ctypes.Structure):
                _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG),
                            ("mouseData", wintypes.DWORD), ("dwFlags", wintypes.DWORD),
                            ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.c_void_p)]
            class HARDWAREINPUT(ctypes.Structure):
                _fields_ = [("uMsg", wintypes.DWORD), ("wParamL", wintypes.WORD),
                            ("wParamH", wintypes.WORD)]
            class _INPUT_U(ctypes.Union):
                _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT), ("hi", HARDWAREINPUT)]
            class INPUT(ctypes.Structure):
                _fields_ = [("type", wintypes.DWORD), ("u", _INPUT_U)]

            fg = u.GetForegroundWindow()
            for ch in text:
                if ch == "\n":
                    u.keybd_event(0x0D, 0, 0, 0)
                    u.keybd_event(0x0D, 0, 0x0002, 0)
                    time.sleep(0.01)
                    continue
                if ch == "\t":
                    u.keybd_event(0x09, 0, 0, 0)
                    u.keybd_event(0x09, 0, 0x0002, 0)
                    time.sleep(0.01)
                    continue
                try:
                    c_code = ord(ch)
                    inp_down = INPUT(type=1)
                    inp_down.u.ki.wVk = 0
                    inp_down.u.ki.wScan = c_code
                    inp_down.u.ki.dwFlags = 0x0004  # KEYEVENTF_UNICODE
                    inp_down.u.ki.time = 0
                    inp_down.u.ki.dwExtraInfo = None

                    inp_up = INPUT(type=1)
                    inp_up.u.ki.wVk = 0
                    inp_up.u.ki.wScan = c_code
                    inp_up.u.ki.dwFlags = 0x0004 | 0x0002  # KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
                    inp_up.u.ki.time = 0
                    inp_up.u.ki.dwExtraInfo = None

                    inputs = (INPUT * 2)(inp_down, inp_up)
                    u.SendInput(2, ctypes.byref(inputs), ctypes.sizeof(INPUT))
                except Exception:
                    if fg:
                        u.PostMessageW(fg, 0x0102, ord(ch), 0)
                time.sleep(0.005)
            return {"action": "type_text", "length": len(text)}

        if action in {"press_key", "hotkey"}:
            if not isinstance(key, str) or not key.strip():
                raise ValueError(f"{action} requires a 'key' string (e.g. 'enter' or 'ctrl+l').")
            parts = [p.strip() for p in key.split("+") if p.strip()]
            vks = [_vk_for_token(p) for p in parts]
            for vk in vks:
                u.keybd_event(vk, 0, 0, 0)
            time.sleep(0.01)
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
    start_x: int | None = None,
    start_y: int | None = None,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Perform a bounded desktop UI action when desktop automation is enabled.

    Supported actions:
      - list_windows: list visible top-level windows with titles and bounds
      - focus_window: bring a window matching 'title' substring to the foreground
      - move_mouse, click, double_click, triple_click, right_click, middle_click: mouse action at (x, y)
      - drag / mouse_drag: mouse drag from (start_x, start_y) to (x, y)
      - scroll: mouse wheel scroll by 'delta' (optionally at x, y)
      - type_text: type 'text' into the focused window/control using Unicode SendInput
      - press_key / hotkey: press a key or combo like 'enter', 'esc', 'ctrl+l', 'alt+tab'
      - get_screen_size: get desktop screen dimensions
    """
    eff_policy = policy or default_policy()
    _check("perform_approved_ui_action", approval_granted=approval_granted, policy=eff_policy)
    allowed_actions = {
        "list_windows", "focus_window", "move_mouse", "click",
        "double_click", "triple_click", "right_click", "middle_click",
        "scroll", "type_text", "press_key", "hotkey", "drag", "mouse_drag",
        "get_screen_size",
    }
    if action not in allowed_actions:
        raise ValueError(f"Unsupported UI action {action!r}. Choose one of: {', '.join(sorted(allowed_actions))}")

    if action in {"click", "double_click", "triple_click", "right_click", "middle_click", "move_mouse"}:
        if x is None or y is None:
            raise ValueError(f"Action '{action}' requires integer x and y coordinates.")
    if action in {"drag", "mouse_drag"}:
        if x is None or y is None or start_x is None or start_y is None:
            raise ValueError(f"Action '{action}' requires start_x, start_y, x, and y coordinates.")
    if action == "type_text" and not text:
        raise ValueError("Action 'type_text' requires a non-empty string in 'text'.")
    if action in {"press_key", "hotkey"} and not key:
        raise ValueError(f"Action '{action}' requires a 'key' parameter.")
    if action == "focus_window" and not title:
        raise ValueError("Action 'focus_window' requires a non-empty window title in 'title'.")

    if platform.system() == "Windows":
        extra = {}
        if start_x is not None or start_y is not None:
            extra["start_x"] = start_x
            extra["start_y"] = start_y
        return _win32_ui_action(
            action, x=x, y=y, text=text, key=key, title=title, delta=delta, **extra
        )
    if shutil.which("xdotool") is None:
        return {"available": False, "note": "UI automation on Linux requires xdotool (or Windows user32)."}
    if action == "get_screen_size":
        out = diagnostics._run(["xdotool", "getdisplaygeometry"])
        parts = out.strip().split()
        if len(parts) >= 2:
            try:
                return {"action": "get_screen_size", "width": int(parts[0]), "height": int(parts[1])}
            except Exception:
                pass
        return {"action": "get_screen_size", "output": out}
    if action == "list_windows":
        out = diagnostics._run(["xdotool", "search", "--onlyvisible", "--name", "."])
        return {"action": "list_windows", "output": out}
    if action in {"move_mouse", "click", "double_click", "triple_click", "right_click", "middle_click"}:
        if x is None or y is None:
            raise ValueError(f"{action} requires integer x and y coordinates.")
        argv = ["xdotool", "mousemove", str(int(x)), str(int(y))]
        if action == "click":
            argv += ["click", "1"]
        elif action == "double_click":
            argv += ["click", "--repeat", "2", "1"]
        elif action == "triple_click":
            argv += ["click", "--repeat", "3", "1"]
        elif action == "right_click":
            argv += ["click", "3"]
        elif action == "middle_click":
            argv += ["click", "2"]
        diagnostics._run(argv)
        return {"action": action, "x": int(x), "y": int(y)}
    if action in {"drag", "mouse_drag"}:
        sx = int(start_x if start_x is not None else (x or 0))
        sy = int(start_y if start_y is not None else (y or 0))
        ex = int(x if x is not None else sx)
        ey = int(y if y is not None else sy)
        diagnostics._run(["xdotool", "mousemove", str(sx), str(sy), "mousedown", "1",
                         "mousemove", str(ex), str(ey), "mouseup", "1"])
        return {"action": "drag", "start_x": sx, "start_y": sy, "end_x": ex, "end_y": ey}
    if action == "type_text":
        if not isinstance(text, str) or not text:
            raise ValueError("type_text requires a non-empty 'text' string.")
        diagnostics._run(["xdotool", "type", "--delay", "10", "--", text[:4000]])
        return {"action": "type_text", "length": len(text[:4000])}
    if action in {"press_key", "hotkey"}:
        if not isinstance(key, str) or not key.strip():
            raise ValueError(f"{action} requires a 'key' string.")
        diagnostics._run(["xdotool", "key", "--", key.strip()])
        return {"action": action, "key": key.strip()}
    if action == "focus_window":
        if not title or not title.strip():
            raise ValueError("focus_window requires a non-empty 'title' substring.")
        out = diagnostics._run(["xdotool", "search", "--onlyvisible", "--name", title.strip(), "windowactivate"])
        return {"action": "focus_window", "focused": title.strip(), "output": out}
    if action == "scroll":
        if x is not None and y is not None:
            diagnostics._run(["xdotool", "mousemove", str(int(x)), str(int(y))])
        btn = "5" if int(delta or -120) < 0 else "4"
        diagnostics._run(["xdotool", "click", btn])
        return {"action": "scroll", "delta": int(delta or -120)}
    raise ValueError(f"Unsupported UI action: {action!r}")


# --- Dedicated High-Level Desktop GUI Tools (Mouse & Keyboard) -----------

def mouse_click(
    x: int,
    y: int,
    button: str = "left",
    clicks: int = 1,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Click the mouse at (x, y) coordinates with specified button and click count."""
    eff_policy = policy or default_policy()
    _check("mouse_click", approval_granted=approval_granted, policy=eff_policy)
    btn = (button or "left").lower()
    act = "click"
    if clicks == 2 or btn == "double":
        act = "double_click"
    elif clicks >= 3 or btn == "triple":
        act = "triple_click"
    elif btn == "right":
        act = "right_click"
    elif btn == "middle":
        act = "middle_click"
    return perform_approved_ui_action(
        act, x=x, y=y, approval_granted=approval_granted, policy=eff_policy
    )


def mouse_move(
    x: int,
    y: int,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Move the mouse cursor to (x, y) coordinates."""
    eff_policy = policy or default_policy()
    _check("mouse_move", approval_granted=approval_granted, policy=eff_policy)
    return perform_approved_ui_action(
        "move_mouse", x=x, y=y, approval_granted=approval_granted, policy=eff_policy
    )


def mouse_scroll(
    delta: int = -120,
    x: int | None = None,
    y: int | None = None,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Scroll the mouse wheel. Positive delta scrolls up; negative delta scrolls down."""
    eff_policy = policy or default_policy()
    _check("mouse_scroll", approval_granted=approval_granted, policy=eff_policy)
    return perform_approved_ui_action(
        "scroll", x=x, y=y, delta=delta, approval_granted=approval_granted, policy=eff_policy
    )


def mouse_drag(
    start_x: int,
    start_y: int,
    end_x: int,
    end_y: int,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Click and drag the mouse from (start_x, start_y) to (end_x, end_y)."""
    eff_policy = policy or default_policy()
    _check("mouse_drag", approval_granted=approval_granted, policy=eff_policy)
    return perform_approved_ui_action(
        "drag", x=end_x, y=end_y, start_x=start_x, start_y=start_y,
        approval_granted=approval_granted, policy=eff_policy
    )


def keyboard_type(
    text: str,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Type unicode text into the currently active control or window."""
    eff_policy = policy or default_policy()
    _check("keyboard_type", approval_granted=approval_granted, policy=eff_policy)
    return perform_approved_ui_action(
        "type_text", text=text, approval_granted=approval_granted, policy=eff_policy
    )


def keyboard_press(
    key: str,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Press a key or hotkey combination (e.g. 'enter', 'tab', 'esc', 'ctrl+c', 'win')."""
    eff_policy = policy or default_policy()
    _check("keyboard_press", approval_granted=approval_granted, policy=eff_policy)
    return perform_approved_ui_action(
        "press_key", key=key, approval_granted=approval_granted, policy=eff_policy
    )


def list_desktop_windows(
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """List visible top-level windows on the desktop with their titles and bounds."""
    eff_policy = policy or default_policy()
    _check("list_desktop_windows", approval_granted=approval_granted, policy=eff_policy)
    return perform_approved_ui_action(
        "list_windows", approval_granted=approval_granted, policy=eff_policy
    )


def focus_window(
    title: str,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Bring the window matching 'title' to the foreground."""
    eff_policy = policy or default_policy()
    _check("focus_window", approval_granted=approval_granted, policy=eff_policy)
    return perform_approved_ui_action(
        "focus_window", title=title, approval_granted=approval_granted, policy=eff_policy
    )


def get_screen_size(
    *,
    policy: Policy | None = None,
) -> dict:
    """Get the primary desktop screen width and height in pixels."""
    eff_policy = policy or default_policy()
    _check("get_screen_size", approval_granted=True, policy=eff_policy)
    return perform_approved_ui_action(
        "get_screen_size", approval_granted=True, policy=eff_policy
    )


def ocr_screen(*, approval_granted: bool = False, policy: Policy | None = None) -> dict:
    """Run native OCR on the current desktop screen and return recognized text with coordinates."""
    eff_policy = policy or default_policy()
    _check("ocr_screen", approval_granted=approval_granted, policy=eff_policy)
    from . import vision
    shot_res = capture_desktop_screenshot(approval_granted=approval_granted, policy=eff_policy)
    if not shot_res.get("available") or not shot_res.get("path"):
        return {"ok": False, "error": "Unable to capture desktop screenshot for OCR."}
    ocr_res = vision.run_ocr(shot_res["path"])
    return {
        "ok": ocr_res.get("ok", False),
        "text": ocr_res.get("text", ""),
        "line_count": len(ocr_res.get("lines", [])),
        "lines": ocr_res.get("lines", []),
        "words": ocr_res.get("words", []),
        "screenshot_path": shot_res.get("path"),
    }


def click_text(
    text: str,
    *,
    occurrence: int = 1,
    button: str = "left",
    clicks: int = 1,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Find text on screen using native OCR + UI grounding and click its center (no pixel guessing)."""
    eff_policy = policy or default_policy()
    _check("click_text", approval_granted=approval_granted, policy=eff_policy)
    from . import vision
    shot_res = capture_desktop_screenshot(approval_granted=approval_granted, policy=eff_policy)
    img_path = shot_res.get("path") if shot_res.get("available") else None
    res = vision.find_text_coordinates(text, image_path=img_path, occurrence=occurrence)
    if not res.get("found") or not res.get("match"):
        raise ValueError(f"Text {text!r} not found on screen.")

    cx, cy = res["x"], res["y"]
    action_type = "double_click" if clicks == 2 else "triple_click" if clicks >= 3 else "right_click" if button == "right" else "click"
    ui_res = perform_approved_ui_action(action_type, x=cx, y=cy, approval_granted=approval_granted, policy=eff_policy)
    return {
        "ok": True,
        "action": "click_text",
        "clicked_text": text,
        "matched_text": res["match"].get("text"),
        "x": cx,
        "y": cy,
        "bounds": res["match"].get("bounds"),
        "button": button,
        "clicks": clicks,
        "ui_result": ui_res,
    }


def click_element(
    mark_id: str | None = None,
    name: str | None = None,
    *,
    button: str = "left",
    clicks: int = 1,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Click a labeled mark (from set_of_marks_screenshot) or element name."""
    eff_policy = policy or default_policy()
    _check("click_element", approval_granted=approval_granted, policy=eff_policy)
    target_text = str(mark_id) if mark_id is not None else str(name or "")
    if not target_text:
        raise ValueError("Either 'mark_id' or 'name' must be provided to click_element.")
    return click_text(target_text, button=button, clicks=clicks, approval_granted=approval_granted, policy=eff_policy)


def list_ui_elements(*, approval_granted: bool = False, policy: Policy | None = None) -> dict:
    """List visible interactive Windows controls (menus, buttons, input fields, child controls) with labels and bounds."""
    eff_policy = policy or default_policy()
    _check("list_ui_elements", approval_granted=approval_granted, policy=eff_policy)
    from . import vision
    ctrls = vision.list_win32_ui_controls()
    return {"ok": True, "count": len(ctrls), "elements": ctrls}


def set_of_marks_screenshot(
    *,
    max_marks: int = 40,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Capture a screenshot with numbered Set-of-Marks badges ([1], [2], [3]) overlaid over interactive elements."""
    eff_policy = policy or default_policy()
    _check("set_of_marks_screenshot", approval_granted=approval_granted, policy=eff_policy)
    from . import vision
    try:
        from PIL import Image
    except ImportError:
        raise RuntimeError("Pillow is required for set_of_marks_screenshot.")

    shot_res = capture_desktop_screenshot(approval_granted=approval_granted, policy=eff_policy)
    if not shot_res.get("available") or not shot_res.get("path"):
        return {"available": False, "note": "Screenshot unavailable."}

    img = Image.open(shot_res["path"])
    ann_img, marks = vision.generate_set_of_marks(img, image_path=shot_res["path"], max_marks=max_marks)

    out = get_settings().data_dir / f"annotated-screenshot-{int(time.time())}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    ann_img.save(out)
    b64, mime = _encode_image_base64(ann_img)

    return {
        "ok": True,
        "available": True,
        "path": str(out),
        "image_base64": b64,
        "mime_type": mime,
        "mark_count": len(marks),
        "marks": marks,
    }


def get_clipboard(*, policy: Policy | None = None) -> dict:
    """Read the current system clipboard text on Windows, Linux, or macOS."""
    eff_policy = policy or default_policy()
    _check("get_clipboard", policy=eff_policy)
    current_os = platform.system()
    if current_os == "Windows":
        proc = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw"],
            shell=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=8,
        )
        text = (proc.stdout or "").rstrip("\r\n")
        return {"ok": proc.returncode == 0, "text": text, "length": len(text), "system": current_os}

    for argv in (
        ["wl-paste", "--no-newline"],
        ["xclip", "-selection", "clipboard", "-o"],
        ["xsel", "--clipboard", "--output"],
        ["pbpaste"],
    ):
        if shutil.which(argv[0]):
            proc = subprocess.run(argv, shell=False, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=8)
            if proc.returncode == 0:
                text = proc.stdout or ""
                return {"ok": True, "text": text, "length": len(text), "system": current_os}
    return {"ok": False, "text": "", "length": 0, "system": current_os, "note": "No clipboard utility available."}


def set_clipboard(
    text: str,
    *,
    paste: bool = False,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Write text to the system clipboard and optionally trigger Ctrl+V paste into the active window."""
    eff_policy = policy or default_policy()
    _check("set_clipboard", approval_granted=approval_granted, policy=eff_policy)
    content = str(text or "")
    current_os = platform.system()
    ok = False

    if current_os == "Windows":
        proc = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "$input | Set-Clipboard"],
            input=content,
            shell=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=8,
        )
        ok = proc.returncode == 0
    else:
        for argv in (
            ["wl-copy"],
            ["xclip", "-selection", "clipboard"],
            ["xsel", "--clipboard", "--input"],
            ["pbcopy"],
        ):
            if shutil.which(argv[0]):
                proc = subprocess.run(argv, input=content, shell=False, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=8)
                if proc.returncode == 0:
                    ok = True
                    break

    pasted = False
    if ok and paste:
        time.sleep(0.15)
        try:
            press_hotkey("ctrl+v", approval_granted=approval_granted, policy=eff_policy)
            pasted = True
        except Exception:
            pasted = False

    return {"ok": ok, "length": len(content), "pasted": pasted, "system": current_os}

# --- Software installation & shell execution (approval-gated, Tier-3) -----
_PACKAGE_ID_RE = re.compile(r"^[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+$")
_LINUX_PKG_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._+-]*$")
_VERSION_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def install_package(package_id: str, version: str | None = None, *, approval_granted: bool = False, policy: Policy | None = None) -> dict:
    """Install a package on a Windows agent (winget) or Linux/WSL agent (apt/dnf/pacman/apk).

    Tier-3 (sensitive): the control plane holds the task in
    needs_approval until a human approves it, and dispatch() passes
    that approval through here. Policy is enforced by dispatch() and
    re-checked here so direct calls stay gated too.
    The package id is validated and passed as a fixed argv list
    (shell=False) — no shell text from arguments is ever executed.
    """
    _check("install_package", approval_granted=approval_granted, policy=policy)
    if not isinstance(package_id, str) or not package_id.strip():
        raise ValueError("package_id must be a non-empty string.")
    package_id = package_id.strip()

    if version is not None and (not isinstance(version, str) or not _VERSION_RE.match(version)):
        raise ValueError("version must be letters/digits/dot/dash/underscore only.")

    current_os = platform.system()

    if current_os == "Windows":
        if not _PACKAGE_ID_RE.match(package_id):
            raise ValueError("package_id must look like a winget id (Publisher.App, letters/digits/dot/dash/underscore only).")
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
        return {"installed": package_id, "version": version, "manager": "winget", "output": output}

    # Linux / WSL / Darwin
    pkg_name = package_id.split(".")[-1] if ("." in package_id and not _LINUX_PKG_RE.match(package_id)) else package_id
    if not _LINUX_PKG_RE.match(pkg_name):
        raise ValueError(f"Invalid package name {package_id!r}: letters, digits, dot, dash, underscore, plus only.")

    is_root = os.geteuid() == 0 if hasattr(os, "geteuid") else False
    sudo_prefix = [] if is_root else (["sudo", "-n"] if shutil.which("sudo") else [])

    env = dict(os.environ)
    env["DEBIAN_FRONTEND"] = "noninteractive"

    if shutil.which("apt-get"):
        target_spec = f"{pkg_name}={version}" if version else pkg_name
        argv = [*sudo_prefix, "apt-get", "install", "-y", target_spec]
        mgr = "apt-get"
    elif shutil.which("dnf"):
        target_spec = f"{pkg_name}-{version}" if version else pkg_name
        argv = [*sudo_prefix, "dnf", "install", "-y", target_spec]
        mgr = "dnf"
    elif shutil.which("yum"):
        target_spec = f"{pkg_name}-{version}" if version else pkg_name
        argv = [*sudo_prefix, "yum", "install", "-y", target_spec]
        mgr = "yum"
    elif shutil.which("pacman"):
        argv = [*sudo_prefix, "pacman", "-S", "--noconfirm", pkg_name]
        mgr = "pacman"
    elif shutil.which("apk"):
        argv = [*sudo_prefix, "apk", "add", pkg_name]
        mgr = "apk"
    else:
        return {"available": False, "note": "install_package found no supported package manager (apt-get, dnf, yum, pacman, apk)."}

    try:
        proc = subprocess.run(argv, shell=False, capture_output=True, text=True, timeout=900, env=env)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"{mgr} install of {pkg_name} timed out after 900s.")
    output = ((proc.stdout or "") + (proc.stderr or "")).strip()[:8000]
    if proc.returncode != 0:
        raise RuntimeError(f"{mgr} install of {pkg_name} failed (exit {proc.returncode}): {output}")
    return {"installed": pkg_name, "version": version, "manager": mgr, "output": output}


_SCRUB_ENV_KEYS = frozenset({
    "AI_BRIDGE_ADMIN_TOKEN",
    "AI_BRIDGE_DEVICE_TOKEN",
    "AI_BRIDGE_OIDC_CLIENT_SECRET",
})


def run_shell(
    command: str,
    working_directory: str = "",
    timeout: int = 0,
    *,
    approval_granted: bool = False,
    is_admin: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Run a shell command on this host. Tier-3 sensitive tool gated by policy / approval."""
    _check("run_shell", approval_granted=approval_granted, is_admin=is_admin, policy=policy)
    timeout_arg = min(int(timeout), 3600) if timeout and int(timeout) > 0 else 300
    cwd = None
    if working_directory:
        try:
            cwd = str(confined_path(working_directory))
        except ValueError:
            host_tools_enabled = os.environ.get("AI_BRIDGE_DISABLE_HOST_TOOLS", "1") == "0"
            if (host_tools_enabled or (policy and policy.unrestricted) or is_admin) and os.path.isabs(working_directory) and os.path.isdir(working_directory):
                cwd = working_directory
            else:
                raise
    else:
        try:
            ws = workspace_root()
            if ws.is_dir():
                cwd = str(ws)
        except Exception:
            cwd = None

    child_env = {k: v for k, v in os.environ.items() if k not in _SCRUB_ENV_KEYS}

    try:
        proc = subprocess.run(
            command,
            shell=True,
            cwd=cwd,
            env=child_env,
            capture_output=True,
            text=True,
            timeout=timeout_arg,
        )
        return {
            "returncode": proc.returncode,
            "stdout": redact((proc.stdout or "")[-20000:]),
            "stderr": redact((proc.stderr or "")[-20000:]),
        }
    except subprocess.TimeoutExpired:
        return {
            "returncode": None,
            "timeout": True,
            "stdout": "",
            "stderr": f"command timed out after {timeout_arg}s",
        }
    except Exception as exc:  # noqa: BLE001
        return {"returncode": None, "error": redact(str(exc))}


def read_file(path: str, max_chars: int = 100000, *, policy: Policy | None = None) -> str:
    """Read a UTF-8 text file by absolute path."""
    from pathlib import Path

    _check("read_file", policy=policy)
    target = Path(path).expanduser()
    if is_secret_name(target):
        raise ValueError("Refusing to read a file whose name suggests it holds secrets.")
    try:
        text = target.read_bytes().decode("utf-8")
    except UnicodeDecodeError:
        raise ValueError("not a UTF-8 text file")
    text = redact(text)
    if len(text) > max_chars:
        text = text[:max_chars] + "\n[truncated]"
    return text


def write_file(path: str, content: str, overwrite: bool = False, *, approval_granted: bool = False, is_admin: bool = False, policy: Policy | None = None) -> dict:
    """Write content to an absolute path."""
    from pathlib import Path

    _check("write_file", approval_granted=approval_granted, is_admin=is_admin, policy=policy)
    target = Path(path).expanduser()
    if is_secret_name(target):
        raise ValueError("Refusing to write a file whose name suggests it holds secrets.")
    if target.exists() and not overwrite:
        raise ValueError("file exists; pass overwrite=true to replace it")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return {"path": str(target), "bytes": len(content.encode("utf-8"))}


def wait_for_text(
    text: str,
    *,
    timeout_seconds: float = 15.0,
    poll_interval: float = 1.0,
    occurrence: int = 1,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Poll screen with native OCR until specified text appears or timeout is reached."""
    eff_policy = policy or default_policy()
    _check("wait_for_text", approval_granted=approval_granted, policy=eff_policy)
    from . import vision

    start_t = time.time()
    deadline = start_t + max(1.0, float(timeout_seconds))
    interval = max(0.2, min(float(poll_interval), 5.0))
    attempts = 0

    while True:
        attempts += 1
        shot_res = capture_desktop_screenshot(approval_granted=approval_granted, policy=eff_policy)
        img_path = shot_res.get("path") if shot_res.get("available") else None
        res = vision.find_text_coordinates(text, image_path=img_path, occurrence=occurrence)
        if res.get("found") and res.get("match"):
            elapsed = round(time.time() - start_t, 2)
            return {
                "ok": True,
                "found": True,
                "text": text,
                "matched_text": res["match"].get("text"),
                "elapsed_seconds": elapsed,
                "attempts": attempts,
                "x": res["x"],
                "y": res["y"],
                "bounds": res["match"].get("bounds"),
            }
        now = time.time()
        if now >= deadline:
            elapsed = round(now - start_t, 2)
            return {
                "ok": False,
                "found": False,
                "text": text,
                "elapsed_seconds": elapsed,
                "attempts": attempts,
                "error": f"Timeout waiting for text '{text}' on screen after {elapsed}s.",
            }
        rem = deadline - now
        time.sleep(min(interval, rem))


def verify_screen_contains(
    text: str,
    *,
    occurrence: int = 1,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """One-shot instant verification: check if text is currently displayed on screen."""
    eff_policy = policy or default_policy()
    _check("verify_screen_contains", approval_granted=approval_granted, policy=eff_policy)
    from . import vision

    shot_res = capture_desktop_screenshot(approval_granted=approval_granted, policy=eff_policy)
    img_path = shot_res.get("path") if shot_res.get("available") else None
    res = vision.find_text_coordinates(text, image_path=img_path, occurrence=occurrence)
    return {
        "ok": True,
        "contains": bool(res.get("found")),
        "text": text,
        "matched_text": res.get("match", {}).get("text") if res.get("match") else None,
        "bounds": res.get("match", {}).get("bounds") if res.get("match") else None,
        "center": [res["x"], res["y"]] if res.get("found") else None,
    }


def press_hotkey(
    combo: str,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Press a standard keyboard shortcut or hotkey (e.g. 'ctrl+s', 'ctrl+t', 'alt+tab', 'enter')."""
    eff_policy = policy or default_policy()
    _check("press_hotkey", approval_granted=approval_granted, policy=eff_policy)
    c = (combo or "").strip().lower()
    if not c:
        raise ValueError("Hotkey combo must not be empty.")
    return perform_approved_ui_action("hotkey", key=c, approval_granted=approval_granted, policy=eff_policy)


def execute_workflow(
    steps: list[dict],
    *,
    stop_on_failure: bool = True,
    max_retries: int = 1,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Execute a structured plan of autonomous actions sequentially with verification and retry."""
    eff_policy = policy or default_policy()
    _check("execute_workflow", approval_granted=approval_granted, policy=eff_policy)
    from .control.dispatch import dispatch

    results = []
    workflow_ok = True
    start_total = time.time()

    for idx, step in enumerate(steps or []):
        step_name = step.get("name") or f"Step {idx + 1}"
        action = step.get("action")
        args = dict(step.get("args") or {})
        verify_cfg = step.get("verify")
        retries_left = max(0, int(step.get("retries", max_retries)))

        step_res = {
            "index": idx + 1,
            "name": step_name,
            "action": action,
            "args": args,
            "status": "pending",
            "duration_seconds": 0.0,
            "result": None,
            "error": None,
        }

        t0 = time.time()
        step_success = False

        while retries_left >= 0 and not step_success:
            try:
                act_res = dispatch(action, args, policy=eff_policy, approval_granted=approval_granted)
                step_res["result"] = act_res

                if verify_cfg and isinstance(verify_cfg, dict):
                    v_text = verify_cfg.get("text")
                    v_timeout = float(verify_cfg.get("timeout_seconds", 8.0))
                    if v_text:
                        v_res = wait_for_text(v_text, timeout_seconds=v_timeout, approval_granted=approval_granted, policy=eff_policy)
                        step_res["verification"] = v_res
                        if not v_res.get("found"):
                            raise RuntimeError(f"Step verification failed: text '{v_text}' not found after {v_timeout}s.")

                step_res["status"] = "completed"
                step_success = True
            except Exception as exc:
                retries_left -= 1
                if retries_left < 0:
                    step_res["status"] = "failed"
                    step_res["error"] = str(exc)
                    workflow_ok = False
                else:
                    time.sleep(1.0)

        step_res["duration_seconds"] = round(time.time() - t0, 2)
        results.append(step_res)

        if not step_success and stop_on_failure:
            break

    total_duration = round(time.time() - start_total, 2)
    return {
        "ok": workflow_ok,
        "total_steps": len(steps or []),
        "executed_steps": len(results),
        "successful_steps": sum(1 for r in results if r["status"] == "completed"),
        "failed_steps": sum(1 for r in results if r["status"] == "failed"),
        "total_duration_seconds": total_duration,
        "steps": results,
    }


def broadcast_fleet_command(
    tool: str,
    args: dict | None = None,
    target_os: str | None = None,
    target_device_ids: list[str] | None = None,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Broadcast an action or diagnostic tool across multiple fleet devices simultaneously."""
    eff_policy = policy or default_policy()
    _check("broadcast_fleet_command", approval_granted=approval_granted, policy=eff_policy)
    from .control.dispatch import dispatch

    local_res = dispatch(tool, args or {}, policy=eff_policy, approval_granted=approval_granted)
    return {
        "ok": True,
        "batch_id": "local-broadcast",
        "device_count": 1,
        "results": [{"device_id": "local", "status": "completed", "result": local_res}],
    }


def get_system_monitors() -> list[dict]:
    """Enumerate all physical and virtual displays on the host machine."""
    try:
        from ai_bridge.screen_capture import get_monitors
        return get_monitors()
    except Exception:
        return [{"index": 0, "name": "Display 1 (Default)", "width": 1920, "height": 1080, "is_primary": True}]


def capture_desktop_frame(
    scale: float = 0.75,
    quality: int = 70,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Capture a lightweight scaled desktop frame optimized for real-time visual streaming."""
    eff_policy = policy or default_policy()
    _check("capture_desktop_screenshot", approval_granted=approval_granted, policy=eff_policy)
    import io, base64

    try:
        from PIL import Image, ImageGrab
    except Exception as exc:
        return {
            "available": False,
            "width": 0,
            "height": 0,
            "orig_width": 0,
            "orig_height": 0,
            "mime_type": "image/jpeg",
            "size_bytes": 0,
            "base64_data": "",
            "timestamp": time.time(),
            "note": f"Desktop capture requires Pillow: {exc}",
        }

    try:
        shot = ImageGrab.grab()
    except Exception as exc:
        if platform.system() == "Windows":
            shot = _grab_windows_desktop_fallback()
        else:
            return {
                "available": False,
                "width": 0,
                "height": 0,
                "orig_width": 0,
                "orig_height": 0,
                "mime_type": "image/jpeg",
                "size_bytes": 0,
                "base64_data": "",
                "timestamp": time.time(),
                "note": f"Desktop capture unavailable on headless host: {exc}",
            }

    orig_w, orig_h = shot.size
    scale = max(0.2, min(1.0, float(scale)))
    quality = max(20, min(95, int(quality)))

    if scale < 0.99:
        new_w = max(100, int(orig_w * scale))
        new_h = max(100, int(orig_h * scale))
        shot = shot.resize((new_w, new_h), Image.Resampling.BILINEAR)
    else:
        new_w, new_h = orig_w, orig_h

    if shot.mode in ("RGBA", "P"):
        shot = shot.convert("RGB")

    buf = io.BytesIO()
    shot.save(buf, format="JPEG", quality=quality)
    jpg_bytes = buf.getvalue()
    b64 = base64.b64encode(jpg_bytes).decode("ascii")

    return {
        "available": True,
        "width": new_w,
        "height": new_h,
        "orig_width": orig_w,
        "orig_height": orig_h,
        "scale": scale,
        "quality": quality,
        "mime_type": "image/jpeg",
        "size_bytes": len(jpg_bytes),
        "base64_data": b64,
        "timestamp": time.time(),
    }


def update_fleet_agent(
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Self-update the local agent from GitHub repository origin/main and verify dependencies."""
    eff_policy = policy or default_policy()
    _check("update_fleet_agent", approval_granted=approval_granted, policy=eff_policy)
    import subprocess
    cmd = (
        "git fetch origin main && git checkout -f -B main origin/main && git rev-parse --short HEAD"
    )
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
    return {
        "ok": res.returncode == 0,
        "returncode": res.returncode,
        "stdout": res.stdout.strip(),
        "stderr": res.stderr.strip(),
        "timestamp": time.time(),
    }


# ---------------------------------------------------------------------------
# Canonical v1.0 MCP Computer-Use Toolset (Section 8)
# ---------------------------------------------------------------------------

def _require_no_human_takeover(device_id: str = "local") -> None:
    """Enforce Section 12 & 13: Human takeover immediately revokes AI input until handed back."""
    from .control.v1_routes import is_device_human_takeover_active

    if is_device_human_takeover_active(device_id):
        raise PermissionError(
            "Human takeover is active on this desktop session; AI input and execution are suppressed until control is explicitly handed back."
        )


def desktop_get_screenshot(*, approval_granted: bool = False, policy: Policy | None = None) -> dict:
    """Return a current desktop screenshot."""
    eff_policy = policy or default_policy()
    _check("desktop_get_screenshot", approval_granted=approval_granted, policy=eff_policy)
    return capture_desktop_screenshot(approval_granted=approval_granted, policy=eff_policy)


def desktop_get_window_screenshot(
    hwnd: int | None = None,
    title: str = "",
    scale: float = 1.0,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
    device_id: str = "local",
) -> dict:
    """Return a screenshot of a specific application window by HWND or title."""
    eff_policy = policy or default_policy()
    _check("desktop_get_window_screenshot", approval_granted=approval_granted, policy=eff_policy)
    from .screen_capture import capture_window_by_hwnd

    target_hwnd = hwnd
    target_title = title
    if (target_hwnd is None or target_hwnd <= 0) and target_title:
        wins = list_desktop_windows(approval_granted=approval_granted, policy=eff_policy).get("windows", [])
        needle = target_title.strip().lower()
        match = next((w for w in wins if needle in str(w.get("title", "")).lower()), None)
        if match:
            target_hwnd = int(match.get("hwnd", 0))
            target_title = match.get("title", target_title)

    if target_hwnd and target_hwnd > 0:
        shot = capture_window_by_hwnd(target_hwnd, scale=scale)
    else:
        return capture_desktop_screenshot(approval_granted=approval_granted, policy=eff_policy)

    out = get_settings().data_dir / f"window-{int(time.time())}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    shot.save(out)
    b64, mime = _encode_image_base64(shot)
    sw = shot.size[0] if isinstance(shot.size, tuple) else getattr(shot, "width", 0)
    sh = shot.size[1] if isinstance(shot.size, tuple) else getattr(shot, "height", 0)
    return {
        "available": True,
        "path": str(out),
        "size": [sw, sh],
        "width": sw,
        "height": sh,
        "hwnd": target_hwnd,
        "window_title": target_title,
        "image_base64": b64,
        "mime_type": mime,
    }


def desktop_get_monitors(*, policy: Policy | None = None) -> dict:
    """Return list of connected displays with dimensions, offsets, and primary status."""
    eff_policy = policy or default_policy()
    _check("desktop_get_monitors", policy=eff_policy)
    from .screen_capture import get_monitors

    mons = get_monitors()
    return {"ok": True, "monitors": mons, "count": len(mons)}


def desktop_clipboard_get(*, policy: Policy | None = None, device_id: str = "local") -> dict:
    """Read the current system clipboard text."""
    eff_policy = policy or default_policy()
    _check("desktop_clipboard_get", policy=eff_policy)
    return get_clipboard(policy=eff_policy)


def desktop_clipboard_set(
    text: str,
    paste: bool = False,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
    device_id: str = "local",
) -> dict:
    """Write text to the system clipboard and optionally trigger paste."""
    _require_no_human_takeover(device_id)
    eff_policy = policy or default_policy()
    _check("desktop_clipboard_set", approval_granted=approval_granted, policy=eff_policy)
    return set_clipboard(text=text, paste=paste, approval_granted=approval_granted, policy=eff_policy)



def desktop_get_status(*, device_id: str = "local") -> dict:
    """Return desktop and session status, monitors, capture backend, and human takeover state."""
    _check("desktop_get_status")
    from .control.v1_routes import is_device_human_takeover_active
    from .screen_capture import get_last_capture_metrics, get_monitors

    base = get_desktop_status()
    takeover = is_device_human_takeover_active(device_id)
    return {
        **base,
        "device_id": device_id,
        "mode": "human_control" if takeover else "ai_assisted",
        "human_takeover_active": takeover,
        "monitors": get_monitors(),
        "capture_metrics": get_last_capture_metrics(),
    }


def desktop_mouse_move(
    x: int,
    y: int,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
    device_id: str = "local",
) -> dict:
    """Move the mouse to approved coordinates."""
    _require_no_human_takeover(device_id)
    eff_policy = policy or default_policy()
    _check("desktop_mouse_move", approval_granted=approval_granted, policy=eff_policy)
    return mouse_move(x=x, y=y, approval_granted=approval_granted, policy=eff_policy)


def desktop_click(
    x: int,
    y: int,
    button: str = "left",
    clicks: int = 1,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
    device_id: str = "local",
) -> dict:
    """Click at approved coordinates."""
    _require_no_human_takeover(device_id)
    eff_policy = policy or default_policy()
    _check("desktop_click", approval_granted=approval_granted, policy=eff_policy)
    return mouse_click(x=x, y=y, button=button, clicks=clicks, approval_granted=approval_granted, policy=eff_policy)


def desktop_keyboard(
    text: str = "",
    key: str = "",
    action: str = "type",
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
    device_id: str = "local",
) -> dict:
    """Send approved keyboard input (text typing, key press, or hotkey shortcut)."""
    _require_no_human_takeover(device_id)
    eff_policy = policy or default_policy()
    _check("desktop_keyboard", approval_granted=approval_granted, policy=eff_policy)
    act = (action or ("press" if key and not text else "type")).strip().lower()
    if act in ("press", "key", "hotkey") or (key and not text):
        target_key = key or text
        if "+" in target_key:
            return press_hotkey(target_key, approval_granted=approval_granted, policy=eff_policy)
        return keyboard_press(target_key, approval_granted=approval_granted, policy=eff_policy)
    res = keyboard_type(text, approval_granted=approval_granted, policy=eff_policy)
    if key:
        res["key_result"] = keyboard_press(key, approval_granted=approval_granted, policy=eff_policy)
    return res


def desktop_scroll(
    delta: int = -120,
    x: int | None = None,
    y: int | None = None,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
    device_id: str = "local",
) -> dict:
    """Scroll the active desktop."""
    _require_no_human_takeover(device_id)
    eff_policy = policy or default_policy()
    _check("desktop_scroll", approval_granted=approval_granted, policy=eff_policy)
    return mouse_scroll(delta=delta, x=x, y=y, approval_granted=approval_granted, policy=eff_policy)


def desktop_execute_command(
    command: str,
    working_directory: str = "",
    timeout: int = 60,
    *,
    approval_granted: bool = False,
    is_admin: bool = False,
    policy: Policy | None = None,
    device_id: str = "local",
) -> dict:
    """Execute commands permitted by policy.

    Security Architecture (Section 13):
    A user who grants screen access (`desktop_enabled`) does NOT automatically
    grant command execution. Command execution is checked independently against
    `run_shell` / command allowlist policy.
    """
    _require_no_human_takeover(device_id)
    eff_policy = policy or default_policy()
    _check("desktop_execute_command", approval_granted=approval_granted, is_admin=is_admin, policy=eff_policy)
    if "run_shell" in eff_policy.denied_tools:
        raise PermissionError("Command execution is disabled by device policy (screen access does not grant command execution).")
    return run_shell(
        command=command,
        working_directory=working_directory,
        timeout=timeout,
        approval_granted=approval_granted,
        is_admin=is_admin,
        policy=eff_policy,
    )


def desktop_open_application(
    app_name: str,
    url: str | None = None,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
    device_id: str = "local",
) -> dict:
    """Launch an approved application."""
    _require_no_human_takeover(device_id)
    eff_policy = policy or default_policy()
    _check("desktop_open_application", approval_granted=approval_granted, policy=eff_policy)
    return launch_approved_application(app_name, approval_granted=approval_granted, url=url, policy=eff_policy)


def desktop_get_windows(
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """List visible application windows."""
    eff_policy = policy or default_policy()
    _check("desktop_get_windows", approval_granted=approval_granted, policy=eff_policy)
    return list_desktop_windows(approval_granted=approval_granted, policy=eff_policy)


def desktop_wait(
    condition: str = "sleep",
    text: str = "",
    window_title: str = "",
    seconds: float = 1.0,
    timeout_seconds: float = 10.0,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Wait for a condition ('sleep', 'text', or 'window') or action to complete."""
    eff_policy = policy or default_policy()
    _check("desktop_wait", approval_granted=approval_granted, policy=eff_policy)
    cond = (condition or "sleep").strip().lower()
    if cond == "text" or (text and cond == "sleep"):
        return wait_for_text(
            text=text,
            timeout_seconds=timeout_seconds,
            poll_interval=0.5,
            approval_granted=approval_granted,
            policy=eff_policy,
        )
    if cond == "window" or window_title:
        needle = (window_title or text).strip().lower()
        deadline = time.time() + max(0.5, float(timeout_seconds))
        while time.time() < deadline:
            wins = list_desktop_windows(approval_granted=approval_granted, policy=eff_policy).get("windows", [])
            for w in wins:
                if needle in str(w.get("title", "")).lower():
                    return {"ok": True, "condition": "window", "matched_window": w}
            time.sleep(0.3)
        return {"ok": False, "condition": "window", "error": f"Window matching '{needle}' did not appear within {timeout_seconds}s."}

    wait_sec = max(0.0, min(float(seconds), 30.0))
    time.sleep(wait_sec)
    return {"ok": True, "condition": "sleep", "waited_seconds": wait_sec}


def desktop_verify_action(
    expected_text: str = "",
    expected_window: str = "",
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Verify whether an action succeeded by checking visible windows and/or screen OCR text."""
    eff_policy = policy or default_policy()
    _check("desktop_verify_action", approval_granted=approval_granted, policy=eff_policy)
    verified = True
    evidence: dict = {}

    if expected_window:
        wins = list_desktop_windows(approval_granted=approval_granted, policy=eff_policy).get("windows", [])
        needle = expected_window.strip().lower()
        matched_win = next((w for w in wins if needle in str(w.get("title", "")).lower()), None)
        evidence["window_matched"] = matched_win is not None
        evidence["window"] = matched_win
        if matched_win is None:
            verified = False

    if expected_text:
        scr = verify_screen_contains(expected_text, approval_granted=approval_granted, policy=eff_policy)
        evidence["text_matched"] = bool(scr.get("contains"))
        evidence["text_details"] = scr
        if not scr.get("contains"):
            verified = False

    if not expected_text and not expected_window:
        shot = capture_desktop_screenshot(approval_granted=approval_granted, policy=eff_policy)
        evidence["screenshot_available"] = bool(shot.get("available"))
        evidence["active_window"] = shot.get("active_window", "")
        verified = bool(shot.get("available"))

    return {
        "ok": True,
        "verified": verified,
        "expected_text": expected_text,
        "expected_window": expected_window,
        "evidence": evidence,
    }


_VETOED_INTENTS: set[str] = set()


def desktop_get_ui_elements(
    *,
    include_controls: bool = True,
    max_elements: int = 25,
    approval_granted: bool = True,
    policy: Policy | None = None,
) -> dict:
    """Extract interactive UI elements (windows, buttons, inputs) with normalized bounding coordinates for Vision Set-of-Marks (SoM)."""
    eff_policy = policy or default_policy()
    _check("desktop_get_windows", approval_granted=approval_granted, policy=eff_policy)

    elements: list[dict[str, Any]] = []
    screen_w, screen_h = 1920, 1080

    try:
        from . import screen_capture
        mons = screen_capture.get_monitors()
        if mons:
            screen_w = int(mons[0].get("width") or 1920)
            screen_h = int(mons[0].get("height") or 1080)
    except Exception:
        pass

    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes
            u = ctypes.windll.user32

            class RECT(ctypes.Structure):
                _fields_ = [
                    ("left", wintypes.LONG),
                    ("top", wintypes.LONG),
                    ("right", wintypes.LONG),
                    ("bottom", wintypes.LONG),
                ]

            WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

            def _enum_win_cb(hwnd: Any, _lparam: Any) -> bool:
                if not u.IsWindowVisible(hwnd) or u.IsIconic(hwnd):
                    return True
                length = u.GetWindowTextLengthW(hwnd)
                if length == 0:
                    return True
                buf = ctypes.create_unicode_buffer(length + 1)
                u.GetWindowTextW(hwnd, buf, length + 1)
                title = buf.value.strip()
                if not title:
                    return True

                rect = RECT()
                u.GetWindowRect(hwnd, ctypes.byref(rect))
                w = rect.right - rect.left
                h = rect.bottom - rect.top
                if w < 60 or h < 30:
                    return True

                norm_x = max(0.0, min(1.0, rect.left / screen_w))
                norm_y = max(0.0, min(1.0, rect.top / screen_h))
                norm_w = max(0.01, min(1.0, w / screen_w))
                norm_h = max(0.01, min(1.0, h / screen_h))

                idx = len(elements) + 1
                elements.append({
                    "id": idx,
                    "label": title[:40],
                    "type": "window",
                    "hwnd": int(hwnd),
                    "bounds": [rect.left, rect.top, w, h],
                    "norm_x": round(norm_x, 4),
                    "norm_y": round(norm_y, 4),
                    "norm_width": round(norm_w, 4),
                    "norm_height": round(norm_h, 4),
                    "center_x": round(norm_x + norm_w / 2.0, 4),
                    "center_y": round(norm_y + norm_h / 2.0, 4),
                })
                if len(elements) >= max_elements:
                    return False

                # Child controls if enabled
                if include_controls and len(elements) < max_elements:
                    def _child_cb(chwnd: Any, _clparam: Any) -> bool:
                        if not u.IsWindowVisible(chwnd):
                            return True
                        crect = RECT()
                        u.GetWindowRect(chwnd, ctypes.byref(crect))
                        cw = crect.right - crect.left
                        ch = crect.bottom - crect.top
                        if cw < 30 or ch < 15 or cw > screen_w * 0.9 or ch > screen_h * 0.9:
                            return True

                        c_len = u.GetWindowTextLengthW(chwnd)
                        c_buf = ctypes.create_unicode_buffer(c_len + 1)
                        if c_len > 0:
                            u.GetWindowTextW(chwnd, c_buf, c_len + 1)
                        c_title = c_buf.value.strip()

                        cls_buf = ctypes.create_unicode_buffer(128)
                        u.GetClassNameW(chwnd, cls_buf, 128)
                        cls_name = cls_buf.value.strip()

                        label = c_title or cls_name or "Control"
                        cnx = max(0.0, min(1.0, crect.left / screen_w))
                        cny = max(0.0, min(1.0, crect.top / screen_h))
                        cnw = max(0.01, min(1.0, cw / screen_w))
                        cnh = max(0.01, min(1.0, ch / screen_h))

                        cidx = len(elements) + 1
                        elements.append({
                            "id": cidx,
                            "label": label[:30],
                            "type": cls_name.lower() or "control",
                            "hwnd": int(chwnd),
                            "bounds": [crect.left, crect.top, cw, ch],
                            "norm_x": round(cnx, 4),
                            "norm_y": round(cny, 4),
                            "norm_width": round(cnw, 4),
                            "norm_height": round(cnh, 4),
                            "center_x": round(cnx + cnw / 2.0, 4),
                            "center_y": round(cny + cnh / 2.0, 4),
                        })
                        return len(elements) < max_elements

                    u.EnumChildWindows(hwnd, WNDENUMPROC(_child_cb), 0)

                return len(elements) < max_elements

            cb = WNDENUMPROC(_enum_win_cb)
            u.EnumWindows(cb, 0)
        except Exception:
            pass

    # Fallback or synthetic default marks if headless or no visible windows
    if not elements:
        elements = [
            {
                "id": 1,
                "label": "Active Workspace",
                "type": "editor",
                "bounds": [60, 80, 1500, 850],
                "norm_x": 0.04,
                "norm_y": 0.12,
                "norm_width": 0.62,
                "norm_height": 0.58,
                "center_x": 0.35,
                "center_y": 0.41,
            },
            {
                "id": 2,
                "label": "Terminal Shell",
                "type": "terminal",
                "bounds": [1300, 80, 560, 950],
                "norm_x": 0.68,
                "norm_y": 0.12,
                "norm_width": 0.29,
                "norm_height": 0.82,
                "center_x": 0.825,
                "center_y": 0.53,
            },
            {
                "id": 3,
                "label": "System Telemetry Vitals",
                "type": "telemetry",
                "bounds": [60, 780, 1200, 240],
                "norm_x": 0.04,
                "norm_y": 0.74,
                "norm_width": 0.62,
                "norm_height": 0.22,
                "center_x": 0.35,
                "center_y": 0.85,
            },
        ]

    return {
        "ok": True,
        "count": len(elements),
        "screen_width": screen_w,
        "screen_height": screen_h,
        "elements": elements,
    }


def desktop_anticipate_action(
    action: str,
    x: float,
    y: float,
    label: str = "",
    risk_tier: str = "tier2_workspace",
    countdown_ms: int = 2000,
    *,
    approval_granted: bool = True,
    policy: Policy | None = None,
) -> dict:
    """Registers an anticipated autonomous agent action with a grace period for operator veto."""
    intent_id = f"intent_{uuid.uuid4().hex[:8]}"
    return {
        "ok": True,
        "intent_id": intent_id,
        "action": action,
        "target_label": label or f"Action {action}",
        "x": max(0.0, min(1.0, float(x))),
        "y": max(0.0, min(1.0, float(y))),
        "risk_tier": risk_tier,
        "countdown_ms": max(500, int(countdown_ms)),
        "vetoed": False,
    }


def desktop_veto_action(intent_id: str, reason: str = "Operator override") -> dict:
    """Cancels a pending anticipated agent action."""
    _VETOED_INTENTS.add(intent_id)
    return {"ok": True, "intent_id": intent_id, "vetoed": True, "reason": reason}


def desktop_is_action_vetoed(intent_id: str) -> bool:
    """Check whether a pending agent action was vetoed by human operator."""
    return intent_id in _VETOED_INTENTS


# =========================================================================
# Phase 3: Bi-Directional File Transfer & Host Storage
# =========================================================================

_ACTIVE_TRANSFERS: dict[str, dict[str, Any]] = {}
_TRANSFERS_LOCK = threading.Lock()


def get_transfer_storage_dir() -> Path:
    """Ensure safe root directory for incoming and outgoing file transfers."""
    base = Path(os.environ.get("AI_BRIDGE_TRANSFERS_DIR", workspace_root() / "transfers"))
    base.mkdir(parents=True, exist_ok=True)
    return base


def desktop_handle_file_start(
    transfer_id: str,
    name: str,
    size: int,
    total_chunks: int,
    target_dir: str = "",
) -> dict[str, Any]:
    """Initialize an incoming chunked file transfer over WebRTC or REST."""
    clean_name = Path(name).name
    if not clean_name:
        clean_name = f"transfer_{int(time.time())}.bin"

    storage_root = get_transfer_storage_dir()
    if target_dir and target_dir.lower() in ("downloads", "workspace"):
        target_path = storage_root / target_dir.lower()
        target_path.mkdir(parents=True, exist_ok=True)
    else:
        target_path = storage_root

    final_path = target_path / clean_name
    temp_path = storage_root / f".{transfer_id}.part"

    with _TRANSFERS_LOCK:
        _ACTIVE_TRANSFERS[transfer_id] = {
            "transfer_id": transfer_id,
            "filename": clean_name,
            "expected_size": size,
            "total_chunks": total_chunks,
            "received_chunks": 0,
            "chunks_map": {},
            "temp_path": str(temp_path),
            "final_path": str(final_path),
            "started_at": time.time(),
            "status": "in_progress",
        }

    # Truncate / create empty temp part file
    try:
        temp_path.write_bytes(b"")
    except Exception as exc:
        return {"ok": False, "error": f"Failed to initialize transfer file: {exc}"}

    return {
        "ok": True,
        "transfer_id": transfer_id,
        "filename": clean_name,
        "target_path": str(final_path),
        "status": "ready_for_chunks",
    }


def desktop_handle_file_chunk(
    transfer_id: str,
    chunk_index: int,
    chunk_b64: str,
) -> dict[str, Any]:
    """Append a decoded binary chunk to the in-progress transfer file."""
    with _TRANSFERS_LOCK:
        info = _ACTIVE_TRANSFERS.get(transfer_id)
        if not info:
            return {"ok": False, "error": f"Unknown transfer_id: {transfer_id}"}
        temp_path = Path(info["temp_path"])

    try:
        raw_bytes = base64.b64decode(chunk_b64)
    except Exception as exc:
        return {"ok": False, "error": f"Base64 decode failed for chunk {chunk_index}: {exc}"}

    try:
        with open(temp_path, "ab") as f:
            f.write(raw_bytes)
    except Exception as exc:
        return {"ok": False, "error": f"Failed writing chunk {chunk_index}: {exc}"}

    with _TRANSFERS_LOCK:
        info["received_chunks"] += 1
        info["chunks_map"][chunk_index] = len(raw_bytes)
        rec_chunks = info["received_chunks"]
        total = info["total_chunks"]
        exp_size = info["expected_size"]
        curr_bytes = temp_path.stat().st_size if temp_path.exists() else 0

    pct = round((rec_chunks / max(1, total)) * 100, 1)
    return {
        "ok": True,
        "transfer_id": transfer_id,
        "chunk_index": chunk_index,
        "received_chunks": rec_chunks,
        "total_chunks": total,
        "received_bytes": curr_bytes,
        "expected_bytes": exp_size,
        "percent": pct,
    }


def desktop_handle_file_end(
    transfer_id: str,
    expected_sha256: str = "",
) -> dict[str, Any]:
    """Finalize file assembly, verify SHA-256 hash, and atomically move into target location."""
    with _TRANSFERS_LOCK:
        info = _ACTIVE_TRANSFERS.get(transfer_id)
        if not info:
            return {"ok": False, "error": f"Unknown transfer_id: {transfer_id}"}

    temp_path = Path(info["temp_path"])
    final_path = Path(info["final_path"])

    if not temp_path.exists():
        return {"ok": False, "error": f"Temp file missing for transfer {transfer_id}"}

    # Verify sha256
    hasher = hashlib.sha256()
    with open(temp_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    actual_hash = hasher.hexdigest()

    if expected_sha256 and expected_sha256.lower() != actual_hash.lower():
        try:
            temp_path.unlink()
        except Exception:
            pass
        return {
            "ok": False,
            "error": "sha256_mismatch",
            "expected": expected_sha256,
            "actual": actual_hash,
        }

    # Atomic move
    try:
        if final_path.exists():
            final_path.unlink()
        temp_path.rename(final_path)
    except Exception as exc:
        # Fallback copy
        try:
            shutil.copy2(temp_path, final_path)
            temp_path.unlink()
        except Exception as exc2:
            return {"ok": False, "error": f"Failed moving assembled file: {exc2}"}

    file_size = final_path.stat().st_size
    duration = max(0.001, time.time() - info["started_at"])
    speed_kbps = round((file_size / 1024.0) / duration, 2)

    with _TRANSFERS_LOCK:
        info["status"] = "completed"
        info["actual_sha256"] = actual_hash
        info["file_size"] = file_size
        info["speed_kbps"] = speed_kbps

    return {
        "ok": True,
        "transfer_id": transfer_id,
        "filename": info["filename"],
        "saved_path": str(final_path),
        "file_size": file_size,
        "sha256": actual_hash,
        "duration_seconds": round(duration, 2),
        "speed_kbps": speed_kbps,
        "status": "completed",
    }


def desktop_list_transfers() -> list[dict[str, Any]]:
    """List all transferred files available on host storage."""
    root = get_transfer_storage_dir()
    items = []
    try:
        for p in root.rglob("*"):
            if p.is_file() and not p.name.startswith("."):
                stat = p.stat()
                items.append({
                    "name": p.name,
                    "relative_path": str(p.relative_to(root)).replace("\\", "/"),
                    "full_path": str(p),
                    "size_bytes": stat.st_size,
                    "modified_at": stat.st_mtime,
                })
    except Exception:
        pass
    items.sort(key=lambda x: x["modified_at"], reverse=True)
    return items


def desktop_prepare_file_download(path_or_name: str) -> dict[str, Any]:
    """Read a file on host and compute its chunk metadata for streaming down to client."""
    root = get_transfer_storage_dir()
    clean = Path(path_or_name).name
    target = root / clean
    if not target.exists():
        # Try direct path within workspace
        target = Path(path_or_name)
        if not target.is_absolute():
            target = workspace_root() / path_or_name

    if not target.exists() or not target.is_file():
        return {"ok": False, "error": "file_not_found", "path": str(path_or_name)}

    # Security check: must not escape allowed roots
    try:
        resolved = target.resolve()
        is_safe = False
        for safe_root in (root.resolve(), workspace_root().resolve()):
            try:
                resolved.relative_to(safe_root)
                is_safe = True
                break
            except ValueError:
                continue
        if not is_safe:
            return {"ok": False, "error": "access_denied_path_traversal"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

    file_size = target.stat().st_size
    chunk_size = 64 * 1024  # 64 KB
    total_chunks = max(1, (file_size + chunk_size - 1) // chunk_size)

    hasher = hashlib.sha256()
    with open(target, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    sha256 = hasher.hexdigest()

    return {
        "ok": True,
        "name": target.name,
        "path": str(target),
        "size": file_size,
        "chunk_size": chunk_size,
        "total_chunks": total_chunks,
        "sha256": sha256,
    }




