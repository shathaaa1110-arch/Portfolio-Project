"""BE-33 (#126): the saved-restaurants API on PostgreSQL, inside a rolled-back transaction.

restaurants and saved_restaurants come from migrations 0006 and 0007 on the test database.
"""
import uuid

import pytest
import sqlalchemy as sa
from tests.test_outings_join_integration import _add_outing, _add_user, _bearer, api, fresh_limits, secret  # noqa: F401

pytestmark = pytest.mark.integration
URL = "/api/v1/users/me/saved-restaurants"
FIRST_ID = 900_000_001  # far above the real ids, in case the test database holds restaurants


@pytest.fixture
def places(api):  # noqa: F811
    client, conn = api
    ids = []
    for i in range(3):
        rid = FIRST_ID + i
        conn.execute(sa.text(
            "INSERT INTO restaurants (id, name_ar, name_en, cuisine, district, latitude, longitude, "
            "spend_low, spend_high, price_tier, rating, maps_url) "
            "VALUES (:id, :n, :n, 'italian, pizza', 'العليا', 24.7, 46.7, 20, 60, 2, 4.5, 'https://maps')"),
            {"id": rid, "n": f"مطعم {i}"})
        ids.append(rid)
    return client, conn, ids


def _saved_order(conn, user, rid, minutes_ago):
    """Every request in a test shares one transaction and so one now(); set the save time by hand."""
    conn.execute(sa.text("UPDATE saved_restaurants SET saved_at = now() - make_interval(mins => :m) "
                         "WHERE user_id = :u AND restaurant_id = :r"), {"m": minutes_ago, "u": user, "r": rid})


def _rows(conn, user):
    return conn.execute(sa.text("SELECT restaurant_id FROM saved_restaurants WHERE user_id = :u"), {"u": user}).all()


def test_nothing_saved_is_an_empty_list(places):
    client, conn, _ = places
    me = _bearer(_add_user(conn))
    assert client.get(URL, headers=me).json() == {"restaurants": [], "total": 0, "limit": 20, "offset": 0}
    assert client.get(f"{URL}/ids", headers=me).json() == {"ids": []}


def test_saving_twice_keeps_one_record(places):
    client, conn, ids = places
    uid = _add_user(conn)
    me = _bearer(uid)
    assert client.put(f"{URL}/{ids[0]}", headers=me).status_code == 204
    assert client.put(f"{URL}/{ids[0]}", headers=me).status_code == 204
    assert len(_rows(conn, uid)) == 1
    body = client.get(URL, headers=me).json()
    assert body["total"] == 1
    card = body["restaurants"][0]
    assert card["id"] == ids[0] and card["cuisines"] == ["italian", "pizza"]
    assert set(card) == {"id", "name_ar", "name_en", "cuisines", "district", "price_tier", "rating", "maps_url", "image_url"}


def test_the_newest_save_comes_first_and_pages_work(places):
    client, conn, ids = places
    uid = _add_user(conn)
    me = _bearer(uid)
    for minutes, rid in zip((30, 10, 20), ids):
        client.put(f"{URL}/{rid}", headers=me)
        _saved_order(conn, uid, rid, minutes)
    newest_first = [ids[1], ids[2], ids[0]]
    assert [r["id"] for r in client.get(URL, headers=me).json()["restaurants"]] == newest_first
    assert client.get(f"{URL}/ids", headers=me).json() == {"ids": newest_first}
    page = client.get(URL, params={"limit": 2, "offset": 2}, headers=me).json()
    assert [r["id"] for r in page["restaurants"]] == [ids[0]] and page["total"] == 3
    assert page["limit"] == 2 and page["offset"] == 2


def test_removing_shows_after_reload_and_is_safe_to_repeat(places):
    client, conn, ids = places
    uid = _add_user(conn)
    me = _bearer(uid)
    client.put(f"{URL}/{ids[0]}", headers=me)
    client.put(f"{URL}/{ids[1]}", headers=me)
    assert client.delete(f"{URL}/{ids[0]}", headers=me).status_code == 204
    assert client.delete(f"{URL}/{ids[0]}", headers=me).status_code == 204  # not saved any more: still fine
    assert client.get(f"{URL}/ids", headers=me).json() == {"ids": [ids[1]]}


def test_another_account_cannot_read_or_change_these_saves(places):
    client, conn, ids = places
    owner, other = _add_user(conn), _add_user(conn, "غيره")
    client.put(f"{URL}/{ids[0]}", headers=_bearer(owner))
    assert client.get(URL, headers=_bearer(other)).json() == {"restaurants": [], "total": 0, "limit": 20, "offset": 0}
    assert client.get(f"{URL}/ids", headers=_bearer(other)).json() == {"ids": []}
    assert client.delete(f"{URL}/{ids[0]}", headers=_bearer(other)).status_code == 204  # removes nothing of the owner
    assert _rows(conn, owner) == [(ids[0],)]


def test_saves_survive_a_new_login(places):
    client, conn, ids = places
    uid = _add_user(conn)
    client.put(f"{URL}/{ids[0]}", headers=_bearer(uid))
    assert client.get(f"{URL}/ids", headers=_bearer(uid)).json() == {"ids": [ids[0]]}  # a fresh token, same account


def test_an_unknown_restaurant_is_reported(places):
    client, conn, _ = places
    me = _bearer(_add_user(conn))
    r = client.put(f"{URL}/{FIRST_ID + 99}", headers=me)
    assert r.status_code == 404 and r.json()["error"]["code"] == "RESTAURANT_NOT_FOUND"


@pytest.mark.parametrize("path,params", [
    ("", {"limit": 0}), ("", {"limit": 51}), ("", {"offset": -1}),
    ("/0", None), ("/abc", None), ("/2147483648", None),
])
def test_bad_input_is_rejected(places, path, params):
    client, conn, _ = places
    me = _bearer(_add_user(conn))
    method = client.get if path == "" else client.put
    r = method(f"{URL}{path}", headers=me, params=params) if params else method(f"{URL}{path}", headers=me)
    assert r.status_code == 422


def test_only_a_signed_in_account_can_use_it(places):
    client, conn, ids = places
    assert client.get(URL).status_code == 401
    assert client.put(f"{URL}/{ids[0]}").status_code == 401
    _, code = _add_outing(conn, _add_user(conn))
    guest = client.post(f"/api/v1/outings/{code}/join-guest", json={"guest_name": "نورة"}).json()["guest_token"]
    assert client.get(URL, headers={"Authorization": f"Bearer {guest}"}).status_code == 401
    assert client.put(f"{URL}/{ids[0]}", headers={"Authorization": f"Bearer {guest}"}).status_code == 401
