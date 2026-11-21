"""Import restaurants dataset into PostgreSQL with deduplication and validation.

Dry run by default; supply --apply to commit changes.

Usage:
    python database/import_restaurants.py path/to/places.csv            # Dry run
    python database/import_restaurants.py path/to/places.csv --apply    # Commit
"""
import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

RESTAURANT_COLUMNS = (
    "id", "name_ar", "name_en", "brand_id", "cuisine", "district",
    "latitude", "longitude", "spend_low", "spend_high", "price_tier",
    "rating", "rating_count", "quality_score", "group_fit",
    "meal_fit_breakfast", "meal_fit_late_night", "opening_hours",
    "summary", "maps_url", "image_url", "venue_type", "seating", "flags"
)


class ImportError(ValueError):
    """Source validation or constraint error."""


def _clean_str(val):
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


def _clean_int(val):
    if val is None or str(val).strip() == "":
        return None
    try:
        return int(float(str(val).strip()))
    except (ValueError, TypeError):
        return None


def _clean_decimal(val, decimals=6):
    if val is None or str(val).strip() == "":
        return None
    try:
        return round(Decimal(str(val).strip()), decimals)
    except (InvalidOperation, TypeError):
        return None


def read_and_validate_source(path: Path) -> dict:
    """Read CSV/JSON places and filter valid, open food establishments.

    Returns dict with parsed rows, rejected categories, duplicate count, and statistics.
    """
    if not path.exists():
        raise ImportError(f"Source file not found: {path}")

    total_count = 0
    rejected_reasons = Counter()
    duplicates_count = 0
    seen_keys = set()
    accepted_rows = []
    missing_fields_counter = Counter()

    # Open CSV
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        row_id_seq = 1

        for row in reader:
            total_count += 1
            status = (row.get("status") or "").strip().lower()
            is_food_raw = (row.get("is_food_business") or "").strip().lower()
            is_food = is_food_raw in ("true", "1", "yes")

            # 1. Status check: must be open
            if status != "open":
                rejected_reasons[f"status: {status or 'empty'}"] += 1
                continue

            # 2. Food business check
            if not is_food:
                rejected_reasons["not a food business"] += 1
                continue

            name_ar = _clean_str(row.get("name_ar"))
            name_en = _clean_str(row.get("name_en"))
            cuisine = _clean_str(row.get("cuisines") or row.get("cuisine"))
            district = _clean_str(row.get("district_ar") or row.get("district"))

            # 3. Required fields check
            if not name_ar:
                rejected_reasons["missing name_ar"] += 1
                continue
            if not cuisine:
                rejected_reasons["missing cuisine"] += 1
                continue
            if not district:
                rejected_reasons["missing district"] += 1
                continue

            # 4. Coordinate check
            lat = _clean_decimal(row.get("lat") or row.get("latitude"))
            lon = _clean_decimal(row.get("lon") or row.get("longitude"))
            if lat is None or lon is None:
                rejected_reasons["missing coordinates"] += 1
                continue
            if not (24.0 <= lat <= 25.5 and 46.0 <= lon <= 47.5):
                rejected_reasons["coordinates out of Riyadh bounding box"] += 1
                continue

            # 5. Deduplication by key (name + rounded lat/lon)
            dedup_key = (name_en or name_ar, lat, lon)
            if dedup_key in seen_keys:
                duplicates_count += 1
                continue
            seen_keys.add(dedup_key)

            # Assign integer id
            raw_id = _clean_int(row.get("id"))
            if raw_id is not None:
                assigned_id = raw_id
            else:
                # Generate stable numeric ID from sequence
                assigned_id = row_id_seq
                row_id_seq += 1

            # Spend & price band
            spend_low = _clean_int(row.get("spend_low_sar") or row.get("spend_low"))
            spend_high = _clean_int(row.get("spend_high_sar") or row.get("spend_high"))
            price_tier = _clean_int(row.get("price_band") or row.get("price_tier"))
            if price_tier is not None and not (1 <= price_tier <= 4):
                price_tier = None

            # Ratings & scores
            rating = _clean_decimal(row.get("listing_rating") or row.get("rating"), 2)
            rating_count = _clean_int(row.get("listing_review_count") or row.get("rating_count"))
            quality_score = _clean_decimal(row.get("quality_score"), 2)
            group_fit = _clean_int(row.get("group_fit"))
            meal_fit_breakfast = _clean_int(row.get("meal_fit_breakfast"))
            meal_fit_late_night = _clean_int(row.get("meal_fit_late_night"))

            # Brand
            raw_brand = row.get("brand_id")
            brand_id = None
            if raw_brand:
                brand_id = _clean_int(str(raw_brand).replace("rb_", ""))

            # Hours & summary
            summary = _clean_str(row.get("summary_ar") or row.get("summary"))
            maps_url = _clean_str(row.get("maps_url"))
            image_url = _clean_str(row.get("image_url"))
            venue_type = _clean_str(row.get("venue_type"))
            seating = _clean_str(row.get("seating"))
            flags = _clean_str(row.get("flags"))

            opening_hours = None
            raw_hours = row.get("opening_hours")
            if raw_hours:
                try:
                    opening_hours = json.loads(raw_hours) if isinstance(raw_hours, str) else raw_hours
                except Exception:
                    opening_hours = None

            clean_row = {
                "id": assigned_id,
                "name_ar": name_ar,
                "name_en": name_en,
                "brand_id": brand_id,
                "cuisine": cuisine,
                "district": district,
                "latitude": float(lat),
                "longitude": float(lon),
                "spend_low": spend_low,
                "spend_high": spend_high,
                "price_tier": price_tier,
                "rating": float(rating) if rating is not None else None,
                "rating_count": rating_count,
                "quality_score": float(quality_score) if quality_score is not None else None,
                "group_fit": group_fit,
                "meal_fit_breakfast": meal_fit_breakfast,
                "meal_fit_late_night": meal_fit_late_night,
                "opening_hours": json.dumps(opening_hours) if opening_hours else None,
                "summary": summary,
                "maps_url": maps_url,
                "image_url": image_url,
                "venue_type": venue_type,
                "seating": seating,
                "flags": flags,
            }

            for col in RESTAURANT_COLUMNS:
                if clean_row.get(col) is None:
                    missing_fields_counter[col] += 1

            accepted_rows.append(clean_row)

    return {
        "total_source_places": total_count,
        "accepted_count": len(accepted_rows),
        "rejected_count": sum(rejected_reasons.values()),
        "rejected_breakdown": dict(rejected_reasons),
        "duplicate_count": duplicates_count,
        "missing_fields": dict(missing_fields_counter),
        "rows": accepted_rows,
    }


