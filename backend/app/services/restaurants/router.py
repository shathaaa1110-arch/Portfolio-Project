"""Public restaurant browsing: the Home list (BE-32, #101), its search and filters, and one
restaurant's details (BE-27, #46).

Public: no login, outing or group is needed, and nothing personal is returned.
`search` filters by Arabic or English name, or by a cuisine name (rules in search.py);
`cuisine` takes the 18 category keys used by preferences, `district_id` an id from GET /districts.
All filters combine, and are applied before paging; `total` is the number of matches.
The one exception is GET /restaurants/{id}?outing_id=...: the outing's reason for this place is
private, so it needs the token of someone still in that outing.
"""
import logging
import uuid

from app.core.database import get_db
from app.core.errors import ApiError
from app.services.auth.dependencies import bearer
from app.services.outings.access import current_caller, participant_of
from app.services.plan.cuisines import CUISINE_GROUPS
from app.services.restaurants.search import MAX_SEARCH_CHARS, codes_for, like_pattern, normalize
from fastapi import APIRouter, Depends, Path, Query
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

DEFAULT_LIMIT = 20
MAX_LIMIT = 50

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/restaurants", tags=["restaurants"])

CARD_COLUMNS = "id, name_ar, name_en, cuisine, district, price_tier, rating, maps_url, image_url"
# Best places first; id keeps the order stable between pages.
ORDER = "ORDER BY quality_score DESC NULLS LAST, rating DESC NULLS LAST, id"
MAX_ID = 2_147_483_647  # restaurants.id is INTEGER; larger ids cannot exist

# A name match uses the trigram index on search_text; a cuisine match compares the
# comma-separated codes with a list of codes, using the expression index. Both indexes come
# from migration 0004, and the cuisine expression below must stay identical to its
# CUISINE_CODES, or PostgreSQL falls back to scanning every row.
CUISINE_CODES = "regexp_split_to_array(cuisine, '\\s*,\\s*')"
SEARCH_FILTER = f"(search_text LIKE :pattern ESCAPE '\\' OR {CUISINE_CODES} && CAST(:codes AS TEXT[]))"
CUISINE_FILTER = f"{CUISINE_CODES} && CAST(:cuisine_codes AS TEXT[])"
# restaurants.district holds the district's Arabic name, which matches districts.name_ar.
DISTRICT_FILTER = "district = (SELECT name_ar FROM districts WHERE id = :district_id)"
DISTRICT_EXISTS = text("SELECT 1 FROM districts WHERE id = :id")

DETAILS_SQL = text("""
    SELECT r.id, r.name_ar, r.name_en, r.cuisine, r.district, d.id AS district_id, r.price_tier,
           r.spend_low, r.spend_high, r.rating, r.rating_count, r.opening_hours, r.summary,
           r.latitude, r.longitude, r.maps_url, r.image_url
    FROM restaurants r LEFT JOIN districts d ON d.name_ar = r.district
    WHERE r.id = :id
""")
# The reason from the outing's current round (BE-31): an earlier round may have suggested the same place.
REASON_SQL = text("""
    SELECT p.reason FROM plan_items p JOIN outings o ON o.current_round_id = p.round_id
    WHERE o.id = :outing AND p.restaurant_id = :id
""")


def _list_sql(filters: list[str]) -> tuple:
    where = (" WHERE " + " AND ".join(filters)) if filters else ""
    return (text(f"SELECT {CARD_COLUMNS} FROM restaurants{where} {ORDER} LIMIT :limit OFFSET :offset"),
            text(f"SELECT COUNT(*) FROM restaurants{where}"))


def _cuisine_codes(value: str | None) -> list[str]:
    """Category keys from ?cuisine=a,b, turned into the dataset codes under them; 422 for unknown keys."""
    keys = list(dict.fromkeys(k.strip() for k in (value or "").split(",") if k.strip()))
    if any(k not in CUISINE_GROUPS for k in keys):
        raise ApiError(422, "VALIDATION_ERROR", "Some fields are missing or invalid.", fields=["query.cuisine"])
    return sorted({code for k in keys for code in CUISINE_GROUPS[k]})


