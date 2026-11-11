"""Load the restaurants the engine may suggest, shared by the group plan (BE-17) and the
personal list (BE-28), so both read hours, flags and budgets the same way.
"""
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.plan.engine import EXCLUDED_FLAGS, EXCLUDED_VENUES, Restaurant

FLAG_SEPARATOR = "|"  # restaurants.flags is text (database/load_place_details.py)
KM_PER_DEGREE = 111.0

# Only rows the engine could ever accept: known hours, spend and location, inside the budget, and inside the
# distance box when one is given. The engine still checks every rule; this only keeps the load small.
CANDIDATES_SQL = text("""
    SELECT id, cuisine, latitude, longitude, spend_low, spend_high, quality_score, brand_id,
           venue_type, flags, opening_hours
    FROM restaurants
    WHERE opening_hours->>'days_open' = '7' AND spend_low IS NOT NULL AND spend_high IS NOT NULL
      AND latitude IS NOT NULL AND longitude IS NOT NULL  -- optional since 0008; distance needs both
      AND (venue_type IS NULL OR NOT (venue_type = ANY(:venues)))
      AND (CAST(:budget_max AS INTEGER) IS NULL OR spend_low <= :budget_max)
      AND (CAST(:budget_min AS INTEGER) IS NULL OR spend_high >= :budget_min)
      AND (CAST(:lat_min AS NUMERIC) IS NULL OR latitude BETWEEN :lat_min AND :lat_max)
      AND (CAST(:lon_min AS NUMERIC) IS NULL OR longitude BETWEEN :lon_min AND :lon_max)
""")


def _minutes(hhmm: str) -> int:
    hours, minutes = hhmm.split(":")
    return int(hours) * 60 + int(minutes)


def hours_from_summary(summary: dict | None) -> dict[int, list[tuple[int, int]]] | None:
    """restaurants.opening_hours is a summary: {opens, closes, open_24h, days_open}.

    Only a place open every day has hours we can trust for any date. Fewer days open, or missing
    times, mean we do not know which days, so the hours are unknown and the place is left out (D04).
    """
    if not summary or summary.get("days_open") != 7:
        return None
    if summary.get("open_24h"):
        return {day: [(0, 1440)] for day in range(7)}
    try:
        opens, closes = _minutes(summary["opens"]), _minutes(summary["closes"])
    except (KeyError, TypeError, ValueError):
        return None
    if closes <= opens:  # runs past midnight, e.g. 16:00 to 01:30
        closes += 1440
    return {day: [(opens, closes)] for day in range(7)}


def _restaurant(r) -> Restaurant:
    return Restaurant(
        id=r.id,
        cuisines=tuple(c.strip() for c in (r.cuisine or "").split(",") if c.strip()),
        lat=float(r.latitude),
        lon=float(r.longitude),
        spend_low=r.spend_low,
        spend_high=r.spend_high,
        quality_score=float(r.quality_score) if r.quality_score is not None else None,
        brand_id=r.brand_id,
        venue_type=r.venue_type,
        flags=tuple(f for f in (r.flags or "").split(FLAG_SEPARATOR) if f),
        hours=hours_from_summary(r.opening_hours),
    )


def load_candidates(db: Session, budget_min: int | None, budget_max: int | None,
                    lat: float | None = None, lon: float | None = None,
                    max_km: float | None = None) -> list[Restaurant]:
    """Restaurants for the engine. With a location and a distance limit, only rows inside a box a
    little wider than the circle are read; the engine then checks the real distance."""
    box = {"lat_min": None, "lat_max": None, "lon_min": None, "lon_max": None}
    if max_km and lat is not None and lon is not None:
        pad = max_km / KM_PER_DEGREE * 1.1
        box = {"lat_min": lat - pad, "lat_max": lat + pad, "lon_min": lon - pad * 1.2, "lon_max": lon + pad * 1.2}
    rows = db.execute(CANDIDATES_SQL, {"venues": sorted(EXCLUDED_VENUES), "budget_min": budget_min,
                                       "budget_max": budget_max, **box}).all()
    return [r for r in map(_restaurant, rows) if not EXCLUDED_FLAGS.intersection(r.flags)]
