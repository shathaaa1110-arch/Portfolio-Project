"""BE-28 (#48): GET /users/me/recommendations on PostgreSQL.

restaurants is not created by any migration yet (it was made by hand on Neon), so each test builds a
small copy in a scratch schema inside a rolled-back transaction, like the BE-17 tests. The engine's
rules are covered by test_recommendation_engine.py; these tests cover loading, location and the reply.
"""
import json
from datetime import datetime

import pytest
import sqlalchemy as sa
from app.core.database import engine, get_db
from app.main import app
from app.services.plan import personal
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from tests.test_outing_state_integration import secret  # noqa: F401
from tests.test_outings_join_integration import BASE as OUTINGS, _add_outing, _add_user, _bearer, fresh_limits  # noqa: F401

pytestmark = pytest.mark.integration
URL = "/api/v1/users/me/recommendations"
PREFS = "/api/v1/users/me/preferences"
DISTRICT = "00100001141"
ALWAYS = {"open_24h": True, "days_open": 7}
NOON_TO_ELEVEN = {"opens": "12:00", "closes": "23:00", "open_24h": False, "days_open": 7}
CLOSED_AT_EIGHT = {"opens": "06:00", "closes": "18:00", "open_24h": False, "days_open": 7}
SOME_DAYS = {"opens": "12:00", "closes": "23:00", "open_24h": False, "days_open": 5}
KM = 1 / 111

SCHEMA = """
CREATE TABLE restaurants (
    id integer PRIMARY KEY, name_ar text, name_en text, brand_id integer, cuisine text, district text,
    latitude numeric, longitude numeric, spend_low integer, spend_high integer, price_tier smallint,
    rating numeric, quality_score numeric, opening_hours jsonb, maps_url text, venue_type text, flags text)
"""


@pytest.fixture
def api(secret, monkeypatch):  # noqa: F811
    monkeypatch.setattr(personal, "_now", lambda: datetime(2026, 11, 2, 20, 0))  # Monday, 8 pm Riyadh
    with engine.connect() as conn, conn.begin():
        conn.execute(sa.text("CREATE SCHEMA personal_test"))
        conn.execute(sa.text("SET LOCAL search_path TO personal_test, public"))
        conn.execute(sa.text(SCHEMA))
        lat, lon = map(float, conn.execute(
            sa.text("SELECT latitude, longitude FROM districts WHERE id = :d"), {"d": DISTRICT}).one())

        def add(rid, cuisine, low=20, high=60, hours=ALWAYS, km=1.0, venue=None, flags=None, quality=4.0):
            conn.execute(sa.text(
                "INSERT INTO restaurants (id, name_ar, name_en, brand_id, cuisine, district, latitude, longitude, "
                "spend_low, spend_high, price_tier, rating, quality_score, opening_hours, maps_url, venue_type, flags) "
                "VALUES (:id, :n, :n, :id, :c, 'العليا', :lat, :lon, :lo, :hi, 2, 4.5, :q, CAST(:h AS jsonb), "
                "'https://maps', :v, :f)"),
                {"id": rid, "n": f"مطعم {rid}", "c": cuisine, "lat": lat + km * KM, "lon": lon,
                 "lo": low, "hi": high, "q": quality, "h": json.dumps(hours), "v": venue, "f": flags})

        add(1, "italian, pizza", quality=4.8)
        add(2, "saudi", quality=4.6)
        add(3, "burgers", quality=4.4, hours=NOON_TO_ELEVEN)
        add(4, "indian", quality=4.2)
        add(5, "chinese", quality=4.0, km=20)                       # far: outside a 5 km limit
        add(6, "italian", quality=4.9, hours=CLOSED_AT_EIGHT)       # closed at 8 pm
        add(7, "italian", quality=4.9, hours=SOME_DAYS)             # unknown days: never suggested (D04)
        add(8, "italian", quality=4.9, venue="cloud_kitchen")       # not a place to sit
        add(9, "italian", quality=4.9, flags="duplicate_listing")
        add(10, "italian", quality=4.9, low=300, high=500)          # outside the budget below
        app.dependency_overrides[get_db] = lambda: (yield Session(bind=conn, join_transaction_mode="create_savepoint"))
        yield TestClient(app), conn, (lat, lon)
        app.dependency_overrides.clear()
        conn.rollback()


def _user(client, conn, prefs=None):
    headers = _bearer(_add_user(conn))
    if prefs is not None:
        assert client.put(PREFS, headers=headers, json=prefs).status_code == 200
    return headers


def _ids(r):
    return [x["id"] for x in r.json()["restaurants"]]


# ---------- what comes back ----------

