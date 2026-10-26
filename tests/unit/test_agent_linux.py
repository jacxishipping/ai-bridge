from pathlib import Path

from agents.linux.agent_main import _resolve_token_and_file


def test_resolve_token_explicit():
    token, path = _resolve_token_and_file("explicit-token-123", "")
    assert token == "explicit-token-123"
    assert path is not None


def test_resolve_token_from_file(tmp_path: Path):
    tok_file = tmp_path / "device.token"
    tok_file.write_text("token-from-file-xyz", encoding="utf-8")
    token, path = _resolve_token_and_file("", str(tok_file))
    assert token == "token-from-file-xyz"
    assert path == tok_file.resolve()


def test_resolve_token_from_agent_env(tmp_path: Path, monkeypatch):
    env_dir = tmp_path / ".ai-bridge"
    env_dir.mkdir()
    env_file = env_dir / "agent.env"
    env_file.write_text('AI_BRIDGE_DEVICE_TOKEN="secret-agent-env-token"\n', encoding="utf-8")

    # Mock Path.home to return tmp_path
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    token, path = _resolve_token_and_file("", "")
    assert token == "secret-agent-env-token"
    assert path == (env_dir / "device.token").resolve()
