"""BE-29 (#88): an organizer can remove a participant before generation.

Adds 'removed' to the allowed attendance values. A person who leaves by themselves is stored as
'declined' (they may rejoin from the link while the outing is open); 'removed' blocks rejoining.
"""
from alembic import op

revision = "0010_participant_removed"
down_revision = "0009_otp_codes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE participants DROP CONSTRAINT participants_attendance_check")
    op.execute("ALTER TABLE participants ADD CONSTRAINT participants_attendance_check "
               "CHECK (attendance IN ('pending', 'confirmed', 'declined', 'removed'))")


def downgrade() -> None:
    raise RuntimeError("BE-29 downgrade refused: removed participants would break the old rule; "
                       "use a forward migration.")
