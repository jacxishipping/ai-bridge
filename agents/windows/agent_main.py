"""Windows agent entrypoint.

  python agents\\windows\\agent_main.py --control-url https://your-domain ^
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
    parser.add_argument("--manifest-url", default="")
    parser.add_argument("--signature-url", default="")
    parser.add_argument("--public-key", default="")
    args = parser.parse_args()
    if not args.device_token:
        parser.error("A device token is required (--device-token or AI_BRIDGE_DEVICE_TOKEN).")
    if args.check_update:
        if not (args.manifest_url and args.signature_url and args.public_key):
            parser.error("--check-update requires --manifest-url, --signature-url and --public-key.")
        import json as _json
        import urllib.request as _urllib

        from ai_bridge.updates import verify_manifest

        with _urllib.urlopen(args.manifest_url, timeout=15) as r:
            manifest = _json.loads(r.read())
        with _urllib.urlopen(args.signature_url, timeout=15) as r:
            signature = r.read().decode().strip()
        ok = verify_manifest(manifest, signature, Path(args.public_key))
        print(f"update manifest {manifest.get('name')} {manifest.get('version')}: {'VERIFIED' if ok else 'SIGNATURE INVALID - refusing'}")
        raise SystemExit(0 if ok else 1)
    from common.poller import Poller

    poller = Poller(args.control_url, args.device_token)
    if args.once:
        print(poller.run_once())
    else:
        poller.run_forever()


if __name__ == "__main__":
    main()
