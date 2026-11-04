"""BE-09 (#64): look up an invite code, join as a registered user, join as a guest.

Most tests run inside a transaction that is rolled back, like the BE-08 tests. The two
concurrency tests need real, separate transactions, so they commit to thouq_test and
delete what they created at the end.
"""
import threading
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
import sqlalchemy as sa
from app.core.config import get_settings
from app.core.database import engine, get_db
from app.main import app
from app.services.auth.tokens import TokenError, decode_access_token, decode_guest_token
from app.services.outings import join as join_module
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from tests.test_session import make_token

pytestmark = pytest.mark.integration
SECRET = "test-secret"
OLAYA = "00100001141"
BASE = "/api/v1/outings"


def _bearer(uid):
    return {"Authorization": f"Bearer {make_token(str(uid), timedelta(minutes=5), SECRET)}"}


def _add_user(conn, name="عاصم حامد"):
    uid = uuid.uuid4()
    conn.execute(sa.text("INSERT INTO users (id, name, phone_number, created_at) "
                         "VALUES (:id, :name, :phone, CURRENT_TIMESTAMP)"),
                 {"id": uid, "name": name, "phone": uid.hex[:10]})
    return uid


def _add_outing(conn, organizer, status="invite", code=None, group_id=None, starts_at=None):
    oid = uuid.uuid4()
    code = code or uuid.uuid4().hex[:4].upper().replace("0", "A").replace("1", "B")
    starts_at = starts_at or datetime.now(timezone.utc) + timedelta(days=1)
    conn.execute(sa.text(
        "INSERT INTO outings (id, group_id, organizer_id, name, status, invite_code, starts_at, district, created_at) "
        "VALUES (:id, :g, :o, 'عشاء الخميس', :s, :c, :t, :d, CURRENT_TIMESTAMP)"),
        {"id": oid, "g": group_id, "o": organizer, "s": status, "c": code, "t": starts_at, "d": OLAYA})
    conn.execute(sa.text("INSERT INTO participants (id, outing_id, user_id, attendance, preferences_done) "
                         "VALUES (:id, :o, :u, 'confirmed', false)"),
                 {"id": uuid.uuid4(), "o": oid, "u": organizer})
    return oid, code


def _add_guests(conn, outing_id, n):
    for i in range(n):
        conn.execute(sa.text("INSERT INTO participants (id, outing_id, guest_name, attendance, preferences_done) "
                             "VALUES (:id, :o, :n, 'confirmed', false)"),
                     {"id": uuid.uuid4(), "o": outing_id, "n": f"ضيف {i}"})


def _count(conn, outing_id):
    return conn.execute(sa.text("SELECT count(*) FROM participants WHERE outing_id = :o"), {"o": outing_id}).scalar()


@pytest.fixture(autouse=True)
def fresh_limits():
    """The limits count per process; every test starts with none used."""
    join_module.CODE_TRIES.reset()
    join_module.GUEST_TRIES.reset()
    yield
    join_module.CODE_TRIES.reset()
    join_module.GUEST_TRIES.reset()


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


# ---------- GET /outings/by-code/{code} ----------

def test_lookup_shows_only_what_the_join_screen_needs(api):
    client, conn = api
    organizer = _add_user(conn)
    oid, code = _add_outing(conn, organizer)
    r = client.get(f"{BASE}/by-code/{code}")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"outing_id", "name", "organizer_name", "starts_at", "district", "status",
                         "participants_count", "can_join", "join_blocked_reason"}
    assert body["outing_id"] == str(oid)
    assert body["organizer_name"] == "عاصم"  # first name only
    assert body["district"] == OLAYA and body["status"] == "invite"
    assert body["participants_count"] == 1
    assert body["can_join"] is True and body["join_blocked_reason"] is None


def test_lookup_accepts_lower_case_and_spaces(api):
    client, conn = api
    _, code = _add_outing(conn, _add_user(conn))
    assert client.get(f"{BASE}/by-code/ {code.lower()} ").status_code == 200


@pytest.mark.parametrize("code", ["ZZZZ", "AB", "ABCDE", "AB-C"])
def test_lookup_unknown_or_malformed_code_is_404(api, code):
    client, _ = api
    r = client.get(f"{BASE}/by-code/{code}")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "OUTING_NOT_FOUND"


def test_lookup_ignores_finished_outings(api):
    client, conn = api
    _, code = _add_outing(conn, _add_user(conn), status="result")
    assert client.get(f"{BASE}/by-code/{code}").status_code == 404


