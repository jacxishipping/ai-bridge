import pytest

from ai_bridge import diagnostics, execution, tools
from ai_bridge.policy import Policy
from ai_bridge.security import confined_path, read_workspace_text, redact, redact_obj, truncate_output


def test_redaction():
    assert "abc123" not in redact("api_key=abc123 and password=hunter2")
    assert "***REDACTED***" in redact("token=abc123")


def test_redact_obj():
    nested = {
        "user": "alice",
        "api_key": "secret123",
        "nested": {"token": "secret456", "safe": "hello"},
        "items": ["safe_item", "password=secret789"],
    }
    cleaned = redact_obj(nested)
    assert cleaned["user"] == "alice"
    assert cleaned["api_key"] == "***REDACTED***"
    assert cleaned["nested"]["token"] == "***REDACTED***"
    assert cleaned["nested"]["safe"] == "hello"
    assert "secret789" not in str(cleaned["items"])


def test_truncate_output_utf8():
    text = "Hello " + "😀" * 10
    trunc = truncate_output(text, limit=10)
    assert isinstance(trunc, str)
    assert "[output truncated" in trunc
    # Should not raise UnicodeDecodeError
    trunc.encode("utf-8")


def test_absolute_and_traversal_and_nul(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_BRIDGE_WORKSPACE", str(tmp_path))
    for bad in ["/etc/passwd", "../secret", "a/../../secret", "x\x00y", "C:\\Windows\\secret"]:
        with pytest.raises(ValueError):
            confined_path(bad)


def test_service_name_injection_rejected():
    for bad in ["nginx; rm -rf /", "a|cat /etc/passwd", "a b", "x$(id)"]:
        with pytest.raises(ValueError):
            diagnostics.service_status(bad)


def test_allowed_services_enforcement():
    with pytest.raises(PermissionError):
        diagnostics.service_status("ssh", allowed_services=frozenset(["nginx", "docker"]))


def test_allowed_test_commands_enforcement():
    with pytest.raises(ValueError):
        execution._validate_test_command("pytest", allowed_commands=frozenset(["npm test"]))


def test_symlink_file_escape(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_BRIDGE_WORKSPACE", str(tmp_path))
    outside = tmp_path.parent / "outside-secret.txt"
    outside.write_text("topsecret")
    (tmp_path / "link.txt").symlink_to(outside)
    with pytest.raises(ValueError):
        read_workspace_text("link.txt")


def test_run_shell_scrubs_child_environment(monkeypatch):
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", "super-secret-admin")
    monkeypatch.setenv("AI_BRIDGE_DEVICE_TOKEN", "super-secret-device")
    policy = Policy(allow_writes=True, max_tier_unattended=4)
    # Echo environment variable in child shell
    res = tools.run_shell("python -c \"import os; print('ADMIN:', os.environ.get('AI_BRIDGE_ADMIN_TOKEN', 'UNSET'))\"", approval_granted=True, policy=policy)
    assert "ADMIN: UNSET" in res["stdout"]
