"""Unit tests for the recommendation engine (BE-14 filter, BE-15 ranking). No database.

Cases follow TechnicalDoc 6.9 plus the rules decided in P-02 #8 and D04.
"""
from datetime import datetime

import pytest

from app.services.plan.cuisines import CUISINE_GROUPS, keys_for_codes
from app.services.plan.engine import (
    MISERY,
    LocationRequired,
    Preferences,
    Restaurant,
    distance_km,
    filter_candidates,
    is_open,
    recommend,
)
from app.services.plan.reasons import reason_text

MONDAY_8PM = datetime(2026, 11, 2, 20, 0)   # weekday() == 0
LAT, LON = 24.7136, 46.6753                  # meeting point in Riyadh
KM = 1 / 111                                 # about one kilometre of latitude

ALL_DAY = {d: [(0, 1440)] for d in range(7)}


def place(id, cuisines=("italian",), km=1.0, low=40, high=80, quality=4.0, brand=None,
          hours=ALL_DAY, venue=None, flags=()):
    return Restaurant(id=id, cuisines=tuple(cuisines), lat=LAT + km * KM, lon=LON,
                      spend_low=low, spend_high=high, quality_score=quality, brand_id=brand,
                      venue_type=venue, flags=tuple(flags), hours=hours)


def ids(recs):
    return [r.restaurant.id for r in recs]


# ---------- cuisines ----------

def test_eighteen_categories_and_no_shared_codes():
    codes = [c for group in CUISINE_GROUPS.values() for c in group]
    assert len(CUISINE_GROUPS) == 18
    assert len(codes) == len(set(codes))


def test_keys_for_codes_skips_unknown_and_repeats():
    assert keys_for_codes(["pizza", "italian", "other", "grill_bbq"]) == ["italian", "grill"]


# ---------- opening hours ----------

def test_open_period_past_midnight_counts_on_both_days():
    late = place(1, hours={d: [(16 * 60, 25 * 60 + 30)] for d in range(7)})   # 16:00 to 01:30
    assert is_open(late, datetime(2026, 11, 2, 23, 0)) is True
    assert is_open(late, datetime(2026, 11, 3, 1, 0)) is True     # still Monday's period
    assert is_open(late, datetime(2026, 11, 3, 2, 0)) is False
    assert is_open(late, datetime(2026, 11, 3, 12, 0)) is False


def test_closed_day_and_unknown_hours():
    closed_monday = place(1, hours={d: [(600, 1320)] for d in range(1, 7)})
    assert is_open(closed_monday, MONDAY_8PM) is False
    assert is_open(place(2, hours=None), MONDAY_8PM) is None


# ---------- stage 1: hard limits ----------

def test_unknown_hours_are_excluded():
    kept = filter_candidates([place(1), place(2, hours=None)], [Preferences()], MONDAY_8PM, LAT, LON)
    assert [r.id for r, _ in kept] == [1]


def test_budget_ranges_must_touch_everyone():
    people = [Preferences(budget_min=30, budget_max=100)]
    places = [place(1, low=20, high=50), place(2, low=90, high=200),
              place(3, low=150, high=300), place(4, low=5, high=20), place(5, low=100, high=180)]
    kept = filter_candidates(places, people, MONDAY_8PM, LAT, LON)
    assert sorted(r.id for r, _ in kept) == [1, 2, 5]


def test_group_lowest_budget_wins():
    people = [Preferences(budget_max=150), Preferences(budget_max=80)]
    kept = filter_candidates([place(1, low=70), place(2, low=90)], people, MONDAY_8PM, LAT, LON)
    assert [r.id for r, _ in kept] == [1]


def test_shortest_distance_limit_wins():
    people = [Preferences(max_distance_km=10), Preferences(max_distance_km=3)]
    kept = filter_candidates([place(1, km=2), place(2, km=5)], people, MONDAY_8PM, LAT, LON)
    assert [r.id for r, _ in kept] == [1]


def test_distance_limit_without_location_is_an_error():
    with pytest.raises(LocationRequired):
        filter_candidates([place(1)], [Preferences(max_distance_km=5)], MONDAY_8PM)


def test_no_limit_and_no_location_still_works():
    kept = filter_candidates([place(1)], [Preferences()], MONDAY_8PM)
    assert kept[0][1] is None


def test_cafes_only_when_someone_chose_them():
    places = [place(1, ("specialty_coffee",)), place(2, ("italian", "desserts"))]
    nobody = filter_candidates(places, [Preferences()], MONDAY_8PM, LAT, LON)
    someone = filter_candidates(places, [Preferences(), Preferences(liked_cuisines=("coffee_tea",))],
                                MONDAY_8PM, LAT, LON)
    assert [r.id for r, _ in nobody] == [2]        # a mixed place is not cafe-only
    assert sorted(r.id for r, _ in someone) == [1, 2]


def test_never_suggested_venues_and_flags():
    places = [place(1), place(2, venue="cloud_kitchen"), place(3, venue="catering"),
              place(4, flags=("virtual_brand_or_cloud_kitchen",)), place(5, flags=("possibly_not_food",))]
    kept = filter_candidates(places, [Preferences()], MONDAY_8PM, LAT, LON)
    assert [r.id for r, _ in kept] == [1]


# ---------- stage 2 and 3: ranking ----------

def test_no_match_returns_empty_list():
    assert recommend([place(1, low=200, high=300)], [Preferences(budget_max=50)], MONDAY_8PM, LAT, LON) == []


