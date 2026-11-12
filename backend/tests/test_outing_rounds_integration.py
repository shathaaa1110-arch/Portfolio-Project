"""DB-07 (#14) and BE-31 (#90): rounds of one outing, and a retry in the same session, on PostgreSQL.

Uses the BE-17 scratch schema (restaurants, plan_items) and adds votes next to it, as migrated by 0012.
"""
import threading
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import sqlalchemy as sa
from app.core.database import engine
from app.main import app
from app.services.outings import router as outings_router
from fastapi.testclient import TestClient
from tests.migration_ddl import VOTES
from tests.round_helpers import R, W, round_of
from tests.test_outings_join_integration import OLAYA, _add_outing, _add_user, _bearer
from tests.test_plan_generation_integration import BASE, _ready_session, api, fresh_limits, secret  # noqa: F401
from tests.test_saved_restaurant_schema_integration import migrate

pytestmark = pytest.mark.integration


@pytest.fixture
def outing(api):  # noqa: F811
    client, conn = api
    conn.execute(sa.text(VOTES))
    oid, code, organizer, member, guest = _ready_session(client, conn)
    return client, conn, oid, code, organizer, member, guest


def _code(r):
    return r.json()["error"]["code"]


def _state(client, oid, headers):
    return client.get(f"{BASE}/{oid}", headers=headers).json()


def _generate(client, oid, organizer):
    r = client.post(f"{BASE}/{oid}/start-voting", headers=organizer, json=R(client, oid, organizer))
    assert r.status_code == 200, r.text
    return [i["plan_item_id"] for i in r.json()["plan_items"]]


def _finish(client, oid, people, items, liked=0):
    """Everyone answers every card; the last answer settles the result (D07)."""
    for headers in people:
        for item in items:
            body = W(client, oid, headers, {"plan_item_id": item, "liked": item == items[liked]})
            assert client.post(f"{BASE}/{oid}/votes", headers=headers, json=body).status_code == 200
    assert _state(client, oid, people[0])["status"] == "result"


def _retry(client, oid, organizer, round_id):
    return client.post(f"{BASE}/{oid}/retry", headers=organizer, json={"round_id": round_id})


def _ready_again(client, oid, people):
    for headers in people:
        assert client.post(f"{BASE}/{oid}/preferences/ready", headers=headers,
                           json=R(client, oid, headers)).status_code == 200


# ---------- the state names the round ----------

def test_every_outing_starts_in_round_one(outing):
    client, conn, oid, _, organizer, member, guest = outing
    views = [_state(client, oid, h) for h in (organizer, member, guest)]
    assert {(v["round_id"], v["round_number"], v["round_outcome"]) for v in views} == {
        (str(conn.execute(sa.text("SELECT current_round_id FROM outings WHERE id = :o"), {"o": oid}).scalar_one()),
         1, None)}
    assert "retry_round" not in views[0]["actions"]  # nothing to retry before a result


# ---------- a retry after a result ----------

def test_a_retry_keeps_the_outing_and_its_people_and_starts_clean(outing):
    client, conn, oid, code, organizer, member, guest = outing
    people = (organizer, member, guest)
    first = round_of(client, oid, organizer)
    items = _generate(client, oid, organizer)
    _finish(client, oid, people, items, liked=1)
    assert _state(client, oid, organizer)["actions"] == ["retry_round"]
    assert "retry_round" not in _state(client, oid, member)["actions"]  # the organizer's button only
    before = client.get(f"{BASE}/{oid}/preferences", headers=guest, params={"round_id": first}).json()

    r = _retry(client, oid, organizer, first)
    assert r.status_code == 200
    body = r.json()
    assert body["outing_id"] == str(oid) and body["status"] == "preferences" and body["round_number"] == 2
    assert body["round_id"] != first

    state = _state(client, oid, guest)
    assert state["invite_code"] == code and state["round_id"] == body["round_id"] and state["round_outcome"] is None
    assert [p["name"] for p in state["participants"]] == ["عاصم حامد", "فهد", "نورة"]
    # Readiness starts again; answers and limits stay until a person changes them.
    assert state["readiness"] == {"ready_count": 0, "total_count": 3}
    after = client.get(f"{BASE}/{oid}/preferences", headers=guest, params=R(client, oid, guest)).json()
    assert {k: v for k, v in after.items() if k not in ("round_id", "preferences_done")} == \
        {k: v for k, v in before.items() if k not in ("round_id", "preferences_done")}


