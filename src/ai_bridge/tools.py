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