def test_cuisine_match_ranks_higher():
    people = [Preferences(liked_cuisines=("italian",)), Preferences(liked_cuisines=("italian",)),
              Preferences(liked_cuisines=("asian",))]
    recs = recommend([place(1, ("italian",)), place(2, ("japanese_sushi",))], people, MONDAY_8PM, LAT, LON)
    assert ids(recs)[0] == 1


def test_one_branch_per_brand():
    places = [place(1, brand=7), place(2, brand=7, km=1.5), place(3, ("saudi",))]
    recs = recommend(places, [Preferences()], MONDAY_8PM, LAT, LON)
    assert sorted(ids(recs)) == [1, 3]


def test_every_person_gets_a_match_in_a_split_group():
    people = [Preferences(liked_cuisines=("italian",))] * 3 + [Preferences(liked_cuisines=("indian",))]
    places = [place(i, ("italian",), quality=4.8) for i in range(1, 8)] + [place(20, ("indian",), quality=3.5)]
    recs = recommend(places, people, MONDAY_8PM, LAT, LON, limit=3)
    assert 20 in ids(recs)


def test_at_most_two_per_category_when_others_exist():
    places = [place(i, ("burgers",), quality=4.9) for i in range(1, 6)] + [place(10, ("saudi",)), place(11, ("pizza",))]
    recs = recommend(places, [Preferences()], MONDAY_8PM, LAT, LON, limit=4)
    assert sum(1 for r in recs if r.restaurant.cuisines == ("burgers",)) == 2


def test_category_cap_does_not_shrink_the_list():
    places = [place(i, ("burgers",)) for i in range(1, 6)]
    assert len(recommend(places, [Preferences()], MONDAY_8PM, LAT, LON, limit=4)) == 4


def test_misery_removes_a_place_one_person_dislikes():
    # Person 2 only likes asian food and has a tight budget far from this place: score < MISERY.
    people = [Preferences(liked_cuisines=("italian",)),
              Preferences(liked_cuisines=("asian",), budget_min=10, budget_max=45, max_distance_km=2)]
    italian = place(1, ("italian",), low=40, high=80, km=1.9)
    assert len(filter_candidates([italian], people, MONDAY_8PM, LAT, LON)) == 1   # passes the limits
    assert recommend([italian], people, MONDAY_8PM, LAT, LON) == []               # but misery removes it


def test_every_suggestion_is_above_misery():
    people = [Preferences(liked_cuisines=("italian",)), Preferences(liked_cuisines=("saudi_gulf",), budget_max=60)]
    places = [place(i, (code,), low=20 + i * 5, high=60 + i * 5, km=i * 0.7)
              for i, code in enumerate(["pizza", "saudi", "indian", "italian", "yemeni", "burgers"], 1)]
    for rec in recommend(places, people, MONDAY_8PM, LAT, LON):
        assert min(rec.person_scores) >= MISERY


def test_empty_answers_rank_by_quality():
    places = [place(1, quality=3.2), place(2, ("saudi",), quality=4.7), place(3, ("indian",), quality=4.1)]
    recs = recommend(places, [Preferences(), Preferences()], MONDAY_8PM, LAT, LON)
    assert ids(recs) == [2, 3, 1]


def test_single_person_uses_the_same_engine():
    recs = recommend([place(1, ("saudi",)), place(2, ("italian",))],
                     [Preferences(liked_cuisines=("saudi_gulf",))], MONDAY_8PM, LAT, LON)
    assert ids(recs)[0] == 1
    assert "taste" in recs[0].reasons


def test_same_input_same_order_and_ranks_start_at_one():
    places = [place(i, quality=4.0) for i in range(10, 0, -1)]
    first = recommend(places, [Preferences()], MONDAY_8PM, LAT, LON)
    again = recommend(places, [Preferences()], MONDAY_8PM, LAT, LON)
    assert ids(first) == ids(again)
    assert [r.rank for r in first] == list(range(1, len(first) + 1))


def test_match_score_and_distance_are_rounded():
    rec = recommend([place(1, km=2.345)], [Preferences()], MONDAY_8PM, LAT, LON)[0]
    assert 0 <= rec.match_score <= 100 and isinstance(rec.match_score, int)
    assert rec.distance_km == round(distance_km(LAT, LON, rec.restaurant.lat, rec.restaurant.lon), 1)


def test_limit_is_respected():
    places = [place(i, (code,)) for i, code in enumerate(["saudi", "pizza", "indian", "turkish", "chinese", "burgers"], 1)]
    assert len(recommend(places, [Preferences()], MONDAY_8PM, LAT, LON, limit=3)) == 3


# ---------- Arabic reason (BE-15) ----------

def test_reason_text_joins_real_parts_only():
    assert reason_text(["taste", "budget", "distance"], 1.9) == "يناسب ذوقك، ضمن ميزانيتك ويبعد 1.9 كم"
    assert reason_text(["quality"], None) == "تقييمه عالي"
    assert reason_text(["distance"], None) == "مفتوح الحين"     # no location: no distance is invented
    assert reason_text([], None) == "مفتوح الحين"


def test_every_recommendation_gets_an_arabic_reason():
    recs = recommend([place(1, ("saudi",), quality=4.8)], [Preferences(liked_cuisines=("saudi_gulf",), budget_max=100)],
                     MONDAY_8PM, LAT, LON)
    assert reason_text(recs[0].reasons, recs[0].distance_km) == "يناسب ذوقك، ضمن ميزانيتك، تقييمه عالي ويبعد 1 كم"
