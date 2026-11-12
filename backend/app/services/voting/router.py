"""Votes and the final result (BE-19 #73, BE-20 #31, BE-21 #29).

POST /outings/{outing_id}/votes        Like or Pass one suggestion; changing an answer updates it
GET  /outings/{outing_id}/votes        my answers and the group's progress, for a reload
POST /outings/{outing_id}/end-voting   organizer ends voting early with the votes saved so far
GET  /outings/{outing_id}/result       the winner, or no winner, once voting has ended

Rules (release decisions D07 – D10):
  - only the members of the current round vote (the people saved when its suggestions were generated),
    only while the outing is in voting, and only on a suggestion from that round's plan;
  - every write takes the outing's row lock, the same lock generation and ending take, so no vote
    lands after the result is settled and two last votes cannot both settle it;
  - voting ends by itself when every member has answered every suggestion (D07), or when the
    organizer ends it; saved votes count, missing votes are not counted as Pass;
  - support = likes for a restaurant / all members of the round (D08); how many finished is shown separately;
  - most likes wins; equal likes go to the better recommendation rank, then the plan item id (D09);
    no tie-break vote and no timer, so the tiebreak stage is never used;
  - no likes means no winner (D10), telling "nobody voted" apart from "everyone passed".

Everything here is about the outing's current round (DB-07 #14, BE-31 #90). Every request names it
with round_id; an older or missing id gets 409 STALE_ROUND, so a delayed vote from an earlier round
never counts in a newer one. Earlier rounds keep their own plan, votes and winner.
"""
import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Body, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ApiError
from app.services.outings.access import Caller, current_caller, is_organizer, participant_of
from app.services.outings.models import CONFIRMED, RESULT, VOTING, Outing
from app.services.outings.rounds import Round, RoundIn, current_round, sent_round
from app.services.notifications import push
from app.services.outings.stages import move

logger = logging.getLogger(__name__)
router = APIRouter(tags=["voting"])

PLAN_ITEM_SQL = text("SELECT id FROM plan_items WHERE id = :item AND round_id = :round")
MEMBER_SQL = text("SELECT 1 FROM round_members WHERE round_id = :round AND participant_id = :participant")
UPSERT_VOTE = text("""
    INSERT INTO votes (id, participant_id, plan_item_id, liked, is_tiebreak, updated_at)
    VALUES (:id, :participant, :item, :liked, false, timezone('utc', now()))
    ON CONFLICT (participant_id, plan_item_id, is_tiebreak)
    DO UPDATE SET liked = EXCLUDED.liked, updated_at = EXCLUDED.updated_at
""")
MY_VOTES_SQL = text("""
    SELECT v.plan_item_id, v.liked FROM votes v JOIN plan_items pi ON pi.id = v.plan_item_id
    WHERE v.participant_id = :participant AND pi.round_id = :round AND NOT v.is_tiebreak
    ORDER BY pi.rank
""")
# Counts only: who liked what stays private. A member "completed" when they answered every suggestion.
PROGRESS_SQL = text("""
    WITH items AS (SELECT count(*) AS n FROM plan_items WHERE round_id = :round),
         answered AS (
             SELECT m.participant_id, count(v.id) AS n
             FROM round_members m
             LEFT JOIN votes v ON v.participant_id = m.participant_id AND NOT v.is_tiebreak
                 AND v.plan_item_id IN (SELECT id FROM plan_items WHERE round_id = :round)
             WHERE m.round_id = :round
             GROUP BY m.participant_id)
    SELECT (SELECT n FROM items) AS items_count,
           count(*) AS members_count,
           count(*) FILTER (WHERE answered.n = (SELECT n FROM items) AND (SELECT n FROM items) > 0) AS completed_count
    FROM answered
""")
# Likes and passes from the round's members only, best first by D09: likes, then the stored rank, then the id.
TALLY_SQL = text("""
    SELECT pi.id, pi.rank, pi.restaurant_id, r.name_ar, r.name_en, r.district, r.maps_url,
           count(v.id) FILTER (WHERE v.liked) AS likes,
           count(v.id) FILTER (WHERE NOT v.liked) AS passes
    FROM plan_items pi
    JOIN restaurants r ON r.id = pi.restaurant_id
    LEFT JOIN votes v ON v.plan_item_id = pi.id AND NOT v.is_tiebreak
        AND v.participant_id IN (SELECT participant_id FROM round_members WHERE round_id = :round)
    WHERE pi.round_id = :round
    GROUP BY pi.id, r.id
    ORDER BY likes DESC, pi.rank, pi.id
""")
SET_WINNER = text("UPDATE plan_items SET is_winner = COALESCE(id = CAST(:item AS uuid), false) WHERE round_id = :round")


class VoteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plan_item_id: uuid.UUID
    liked: bool
    round_id: uuid.UUID | None = None  # missing or older: 409 STALE_ROUND


def _unavailable() -> ApiError:
    return ApiError(503, "VOTING_UNAVAILABLE", "Voting is not available right now. Please try again.")


def _progress(db: Session, rnd: Round) -> dict:
    row = db.execute(PROGRESS_SQL, {"round": rnd.id}).one()
    return {"items_count": row.items_count, "members_count": row.members_count,
            "completed_count": row.completed_count}


