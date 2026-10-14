"""Everything under /api/v1. Each service adds its own router here as it is built."""
from fastapi import APIRouter

from app.api.v1 import health
from app.services.auth.router import router as auth_router
from app.services.outings.router import router as outings_router
from app.services.plan.router import router as plan_router
from app.services.preferences.router import router as preferences_router
from app.services.voting.router import router as voting_router

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth_router)
api_router.include_router(outings_router)
api_router.include_router(preferences_router)
api_router.include_router(plan_router)
api_router.include_router(voting_router)
