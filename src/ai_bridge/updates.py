"""Signed release verification (Ed25519).

Workflow:
  1. Maintainer:  python -m ai_bridge.updates keygen --out-dir keys/
                  python -m ai_bridge.updates sign --private-key keys/private.pem
                         --manifest release.json   # signs {name, version, files[]}
  2. Agent:       python agents/linux/agent_main.py --check-update
                         --manifest-url https://example.com/release.json
                         --signature-url https://example.com/release.json.sig
                         --public-key keys/public.pem
     The agent verifies the signature BEFORE downloading any file, and
     refuses (non-zero exit) on a bad signature or a file-hash mismatch.
     Verification is the security gate; installation remains a deliberate
     operator step (restart the service with the new code), not silent
     auto-install — see docs/security.md.

Requires the `cryptography` package (a declared dependency).
"""
from __future__ import annotations

import base64
import hashlib
import json
import sys
from pathlib import Path


def _ed25519():
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
    except ImportError as exc:
        raise RuntimeError("Signed updates require the 'cryptography' package.") from exc
    return Ed25519PrivateKey, Ed25519PublicKey, serialization

def generate_keypair(out_dir: Path) -> tuple[Path, Path]:
    Ed25519PrivateKey, _, serialization = _ed25519()
    private = Ed25519PrivateKey.generate()
    out_dir.mkdir(parents=True, exist_ok=True)
    priv_path = out_dir / "private.pem"; pub_path = out_dir / "public.pem"
    priv_path.write_bytes(private.private_bytes(serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    priv_path.chmod(0o600)
    pub_path.write_bytes(private.public_key().public_bytes(serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo))
    return priv_path, pub_path

def manifest_bytes(manifest: dict) -> bytes:
    return json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()

def sign_manifest(manifest: dict, private_key_path: Path) -> str:
    _, _, serialization = _ed25519()
    private = serialization.load_pem_private_key(Path(private_key_path).read_bytes(), password=None)
    return base64.b64encode(private.sign(manifest_bytes(manifest))).decode()

def verify_manifest(manifest: dict, signature_b64: str, public_key_path: Path) -> bool:
    _, _, serialization = _ed25519()
    public = serialization.load_pem_public_key(Path(public_key_path).read_bytes())
    try:
        public.verify(base64.b64decode(signature_b64), manifest_bytes(manifest))
        return True
    except Exception:
        return False

def hash_file(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def verify_file_hashes(manifest: dict, base_dir: Path) -> list[str]:
    """Return the list of files whose hash does NOT match the manifest."""
    bad = []
    for entry in manifest.get("files", []):
        p = base_dir / entry["path"]
        if not p.is_file() or hash_file(p) != entry.get("sha256"):
            bad.append(entry["path"])
    return bad

def main(argv: list[str] | None = None) -> int:
    import argparse
    parser = argparse.ArgumentParser(prog="ai-bridge-updates")
    sub = parser.add_subparsers(dest="cmd", required=True)
    k = sub.add_parser("keygen"); k.add_argument("--out-dir", required=True)
    s = sub.add_parser("sign"); s.add_argument("--private-key", required=True); s.add_argument("--manifest", required=True)
    v = sub.add_parser("verify"); v.add_argument("--public-key", required=True); v.add_argument("--manifest", required=True); v.add_argument("--signature", required=True)
    args = parser.parse_args(argv)
    if args.cmd == "keygen":
        priv, pub = generate_keypair(Path(args.out_dir)); print(f"private: {priv}\npublic: {pub}")
    elif args.cmd == "sign":
        manifest = json.loads(Path(args.manifest).read_text())
        print(sign_manifest(manifest, Path(args.private_key)))
    elif args.cmd == "verify":
        manifest = json.loads(Path(args.manifest).read_text())
        ok = verify_manifest(manifest, Path(args.signature).read_text().strip(), Path(args.public_key))
        print("verified" if ok else "SIGNATURE INVALID"); return 0 if ok else 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
