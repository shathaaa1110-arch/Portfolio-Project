"""Per-client request limits for endpoints that need no token (BE-09).

The counts live in this server process's memory. That is enough while the API runs as one
process (one Render instance, one worker). Two limits of this choice:
  - a restart forgets the counts;
  - with several workers or instances, each keeps its own counts, so the real limit is
    that many times higher. Move the counts to the database or Redis before scaling out.
"""
import math
import threading
import time
from collections import deque

from fastapi import Request

from app.core.config import get_settings
from app.core.errors import ApiError


class RateLimiter:
    """At most `limit` requests per client in any `window_seconds` (a sliding window)."""

    def __init__(self, limit: int, window_seconds: int, max_clients: int = 10_000):
        self.limit = limit
        self.window = window_seconds
        self.max_clients = max_clients
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()  # sync endpoints run on several threads at once

    def hit(self, key: str) -> int | None:
        """Count one request. Returns None if it is allowed, or the seconds to wait if not.

        A refused request is not counted, so a person who waits gets in again on time.
        """
        now = time.monotonic()
        with self._lock:
            hits = self._hits.get(key)
            if hits is None:
                self._forget_idle(now)
                hits = self._hits[key] = deque()
            while hits and hits[0] <= now - self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return max(1, math.ceil(hits[0] + self.window - now))
            hits.append(now)
            return None

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def _forget_idle(self, now: float) -> None:
        """Keep memory bounded: drop clients with no recent requests, then the oldest ones."""
        if len(self._hits) < self.max_clients:
            return
        for key in [k for k, v in self._hits.items() if not v or v[-1] <= now - self.window]:
            del self._hits[key]
        while len(self._hits) >= self.max_clients:
            del self._hits[next(iter(self._hits))]


def client_ip(request: Request) -> str:
    """The caller's address.

    Behind Render the connection comes from Render's proxy, so every caller would share one
    address. CLIENT_IP_HEADER names the header that carries the real one; it must be a header
    the proxy overwrites, never one the caller can set (not X-Forwarded-For, which Render
    appends to and does not clear).
    """
    header = get_settings().client_ip_header.strip()
    if header:
        value = request.headers.get(header, "").strip()
        if value:
            return value
    return request.client.host if request.client else "unknown"


def enforce(limiter: RateLimiter, request: Request) -> None:
    retry_after = limiter.hit(client_ip(request))
    if retry_after is not None:
        raise ApiError(429, "RATE_LIMITED", "Too many tries. Please wait and try again.",
                       retry_after_seconds=retry_after)
