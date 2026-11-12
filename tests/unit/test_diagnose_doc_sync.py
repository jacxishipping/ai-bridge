"""Keep the `--diagnose` field reference in docs/installation-windows.md honest.

The tables in that document are what support reads while looking at a pasted
report, so a stale line is worse than a stale comment: it sends someone hunting
for a key the report no longer prints. These tests parse the documented fields
straight out of the markdown and compare them with a report built by
``diagnose.build_report`` -- no network, no Windows, no Tkinter.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "agents" / "windows"))

import diagnose  # noqa: E402

DOC_PATH = REPO_ROOT / "docs" / "installation-windows.md"
FIELD_REFERENCE_START = "### Report fields"
FIELD_REFERENCE_END = "### Reading the common failures"

# Backticked tokens in the field reference that are referenced *values* rather
# than field names: JSON/boolean literals, the two `token.backend` names, the
# error prefix the document quotes, and the plane's own `status` (echoed by
# `connectivity.health_status`).
NON_FIELD_TOKENS = {"true", "false", "null", "dpapi", "file", "URLError", "status"}

# Every documented field is lower_snake_case; uppercase spans such as `HOME` are
# environment variables the prose mentions.
IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")
FILENAME = re.compile(r"^[\w.\\/-]+\.(json|token|log|txt)$")
SECTION_HEADING = re.compile(r"^`([a-z_]+)`\s+—")
# `config` lists its nested settings keys in one parenthetical after `settings`.
SETTINGS_PAREN = re.compile(r"`settings`[^(]*\(([^)]*)\)")
BACKTICKED = re.compile(r"`([^`]+)`")
TABLE_ROW = re.compile(r"^\|\s*`([A-Za-z_][A-Za-z0-9_]*)`\s*\|")

SECTIONS = {"platform", "capabilities", "paths", "token", "config", "connectivity"}


def field_reference() -> str:
    text = DOC_PATH.read_text(encoding="utf-8")
    try:
        start = text.index(FIELD_REFERENCE_START)
        end = text.index(FIELD_REFERENCE_END)
    except ValueError as exc:  # pragma: no cover - only if the doc is restructured
        raise AssertionError(
            f"{DOC_PATH} must keep the '### Report fields' section, bounded by "
            f"'### Reading the common failures', or this guard cannot run: {exc}"
        ) from exc
    return text[start:end]


def parse_documented_fields(text: str) -> dict[str, Any]:
    """Pull the documented field names out of the markdown, section by section."""
    documented: dict[str, Any] = {
        "top_level": set(),
        "sections": {},
        "settings_keys": set(),
        "check_names": [],
    }

    for block in text.split("\n\n"):
        block = block.strip()
        if not block:
            continue

        for line in block.splitlines():
            row = TABLE_ROW.match(line)
            if row:
                documented["top_level"].add(row.group(1))

        heading = SECTION_HEADING.match(block)
        if not heading:
            continue
        section = heading.group(1)
        body = block[heading.end() :]

        # `config` documents its nested settings keys in one parenthetical.
        settings_paren = SETTINGS_PAREN.search(body)
        if settings_paren:
            documented["settings_keys"].update(BACKTICKED.findall(settings_paren.group(1)))
            body = body[: settings_paren.start(1)] + body[settings_paren.end(1) :]

        names = []
        for token in BACKTICKED.findall(body):
            if not IDENTIFIER.match(token):
                continue
            if token in NON_FIELD_TOKENS or FILENAME.match(token):
                continue
            names.append(token)

        if section == "checks":
            # The paragraph also refers back to top-level fields ("the top-level
            # `ok`"); what remains are the four `name` values of the check rows.
            documented["check_names"].extend(
                name for name in names if name not in documented["top_level"]
            )
        else:
            documented["sections"].setdefault(section, set()).update(names)

    return documented


def sample_report(tmp_path: Path) -> dict[str, Any]:
    """A report with every optional piece populated, and no network access."""
    config = dict.fromkeys(diagnose.SAFE_CONFIG_KEYS, "x")
    config["control_url"] = ""
    return diagnose.build_report(
        lambda: config,
        config_file=tmp_path / "agent_gui.json",
        token_file=tmp_path / "device.token",
        gui_available=False,
    )


def leaf_paths(value: Any, prefix: str = "") -> list[str]:
    if isinstance(value, dict):
        paths: list[str] = []
        for key, item in value.items():
            paths.extend(leaf_paths(item, f"{prefix}{key}."))
        return paths
    return [prefix.rstrip(".")]


def test_the_parser_finds_the_documented_fields():
    """If the markdown is restructured, fail loudly instead of passing vacuously."""
    documented = parse_documented_fields(field_reference())

    assert {"app", "generated_at", "ok", "errors"} <= documented["top_level"]
    assert set(documented["sections"]) == SECTIONS
    assert documented["settings_keys"]
    assert len(documented["check_names"]) == 4


def test_every_documented_field_is_still_emitted(tmp_path):
    documented = parse_documented_fields(field_reference())
    report = sample_report(tmp_path)

    stale = sorted(documented["top_level"] - set(report))
    assert not stale, (
        f"docs/installation-windows.md documents top-level field(s) {stale} that "
        "diagnose.py no longer emits; update the field reference or restore them."
    )

    for section, names in documented["sections"].items():
        assert section in report, f"documented section `{section}` is missing from the report"
        stale = sorted(names - set(report[section]))
        assert not stale, (
            f"docs/installation-windows.md documents `{section}` field(s) {stale} that "
            "diagnose.py no longer emits; update the field reference or restore them."
        )

    stale = sorted(documented["settings_keys"] - set(report["config"]["settings"]))
    assert not stale, (
        f"docs/installation-windows.md documents config.settings key(s) {stale} that "
        f"diagnose.py does not collect; SAFE_CONFIG_KEYS is {list(diagnose.SAFE_CONFIG_KEYS)}."
    )

    emitted_checks = [check["name"] for check in report["checks"]]
    assert documented["check_names"] == emitted_checks, (
        "docs/installation-windows.md lists checks "
        f"{documented['check_names']} but the report emits {emitted_checks}."
    )


def test_the_report_emits_no_undocumented_fields(tmp_path):
    """The other direction: a new field must be documented before it ships."""
    documented = parse_documented_fields(field_reference())
    # `checks` is a list of rows, so it is a leaf itself rather than a section of
    # named fields; the row names were compared in the other test.
    documented_paths = set(documented["top_level"]) | {"checks"}
    for section, names in documented["sections"].items():
        documented_paths.update(f"{section}.{name}" for name in names)
    documented_paths.update(f"config.settings.{key}" for key in documented["settings_keys"])

    # `config.settings` is an open bag of every SAFE_CONFIG_KEYS value; the doc
    # deliberately lists only "the settings that matter for support", so new
    # settings keys are not drift. Their *names*, when mentioned, are checked by
    # the forward test against SAFE_CONFIG_KEYS.
    emitted = {
        path for path in leaf_paths(sample_report(tmp_path))
        if not path.startswith("config.settings.")
    }
    undocumented = sorted(emitted - documented_paths)
    assert not undocumented, (
        f"diagnose.py emits field(s) {undocumented} that docs/installation-windows.md "
        "does not document; add them to the field reference."
    )
