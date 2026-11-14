"""Git operations confined to the workspace, argument arrays only."""
from __future__ import annotations

import subprocess

from .security import confined_path, truncate_output


def _git(relative_directory: str, *args: str) -> str:
    directory = confined_path(relative_directory)
    if not directory.is_dir():
        raise ValueError("Directory does not exist inside the workspace.")
    try:
        c = subprocess.run(["git", "-C", str(directory), *args], shell=False,
                           capture_output=True, text=True, timeout=30)
    except FileNotFoundError:
        return "unavailable: git is not installed"
    except subprocess.TimeoutExpired:
        return "unavailable: timed out"
    return truncate_output((c.stdout + c.stderr).strip())

def git_status(relative_directory: str = ".") -> str:
    return _git(relative_directory, "status", "--short", "--branch")

def git_diff(relative_directory: str = ".") -> str:
    return _git(relative_directory, "diff", "--stat")


def git_create_branch(relative_directory: str, branch_name: str) -> str:
    branch_name = (branch_name or "").strip()
    if not branch_name or any(c in branch_name for c in " \t\n\r~^:"):
        raise ValueError("Invalid branch name.")
    return _git(relative_directory, "checkout", "-b", branch_name)


def git_commit(relative_directory: str, message: str) -> str:
    message = (message or "").strip()
    if not message:
        raise ValueError("Commit message is required.")
    staged = _git(relative_directory, "diff", "--cached", "--quiet")
    if staged.startswith("unavailable"):
        return staged
    return _git(relative_directory, "commit", "-m", message[:500])


def git_checkpoint(relative_directory: str = ".", message: str = "ai-bridge checkpoint") -> dict:
    """Stage all workspace changes and create a checkpoint commit (when git is available)."""
    add_out = _git(relative_directory, "add", "-A")
    if add_out.startswith("unavailable"):
        return {"ok": False, "error": add_out}
    commit_out = git_commit(relative_directory, message)
    return {"ok": not commit_out.startswith("unavailable"), "commit": commit_out, "status": git_status(relative_directory)}
