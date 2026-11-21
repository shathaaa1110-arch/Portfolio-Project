"""Generate the group's plan and open voting (BE-17, #30).

POST /outings/{outing_id}/start-voting  organizer only, once every confirmed participant is ready
GET  /outings/{outing_id}/plan          the stored plan, the same for every participant

Rules (release decisions D04, D05, D06):
  - only the organizer generates, and only when everyone confirmed is ready; the last Ready
    never generates by itself;
  - readiness and membership are checked under the outing's row lock, the same lock a join,
    a save or a stage change takes, so a person who joins at that moment is never left out;
  - the plan and the move to voting are saved in one transaction; voting closes joining;
  - no matching restaurant means no voting (D04): no limit is relaxed, the round is marked
    no_matches so everyone sees it, and the organizer starts a new round (BE-31) in which people
    can change their answers;
  - asking again once voting is open returns the stored plan; nothing is generated twice.

The plan belongs to the outing's current round (DB-07, BE-31). Both requests name it with round_id;
an older or missing id gets 409 STALE_ROUND. Generation also saves who is in the round, so its result
is counted on the same people.
"""
import logging
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Body, Depends, Query
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ApiError
from app.services.outings.access import Caller, current_caller, is_organizer, participant_of
from app.services.outings.models import CONFIRMED, PREFERENCES, VOTING, Outing
from app.services.outings.rounds import (NO_MATCHES, Round, RoundIn, current_round, mark_no_matches, round_ended,
                                         sent_round, snapshot_members)
from app.services.outings.stages import move, readiness
from app.services.notifications import push
from app.services.plan.candidates import load_candidates
from app.services.plan.engine import Preferences, distance_km, recommend
from app.services.plan.reasons import reason_text

PLAN_SIZE = 5
RIYADH = ZoneInfo("Asia/Riyadh")

logger = logging.getLogger(__name__)
router = APIRouter(tags=["plan"])

DISTRICT_SQL = text("SELECT latitude, longitude FROM districts WHERE id = :id")
PEOPLE_SQL = text("""
    SELECT pr.liked_cuisines, pr.allergies, pr.budget_min, pr.budget_max, pr.max_distance_km
    FROM participants pa LEFT JOIN preferences pr ON pr.participant_id = pa.id
    WHERE pa.outing_id = :outing_id AND pa.attendance = :confirmed
""")
PLAN_SQL = text("""
    SELECT pi.id, pi.rank, pi.match_score, pi.reason, r.id AS restaurant_id, r.name_ar, r.name_en, r.cuisine,
           r.district, r.price_tier, r.rating, r.spend_low, r.spend_high, r.maps_url, r.latitude, r.longitude
    FROM plan_items pi JOIN restaurants r ON r.id = pi.restaurant_id
    WHERE pi.round_id = :round_id ORDER BY pi.rank
""")
INSERT_ITEM = text("""
    INSERT INTO plan_items (id, outing_id, round_id, restaurant_id, rank, match_score, reason, is_winner)
    VALUES (:id, :outing_id, :round_id, :restaurant_id, :rank, :match_score, :reason, false)
""")
ALLERGIES_SQL = text("""
    SELECT DISTINCT trim(a) AS allergy
    FROM participants pa JOIN preferences pr ON pr.participant_id = pa.id, unnest(pr.allergies) AS a
    WHERE pa.outing_id = :outing_id AND pa.attendance = :confirmed AND trim(a) <> ''
    ORDER BY 1
""")


def _unavailable() -> ApiError:
    return ApiError(503, "PLAN_UNAVAILABLE", "Could not reach the suggestions right now. Please try again.")


def _people(db: Session, outing: Outing) -> list[Preferences]:
    rows = db.execute(PEOPLE_SQL, {"outing_id": outing.id, "confirmed": CONFIRMED}).all()
    return [Preferences(
        liked_cuisines=tuple(r.liked_cuisines or ()),
        budget_min=r.budget_min,
        budget_max=r.budget_max,
        max_distance_km=float(r.max_distance_km) if r.max_distance_km is not None else None,
    ) for r in rows]


def _centre(db: Session, outing: Outing) -> tuple[float, float]:
    row = db.execute(DISTRICT_SQL, {"id": outing.district}).first()
    return float(row.latitude), float(row.longitude)


def _generate(db: Session, outing: Outing) -> list:
    people = _people(db, outing)
    lat, lon = _centre(db, outing)
    budget_max = min((p.budget_max for p in people if p.budget_max is not None), default=None)
    budget_min = max((p.budget_min for p in people if p.budget_min is not None), default=None)
    # The tightest distance limit in the group, as the engine applies it (engine.filter_candidates):
    # read only the places inside its box instead of every candidate in Riyadh.
    max_km = min((p.max_distance_km for p in people if p.max_distance_km), default=None)
    restaurants = load_candidates(db, budget_min, budget_max, lat, lon, max_km)
    when = outing.starts_at.astimezone(RIYADH).replace(tzinfo=None)  # opening hours are local times
    return recommend(restaurants, people, when, lat, lon, limit=PLAN_SIZE)


