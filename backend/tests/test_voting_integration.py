"""BE-19 (#73), BE-20 (#31), BE-21 (#29): votes, ending voting and the result.

Builds on the BE-17 scratch schema (restaurants, plan_items) and adds votes next to them, in the
shape migration 0012 gives them. Everything runs in a rolled-back transaction.
"""
import uuid

import pytest
import sqlalchemy as sa
from tests.test_outings_join_integration import _bearer, _add_user  # noqa: F401
from tests.test_plan_generation_integration import BASE, _ready_session, api, fresh_limits, secret  # noqa: F401

from tests.migration_ddl import VOTES  # a scratch copy next to the scratch plan_items, as migrated (0012)
from tests.round_helpers import R, W  # noqa: F401

pytestmark = pytest.mark.integration


@pytest.fixture
def voting(api):  # noqa: F811
    client, conn = api
    conn.execute(sa.text(VOTES))
    oid, code, organizer, member, guest = _ready_session(client, conn)
    plan = client.post(f"{BASE}/{oid}/start-voting", headers=organizer, json=R(client, oid, organizer)).json()
    items = [i["plan_item_id"] for i in plan["plan_items"]]
    return client, conn, oid, organizer, member, guest, items


def _vote(client, oid, headers, item, liked):
    return client.post(f"{BASE}/{oid}/votes", headers=headers,
                       json=W(client, oid, headers, {"plan_item_id": item, "liked": liked}))


def _answer_all(client, oid, headers, items, liked_items=()):
    for item in items:
        r = _vote(client, oid, headers, item, item in liked_items)
    return r


def _rows(conn, oid):
    return conn.execute(sa.text(
        "SELECT v.participant_id, v.plan_item_id, v.liked FROM votes v JOIN plan_items pi ON pi.id = v.plan_item_id "
        "WHERE pi.outing_id = :o"), {"o": oid}).all()


# ---------- casting and changing a vote (BE-19) ----------

def test_a_vote_is_saved_and_returned_for_a_reload(voting):
    client, conn, oid, organizer, member, guest, items = voting
    r = _vote(client, oid, guest, items[0], True)
    assert r.status_code == 200
    body = r.json()
    assert body["plan_item_id"] == items[0] and body["liked"] is True and body["voting_complete"] is False
    assert body["items_count"] == len(items) and body["members_count"] == 3 and body["completed_count"] == 0
    mine = client.get(f"{BASE}/{oid}/votes", headers=guest, params=R(client, oid, guest)).json()
    assert mine["votes"] == [{"plan_item_id": items[0], "liked": True}] and mine["answered_count"] == 1
    assert client.get(f"{BASE}/{oid}/votes", headers=member, params=R(client, oid, member)).json()["votes"] == []  # answers are private


def test_changing_like_to_pass_updates_the_one_answer(voting):
    client, conn, oid, organizer, member, guest, items = voting
    _vote(client, oid, member, items[0], True)
    _vote(client, oid, member, items[0], False)
    rows = _rows(conn, oid)
    assert len(rows) == 1 and rows[0].liked is False
    _answer_all(client, oid, organizer, items)  # nobody else likes anything
    r = client.post(f"{BASE}/{oid}/end-voting", headers=organizer, json=R(client, oid, organizer)).json()
    assert all(i["likes"] == 0 for i in r["items"]) and r["winner"] is None  # the Like was replaced, not added to


def test_a_suggestion_from_another_outing_is_refused(voting):
    client, conn, oid, organizer, member, guest, items = voting
    r = _vote(client, oid, guest, str(uuid.uuid4()), True)
    assert r.status_code == 404 and r.json()["error"]["code"] == "PLAN_ITEM_NOT_FOUND"
    # Another outing with its own plan: its items cannot be voted on through this outing,
    # and this outing's members cannot reach the other outing at all.
    other, _, other_org, _, other_guest = _ready_session(client, conn)
    other_items = [i["plan_item_id"] for i in client.post(f"{BASE}/{other}/start-voting", headers=other_org, json=R(client, other, other_org)).json()["plan_items"]]
    r = _vote(client, oid, guest, other_items[0], True)
    assert r.status_code == 404 and r.json()["error"]["code"] == "PLAN_ITEM_NOT_FOUND"
    assert _vote(client, other, guest, other_items[0], True).status_code == 403
    assert _vote(client, other, member, other_items[0], True).status_code == 403
    assert _rows(conn, other) == []


def test_a_stranger_cannot_vote(voting):
    client, conn, oid, *_, items = voting
    stranger = _bearer(_add_user(conn, "غريب"))
    assert _vote(client, oid, stranger, items[0], True).status_code == 403
    assert client.get(f"{BASE}/{oid}/votes", headers=stranger, params=R(client, oid, stranger)).status_code == 403


def test_votes_are_refused_outside_voting(api):  # noqa: F811
    client, conn = api
    conn.execute(sa.text(VOTES))
    oid, _, organizer, _, guest = _ready_session(client, conn)
    r = _vote(client, oid, guest, str(uuid.uuid4()), True)  # still in preferences
    assert r.status_code == 409 and r.json()["error"]["code"] == "VOTING_NOT_OPEN"


