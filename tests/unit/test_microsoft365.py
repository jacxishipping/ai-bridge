"""Unit tests for the Microsoft 365 (Graph) connector."""
from __future__ import annotations

import urllib.parse

import httpx
import pytest
from cryptography.fernet import Fernet

from ai_bridge.connectors import microsoft365 as m365
from ai_bridge.control.dispatch import dispatch
from ai_bridge.policy import TOOL_TIERS, RiskTier


@pytest.fixture
def m365_env(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_BRIDGE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("AI_BRIDGE_M365_CLIENT_ID", "client-123")
    monkeypatch.setenv("AI_BRIDGE_M365_REDIRECT_URI", "https://x.test/api/connectors/m365/callback")
    monkeypatch.setenv("AI_BRIDGE_M365_TOKEN_KEY", Fernet.generate_key().decode())
    monkeypatch.delenv("AI_BRIDGE_M365_ALLOW_WRITE", raising=False)
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.url.path.endswith("/oauth2/v2.0/token"):
            return httpx.Response(200, json={"access_token": "ACCESS-SECRET-VALUE", "refresh_token": "REFRESH-SECRET-VALUE", "expires_in": 3600})
        if request.url.path == "/v1.0/me/mailFolders/inbox/messages":
            return httpx.Response(200, json={"value": [{"id": "1", "subject": "Hi", "bodyPreview": "p"}]})
        if request.url.path == "/v1.0/me/sendMail":
            return httpx.Response(202)
        return httpx.Response(404, json={"error": {"code": "NotFound"}})

    monkeypatch.setattr(m365, "_TRANSPORT", httpx.MockTransport(handler))
    m365._PENDING.clear()
    return calls


def _connect():
    url = m365.new_login()
    state = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)["state"][0]
    m365.complete_login("code", state)
    return url


def test_unconfigured(monkeypatch):
    monkeypatch.delenv("AI_BRIDGE_M365_CLIENT_ID", raising=False)
    assert m365.status() == {"configured": False, "connected": False}
    with pytest.raises(m365.M365Error):
        m365.new_login()


def test_login_url_uses_pkce_and_read_scopes_only(m365_env):
    url = m365.new_login()
    q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    assert q["code_challenge_method"] == ["S256"]
    scope = q["scope"][0]
    assert "Mail.Read" in scope and "Mail.Send" not in scope


def test_complete_login_rejects_unknown_state(m365_env):
    with pytest.raises(m365.M365Error):
        m365.complete_login("code", "bogus")


def test_tokens_encrypted_at_rest(m365_env, tmp_path):
    _connect()
    raw = (tmp_path / "m365_tokens.enc").read_bytes()
    assert b"SECRET-VALUE" not in raw
    assert m365.status()["connected"] is True
    assert "SECRET-VALUE" not in str(m365.status())


def test_list_mail_via_dispatch(m365_env):
    _connect()
    out = dispatch("m365_list_mail", {"top": 5})
    assert out["messages"][0]["subject"] == "Hi"
    graph_call = [c for c in m365_env if c.url.host == "graph.microsoft.com"][0]
    assert graph_call.headers["authorization"] == "Bearer ACCESS-SECRET-VALUE"


def test_not_connected_raises(m365_env):
    with pytest.raises(m365.M365Error):
        dispatch("m365_list_mail", {})


def test_expired_token_refreshes(m365_env):
    _connect()
    cfg = m365.config()
    data = m365._load_all(cfg)
    data["default"]["expires_at"] = 0
    m365._save_all(cfg, data)
    dispatch("m365_list_mail", {})
    assert sum(c.url.path.endswith("/token") for c in m365_env) == 2


def test_send_mail_tier4_and_write_flag(m365_env):
    assert TOOL_TIERS["m365_send_mail"] == RiskTier.HIGH_RISK
    assert TOOL_TIERS["m365_list_mail"] == RiskTier.READ_ONLY
    _connect()
    args = {"to": ["a@b.com"], "subject": "s", "body": "b"}
    with pytest.raises(PermissionError):
        dispatch("m365_send_mail", args)  # no approval
    with pytest.raises(m365.M365Error):
        dispatch("m365_send_mail", args, approval_granted=True)  # write disabled


def test_send_mail_with_approval_and_write_enabled(m365_env, monkeypatch):
    monkeypatch.setenv("AI_BRIDGE_M365_ALLOW_WRITE", "1")
    _connect()
    out = dispatch("m365_send_mail", {"to": "a@b.com", "subject": "s", "body": "b"}, approval_granted=True)
    assert out["sent"] is True
    with pytest.raises(ValueError):
        dispatch("m365_send_mail", {"to": ["bad addr"], "subject": "s"}, approval_granted=True)


def test_input_validation(m365_env):
    _connect()
    with pytest.raises(ValueError):
        dispatch("m365_list_mail", {"folder": "../x"})
    with pytest.raises(ValueError):
        dispatch("m365_list_files", {"path": "a/../../b"})
    with pytest.raises(ValueError):
        dispatch("m365_get_mail", {"message_id": "a/b"})


def test_catalog_registered():
    from ai_bridge.control.ai_api import TOOL_CATALOG

    assert set(m365.TOOLS) == set(m365.TOOL_SPECS) <= set(TOOL_CATALOG)
    assert set(m365.TOOLS) <= set(TOOL_TIERS)
