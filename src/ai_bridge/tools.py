"""Shared tool implementations used by the MCP server, the agent, and
the control plane. Each function enforces policy before doing work.
No function here trusts its caller: device_revoked / approval flags are
inputs the *server* supplies, never values an AI tool argument can set
for itself (see policy.decide and server wrappers)."""
from __future__ import annotations

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
from .security import confined_path, workspace_root


def default_policy() -> Policy:
    s = get_settings()
    allowed_apps = frozenset(a.strip() for a in os.environ.get("AI_BRIDGE_ALLOWED_APPS", "").split(",") if a.strip())
    allowed_services = frozenset(a.strip() for a in os.environ.get("AI_BRIDGE_ALLOWED_SERVICES", "").split(",") if a.strip())
    return Policy(allow_writes=True, allow_tier3=s.allow_tier3,
                  allowed_services=allowed_services, allowed_apps=allowed_apps,
                  desktop_enabled=s.desktop_enabled)

def _check(tool: str, *, approval_granted: bool = False, is_admin: bool = False):
    d = decide(default_policy(), tool, approval_granted=approval_granted, is_admin=is_admin)
    if not d.allowed:
        raise PermissionError(d.reason)
    return d

def get_system_info() -> dict:
    _check("get_system_info")
    info = diagnostics.system_info(); info["workspace"] = str(workspace_root())
    return info

def get_resource_usage() -> dict:
    _check("get_resource_usage"); return diagnostics.resource_usage()

def create_backup(relative_directory: str = ".") -> dict:
    _check("create_backup")
    src = confined_path(relative_directory)
    if not src.is_dir():
        raise ValueError("Directory does not exist inside the workspace.")
    root = workspace_root()
    out_dir = root / ".ai-bridge-backups"; out_dir.mkdir(parents=True, exist_ok=True)
    name = f"backup-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}.zip"
    dest = out_dir / name
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(src.rglob("*")):
            if ".ai-bridge-backups" in p.parts or not p.is_file():
                continue
            try:
                zf.write(p, p.relative_to(src))
            except OSError:
                continue
    return {"backup": str(dest.relative_to(root)), "size_bytes": dest.stat().st_size}

def deploy_application(project_directory: str = ".", target_directory: str = "deploy-staging") -> dict:
    """Staging-only deploy inside the workspace: backup, then copy.
    Production deploys are Tier 4 and must go through the control-plane
    approval queue (docs/security.md); this tool never deploys to prod."""
    _check("deploy_application")
    backup = create_backup(project_directory)
    src = confined_path(project_directory); dst = confined_path(target_directory)
    if dst.resolve() == src.resolve():
        raise ValueError("Target must differ from the project directory.")
    dst.mkdir(parents=True, exist_ok=True)
    copied = 0
    for p in sorted(src.rglob("*")):
        if ".ai-bridge-backups" in p.parts or not p.is_file():
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

def capture_desktop_screenshot(*, approval_granted: bool = False) -> dict:
    _check("capture_desktop_screenshot", approval_granted=approval_granted)
    try:
        from PIL import ImageGrab  # type: ignore
    except Exception:
        return {"available": False, "note": "Screenshot requires Pillow (pip install Pillow) and an interactive session."}
    shot = ImageGrab.grab()
    out = get_settings().data_dir / f"screenshot-{int(time.time())}.png"
    out.parent.mkdir(parents=True, exist_ok=True); shot.save(out)
    return {"available": True, "path": str(out), "size": shot.size}

def launch_approved_application(app_name: str, *, approval_granted: bool = False, url: str | None = None) -> dict:
    _check("launch_approved_application", approval_granted=approval_granted)
    policy = default_policy()
    if app_name not in policy.allowed_apps:
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
        raise ValueError(f"Approved application not found: {app_name}")
    return {"launched": app_name, "url": url} if url is not None else {"launched": app_name}

# --- Software installation (Windows agent only, approval-gated) -----------
_PACKAGE_ID_RE = re.compile(r"^[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+$")
_VERSION_RE = re.compile(r"^[A-Za-z0-9._-]+$")

def install_package(package_id: str, version: str | None = None, *, approval_granted: bool = False) -> dict:
    """Install a package on a Windows agent via winget.

    Tier-3 (sensitive): the control plane holds the task in
    needs_approval until a human approves it, and dispatch() passes
    that approval through here. Policy is enforced by dispatch() and
    re-checked here so direct calls stay gated too.
    The package id is validated and passed as a fixed argv list
    (shell=False) — no shell text from arguments is ever executed.
    Winget ids are Publisher.App (e.g. Microsoft.VisualStudioCode).
    """
    _check("install_package", approval_granted=approval_granted)
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
