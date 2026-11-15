"""Git operations confined to the workspace, argument arrays only."""
from __future__ import annotations

import subprocess
import tempfile

from pathlib import Path

from .security import confined_path, truncate_output, workspace_root


def _git_run(relative_directory: str, *args: str) -> tuple[int, str]:
    directory = confined_path(relative_directory)
    if not directory.is_dir():
        raise ValueError("Directory does not exist inside the workspace.")
    try:
        c = subprocess.run(["git", "-C", str(directory), *args], shell=False,
                           capture_output=True, text=True, timeout=30)
    except FileNotFoundError:
        return 127, "unavailable: git is not installed"
    except subprocess.TimeoutExpired:
        return 124, "unavailable: timed out"
    return c.returncode, truncate_output((c.stdout + c.stderr).strip())


def _git(relative_directory: str, *args: str) -> str:
    _, out = _git_run(relative_directory, *args)
    return out


def git_status(relative_directory: str = ".") -> str:
    return _git(relative_directory, "status", "--short", "--branch")


def git_diff(relative_directory: str = ".") -> str:
    return _git(relative_directory, "diff", "--stat")


def git_log(relative_directory: str = ".", limit: int = 20) -> str:
    n = max(1, min(int(limit or 20), 200))
    return _git(relative_directory, "log", f"-n{n}", "--oneline", "--decorate")


def git_create_branch(relative_directory: str, branch_name: str) -> str:
    branch_name = (branch_name or "").strip()
    if not branch_name or any(c in branch_name for c in " \t\n\r~^:"):
        raise ValueError("Invalid branch name.")
    rc, out = _git_run(relative_directory, "checkout", "-b", branch_name)
    if rc != 0 and not out.startswith("unavailable"):
        return f"error: {out}" if out else f"error: git checkout failed ({rc})"
    return out


def git_commit(relative_directory: str, message: str) -> str:
    message = (message or "").strip()
    if not message:
        raise ValueError("Commit message is required.")
    rc, staged = _git_run(relative_directory, "diff", "--cached", "--quiet")
    if staged.startswith("unavailable"):
        return staged
    if rc == 0:
        return "nothing to commit: no staged changes"
    if rc > 1:
        return f"error: {staged}" if staged else f"error: git diff failed ({rc})"
    commit_rc, commit_out = _git_run(relative_directory, "commit", "-m", message[:500])
    if commit_rc != 0 and not commit_out.startswith("unavailable"):
        return f"error: {commit_out}" if commit_out else f"error: git commit failed ({commit_rc})"
    return commit_out


def git_apply_patch(relative_directory: str, patch_text: str, *, check_only: bool = False) -> dict:
    """Apply a unified diff inside the workspace via git apply (no shell interpolation)."""
    patch_text = (patch_text or "").strip()
    if not patch_text:
        raise ValueError("patch_text is required.")
    directory = confined_path(relative_directory)
    if not directory.is_dir():
        raise ValueError("Directory does not exist inside the workspace.")
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        suffix=".patch",
        delete=False,
        dir=str(workspace_root()),
    ) as tmp:
        tmp.write(patch_text)
        patch_path = tmp.name
    try:
        args = ["apply", "--whitespace=nowarn", patch_path]
        if check_only:
            args.insert(1, "--check")
        rc, out = _git_run(relative_directory, *args)
    finally:
        try:
            Path(patch_path).unlink(missing_ok=True)
        except Exception:
            pass
    ok = rc == 0 and not out.startswith("unavailable")
    return {"ok": ok, "returncode": rc, "check_only": check_only, "output": out}


def git_checkpoint(relative_directory: str = ".", message: str = "ai-bridge checkpoint") -> dict:
    """Stage all workspace changes and create a checkpoint commit (when git is available)."""
    add_rc, add_out = _git_run(relative_directory, "add", "-A")
    if add_rc != 0 or add_out.startswith("unavailable"):
        return {"ok": False, "error": add_out or f"git add failed ({add_rc})"}
    commit_out = git_commit(relative_directory, message)
    ok = not commit_out.startswith(("unavailable", "error:"))
    return {"ok": ok, "commit": commit_out, "status": git_status(relative_directory)}
