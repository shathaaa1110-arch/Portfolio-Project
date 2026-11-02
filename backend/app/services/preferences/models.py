"""Account preference mapping for BE-07 (#63); schema is managed by Alembic.

Always filter by the authenticated User.id. Legacy participant rows share the
physical table but are not account preferences. Never use create_all to migrate.
"""
import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric, Text, Uuid
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.services.auth.models import User  # Register the referenced account table.


class Preference(Base):
    __tablename__ = "preferences"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey(User.id), nullable=False, unique=True)
    liked_cuisines: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    allergies: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    budget_min: Mapped[int | None] = mapped_column(Integer)
    budget_max: Mapped[int | None] = mapped_column(Integer)
    max_distance_km: Mapped[Decimal | None] = mapped_column(Numeric)
    seating_needs: Mapped[str | None] = mapped_column(Text)
