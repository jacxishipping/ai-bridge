"""macOS agent entrypoint.

  python agents/macos/agent_main.py --control-url https://your-domain \
      --device-token <token-from-enrollment> [--once]

Same polling contract as the Linux agent (common.poller is pure HTTP and
diagnostics are cross-platform via the platform module and psutil).
Run as the logged-in user via launchd (deployment/macos/) so the agent
can also use desktop automation in that user's session.

NOT yet run on macOS: this port was written from the Linux agent and
needs a Mac to verify launchd behaviour end to end.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import socket
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

CONFIG_FILE = Path.home() / ".ai-bridge" / "agent.json"
DEFAULT_CONTROL_URL = "http://127.0.0.1:8000"


def _load_saved_config(control_url: str, device_token: str) -> tuple[str, str]:
    resolved_url = (control_url or "").strip()
    resolved_tok = (device_token or "").strip()
    if CONFIG_FILE.is_file():
        try:
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            if (not resolved_url or resolved_url == DEFAULT_CONTROL_URL) and data.get("control_url"):
                resolved_url = str(data["control_url"]).strip()
            if not resolved_tok and data.get("device_token"):
                resolved_tok = str(data["device_token"]).strip()
        except (OSError, ValueError):
            pass
    return resolved_url or DEFAULT_CONTROL_URL, resolved_tok


def _save_saved_config(control_url: str, device_token: str) -> Path:
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "control_url": (control_url or "").strip().rstrip("/") or DEFAULT_CONTROL_URL,
        "device_token": (device_token or "").strip(),
    }
    CONFIG_FILE.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    try:
        os.chmod(CONFIG_FILE, 0o600)
    except OSError:
        pass
    return CONFIG_FILE


def _enroll_with_admin_token(control_url: str, admin_token: str, name: str = "") -> tuple[str, str]:
    clean_url = (control_url or "").strip().rstrip("/")
    host = socket.gethostname() or "macos-device"
    payload = json.dumps({
        "name": (name or "").strip() or host,
        "hostname": host,
        "os": f"macOS ({platform.mac_ver()[0]})" if platform.mac_ver()[0] else "macOS",
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
            "User-Agent": "AI-Bridge-macOS-Agent",
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
    parser.add_argument("command", nargs="?", choices=["run", "enroll", "status"], default="run", help="Subcommand to execute (default: run).")
    parser.add_argument("--control-url", default=os.environ.get("AI_BRIDGE_CONTROL_URL", DEFAULT_CONTROL_URL))
    parser.add_argument("--device-token", default=os.environ.get("AI_BRIDGE_DEVICE_TOKEN", ""))
    parser.add_argument("--admin-token", default=os.environ.get("AI_BRIDGE_ADMIN_TOKEN", ""), help="Admin token to enroll and start automatically on first run.")
    parser.add_argument("--name", default=os.environ.get("AI_BRIDGE_DEVICE_NAME", ""), help="Friendly device name when enrolling.")
    parser.add_argument("--once", action="store_true", help="Run a single poll cycle, then exit.")
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

    control_url, device_token = _load_saved_config(args.control_url, args.device_token)

    if args.command == "enroll":
        if not args.admin_token:
            parser.error("enroll requires --admin-token (or AI_BRIDGE_ADMIN_TOKEN).")
        dev_id, device_token = _enroll_with_admin_token(control_url, args.admin_token, args.name)
        cfg_p = _save_saved_config(control_url, device_token)
        print(f"Enrolled device '{dev_id}' on {control_url}; saved to {cfg_p}")
        raise SystemExit(0)

    if args.command == "status":
        print(json.dumps({"control_url": control_url, "token_configured": bool(device_token), "config_file": str(CONFIG_FILE)}, indent=2))
        raise SystemExit(0)

    if not device_token and args.admin_token:
        dev_id, device_token = _enroll_with_admin_token(control_url, args.admin_token, args.name)
        cfg_p = _save_saved_config(control_url, device_token)
        print(f"Auto-enrolled device '{dev_id}' on {control_url}; saved to {cfg_p}")
    elif args.device_token and device_token:
        _save_saved_config(control_url, device_token)

    if not device_token:
        parser.error("A device token is required (--device-token or AI_BRIDGE_DEVICE_TOKEN).")

    from common.poller import Poller

    poller = Poller(control_url, device_token)
    if args.once:
        print(poller.run_once())
    else:
        poller.run_forever()


if __name__ == "__main__":
    main()
