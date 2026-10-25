import pytest

from ai_bridge import diagnostics
from ai_bridge.security import confined_path, read_workspace_text, redact


def test_redaction():
    assert "abc123" not in redact("api_key=abc123 and password=hunter2")
    assert "***REDACTED***" in redact("token=abc123")

def test_absolute_and_traversal_and_nul(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_BRIDGE_WORKSPACE", str(tmp_path))
    for bad in ["/etc/passwd", "../secret", "a/../../secret", "x\x00y", "C:\\Windows\\secret"]:
        with pytest.raises(ValueError):
            confined_path(bad)

def test_service_name_injection_rejected():
    for bad in ["nginx; rm -rf /", "a|cat /etc/passwd", "a b", "x$(id)"]:
        with pytest.raises(ValueError):
            diagnostics.service_status(bad)

def test_symlink_file_escape(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_BRIDGE_WORKSPACE", str(tmp_path))
    outside = tmp_path.parent / "outside-secret.txt"
    outside.write_text("topsecret")
    (tmp_path / "link.txt").symlink_to(outside)
    with pytest.raises(ValueError):
        read_workspace_text("link.txt")
