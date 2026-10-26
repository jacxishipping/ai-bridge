"""Configuration from environment only. Secrets are never read from code
or committed config files; they come from env vars / .env (gitignored)."""
from __future__ import annotations

import os
from pathlib import Path


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def _bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, "1" if default else "0").strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    workspace: Path
    max_read_bytes: int = 128_000
    max_output_bytes: int = 64_000
    max_list_entries: int = 200
    default_timeout_s: int = 30
    max_timeout_s: int = 300
    max_concurrent_tasks: int = 4
    control_api_url: str
    control_api_port: int
    admin_token: str | None
    device_token: str | None
    tenant_id: str
    desktop_enabled: bool
    allow_tier3: bool
    data_dir: Path

    def __init__(self) -> None:
        raw = os.path.expandvars(os.environ.get("AI_BRIDGE_WORKSPACE", str(Path.home() / "ai-bridge-workspace")))
        self.workspace = Path(raw).expanduser()
        self.max_read_bytes = _int("AI_BRIDGE_MAX_READ_BYTES", 128_000)
        self.max_output_bytes = _int("AI_BRIDGE_MAX_OUTPUT_BYTES", 64_000)
        self.max_list_entries = _int("AI_BRIDGE_MAX_LIST", 200)
        self.default_timeout_s = _int("AI_BRIDGE_DEFAULT_TIMEOUT", 30)
        self.max_timeout_s = _int("AI_BRIDGE_MAX_TIMEOUT", 300)
        self.max_concurrent_tasks = _int("AI_BRIDGE_MAX_CONCURRENT", 4)
        self.control_api_url = os.environ.get("AI_BRIDGE_CONTROL_URL", "http://127.0.0.1:8000")
        self.control_api_port = _int("AI_BRIDGE_CONTROL_PORT", 8000)
        self.admin_token = os.environ.get("AI_BRIDGE_ADMIN_TOKEN") or None
        self.device_token = os.environ.get("AI_BRIDGE_DEVICE_TOKEN") or None
        self.tenant_id = os.environ.get("AI_BRIDGE_TENANT", "default")
        self.desktop_enabled = _bool("AI_BRIDGE_DESKTOP_ENABLED", False)
        self.allow_tier3 = _bool("AI_BRIDGE_ALLOW_TIER3", False)
        data = os.path.expandvars(os.environ.get("AI_BRIDGE_DATA_DIR", str(Path.home() / ".ai-bridge")))
        self.data_dir = Path(data).expanduser()


def get_settings() -> Settings:
    return Settings()
