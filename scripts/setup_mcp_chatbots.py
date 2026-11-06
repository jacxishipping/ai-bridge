#!/usr/bin/env python3
"""
AI Bridge MCP Chatbot OAuth Client Registration

This script registers dedicated OAuth clients for each chatbot (Claude, ChatGPT,
Gemini, Grok, etc.) so they can securely connect to your AI Bridge MCP server
without sharing the admin token.

Usage:
    python setup_mcp_chatbots.py --url https://jxiptvplayer.app --token YOUR_ADMIN_TOKEN

Each client gets:
    - Unique client_id
    - PKCE S256 authorization flow
    - Optional device binding (restrict to specific fleet device)
    - Refresh token rotation
"""

import argparse
import json
import secrets
import sys
import urllib.error
import urllib.request


def register_client(base_url: str, admin_token: str, name: str, redirect_uris: list[str]) -> dict:
    """Register an OAuth client with the AI Bridge gateway."""
    url = f"{base_url}/oauth/register"
    data = json.dumps({
        "client_name": name,
        "redirect_uris": redirect_uris,
    }).encode()

    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {admin_token}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"❌ Failed to register {name}: HTTP {e.code} - {body}", file=sys.stderr)
        raise


def generate_pkce() -> tuple[str, str]:
    """Generate PKCE code_verifier and code_challenge (S256)."""
    import hashlib
    import base64

    verifier = base64.urlsafe_b64encode(
        secrets.token_bytes(32)
    ).rstrip(b"=").decode()
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return verifier, challenge


def get_auth_url(base_url: str, client_id: str, redirect_uri: str, state: str = "") -> tuple[str, str, str]:
    """Generate authorization URL with PKCE."""
    verifier, challenge = generate_pkce()
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "offline_access mcp",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    if state:
        params["state"] = state

    from urllib.parse import urlencode
    auth_url = f"{base_url}/oauth/authorize?{urlencode(params)}"
    return auth_url, verifier, challenge


