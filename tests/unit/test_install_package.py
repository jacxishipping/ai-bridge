"""Tests for install_package (Windows agent, winget; Linux/WSL, apt/dnf) and the approval
path it depends on: a human approval must unlock a Tier-3 tool on the
agent, otherwise an approved task is re-denied after release."""
import pytest

from ai_bridge import tools
from ai_bridge.control.dispatch import dispatch
from ai_bridge.policy import Policy, decide


class FakeProc:
    def __init__(self, returncode=0, out="Installed ok"):
        self.returncode = returncode
        self.stdout = out
        self.stderr = ""


def test_install_package_is_tier3_and_approval_gated():
    assert not decide(Policy(), "install_package").allowed
    assert decide(Policy(), "install_package").needs_approval
    assert decide(Policy(), "install_package", approval_granted=True).allowed


def test_install_package_rejects_bad_ids(monkeypatch):
    monkeypatch.setattr(tools, "_check", lambda *a, **k: None)
    monkeypatch.setattr(tools.platform, "system", lambda: "Windows")
    for bad in ["", "calc", "a b", "x; rm -rf /", "a|b", "a&&b", "../evil", "a/b"]:
        with pytest.raises(ValueError):
            tools.install_package(bad, approval_granted=True)
    monkeypatch.setattr(tools.platform, "system", lambda: "Linux")
    for bad in ["", "-y", "a b", "x; rm -rf /", "a|b", "a&&b", "../evil", "a/b"]:
        with pytest.raises(ValueError):
            tools.install_package(bad, approval_granted=True)


def test_install_package_builds_fixed_winget_argv(monkeypatch):
    monkeypatch.setattr(tools, "_check", lambda *a, **k: None)
    monkeypatch.setattr(tools.platform, "system", lambda: "Windows")
    monkeypatch.setattr(tools.shutil, "which", lambda name: "C:\\winget.exe" if name == "winget" else None)
    seen = {}
    def fake_run(argv, **kwargs):
        seen["argv"] = argv
        assert kwargs.get("shell") is False
        return FakeProc()
    monkeypatch.setattr(tools.subprocess, "run", fake_run)
    out = tools.install_package("Microsoft.VisualStudioCode", approval_granted=True)
    assert out["installed"] == "Microsoft.VisualStudioCode"
    assert seen["argv"] == ["winget", "install", "--id", "Microsoft.VisualStudioCode", "-e",
                            "--accept-source-agreements", "--accept-package-agreements"]


def test_install_package_reports_winget_failure(monkeypatch):
    monkeypatch.setattr(tools, "_check", lambda *a, **k: None)
    monkeypatch.setattr(tools.platform, "system", lambda: "Windows")
    monkeypatch.setattr(tools.shutil, "which", lambda name: "winget")
    monkeypatch.setattr(tools.subprocess, "run", lambda *a, **k: FakeProc(returncode=1, out="No package found"))
    with pytest.raises(RuntimeError, match="failed"):
        tools.install_package("Nope.Nope", approval_granted=True)


def test_install_package_unavailable_off_windows(monkeypatch):
    monkeypatch.setattr(tools, "_check", lambda *a, **k: None)
    monkeypatch.setattr(tools.platform, "system", lambda: "Linux")
    monkeypatch.setattr(tools.shutil, "which", lambda name: None)
    out = tools.install_package("Microsoft.VisualStudioCode", approval_granted=True)
    assert out["available"] is False


def test_install_package_linux_apt_get(monkeypatch):
    monkeypatch.setattr(tools, "_check", lambda *a, **k: None)
    monkeypatch.setattr(tools.platform, "system", lambda: "Linux")
    monkeypatch.setattr(tools.shutil, "which", lambda name: "/usr/bin/apt-get" if name == "apt-get" else None)
    seen = {}
    def fake_run(argv, **kwargs):
        seen["argv"] = argv
        assert kwargs.get("shell") is False
        return FakeProc(out="Setting up curl ...")
    monkeypatch.setattr(tools.subprocess, "run", fake_run)
    out = tools.install_package("curl", approval_granted=True)
    assert out["installed"] == "curl"
    assert out["manager"] == "apt-get"
    assert "apt-get" in seen["argv"]
    assert "curl" in seen["argv"]


def test_run_shell_via_dispatch(monkeypatch):
    monkeypatch.setattr(tools, "_check", lambda *a, **k: None)
    out = dispatch("run_shell", {"command": "echo hello-from-agent"}, approval_granted=True)
    assert out["returncode"] == 0
    assert "hello-from-agent" in out["stdout"]


def test_dispatch_passes_approval_to_install(monkeypatch):
    seen = {}
    def stub(package_id, version=None, approval_granted=False):
        seen["approval_granted"] = approval_granted
        return {"installed": package_id}
    monkeypatch.setattr(tools, "install_package", stub)
    # Without approval the Tier-3 tool is denied before the handler runs.
    with pytest.raises(PermissionError):
        dispatch("install_package", {"package_id": "A.B"})
    out = dispatch("install_package", {"package_id": "A.B"}, approval_granted=True)
    assert out["installed"] == "A.B" and seen["approval_granted"] is True
