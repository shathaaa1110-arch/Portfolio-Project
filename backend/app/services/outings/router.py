"""Groups and outings: create, join, guests (BE-08 – BE-10).

POST /outings/session (BE-08) creates a one-off session: no saved group, the caller is
the organizer and its first, confirmed participant, and the session gets an invite code.
"""
import logging
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ApiError
from app.services.auth.dependencies import current_user
from app.services.auth.models import User
from app.services.outings.codes import invite_url, new_code
from app.services.outings.join import COPY_PREFERENCES
from app.services.outings.models import CONFIRMED, INVITE, Outing, Participant, now_utc

MAX_NAME_CHARS = 60
# A session may start a little in the past (clock differences) and at most this far ahead.
PAST_GRACE = timedelta(minutes=5)
MAX_AHEAD = timedelta(days=60)
CODE_ATTEMPTS = 10
OPEN_CODE_INDEX = "ux_outings_invite_code"  # migration 0012
# A code stays with its outing until a day after it starts (a retry reuses the link); after that a
# finished outing gives it up, so the code can serve a new outing.
RELEASE_CODE = text("""
    UPDATE outings SET code_released_at = now()
    WHERE invite_code = :code AND code_released_at IS NULL AND status = 'result'
      AND starts_at + interval '1 day' < now()
""")

logger = logging.getLogger(__name__)
router = APIRouter(tags=["outings"])

DISTRICT_EXISTS = text("SELECT 1 FROM districts WHERE id = :id")


class SessionIn(BaseModel):
    name: str = Field(min_length=1, max_length=MAX_NAME_CHARS)
    starts_at: datetime
    district: str = Field(min_length=1, max_length=64)  # an id from GET /districts

    @field_validator("name", "district")
    @classmethod
    def strip(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be empty")
        return value


def _check_start(starts_at: datetime) -> None:
    if starts_at.tzinfo is None:
        raise ApiError(422, "INVALID_START_TIME", "Send the start time with its time zone, e.g. 2026-11-05T20:00:00+03:00.")
    now = now_utc()
    if starts_at < now - PAST_GRACE:
        raise ApiError(422, "INVALID_START_TIME", "The start time has already passed.")
    if starts_at > now + MAX_AHEAD:
        raise ApiError(422, "INVALID_START_TIME", "The start time must be within the next 60 days.")


@router.post("/outings/session", status_code=201)
def create_session(body: SessionIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Create a one-off session and its organizer in one transaction."""
    _check_start(body.starts_at)
    try:
        if db.execute(DISTRICT_EXISTS, {"id": body.district}).first() is None:
            raise ApiError(422, "UNKNOWN_DISTRICT", "Choose a district from the list.")

        for _ in range(CODE_ATTEMPTS):
            outing = Outing(organizer_id=user.id, name=body.name, status=INVITE, invite_code=new_code(),
                            starts_at=body.starts_at, district=body.district)
            try:
                # Savepoint: a taken code undoes this attempt only, and the loop tries another code.
                with db.begin_nested():
                    db.execute(RELEASE_CODE, {"code": outing.invite_code})
                    db.add(outing)
                    db.flush()
                break
            except IntegrityError as exc:
                if OPEN_CODE_INDEX not in str(exc.orig):
                    raise
        else:
            logger.error("no free invite code after %d attempts", CODE_ATTEMPTS)
            raise ApiError(503, "INVITE_CODE_UNAVAILABLE", "Could not create the session right now. Please try again.")

        organizer = Participant(outing_id=outing.id, user_id=user.id, attendance=CONFIRMED, preferences_done=False)
        db.add(organizer)
        db.flush()
        # The organizer starts from their saved preferences, like a member who joins (BE-13).
        db.execute(COPY_PREFERENCES, {"id": uuid.uuid4(), "participant_id": organizer.id, "user_id": user.id})
        db.commit()  # the outing, its code and its organizer are saved together, or not at all
    except SQLAlchemyError:
        db.rollback()
        logger.exception("create session failed")
        raise ApiError(503, "OUTINGS_UNAVAILABLE", "Could not create the session right now. Please try again.")

    return {
        "outing_id": str(outing.id),
        "invite_code": outing.invite_code,
        "invite_url": invite_url(outing.invite_code),
        "status": outing.status,
    }
