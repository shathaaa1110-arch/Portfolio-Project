"""DB-15 acceptance on disposable PostgreSQL; each schema rolls back."""
import importlib.util
from pathlib import Path
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.core.database import engine

pytestmark = pytest.mark.integration
VERSIONS = Path(__file__).resolve().parents[2] / "database/migrations/versions"
SCHEMA = VERSIONS.parents[1] / "schema.sql"


def revision(name):
    spec = importlib.util.spec_from_file_location(name, VERSIONS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def migrate(conn, name="0006_saved_restaurants"):
    with Operations.context(MigrationContext.configure(conn)):
        revision(name).upgrade()


@pytest.fixture
def conn():
    with engine.connect() as connection, connection.begin():
        schema = "db15_" + uuid4().hex
        connection.execute(sa.text(f"CREATE SCHEMA {schema}"))
        # Do not accidentally resolve fixture tables from public.
        connection.execute(sa.text(f"SET LOCAL search_path TO {schema}"))
        migrate(connection, "0002_account_keys_and_phone")
        yield connection
        connection.rollback()


def create_restaurants(conn):
    source = SCHEMA.read_text()
    start = source.index("CREATE TABLE IF NOT EXISTS restaurants (")
    conn.execute(sa.text(source[start:source.index(";", start) + 1]))


def user(conn):
    uid = uuid4()
    conn.execute(sa.text("INSERT INTO users (id,name,phone_number,created_at) "
                         "VALUES (:id,'DB15',:phone,CURRENT_TIMESTAMP)"),
                 {"id": uid, "phone": str(uid)})
    return uid


def restaurant(conn, rid=1):
    conn.execute(sa.text("""INSERT INTO restaurants
        (id,name_ar,name_en,cuisine,district,latitude,longitude,spend_low,spend_high,price_tier,maps_url)
        VALUES (:id,'مطعم الأصالة','Al Asalah','saudi','العليا',24.7,46.7,20,40,1,'https://example.com')"""),
                 {"id": rid})
    return rid


def save(conn, uid, rid):
    conn.execute(sa.text("INSERT INTO saved_restaurants (user_id,restaurant_id) VALUES (:uid,:rid)"),
                 {"uid": uid, "rid": rid})


@pytest.fixture
def ready(conn):
    create_restaurants(conn)
    migrate(conn)
    return conn, user(conn), restaurant(conn)


def test_keys_types_and_indexes(ready):
    conn, _, _ = ready
    inspector = sa.inspect(conn)
    columns = {c["name"]: c for c in inspector.get_columns("saved_restaurants")}
    assert set(columns) == {"user_id", "restaurant_id"}
    assert isinstance(columns["user_id"]["type"], sa.Uuid)
    assert str(columns["restaurant_id"]["type"]) == "INTEGER"
    assert all(not c["nullable"] for c in columns.values())
    assert inspector.get_pk_constraint("saved_restaurants")["constrained_columns"] == ["user_id", "restaurant_id"]
    fks = inspector.get_foreign_keys("saved_restaurants")
    assert {(f["referred_table"], tuple(f["referred_columns"]), f["options"]["ondelete"]) for f in fks} == {
        ("users", ("id",), "RESTRICT"), ("restaurants", ("id",), "RESTRICT")}
    assert any(i["column_names"] == ["restaurant_id"] for i in inspector.get_indexes("saved_restaurants"))


def test_duplicate_pair_rejected_but_distinct_pairs_allowed(ready):
    conn, uid, rid = ready
    save(conn, uid, rid)
    with pytest.raises(sa.exc.IntegrityError) as error, conn.begin_nested():
        save(conn, uid, rid)
    assert error.value.orig.sqlstate == "23505"
    assert error.value.orig.diag.constraint_name == "saved_restaurants_pkey"
    save(conn, user(conn), rid)
    save(conn, uid, restaurant(conn, 2))
    conn.execute(sa.text("INSERT INTO saved_restaurants VALUES (:uid,:rid) "
                         "ON CONFLICT (user_id,restaurant_id) DO NOTHING"), {"uid": uid, "rid": rid})
    assert conn.execute(sa.text("SELECT count(*) FROM saved_restaurants")).scalar_one() == 3


@pytest.mark.parametrize("invalid", ["user", "restaurant", "null_user", "null_restaurant"])
def test_invalid_references_rejected(ready, invalid):
    conn, uid, rid = ready
    save(conn, uid, rid)
    bad_uid = uuid4() if invalid == "user" else None if invalid == "null_user" else uid
    bad_rid = 999 if invalid == "restaurant" else None if invalid == "null_restaurant" else rid
    with pytest.raises(sa.exc.IntegrityError) as error, conn.begin_nested():
        save(conn, bad_uid, bad_rid)
    assert error.value.orig.sqlstate == ("23502" if invalid.startswith("null") else "23503")
    assert conn.execute(sa.text("SELECT user_id,restaurant_id FROM saved_restaurants")).one() == (uid, rid)


@pytest.mark.parametrize("parent", ["users", "restaurants"])
def test_parent_delete_restricted_until_explicit_unsave(ready, parent):
    conn, uid, rid = ready
    other_uid, other_rid = user(conn), restaurant(conn, 2)
    save(conn, uid, rid)
    save(conn, other_uid, other_rid)
    target = uid if parent == "users" else rid
    with pytest.raises(sa.exc.IntegrityError) as error, conn.begin_nested():
        conn.execute(sa.text(f"DELETE FROM {parent} WHERE id=:id"), {"id": target})
    assert error.value.orig.sqlstate == "23001"  # PostgreSQL 18 restrict_violation
    conn.execute(sa.text("DELETE FROM saved_restaurants WHERE user_id=:uid AND restaurant_id=:rid"),
                 {"uid": uid, "rid": rid})
    assert conn.execute(sa.text("SELECT count(*) FROM users")).scalar_one() == 2
    assert conn.execute(sa.text("SELECT count(*) FROM restaurants")).scalar_one() == 2
    conn.execute(sa.text(f"DELETE FROM {parent} WHERE id=:id"), {"id": target})
    assert conn.execute(sa.text("SELECT user_id,restaurant_id FROM saved_restaurants")).one() == (other_uid, other_rid)


def test_populated_upgrade_preserves_parents(conn):
    create_restaurants(conn)
    user(conn)
    restaurant(conn)
    before = {t: conn.execute(sa.text(f"SELECT * FROM {t}")).all() for t in ("users", "restaurants")}
    columns = sa.inspect(conn).get_columns("restaurants")
    migrate(conn)
    assert {t: conn.execute(sa.text(f"SELECT * FROM {t}")).all() for t in before} == before
    assert [c["name"] for c in sa.inspect(conn).get_columns("restaurants")] == [c["name"] for c in columns]


def test_clean_upgrade_restores_skipped_search(conn):
    migration = revision("0006_saved_restaurants")
    # pg_trgm remains in public, outside this fixture's table search path.
    migrate(conn)
    uid = user(conn)
    rid = restaurant(conn)
    save(conn, uid, rid)
    assert conn.execute(sa.text("SELECT search_text FROM restaurants")).scalar_one() == "مطعم الاصاله al asalah"
    indexes = {i["name"] for i in sa.inspect(conn).get_indexes("restaurants")}
    assert {"ix_restaurants_search_text", "ix_restaurants_cuisine_codes"} <= indexes
    assert migration.NORMALIZE_SQL == revision("0004_restaurant_search").NORMALIZE_SQL
    assert migration.CUISINE_CODES == revision("0004_restaurant_search").CUISINE_CODES


@pytest.mark.parametrize("parent,definition", [
    ("users", "id TEXT PRIMARY KEY"),
    ("restaurants", "id BIGINT PRIMARY KEY"),
    ("restaurants", "id INTEGER"),
])
def test_incompatible_parent_fails_without_repair(conn, parent, definition):
    if parent == "users":
        conn.execute(sa.text("DROP TABLE users"))
    conn.execute(sa.text(f"CREATE TABLE {parent} ({definition})"))
    with pytest.raises(RuntimeError, match="DB-15 requires"), conn.begin_nested():
        migrate(conn)
    assert not sa.inspect(conn).has_table("saved_restaurants")
    assert sa.inspect(conn).has_table(parent)


def test_unexpected_saved_table_preserved(conn):
    conn.execute(sa.text("CREATE TABLE saved_restaurants (note TEXT)"))
    conn.execute(sa.text("INSERT INTO saved_restaurants VALUES ('keep')"))
    with pytest.raises(RuntimeError, match="unexpected saved_restaurants"), conn.begin_nested():
        migrate(conn)
    assert conn.execute(sa.text("SELECT note FROM saved_restaurants")).scalar_one() == "keep"


def test_failed_upgrade_rolls_back_created_objects(conn, monkeypatch):
    create_restaurants(conn)
    uid, rid = user(conn), restaurant(conn)
    original = Operations.create_index

    def fail_index(self, name, *args, **kwargs):
        if name == "ix_saved_restaurants_restaurant_id":
            raise RuntimeError("simulated DDL failure")
        return original(self, name, *args, **kwargs)

    monkeypatch.setattr(Operations, "create_index", fail_index)
    with pytest.raises(RuntimeError, match="simulated"), conn.begin_nested():
        migrate(conn)
    assert not sa.inspect(conn).has_table("saved_restaurants")
    assert conn.execute(sa.text("SELECT id FROM users")).scalar_one() == uid
    assert conn.execute(sa.text("SELECT id FROM restaurants")).scalar_one() == rid


def test_downgrade_refused_without_losing_saves(ready):
    conn, uid, rid = ready
    save(conn, uid, rid)
    with pytest.raises(RuntimeError, match="downgrade refused"):
        revision("0006_saved_restaurants").downgrade()
    assert conn.execute(sa.text("SELECT user_id,restaurant_id FROM saved_restaurants")).one() == (uid, rid)


def test_missing_account_prerequisite_fails_before_creating_restaurants(conn):
    conn.execute(sa.text("DROP TABLE users"))
    with pytest.raises(RuntimeError, match="requires users"), conn.begin_nested():
        migrate(conn)
    assert not sa.inspect(conn).has_table("restaurants")
    assert not sa.inspect(conn).has_table("saved_restaurants")


def test_committed_save_survives_a_new_connection():
    # Public tables here belong only to the approved disposable test database.
    uid = None
    rid = -int(uuid4().hex[:7], 16) - 1
    try:
        with engine.begin() as conn:
            uid = user(conn)
            restaurant(conn, rid)
            save(conn, uid, rid)
        with engine.connect() as conn:
            assert conn.execute(sa.text("SELECT restaurant_id FROM saved_restaurants WHERE user_id=:uid"),
                                {"uid": uid}).scalar_one() == rid
            assert conn.execute(sa.text("SELECT count(*) FROM saved_restaurants WHERE user_id=:other"),
                                {"other": uuid4()}).scalar_one() == 0
    finally:
        with engine.begin() as conn:
            conn.execute(sa.text("DELETE FROM saved_restaurants WHERE user_id=:uid"), {"uid": uid})
            conn.execute(sa.text("DELETE FROM restaurants WHERE id=:rid"), {"rid": rid})
            conn.execute(sa.text("DELETE FROM users WHERE id=:uid"), {"uid": uid})
