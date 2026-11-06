"""Rate limiter with Redis backend (fallback to in-memory when Redis is unavailable).

Uses a sliding-window counter stored in Redis for multi-worker deployments.
When REDIS_URL is not set or Redis is unreachable, falls back to per-process
in-memory tracking (same as the original _RATE dict).
"""
from __future__ import annotations

import os
import threading
import time
from typing import Callable

from fastapi import HTTPException

_RATE: dict[str, list[float]] = {}
_RATE_LOCK = threading.Lock()
_redis_client = None
_redis_available = False


def _get_redis():
    global _redis_client, _redis_available
    if _redis_available:
        return _redis_client
    if _redis_client is None:
        url = os.environ.get("REDIS_URL") or os.environ.get("AI_BRIDGE_REDIS_URL")
        if url:
            try:
                import redis.asyncio as aioredis
                _redis_client = aioredis.from_url(url, decode_responses=True, socket_connect_timeout=2)
                _redis_available = True
                return _redis_client
            except Exception:
                _redis_available = False
                return None
    return None


async def _redis_rate_limit(key: str, limit: int = 120, window: int = 60) -> None:
    """Sliding-window rate limit using Redis sorted sets."""
    client = _get_redis()
    if client is None:
        _memory_rate_limit(key, limit, window)
        return
    now = time.time()
    window_start = now - window
    redis_key = f"ratelimit:{key}"
    try:
        pipe = client.pipeline()
        pipe.zremrangebyscore(redis_key, "-inf", window_start)
        pipe.zadd(redis_key, {str(now): now})
        pipe.zcard(redis_key)
        pipe.expire(redis_key, window * 2)
        _, _, count, _ = await pipe.execute()
        if count > limit:
            raise HTTPException(status_code=429, detail="Rate limit exceeded.")
    except HTTPException:
        raise
    except Exception:
        _memory_rate_limit(key, limit, window)


def _memory_rate_limit(key: str, limit: int = 120, window: int = 60) -> None:
    """Original in-memory sliding-window rate limit (fallback)."""
    now = time.time()
    with _RATE_LOCK:
        bucket = [t for t in _RATE.get(key, []) if now - t < window]
        bucket.append(now)
        _RATE[key] = bucket
        if len(bucket) > limit:
            raise HTTPException(status_code=429, detail="Rate limit exceeded.")


def rate_limit(key: str, limit: int = 120, window: int = 60) -> Callable[[], None]:
    """Return a synchronous rate-limit callable (uses Redis if available, else in-memory)."""
    if _get_redis() is not None:
        async def _check():
            await _redis_rate_limit(key, limit, window)

        def _sync_check():
            try:
                import asyncio
                loop = asyncio.new_event_loop()
                try:
                    loop.run_until_complete(_check())
                finally:
                    loop.close()
            except HTTPException:
                raise
            except Exception:
                _memory_rate_limit(key, limit, window)
        return _sync_check
    else:
        def _sync_check():
            _memory_rate_limit(key, limit, window)
        return _sync_check


def make_rate_limiter(limit: int = 120, window: int = 60) -> Callable[[str], None]:
    """Factory: returns a per-key rate-limit checker."""
    def checker(key: str) -> None:
        rate_limit(key, limit, window)()
    return checker
