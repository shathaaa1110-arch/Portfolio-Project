"""Log out ends every login token of the account (security review, 12 Nov 2026).

A login token is a signed JWT valid for 30 days; signing alone cannot take one back. Each token
now carries the account's token_version ("ver"), and every request compares it with this column.
POST /auth/logout raises the column by one, so every token issued before it stops working at once,
on every device, even one that was stolen. Tokens issued before this revision have no "ver" and
count as version 0, so nobody is logged out by the deploy itself.
"""
import sqlalchemy as sa
from alembic import op

revision = "0013_user_token_version"
down_revision = "0012_outing_rounds"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))
    op.create_check_constraint("users_token_version_not_negative", "users", "token_version >= 0")


def downgrade() -> None:
    raise RuntimeError("0013 downgrade refused: dropping the column would bring logged-out tokens back to life.")