def test_round_two_waits_for_everyone_and_inherits_no_votes(outing):
    """Done when: a second round has no inherited votes and cannot generate before everyone is ready again."""
    client, conn, oid, _, organizer, member, guest = outing
    people = (organizer, member, guest)
    first = round_of(client, oid, organizer)
    old_items = _generate(client, oid, organizer)
    _finish(client, oid, people, old_items, liked=2)
    _retry(client, oid, organizer, first)

    r = client.post(f"{BASE}/{oid}/start-voting", headers=organizer, json=R(client, oid, organizer))
    assert r.status_code == 409 and _code(r) == "NOT_EVERYONE_READY"
    _ready_again(client, oid, people[:2])
    r = client.post(f"{BASE}/{oid}/start-voting", headers=organizer, json=R(client, oid, organizer))
    assert r.status_code == 409 and _code(r) == "NOT_EVERYONE_READY"
    _ready_again(client, oid, people[2:])
    new_items = _generate(client, oid, organizer)

    assert not set(new_items) & set(old_items)  # new plan items, even for the same places
    mine = client.get(f"{BASE}/{oid}/votes", headers=guest, params=R(client, oid, guest)).json()
    assert mine["votes"] == [] and mine["completed_count"] == 0
    # Round one stays as it was, for review: its 15 votes and its winner.
    votes = conn.execute(sa.text("SELECT count(*) FROM votes WHERE plan_item_id = ANY(CAST(:i AS uuid[]))"),
                         {"i": old_items}).scalar_one()
    winner = conn.execute(sa.text("SELECT id FROM plan_items WHERE round_id = :r AND is_winner"),
                          {"r": first}).scalar_one()
    assert votes == 15 and str(winner) == old_items[2]


def test_the_result_of_round_two_is_its_own(outing):
    client, conn, oid, _, organizer, member, guest = outing
    people = (organizer, member, guest)
    first = round_of(client, oid, organizer)
    _finish(client, oid, people, _generate(client, oid, organizer), liked=0)
    _retry(client, oid, organizer, first)
    _ready_again(client, oid, people)
    items = _generate(client, oid, organizer)
    _finish(client, oid, people, items, liked=3)
    result = client.get(f"{BASE}/{oid}/result", headers=member, params=R(client, oid, member)).json()
    assert result["winner"]["plan_item_id"] == items[3] and result["winner"]["likes"] == 3
    assert sum(i["likes"] for i in result["items"]) == 3  # nothing from round one


# ---------- stale requests ----------

def test_requests_from_an_older_round_are_refused(outing):
    client, conn, oid, _, organizer, member, guest = outing
    people = (organizer, member, guest)
    first = round_of(client, oid, organizer)
    old_items = _generate(client, oid, organizer)
    _finish(client, oid, people, old_items)
    _retry(client, oid, organizer, first)
    _ready_again(client, oid, people)
    _generate(client, oid, organizer)
    old = {"round_id": first}

    calls = [
        client.post(f"{BASE}/{oid}/votes", headers=guest, json={"plan_item_id": old_items[0], "liked": True, **old}),
        client.put(f"{BASE}/{oid}/preferences", headers=guest, json={"budget_max": 50, **old}),
        client.post(f"{BASE}/{oid}/preferences/ready", headers=guest, json=old),
        client.post(f"{BASE}/{oid}/start-voting", headers=organizer, json=old),
        client.post(f"{BASE}/{oid}/end-voting", headers=organizer, json=old),
        client.get(f"{BASE}/{oid}/plan", headers=guest, params=old),
        client.get(f"{BASE}/{oid}/votes", headers=guest, params=old),
        client.get(f"{BASE}/{oid}/result", headers=guest, params=old),
        client.get(f"{BASE}/{oid}/preferences", headers=guest, params=old),
    ]
    assert [(r.status_code, _code(r)) for r in calls] == [(409, "STALE_ROUND")] * len(calls)
    assert _state(client, oid, organizer)["status"] == "voting"  # nothing moved


