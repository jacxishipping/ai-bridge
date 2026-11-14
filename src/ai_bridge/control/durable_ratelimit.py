"""Cross-worker rate limiting with Redis, DB, or in-process fallback (Phase 9)."""
from __future__ import annotations

import json
import os
import threading
import time
from typing import Any

_RATE_LOCK = threading.Lock()
_MEMORY: dict[str, list[float]] = {}
_SYNC_REDIS = None
_SYNC_REDIS_OK = False


def _redis_url() -> str:
    return (os.environ.get("REDIS_URL") or os.environ.get("AI_BRIDGE_REDIS_URL") or "").strip()


def _get_sync_redis():
    global _SYNC_REDIS, _SYNC_REDIS_OK
    if _SYNC_REDIS_OK:
        return _SYNC_REDIS
    url = _redis_url()
    if not url:
        return None
    if _SYNC_REDIS is None:
        try:
            import redis

            _SYNC_REDIS = redis.from_url(url, decode_responses=True, socket_connect_timeout=2)
            _SYNC_REDIS.ping()
            _SYNC_REDIS_OK = True
            return _SYNC_REDIS
        except Exception:
            _SYNC_REDIS = None
            _SYNC_REDIS_OK = False
    return None


def backend_name(conn: Any | None = None) -> str:
    if _get_sync_redis() is not None:
        return "redis"
    if conn is not None:
        return "database"
    return "memory"


def _memory_allow(key: str, limit: int, window: float) -> bool:
    now = time.time()
    with _RATE_LOCK:
        bucket = [t for t in _MEMORY.get(key, []) if now - t < window]
        if len(bucket) >= limit:
            _MEMORY[key] = bucket
            return False
        bucket.append(now)
        _MEMORY[key] = bucket
        return True


def _redis_allow(key: str, limit: int, window: float) -> bool | None:
    client = _get_sync_redis()
    if client is None:
        return None
    redis_key = f"aibridge:ratelimit:{key}"
    now = time.time()
    window_start = now - window
    try:
        pipe = client.pipeline()
        pipe.zremrangebyscore(redis_key, "-inf", window_start)
        pipe.zadd(redis_key, {f"{now:.6f}": now})
        pipe.zcard(redis_key)
        pipe.expire(redis_key, max(2, int(window * 2) + 1))
        _, _, count, _ = pipe.execute()
        return count <= limit
    except Exception:
        return None


def _db_allow(conn: Any, key: str, limit: int, window: float) -> bool:
    setting_key = f"ratelimit.{key}"
    now = time.time()
    row = conn.execute("SELECT value FROM settings WHERE key=?", (setting_key,)).fetchone()
    raw = None
    if row is not None:
        raw = row["value"] if hasattr(row, "keys") else row[0]
    data: dict[str, Any] = {"t0": now, "count": 0}
    if raw:
        try:
            data = json.loads(str(raw))
        except json.JSONDecodeError:
            data = {"t0": now, "count": 0}
    t0 = float(data.get("t0") or now)
    count = int(data.get("count") or 0)
    if now - t0 >= window:
        t0 = now
        count = 0
    if count >= limit:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (setting_key, json.dumps({"t0": t0, "count": count})),
        )
        conn.commit()
        return False
    count += 1
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (setting_key, json.dumps({"t0": t0, "count": count})),
    )
    conn.commit()
    return True


def allow(key: str, limit: int, window: float = 60.0, *, conn: Any | None = None) -> bool:
    """Return True if the request is within the rate limit."""
    redis_ok = _redis_allow(key, limit, window)
    if redis_ok is not None:
        return redis_ok
    if conn is not None:
        try:
            return _db_allow(conn, key, limit, window)
        except Exception:
            pass
    return _memory_allow(key, limit, window)