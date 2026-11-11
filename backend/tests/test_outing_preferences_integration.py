"""BE-13 (#19): a participant's own preferences for one outing, and readiness.

Runs inside a transaction that is rolled back. The concurrency test commits to thouq_test and
deletes what it created.
"""
import threading
import uuid

import pytest
import sqlalchemy as sa
from app.core.database import engine
from app.main import app
from fastapi.testclient import TestClient
from tests.test_outing_state_integration import _session, api, secret  # noqa: F401
from tests.test_outings_session_integration import _later
from tests.test_outings_join_integration import _add_outing, _add_user, _bearer, fresh_limits  # noqa: F401

from tests.round_helpers import R, W  # noqa: F401

pytestmark = pytest.mark.integration
BASE = "/api/v1/outings"
ANSWERS = {"liked_cuisines": ["levant", "grill"], "allergies": ["فول سوداني"], "budget_min": 30,
           "budget_max": 80, "max_distance_km": 5, "seating_needs": "جلسة عائلية"}


def _start(client, oid, organizer):
    assert client.post(f"{BASE}/{oid}/start-preferences", headers=organizer).status_code == 200


def _row(conn, oid, name):
    """The preferences row of the participant with this guest name or account name."""
    return conn.execute(sa.text("""
        SELECT p.* FROM preferences p JOIN participants pa ON pa.id = p.participant_id
        LEFT JOIN users u ON u.id = pa.user_id
        WHERE pa.outing_id = :o AND coalesce(pa.guest_name, u.name) = :n"""), {"o": oid, "n": name}).mappings().first()


# ---------- GET / PUT /outings/{id}/preferences ----------

def test_a_guest_saves_and_reads_their_own_copy(api):
    client, conn = api
    oid, _, _, _, guest = _session(client, conn)
    assert client.get(f"{BASE}/{oid}/preferences", headers=guest, params=R(client, oid, guest)).json()["is_saved"] is False
    r = client.put(f"{BASE}/{oid}/preferences", headers=guest, json=W(client, oid, guest, ANSWERS))
    assert r.status_code == 200
    current = R(client, oid, guest)
    assert r.json() == {"message": "outing preferences updated", "preferences_done": False,
                        "ready_count": 0, "total_count": 3, **current}
    mine = client.get(f"{BASE}/{oid}/preferences", headers=guest, params=current).json()
    assert mine == {**ANSWERS, "max_distance_km": 5.0, "is_saved": True, "preferences_done": False, **current}


def test_one_person_cannot_touch_another_persons_answers(api):
    client, conn = api
    oid, _, organizer, member, guest = _session(client, conn)
    client.put(f"{BASE}/{oid}/preferences", headers=guest, json=W(client, oid, guest, ANSWERS))
    client.put(f"{BASE}/{oid}/preferences", headers=member, json=W(client, oid, member, {"liked_cuisines": ["italian"]}))
    assert _row(conn, oid, "نورة")["liked_cuisines"] == ["levant", "grill"]
    assert _row(conn, oid, "فهد")["liked_cuisines"] == ["italian"]
    # The organizer reads only their own copy, never the guest's.
    assert client.get(f"{BASE}/{oid}/preferences", headers=organizer, params=R(client, oid, organizer)).json()["liked_cuisines"] != ANSWERS["liked_cuisines"]


def test_the_account_defaults_are_never_touched(api):
    client, conn = api
    oid, _, _, member, _ = _session(client, conn)
    before = client.get("/api/v1/users/me/preferences", headers=member).json()
    client.put(f"{BASE}/{oid}/preferences", headers=member, json=W(client, oid, member, ANSWERS))
    assert client.get("/api/v1/users/me/preferences", headers=member).json() == before


def test_saving_twice_keeps_one_row_with_the_last_answers(api):
    client, conn = api
    oid, _, _, _, guest = _session(client, conn)
    client.put(f"{BASE}/{oid}/preferences", headers=guest, json=W(client, oid, guest, ANSWERS))
    client.put(f"{BASE}/{oid}/preferences", headers=guest, json=W(client, oid, guest, {"budget_max": 50}))
    row = _row(conn, oid, "نورة")
    assert row["budget_max"] == 50 and row["liked_cuisines"] == [] and row["allergies"] == []
    count = conn.execute(sa.text("SELECT count(*) FROM preferences p JOIN participants pa ON pa.id = p.participant_id "
                                 "WHERE pa.outing_id = :o AND pa.guest_name = 'نورة'"), {"o": oid}).scalar()
    assert count == 1


