"""Pre-flight check that a public AI Bridge URL is ready for Copilot Studio (remote MCP + OAuth).

Usage: python deployment/copilot_smoke_check.py https://your-domain

Non-mutating: no clients are registered and no credentials are sent. It checks
HTTPS, OAuth discovery documents, PKCE S256 + dynamic registration support,
that registration rejects an insecure redirect URI, and that /mcp refuses
unauthenticated requests. Exit code is nonzero if any check fails.
It cannot verify the Copilot Studio side (tenant, agent publishing).
"""
import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request


def fetch(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read(256_000)
    except urllib.error.HTTPError as e:
        return e.code, e.read(256_000)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    base = parser.parse_args().url.rstrip("/")
    results: list[tuple[bool, str]] = []

    def check(ok: bool, msg: str) -> None:
        results.append((ok, msg))
        print(("PASS " if ok else "FAIL ") + msg)

    host = urllib.parse.urlsplit(base)
    check(host.scheme == "https", "URL uses HTTPS (Copilot Studio cannot reach plain HTTP or loopback)")

    try:
        code, body = fetch(base + "/.well-known/oauth-protected-resource")
        pr = json.loads(body) if code == 200 else {}
        check(code == 200 and bool(pr.get("authorization_servers")), "protected-resource metadata published")

        code, body = fetch(base + "/.well-known/oauth-authorization-server")
        meta = json.loads(body) if code == 200 else {}
        check(code == 200, "authorization-server metadata published")
        check("S256" in meta.get("code_challenge_methods_supported", []), "PKCE S256 supported")
        check(bool(meta.get("registration_endpoint")), "dynamic client registration advertised")
        endpoints = [meta.get(k, "") for k in ("authorization_endpoint", "token_endpoint", "registration_endpoint")]
        check(all(e.startswith("https://") for e in endpoints), "all OAuth endpoints are public HTTPS URLs")
        check(urllib.parse.urlsplit(meta.get("issuer", "")).netloc == host.netloc,
              "issuer matches the host you are testing (set AI_BRIDGE_OAUTH_ISSUER)")

        if meta.get("registration_endpoint"):
            code, _ = fetch(meta["registration_endpoint"],
                            json.dumps({"redirect_uris": ["http://evil.example/cb"]}).encode(),
                            {"Content-Type": "application/json"})
            check(code == 400, "registration rejects insecure redirect URI")

        code, _ = fetch(base + "/mcp")
        check(code in (401, 403), f"/mcp refuses unauthenticated access (got HTTP {code})")
    except Exception as exc:  # network/JSON failure
        check(False, f"could not complete checks: {exc}")

    failed = sum(not ok for ok, _ in results)
    print(f"\n{len(results) - failed}/{len(results)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
