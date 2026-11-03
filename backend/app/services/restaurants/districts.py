"""Riyadh districts for the location picker (#49).

Public: the list is the same for everyone and holds no personal data.
A user who refuses location picks a district; its id is sent to
GET /users/me/recommendations?district_id=..., which uses the district centre.
"""
import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ApiError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/districts", tags=["restaurants"])

LIST_SQL = text("SELECT id, name_ar, name_en FROM districts ORDER BY name_ar, id")


@router.get("")
def list_districts(db: Session = Depends(get_db)) -> dict:
    """All districts, by Arabic name. Coordinates stay on the server."""
    try:
        rows = db.execute(LIST_SQL).all()
    except SQLAlchemyError:
        logger.exception("districts query failed")
        raise ApiError(503, "DISTRICTS_UNAVAILABLE", "Districts are not available right now. Please try again.")
    return {"districts": [_district(r) for r in rows]}


def _district(r) -> dict:
    item = {"id": r.id, "name_ar": r.name_ar}
    if r.name_en:  # the app accepts a missing name_en, not null
        item["name_en"] = r.name_en
    return item
