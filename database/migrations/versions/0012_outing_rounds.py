"""Separate rounds for a retry in the same outing (DB-07 #14, for BE-31 #90).

A retry starts a new round of the same outing: same invite link and people, fresh readiness,
new suggestions and votes. Earlier rounds stay as they were, so they can still be reviewed.

This revision:
  - brings plan_items and votes under migrations. They were made by hand on Neon; a database
    built only from migrations had neither. Existing tables keep their rows and are only extended;
  - adds outing_rounds (one row per round: its number and how it ended) and round_members (who
    was in the round when its suggestions were generated, so its result is counted on them);
  - adds outings.current_round_id, the one active round. A single column cannot hold two, so the
    database itself rejects duplicate active rounds. A trigger gives every new outing round 1,
    so no outing exists without one, whatever code inserts it;
  - links every plan item to its round. A vote is for one plan item, so it belongs to that round,
    and the existing unique key already allows one vote per participant, place and round;
  - keeps an invite code for its outing until the outing is over (a day after it starts), instead
    of freeing it at the result stage. A retry reopens the outing with the same link, so the code
    must still be its own; outings_code_released_at marks when a code is free for a new outing.

Existing outings become round 1, with their plan items, and their members snapshotted from the
confirmed participants. Nothing is deleted. Downgrade is refused, as in 0005.
"""
import sqlalchemy as sa
from alembic import op

revision = "0012_outing_rounds"
down_revision = "0011_notification_events"
branch_labels = None
depends_on = None

OUTCOMES = ("no_matches",)

# Final shapes. Tests build scratch copies of plan_items and votes from these, so there is one source.
PLAN_ITEMS = """
    CREATE TABLE plan_items (
        id uuid PRIMARY KEY,
        outing_id uuid NOT NULL REFERENCES outings(id),
        round_id uuid NOT NULL,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
        rank INTEGER NOT NULL,
        match_score INTEGER NOT NULL,
        reason TEXT NOT NULL,
        is_winner BOOLEAN NOT NULL,
        CONSTRAINT plan_items_round_fkey FOREIGN KEY (outing_id, round_id) REFERENCES outing_rounds (outing_id, id),
        CONSTRAINT plan_items_round_restaurant_unique UNIQUE (round_id, restaurant_id),
        CONSTRAINT plan_items_round_rank_unique UNIQUE (round_id, rank))"""
VOTES = """
    CREATE TABLE votes (
        id uuid PRIMARY KEY,
        participant_id uuid NOT NULL REFERENCES participants(id),
        plan_item_id uuid NOT NULL REFERENCES plan_items(id),
        liked BOOLEAN NOT NULL,
        is_tiebreak BOOLEAN NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        CONSTRAINT votes_one_per_round_unique UNIQUE (participant_id, plan_item_id, is_tiebreak))"""

