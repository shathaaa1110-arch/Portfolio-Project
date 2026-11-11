"""Import the committed DB-13 fictional sample; dry run unless --apply is supplied."""
import argparse
import json
import sys
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

SOURCE = Path(__file__).parent / "seed/general_restaurants.json"
COLUMNS = ("id", "name_ar", "name_en", "cuisine", "district", "summary", "image_url",
           "latitude", "longitude", "spend_low", "spend_high", "price_tier", "maps_url",
           "rating", "rating_count", "quality_score", "opening_hours", "brand_id",
           "group_fit", "meal_fit_breakfast", "meal_fit_late_night")
REQUIRED = COLUMNS[:6]


class SeedError(ValueError):
    """Invalid sample or ID collision; the caller must roll back."""


def read_source(path=SOURCE):
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data["restaurants"]
    if data.get("kind") != "synthetic-demo" or len(rows) != 8:
        raise SeedError("Expected the eight-row DB-13 synthetic demo sample.")
    seen = set()
    for row in rows:
        if set(row) != set(COLUMNS):
            raise SeedError("Sample fields do not match the DB-13 contract.")
        rid = row["id"]
        if type(rid) is not int or not 2000000101 <= rid <= 2000000108 or rid in seen:
            raise SeedError("Invalid or duplicate demo ID.")
        seen.add(rid)
        if any(not isinstance(row[key], str) or not row[key].strip() for key in REQUIRED[1:]):
            raise SeedError("Demo names, cuisine, district and provenance must be nonempty text.")
        if "تجريبي" not in row["name_ar"] or "Demo" not in row["name_en"]:
            raise SeedError("Every demo name must visibly identify fictional data.")
        if any(row[key] is not None for key in COLUMNS[6:]):
            raise SeedError("Unknown demo information must be explicit null, not invented values.")
    return rows


def seed(conn, rows):
    """Caller owns the transaction. Serialize imports and reject conflicting IDs."""
    conn.execute(text("LOCK TABLE restaurants IN SHARE ROW EXCLUSIVE MODE"))
    columns = ", ".join(COLUMNS)
    existing = conn.execute(text(f"SELECT {columns} FROM restaurants WHERE id = ANY(:ids)"),
                            {"ids": [row["id"] for row in rows]}).mappings().all()
    by_id = {row["id"]: dict(row) for row in existing}
    for row in rows:
        if row["id"] in by_id and by_id[row["id"]] != row:
            raise SeedError(f"Demo ID {row['id']} conflicts with stored data; nothing was overwritten.")
    pending = [row for row in rows if row["id"] not in by_id]
    if pending:
        conn.execute(text(f"INSERT INTO restaurants ({columns}) VALUES ("
                          + ", ".join(f":{key}" for key in COLUMNS) + ")"), pending)
    return {"inserted": len(pending), "unchanged": len(existing)}


def main():
    from app.core.config import get_database_connect_args, get_database_url
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="commit the sample (default: rollback)")
    args = parser.parse_args()
    engine = None
    try:
        rows = read_source()
        url = get_database_url()
        engine = create_engine(url, connect_args=get_database_connect_args())
        with engine.connect() as conn:
            with conn.begin() as transaction:
                report = seed(conn, rows)
                if not args.apply:
                    transaction.rollback()
        print(f"Database: {url.host}/{url.database}")
        print(f"Synthetic demo: {report['inserted']} inserted, {report['unchanged']} unchanged.")
        print("WRITTEN." if args.apply else "Dry run: nothing was written. Use --apply to commit.")
    except (SeedError, ValueError, KeyError, OSError) as exc:
        parser.exit(1, f"Seed failed: {exc}\n")
    except SQLAlchemyError:
        parser.exit(1, "Seed failed; transaction rolled back. Check database access and migration 0008.\n")
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    main()