def import_rows(conn: Connection, rows: list[dict]) -> dict:
    """Import rows into PostgreSQL restaurants table without duplicates."""
    conn.execute(text("""
        ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS venue_type text;
        ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS seating text;
        ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS flags text;
    """))

    conn.execute(text("LOCK TABLE restaurants IN SHARE ROW EXCLUSIVE MODE"))

    # Check existing restaurants by ID and by geographic key
    existing = conn.execute(text(
        "SELECT id, name_ar, name_en, round(latitude, 6) as lat, round(longitude, 6) as lon FROM restaurants"
    )).mappings().all()

    existing_ids = {r["id"] for r in existing}
    existing_keys = {(r["name_en"] or r["name_ar"], r["lat"], r["lon"]) for r in existing if r["lat"] is not None}

    to_insert = []
    unchanged_count = 0

    for r in rows:
        key = (r["name_en"] or r["name_ar"], round(Decimal(str(r["latitude"])), 6), round(Decimal(str(r["longitude"])), 6))
        if r["id"] in existing_ids or key in existing_keys:
            unchanged_count += 1
        else:
            to_insert.append(r)
            existing_ids.add(r["id"])
            existing_keys.add(key)

    if to_insert:
        columns = ", ".join(RESTAURANT_COLUMNS)
        placeholders = ", ".join(f":{c}" for c in RESTAURANT_COLUMNS)
        conn.execute(
            text(f"INSERT INTO restaurants ({columns}) VALUES ({placeholders})"),
            to_insert
        )

    total_in_db = conn.execute(text("SELECT count(*) FROM restaurants")).scalar()

    return {
        "inserted": len(to_insert),
        "unchanged": unchanged_count,
        "total_in_db": total_in_db,
    }


def main():
    from app.core.config import get_database_connect_args, get_database_url

    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("places_csv", type=Path, help="Path to places.csv")
    parser.add_argument("--apply", action="store_true", help="Commit the changes (default: rollback dry run)")
    args = parser.parse_args()

    print(f"Reading and validating source: {args.places_csv}")
    try:
        validated = read_and_validate_source(args.places_csv)
    except Exception as exc:
        parser.exit(1, f"Validation failed: {exc}\n")

    print(f"Source records processed: {validated['total_source_places']}")
    print(f"Accepted open food places: {validated['accepted_count']}")
    print(f"Duplicates skipped in source: {validated['duplicate_count']}")
    print(f"Rejected records: {validated['rejected_count']}")
    for reason, count in validated["rejected_breakdown"].items():
        print(f"  - {reason}: {count}")

    print("\nMissing optional fields in accepted records:")
    for field, count in sorted(validated["missing_fields"].items(), key=lambda x: x[1], reverse=True):
        pct = (count / validated['accepted_count']) * 100 if validated['accepted_count'] else 0
        print(f"  - {field}: {count} ({pct:.1f}%)")

    url = get_database_url()
    engine = create_engine(url, connect_args=get_database_connect_args())

    with engine.connect() as conn:
        with conn.begin() as transaction:
            db_report = import_rows(conn, validated["rows"])
            if args.apply:
                transaction.commit()
            else:
                transaction.rollback()

    print(f"\nDatabase target: {url.host}/{url.database}")
    print(f"DB Import Report: {db_report['inserted']} inserted, {db_report['unchanged']} unchanged.")
    print(f"Total restaurants in DB: {db_report['total_in_db']}")
    print("WRITTEN." if args.apply else "Dry run: nothing was committed. Add --apply to commit.")


if __name__ == "__main__":
    main()
