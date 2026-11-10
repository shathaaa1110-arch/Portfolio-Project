"""Votes and the final result (BE-19 #73, BE-20 #31, BE-21 #29).

POST /outings/{outing_id}/votes        Like or Pass one suggestion; changing an answer updates it
GET  /outings/{outing_id}/votes        my answers and the group's progress, for a reload
POST /outings/{outing_id}/end-voting   organizer ends voting early with the votes saved so far
GET  /outings/{outing_id}/result       the winner, or no winner, once voting has ended

Rules (release decisions D07 – D10):
  - only confirmed participants of this outing vote, only while the outing is in voting, and only on
    a suggestion from this outing's own plan;
  - every write takes the outing's row lock, the same lock generation and ending take, so no vote
    lands after the result is settled and two last votes cannot both settle it;
  - voting ends by itself when every member has answered every suggestion (D07), or when the
    organizer ends it; saved votes count, missing votes are not counted as Pass;
  - support = likes for a restaurant / all members (D08); how many finished is shown separately;
  - most likes wins; equal likes go to the better recommendation rank, then the plan item id (D09);
    no tie-break vote and no timer, so the tiebreak stage is never used;
  - no likes means no winner (D10), telling "nobody voted" apart from "everyone passed".

One round per outing for now: the current round is the outing's single stored plan. Separate
rounds and their ids come with DB-07 (#14) and BE-31 (#90).
"""
import logging
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ApiError
from app.services.outings.access import Caller, current_caller, is_organizer, participant_of
from app.services.outings.models import CONFIRMED, RESULT, VOTING, Outing
from app.services.outings.stages import move

logger = logging.getLogger(__name__)
router = APIRouter(tags=["voting"])

PLAN_ITEM_SQL = text("SELECT id FROM plan_items WHERE id = :item AND outing_id = :outing")
UPSERT_VOTE = text("""
    INSERT INTO votes (id, participant_id, plan_item_id, liked, is_tiebreak, updated_at)
    VALUES (:id, :participant, :item, :liked, false, timezone('utc', now()))
    ON CONFLICT (participant_id, plan_item_id, is_tiebreak)
    DO UPDATE SET liked = EXCLUDED.liked, updated_at = EXCLUDED.updated_at
""")
MY_VOTES_SQL = text("""
    SELECT v.plan_item_id, v.liked FROM votes v JOIN plan_items pi ON pi.id = v.plan_item_id
    WHERE v.participant_id = :participant AND pi.outing_id = :outing AND NOT v.is_tiebreak
    ORDER BY pi.rank
""")
# Counts only: who liked what stays private. A member "completed" when they answered every suggestion.
PROGRESS_SQL = text("""
    WITH items AS (SELECT count(*) AS n FROM plan_items WHERE outing_id = :outing),
         answered AS (
             SELECT pa.id, count(v.id) AS n
             FROM participants pa
             LEFT JOIN votes v ON v.participant_id = pa.id AND NOT v.is_tiebreak
                 AND v.plan_item_id IN (SELECT id FROM plan_items WHERE outing_id = :outing)
             WHERE pa.outing_id = :outing AND pa.attendance = :confirmed
             GROUP BY pa.id)
    SELECT (SELECT n FROM items) AS items_count,
           count(*) AS members_count,
           count(*) FILTER (WHERE answered.n = (SELECT n FROM items) AND (SELECT n FROM items) > 0) AS completed_count
    FROM answered
""")
# Likes and passes from members only, best first by D09: likes, then the stored rank, then the id.
TALLY_SQL = text("""
    SELECT pi.id, pi.rank, pi.restaurant_id, r.name_ar, r.name_en, r.district, r.maps_url,
           count(v.id) FILTER (WHERE v.liked) AS likes,
           count(v.id) FILTER (WHERE NOT v.liked) AS passes
    FROM plan_items pi
    JOIN restaurants r ON r.id = pi.restaurant_id
    LEFT JOIN votes v ON v.plan_item_id = pi.id AND NOT v.is_tiebreak
        AND v.participant_id IN (SELECT id FROM participants WHERE outing_id = :outing AND attendance = :confirmed)
    WHERE pi.outing_id = :outing
    GROUP BY pi.id, r.id
    ORDER BY likes DESC, pi.rank, pi.id
""")
SET_WINNER = text("UPDATE plan_items SET is_winner = COALESCE(id = CAST(:item AS uuid), false) WHERE outing_id = :outing")


class VoteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plan_item_id: uuid.UUID
    liked: bool


def _unavailable() -> ApiError:
    return ApiError(503, "VOTING_UNAVAILABLE", "Voting is not available right now. Please try again.")


def _progress(db: Session, outing: Outing) -> dict:
    row = db.execute(PROGRESS_SQL, {"outing": outing.id, "confirmed": CONFIRMED}).one()
    return {"items_count": row.items_count, "members_count": row.members_count,
            "completed_count": row.completed_count}


