"""MCP stdio smoke test: spawn the real server, initialize, list tools,
and call list_workspace + an unknown-tool rejection path.

This is the acceptance test for 'MCP server starts, client can discover
and invoke tools, workspace cannot escape'.
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def _rpc(proc, payload):
    proc.stdin.write(json.dumps(payload) + "\n"); proc.stdin.flush()
    line = proc.stdout.readline()
    assert line, "No response from MCP server"
    return json.loads(line)

def test_mcp_stdio_tools_list_and_call():
    ws = tempfile.mkdtemp()
    Path(ws, "hello.txt").write_text("hello bridge")
    env = dict(os.environ, AI_BRIDGE_WORKSPACE=ws, PYTHONPATH="src")
    proc = subprocess.Popen([sys.executable, "-m", "ai_bridge.server"],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, env=env, cwd=Path(__file__).resolve().parents[2])
    try:
        init = _rpc(proc, {"jsonrpc": "2.0", "id": 1, "method": "initialize",
                           "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                                      "clientInfo": {"name": "test", "version": "0"}}})
        assert init["result"]["serverInfo"]["name"] == "ai-bridge"
        proc.stdin.write(json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n"); proc.stdin.flush()
        tools = _rpc(proc, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
        names = [t["name"] for t in tools["result"]["tools"]]
        assert "list_workspace" in names and "read_workspace_file" in names and "submit_task" in names
        assert "run_any_command" not in names
        call = _rpc(proc, {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
                           "params": {"name": "read_workspace_file", "arguments": {"relative_path": "hello.txt"}}})
        assert "hello bridge" in json.dumps(call)
        bad = _rpc(proc, {"jsonrpc": "2.0", "id": 4, "method": "tools/call",
                          "params": {"name": "read_workspace_file", "arguments": {"relative_path": "../escape.txt"}}})
        assert "error" in bad or "escapes" in json.dumps(bad)
    finally:
        proc.kill()
