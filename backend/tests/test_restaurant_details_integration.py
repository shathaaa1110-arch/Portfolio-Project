"""BE-27 (#46): one restaurant's details, and the cuisine and district filters, on PostgreSQL.

Each test copies the real restaurants table (with its search column and indexes) into a scratch
schema, inside a transaction that is rolled back. Districts, outings and participants are the
migrated public tables; plan_items is a scratch copy next to the scratch restaurants, in the shape
migration 0012 gives it (one plan per round).
"""
import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import sqlalchemy as sa
from app.core.database import engine, get_db
from app.main import app
from app.services.auth.tokens import create_guest_token
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from tests.migration_ddl import PLAN_ITEMS
from tests.test_outings_join_integration import OLAYA, _add_outing, _add_user, _bearer, secret  # noqa: F401

pytestmark = pytest.mark.integration
URL = "/api/v1/restaurants"
OTHER_DISTRICT = "00100001001"  # الرائد
ALWAYS = {"opens": "00:00", "closes": "00:00", "open_24h": True, "days_open": 7}
EVENINGS = {"opens": "16:00", "closes": "01:30", "open_24h": False, "days_open": 7}
UNKNOWN = {"opens": None, "closes": None, "open_24h": False, "days_open": None}


@pytest.fixture
def api(secret):  # noqa: F811
    with engine.connect() as conn, conn.begin():
        schema = "s27_" + uuid.uuid4().hex
        conn.execute(sa.text(f"CREATE SCHEMA {schema}"))
        conn.execute(sa.text(f"SET LOCAL search_path TO {schema}, public"))
        conn.execute(sa.text("CREATE TABLE restaurants (LIKE public.restaurants INCLUDING ALL)"))
        conn.execute(sa.text(PLAN_ITEMS))
        names = dict(conn.execute(sa.text("SELECT id, name_ar FROM districts WHERE id IN (:a, :b)"),
                                  {"a": OLAYA, "b": OTHER_DISTRICT}).all())

        def add(rid, name, cuisine="saudi", district=OLAYA, quality=4.0, rating=4.5, hours=ALWAYS, **extra):
            row = {"id": rid, "name_ar": name, "name_en": f"Place {rid}", "cuisine": cuisine,
                   "district": names[district], "price_tier": 2, "rating": rating,
                   "rating_count": 120 if rating is not None else None, "quality_score": quality,
                   "spend_low": 30, "spend_high": 70, "latitude": 24.69, "longitude": 46.68,
                   "opening_hours": json.dumps(hours), "summary": f"وصف {name}",
                   "maps_url": "https://maps.example/1", "image_url": None, **extra}
            columns = ", ".join(row)
            values = ", ".join(f"CAST(:{k} AS jsonb)" if k == "opening_hours" else f":{k}" for k in row)
            conn.execute(sa.text(f"INSERT INTO restaurants ({columns}) VALUES ({values})"), row)

        add(1, "شاورما الحي", "shawarma, grill_bbq", quality=4.9)
        add(2, "بيتزا العليا", "italian, pizza", quality=4.5, hours=EVENINGS)
        add(3, "كبسة الرائد", "saudi", district=OTHER_DISTRICT, quality=4.2)
        add(4, "مشويات الرائد", "grill_bbq", district=OTHER_DISTRICT, quality=4.0)
        add(5, "مطعم جديد", "saudi", quality=None, rating=None, hours=UNKNOWN)
        app.dependency_overrides[get_db] = lambda: (yield Session(bind=conn, join_transaction_mode="create_savepoint"))
        yield TestClient(app), conn
        app.dependency_overrides.clear()
        conn.rollback()


def _ids(r):
    assert r.status_code == 200, r.text
    return [x["id"] for x in r.json()["restaurants"]]


def _code(r):
    return r.json()["error"]["code"]


def _plan(conn, outing_id, restaurant_id, reason="يناسب ذوقكم وضمن ميزانيتكم"):
    """One suggestion in the outing's current round."""
    conn.execute(sa.text("INSERT INTO plan_items (id, outing_id, round_id, restaurant_id, rank, match_score, reason, "
                         "is_winner) SELECT :id, id, current_round_id, :r, 1, 90, :why, false FROM outings WHERE id = :o"),
                 {"id": uuid.uuid4(), "o": outing_id, "r": restaurant_id, "why": reason})


