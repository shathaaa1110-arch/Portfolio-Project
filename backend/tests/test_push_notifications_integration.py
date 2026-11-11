"""BE-25 (#80): voting-start and result notifications, on PostgreSQL.

Builds on the BE-19 voting fixture (BE-17 scratch restaurants, plan_items and votes). The provider is
replaced by a fake that records what it was asked to send; nothing leaves the machine.
"""
import httpx
import pytest
import sqlalchemy as sa
from app.services.notifications import push
from sqlalchemy.orm import Session
from tests.test_plan_generation_integration import BASE, _ready_session, api, fresh_limits, secret  # noqa: F401
from tests.test_voting_integration import VOTES, _answer_all, _vote

pytestmark = pytest.mark.integration


class FakeSender:
    """Answers each call from a script: 'ok', 'down' (whole request fails) or a ticket error name."""

    def __init__(self, *script):
        self.script = list(script) or ["ok"]
        self.calls = []

    def send(self, messages):
        self.calls.append(messages)
        step = self.script.pop(0) if len(self.script) > 1 else self.script[0]
        if step == "down":
            raise push.PushSendError("Expo refused the request (HTTP 503)")
        if step == "ok":
            return [{"status": "ok", "id": "t"} for _ in messages]
        return [{"status": "error", "message": step, "details": {"error": step}} for _ in messages]


@pytest.fixture
def outing(api, monkeypatch):  # noqa: F811
    """Organizer and member have device tokens; the guest uses the web app and has none."""
    client, conn = api
    conn.execute(sa.text(VOTES))
    oid, _, organizer, member, guest = _ready_session(client, conn)
    conn.execute(sa.text("UPDATE users SET push_token = 'ExponentPushToken[' || name || ']' "
                         "WHERE id IN (SELECT user_id FROM participants WHERE outing_id = :o)"), {"o": oid})
    sender = FakeSender()
    monkeypatch.setattr(push, "get_sender", lambda: sender)
    monkeypatch.setattr(push, "session_factory", lambda: Session(bind=conn, join_transaction_mode="create_savepoint"))
    monkeypatch.setattr(push, "sleep", lambda s: None)
    return client, conn, oid, organizer, member, guest, sender


def _events(conn, oid, kind=None):
    return conn.execute(sa.text(
        "SELECT e.kind, u.name, e.status, e.attempts, e.last_error FROM notification_events e "
        "JOIN users u ON u.id = e.user_id WHERE e.outing_id = :o AND (CAST(:k AS text) IS NULL OR e.kind = :k) "
        "ORDER BY e.kind, u.name"), {"o": oid, "k": kind}).all()


def _start(client, oid, organizer):
    r = client.post(f"{BASE}/{oid}/start-voting", headers=organizer)
    assert r.status_code == 200
    return [i["plan_item_id"] for i in r.json()["plan_items"]]


# ---------- voting started ----------

def test_voting_start_tells_everyone_with_the_app_except_the_organizer(outing):
    client, conn, oid, organizer, member, guest, sender = outing
    _start(client, oid, organizer)
    assert [(k, n, s, a) for k, n, s, a, _ in _events(conn, oid)] == [("voting_started", "فهد", "sent", 1)]
    [message] = sender.calls[0]
    assert message["to"] == "ExponentPushToken[فهد]" and message["title"] == "بدأ التصويت"
    assert message["data"] == {"outing_id": str(oid), "kind": "voting_started"}


def test_asking_again_records_and_sends_nothing_new(outing):
    client, conn, oid, organizer, *_, sender = outing
    _start(client, oid, organizer)
    _start(client, oid, organizer)  # returns the stored plan
    assert len(_events(conn, oid)) == 1 and len(sender.calls) == 1


def test_recording_the_same_event_twice_keeps_one_row_per_person(outing):
    client, conn, oid, organizer, *_ = outing
    _start(client, oid, organizer)
    db = Session(bind=conn, join_transaction_mode="create_savepoint")
    assert push.record(db, oid, push.VOTING_STARTED) != []           # the organizer was skipped before
    assert push.record(db, oid, push.VOTING_STARTED) == []           # the unique key stops a repeat
    assert len(_events(conn, oid, "voting_started")) == 2


# ---------- the result ----------

