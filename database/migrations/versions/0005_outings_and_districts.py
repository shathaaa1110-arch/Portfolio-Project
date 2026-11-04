"""Outing tables and the district list for sessions (BE-08, with DB-04 #12).

The draft schema created groups, group_members, outings and participants by hand on
Neon, so a database built only from migrations had none of them. This revision:

  - creates those four tables when they are missing, as in TechnicalDoc section 2;
  - on an existing database, converts their time columns to timestamptz (the document's
    type; the draft used timestamp) and adds the rules the document says the database
    enforces: one open outing per invite code, and the allowed status and attendance values;
  - gives preferences a participant owner on a clean install (Neon already has it),
    so a set belongs to exactly one account or one participant;
  - creates `districts` and loads the 171 Riyadh districts from database/seed, so
    BE-08 can reject an unknown area and GET /districts can list them.

Existing rows that break a new rule make the migration fail and roll back; nothing
is repaired automatically. Downgrade is refused, as in 0003, to protect saved data.
"""
import json
from pathlib import Path

import sqlalchemy as sa
from alembic import op

revision = "0005_outings_and_districts"
down_revision = "0004_restaurant_search"
branch_labels = None
depends_on = None

SEED = Path(__file__).resolve().parents[2] / "seed" / "riyadh_districts.json"
STATUSES = ("invite", "preferences", "voting", "tiebreak", "result")
ATTENDANCE = ("pending", "confirmed", "declined")
# Columns that the document types as timestamptz, per table.
TZ_COLUMNS = {
    "groups": ("created_at",),
    "group_members": ("joined_at",),
    "outings": ("starts_at", "tiebreak_ends_at", "created_at"),
}

CREATE = {
    "groups": """
        CREATE TABLE groups (
            id uuid PRIMARY KEY,
            name TEXT NOT NULL,
            organizer_id uuid NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL)""",
    "group_members": """
        CREATE TABLE group_members (
            group_id uuid NOT NULL REFERENCES groups(id),
            user_id uuid NOT NULL REFERENCES users(id),
            joined_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (group_id, user_id))""",
    "outings": """
        CREATE TABLE outings (
            id uuid PRIMARY KEY,
            group_id uuid REFERENCES groups(id),
            organizer_id uuid NOT NULL REFERENCES users(id),
            name TEXT NOT NULL,
            status TEXT NOT NULL,
            invite_code TEXT NOT NULL,
            starts_at TIMESTAMPTZ NOT NULL,
            district TEXT NOT NULL,
            tiebreak_ends_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL)""",
    "participants": """
        CREATE TABLE participants (
            id uuid PRIMARY KEY,
            outing_id uuid NOT NULL REFERENCES outings(id),
            user_id uuid REFERENCES users(id),
            guest_name TEXT,
            attendance TEXT NOT NULL,
            preferences_done BOOLEAN NOT NULL,
            CONSTRAINT participants_check CHECK ((user_id IS NULL) <> (guest_name IS NULL)),
            CONSTRAINT participants_outing_user_unique UNIQUE (outing_id, user_id))""",
}


def _quoted(values):
    return ", ".join(f"'{v}'" for v in values)


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # 1. Outing tables, in foreign-key order.
    for table in ("groups", "group_members", "outings", "participants"):
        if not inspector.has_table(table):
            op.execute(CREATE[table])
            continue
        for column in TZ_COLUMNS.get(table, ()):
            kind = {c["name"]: c["type"] for c in inspector.get_columns(table)}[column]
            if isinstance(kind, sa.DateTime) and not kind.timezone:
                # The draft stored UTC wall-clock values, like users.created_at.
                op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE TIMESTAMPTZ "
                           f"USING {column} AT TIME ZONE 'UTC'")

    # 2. Rules the document says the database enforces.
    op.execute(f"ALTER TABLE outings ADD CONSTRAINT outings_status_check CHECK (status IN ({_quoted(STATUSES)}))")
    op.execute("ALTER TABLE outings ADD CONSTRAINT outings_invite_code_format CHECK (invite_code ~ '^[A-Z0-9]{4}$')")
    # A code is reused once its outing reaches the result stage, so uniqueness covers open outings only.
    op.execute("CREATE UNIQUE INDEX ux_outings_open_invite_code ON outings (invite_code) WHERE status <> 'result'")
    op.execute(f"ALTER TABLE participants ADD CONSTRAINT participants_attendance_check "
               f"CHECK (attendance IN ({_quoted(ATTENDANCE)}))")

    # 3. A preferences set has exactly one owner: an account or one outing's participant.
    columns = {c["name"] for c in inspector.get_columns("preferences")}
    if "participant_id" not in columns:
        op.add_column("preferences", sa.Column("participant_id", sa.Uuid(), nullable=True))
        op.create_foreign_key("preferences_participant_id_fkey", "preferences", "participants",
                              ["participant_id"], ["id"])
        op.create_unique_constraint("preferences_participant_unique", "preferences", ["participant_id"])
        op.alter_column("preferences", "user_id", nullable=True)
        op.create_check_constraint("preferences_exactly_one_owner", "preferences",
                                   "(user_id IS NULL) <> (participant_id IS NULL)")

    # 4. The district list. Kept if it already exists (a local dev database may have it).
    if not inspector.has_table("districts"):
        op.execute("""
            CREATE TABLE districts (
                id TEXT PRIMARY KEY,
                name_ar TEXT NOT NULL,
                name_en TEXT,
                latitude NUMERIC NOT NULL,
                longitude NUMERIC NOT NULL)""")
    districts = json.loads(SEED.read_text(encoding="utf-8"))["districts"]
    conn.execute(
        sa.text("INSERT INTO districts (id, name_ar, name_en, latitude, longitude) "
                "VALUES (:id, :name_ar, :name_en, :latitude, :longitude) ON CONFLICT (id) DO NOTHING"),
        districts,
    )


def downgrade() -> None:
    raise RuntimeError("0005 downgrade refused: preserve outings and saved data; use a reviewed forward migration.")