# Every new outing gets round 1 in the same statement. The schema comes from the trigger, so this also
# works in the scratch schemas the tests use.
FIRST_ROUND_FUNCTION = """
    CREATE OR REPLACE FUNCTION outings_first_round() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        IF TG_OP = 'INSERT' AND TG_WHEN = 'BEFORE' THEN
            IF NEW.current_round_id IS NULL THEN
                NEW.current_round_id := gen_random_uuid();
            END IF;
            RETURN NEW;
        END IF;
        EXECUTE format('INSERT INTO %I.outing_rounds (id, outing_id, number) VALUES ($1, $2, 1)
                        ON CONFLICT (id) DO NOTHING', TG_TABLE_SCHEMA)
            USING NEW.current_round_id, NEW.id;
        RETURN NULL;
    END $$"""


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # 1. Rounds. The second unique key lets other tables point at (outing, round) together,
    #    so a plan item or the active round can never belong to another outing's round.
    #    A round has no meaning without its outing, so it goes with it; a round with a plan or
    #    members still blocks that delete, so no history is lost silently.
    op.execute(f"""
        CREATE TABLE outing_rounds (
            id uuid PRIMARY KEY,
            outing_id uuid NOT NULL REFERENCES outings(id) ON DELETE CASCADE,
            number INTEGER NOT NULL CHECK (number >= 1),
            outcome TEXT CHECK (outcome IN ({", ".join(f"'{o}'" for o in OUTCOMES)})),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT outing_rounds_number_unique UNIQUE (outing_id, number),
            CONSTRAINT outing_rounds_outing_id_id_unique UNIQUE (outing_id, id))""")
    op.execute("""
        CREATE TABLE round_members (
            round_id uuid NOT NULL REFERENCES outing_rounds(id),
            participant_id uuid NOT NULL REFERENCES participants(id),
            PRIMARY KEY (round_id, participant_id))""")

    # 2. Invite codes stay with their outing until it is over. Finished outings whose day has passed free
    #    their code now; a finished outing that shares its code with a newer one frees it too. This runs
    #    before the deferred key in step 3 exists: PostgreSQL cannot build an index on a table with
    #    pending deferred checks.
    op.add_column("outings", sa.Column("code_released_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("""
        UPDATE outings o SET code_released_at = now()
        WHERE o.status = 'result'
          AND (o.starts_at + interval '1 day' < now()
               OR EXISTS (SELECT 1 FROM outings n WHERE n.invite_code = o.invite_code AND n.id <> o.id
                          AND (n.status <> 'result' OR n.created_at > o.created_at)))""")
    op.execute("DROP INDEX ux_outings_open_invite_code")
    op.execute("CREATE UNIQUE INDEX ux_outings_invite_code ON outings (invite_code) WHERE code_released_at IS NULL")
    op.execute("ALTER TABLE outings ADD CONSTRAINT outings_code_released_only_after_result "
               "CHECK (code_released_at IS NULL OR status = 'result')")

    # 3. Round 1 for every existing outing, then the active-round column, filled before it is required.
    op.execute("INSERT INTO outing_rounds (id, outing_id, number, created_at) "
               "SELECT gen_random_uuid(), id, 1, created_at FROM outings")
    op.add_column("outings", sa.Column("current_round_id", sa.Uuid(), nullable=True))
    op.execute("UPDATE outings o SET current_round_id = r.id FROM outing_rounds r WHERE r.outing_id = o.id")
    op.alter_column("outings", "current_round_id", nullable=False)
    # Deferred: a new outing and its first round are inserted in the same transaction.
    op.execute("""
        ALTER TABLE outings ADD CONSTRAINT outings_current_round_fkey
        FOREIGN KEY (id, current_round_id) REFERENCES outing_rounds (outing_id, id)
        DEFERRABLE INITIALLY DEFERRED""")
    op.execute(FIRST_ROUND_FUNCTION)
    op.execute("CREATE TRIGGER outings_first_round_before BEFORE INSERT ON outings "
               "FOR EACH ROW EXECUTE FUNCTION outings_first_round()")
    op.execute("CREATE TRIGGER outings_first_round_after AFTER INSERT ON outings "
               "FOR EACH ROW EXECUTE FUNCTION outings_first_round()")

    # 4. Plan items and votes: created in their final shape, or extended where they already exist.
    if not inspector.has_table("plan_items"):
        op.execute(PLAN_ITEMS)
    else:
        op.add_column("plan_items", sa.Column("round_id", sa.Uuid(), nullable=True))
        op.execute("UPDATE plan_items p SET round_id = o.current_round_id FROM outings o WHERE o.id = p.outing_id")
        op.alter_column("plan_items", "round_id", nullable=False)
        op.execute("ALTER TABLE plan_items ADD CONSTRAINT plan_items_round_fkey "
                   "FOREIGN KEY (outing_id, round_id) REFERENCES outing_rounds (outing_id, id)")
        # One place once per round, not once per outing: a retry may suggest it again.
        op.execute("ALTER TABLE plan_items DROP CONSTRAINT plan_items_outing_restaurant_unique")
        op.execute("ALTER TABLE plan_items ADD CONSTRAINT plan_items_round_restaurant_unique "
                   "UNIQUE (round_id, restaurant_id)")
        op.execute("ALTER TABLE plan_items ADD CONSTRAINT plan_items_round_rank_unique UNIQUE (round_id, rank)")
    if not inspector.has_table("votes"):
        op.execute(VOTES)
    op.execute("CREATE INDEX ix_votes_plan_item_id ON votes (plan_item_id)")

    # 5. Who was in each existing round that has suggestions: the confirmed participants of that outing.
    op.execute("""
        INSERT INTO round_members (round_id, participant_id)
        SELECT o.current_round_id, pa.id FROM outings o JOIN participants pa ON pa.outing_id = o.id
        WHERE pa.attendance = 'confirmed'
          AND EXISTS (SELECT 1 FROM plan_items p WHERE p.round_id = o.current_round_id)""")

def downgrade() -> None:
    raise RuntimeError("0012 downgrade refused: keep every round's plan and votes; use a reviewed forward migration.")
