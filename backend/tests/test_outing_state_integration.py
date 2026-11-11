"""BE-11 (#18): GET /outings/{id} and POST /outings/{id}/start-preferences, plus the stage rules.

Runs inside a transaction that is rolled back, like the BE-08 and BE-09 tests. The concurrency
test commits to thouq_test and deletes what it created.
"""
import threading
import uuid
from datetime import timedelta

import jwt
import pytest
import sqlalchemy as sa
from app.core.config import get_settings
from app.core.database import engine, get_db
from app.core.errors import ApiError
from app.main import app
from app.services.auth.models import utcnow
from app.services.outings import stages
from app.services.outings.models import Outing
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from tests.test_outings_join_integration import _add_outing, _add_user, _bearer, fresh_limits  # noqa: F401
from tests.test_session import make_token

pytestmark = pytest.mark.integration
SECRET = "test-secret"
BASE = "/api/v1/outings"
STATE_KEYS = {"outing_id", "name", "status", "starts_at", "district", "invite_code",
              "tiebreak_ends_at", "round_id", "round_number", "round_outcome", "me", "actions", "readiness",
              "participants"}


@pytest.fixture
def secret(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", SECRET)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def api(secret):
    with engine.connect() as conn, conn.begin():
        app.dependency_overrides[get_db] = lambda: (yield Session(bind=conn, join_transaction_mode="create_savepoint"))
        yield TestClient(app), conn
        app.dependency_overrides.clear()
        conn.rollback()


def _session(client, conn):
    """An outing with an organizer, a member who joined, and a guest. Returns their headers."""
    organizer = _add_user(conn, "عاصم حامد")
    oid, code = _add_outing(conn, organizer)
    member = _add_user(conn, "فهد")
    client.post(f"{BASE}/{code}/join", headers=_bearer(member))
    guest = client.post(f"{BASE}/{code}/join-guest", json={"guest_name": "نورة"}).json()
    return oid, code, _bearer(organizer), _bearer(member), {"Authorization": f"Bearer {guest['guest_token']}"}


# ---------- GET /outings/{id} ----------

def test_everyone_reads_the_same_stage_and_readiness(api):
    client, conn = api
    oid, _, organizer, member, guest = _session(client, conn)
    conn.execute(sa.text("UPDATE participants SET preferences_done = true WHERE guest_name = 'نورة'"))
    states = [client.get(f"{BASE}/{oid}", headers=h) for h in (organizer, member, guest)]
    assert all(r.status_code == 200 for r in states)
    bodies = [r.json() for r in states]
    assert all(set(b) == STATE_KEYS for b in bodies)
    shared = [{k: v for k, v in b.items() if k not in ("me", "actions")} for b in bodies]
    assert shared[0] == shared[1] == shared[2]
    people = bodies[0]["participants"]
    assert [p["name"] for p in people] == ["عاصم حامد", "فهد", "نورة"]  # organizer first, then by name
    assert [p["preferences_done"] for p in people] == [False, False, True]
    assert [p["is_organizer"] for p in people] == [True, False, False]
    assert bodies[0]["readiness"] == {"ready_count": 1, "total_count": 3}


def test_a_summary_holds_only_what_the_group_may_see(api):
    client, conn = api
    oid, _, organizer, _, _ = _session(client, conn)
    for person in client.get(f"{BASE}/{oid}", headers=organizer).json()["participants"]:
        assert set(person) == {"participant_id", "name", "attendance", "preferences_done", "is_organizer"}


def test_me_and_actions_depend_on_who_asks(api):
    client, conn = api
    oid, _, organizer, member, guest = _session(client, conn)
    mine = client.get(f"{BASE}/{oid}", headers=organizer).json()
    assert mine["me"]["is_organizer"] is True and mine["actions"] == ["start_preferences"]
    for headers in (member, guest):
        body = client.get(f"{BASE}/{oid}", headers=headers).json()
        assert body["me"]["is_organizer"] is False and body["actions"] == []
        me = [p for p in body["participants"] if p["participant_id"] == body["me"]["participant_id"]]
        assert len(me) == 1 and me[0]["is_organizer"] is False


def test_a_stranger_gets_403_and_an_unknown_outing_404(api):
    client, conn = api
    oid, _, _, _, _ = _session(client, conn)
    r = client.get(f"{BASE}/{oid}", headers=_bearer(_add_user(conn, "غريب")))
    assert r.status_code == 403 and r.json()["error"]["code"] == "NOT_A_PARTICIPANT"
    r = client.get(f"{BASE}/{uuid.uuid4()}", headers=_bearer(_add_user(conn, "غريب")))
    assert r.status_code == 404 and r.json()["error"]["code"] == "OUTING_NOT_FOUND"


def test_a_guest_token_works_for_its_own_outing_only(api):
    client, conn = api
    _, _, _, _, guest = _session(client, conn)
    other, _ = _add_outing(conn, _add_user(conn, "منظم ثاني"))
    r = client.get(f"{BASE}/{other}", headers=guest)
    assert r.status_code == 403 and r.json()["error"]["code"] == "NOT_A_PARTICIPANT"


def test_a_removed_guest_loses_access(api):
    client, conn = api
    oid, _, _, _, guest = _session(client, conn)
    conn.execute(sa.text("DELETE FROM participants WHERE guest_name = 'نورة'"))
    assert client.get(f"{BASE}/{oid}", headers=guest).status_code == 403


def test_tokens_are_checked(api):
    client, conn = api
    oid, _, _, _, _ = _session(client, conn)
    assert client.get(f"{BASE}/{oid}").json()["error"]["code"] == "INVALID_TOKEN"
    expired = make_token(str(uuid.uuid4()), timedelta(minutes=-1), SECRET)
    r = client.get(f"{BASE}/{oid}", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "TOKEN_EXPIRED"
    forged = jwt.encode({"sub": str(uuid.uuid4()), "oid": str(oid), "typ": "guest", "exp": utcnow() + timedelta(minutes=5)},
                        "wrong-secret", algorithm="HS256")
    r = client.get(f"{BASE}/{oid}", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "INVALID_TOKEN"


# ---------- POST /outings/{id}/start-preferences ----------

def test_the_organizer_starts_preferences(api):
    client, conn = api
    oid, _, organizer, member, _ = _session(client, conn)
    r = client.post(f"{BASE}/{oid}/start-preferences", headers=organizer)
    assert r.status_code == 200 and r.json() == {"outing_id": str(oid), "status": "preferences"}
    body = client.get(f"{BASE}/{oid}", headers=member).json()
    assert body["status"] == "preferences"
    assert client.get(f"{BASE}/{oid}", headers=organizer).json()["actions"] == []


def test_starting_twice_answers_200_and_changes_nothing(api):
    client, conn = api
    oid, _, organizer, _, _ = _session(client, conn)
    first = client.post(f"{BASE}/{oid}/start-preferences", headers=organizer)
    second = client.post(f"{BASE}/{oid}/start-preferences", headers=organizer)
    assert first.json() == second.json() == {"outing_id": str(oid), "status": "preferences"}


@pytest.mark.parametrize("who", ["member", "guest"])
def test_only_the_organizer_can_start(api, who):
    client, conn = api
    oid, _, _, member, guest = _session(client, conn)
    r = client.post(f"{BASE}/{oid}/start-preferences", headers=member if who == "member" else guest)
    assert r.status_code == 403 and r.json()["error"]["code"] == "ORGANIZER_ONLY"
    assert conn.execute(sa.text("SELECT status FROM outings WHERE id = :o"), {"o": oid}).scalar() == "invite"


@pytest.mark.parametrize("status", ["voting", "tiebreak", "result"])
def test_it_never_moves_backwards(api, status):
    client, conn = api
    oid, _, organizer, _, _ = _session(client, conn)
    conn.execute(sa.text("UPDATE outings SET status = :s WHERE id = :o"), {"s": status, "o": oid})
    r = client.post(f"{BASE}/{oid}/start-preferences", headers=organizer)
    assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_STATUS_TRANSITION"
    assert conn.execute(sa.text("SELECT status FROM outings WHERE id = :o"), {"o": oid}).scalar() == status


def test_people_can_still_join_in_the_preferences_stage(api):
    client, conn = api
    oid, code, organizer, _, _ = _session(client, conn)
    client.post(f"{BASE}/{oid}/start-preferences", headers=organizer)
    assert client.post(f"{BASE}/{code}/join-guest", json={"guest_name": "سارة"}).status_code == 201


# ---------- the stage rules ----------

@pytest.mark.parametrize("src,dst", [("invite", "preferences"), ("preferences", "voting"),
                                     ("voting", "tiebreak"), ("voting", "result"), ("tiebreak", "result")])
def test_forward_moves_are_allowed(src, dst):
    outing = Outing(status=src)
    assert stages.move(outing, dst) is True and outing.status == dst


@pytest.mark.parametrize("src,dst", [("preferences", "invite"), ("voting", "preferences"), ("result", "voting"),
                                     ("invite", "voting"), ("invite", "result"), ("tiebreak", "voting")])
def test_backward_and_skipping_moves_are_refused(src, dst):
    outing = Outing(status=src)
    with pytest.raises(ApiError) as exc:
        stages.move(outing, dst)
    assert exc.value.code == "INVALID_STATUS_TRANSITION" and outing.status == src


def test_every_stage_has_its_moves_listed():
    assert set(stages.ALLOWED_MOVES) == {"invite", "preferences", "voting", "tiebreak", "result"}


# ---------- two stage changes at the same moment (real transactions) ----------

def test_a_stage_change_never_overwrites_a_newer_one(secret):
    """While another request holds the outing and moves it on, start-preferences must wait and
    then see the new stage. Without the lock it would read "invite" first and later write
    "preferences" over "voting", moving the outing backwards."""
    with engine.begin() as conn:
        organizer = _add_user(conn)
        oid, _ = _add_outing(conn, organizer)
    try:
        holder = engine.connect()
        tx = holder.begin()
        holder.execute(sa.text("SELECT 1 FROM outings WHERE id = :o FOR UPDATE"), {"o": oid})
        result = {}

        def start():
            result["r"] = TestClient(app).post(f"{BASE}/{oid}/start-preferences", headers=_bearer(organizer))

        t = threading.Thread(target=start)
        t.start()
        t.join(timeout=0.5)
        holder.execute(sa.text("UPDATE outings SET status = 'voting' WHERE id = :o"), {"o": oid})
        tx.commit()
        holder.close()
        t.join(timeout=10)
        assert result["r"].status_code == 409
        assert result["r"].json()["error"]["code"] == "INVALID_STATUS_TRANSITION"
        with engine.connect() as conn:
            assert conn.execute(sa.text("SELECT status FROM outings WHERE id = :o"), {"o": oid}).scalar() == "voting"
    finally:
        with engine.begin() as conn:
            conn.execute(sa.text("DELETE FROM participants WHERE outing_id = :o"), {"o": oid})
            conn.execute(sa.text("DELETE FROM outings WHERE id = :o"), {"o": oid})
            conn.execute(sa.text("DELETE FROM users WHERE id = :u"), {"u": organizer})
