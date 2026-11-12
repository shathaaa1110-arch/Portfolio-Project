"""Login tokens (BE-04) and guest tokens (BE-09). Both are signed JWTs that expire.

A login token names a user. A guest token names one participant and the one outing it
belongs to, and carries "typ": "guest", so neither kind is accepted in place of the other.

A login token also carries the account's token_version as "ver". Logout raises the version, so
every older token of that account is refused from then on (checked against the database by
current_user and participant_of). A token without "ver" was issued before 0013 and counts as 0.
"""
import uuid
from datetime import datetime, timedelta

import jwt
from app.core.config import get_settings
from app.services.auth.models import utcnow

TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60  # 30 days, matches the API contract
ALGORITHM = "HS256"
GUEST = "guest"


def _secret() -> str:
    secret = get_settings().secret_key
    if not secret:
        raise RuntimeError("SECRET_KEY is not set")
    return secret


def create_access_token(user_id: uuid.UUID, version: int = 0) -> str:
    now = utcnow()
    payload = {
        "sub": str(user_id),
        "ver": version,
        "iat": now,
        "exp": now + timedelta(seconds=TOKEN_TTL_SECONDS),
    }
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def create_guest_token(participant_id: uuid.UUID, outing_id: uuid.UUID, expires_at: datetime) -> str:
    """A token for one guest in one outing, valid until `expires_at`."""
    payload = {
        "sub": str(participant_id),
        "oid": str(outing_id),
        "typ": GUEST,
        "iat": utcnow(),
        "exp": expires_at,
    }
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


class TokenError(Exception):
    """The token cannot be used. `expired` tells the two 401 cases apart."""

    def __init__(self, expired: bool):
        self.expired = expired


def _version(payload: dict) -> int:
    ver = payload.get("ver", 0)
    if not isinstance(ver, int) or isinstance(ver, bool) or ver < 0:
        raise TokenError(expired=False)
    return ver


def decode_access_token(token: str) -> uuid.UUID:
    """Return the user id inside a valid login token, or raise TokenError."""
    return decode_access_claims(token)[0]


def decode_access_claims(token: str) -> tuple[uuid.UUID, int]:
    """Return (user id, token version) inside a valid login token, or raise TokenError."""
    secret = _secret()
    try:
        payload = jwt.decode(
            token, secret, algorithms=[ALGORITHM], options={"require": ["sub", "exp"]}
        )
        if "typ" in payload:  # a guest token is never a login token
            raise TokenError(expired=False)
        return uuid.UUID(payload["sub"]), _version(payload)
    except jwt.ExpiredSignatureError:
        raise TokenError(expired=True)
    except (jwt.InvalidTokenError, ValueError):
        raise TokenError(expired=False)


def decode_guest_token(token: str) -> tuple[uuid.UUID, uuid.UUID]:
    """Return (participant_id, outing_id) inside a valid guest token, or raise TokenError.

    The caller must still check that the outing in the path is this outing and that the
    participant row still exists (the organizer may have removed the guest).
    """
    secret = _secret()
    try:
        payload = jwt.decode(
            token, secret, algorithms=[ALGORITHM], options={"require": ["sub", "oid", "typ", "exp"]}
        )
        if payload["typ"] != GUEST:
            raise TokenError(expired=False)
        return uuid.UUID(payload["sub"]), uuid.UUID(payload["oid"])
    except jwt.ExpiredSignatureError:
        raise TokenError(expired=True)
    except (jwt.InvalidTokenError, ValueError):
        raise TokenError(expired=False)


def decode_any_token(token: str) -> tuple[str, uuid.UUID, uuid.UUID | None, int]:
    """For endpoints that accept a login token or a guest token (BE-11).

    Returns ("user", user_id, None, version) or (GUEST, participant_id, outing_id, 0), or raises TokenError.
    """
    secret = _secret()
    try:
        payload = jwt.decode(
            token, secret, algorithms=[ALGORITHM], options={"require": ["sub", "exp"]}
        )
        if "typ" not in payload:
            return "user", uuid.UUID(payload["sub"]), None, _version(payload)
        if payload["typ"] == GUEST and "oid" in payload:
            return GUEST, uuid.UUID(payload["sub"]), uuid.UUID(payload["oid"]), 0
        raise TokenError(expired=False)
    except jwt.ExpiredSignatureError:
        raise TokenError(expired=True)
    except (jwt.InvalidTokenError, ValueError):
        raise TokenError(expired=False)
