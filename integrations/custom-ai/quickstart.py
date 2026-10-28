"""AI Bridge Quickstart — Connect custom Python code to your computer fleet.

Run commands on Linux servers, capture screenshots and control mouse/keyboard
on Windows workstations, and query device status.

Usage:
    export AI_BRIDGE_URL="https://jxiptvplayer.app"
    export AI_BRIDGE_TOKEN="your-admin-or-session-token"
    python quickstart.py
"""
import os
import sys

# Ensure local package can be imported if running from repo
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "src")))

from ai_bridge import AIBridgeClient


def main():
    base_url = os.environ.get("AI_BRIDGE_URL", "https://jxiptvplayer.app")
    token = os.environ.get("AI_BRIDGE_TOKEN") or os.environ.get("AI_BRIDGE_ADMIN_TOKEN")

    if not token:
        print("[!] Warning: AI_BRIDGE_TOKEN environment variable is not set.")
        print("    Pass your token via: export AI_BRIDGE_TOKEN='...' or AIBridgeClient(token='...')")
        print("    Using default unauthenticated connection for preview.")

    print(f"[*] Connecting to AI Bridge at {base_url}...")
    client = AIBridgeClient(base_url=base_url, token=token)

    # 1. Discover Fleet Devices
    print("\n[1] Discovering fleet devices...")
    try:
        devices = client.list_devices()
        print(f"    Found {len(devices)} device(s):")
        for d in devices:
            caps = d.get("capabilities", {})
            cap_list = [k for k, v in caps.items() if v]
            print(f"    - {d.get('name')} (ID: {d.get('id')}, OS: {d.get('os')}, Status: {d.get('status')})")
            print(f"      Capabilities: {', '.join(cap_list)}")
    except Exception as exc:
        print(f"    Could not list devices: {exc}")

    # 2. Get Available AI Tools
    print("\n[2] Fetching AI Tools Catalog (OpenAI Format)...")
    try:
        openai_tools = client.get_tools(format="openai")
        print(f"    Retrieved {len(openai_tools)} tools ready for OpenAI function calling:")
        for t in openai_tools[:5]:
            fn = t["function"]
            print(f"    - {fn['name']}: {fn['description'][:70]}...")
        if len(openai_tools) > 5:
            print(f"    ... and {len(openai_tools) - 5} more tools.")
    except Exception as exc:
        print(f"    Could not fetch tools: {exc}")

    # 3. Execute Command on Linux Server (e.g. ubuntu)
    print("\n[3] Executing command on Linux Server ('ubuntu')...")
    try:
        res = client.execute("run_shell", device="ubuntu", args={"command": "uptime"})
        print(f"    Status: {res.get('status')}")
        print(f"    Output: {res.get('result')}")
    except Exception as exc:
        print(f"    Execution note: {exc}")

    # 4. Capture Windows Desktop Screenshot
    print("\n[4] Capturing screenshot on Windows Workstation ('windows-pc')...")
    try:
        shot = client.take_screenshot(device="windows-pc", quality=50)
        width = shot.get("width")
        height = shot.get("height")
        b64_len = len(shot.get("screenshot", ""))
        print(f"    Resolution: {width}x{height} px")
        print(f"    Screenshot data length: {b64_len} base64 chars")
    except Exception as exc:
        print(f"    Screenshot note: {exc}")

    # 5. Run Natural Language Instruction via AI Agent
    print("\n[5] Running high-level natural language instruction...")
    try:
        agent_res = client.run_agent("Check disk space on ubuntu and report free gigabytes")
        print(f"    Agent Response: {agent_res.get('response')}")
        print(f"    Steps taken: {len(agent_res.get('steps', []))}")
    except Exception as exc:
        print(f"    Agent note: {exc}")

    print("\n[+] Quickstart complete! See openai_agent.py and anthropic_agent.py for full LLM integration.")


if __name__ == "__main__":
    main()