def _hours(summary: dict | None) -> dict | None:
    """The stored summary when anything is known; null when the hours are unknown."""
    if not isinstance(summary, dict):
        return None
    open_24h = summary.get("open_24h") is True
    if not open_24h and not (summary.get("opens") and summary.get("closes")):
        return None
    return {"open_24h": open_24h, "opens": None if open_24h else summary["opens"],
            "closes": None if open_24h else summary["closes"], "days_open": summary.get("days_open")}


def _cuisines(value: str | None) -> list[str]:
    return [c.strip() for c in (value or "").split(",") if c.strip()]


def _row(r) -> dict:
    return {
        "id": r.id,
        "name_ar": r.name_ar,
        "name_en": r.name_en,
        "cuisines": _cuisines(r.cuisine),
        "district": r.district,
        "price_tier": r.price_tier,
        "rating": float(r.rating) if r.rating is not None else None,
        "maps_url": r.maps_url,
        # Recommendation summaries also reuse this serializer without selecting photos.
        "image_url": getattr(r, "image_url", None),
    }


@router.get("")
def list_restaurants(
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None, max_length=MAX_SEARCH_CHARS),
    cuisine: str | None = Query(None, max_length=400),
    district_id: str | None = Query(None, max_length=64),
    db: Session = Depends(get_db),
) -> dict:
    """A bounded page of restaurants, best first. No match returns an empty list and total 0."""
    term = normalize(search or "")
    cuisine_codes = _cuisine_codes(cuisine)
    district = (district_id or "").strip()
    filters, params = [], {}
    if term:  # a term of only spaces is no filter
        filters.append(SEARCH_FILTER)
        params.update(pattern=like_pattern(term), codes=codes_for(term))
    if cuisine_codes:
        filters.append(CUISINE_FILTER)
        params["cuisine_codes"] = cuisine_codes
    if district:
        filters.append(DISTRICT_FILTER)
        params["district_id"] = district
    rows_sql, count_sql = _list_sql(filters)
    try:
        if district and db.execute(DISTRICT_EXISTS, {"id": district}).first() is None:
            raise ApiError(422, "UNKNOWN_DISTRICT", "Choose a district from the list.")
        rows = db.execute(rows_sql, {**params, "limit": limit, "offset": offset}).all()
        total = db.execute(count_sql, params).scalar_one()
    except SQLAlchemyError:
        logger.exception("restaurants query failed")
        raise _unavailable()
    return {"restaurants": [_row(r) for r in rows], "total": total, "limit": limit, "offset": offset}


@router.get("/{restaurant_id}")
def restaurant_details(
    restaurant_id: int = Path(ge=1, le=MAX_ID),
    outing_id: uuid.UUID | None = Query(None),
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> dict:
    """Everything stored about one place. Unknown hours or rating come back as null, never guessed.

    reason is null unless outing_id is given; then the caller must be in that outing (login or
    guest token), and reason is the outing's reason when this place is one of its current round's suggestions.
    """
    caller = current_caller(creds) if outing_id is not None else None  # 401 before touching the database
    try:
        r = db.execute(DETAILS_SQL, {"id": restaurant_id}).first()
        if r is None:
            raise ApiError(404, "RESTAURANT_NOT_FOUND", "This restaurant does not exist.")
        reason = None
        if caller is not None:
            participant_of(db, outing_id, caller)  # 404 OUTING_NOT_FOUND, or 403 for outsiders
            reason = db.execute(REASON_SQL, {"outing": outing_id, "id": restaurant_id}).scalar_one_or_none()
    except SQLAlchemyError:
        logger.exception("restaurant details query failed")
        raise _unavailable()
    return {
        **_row(r),
        "district_id": r.district_id,
        "spend_low": r.spend_low,
        "spend_high": r.spend_high,
        "rating_count": r.rating_count,
        "opening_hours": _hours(r.opening_hours),
        "summary": r.summary,
        "latitude": float(r.latitude) if r.latitude is not None else None,
        "longitude": float(r.longitude) if r.longitude is not None else None,
        "reason": reason,
    }


def _unavailable() -> ApiError:
    return ApiError(503, "RESTAURANTS_UNAVAILABLE", "Restaurants are not available right now. Please try again.")