def test_requests_without_a_round_are_refused(outing):
    client, conn, oid, _, organizer, member, guest = outing
    items = _generate(client, oid, organizer)
    calls = [
        client.post(f"{BASE}/{oid}/votes", headers=guest, json={"plan_item_id": items[0], "liked": True}),
        client.post(f"{BASE}/{oid}/end-voting", headers=organizer),
        client.get(f"{BASE}/{oid}/plan", headers=guest),
        client.get(f"{BASE}/{oid}/votes", headers=guest),
        client.post(f"{BASE}/{oid}/retry", headers=organizer),
    ]
    assert [(r.status_code, _code(r)) for r in calls] == [(409, "STALE_ROUND")] * len(calls)
    mine = client.get(f"{BASE}/{oid}/votes", headers=guest, params=R(client, oid, guest)).json()
    assert mine["votes"] == []


def test_another_outings_round_is_stale_here(outing):
    client, conn, oid, _, organizer, *_ = outing
    other = _add_user(conn, "منظم آخر")
    other_oid, _ = _add_outing(conn, other)
    foreign = round_of(client, other_oid, _bearer(other))
    r = client.post(f"{BASE}/{oid}/start-voting", headers=organizer, json={"round_id": foreign})
    assert r.status_code == 409 and _code(r) == "STALE_ROUND"


# ---------- who may retry, and when ----------

def test_only_the_organizer_retries_and_only_after_the_round_ended(outing):
    client, conn, oid, _, organizer, member, guest = outing
    current = round_of(client, oid, organizer)
    r = _retry(client, oid, organizer, current)
    assert r.status_code == 409 and _code(r) == "ROUND_RETRY_NOT_ALLOWED"     # still collecting answers
    _generate(client, oid, organizer)
    r = _retry(client, oid, organizer, current)
    assert r.status_code == 409 and _code(r) == "ROUND_RETRY_NOT_ALLOWED"     # voting is open
    r = _retry(client, oid, member, current)
    assert r.status_code == 403 and _code(r) == "ORGANIZER_ONLY"


def test_no_retry_once_the_outing_day_is_over(outing):
    client, conn, oid, _, organizer, member, guest = outing
    current = round_of(client, oid, organizer)
    _finish(client, oid, (organizer, member, guest), _generate(client, oid, organizer))
    conn.execute(sa.text("UPDATE outings SET starts_at = now() - interval '25 hours' WHERE id = :o"), {"o": oid})
    assert "retry_round" not in _state(client, oid, organizer)["actions"]
    r = _retry(client, oid, organizer, current)
    assert r.status_code == 409 and _code(r) == "ROUND_RETRY_NOT_ALLOWED"


def test_asking_again_returns_the_same_new_round(outing):
    client, conn, oid, _, organizer, member, guest = outing
    people = (organizer, member, guest)
    first = round_of(client, oid, organizer)
    _finish(client, oid, people, _generate(client, oid, organizer))
    one, two = _retry(client, oid, organizer, first).json(), _retry(client, oid, organizer, first).json()
    assert one == two and one["round_number"] == 2
    assert conn.execute(sa.text("SELECT count(*) FROM outing_rounds WHERE outing_id = :o"), {"o": oid}).scalar_one() == 2
    # Round one's retry keeps answering with round two, changing nothing, while round two is current.
    _ready_again(client, oid, people)
    _finish(client, oid, people, _generate(client, oid, organizer))
    again = _retry(client, oid, organizer, first).json()
    assert (again["round_id"], again["round_number"], again["status"]) == (one["round_id"], 2, "result")
    # Round two's retry makes round three; from then on round one is stale.
    assert _retry(client, oid, organizer, one["round_id"]).json()["round_number"] == 3
    r = _retry(client, oid, organizer, first)
    assert r.status_code == 409 and _code(r) == "STALE_ROUND"


