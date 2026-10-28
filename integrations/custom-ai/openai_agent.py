"""Autonomous OpenAI Agent with AI Bridge Fleet Integration.

Connects OpenAI GPT-4o (or any OpenAI model) to your AI Bridge computer fleet.
The agent decides which tools to call, executes them against Windows workstations
or Linux servers, inspects results, and answers the user.

Requirements:
    pip install openai

Usage:
    export OPENAI_API_KEY="sk-..."
    export AI_BRIDGE_URL="https://jxiptvplayer.app"
    export AI_BRIDGE_TOKEN="your-admin-or-session-token"
    python openai_agent.py "Take a screenshot of windows-pc, then check disk space on ubuntu"
"""
import json
import os
import sys

# Ensure local package can be imported if running from repo
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "src")))

from ai_bridge import AIBridgeClient


def run_agent_loop(user_instruction: str, max_turns: int = 8):
    try:
        from openai import OpenAI
    except ImportError:
        print("[!] Error: 'openai' package is required. Install via: pip install openai")
        sys.exit(1)

    openai_key = os.environ.get("OPENAI_API_KEY")
    if not openai_key:
        print("[!] Error: OPENAI_API_KEY environment variable is not set.")
        sys.exit(1)

    bridge_url = os.environ.get("AI_BRIDGE_URL", "https://jxiptvplayer.app")
    bridge_token = os.environ.get("AI_BRIDGE_TOKEN") or os.environ.get("AI_BRIDGE_ADMIN_TOKEN", "")

    print(f"[*] Initializing AI Bridge client ({bridge_url})...")
    bridge = AIBridgeClient(base_url=bridge_url, token=bridge_token)

    # 1. Fetch available devices and tools
    devices = bridge.list_devices()
    dev_summary = ", ".join([f"{d.get('name')} ({d.get('os')})" for d in devices])
    print(f"[*] Connected fleet devices: {dev_summary}")

    tools = bridge.get_tools(format="openai")
    print(f"[*] Loaded {len(tools)} device tools.")

    openai_client = OpenAI(api_key=openai_key)

    system_prompt = (
        f"You are an autonomous computer fleet engineer connected to machines via AI Bridge.\n"
        f"Available Fleet Devices: {dev_summary}\n\n"
        f"Capabilities:\n"
        f"- To run commands on Linux or Windows, call 'run_shell' with device='<device_name>'.\n"
        f"- To capture the screen of a Windows machine, call 'take_screenshot' with device='windows-pc'.\n"
        f"- To click or type, call 'mouse_click', 'keyboard_type', etc.\n"
        f"- To read or edit files, call 'read_file' or 'write_file'.\n"
        f"Always check output and give a clear summary of what you did."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_instruction},
    ]

    print(f"\n[>] User Prompt: '{user_instruction}'\n")

    for turn in range(1, max_turns + 1):
        print(f"--- Turn {turn} (Calling OpenAI) ---")
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=tools,
            tool_choice="auto",
        )

        msg = response.choices[0].message
        tool_calls = msg.tool_calls

        if not tool_calls:
            print("\n[=] Final Answer from AI:")
            print(msg.content)
            return msg.content

        # Append assistant's thoughts/tool calls
        messages.append(msg)

        # Execute each requested tool call
        for tc in tool_calls:
            fn_name = tc.function.name
            try:
                fn_args = json.loads(tc.function.arguments)
            except Exception:
                fn_args = {}

            target_dev = fn_args.pop("device", None)
            print(f"[*] Executing Tool: {fn_name}(target={target_dev}, args={fn_args})")

            try:
                result = bridge.execute(tool=fn_name, device=target_dev, args=fn_args)
                result_str = json.dumps(result)
                print(f"    [+] Tool output ({len(result_str)} chars): {result_str[:120]}...")
            except Exception as exc:
                result_str = json.dumps({"error": str(exc)})
                print(f"    [-] Tool failed: {exc}")

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "name": fn_name,
                "content": result_str,
            })

    print("[!] Reached maximum conversation turns.")


if __name__ == "__main__":
    prompt = sys.argv[1] if len(sys.argv) > 1 else "List open windows on windows-pc and check uname on ubuntu"
    run_agent_loop(prompt)
