"""The one recommendation engine for a person (BE-28) and a group (BE-17).

Three stages, in this order:
  1. filter_candidates  (BE-14) — hard limits. A place that breaks anyone's limit, or whose
     required facts are unknown, is removed. Limits are never relaxed (D04).
  2. person_score       (BE-15) — each person scores each remaining place from 0 to 1.
  3. recommend          (BE-15) — Average Without Misery, then coverage and diversity.

Pure Python: no database, no HTTP. The API layer loads Restaurant rows and calls recommend().
The constants below were chosen by testing 13 group scenarios on the real dataset (playground).
"""
import math
from dataclasses import dataclass, field
from datetime import datetime

from app.services.plan.cuisines import CAFE_KEYS, CUISINE_GROUPS, keys_for_codes

# Person score weights (cuisine, price, distance).
W_CUISINE, W_PRICE, W_DISTANCE = 0.5, 0.3, 0.2
# Share of the final score that comes from the place's quality instead of the people.
W_QUALITY = 0.15
# A place scored below this by anyone is removed (Average Without Misery).
MISERY = 0.3
# Score for a field the person left empty, so empty answers never punish a place.
NEUTRAL = 0.5
# Distance scale for a person who set no distance limit.
DEFAULT_DISTANCE_KM = 15.0
# At most this many places from the same main category in one list.
MAX_PER_CATEGORY = 2
# Venue types and flags that are never suggested (P-02 personal contract).
EXCLUDED_VENUES = frozenset({"cloud_kitchen", "catering", "food_truck", "grocery_or_market", "other_non_food"})
EXCLUDED_FLAGS = frozenset({"virtual_brand_or_cloud_kitchen", "possibly_not_food", "duplicate_listing"})


class LocationRequired(Exception):
    """Someone set a distance limit, but no location was sent."""


@dataclass(frozen=True)
class Restaurant:
    id: int
    cuisines: tuple[str, ...]          # raw dataset codes, e.g. ("saudi", "grill_bbq")
    lat: float
    lon: float
    spend_low: int                     # SAR per person
    spend_high: int
    quality_score: float | None = None  # rating adjusted for review count, about 2 to 5
    brand_id: int | None = None
    venue_type: str | None = None
    flags: tuple[str, ...] = ()
    # Weekday (0 = Monday) -> list of (opens, closes) in minutes from midnight.
    # closes > 1440 means the period runs past midnight. None means the hours are unknown.
    hours: dict[int, list[tuple[int, int]]] | None = None


@dataclass(frozen=True)
class Preferences:
    """One person's answers. Every field is optional."""
    liked_cuisines: tuple[str, ...] = ()   # category keys, e.g. ("saudi_gulf", "grill")
    budget_min: int | None = None
    budget_max: int | None = None
    max_distance_km: float | None = None


