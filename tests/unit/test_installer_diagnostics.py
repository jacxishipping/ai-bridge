"""Guarantees that the Windows installers self-diagnose on failure.

These are static checks: PowerShell is not available on every CI host, so the
contract (helper defined, non-throwing, invoked from the failure paths) is
asserted against the script text instead of by executing it.
"""
from __future__ import annotations

from pathlib import Path

import pytest

SCRIPTS = (
    Path("deployment/windows/install-agent.ps1"),
    Path("magic-install.ps1"),
)

# Install-AIBridge.ps1 is a compatibility shim: it installs nothing and delegates
# -Diagnose to install-agent.ps1, so it is asserted separately below instead of
# being required to carry a second copy of the report helper.
SHIM = Path("deployment/windows/Install-AIBridge.ps1")


def _text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


@pytest.mark.parametrize("script", SCRIPTS, ids=lambda path: path.name)
def test_helper_is_defined_and_runs_the_diagnose_report(script: Path):
    text = _text(script)

    assert "function Invoke-AiBridgeDiagnose" in text
    assert "& $python $GuiScript --diagnose" in text
    # stderr must be captured too, or a traceback would be lost
    assert "2>&1 | Out-String" in text


@pytest.mark.parametrize("script", SCRIPTS, ids=lambda path: path.name)
def test_helper_cannot_mask_the_installer_exit_code(script: Path):
    text = _text(script)
    helper = text[text.index("function Invoke-AiBridgeDiagnose") :]

    assert "catch {" in helper
    assert "$ErrorActionPreference = $previousPreference" in helper
    # A diagnostic must never abort the installer a second time.
    assert "throw" not in helper.split("trap {")[0]


@pytest.mark.parametrize("script", SCRIPTS, ids=lambda path: path.name)
def test_trap_calls_the_helper_and_is_registered_after_it(script: Path):
    text = _text(script)
    helper_at = text.index("function Invoke-AiBridgeDiagnose")
    trap_at = text.index("trap {")

    assert helper_at < trap_at, "the trap body needs the helper defined already"
    trap_block = text[trap_at : trap_at + 400]
    assert "Invoke-AiBridgeDiagnose" in trap_block


def test_install_aibridge_shim_delegates_the_report():
    text = _text(SHIM)

    branch_at = text.index("if ($Diagnose)")
    branch = text[branch_at : branch_at + 500]
    assert "install-agent.ps1" in branch, "the report lives with the agent installer"
    assert "-Diagnose" in branch
    assert "exit $LASTEXITCODE" in branch, "the report's own exit code must survive"


def test_install_aibridge_shim_installs_nothing_itself():
    text = _text(SHIM)

    # One implementation only: the shim must not carry its own provisioning.
    assert "-m venv" not in text
    assert "pip install" not in text
    assert "schtasks" not in text
    assert "Register-ScheduledTask" not in text
    assert "installer_gui.py" in text, "it must forward to the canonical installer"


def test_install_aibridge_shim_explains_every_hard_exit():
    text = _text(SHIM)

    position = text.find("exit 1")
    assert position != -1, "the shim should still fail with a non-zero code"
    while position != -1:
        window = text[max(0, position - 600) : position]
        assert "[FAIL]" in window, "every hard exit must be preceded by an explained failure"
        position = text.find("exit 1", position + 1)


def test_install_agent_diagnoses_when_the_account_is_missing():
    text = _text(Path("deployment/windows/install-agent.ps1"))
    index = text.index("does not exist. Create it first")

    assert "Invoke-AiBridgeDiagnose" in text[index : index + 400]


def test_magic_install_diagnoses_failed_enrollment():
    text = _text(Path("magic-install.ps1"))
    index = text.index("Enrollment call failed")

    assert "Invoke-AiBridgeDiagnose" in text[index - 200 : index + 600]


def test_magic_install_searches_the_script_root_for_the_gui():
    """magic-install.ps1 lives at the repo root, not under deployment/windows."""
    helper = _text(Path("magic-install.ps1")).split("function Invoke-AiBridgeDiagnose", 1)[1]

    assert '"..\\..", "."' in helper


@pytest.mark.parametrize("script", SCRIPTS, ids=lambda path: path.name)
def test_diagnose_switch_prints_the_report_and_exits_clean(script: Path):
    text = _text(script)

    assert "[switch]$Diagnose" in text
    helper_at = text.index("function Invoke-AiBridgeDiagnose")
    branch_at = text.index("if ($Diagnose)")
    assert helper_at < branch_at, "the switch needs the helper defined first"

    branch = text[branch_at : branch_at + 420]
    assert "Invoke-AiBridgeDiagnose" in branch
    assert "exit 0" in branch, "an on-demand report is not a failure"


def test_diagnose_switch_runs_before_any_side_effect():
    """Each switch must short-circuit ahead of the step that would touch the machine."""
    shim = _text(SHIM)
    # -Diagnose must be handled before the shim resolves a Python or forwards.
    assert shim.index("if ($Diagnose)") < shim.index("$selection = Resolve-WizardPython")

    magic = _text(Path("magic-install.ps1"))
    assert magic.index("if ($Diagnose)") < magic.index("Requesting Administrator elevation")

    install_agent = _text(Path("deployment/windows/install-agent.ps1"))
    assert install_agent.index("if ($Diagnose)") < install_agent.index("Get-LocalUser")


def test_install_agent_can_run_diagnose_without_mandatory_parameters():
    text = _text(Path("deployment/windows/install-agent.ps1"))

    # Mandatory params would make `-Diagnose` alone block on a prompt.
    assert "[Parameter(Mandatory=$true)]" not in text
    assert "-not $ControlUrl -or -not $DeviceToken" in text
