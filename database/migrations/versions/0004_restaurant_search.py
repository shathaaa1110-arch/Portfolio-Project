"""Fast restaurant search by Arabic or English name (#46).

Adds restaurants.search_text: a generated column holding the normalized names
(app/services/restaurants/search.py, NORMALIZE_SQL). PostgreSQL fills it for every
existing row and keeps it right for every future insert or update, so a later data
import needs no extra step. A pg_trgm GIN index makes `search_text LIKE '%term%'`
use the index instead of scanning every row.

The restaurants table is created outside Alembic (draft schema + data import), so a
fresh database built only from migrations has no table yet: then this revision does nothing.
"""
import sqlalchemy as sa
from alembic import op

revision = "0004_restaurant_search"
down_revision = "0003_account_preferences"
branch_labels = None
depends_on = None

# Copied, not imported: a migration must keep working even if the app code changes later.
# tests/test_restaurant_search_integration.py checks it still equals search.NORMALIZE_SQL.
NORMALIZE_SQL = (
    "regexp_replace(regexp_replace(translate(lower({col}), 'أإآٱىةـ', 'اااايه'),"
    " '[\\u064B-\\u065F\\u0670]', '', 'g'), '\\s+', ' ', 'g')"
)
NAMES = "name_ar || ' ' || coalesce(name_en, '')"


def upgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table("restaurants"):
        return
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "ALTER TABLE restaurants ADD COLUMN search_text TEXT "
        f"GENERATED ALWAYS AS ({NORMALIZE_SQL.format(col=f'({NAMES})')}) STORED"
    )
    op.execute("CREATE INDEX ix_restaurants_search_text ON restaurants USING gin (search_text gin_trgm_ops)")


def downgrade() -> None:
    # Only what this revision added; the shared extension stays installed.
    if not sa.inspect(op.get_bind()).has_table("restaurants"):
        return
    op.execute("DROP INDEX IF EXISTS ix_restaurants_search_text")
    op.execute("ALTER TABLE restaurants DROP COLUMN IF EXISTS search_text")
