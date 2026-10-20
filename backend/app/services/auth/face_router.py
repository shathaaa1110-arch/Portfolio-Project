"""Face login (experiment, not in the approved release scope).

1. A logged-in user registers a reference photo, with explicit consent.
2. Later they log in with their phone and a new photo instead of an SMS code.
3. They can turn it off, which deletes the stored photo.
"""
import base64
import binascii
from datetime import timedelta

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ApiError
from app.services.auth.dependencies import current_user
from app.services.auth.face import FaceServiceError, faces_match
from app.services.auth.models import FaceProfile, User, utcnow
from app.services.auth.phone import InvalidPhoneError, normalize_phone
from app.services.auth.router import _has_saved_preferences
from app.services.auth.tokens import TOKEN_TTL_SECONDS, create_access_token

MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_FAILED_ATTEMPTS = 5
LOCK_MINUTES = 15

router = APIRouter(prefix="/auth/face", tags=["face login (experiment)"])


class EnrollIn(BaseModel):
    image: str  # base64 JPEG or PNG
    consent: bool


class FaceLoginIn(BaseModel):
    phone: str
    image: str


def _decode_image(data: str) -> bytes:
    if "," in data and data.strip().startswith("data:"):
        data = data.split(",", 1)[1]
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        raise ApiError(422, "INVALID_IMAGE", "The photo could not be read.")
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise ApiError(422, "INVALID_IMAGE", "The photo must be a JPEG or PNG up to 2 MB.")
    if not (raw.startswith(b"\xff\xd8\xff") or raw.startswith(b"\x89PNG")):
        raise ApiError(422, "INVALID_IMAGE", "The photo must be a JPEG or PNG up to 2 MB.")
    return raw


@router.post("/enroll", status_code=201)
def enroll(body: EnrollIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Store (or replace) the user's reference photo. Requires explicit consent."""
    if not body.consent:
        raise ApiError(422, "CONSENT_REQUIRED", "Consent is required to store a face photo.")
    image = _decode_image(body.image)
    profile = db.get(FaceProfile, user.id)
    now = utcnow()
    if profile is None:
        db.add(FaceProfile(user_id=user.id, image=image, consented_at=now, created_at=now))
    else:
        profile.image, profile.consented_at = image, now
        profile.failed_attempts, profile.locked_until = 0, None
    db.commit()
    return {"message": "face login enabled"}


@router.delete("", status_code=204)
def disable(user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    """Turn face login off and delete the stored photo."""
    profile = db.get(FaceProfile, user.id)
    if profile is not None:
        db.delete(profile)
        db.commit()
    return Response(status_code=204)


@router.post("/login")
def face_login(body: FaceLoginIn, db: Session = Depends(get_db)) -> dict:
    """Log in with phone + a new photo. Same response as /auth/verify on success."""
    try:
        phone = normalize_phone(body.phone)
    except InvalidPhoneError:
        raise ApiError(422, "INVALID_PHONE", "Phone number must be in the format 05XXXXXXXX.")
    image = _decode_image(body.image)

    user = db.scalars(select(User).where(User.phone_number == phone)).first()
    profile = db.get(FaceProfile, user.id) if user else None
    if profile is None:
        # Same answer for "no account" and "no face registered", so phones cannot be probed.
        raise ApiError(404, "FACE_NOT_ENROLLED", "Face login is not set up for this phone. Log in with a code.")

    now = utcnow()
    if profile.locked_until and profile.locked_until > now:
        wait = int((profile.locked_until - now).total_seconds()) + 1
        raise ApiError(429, "TOO_MANY_ATTEMPTS", "Too many attempts. Log in with a code.", retry_after_seconds=wait)

    try:
        match = faces_match(str(user.id), profile.image, image)
    except FaceServiceError:
        raise ApiError(503, "FACE_SERVICE_FAILED", "Face check is not available. Log in with a code.")

    if not match:
        profile.failed_attempts += 1
        if profile.failed_attempts >= MAX_FAILED_ATTEMPTS:
            profile.failed_attempts = 0
            profile.locked_until = now + timedelta(minutes=LOCK_MINUTES)
        db.commit()
        raise ApiError(401, "FACE_MISMATCH", "The face does not match. Try again or log in with a code.")

    profile.failed_attempts, profile.locked_until = 0, None
    db.commit()
    return {
        "token": create_access_token(user.id),
        "expires_in_seconds": TOKEN_TTL_SECONDS,
        "user": {"id": str(user.id), "name": user.name, "has_saved_preferences": _has_saved_preferences(db, user)},
    }
