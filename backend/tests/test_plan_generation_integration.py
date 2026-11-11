"""BE-17 (#30): the organizer generates one stored plan and opens voting.

Each test builds small copies of restaurants and plan_items in a scratch schema (plan_items in the shape
migration 0012 gives it), inside a rolled-back transaction.
"""
import json
import threading
import uuid

import pytest
import sqlalchemy as sa
from app.core.database import engine
from app.main import app
from app.services.plan.candidates import hours_from_summary
from fastapi.testclient import TestClient
from tests.test_outing_state_integration import _session, secret  # noqa: F401
from tests.test_outings_join_integration import _add_outing, _add_user, _bearer, fresh_limits  # noqa: F401
from app.core.database import get_db
from sqlalchemy.orm import Session

from tests.migration_ddl import PLAN_ITEMS
from tests.round_helpers import R, W  # noqa: F401

pytestmark = pytest.mark.integration
BASE = "/api/v1/outings"
ALWAYS = {"open_24h": True, "days_open": 7}
SOME_DAYS = {"opens": "12:00", "closes": "23:00", "open_24h": False, "days_open": 5}

SCHEMA = """
CREATE TABLE restaurants (
    id integer PRIMARY KEY, name_ar text, name_en text, brand_id integer, cuisine text, district text,
    latitude numeric, longitude numeric, spend_low integer, spend_high integer, price_tier smallint,
    rating numeric, quality_score numeric, opening_hours jsonb, maps_url text, venue_type text, flags text);
""" + PLAN_ITEMS + ";"


@pytest.fixture
def api(secret):  # noqa: F811
    with engine.connect() as conn, conn.begin():
        conn.execute(sa.text("CREATE SCHEMA plan_test"))
        conn.execute(sa.text("SET LOCAL search_path TO plan_test, public"))
        for statement in SCHEMA.split(";"):
            if statement.strip():
                conn.execute(sa.text(statement))
        lat, lon = map(float, conn.execute(sa.text("SELECT latitude, longitude FROM districts WHERE id = '00100001141'")).one())

        def add(rid, cuisine, low=20, high=60, hours=ALWAYS, d=0.01, brand=None, venue=None, flags=None, quality=4.0):
            conn.execute(sa.text(
                "INSERT INTO restaurants (id, name_ar, name_en, brand_id, cuisine, district, latitude, longitude, "
                "spend_low, spend_high, price_tier, rating, quality_score, opening_hours, maps_url, venue_type, flags) "
                "VALUES (:id, :n, :n, :b, :c, 'العليا', :lat, :lon, :lo, :hi, 2, 4.5, :q, CAST(:h AS jsonb), 'https://maps', :v, :f)"),
                {"id": rid, "n": f"مطعم {rid}", "b": brand or rid, "c": cuisine, "lat": lat + d, "lon": lon,
                 "lo": low, "hi": high, "q": quality, "h": json.dumps(hours), "v": venue, "f": flags})

        add(1, "shawarma, grill_bbq", quality=4.8)
        add(2, "italian, pizza", quality=4.5)
        add(3, "saudi", quality=4.2)
        add(4, "burgers", quality=4.0)
        add(5, "indian", quality=3.9)
        add(6, "chinese", quality=3.8)
        add(7, "levantine", hours=SOME_DAYS)                        # unknown days: never suggested (D04)
        add(8, "levantine", venue="cloud_kitchen")                  # not a place to sit
        add(9, "levantine", flags="possibly_not_food")
        add(10, "saudi", low=300, high=500)                          # outside the budget below
        from app.main import app as _app
        _app.dependency_overrides[get_db] = lambda: (yield Session(bind=conn, join_transaction_mode="create_savepoint"))
        yield TestClient(_app), conn
        _app.dependency_overrides.clear()
        conn.rollback()


def _ready_session(client, conn, answers=None):
    """Organizer, member and guest; preferences started, everyone saved answers and is ready."""
    oid, code, organizer, member, guest = _session(client, conn)
    assert client.post(f"{BASE}/{oid}/start-preferences", headers=organizer).status_code == 200
    for headers in (organizer, member, guest):
        body = (answers or {}).get(id(headers), {"budget_max": 100})
        assert client.put(f"{BASE}/{oid}/preferences", headers=headers, json=W(client, oid, headers, body)).status_code == 200
        assert client.post(f"{BASE}/{oid}/preferences/ready", headers=headers, json=R(client, oid, headers)).status_code == 200
    return oid, code, organizer, member, guest


def _items(conn, oid):
    return conn.execute(sa.text("SELECT restaurant_id, rank FROM plan_items WHERE outing_id = :o ORDER BY rank"),
                        {"o": oid}).all()


# ---------- generating ----------

