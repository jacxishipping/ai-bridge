"""Tests for the headless --diagnose report.

Everything here runs without Tkinter and without Windows: the report is pure
stdlib plus app_runtime, and the real CLI path is exercised in a subprocess.
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "agents" / "windows"))

import app_runtime as runtime  # noqa: E402
import diagnose  # noqa: E402


def _closed_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class _HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 - BaseHTTPRequestHandler API
        if self.path == "/health":
            body = b'{"status": "ok", "version": "0.3.0"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404)

    def log_message(self, *args):  # keep test output clean
        return


@pytest.fixture()
def health_server():
    server = HTTPServer(("127.0.0.1", 0), _HealthHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()


def test_health_url_normalisation():
    assert diagnose.health_url("") == ""
    assert diagnose.health_url("plane.example") == "https://plane.example/health"
    assert diagnose.health_url("https://plane.example/") == "https://plane.example/health"
    assert diagnose.health_url("http://127.0.0.1:8000/health") == "http://127.0.0.1:8000/health"
    assert diagnose.health_url("  https://plane.example/api  ") == "https://plane.example/api/health"


def test_probe_reports_healthy_control_plane(health_server):
    result = diagnose.probe_control_plane(health_server)

    assert result["ok"] is True
    assert result["http_status"] == 200
    assert result["health_status"] == "ok"
    assert result["latency_ms"] is not None and result["latency_ms"] >= 0
    assert result["error"] is None


def test_probe_reports_unreachable_control_plane():
    result = diagnose.probe_control_plane(f"http://127.0.0.1:{_closed_port()}", timeout=1.0)

    assert result["ok"] is False
    assert result["http_status"] is None
    assert result["error"]


def test_probe_without_control_url_does_not_attempt_network():
    result = diagnose.probe_control_plane("")

    assert result["ok"] is False
    assert result["url"] is None
    assert result["error"] == "control_url is not configured"


def test_report_masks_the_token_and_never_serialises_it(tmp_path, health_server):
    token_file = tmp_path / "device.token"
    config_file = tmp_path / "agent_gui.json"
    runtime.save_token("tok-abcdef123456", token_file)
    config_file.write_text(json.dumps({"control_url": health_server, "theme": "dark"}), encoding="utf-8")

    report = diagnose.build_report(
        lambda: {"control_url": health_server, "theme": "dark"},
        config_file=config_file,
        token_file=token_file,
        gui_available=False,
    )

    rendered = json.dumps(report)
    assert "tok-abcdef123456" not in rendered
    assert report["token"]["masked"] == runtime.mask_secret("tok-abcdef123456")
    assert report["token"]["present"] is True
    assert report["token"]["readable"] is True
    assert report["config"]["device_token_in_json"] is False
    assert report["config"]["settings"]["theme"] == "dark"
    assert report["ok"] is True
    assert report["checks"] and all("name" in check for check in report["checks"])


def test_report_flags_token_left_in_json_config(tmp_path):
    config_file = tmp_path / "agent_gui.json"
    config_file.write_text(json.dumps({"control_url": "https://plane.example", "device_token": "tok-json-leak-9999"}), encoding="utf-8")

    report = diagnose.build_report(
        lambda: {"control_url": "https://plane.example"},
        config_file=config_file,
        token_file=tmp_path / "missing.token",
        timeout=0.5,
    )

    assert report["config"]["device_token_in_json"] is True
    assert "tok-json-leak-9999" not in json.dumps(report)


def test_report_handles_missing_token_and_broken_config(tmp_path):
    config_file = tmp_path / "agent_gui.json"
    config_file.write_text("{not json", encoding="utf-8")

    report = diagnose.build_report(
        lambda: (_ for _ in ()).throw(RuntimeError("config unreadable")),
        config_file=config_file,
        token_file=tmp_path / "absent.token",
        timeout=0.5,
    )

    assert report["token"]["present"] is False
    assert report["token"]["masked"] == "(unset)"
    assert report["ok"] is False
    assert any(error.startswith("config:") for error in report["errors"])


def test_report_flags_sealed_token_that_cannot_be_opened(tmp_path):
    if runtime.dpapi_available():
        pytest.skip("DPAPI is available, so the sealed token is decryptable here")
    token_file = tmp_path / "device.token"
    token_file.write_text(runtime.DPAPI_MAGIC + "AAAA", encoding="utf-8")

    report = diagnose.build_report(
        lambda: {},
        config_file=tmp_path / "agent_gui.json",
        token_file=token_file,
        timeout=0.5,
    )

    assert report["token"]["readable"] is False
    assert report["token"]["backend"] == "dpapi"
    assert "DPAPI" in (report["token"]["error"] or "")


def test_cli_diagnose_prints_json_and_exits_zero(tmp_path):
    """The real entrypoint: no window, no Tkinter, machine-readable report."""
    env = {
        **os.environ,
        "HOME": str(tmp_path),
        "USERPROFILE": str(tmp_path),
        "AI_BRIDGE_CONTROL_URL": f"http://127.0.0.1:{_closed_port()}",
    }
    env.pop("AI_BRIDGE_DEVICE_TOKEN", None)

    proc = subprocess.run(
        [sys.executable, str(REPO_ROOT / "agents" / "windows" / "gui_app.py"), "--diagnose"],
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=90,
    )

    assert proc.returncode == 0, proc.stderr
    report = json.loads(proc.stdout)
    assert report["app"] == diagnose.APP_NAME
    assert report["platform"]["system"] in ("Windows", "Linux", "Darwin")
    assert report["platform"]["is_windows"] == (sys.platform == "win32")
    assert report["token"]["present"] is False
    assert report["connectivity"]["ok"] is False
    assert report["ok"] is False
    assert proc.stderr == ""
