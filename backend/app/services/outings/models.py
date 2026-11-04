"""Outing and participant mapping (BE-08). The tables are managed by Alembic (0005).

BE-09 (join), BE-10 (guests) and BE-11 (stages) build on these two classes.
Times are timezone-aware (timestamptz); store and compare them as aware datetimes.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.services.auth.models import User  # Register the referenced account table.

# Outing stages, in order (TechnicalDoc section 2, "Outing status").
INVITE, PREFERENCES, VOTING, TIEBREAK, RESULT = "invite", "preferences", "voting", "tiebreak", "result"
# Participant attendance.
PENDING, CONFIRMED, DECLINED = "pending", "confirmed", "declined"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class Outing(Base):
    __tablename__ = "outings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # References groups.id; groups are mapped by BE-23, so the key is enforced by the database only.
    group_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    organizer_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey(User.id), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default=INVITE)
    invite_code: Mapped[str] = mapped_column(Text, nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    district: Mapped[str] = mapped_column(Text, nullable=False)  # a districts.id
    tiebreak_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)


class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    outing_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey(Outing.id), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey(User.id))  # empty for a guest
    guest_name: Mapped[str | None] = mapped_column(Text)  # set only for a guest
    attendance: Mapped[str] = mapped_column(Text, nullable=False, default=PENDING)
    preferences_done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
