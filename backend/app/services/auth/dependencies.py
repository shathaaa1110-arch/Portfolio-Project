"""Who is calling? (BE-05)

Add `user: User = Depends(current_user)` to any endpoint that requires
Authorization. It returns the logged-in user, or answers 401 with the
contract codes TOKEN_EXPIRED / INVALID_TOKEN (Docs/TechnicalDoc.md, 4.3).
"""
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ApiError
from app.services.auth.models import User
from app.services.auth.tokens import TokenError, decode_access_token

# auto_error=False: we return our own error shape instead of FastAPI's default.
bearer = HTTPBearer(auto_error=False)


def _invalid() -> ApiError:
    return ApiError(401, "INVALID_TOKEN", "Please log in again.")


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None or creds.scheme.lower() != "bearer" or not creds.credentials:
        raise _invalid()
    try:
        user_id = decode_access_token(creds.credentials)
    except TokenError as exc:
        if exc.expired:
            raise ApiError(401, "TOKEN_EXPIRED", "Your session has expired. Please log in again.")
        raise _invalid()

    user = db.get(User, user_id)
    if user is None:  # account was deleted after the token was issued
        raise _invalid()
    return user
