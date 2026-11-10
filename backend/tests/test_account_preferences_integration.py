"""BE-07 (#63): GET and PUT /users/me/preferences on the migrated PostgreSQL test database.

text[] columns need PostgreSQL, so these run with -m integration after reset_test_db.py.
Each test makes its own users and deletes them afterwards.
"""
import uuid
from datetime import timedelta

import pytest
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.main import app
from app.services.auth.models import User
from app.services.preferences.models import Preference
from fastapi.testclient import TestClient
from sqlalchemy import delete
from tests.test_session import make_token

pytestmark = pytest.mark.integration
SECRET = "test-secret"
URL = "/api/v1/users/me/preferences"
FULL = {
    "liked_cuisines": ["saudi_gulf", "grill"],
    "allergies": ["peanuts"],
    "budget_min": 30,
    "budget_max": 100,
    "max_distance_km": 7.5,
    "seating_needs": "family seating",
}


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", SECRET)
    get_settings.cache_clear()
    made = []

    def new_user():
        uid = uuid.uuid4()
        with SessionLocal() as db:
            db.add(User(id=uid, name="BE07", phone_number="05" + uuid.uuid4().hex[:8]))
            db.commit()
        made.append(uid)
        return {"Authorization": f"Bearer {make_token(str(uid), timedelta(minutes=5), SECRET)}"}, uid

    with TestClient(app) as client:
        yield client, new_user
    with SessionLocal() as db:
        db.execute(delete(Preference).where(Preference.user_id.in_(made)))
        db.execute(delete(User).where(User.id.in_(made)))
        db.commit()
    get_settings.cache_clear()


def test_nothing_saved_returns_empty_shape(api):
    client, new_user = api
    headers, _ = new_user()
    r = client.get(URL, headers=headers)
    assert r.status_code == 200
    assert r.json() == {"is_saved": False, "liked_cuisines": [], "allergies": [], "budget_min": None,
                        "budget_max": None, "max_distance_km": None, "seating_needs": None}


def test_save_then_read_back(api):
    client, new_user = api
    headers, _ = new_user()
    r = client.put(URL, headers=headers, json=FULL)
    assert r.status_code == 200 and r.json() == {"message": "preferences saved"}
    assert client.get(URL, headers=headers).json() == {"is_saved": True, **FULL}


def test_second_save_replaces_and_keeps_one_row(api):
    client, new_user = api
    headers, uid = new_user()
    client.put(URL, headers=headers, json=FULL)
    r = client.put(URL, headers=headers, json={"liked_cuisines": ["italian"]})
    assert r.status_code == 200
    body = client.get(URL, headers=headers).json()
    assert body["liked_cuisines"] == ["italian"]
    assert body["budget_max"] is None and body["allergies"] == []    # left out = saved as empty
    with SessionLocal() as db:
        assert db.query(Preference).filter_by(user_id=uid).count() == 1


def test_empty_save_counts_as_saved(api):
    client, new_user = api
    headers, _ = new_user()
    assert client.put(URL, headers=headers, json={}).status_code == 200
    assert client.get(URL, headers=headers).json()["is_saved"] is True


def test_repeats_and_spaces_are_cleaned(api):
    client, new_user = api
    headers, _ = new_user()
    client.put(URL, headers=headers, json={"liked_cuisines": ["grill", " grill ", "italian"],
                                           "allergies": [" milk", "", "milk"], "seating_needs": "   "})
    body = client.get(URL, headers=headers).json()
    assert body["liked_cuisines"] == ["grill", "italian"]
    assert body["allergies"] == ["milk"]
    assert body["seating_needs"] is None


@pytest.mark.parametrize("bad, field", [
    ({"liked_cuisines": ["japanese"]}, "liked_cuisines"),          # dataset code, not a category key
    ({"budget_min": -1}, "budget_min"),
    ({"budget_min": 100, "budget_max": 50}, "budget_max"),
    ({"max_distance_km": 0}, "max_distance_km"),
    ({"seating_needs": "x" * 201}, "seating_needs"),
    ({"allergies": [f"item{i}" for i in range(21)]}, "allergies"),
    ({"allergies": ["x" * 51]}, "allergies"),
])
def test_invalid_values_are_rejected_and_old_values_kept(api, bad, field):
    client, new_user = api
    headers, _ = new_user()
    client.put(URL, headers=headers, json=FULL)
    r = client.put(URL, headers=headers, json=bad)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert any(f.startswith(field) for f in r.json()["error"]["fields"])
    assert client.get(URL, headers=headers).json() == {"is_saved": True, **FULL}


def test_each_account_sees_only_its_own(api):
    client, new_user = api
    a, _ = new_user()
    b, _ = new_user()
    client.put(URL, headers=a, json=FULL)
    assert client.get(URL, headers=b).json()["is_saved"] is False


def test_lists_are_stored_as_postgres_arrays(api):
    client, new_user = api
    headers, uid = new_user()
    client.put(URL, headers=headers, json=FULL)
    with SessionLocal() as db:
        assert db.query(Preference).filter_by(user_id=uid).one().liked_cuisines == ["saudi_gulf", "grill"]


@pytest.mark.parametrize("method", ["get", "put"])
def test_without_token_returns_401(api, method):
    client, _ = api
    r = client.get(URL) if method == "get" else client.put(URL, json={})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "INVALID_TOKEN"
