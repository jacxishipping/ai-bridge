"""Local AI Agent using Ollama and AI Bridge.

Runs 100% locally and privately without external cloud API keys.
Ollama (e.g. Llama 3, Mistral, Qwen) controls your computer fleet through AI Bridge.

Requirements:
    Ollama running on http://localhost:11434 (ollama run llama3.2)
    pip install ollama

Usage:
    export AI_BRIDGE_URL="https://jxiptvplayer.app"
    export AI_BRIDGE_TOKEN="your-admin-or-session-token"
    python ollama_local_agent.py "Check free memory on ubuntu and screenshot windows-pc"
"""
import json
import os
import sys

# Ensure local package can be imported if running from repo
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "src")))

from ai_bridge import AIBridgeClient


def main():
    try:
        import ollama
    except ImportError:
        print("[!] Install the official ollama package: pip install ollama")
        sys.exit(1)

    prompt = sys.argv[1] if len(sys.argv) > 1 else "List all files in workspace on windows-pc"
    bridge_url = os.environ.get("AI_BRIDGE_URL", "https://jxiptvplayer.app")
    token = os.environ.get("AI_BRIDGE_TOKEN") or os.environ.get("AI_BRIDGE_ADMIN_TOKEN", "")

    client = AIBridgeClient(base_url=bridge_url, token=token)
    devices = client.list_devices()
    print(f"[*] Connected devices: {[d.get('name') for d in devices]}")

    # Convert AI Bridge tools to Ollama function format
    tools_openai = client.get_tools(format="openai")

    print(f"\n[>] Instructing Local Ollama: '{prompt}'...")
    response = ollama.chat(
        model="llama3.2",
        messages=[{"role": "user", "content": prompt}],
        tools=tools_openai,
    )

    msg = response.get("message", {})
    tool_calls = msg.get("tool_calls") or []

    if not tool_calls:
        print("\n[=] Ollama Response:\n", msg.get("content"))
        return

    print(f"[*] Ollama decided to call {len(tool_calls)} tool(s):")
    for tc in tool_calls:
        fn = tc.get("function", {})
        fn_name = fn.get("name")
        fn_args = fn.get("arguments", {})
        dev = fn_args.pop("device", None)
        print(f"    - Calling {fn_name} on device '{dev}'...")
        res = client.execute(fn_name, device=dev, args=fn_args)
        print(f"      Result: {str(res)[:150]}...")


if __name__ == "__main__":
    main()
