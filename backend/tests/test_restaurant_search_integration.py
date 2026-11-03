"""#46: GET /restaurants?search=... on PostgreSQL, with migration 0004 applied.

Each test builds its own schema inside one transaction that is rolled back.
"""
import importlib.util
import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.core.database import engine, get_db
from app.main import app
from app.services.restaurants import search
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

pytestmark = pytest.mark.integration
URL = "/api/v1/restaurants"
VERSIONS = Path(__file__).resolve().parents[2] / "database/migrations/versions"

# The columns BE-32 reads, as on Neon (draft schema.sql).
TABLE = """
CREATE TABLE restaurants (
    id INTEGER PRIMARY KEY, name_ar TEXT NOT NULL, name_en TEXT, cuisine TEXT NOT NULL,
    district TEXT NOT NULL, price_tier SMALLINT NOT NULL, rating NUMERIC, quality_score NUMERIC,
    maps_url TEXT NOT NULL)
"""


def _migration():
    spec = importlib.util.spec_from_file_location("m0004", VERSIONS / "0004_restaurant_search.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def api():
    with engine.connect() as conn, conn.begin():
        schema = "s46_" + uuid.uuid4().hex
        conn.execute(sa.text(f"CREATE SCHEMA {schema}"))
        conn.execute(sa.text(f"SET LOCAL search_path TO {schema}, public"))
        conn.execute(sa.text(TABLE))

        def add(id, name_ar, name_en=None, cuisine="saudi", quality=4.0):
            conn.execute(sa.text(
                "INSERT INTO restaurants (id, name_ar, name_en, cuisine, district, price_tier, rating, "
                "quality_score, maps_url) VALUES (:id, :ar, :en, :c, 'العليا', 2, 4.5, :q, 'https://maps')"),
                {"id": id, "ar": name_ar, "en": name_en, "c": cuisine, "q": quality})

        def migrate():
            with Operations.context(MigrationContext.configure(conn)):
                _migration().upgrade()

        app.dependency_overrides[get_db] = lambda: (yield Session(bind=conn, join_transaction_mode="create_savepoint"))
        yield TestClient(app), add, migrate, conn
        app.dependency_overrides.clear()
        conn.rollback()


def _ids(r):
    return [x["id"] for x in r.json()["restaurants"]]


def test_migration_fills_existing_rows_and_future_rows(api):
    client, add, migrate, conn = api
    add(1, "مطعم الأصالة", "Al Asalah")
    migrate()
    add(2, "مَطْعَم إطلالة", "Etlala")                                    # inserted after the migration
    rows = dict(conn.execute(sa.text("SELECT id, search_text FROM restaurants")).all())
    assert rows == {1: "مطعم الاصاله al asalah", 2: "مطعم اطلاله etlala"}


def test_sql_and_python_normalize_the_same_way(api):
    _, _, _, conn = api
    samples = ["أَحْمَد", "إسلام  آل  ٱلشيخ", "مكتبة ـــ هدى", "Burger KING", "مستشفى"]
    for text in samples:
        sql = conn.execute(sa.text(f"SELECT {search.NORMALIZE_SQL.format(col=':t')}"), {"t": text}).scalar_one()
        assert sql.strip() == search.normalize(text)
    assert _migration().NORMALIZE_SQL == search.NORMALIZE_SQL  # the migration's copy did not drift


def test_arabic_name_part_with_any_hamza_or_taa_marbuta(api):
    client, add, migrate, _ = api
    add(1, "مطعم الأصالة")
    add(2, "شذا الشرق")
    add(3, "مطعم ثاني")
    migrate()
    assert _ids(client.get(URL, params={"search": "اصاله"})) == [1]
    assert _ids(client.get(URL, params={"search": "شذ"})) == [2]


def test_english_name_any_case(api):
    client, add, migrate, _ = api
    add(1, "برغر", "Burger Garage")
    add(2, "قهوة", "Coffee Lab")
    migrate()
    assert _ids(client.get(URL, params={"search": "GARAGE"})) == [1]


def test_cuisine_name_in_arabic(api):
    client, add, migrate, _ = api
    add(1, "مطعم أ", cuisine="pizza, italian")
    add(2, "مطعم ب", cuisine="italian")
    add(3, "مطعم ج", cuisine="saudi, grill_bbq")
    migrate()
    assert sorted(_ids(client.get(URL, params={"search": "إيطالي"}))) == [1, 2]
    assert sorted(_ids(client.get(URL, params={"search": "بيتزا"}))) == [1]
    assert sorted(_ids(client.get(URL, params={"search": "مشويات"}))) == [3]


def test_total_counts_matches_and_pages_stay_stable(api):
    client, add, migrate, _ = api
    for i in range(1, 26):
        add(i, f"مطعم رقم {i}", quality=5 - i / 100)
    add(99, "كافيه", cuisine="specialty_coffee")
    migrate()
    first = client.get(URL, params={"search": "مطعم", "limit": 20, "offset": 0}).json()
    second = client.get(URL, params={"search": "مطعم", "limit": 20, "offset": 20}).json()
    assert first["total"] == second["total"] == 25
    assert len(first["restaurants"]) == 20 and len(second["restaurants"]) == 5
    assert set(_ids_of(first)).isdisjoint(_ids_of(second))
    assert _ids_of(first) == list(range(1, 21))          # same order as Home: quality, rating, id


def _ids_of(body):
    return [x["id"] for x in body["restaurants"]]


def test_no_match_is_an_empty_list(api):
    client, add, migrate, _ = api
    add(1, "مطعم")
    migrate()
    r = client.get(URL, params={"search": "لايوجد"})
    assert r.status_code == 200
    assert r.json()["restaurants"] == [] and r.json()["total"] == 0


def test_blank_search_is_the_general_list(api):
    client, add, migrate, _ = api
    add(1, "أ")
    add(2, "ب")
    migrate()
    assert client.get(URL, params={"search": "   "}).json()["total"] == 2


def test_like_wildcards_are_literal(api):
    client, add, migrate, _ = api
    add(1, "100% عصير")
    add(2, "مطعم")
    migrate()
    assert _ids(client.get(URL, params={"search": "%"})) == [1]
    assert _ids(client.get(URL, params={"search": "_"})) == []


def test_search_too_long_is_rejected(api):
    client, _, migrate, _ = api
    migrate()
    r = client.get(URL, params={"search": "x" * 51})
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_the_api_search_uses_the_indexes(api):
    """The API's own WHERE clause must use both indexes, not scan every row."""
    from app.services.restaurants import router
    _, _, migrate, conn = api
    conn.execute(sa.text(
        "INSERT INTO restaurants (id, name_ar, cuisine, district, price_tier, maps_url) "
        "SELECT g, 'مطعم ' || g, CASE WHEN g % 50 = 0 THEN 'shawarma, grill_bbq' ELSE 'saudi' END, "
        "'حي', 2, 'https://maps' FROM generate_series(1, 20000) g"))
    migrate()
    conn.execute(sa.text("ANALYZE restaurants"))
    for term in ["شاورما", "مطعم 1234"]:
        params = {"pattern": search.like_pattern(term), "codes": search.codes_for(term)}
        sql = "EXPLAIN SELECT id FROM restaurants" + router.SEARCH_WHERE
        plan = "\n".join(r[0] for r in conn.execute(sa.text(sql), params))
        assert "Seq Scan" not in plan, plan
        assert "ix_restaurants_search_text" in plan and "ix_restaurants_cuisine_codes" in plan


def test_router_and_migration_use_the_same_cuisine_expression():
    from app.services.restaurants import router
    assert router.CUISINE_CODES == _migration().CUISINE_CODES


def test_every_dataset_code_has_an_arabic_name():
    # The 44 codes live in plan/cuisines.py (#141); this check runs once that is merged.
    cuisines = pytest.importorskip("app.services.plan.cuisines")
    assert set(search.CODE_LABELS_AR) == set(cuisines.CODE_TO_KEY)
    assert search.codes_for("ي") == []                   # too short to mean a category
