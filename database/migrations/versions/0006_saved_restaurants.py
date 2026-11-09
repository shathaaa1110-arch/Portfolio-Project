"""DB-15: unique saved restaurants per account (#130).

Existing parents are never rewritten. Missing restaurants use the established
schema plus the search artifacts skipped by 0004 on clean databases.
Parent deletion is restricted; remove links explicitly first. Downgrade is
refused to preserve saved data, as in 0003 and 0005.
"""
import sqlalchemy as sa
from alembic import op

revision = "0006_saved_restaurants"
down_revision = "0005_outings_and_districts"
branch_labels = None
depends_on = None

# Frozen migration definitions, independent of mutable application/schema files.
RESTAURANTS_SQL = """
CREATE TABLE restaurants (
    id INTEGER PRIMARY KEY,
    name_ar TEXT NOT NULL,
    name_en TEXT,
    brand_id INTEGER,
    cuisine TEXT NOT NULL,
    district TEXT NOT NULL,
    latitude NUMERIC NOT NULL,
    longitude NUMERIC NOT NULL,
    spend_low INTEGER NOT NULL,
    spend_high INTEGER NOT NULL,
    price_tier SMALLINT NOT NULL,
    rating NUMERIC,
    rating_count INTEGER,
    quality_score NUMERIC,
    group_fit INTEGER,
    meal_fit_breakfast SMALLINT,
    meal_fit_late_night SMALLINT,
    opening_hours JSONB,
    summary TEXT,
    maps_url TEXT NOT NULL
);
"""

NORMALIZE_SQL = (
    "regexp_replace(regexp_replace(translate(lower({col}), 'أإآٱىةـ', 'اااايه'),"
    " '[\\u064B-\\u065F\\u0670]', '', 'g'), '\\s+', ' ', 'g')"
)
NAMES = "name_ar || ' ' || coalesce(name_en, '')"
# Must stay identical to the expression in app/services/restaurants/router.py, or the index is not used.
CUISINE_CODES = "regexp_split_to_array(cuisine, '\\s*,\\s*')"


def _check_parent(inspector, table, expected_type):
    if not inspector.has_table(table):
        raise RuntimeError(f"DB-15 requires {table}; apply its prerequisite migration first.")
    columns = {column["name"]: column for column in inspector.get_columns(table)}
    key = columns.get("id")
    if (key is None or str(key["type"]) != expected_type or key["nullable"]
            or inspector.get_pk_constraint(table)["constrained_columns"] != ["id"]):
        raise RuntimeError(f"DB-15 requires {table}.id to be a {expected_type} primary key; no data was repaired.")


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("saved_restaurants"):
        raise RuntimeError("DB-15 found an unexpected saved_restaurants table; review it before retrying.")
    _check_parent(inspector, "users", "UUID")
    if inspector.has_table("restaurants"):
        _check_parent(inspector, "restaurants", "INTEGER")
    else:
        op.execute(RESTAURANTS_SQL)
        _create_search()

    op.create_table(
        "saved_restaurants",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("restaurant_id", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "restaurant_id", name="saved_restaurants_pkey"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"],
                                name="saved_restaurants_user_id_fkey", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"],
                                name="saved_restaurants_restaurant_id_fkey", ondelete="RESTRICT"),
    )
    op.create_index("ix_saved_restaurants_restaurant_id", "saved_restaurants", ["restaurant_id"])


def _create_search() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "ALTER TABLE restaurants ADD COLUMN search_text TEXT "
        f"GENERATED ALWAYS AS ({NORMALIZE_SQL.format(col=f'({NAMES})')}) STORED"
    )
    # The extension may be installed in a schema outside the table's search path.
    conn = op.get_bind()
    extension_schema = conn.execute(sa.text(
        "SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace "
        "WHERE e.extname='pg_trgm'"
    )).scalar_one()
    quoted_schema = conn.dialect.identifier_preparer.quote_schema(extension_schema)
    op.execute("CREATE INDEX ix_restaurants_search_text ON restaurants USING gin "
               f"(search_text {quoted_schema}.gin_trgm_ops)")
    op.execute(f"CREATE INDEX ix_restaurants_cuisine_codes ON restaurants USING gin ({CUISINE_CODES})")
    # Fresh statistics for the new column, so the planner estimates matches well from day one.
    op.execute("ANALYZE restaurants")


def downgrade() -> None:
    raise RuntimeError("DB-15 downgrade refused: preserve saved restaurants and parent data; use a reviewed forward migration.")