@dataclass
class Recommendation:
    restaurant: Restaurant
    rank: int                       # 1 = best. Saved in plan_items; ties are settled by it (D09)
    match_score: int                # 0 to 100, shown on the card
    reasons: list[str]              # keys the app turns into Arabic text
    distance_km: float | None
    person_scores: list[float] = field(repr=False)  # internal: never shown to the group


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance (haversine)."""
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 12742 * math.asin(math.sqrt(a))


def is_open(r: Restaurant, when: datetime) -> bool | None:
    """True or False, or None when the hours are unknown. `when` is local Riyadh time."""
    if r.hours is None:
        return None
    minute = when.hour * 60 + when.minute
    today = when.weekday()
    yesterday = (today - 1) % 7
    for opens, closes in r.hours.get(today, []):
        if opens <= minute < closes:
            return True
    # A period that started yesterday and runs past midnight, e.g. 16:00 to 01:30.
    for _opens, closes in r.hours.get(yesterday, []):
        if closes > 1440 and minute + 1440 < closes:
            return True
    return False


def _category_keys(r: Restaurant) -> list[str]:
    return keys_for_codes(r.cuisines)


def _is_cafe_only(r: Restaurant) -> bool:
    keys = _category_keys(r)
    return bool(keys) and all(k in CAFE_KEYS for k in keys)


def _codes_for(keys) -> frozenset[str]:
    return frozenset(code for key in keys for code in CUISINE_GROUPS.get(key, ()))


# ---------- Stage 1: hard limits (BE-14) ----------

def filter_candidates(restaurants, people: list[Preferences], when: datetime,
                      lat: float | None = None, lon: float | None = None):
    """Places that every person can accept. Returns a list of (restaurant, distance_km or None).

    Raises LocationRequired when someone set a distance limit and no location was sent.
    """
    limits = [p.max_distance_km for p in people if p.max_distance_km]
    has_location = lat is not None and lon is not None
    if limits and not has_location:
        raise LocationRequired()
    max_km = min(limits) if limits else None
    anyone_wants_cafes = any(k in CAFE_KEYS for p in people for k in p.liked_cuisines)

    kept = []
    for r in restaurants:
        if r.venue_type in EXCLUDED_VENUES or EXCLUDED_FLAGS.intersection(r.flags):
            continue
        if is_open(r, when) is not True:          # closed, or hours unknown (D04)
            continue
        if not _within_every_budget(r, people):
            continue
        if not anyone_wants_cafes and _is_cafe_only(r):
            continue
        d = distance_km(lat, lon, r.lat, r.lon) if has_location else None
        if max_km is not None and d > max_km:
            continue
        kept.append((r, d))
    return kept


def _within_every_budget(r: Restaurant, people: list[Preferences]) -> bool:
    """The place's spend range must touch every person's budget range."""
    for p in people:
        if p.budget_max is not None and r.spend_low > p.budget_max:
            return False
        if p.budget_min is not None and r.spend_high < p.budget_min:
            return False
    return True


# ---------- Stage 2: one person's score (BE-15) ----------

def person_score(r: Restaurant, d: float | None, p: Preferences) -> tuple[float, dict]:
    """How much one person likes one place, from 0 to 1, with its three parts."""
    # Cuisine: 1 if the place serves any category the person chose, 0 if not.
    if p.liked_cuisines:
        cuisine = 1.0 if _codes_for(p.liked_cuisines).intersection(r.cuisines) else 0.0
    else:
        cuisine = NEUTRAL

    # Price: best when the place's average spend sits in the middle of the person's budget.
    if p.budget_max is not None:
        low = p.budget_min or 0
        target = (low + p.budget_max) / 2
        width = max(p.budget_max - low, 10)
        middle = (r.spend_low + r.spend_high) / 2
        price = _clamp(1 - abs(middle - target) / width)
    else:
        price = NEUTRAL

    # Distance: 1 at the door, 0 at the person's limit. Without a location it is left out.
    if d is None:
        score = (W_CUISINE * cuisine + W_PRICE * price) / (W_CUISINE + W_PRICE)
        return score, {"cuisine": cuisine, "price": price, "distance": None}
    limit = p.max_distance_km or DEFAULT_DISTANCE_KM
    dist = _clamp(1 - d / limit)
    score = W_CUISINE * cuisine + W_PRICE * price + W_DISTANCE * dist
    return score, {"cuisine": cuisine, "price": price, "distance": dist}


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def quality(r: Restaurant) -> float:
    """quality_score (about 2 to 5) mapped to 0..1. Unknown quality is neutral."""
    if r.quality_score is None:
        return NEUTRAL
    return _clamp((float(r.quality_score) - 3) / 2)


# ---------- Stage 3: the list (BE-15) ----------

def recommend(restaurants, people: list[Preferences], when: datetime,
              lat: float | None = None, lon: float | None = None, limit: int = 5) -> list[Recommendation]:
    """The ranked list for one person or a group. An empty list is a valid answer, not an error."""
    if not people:
        people = [Preferences()]
    candidates = filter_candidates(restaurants, people, when, lat, lon)

    scored = []
    for r, d in candidates:
        results = [person_score(r, d, p) for p in people]
        scores = [s for s, _ in results]
        lowest = min(scores)
        if lowest < MISERY:                       # one unhappy person removes the place
            continue
        average = sum(scores) / len(scores)
        final = (1 - W_QUALITY) * average + W_QUALITY * quality(r)
        scored.append((final, lowest, quality(r), r, d, scores, [parts for _, parts in results]))

    # Stable order: final score, then the least happy person, then quality, then id.
    scored.sort(key=lambda x: (-x[0], -x[1], -x[2], x[3].id))
    picks = _pick(scored, people, limit)
    return [_to_recommendation(rank, item, people) for rank, item in enumerate(picks, start=1)]


def _pick(scored, people, limit):
    """Take the best places, making sure each person gets one that fits their taste,
    with one branch per brand and at most MAX_PER_CATEGORY per main category."""
    chosen, chosen_ids, brands, per_category = [], set(), set(), {}

    def main_category(r):
        keys = _category_keys(r)
        return keys[0] if keys else None

    def brand_free(r):
        return r.brand_id is None or r.brand_id not in brands

    def free(item):
        return item[3].id not in chosen_ids and brand_free(item[3])

    def take(item):
        r = item[3]
        chosen.append(item)
        chosen_ids.add(r.id)
        if r.brand_id is not None:
            brands.add(r.brand_id)
        cat = main_category(r)
        per_category[cat] = per_category.get(cat, 0) + 1

    # 1. Coverage: people with the fewest choices first, so narrow tastes are served.
    for p in sorted((p for p in people if p.liked_cuisines), key=lambda p: len(p.liked_cuisines)):
        if len(chosen) >= limit:
            break
        codes = _codes_for(p.liked_cuisines)
        if any(codes.intersection(item[3].cuisines) for item in chosen):
            continue
        for item in scored:
            if free(item) and codes.intersection(item[3].cuisines):
                take(item)
                break

    # 2. Fill by rank, respecting the category cap.
    for item in scored:
        if len(chosen) >= limit:
            break
        if free(item) and per_category.get(main_category(item[3]), 0) < MAX_PER_CATEGORY:
            take(item)

    # 3. If the cap left the list short, fill the rest by rank.
    for item in scored:
        if len(chosen) >= limit:
            break
        if free(item):
            take(item)

    # Show the chosen places in score order, not in the order they were picked.
    position = {item[3].id: i for i, item in enumerate(scored)}
    return sorted(chosen, key=lambda item: position[item[3].id])


def _to_recommendation(rank, item, people):
    final, _lowest, q, r, d, scores, parts = item
    reasons = []
    stated = [pt for p, pt in zip(people, parts) if p.liked_cuisines]
    if stated and all(pt["cuisine"] == 1.0 for pt in stated):
        reasons.append("taste")
    if any(p.budget_max is not None or p.budget_min is not None for p in people):
        reasons.append("budget")
    if d is not None:
        reasons.append("distance")
    if q >= 0.75:
        reasons.append("quality")
    return Recommendation(
        restaurant=r,
        rank=rank,
        match_score=round(final * 100),
        reasons=reasons,
        distance_km=None if d is None else round(d, 1),
        person_scores=scores,
    )
