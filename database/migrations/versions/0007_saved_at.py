"""BE-33: when each restaurant was saved, so the list shows the newest first (#126).

0006 (DB-15) created saved_restaurants with the pair key only. Rows saved before this
migration get the time of the upgrade. The primary key already leads with user_id, so one
account's saves are read from that index; no new index is needed.
"""
import sqlalchemy as sa
from alembic import op

revision = "0007_saved_at"
down_revision = "0006_saved_restaurants"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("saved_restaurants", sa.Column(
        "saved_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")))


def downgrade() -> None:
    # Only the order is lost; the saved pairs stay.
    op.drop_column("saved_restaurants", "saved_at")
