"""Personal recommendations for the signed-in account (BE-28, #48).

GET /users/me/recommendations?limit=10&lat=..&lon=..   (or &district_id=.. when location is refused)

Reads the account's saved preferences and runs the same engine and the same candidate rules as the
group plan (BE-17), with one person, at the current Riyadh time. Nothing is saved.

Response: {"restaurants": [ <restaurant card fields> + spend_low, spend_high, match_score, reason,
distance_km ]}, best first. The shape matches frontend/src/features/personalSuggestions.
An empty list is a valid answer: nothing open now matches.
"""
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import bindparam, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ApiError
from app.services.auth.dependencies import current_user
from app.services.auth.models import User
from app.services.plan.candidates import load_candidates
from app.services.plan.engine import LocationRequired, Preferences, recommend
from app.services.plan.reasons import reason_text
from app.services.preferences.models import Preference
from app.services.restaurants.router import _row

RIYADH = ZoneInfo("Asia/Riyadh")
DEFAULT_LIMIT = 10
MAX_LIMIT = 20

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users/me", tags=["recommendations"])

DISTRICT_SQL = text("SELECT latitude, longitude FROM districts WHERE id = :id")
DETAILS_SQL = text(
    "SELECT id, name_ar, name_en, cuisine, district, price_tier, rating, maps_url, spend_low, spend_high "
    "FROM restaurants WHERE id IN :ids"
).bindparams(bindparam("ids", expanding=True))


def _now() -> datetime:
    """Riyadh wall-clock time; the engine compares it with local opening hours."""
    return datetime.now(RIYADH).replace(tzinfo=None)


def _preferences(db: Session, user: User) -> Preferences:
    """The account's saved answers. No saved answers means no limits: the best open places."""
    p = db.scalars(select(Preference).where(Preference.user_id == user.id)).first()
    if p is None:
        return Preferences()
    return Preferences(
        liked_cuisines=tuple(p.liked_cuisines or ()),
        budget_min=p.budget_min,
        budget_max=p.budget_max,
        max_distance_km=float(p.max_distance_km) if p.max_distance_km is not None else None,
    )


def _location(db: Session, lat: float | None, lon: float | None,
              district_id: str | None) -> tuple[float | None, float | None]:
    """Coordinates win; a district is the fallback when the person refused location."""
    if (lat is None) != (lon is None):
        raise ApiError(422, "VALIDATION_ERROR", "Send both lat and lon, or neither.",
                       fields=["query.lat", "query.lon"])
    if lat is not None:
        return lat, lon
    if district_id:
        row = db.execute(DISTRICT_SQL, {"id": district_id}).first()
        if row is None:
            raise ApiError(404, "DISTRICT_NOT_FOUND", "This district is not available. Choose another one.")
        return float(row.latitude), float(row.longitude)
    return None, None


@router.get("/recommendations")
def personal_recommendations(
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    district_id: str | None = Query(None, max_length=64),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Up to `limit` places open now for this account, best first."""
    try:
        prefs = _preferences(db, user)
        lat, lon = _location(db, lat, lon, district_id)
        if prefs.max_distance_km and lat is None:
            # Checked before loading anything: the distance limit cannot be kept without a location.
            raise ApiError(422, "LOCATION_REQUIRED",
                           "Share your location or choose a district to use your distance limit.")
        restaurants = load_candidates(db, prefs.budget_min, prefs.budget_max, lat, lon, prefs.max_distance_km)
        try:
            picks = recommend(restaurants, [prefs], _now(), lat, lon, limit=limit)
        except LocationRequired:  # the engine's own guard; unreachable after the check above
            raise ApiError(422, "LOCATION_REQUIRED",
                           "Share your location or choose a district to use your distance limit.")
        ids = [p.restaurant.id for p in picks]
        details = {r.id: r for r in db.execute(DETAILS_SQL, {"ids": ids})} if ids else {}
    except SQLAlchemyError:
        logger.exception("personal recommendations failed")
        raise ApiError(503, "RECOMMENDATIONS_UNAVAILABLE",
                       "Recommendations are not available right now. Please try again.")

    return {"restaurants": [
        {
            **_row(details[p.restaurant.id]),
            "spend_low": details[p.restaurant.id].spend_low,
            "spend_high": details[p.restaurant.id].spend_high,
            "match_score": p.match_score,
            "reason": reason_text(p.reasons, p.distance_km),
            "distance_km": p.distance_km,
        }
        for p in picks  # already in rank order
    ]}
