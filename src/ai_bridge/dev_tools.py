"""Repo-aware developer scaffolding helpers (Phase 5)."""
from __future__ import annotations

import re

from . import git_ops, workspace
from .tools import run_project_tests


def dev_workspace_plan(relative_directory: str = ".", *, max_depth: int = 3) -> dict:
    """Single call: directory tree + git status/diff for planning."""
    return {
        "ok": True,
        "structure": workspace.project_structure(relative_directory, max_depth=max_depth),
        "git_status": git_ops.git_status(relative_directory),
        "git_diff_stat": git_ops.git_diff(relative_directory),
    }


def _parse_pytest_summary(output: str) -> dict:
    text = output or ""
    summary: dict = {"passed": None, "failed": None, "skipped": None, "errors": None}
    for key, pattern in {
        "passed": r"(\d+)\s+passed",
        "failed": r"(\d+)\s+failed",
        "skipped": r"(\d+)\s+skipped",
        "errors": r"(\d+)\s+error",
    }.items():
        m = re.search(pattern, text, flags=re.IGNORECASE)
        if m:
            summary[key] = int(m.group(1))
    return summary


def run_project_tests_structured(
    test_command: str = "pytest -q",
    timeout: int = 120,
    *,
    policy=None,
) -> dict:
    """Run allowlisted tests and return pytest-style structured totals."""
    raw = run_project_tests(test_command, timeout, policy=policy)
    output = str(raw.get("output") or "")
    summary = _parse_pytest_summary(output)
    success = raw.get("status") == "completed" and not summary.get("failed") and not summary.get("errors")
    return {
        **raw,
        "ok": success,
        "summary": summary,
        "output_preview": output[-4000:],
    }