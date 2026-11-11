"""BE-29 (#88): leaving and removal before generation, on PostgreSQL.

Uses the BE-17 scratch schema (restaurants, plan_items) so a plan can be generated in the same tests.
"""
import threading
import uuid

import pytest
import sqlalchemy as sa
from app.core.database import engine
from app.main import app
from fastapi.testclient import TestClient
from tests.test_outing_state_integration import _session
from tests.test_outings_join_integration import _add_outing, _add_user, _bearer
from tests.test_plan_generation_integration import BASE, _ready_session, api, fresh_limits, secret  # noqa: F401

pytestmark = pytest.mark.integration


def _ids(client, oid, organizer):
    """participant_id by name, from the organizer's view."""
    state = client.get(f"{BASE}/{oid}", headers=organizer).json()
    return {p["name"]: p["participant_id"] for p in state["participants"]}


def _remove(client, oid, headers, pid):
    return client.delete(f"{BASE}/{oid}/participants/{pid}", headers=headers)


def _code(r):
    return r.json()["error"]["code"]


# ---------- leaving ----------

def test_a_participant_leaves_and_drops_out_of_the_count(api):
    client, conn = api
    oid, _, organizer, member, guest = _ready_session(client, conn)
    r = client.post(f"{BASE}/{oid}/leave", headers=member)
    assert r.status_code == 200
    body = r.json()
    assert body["attendance"] == "declined" and body["ready_count"] == 2 and body["total_count"] == 2
    state = client.get(f"{BASE}/{oid}", headers=organizer).json()
    assert [p["name"] for p in state["participants"]] == ["عاصم حامد", "نورة"]
    assert state["readiness"] == {"ready_count": 2, "total_count": 2}


def test_someone_who_left_loses_access_but_can_rejoin_while_open(api):
    client, conn = api
    oid, code, organizer, member, _ = _session(client, conn)
    client.post(f"{BASE}/{oid}/leave", headers=member)
    r = client.get(f"{BASE}/{oid}", headers=member)
    assert r.status_code == 403 and _code(r) == "LEFT_OUTING"
    assert client.post(f"{BASE}/{code}/join", headers=member).status_code == 200
    assert client.get(f"{BASE}/{oid}", headers=member).status_code == 200


def test_the_organizer_cannot_leave(api):
    client, conn = api
    oid, _, organizer, _, _ = _session(client, conn)
    r = client.post(f"{BASE}/{oid}/leave", headers=organizer)
    assert r.status_code == 409 and _code(r) == "ORGANIZER_CANNOT_LEAVE"


# ---------- removal ----------

def test_the_organizer_removes_a_guest_and_the_old_token_stops_working(api):
    client, conn = api
    oid, _, organizer, _, guest = _session(client, conn)
    assert client.post(f"{BASE}/{oid}/start-preferences", headers=organizer).status_code == 200
    pid = _ids(client, oid, organizer)["نورة"]
    r = _remove(client, oid, organizer, pid)
    assert r.status_code == 200 and r.json()["attendance"] == "removed" and r.json()["total_count"] == 2
    # Done when: a removed guest cannot read private state or submit answers with the old token.
    for call in (lambda: client.get(f"{BASE}/{oid}", headers=guest),
                 lambda: client.get(f"{BASE}/{oid}/preferences", headers=guest),
                 lambda: client.put(f"{BASE}/{oid}/preferences", headers=guest, json={"budget_max": 50}),
                 lambda: client.post(f"{BASE}/{oid}/preferences/ready", headers=guest)):
        r = call()
        assert r.status_code == 403 and _code(r) == "REMOVED_FROM_OUTING"
    assert "نورة" not in _ids(client, oid, organizer)


def test_a_removed_account_cannot_rejoin_from_the_link(api):
    client, conn = api
    oid, code, organizer, member, _ = _session(client, conn)
    _remove(client, oid, organizer, _ids(client, oid, organizer)["فهد"])
    r = client.post(f"{BASE}/{code}/join", headers=member)
    assert r.status_code == 403 and _code(r) == "REMOVED_FROM_OUTING"


def test_removing_the_last_person_not_ready_lets_the_organizer_generate(api):
    client, conn = api
    oid, _, organizer, member, guest = _ready_session(client, conn)
    conn.execute(sa.text("UPDATE participants SET preferences_done = false WHERE guest_name = 'نورة'"))
    assert client.post(f"{BASE}/{oid}/start-voting", headers=organizer).status_code == 409
    _remove(client, oid, organizer, _ids(client, oid, organizer)["نورة"])
    assert client.post(f"{BASE}/{oid}/start-voting", headers=organizer).status_code == 200


