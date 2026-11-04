"""The outing stages and the moves between them, in one place (BE-11).

Every endpoint that changes an outing's status goes through move(), so a stage can only be
reached from the stage before it and never backwards (TechnicalDoc section 2, "Outing status").
"""
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.services.outings.models import (CONFIRMED, INVITE, PREFERENCES, RESULT, TIEBREAK, VOTING, Outing,
                                         Participant)

ALLOWED_MOVES = {
    INVITE: {PREFERENCES},
    PREFERENCES: {VOTING},
    VOTING: {TIEBREAK, RESULT},
    TIEBREAK: {RESULT},
    RESULT: set(),
}

# What the organizer can do in each stage, as the action names the app shows buttons for.
# Only actions whose endpoints exist are listed; BE-17 and BE-19 add start_voting and end_voting.
ORGANIZER_ACTIONS = {
    INVITE: ["start_preferences"],
}


def move(outing: Outing, to: str) -> bool:
    """Move the outing to `to`. Returns False if it is already there (a repeated request).

    Call with the outing's row locked (SELECT ... FOR UPDATE), like a join, so two requests
    cannot both read the old stage and move it.
    """
    if outing.status == to:
        return False
    if to not in ALLOWED_MOVES[outing.status]:
        raise ApiError(409, "INVALID_STATUS_TRANSITION",
                       f"The outing cannot move from the {outing.status} stage to the {to} stage.")
    outing.status = to
    return True


def organizer_actions(status: str) -> list[str]:
    return list(ORGANIZER_ACTIONS.get(status, []))


def readiness(db: Session, outing_id: uuid.UUID) -> tuple[int, int]:
    """(ready, total) among confirmed participants. The plan waits until ready == total (BE-13);
    people who declined do not hold it back."""
    ready, total = db.execute(
        select(func.count().filter(Participant.preferences_done), func.count())
        .where(Participant.outing_id == outing_id, Participant.attendance == CONFIRMED)
    ).one()
    return ready, total
