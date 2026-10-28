"""Autonomous Anthropic Claude Agent with AI Bridge Fleet Integration.

Connects Claude 3.5 Sonnet (or any Claude model) to your AI Bridge computer fleet.

Requirements:
    pip install anthropic

Usage:
    export ANTHROPIC_API_KEY="sk-ant-..."
    export AI_BRIDGE_URL="https://jxiptvplayer.app"
    export AI_BRIDGE_TOKEN="your-admin-or-session-token"
    python anthropic_agent.py "Check active processes on ubuntu and screenshot windows-pc"
"""
import json
import os
import sys

# Ensure local package can be imported if running from repo
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "src")))

from ai_bridge import AIBridgeClient


def run_claude_agent(prompt: str, max_turns: int = 8):
    try:
        from anthropic import Anthropic
    except ImportError:
        print("[!] Error: 'anthropic' package is required. Install via: pip install anthropic")
        sys.exit(1)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[!] Error: ANTHROPIC_API_KEY environment variable is not set.")
        sys.exit(1)

    bridge_url = os.environ.get("AI_BRIDGE_URL", "https://jxiptvplayer.app")
    bridge_token = os.environ.get("AI_BRIDGE_TOKEN") or os.environ.get("AI_BRIDGE_ADMIN_TOKEN", "")

    bridge = AIBridgeClient(base_url=bridge_url, token=bridge_token)
    devices = bridge.list_devices()
    dev_names = ", ".join([d.get("name") for d in devices])
    print(f"[*] AI Bridge connected to fleet: {dev_names}")

    # Load Anthropic-formatted tools
    tools = bridge.get_tools(format="anthropic")
    print(f"[*] Loaded {len(tools)} Claude tools.")

    claude = Anthropic(api_key=api_key)

    system_prompt = (
        f"You are an autonomous computer systems engineer controlling a fleet of computers via AI Bridge.\n"
        f"Fleet devices: {dev_names}\n"
        f"You can execute shell commands, manage files, capture Windows screens, and interact via mouse/keyboard."
    )

    messages = [
        {"role": "user", "content": prompt}
    ]

    print(f"\n[>] User Instruction: '{prompt}'\n")

    for turn in range(1, max_turns + 1):
        print(f"--- Turn {turn} (Calling Claude 3.5 Sonnet) ---")
        response = claude.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=4096,
            system=system_prompt,
            messages=messages,
            tools=tools,
        )

        tool_uses = [block for block in response.content if block.type == "tool_use"]
        text_blocks = [block for block in response.content if block.type == "text"]

        if text_blocks:
            for tb in text_blocks:
                print(f"[Claude Thought]: {tb.text.strip()}")

        if not tool_uses or response.stop_reason == "end_turn":
            print("\n[=] Final Response from Claude:")
            for tb in text_blocks:
                print(tb.text)
            return

        # Add assistant response to history
        messages.append({"role": "assistant", "content": response.content})

        # Process tool calls
        tool_results = []
        for tu in tool_uses:
            tool_name = tu.name
            tool_args = dict(tu.input)
            target_device = tool_args.pop("device", None)

            print(f"[*] Executing Tool: {tool_name} on device='{target_device}' args={tool_args}")
            try:
                out = bridge.execute(tool=tool_name, device=target_device, args=tool_args)
                out_content = json.dumps(out)
                print(f"    [+] Output: {out_content[:120]}...")
            except Exception as exc:
                out_content = json.dumps({"error": str(exc)})
                print(f"    [-] Failed: {exc}")

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tu.id,
                "content": out_content,
            })

        messages.append({"role": "user", "content": tool_results})


if __name__ == "__main__":
    p = sys.argv[1] if len(sys.argv) > 1 else "List docker containers on ubuntu and get screen size on windows-pc"
    run_claude_agent(p)
