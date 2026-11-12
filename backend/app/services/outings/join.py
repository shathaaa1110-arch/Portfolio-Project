"""Join an outing with its invite code (BE-09, #64).

GET  /outings/by-code/{code}     what the join screen shows before joining; no token
POST /outings/{code}/join        a registered user joins; Bearer token
POST /outings/{code}/join-guest  a guest joins with a name and gets a token for this outing

Rules (TechnicalDoc section 2, "Enforced by the API"):
  - joining is open in the invite and preferences stages only;
  - an outing has at most MAX_PEOPLE participants, the organizer included;
  - a new participant is not ready (preferences_done is false).

Abuse: these endpoints are reachable without an account, so each client (by address) gets
CODE_TRIES requests with a code per window across all three, which makes guessing codes slow,
and GUEST_TRIES guest joins per window, which makes filling an outing with fake guests slow.

Concurrency: a join locks the outing's row (SELECT ... FOR UPDATE) before it counts the
participants, and keeps the lock until it commits. Two joins to the same outing therefore run
one after the other, and the second one counts the first one's row. Whatever closes joining or
generates the plan (BE-11, BE-17) must lock the same row first, so it never overlaps a join.
"""
import logging
import re
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ApiError
from app.core.rate_limit import RateLimiter, enforce
from app.services.auth.dependencies import current_user
from app.services.auth.models import User
from app.services.auth.tokens import create_guest_token
from app.services.outings.codes import normalize_code
from app.services.outings.models import CONFIRMED, GONE, INVITE, PREFERENCES, REMOVED, RESULT, Outing, Participant, now_utc

MAX_PEOPLE = 8
OPEN_STAGES = (INVITE, PREFERENCES)
MAX_GUEST_NAME_CHARS = 40
# A guest token lasts until a day after the outing starts; the vote and the result come before that.
GUEST_TOKEN_AFTER_START = timedelta(days=1)
CODE_FORMAT = re.compile(r"^[A-Z0-9]{4}$")  # the outings_invite_code_format check (0005)

# A group joining from one cafe's Wi-Fi shares one address: 8 people fit well inside both limits.
CODE_TRIES = RateLimiter(limit=30, window_seconds=10 * 60)
GUEST_TRIES = RateLimiter(limit=10, window_seconds=10 * 60)

CLOSED, FULL = "JOINING_CLOSED", "OUTING_FULL"
MESSAGES = {
    CLOSED: "Voting has already started for this outing.",
    FULL: f"This outing already has {MAX_PEOPLE} participants.",
}

logger = logging.getLogger(__name__)
router = APIRouter(tags=["outings"])

# The account's saved set becomes a new set owned by this participant, so editing one never
# changes the other (TechnicalDoc, "Preferences have one table for two uses").
COPY_PREFERENCES = text("""
    INSERT INTO preferences (id, participant_id, liked_cuisines, allergies, budget_min,
                             budget_max, max_distance_km, seating_needs)
    SELECT :id, :participant_id, liked_cuisines, allergies, budget_min,
           budget_max, max_distance_km, seating_needs
    FROM preferences
    WHERE user_id = :user_id
""")
# A registered user who joins a group's outing becomes a member; a member already in it stays as is.
ADD_MEMBER = text("""
    INSERT INTO group_members (group_id, user_id, joined_at)
    VALUES (:group_id, :user_id, :joined_at)
    ON CONFLICT DO NOTHING
""")


