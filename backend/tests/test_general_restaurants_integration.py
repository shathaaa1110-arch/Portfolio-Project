"""DB-13 implementation checks; isolated schemas roll back, not final #133 acceptance."""
from uuid import uuid4

import pytest
import sqlalchemy as sa
from app.core.database import engine, get_db
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from tests.test_general_restaurants import seed_module
from tests.test_saved_restaurant_schema_integration import migrate, revision

pytestmark = pytest.mark.integration


@pytest.fixture
def conn():
    with engine.connect() as connection, connection.begin():
        schema = "db13_" + uuid4().hex
        connection.execute(sa.text(f"CREATE SCHEMA {schema}"))
        connection.execute(sa.text(f"SET LOCAL search_path TO {schema}"))
        migrate(connection, "0002_account_keys_and_phone")
        migrate(connection, "0006_saved_restaurants")
        migrate(connection, "0007_saved_at")
        yield connection
        connection.rollback()


def test_populated_upgrade_preserves_data_keys_and_search(conn):
    from tests.test_saved_restaurant_schema_integration import restaurant, user, save
    uid, rid = user(conn), restaurant(conn)
    save(conn, uid, rid)
    before = dict(conn.execute(sa.text("SELECT * FROM restaurants")).mappings().one())
    migrate(conn, "0008_general_restaurants")
    after = dict(conn.execute(sa.text("SELECT * FROM restaurants")).mappings().one())
    assert after.pop("image_url") is None
    assert after == before
    seed_module.seed(conn, seed_module.read_source())
    assert dict(conn.execute(sa.text("SELECT * FROM restaurants WHERE id=:id"), {"id": rid}).mappings().one()) == {**before, "image_url": None}
    assert conn.execute(sa.text("SELECT restaurant_id FROM saved_restaurants")).scalar_one() == rid
    columns = {c["name"]: c for c in sa.inspect(conn).get_columns("restaurants")}
    assert str(columns["image_url"]["type"]) == "TEXT"
    for key in ("latitude", "longitude", "spend_low", "spend_high", "price_tier", "maps_url"):
        assert columns[key]["nullable"]
    for key in ("id", "name_ar", "cuisine", "district"):
        assert not columns[key]["nullable"]
    assert {i["name"] for i in sa.inspect(conn).get_indexes("restaurants")} >= {
        "ix_restaurants_search_text", "ix_restaurants_cuisine_codes"}


def test_seed_repeat_and_public_api(conn):
    migrate(conn, "0008_general_restaurants")
    rows = seed_module.read_source()
    assert seed_module.seed(conn, rows) == {"inserted": 8, "unchanged": 0}
    assert seed_module.seed(conn, rows) == {"inserted": 0, "unchanged": 8}
    assert conn.execute(sa.text("SELECT count(*) FROM restaurants")).scalar_one() == 8
    session = Session(bind=conn, join_transaction_mode="create_savepoint")
    app.dependency_overrides[get_db] = lambda: session
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/restaurants")
            assert response.status_code == 200
            result = response.json()
            assert result["total"] == 8
            assert [r["id"] for r in result["restaurants"]] == [r["id"] for r in rows]
            assert all(r["image_url"] is None and r["maps_url"] is None and r["price_tier"] is None
                       for r in result["restaurants"])
            assert all("match_score" not in r and "reason" not in r for r in result["restaurants"])
            conn.execute(sa.text("UPDATE restaurants SET image_url='https://example.org/photo.jpg' WHERE id=:id"),
                         {"id": rows[0]["id"]})
            searched = client.get("/api/v1/restaurants", params={"search": "Palm"}).json()
            assert searched["restaurants"][0]["image_url"] == "https://example.org/photo.jpg"
    finally:
        session.close()
        app.dependency_overrides.clear()


def test_conflict_does_not_overwrite_or_partially_insert(conn):
    migrate(conn, "0008_general_restaurants")
    rows = seed_module.read_source()
    conn.execute(sa.text("INSERT INTO restaurants (id,name_ar,cuisine,district) VALUES (:id,'keep','saudi','العليا')"),
                 {"id": rows[-1]["id"]})
    with pytest.raises(seed_module.SeedError), conn.begin_nested():
        seed_module.seed(conn, rows)
    assert conn.execute(sa.text("SELECT name_ar FROM restaurants")).scalars().all() == ["keep"]


def test_dry_run_and_failed_insert_roll_back(conn):
    migrate(conn, "0008_general_restaurants")
    rows = seed_module.read_source()
    with conn.begin_nested() as transaction:
        seed_module.seed(conn, rows)
        transaction.rollback()
    assert conn.execute(sa.text("SELECT count(*) FROM restaurants")).scalar_one() == 0
    rows[-1]["district"] = None
    with pytest.raises(sa.exc.IntegrityError), conn.begin_nested():
        seed_module.seed(conn, rows)
    assert conn.execute(sa.text("SELECT count(*) FROM restaurants")).scalar_one() == 0


def test_downgrade_preserves_sample(conn):
    migrate(conn, "0008_general_restaurants")
    seed_module.seed(conn, seed_module.read_source())
    with pytest.raises(RuntimeError, match="downgrade refused"):
        revision("0008_general_restaurants").downgrade()
    assert conn.execute(sa.text("SELECT count(*) FROM restaurants")).scalar_one() == 8


def test_full_migration_chain_on_empty_schema():
    with engine.connect() as connection, connection.begin():
        schema = "db13_clean_" + uuid4().hex
        connection.execute(sa.text(f"CREATE SCHEMA {schema}"))
        connection.execute(sa.text(f"SET LOCAL search_path TO {schema}"))
        for name in ("0001_empty_baseline", "0002_account_keys_and_phone", "0003_account_preferences",
                     "0004_restaurant_search", "0005_outings_and_districts", "0006_saved_restaurants",
                     "0007_saved_at", "0008_general_restaurants"):
            migrate(connection, name)
        assert seed_module.seed(connection, seed_module.read_source())["inserted"] == 8
        connection.rollback()
