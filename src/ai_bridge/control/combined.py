"""Single-process ASGI app: control plane + Streamable HTTP MCP + OAuth gateway.

Used on hosts like Render that expose one web service. Production docker
compose can keep separate mcp-http / oauth-gateway containers; set
AI_BRIDGE_EMBED_MCP=0 to disable embedding.
"""
from __future__ import annotations

import os
import sys
import time
from contextlib import AsyncExitStack, asynccontextmanager
from pathlib import Path

from starlette.applications import Starlette
from starlette.types import ASGIApp, Receive, Scope, Send

from ai_bridge.device_routing import BindingError, set_verify_hook


def _should_embed() -> bool:
    flag = os.environ.get("AI_BRIDGE_EMBED_MCP", "").strip().lower()
    if flag in ("0", "false", "no", "off"):
        return False
    if flag in ("1", "true", "yes", "on"):
        return True
    # Default on for PaaS (Render sets PORT) so /mcp is reachable publicly.
    return "PORT" in os.environ


def _prepare_embed_env() -> str:
    """Set OAuth/MCP env before importing gateway or FastMCP. Returns public base URL."""
    data_dir = Path(os.environ.get("AI_BRIDGE_DATA_DIR", str(Path.home() / ".ai-bridge")))
    data_dir.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("AI_BRIDGE_OAUTH_DB", str(data_dir / "oauth.db"))

    public = (
        os.environ.get("AI_BRIDGE_PUBLIC_URL")
        or os.environ.get("AI_BRIDGE_OAUTH_ISSUER")
        or ""
    ).rstrip("/")
    if public:
        os.environ.setdefault("AI_BRIDGE_OAUTH_ISSUER", public)
        os.environ.setdefault("AI_BRIDGE_CONTROL_URL", public)
        host = public.split("://", 1)[-1].split("/", 1)[0]
        existing = [h.strip() for h in os.environ.get("AI_BRIDGE_MCP_ALLOWED_HOSTS", "").split(",") if h.strip()]
        for candidate in (host, f"{host}:*", "localhost:*", "127.0.0.1:*"):
            if candidate not in existing:
                existing.append(candidate)
        os.environ["AI_BRIDGE_MCP_ALLOWED_HOSTS"] = ",".join(existing)

    # Prefer in-process verify to avoid single-worker HTTP self-deadlock.
    os.environ["AI_BRIDGE_GATEWAY_VERIFY_URL"] = "inprocess:"
    return public


def _load_oauth_gateway():
    oauth_dir = Path(__file__).resolve().parents[3] / "deployment" / "oauth"
    path = str(oauth_dir)
    if path not in sys.path:
        sys.path.insert(0, path)
    import gateway  # type: ignore  # noqa: WPS433

    return gateway


def _install_inprocess_verify(gateway) -> None:
    def hook(bearer_token: str) -> dict:
        if gateway.admin_ok(bearer_token):
            return {"ok": True, "device_id": None}
        conn = gateway.connect()
        try:
            row = conn.execute(
                "SELECT * FROM tokens WHERE token_hash=? AND kind='access'",
                (gateway.digest(bearer_token),),
            ).fetchone()
            if not row or row["revoked"] or row["expires_at"] < int(time.time()):
                raise BindingError("gateway verify rejected the token")
            crow = conn.execute(
                "SELECT device_id FROM clients WHERE client_id=?", (row["client_id"],)
            ).fetchone()
            if crow is None:
                raise BindingError("gateway verify rejected the token")
            row_keys = row.keys() if hasattr(row, "keys") else []
            tok_dev = row["device_id"] if "device_id" in row_keys and row["device_id"] else None
            device_id = tok_dev or (crow["device_id"] if crow else None) or None
            return {"ok": True, "device_id": device_id, "client_id": row["client_id"]}
        finally:
            conn.close()

    set_verify_hook(hook)


class _PathPrefixDispatch:
    """Route /mcp and OAuth discovery to embedded apps; everything else to control."""

    def __init__(self, control: ASGIApp, mcp: ASGIApp | None, oauth: ASGIApp | None) -> None:
        self.control = control
        self.mcp = mcp
        self.oauth = oauth

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") not in ("http", "websocket"):
            await self.control(scope, receive, send)
            return
        path = scope.get("path") or ""
        if self.mcp is not None and (path == "/mcp" or path.startswith("/mcp/")):
            await self.mcp(scope, receive, send)
            return
        if self.oauth is not None and (
            path.startswith("/oauth")
            or path.startswith("/.well-known/oauth-")
            or path.startswith("/.well-known/openid-configuration")
            or path == "/internal/verify"
            or path.startswith("/internal/verify")
        ):
            await self.oauth(scope, receive, send)
            return
        await self.control(scope, receive, send)


def _lifespan_context(app: ASGIApp):
    """Return Starlette/FastAPI router.lifespan_context if present."""
    router = getattr(app, "router", None)
    if router is not None and hasattr(router, "lifespan_context"):
        return router.lifespan_context(app)
    return None


def create_combined_app():
    """Build the ASGI app used by `python -m ai_bridge.control`."""
    from .app import create_app

    if not _should_embed():
        return create_app()

    _prepare_embed_env()
    gateway = _load_oauth_gateway()
    _install_inprocess_verify(gateway)

    # Import MCP HTTP only after ALLOWED_HOSTS / VERIFY_URL env are set.
    from ai_bridge.server import create_http_app

    control = create_app()
    mcp_http = create_http_app()
    oauth = gateway.app
    dispatcher = _PathPrefixDispatch(control, mcp_http, oauth)

    # FastMCP Streamable HTTP requires its lifespan (task group) to run.
    # create_http_app wraps the Starlette app in bearer middleware; unwrap for lifespan.
    mcp_inner = getattr(mcp_http, "app", mcp_http)

    @asynccontextmanager
    async def lifespan(_app: Starlette):
        async with AsyncExitStack() as stack:
            for candidate in (mcp_inner, control, oauth):
                ctx = _lifespan_context(candidate)
                if ctx is not None:
                    await stack.enter_async_context(ctx)
            yield

    class _Combined(Starlette):
        async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
            if scope["type"] == "lifespan":
                await super().__call__(scope, receive, send)
                return
            await dispatcher(scope, receive, send)

    return _Combined(lifespan=lifespan)