class GuestIn(BaseModel):
    guest_name: str = Field(min_length=1, max_length=MAX_GUEST_NAME_CHARS)

    @field_validator("guest_name")
    @classmethod
    def strip(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be empty")
        return value


def _not_found() -> ApiError:
    return ApiError(404, "OUTING_NOT_FOUND", "No open outing has this code. Check the code and try again.")


def _find(db: Session, raw_code: str, lock: bool = False) -> Outing:
    """The open outing with this code. A code belongs to one outing until it is freed (0012)."""
    code = normalize_code(raw_code)
    if not CODE_FORMAT.match(code):
        raise _not_found()
    query = select(Outing).where(Outing.invite_code == code, Outing.code_released_at.is_(None),
                                 Outing.status != RESULT)
    if lock:
        query = query.with_for_update()
    outing = db.execute(query).scalar_one_or_none()
    if outing is None:
        raise _not_found()
    return outing


def _count(db: Session, outing_id: uuid.UUID) -> int:
    """People still in the outing; someone who left or was removed frees their place (BE-29)."""
    return db.scalar(select(func.count()).select_from(Participant)
                     .where(Participant.outing_id == outing_id, Participant.attendance.not_in(GONE)))


def _blocked(outing: Outing, count: int) -> str | None:
    if outing.status not in OPEN_STAGES:
        return CLOSED
    if count >= MAX_PEOPLE:
        return FULL
    return None


def _check_can_join(db: Session, outing: Outing) -> None:
    """Call with the outing's row locked, so the count stays true until the commit."""
    reason = _blocked(outing, _count(db, outing.id))
    if reason:
        raise ApiError(409, reason, MESSAGES[reason])


def limit_code_tries(request: Request) -> None:
    enforce(CODE_TRIES, request)


def limit_guest_tries(request: Request) -> None:
    enforce(GUEST_TRIES, request)


def _unavailable() -> ApiError:
    return ApiError(503, "OUTINGS_UNAVAILABLE", "Could not reach the outing right now. Please try again.")


@router.get("/outings/by-code/{code}", dependencies=[Depends(limit_code_tries)])
def look_up(code: str, db: Session = Depends(get_db)) -> dict:
    """What the join screen needs before joining: no ids of people, no preferences."""
    try:
        outing = _find(db, code)
        count = _count(db, outing.id)
        organizer = db.get(User, outing.organizer_id)
    except SQLAlchemyError:
        logger.exception("invite lookup failed")
        raise _unavailable()

    reason = _blocked(outing, count)
    return {
        "outing_id": str(outing.id),
        "name": outing.name,
        "organizer_name": organizer.name.split()[0] if organizer and organizer.name.strip() else None,
        "starts_at": outing.starts_at,
        "district": outing.district,
        "status": outing.status,
        "participants_count": count,
        "can_join": reason is None,
        "join_blocked_reason": reason,
    }


@router.post("/outings/{code}/join", dependencies=[Depends(limit_code_tries)])
def join(code: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Join once. Asking again returns the same participant instead of adding a second one."""
    try:
        outing = _find(db, code, lock=True)
        me = db.execute(
            select(Participant).where(Participant.outing_id == outing.id, Participant.user_id == user.id)
        ).scalar_one_or_none()

        if me is not None and me.attendance == REMOVED:
            raise ApiError(403, "REMOVED_FROM_OUTING", "The organizer removed you from this outing.")
        if me is None:
            _check_can_join(db, outing)
            me = Participant(outing_id=outing.id, user_id=user.id, attendance=CONFIRMED, preferences_done=False)
            db.add(me)
            db.flush()  # gives me.id, needed by the copied preferences
            db.execute(COPY_PREFERENCES, {"id": uuid.uuid4(), "participant_id": me.id, "user_id": user.id})
            if outing.group_id is not None:
                db.execute(ADD_MEMBER, {"group_id": outing.group_id, "user_id": user.id, "joined_at": now_utc()})
        elif me.attendance != CONFIRMED and outing.status in OPEN_STAGES:
            if me.attendance in GONE:
                _check_can_join(db, outing)  # coming back after leaving takes a place again
            me.attendance = CONFIRMED  # joining from the link counts as confirming attendance

        db.commit()  # also releases the outing's lock
    except SQLAlchemyError:
        db.rollback()
        logger.exception("join failed")
        raise _unavailable()

    return {"outing_id": str(outing.id), "participant_id": str(me.id), "status": outing.status}


@router.post("/outings/{code}/join-guest", status_code=201,
             dependencies=[Depends(limit_code_tries), Depends(limit_guest_tries)])
def join_guest(code: str, body: GuestIn, db: Session = Depends(get_db)) -> dict:
    """A guest has no account, so every call adds a new participant with this name."""
    try:
        outing = _find(db, code, lock=True)
        _check_can_join(db, outing)
        guest = Participant(outing_id=outing.id, guest_name=body.guest_name,
                            attendance=CONFIRMED, preferences_done=False)
        db.add(guest)
        db.flush()  # gives guest.id for the token
        # Signed before the commit: if signing fails, the guest is not saved without a token.
        token = create_guest_token(guest.id, outing.id, outing.starts_at + GUEST_TOKEN_AFTER_START)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("guest join failed")
        raise _unavailable()

    return {
        "outing_id": str(outing.id),
        "participant_id": str(guest.id),
        "guest_token": token,
        "status": outing.status,
    }
