"""Compare two face photos through Authentica (face login experiment).

Authentica does not store faces: every call sends the registered photo
and the new photo, and answers whether they show the same person.
Its "result" field comes back as the text "true" or "false", so only the
exact text "true" counts as a match.
"""
import base64
import logging

import httpx

from app.core.config import get_settings

AUTHENTICA_FACE_URL = "https://api.authentica.sa/api/v2/verify-by-face"
TIMEOUT_SECONDS = 30

logger = logging.getLogger(__name__)


class FaceServiceError(Exception):
    """Authentica could not answer. The endpoint turns this into 503 FACE_SERVICE_FAILED."""


def faces_match(user_id: str, registered: bytes, query: bytes) -> bool:
    settings = get_settings()

    if settings.face_mode == "mock":
        return registered == query
    if settings.face_mode != "real":
        raise FaceServiceError(f"unknown FACE_MODE: {settings.face_mode!r}")
    if not settings.authentica_api_key:
        raise FaceServiceError("AUTHENTICA_API_KEY is not set")

    body = {
        "user_id": user_id,
        "registered_face_image": base64.b64encode(registered).decode(),
        "query_face_image": base64.b64encode(query).decode(),
    }
    headers = {
        "X-Authorization": settings.authentica_api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    try:
        response = httpx.post(AUTHENTICA_FACE_URL, json=body, headers=headers, timeout=TIMEOUT_SECONDS)
        data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.error("Authentica face request failed: %s", exc)
        raise FaceServiceError("network error") from exc

    if response.status_code != 200 or not data.get("success"):
        logger.error("Authentica face check rejected: status %s", response.status_code)
        raise FaceServiceError("provider rejected the request")

    return str(data.get("data", {}).get("result", "")).lower() == "true"