def _settle(db: Session, outing: Outing, rnd: Round) -> list[uuid.UUID]:
    """End voting: mark the winner, if any, and move to the result. Call under the row lock.

    Returns the result notifications queued in the same transaction (BE-25), to send after the commit.
    """
    tally = db.execute(TALLY_SQL, {"round": rnd.id}).all()
    winner = tally[0] if tally and tally[0].likes > 0 else None
    db.execute(SET_WINNER, {"round": rnd.id, "item": winner.id if winner else None})
    move(outing, RESULT)
    db.flush()
    return push.record(db, outing.id, push.RESULT, rnd.number)


def _result(db: Session, outing: Outing, rnd: Round) -> dict:
    tally = db.execute(TALLY_SQL, {"round": rnd.id}).all()
    progress = _progress(db, rnd)
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
        "round_id": str(rnd.id),
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
def cast_vote(outing_id: uuid.UUID, body: VoteIn, background: BackgroundTasks,
              caller: Caller = Depends(current_caller), db: Session = Depends(get_db)) -> dict:
    notify = []
    try:
        outing, me = participant_of(db, outing_id, caller, lock=True)
        rnd = current_round(db, outing, body.round_id)
        if outing.status != VOTING:
            raise ApiError(409, "VOTING_NOT_OPEN", "Voting is not open for this outing.")
        if me.attendance != CONFIRMED or db.execute(MEMBER_SQL, {"round": rnd.id, "participant": me.id}).first() is None:
            raise ApiError(403, "NOT_A_MEMBER", "Only people taking part in this outing can vote.")
        if db.execute(PLAN_ITEM_SQL, {"item": body.plan_item_id, "round": rnd.id}).first() is None:
            raise ApiError(404, "PLAN_ITEM_NOT_FOUND", "This suggestion is not part of this outing's plan.")

        db.execute(UPSERT_VOTE, {"id": uuid.uuid4(), "participant": me.id, "item": body.plan_item_id,
                                 "liked": body.liked})
        progress = _progress(db, rnd)
        complete = progress["members_count"] > 0 and progress["completed_count"] == progress["members_count"]
        if complete:  # D07: the last answer ends voting, in the same transaction
            notify = _settle(db, outing, rnd)
        db.commit()
        background.add_task(push.deliver, notify)
    except SQLAlchemyError:
        db.rollback()
        logger.exception("cast vote failed")
        raise _unavailable()
    return {"plan_item_id": str(body.plan_item_id), "liked": body.liked, "voting_complete": complete,
            "status": outing.status, "round_id": str(rnd.id), **progress}


@router.get("/outings/{outing_id}/votes")
def my_votes(outing_id: uuid.UUID, round_id: uuid.UUID | None = Query(None),
             caller: Caller = Depends(current_caller), db: Session = Depends(get_db)) -> dict:
    try:
        outing, me = participant_of(db, outing_id, caller)
        rnd = current_round(db, outing, round_id)
        votes = db.execute(MY_VOTES_SQL, {"participant": me.id, "round": rnd.id}).all()
        progress = _progress(db, rnd)
    except SQLAlchemyError:
        logger.exception("read votes failed")
        raise _unavailable()
    return {"outing_id": str(outing.id), "status": outing.status, "round_id": str(rnd.id),
            "votes": [{"plan_item_id": str(v.plan_item_id), "liked": v.liked} for v in votes],
            "answered_count": len(votes), **progress}


@router.post("/outings/{outing_id}/end-voting")
def end_voting(outing_id: uuid.UUID, background: BackgroundTasks, body: RoundIn | None = Body(None),
               caller: Caller = Depends(current_caller), db: Session = Depends(get_db)) -> dict:
    notify = []
    try:
        outing, me = participant_of(db, outing_id, caller, lock=True)
        if not is_organizer(outing, me):
            raise ApiError(403, "ORGANIZER_ONLY", "Only the organizer can end voting.")
        rnd = current_round(db, outing, sent_round(body))
        if outing.status == VOTING:
            notify = _settle(db, outing, rnd)
        elif outing.status != RESULT:  # asked again after the result: the same result
            raise ApiError(409, "VOTING_NOT_OPEN", "Voting is not open for this outing.")
        result = _result(db, outing, rnd)
        db.commit()
        background.add_task(push.deliver, notify)
    except SQLAlchemyError:
        db.rollback()
        logger.exception("end voting failed")
        raise _unavailable()
    return result


@router.get("/outings/{outing_id}/result")
def read_result(outing_id: uuid.UUID, round_id: uuid.UUID | None = Query(None),
                caller: Caller = Depends(current_caller), db: Session = Depends(get_db)) -> dict:
    try:
        outing, _ = participant_of(db, outing_id, caller)
        rnd = current_round(db, outing, round_id)
        if outing.status != RESULT:
            raise ApiError(409, "RESULT_NOT_READY", "Voting has not finished for this outing.")
        result = _result(db, outing, rnd)
    except SQLAlchemyError:
        logger.exception("read result failed")
        raise _unavailable()
    return result
