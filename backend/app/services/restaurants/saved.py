"""Saved restaurants for the signed-in account (BE-33, #126). Contract agreed in P-02 (#8).

GET    /users/me/saved-restaurants?limit=20&offset=0   newest first, same card as GET /restaurants
GET    /users/me/saved-restaurants/ids                 every saved id, to fill the hearts
PUT    /users/me/saved-restaurants/{restaurant_id}     204; saving again keeps one row
DELETE /users/me/saved-restaurants/{restaurant_id}     204; removing a place that is not saved is fine

The account always comes from the login token, never from the request, so nobody can read or
change another account's saves. A guest pass is refused. Storage: DB-15 (#130), 0006 and 0007.
"""
import logging

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ApiError
from app.services.auth.dependencies import current_user
from app.services.auth.models import User
from app.services.restaurants.router import _row

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users/me/saved-restaurants", tags=["saved restaurants"])

MAX_ID = 2_147_483_647  # restaurants.id is INTEGER; larger ids cannot exist
LIST_SQL = text("""
    SELECT r.id, r.name_ar, r.name_en, r.cuisine, r.district, r.price_tier, r.rating, r.maps_url
    FROM saved_restaurants s JOIN restaurants r ON r.id = s.restaurant_id
    WHERE s.user_id = :user
    ORDER BY s.saved_at DESC, r.id
    LIMIT :limit OFFSET :offset
""")
COUNT_SQL = text("SELECT count(*) FROM saved_restaurants WHERE user_id = :user")
IDS_SQL = text("SELECT restaurant_id FROM saved_restaurants WHERE user_id = :user ORDER BY saved_at DESC, restaurant_id")
EXISTS_SQL = text("SELECT 1 FROM restaurants WHERE id = :id")
# Saving again keeps the first row and its time, so the order does not jump around.
SAVE_SQL = text("""
    INSERT INTO saved_restaurants (user_id, restaurant_id) VALUES (:user, :id)
    ON CONFLICT (user_id, restaurant_id) DO NOTHING
""")
REMOVE_SQL = text("DELETE FROM saved_restaurants WHERE user_id = :user AND restaurant_id = :id")

RestaurantId = Path(ge=1, le=MAX_ID)


def _unavailable() -> ApiError:
    return ApiError(503, "SAVED_UNAVAILABLE", "Saved restaurants are not available right now. Please try again.")


@router.get("")
def list_saved(limit: int = Query(20, ge=1, le=50), offset: int = Query(0, ge=0),
               user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    try:
        rows = db.execute(LIST_SQL, {"user": user.id, "limit": limit, "offset": offset}).all()
        total = db.execute(COUNT_SQL, {"user": user.id}).scalar_one()
    except SQLAlchemyError:
        logger.exception("list saved restaurants failed")
        raise _unavailable()
    return {"restaurants": [_row(r) for r in rows], "total": total, "limit": limit, "offset": offset}


@router.get("/ids")
def saved_ids(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    try:
        ids = db.execute(IDS_SQL, {"user": user.id}).scalars().all()
    except SQLAlchemyError:
        logger.exception("read saved ids failed")
        raise _unavailable()
    return {"ids": list(ids)}


@router.put("/{restaurant_id}", status_code=204)
def save(restaurant_id: int = RestaurantId, user: User = Depends(current_user),
         db: Session = Depends(get_db)) -> Response:
    try:
        if db.execute(EXISTS_SQL, {"id": restaurant_id}).first() is None:
            raise ApiError(404, "RESTAURANT_NOT_FOUND", "This restaurant does not exist.")
        db.execute(SAVE_SQL, {"user": user.id, "id": restaurant_id})
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("save restaurant failed")
        raise _unavailable()
    return Response(status_code=204)


@router.delete("/{restaurant_id}", status_code=204)
def remove(restaurant_id: int = RestaurantId, user: User = Depends(current_user),
           db: Session = Depends(get_db)) -> Response:
    try:
        db.execute(REMOVE_SQL, {"user": user.id, "id": restaurant_id})
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("remove saved restaurant failed")
        raise _unavailable()
    return Response(status_code=204)