# ---------- filters on the list ----------

def test_a_cuisine_category_brings_every_code_under_it(api):
    client, _ = api
    assert _ids(client.get(URL, params={"cuisine": "grill"})) == [1, 4]          # grill_bbq, alone or with others
    assert _ids(client.get(URL, params={"cuisine": "levant,italian"})) == [1, 2]  # shawarma is under levant
    assert client.get(URL, params={"cuisine": "grill"}).json()["total"] == 2


def test_a_district_filter_uses_the_ids_from_the_district_list(api):
    client, _ = api
    assert _ids(client.get(URL, params={"district_id": OTHER_DISTRICT})) == [3, 4]
    assert _ids(client.get(URL, params={"district_id": OLAYA})) == [1, 2, 5]


def test_filters_and_search_combine(api):
    client, _ = api
    assert _ids(client.get(URL, params={"cuisine": "grill", "district_id": OTHER_DISTRICT})) == [4]
    assert _ids(client.get(URL, params={"search": "الرائد", "cuisine": "saudi_gulf"})) == [3]
    r = client.get(URL, params={"cuisine": "juice", "district_id": OLAYA})
    assert _ids(r) == [] and r.json()["total"] == 0


def test_the_filtered_list_stays_bounded(api):
    client, _ = api
    r = client.get(URL, params={"district_id": OLAYA, "limit": 2, "offset": 1})
    assert _ids(r) == [2, 5] and r.json()["total"] == 3
    assert client.get(URL, params={"limit": 51}).status_code == 422


def test_unknown_categories_and_districts_are_refused(api):
    client, _ = api
    r = client.get(URL, params={"cuisine": "grill,shawarma"})                 # a dataset code, not a category
    assert r.status_code == 422 and r.json()["error"]["fields"] == ["query.cuisine"]
    r = client.get(URL, params={"district_id": "not-a-district"})
    assert r.status_code == 422 and _code(r) == "UNKNOWN_DISTRICT"


def test_empty_filters_change_nothing(api):
    client, _ = api
    assert _ids(client.get(URL, params={"cuisine": " , ", "district_id": " "})) == [1, 2, 3, 4, 5]


# ---------- details ----------

def test_details_return_everything_stored_without_a_login(api):
    client, _ = api
    r = client.get(f"{URL}/2")
    assert r.status_code == 200
    body = r.json()
    assert body == {
        "id": 2, "name_ar": "بيتزا العليا", "name_en": "Place 2", "cuisines": ["italian", "pizza"],
        "district": "العليا", "district_id": OLAYA, "price_tier": 2, "rating": 4.5, "rating_count": 120,
        "spend_low": 30, "spend_high": 70,
        "opening_hours": {"open_24h": False, "opens": "16:00", "closes": "01:30", "days_open": 7},
        "summary": "وصف بيتزا العليا", "latitude": 24.69, "longitude": 46.68,
        "maps_url": "https://maps.example/1", "image_url": None, "reason": None,
    }


def test_missing_hours_and_rating_come_back_as_null(api):
    client, _ = api
    body = client.get(f"{URL}/5").json()
    assert body["opening_hours"] is None and body["rating"] is None and body["rating_count"] is None
    always = client.get(f"{URL}/1").json()["opening_hours"]
    assert always == {"open_24h": True, "opens": None, "closes": None, "days_open": 7}


def test_an_unknown_restaurant_is_404(api):
    client, _ = api
    for rid in (999, 2_147_483_647):
        r = client.get(f"{URL}/{rid}")
        assert r.status_code == 404 and _code(r) == "RESTAURANT_NOT_FOUND"
    assert client.get(f"{URL}/0").status_code == 422
    assert client.get(f"{URL}/2147483648").status_code == 422


# ---------- the outing's reason is private ----------

