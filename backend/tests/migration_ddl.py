"""The final shapes of plan_items and votes, taken from migration 0012 (DB-07), so the scratch copies
the tests build in their own schema can never drift from the real tables."""
import importlib.util
from pathlib import Path

_PATH = Path(__file__).resolve().parents[2] / "database/migrations/versions/0012_outing_rounds.py"
_spec = importlib.util.spec_from_file_location("m0012", _PATH)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)

PLAN_ITEMS = _module.PLAN_ITEMS
VOTES = _module.VOTES
