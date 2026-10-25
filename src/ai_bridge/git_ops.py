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
