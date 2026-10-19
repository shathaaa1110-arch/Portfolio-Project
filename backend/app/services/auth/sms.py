"""Send verification codes by SMS (BE-04, OPS-14).

The API server generates the code; Authentica only delivers it.
In "mock" mode the code is printed to the console instead, so local
development does not spend SMS credits. The code is never logged in
"real" mode.
"""
import logging

import httpx

from app.core.config import get_settings
from app.services.auth.phone import to_international

AUTHENTICA_SEND_URL = "https://api.authentica.sa/api/v2/send-otp"
TIMEOUT_SECONDS = 10

logger = logging.getLogger(__name__)


class SmsSendError(Exception):
    """The code could not be sent. The endpoint turns this into 503 SMS_SEND_FAILED."""


def send_code(phone: str, code: str) -> None:
    """Deliver the code to a 05XXXXXXXX phone, or raise SmsSendError."""
    settings = get_settings()

    if settings.sms_mode == "mock":
        logger.warning("MOCK SMS to %s: verification code %s", phone, code)
        return

    if settings.sms_mode != "real":
        raise SmsSendError(f"Unknown SMS_MODE: {settings.sms_mode!r}")
    if not settings.authentica_api_key:
        raise SmsSendError("AUTHENTICA_API_KEY is not set")

    try:
        response = httpx.post(
            AUTHENTICA_SEND_URL,
            headers={
                "Accept": "application/json",
                "X-Authorization": settings.authentica_api_key,
            },
            json={"method": "sms", "phone": to_international(phone), "otp": code},
            timeout=TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as exc:
        raise SmsSendError("Could not reach Authentica") from exc

    try:
        sent = response.status_code == 200 and response.json().get("success") is True
    except ValueError:
        sent = False
    if not sent:
        raise SmsSendError(f"Authentica refused the request (HTTP {response.status_code})")
