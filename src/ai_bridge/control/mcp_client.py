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


def _extract_jsonrpc_dict(parsed: Any) -> dict[str, Any] | None:
    """Return a JSON-RPC dict from a parsed JSON object or batch array."""
    if isinstance(parsed, dict):
        return parsed
    if isinstance(parsed, list):
        dicts = [item for item in parsed if isinstance(item, dict)]
        for item in dicts:
            if "result" in item or "error" in item:
                return item
        if dicts:
            return dicts[-1]
    return None


def _parse_mcp_response(raw_text: str) -> dict[str, Any]:
    """Parse JSON or SSE (event: message\\ndata: {...}) MCP response payload."""
    clean = raw_text.strip()
    if not clean:
        return {}

    # Try plain JSON first so JSON string values containing "data:" are never misparsed as SSE.
    if clean.startswith("{") or clean.startswith("["):
        try:
            picked = _extract_jsonrpc_dict(json.loads(clean))
            if picked is not None:
                return picked
        except Exception:
            pass

    # Parse Server-Sent Events stream (may emit multiple events; prefer the final JSON-RPC response).
    if "data:" in clean:
        events: list[dict[str, Any]] = []
        buf: list[str] = []
        for line in clean.splitlines():
            stripped = line.strip()
            if not stripped:
                if buf:
                    try:
                        picked = _extract_jsonrpc_dict(json.loads("\n".join(buf)))
                        if picked is not None:
                            events.append(picked)
                    except Exception:
                        pass
                    buf = []
                continue
            if stripped.startswith("data:"):
                buf.append(stripped[5:].strip())
        if buf:
            try:
                picked = _extract_jsonrpc_dict(json.loads("\n".join(buf)))
                if picked is not None:
                    events.append(picked)
            except Exception:
                pass
        if events:
            for ev in reversed(events):
                if "result" in ev or "error" in ev:
                    return ev
            return events[-1]

    try:
        picked = _extract_jsonrpc_dict(json.loads(clean))
        return picked if picked is not None else {"raw": clean}
    except Exception:
        return {"raw": clean}


def _header_get(headers: Any, name: str) -> str:
    """Case-insensitive lookup on urllib/mock response headers."""
    if not headers:
        return ""
    if hasattr(headers, "get"):
        val = headers.get(name) or headers.get(name.lower())
        if val:
            return str(val).strip()
    if hasattr(headers, "items"):
        target = name.lower()
        for k, v in headers.items():
            if str(k).lower() == target and v:
                return str(v).strip()
    return ""


def _post_jsonrpc(
    target_url: str,
    rpc_body: dict[str, Any],
    headers: dict[str, str],
    timeout: float,
    session_id: str = "",
) -> tuple[int, str, dict[str, Any], str]:
    """Send a single JSON-RPC POST and return (status, session_id, parsed_body, err_text)."""
    req_headers = dict(headers)
    if session_id:
        req_headers["Mcp-Session-Id"] = session_id
    req = urllib.request.Request(
        target_url,
        data=json.dumps(rpc_body).encode("utf-8"),
        headers=req_headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            resp_text = resp.read().decode("utf-8", errors="replace")
            resp_sid = _header_get(getattr(resp, "headers", None), "Mcp-Session-Id")
            data = _parse_mcp_response(resp_text)
            status = int(getattr(resp, "status", 200) or 200)
            return status, resp_sid, data, ""
    except urllib.error.HTTPError as err:
        err_msg = err.read().decode("utf-8", errors="replace") if err.fp else str(err)
        return int(err.code), "", {}, err_msg


def _needs_session_handshake(status: int, data: dict[str, Any], err_msg: str) -> bool:
    """Return True when a Streamable HTTP server likely requires initialize + Mcp-Session-Id."""
    if status in (400, 406):
        return True
    if "error" in data:
        raw_err = data["error"].get("message") if isinstance(data["error"], dict) else str(data["error"])
        low = (raw_err or "").lower()
        return any(tok in low for tok in ("session", "initialize", "initialized"))
    low_http = (err_msg or "").lower()
    return any(tok in low_http for tok in ("session", "initialize", "initialized"))


def _init_streamable_session(
    target_url: str,
    headers: dict[str, str],
    timeout: float,
) -> tuple[bool, str]:
    """Perform MCP Streamable HTTP initialize + notifications/initialized handshake."""
    init_body = {
        "jsonrpc": "2.0",
        "id": "mcp-init",
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "ai-bridge-mcp-client", "version": "0.3.0"},
        },
    }
    status, sid, data, _ = _post_jsonrpc(target_url, init_body, headers, timeout)
    if not (200 <= status < 300) or "error" in data:
        return False, ""
    notif_body = {
        "jsonrpc": "2.0",
        "method": "notifications/initialized",
        "params": {},
    }
    _post_jsonrpc(target_url, notif_body, headers, min(timeout, 5.0), session_id=sid)
    return True, sid


