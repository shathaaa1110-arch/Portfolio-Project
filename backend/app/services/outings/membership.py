"""Leave an outing, or have the organizer remove someone, before the plan is generated (BE-29, #88).

POST   /outings/{outing_id}/leave                            a participant leaves by themselves
DELETE /outings/{outing_id}/participants/{participant_id}    the organizer removes someone

Rules:
  - only while answers are collected (invite or preferences stage); voting closes the group;
  - both take the outing's row lock, the same lock plan generation takes, so a change that races
    with generation either lands before it or is refused after it, never inside a saved plan;
  - the organizer cannot leave, and cannot remove themselves (someone must own the outing);
  - the row is kept and marked: left = 'declined' (may rejoin from the link while it is open),
    removed = 'removed' (may not rejoin). Either way the old token loses access (outings/access.py),
    the person drops out of the readiness count and the participant list, and frees their place.
"""
import logging
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ApiError
from app.services.outings.access import Caller, current_caller, is_organizer, participant_of
from app.services.outings.models import DECLINED, GONE, INVITE, PREFERENCES, REMOVED, Outing, Participant
from app.services.outings.stages import readiness

logger = logging.getLogger(__name__)
router = APIRouter(tags=["outings"])

OPEN_STAGES = (INVITE, PREFERENCES)


def _unavailable() -> ApiError:
    return ApiError(503, "OUTINGS_UNAVAILABLE", "Could not reach the outing right now. Please try again.")


def _check_open(outing: Outing) -> None:
    if outing.status not in OPEN_STAGES:
        raise ApiError(409, "MEMBERSHIP_LOCKED",
                       "The suggestions are already generated, so the group can no longer change.")


def _reply(db: Session, outing: Outing, person: Participant) -> dict:
    ready, total = readiness(db, outing.id)
    return {"outing_id": str(outing.id), "participant_id": str(person.id), "attendance": person.attendance,
            "status": outing.status, "ready_count": ready, "total_count": total}


@router.post("/outings/{outing_id}/leave")
def leave(outing_id: uuid.UUID, caller: Caller = Depends(current_caller),
          db: Session = Depends(get_db)) -> dict:
    try:
        outing, me = participant_of(db, outing_id, caller, lock=True)
        if is_organizer(outing, me):
            raise ApiError(409, "ORGANIZER_CANNOT_LEAVE", "The organizer cannot leave their own outing.")
        _check_open(outing)
        me.attendance, me.preferences_done = DECLINED, False
        db.flush()
        reply = _reply(db, outing, me)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("leave outing failed")
        raise _unavailable()
    return reply


@router.delete("/outings/{outing_id}/participants/{participant_id}")
def remove(outing_id: uuid.UUID, participant_id: uuid.UUID, caller: Caller = Depends(current_caller),
           db: Session = Depends(get_db)) -> dict:
    try:
        outing, me = participant_of(db, outing_id, caller, lock=True)
        if not is_organizer(outing, me):
            raise ApiError(403, "ORGANIZER_ONLY", "Only the organizer can remove someone.")
        if participant_id == me.id:
            raise ApiError(409, "ORGANIZER_CANNOT_LEAVE", "The organizer cannot remove themselves.")
        _check_open(outing)
        person = db.execute(select(Participant).where(
            Participant.id == participant_id, Participant.outing_id == outing.id)).scalar_one_or_none()
        if person is None or person.attendance in GONE:
            raise ApiError(404, "PARTICIPANT_NOT_FOUND", "This person is not part of this outing.")
        person.attendance, person.preferences_done = REMOVED, False
        db.flush()
        reply = _reply(db, outing, person)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("remove participant failed")
        raise _unavailable()
    return reply
