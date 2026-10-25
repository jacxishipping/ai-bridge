"""Workspace file operations: confined, atomic, backup-aware.

Every path goes through confined_path(). Writes are atomic (temp file +
os.replace) so a cancelled task never leaves a half-written file, and
edit/delete first take a timestamped backup under <workspace>/.ai-bridge-backups/
unless the caller explicitly opts out (backup only for Tier-3+ paths).
"""
from __future__ import annotations

import os
import shutil
import time
from pathlib import Path

from .config import get_settings
from .security import confined_path, is_secret_name, workspace_root
from .security import read_workspace_text as _security_read


def list_workspace(relative_directory: str = ".") -> list[dict]:
    directory = confined_path(relative_directory)
    if not directory.is_dir():
        raise ValueError("Directory does not exist inside the workspace.")
    limit = get_settings().max_list_entries
    root = workspace_root().resolve()
    items = []
    for child in sorted(directory.iterdir(), key=lambda p: p.name.lower())[:limit]:
        try:
            # Symlinks must resolve inside the workspace; escaping ones are omitted.
            child.resolve().relative_to(root)
        except Exception:
            continue
        items.append({"name": child.name,
                      "type": "directory" if child.is_dir() and not child.is_symlink() else "file",
                      "size_bytes": child.stat().st_size if child.is_file() else None,
                      "symlink": child.is_symlink()})
    return items

def search_workspace(query: str, relative_directory: str = ".", max_results: int = 50) -> list[dict]:
    if not query or len(query) > 200:
        raise ValueError("Search query must be 1-200 characters.")
    directory = confined_path(relative_directory)
    hits: list[dict] = []
    for path in sorted(directory.rglob("*")):
        if len(hits) >= max_results:
            break
        if not path.is_file() or is_secret_name(path):
            continue
        try:
            if path.resolve().relative_to(workspace_root().resolve()) is None:
                continue
        except Exception:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for i, line in enumerate(text.splitlines(), 1):
            if query.lower() in line.lower():
                hits.append({"file": str(path.relative_to(workspace_root())),
                             "line": i, "text": line.strip()[:300]})
                if len(hits) >= max_results:
                    break
    return hits

def _backup(path: Path) -> Path | None:
    root = workspace_root()
    backup_dir = root / ".ai-bridge-backups" / time.strftime("%Y%m%d-%H%M%S")
    backup_dir.mkdir(parents=True, exist_ok=True)
    dest = backup_dir / path.name
    if path.is_file():
        shutil.copy2(path, dest)
        return dest
    return None

def _atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    tmp.write_text(content, encoding="utf-8")
    os.replace(tmp, path)

def create_workspace_file(relative_path: str, content: str, overwrite: bool = False) -> dict:
    if len(content.encode("utf-8")) > get_settings().max_read_bytes * 4:
        raise ValueError("Content exceeds the write size limit.")
    path = confined_path(relative_path)
    if path.exists() and not overwrite:
        raise ValueError("File already exists; pass overwrite=true to replace it.")
    if path.exists():
        _backup(path)
    _atomic_write(path, content)
    return {"path": relative_path, "size_bytes": path.stat().st_size}

def edit_workspace_file(relative_path: str, old_text: str, new_text: str) -> dict:
    path = confined_path(relative_path)
    if not path.is_file():
        raise ValueError("File does not exist.")
    backup = _backup(path)
    text = path.read_text(encoding="utf-8", errors="replace")
    if old_text not in text:
        raise ValueError("old_text was not found in the file (no change made).")
    _atomic_write(path, text.replace(old_text, new_text, 1))
    return {"path": relative_path, "backup": str(backup) if backup else None}

def move_workspace_file(source: str, destination: str) -> dict:
    src = confined_path(source); dst = confined_path(destination)
    if not src.exists():
        raise ValueError("Source does not exist.")
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dst))
    return {"from": source, "to": destination}

def delete_workspace_file(relative_path: str) -> dict:
    path = confined_path(relative_path)
    if not path.is_file():
        raise ValueError("File does not exist.")
    backup = _backup(path)  # recoverable delete: backup first, always
    path.unlink()
    return {"deleted": relative_path, "backup": str(backup) if backup else None}


def read_workspace_text(relative_path: str, max_bytes: int | None = None) -> str:
    """Read a workspace text file (delegates to security.read_workspace_text)."""
    return _security_read(relative_path, max_bytes)
