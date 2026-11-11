"""BE-25 (#80): one row per push notification, so a retry never sends or records it twice.

A row is written in the same transaction that starts voting or settles the result, and sent after
that commit. The unique key (outing, round, kind, account) is the deduplication key: asking again
adds nothing. round_key is '1' until rounds exist (DB-07 #14, BE-31 #90).
"""
import sqlalchemy as sa
from alembic import op

revision = "0011_notification_events"
down_revision = "0010_participant_removed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notification_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("outing_id", sa.Uuid(), nullable=False),
        sa.Column("round_key", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("push_token", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="notification_events_pkey"),
        sa.ForeignKeyConstraint(["outing_id"], ["outings.id"], name="notification_events_outing_id_fkey"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="notification_events_user_id_fkey"),
        sa.UniqueConstraint("outing_id", "round_key", "kind", "user_id", name="notification_events_once"),
        sa.CheckConstraint("kind IN ('voting_started', 'result')", name="notification_events_kind_check"),
        sa.CheckConstraint("status IN ('pending', 'sent', 'failed')", name="notification_events_status_check"),
    )
    op.create_index("ix_notification_events_pending", "notification_events", ["status"],
                    postgresql_where=sa.text("status = 'pending'"))


def downgrade() -> None:
    raise RuntimeError("BE-25 downgrade refused: keep the delivery history; use a forward migration.")
