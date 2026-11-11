"""DB-08 (#15): persist locally verified login codes without losing draft rows."""
import sqlalchemy as sa
from alembic import op

revision = "0009_otp_codes"
down_revision = "0008_general_restaurants"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("otp_codes"):
        op.create_table(
            "otp_codes",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("phone", sa.Text(), nullable=False),
            sa.Column("code_hash", sa.Text(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("used_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id", name="otp_codes_pkey"),
        )
    else:
        expected = {
            "id": (sa.Uuid, False), "phone": (sa.Text, False),
            "code_hash": (sa.Text, False), "expires_at": (sa.DateTime, False),
            "attempts": (sa.Integer, False), "used_at": (sa.DateTime, True),
            "created_at": (sa.DateTime, False),
        }
        columns = {c["name"]: c for c in inspector.get_columns("otp_codes")}
        compatible = set(columns) == set(expected)
        for name, (kind, nullable) in expected.items():
            column = columns.get(name)
            if column is None or not isinstance(column["type"], kind):
                compatible = False
                continue
            if column["nullable"] != nullable or getattr(column["type"], "timezone", False):
                compatible = False
        if inspector.get_pk_constraint("otp_codes")["constrained_columns"] != ["id"]:
            compatible = False
        if str(columns.get("attempts", {}).get("type")) != "INTEGER":
            compatible = False
        if inspector.get_foreign_keys("otp_codes") or inspector.get_unique_constraints("otp_codes"):
            compatible = False
        if any(i.get("unique") for i in inspector.get_indexes("otp_codes")):
            compatible = False
        if columns.get("attempts", {}).get("default") not in ("0", "'0'::integer"):
            compatible = False
        if not compatible:
            raise RuntimeError(
                "DB-08: existing otp_codes differs from the documented schema. "
                "Reconcile its columns, types, nullability, id primary key and attempts "
                "default 0, without extra foreign/unique keys, before retrying; "
                "no rows have been changed."
            )

    indexes = sa.inspect(op.get_bind()).get_indexes("otp_codes")
    if not any(i["column_names"] == ["phone"] and not i.get("unique")
               and not i.get("dialect_options", {}).get("postgresql_where") for i in indexes):
        if any(i["name"] == "ix_otp_codes_phone" for i in indexes):
            raise RuntimeError("DB-08: reconcile incompatible ix_otp_codes_phone before retrying.")
        op.create_index("ix_otp_codes_phone", "otp_codes", ["phone"])


def downgrade() -> None:
    raise RuntimeError("DB-08 downgrade refused: preserve login-code state; use a forward migration.")
