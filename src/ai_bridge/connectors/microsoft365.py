"""Microsoft 365 connector (Microsoft Graph, delegated OAuth 2.0 + PKCE).

Configuration (environment only):
  AI_BRIDGE_M365_CLIENT_ID      Entra app registration (application) ID  [required]
  AI_BRIDGE_M365_REDIRECT_URI   e.g. https://your-domain/api/connectors/m365/callback [required]
  AI_BRIDGE_M365_TOKEN_KEY      Fernet key used to encrypt stored tokens   [required]
                                (generate: python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())")
  AI_BRIDGE_M365_TENANT         Entra tenant ID or "common" (default "common")
  AI_BRIDGE_M365_CLIENT_SECRET  Only for confidential-client registrations (optional with PKCE)
  AI_BRIDGE_M365_ALLOW_WRITE    "1" to request write scopes and enable write tools (default off)

Security model:
- Read tools are Tier 1. ``m365_create_event`` is Tier 3. ``m365_send_mail`` is
  Tier 4 (always needs an approved human approval record) -- see policy.TOOL_TIERS.
- Write scopes are only requested when ALLOW_WRITE is set, so Microsoft itself
  refuses writes otherwise.
- Refresh/access tokens are stored Fernet-encrypted at rest, file mode 0600,
  and are never returned by any tool, route, or log line.
- Tool arguments can never choose the Graph host; only fixed Graph paths are used.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import threading
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
LOGIN_BASE = "https://login.microsoftonline.com"
READ_SCOPES = ["User.Read", "Mail.Read", "Calendars.Read", "Files.Read", "offline_access"]
WRITE_SCOPES = ["Mail.Send", "Calendars.ReadWrite"]
DEFAULT_ACCOUNT = "default"
MAX_TOP = 50

_PENDING: dict[str, dict] = {}
_LOCK = threading.Lock()
# Overridable in tests to inject httpx.MockTransport.
_TRANSPORT: httpx.BaseTransport | None = None


class M365Error(RuntimeError):
    """Connector failure (not configured, not connected, or Graph error)."""


# --------------------------------------------------------------------------- config
def config() -> dict | None:
    client_id = os.environ.get("AI_BRIDGE_M365_CLIENT_ID", "").strip()
    redirect = os.environ.get("AI_BRIDGE_M365_REDIRECT_URI", "").strip()
    key = os.environ.get("AI_BRIDGE_M365_TOKEN_KEY", "").strip()
    if not (client_id and redirect and key):
        return None
    allow_write = os.environ.get("AI_BRIDGE_M365_ALLOW_WRITE", "0").strip().lower() in {"1", "true", "yes", "on"}
    return {
        "client_id": client_id,
        "redirect_uri": redirect,
        "token_key": key,
        "tenant": os.environ.get("AI_BRIDGE_M365_TENANT", "common").strip() or "common",
        "client_secret": os.environ.get("AI_BRIDGE_M365_CLIENT_SECRET", "").strip(),
        "allow_write": allow_write,
    }


def _require_config() -> dict:
    cfg = config()
    if cfg is None:
        raise M365Error("Microsoft 365 connector is not configured.")
    return cfg


def scopes(cfg: dict) -> list[str]:
    return READ_SCOPES + (WRITE_SCOPES if cfg["allow_write"] else [])


def _client() -> httpx.Client:
    return httpx.Client(timeout=20, transport=_TRANSPORT)


# --------------------------------------------------------------------------- token store
def _store_path() -> Path:
    base = Path(os.path.expandvars(os.environ.get("AI_BRIDGE_DATA_DIR", str(Path.home() / ".ai-bridge")))).expanduser()
    return base / "m365_tokens.enc"


def _fernet(cfg: dict):
    from cryptography.fernet import Fernet

    try:
        return Fernet(cfg["token_key"].encode())
    except Exception as exc:  # invalid key material
        raise M365Error("AI_BRIDGE_M365_TOKEN_KEY is not a valid Fernet key.") from exc


def _load_all(cfg: dict) -> dict[str, dict]:
    path = _store_path()
    if not path.exists():
        return {}
    from cryptography.fernet import InvalidToken

    try:
        return json.loads(_fernet(cfg).decrypt(path.read_bytes()))
    except InvalidToken as exc:
        raise M365Error("Stored Microsoft 365 tokens cannot be decrypted with the configured key.") from exc


def _save_all(cfg: dict, data: dict[str, dict]) -> None:
    path = _store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(_fernet(cfg).encrypt(json.dumps(data).encode()))
    try:
        os.chmod(tmp, 0o600)
    except OSError:
        pass
    os.replace(tmp, path)


def _put_tokens(cfg: dict, account: str, tok: dict, prev: dict | None = None) -> dict:
    record = {
        "access_token": tok["access_token"],
        # Microsoft may omit a new refresh token on refresh; keep the old one.
        "refresh_token": tok.get("refresh_token") or (prev or {}).get("refresh_token", ""),
        "expires_at": time.time() + int(tok.get("expires_in", 3600)) - 60,
        "scope": tok.get("scope", ""),
    }
    with _LOCK:
        data = _load_all(cfg)
        data[account] = record
        _save_all(cfg, data)
    return record


def disconnect(account: str = DEFAULT_ACCOUNT) -> bool:
    cfg = _require_config()
    with _LOCK:
        data = _load_all(cfg)
        removed = data.pop(account, None) is not None
        _save_all(cfg, data)
    return removed


# --------------------------------------------------------------------------- OAuth (PKCE)
def new_login(account: str = DEFAULT_ACCOUNT) -> str:
    """Return the Microsoft authorize URL for a fresh PKCE login attempt."""
    cfg = _require_config()
    state = secrets.token_urlsafe(24)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    now = time.time()
    with _LOCK:
        _PENDING[state] = {"verifier": verifier, "account": account, "at": now}
        for k in [k for k, v in _PENDING.items() if now - v["at"] > 600]:
            _PENDING.pop(k, None)
    params = {
        "client_id": cfg["client_id"],
        "response_type": "code",
        "redirect_uri": cfg["redirect_uri"],
        "response_mode": "query",
        "scope": " ".join(scopes(cfg)),
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    return f"{LOGIN_BASE}/{cfg['tenant']}/oauth2/v2.0/authorize?{urlencode(params)}"


def _token_request(cfg: dict, data: dict) -> dict:
    data = {"client_id": cfg["client_id"], "scope": " ".join(scopes(cfg)), **data}
    if cfg["client_secret"]:
        data["client_secret"] = cfg["client_secret"]
    with _client() as client:
        resp = client.post(f"{LOGIN_BASE}/{cfg['tenant']}/oauth2/v2.0/token", data=data)
    if resp.status_code != 200:
        # Never echo the response body: it can include tokens or tenant details.
        raise M365Error(f"Microsoft token endpoint rejected the request (HTTP {resp.status_code}).")
    return resp.json()


def complete_login(code: str, state: str) -> str:
    """Exchange the authorization code. Returns the account name connected."""
    cfg = _require_config()
    with _LOCK:
        pending = _PENDING.pop(state, None)
    if pending is None or time.time() - pending["at"] > 600 or not code:
        raise M365Error("Invalid or expired login attempt.")
    tok = _token_request(cfg, {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": cfg["redirect_uri"],
        "code_verifier": pending["verifier"],
    })
    _put_tokens(cfg, pending["account"], tok)
    return pending["account"]


def status(account: str = DEFAULT_ACCOUNT) -> dict:
    cfg = config()
    if cfg is None:
        return {"configured": False, "connected": False}
    try:
        rec = _load_all(cfg).get(account)
    except M365Error:
        return {"configured": True, "connected": False, "error": "token store unreadable"}
    return {
        "configured": True,
        "connected": rec is not None,
        "write_enabled": cfg["allow_write"],
        "scopes": scopes(cfg),
        "access_token_valid": bool(rec and rec["expires_at"] > time.time()),
    }


def _access_token(cfg: dict, account: str) -> str:
    with _LOCK:
        rec = _load_all(cfg).get(account)
    if rec is None:
        raise M365Error("Microsoft 365 is not connected. Complete the sign-in from the dashboard first.")
    if rec["expires_at"] > time.time():
        return rec["access_token"]
    if not rec.get("refresh_token"):
        raise M365Error("Microsoft 365 session expired; sign in again.")
    tok = _token_request(cfg, {"grant_type": "refresh_token", "refresh_token": rec["refresh_token"]})
    return _put_tokens(cfg, account, tok, prev=rec)["access_token"]


# --------------------------------------------------------------------------- Graph
def graph(method: str, path: str, *, account: str = DEFAULT_ACCOUNT,
          params: dict | None = None, body: dict | None = None) -> Any:
    if not path.startswith("/"):
        raise ValueError("Graph path must start with '/'.")
    cfg = _require_config()
    headers = {"Authorization": f"Bearer {_access_token(cfg, account)}"}
    with _client() as client:
        resp = client.request(method, GRAPH_BASE + path, params=params, json=body, headers=headers)
    if resp.status_code >= 400:
        code = ""
        try:
            code = resp.json().get("error", {}).get("code", "")
        except Exception:
            pass
        raise M365Error(f"Microsoft Graph error (HTTP {resp.status_code}{': ' + code if code else ''}).")
    return resp.json() if resp.content else {}


def _top(value: Any, default: int = 10) -> int:
    try:
        return max(1, min(int(value), MAX_TOP))
    except (TypeError, ValueError):
        return default


def _acct(a: dict) -> str:
    return str(a.get("account") or DEFAULT_ACCOUNT)


def _odata_quote(text: str) -> str:
    return text.replace("'", "''")


def _slim_message(m: dict) -> dict:
    return {
        "id": m.get("id"),
        "subject": m.get("subject"),
        "from": (m.get("from") or {}).get("emailAddress"),
        "received": m.get("receivedDateTime"),
        "is_read": m.get("isRead"),
        "preview": m.get("bodyPreview"),
        "web_link": m.get("webLink"),
    }


_MSG_FIELDS = "id,subject,from,receivedDateTime,isRead,bodyPreview,webLink"


# --------------------------------------------------------------------------- tools (read-only)
def get_profile(a: dict) -> dict:
    p = graph("GET", "/me", account=_acct(a), params={"$select": "displayName,mail,userPrincipalName,jobTitle"})
    return {k: p.get(k) for k in ("displayName", "mail", "userPrincipalName", "jobTitle")}


def list_mail(a: dict) -> dict:
    folder = str(a.get("folder", "inbox"))
    if not folder.replace("_", "").isalnum():
        raise ValueError("Invalid mail folder name.")
    data = graph("GET", f"/me/mailFolders/{folder}/messages", account=_acct(a), params={
        "$top": _top(a.get("top")), "$select": _MSG_FIELDS, "$orderby": "receivedDateTime desc"})
    return {"messages": [_slim_message(m) for m in data.get("value", [])]}


def search_mail(a: dict) -> dict:
    query = str(a.get("query", "")).strip()
    if not query:
        raise ValueError("query is required.")
    data = graph("GET", "/me/messages", account=_acct(a), params={
        "$top": _top(a.get("top")), "$select": _MSG_FIELDS, "$search": f'"{query.replace(chr(34), "")}"'})
    return {"messages": [_slim_message(m) for m in data.get("value", [])]}


def get_mail(a: dict) -> dict:
    mid = str(a.get("message_id", ""))
    if not mid or "/" in mid:
        raise ValueError("A valid message_id is required.")
    m = graph("GET", f"/me/messages/{mid}", account=_acct(a), params={
        "$select": _MSG_FIELDS + ",toRecipients,body"})
    out = _slim_message(m)
    out["to"] = [r.get("emailAddress") for r in m.get("toRecipients", [])]
    out["body_text"] = (m.get("body") or {}).get("content", "")[:20000]
    return out


def list_events(a: dict) -> dict:
    start, end = a.get("start"), a.get("end")
    if start and end:
        data = graph("GET", "/me/calendarView", account=_acct(a), params={
            "startDateTime": str(start), "endDateTime": str(end), "$top": _top(a.get("top")),
            "$select": "id,subject,start,end,location,organizer,webLink", "$orderby": "start/dateTime"})
    else:
        data = graph("GET", "/me/events", account=_acct(a), params={
            "$top": _top(a.get("top")), "$select": "id,subject,start,end,location,organizer,webLink",
            "$orderby": "start/dateTime desc"})
    return {"events": data.get("value", [])}


def _slim_item(i: dict) -> dict:
    return {
        "id": i.get("id"), "name": i.get("name"), "size": i.get("size"),
        "modified": i.get("lastModifiedDateTime"), "web_url": i.get("webUrl"),
        "kind": "folder" if "folder" in i else "file",
    }


def list_files(a: dict) -> dict:
    path = str(a.get("path", "")).strip("/")
    if ".." in path.split("/"):
        raise ValueError("Path traversal is not allowed.")
    endpoint = "/me/drive/root/children" if not path else f"/me/drive/root:/{path}:/children"
    data = graph("GET", endpoint, account=_acct(a), params={"$top": _top(a.get("top"), 25)})
    return {"items": [_slim_item(i) for i in data.get("value", [])]}


def search_files(a: dict) -> dict:
    query = str(a.get("query", "")).strip()
    if not query:
        raise ValueError("query is required.")
    data = graph("GET", f"/me/drive/root/search(q='{_odata_quote(query)}')", account=_acct(a),
                 params={"$top": _top(a.get("top"), 25)})
    return {"items": [_slim_item(i) for i in data.get("value", [])]}


# --------------------------------------------------------------------------- tools (write)
def _require_write() -> None:
    if not _require_config()["allow_write"]:
        raise M365Error("Microsoft 365 write tools are disabled (AI_BRIDGE_M365_ALLOW_WRITE is not set).")


def _recipients(value: Any) -> list[dict]:
    if isinstance(value, str):
        value = [value]
    if not value or not isinstance(value, list):
        raise ValueError("At least one recipient is required.")
    for addr in value:
        if not isinstance(addr, str) or "@" not in addr or any(c in addr for c in " \r\n,;<>"):
            raise ValueError(f"Invalid email address: {addr!r}")
    return [{"emailAddress": {"address": addr}} for addr in value]


def send_mail(a: dict) -> dict:
    _require_write()
    subject = str(a.get("subject", ""))
    if not subject:
        raise ValueError("subject is required.")
    graph("POST", "/me/sendMail", account=_acct(a), body={"message": {
        "subject": subject,
        "body": {"contentType": "Text", "content": str(a.get("body", ""))},
        "toRecipients": _recipients(a.get("to")),
    }, "saveToSentItems": True})
    return {"sent": True, "to": [r["emailAddress"]["address"] for r in _recipients(a.get("to"))], "subject": subject}


def create_event(a: dict) -> dict:
    _require_write()
    subject, start, end = str(a.get("subject", "")), a.get("start"), a.get("end")
    if not (subject and start and end):
        raise ValueError("subject, start and end are required.")
    tz = str(a.get("timezone", "UTC"))
    body: dict = {"subject": subject, "start": {"dateTime": str(start), "timeZone": tz},
                  "end": {"dateTime": str(end), "timeZone": tz}}
    if a.get("attendees"):
        body["attendees"] = [{**r, "type": "required"} for r in _recipients(a["attendees"])]
    ev = graph("POST", "/me/events", account=_acct(a), body=body)
    return {"id": ev.get("id"), "subject": ev.get("subject"), "web_link": ev.get("webLink")}


# --------------------------------------------------------------------------- registry
TOOLS: dict[str, Any] = {
    "m365_get_profile": get_profile, "m365_list_mail": list_mail, "m365_search_mail": search_mail,
    "m365_get_mail": get_mail, "m365_list_events": list_events, "m365_list_files": list_files,
    "m365_search_files": search_files, "m365_create_event": create_event, "m365_send_mail": send_mail,
}

_ACCOUNT = {"type": "string", "description": "Connected account name (default: 'default')."}
_TOP = {"type": "integer", "description": f"Max results (1-{MAX_TOP}).", "default": 10}


def _spec(description: str, properties: dict | None = None, required: list[str] | None = None) -> dict:
    schema: dict = {"type": "object", "properties": {"account": _ACCOUNT, **(properties or {})}}
    if required:
        schema["required"] = required
    return {"description": description, "category": "microsoft365", "parameters": schema}


TOOL_SPECS: dict[str, dict] = {
    "m365_get_profile": _spec("Get the signed-in Microsoft 365 user's profile."),
    "m365_list_mail": _spec("List recent Outlook messages.", {
        "folder": {"type": "string", "description": "inbox, sentitems, drafts, ...", "default": "inbox"}, "top": _TOP}),
    "m365_search_mail": _spec("Search Outlook messages by keyword.", {
        "query": {"type": "string", "description": "Search text."}, "top": _TOP}, ["query"]),
    "m365_get_mail": _spec("Read one Outlook message (text body, truncated).", {
        "message_id": {"type": "string"}}, ["message_id"]),
    "m365_list_events": _spec("List Outlook calendar events, optionally within a time window.", {
        "start": {"type": "string", "description": "ISO 8601 window start."},
        "end": {"type": "string", "description": "ISO 8601 window end."}, "top": _TOP}),
    "m365_list_files": _spec("List OneDrive files/folders under a path.", {
        "path": {"type": "string", "description": "Folder path relative to drive root.", "default": ""}, "top": _TOP}),
    "m365_search_files": _spec("Search OneDrive/SharePoint files by name or content.", {
        "query": {"type": "string"}, "top": _TOP}, ["query"]),
    "m365_create_event": _spec("Create a calendar event (Tier 3; needs ALLOW_WRITE).", {
        "subject": {"type": "string"}, "start": {"type": "string", "description": "ISO 8601 local time."},
        "end": {"type": "string"}, "timezone": {"type": "string", "default": "UTC"},
        "attendees": {"type": "array", "items": {"type": "string"}}}, ["subject", "start", "end"]),
    "m365_send_mail": _spec("Send an email as the user (Tier 4: requires human approval; needs ALLOW_WRITE).", {
        "to": {"type": "array", "items": {"type": "string"}}, "subject": {"type": "string"},
        "body": {"type": "string"}}, ["to", "subject", "body"]),
}
