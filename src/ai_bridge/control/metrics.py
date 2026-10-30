"""Prometheus Metrics & Observability Collector for AI Bridge Control Plane.

Exposes standard Prometheus metrics (/metrics) for monitoring fleet health,
task execution throughput, queue latencies, and active devices.
"""
from __future__ import annotations

import time
from typing import Any

try:
    from prometheus_client import (
        CONTENT_TYPE_LATEST,
        Counter,
        Gauge,
        Histogram,
        REGISTRY,
        generate_latest,
    )
    _PROMETHEUS_AVAILABLE = True
except ImportError:
    _PROMETHEUS_AVAILABLE = False
    CONTENT_TYPE_LATEST = "text/plain; version=0.0.4; charset=utf-8"

_START_TIME = time.time()

if _PROMETHEUS_AVAILABLE:
    # 1. Fleet & Device Gauges
    ACTIVE_DEVICES = Gauge(
        "aibridge_active_devices",
        "Number of managed fleet devices categorized by current status and OS",
        ["status", "os"],
    )

    # 2. Task Counters & Histograms
    TASKS_TOTAL = Counter(
        "aibridge_tasks_total",
        "Total count of tasks dispatched and processed",
        ["tool", "status"],
    )

    TASK_DURATION_SECONDS = Histogram(
        "aibridge_task_duration_seconds",
        "Execution latency of completed tasks in seconds",
        ["tool"],
        buckets=(0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0),
    )

    QUEUE_DEPTH = Gauge(
        "aibridge_queue_depth",
        "Current number of queued or pending tasks awaiting device pickup",
    )

    # 3. HTTP Request Metrics
    HTTP_REQUESTS_TOTAL = Counter(
        "aibridge_http_requests_total",
        "Total HTTP requests received by the control plane API",
        ["method", "endpoint", "status_code"],
    )

    UPTIME_SECONDS = Gauge(
        "aibridge_uptime_seconds",
        "Total uptime of the AI Bridge Control Plane in seconds",
    )
else:
    ACTIVE_DEVICES = None
    TASKS_TOTAL = None
    TASK_DURATION_SECONDS = None
    QUEUE_DEPTH = None
    HTTP_REQUESTS_TOTAL = None
    UPTIME_SECONDS = None


def record_task_execution(tool: str, status: str, duration: float | None = None) -> None:
    """Record metrics for a completed or failed task."""
    if not _PROMETHEUS_AVAILABLE:
        return
    TASKS_TOTAL.labels(tool=tool, status=status).inc()
    if duration is not None and duration > 0:
        TASK_DURATION_SECONDS.labels(tool=tool).observe(duration)


def record_http_request(method: str, endpoint: str, status_code: int) -> None:
    """Record metrics for an incoming HTTP request."""
    if not _PROMETHEUS_AVAILABLE:
        return
    HTTP_REQUESTS_TOTAL.labels(
        method=method,
        endpoint=endpoint,
        status_code=str(status_code),
    ).inc()


def update_fleet_gauges(conn: Any) -> None:
    """Synchronize gauge metrics with the database state."""
    if not _PROMETHEUS_AVAILABLE:
        return

    # Update uptime
    UPTIME_SECONDS.set(time.time() - _START_TIME)

    try:
        # Queue depth
        q_row = conn.execute("SELECT COUNT(*) AS cnt FROM tasks WHERE status='queued'").fetchone()
        q_depth = q_row["cnt"] if hasattr(q_row, "keys") else (q_row[0] if q_row else 0)
        QUEUE_DEPTH.set(q_depth)

        # Device counts by status
        dev_rows = conn.execute("SELECT status, os, COUNT(*) as cnt FROM devices WHERE revoked=0 GROUP BY status, os").fetchall()
        for r in dev_rows:
            st = r["status"] if hasattr(r, "keys") else r[0]
            os_name = (r["os"] if hasattr(r, "keys") else r[1]) or "unknown"
            cnt = r["cnt"] if hasattr(r, "keys") else r[2]
            ACTIVE_DEVICES.labels(status=st, os=os_name).set(cnt)
    except Exception:
        pass


def get_metrics_payload(conn: Any | None = None) -> tuple[bytes, str]:
    """Generate Prometheus exposition text format payload."""
    if conn is not None:
        update_fleet_gauges(conn)

    if _PROMETHEUS_AVAILABLE:
        return generate_latest(REGISTRY), CONTENT_TYPE_LATEST
    else:
        # Fallback plaintext payload if prometheus_client is absent
        uptime = time.time() - _START_TIME
        fallback = f"# AI Bridge Metrics (fallback)\naibridge_uptime_seconds {uptime:.2f}\n"
        return fallback.encode("utf-8"), CONTENT_TYPE_LATEST

