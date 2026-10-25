from pathlib import Path

import pytest

from ai_bridge import workspace


@pytest.fixture(autouse=True)
def ws(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_BRIDGE_WORKSPACE", str(tmp_path))
    return tmp_path

def test_create_edit_delete_with_backup(ws):
    workspace.create_workspace_file("a.txt", "hello")
    assert workspace.read_workspace_text("a.txt") == "hello"
    out = workspace.edit_workspace_file("a.txt", "hello", "hello world")
    assert out["backup"] is not None and Path(out["backup"]).exists()
    assert workspace.read_workspace_text("a.txt") == "hello world"
    out = workspace.delete_workspace_file("a.txt")
    assert out["backup"] is not None
    assert not (ws / "a.txt").exists()

def test_create_refuses_overwrite_without_flag(ws):
    workspace.create_workspace_file("a.txt", "x")
    with pytest.raises(ValueError):
        workspace.create_workspace_file("a.txt", "y")

def test_symlink_escape_omitted_from_listing(ws):
    outside = ws.parent / "outside.txt"
    outside.write_text("secret")
    (ws / "escape").symlink_to(outside)
    names = [i["name"] for i in workspace.list_workspace(".")]
    assert "escape" not in names

def test_secret_named_file_not_readable(ws):
    (ws / ".env").write_text("API_KEY=abc123")
    with pytest.raises(ValueError):
        workspace.read_workspace_text(".env")
