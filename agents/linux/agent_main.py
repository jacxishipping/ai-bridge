"""Linux agent entrypoint.

  python agents/linux/agent_main.py --control-url http://127.0.0.1:8000 \
      --device-token <token-from-enrollment> [--once]

Run as a dedicated unprivileged user via systemd (deployment/systemd/).
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _resolve_token_and_file(explicit_token: str, explicit_file: str) -> tuple[str, Path | None]:
    token = explicit_token.strip()
    token_path = Path(explicit_file).expanduser().resolve() if explicit_file else None

    # 1. If explicit token provided, find or establish an appropriate token file to persist rotations
    if token:
        if token_path is None:
            candidate = Path.home() / ".ai-bridge" / "device.token"
            if Path("/etc/ai-bridge").is_dir() and os.access("/etc/ai-bridge", os.W_OK):
                candidate = Path("/etc/ai-bridge") / "device.token"
            token_path = candidate
        return token, token_path

    # 2. Check explicit token file
    if token_path and token_path.is_file():
        try:
            tok = token_path.read_text(encoding="utf-8").strip()
            if tok:
                return tok, token_path
        except OSError:
            pass

    # 3. Check environment variable AI_BRIDGE_TOKEN_FILE
    env_file = os.environ.get("AI_BRIDGE_TOKEN_FILE")
    if env_file:
        p = Path(env_file).expanduser().resolve()
        if p.is_file():
            try:
                tok = p.read_text(encoding="utf-8").strip()
                if tok:
                    return tok, p
            except OSError:
                pass

    # 4. Check standard device.token candidate locations
    candidates = [
        Path("/etc/ai-bridge/device.token"),
        Path.home() / ".ai-bridge" / "device.token",
    ]
    for cand in candidates:
        if cand.is_file():
            try:
                tok = cand.read_text(encoding="utf-8").strip()
                if tok:
                    return tok, cand
            except OSError:
                pass

    # 5. Check agent.env files for AI_BRIDGE_DEVICE_TOKEN
    env_candidates = [
        Path("/etc/ai-bridge/agent.env"),
        Path.home() / ".ai-bridge" / "agent.env",
    ]
    for ecand in env_candidates:
        if ecand.is_file():
            try:
                for line in ecand.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if line.startswith("AI_BRIDGE_DEVICE_TOKEN="):
                        val = line.split("=", 1)[1].strip().strip('"').strip("'")
                        if val:
                            token_p = ecand.parent / "device.token"
                            return val, token_p
            except OSError:
                pass

    return "", token_path


def main() -> None:
    parser = argparse.ArgumentParser(prog="ai-bridge-agent")
    parser.add_argument("--control-url", default=os.environ.get("AI_BRIDGE_CONTROL_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--device-token", default=os.environ.get("AI_BRIDGE_DEVICE_TOKEN", ""))
    parser.add_argument("--token-file", default=os.environ.get("AI_BRIDGE_TOKEN_FILE", ""))
    parser.add_argument("--once", action="store_true", help="Run a single poll cycle, then exit.")
    parser.add_argument("--check-update", action="store_true", help="Verify a signed release manifest and exit (no install).")
    parser.add_argument("--manifest-url", default="")
    parser.add_argument("--signature-url", default="")
    parser.add_argument("--public-key", default="")
    args = parser.parse_args()

    token, token_file = _resolve_token_and_file(args.device_token, args.token_file)
    if not token and not args.check_update:
        parser.error("A device token is required (--device-token, --token-file, AI_BRIDGE_DEVICE_TOKEN, or ~/.ai-bridge/device.token).")

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
        ok = verify_manifest(manifest, signature, __import__("pathlib").Path(args.public_key))
        print(f"update manifest {manifest.get('name')} {manifest.get('version')}: {'VERIFIED' if ok else 'SIGNATURE INVALID - refusing'}")
        raise SystemExit(0 if ok else 1)

    from common.poller import Poller
    poller = Poller(args.control_url, token, token_file=token_file)
    if args.once:
        print(poller.run_once())
    else:
        poller.run_forever()


if __name__ == "__main__":
    main()