def test_a_place_freed_by_leaving_can_be_taken(api):
    client, conn = api
    organizer = _add_user(conn)
    oid, code = _add_outing(conn, organizer)
    guests = [client.post(f"{BASE}/{code}/join-guest", json={"guest_name": f"ضيف {i}"}).json() for i in range(7)]
    assert client.post(f"{BASE}/{code}/join-guest", json={"guest_name": "زيادة"}).status_code == 409  # 8 of 8
    client.post(f"{BASE}/{oid}/leave", headers={"Authorization": f"Bearer {guests[0]['guest_token']}"})
    assert client.post(f"{BASE}/{code}/join-guest", json={"guest_name": "زيادة"}).status_code == 201


def test_only_the_organizer_removes_and_not_themselves(api):
    client, conn = api
    oid, _, organizer, member, guest = _session(client, conn)
    ids = _ids(client, oid, organizer)
    r = _remove(client, oid, member, ids["نورة"])
    assert r.status_code == 403 and _code(r) == "ORGANIZER_ONLY"
    r = _remove(client, oid, organizer, ids["عاصم حامد"])
    assert r.status_code == 409 and _code(r) == "ORGANIZER_CANNOT_LEAVE"
    for pid in (str(uuid.uuid4()), ids["نورة"]):
        if pid == ids["نورة"]:
            _remove(client, oid, organizer, pid)  # the second removal of the same person
        r = _remove(client, oid, organizer, pid)
        assert r.status_code == 404 and _code(r) == "PARTICIPANT_NOT_FOUND"


def test_a_participant_of_another_outing_cannot_be_removed(api):
    client, conn = api
    oid, _, organizer, _, _ = _session(client, conn)
    other, _, other_org, _, _ = _session(client, conn)
    stranger = _ids(client, other, other_org)["نورة"]
    r = _remove(client, oid, organizer, stranger)
    assert r.status_code == 404
    assert "نورة" in _ids(client, other, other_org)


# ---------- after generation ----------

def test_the_group_is_locked_once_the_plan_is_generated(api):
    client, conn = api
    oid, _, organizer, member, guest = _ready_session(client, conn)
    assert client.post(f"{BASE}/{oid}/start-voting", headers=organizer).status_code == 200
    r = client.post(f"{BASE}/{oid}/leave", headers=member)
    assert r.status_code == 409 and _code(r) == "MEMBERSHIP_LOCKED"
    r = _remove(client, oid, organizer, _ids(client, oid, organizer)["نورة"])
    assert r.status_code == 409 and _code(r) == "MEMBERSHIP_LOCKED"


def test_a_removal_racing_with_generation_never_changes_the_saved_group(secret):  # noqa: F811
    """Generation holds the outing's lock and moves to voting. A removal sent meanwhile must wait for
    it and then be refused, instead of slipping in before the commit."""
    with engine.begin() as conn:
        organizer = _add_user(conn)
        oid, _ = _add_outing(conn, organizer, status="preferences")
        guest = uuid.uuid4()
        conn.execute(sa.text("INSERT INTO participants (id, outing_id, guest_name, attendance, preferences_done) "
                             "VALUES (:id, :o, 'نورة', 'confirmed', true)"), {"id": guest, "o": oid})
    try:
        holder = engine.connect()
        tx = holder.begin()
        holder.execute(sa.text("SELECT 1 FROM outings WHERE id = :o FOR UPDATE"), {"o": oid})
        result = {}

        def remove():
            result["r"] = TestClient(app).delete(f"{BASE}/{oid}/participants/{guest}", headers=_bearer(organizer))

        t = threading.Thread(target=remove)
        t.start()
        t.join(timeout=0.5)
        holder.execute(sa.text("UPDATE outings SET status = 'voting' WHERE id = :o"), {"o": oid})
        tx.commit()
        holder.close()
        t.join(timeout=10)
        assert result["r"].status_code == 409 and _code(result["r"]) == "MEMBERSHIP_LOCKED"
        with engine.connect() as check:
            assert check.execute(sa.text("SELECT attendance FROM participants WHERE id = :g"),
                                 {"g": guest}).scalar_one() == "confirmed"
    finally:
        with engine.begin() as conn:
            conn.execute(sa.text("DELETE FROM participants WHERE outing_id = :o"), {"o": oid})
            conn.execute(sa.text("DELETE FROM outings WHERE id = :o"), {"o": oid})
            conn.execute(sa.text("DELETE FROM users WHERE id = :u"), {"u": organizer})
