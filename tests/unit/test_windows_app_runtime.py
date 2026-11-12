"""Tests for the Windows desktop app's runtime support module.

No Tkinter and no Windows APIs are required: the DPAPI path is exercised with a
monkeypatched stand-in so the sealing/unquealing wiring is covered on any host.
"""
from __future__ import annotations

import logging
import stat
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "agents" / "windows"))

import app_runtime as runtime  # noqa: E402


def _fake_dpapi(data: bytes, *, protect: bool) -> bytes:
    """Symmetric stand-in for CryptProtectData / CryptUnprotectData."""
    if protect:
        return b"SEALED<" + data + b">"
    return data[len(b"SEALED<") : -1]


def test_save_and_load_roundtrip_plaintext_backend(tmp_path):
    token_file = tmp_path / "device.token"
    runtime.save_token("  tok-abcdef123456  ", token_file)

    assert token_file.read_text(encoding="utf-8") == "tok-abcdef123456"
    assert runtime.load_token(token_file) == "tok-abcdef123456"
    assert runtime.token_backend(token_file) == "file"


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX permission bits")
def test_token_file_is_owner_only(tmp_path):
    token_file = tmp_path / "device.token"
    runtime.save_token("tok-abcdef123456", token_file)

    mode = stat.S_IMODE(token_file.stat().st_mode)
    assert mode == 0o600


def test_atomic_write_leaves_no_temp_files(tmp_path):
    token_file = tmp_path / "device.token"
    runtime.save_token("tok-abcdef123456", token_file)

    assert [p.name for p in tmp_path.iterdir()] == ["device.token"]


def test_missing_token_file_returns_default(tmp_path):
    assert runtime.load_token(tmp_path / "absent.token", default="") == ""
    assert runtime.load_token(tmp_path / "absent.token", default="fallback") == "fallback"


def test_dpapi_sealing_roundtrip(monkeypatch, tmp_path):
    monkeypatch.setattr(runtime, "dpapi_available", lambda: True)
    monkeypatch.setattr(runtime, "_dpapi", _fake_dpapi)

    token_file = tmp_path / "device.token"
    runtime.save_token("tok-abcdef123456", token_file)

    stored = token_file.read_text(encoding="utf-8")
    assert stored.startswith(runtime.DPAPI_MAGIC)
    assert "tok-abcdef123456" not in stored
    assert runtime.token_backend(token_file) == "dpapi"
    assert runtime.load_token(token_file) == "tok-abcdef123456"


def test_sealed_token_without_dpapi_raises(tmp_path):
    token_file = tmp_path / "device.token"
    token_file.write_text(runtime.DPAPI_MAGIC + "AAAA", encoding="utf-8")

    if runtime.dpapi_available():
        pytest.skip("DPAPI is available on this host")
    with pytest.raises(runtime.TokenStoreError):
        runtime.load_token(token_file)


def test_legacy_plaintext_token_is_migrated(monkeypatch, tmp_path):
    monkeypatch.setattr(runtime, "dpapi_available", lambda: True)
    monkeypatch.setattr(runtime, "_dpapi", _fake_dpapi)

    token_file = tmp_path / "device.token"
    token_file.write_text("legacy-token-123456", encoding="utf-8")

    assert runtime.migrate_token_file(token_file) is True
    assert token_file.read_text(encoding="utf-8").startswith(runtime.DPAPI_MAGIC)
    assert runtime.load_token(token_file) == "legacy-token-123456"
    # Already sealed: nothing left to migrate.
    assert runtime.migrate_token_file(token_file) is False


def test_migration_is_a_noop_without_dpapi(tmp_path):
    token_file = tmp_path / "device.token"
    token_file.write_text("legacy-token-123456", encoding="utf-8")

    if runtime.dpapi_available():
        pytest.skip("DPAPI is available on this host")
    assert runtime.migrate_token_file(token_file) is False
    assert token_file.read_text(encoding="utf-8") == "legacy-token-123456"


def test_strip_token_keeps_other_settings():
    cfg = {"control_url": "https://example.test", "device_token": "secret", "theme": "dark"}

    stripped = runtime.strip_token_from_config(cfg)

    assert "device_token" not in stripped
    assert stripped["control_url"] == "https://example.test"
    assert cfg["device_token"] == "secret"  # input is not mutated


def test_mask_secret_never_reveals_the_whole_value():
    assert runtime.mask_secret("") == "(unset)"
    assert runtime.mask_secret("short") == "*" * 5

    masked = runtime.mask_secret("tok-abcdef123456")
    assert masked.startswith("tok-ab")
    assert masked.endswith("3456")
    assert "cde" not in masked


def test_single_instance_guard_excludes_second_copy(tmp_path):
    first = runtime.SingleInstanceGuard(name="AIBridgeTest", lock_dir=tmp_path)
    second = runtime.SingleInstanceGuard(name="AIBridgeTest", lock_dir=tmp_path)
    third = runtime.SingleInstanceGuard(name="AIBridgeTest", lock_dir=tmp_path)

    assert first.acquire() is True
    try:
        assert second.acquire() is False
        assert second.acquired is False
    finally:
        first.release()

    assert third.acquire() is True
    third.release()
    assert third.acquired is False


def test_file_logging_writes_and_is_idempotent(tmp_path):
    log_dir = tmp_path / "logs"
    target = runtime.configure_file_logging(log_dir)
    flagged = [h for h in logging.getLogger().handlers if getattr(h, "_aibridge_file_log", False)]

    try:
        assert target == log_dir / "agent-gui.log"
        assert runtime.configure_file_logging(log_dir) == target
        assert len(flagged) == 1

        logging.getLogger("ai_bridge.gui.test").warning("masked=%s", runtime.mask_secret("tok-abcdef123456"))
        for handler in flagged:
            handler.flush()

        content = target.read_text(encoding="utf-8")
        assert "masked=" in content
        assert "tok-abcdef123456" not in content
    finally:
        root = logging.getLogger()
        for handler in flagged:
            root.removeHandler(handler)
            handler.close()
