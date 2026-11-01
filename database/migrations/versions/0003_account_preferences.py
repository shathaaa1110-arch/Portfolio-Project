"""Persist account preferences without creating Sprint 2 tables (DB-14).

Existing shared tables retain participant ownership and data. Failures roll back
under Alembic's PostgreSQL transaction; never repair or discard ambiguous data.
"""
import json

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

revision = "0003_account_preferences"
down_revision = "0002_account_keys_and_phone"
branch_labels = None
depends_on = None


def fail(message):
    raise RuntimeError(f"DB-14: {message}. No automatic data repair; resolve and retry.")


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if not inspector.has_table("preferences"):
        op.create_table(
            "preferences",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("liked_cuisines", ARRAY(sa.Text())),
            sa.Column("allergies", ARRAY(sa.Text())),
            sa.Column("budget_min", sa.Integer()),
            sa.Column("budget_max", sa.Integer()),
            sa.Column("max_distance_km", sa.Numeric()),
            sa.Column("seating_needs", sa.Text()),
            sa.UniqueConstraint("user_id", name="preferences_user_unique"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="preferences_user_id_fkey"),
        )
    # Hold the table stable between preflight and constraint installation.
    conn.execute(sa.text("LOCK TABLE preferences IN ACCESS EXCLUSIVE MODE"))
    inspector = sa.inspect(conn)
    columns = {c["name"]: c for c in inspector.get_columns("preferences")}
    required = {"id", "user_id", "liked_cuisines", "allergies", "budget_min",
                "budget_max", "max_distance_km", "seating_needs"}
    if not required <= columns.keys():
        fail("incompatible preferences columns")
    for name in ("id", "user_id"):
        if not isinstance(columns[name]["type"], sa.Uuid):
            fail(f"{name} must be UUID")
    if inspector.get_pk_constraint("preferences")["constrained_columns"] != ["id"]:
        fail("preferences must have a primary key on id")
    for name in ("budget_min", "budget_max"):
        if not isinstance(columns[name]["type"], sa.Integer):
            fail(f"{name} must contain whole SAR integers")
    if not isinstance(columns["max_distance_km"]["type"], (sa.Integer, sa.Numeric)):
        fail("unsupported distance type")
    shared = "participant_id" in columns
    if shared:
        if not isinstance(columns["participant_id"]["type"], sa.Uuid):
            fail("participant_id must be UUID")
        # Do not create or repair Sprint 2 foreign keys here.
        if not any(f["constrained_columns"] == ["participant_id"] and
                   f["referred_table"] == "participants" and f["referred_columns"] == ["id"]
                   for f in inspector.get_foreign_keys("preferences")):
            fail("legacy participant foreign key is missing; resolve under #12")
        bad_owner = "(user_id IS NULL) = (participant_id IS NULL)"
    else:
        bad_owner = "user_id IS NULL"
    if conn.execute(sa.text(f"SELECT EXISTS (SELECT 1 FROM preferences WHERE {bad_owner})")).scalar():
        fail("preferences have missing or conflicting owners")
    if conn.execute(sa.text("""SELECT EXISTS (
        SELECT 1 FROM preferences p LEFT JOIN users u ON u.id=p.user_id
        WHERE p.user_id IS NOT NULL AND u.id IS NULL)
        OR EXISTS (SELECT 1 FROM preferences WHERE user_id IS NOT NULL
        GROUP BY user_id HAVING count(*) > 1)""")).scalar():
        fail("orphaned or duplicate account preferences")

    checks = {
        "preferences_budget_min_nonnegative": "budget_min >= 0",
        "preferences_budget_max_nonnegative": "budget_max >= 0",
        "preferences_budget_order": "budget_min <= budget_max",
        "preferences_distance_positive": "max_distance_km > 0 AND max_distance_km::text NOT IN ('NaN', 'Infinity', '-Infinity')",
    }
    for name, rule in checks.items():
        if conn.execute(sa.text(f"SELECT EXISTS (SELECT 1 FROM preferences WHERE user_id IS NOT NULL AND NOT ({rule}))")).scalar():
            fail(f"existing account values violate {name}")

    # Parse before altering either list column; retain NULL and empty arrays.
    for name in ("liked_cuisines", "allergies"):
        column_type = columns[name]["type"]
        if isinstance(column_type, ARRAY) and isinstance(column_type.item_type, sa.Text):
            continue
        if not isinstance(column_type, sa.Text):
            fail(f"unsupported {name} storage")
        converted = []
        for row_id, raw in conn.execute(sa.text(f"SELECT id, {name} FROM preferences WHERE {name} IS NOT NULL")):
            try:
                if raw.lstrip().startswith("["):
                    values = json.loads(raw)
                elif raw.lstrip().startswith("{"):
                    with conn.begin_nested():
                        values = conn.execute(sa.text("SELECT CAST(:value AS text[])"), {"value": raw}).scalar_one()
                else:
                    raise ValueError()
                if not isinstance(values, list) or any(not isinstance(v, str) for v in values):
                    raise ValueError()
            except (ValueError, sa.exc.DBAPIError):
                fail(f"ambiguous {name} value at preference {row_id}")
            converted.append((row_id, values))
        # Store canonical PostgreSQL literals before the type cast, in this transaction.
        for row_id, values in converted:
            stmt = sa.text(f"UPDATE preferences SET {name} = CAST(:values AS text) WHERE id = :id").bindparams(
                sa.bindparam("values", type_=ARRAY(sa.Text())), sa.bindparam("id", type_=sa.Uuid()))
            conn.execute(stmt, {"id": row_id, "values": values})
        op.alter_column("preferences", name, type_=ARRAY(sa.Text()), postgresql_using=f"{name}::text[]")

    op.alter_column("preferences", "max_distance_km", type_=sa.Numeric(), postgresql_using="max_distance_km::numeric")
    if not shared:
        op.alter_column("preferences", "user_id", nullable=False)
    else:
        # Replace only the ownership check, preserving participant keys and values.
        existing = {c["name"] for c in inspector.get_check_constraints("preferences")}
        if "preferences_exactly_one_owner" in existing:
            op.drop_constraint("preferences_exactly_one_owner", "preferences", type_="check")
        op.create_check_constraint("preferences_exactly_one_owner", "preferences", "(user_id IS NULL) <> (participant_id IS NULL)")
    if not any(c["column_names"] == ["user_id"] for c in inspector.get_unique_constraints("preferences")):
        op.create_unique_constraint("preferences_user_unique", "preferences", ["user_id"])
    if not any(f["constrained_columns"] == ["user_id"] and f["referred_table"] == "users" and
               f["referred_columns"] == ["id"] for f in inspector.get_foreign_keys("preferences")):
        op.create_foreign_key("preferences_user_id_fkey", "preferences", "users", ["user_id"], ["id"])
    for name, rule in checks.items():
        op.create_check_constraint(name, "preferences", f"user_id IS NULL OR ({rule})" if shared else rule)


def downgrade():
    raise RuntimeError("DB-14 downgrade refused: preserve saved data; use a reviewed forward migration.")
