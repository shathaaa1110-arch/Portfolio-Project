"""BE-08 (#17): POST /outings/session and GET /districts, with migration 0005.

Two kinds of tests:
  - "api" ones run on the migrated test database (thouq_test after reset_test_db.py),
    inside a transaction that is rolled back;
  - "draft" ones rebuild the hand-made Neon tables in a scratch schema and check that
    0005 converts them and adds the rules without losing anything.
"""
import importlib.util
import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.core.config import get_settings
from app.core.database import engine, get_db
from app.main import app
from app.services.outings import codes, router as outings_router
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from tests.test_session import make_token

pytestmark = pytest.mark.integration
SECRET = "test-secret"
URL = "/api/v1/outings/session"
ROOT = Path(__file__).resolve().parents[2]
OLAYA = "00100001141"


def _revision(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "database/migrations/versions" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _later(**delta):
    return (datetime.now(timezone(timedelta(hours=3))) + timedelta(**delta)).isoformat()


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", SECRET)
    monkeypatch.setenv("INVITE_BASE_URL", "https://thouq.example/join/")
    get_settings.cache_clear()
    with engine.connect() as conn, conn.begin():
        def user(name="BE08"):
            uid = uuid.uuid4()
            conn.execute(sa.text("INSERT INTO users (id, name, phone_number, created_at) "
                                 "VALUES (:id, :name, :phone, CURRENT_TIMESTAMP)"),
                         {"id": uid, "name": name, "phone": uid.hex[:10]})
            return uid, {"Authorization": f"Bearer {make_token(str(uid), timedelta(minutes=5), SECRET)}"}

        app.dependency_overrides[get_db] = lambda: (yield Session(bind=conn, join_transaction_mode="create_savepoint"))
        yield TestClient(app), user, conn
        app.dependency_overrides.clear()
        conn.rollback()
    get_settings.cache_clear()


def _create(client, headers, **overrides):
    body = {"name": "عشاء الخميس", "starts_at": _later(days=1), "district": OLAYA, **overrides}
    return client.post(URL, headers=headers, json=body)


# ---------- POST /outings/session ----------

def test_create_stores_one_outing_and_its_organizer(api):
    client, user, conn = api
    uid, headers = user()
    r = _create(client, headers)
    assert r.status_code == 201
    body = r.json()
    assert set(body) == {"outing_id", "invite_code", "invite_url", "status"}
    assert body["status"] == "invite"
    assert len(body["invite_code"]) == 4 and set(body["invite_code"]) <= set(codes.ALPHABET)
    assert body["invite_url"] == f"https://thouq.example/join/{body['invite_code']}"

    outing = conn.execute(sa.text("SELECT * FROM outings WHERE id = :id"), {"id": body["outing_id"]}).mappings().one()
    assert (outing["organizer_id"], outing["group_id"], outing["district"]) == (uid, None, OLAYA)
    people = conn.execute(sa.text("SELECT user_id, attendance, preferences_done FROM participants "
                                  "WHERE outing_id = :id"), {"id": body["outing_id"]}).all()
    assert people == [(uid, "confirmed", False)]               # exactly one organizer


def test_start_time_keeps_its_moment(api):
    client, user, conn = api
    _, headers = user()
    starts = "2030-01-01T20:00:00+03:00"
    body = _create(client, headers, starts_at=starts)
    assert body.status_code == 422                             # beyond 60 days
    soon = (datetime.now(timezone.utc) + timedelta(days=2)).replace(microsecond=0)
    local = soon.astimezone(timezone(timedelta(hours=3))).isoformat()
    outing_id = _create(client, headers, starts_at=local).json()["outing_id"]
    stored = conn.execute(sa.text("SELECT starts_at FROM outings WHERE id = :id"), {"id": outing_id}).scalar_one()
    assert stored == soon                                      # same instant, whatever the offset


@pytest.mark.parametrize("starts_at", [
    "2020-01-01T20:00:00+03:00",          # passed
    "2026-12-01T20:00:00",                # no time zone
])
def test_invalid_start_time_is_rejected(api, starts_at):
    client, user, _ = api
    _, headers = user()
    r = _create(client, headers, starts_at=starts_at)
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_START_TIME"


def test_unknown_district_is_rejected(api):
    client, user, conn = api
    _, headers = user()
    r = _create(client, headers, district="nowhere")
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNKNOWN_DISTRICT"
    assert conn.execute(sa.text("SELECT count(*) FROM outings WHERE name = 'عشاء الخميس'")).scalar_one() == 0


@pytest.mark.parametrize("bad", [{"name": "   "}, {"name": "x" * 61}, {"starts_at": "tomorrow"}])
def test_bad_fields_return_validation_error(api, bad):
    client, user, _ = api
    _, headers = user()
    r = _create(client, headers, **bad)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_requires_login(api):
    client, _, _ = api
    assert _create(client, {}).status_code == 401


def test_taken_code_is_retried(api, monkeypatch):
    client, user, _ = api
    _, headers = user()
    first = _create(client, headers).json()["invite_code"]
    tries = iter([first, first, "ZZZZ"])                       # the open code is taken twice, then free
    monkeypatch.setattr(outings_router, "new_code", lambda: next(tries))
    r = _create(client, headers)
    assert r.status_code == 201 and r.json()["invite_code"] == "ZZZZ"


def test_no_free_code_gives_a_clear_error(api, monkeypatch):
    client, user, _ = api
    _, headers = user()
    taken = _create(client, headers).json()["invite_code"]
    monkeypatch.setattr(outings_router, "new_code", lambda: taken)
    r = _create(client, headers)
    assert r.status_code == 503 and r.json()["error"]["code"] == "INVITE_CODE_UNAVAILABLE"


def test_without_invite_base_url_the_link_is_null(api, monkeypatch):
    client, user, _ = api
    monkeypatch.setenv("INVITE_BASE_URL", "")
    get_settings.cache_clear()
    _, headers = user()
    assert _create(client, headers).json()["invite_url"] is None


# ---------- database rules from 0005 ----------

def test_a_code_belongs_to_its_outing_until_it_is_released(api):
    """0012: a finished outing keeps its code (a retry reuses the link) until the code is released."""
    _, user, conn = api
    uid, _ = user()
    insert = sa.text("INSERT INTO outings (id, organizer_id, name, status, invite_code, starts_at, district, created_at) "
                     "VALUES (:id, :u, 'x', :status, 'ABCD', now(), :d, now())")
    finished = uuid.uuid4()
    conn.execute(insert, {"id": finished, "u": uid, "status": "result", "d": OLAYA})
    with pytest.raises(sa.exc.IntegrityError), conn.begin_nested():
        conn.execute(insert, {"id": uuid.uuid4(), "u": uid, "status": "invite", "d": OLAYA})
    conn.execute(sa.text("UPDATE outings SET code_released_at = now() WHERE id = :id"), {"id": finished})
    conn.execute(insert, {"id": uuid.uuid4(), "u": uid, "status": "invite", "d": OLAYA})   # reuse once released
    with pytest.raises(sa.exc.IntegrityError), conn.begin_nested():
        conn.execute(insert, {"id": uuid.uuid4(), "u": uid, "status": "voting", "d": OLAYA})
    with pytest.raises(sa.exc.IntegrityError), conn.begin_nested():   # only a finished outing gives its code up
        conn.execute(sa.text("UPDATE outings SET code_released_at = now() WHERE status = 'invite'"))


@pytest.mark.parametrize("column, value", [("status", "done"), ("invite_code", "abcd"), ("invite_code", "ABCDE")])
def test_outing_values_are_checked(api, column, value):
    _, user, conn = api
    uid, _ = user()
    row = {"status": "invite", "invite_code": "WXYZ", column: value}
    with pytest.raises(sa.exc.IntegrityError), conn.begin_nested():
        conn.execute(sa.text("INSERT INTO outings (id, organizer_id, name, status, invite_code, starts_at, district, "
                             "created_at) VALUES (:id, :u, 'x', :status, :invite_code, now(), 'd', now())"),
                     {"id": uuid.uuid4(), "u": uid, **row})


# ---------- GET /districts ----------

def test_districts_are_loaded_and_listed(api):
    client, _, _ = api
    seed = json.loads((ROOT / "database/seed/riyadh_districts.json").read_text(encoding="utf-8"))["districts"]
    body = client.get("/api/v1/districts").json()["districts"]
    assert len(body) == len(seed) == 171
    olaya = next(d for d in body if d["id"] == OLAYA)
    assert olaya == {"id": OLAYA, "name_ar": "العليا", "name_en": "Al Olaya"}
    assert body == sorted(body, key=lambda d: (d["name_ar"], d["id"]))


def test_district_without_english_name_leaves_the_field_out():
    from app.services.restaurants import districts
    row = type("Row", (), {"id": "x1", "name_ar": "حي", "name_en": None})
    assert districts._district(row) == {"id": "x1", "name_ar": "حي"}


# ---------- 0005 on the hand-made draft tables (as on Neon) ----------

DRAFT = """
CREATE TABLE groups (id uuid PRIMARY KEY, name TEXT NOT NULL, organizer_id uuid NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL);
CREATE TABLE group_members (group_id uuid NOT NULL REFERENCES groups(id), user_id uuid NOT NULL REFERENCES users(id),
    joined_at TIMESTAMP NOT NULL, PRIMARY KEY (group_id, user_id));
CREATE TABLE outings (id uuid PRIMARY KEY, group_id uuid REFERENCES groups(id),
    organizer_id uuid NOT NULL REFERENCES users(id), name TEXT NOT NULL, status TEXT NOT NULL,
    invite_code TEXT NOT NULL, starts_at TIMESTAMP NOT NULL, district TEXT NOT NULL,
    tiebreak_ends_at TIMESTAMP, created_at TIMESTAMP NOT NULL);
CREATE TABLE participants (id uuid PRIMARY KEY, outing_id uuid NOT NULL REFERENCES outings(id), user_id uuid,
    guest_name TEXT, attendance TEXT NOT NULL, preferences_done BOOLEAN NOT NULL,
    CHECK ((user_id IS NULL) <> (guest_name IS NULL)),
    CONSTRAINT participants_outing_user_unique UNIQUE (outing_id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id));
"""


@pytest.fixture
def draft():
    with engine.connect() as conn, conn.begin():
        schema = "be08_" + uuid.uuid4().hex
        conn.execute(sa.text(f"CREATE SCHEMA {schema}"))
        conn.execute(sa.text(f"SET LOCAL search_path TO {schema}"))
        with Operations.context(MigrationContext.configure(conn)):
            _revision("0002_account_keys_and_phone").upgrade()
            _revision("0003_account_preferences").upgrade()
        conn.execute(sa.text(DRAFT))

        def migrate():
            with Operations.context(MigrationContext.configure(conn)):
                _revision("0005_outings_and_districts").upgrade()

        yield conn, migrate
        conn.rollback()


def test_draft_times_become_timestamptz_without_moving(draft):
    conn, migrate = draft
    uid = uuid.uuid4()
    conn.execute(sa.text("INSERT INTO users VALUES (:id, 'u', '0500000000', NULL, now())"), {"id": uid})
    conn.execute(sa.text("INSERT INTO outings (id, organizer_id, name, status, invite_code, starts_at, district, "
                         "created_at) VALUES (gen_random_uuid(), :u, 'x', 'invite', 'ABCD', "
                         "'2026-11-05 17:00:00', 'd', '2026-11-04 10:00:00')"), {"u": uid})
    migrate()
    types = dict(conn.execute(sa.text(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() "
        "AND table_name = 'outings' AND column_name IN ('starts_at', 'tiebreak_ends_at', 'created_at')")).all())
    assert set(types.values()) == {"timestamp with time zone"}
    starts = conn.execute(sa.text("SELECT starts_at FROM outings")).scalar_one()
    assert starts == datetime(2026, 11, 5, 17, 0, tzinfo=timezone.utc)   # the stored UTC value, unchanged


def test_draft_rows_that_break_a_rule_stop_the_migration(draft):
    conn, migrate = draft
    uid = uuid.uuid4()
    conn.execute(sa.text("INSERT INTO users VALUES (:id, 'u', '0500000001', NULL, now())"), {"id": uid})
    conn.execute(sa.text("INSERT INTO outings (id, organizer_id, name, status, invite_code, starts_at, district, "
                         "created_at) VALUES (gen_random_uuid(), :u, 'x', 'finished', 'ABCD', now(), 'd', now())"),
                 {"u": uid})
    with pytest.raises(sa.exc.IntegrityError), conn.begin_nested():
        migrate()


def test_clean_install_gives_preferences_a_participant_owner(draft):
    conn, migrate = draft
    migrate()
    rules = {r[0] for r in conn.execute(sa.text(
        "SELECT conname FROM pg_constraint WHERE conrelid = 'preferences'::regclass"))}
    assert {"preferences_participant_id_fkey", "preferences_participant_unique",
            "preferences_exactly_one_owner"} <= rules