def _settle(db: Session, outing: Outing) -> None:
    """End voting: mark the winner, if any, and move to the result. Call under the row lock."""
    tally = db.execute(TALLY_SQL, {"outing": outing.id, "confirmed": CONFIRMED}).all()
    winner = tally[0] if tally and tally[0].likes > 0 else None
    db.execute(SET_WINNER, {"outing": outing.id, "item": winner.id if winner else None})
    move(outing, RESULT)


def _result(db: Session, outing: Outing) -> dict:
    tally = db.execute(TALLY_SQL, {"outing": outing.id, "confirmed": CONFIRMED}).all()
    progress = _progress(db, outing)
    members = progress["members_count"]

    def support(likes: int) -> int:
        return round(likes * 100 / members) if members else 0

    top = tally[0] if tally and tally[0].likes > 0 else None
    no_winner_reason = None
    if top is None:
        no_winner_reason = "everyone_passed" if any(t.passes for t in tally) else "no_votes"
    return {
        "outing_id": str(outing.id),
        "status": outing.status,
        "winner": None if top is None else {
            "plan_item_id": str(top.id), "restaurant_id": top.restaurant_id, "name_ar": top.name_ar,
            "name_en": top.name_en, "district": top.district, "maps_url": top.maps_url,
            "likes": top.likes, "support_percentage": support(top.likes),
        },
        "no_winner_reason": no_winner_reason,
        "members_count": members,
        "completed_count": progress["completed_count"],
        "items": [{"plan_item_id": str(t.id), "rank": t.rank, "restaurant_id": t.restaurant_id,
                   "name_ar": t.name_ar, "likes": t.likes, "support_percentage": support(t.likes)}
                  for t in tally],
    }


@router.post("/outings/{outing_id}/votes")
def cast_vote(outing_id: uuid.UUID, body: VoteIn, caller: Caller = Depends(current_caller),
              db: Session = Depends(get_db)) -> dict:
    try:
        outing, me = participant_of(db, outing_id, caller, lock=True)
        if outing.status != VOTING:
            raise ApiError(409, "VOTING_NOT_OPEN", "Voting is not open for this outing.")
        if me.attendance != CONFIRMED:
            raise ApiError(403, "NOT_A_MEMBER", "Only people taking part in this outing can vote.")
        if db.execute(PLAN_ITEM_SQL, {"item": body.plan_item_id, "outing": outing.id}).first() is None:
            raise ApiError(404, "PLAN_ITEM_NOT_FOUND", "This suggestion is not part of this outing's plan.")

        db.execute(UPSERT_VOTE, {"id": uuid.uuid4(), "participant": me.id, "item": body.plan_item_id,
                                 "liked": body.liked})
        progress = _progress(db, outing)
        complete = progress["members_count"] > 0 and progress["completed_count"] == progress["members_count"]
        if complete:  # D07: the last answer ends voting, in the same transaction
            _settle(db, outing)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("cast vote failed")
        raise _unavailable()
    return {"plan_item_id": str(body.plan_item_id), "liked": body.liked, "voting_complete": complete,
            "status": outing.status, **progress}


@router.get("/outings/{outing_id}/votes")
def my_votes(outing_id: uuid.UUID, caller: Caller = Depends(current_caller),
             db: Session = Depends(get_db)) -> dict:
    try:
        outing, me = participant_of(db, outing_id, caller)
        votes = db.execute(MY_VOTES_SQL, {"participant": me.id, "outing": outing.id}).all()
        progress = _progress(db, outing)
    except SQLAlchemyError:
        logger.exception("read votes failed")
        raise _unavailable()
    return {"outing_id": str(outing.id), "status": outing.status,
            "votes": [{"plan_item_id": str(v.plan_item_id), "liked": v.liked} for v in votes],
            "answered_count": len(votes), **progress}


@router.post("/outings/{outing_id}/end-voting")
def end_voting(outing_id: uuid.UUID, caller: Caller = Depends(current_caller),
               db: Session = Depends(get_db)) -> dict:
    try:
        outing, me = participant_of(db, outing_id, caller, lock=True)
        if not is_organizer(outing, me):
            raise ApiError(403, "ORGANIZER_ONLY", "Only the organizer can end voting.")
        if outing.status == VOTING:
            _settle(db, outing)
            db.flush()
        elif outing.status != RESULT:  # asked again after the result: the same result
            raise ApiError(409, "VOTING_NOT_OPEN", "Voting is not open for this outing.")
        result = _result(db, outing)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("end voting failed")
        raise _unavailable()
    return result


@router.get("/outings/{outing_id}/result")
def read_result(outing_id: uuid.UUID, caller: Caller = Depends(current_caller),
                db: Session = Depends(get_db)) -> dict:
    try:
        outing, _ = participant_of(db, outing_id, caller)
        if outing.status != RESULT:
            raise ApiError(409, "RESULT_NOT_READY", "Voting has not finished for this outing.")
        result = _result(db, outing)
    except SQLAlchemyError:
        logger.exception("read result failed")
        raise _unavailable()
    return result