def test_bad_bodies_are_rejected(voting):
    client, conn, oid, organizer, member, guest, items = voting
    for body in ({"plan_item_id": items[0]}, {"plan_item_id": "x", "liked": True},
                 {"plan_item_id": items[0], "liked": True, "extra": 1}):
        assert client.post(f"{BASE}/{oid}/votes", headers=guest, json=body).status_code == 422


# ---------- ending voting (BE-20) ----------

def test_the_last_answer_ends_voting_by_itself(voting):
    client, conn, oid, organizer, member, guest, items = voting
    _answer_all(client, oid, organizer, items, {items[1]})
    _answer_all(client, oid, member, items, {items[1], items[2]})
    last = _answer_all(client, oid, guest, items, {items[2]}).json()
    assert last["voting_complete"] is True and last["status"] == "result" and last["completed_count"] == 3
    # Voting is closed: no more writes.
    r = _vote(client, oid, guest, items[0], True)
    assert r.status_code == 409 and r.json()["error"]["code"] == "VOTING_NOT_OPEN"


def test_only_the_organizer_ends_voting_early_and_saved_votes_count(voting):
    client, conn, oid, organizer, member, guest, items = voting
    _vote(client, oid, member, items[2], True)
    _vote(client, oid, guest, items[2], True)
    for headers in (member, guest):
        r = client.post(f"{BASE}/{oid}/end-voting", headers=headers, json=R(client, oid, headers))
        assert r.status_code == 403 and r.json()["error"]["code"] == "ORGANIZER_ONLY"
    assert client.get(f"{BASE}/{oid}", headers=organizer).json()["actions"] == ["end_voting"]
    r = client.post(f"{BASE}/{oid}/end-voting", headers=organizer, json=R(client, oid, organizer))
    assert r.status_code == 200
    result = r.json()
    assert result["status"] == "result"
    assert result["winner"]["plan_item_id"] == items[2] and result["winner"]["likes"] == 2
    assert result["winner"]["support_percentage"] == 67  # 2 likes / 3 members (D08), not / 2 voters
    assert result["members_count"] == 3 and result["completed_count"] == 0
    # Asking again gives the same result; the stage does not move back.
    assert client.post(f"{BASE}/{oid}/end-voting", headers=organizer, json=R(client, oid, organizer)).json() == result
    assert client.get(f"{BASE}/{oid}", headers=organizer).json()["actions"] == ["retry_round"]  # BE-31
    winners = conn.execute(sa.text("SELECT id FROM plan_items WHERE outing_id = :o AND is_winner"), {"o": oid}).all()
    assert [str(w.id) for w in winners] == [items[2]]


# ---------- the result (BE-20, BE-21) ----------

def test_equal_likes_go_to_the_better_recommendation(voting):
    client, conn, oid, organizer, member, guest, items = voting
    _vote(client, oid, member, items[3], True)
    _vote(client, oid, guest, items[1], True)
    result = client.post(f"{BASE}/{oid}/end-voting", headers=organizer, json=R(client, oid, organizer)).json()
    assert result["winner"]["plan_item_id"] == items[1]  # rank 2 beats rank 4 at one like each (D09)
    assert result["status"] == "result"  # no tie-break stage, no timer


def test_no_likes_means_no_winner_and_says_why(voting):
    client, conn, oid, organizer, member, guest, items = voting
    _vote(client, oid, member, items[0], False)
    result = client.post(f"{BASE}/{oid}/end-voting", headers=organizer, json=R(client, oid, organizer)).json()
    assert result["winner"] is None and result["no_winner_reason"] == "everyone_passed"
    assert conn.execute(sa.text("SELECT count(*) FROM plan_items WHERE outing_id = :o AND is_winner"),
                        {"o": oid}).scalar_one() == 0


def test_no_votes_at_all_is_told_apart(voting):
    client, conn, oid, organizer, *_ = voting
    result = client.post(f"{BASE}/{oid}/end-voting", headers=organizer, json=R(client, oid, organizer)).json()
    assert result["winner"] is None and result["no_winner_reason"] == "no_votes"


def test_everyone_reads_the_same_result_only_after_voting(voting):
    client, conn, oid, organizer, member, guest, items = voting
    r = client.get(f"{BASE}/{oid}/result", headers=guest, params=R(client, oid, guest))
    assert r.status_code == 409 and r.json()["error"]["code"] == "RESULT_NOT_READY"
    _vote(client, oid, member, items[0], True)
    ended = client.post(f"{BASE}/{oid}/end-voting", headers=organizer, json=R(client, oid, organizer)).json()
    for headers in (organizer, member, guest):
        assert client.get(f"{BASE}/{oid}/result", headers=headers, params=R(client, oid, headers)).json() == ended
    assert client.get(f"{BASE}/{oid}/result", headers=_bearer(_add_user(conn, "غريب")), params=R(client, oid, _bearer(_add_user(conn, "غريب")))).status_code == 403
