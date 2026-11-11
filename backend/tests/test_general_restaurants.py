"""DB-13 source validation does not require a database."""
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("general_seed", ROOT / "database/seed_general_restaurants.py")
seed_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed_module)


def test_sample_is_explicit_and_uses_supported_cuisines():
    from app.services.restaurants.search import CODE_LABELS_AR
    rows = seed_module.read_source()
    assert len(rows) == 8
    for row in rows:
        assert set(row["cuisine"].split(",")) <= set(CODE_LABELS_AR)
        assert row["image_url"] is None and row["rating"] is None
        assert row["opening_hours"] is None and row["spend_low"] is None


@pytest.mark.parametrize("bad", ["duplicate", "unlabelled", "invented", "missing", "invalid_id"])
def test_invalid_source_rejected(tmp_path, bad):
    data = json.loads(seed_module.SOURCE.read_text())
    row = data["restaurants"][0]
    if bad == "duplicate":
        data["restaurants"][1]["id"] = row["id"]
    elif bad == "unlabelled":
        row["name_ar"] = "مطعم"
    elif bad == "invented":
        row["rating"] = 5
    elif bad == "missing":
        del row["image_url"]
    else:
        row["id"] = -1
    path = tmp_path / "sample.json"
    path.write_text(json.dumps(data))
    with pytest.raises(seed_module.SeedError):
        seed_module.read_source(path)
