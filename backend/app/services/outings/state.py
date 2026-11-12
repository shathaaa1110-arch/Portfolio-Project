"""Outing state and the first stage change (BE-11, #18).

GET  /outings/{outing_id}                    the waiting room polls this; login or guest token
POST /outings/{outing_id}/start-preferences  organizer only; invite -> preferences

A participant summary carries only what the group may see: name, attendance, readiness and
whether this person is the organizer. Never ids of accounts, phone numbers or preferences.
"""
import logging
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ApiError
from app.services.auth.models import User
from app.services.outings.access import Caller, current_caller, is_organizer, participant_of
from app.services.outings.codes import invite_url
from app.services.outings.models import GONE, PREFERENCES, Outing, Participant
from app.services.outings.rounds import read_current, retry_open
from app.services.outings.stages import move, organizer_actions, readiness

logger = logging.getLogger(__name__)
router = APIRouter(tags=["outings"])


def _unavailable() -> ApiError:
    return ApiError(503, "OUTINGS_UNAVAILABLE", "Could not reach the outing right now. Please try again.")


def _participants(db: Session, outing: Outing) -> list[dict]:
    """Organizer first, then by name, so the list does not jump around between polls.

    People who left or were removed (BE-29) are no longer part of the outing and are not listed.
    """
    rows = db.execute(
        select(Participant, User.name)
        .outerjoin(User, User.id == Participant.user_id)
        .where(Participant.outing_id == outing.id, Participant.attendance.not_in(GONE))
    ).all()
    people = [
        {
            "participant_id": str(p.id),
            "name": user_name if p.user_id is not None else p.guest_name,
            "attendance": p.attendance,
            "preferences_done": p.preferences_done,
            "is_organizer": p.user_id is not None and p.user_id == outing.organizer_id,
        }
        for p, user_name in rows
    ]
    people.sort(key=lambda x: (not x["is_organizer"], x["name"] or "", x["participant_id"]))
    return people


@router.get("/outings/{outing_id}")
def outing_state(outing_id: uuid.UUID, caller: Caller = Depends(current_caller),
                 db: Session = Depends(get_db)) -> dict:
    try:
        outing, me = participant_of(db, outing_id, caller)
        people = _participants(db, outing)
        ready, total = readiness(db, outing.id)
        rnd = read_current(db, outing)
    except SQLAlchemyError:
        logger.exception("outing state failed")
        raise _unavailable()

    organizer = is_organizer(outing, me)
    actions = []
    if organizer:
        # A round that found nothing has ended: the only way on is a new round (BE-31).
        actions = [] if rnd.ended else organizer_actions(outing.status, total > 0 and ready == total)
        if retry_open(outing, rnd):
            actions.append("retry_round")
    return {
        "outing_id": str(outing.id),
        "name": outing.name,
        "status": outing.status,
        "starts_at": outing.starts_at,
        "district": outing.district,
        "invite_code": outing.invite_code,
        "invite_url": invite_url(outing.invite_code),  # so the lobby can share the link, not only the code
        "tiebreak_ends_at": outing.tiebreak_ends_at,
        # Every request about this round sends round_id back; an older one gets 409 STALE_ROUND.
        "round_id": str(rnd.id),
        "round_number": rnd.number,
        "round_outcome": rnd.outcome,  # null, or "no_matches" when nothing matched everyone
        "me": {"participant_id": str(me.id), "is_organizer": organizer},
        "actions": actions,
        "readiness": {"ready_count": ready, "total_count": total},
        "participants": people,
    }


@router.post("/outings/{outing_id}/start-preferences")
def start_preferences(outing_id: uuid.UUID, caller: Caller = Depends(current_caller),
                      db: Session = Depends(get_db)) -> dict:
    """Asking again once the stage has started answers 200 and changes nothing."""
    try:
        outing, me = participant_of(db, outing_id, caller, lock=True)
        if not is_organizer(outing, me):
            raise ApiError(403, "ORGANIZER_ONLY", "Only the organizer can start this stage.")
        if move(outing, PREFERENCES):
            db.commit()  # also releases the outing's lock
    except SQLAlchemyError:
        db.rollback()
        logger.exception("start preferences failed")
        raise _unavailable()
    return {"outing_id": str(outing.id), "status": outing.status}
