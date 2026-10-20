"""Tests for GET /api/v1/restaurants (BE-32). SQLite in memory, no login."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import get_db
from app.main import app

TABLE = """
CREATE TABLE restaurants (
    id INTEGER PRIMARY KEY, name_ar TEXT NOT NULL, name_en TEXT NOT NULL, brand_id INTEGER,
    cuisine TEXT NOT NULL, district TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
    spend_low INTEGER NOT NULL, spend_high INTEGER NOT NULL, price_tier SMALLINT NOT NULL,
    rating NUMERIC, rating_count INTEGER, quality_score NUMERIC, group_fit INTEGER,
    summary TEXT, maps_url TEXT NOT NULL
)
"""


def add(conn, id, quality, rating=4.5, cuisine="italian"):
    conn.execute(
        text(
            "INSERT INTO restaurants (id, name_ar, name_en, cuisine, district, latitude, longitude,"
            " spend_low, spend_high, price_tier, rating, quality_score, maps_url)"
            " VALUES (:id, 'مطعم', 'Place', :cuisine, 'Olaya', 24.7, 46.6, 50, 100, 2, :rating, :q, 'https://maps')"
        ),
        {"id": id, "q": quality, "rating": rating, "cuisine": cuisine},
    )


@pytest.fixture
def ctx():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with engine.begin() as conn:
        conn.execute(text(TABLE))
    Session = sessionmaker(bind=engine)

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override

    class C:
        client = TestClient(app)
        eng = engine

    yield C
    app.dependency_overrides.clear()


def get(c, **params):
    return c.client.get("/api/v1/restaurants", params=params)


def test_empty_dataset_returns_empty_list(ctx):
    r = get(ctx)
    assert r.status_code == 200
    assert r.json() == {"restaurants": [], "total": 0, "limit": 20, "offset": 0}


def test_no_login_needed_and_fields_are_general(ctx):
    with ctx.eng.begin() as conn:
        add(conn, 1, 0.9, cuisine="italian, pizza")
    r = get(ctx)
    assert r.status_code == 200
    item = r.json()["restaurants"][0]
    assert item == {
        "id": 1, "name_ar": "مطعم", "name_en": "Place", "cuisines": ["italian", "pizza"],
        "district": "Olaya", "price_tier": 2, "rating": 4.5, "maps_url": "https://maps",
    }


def test_best_quality_first(ctx):
    with ctx.eng.begin() as conn:
        add(conn, 1, 0.2)
        add(conn, 2, 0.9)
        add(conn, 3, None)
    ids = [x["id"] for x in get(ctx).json()["restaurants"]]
    assert ids == [2, 1, 3]


def test_results_are_bounded_and_paged(ctx):
    with ctx.eng.begin() as conn:
        for i in range(1, 31):
            add(conn, i, 1 - i / 100)
    first = get(ctx, limit=10).json()
    second = get(ctx, limit=10, offset=10).json()
    assert len(first["restaurants"]) == 10 and first["total"] == 30
    assert [x["id"] for x in second["restaurants"]] == list(range(11, 21))
    assert len(get(ctx).json()["restaurants"]) == 20  # default page size


def test_limit_above_max_is_rejected(ctx):
    r = get(ctx, limit=51)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_database_failure_returns_503(ctx):
    with ctx.eng.begin() as conn:
        conn.execute(text("DROP TABLE restaurants"))
    r = get(ctx)
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "RESTAURANTS_UNAVAILABLE"