def test_without_saved_answers_the_best_open_places_come_first(api):
    client, conn, _ = api
    r = client.get(URL, headers=_user(client, conn))
    assert r.status_code == 200
    ids = _ids(r)
    assert ids == [10, 1, 2, 3, 4, 5]  # by quality; no budget saved, so 10 is in
    assert not set(ids) & {6, 7, 8, 9}  # closed now, unknown days, excluded venue, excluded flag
    card = r.json()["restaurants"][1]
    assert card["name_ar"] == "مطعم 1" and card["cuisines"] == ["italian", "pizza"]
    assert {"district", "price_tier", "rating", "maps_url", "spend_low", "spend_high"} <= card.keys()
    assert 0 <= card["match_score"] <= 100 and card["reason"]
    assert card["distance_km"] is None  # no location sent


def test_saved_answers_shape_the_list_and_a_district_gives_distances(api):
    client, conn, _ = api
    headers = _user(client, conn, {"liked_cuisines": ["italian"], "budget_max": 100})
    r = client.get(URL, params={"district_id": DISTRICT}, headers=headers)
    assert r.status_code == 200
    ids = _ids(r)
    assert ids[0] == 1 and 10 not in ids  # the liked cuisine first; over budget never
    assert all(x["distance_km"] is not None and x["distance_km"] >= 0 for x in r.json()["restaurants"])


def test_coordinates_keep_the_distance_limit(api):
    client, conn, (lat, lon) = api
    headers = _user(client, conn, {"max_distance_km": 5})
    r = client.get(URL, params={"lat": lat, "lon": lon}, headers=headers)
    assert r.status_code == 200
    assert 5 not in _ids(r) and _ids(r)
    assert all(x["distance_km"] <= 5 for x in r.json()["restaurants"])


def test_limit_is_respected_and_bounded(api):
    client, conn, _ = api
    headers = _user(client, conn)
    assert len(_ids(client.get(URL, params={"limit": 2}, headers=headers))) == 2
    assert client.get(URL, params={"limit": 21}, headers=headers).status_code == 422
    assert client.get(URL, params={"limit": 0}, headers=headers).status_code == 422


def test_no_match_is_an_empty_list_not_an_error(api):
    client, conn, _ = api
    r = client.get(URL, headers=_user(client, conn, {"budget_max": 5}))
    assert r.status_code == 200 and r.json() == {"restaurants": []}


def test_nothing_is_saved(api):
    client, conn, _ = api
    before = conn.execute(sa.text("SELECT count(*) FROM preferences")).scalar_one()
    client.get(URL, headers=_user(client, conn))
    assert conn.execute(sa.text("SELECT count(*) FROM preferences")).scalar_one() == before


def test_a_place_without_coordinates_is_left_out(api):
    client, conn, _ = api
    # Since 0008 coordinates may be missing; such a place cannot be measured, so it is never suggested.
    conn.execute(sa.text(
        "INSERT INTO restaurants (id, name_ar, cuisine, spend_low, spend_high, quality_score, opening_hours) "
        "VALUES (11, 'بلا موقع', 'italian', 20, 60, 5.0, CAST(:h AS jsonb))"), {"h": json.dumps(ALWAYS)})
    r = client.get(URL, params={"district_id": DISTRICT}, headers=_user(client, conn))
    assert r.status_code == 200 and 11 not in _ids(r)


# ---------- location errors ----------

def test_a_distance_limit_without_a_location_asks_for_one(api):
    client, conn, _ = api
    r = client.get(URL, headers=_user(client, conn, {"max_distance_km": 5}))
    assert r.status_code == 422 and r.json()["error"]["code"] == "LOCATION_REQUIRED"


def test_an_unknown_district_is_reported(api):
    client, conn, _ = api
    r = client.get(URL, params={"district_id": "nope"}, headers=_user(client, conn))
    assert r.status_code == 404 and r.json()["error"]["code"] == "DISTRICT_NOT_FOUND"


def test_half_a_coordinate_is_rejected(api):
    client, conn, (lat, _) = api
    assert client.get(URL, params={"lat": lat}, headers=_user(client, conn)).status_code == 422
    assert client.get(URL, params={"lat": 91, "lon": 46}, headers=_user(client, conn)).status_code == 422


# ---------- who can ask ----------

def test_only_a_signed_in_account_can_ask(api):
    client, conn, _ = api
    assert client.get(URL).status_code == 401
    assert client.get(URL, headers={"Authorization": "Bearer nonsense"}).status_code == 401
    # A guest pass belongs to one outing, not to an account.
    _, code = _add_outing(conn, _add_user(conn))
    guest = client.post(f"{OUTINGS}/{code}/join-guest", json={"guest_name": "نورة"}).json()
    assert client.get(URL, headers={"Authorization": f"Bearer {guest['guest_token']}"}).status_code == 401
