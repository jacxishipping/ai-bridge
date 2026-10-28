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


def test_linux_server_policy_unrestricted():
    from agents.linux.agent_main import get_linux_server_policy
    from ai_bridge.policy import decide

    pol = get_linux_server_policy()
    assert pol.unrestricted is True
    assert pol.max_tier_unattended == 4
    assert pol.allow_tier3 is True
    assert pol.allow_writes is True
    assert pol.desktop_enabled is True

    # Test that Tier 4 and Tier 3 tools are allowed without approval
    dec_del = decide(pol, "delete_workspace_file")
    assert dec_del.allowed is True
    assert dec_del.needs_approval is False

    dec_shell = decide(pol, "run_shell")
    assert dec_shell.allowed is True
    assert dec_shell.needs_approval is False

    dec_shot = decide(pol, "capture_desktop_screenshot")
    assert dec_shot.allowed is True
    assert dec_shot.needs_approval is False


def test_gather_linux_telemetry():
    from agents.linux.agent_main import gather_linux_telemetry

    telem = gather_linux_telemetry()
    assert isinstance(telem, dict)
    assert "hostname" in telem
    assert "cpu_count" in telem
    assert "memory_percent" in telem
    assert "disk_percent" in telem
    assert "uptime_hours" in telem


def test_linux_agent_config_persistence(tmp_path: Path, monkeypatch):
    from agents.linux import agent_main

    monkeypatch.setattr(agent_main, "DEFAULT_CONFIG_DIR", tmp_path)
    cfg = {
        "control_url": "https://test.control.plane",
        "device_token": "linux-test-token-777",
        "device_name": "linux-prod-node-1",
        "workspace": str(tmp_path / "workspace"),
        "unrestricted": True,
        "max_tier_unattended": 4,
    }
    saved_p = agent_main.save_agent_config(cfg)
    assert saved_p.exists()
    assert (tmp_path / "device.token").read_text(encoding="utf-8").strip() == "linux-test-token-777"
    assert (tmp_path / "agent.env").exists()

    loaded = agent_main.load_agent_config()
    assert loaded["control_url"] == "https://test.control.plane"
    assert loaded["device_token"] == "linux-test-token-777"
    assert loaded["device_name"] == "linux-prod-node-1"

