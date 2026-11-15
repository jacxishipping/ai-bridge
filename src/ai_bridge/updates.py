"""Signed release verification and optional apply (Ed25519).

Workflow:
  1. Maintainer:  python -m ai_bridge.updates keygen --out-dir keys/
                  python -m ai_bridge.updates sign --private-key keys/private.pem
                         --manifest release.json   # signs {name, version, files[]}
  2. Agent:       python agents/windows/agent_main.py --check-update
                         --manifest-url https://example.com/release.json
                         --signature-url https://example.com/release.json.sig
                         --public-key keys/public.pem
     The agent verifies the signature BEFORE downloading any file, and
     refuses (non-zero exit) on a bad signature or a file-hash mismatch.
  3. Optional silent apply (Windows fleets): set AI_BRIDGE_ALLOW_AUTO_UPDATE=1 and
     pass --apply-update. Files download into a staging dir, hashes are re-checked,
     then staged into the install root. The agent does not restart itself.

Requires the `cryptography` package (a declared dependency).
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import shutil
import sys
import urllib.request
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


def auto_update_allowed() -> bool:
    return os.environ.get("AI_BRIDGE_ALLOW_AUTO_UPDATE", "").strip().lower() in ("1", "true", "yes")


def _safe_manifest_path(root: Path, rel: str) -> Path:
    rel_clean = (rel or "").strip().replace("\\", "/")
    if not rel_clean or rel_clean.startswith("/") or ":" in rel_clean.split("/")[0]:
        raise ValueError(f"Unsafe manifest path: {rel!r}")
    root_res = root.resolve()
    target = (root_res / rel_clean).resolve()
    if not target.is_relative_to(root_res) or target == root_res:
        raise ValueError(f"Manifest path escapes target directory: {rel!r}")
    return target


def download_and_stage_update(
    manifest: dict,
    *,
    staging_dir: Path,
    install_dir: Path | None = None,
    apply: bool = False,
) -> dict:
    """Download manifest files into staging, verify hashes, optionally apply into install_dir.

    Each manifest file entry must include ``path``, ``sha256``, and ``url``.
    """
    staging_dir.mkdir(parents=True, exist_ok=True)
    downloaded: list[str] = []
    for entry in manifest.get("files", []):
        rel = entry.get("path")
        url = entry.get("url")
        expected = entry.get("sha256")
        if not rel or not url or not expected:
            raise ValueError(f"manifest file entry missing path/url/sha256: {entry}")
        dest = _safe_manifest_path(staging_dir, rel)
        dest.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=60) as resp:
            dest.write_bytes(resp.read())
        if hash_file(dest) != expected:
            dest.unlink(missing_ok=True)
            raise ValueError(f"hash mismatch after download: {rel}")
        downloaded.append(rel)

    bad = verify_file_hashes(manifest, staging_dir)
    if bad:
        raise ValueError(f"staging hash verification failed: {bad}")

    applied: list[str] = []
    if apply:
        if not auto_update_allowed():
            raise PermissionError(
                "Silent apply refused: set AI_BRIDGE_ALLOW_AUTO_UPDATE=1 to enable."
            )
        if install_dir is None:
            raise ValueError("install_dir is required when apply=True")
        install_dir.mkdir(parents=True, exist_ok=True)
        for rel in downloaded:
            src = _safe_manifest_path(staging_dir, rel)
            dst = _safe_manifest_path(install_dir, rel)
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            applied.append(rel)

    return {
        "ok": True,
        "version": manifest.get("version"),
        "downloaded": downloaded,
        "applied": applied,
        "staging_dir": str(staging_dir),
        "install_dir": str(install_dir) if install_dir else "",
    }

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
