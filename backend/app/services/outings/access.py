"""Who is calling, and are they part of this outing? (BE-11, with BE-06 #62)

Outing endpoints accept a login token or a guest token. A guest token works for its own outing
only, and stops working once the guest's participant row is gone (removed by the organizer).

    caller: Caller = Depends(current_caller)
    outing, me = participant_of(db, outing_id, caller, lock=True)
"""
import uuid
from dataclasses import dataclass

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.services.auth.dependencies import bearer
from app.services.auth.models import User
from app.services.auth.tokens import GUEST, TokenError, decode_any_token
from app.services.outings.models import GONE, REMOVED, Outing, Participant


@dataclass(frozen=True)
class Caller:
    user_id: uuid.UUID | None = None  # a registered user
    token_version: int = 0  # the login token's "ver"; must still match the account (logout)
    guest_participant_id: uuid.UUID | None = None  # or a guest, for one outing only
    guest_outing_id: uuid.UUID | None = None


def current_caller(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> Caller:
    """Read the token only; the database checks happen in participant_of()."""
    if creds is None or creds.scheme.lower() != "bearer" or not creds.credentials:
        raise ApiError(401, "INVALID_TOKEN", "Please log in again.")
    try:
        kind, subject, outing_id, version = decode_any_token(creds.credentials)
    except TokenError as exc:
        if exc.expired:
            raise ApiError(401, "TOKEN_EXPIRED", "Your session has expired. Please log in again.")
        raise ApiError(401, "INVALID_TOKEN", "Please log in again.")
    if kind == GUEST:
        return Caller(guest_participant_id=subject, guest_outing_id=outing_id)
    return Caller(user_id=subject, token_version=version)


def _not_a_participant() -> ApiError:
    return ApiError(403, "NOT_A_PARTICIPANT", "You are not part of this outing.")


def _gone(me: Participant) -> ApiError:
    if me.attendance == REMOVED:
        return ApiError(403, "REMOVED_FROM_OUTING", "The organizer removed you from this outing.")
    return ApiError(403, "LEFT_OUTING", "You left this outing. Join again from the invite link if it is still open.")


def participant_of(db: Session, outing_id: uuid.UUID, caller: Caller,
                   lock: bool = False) -> tuple[Outing, Participant]:
    """The outing and the caller's own participant row in it, or 404 / 403.

    Someone who left or was removed (BE-29) keeps the row but loses access to the outing.
    lock=True locks the outing's row until the commit, for anything that changes the outing.
    """
    if caller.user_id is not None:
        current = db.execute(select(User.token_version).where(User.id == caller.user_id)).scalar_one_or_none()
        if current is None or current != caller.token_version:  # account deleted, or logged out since
            raise ApiError(401, "INVALID_TOKEN", "Please log in again.")

    query = select(Outing).where(Outing.id == outing_id)
    if lock:
        query = query.with_for_update()
    outing = db.execute(query).scalar_one_or_none()
    if outing is None:
        raise ApiError(404, "OUTING_NOT_FOUND", "This outing does not exist.")

    if caller.guest_participant_id is not None:
        if caller.guest_outing_id != outing.id:
            raise _not_a_participant()
        me = db.get(Participant, caller.guest_participant_id)
        if me is None or me.outing_id != outing.id or me.user_id is not None:
            raise _not_a_participant()
        if me.attendance in GONE:
            raise _gone(me)
        return outing, me

    me = db.execute(
        select(Participant).where(Participant.outing_id == outing.id, Participant.user_id == caller.user_id)
    ).scalar_one_or_none()
    if me is None:
        raise _not_a_participant()
    if me.attendance in GONE:
        raise _gone(me)
    return outing, me


def is_organizer(outing: Outing, me: Participant) -> bool:
    return me.user_id is not None and me.user_id == outing.organizer_id
