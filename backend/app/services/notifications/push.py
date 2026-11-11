"""App notifications for voting start and the final result (BE-25, #80).

Two steps, so a push failure can never lose a vote or a result:
  1. record(): inside the transaction that starts voting or settles the result, write one
     notification_events row per account that should hear about it. The unique key
     (outing, round, kind, account) makes a repeated request add nothing.
  2. deliver(): after that commit, as a background task, send the pending rows through one provider
     (Expo push), with a bounded number of attempts. Every failure is stored on the row and logged;
     nothing is raised back to the request.

Who: confirmed participants with an account and a saved device token (POST /auth/push-token,
one device per account). Guests use the web app and see the change on the page. The organizer
does not get "voting started", since they started it.

PUSH_MODE: "mock" (default) logs instead of sending; "expo" sends through the Expo push service.
"""
import logging
import time
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import bindparam, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import SessionLocal

VOTING_STARTED, RESULT = "voting_started", "result"
ROUND_KEY = "1"  # one round per outing until DB-07 (#14) and BE-31 (#90)
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
TIMEOUT_SECONDS = 10
WAIT_BEFORE_ATTEMPT = (0, 2, 5)  # seconds; three attempts at most
RETRY_TICKET_ERRORS = {"MessageRateExceeded"}

logger = logging.getLogger(__name__)

# Replaced in tests.
session_factory = SessionLocal
sleep = time.sleep

RECORD_SQL = text("""
    INSERT INTO notification_events (id, outing_id, round_key, kind, user_id, push_token)
    SELECT gen_random_uuid(), pa.outing_id, :round_key, :kind, u.id, u.push_token
    FROM participants pa JOIN users u ON u.id = pa.user_id
    WHERE pa.outing_id = :outing AND pa.attendance = 'confirmed'
      AND u.push_token IS NOT NULL AND trim(u.push_token) <> ''
      AND (CAST(:skip_user AS uuid) IS NULL OR u.id <> CAST(:skip_user AS uuid))
    ON CONFLICT ON CONSTRAINT notification_events_once DO NOTHING
    RETURNING id
""")
PENDING_SQL = text("""
    SELECT e.id, e.kind, e.user_id, e.push_token, e.outing_id, o.name AS outing_name,
           (SELECT r.name_ar FROM plan_items pi JOIN restaurants r ON r.id = pi.restaurant_id
            WHERE pi.outing_id = e.outing_id AND pi.is_winner LIMIT 1) AS winner
    FROM notification_events e JOIN outings o ON o.id = e.outing_id
    WHERE e.id IN :ids AND e.status = 'pending'
    ORDER BY e.created_at, e.id
""").bindparams(bindparam("ids", expanding=True))
MARK_SQL = text("""
    UPDATE notification_events
    SET status = :status, attempts = attempts + 1, last_error = :error,
        sent_at = CASE WHEN :status = 'sent' THEN :now ELSE sent_at END
    WHERE id = :id
""")
# Only the token that failed: a newer device saved since then stays.
FORGET_TOKEN_SQL = text("UPDATE users SET push_token = NULL WHERE id = :user AND push_token = :token")


class PushSendError(Exception):
    """The provider could not be reached or refused the whole request."""


class LogSender:
    """PUSH_MODE=mock: nothing leaves the server."""

    def send(self, messages: list[dict]) -> list[dict]:
        for m in messages:
            logger.warning("MOCK PUSH to %s: %s | %s", m["to"][:24], m["title"], m["body"])
        return [{"status": "ok"} for _ in messages]


class ExpoSender:
    """The one provider adapter: Expo's push service delivers to Android and iOS."""

    def send(self, messages: list[dict]) -> list[dict]:
        try:
            response = httpx.post(EXPO_PUSH_URL, json=messages, timeout=TIMEOUT_SECONDS,
                                  headers={"Accept": "application/json", "Content-Type": "application/json"})
        except httpx.HTTPError as exc:
            raise PushSendError(f"Could not reach Expo: {type(exc).__name__}") from exc
        if response.status_code != 200:
            raise PushSendError(f"Expo refused the request (HTTP {response.status_code})")
        try:
            tickets = response.json()["data"]
        except (ValueError, KeyError, TypeError) as exc:
            raise PushSendError("Expo sent an unreadable reply") from exc
        if not isinstance(tickets, list) or len(tickets) != len(messages):
            raise PushSendError("Expo sent a reply that does not match the messages")
        return tickets


