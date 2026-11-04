"""database/load_place_details.py: match restaurants to the source places and fill three columns.

Runs in a scratch schema with a small restaurants table, inside a transaction that is rolled back.
"""
import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from app.core.database import engine

pytestmark = pytest.mark.integration
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("load_place_details", ROOT / "database/load_place_details.py")
loader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(loader)

HEADER = "place_id,name_en,lat,lon,venue_type,seating,flags\n"


def _csv(tmp_path, rows):
    path = tmp_path / "places.csv"
    path.write_text(HEADER + "".join(r + "\n" for r in rows), encoding="utf-8")
    return path


@pytest.fixture
def db():
    with engine.connect() as conn, conn.begin():
        conn.execute(sa.text("CREATE SCHEMA load_test"))
        conn.execute(sa.text("SET LOCAL search_path TO load_test"))
        conn.execute(sa.text("""CREATE TABLE restaurants (
            id integer PRIMARY KEY, name_en text, latitude numeric, longitude numeric,
            venue_type text, seating text, flags text)"""))
        conn.execute(sa.text("""INSERT INTO restaurants (id, name_en, latitude, longitude) VALUES
            (1, 'Shawarma Ala Al Fahm', 24.750788, 46.779604),
            (2, 'Dunkin''', 24.541632, 46.659263),
            (3, 'Not In Source', 24.1, 46.1),
            (4, 'Twin', 24.2, 46.2)"""))
        yield conn
        conn.rollback()


def _row(conn, rid):
    return conn.execute(sa.text("SELECT venue_type, seating, flags FROM restaurants WHERE id = :i"), {"i": rid}).one()


def test_matches_on_name_and_rounded_coordinates(db, tmp_path):
    source, conflicts = loader.read_source(_csv(tmp_path, [
        "rp_1,Shawarma Ala Al Fahm,24.7507880,46.779604,fast_food,indoor,",
        "rp_2,Dunkin',24.541632,46.6592630,cafe_coffee,both,name_uncertain|duplicate_listing",
    ]))
    report = loader.load(db, source)
    assert conflicts == 0
    assert report["updated"] == 2 and report["total"] == 4
    assert _row(db, 1) == ("fast_food", "indoor", None)
    assert _row(db, 2) == ("cafe_coffee", "both", "duplicate_listing|name_uncertain")
    assert _row(db, 3) == (None, None, None)
    assert [r.id for r in report["unmatched_examples"]] == [3, 4]


def test_a_key_with_conflicting_values_is_left_out(db, tmp_path):
    source, conflicts = loader.read_source(_csv(tmp_path, [
        "rp_3,Twin,24.2,46.2,restaurant,indoor,",
        "rp_4,Twin,24.2,46.2,bakery,takeaway_only,",
    ]))
    assert conflicts == 1 and source == {}
    loader.load(db, source)
    assert _row(db, 4) == (None, None, None)


def test_the_same_values_twice_are_not_a_conflict(tmp_path):
    source, conflicts = loader.read_source(_csv(tmp_path, [
        "rp_3,Twin,24.2,46.2,restaurant,indoor,",
        "rp_4,Twin,24.20,46.200,restaurant,indoor,",
    ]))
    assert conflicts == 0 and len(source) == 1


def test_unknown_values_stop_the_load(tmp_path):
    with pytest.raises(loader.SourceError, match="venue_type=spaceship.*flag=haunted"):
        loader.read_source(_csv(tmp_path, ["rp_5,X,24.3,46.3,spaceship,indoor,haunted"]))


def test_rerunning_with_new_values_updates_again(db, tmp_path):
    loader.load(db, loader.read_source(_csv(tmp_path, ["rp_1,Shawarma Ala Al Fahm,24.750788,46.779604,fast_food,indoor,"]))[0])
    db.execute(sa.text("DROP TABLE place_details"))  # ON COMMIT DROP; a real rerun is a new transaction
    loader.load(db, loader.read_source(_csv(tmp_path, ["rp_1,Shawarma Ala Al Fahm,24.750788,46.779604,restaurant,both,"]))[0])
    assert _row(db, 1) == ("restaurant", "both", None)
