"""Structured logging configuration for AI Bridge.

Configures Python's logging with JSON output for production observability.
When running in Docker/Kubernetes, logs are emitted as newline-delimited JSON
objects for ingestion by Loki, DataDog, CloudWatch, etc.
"""
from __future__ import annotations

import json
import logging
import logging.config
import os
import sys
import time
import traceback
from typing import Any


class JSONFormatter(logging.Formatter):
    """Emit log records as newline-delimited JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        if record.exc_info and record.exc_info[0]:
            log_entry["exception"] = {
                "type": record.exc_info[0].__name__,
                "value": str(record.exc_info[1]),
                "traceback": "".join(traceback.format_exception(*record.exc_info)) if record.exc_info else None,
            }
        # Include extra fields set on the record
        for key, value in getattr(record, "extra", {}).items():
            log_entry[key] = value
        return json.dumps(log_entry, default=str)


def configure_logging(level: str | None = None) -> None:
    """Configure structured logging for the AI Bridge control plane.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR). Defaults to AI_BRIDGE_LOG_LEVEL or INFO.
    """
    log_level = (level or os.environ.get("AI_BRIDGE_LOG_LEVEL") or "INFO").upper()
    use_json = os.environ.get("AI_BRIDGE_JSON_LOGS", "1") in ("1", "true", "yes")

    handlers: dict[str, Any] = {
        "console": {
            "class": "logging.StreamHandler",
            "stream": sys.stdout,
            "formatter": "json" if use_json else "standard",
        },
    }

    logging.config.dictConfig({
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "json": {
                "()": JSONFormatter,
            },
            "standard": {
                "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
                "datefmt": "%Y-%m-%dT%H:%M:%S",
            },
        },
        "handlers": handlers,
        "root": {
            "level": log_level,
            "handlers": ["console"],
        },
        "loggers": {
            "ai_bridge": {
                "level": log_level,
                "handlers": ["console"],
                "propagate": False,
            },
            "uvicorn": {
                "level": log_level,
                "handlers": ["console"],
                "propagate": False,
            },
            "httpx": {
                "level": "WARNING",
                "handlers": ["console"],
                "propagate": False,
            },
        },
    })