@pytest.mark.parametrize("bad,field", [({"budget_min": 90, "budget_max": 50}, "budget_max"),
                                       ({"liked_cuisines": ["spaceship"]}, "liked_cuisines"),
                                       ({"max_distance_km": 0}, "max_distance_km")])
def test_invalid_answers_are_refused_and_nothing_changes(api, bad, field):
    client, conn = api
    oid, _, _, _, guest = _session(client, conn)
    client.put(f"{BASE}/{oid}/preferences", headers=guest, json=W(client, oid, guest, ANSWERS))
    r = client.put(f"{BASE}/{oid}/preferences", headers=guest, json=W(client, oid, guest, bad))
    assert r.status_code == 422 and field in r.json()["error"]["fields"]
    assert _row(conn, oid, "نورة")["budget_max"] == 80


def test_editing_clears_readiness(api):
    client, conn = api
    oid, _, organizer, _, guest = _session(client, conn)
    _start(client, oid, organizer)
    client.put(f"{BASE}/{oid}/preferences", headers=guest, json=W(client, oid, guest, ANSWERS))
    assert client.post(f"{BASE}/{oid}/preferences/ready", headers=guest, json=R(client, oid, guest)).json()["preferences_done"] is True
    r = client.put(f"{BASE}/{oid}/preferences", headers=guest, json=W(client, oid, guest, {**ANSWERS, "budget_max": 100}))
    assert r.json()["preferences_done"] is False and r.json()["ready_count"] == 0


@pytest.mark.parametrize("status", ["voting", "tiebreak", "result"])
def test_answers_are_locked_once_voting_starts(api, status):
    client, conn = api
    oid, _, _, _, guest = _session(client, conn)
    client.put(f"{BASE}/{oid}/preferences", headers=guest, json=W(client, oid, guest, ANSWERS))
    conn.execute(sa.text("UPDATE outings SET status = :s WHERE id = :o"), {"s": status, "o": oid})
    r = client.put(f"{BASE}/{oid}/preferences", headers=guest, json=W(client, oid, guest, {"budget_max": 10}))
    assert r.status_code == 409 and r.json()["error"]["code"] == "PREFERENCES_LOCKED"
    assert _row(conn, oid, "نورة")["budget_max"] == 80


def test_a_stranger_cannot_read_or_save(api):
    client, conn = api
    oid, _, _, _, _ = _session(client, conn)
    stranger = _bearer(_add_user(conn, "غريب"))
    assert client.get(f"{BASE}/{oid}/preferences", headers=stranger, params=R(client, oid, stranger)).status_code == 403
    assert client.put(f"{BASE}/{oid}/preferences", headers=stranger, json=W(client, oid, stranger, ANSWERS)).status_code == 403


def test_the_organizer_starts_from_their_saved_defaults(api):
    client, conn = api
    organizer = _add_user(conn, "عاصم")
    conn.execute(sa.text("INSERT INTO preferences (id, user_id, liked_cuisines) VALUES (:id, :u, ARRAY['saudi_gulf'])"),
                 {"id": uuid.uuid4(), "u": organizer})
    r = client.post(f"{BASE}/session", headers=_bearer(organizer),
                    json={"name": "عشاء", "starts_at": _later(days=1), "district": "00100001141"})
    oid = r.json()["outing_id"]
    mine = client.get(f"{BASE}/{oid}/preferences", headers=_bearer(organizer), params=R(client, oid, _bearer(organizer))).json()
    assert mine["is_saved"] is True and mine["liked_cuisines"] == ["saudi_gulf"]


# ---------- POST /outings/{id}/preferences/ready ----------

def test_ready_needs_saved_answers_first(api):
    client, conn = api
    oid, _, organizer, _, guest = _session(client, conn)
    _start(client, oid, organizer)
    r = client.post(f"{BASE}/{oid}/preferences/ready", headers=guest, json=R(client, oid, guest))
    assert r.status_code == 409 and r.json()["error"]["code"] == "PREFERENCES_REQUIRED"
    client.put(f"{BASE}/{oid}/preferences", headers=guest, json=W(client, oid, guest, {}))  # empty answers are valid answers
    assert client.post(f"{BASE}/{oid}/preferences/ready", headers=guest, json=R(client, oid, guest)).status_code == 200


