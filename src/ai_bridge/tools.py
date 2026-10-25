"""Shared tool implementations used by the MCP server, the agent, and
the control plane. Each function enforces policy before doing work.
No function here trusts its caller: device_revoked / approval flags are
inputs the *server* supplies, never values an AI tool argument can set
for itself (see policy.decide and server wrappers)."""
from __future__ import annotations

import os
import platform
import shutil
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

def capture_desktop_screenshot() -> dict:
    _check("capture_desktop_screenshot")
    try:
        from PIL import ImageGrab  # type: ignore
    except Exception:
        return {"available": False, "note": "Screenshot requires Pillow (pip install Pillow) and an interactive session."}
    shot = ImageGrab.grab()
    out = get_settings().data_dir / f"screenshot-{int(time.time())}.png"
    out.parent.mkdir(parents=True, exist_ok=True); shot.save(out)
    return {"available": True, "path": str(out), "size": shot.size}

def launch_approved_application(app_name: str) -> dict:
    _check("launch_approved_application")
    policy = default_policy()
    if app_name not in policy.allowed_apps:
        raise PermissionError(f"Application not in the approved list: {app_name}")
    import subprocess
    try:
        subprocess.Popen([app_name], shell=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except FileNotFoundError:
        raise ValueError(f"Approved application not found: {app_name}")
    return {"launched": app_name}
