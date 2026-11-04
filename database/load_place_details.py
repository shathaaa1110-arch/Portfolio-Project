"""Fill restaurants.venue_type, seating and flags from the source dataset's places.csv.

The restaurants table keeps its own ids (1..N after cleaning), not the dataset's place_id,
so rows are matched on the English name and the coordinates rounded to 6 decimals. A key
that appears more than once in the source with different values is left out, not guessed.

Usage, from the repository root, with DATABASE_URL and ENVIRONMENT set like for Alembic:

    python database/load_place_details.py path/to/csv/places.csv            # dry run
    python database/load_place_details.py path/to/csv/places.csv --apply    # write

The dry run does the whole update inside a transaction and rolls it back, so its numbers are
exactly what --apply would write. Rerunning with new data updates the matched rows again.
"""
import argparse
import csv
import sys
from collections import Counter
from decimal import Decimal
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

# The values the dataset uses today (DATA_DICTIONARY.md). A new value stops the load, so it is
# reviewed before it reaches the recommendation filters.
VENUE_TYPES = {
    "restaurant", "fast_food", "cafe_coffee", "desserts_sweets", "bakery", "grocery_or_market",
    "tea_house", "juice_smoothies", "ice_cream", "other_non_food", "food_truck", "catering",
    "cloud_kitchen",
}
SEATING = {"indoor", "outdoor", "both", "takeaway_only", "unknown"}
FLAGS = {
    "name_uncertain", "shared_delivery_point", "coordinates_uncertain", "possibly_not_food",
    "duplicate_listing", "placeholder_name", "inside_mall_or_food_court",
    "virtual_brand_or_cloud_kitchen",
}
FLAG_SEPARATOR = "|"  # restaurants.flags is text; several flags are joined with this


class SourceError(Exception):
    """The source file has values this script does not know; nothing was written."""


def _key(name_en: str, lat: str, lon: str) -> tuple[str, Decimal, Decimal]:
    return name_en.strip(), round(Decimal(lat), 6), round(Decimal(lon), 6)


def read_source(path: Path) -> tuple[dict, int]:
    """Return ({key: (venue_type, seating, flags)}, number of conflicting keys left out)."""
    values: dict[tuple, set] = {}
    unknown: Counter = Counter()
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if not row["name_en"].strip() or not row["lat"] or not row["lon"]:
                continue
            flags = [f for f in row["flags"].split(FLAG_SEPARATOR) if f]
            if row["venue_type"] not in VENUE_TYPES:
                unknown[f"venue_type={row['venue_type']}"] += 1
            if row["seating"] not in SEATING:
                unknown[f"seating={row['seating']}"] += 1
            unknown.update(f"flag={f}" for f in flags if f not in FLAGS)
            value = (row["venue_type"], row["seating"], FLAG_SEPARATOR.join(sorted(flags)) or None)
            values.setdefault(_key(row["name_en"], row["lat"], row["lon"]), set()).add(value)
    if unknown:
        raise SourceError("Unknown values in the source: " + ", ".join(f"{k} ({n})" for k, n in unknown.most_common()))
    clean = {k: next(iter(v)) for k, v in values.items() if len(v) == 1}
    return clean, len(values) - len(clean)


def load(conn: Connection, source: dict) -> dict:
    """Update the matched restaurants inside the caller's transaction and report the numbers."""
    conn.execute(text("""
        CREATE TEMP TABLE place_details (
            name_en text NOT NULL, lat numeric NOT NULL, lon numeric NOT NULL,
            venue_type text NOT NULL, seating text NOT NULL, flags text,
            PRIMARY KEY (name_en, lat, lon)
        ) ON COMMIT DROP
    """))
    cursor = conn.connection.driver_connection.cursor()
    with cursor.copy("COPY place_details (name_en, lat, lon, venue_type, seating, flags) FROM STDIN") as copy:
        for (name_en, lat, lon), (venue_type, seating, flags) in source.items():
            copy.write_row((name_en, lat, lon, venue_type, seating, flags))

    updated = conn.execute(text("""
        UPDATE restaurants r
        SET venue_type = s.venue_type, seating = s.seating, flags = s.flags
        FROM place_details s
        WHERE r.name_en = s.name_en
          AND round(r.latitude, 6) = s.lat
          AND round(r.longitude, 6) = s.lon
    """)).rowcount
    total = conn.execute(text("SELECT count(*) FROM restaurants")).scalar()
    unmatched = conn.execute(text("""
        SELECT id, name_en FROM restaurants r
        WHERE NOT EXISTS (SELECT 1 FROM place_details s WHERE r.name_en = s.name_en
                          AND round(r.latitude, 6) = s.lat AND round(r.longitude, 6) = s.lon)
        ORDER BY id LIMIT 20
    """)).all()
    by_venue = conn.execute(text(
        "SELECT coalesce(venue_type, '(empty)'), count(*) FROM restaurants GROUP BY 1 ORDER BY 2 DESC")).all()
    return {"total": total, "updated": updated, "unmatched_examples": unmatched, "by_venue_type": by_venue}


def main() -> None:
    from app.core.config import get_database_connect_args, get_database_url

    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("places_csv", type=Path)
    parser.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    args = parser.parse_args()

    try:
        source, conflicts = read_source(args.places_csv)
    except SourceError as exc:
        sys.exit(str(exc))

    url = get_database_url()
    engine = create_engine(url, connect_args=get_database_connect_args())
    with engine.connect() as conn:
        transaction = conn.begin()
        report = load(conn, source)
        if args.apply:
            transaction.commit()
        else:
            transaction.rollback()

    print(f"Database: {url.host}/{url.database}")
    print(f"Source places: {len(source)} usable, {conflicts} left out (same name and place, different values)")
    print(f"Restaurants: {report['total']}, matched and updated: {report['updated']}, "
          f"not matched: {report['total'] - report['updated']}")
    for row in report["unmatched_examples"]:
        print(f"  not matched: {row.id} {row.name_en}")
    print("By venue_type:", ", ".join(f"{v} {n}" for v, n in report["by_venue_type"]))
    print("WRITTEN." if args.apply else "Dry run: nothing was written. Add --apply to write.")


if __name__ == "__main__":
    main()
