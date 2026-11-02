"""QA-01 (#56): the shared restaurant sample is synthetic, valid and has gaps on purpose."""
from urllib.parse import urlparse

# Matches the restaurants table in database/schema.sql until its migration exists
COLUMNS = {
    "id", "name_ar", "name_en", "brand_id", "cuisine", "district", "latitude", "longitude",
    "spend_low", "spend_high", "price_tier", "rating", "rating_count", "quality_score",
    "group_fit", "meal_fit_breakfast", "meal_fit_late_night", "opening_hours", "summary", "maps_url",
}
REQUIRED = {
    "id", "name_ar", "cuisine", "district", "latitude", "longitude",
    "spend_low", "spend_high", "price_tier", "maps_url",
}


def test_every_row_has_exactly_the_table_columns(synthetic_restaurants):
    for row in synthetic_restaurants:
        assert set(row) == COLUMNS


def test_required_fields_are_valid_and_ids_are_unique(synthetic_restaurants):
    ids = [row["id"] for row in synthetic_restaurants]
    assert len(ids) == len(set(ids))
    for row in synthetic_restaurants:
        assert all(row[column] is not None for column in REQUIRED)
        assert 1 <= row["price_tier"] <= 4
        assert row["spend_low"] <= row["spend_high"]


def test_every_row_is_clearly_synthetic(synthetic_restaurants):
    for row in synthetic_restaurants:
        assert "تجريبي" in row["name_ar"]
        assert urlparse(row["maps_url"]).hostname == "example.com"


def test_every_optional_column_is_missing_in_some_row(synthetic_restaurants):
    for column in COLUMNS - REQUIRED:
        assert any(row[column] is None for row in synthetic_restaurants), column
