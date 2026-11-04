"""General restaurant list for Home (BE-32, #101) and its search (#46).

Public: no login, outing or group is needed, and nothing personal is returned.
`search` filters by Arabic or English name, or by a cuisine name, before paging;
`total` is the number of matches. Rules for the term are in search.py.
"""
import logging

from app.core.database import get_db
from app.core.errors import ApiError
from app.services.restaurants.search import MAX_SEARCH_CHARS, codes_for, like_pattern, normalize
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

DEFAULT_LIMIT = 20
MAX_LIMIT = 50

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/restaurants", tags=["restaurants"])

# Best places first; id keeps the order stable between pages.
LIST_SQL = text(
    """
    SELECT id, name_ar, name_en, cuisine, district, price_tier, rating, maps_url
    FROM restaurants
    ORDER BY quality_score DESC NULLS LAST, rating DESC NULLS LAST, id
    LIMIT :limit OFFSET :offset
    """
)
COUNT_SQL = text("SELECT COUNT(*) FROM restaurants")

# A name match uses the trigram index on search_text; a cuisine match compares the
# comma-separated codes with the codes whose names contain the term, using the expression
# index. Both indexes come from migration 0004, and the cuisine expression below must stay
# identical to its CUISINE_CODES, or PostgreSQL falls back to scanning every row.
CUISINE_CODES = "regexp_split_to_array(cuisine, '\\s*,\\s*')"
SEARCH_WHERE = f"""
    WHERE search_text LIKE :pattern ESCAPE '\\'
       OR {CUISINE_CODES} && CAST(:codes AS TEXT[])
"""
SEARCH_SQL = text(
    "SELECT id, name_ar, name_en, cuisine, district, price_tier, rating, maps_url FROM restaurants"
    + SEARCH_WHERE
    + "ORDER BY quality_score DESC NULLS LAST, rating DESC NULLS LAST, id LIMIT :limit OFFSET :offset"
)
SEARCH_COUNT_SQL = text("SELECT COUNT(*) FROM restaurants" + SEARCH_WHERE)


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
    }


@router.get("")
def list_restaurants(
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None, max_length=MAX_SEARCH_CHARS),
    db: Session = Depends(get_db),
) -> dict:
    """A bounded page of restaurants, best first. No match returns an empty list and total 0."""
    term = normalize(search or "")
    try:
        if term:
            params = {"pattern": like_pattern(term), "codes": codes_for(term)}
            rows = db.execute(SEARCH_SQL, {**params, "limit": limit, "offset": offset}).all()
            total = db.execute(SEARCH_COUNT_SQL, params).scalar_one()
        else:  # no term, or only spaces: the general list, unchanged
            rows = db.execute(LIST_SQL, {"limit": limit, "offset": offset}).all()
            total = db.execute(COUNT_SQL).scalar_one()
    except SQLAlchemyError:
        logger.exception("restaurants query failed")
        raise ApiError(503, "RESTAURANTS_UNAVAILABLE", "Restaurants are not available right now. Please try again.")
    return {"restaurants": [_row(r) for r in rows], "total": total, "limit": limit, "offset": offset}
