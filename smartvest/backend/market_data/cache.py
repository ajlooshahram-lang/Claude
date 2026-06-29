"""
Simple in-memory cache with TTL (time-to-live).

Prevents redundant Yahoo Finance API calls within a short window.
Stock prices don't change every second — caching for 2 minutes is fine.
"""
import time
from typing import Any, Optional

_cache: dict[str, tuple[float, Any]] = {}
DEFAULT_TTL = 120  # 2 minutes


def get(key: str) -> Optional[Any]:
    """Get cached value if not expired."""
    if key in _cache:
        expires_at, value = _cache[key]
        if time.time() < expires_at:
            return value
        else:
            del _cache[key]
    return None


def set(key: str, value: Any, ttl: int = DEFAULT_TTL) -> None:
    """Store value with TTL in seconds."""
    _cache[key] = (time.time() + ttl, value)


def invalidate(key: str) -> None:
    """Remove a key from cache."""
    _cache.pop(key, None)


def clear() -> None:
    """Clear entire cache."""
    _cache.clear()