def test_two_retries_at_once_make_one_round(secret):  # noqa: F811
    """The second retry waits for the outing's lock, then gets the round the first one made."""
    with engine.begin() as conn:
        organizer = _add_user(conn)
        oid, _ = _add_outing(conn, organizer, status="result")
        first = conn.execute(sa.text("SELECT current_round_id FROM outings WHERE id = :o"), {"o": oid}).scalar_one()
    try:
        holder = engine.connect()
        tx = holder.begin()
        holder.execute(sa.text("SELECT 1 FROM outings WHERE id = :o FOR UPDATE"), {"o": oid})
        replies = []

        def retry():
            replies.append(TestClient(app).post(f"{BASE}/{oid}/retry", headers=_bearer(organizer),
                                                json={"round_id": str(first)}))

        threads = [threading.Thread(target=retry) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=0.5)
        tx.commit()  # release: the two requests now run one after the other
        holder.close()
        for t in threads:
            t.join(timeout=10)
        assert [r.status_code for r in replies] == [200, 200]
        assert replies[0].json() == replies[1].json() and replies[0].json()["round_number"] == 2
        with engine.connect() as check:
            assert check.execute(sa.text("SELECT count(*) FROM outing_rounds WHERE outing_id = :o"),
                                 {"o": oid}).scalar_one() == 2
    finally:
        with engine.begin() as conn:
            conn.execute(sa.text("DELETE FROM participants WHERE outing_id = :o"), {"o": oid})
            conn.execute(sa.text("DELETE FROM outings WHERE id = :o"), {"o": oid})  # its rounds go with it
            conn.execute(sa.text("DELETE FROM users WHERE id = :u"), {"u": organizer})


# ---------- nothing matched ----------

def test_no_match_ends_the_round_for_everyone_until_a_retry(outing):
    client, conn, oid, _, organizer, member, guest = outing
    people = (organizer, member, guest)
    for headers in people:  # 1 riyal: no place fits
        client.put(f"{BASE}/{oid}/preferences", headers=headers, json=W(client, oid, headers, {"budget_max": 1}))
    _ready_again(client, oid, people)
    r = client.post(f"{BASE}/{oid}/start-voting", headers=organizer, json=R(client, oid, organizer))
    assert r.status_code == 200 and r.json()["plan_items"] == [] and r.json()["round_outcome"] == "no_matches"

    # After a refresh everyone sees it; the organizer's only action is a new round.
    assert {_state(client, oid, h)["round_outcome"] for h in people} == {"no_matches"}
    assert _state(client, oid, organizer)["actions"] == ["retry_round"]
    r = client.put(f"{BASE}/{oid}/preferences", headers=guest, json=W(client, oid, guest, {"budget_max": 100}))
    assert r.status_code == 409 and _code(r) == "ROUND_ENDED"
    r = client.post(f"{BASE}/{oid}/start-voting", headers=organizer, json=R(client, oid, organizer))
    assert r.status_code == 409 and _code(r) == "ROUND_ENDED"

    # A new round: people change their answers (nothing is relaxed for them) and it generates.
    _retry(client, oid, organizer, round_of(client, oid, organizer))
    for headers in people:
        client.put(f"{BASE}/{oid}/preferences", headers=headers, json=W(client, oid, headers, {"budget_max": 100}))
    _ready_again(client, oid, people)
    assert len(_generate(client, oid, organizer)) == 5
    assert _state(client, oid, guest)["round_outcome"] is None


# ---------- the same link ----------

def test_the_same_link_and_guest_pass_open_the_current_round(outing):
    """Done when: the same guest link opens the current round; old requests cannot change it."""
    client, conn, oid, code, organizer, member, guest = outing
    first = round_of(client, oid, organizer)
    _finish(client, oid, (organizer, member, guest), _generate(client, oid, organizer))
    assert client.get(f"{BASE}/by-code/{code}").status_code == 404  # a finished outing is not open to join
    _retry(client, oid, organizer, first)
    assert client.get(f"{BASE}/by-code/{code}").json()["outing_id"] == str(oid)
    assert _state(client, oid, guest)["round_number"] == 2  # the guest's pass still works
    newcomer = client.post(f"{BASE}/{code}/join-guest", json={"guest_name": "سارة"})
    assert newcomer.status_code == 201  # joining reopens with the new round


