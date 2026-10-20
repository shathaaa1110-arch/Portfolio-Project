"""General restaurant list for Home (BE-32, #101).

Public: no login, outing or group is needed, and nothing personal is returned.
Search, filters, details and personal ranking come in later tasks.
"""
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ApiError

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
    db: Session = Depends(get_db),
) -> dict:
    """A bounded page of general restaurants. An empty dataset returns an empty list."""
    try:
        rows = db.execute(LIST_SQL, {"limit": limit, "offset": offset}).all()
        total = db.execute(COUNT_SQL).scalar_one()
    except SQLAlchemyError:
        logger.exception("restaurants query failed")
        raise ApiError(503, "RESTAURANTS_UNAVAILABLE", "Restaurants are not available right now. Please try again.")
    return {"restaurants": [_row(r) for r in rows], "total": total, "limit": limit, "offset": offset}