def test_the_result_reaches_everyone_once_with_the_winner(outing):
    client, conn, oid, organizer, member, guest, sender = outing
    items = _start(client, oid, organizer)
    _answer_all(client, oid, organizer, items, {items[1]})
    _answer_all(client, oid, member, items, {items[1]})
    last = _answer_all(client, oid, guest, items).json()
    assert last["voting_complete"] is True
    results = _events(conn, oid, "result")
    assert [(n, s) for _, n, s, _, _ in results] == [("عاصم حامد", "sent"), ("فهد", "sent")]
    winner = client.get(f"{BASE}/{oid}/result", headers=guest).json()["winner"]["name_ar"]
    assert all(winner in m["body"] for m in sender.calls[-1])
    # Ending again (the organizer's button) neither records nor sends a second time.
    client.post(f"{BASE}/{oid}/end-voting", headers=organizer)
    assert len(_events(conn, oid, "result")) == 2 and len(sender.calls) == 2


def test_ending_early_without_likes_says_there_is_no_winner(outing):
    client, conn, oid, organizer, *_, sender = outing
    _start(client, oid, organizer)
    assert client.post(f"{BASE}/{oid}/end-voting", headers=organizer).status_code == 200
    assert all("ما فيه فائز" in m["body"] for m in sender.calls[-1])


# ---------- failures never cost a vote or a result ----------

def test_a_provider_that_stays_down_changes_nothing_in_voting(outing):
    client, conn, oid, organizer, member, guest, sender = outing
    sender.script = ["down"]
    items = _start(client, oid, organizer)
    assert client.get(f"{BASE}/{oid}", headers=organizer).json()["status"] == "voting"
    for headers in (organizer, member, guest):
        _answer_all(client, oid, headers, items, {items[0]})
    assert client.get(f"{BASE}/{oid}/result", headers=guest).json()["winner"]["likes"] == 3
    rows = _events(conn, oid)
    assert rows and all(s == "failed" and a == 3 and "HTTP 503" in e for _, _, s, a, e in rows)


def test_a_short_outage_is_retried_and_then_delivered(outing):
    client, conn, oid, organizer, *_, sender = outing
    sender.script = ["down", "ok"]
    _start(client, oid, organizer)
    assert [(s, a) for _, _, s, a, _ in _events(conn, oid)] == [("sent", 2)]
    assert len(sender.calls) == 2


def test_a_device_that_is_gone_forgets_its_token(outing):
    client, conn, oid, organizer, *_, sender = outing
    sender.script = ["DeviceNotRegistered"]
    _start(client, oid, organizer)
    [(_, _, status, attempts, error)] = _events(conn, oid)
    assert (status, attempts, error) == ("failed", 1, "DeviceNotRegistered")
    assert conn.execute(sa.text("SELECT push_token FROM users WHERE name = 'فهد'")).scalar_one() is None


def test_if_recording_fails_voting_still_starts(outing, monkeypatch):
    client, conn, oid, organizer, *_, sender = outing
    monkeypatch.setattr(push, "RECORD_SQL", sa.text("SELECT id FROM no_such_table"))
    _start(client, oid, organizer)
    assert client.get(f"{BASE}/{oid}", headers=organizer).json()["status"] == "voting"
    assert sender.calls == []


def test_only_people_with_a_device_token_get_an_event(outing):
    client, conn, oid, organizer, *_ = outing
    _start(client, oid, organizer)
    conn.execute(sa.text("UPDATE users SET push_token = NULL WHERE name = 'عاصم حامد'"))
    client.post(f"{BASE}/{oid}/end-voting", headers=organizer)
    assert [n for _, n, *_ in _events(conn, oid, "result")] == ["فهد"]


# ---------- the Expo adapter ----------

def test_the_expo_adapter_posts_the_messages_and_reads_the_tickets(monkeypatch):
    seen = {}

    def fake_post(url, json, timeout, headers):
        seen.update(url=url, json=json)
        return httpx.Response(200, json={"data": [{"status": "ok", "id": "x"}]})

    monkeypatch.setattr(httpx, "post", fake_post)
    tickets = push.ExpoSender().send([{"to": "ExponentPushToken[a]", "title": "t", "body": "b"}])
    assert seen["url"] == push.EXPO_PUSH_URL and seen["json"][0]["to"] == "ExponentPushToken[a]"
    assert tickets == [{"status": "ok", "id": "x"}]


@pytest.mark.parametrize("reply", [
    httpx.Response(503, json={}), httpx.Response(200, text="not json"), httpx.Response(200, json={"data": []}),
])
def test_the_expo_adapter_turns_bad_replies_into_one_error(monkeypatch, reply):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: reply)
    with pytest.raises(push.PushSendError):
        push.ExpoSender().send([{"to": "ExponentPushToken[a]", "title": "t", "body": "b"}])
