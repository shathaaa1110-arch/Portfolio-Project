import httpx
import pytest

from app.core.config import Settings
from app.services.auth import sms


def use_settings(monkeypatch, **values):
    monkeypatch.setattr(sms, "get_settings", lambda: Settings(**values))


class FakeResponse:
    def __init__(self, status_code, body):
        self.status_code = status_code
        self._body = body

    def json(self):
        return self._body


def test_mock_mode_does_not_call_authentica(monkeypatch):
    use_settings(monkeypatch, sms_mode="mock")

    def fail(*args, **kwargs):
        raise AssertionError("httpx.post must not be called in mock mode")

    monkeypatch.setattr(sms.httpx, "post", fail)
    sms.send_code("0551234567", "123456")


def test_real_mode_sends_our_code_in_international_format(monkeypatch):
    use_settings(monkeypatch, sms_mode="real", authentica_api_key="test-key")
    calls = []

    def fake_post(url, headers, json, timeout):
        calls.append({"url": url, "headers": headers, "json": json})
        return FakeResponse(200, {"success": True})

    monkeypatch.setattr(sms.httpx, "post", fake_post)
    sms.send_code("0551234567", "482915")

    assert calls[0]["url"] == sms.AUTHENTICA_SEND_URL
    assert calls[0]["headers"]["X-Authorization"] == "test-key"
    assert calls[0]["json"] == {"method": "sms", "phone": "+966551234567", "otp": "482915"}


def test_real_mode_without_key_fails(monkeypatch):
    use_settings(monkeypatch, sms_mode="real", authentica_api_key="")
    with pytest.raises(sms.SmsSendError):
        sms.send_code("0551234567", "123456")


def test_authentica_refusal_raises(monkeypatch):
    use_settings(monkeypatch, sms_mode="real", authentica_api_key="test-key")
    monkeypatch.setattr(sms.httpx, "post", lambda *a, **k: FakeResponse(200, {"success": False}))
    with pytest.raises(sms.SmsSendError):
        sms.send_code("0551234567", "123456")


def test_network_error_raises(monkeypatch):
    use_settings(monkeypatch, sms_mode="real", authentica_api_key="test-key")

    def broken(*args, **kwargs):
        raise httpx.ConnectError("no network")

    monkeypatch.setattr(sms.httpx, "post", broken)
    with pytest.raises(sms.SmsSendError):
        sms.send_code("0551234567", "123456")
