"""The signed-in account's own profile (BE-34, #127)."""


from fastapi import APIRouter, Depends
from app.services.auth.dependencies import current_user
from app.services.auth.models import User


router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
def read_me(user: User = Depends(current_user)) -> dict:
    """Returns the profile data of the user who owns the token."""
    return { "id": str(user.id), "name": user.name, "phone": user.phone_number}
        