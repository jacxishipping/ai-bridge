"""AI API & Agent Integration Layer for AI Bridge Control Plane.

Provides:
1. Tool catalog: schemas formatted for OpenAI, Anthropic Claude, Gemini, and raw JSON Schema.
2. Synchronous tool execution: /api/ai/execute (targets Windows GUI, Linux shell, or droplet).
3. Autonomous ReAct agent: /api/ai/agent (Bring-Your-Own-Key for OpenAI, Claude, Gemini, Groq, Ollama).
4. OpenAI-compatible chat completions proxy: /v1/chat/completions (for LangChain, CrewAI, AutoGen, Cursor).
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import time
import urllib.error
import urllib.request
import uuid
from typing import Any, Callable

from fastapi import APIRouter, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from ..policy import TOOL_TIERS, RiskTier
from .dispatch import dispatch

# Set of tools specifically for desktop GUI automation
DESKTOP_TOOLS = {
    "get_desktop_status",
    "capture_desktop_screenshot",
    "take_screenshot",
    "launch_approved_application",
    "perform_approved_ui_action",
    "mouse_click",
    "mouse_move",
    "mouse_scroll",
    "mouse_drag",
    "keyboard_type",
    "keyboard_press",
    "list_desktop_windows",
    "focus_window",
    "get_screen_size",
}

# Master tool catalog with descriptions and JSON schema properties
TOOL_CATALOG: dict[str, dict[str, Any]] = {
    "run_shell": {
        "description": "Execute a shell command (bash/sh on Linux, PowerShell/cmd on Windows) on the target device or local host.",
        "category": "shell",
        "parameters": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "The command line string to execute."},
                "device": {"type": "string", "description": "Target device name or ID (e.g. 'ubuntu', 'windows-pc', or 'local')."},
                "working_directory": {"type": "string", "description": "Optional working directory.", "default": ""},
                "timeout": {"type": "integer", "description": "Execution timeout in seconds.", "default": 60},
            },
            "required": ["command"],
        },
    },
    "take_screenshot": {
        "description": "Capture a screenshot of the primary desktop display on a Windows workstation or GUI device, returning JPEG base64 and screen dimensions.",
        "category": "desktop",
        "parameters": {
            "type": "object",
            "properties": {
                "device": {"type": "string", "description": "Target Windows device name or ID (defaults to active Windows workstation)."},
                "quality": {"type": "integer", "description": "JPEG compression quality (1-100).", "default": 75},
            },
        },
    },
    "mouse_click": {
        "description": "Click the mouse at specified (x, y) desktop coordinates on the target Windows machine.",
        "category": "desktop",
        "parameters": {
            "type": "object",
            "properties": {
                "x": {"type": "integer", "description": "X coordinate in pixels."},
                "y": {"type": "integer", "description": "Y coordinate in pixels."},
                "button": {"type": "string", "enum": ["left", "right", "middle"], "description": "Mouse button.", "default": "left"},
                "clicks": {"type": "integer", "description": "Number of clicks (1 for single click, 2 for double click).", "default": 1},
                "device": {"type": "string", "description": "Target device (defaults to active Windows workstation)."},
            },
            "required": ["x", "y"],
        },
    },
    "mouse_move": {
        "description": "Move the mouse cursor smoothly to coordinates (x, y) on the target Windows machine.",
        "category": "desktop",
        "parameters": {
            "type": "object",
            "properties": {
                "x": {"type": "integer", "description": "Target X coordinate."},
                "y": {"type": "integer", "description": "Target Y coordinate."},
                "device": {"type": "string", "description": "Target device."},
            },
            "required": ["x", "y"],
        },
    },
    "mouse_scroll": {
        "description": "Scroll the mouse wheel vertically or horizontally at optional (x, y) location.",
        "category": "desktop",
        "parameters": {
            "type": "object",
            "properties": {
                "delta": {"type": "integer", "description": "Scroll delta (negative scrolls down, positive scrolls up).", "default": -120},
                "x": {"type": "integer", "description": "Optional X coordinate before scrolling."},
                "y": {"type": "integer", "description": "Optional Y coordinate before scrolling."},
                "device": {"type": "string", "description": "Target device."},
            },
        },
    },
    "mouse_drag": {
        "description": "Drag the mouse from (start_x, start_y) to (end_x, end_y) with left button held down.",
        "category": "desktop",
        "parameters": {
            "type": "object",
            "properties": {
                "start_x": {"type": "integer", "description": "Initial X coordinate."},
                "start_y": {"type": "integer", "description": "Initial Y coordinate."},
                "end_x": {"type": "integer", "description": "Ending X coordinate."},
                "end_y": {"type": "integer", "description": "Ending Y coordinate."},
                "device": {"type": "string", "description": "Target device."},
            },
            "required": ["start_x", "start_y", "end_x", "end_y"],
        },
    },
    "keyboard_type": {
        "description": "Type a string of text keystrokes into the currently focused window on the target Windows machine.",
        "category": "desktop",
        "parameters": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "The exact text characters to type."},
                "device": {"type": "string", "description": "Target device."},
            },
            "required": ["text"],
        },
    },
    "keyboard_press": {
        "description": "Press a special key or hotkey combination (e.g. 'enter', 'tab', 'escape', 'ctrl+c', 'win+r') on the target Windows machine.",
        "category": "desktop",
        "parameters": {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "Key name (e.g. enter, esc, tab, backspace, win, ctrl+c, alt+f4)."},
                "device": {"type": "string", "description": "Target device."},
            },
            "required": ["key"],
        },
    },
    "list_desktop_windows": {
        "description": "List all currently open desktop application windows, titles, and handle IDs on the target machine.",
        "category": "desktop",
        "parameters": {
            "type": "object",
            "properties": {
                "device": {"type": "string", "description": "Target device."},
            },
        },
    },
    "focus_window": {
        "description": "Bring an open application window to the foreground by matching its title substring.",
        "category": "desktop",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Window title substring (case-insensitive)."},
                "device": {"type": "string", "description": "Target device."},
            },
            "required": ["title"],
        },
    },
    "get_screen_size": {
        "description": "Get the primary monitor screen resolution (width and height in pixels) of the target machine.",
        "category": "desktop",
        "parameters": {
            "type": "object",
            "properties": {
                "device": {"type": "string", "description": "Target device."},
            },
        },
    },
    "launch_approved_application": {
        "description": "Launch an approved application by name or executable path on the target machine.",
        "category": "desktop",
        "parameters": {
            "type": "object",
            "properties": {
                "app_name": {"type": "string", "description": "Application name or binary name (e.g. 'notepad', 'chrome', 'code')."},
                "url": {"type": "string", "description": "Optional URL or file argument to pass."},
                "device": {"type": "string", "description": "Target device."},
            },
            "required": ["app_name"],
        },
    },
    "read_file": {
        "description": "Read text content from any file path on the target machine (or workspace).",
        "category": "files",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Absolute or workspace-relative path to the file."},
                "max_chars": {"type": "integer", "description": "Maximum characters to return.", "default": 100000},
                "device": {"type": "string", "description": "Target device."},
            },
            "required": ["path"],
        },
    },
    "write_file": {
        "description": "Write or overwrite text content to a file on the target machine.",
        "category": "files",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Destination file path."},
                "content": {"type": "string", "description": "Text content to write."},
                "overwrite": {"type": "boolean", "description": "Allow overwriting if file already exists.", "default": False},
                "device": {"type": "string", "description": "Target device."},
            },
            "required": ["path", "content"],
        },
    },
    "list_workspace": {
        "description": "List files and subdirectories within a directory path on the target device.",
        "category": "files",
        "parameters": {
            "type": "object",
            "properties": {
                "relative_directory": {"type": "string", "description": "Directory path (defaults to workspace root).", "default": "."},
                "device": {"type": "string", "description": "Target device."},
            },
        },
    },
    "list_devices": {
        "description": "List all enrolled fleet devices (Windows workstations, Linux servers, WSL) and the local host with online status and system info.",
        "category": "system",
        "parameters": {
            "type": "object",
            "properties": {},
        },
    },
    "get_device_status": {
        "description": "Get detailed heartbeat, OS, policy, and tool availability status for a specific device.",
        "category": "system",
        "parameters": {
            "type": "object",
            "properties": {
                "device_id": {"type": "string", "description": "Device ID or friendly name.", "default": "local"},
            },
        },
    },
    "get_system_info": {
        "description": "Get operating system details, machine architecture, Python version, and workspace paths.",
        "category": "system",
        "parameters": {
            "type": "object",
            "properties": {
                "device": {"type": "string", "description": "Target device."},
            },
        },
    },
    "get_resource_usage": {
        "description": "Get real-time CPU percentage, RAM memory usage, and uptime from the target device.",
        "category": "system",
        "parameters": {
            "type": "object",
            "properties": {
                "device": {"type": "string", "description": "Target device."},
            },
        },
    },
    "get_disk_usage": {
        "description": "Get total, used, and free disk space on the primary filesystem.",
        "category": "system",
        "parameters": {
            "type": "object",
            "properties": {
                "device": {"type": "string", "description": "Target device."},
            },
        },
    },
    "get_memory_usage": {
        "description": "Get detailed physical and virtual RAM memory statistics.",
        "category": "system",
        "parameters": {
            "type": "object",
            "properties": {
                "device": {"type": "string", "description": "Target device."},
            },
        },
    },
    "get_network_info": {
        "description": "Get network interface configurations, MAC addresses, and active IP addresses.",
        "category": "system",
        "parameters": {
            "type": "object",
            "properties": {
                "device": {"type": "string", "description": "Target device."},
            },
        },
    },
    "list_processes": {
        "description": "List top running system processes sorted by CPU and memory usage.",
        "category": "system",
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Maximum processes to return.", "default": 50},
                "device": {"type": "string", "description": "Target device."},
            },
        },
    },
    "get_service_status": {
        "description": "Check if a background system service (e.g. nginx, ssh, docker, postgresql) is running.",
        "category": "system",
        "parameters": {
            "type": "object",
            "properties": {
                "service": {"type": "string", "description": "Service name."},
                "device": {"type": "string", "description": "Target device."},
            },
            "required": ["service"],
        },
    },
    "list_docker_containers": {
        "description": "List active Docker containers, images, status, and exposed ports on the target machine.",
        "category": "system",
        "parameters": {
            "type": "object",
            "properties": {
                "device": {"type": "string", "description": "Target device."},
            },
        },
    },
    "install_package": {
        "description": "Install or update a software package using the system package manager (apt, pip, npm, winget, choco).",
        "category": "package",
        "parameters": {
            "type": "object",
            "properties": {
                "package_id": {"type": "string", "description": "Package name to install."},
                "version": {"type": "string", "description": "Optional package version."},
                "device": {"type": "string", "description": "Target device."},
            },
            "required": ["package_id"],
        },
    },
    "git_status": {
        "description": "Get git repository status (staged, modified, untracked files) in the target directory.",
        "category": "git",
        "parameters": {
            "type": "object",
            "properties": {
                "relative_directory": {"type": "string", "description": "Path to git repository directory.", "default": "."},
                "device": {"type": "string", "description": "Target device."},
            },
        },
    },
    "git_diff": {
        "description": "Get git diff output showing pending unstaged and staged code modifications.",
        "category": "git",
        "parameters": {
            "type": "object",
            "properties": {
                "relative_directory": {"type": "string", "description": "Path to git repository directory.", "default": "."},
                "device": {"type": "string", "description": "Target device."},
            },
        },
    },
    "run_project_tests": {
        "description": "Run the project test suite (e.g. pytest, npm test, cargo test) and return test output.",
        "category": "diagnostic",
        "parameters": {
            "type": "object",
            "properties": {
                "test_command": {"type": "string", "description": "Test command (e.g. 'pytest', 'npm test').", "default": "pytest"},
                "timeout": {"type": "integer", "description": "Execution timeout in seconds.", "default": 120},
                "device": {"type": "string", "description": "Target device."},
            },
        },
    },
}

# Add aliases and additional mapped tools
TOOL_CATALOG["capture_desktop_screenshot"] = {
    **TOOL_CATALOG["take_screenshot"],
    "description": "Alias for take_screenshot: captures desktop display on target device.",
}


def build_tool_specs(
    tool_format: str = "raw",
    device_os: str | None = None,
    category: str | None = None,
) -> list[dict[str, Any]] | dict[str, Any]:
    """Convert TOOL_CATALOG into the requested format (raw, openai, anthropic, gemini)."""
    fmt = (tool_format or "raw").lower()
    results = []

    for name, meta in TOOL_CATALOG.items():
        # Optional category filter
        if category and meta.get("category") != category.lower():
            continue

        # Optional OS filter
        is_desktop = name in DESKTOP_TOOLS
        if device_os:
            os_low = device_os.lower()
            if "linux" in os_low and is_desktop and name not in {"get_desktop_status"}:
                # Skip desktop tools for headless Linux devices unless specifically queried
                continue

        desc = meta["description"]
        params = meta.get("parameters", {"type": "object", "properties": {}})
        tier = TOOL_TIERS.get(name, RiskTier.SENSITIVE).value

        if fmt == "openai":
            results.append({
                "type": "function",
                "function": {
                    "name": name,
                    "description": f"[Tier {tier}] {desc}",
                    "parameters": params,
                },
            })
        elif fmt == "anthropic":
            results.append({
                "name": name,
                "description": f"[Tier {tier}] {desc}",
                "input_schema": params,
            })
        elif fmt == "gemini":
            results.append({
                "name": name,
                "description": f"[Tier {tier}] {desc}",
                "parameters": params,
            })
        else:
            # raw format
            results.append({
                "name": name,
                "description": desc,
                "category": meta.get("category", "general"),
                "tier": tier,
                "parameters": params,
            })

    return results


def resolve_device_record(conn, target: str | None, tenant: str = "default") -> dict | None:
    """Resolve a target device string (ID, name, hostname, prefix) to device record."""
    if not target or str(target).strip().lower() in ("local", "host", "droplet"):
        return None
    raw = str(target).strip()
    low = raw.lower()

    # 1. Exact ID
    row = conn.execute("SELECT * FROM devices WHERE id=? AND tenant=? AND revoked=0", (raw, tenant)).fetchone()
    if row:
        return dict(row)

    # 2. Exact Name or Hostname (case-insensitive)
    row = conn.execute(
        "SELECT * FROM devices WHERE (LOWER(name)=? OR LOWER(hostname)=?) AND tenant=? AND revoked=0",
        (low, low, tenant),
    ).fetchone()
    if row:
        return dict(row)

    # 3. ID Prefix
    rows = conn.execute(
        "SELECT * FROM devices WHERE id LIKE ? AND tenant=? AND revoked=0",
        (f"{raw}%", tenant),
    ).fetchall()
    if len(rows) == 1:
        return dict(rows[0])

    return None


def find_default_windows_device(conn, tenant: str = "default") -> dict | None:
    """Find the primary active Windows device in the fleet."""
    # 1. Online Windows workstation
    rows = conn.execute("SELECT * FROM devices WHERE tenant=? AND revoked=0 ORDER BY last_seen DESC", (tenant,)).fetchall()
    for r in rows:
        os_str = (r["os"] or "").lower()
        if "win" in os_str and r["status"] == "online":
            return dict(r)
    # 2. Any online device with desktop_enabled in policy
    for r in rows:
        if r["status"] == "online":
            try:
                p = json.loads(r["policy_json"] or "{}")
                if p.get("desktop_enabled"):
                    return dict(r)
            except Exception:
                pass
    # 3. Any Windows machine
    for r in rows:
        if "win" in (r["os"] or "").lower():
            return dict(r)
    return None


class AIExecuteIn(BaseModel):
    tool: str
    device: str | None = None
    args: dict = Field(default_factory=dict)
    timeout: int = 30
    tenant: str = "default"


class AIAgentIn(BaseModel):
    prompt: str
    device: str | None = None
    provider: str = "openai"  # openai | anthropic | gemini | groq | deepseek | ollama | auto
    model: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    max_steps: int = 8
    temperature: float = 0.2
    tenant: str = "default"


class ChatCompletionMessage(BaseModel):
    role: str
    content: str | None = None
    name: str | None = None


class ChatCompletionIn(BaseModel):
    model: str = "ai-bridge-agent"
    messages: list[ChatCompletionMessage]
    stream: bool = False
    temperature: float | None = 0.7
    max_tokens: int | None = None
    device: str | None = None
    api_key: str | None = None


class AISettingsIn(BaseModel):
    provider: str = "openai"  # openai | anthropic | gemini | groq | deepseek | ollama
    model: str | None = None
    api_key: str | None = None
    test_connection: bool = True
    clear: bool = False


class ChatMessage(BaseModel):
    role: str
    content: str | None = None
    name: str | None = None
    screenshot: str | None = None


class AIChatIn(BaseModel):
    messages: list[ChatMessage]
    provider: str | None = None
    model: str | None = None
    api_key: str | None = None
    device: str | None = "auto"
    tenant: str = "default"


def mask_key(k: str) -> str:
    if not k:
        return ""
    if len(k) <= 8:
        return "****"
    return f"{k[:7]}...{k[-4:]}"


def validate_llm_key(provider: str, api_key: str) -> tuple[bool, str]:
    """Test connection with the provider to verify the API key is active."""
    p = provider.lower().strip()
    key = api_key.strip()
    if p == "ollama":
        return True, "Ollama local provider selected."
    if not key:
        return False, "API key cannot be empty."

    try:
        if p == "openai":
            req = urllib.request.Request(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {key}", "User-Agent": "AI-Bridge/0.3"}
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                if 200 <= resp.status < 300:
                    return True, "OpenAI connection verified successfully."
        elif p == "groq":
            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {key}", "User-Agent": "AI-Bridge/0.3"}
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                if 200 <= resp.status < 300:
                    return True, "Groq connection verified successfully."
        elif p == "deepseek":
            req = urllib.request.Request(
                "https://api.deepseek.com/models",
                headers={"Authorization": f"Bearer {key}", "User-Agent": "AI-Bridge/0.3"}
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                if 200 <= resp.status < 300:
                    return True, "DeepSeek connection verified successfully."
        elif p == "gemini":
            req = urllib.request.Request(
                f"https://generativelanguage.googleapis.com/v1beta/models?key={key}",
                headers={"User-Agent": "AI-Bridge/0.3"}
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                if 200 <= resp.status < 300:
                    return True, "Google Gemini connection verified successfully."
        elif p == "anthropic":
            payload = {
                "model": "claude-3-5-sonnet-20241022",
                "max_tokens": 1,
                "messages": [{"role": "user", "content": "ping"}]
            }
            req = urllib.request.Request(
                "https://api.anthropic.com/v1/messages",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                    "User-Agent": "AI-Bridge/0.3"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                if 200 <= resp.status < 300:
                    return True, "Anthropic Claude connection verified successfully."
        elif p == "ollama":
            return True, "Ollama connection configured."
        else:
            return False, f"Unsupported provider: {p}"
    except urllib.error.HTTPError as err:
        err_msg = err.read().decode("utf-8") if err.fp else ""
        try:
            err_json = json.loads(err_msg)
            msg = err_json.get("error", {}).get("message") or err_json.get("message") or err_msg
        except Exception:
            msg = err_msg or str(err)
        return False, f"Provider rejected key (HTTP {err.code}): {msg[:180]}"
    except Exception as exc:
        return False, f"Could not reach provider: {exc}"
    return False, "Validation failed."


def extract_bearer_token(auth_header: str | None) -> str | None:
    if not auth_header:
        return None
    header = auth_header.strip()
    if header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return header or None


def attach_ai_routes(
    app,
    conn,
    task_cond,
    notify_tasks: Callable[[], None],
    auth_context: Callable,
    require_role: Callable,
    get_effective_device_policy: Callable,
    audit: Callable,
):
    """Attach the complete AI API integration routes to the control plane FastAPI app."""

    def _resolve_auth(req: Request, x_admin_token: str | None, x_session_token: str | None):
        """Unified auth checking supporting standard Authorization: Bearer <token>."""
        auth_hdr = req.headers.get("authorization")
        bearer = extract_bearer_token(auth_hdr)

        # Check session token
        eff_session = x_session_token or bearer
        eff_admin = x_admin_token or bearer

        # Let auth_context determine actor and role
        try:
            return auth_context(eff_admin, eff_session)
        except Exception:
            # Check if bearer matches legacy admin token directly
            admin_tok = getattr(app.state, "admin_token", "")
            if bearer and admin_tok and bearer == admin_tok:
                return "admin-token", "admin"
            raise HTTPException(status_code=401, detail="Authentication required (provide Bearer token, X-Admin-Token, or X-Session-Token).")

    # 1. Tools Catalog Endpoint
    @app.get("/api/ai/tools")
    def get_ai_tools(
        req: Request,
        format: str = "raw",
        device: str | None = None,
        category: str | None = None,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        """Return available AI tools in raw JSON Schema, OpenAI, Anthropic Claude, or Gemini format."""
        _resolve_auth(req, x_admin_token, x_session_token)

        dev_os = None
        if device and device.lower() not in ("local", "host"):
            dev_rec = resolve_device_record(conn, device)
            if dev_rec:
                dev_os = dev_rec.get("os")

        tools_list = build_tool_specs(tool_format=format, device_os=dev_os, category=category)
        return {"ok": True, "format": format, "count": len(tools_list), "tools": tools_list}

    # 2. Synchronous AI Tool Execution Endpoint
    @app.post("/api/ai/execute")
    async def execute_ai_tool(
        body: AIExecuteIn,
        req: Request,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        """Direct synchronous execution of any tool on any device.

        Wait for the result and return it in a single response.
        """
        actor, role = _resolve_auth(req, x_admin_token, x_session_token)
        if app.state.emergency_stop:
            raise HTTPException(status_code=403, detail="Emergency stop is active; no tool executions accepted.")

        tool = body.tool.strip()
        tier = TOOL_TIERS.get(tool)
        if tier is None:
            raise HTTPException(status_code=400, detail=f"Unknown tool: '{tool}'. Query /api/ai/tools for valid tools.")

        # Determine target device
        target = body.device
        if (not target or target.lower() in ("auto", "windows")) and tool in DESKTOP_TOOLS:
            win_dev = find_default_windows_device(conn, body.tenant)
            if win_dev:
                target = win_dev["id"]

        is_local = not target or target.lower() in ("local", "host", "droplet")
        dev_rec = None if is_local else resolve_device_record(conn, target, body.tenant)

        if not is_local and dev_rec is None:
            # Device requested but not found
            devices = conn.execute("SELECT id, name, hostname, os, status FROM devices WHERE tenant=? AND revoked=0", (body.tenant,)).fetchall()
            avail = [f"'{d['name']}' (id: {d['id']}, os: {d['os']}, status: {d['status']})" for d in devices]
            raise HTTPException(
                status_code=404,
                detail=f"Device '{target}' not found in tenant '{body.tenant}'. Available: [{', '.join(avail) if avail else 'None'}], or use 'local'.",
            )

        start_time = time.time()

        # Handle local execution
        if is_local:
            try:
                res = dispatch(tool, body.args, is_admin=(role == "admin"))
                duration_ms = int((time.time() - start_time) * 1000)
                audit(actor, "local", tool, body.args, "completed", tenant=body.tenant)
                return {
                    "ok": True,
                    "status": "completed",
                    "tool": tool,
                    "device": "local",
                    "device_id": "local",
                    "result": res,
                    "duration_ms": duration_ms,
                }
            except PermissionError as exc:
                audit(actor, "local", tool, body.args, "denied", tenant=body.tenant)
                return JSONResponse(status_code=403, content={"ok": False, "status": "denied", "tool": tool, "error": str(exc)})
            except Exception as exc:
                audit(actor, "local", tool, body.args, "failed", tenant=body.tenant)
                return JSONResponse(status_code=500, content={"ok": False, "status": "failed", "tool": tool, "error": str(exc)})

        # Remote device execution via tasks table
        eff_policy = get_effective_device_policy(dev_rec)
        if tool in eff_policy.get("denied_tools", []):
            raise HTTPException(status_code=403, detail=f"Tool '{tool}' is disabled by device policy for '{dev_rec['name']}'.")
        if eff_policy.get("allowed_tools") is not None and tool not in eff_policy["allowed_tools"]:
            raise HTTPException(status_code=403, detail=f"Tool '{tool}' is not in the allowed tools list for device '{dev_rec['name']}'.")

        # Approval evaluation
        is_unrestricted = bool(eff_policy.get("unrestricted", False))
        max_unattended = int(eff_policy.get("max_tier_unattended", 2))
        allow_t3 = bool(eff_policy.get("allow_tier3", False))
        needs_approval = False

        if not is_unrestricted:
            if tier.value >= 4:
                if max_unattended < 4:
                    needs_approval = True
            elif tier.value == 3:
                if not (allow_t3 or max_unattended >= 3):
                    needs_approval = True
            elif tier.value > max_unattended:
                needs_approval = True

        task_id = uuid.uuid4().hex[:12]
        approval_id = None

        if needs_approval:
            approval_id = uuid.uuid4().hex[:12]
            approval_ttl = max(60, int(os.environ.get("AI_BRIDGE_APPROVAL_TTL_SECONDS", "3600")))
            policy_row = conn.execute("SELECT MAX(version) AS version FROM policies").fetchone()
            policy_version = policy_row["version"] or 0
            conn.execute(
                "INSERT INTO approvals (id, task_id, tool, reason, created_at, expires_at, policy_version) VALUES (?,?,?,?,?,?,?)",
                (approval_id, task_id, tool, f"Tier-{tier.value} operation requires human approval.", time.time(), time.time() + approval_ttl, policy_version),
            )
            conn.execute(
                "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, approval_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (task_id, dev_rec["id"], body.tenant, tool, json.dumps(body.args), tier.value, "needs_approval", approval_id, time.time(), time.time()),
            )
            conn.commit()
            audit(actor, dev_rec["id"], tool, body.args, "needs_approval", tenant=body.tenant)

            return {
                "ok": False,
                "status": "needs_approval",
                "tool": tool,
                "device_id": dev_rec["id"],
                "device_name": dev_rec["name"],
                "task_id": task_id,
                "approval_id": approval_id,
                "tier": tier.value,
                "note": "Operation requires human approval in the AI Bridge dashboard or via POST /api/approvals/{approval_id}.",
            }

        # Queue task for agent
        conn.execute(
            "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, approval_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (task_id, dev_rec["id"], body.tenant, tool, json.dumps(body.args), tier.value, "queued", None, time.time(), time.time()),
        )
        conn.commit()
        audit(actor, dev_rec["id"], tool, body.args, "queued", tenant=body.tenant)
        notify_tasks()

        # Await completion
        wait_seconds = max(1, min(int(body.timeout or 30), 120))
        deadline = time.time() + wait_seconds

        while time.time() < deadline:
            task_row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
            if task_row and task_row["status"] in ("completed", "failed", "cancelled", "timed_out"):
                duration_ms = int((time.time() - start_time) * 1000)
                st = task_row["status"]
                raw_res = task_row["result"] or ""
                # Parse JSON if possible
                try:
                    parsed_res = json.loads(raw_res)
                except Exception:
                    parsed_res = raw_res

                if st == "completed":
                    return {
                        "ok": True,
                        "status": "completed",
                        "tool": tool,
                        "device_id": dev_rec["id"],
                        "device_name": dev_rec["name"],
                        "task_id": task_id,
                        "result": parsed_res,
                        "duration_ms": duration_ms,
                    }
                else:
                    return {
                        "ok": False,
                        "status": st,
                        "tool": tool,
                        "device_id": dev_rec["id"],
                        "device_name": dev_rec["name"],
                        "task_id": task_id,
                        "error": parsed_res,
                        "duration_ms": duration_ms,
                    }

            rem = deadline - time.time()
            if rem <= 0:
                break
            await asyncio.sleep(min(0.1, rem))

        # Still running
        return {
            "ok": False,
            "status": "running",
            "tool": tool,
            "device_id": dev_rec["id"],
            "device_name": dev_rec["name"],
            "task_id": task_id,
            "note": f"Task submitted to '{dev_rec['name']}' is still executing. Retrieve final result with GET /api/tasks/{task_id}.",
        }

    # 3. Autonomous AI Agent Loop Endpoint
    @app.post("/api/ai/agent")
    async def run_autonomous_agent(
        body: AIAgentIn,
        req: Request,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        """Autonomous ReAct agent that accepts a natural language instruction,
        calls tools across your connected devices, and returns the final answer.
        """
        actor, role = _resolve_auth(req, x_admin_token, x_session_token)

        # Determine LLM Provider, Model and API Key
        provider = (body.provider or "").lower().strip()
        if not provider:
            def_p = conn.execute("SELECT value FROM settings WHERE key='ai_default_provider'").fetchone()
            provider = (def_p["value"] if def_p and def_p["value"] else "openai").lower().strip()

        api_key = (
            body.api_key
            or req.headers.get("x-llm-api-key")
            or req.headers.get("x-openai-api-key")
        )
        if not api_key:
            row = conn.execute("SELECT value FROM settings WHERE key=?", (f"ai_{provider}_key",)).fetchone()
            if row and row["value"]:
                api_key = str(row["value"]).strip()
        if not api_key and provider == "openai":
            row = conn.execute("SELECT value FROM settings WHERE key='ai_default_key'").fetchone()
            if row and row["value"]:
                api_key = str(row["value"]).strip()
        if not api_key:
            api_key = (
                os.environ.get(f"AI_BRIDGE_{provider.upper()}_API_KEY")
                or os.environ.get(f"{provider.upper()}_API_KEY")
                or os.environ.get("AI_BRIDGE_OPENAI_API_KEY")
                or os.environ.get("OPENAI_API_KEY")
            )

        model = body.model
        if not model:
            def_m = conn.execute("SELECT value FROM settings WHERE key='ai_default_model'").fetchone()
            if def_m and def_m["value"]:
                model = str(def_m["value"]).strip()

        # Fetch devices in tenant for context
        devices = conn.execute("SELECT id, name, hostname, os, status FROM devices WHERE tenant=? AND revoked=0", (body.tenant,)).fetchall()
        dev_list_str = "\n".join([f"- {d['name']} (ID: {d['id']}, OS: {d['os']}, Status: {d['status']})" for d in devices])

        system_prompt = (
            f"You are the AI Bridge fleet controller agent.\n"
            f"You have direct control over the user's computer fleet:\n"
            f"{dev_list_str if dev_list_str else '- local (the AI Bridge host)'}\n\n"
            f"Guidelines:\n"
            f"1. To run terminal commands on Linux servers or workstations, use 'run_shell' with the appropriate device.\n"
            f"2. To control Windows workstations with GUI automation, use 'take_screenshot', 'mouse_click', 'keyboard_type', etc.\n"
            f"3. When you need to inspect, edit, or create files, use the file tools.\n"
            f"4. Provide clear, concise summaries of your actions and results."
        )

        # If no external LLM key is configured, perform smart intent execution
        if not api_key and provider != "ollama":
            # Smart intent handling for common operations
            prompt_low = body.prompt.lower().strip()

            # Screenshot intent
            if "screenshot" in prompt_low:
                win_dev = find_default_windows_device(conn, body.tenant)
                target = win_dev["name"] if win_dev else "local"
                exec_in = AIExecuteIn(tool="take_screenshot", device=target, tenant=body.tenant)
                res = await execute_ai_tool(exec_in, req, x_admin_token=x_admin_token, x_session_token=x_session_token)
                screenshot_data = None
                if isinstance(res, dict):
                    inner = res.get("result", {})
                    if isinstance(inner, dict) and inner.get("screenshot"):
                        screenshot_data = inner.get("screenshot")
                return {
                    "ok": True,
                    "provider": "smart-intent",
                    "response": f"Captured screenshot from {target}.",
                    "steps": [{"tool": "take_screenshot", "device": target, "result": res}],
                    "screenshot": screenshot_data,
                }

            # Device list intent
            if "device" in prompt_low or "fleet" in prompt_low or "list" in prompt_low:
                return {
                    "ok": True,
                    "provider": "smart-intent",
                    "response": f"Enrolled fleet devices:\n{dev_list_str if dev_list_str else 'No remote devices enrolled yet.'}",
                    "steps": [{"tool": "list_devices", "device": "local", "result": [dict(d) for d in devices]}],
                }

            # Shell intent: e.g. "run shell <cmd> on <device>" or "uptime on ubuntu"
            m = re.search(r"run\s+(?:shell\s+|command\s+)?['\"]?([^'\"]+)['\"]?\s+on\s+([a-zA-Z0-9_\-]+)", body.prompt, re.IGNORECASE)
            if m:
                cmd = m.group(1).strip()
                dev = m.group(2).strip()
                exec_in = AIExecuteIn(tool="run_shell", device=dev, args={"command": cmd}, tenant=body.tenant)
                res = await execute_ai_tool(exec_in, req, x_admin_token=x_admin_token, x_session_token=x_session_token)
                return {
                    "ok": True,
                    "provider": "smart-intent",
                    "response": f"Executed `{cmd}` on {dev}:\n```\n{json.dumps(res.get('result', ''), indent=2)}\n```",
                    "steps": [{"tool": "run_shell", "device": dev, "args": {"command": cmd}, "result": res}],
                }

            return {
                "ok": False,
                "error": "No LLM API key provided. Pass your OpenAI, Claude, Gemini, or Groq API key in 'api_key' or header 'X-LLM-Key' for multi-step autonomous reasoning.",
                "hint": "You can also use /api/ai/execute to invoke any of the 49 device tools directly with zero configuration.",
            }

        # Multi-turn autonomous tool execution loop with OpenAI-compatible API
        base_url = body.base_url or (
            "https://api.groq.com/openai/v1" if provider == "groq"
            else "https://api.deepseek.com/v1" if provider == "deepseek"
            else "https://generativelanguage.googleapis.com/v1beta/openai" if provider == "gemini"
            else "http://localhost:11434/v1" if provider == "ollama"
            else "https://api.openai.com/v1"
        )
        if not model:
            model = (
                "llama-3.3-70b-versatile" if provider == "groq"
                else "deepseek-chat" if provider == "deepseek"
                else "gemini-1.5-flash" if provider == "gemini"
                else "llama3" if provider == "ollama"
                else "gpt-4o"
            )

        tools_spec = build_tool_specs(tool_format="openai")
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": body.prompt},
        ]
        steps_taken = []
        max_steps = max(1, min(int(body.max_steps or 8), 20))

        for step_idx in range(max_steps):
            payload = {
                "model": model,
                "messages": messages,
                "tools": tools_spec,
                "tool_choice": "auto",
                "temperature": body.temperature,
            }

            req_headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key or 'ollama'}",
            }

            req_obj = urllib.request.Request(
                f"{base_url.rstrip('/')}/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                headers=req_headers,
                method="POST",
            )

            try:
                with urllib.request.urlopen(req_obj, timeout=60) as resp:
                    resp_data = json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as err:
                err_text = err.read().decode("utf-8") if err.fp else str(err)
                return JSONResponse(status_code=err.code, content={"ok": False, "error": f"LLM API error ({err.code}): {err_text}"})
            except Exception as exc:
                return JSONResponse(status_code=502, content={"ok": False, "error": f"Could not reach LLM provider at {base_url}: {exc}"})

            choice = resp_data.get("choices", [{}])[0]
            message = choice.get("message", {})
            tool_calls = message.get("tool_calls") or []

            # If no tool calls, model has produced the final answer
            if not tool_calls:
                final_content = message.get("content") or ""
                return {
                    "ok": True,
                    "provider": provider,
                    "model": model,
                    "response": final_content,
                    "steps": steps_taken,
                }

            # Append assistant message with tool calls
            messages.append(message)

            # Execute tool calls
            for tc in tool_calls:
                fn = tc.get("function", {})
                t_name = fn.get("name")
                try:
                    t_args = json.loads(fn.get("arguments", "{}"))
                except Exception:
                    t_args = {}

                t_device = t_args.pop("device", None) or body.device
                exec_in = AIExecuteIn(tool=t_name, device=t_device, args=t_args, tenant=body.tenant)
                exec_res = await execute_ai_tool(exec_in, req, x_admin_token=x_admin_token, x_session_token=x_session_token)

                steps_taken.append({
                    "step": step_idx + 1,
                    "tool": t_name,
                    "device": t_device or "local",
                    "args": t_args,
                    "result": exec_res,
                })

                # Append tool response message
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.get("id"),
                    "name": t_name,
                    "content": json.dumps(exec_res),
                })

        return {
            "ok": True,
            "provider": provider,
            "model": model,
            "response": "Executed requested instructions across devices.",
            "steps": steps_taken,
        }

    # 4. OpenAI-Compatible Chat Completions Endpoint
    @app.post("/v1/chat/completions")
    @app.post("/api/v1/chat/completions")
    async def chat_completions(
        body: ChatCompletionIn,
        req: Request,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        """OpenAI-compatible /v1/chat/completions endpoint for LangChain, AutoGen, CrewAI, and custom scripts."""
        actor, role = _resolve_auth(req, x_admin_token, x_session_token)

        # Extract last user message
        last_user_msg = ""
        for m in reversed(body.messages):
            if m.role == "user" and m.content:
                last_user_msg = m.content
                break

        agent_in = AIAgentIn(
            prompt=last_user_msg or "Hello",
            device=body.device,
            api_key=body.api_key,
        )

        agent_result = await run_autonomous_agent(agent_in, req, x_admin_token=x_admin_token, x_session_token=x_session_token)
        if isinstance(agent_result, Response):
            return agent_result

        response_content = agent_result.get("response") or agent_result.get("error") or "No response generated."
        created_time = int(time.time())
        completion_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"

        # Standard OpenAI response format
        return {
            "id": completion_id,
            "object": "chat.completion",
            "created": created_time,
            "model": body.model,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": response_content,
                    },
                    "finish_reason": "stop",
                }
            ],
            "usage": {
                "prompt_tokens": len(last_user_msg.split()) * 2,
                "completion_tokens": len(response_content.split()) * 2,
                "total_tokens": (len(last_user_msg.split()) + len(response_content.split())) * 2,
            },
            "steps": agent_result.get("steps", []),
        }

    # 5. OpenAI-Compatible Models Endpoint
    @app.get("/v1/models")
    @app.get("/api/v1/models")
    def list_models():
        """Return available models in OpenAI format."""
        return {
            "object": "list",
            "data": [
                {"id": "ai-bridge-agent", "object": "model", "owned_by": "ai-bridge"},
                {"id": "ai-bridge-fleet", "object": "model", "owned_by": "ai-bridge"},
                {"id": "gpt-4o", "object": "model", "owned_by": "openai"},
                {"id": "claude-3-5-sonnet", "object": "model", "owned_by": "anthropic"},
            ],
        }

    # 6. Fleet AI Status & Capabilities Endpoint
    @app.get("/api/ai/devices")
    def get_ai_fleet(
        req: Request,
        tenant: str = "default",
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        """Get summary of online devices, OS types, and AI control capabilities."""
        _resolve_auth(req, x_admin_token, x_session_token)
        devices = conn.execute("SELECT id, name, hostname, os, status, last_seen, policy_json FROM devices WHERE tenant=? AND revoked=0", (tenant,)).fetchall()

        out = []
        for d in devices:
            os_str = (d["os"] or "").lower()
            is_win = "win" in os_str
            is_linux = "linux" in os_str

            out.append({
                "id": d["id"],
                "name": d["name"],
                "hostname": d["hostname"],
                "os": d["os"],
                "status": d["status"],
                "capabilities": {
                    "desktop_gui": is_win,
                    "screenshot": is_win,
                    "mouse_keyboard": is_win,
                    "shell_execution": True,
                    "docker": is_linux,
                    "package_management": True,
                },
                "last_seen": d["last_seen"],
            })

        return {"ok": True, "tenant": tenant, "count": len(out), "devices": out}

    # 7. AI Provider Settings & API Keys Management
    @app.get("/api/settings/ai")
    def get_ai_settings(
        req: Request,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        """Return configured AI providers, models, and masked API keys."""
        _resolve_auth(req, x_admin_token, x_session_token)
        providers = ["openai", "anthropic", "gemini", "groq", "deepseek"]
        configured = {}
        masked = {}
        for p in providers:
            row = conn.execute("SELECT value FROM settings WHERE key=?", (f"ai_{p}_key",)).fetchone()
            val = str(row["value"]).strip() if row and row["value"] else ""
            if not val:
                val = os.environ.get(f"AI_BRIDGE_{p.upper()}_API_KEY") or os.environ.get(f"{p.upper()}_API_KEY", "")
            configured[p] = bool(val)
            if val:
                masked[p] = mask_key(val)

        def_p = conn.execute("SELECT value FROM settings WHERE key='ai_default_provider'").fetchone()
        def_m = conn.execute("SELECT value FROM settings WHERE key='ai_default_model'").fetchone()

        active_provider = (def_p["value"] if def_p and def_p["value"] else "openai").strip()
        active_model = (def_m["value"] if def_m and def_m["value"] else ("gpt-4o" if active_provider == "openai" else "claude-3-5-sonnet")).strip()

        return {
            "ok": True,
            "provider": active_provider,
            "model": active_model,
            "keys_configured": configured,
            "masked_keys": masked,
            "is_connected": bool(configured.get(active_provider) or active_provider == "ollama"),
        }

    @app.post("/api/settings/ai")
    def update_ai_settings(
        body: AISettingsIn,
        req: Request,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        """Save, test, or clear AI API keys for a provider."""
        actor, role = _resolve_auth(req, x_admin_token, x_session_token)
        p = body.provider.lower().strip()
        m = (body.model or "").strip()

        if body.clear:
            conn.execute("DELETE FROM settings WHERE key=?", (f"ai_{p}_key",))
            conn.commit()
            audit(actor, "", f"clear_ai_key_{p}", {}, "allowed")
            return {"ok": True, "message": f"Cleared API key for {p.capitalize()}."}

        key = (body.api_key or "").strip()
        if p != "ollama" and not key:
            raise HTTPException(status_code=400, detail="API key is required.")

        if body.test_connection:
            valid, msg = validate_llm_key(p, key)
            if not valid:
                raise HTTPException(status_code=400, detail=msg)

        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (f"ai_{p}_key", key))
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_default_provider', ?)", (p,))
        if m:
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_default_model', ?)", (m,))
        conn.commit()

        audit(actor, "", f"set_ai_key_{p}", {"model": m}, "allowed")
        return {
            "ok": True,
            "message": f"Successfully connected to {p.capitalize()}!",
            "provider": p,
            "model": m or ("gpt-4o" if p == "openai" else "claude-3-5-sonnet" if p == "anthropic" else "gemini-1.5-pro"),
            "masked_key": mask_key(key),
        }

    # 8. Conversational Dashboard AI Copilot
    @app.post("/api/ai/chat")
    async def ai_chat(
        body: AIChatIn,
        req: Request,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        """Conversational AI Copilot for the Dashboard with fleet awareness,
        tool calling, and live screenshot attachments."""
        actor, role = _resolve_auth(req, x_admin_token, x_session_token)

        last_prompt = ""
        for m in reversed(body.messages):
            if m.role == "user" and m.content:
                last_prompt = m.content
                break
        if not last_prompt:
            return {"ok": True, "message": {"role": "assistant", "content": "How can I help you manage your computer fleet?"}}

        agent_in = AIAgentIn(
            prompt=last_prompt,
            device=body.device,
            provider=body.provider or "openai",
            model=body.model,
            api_key=body.api_key,
            tenant=body.tenant,
        )

        agent_res = await run_autonomous_agent(agent_in, req, x_admin_token=x_admin_token, x_session_token=x_session_token)
        if isinstance(agent_res, Response):
            return agent_res

        # Check if any step captured a screenshot
        screenshot_b64 = agent_res.get("screenshot")
        steps = agent_res.get("steps", [])
        if not screenshot_b64:
            for st in steps:
                res = st.get("result", {})
                if isinstance(res, dict):
                    inner = res.get("result", {})
                    if isinstance(inner, dict) and "screenshot" in inner and inner["screenshot"]:
                        screenshot_b64 = inner["screenshot"]
                        break
                    elif "screenshot" in res and res["screenshot"]:
                        screenshot_b64 = res["screenshot"]
                        break

        resp_text = agent_res.get("response") or agent_res.get("error") or "Operation complete."

        return {
            "ok": True,
            "message": {
                "role": "assistant",
                "content": resp_text,
                "screenshot": screenshot_b64,
            },
            "steps": steps,
            "screenshot": screenshot_b64,
            "provider": agent_res.get("provider"),
            "model": agent_res.get("model"),
        }