def test_ready_waits_for_the_preferences_stage(api):
    client, conn = api
    oid, _, _, _, guest = _session(client, conn)
    client.put(f"{BASE}/{oid}/preferences", headers=guest, json=W(client, oid, guest, ANSWERS))
    r = client.post(f"{BASE}/{oid}/preferences/ready", headers=guest, json=R(client, oid, guest))
    assert r.status_code == 409 and r.json()["error"]["code"] == "PREFERENCES_NOT_OPEN"


def test_ready_twice_is_safe(api):
    client, conn = api
    oid, _, organizer, _, guest = _session(client, conn)
    _start(client, oid, organizer)
    client.put(f"{BASE}/{oid}/preferences", headers=guest, json=W(client, oid, guest, ANSWERS))
    first = client.post(f"{BASE}/{oid}/preferences/ready", headers=guest, json=R(client, oid, guest)).json()
    second = client.post(f"{BASE}/{oid}/preferences/ready", headers=guest, json=R(client, oid, guest)).json()
    assert first == second
    assert first["ready_count"] == 1 and first["total_count"] == 3 and first["all_ready"] is False


def test_all_ready_counts_confirmed_people_only(api):
    client, conn = api
    oid, _, organizer, member, guest = _session(client, conn)
    _start(client, oid, organizer)
    conn.execute(sa.text("UPDATE participants SET attendance = 'declined' WHERE guest_name = 'نورة'"))
    for headers in (organizer, member):
        client.put(f"{BASE}/{oid}/preferences", headers=headers, json=W(client, oid, headers, ANSWERS))
    assert client.post(f"{BASE}/{oid}/preferences/ready", headers=organizer, json=R(client, oid, organizer)).json()["all_ready"] is False
    last = client.post(f"{BASE}/{oid}/preferences/ready", headers=member, json=R(client, oid, member)).json()
    assert last["all_ready"] is True and last["ready_count"] == last["total_count"] == 2
    state = client.get(f"{BASE}/{oid}", headers=organizer).json()
    assert state["readiness"] == {"ready_count": 2, "total_count": 2}
    assert [p["preferences_done"] for p in state["participants"]] == [True, True]  # declined is not listed (BE-29)


# ---------- a save and a stage change at the same moment (real transactions) ----------

def test_a_save_waits_for_a_stage_change_and_then_is_refused(secret):  # noqa: F811
    """Saving locks the outing like a join. If voting starts while a save waits, the save must see
    the new stage and be refused, never slip its answers in after the plan was built."""
    with engine.begin() as conn:
        organizer = _add_user(conn)
        oid, _ = _add_outing(conn, organizer, status="preferences")
    try:
        holder = engine.connect()
        tx = holder.begin()
        holder.execute(sa.text("SELECT 1 FROM outings WHERE id = :o FOR UPDATE"), {"o": oid})
        result = {}

        def save():
            result["r"] = TestClient(app).put(f"{BASE}/{oid}/preferences", headers=_bearer(organizer), json=W(TestClient(app), oid, _bearer(organizer), ANSWERS))

        t = threading.Thread(target=save)
        t.start()
        t.join(timeout=0.5)
        holder.execute(sa.text("UPDATE outings SET status = 'voting' WHERE id = :o"), {"o": oid})
        tx.commit()
        holder.close()
        t.join(timeout=10)
        assert result["r"].status_code == 409 and result["r"].json()["error"]["code"] == "PREFERENCES_LOCKED"
        with engine.connect() as conn:
            assert conn.execute(sa.text("SELECT count(*) FROM preferences p JOIN participants pa "
                                        "ON pa.id = p.participant_id WHERE pa.outing_id = :o"), {"o": oid}).scalar() == 0
    finally:
        with engine.begin() as conn:
            conn.execute(sa.text("DELETE FROM preferences WHERE participant_id IN "
                                 "(SELECT id FROM participants WHERE outing_id = :o)"), {"o": oid})
            conn.execute(sa.text("DELETE FROM participants WHERE outing_id = :o"), {"o": oid})
            conn.execute(sa.text("DELETE FROM outings WHERE id = :o"), {"o": oid})
            conn.execute(sa.text("DELETE FROM users WHERE id = :u"), {"u": organizer})
