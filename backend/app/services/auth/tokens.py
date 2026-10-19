"""Login tokens (BE-04). A token is a signed JWT that names the user and expires."""
import uuid
from datetime import timedelta

import jwt

from app.core.config import get_settings
from app.services.auth.models import utcnow

TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60  # 30 days, matches the API contract
ALGORITHM = "HS256"


def create_access_token(user_id: uuid.UUID) -> str:
    secret = get_settings().secret_key
    if not secret:
        raise RuntimeError("SECRET_KEY is not set")
    now = utcnow()
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(seconds=TOKEN_TTL_SECONDS),
    }
    return jwt.encode(payload, secret, algorithm=ALGORITHM)