def test_a_member_sees_the_outings_reason(api):
    client, conn = api
    organizer = _add_user(conn)
    oid, _ = _add_outing(conn, organizer, status="voting")
    _plan(conn, oid, 2)
    r = client.get(f"{URL}/2", params={"outing_id": str(oid)}, headers=_bearer(organizer))
    assert r.status_code == 200 and r.json()["reason"] == "يناسب ذوقكم وضمن ميزانيتكم"
    # A place that was not one of the outing's suggestions has no reason.
    assert client.get(f"{URL}/1", params={"outing_id": str(oid)}, headers=_bearer(organizer)).json()["reason"] is None


def test_a_guest_of_the_outing_sees_the_reason(api):
    client, conn = api
    oid, _ = _add_outing(conn, _add_user(conn), status="voting")
    guest = uuid.uuid4()
    conn.execute(sa.text("INSERT INTO participants (id, outing_id, guest_name, attendance, preferences_done) "
                         "VALUES (:id, :o, 'نورة', 'confirmed', true)"), {"id": guest, "o": oid})
    _plan(conn, oid, 2)
    token = create_guest_token(guest, oid, datetime.now(timezone.utc) + timedelta(hours=1))
    r = client.get(f"{URL}/2", params={"outing_id": str(oid)}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200 and r.json()["reason"]


def test_outsiders_never_see_an_outings_reason(api):
    client, conn = api
    oid, _ = _add_outing(conn, _add_user(conn), status="voting")
    _plan(conn, oid, 2)
    asked = {"outing_id": str(oid)}
    r = client.get(f"{URL}/2", params=asked)                                    # no token
    assert r.status_code == 401
    r = client.get(f"{URL}/2", params=asked, headers=_bearer(_add_user(conn, "غريب")))
    assert r.status_code == 403 and _code(r) == "NOT_A_PARTICIPANT"
    r = client.get(f"{URL}/2", params={"outing_id": str(uuid.uuid4())}, headers=_bearer(_add_user(conn, "ثاني")))
    assert r.status_code == 404 and _code(r) == "OUTING_NOT_FOUND"


def test_someone_removed_from_the_outing_loses_the_reason(api):
    client, conn = api
    organizer, member = _add_user(conn), _add_user(conn, "فهد")
    oid, _ = _add_outing(conn, organizer, status="voting")
    conn.execute(sa.text("INSERT INTO participants (id, outing_id, user_id, attendance, preferences_done) "
                         "VALUES (:id, :o, :u, 'removed', false)"), {"id": uuid.uuid4(), "o": oid, "u": member})
    _plan(conn, oid, 2)
    r = client.get(f"{URL}/2", params={"outing_id": str(oid)}, headers=_bearer(member))
    assert r.status_code == 403 and _code(r) == "REMOVED_FROM_OUTING"


def test_public_results_carry_nothing_from_outings(api):
    """Done when: private outing information is absent from public restaurant results."""
    client, conn = api
    oid, _ = _add_outing(conn, _add_user(conn), status="voting")
    _plan(conn, oid, 2, reason="سبب خاص بالقروب")
    listed = client.get(URL).text + client.get(URL, params={"search": "بيتزا"}).text
    detail = client.get(f"{URL}/2")
    assert "سبب خاص بالقروب" not in listed + detail.text and str(oid) not in listed + detail.text
    assert detail.json()["reason"] is None


def test_only_the_current_rounds_reason_is_shown(api):
    """BE-31: after a new round, the reason a place had in an earlier round is not shown as current."""
    client, conn = api
    organizer = _add_user(conn)
    oid, _ = _add_outing(conn, organizer, status="result")
    _plan(conn, oid, 2, reason="سبب الجولة الأولى")
    second = uuid.uuid4()
    conn.execute(sa.text("INSERT INTO outing_rounds (id, outing_id, number) VALUES (:r, :o, 2)"), {"r": second, "o": oid})
    conn.execute(sa.text("UPDATE outings SET current_round_id = :r, status = 'voting' WHERE id = :o"),
                 {"r": second, "o": oid})
    asked = {"outing_id": str(oid)}
    assert client.get(f"{URL}/2", params=asked, headers=_bearer(organizer)).json()["reason"] is None
    _plan(conn, oid, 2, reason="سبب الجولة الثانية")
    assert client.get(f"{URL}/2", params=asked, headers=_bearer(organizer)).json()["reason"] == "سبب الجولة الثانية"