def test_the_organizer_generates_one_stored_plan_and_voting_opens(api):
    client, conn = api
    oid, _, organizer, member, guest = _ready_session(client, conn)
    r = client.post(f"{BASE}/{oid}/start-voting", headers=organizer, json=R(client, oid, organizer))
    assert r.status_code == 200
    plan = r.json()
    assert plan["status"] == "voting"
    assert 3 <= len(plan["plan_items"]) <= 5
    assert [i["rank"] for i in plan["plan_items"]] == list(range(1, len(plan["plan_items"]) + 1))
    ids = {i["restaurant"]["id"] for i in plan["plan_items"]}
    assert not ids & {7, 8, 9, 10}  # unknown hours, excluded venue and flag, over budget
    first = plan["plan_items"][0]
    assert first["reason"] and 0 <= first["match_score"] <= 100 and first["restaurant"]["distance_km"] >= 0
    assert [(row.restaurant_id, row.rank) for row in _items(conn, oid)] == [
        (i["restaurant"]["id"], i["rank"]) for i in plan["plan_items"]]
    # Everyone reads the same stored plan.
    assert client.get(f"{BASE}/{oid}/plan", headers=member, params=R(client, oid, member)).json() == plan
    assert client.get(f"{BASE}/{oid}/plan", headers=guest, params=R(client, oid, guest)).json() == plan


def test_asking_again_returns_the_stored_plan(api):
    client, conn = api
    oid, _, organizer, _, _ = _ready_session(client, conn)
    first = client.post(f"{BASE}/{oid}/start-voting", headers=organizer, json=R(client, oid, organizer)).json()
    second = client.post(f"{BASE}/{oid}/start-voting", headers=organizer, json=R(client, oid, organizer)).json()
    assert first == second
    assert len(_items(conn, oid)) == len(first["plan_items"])


def test_only_the_organizer_generates(api):
    client, conn = api
    oid, _, _, member, guest = _ready_session(client, conn)
    for headers in (member, guest):
        r = client.post(f"{BASE}/{oid}/start-voting", headers=headers, json=R(client, oid, headers))
        assert r.status_code == 403 and r.json()["error"]["code"] == "ORGANIZER_ONLY"
    assert _items(conn, oid) == []


def test_someone_not_ready_blocks_generation(api):
    client, conn = api
    oid, _, organizer, member, _ = _ready_session(client, conn)
    client.put(f"{BASE}/{oid}/preferences", headers=member, json=W(client, oid, member, {"budget_max": 90}))  # an edit clears readiness
    r = client.post(f"{BASE}/{oid}/start-voting", headers=organizer, json=R(client, oid, organizer))
    assert r.status_code == 409
    error = r.json()["error"]
    assert error["code"] == "NOT_EVERYONE_READY" and error["ready_count"] == 2 and error["total_count"] == 3
    assert _items(conn, oid) == []


def test_a_person_who_declined_does_not_block(api):
    client, conn = api
    oid, _, organizer, member, _ = _ready_session(client, conn)
    client.put(f"{BASE}/{oid}/preferences", headers=member, json=W(client, oid, member, {}))
    conn.execute(sa.text("UPDATE participants SET attendance = 'declined' WHERE user_id IS NOT NULL "
                         "AND outing_id = :o AND preferences_done = false"), {"o": oid})
    assert client.post(f"{BASE}/{oid}/start-voting", headers=organizer, json=R(client, oid, organizer)).status_code == 200


def test_generation_needs_the_preferences_stage(api):
    client, conn = api
    oid, _, organizer, _, _ = _session(client, conn)
    r = client.post(f"{BASE}/{oid}/start-voting", headers=organizer, json=R(client, oid, organizer))
    assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_STATUS_TRANSITION"


def test_no_match_opens_no_voting_and_saves_nothing(api):
    client, conn = api
    oid, _, organizer, _, _ = _session(client, conn)
    client.post(f"{BASE}/{oid}/start-preferences", headers=organizer)
    conn.execute(sa.text("UPDATE participants SET preferences_done = true WHERE outing_id = :o"), {"o": oid})
    conn.execute(sa.text("""INSERT INTO preferences (id, participant_id, budget_min, budget_max)
                            SELECT gen_random_uuid(), id, 1000, 2000 FROM participants WHERE outing_id = :o"""), {"o": oid})
    r = client.post(f"{BASE}/{oid}/start-voting", headers=organizer, json=R(client, oid, organizer))
    assert r.status_code == 200
    assert r.json()["plan_items"] == [] and r.json()["status"] == "preferences" and r.json()["message"]
    assert _items(conn, oid) == []
    assert conn.execute(sa.text("SELECT status FROM outings WHERE id = :o"), {"o": oid}).scalar() == "preferences"


