"""Multi-Channel Alert Dispatcher for AI Bridge Control Plane.

Dispatches structured, rich formatted alert notifications across:
- Slack (Block Kit webhook cards)
- Discord (Rich embedded webhooks)
- Telegram (Telegram Bot API Markdown messages)
- PagerDuty & Generic Webhooks (JSON incident payloads)
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

logger = logging.getLogger("ai_bridge.alerts")


def get_alert_config() -> dict[str, str]:
    """Retrieve alert webhook endpoints and tokens from environment."""
    return {
        "slack_webhook": os.environ.get("SLACK_WEBHOOK_URL", "").strip(),
        "discord_webhook": os.environ.get("DISCORD_WEBHOOK_URL", "").strip(),
        "telegram_token": os.environ.get("TELEGRAM_BOT_TOKEN", "").strip(),
        "telegram_chat_id": os.environ.get("TELEGRAM_CHAT_ID", "").strip(),
        "generic_webhook": os.environ.get("ALERT_WEBHOOK_URL", "").strip(),
    }


def _send_http_json(url: str, payload: dict, headers: dict | None = None, timeout: float = 6.0) -> bool:
    """Send an HTTP POST request with a JSON body."""
    req_headers = {"Content-Type": "application/json", "User-Agent": "AI-Bridge-AlertEngine/1.0"}
    if headers:
        req_headers.update(headers)

    data = json.dumps(payload, default=str).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=req_headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 300
    except Exception as exc:
        logger.warning("Failed to dispatch alert to %s: %s", url, exc)
        return False


def _send_slack_alert(webhook_url: str, title: str, severity: str, details: dict, device_id: str | None) -> bool:
    """Format and send a Slack Block Kit alert message."""
    color = "#36a64f" if severity == "info" else "#f2c744" if severity == "warning" else "#e01e5a"
    fields = []
    if device_id:
        fields.append({"type": "mrkdwn", "text": f"*Device:* `{device_id}`"})
    for k, v in list(details.items())[:6]:
        fields.append({"type": "mrkdwn", "text": f"*{k.capitalize()}:* {v}"})

    payload = {
        "attachments": [
            {
                "color": color,
                "blocks": [
                    {
                        "type": "section",
                        "text": {"type": "mrkdwn", "text": f"*{severity.upper()}*: {title}"},
                    },
                    {"type": "section", "fields": fields} if fields else None,
                    {
                        "type": "context",
                        "elements": [
                            {"type": "mrkdwn", "text": f"AI Bridge Fleet Orchestrator • {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}"}
                        ],
                    },
                ],
            }
        ]
    }
    # Clean None blocks
    payload["attachments"][0]["blocks"] = [b for b in payload["attachments"][0]["blocks"] if b is not None]
    return _send_http_json(webhook_url, payload)


def _send_discord_alert(webhook_url: str, title: str, severity: str, details: dict, device_id: str | None) -> bool:
    """Format and send a Discord embedded webhook alert."""
    color_int = 0x2ECC71 if severity == "info" else 0xF1C40F if severity == "warning" else 0xE74C3C
    fields = []
    if device_id:
        fields.append({"name": "Device ID", "value": f"`{device_id}`", "inline": True})
    for k, v in list(details.items())[:6]:
        fields.append({"name": str(k).capitalize(), "value": str(v), "inline": True})

    payload = {
        "embeds": [
            {
                "title": f"[{severity.upper()}] {title}",
                "color": color_int,
                "fields": fields,
                "footer": {"text": "AI Bridge Fleet Management"},
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        ]
    }
    return _send_http_json(webhook_url, payload)


def _send_telegram_alert(token: str, chat_id: str, title: str, severity: str, details: dict, device_id: str | None) -> bool:
    """Format and send a Telegram message via Bot API."""
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    emoji = "ℹ️" if severity == "info" else "⚠️" if severity == "warning" else "🚨"
    msg_lines = [f"{emoji} *[{severity.upper()}] {title}*"]
    if device_id:
        msg_lines.append(f"• *Device:* `{device_id}`")
    for k, v in list(details.items())[:6]:
        msg_lines.append(f"• *{k}:* {v}")
    msg_lines.append(f"\n_Time: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}_")

    payload = {
        "chat_id": chat_id,
        "text": "\n".join(msg_lines),
        "parse_mode": "Markdown",
    }
    return _send_http_json(url, payload)


def _send_generic_alert(webhook_url: str, event_type: str, severity: str, title: str, details: dict, device_id: str | None) -> bool:
    """Send generic JSON incident payload."""
    payload = {
        "event_type": event_type,
        "severity": severity,
        "title": title,
        "device_id": device_id,
        "details": details,
        "timestamp": time.time(),
        "source": "ai-bridge-control-plane",
    }
    return _send_http_json(webhook_url, payload)


def dispatch_alert(
    event_type: str,
    severity: str,
    title: str,
    details: dict | None = None,
    device_id: str | None = None,
    async_dispatch: bool = True,
) -> dict[str, bool]:
    """Dispatch an alert across all configured channels."""
    cfg = get_alert_config()
    details_dict = details or {}
    results = {}

    def _worker():
        if cfg["slack_webhook"]:
            results["slack"] = _send_slack_alert(cfg["slack_webhook"], title, severity, details_dict, device_id)
        if cfg["discord_webhook"]:
            results["discord"] = _send_discord_alert(cfg["discord_webhook"], title, severity, details_dict, device_id)
        if cfg["telegram_token"] and cfg["telegram_chat_id"]:
            results["telegram"] = _send_telegram_alert(cfg["telegram_token"], cfg["telegram_chat_id"], title, severity, details_dict, device_id)
        if cfg["generic_webhook"]:
            results["webhook"] = _send_generic_alert(cfg["generic_webhook"], event_type, severity, title, details_dict, device_id)

    if async_dispatch:
        t = threading.Thread(target=_worker, daemon=True)
        t.start()
        return {"queued": True}
    else:
        _worker()
        return results
