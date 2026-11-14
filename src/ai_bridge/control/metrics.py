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

    STALE_RUNNING_TASKS = Gauge(
        "aibridge_stale_running_tasks",
        "Tasks in running state older than the configured lease window",
    )

    STALE_HEARTBEAT_DEVICES = Gauge(
        "aibridge_stale_heartbeat_devices",
        "Fleet devices marked online but past the heartbeat SLO window",
    )

    ADVANCED_PHASE_DEPTH = Gauge(
        "aibridge_advanced_phase_depth",
        "Roadmap phase depth (2=deep, 1=core) for phases 2-9",
        ["phase"],
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
    STALE_RUNNING_TASKS = None
    STALE_HEARTBEAT_DEVICES = None
    ADVANCED_PHASE_DEPTH = None

_PHASE_DEPTH = {
    "2": 2,
    "3": 2,
    "4": 2,
    "5": 2,
    "6": 2,
    "7": 2,
    "8": 2,
    "9": 2,
}


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

        from . import orchestration as orchmod

        from . import db as dbmod

        cutoff = dbmod.now() - orchmod.DEFAULT_RUNNING_LEASE_SEC
        stale_row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM tasks WHERE status='running' AND updated_at < ?",
            (cutoff,),
        ).fetchone()
        stale_cnt = stale_row["cnt"] if hasattr(stale_row, "keys") else (stale_row[0] if stale_row else 0)
        STALE_RUNNING_TASKS.set(stale_cnt)

        # Device counts by status
        dev_rows = conn.execute("SELECT status, os, COUNT(*) as cnt FROM devices WHERE revoked=0 GROUP BY status, os").fetchall()
        for r in dev_rows:
            st = r["status"] if hasattr(r, "keys") else r[0]
            os_name = (r["os"] if hasattr(r, "keys") else r[1]) or "unknown"
            cnt = r["cnt"] if hasattr(r, "keys") else r[2]
            ACTIVE_DEVICES.labels(status=st, os=os_name).set(cnt)

        from . import fleet_health as fleet_healthmod

        now_ts = dbmod.now()
        stale_hb = 0
        rows_hb = conn.execute(
            "SELECT status, last_seen FROM devices WHERE revoked=0",
        ).fetchall()
        for d in rows_hb:
            last_seen = d["last_seen"] or 0
            if d["status"] == "online" and last_seen and (now_ts - last_seen) >= fleet_healthmod.STALE_HEARTBEAT_SEC:
                stale_hb += 1
        STALE_HEARTBEAT_DEVICES.set(stale_hb)

        for phase, depth in _PHASE_DEPTH.items():
            ADVANCED_PHASE_DEPTH.labels(phase=phase).set(depth)
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


def build_metrics_summary(conn: Any) -> dict[str, Any]:
    """Operator-facing KPI summary without requiring Grafana."""
    from . import db as dbmod
    from . import fleet_health as fleet_healthmod

    now_ts = dbmod.now()
    window = now_ts - 3600.0
    queued = conn.execute("SELECT COUNT(*) AS c FROM tasks WHERE status='queued'").fetchone()["c"]
    running = conn.execute("SELECT COUNT(*) AS c FROM tasks WHERE status='running'").fetchone()["c"]
    completed_1h = conn.execute(
        "SELECT COUNT(*) AS c FROM tasks WHERE status='completed' AND updated_at>=?",
        (window,),
    ).fetchone()["c"]
    failed_1h = conn.execute(
        "SELECT COUNT(*) AS c FROM tasks WHERE status IN ('failed','timed_out') AND updated_at>=?",
        (window,),
    ).fetchone()["c"]
    # Approximate duration from created_at→updated_at for completed tasks in window
    dur_row = conn.execute(
        "SELECT AVG(updated_at - created_at) AS avg_d FROM tasks "
        "WHERE status='completed' AND updated_at>=? AND updated_at>created_at",
        (window,),
    ).fetchone()
    avg_duration = float(dur_row["avg_d"]) if dur_row and dur_row["avg_d"] is not None else None
    health = fleet_healthmod.summarize_fleet_health(conn)
    return {
        "ok": True,
        "ts": now_ts,
        "queue_depth": int(queued or 0),
        "running_tasks": int(running or 0),
        "completed_1h": int(completed_1h or 0),
        "failed_1h": int(failed_1h or 0),
        "avg_task_duration_sec": round(avg_duration, 2) if avg_duration is not None else None,
        "online_devices": health.get("online_devices"),
        "stale_device_count": health.get("stale_device_count"),
        "unhealthy_streams": health.get("unhealthy_streams"),
        "uptime_seconds": round(time.time() - _START_TIME, 1),
    }