def get_sender():
    mode = get_settings().push_mode
    if mode == "expo":
        return ExpoSender()
    if mode != "mock":
        logger.error("Unknown PUSH_MODE %r; notifications are logged, not sent", mode)
    return LogSender()


def record(db: Session, outing_id: uuid.UUID, kind: str, skip_user: uuid.UUID | None = None) -> list[uuid.UUID]:
    """Queue this event for everyone eligible, inside the caller's transaction.

    A savepoint keeps the caller's work safe: if recording fails, voting or the result still saves.
    """
    try:
        with db.begin_nested():
            rows = db.execute(RECORD_SQL, {"outing": outing_id, "kind": kind, "round_key": ROUND_KEY,
                                           "skip_user": skip_user}).scalars().all()
        return list(rows)
    except SQLAlchemyError:
        logger.exception("could not record %s notifications for outing %s", kind, outing_id)
        return []


def _message(row) -> dict:
    name = row.outing_name
    if row.kind == VOTING_STARTED:
        title, body = "بدأ التصويت", f"الاقتراحات جاهزة لطلعة «{name}». صوّت الحين."
    elif row.winner:
        title, body = "طلعت النتيجة", f"طلعة «{name}»: الفائز {row.winner}."
    else:
        title, body = "طلعت النتيجة", f"طلعة «{name}»: ما فيه فائز هالمرة."
    return {"to": row.push_token, "title": title, "body": body, "sound": "default",
            "data": {"outing_id": str(row.outing_id), "kind": row.kind}}


def _error(ticket: dict) -> str:
    details = ticket.get("details") or {}
    return str(details.get("error") or ticket.get("message") or "unknown error")[:500]


def deliver(event_ids: list[uuid.UUID]) -> None:
    """Send the pending rows. Runs after the response; never raises."""
    if not event_ids:
        return
    db = session_factory()
    try:
        rows = db.execute(PENDING_SQL, {"ids": list(event_ids)}).all()
        pending = [(row, _message(row)) for row in rows]
        sender = get_sender()
        for attempt, wait in enumerate(WAIT_BEFORE_ATTEMPT):
            if not pending:
                break
            last = attempt == len(WAIT_BEFORE_ATTEMPT) - 1
            if wait:
                sleep(wait)
            now = datetime.now(timezone.utc)
            try:
                tickets = sender.send([m for _, m in pending])
            except PushSendError as exc:
                logger.warning("push attempt %d failed: %s", attempt + 1, exc)
                for row, _ in pending:
                    db.execute(MARK_SQL, {"id": row.id, "status": "failed" if last else "pending",
                                          "error": str(exc)[:500], "now": now})
                db.commit()
                continue
            retry = []
            for (row, message), ticket in zip(pending, tickets):
                if ticket.get("status") == "ok":
                    db.execute(MARK_SQL, {"id": row.id, "status": "sent", "error": None, "now": now})
                    continue
                error = _error(ticket)
                again = error in RETRY_TICKET_ERRORS and not last
                db.execute(MARK_SQL, {"id": row.id, "status": "pending" if again else "failed",
                                      "error": error, "now": now})
                if error == "DeviceNotRegistered":  # the app was removed or the token expired
                    db.execute(FORGET_TOKEN_SQL, {"user": row.user_id, "token": row.push_token})
                if again:
                    retry.append((row, message))
                else:
                    logger.warning("push to user %s failed: %s", row.user_id, error)
            db.commit()
            pending = retry
    except Exception:  # a background task must never take the server down
        db.rollback()
        logger.exception("push delivery failed")
    finally:
        db.close()
