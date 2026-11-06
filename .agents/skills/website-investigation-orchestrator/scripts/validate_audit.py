#!/usr/bin/env python3
"""Validate audit.json structure and references using only the Python standard library."""
import json
import sys
from pathlib import Path

VALID_PAGE = {"discovered", "queued", "in_progress", "inspected", "blocked", "inaccessible", "skipped"}
VALID_TEST = {"pass", "fail", "blocked", "not_tested"}
VALID_EVIDENCE = {"VERIFIED", "OBSERVED", "INFERRED", "UNVERIFIED", "NOT_ACCESSIBLE"}
VALID_SEVERITY = {"critical", "high", "medium", "low", "informational"}
VALID_ISSUE_STATUS = {"accepted", "needs_confirmation", "rejected"}
VALID_GEMINI_ROUTE = {"mcp", "api", "configured_endpoint", "manual", "unavailable"}
VALID_GEMINI_STATUS = {"queued", "sent", "completed", "failed", "validated"}

def main():
    if len(sys.argv) != 2:
        print("Usage: validate_audit.py <audit-directory>")
        return 2

    root = Path(sys.argv[1]).expanduser().resolve()
    manifest_path = root / "audit.json"
    errors, warnings = [], []

    if not manifest_path.is_file():
        print(f"ERROR: Missing {manifest_path}")
        return 2

    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"ERROR: Invalid JSON: {exc}")
        return 2

    required = ["audit_id", "target_url", "created_at", "status", "pages", "tests", "evidence", "issues", "gemini_tasks", "limitations"]
    for key in required:
        if key not in data:
            errors.append(f"Missing required top-level field: {key}")

    pages = data.get("pages", [])
    tests = data.get("tests", [])
    evidence = data.get("evidence", [])
    issues = data.get("issues", [])
    tasks = data.get("gemini_tasks", [])

    def unique(items, key, label):
        vals = [x.get(key) for x in items if isinstance(x, dict)]
        if len(vals) != len(set(vals)):
            errors.append(f"Duplicate {label} values")
        if any(not v for v in vals):
            errors.append(f"Empty {label} value")

    unique(pages, "page_id", "page_id")
    unique(tests, "test_id", "test_id")
    unique(evidence, "evidence_id", "evidence_id")
    unique(issues, "issue_id", "issue_id")
    unique(tasks, "task_id", "task_id")

    evidence_ids = {x.get("evidence_id") for x in evidence if isinstance(x, dict)}
    page_ids = {x.get("page_id") for x in pages if isinstance(x, dict)}

    for p in pages:
        if p.get("status") not in VALID_PAGE:
            errors.append(f"Page {p.get('page_id')}: invalid status {p.get('status')}")

    for t in tests:
        if t.get("status") not in VALID_TEST:
            errors.append(f"Test {t.get('test_id')}: invalid status {t.get('status')}")
        for eid in t.get("evidence_ids", []):
            if eid not in evidence_ids:
                errors.append(f"Test {t.get('test_id')}: unknown evidence ID {eid}")

    for ev in evidence:
        artifact = ev.get("artifact")
        if artifact:
            path = (root / artifact).resolve()
            if root not in path.parents and path != root:
                errors.append(f"Evidence {ev.get('evidence_id')}: artifact path escapes audit directory")
            elif not path.exists():
                warnings.append(f"Evidence {ev.get('evidence_id')}: artifact not found: {artifact}")

    for issue in issues:
        if issue.get("severity") not in VALID_SEVERITY:
            errors.append(f"Issue {issue.get('issue_id')}: invalid severity")
        if issue.get("evidence_class") not in VALID_EVIDENCE:
            errors.append(f"Issue {issue.get('issue_id')}: invalid evidence_class")
        if issue.get("status") not in VALID_ISSUE_STATUS:
            errors.append(f"Issue {issue.get('issue_id')}: invalid status")
        for eid in issue.get("evidence_ids", []):
            if eid not in evidence_ids:
                errors.append(f"Issue {issue.get('issue_id')}: unknown evidence ID {eid}")
        if issue.get("evidence_class") in ("VERIFIED", "OBSERVED") and not issue.get("evidence_ids"):
            errors.append(f"Issue {issue.get('issue_id')}: {issue.get('evidence_class')} finding has no evidence IDs")

    for task in tasks:
        if task.get("route") not in VALID_GEMINI_ROUTE:
            errors.append(f"Gemini task {task.get('task_id')}: invalid route")
        if task.get("status") not in VALID_GEMINI_STATUS:
            errors.append(f"Gemini task {task.get('task_id')}: invalid status")

    if not pages:
        warnings.append("No pages recorded yet.")
    if not evidence:
        warnings.append("No evidence recorded yet.")
    if data.get("status") == "completed":
        if any(p.get("status") in ("queued", "in_progress") for p in pages):
            errors.append("Audit marked completed while pages remain queued/in_progress")

    for warning in warnings:
        print("WARNING:", warning)
    for error in errors:
        print("ERROR:", error)

    if errors:
        print(f"Validation FAILED: {len(errors)} error(s), {len(warnings)} warning(s)")
        return 1
    print(f"Validation PASSED: {len(warnings)} warning(s)")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