def test_each_round_counts_its_own_members(outing):
    client, conn, oid, code, organizer, member, guest = outing
    people = (organizer, member, guest)
    first = round_of(client, oid, organizer)
    _finish(client, oid, people, _generate(client, oid, organizer))
    _retry(client, oid, organizer, first)
    sara = client.post(f"{BASE}/{code}/join-guest", json={"guest_name": "سارة"}).json()
    sara_h = {"Authorization": f"Bearer {sara['guest_token']}"}
    client.put(f"{BASE}/{oid}/preferences", headers=sara_h, json=W(client, oid, sara_h, {"budget_max": 100}))
    _ready_again(client, oid, people + (sara_h,))
    _generate(client, oid, organizer)
    counts = dict(conn.execute(sa.text(
        "SELECT r.number, count(m.participant_id) FROM outing_rounds r JOIN round_members m ON m.round_id = r.id "
        "WHERE r.outing_id = :o GROUP BY r.number"), {"o": oid}).all())
    assert counts == {1: 3, 2: 4}
    progress = client.get(f"{BASE}/{oid}/votes", headers=sara_h, params=R(client, oid, sara_h)).json()
    assert progress["members_count"] == 4


# ---------- invite codes ----------

def test_a_finished_outing_gives_its_code_up_only_after_its_day(api, monkeypatch):  # noqa: F811
    client, conn = api
    organizer = _add_user(conn)
    old, _ = _add_outing(conn, organizer, status="result", code="ABCD",
                         starts_at=datetime.now(timezone.utc) - timedelta(days=2))
    recent, _ = _add_outing(conn, organizer, status="result", code="WXYZ")
    codes = iter(["WXYZ", "ABCD"])  # the recent one's code is still its own, the old one's is free
    monkeypatch.setattr(outings_router, "new_code", lambda: next(codes))
    body = {"name": "غداء", "starts_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "district": OLAYA}
    r = client.post(f"{BASE}/session", headers=_bearer(organizer), json=body)
    assert r.status_code == 201 and r.json()["invite_code"] == "ABCD"
    released = dict(conn.execute(sa.text("SELECT id, code_released_at IS NOT NULL FROM outings WHERE id IN (:a, :b)"),
                                 {"a": old, "b": recent}).all())
    assert released == {old: True, recent: False}


# ---------- what the database itself refuses ----------

def test_the_database_refuses_duplicate_rounds_and_mixed_up_links(outing):
    """Done when: duplicate votes and duplicate active rounds are rejected by database constraints."""
    client, conn, oid, _, organizer, member, guest = outing
    items = _generate(client, oid, organizer)
    current = conn.execute(sa.text("SELECT current_round_id FROM outings WHERE id = :o"), {"o": oid}).scalar_one()
    other_org = _add_user(conn, "آخر")
    other, _ = _add_outing(conn, other_org)
    foreign = conn.execute(sa.text("SELECT current_round_id FROM outings WHERE id = :o"), {"o": other}).scalar_one()
    guest_id = conn.execute(sa.text("SELECT id FROM participants WHERE outing_id = :o AND guest_name = 'نورة'"),
                            {"o": oid}).scalar_one()

    def refused(sql, **params):
        with pytest.raises(sa.exc.IntegrityError), conn.begin_nested():
            conn.execute(sa.text("SET CONSTRAINTS ALL IMMEDIATE"))
            conn.execute(sa.text(sql), params)

    refused("INSERT INTO outing_rounds (id, outing_id, number) VALUES (gen_random_uuid(), :o, 1)", o=oid)
    refused("UPDATE outings SET current_round_id = :r WHERE id = :o", r=foreign, o=oid)  # another outing's round
    refused("INSERT INTO plan_items (id, outing_id, round_id, restaurant_id, rank, match_score, reason, is_winner) "
            "VALUES (gen_random_uuid(), :o, :r, 1, 9, 50, 'x', false)", o=oid, r=foreign)
    refused("INSERT INTO plan_items (id, outing_id, round_id, restaurant_id, rank, match_score, reason, is_winner) "
            "SELECT gen_random_uuid(), outing_id, round_id, restaurant_id, 99, 1, 'x', false "
            "FROM plan_items WHERE id = :i", i=items[0])  # the same place twice in one round
    vote = ("INSERT INTO votes (id, participant_id, plan_item_id, liked, is_tiebreak, updated_at) "
            "VALUES (gen_random_uuid(), :p, :i, true, false, now())")
    conn.execute(sa.text(vote), {"p": guest_id, "i": items[0]})
    refused(vote, p=guest_id, i=items[0])
    assert current is not None


# ---------- migration 0012 on a database like Neon's ----------

def test_the_migration_keeps_existing_plans_and_votes():
    """plan_items and votes made by hand, with data, become round 1; finished codes are freed."""
    with engine.connect() as conn, conn.begin():
        schema = "db07_" + uuid.uuid4().hex
        conn.execute(sa.text(f"CREATE SCHEMA {schema}"))
        conn.execute(sa.text(f"SET LOCAL search_path TO {schema}"))
        for name in ("0001_empty_baseline", "0002_account_keys_and_phone", "0003_account_preferences",
                     "0004_restaurant_search", "0005_outings_and_districts", "0006_saved_restaurants",
                     "0007_saved_at", "0008_general_restaurants", "0009_otp_codes", "0010_participant_removed",
                     "0011_notification_events"):
            migrate(conn, name)
        # The hand-made tables, as on Neon before 0012.
        conn.execute(sa.text("""
            CREATE TABLE plan_items (id uuid PRIMARY KEY, outing_id uuid NOT NULL REFERENCES outings(id),
                restaurant_id integer NOT NULL REFERENCES restaurants(id), rank integer NOT NULL,
                match_score integer NOT NULL, reason text NOT NULL, is_winner boolean NOT NULL,
                CONSTRAINT plan_items_outing_restaurant_unique UNIQUE (outing_id, restaurant_id));
            CREATE TABLE votes (id uuid PRIMARY KEY, participant_id uuid NOT NULL REFERENCES participants(id),
                plan_item_id uuid NOT NULL REFERENCES plan_items(id), liked boolean NOT NULL,
                is_tiebreak boolean NOT NULL, updated_at timestamp NOT NULL,
                CONSTRAINT votes_one_per_round_unique UNIQUE (participant_id, plan_item_id, is_tiebreak))"""))
        user = _add_user(conn)
        conn.execute(sa.text("INSERT INTO restaurants (id, name_ar, cuisine, district) VALUES (1, 'م', 'saudi', 'ح')"))
        voted, _ = _add_outing(conn, user, status="result", code="ABCD")
        stale, _ = _add_outing(conn, user, status="result", code="WXYZ",
                               starts_at=datetime.now(timezone.utc) - timedelta(days=3))
        item = uuid.uuid4()
        conn.execute(sa.text("INSERT INTO plan_items VALUES (:i, :o, 1, 1, 80, 'r', true)"), {"i": item, "o": voted})
        pid = conn.execute(sa.text("SELECT id FROM participants WHERE outing_id = :o"), {"o": voted}).scalar_one()
        conn.execute(sa.text("INSERT INTO votes VALUES (gen_random_uuid(), :p, :i, true, false, now())"),
                     {"p": pid, "i": item})

        migrate(conn, "0012_outing_rounds")

        rounds = conn.execute(sa.text("SELECT o.id, r.number FROM outings o JOIN outing_rounds r "
                                      "ON r.id = o.current_round_id ORDER BY o.created_at")).all()
        assert {(o, n) for o, n in rounds} == {(voted, 1), (stale, 1)}
        assert conn.execute(sa.text("SELECT p.round_id = o.current_round_id FROM plan_items p JOIN outings o "
                                    "ON o.id = p.outing_id")).scalar_one() is True
        assert conn.execute(sa.text("SELECT count(*) FROM votes")).scalar_one() == 1
        assert conn.execute(sa.text("SELECT participant_id FROM round_members")).scalar_one() == pid
        freed = dict(conn.execute(sa.text("SELECT id, code_released_at IS NOT NULL FROM outings")).all())
        assert freed == {voted: False, stale: True}
        # New outings get round 1 from the trigger, whatever inserts them.
        new, _ = _add_outing(conn, user)
        assert conn.execute(sa.text("SELECT r.number FROM outings o JOIN outing_rounds r ON r.id = o.current_round_id "
                                    "WHERE o.id = :o"), {"o": new}).scalar_one() == 1
        conn.rollback()
