"""Tests for database/import_restaurants.py: validation, rejection, and repeat-import duplicate prevention."""
import csv
import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from app.core.database import engine

pytestmark = pytest.mark.integration
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("import_restaurants", ROOT / "database/import_restaurants.py")
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)

HEADER = (
    "place_id,name_en,name_ar,brand_id,venue_type,cuisines,is_food_business,status,"
    "lat,lon,district_id,district_ar,spend_low_sar,spend_high_sar,price_band,"
    "listing_rating,listing_review_count,quality_score,maps_url,flags,seating\n"
)


def _make_csv(tmp_path, rows, name="sample.csv"):
    p = tmp_path / name
    p.write_text(HEADER + "".join(r + "\n" for r in rows), encoding="utf-8")
    return p


@pytest.fixture
def clean_db():
    with engine.connect() as conn, conn.begin():
        schema = "import_test_schema"
        conn.execute(sa.text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
        conn.execute(sa.text(f"SET LOCAL search_path TO {schema}, public"))
        conn.execute(sa.text("""
            CREATE TABLE restaurants (
                id INTEGER PRIMARY KEY,
                name_ar TEXT NOT NULL,
                name_en TEXT,
                brand_id INTEGER,
                cuisine TEXT NOT NULL,
                district TEXT NOT NULL,
                latitude NUMERIC,
                longitude NUMERIC,
                spend_low INTEGER,
                spend_high INTEGER,
                price_tier SMALLINT,
                rating NUMERIC,
                rating_count INTEGER,
                quality_score NUMERIC,
                group_fit INTEGER,
                meal_fit_breakfast SMALLINT,
                meal_fit_late_night SMALLINT,
                opening_hours JSONB,
                summary TEXT,
                maps_url TEXT,
                image_url TEXT,
                venue_type TEXT,
                seating TEXT,
                flags TEXT
            )
        """))
        yield conn
        conn.rollback()


def test_filters_out_closed_and_non_food(tmp_path):
    csv_file = _make_csv(tmp_path, [
        "rp_1,Open Place,مكان مفتوح,rb_1,restaurant,saudi,True,open,24.71,46.68,01,العليا,30,60,2,4.5,100,4.2,https://maps,,indoor",
        "rp_2,Closed Place,مكان مغلق,rb_2,restaurant,saudi,True,permanently_closed,24.72,46.69,01,العليا,30,60,2,4.5,100,4.2,https://maps,,indoor",
        "rp_3,Unknown Place,مكان مجهول,rb_3,restaurant,saudi,True,unknown,24.73,46.70,01,العليا,30,60,2,4.5,100,4.2,https://maps,,indoor",
        "rp_4,Non Food,متجر غير غذائي,rb_4,other_non_food,saudi,False,open,24.74,46.71,01,العليا,30,60,2,4.5,100,4.2,https://maps,,indoor",
        "rp_5,No Cuisine,بدون مطبخ,rb_5,restaurant,,True,open,24.75,46.72,01,العليا,30,60,2,4.5,100,4.2,https://maps,,indoor",
        "rp_6,Bad Coords,إحداثيات خاطئة,rb_6,restaurant,saudi,True,open,10.0,10.0,01,العليا,30,60,2,4.5,100,4.2,https://maps,,indoor",
    ])

    report = importer.read_and_validate_source(csv_file)
    assert report["total_source_places"] == 6
    assert report["accepted_count"] == 1
    assert report["accepted_count"] == len(report["rows"])
    assert report["rows"][0]["name_en"] == "Open Place"
    assert report["rejected_count"] == 5
    assert "status: permanently_closed" in report["rejected_breakdown"]
    assert "status: unknown" in report["rejected_breakdown"]
    assert "not a food business" in report["rejected_breakdown"]
    assert "missing cuisine" in report["rejected_breakdown"]
    assert "coordinates out of Riyadh bounding box" in report["rejected_breakdown"]


def test_source_duplicates_are_deduplicated(tmp_path):
    csv_file = _make_csv(tmp_path, [
        "rp_10,Burger King,برجر كنج,rb_10,fast_food,burger,True,open,24.700000,46.670000,01,العليا,25,50,1,4.0,50,4.0,https://maps,,indoor",
        "rp_11,Burger King,برجر كنج,rb_10,fast_food,burger,True,open,24.7000004,46.6700002,01,العليا,25,50,1,4.0,50,4.0,https://maps,,indoor",
    ])
    report = importer.read_and_validate_source(csv_file)
    assert report["total_source_places"] == 2
    assert report["accepted_count"] == 1
    assert report["duplicate_count"] == 1


def test_repeat_import_does_not_create_duplicates(clean_db, tmp_path):
    """Running the same import twice must not create duplicates."""
    csv_file = _make_csv(tmp_path, [
        "rp_20,Shawarma Place,شاورما,rb_20,restaurant,shawarma,True,open,24.75,46.75,01,السليمانية,20,40,1,4.2,80,4.1,https://maps,,indoor",
        "rp_21,Pizza Place,بيتزا,rb_21,restaurant,pizza,True,open,24.76,46.76,01,السليمانية,45,90,2,4.6,120,4.5,https://maps,,indoor",
    ])
    validated = importer.read_and_validate_source(csv_file)
    assert validated["accepted_count"] == 2

    # First import
    run1 = importer.import_rows(clean_db, validated["rows"])
    assert run1["inserted"] == 2
    assert run1["unchanged"] == 0
    assert run1["total_in_db"] == 2

    count1 = clean_db.execute(sa.text("SELECT count(*) FROM restaurants")).scalar()
    assert count1 == 2

    # Second import with the exact same data
    run2 = importer.import_rows(clean_db, validated["rows"])
    assert run2["inserted"] == 0
    assert run2["unchanged"] == 2
    assert run2["total_in_db"] == 2

    count2 = clean_db.execute(sa.text("SELECT count(*) FROM restaurants")).scalar()
    assert count2 == 2  # Proves zero duplicate rows created!
