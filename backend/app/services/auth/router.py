"""Sign up and log in with a verification code (BE-04).

See Docs/TechnicalDoc.md, section 4.3. Sign-up and log-in are the same flow:
the account is created in /auth/verify only when the phone has none yet.
"""
import math
from datetime import timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import Uuid, bindparam, select, text, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.errors import ApiError
from app.services.auth.models import OtpCode, User, utcnow
from app.services.auth.otp import (
    CODE_LENGTH,
    CODE_TTL_SECONDS,
    MAX_ATTEMPTS,
    code_matches,
    generate_code,
    hash_code,
)
from app.services.auth.phone import InvalidPhoneError, normalize_phone
from app.services.auth.sms import SmsSendError, send_code
from app.services.auth.tokens import TOKEN_TTL_SECONDS, create_access_token

RESEND_WAIT_SECONDS = 60

router = APIRouter(prefix="/auth", tags=["auth"])


class PhoneIn(BaseModel):
    phone: str


class VerifyIn(BaseModel):
    phone: str
    code: str
    name: str | None = None


def _phone_or_422(raw: str) -> str:
    try:
        return normalize_phone(raw)
    except InvalidPhoneError:
        raise ApiError(422, "INVALID_PHONE", "Phone number must be in the format 05XXXXXXXX.")


def _latest_code(db: Session, phone: str) -> OtpCode | None:
    stmt = select(OtpCode).where(OtpCode.phone == phone).order_by(OtpCode.created_at.desc()).limit(1)
    return db.scalars(stmt).first()


def _issue_code(db: Session, phone: str) -> dict:
    """Rate-limit, replace any earlier code, store the new hash, and send the SMS."""
    now = utcnow()
    latest = _latest_code(db, phone)
    if latest is not None:
        waited = (now - latest.created_at).total_seconds()
        if waited < RESEND_WAIT_SECONDS:
            raise ApiError(
                429,
                "RATE_LIMITED",
                "Please wait before requesting another code.",
                retry_after_seconds=math.ceil(RESEND_WAIT_SECONDS - waited),
            )

    # Only the newest code may work: expire every earlier unused one.
    db.execute(
        update(OtpCode)
        .where(OtpCode.phone == phone, OtpCode.used_at.is_(None), OtpCode.expires_at > now)
        .values(expires_at=now)
    )

    code = generate_code()
    db.add(
        OtpCode(
            phone=phone,
            code_hash=hash_code(phone, code, get_settings().secret_key),
            expires_at=now + timedelta(seconds=CODE_TTL_SECONDS),
            created_at=now,
        )
    )
    db.flush()

    try:
        send_code(phone, code)
    except SmsSendError:
        db.rollback()  # nothing saved, so the user can retry at once
        raise ApiError(503, "SMS_SEND_FAILED", "Could not send the code. Please try again.")

    db.commit()
    return {
        "message": "verification code sent",
        "code_length": CODE_LENGTH,
        "expires_in_seconds": CODE_TTL_SECONDS,
    }


@router.post("/request-code")
def request_code(body: PhoneIn, db: Session = Depends(get_db)) -> dict:
    """Send a code for sign up or log in. Same response whether or not the phone has an account."""
    phone = _phone_or_422(body.phone)
    return _issue_code(db, phone)


@router.post("/resend-code")
def resend_code(body: PhoneIn, db: Session = Depends(get_db)) -> dict:
    """Send a new code to a phone that already requested one. The previous code stops working."""
    phone = _phone_or_422(body.phone)
    if _latest_code(db, phone) is None:
        raise ApiError(404, "NO_PENDING_CODE", "Request a code first.")
    result = _issue_code(db, phone)
    result["message"] = "new code sent"
    return result


def _has_saved_preferences(db: Session, user: User) -> bool:
    stmt = text("SELECT 1 FROM preferences WHERE user_id = :uid LIMIT 1").bindparams(
        bindparam("uid", type_=Uuid)
    )
    return db.execute(stmt, {"uid": user.id}).first() is not None


@router.post("/verify")
def verify(body: VerifyIn, db: Session = Depends(get_db)) -> dict:
    """Check the code; create the account on first login; return a token."""
    phone = _phone_or_422(body.phone)
    now = utcnow()

    stmt = (
        select(OtpCode)
        .where(OtpCode.phone == phone, OtpCode.used_at.is_(None))
        .order_by(OtpCode.created_at.desc())
        .limit(1)
    )
    otp = db.scalars(stmt).first()
    if otp is None:
        raise ApiError(401, "INVALID_CODE", "This code is incorrect.")

    if otp.attempts >= MAX_ATTEMPTS:
        raise ApiError(
            429,
            "TOO_MANY_ATTEMPTS",
            "Too many attempts. Request a new code.",
            retry_after_seconds=RESEND_WAIT_SECONDS,
        )
    if otp.expires_at <= now:
        raise ApiError(401, "CODE_EXPIRED", "This code has expired. Request a new one.")

    if not code_matches(phone, body.code.strip(), otp.code_hash, get_settings().secret_key):
        otp.attempts += 1
        db.commit()
        if otp.attempts >= MAX_ATTEMPTS:
            raise ApiError(
                429,
                "TOO_MANY_ATTEMPTS",
                "Too many attempts. Request a new code.",
                retry_after_seconds=RESEND_WAIT_SECONDS,
            )
        raise ApiError(401, "INVALID_CODE", "This code is incorrect.")

    user = db.scalars(select(User).where(User.phone_number == phone)).first()
    if user is None:
        name = (body.name or "").strip()
        if not name:
            # The code stays unused so the app can send it again with a name.
            raise ApiError(422, "NAME_REQUIRED", "Name is required to create a new account.")
        user = User(name=name, phone_number=phone, created_at=now)
        db.add(user)

    otp.used_at = now
    db.commit()

    return {
        "token": create_access_token(user.id),
        "expires_in_seconds": TOKEN_TTL_SECONDS,
        "user": {
            "id": str(user.id),
            "name": user.name,
            "has_saved_preferences": _has_saved_preferences(db, user),
        },
    }
