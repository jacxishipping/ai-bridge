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
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> None:
    parser = argparse.ArgumentParser(prog="ai-bridge-agent")
    parser.add_argument("--control-url", default=os.environ.get("AI_BRIDGE_CONTROL_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--device-token", default=os.environ.get("AI_BRIDGE_DEVICE_TOKEN", ""))
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
        import json as _json
        import urllib.request as _urllib

        from ai_bridge.updates import download_and_stage_update, verify_manifest

        with _urllib.urlopen(args.manifest_url, timeout=15) as r:
            manifest = _json.loads(r.read())
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

    if not args.device_token:
        parser.error("A device token is required (--device-token or AI_BRIDGE_DEVICE_TOKEN).")

    from common.poller import Poller

    poller = Poller(args.control_url, args.device_token)
    if args.once:
        print(poller.run_once())
    else:
        poller.run_forever()


if __name__ == "__main__":
    main()
