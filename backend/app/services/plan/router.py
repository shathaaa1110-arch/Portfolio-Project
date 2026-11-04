"""Generate the group's plan and open voting (BE-17, #30).

POST /outings/{outing_id}/start-voting  organizer only, once every confirmed participant is ready
GET  /outings/{outing_id}/plan          the stored plan, the same for every participant

Rules (release decisions D04, D05, D06):
  - only the organizer generates, and only when everyone confirmed is ready; the last Ready
    never generates by itself;
  - readiness and membership are checked under the outing's row lock, the same lock a join,
    a save or a stage change takes, so a person who joins at that moment is never left out;
  - the plan and the move to voting are saved in one transaction; voting closes joining;
  - no matching restaurant means no voting: nothing is saved and the outing stays in
    preferences, so people can change their answers and the organizer can try again;
  - asking again once voting is open returns the stored plan; nothing is generated twice.

One round per outing for now. Separate rounds for a retry come with DB-07 (#14) and BE-31 (#90).
"""
import logging
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ApiError
from app.services.outings.access import Caller, current_caller, is_organizer, participant_of
from app.services.outings.models import CONFIRMED, PREFERENCES, VOTING, Outing
from app.services.outings.stages import move, readiness
from app.services.plan.engine import EXCLUDED_FLAGS, EXCLUDED_VENUES, Preferences, Restaurant, distance_km, recommend
from app.services.plan.reasons import reason_text

PLAN_SIZE = 5
RIYADH = ZoneInfo("Asia/Riyadh")
FLAG_SEPARATOR = "|"  # restaurants.flags is text (database/load_place_details.py)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["plan"])

DISTRICT_SQL = text("SELECT latitude, longitude FROM districts WHERE id = :id")
PEOPLE_SQL = text("""
    SELECT pr.liked_cuisines, pr.allergies, pr.budget_min, pr.budget_max, pr.max_distance_km
    FROM participants pa LEFT JOIN preferences pr ON pr.participant_id = pa.id
    WHERE pa.outing_id = :outing_id AND pa.attendance = :confirmed
""")
# Only rows the engine could ever accept: known hours and spend, inside everyone's budget.
# The engine still checks every rule; this only keeps the load small.
CANDIDATES_SQL = text("""
    SELECT id, cuisine, latitude, longitude, spend_low, spend_high, quality_score, brand_id,
           venue_type, flags, opening_hours
    FROM restaurants
    WHERE opening_hours->>'days_open' = '7' AND spend_low IS NOT NULL AND spend_high IS NOT NULL
      AND (venue_type IS NULL OR NOT (venue_type = ANY(:venues)))
      AND (CAST(:budget_max AS INTEGER) IS NULL OR spend_low <= :budget_max)
      AND (CAST(:budget_min AS INTEGER) IS NULL OR spend_high >= :budget_min)
""")
PLAN_SQL = text("""
    SELECT pi.id, pi.rank, pi.match_score, pi.reason, r.id AS restaurant_id, r.name_ar, r.name_en, r.cuisine,
           r.district, r.price_tier, r.rating, r.spend_low, r.spend_high, r.maps_url, r.latitude, r.longitude
    FROM plan_items pi JOIN restaurants r ON r.id = pi.restaurant_id
    WHERE pi.outing_id = :outing_id ORDER BY pi.rank
""")
INSERT_ITEM = text("""
    INSERT INTO plan_items (id, outing_id, restaurant_id, rank, match_score, reason, is_winner)
    VALUES (:id, :outing_id, :restaurant_id, :rank, :match_score, :reason, false)
""")
ALLERGIES_SQL = text("""
    SELECT DISTINCT trim(a) AS allergy
    FROM participants pa JOIN preferences pr ON pr.participant_id = pa.id, unnest(pr.allergies) AS a
    WHERE pa.outing_id = :outing_id AND pa.attendance = :confirmed AND trim(a) <> ''
    ORDER BY 1
""")


def _unavailable() -> ApiError:
    return ApiError(503, "PLAN_UNAVAILABLE", "Could not reach the suggestions right now. Please try again.")


def _minutes(hhmm: str) -> int:
    hours, minutes = hhmm.split(":")
    return int(hours) * 60 + int(minutes)