def test_lookup_says_why_joining_is_blocked(api):
    client, conn = api
    full, full_code = _add_outing(conn, _add_user(conn))
    _add_guests(conn, full, 7)
    _, voting_code = _add_outing(conn, _add_user(conn), status="voting")
    assert client.get(f"{BASE}/by-code/{full_code}").json()["join_blocked_reason"] == "OUTING_FULL"
    body = client.get(f"{BASE}/by-code/{voting_code}").json()
    assert body["can_join"] is False and body["join_blocked_reason"] == "JOINING_CLOSED"


# ---------- POST /outings/{code}/join ----------

def test_user_joins_once_confirmed_and_not_ready(api):
    client, conn = api
    oid, code = _add_outing(conn, _add_user(conn))
    member = _add_user(conn, "فهد")
    r = client.post(f"{BASE}/{code}/join", headers=_bearer(member))
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"outing_id", "participant_id", "status"}
    assert body["outing_id"] == str(oid) and body["status"] == "invite"
    row = conn.execute(sa.text("SELECT user_id, attendance, preferences_done FROM participants WHERE id = :id"),
                       {"id": body["participant_id"]}).one()
    assert row == (member, "confirmed", False)


def test_joining_again_returns_the_same_participant(api):
    client, conn = api
    oid, code = _add_outing(conn, _add_user(conn))
    member = _add_user(conn, "فهد")
    first = client.post(f"{BASE}/{code}/join", headers=_bearer(member)).json()
    second = client.post(f"{BASE}/{code.lower()}/join", headers=_bearer(member)).json()
    assert first["participant_id"] == second["participant_id"]
    assert _count(conn, oid) == 2


def test_organizer_joining_gets_their_own_row(api):
    client, conn = api
    organizer = _add_user(conn)
    oid, code = _add_outing(conn, organizer)
    assert client.post(f"{BASE}/{code}/join", headers=_bearer(organizer)).status_code == 200
    assert _count(conn, oid) == 1


def test_an_existing_participant_gets_200_even_after_joining_closed(api):
    client, conn = api
    organizer = _add_user(conn)
    _, code = _add_outing(conn, organizer, status="voting")
    assert client.post(f"{BASE}/{code}/join", headers=_bearer(organizer)).status_code == 200


def test_saved_preferences_are_copied_into_a_separate_row(api):
    client, conn = api
    _, code = _add_outing(conn, _add_user(conn))
    member = _add_user(conn, "شذى")
    conn.execute(sa.text("INSERT INTO preferences (id, user_id, liked_cuisines, allergies, budget_min, budget_max, "
                         "max_distance_km, seating_needs) VALUES (:id, :u, ARRAY['saudi'], ARRAY['نخالة'], 30, 80, 5, 'جلسة عائلية')"),
                 {"id": uuid.uuid4(), "u": member})
    pid = client.post(f"{BASE}/{code}/join", headers=_bearer(member)).json()["participant_id"]
    rows = conn.execute(sa.text("SELECT user_id, participant_id, liked_cuisines, allergies, budget_min, budget_max, "
                                "max_distance_km, seating_needs FROM preferences WHERE user_id = :u OR participant_id = :p "
                                "ORDER BY participant_id NULLS FIRST"), {"u": member, "p": pid}).all()
    assert len(rows) == 2
    account, outing = rows
    assert account.participant_id is None and outing.user_id is None
    assert str(outing.participant_id) == pid
    assert account[2:] == outing[2:]


def test_without_saved_preferences_nothing_is_copied(api):
    client, conn = api
    _, code = _add_outing(conn, _add_user(conn))
    pid = client.post(f"{BASE}/{code}/join", headers=_bearer(_add_user(conn, "حسن"))).json()["participant_id"]
    assert conn.execute(sa.text("SELECT count(*) FROM preferences WHERE participant_id = :p"), {"p": pid}).scalar() == 0


def test_joining_a_group_outing_adds_one_membership(api):
    client, conn = api
    organizer = _add_user(conn)
    gid = uuid.uuid4()
    conn.execute(sa.text("INSERT INTO groups (id, name, organizer_id, created_at) "
                         "VALUES (:id, 'الشلة', :o, CURRENT_TIMESTAMP)"), {"id": gid, "o": organizer})
    _, code = _add_outing(conn, organizer, group_id=gid)
    member = _add_user(conn, "فهد")
    for _ in range(2):
        assert client.post(f"{BASE}/{code}/join", headers=_bearer(member)).status_code == 200
    assert conn.execute(sa.text("SELECT count(*) FROM group_members WHERE group_id = :g AND user_id = :u"),
                        {"g": gid, "u": member}).scalar() == 1


def test_join_needs_a_login_token(api):
    client, conn = api
    _, code = _add_outing(conn, _add_user(conn))
    r = client.post(f"{BASE}/{code}/join")
    assert r.status_code == 401 and r.json()["error"]["code"] == "INVALID_TOKEN"


