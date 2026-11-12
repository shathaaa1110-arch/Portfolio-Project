"""Rounds of one outing, and the retry that starts the next one (BE-31 #90, storage DB-07 #14).

POST /outings/{outing_id}/retry   organizer only; {"round_id": the round being retried}

Every outing has exactly one current round (outings.current_round_id, migration 0012). Suggestions,
votes and the result belong to a round; preferences and people belong to the outing.

Every request that reads or writes the current round names it with round_id. A missing or older id is
refused with 409 STALE_ROUND, so a delayed vote, save or Ready from an earlier round can never land in
a newer one. The app then reads GET /outings/{id} again and continues in the current round.

A retry is allowed after a result, or after a round that found no matching place (outcome no_matches),
until a day after the outing starts (when its invite code is freed, see join.py). It keeps the outing,
its link and its people and their saved answers, starts round n + 1, moves back to the preferences stage
and clears everyone's readiness, so nothing is generated before everyone confirms again. Two retries at
once queue on the outing's row lock: the first creates the round, the second gets the same round back.
"""
import logging
import uuid
from dataclasses import dataclass
from datetime import timedelta

from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ApiError
from app.services.outings.access import Caller, current_caller, is_organizer, participant_of
from app.services.outings.models import PREFERENCES, RESULT, Outing, Participant, now_utc

logger = logging.getLogger(__name__)
router = APIRouter(tags=["outings"])

NO_MATCHES = "no_matches"
# The outing is over a day after it starts: guest passes end then (join.py) and the code is freed.
RETRY_WINDOW = timedelta(days=1)

ROUND_SQL = text("SELECT id, number, outcome FROM outing_rounds WHERE id = :id")
# An earlier round of the same outing, to recognise a retry that was already done.
OWN_ROUND_SQL = text("SELECT number FROM outing_rounds WHERE id = :id AND outing_id = :outing")
NEW_ROUND = text("INSERT INTO outing_rounds (id, outing_id, number) VALUES (:id, :outing, :number)")
SET_OUTCOME = text("UPDATE outing_rounds SET outcome = :outcome WHERE id = :id")
SNAPSHOT_MEMBERS = text("""
    INSERT INTO round_members (round_id, participant_id)
    SELECT :round, id FROM participants WHERE outing_id = :outing AND attendance = 'confirmed'
""")


@dataclass(frozen=True)
class Round:
    id: uuid.UUID
    number: int
    outcome: str | None

    @property
    def ended(self) -> bool:
        return self.outcome == NO_MATCHES


class RoundIn(BaseModel):
    """The body of a write that has no other fields. A missing body or id is a stale request."""
    model_config = ConfigDict(extra="forbid")
    round_id: uuid.UUID | None = None


def sent_round(body: RoundIn | None) -> uuid.UUID | None:
    return body.round_id if body is not None else None


def stale() -> ApiError:
    return ApiError(409, "STALE_ROUND", "This outing has moved to a new round. Reload it and continue there.")


def round_ended() -> ApiError:
    return ApiError(409, "ROUND_ENDED", "No place matched in this round. Wait for the organizer to try again.")


def current_round(db: Session, outing: Outing, round_id: uuid.UUID | None) -> Round:
    """The outing's current round, if round_id names it; otherwise 409 STALE_ROUND."""
    if round_id is None or round_id != outing.current_round_id:
        raise stale()
    row = db.execute(ROUND_SQL, {"id": outing.current_round_id}).one()
    return Round(row.id, row.number, row.outcome)


def read_current(db: Session, outing: Outing) -> Round:
    """The current round without checking a request's id (for the outing's state)."""
    row = db.execute(ROUND_SQL, {"id": outing.current_round_id}).one()
    return Round(row.id, row.number, row.outcome)


def retry_open(outing: Outing, rnd: Round) -> bool:
    """True when the organizer may start the next round now."""
    finished = outing.status == RESULT or rnd.ended
    return finished and now_utc() < outing.starts_at + RETRY_WINDOW and outing.code_released_at is None


def mark_no_matches(db: Session, rnd: Round) -> None:
    db.execute(SET_OUTCOME, {"id": rnd.id, "outcome": NO_MATCHES})


def snapshot_members(db: Session, outing: Outing, rnd: Round) -> None:
    """Who is in this round, saved when its suggestions are generated; the result is counted on them."""
    db.execute(SNAPSHOT_MEMBERS, {"round": rnd.id, "outing": outing.id})


def _reply(outing: Outing, rnd: Round) -> dict:
    return {"outing_id": str(outing.id), "status": outing.status, "round_id": str(rnd.id), "round_number": rnd.number}


@router.post("/outings/{outing_id}/retry")
def retry(outing_id: uuid.UUID, body: RoundIn | None = Body(None), caller: Caller = Depends(current_caller),
          db: Session = Depends(get_db)) -> dict:
    try:
        outing, me = participant_of(db, outing_id, caller, lock=True)
        if not is_organizer(outing, me):
            raise ApiError(403, "ORGANIZER_ONLY", "Only the organizer can start a new round.")
        now = read_current(db, outing)
        asked = sent_round(body)
        if asked is not None and asked != now.id:
            source = db.execute(OWN_ROUND_SQL, {"id": asked, "outing": outing.id}).first()
            if source is not None and source.number == now.number - 1:
                # The same retry asked again (a double tap, or a reply that was lost): the round it made.
                reply = _reply(outing, now)
                db.rollback()
                return reply
            raise stale()
        current = current_round(db, outing, asked)
        if not retry_open(outing, current):
            raise ApiError(409, "ROUND_RETRY_NOT_ALLOWED",
                           "A new round can start after a result or when nothing matched, until the outing day ends.")

        nxt = Round(uuid.uuid4(), current.number + 1, None)
        db.execute(NEW_ROUND, {"id": nxt.id, "outing": outing.id, "number": nxt.number})
        outing.current_round_id = nxt.id
        outing.status = PREFERENCES  # back to answers; the only move backwards, and only here
        outing.tiebreak_ends_at = None
        # Everyone confirms again; their saved answers and limits stay until they change them.
        db.execute(update(Participant).where(Participant.outing_id == outing.id).values(preferences_done=False))
        db.flush()
        reply = _reply(outing, nxt)
        db.commit()  # the new round, the stage and the cleared readiness together; also releases the lock
    except SQLAlchemyError:
        db.rollback()
        logger.exception("retry round failed")
        raise ApiError(503, "ROUND_RETRY_UNAVAILABLE", "Could not start a new round right now. Please try again.")
    return reply
