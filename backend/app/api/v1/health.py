from fastapi import APIRouter

from app.core.config import get_settings
from app.core.database import database_is_up

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    """Is the API running, and can it reach the database?"""
    db_ok = database_is_up()
    return {
        "status": "ok" if db_ok else "degraded",
        "database": "ok" if db_ok else "unreachable",
        "environment": get_settings().environment,
    }