def test_join_is_closed_once_voting_starts(api):
    client, conn = api
    _, code = _add_outing(conn, _add_user(conn), status="voting")
    r = client.post(f"{BASE}/{code}/join", headers=_bearer(_add_user(conn, "فهد")))
    assert r.status_code == 409 and r.json()["error"]["code"] == "JOINING_CLOSED"


def test_join_is_open_in_the_preferences_stage(api):
    client, conn = api
    _, code = _add_outing(conn, _add_user(conn), status="preferences")
    assert client.post(f"{BASE}/{code}/join", headers=_bearer(_add_user(conn, "فهد"))).status_code == 200


def test_join_unknown_code_is_404(api):
    client, conn = api
    r = client.post(f"{BASE}/ZZZZ/join", headers=_bearer(_add_user(conn)))
    assert r.status_code == 404 and r.json()["error"]["code"] == "OUTING_NOT_FOUND"


# ---------- POST /outings/{code}/join-guest ----------

def test_guest_joins_with_a_name_and_gets_a_token_for_this_outing(api):
    client, conn = api
    starts_at = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=2)
    oid, code = _add_outing(conn, _add_user(conn), starts_at=starts_at)
    r = client.post(f"{BASE}/{code}/join-guest", json={"guest_name": "  نورة  "})
    assert r.status_code == 201
    body = r.json()
    assert set(body) == {"outing_id", "participant_id", "guest_token", "status"}
    row = conn.execute(sa.text("SELECT user_id, guest_name, attendance, preferences_done FROM participants WHERE id = :id"),
                       {"id": body["participant_id"]}).one()
    assert row == (None, "نورة", "confirmed", False)
    pid, token_outing = decode_guest_token(body["guest_token"])
    assert str(pid) == body["participant_id"] and token_outing == oid
    exp = jwt.decode(body["guest_token"], SECRET, algorithms=["HS256"])["exp"]
    assert exp == int((starts_at + timedelta(days=1)).timestamp())


def test_a_user_and_a_guest_join_the_same_session(api):
    client, conn = api
    oid, code = _add_outing(conn, _add_user(conn))
    assert client.post(f"{BASE}/{code}/join", headers=_bearer(_add_user(conn, "فهد"))).status_code == 200
    assert client.post(f"{BASE}/{code}/join-guest", json={"guest_name": "نورة"}).status_code == 201
    assert _count(conn, oid) == 3


@pytest.mark.parametrize("name", ["", "   ", "ن" * 41])
def test_guest_name_is_required_and_short(api, name):
    client, conn = api
    _, code = _add_outing(conn, _add_user(conn))
    r = client.post(f"{BASE}/{code}/join-guest", json={"guest_name": name})
    assert r.status_code == 422 and r.json()["error"]["fields"] == ["guest_name"]


def test_the_ninth_person_is_rejected(api):
    client, conn = api
    oid, code = _add_outing(conn, _add_user(conn))
    for i in range(7):
        assert client.post(f"{BASE}/{code}/join-guest", json={"guest_name": f"ضيف {i}"}).status_code == 201
    guest = client.post(f"{BASE}/{code}/join-guest", json={"guest_name": "التاسع"})
    member = client.post(f"{BASE}/{code}/join", headers=_bearer(_add_user(conn, "التاسع")))
    for r in (guest, member):
        assert r.status_code == 409 and r.json()["error"]["code"] == "OUTING_FULL"
    assert _count(conn, oid) == 8


