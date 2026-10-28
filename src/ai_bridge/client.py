"""AI Bridge Python SDK Client.

Connect your custom AI agents, scripts, and LLMs directly to your computer fleet
(Windows workstations, Linux servers, WSL) through AI Bridge.

Quickstart:
    from ai_bridge import AIBridgeClient

    client = AIBridgeClient(base_url="https://jxiptvplayer.app", token="your-token")

    # List online devices
    devices = client.list_devices()
    print("Fleet:", [d["name"] for d in devices])

    # Run command on Linux
    result = client.run_shell("uptime", device="ubuntu")
    print("Ubuntu uptime:", result)

    # Capture Windows desktop screenshot
    shot = client.take_screenshot(device="windows-pc")
    print(f"Captured screenshot: {shot.get('width')}x{shot.get('height')}")

    # Control mouse & keyboard
    client.mouse_click(x=100, y=200, device="windows-pc")
    client.keyboard_type("notepad.exe\n", device="windows-pc")

    # Export tools for OpenAI function calling
    openai_tools = client.get_tools(format="openai")
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


class AIBridgeError(RuntimeError):
    """Base exception for AI Bridge client operations."""
    def __init__(self, message: str, status_code: int | None = None, details: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details


class AIBridgeClient:
    """Client for the AI Bridge Control Plane and Device Fleet API."""

    def __init__(
        self,
        base_url: str | None = None,
        token: str | None = None,
        timeout: int = 60,
    ):
        """Initialize AI Bridge client.

        Args:
            base_url: Control plane URL (e.g. 'https://jxiptvplayer.app' or 'http://localhost:8000').
                      Defaults to AI_BRIDGE_URL or AI_BRIDGE_CONTROL_URL or http://127.0.0.1:8000.
            token: Admin token, user session token, or OAuth bearer token.
                   Defaults to AI_BRIDGE_ADMIN_TOKEN or AI_BRIDGE_TOKEN.
            timeout: Default HTTP request timeout in seconds.
        """
        raw_url = (
            base_url
            or os.environ.get("AI_BRIDGE_URL")
            or os.environ.get("AI_BRIDGE_CONTROL_URL")
            or "http://127.0.0.1:8000"
        )
        self.base_url = raw_url.rstrip("/")
        self.token = (
            token
            or os.environ.get("AI_BRIDGE_ADMIN_TOKEN")
            or os.environ.get("AI_BRIDGE_TOKEN")
            or ""
        )
        self.default_timeout = timeout

    def _request(
        self,
        method: str,
        path: str,
        payload: dict | None = None,
        params: dict | None = None,
        timeout: int | None = None,
    ) -> Any:
        url = f"{self.base_url}/{path.lstrip('/')}"
        if params:
            clean_params = {k: v for k, v in params.items() if v is not None}
            if clean_params:
                url += "?" + urllib.parse.urlencode(clean_params)

        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "AI-Bridge-Python-SDK/0.3",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
            headers["X-Admin-Token"] = self.token

        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        call_timeout = timeout or self.default_timeout

        try:
            with urllib.request.urlopen(req, timeout=call_timeout) as resp:
                resp_bytes = resp.read()
                if not resp_bytes:
                    return None
                text = resp_bytes.decode("utf-8")
                try:
                    return json.loads(text)
                except Exception:
                    return text
        except urllib.error.HTTPError as exc:
            err_body = exc.read().decode("utf-8") if exc.fp else ""
            try:
                err_json = json.loads(err_body)
                msg = err_json.get("detail") or err_json.get("error") or err_body
            except Exception:
                msg = err_body or str(exc)
            raise AIBridgeError(f"HTTP {exc.code}: {msg}", status_code=exc.code, details=err_body)
        except Exception as exc:
            raise AIBridgeError(f"Request failed: {exc}")

    # Fleet & Devices
    def list_devices(self) -> list[dict]:
        """List all devices in the fleet, their OS, online status, and AI capabilities."""
        res = self._request("GET", "/api/ai/devices")
        if isinstance(res, dict) and "devices" in res:
            return res["devices"]
        # Fallback to general devices endpoint
        res2 = self._request("GET", "/api/devices")
        return res2 if isinstance(res2, list) else []

    def get_device(self, device_id_or_name: str) -> dict | None:
        """Get details for a specific device by ID or name."""
        devices = self.list_devices()
        target = device_id_or_name.lower().strip()
        for d in devices:
            if d.get("id") == target or (d.get("name") or "").lower() == target:
                return d
        return None

    # Tools Catalog
    def get_tools(
        self,
        format: str = "raw",
        device: str | None = None,
        category: str | None = None,
    ) -> list[dict]:
        """Get tool specifications formatted for LLMs.

        Args:
            format: 'raw', 'openai' (function calling), 'anthropic' (tools), or 'gemini'.
            device: Optional target device name to filter compatible tools.
            category: Optional filter ('desktop', 'shell', 'files', 'system', 'git').
        """
        res = self._request("GET", "/api/ai/tools", params={"format": format, "device": device, "category": category})
        if isinstance(res, dict) and "tools" in res:
            return res["tools"]
        return []

    # Synchronous Tool Execution
    def execute(
        self,
        tool: str,
        device: str | None = None,
        args: dict | None = None,
        timeout: int = 30,
    ) -> dict:
        """Execute any tool synchronously on any target device.

        Args:
            tool: Name of the tool (e.g. 'run_shell', 'take_screenshot', 'mouse_click').
            device: Target device name ('ubuntu', 'windows-pc') or ID or 'local'.
            args: Tool arguments dictionary.
            timeout: Execution timeout in seconds (default 30).
        """
        payload = {
            "tool": tool,
            "device": device,
            "args": args or {},
            "timeout": timeout,
        }
        res = self._request("POST", "/api/ai/execute", payload=payload, timeout=timeout + 10)
        return res if isinstance(res, dict) else {"result": res}

    # Shell Execution
    def run_shell(
        self,
        command: str,
        device: str | None = None,
        working_directory: str = "",
        timeout: int = 60,
    ) -> Any:
        """Execute a shell command on the target device."""
        res = self.execute("run_shell", device=device, args={
            "command": command,
            "working_directory": working_directory,
            "timeout": timeout,
        }, timeout=timeout)
        if res.get("ok"):
            return res.get("result")
        raise AIBridgeError(f"Shell execution failed: {res.get('error') or res}")

    # Files & Workspace
    def read_file(self, path: str, device: str | None = None, max_chars: int = 100000) -> str:
        """Read text from a file on the target device."""
        res = self.execute("read_file", device=device, args={"path": path, "max_chars": max_chars})
        if res.get("ok"):
            return str(res.get("result") or "")
        raise AIBridgeError(f"Read file failed: {res.get('error') or res}")

    def write_file(self, path: str, content: str, overwrite: bool = False, device: str | None = None) -> dict:
        """Write content to a file on the target device."""
        res = self.execute("write_file", device=device, args={
            "path": path,
            "content": content,
            "overwrite": overwrite,
        })
        if res.get("ok"):
            return res.get("result") or {}
        raise AIBridgeError(f"Write file failed: {res.get('error') or res}")

    # Desktop GUI Automation (Windows & Desktop Linux)
    def take_screenshot(self, device: str | None = None, quality: int = 75) -> dict:
        """Capture desktop screenshot on target device.

        Returns:
            dict containing 'screenshot' (base64 JPEG), 'width', 'height', 'format'.
        """
        res = self.execute("take_screenshot", device=device, args={"quality": quality})
        if res.get("ok"):
            return res.get("result") or {}
        raise AIBridgeError(f"Take screenshot failed: {res.get('error') or res}")

    def mouse_click(
        self,
        x: int,
        y: int,
        button: str = "left",
        clicks: int = 1,
        device: str | None = None,
    ) -> dict:
        """Click the mouse at desktop coordinates (x, y)."""
        res = self.execute("mouse_click", device=device, args={
            "x": x,
            "y": y,
            "button": button,
            "clicks": clicks,
        })
        return res.get("result") or res

    def mouse_move(self, x: int, y: int, device: str | None = None) -> dict:
        """Move the mouse cursor to (x, y)."""
        res = self.execute("mouse_move", device=device, args={"x": x, "y": y})
        return res.get("result") or res

    def mouse_scroll(self, delta: int = -120, x: int | None = None, y: int | None = None, device: str | None = None) -> dict:
        """Scroll mouse wheel (negative is down, positive is up)."""
        res = self.execute("mouse_scroll", device=device, args={"delta": delta, "x": x, "y": y})
        return res.get("result") or res

    def mouse_drag(self, start_x: int, start_y: int, end_x: int, end_y: int, device: str | None = None) -> dict:
        """Drag mouse from start coordinates to end coordinates."""
        res = self.execute("mouse_drag", device=device, args={
            "start_x": start_x,
            "start_y": start_y,
            "end_x": end_x,
            "end_y": end_y,
        })
        return res.get("result") or res

    def keyboard_type(self, text: str, device: str | None = None) -> dict:
        """Type text keystrokes into active window."""
        res = self.execute("keyboard_type", device=device, args={"text": text})
        return res.get("result") or res

    def keyboard_press(self, key: str, device: str | None = None) -> dict:
        """Press a special key or hotkey combination (e.g. 'enter', 'tab', 'ctrl+c', 'win+r')."""
        res = self.execute("keyboard_press", device=device, args={"key": key})
        return res.get("result") or res

    def list_windows(self, device: str | None = None) -> list[dict]:
        """List open application windows on target device."""
        res = self.execute("list_desktop_windows", device=device)
        return (res.get("result") or {}).get("windows", [])

    def focus_window(self, title: str, device: str | None = None) -> dict:
        """Bring window to foreground by title substring."""
        res = self.execute("focus_window", device=device, args={"title": title})
        return res.get("result") or res

    def get_screen_size(self, device: str | None = None) -> dict:
        """Get primary monitor screen resolution."""
        res = self.execute("get_screen_size", device=device)
        return res.get("result") or {}

    # High-level Agent & Chat
    def run_agent(
        self,
        prompt: str,
        device: str | None = None,
        provider: str = "openai",
        model: str | None = None,
        api_key: str | None = None,
        max_steps: int = 8,
    ) -> dict:
        """Run an autonomous AI agent to execute a natural language task across your fleet."""
        payload = {
            "prompt": prompt,
            "device": device,
            "provider": provider,
            "model": model,
            "api_key": api_key,
            "max_steps": max_steps,
        }
        return self._request("POST", "/api/ai/agent", payload=payload, timeout=120)

    def chat(self, messages: list[dict], model: str = "ai-bridge-agent", device: str | None = None) -> dict:
        """Send chat messages via OpenAI-compatible endpoint."""
        payload = {
            "model": model,
            "messages": messages,
            "device": device,
        }
        return self._request("POST", "/v1/chat/completions", payload=payload, timeout=120)