def test_after_generation_joining_and_answers_are_closed(api):
    client, conn = api
    oid, code, organizer, member, _ = _ready_session(client, conn)
    client.post(f"{BASE}/{oid}/start-voting", headers=organizer, json=R(client, oid, organizer))
    r = client.post(f"{BASE}/{code}/join-guest", json={"guest_name": "متأخر"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "JOINING_CLOSED"
    r = client.put(f"{BASE}/{oid}/preferences", headers=member, json=W(client, oid, member, {}))
    assert r.status_code == 409 and r.json()["error"]["code"] == "PREFERENCES_LOCKED"


def test_the_allergy_warning_combines_everyones_without_names(api):
    client, conn = api
    oid, _, organizer, member, guest = _session(client, conn)
    client.post(f"{BASE}/{oid}/start-preferences", headers=organizer)
    for headers, allergies in ((organizer, []), (member, ["فول سوداني"]), (guest, ["روبيان", "فول سوداني"])):
        client.put(f"{BASE}/{oid}/preferences", headers=headers, json=W(client, oid, headers, {"allergies": allergies, "budget_max": 100}))
        client.post(f"{BASE}/{oid}/preferences/ready", headers=headers, json=R(client, oid, headers))
    plan = client.post(f"{BASE}/{oid}/start-voting", headers=organizer, json=R(client, oid, organizer)).json()
    assert plan["allergy_warning"] == sorted(["روبيان", "فول سوداني"])


def test_the_plan_is_not_readable_before_generation(api):
    client, conn = api
    oid, _, organizer, _, _ = _ready_session(client, conn)
    r = client.get(f"{BASE}/{oid}/plan", headers=organizer, params=R(client, oid, organizer))
    assert r.status_code == 409 and r.json()["error"]["code"] == "PLAN_NOT_READY"
    r = client.get(f"{BASE}/{oid}/plan", headers=_bearer(_add_user(conn, "غريب")), params=R(client, oid, _bearer(_add_user(conn, "غريب"))))
    assert r.status_code == 403


def test_start_voting_shows_only_when_everyone_is_ready(api):
    client, conn = api
    oid, _, organizer, member, guest = _session(client, conn)
    client.post(f"{BASE}/{oid}/start-preferences", headers=organizer)
    assert client.get(f"{BASE}/{oid}", headers=organizer).json()["actions"] == []
    for headers in (organizer, member, guest):
        client.put(f"{BASE}/{oid}/preferences", headers=headers, json=W(client, oid, headers, {}))
        client.post(f"{BASE}/{oid}/preferences/ready", headers=headers, json=R(client, oid, headers))
    assert client.get(f"{BASE}/{oid}", headers=organizer).json()["actions"] == ["start_voting"]
    assert client.get(f"{BASE}/{oid}", headers=member).json()["actions"] == []


# ---------- opening hours ----------

@pytest.mark.parametrize("summary,expected", [
    ({"open_24h": True, "days_open": 7}, {d: [(0, 1440)] for d in range(7)}),
    ({"opens": "16:00", "closes": "01:30", "open_24h": False, "days_open": 7}, {d: [(960, 1530)] for d in range(7)}),
    ({"opens": "08:00", "closes": "22:00", "open_24h": False, "days_open": 7}, {d: [(480, 1320)] for d in range(7)}),
    ({"opens": "12:00", "closes": "23:00", "open_24h": False, "days_open": 5}, None),
    ({"open_24h": False, "days_open": None}, None),
    (None, None),
    ({"opens": "late", "closes": "23:00", "days_open": 7}, None),
])
def test_hours_from_the_summary(summary, expected):
    assert hours_from_summary(summary) == expected


# ---------- a join and generation at the same moment (real transactions) ----------

def test_a_person_who_joins_during_generation_is_never_left_out(secret):  # noqa: F811
    """Someone joins while generation waits for the lock. Generation must then see them as not ready
    and refuse, instead of building a plan without them."""
    with engine.begin() as conn:
        organizer = _add_user(conn)
        oid, _ = _add_outing(conn, organizer, status="preferences")
        conn.execute(sa.text("UPDATE participants SET preferences_done = true WHERE outing_id = :o"), {"o": oid})
    try:
        holder = engine.connect()
        tx = holder.begin()
        holder.execute(sa.text("SELECT 1 FROM outings WHERE id = :o FOR UPDATE"), {"o": oid})
        result = {}

        def generate():
            result["r"] = TestClient(app).post(f"{BASE}/{oid}/start-voting", headers=_bearer(organizer), json=R(TestClient(app), oid, _bearer(organizer)))

        t = threading.Thread(target=generate)
        t.start()
        t.join(timeout=0.5)
        holder.execute(sa.text("INSERT INTO participants (id, outing_id, guest_name, attendance, preferences_done) "
                               "VALUES (:id, :o, 'نورة', 'confirmed', false)"), {"id": uuid.uuid4(), "o": oid})
        tx.commit()
        holder.close()
        t.join(timeout=10)
        assert result["r"].status_code == 409
        assert result["r"].json()["error"]["code"] == "NOT_EVERYONE_READY"
    finally:
        with engine.begin() as conn:
            conn.execute(sa.text("DELETE FROM participants WHERE outing_id = :o"), {"o": oid})
            conn.execute(sa.text("DELETE FROM outings WHERE id = :o"), {"o": oid})
            conn.execute(sa.text("DELETE FROM users WHERE id = :u"), {"u": organizer})