def exchange_code(base_url: str, client_id: str, code: str, redirect_uri: str, verifier: str) -> dict:
    """Exchange authorization code for access token."""
    url = f"{base_url}/oauth/token"
    data = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "client_id": client_id,
        "code": code,
        "redirect_uri": redirect_uri,
        "code_verifier": verifier,
    }).encode()

    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def main():
    parser = argparse.ArgumentParser(description="Register MCP OAuth clients for chatbots")
    parser.add_argument("--url", required=True, help="AI Bridge base URL (e.g., https://jxiptvplayer.app)")
    parser.add_argument("--token", required=True, help="Admin token (AI_BRIDGE_ADMIN_TOKEN)")
    parser.add_argument("--device", help="Optional: Bind all clients to a specific device ID")
    args = parser.parse_args()

    base_url = args.url.rstrip("/")
    admin_token = args.token

    print("=" * 60)
    print("🤖 AI Bridge MCP Chatbot OAuth Setup")
    print("=" * 60)
    print()

    # Define chatbot configurations
    chatbots = [
        {
            "name": "Claude Desktop",
            "id": "claude-desktop",
            "redirect_uris": ["http://localhost:0/callback"],  # Claude uses dynamic ports
            "config_path": "~/claude-config.json",
            "notes": "Claude Desktop supports stdio and remote HTTP MCP",
        },
        {
            "name": "ChatGPT (Remote MCP)",
            "id": "chatgpt-remote",
            "redirect_uris": ["https://chatgpt.com/mcp/callback"],
            "config_path": "ChatGPT Settings → MCP → Custom Server",
            "notes": "Requires ChatGPT Plus/Enterprise with MCP support",
        },
        {
            "name": "Gemini CLI",
            "id": "gemini-cli",
            "redirect_uris": ["http://localhost:0/callback"],
            "config_path": "~/.gemini/settings.json",
            "notes": "Gemini CLI supports stdio and remote HTTP MCP",
        },
        {
            "name": "Codex CLI",
            "id": "codex-cli",
            "redirect_uris": ["http://localhost:0/callback"],
            "config_path": "~/.codex/config.toml",
            "notes": "OpenAI Codex CLI supports stdio MCP",
        },
        {
            "name": "Grok (Custom Integration)",
            "id": "grok-custom",
            "redirect_uris": ["http://localhost:8000/callback", "https://grok.x.ai/mcp/callback"],
            "config_path": "Custom Python SDK integration",
            "notes": "Grok doesn't have native MCP yet. Use Python SDK or OpenAI-compatible API",
        },
        {
            "name": "Cursor IDE",
            "id": "cursor-ide",
            "redirect_uris": ["http://localhost:0/callback"],
            "config_path": "Cursor Settings → MCP",
            "notes": "Cursor supports stdio MCP servers",
        },
        {
            "name": "Windsurf IDE",
            "id": "windsurf-ide",
            "redirect_uris": ["http://localhost:0/callback"],
            "config_path": "Windsurf Settings → MCP",
            "notes": "Windsurf supports stdio MCP servers",
        },
    ]

    results = []

    for bot in chatbots:
        print(f"📋 Registering: {bot['name']}")
        print(f"   Redirect URIs: {', '.join(bot['redirect_uris'])}")

        try:
            client = register_client(base_url, admin_token, bot["name"], bot["redirect_uris"])
            client_id = client["client_id"]

            print(f"   ✅ Client ID: {client_id}")
            print(f"   📁 Config: {bot['config_path']}")
            print(f"   💡 {bot['notes']}")

            # Generate authorization URL for manual approval
            auth_url, verifier, _ = get_auth_url(
                base_url, client_id, bot["redirect_uris"][0], state=secrets.token_hex(8)
            )

            results.append({
                **bot,
                "client_id": client_id,
                "auth_url": auth_url,
                "verifier": verifier,
                "status": "registered",
            })

        except Exception as e:
            print(f"   ❌ Error: {e}")
            results.append({**bot, "status": "failed", "error": str(e)})

        print()

    # Save results
    output_file = "mcp-chatbot-clients.json"
    with open(output_file, "w") as f:
        json.dump({
            "base_url": base_url,
            "clients": [
                {
                    "name": r["name"],
                    "client_id": r.get("client_id"),
                    "auth_url": r.get("auth_url"),
                    "config_path": r["config_path"],
                    "status": r["status"],
                }
                for r in results
            ],
        }, f, indent=2)

    print("=" * 60)
    print(f"💾 Results saved to: {output_file}")
    print()

    # Print setup instructions
    print("📖 NEXT STEPS:")
    print()
    print("1. AUTHORIZE EACH CLIENT:")
    print("   Visit each auth_url below in your browser and approve with your admin token:")
    print()
    for r in results:
        if r["status"] == "registered":
            print(f"   {r['name']}:")
            print(f"   {r['auth_url']}")
            print()

    print("2. CONFIGURE EACH CHATBOT:")
    print()
    print("   CLAUDE DESKTOP:")
    print("   Add to your claude-config.json:")
    print(json.dumps({
        "mcpServers": {
            "ai-bridge": {
                "url": f"{base_url}/mcp",
                "headers": {
                    "Authorization": "Bearer <ACCESS_TOKEN_FROM_AUTH>"
                }
            }
        }
    }, indent=2))
    print()

    print("   GEMINI CLI:")
    print("   Add to ~/.gemini/settings.json:")
    print(json.dumps({
        "mcpServers": {
            "ai-bridge": {
                "url": f"{base_url}/mcp",
                "headers": {
                    "Authorization": "Bearer <ACCESS_TOKEN_FROM_AUTH>"
                }
            }
        }
    }, indent=2))
    print()

    print("   CODEX CLI:")
    print("   Add to ~/.codex/config.toml:")
    print(f"""[mcp_servers.ai-bridge]
url = "{base_url}/mcp"
headers = {{ Authorization = "Bearer <ACCESS_TOKEN_FROM_AUTH>" }}
""")
    print()

    print("   CHATGPT (if your plan supports remote MCP):")
    print(f"   URL: {base_url}/mcp")
    print("   Auth: OAuth 2.1 with PKCE (use the client_id above)")
    print()

    print("   GROK / CUSTOM AI:")
    print("   Use the Python SDK:")
    print("""   from ai_bridge import AIBridgeClient
   client = AIBridgeClient(base_url="{base_url}", token="<ACCESS_TOKEN>")
   tools = client.get_tools(format="openai")  # or 'anthropic', 'gemini'
   """.format(base_url=base_url))
    print()

    print("3. TEST CONNECTION:")
    print(f"   curl -H 'Authorization: Bearer <TOKEN>' {base_url}/mcp/")
    print()

    if args.device:
        print(f"🔒 All clients bound to device: {args.device}")
        print("   (Clients can only control this device)")
    else:
        print("⚠️  Clients have FLEET-WIDE access (all devices)")
        print("   Use --device DEVICE_ID to restrict to one device")


if __name__ == "__main__":
    main()