def _plan(db: Session, outing: Outing, rnd: Round) -> dict:
    lat, lon = _centre(db, outing)
    items = []
    for r in db.execute(PLAN_SQL, {"round_id": rnd.id}).all():
        items.append({
            "plan_item_id": str(r.id),
            "rank": r.rank,
            "match_score": r.match_score,
            "reason": r.reason,
            "restaurant": {
                "id": r.restaurant_id,
                "name_ar": r.name_ar,
                "name_en": r.name_en,
                "cuisines": [c.strip() for c in (r.cuisine or "").split(",") if c.strip()],
                "district": r.district,
                "price_tier": r.price_tier,
                "rating": float(r.rating) if r.rating is not None else None,
                "spend_low": r.spend_low,
                "spend_high": r.spend_high,
                "maps_url": r.maps_url,
                "distance_km": round(distance_km(lat, lon, float(r.latitude), float(r.longitude)), 1),
            },
        })
    allergies = [row.allergy for row in db.execute(ALLERGIES_SQL, {"outing_id": outing.id, "confirmed": CONFIRMED})]
    return {"outing_id": str(outing.id), "status": outing.status, "round_id": str(rnd.id),
            "allergy_warning": allergies, "plan_items": items}


@router.post("/outings/{outing_id}/start-voting")
def start_voting(outing_id: uuid.UUID, background: BackgroundTasks, body: RoundIn | None = Body(None),
                 caller: Caller = Depends(current_caller), db: Session = Depends(get_db)) -> dict:
    try:
        outing, me = participant_of(db, outing_id, caller, lock=True)
        if not is_organizer(outing, me):
            raise ApiError(403, "ORGANIZER_ONLY", "Only the organizer can generate the suggestions.")
        rnd = current_round(db, outing, sent_round(body))
        if rnd.ended:
            raise round_ended()
        if outing.status != PREFERENCES:
            if db.execute(PLAN_SQL, {"round_id": rnd.id}).first() is not None:
                return _plan(db, outing, rnd)  # asked again: the stored plan, nothing generated twice
            raise ApiError(409, "INVALID_STATUS_TRANSITION",
                           f"The outing cannot move from the {outing.status} stage to the voting stage.")

        ready, total = readiness(db, outing.id)
        if total == 0 or ready < total:
            raise ApiError(409, "NOT_EVERYONE_READY", "Wait until everyone is ready.",
                           ready_count=ready, total_count=total)

        picks = _generate(db, outing)
        if not picks:
            # D04: no relaxed limits and no empty voting. The round ends as no_matches for everyone to see;
            # the organizer starts a new round, where people can change their answers (BE-31).
            mark_no_matches(db, rnd)
            db.commit()
            return {"outing_id": str(outing.id), "status": outing.status, "round_id": str(rnd.id),
                    "round_outcome": NO_MATCHES, "allergy_warning": [], "plan_items": [],
                    "message": "No restaurant matches everyone's conditions. Start a new round to change answers."}

        snapshot_members(db, outing, rnd)  # the result of this round is counted on these people
        for p in picks:
            db.execute(INSERT_ITEM, {
                "id": uuid.uuid4(), "outing_id": outing.id, "round_id": rnd.id, "restaurant_id": p.restaurant.id,
                "rank": p.rank, "match_score": p.match_score, "reason": reason_text(p.reasons, p.distance_km),
            })
        move(outing, VOTING)  # also closes joining (BE-09) and answers (BE-13)
        db.flush()
        # BE-25: queued with the plan; the organizer started it, so they are not told.
        notify = push.record(db, outing.id, push.VOTING_STARTED, rnd.number, skip_user=outing.organizer_id)
        plan = _plan(db, outing, rnd)
        db.commit()  # the plan and the stage change are saved together, then the lock is released
        background.add_task(push.deliver, notify)  # sent after the reply; a failure changes nothing here
    except SQLAlchemyError:
        db.rollback()
        logger.exception("start voting failed")
        raise _unavailable()
    return plan


@router.get("/outings/{outing_id}/plan")
def read_plan(outing_id: uuid.UUID, round_id: uuid.UUID | None = Query(None),
              caller: Caller = Depends(current_caller), db: Session = Depends(get_db)) -> dict:
    try:
        outing, _ = participant_of(db, outing_id, caller)
        plan = _plan(db, outing, current_round(db, outing, round_id))
    except SQLAlchemyError:
        logger.exception("read plan failed")
        raise _unavailable()
    if not plan["plan_items"]:
        raise ApiError(409, "PLAN_NOT_READY", "The suggestions have not been generated yet.")
    return plan
