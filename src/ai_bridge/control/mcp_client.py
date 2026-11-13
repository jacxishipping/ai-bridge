"""Client connector for external Model Context Protocol (MCP) servers.

Supports:
- HTTP JSON-RPC 2.0 and Streamable HTTP (FastMCP / MCP Spec 2024-11-05+)
- Tool discovery (tools/list)
- Synchronous and asynchronous tool execution (tools/call)
- Schema adaptation to OpenAI and Anthropic Claude tool calling formats
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

logger = logging.getLogger("ai_bridge.mcp_client")


def _build_headers(
    auth_header: str = "",
    auth_token: str = "",
    extra_headers: dict[str, str] | None = None,
) -> dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream, */*",
        "User-Agent": "AI-Bridge-MCP-Client/0.3",
    }
    if auth_token:
        header_name = auth_header.strip() if auth_header and auth_header.strip() else "Authorization"
        val = auth_token.strip()
        if header_name.lower() == "authorization" and not val.lower().startswith("bearer "):
            headers[header_name] = f"Bearer {val}"
        else:
            headers[header_name] = val

    if extra_headers:
        for k, v in extra_headers.items():
            if k and v:
                headers[k] = str(v)
    return headers


def _parse_mcp_response(raw_text: str) -> dict[str, Any]:
    """Parse JSON or SSE (event: message\ndata: {...}) MCP response payload."""
    clean = raw_text.strip()
    if not clean:
        return {}

    # Check for Server-Sent Events stream format
    if "data:" in clean:
        lines = clean.splitlines()
        for line in lines:
            line_s = line.strip()
            if line_s.startswith("data:"):
                payload_str = line_s[5:].strip()
                try:
                    return json.loads(payload_str)
                except Exception:
                    continue

    try:
        return json.loads(clean)
    except Exception:
        return {"raw": clean}


def fetch_mcp_tools(
    url: str,
    auth_header: str = "",
    auth_token: str = "",
    extra_headers: dict[str, str] | None = None,
    timeout: float = 12.0,
) -> tuple[bool, list[dict[str, Any]], str]:
    """Discover tools from an external MCP server via tools/list.

    Returns:
        (success, tools_list, status_message)
    """
    clean_url = (url or "").strip()
    if not clean_url:
        return False, [], "MCP Server URL cannot be empty."
    if not (clean_url.startswith("http://") or clean_url.startswith("https://")):
        return False, [], "MCP Server URL must start with http:// or https://"

    headers = _build_headers(auth_header, auth_token, extra_headers)

    rpc_body = {
        "jsonrpc": "2.0",
        "id": "tools-list-probe",
        "method": "tools/list",
        "params": {},
    }

    # Try primary endpoint, and fall back to /mcp if 404
    candidate_urls = [clean_url]
    if not clean_url.rstrip("/").endswith("/mcp"):
        candidate_urls.append(f"{clean_url.rstrip('/')}/mcp")

    last_error = ""
    for target_url in candidate_urls:
        try:
            req = urllib.request.Request(
                target_url,
                data=json.dumps(rpc_body).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                resp_text = resp.read().decode("utf-8", errors="replace")
                data = _parse_mcp_response(resp_text)

                if "error" in data:
                    err_msg = data["error"].get("message") if isinstance(data["error"], dict) else str(data["error"])
                    return False, [], f"MCP server returned error: {err_msg}"

                result = data.get("result", data)
                raw_tools = []
                if isinstance(result, dict):
                    raw_tools = result.get("tools", [])
                elif isinstance(result, list):
                    raw_tools = result

                normalized_tools = []
                for t in raw_tools:
                    if not isinstance(t, dict):
                        continue
                    name = t.get("name") or ""
                    if not name:
                        continue
                    normalized_tools.append({
                        "name": name,
                        "description": t.get("description") or f"MCP tool: {name}",
                        "inputSchema": t.get("inputSchema") or {"type": "object", "properties": {}},
                    })

                count = len(normalized_tools)
                return True, normalized_tools, f"Connected successfully. Found {count} tool{'s' if count != 1 else ''}."
        except urllib.error.HTTPError as err:
            err_msg = err.read().decode("utf-8", errors="replace") if err.fp else str(err)
            last_error = f"HTTP {err.code}: {err_msg[:180]}"
            if err.code in (401, 403):
                return False, [], f"Authentication rejected by MCP server ({last_error})"
        except Exception as exc:
            last_error = str(exc)

    return False, [], f"Could not connect to MCP server: {last_error}"


def execute_mcp_tool(
    url: str,
    tool_name: str,
    arguments: dict[str, Any],
    auth_header: str = "",
    auth_token: str = "",
    extra_headers: dict[str, str] | None = None,
    timeout: float = 60.0,
) -> dict[str, Any]:
    """Execute a tool on an external MCP server via tools/call.

    Returns structured execution result.
    """
    clean_url = (url or "").strip()
    headers = _build_headers(auth_header, auth_token, extra_headers)

    rpc_body = {
        "jsonrpc": "2.0",
        "id": f"call-{tool_name}",
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments or {},
        },
    }

    candidate_urls = [clean_url]
    if not clean_url.rstrip("/").endswith("/mcp"):
        candidate_urls.append(f"{clean_url.rstrip('/')}/mcp")

    last_error = ""
    for target_url in candidate_urls:
        try:
            req = urllib.request.Request(
                target_url,
                data=json.dumps(rpc_body).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                resp_text = resp.read().decode("utf-8", errors="replace")
                data = _parse_mcp_response(resp_text)

                if "error" in data:
                    err_msg = data["error"].get("message") if isinstance(data["error"], dict) else str(data["error"])
                    return {"ok": False, "error": f"MCP tool error: {err_msg}"}

                result = data.get("result", data)
                # Parse MCP content format (e.g. content: [{"type": "text", "text": "..."}])
                if isinstance(result, dict) and "content" in result and isinstance(result["content"], list):
                    text_parts = []
                    images = []
                    for item in result["content"]:
                        if isinstance(item, dict):
                            if item.get("type") == "text":
                                text_parts.append(item.get("text", ""))
                            elif item.get("type") == "image":
                                images.append(item)
                    full_text = "\n".join(text_parts).strip()
                    is_err = bool(result.get("isError", False))
                    out = {"ok": not is_err, "result": full_text or result}
                    if images:
                        out["images"] = images
                    return out

                return {"ok": True, "result": result}
        except urllib.error.HTTPError as err:
            err_msg = err.read().decode("utf-8", errors="replace") if err.fp else str(err)
            last_error = f"HTTP {err.code}: {err_msg[:200]}"
            if err.code in (401, 403):
                return {"ok": False, "error": f"MCP authentication error: {last_error}"}
        except Exception as exc:
            last_error = str(exc)

    return {"ok": False, "error": f"Failed to execute MCP tool '{tool_name}': {last_error}"}


def format_mcp_tool_for_llm(
    mcp_tool: dict[str, Any],
    server_id: str,
    server_name: str,
    tool_format: str = "openai",
) -> dict[str, Any]:
    """Adapt an MCP tool schema into an OpenAI or Anthropic tool spec.

    Prefixes the tool name so the model can identify the external MCP service.
    Example: `mcp__github__create_issue` or `mcp__slack__post_message`.
    """
    clean_srv = "".join(c if c.isalnum() else "_" for c in server_name.lower().strip())
    raw_name = mcp_tool.get("name") or "tool"
    qualified_name = f"mcp__{clean_srv}__{raw_name}"

    desc = mcp_tool.get("description") or f"Tool provided by MCP service '{server_name}'"
    schema = mcp_tool.get("inputSchema") or {"type": "object", "properties": {}}

    if tool_format == "openai":
        return {
            "type": "function",
            "function": {
                "name": qualified_name,
                "description": f"[MCP: {server_name}] {desc}",
                "parameters": schema,
            },
        }
    elif tool_format == "anthropic":
        return {
            "name": qualified_name,
            "description": f"[MCP: {server_name}] {desc}",
            "input_schema": schema,
        }
    else:
        return {
            "name": qualified_name,
            "raw_name": raw_name,
            "server_id": server_id,
            "server_name": server_name,
            "description": desc,
            "parameters": schema,
        }