def test_guest_join_is_closed_once_voting_starts(api):
    client, conn = api
    _, code = _add_outing(conn, _add_user(conn), status="tiebreak")
    r = client.post(f"{BASE}/{code}/join-guest", json={"guest_name": "نورة"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "JOINING_CLOSED"


# ---------- limits per client ----------

def test_too_many_code_tries_are_refused(api):
    client, conn = api
    _, code = _add_outing(conn, _add_user(conn))
    for _ in range(join_module.CODE_TRIES.limit):
        assert client.get(f"{BASE}/by-code/ZZZZ").status_code == 404
    for r in (client.get(f"{BASE}/by-code/{code}"),
              client.post(f"{BASE}/{code}/join-guest", json={"guest_name": "نورة"}),
              client.post(f"{BASE}/{code}/join", headers=_bearer(_add_user(conn, "فهد")))):
        assert r.status_code == 429
        error = r.json()["error"]
        assert error["code"] == "RATE_LIMITED" and 1 <= error["retry_after_seconds"] <= 600


def test_too_many_guest_joins_are_refused(api):
    client, conn = api
    _, code = _add_outing(conn, _add_user(conn))
    statuses = [client.post(f"{BASE}/{code}/join-guest", json={"guest_name": f"ضيف {i}"}).status_code
                for i in range(join_module.GUEST_TRIES.limit + 1)]
    assert statuses == [201] * 7 + [409] * 3 + [429]
    assert client.get(f"{BASE}/by-code/{code}").status_code == 200  # lookups have their own limit


def test_limits_are_counted_per_client(api, monkeypatch):
    client, conn = api
    monkeypatch.setenv("CLIENT_IP_HEADER", "True-Client-IP")
    get_settings.cache_clear()
    _, code = _add_outing(conn, _add_user(conn))
    for _ in range(join_module.CODE_TRIES.limit):
        client.get(f"{BASE}/by-code/ZZZZ", headers={"True-Client-IP": "203.0.113.1"})
    assert client.get(f"{BASE}/by-code/{code}", headers={"True-Client-IP": "203.0.113.1"}).status_code == 429
    assert client.get(f"{BASE}/by-code/{code}", headers={"True-Client-IP": "203.0.113.2"}).status_code == 200


# ---------- tokens ----------

def test_a_guest_token_is_not_a_login_token(api):
    client, conn = api
    _, code = _add_outing(conn, _add_user(conn))
    token = client.post(f"{BASE}/{code}/join-guest", json={"guest_name": "نورة"}).json()["guest_token"]
    with pytest.raises(TokenError):
        decode_access_token(token)
    r = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "INVALID_TOKEN"


def test_a_login_token_is_not_a_guest_token(secret):
    with pytest.raises(TokenError):
        decode_guest_token(make_token(str(uuid.uuid4()), timedelta(minutes=5), SECRET))


# ---------- two joins at the same moment (real transactions) ----------

@pytest.fixture
def committed(secret, monkeypatch):
    """Rows committed to thouq_test, removed afterwards. Counting is slowed down so that,
    without the lock, two joins would both count 7 before either inserts."""
    created = {"users": [], "outings": []}
    real_count = join_module._count

    def slow_count(db, outing_id):
        n = real_count(db, outing_id)
        threading.Event().wait(0.3)
        return n

    monkeypatch.setattr(join_module, "_count", slow_count)
    with engine.begin() as conn:
        organizer = _add_user(conn)
        oid, code = _add_outing(conn, organizer)
        _add_guests(conn, oid, 6)  # organizer + 6 = 7, one seat left
        created["users"].append(organizer)
        created["outings"].append(oid)

    def new_user(name):
        with engine.begin() as conn:
            uid = _add_user(conn, name)
        created["users"].append(uid)
        return uid

    yield oid, code, new_user
    with engine.begin() as conn:
        p = "SELECT id FROM participants WHERE outing_id = ANY(:o)"
        conn.execute(sa.text(f"DELETE FROM preferences WHERE participant_id IN ({p})"), {"o": created["outings"]})
        conn.execute(sa.text("DELETE FROM participants WHERE outing_id = ANY(:o)"), {"o": created["outings"]})
        conn.execute(sa.text("DELETE FROM outings WHERE id = ANY(:o)"), {"o": created["outings"]})
        conn.execute(sa.text("DELETE FROM users WHERE id = ANY(:u)"), {"u": created["users"]})


def _at_once(*calls):
    barrier = threading.Barrier(len(calls))
    results = [None] * len(calls)

    def run(i, call):
        barrier.wait()
        results[i] = call(TestClient(app))

    threads = [threading.Thread(target=run, args=(i, c)) for i, c in enumerate(calls)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)
    return results


def test_two_people_taking_the_last_seat_at_once_admit_only_one(committed):
    oid, code, new_user = committed
    member = new_user("فهد")
    results = _at_once(
        lambda c: c.post(f"{BASE}/{code}/join-guest", json={"guest_name": "نورة"}),
        lambda c: c.post(f"{BASE}/{code}/join", headers=_bearer(member)),
    )
    assert sorted(r.status_code for r in results) in ([200, 409], [201, 409])
    assert [r.json()["error"]["code"] for r in results if r.status_code == 409] == ["OUTING_FULL"]
    with engine.connect() as conn:
        assert _count(conn, oid) == 8


def test_the_same_user_joining_twice_at_once_is_added_once(committed):
    oid, code, new_user = committed
    member = new_user("فهد")
    results = _at_once(*[lambda c: c.post(f"{BASE}/{code}/join", headers=_bearer(member))] * 2)
    assert [r.status_code for r in results] == [200, 200]
    assert results[0].json()["participant_id"] == results[1].json()["participant_id"]
    with engine.connect() as conn:
        assert _count(conn, oid) == 8
