"""LangChain Integration for AI Bridge Computer Fleet.

Exposes AI Bridge device tools as LangChain StructuredTools so you can use
LangGraph, CrewAI, AutoGen, or LangChain agents to control your computers.

Requirements:
    pip install langchain langchain-openai langchain-core

Usage:
    export OPENAI_API_KEY="sk-..."
    export AI_BRIDGE_URL="https://jxiptvplayer.app"
    export AI_BRIDGE_TOKEN="your-token"
    python langchain_agent.py
"""
import os
import sys

# Ensure local package can be imported if running from repo
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "src")))

from ai_bridge import AIBridgeClient


def create_ai_bridge_langchain_tools(client: AIBridgeClient):
    """Dynamically converts AI Bridge tool specifications into LangChain StructuredTools."""
    try:
        from langchain_core.tools import StructuredTool
        from pydantic import create_model
    except ImportError:
        print("[!] Error: 'langchain-core' is required. Install via: pip install langchain-core")
        return []

    tools_raw = client.get_tools(format="raw")
    lc_tools = []

    for t in tools_raw:
        name = t["name"]
        description = t["description"]
        params = t.get("parameters", {})
        properties = params.get("properties", {})

        # Create tool closure
        def make_func(tool_name):
            def run_tool(**kwargs):
                device = kwargs.pop("device", None)
                res = client.execute(tool=tool_name, device=device, args=kwargs)
                return res.get("result") or res
            return run_tool

        lc_tools.append(
            StructuredTool.from_function(
                func=make_func(name),
                name=name,
                description=description,
            )
        )

    return lc_tools


def main():
    bridge_url = os.environ.get("AI_BRIDGE_URL", "https://jxiptvplayer.app")
    token = os.environ.get("AI_BRIDGE_TOKEN") or os.environ.get("AI_BRIDGE_ADMIN_TOKEN", "")

    client = AIBridgeClient(base_url=bridge_url, token=token)
    lc_tools = create_ai_bridge_langchain_tools(client)

    print(f"[*] Created {len(lc_tools)} LangChain StructuredTools from AI Bridge fleet.")
    for t in lc_tools[:5]:
        print(f"    - {t.name}: {t.description[:60]}...")

    print("\n[+] These tools can be passed directly to create_react_agent or CrewAI Agent(tools=lc_tools).")


if __name__ == "__main__":
    main()
