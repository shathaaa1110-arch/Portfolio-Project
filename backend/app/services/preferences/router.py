"""A participant's preferences for one outing, and readiness (BE-13, #19).

GET  /outings/{outing_id}/preferences        the caller's own copy, to fill the form
PUT  /outings/{outing_id}/preferences        save the caller's own copy; clears their readiness
POST /outings/{outing_id}/preferences/ready  mark the caller ready, once a copy is saved

Each participant owns one row (preferences.participant_id is unique), and the row is found from
the caller's token, never from the request, so nobody can read or change another person's answers.
Members and guests are treated the same. The account's saved defaults are never touched.

Saving is open in the invite and preferences stages; marking ready in the preferences stage.
Both lock the outing's row like a join, so they never overlap the stage change that closes
them or the plan generation (BE-17).

Every request names the outing's current round (round_id, BE-31): an older or missing id is refused
with 409 STALE_ROUND, so a delayed save or Ready never lands in a newer round. The answers themselves
belong to the outing and carry over to the next round; readiness does not.

Marking ready never generates the plan. Once everyone is ready, the organizer generates it
(release decision D05, BE-17); the last Ready does not start it by itself.
"""
import logging
import uuid
from decimal import Decimal

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ApiError
from app.services.outings.access import Caller, current_caller, participant_of
from app.services.outings.models import INVITE, PREFERENCES, Outing
from app.services.outings.rounds import RoundIn, current_round, round_ended, sent_round
from app.services.outings.stages import readiness
from app.services.preferences.account import PreferencesIn

logger = logging.getLogger(__name__)
router = APIRouter(tags=["preferences"])

FIELDS = ("liked_cuisines", "allergies", "budget_min", "budget_max", "max_distance_km", "seating_needs")

READ_MINE = text(f"SELECT {', '.join(FIELDS)} FROM preferences WHERE participant_id = :participant_id")
# One statement: the first save creates the row, later saves replace every field.
SAVE_MINE = text("""
    INSERT INTO preferences (id, participant_id, liked_cuisines, allergies, budget_min, budget_max,
                             max_distance_km, seating_needs)
    VALUES (:id, :participant_id, CAST(:liked_cuisines AS text[]), CAST(:allergies AS text[]),
            :budget_min, :budget_max, :max_distance_km, :seating_needs)
    ON CONFLICT (participant_id) DO UPDATE SET
        liked_cuisines = EXCLUDED.liked_cuisines, allergies = EXCLUDED.allergies,
        budget_min = EXCLUDED.budget_min, budget_max = EXCLUDED.budget_max,
        max_distance_km = EXCLUDED.max_distance_km, seating_needs = EXCLUDED.seating_needs
""")


class OutingPreferencesIn(PreferencesIn):
    round_id: uuid.UUID | None = None


def _unavailable() -> ApiError:
    return ApiError(503, "PREFERENCES_UNAVAILABLE", "Preferences are not available right now. Please try again.")


def _counts(db: Session, outing: Outing) -> dict:
    ready, total = readiness(db, outing.id)
    return {"ready_count": ready, "total_count": total}


@router.get("/outings/{outing_id}/preferences")
def read_mine(outing_id: uuid.UUID, round_id: uuid.UUID | None = Query(None),
              caller: Caller = Depends(current_caller), db: Session = Depends(get_db)) -> dict:
    """Same shape as GET /users/me/preferences; is_saved is false until the first save or copy."""
    try:
        outing, me = participant_of(db, outing_id, caller)
        rnd = current_round(db, outing, round_id)
        row = db.execute(READ_MINE, {"participant_id": me.id}).mappings().first()
    except SQLAlchemyError:
        logger.exception("read outing preferences failed")
        raise _unavailable()
    if row is None:
        return {"is_saved": False, "liked_cuisines": [], "allergies": [], "budget_min": None,
                "budget_max": None, "max_distance_km": None, "seating_needs": None,
                "preferences_done": me.preferences_done, "round_id": str(rnd.id)}
    return {
        "is_saved": True,
        "liked_cuisines": row["liked_cuisines"] or [],
        "allergies": row["allergies"] or [],
        "budget_min": row["budget_min"],
        "budget_max": row["budget_max"],
        "max_distance_km": float(row["max_distance_km"]) if row["max_distance_km"] is not None else None,
        "seating_needs": row["seating_needs"],
        "preferences_done": me.preferences_done,
        "round_id": str(rnd.id),
    }


@router.put("/outings/{outing_id}/preferences")
def save_mine(outing_id: uuid.UUID, body: OutingPreferencesIn, caller: Caller = Depends(current_caller),
              db: Session = Depends(get_db)) -> dict:
    """A field left out is saved as empty, like the account. Saving clears the caller's readiness,
    so the plan is never built from answers the person has not confirmed."""
    values = body.model_dump(exclude={"round_id"})
    if values["max_distance_km"] is not None:
        values["max_distance_km"] = Decimal(str(values["max_distance_km"]))
    try:
        outing, me = participant_of(db, outing_id, caller, lock=True)
        rnd = current_round(db, outing, body.round_id)
        if outing.status not in (INVITE, PREFERENCES):
            raise ApiError(409, "PREFERENCES_LOCKED", "Preferences can no longer be changed for this outing.")
        if rnd.ended:
            raise round_ended()
        db.execute(SAVE_MINE, {"id": uuid.uuid4(), "participant_id": me.id, **values})
        me.preferences_done = False
        db.flush()
        counts = _counts(db, outing)
        db.commit()  # also releases the outing's lock
    except SQLAlchemyError:
        db.rollback()
        logger.exception("save outing preferences failed")
        raise _unavailable()
    return {"message": "outing preferences updated", "preferences_done": False, "round_id": str(rnd.id), **counts}


@router.post("/outings/{outing_id}/preferences/ready")
def mark_ready(outing_id: uuid.UUID, body: RoundIn | None = Body(None), caller: Caller = Depends(current_caller),
               db: Session = Depends(get_db)) -> dict:
    """Asking again once ready answers 200 and changes nothing."""
    try:
        outing, me = participant_of(db, outing_id, caller, lock=True)
        rnd = current_round(db, outing, sent_round(body))
        if not me.preferences_done:
            if rnd.ended:
                raise round_ended()
            if outing.status == INVITE:
                raise ApiError(409, "PREFERENCES_NOT_OPEN", "The organizer has not started the preferences stage yet.")
            if outing.status != PREFERENCES:
                raise ApiError(409, "PREFERENCES_LOCKED", "Preferences can no longer be changed for this outing.")
            if db.execute(READ_MINE, {"participant_id": me.id}).first() is None:
                raise ApiError(409, "PREFERENCES_REQUIRED", "Save your preferences before marking them ready.")
            me.preferences_done = True
            db.flush()
        counts = _counts(db, outing)
        all_ready = counts["total_count"] > 0 and counts["ready_count"] == counts["total_count"]
        # all_ready only tells the organizer they can generate now; nothing is generated here (D05).
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("mark ready failed")
        raise _unavailable()
    return {"participant_id": str(me.id), "preferences_done": True, "all_ready": all_ready,
            "outing_status": outing.status, "round_id": str(rnd.id), **counts}
