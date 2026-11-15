r"""Windows agent entrypoint.

  python agents\windows\agent_main.py --control-url https://your-domain ^
      --device-token <token-from-enrollment> [--once]

Same polling contract as the Linux/macOS agents: outbound-only loop
(heartbeat, fetch next task, execute through the policy-enforced
dispatcher, post the result). Never listens on a port.

For a persistent install, see deployment/windows/install-agent.ps1
(scheduled task). For desktop automation, use
agents/windows/desktop_helper.py in a LOGGED-IN user session, never as
SYSTEM.

End-to-end execution on Windows was verified 2026-10-25 (Windows
Server 2025: heartbeat, task dispatch, system-info and service-status
tasks, and the scheduled-task service install).
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import re
import socket
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from windows import app_runtime, desktop_helper
from windows.windows_agent import windows_event_logs, windows_service_status, windows_system_info


def _resolve_saved_config(control_url: str, device_token: str, token_file: Path) -> tuple[str, str]:
    """Fill missing control URL / device token from saved config files or DPAPI storage."""
    resolved_url = (control_url or "").strip()
    resolved_tok = (device_token or "").strip()

    if not resolved_tok:
        resolved_tok = app_runtime.load_token(token_file, default="")

    env_default_url = "http://127.0.0.1:8000"
    search_dirs = [Path.home() / ".ai-bridge"]
    for base_env in (os.environ.get("APPDATA"), os.environ.get("ProgramData")):
        if base_env:
            search_dirs.extend([Path(base_env) / "ai-bridge", Path(base_env) / "AIBridge"])

    for cfg_dir in search_dirs:
        gui_cfg = cfg_dir / "agent_gui.json"
        if gui_cfg.is_file():
            try:
                data = json.loads(gui_cfg.read_text(encoding="utf-8"))
                if (not resolved_url or resolved_url == env_default_url) and data.get("control_url"):
                    resolved_url = str(data["control_url"]).strip()
                if not resolved_tok and data.get("device_token"):
                    resolved_tok = app_runtime.unseal_token(str(data["device_token"]).strip())
            except (OSError, ValueError):
                pass
        env_file = cfg_dir / "agent.env"
        if env_file.is_file():
            try:
                for raw in env_file.read_text(encoding="utf-8", errors="ignore").splitlines():
                    line = raw.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    k, v = k.strip(), v.strip().strip('"').strip("'")
                    if k == "AI_BRIDGE_CONTROL_URL" and v and (not resolved_url or resolved_url == env_default_url):
                        resolved_url = v
                    elif k == "AI_BRIDGE_DEVICE_TOKEN" and v and not resolved_tok:
                        resolved_tok = app_runtime.unseal_token(v)
            except OSError:
                pass
        cmd_file = cfg_dir / "run-agent.cmd"
        if cmd_file.is_file():
            try:
                text = cmd_file.read_text(encoding="utf-8", errors="ignore")
                if not resolved_url or resolved_url == env_default_url:
                    m = re.search(r"AI_BRIDGE_CONTROL_URL\s*=\s*([^\r\n]+)", text)
                    if m:
                        resolved_url = m.group(1).strip().strip('"')
                if not resolved_tok:
                    m = re.search(r"AI_BRIDGE_DEVICE_TOKEN\s*=\s*([^\r\n]+)", text)
                    if m:
                        resolved_tok = app_runtime.unseal_token(m.group(1).strip().strip('"'))
            except OSError:
                pass

    return resolved_url or env_default_url, resolved_tok


def _save_agent_config(control_url: str, device_token: str, token_path: Path) -> Path:
    """Persist control URL and sealed device token so future runs need no CLI flags."""
    clean_url = (control_url or "").strip().rstrip("/") or "http://127.0.0.1:8000"
    if device_token:
        app_runtime.save_token(device_token, token_path)
    cfg_dir = Path.home() / ".ai-bridge"
    env_file = cfg_dir / "agent.env"
    existing: dict[str, str] = {}
    if env_file.is_file():
        try:
            for raw in env_file.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                existing[k.strip()] = v.strip().strip('"').strip("'")
        except OSError:
            pass
    existing["AI_BRIDGE_CONTROL_URL"] = clean_url
    if device_token:
        existing["AI_BRIDGE_DEVICE_TOKEN"] = app_runtime.seal_token(device_token)
    lines = [f'{k}="{v}"' for k, v in existing.items() if v]
    app_runtime._atomic_write(env_file, ("\n".join(lines) + "\n").encode("utf-8"))
    return env_file


def _enroll_with_admin_token(control_url: str, admin_token: str, name: str = "") -> tuple[str, str]:
    """Enroll this Windows device with the control plane in a single API call."""
    clean_url = (control_url or "").strip().rstrip("/")
    if not clean_url or not admin_token.strip():
        raise ValueError("Both control URL and admin token are required to enroll.")
    host = socket.gethostname() or "windows-device"
    payload = json.dumps({
        "name": (name or "").strip() or host,
        "hostname": host,
        "os": f"Windows ({platform.release()})" if platform.release() else "Windows",
        "unrestricted": True,
        "set_default": True,
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{clean_url}/api/devices/enroll",
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Admin-Token": admin_token.strip(),
            "User-Agent": "AI-Bridge-Windows-Agent",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Enrollment failed (HTTP {exc.code}): {body}") from exc
    dev_id = str(data.get("device_id") or "")
    dev_tok = str(data.get("device_token") or "")
    if not dev_tok:
        raise RuntimeError(f"Enrollment response missing device_token: {data}")
    return dev_id, dev_tok


def main() -> None:
    parser = argparse.ArgumentParser(prog="ai-bridge-agent")
    parser.add_argument(
        "command",
        nargs="?",
        choices=["run", "enroll", "status", "system-info", "event-logs"],
        default="run",
        help="Subcommand to execute (default: run).",
    )
    parser.add_argument("--control-url", default=os.environ.get("AI_BRIDGE_CONTROL_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--device-token", default=os.environ.get("AI_BRIDGE_DEVICE_TOKEN", ""))
    parser.add_argument("--admin-token", default=os.environ.get("AI_BRIDGE_ADMIN_TOKEN", ""), help="Admin token to enroll and start automatically on first run.")
    parser.add_argument("--name", default=os.environ.get("AI_BRIDGE_DEVICE_NAME", ""), help="Friendly device name when using --admin-token or 'enroll'.")
    parser.add_argument(
        "--token-file",
        default=os.environ.get("AI_BRIDGE_TOKEN_FILE", str(app_runtime.DEFAULT_TOKEN_FILE)),
        help="Path to the DPAPI-sealed device token file.",
    )
    parser.add_argument("--once", action="store_true", help="Run a single poll cycle, then exit.")
    parser.add_argument("--service-status", default="", help="Check status of a specific Windows service.")
    parser.add_argument("--log-name", default="System", help="Windows event log name for 'event-logs' command.")
    parser.add_argument("--max-events", type=int, default=50, help="Maximum event log entries to return.")
    parser.add_argument("--check-update", action="store_true", help="Verify a signed release manifest and exit (no install).")
    parser.add_argument(
        "--apply-update",
        action="store_true",
        help="After verifying the signed manifest, download into staging and apply when AI_BRIDGE_ALLOW_AUTO_UPDATE=1.",
    )
    parser.add_argument("--manifest-url", default="")
    parser.add_argument("--signature-url", default="")
    parser.add_argument("--public-key", default="")
    parser.add_argument(
        "--staging-dir",
        default=os.environ.get("AI_BRIDGE_UPDATE_STAGING", str(Path.home() / ".ai-bridge" / "update-staging")),
        help="Directory for verified download staging before apply.",
    )
    parser.add_argument(
        "--install-dir",
        default=os.environ.get("AI_BRIDGE_INSTALL_DIR", ""),
        help="Install root for --apply-update (defaults to the agent repo root when unset).",
    )
    args = parser.parse_args()

    if args.check_update or args.apply_update:
        if not (args.manifest_url and args.signature_url and args.public_key):
            parser.error("--check-update/--apply-update require --manifest-url, --signature-url and --public-key.")
        import urllib.request as _urllib

        from ai_bridge.updates import download_and_stage_update, verify_manifest

        with _urllib.urlopen(args.manifest_url, timeout=15) as r:
            manifest = json.loads(r.read())
        with _urllib.urlopen(args.signature_url, timeout=15) as r:
            signature = r.read().decode().strip()
        ok = verify_manifest(manifest, signature, Path(args.public_key))
        print(f"update manifest {manifest.get('name')} {manifest.get('version')}: {'VERIFIED' if ok else 'SIGNATURE INVALID - refusing'}")
        if not ok:
            raise SystemExit(1)
        if args.apply_update:
            install_dir = Path(args.install_dir) if args.install_dir else Path(__file__).resolve().parents[2]
            result = download_and_stage_update(
                manifest,
                staging_dir=Path(args.staging_dir),
                install_dir=install_dir,
                apply=True,
            )
            print(
                f"update applied version={result.get('version')} "
                f"files={len(result.get('applied') or [])} install_dir={result.get('install_dir')}"
            )
        raise SystemExit(0)

    if args.service_status:
        print(json.dumps(windows_service_status(args.service_status), indent=2))
        raise SystemExit(0)

    if args.command == "system-info":
        print(json.dumps(windows_system_info(), indent=2))
        raise SystemExit(0)

    if args.command == "event-logs":
        print(windows_event_logs(args.log_name, max_events=args.max_events))
        raise SystemExit(0)

    token_path = Path(args.token_file)
    control_url, device_token = _resolve_saved_config(args.control_url, args.device_token, token_path)

    if args.command == "enroll":
        if not args.admin_token:
            parser.error("enroll requires --admin-token (or AI_BRIDGE_ADMIN_TOKEN).")
        dev_id, device_token = _enroll_with_admin_token(control_url, args.admin_token, args.name)
        saved_env = _save_agent_config(control_url, device_token, token_path)
        print(f"Enrolled device '{dev_id}' on {control_url}; credentials saved to {saved_env}")
        raise SystemExit(0)

    if args.command == "status":
        payload = {
            "control_url": control_url,
            "token_configured": bool(device_token),
            "token_file": str(token_path),
            "system": windows_system_info(),
            "desktop": desktop_helper.status(),
        }
        print(json.dumps(payload, indent=2))
        raise SystemExit(0)

    if not device_token and args.admin_token:
        dev_id, device_token = _enroll_with_admin_token(control_url, args.admin_token, args.name)
        saved_env = _save_agent_config(control_url, device_token, token_path)
        print(f"Auto-enrolled device '{dev_id}' on {control_url}; saved to {saved_env}")
    elif args.device_token and device_token:
        _save_agent_config(control_url, device_token, token_path)

    if not device_token:
        parser.error("A device token is required (--device-token, --admin-token to auto-enroll, or AI_BRIDGE_DEVICE_TOKEN).")

    app_runtime.configure_file_logging()
    app_runtime.install_excepthook()

    from common.poller import Poller

    poller = Poller(
        control_url,
        device_token,
        token_file=token_path,
        token_saver=lambda tok: app_runtime.save_token(tok, token_path),
        token_loader=lambda: app_runtime.load_token(token_path) or None,
    )
    if args.once:
        print(poller.run_once())
    else:
        poller.run_forever()


if __name__ == "__main__":
    main()
