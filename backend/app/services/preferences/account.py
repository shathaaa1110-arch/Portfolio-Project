"""The signed-in account's saved preferences (BE-07, #63).

GET returns the saved answers, or the same shape with is_saved=false.
PUT saves all fields in one go: the first save creates the row, later saves
replace it. A field left out of the request is saved as empty.
"""
import logging
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ApiError
from app.services.auth.dependencies import current_user
from app.services.auth.models import User
from app.services.preferences.models import Preference
from app.services.plan.cuisines import is_known_key

MAX_SEATING_CHARS = 200
MAX_ALLERGIES = 20
MAX_ALLERGY_CHARS = 50

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users/me", tags=["preferences"])


class PreferencesIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    liked_cuisines: list[str] = []
    allergies: list[str] = []
    budget_min: int | None = Field(None, ge=0)
    budget_max: int | None = Field(None, ge=0)
    max_distance_km: float | None = Field(None, gt=0, allow_inf_nan=False)
    seating_needs: str | None = Field(None, max_length=MAX_SEATING_CHARS)

    @field_validator("liked_cuisines")
    @classmethod
    def known_categories(cls, keys: list[str]) -> list[str]:
        """Only the 18 category keys from cuisines.py; repeats are dropped, order is kept."""
        clean = list(dict.fromkeys(k.strip() for k in keys))
        if not all(is_known_key(k) for k in clean):
            raise ValueError("unknown cuisine category")
        return clean

    @field_validator("allergies")
    @classmethod
    def short_list(cls, items: list[str]) -> list[str]:
        clean = list(dict.fromkeys(i.strip() for i in items if i.strip()))
        if len(clean) > MAX_ALLERGIES or any(len(i) > MAX_ALLERGY_CHARS for i in clean):
            raise ValueError("too many or too long")
        return clean

    @field_validator("seating_needs")
    @classmethod
    def blank_is_none(cls, text: str | None) -> str | None:
        return (text or "").strip() or None

    @field_validator("budget_max")
    @classmethod
    def min_not_above_max(cls, high: int | None, info: ValidationInfo) -> int | None:
        low = info.data.get("budget_min")
        if high is not None and low is not None and low > high:
            raise ValueError("budget_min is above budget_max")
        return high


def _out(p: Preference | None) -> dict:
    if p is None:
        return {"is_saved": False, "liked_cuisines": [], "allergies": [], "budget_min": None,
                "budget_max": None, "max_distance_km": None, "seating_needs": None}
    return {
        "is_saved": True,
        "liked_cuisines": p.liked_cuisines or [],
        "allergies": p.allergies or [],
        "budget_min": p.budget_min,
        "budget_max": p.budget_max,
        "max_distance_km": float(p.max_distance_km) if p.max_distance_km is not None else None,
        "seating_needs": p.seating_needs,
    }


def _unavailable(exc: SQLAlchemyError) -> ApiError:
    logger.exception("preferences query failed", exc_info=exc)
    return ApiError(503, "PREFERENCES_UNAVAILABLE", "Preferences are not available right now. Please try again.")


@router.get("/preferences")
def get_preferences(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    try:
        pref = db.scalars(select(Preference).where(Preference.user_id == user.id)).first()
    except SQLAlchemyError as exc:
        raise _unavailable(exc)
    return _out(pref)


@router.put("/preferences")
def save_preferences(body: PreferencesIn, user: User = Depends(current_user),
                     db: Session = Depends(get_db)) -> dict:
    values = body.model_dump()
    if values["max_distance_km"] is not None:
        values["max_distance_km"] = Decimal(str(values["max_distance_km"]))
    # One statement: insert the first time, update afterwards. Safe if two saves race.
    stmt = insert(Preference).values(user_id=user.id, **values)
    stmt = stmt.on_conflict_do_update(index_elements=[Preference.user_id], set_=values)
    try:
        db.execute(stmt)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise _unavailable(exc)
    return {"message": "preferences saved"}