def hours_from_summary(summary: dict | None) -> dict[int, list[tuple[int, int]]] | None:
    """restaurants.opening_hours is a summary: {opens, closes, open_24h, days_open}.

    Only a place open every day has hours we can trust for any date. Fewer days open, or missing
    times, mean we do not know which days, so the hours are unknown and the place is left out (D04).
    """
    if not summary or summary.get("days_open") != 7:
        return None
    if summary.get("open_24h"):
        return {day: [(0, 1440)] for day in range(7)}
    try:
        opens, closes = _minutes(summary["opens"]), _minutes(summary["closes"])
    except (KeyError, TypeError, ValueError):
        return None
    if closes <= opens:  # runs past midnight, e.g. 16:00 to 01:30
        closes += 1440
    return {day: [(opens, closes)] for day in range(7)}


def _restaurant(r) -> Restaurant:
    return Restaurant(
        id=r.id,
        cuisines=tuple(c.strip() for c in (r.cuisine or "").split(",") if c.strip()),
        lat=float(r.latitude),
        lon=float(r.longitude),
        spend_low=r.spend_low,
        spend_high=r.spend_high,
        quality_score=float(r.quality_score) if r.quality_score is not None else None,
        brand_id=r.brand_id,
        venue_type=r.venue_type,
        flags=tuple(f for f in (r.flags or "").split(FLAG_SEPARATOR) if f),
        hours=hours_from_summary(r.opening_hours),
    )


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
    rows = db.execute(CANDIDATES_SQL, {"venues": sorted(EXCLUDED_VENUES), "budget_max": budget_max,
                                       "budget_min": budget_min}).all()
    restaurants = [r for r in map(_restaurant, rows) if not EXCLUDED_FLAGS.intersection(r.flags)]
    when = outing.starts_at.astimezone(RIYADH).replace(tzinfo=None)  # opening hours are local times
    return recommend(restaurants, people, when, lat, lon, limit=PLAN_SIZE)


def _plan(db: Session, outing: Outing) -> dict:
    lat, lon = _centre(db, outing)
    items = []
    for r in db.execute(PLAN_SQL, {"outing_id": outing.id}).all():
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
    return {"outing_id": str(outing.id), "status": outing.status, "allergy_warning": allergies, "plan_items": items}


@router.post("/outings/{outing_id}/start-voting")
def start_voting(outing_id: uuid.UUID, caller: Caller = Depends(current_caller),
                 db: Session = Depends(get_db)) -> dict:
    try:
        outing, me = participant_of(db, outing_id, caller, lock=True)
        if not is_organizer(outing, me):
            raise ApiError(403, "ORGANIZER_ONLY", "Only the organizer can generate the suggestions.")
        if outing.status != PREFERENCES:
            if db.execute(PLAN_SQL, {"outing_id": outing.id}).first() is not None:
                return _plan(db, outing)  # asked again: the stored plan, nothing generated twice
            raise ApiError(409, "INVALID_STATUS_TRANSITION",
                           f"The outing cannot move from the {outing.status} stage to the voting stage.")

        ready, total = readiness(db, outing.id)
        if total == 0 or ready < total:
            raise ApiError(409, "NOT_EVERYONE_READY", "Wait until everyone is ready.",
                           ready_count=ready, total_count=total)

        picks = _generate(db, outing)
        if not picks:
            # D04: no relaxed limits and no empty voting. Nothing is saved; the outing stays open.
            return {"outing_id": str(outing.id), "status": outing.status, "allergy_warning": [], "plan_items": [],
                    "message": "No restaurant matches everyone's conditions. Change some answers and try again."}

        for p in picks:
            db.execute(INSERT_ITEM, {
                "id": uuid.uuid4(), "outing_id": outing.id, "restaurant_id": p.restaurant.id, "rank": p.rank,
                "match_score": p.match_score, "reason": reason_text(p.reasons, p.distance_km),
            })
        move(outing, VOTING)  # also closes joining (BE-09) and answers (BE-13)
        db.flush()
        plan = _plan(db, outing)
        db.commit()  # the plan and the stage change are saved together, then the lock is released
    except SQLAlchemyError:
        db.rollback()
        logger.exception("start voting failed")
        raise _unavailable()
    return plan


@router.get("/outings/{outing_id}/plan")
def read_plan(outing_id: uuid.UUID, caller: Caller = Depends(current_caller),
              db: Session = Depends(get_db)) -> dict:
    try:
        outing, _ = participant_of(db, outing_id, caller)
        plan = _plan(db, outing)
    except SQLAlchemyError:
        logger.exception("read plan failed")
        raise _unavailable()
    if not plan["plan_items"]:
        raise ApiError(409, "PLAN_NOT_READY", "The suggestions have not been generated yet.")
    return plan
