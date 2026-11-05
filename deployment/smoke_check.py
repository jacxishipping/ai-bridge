"""Read-only deployed-service checks. No tokens, credentials or mutations.

Usage: python deployment/smoke_check.py https://your-control-plane.example
Exit nonzero when readiness, authentication boundaries, or the branded UI fail.
This deliberately does not claim to validate Google login or agent execution.
"""
import argparse
import json
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    args = parser.parse_args()
    parsed = urllib.parse.urlsplit(args.url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        parser.error("Use an HTTP(S) base URL without credentials, query or fragment.")
    base = args.url.rstrip("/")
    opener = urllib.request.build_opener(NoRedirect)
    failed = False
    for path, expected in [("/health/live", 200), ("/health/ready", 200), ("/api/auth/me", 401), ("/api/auth/oidc/configured", 200), ("/", 200)]:
        try:
            try:
                response = opener.open(base + path, timeout=20)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                body = response.read(512_000)
                valid = response.code == expected
                if path == "/" and valid:
                    valid = b"brand-mark.svg" in body
                elif path == "/api/auth/oidc/configured" and valid:
                    valid = isinstance(json.loads(body).get("enabled"), bool)
                print(f"{'PASS' if valid else 'FAIL'} {path}: HTTP {response.code}")
                failed |= not valid
        except Exception as error:
            # Exceptions may contain URLs. Never log their contents.
            print(f"FAIL {path}: {type(error).__name__}")
            failed = True
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
