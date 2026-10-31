"""Create accounts with one UUID primary key and a unique text phone (DB-03).

DB-02 is an empty baseline, so there is no deployed account table to alter.
Group and other application tables remain owned by subsequent database tasks.
"""
import sqlalchemy as sa
from alembic import op

revision = "0002_account_keys_and_phone"
down_revision = "0001_empty_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("phone_number", sa.Text(), nullable=False),
        sa.Column("push_token", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="users_pkey"),
        sa.UniqueConstraint("phone_number", name="users_phone_number_key"),
    )


def downgrade() -> None:
    op.drop_table("users")
