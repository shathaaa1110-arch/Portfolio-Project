"""DB-13 (#100): optional Home data; preserve existing restaurants and references."""
import sqlalchemy as sa
from alembic import op

revision = "0008_general_restaurants"
down_revision = "0007_saved_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("restaurants", sa.Column("image_url", sa.Text(), nullable=True))
    for column in ("latitude", "longitude", "spend_low", "spend_high", "price_tier", "maps_url"):
        op.alter_column("restaurants", column, nullable=True)


def downgrade() -> None:
    raise RuntimeError("DB-13 downgrade refused: preserve optional restaurant data; use a forward migration.")
