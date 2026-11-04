"""The in-memory per-client limiter (app/core/rate_limit.py). No database needed."""
import pytest
from app.core import rate_limit
from app.core.config import get_settings
from app.core.rate_limit import RateLimiter, client_ip
from starlette.requests import Request


@pytest.fixture
def clock(monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(rate_limit.time, "monotonic", lambda: now[0])
    return now


def test_allows_the_limit_then_says_how_long_to_wait(clock):
    limiter = RateLimiter(limit=3, window_seconds=60)
    assert [limiter.hit("a") for _ in range(3)] == [None, None, None]
    clock[0] += 20
    assert limiter.hit("a") == 40  # the first try leaves the window in 40 seconds


def test_the_window_slides(clock):
    limiter = RateLimiter(limit=2, window_seconds=60)
    limiter.hit("a")
    clock[0] += 30
    limiter.hit("a")
    clock[0] += 31  # the first try is now older than the window
    assert limiter.hit("a") is None
    assert limiter.hit("a") is not None


def test_a_refused_try_is_not_counted(clock):
    limiter = RateLimiter(limit=1, window_seconds=60)
    limiter.hit("a")
    for _ in range(5):
        clock[0] += 10
        assert limiter.hit("a") is not None
    clock[0] += 10  # 60 seconds after the only counted try
    assert limiter.hit("a") is None


def test_clients_are_counted_apart(clock):
    limiter = RateLimiter(limit=1, window_seconds=60)
    assert limiter.hit("a") is None
    assert limiter.hit("b") is None
    assert limiter.hit("a") is not None


def test_memory_stays_bounded(clock):
    limiter = RateLimiter(limit=5, window_seconds=60, max_clients=3)
    for key in "abcdef":
        limiter.hit(key)
    assert len(limiter._hits) <= 3


def _request(headers=None, host="10.0.0.5"):
    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return Request({"type": "http", "headers": raw, "client": (host, 1234)})


@pytest.fixture
def ip_header(monkeypatch):
    def set_header(value):
        monkeypatch.setenv("CLIENT_IP_HEADER", value)
        get_settings.cache_clear()
    yield set_header
    get_settings.cache_clear()


def test_without_a_header_setting_the_connection_address_is_used(ip_header):
    ip_header("")
    assert client_ip(_request({"True-Client-IP": "203.0.113.9"})) == "10.0.0.5"


def test_the_configured_header_is_used_and_missing_falls_back(ip_header):
    ip_header("True-Client-IP")
    assert client_ip(_request({"True-Client-IP": " 203.0.113.9 "})) == "203.0.113.9"
    assert client_ip(_request()) == "10.0.0.5"