def _close_streamable_session(target_url: str, headers: dict[str, str], session_id: str) -> None:
    """Best-effort session cleanup via HTTP DELETE for stateful Streamable HTTP servers."""
    if not session_id:
        return
    req_headers = dict(headers)
    req_headers["Mcp-Session-Id"] = session_id
    req = urllib.request.Request(target_url, headers=req_headers, method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=3.0):
            pass
    except Exception:
        pass


def _call_mcp_endpoint(
    url: str,
    rpc_body: dict[str, Any],
    auth_header: str = "",
    auth_token: str = "",
    extra_headers: dict[str, str] | None = None,
    timeout: float = 12.0,
) -> tuple[bool, dict[str, Any], str, bool]:
    """Execute a JSON-RPC call across candidate MCP endpoints, supporting stateful sessions.

    Returns:
        (http_ok, parsed_json, error_message, auth_rejected)
    """
    clean_url = (url or "").strip()
    if not clean_url:
        return False, {}, "MCP Server URL cannot be empty.", False
    if not (clean_url.startswith("http://") or clean_url.startswith("https://")):
        return False, {}, "MCP Server URL must start with http:// or https://", False

    headers = _build_headers(auth_header, auth_token, extra_headers)
    candidate_urls = [clean_url]
    if not clean_url.rstrip("/").endswith("/mcp"):
        candidate_urls.append(f"{clean_url.rstrip('/')}/mcp")

    last_error = ""
    for target_url in candidate_urls:
        try:
            status, _, data, err_msg = _post_jsonrpc(target_url, rpc_body, headers, timeout)
            if status in (401, 403):
                return False, {}, f"HTTP {status}: {err_msg[:200]}", True

            if (status >= 400 or "error" in data) and _needs_session_handshake(status, data, err_msg):
                init_ok, sid = _init_streamable_session(target_url, headers, timeout)
                if init_ok:
                    try:
                        status, _, data, err_msg = _post_jsonrpc(target_url, rpc_body, headers, timeout, session_id=sid)
                    finally:
                        _close_streamable_session(target_url, headers, sid)
                    if status in (401, 403):
                        return False, {}, f"HTTP {status}: {err_msg[:200]}", True

            if 200 <= status < 300:
                return True, data, "", False
            last_error = f"HTTP {status}: {err_msg[:200]}"
        except Exception as exc:
            last_error = str(exc)

    return False, {}, last_error, False


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
    rpc_body = {
        "jsonrpc": "2.0",
        "id": "tools-list-probe",
        "method": "tools/list",
        "params": {},
    }
    ok, data, err_msg, auth_rejected = _call_mcp_endpoint(
        url=url,
        rpc_body=rpc_body,
        auth_header=auth_header,
        auth_token=auth_token,
        extra_headers=extra_headers,
        timeout=timeout,
    )
    if not ok:
        if auth_rejected:
            return False, [], f"Authentication rejected by MCP server ({err_msg})"
        if err_msg.startswith("MCP Server URL"):
            return False, [], err_msg
        return False, [], f"Could not connect to MCP server: {err_msg}"

    if "error" in data:
        rpc_err = data["error"].get("message") if isinstance(data["error"], dict) else str(data["error"])
        return False, [], f"MCP server returned error: {rpc_err}"

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
    rpc_body = {
        "jsonrpc": "2.0",
        "id": f"call-{tool_name}",
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments or {},
        },
    }
    ok, data, err_msg, auth_rejected = _call_mcp_endpoint(
        url=url,
        rpc_body=rpc_body,
        auth_header=auth_header,
        auth_token=auth_token,
        extra_headers=extra_headers,
        timeout=timeout,
    )
    if not ok:
        if auth_rejected:
            return {"ok": False, "error": f"MCP authentication error: {err_msg}"}
        if err_msg.startswith("MCP Server URL"):
            return {"ok": False, "error": err_msg}
        return {"ok": False, "error": f"Failed to execute MCP tool '{tool_name}': {err_msg}"}

    if "error" in data:
        rpc_err = data["error"].get("message") if isinstance(data["error"], dict) else str(data["error"])
        return {"ok": False, "error": f"MCP tool error: {rpc_err}"}

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
        out: dict[str, Any] = {"ok": not is_err, "result": full_text or result}
        if is_err:
            out["error"] = full_text or "MCP tool returned an error."
        if images:
            out["images"] = images
        return out

    return {"ok": True, "result": result}


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

