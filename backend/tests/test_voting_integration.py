"""BE-19 (#73), BE-20 (#31), BE-21 (#29), QA-07 (#35): votes, ending voting, result, and concurrency.

Builds on the BE-17 scratch schema (restaurants, plan_items) and adds votes next to them, in the
shape migration 0012 gives them. Everything runs in a rolled-back transaction, except the QA-07
concurrency tests which run against PostgreSQL scratch schemas to exercise real row locking and races.
"""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import json
import threading
import uuid

import pytest
import sqlalchemy as sa
from app.core.database import engine
from app.main import app
from app.services.auth.tokens import create_guest_token
from fastapi.testclient import TestClient
from tests.migration_ddl import VOTES  # a scratch copy next to the scratch plan_items, as migrated (0012)
from tests.round_helpers import R, W  # noqa: F401
from tests.test_outings_join_integration import _add_outing, _add_user, _bearer  # noqa: F401
from tests.test_plan_generation_integration import ALWAYS, BASE, SCHEMA, _ready_session, api, fresh_limits, secret  # noqa: F401

pytestmark = pytest.mark.integration


@pytest.fixture
def voting(api):  # noqa: F811
    client, conn = api
    conn.execute(sa.text(VOTES))
    oid, code, organizer, member, guest = _ready_session(client, conn)
    plan = client.post(f"{BASE}/{oid}/start-voting", headers=organizer, json=R(client, oid, organizer)).json()
    items = [i["plan_item_id"] for i in plan["plan_items"]]
    return client, conn, oid, organizer, member, guest, items


def _vote(client, oid, headers, item, liked):
    return client.post(f"{BASE}/{oid}/votes", headers=headers,
                       json=W(client, oid, headers, {"plan_item_id": item, "liked": liked}))


def _answer_all(client, oid, headers, items, liked_items=()):
    for item in items:
        r = _vote(client, oid, headers, item, item in liked_items)
    return r


def _rows(conn, oid):
    return conn.execute(sa.text(
        "SELECT v.participant_id, v.plan_item_id, v.liked FROM votes v JOIN plan_items pi ON pi.id = v.plan_item_id "
        "WHERE pi.outing_id = :o"), {"o": oid}).all()


# ---------- casting and changing a vote (BE-19) ----------

def test_a_vote_is_saved_and_returned_for_a_reload(voting):
    client, conn, oid, organizer, member, guest, items = voting
    r = _vote(client, oid, guest, items[0], True)
    assert r.status_code == 200
    body = r.json()
    assert body["plan_item_id"] == items[0] and body["liked"] is True and body["voting_complete"] is False
    assert body["items_count"] == len(items) and body["members_count"] == 3 and body["completed_count"] == 0
    mine = client.get(f"{BASE}/{oid}/votes", headers=guest, params=R(client, oid, guest)).json()
    assert mine["votes"] == [{"plan_item_id": items[0], "liked": True}] and mine["answered_count"] == 1
    assert client.get(f"{BASE}/{oid}/votes", headers=member, params=R(client, oid, member)).json()["votes"] == []  # answers are private


def test_changing_like_to_pass_updates_the_one_answer(voting):
    client, conn, oid, organizer, member, guest, items = voting
    _vote(client, oid, member, items[0], True)
    _vote(client, oid, member, items[0], False)
    rows = _rows(conn, oid)
    assert len(rows) == 1 and rows[0].liked is False
    _answer_all(client, oid, organizer, items)  # nobody else likes anything
    r = client.post(f"{BASE}/{oid}/end-voting", headers=organizer, json=R(client, oid, organizer)).json()
    assert all(i["likes"] == 0 for i in r["items"]) and r["winner"] is None  # the Like was replaced, not added to


def test_a_suggestion_from_another_outing_is_refused(voting):
    client, conn, oid, organizer, member, guest, items = voting
    r = _vote(client, oid, guest, str(uuid.uuid4()), True)
    assert r.status_code == 404 and r.json()["error"]["code"] == "PLAN_ITEM_NOT_FOUND"
    # Another outing with its own plan: its items cannot be voted on through this outing,
    # and this outing's members cannot reach the other outing at all.
    other, _, other_org, _, other_guest = _ready_session(client, conn)
    other_items = [i["plan_item_id"] for i in client.post(f"{BASE}/{other}/start-voting", headers=other_org, json=R(client, other, other_org)).json()["plan_items"]]
    r = _vote(client, oid, guest, other_items[0], True)
    assert r.status_code == 404 and r.json()["error"]["code"] == "PLAN_ITEM_NOT_FOUND"
    assert _vote(client, other, guest, other_items[0], True).status_code == 403
    assert _vote(client, other, member, other_items[0], True).status_code == 403
    assert _rows(conn, other) == []


def test_a_stranger_cannot_vote(voting):
    client, conn, oid, *_, items = voting
    stranger = _bearer(_add_user(conn, "غريب"))
    assert _vote(client, oid, stranger, items[0], True).status_code == 403
    assert client.get(f"{BASE}/{oid}/votes", headers=stranger, params=R(client, oid, stranger)).status_code == 403


def test_votes_are_refused_outside_voting(api):  # noqa: F811
    client, conn = api
    conn.execute(sa.text(VOTES))
    oid, _, organizer, _, guest = _ready_session(client, conn)
    r = _vote(client, oid, guest, str(uuid.uuid4()), True)  # still in preferences
    assert r.status_code == 409 and r.json()["error"]["code"] == "VOTING_NOT_OPEN"


def test_bad_bodies_are_rejected(voting):
    client, conn, oid, organizer, member, guest, items = voting
    for body in ({"plan_item_id": items[0]}, {"plan_item_id": "x", "liked": True},
                 {"plan_item_id": items[0], "liked": True, "extra": 1}):
        assert client.post(f"{BASE}/{oid}/votes", headers=guest, json=body).status_code == 422


# ---------- ending voting (BE-20) ----------

def test_the_last_answer_ends_voting_by_itself(voting):
    client, conn, oid, organizer, member, guest, items = voting
    _answer_all(client, oid, organizer, items, {items[1]})
    _answer_all(client, oid, member, items, {items[1], items[2]})
    last = _answer_all(client, oid, guest, items, {items[2]}).json()
    assert last["voting_complete"] is True and last["status"] == "result" and last["completed_count"] == 3
    # Voting is closed: no more writes.
    r = _vote(client, oid, guest, items[0], True)
    assert r.status_code == 409 and r.json()["error"]["code"] == "VOTING_NOT_OPEN"


def test_only_the_organizer_ends_voting_early_and_saved_votes_count(voting):
    client, conn, oid, organizer, member, guest, items = voting
    _vote(client, oid, member, items[2], True)
    _vote(client, oid, guest, items[2], True)
    for headers in (member, guest):
        r = client.post(f"{BASE}/{oid}/end-voting", headers=headers, json=R(client, oid, headers))
        assert r.status_code == 403 and r.json()["error"]["code"] == "ORGANIZER_ONLY"
    assert client.get(f"{BASE}/{oid}", headers=organizer).json()["actions"] == ["end_voting"]
    r = client.post(f"{BASE}/{oid}/end-voting", headers=organizer, json=R(client, oid, organizer))
    assert r.status_code == 200
    result = r.json()
    assert result["status"] == "result"
    assert result["winner"]["plan_item_id"] == items[2] and result["winner"]["likes"] == 2
    assert result["winner"]["support_percentage"] == 67  # 2 likes / 3 members (D08), not / 2 voters
    assert result["members_count"] == 3 and result["completed_count"] == 0
    # Asking again gives the same result; the stage does not move back.
    assert client.post(f"{BASE}/{oid}/end-voting", headers=organizer, json=R(client, oid, organizer)).json() == result
    assert client.get(f"{BASE}/{oid}", headers=organizer).json()["actions"] == ["retry_round"]  # BE-31
    winners = conn.execute(sa.text("SELECT id FROM plan_items WHERE outing_id = :o AND is_winner"), {"o": oid}).all()
    assert [str(w.id) for w in winners] == [items[2]]


# ---------- the result (BE-20, BE-21) ----------

def test_equal_likes_go_to_the_better_recommendation(voting):
    client, conn, oid, organizer, member, guest, items = voting
    _vote(client, oid, member, items[3], True)
    _vote(client, oid, guest, items[1], True)
    result = client.post(f"{BASE}/{oid}/end-voting", headers=organizer, json=R(client, oid, organizer)).json()
    assert result["winner"]["plan_item_id"] == items[1]  # rank 2 beats rank 4 at one like each (D09)
    assert result["status"] == "result"  # no tie-break stage, no timer


def test_no_likes_means_no_winner_and_says_why(voting):
    client, conn, oid, organizer, member, guest, items = voting
    _vote(client, oid, member, items[0], False)
    result = client.post(f"{BASE}/{oid}/end-voting", headers=organizer, json=R(client, oid, organizer)).json()
    assert result["winner"] is None and result["no_winner_reason"] == "everyone_passed"
    assert conn.execute(sa.text("SELECT count(*) FROM plan_items WHERE outing_id = :o AND is_winner"),
                        {"o": oid}).scalar_one() == 0


def test_no_votes_at_all_is_told_apart(voting):
    client, conn, oid, organizer, *_ = voting
    result = client.post(f"{BASE}/{oid}/end-voting", headers=organizer, json=R(client, oid, organizer)).json()
    assert result["winner"] is None and result["no_winner_reason"] == "no_votes"


def test_everyone_reads_the_same_result_only_after_voting(voting):
    client, conn, oid, organizer, member, guest, items = voting
    r = client.get(f"{BASE}/{oid}/result", headers=guest, params=R(client, oid, guest))
    assert r.status_code == 409 and r.json()["error"]["code"] == "RESULT_NOT_READY"
    _vote(client, oid, member, items[0], True)
    ended = client.post(f"{BASE}/{oid}/end-voting", headers=organizer, json=R(client, oid, organizer)).json()
    for headers in (organizer, member, guest):
        assert client.get(f"{BASE}/{oid}/result", headers=headers, params=R(client, oid, headers)).json() == ended
    assert client.get(f"{BASE}/{oid}/result", headers=_bearer(_add_user(conn, "غريب")), params=R(client, oid, _bearer(_add_user(conn, "غريب")))).status_code == 403


# ---------- concurrent voting and tie settlement on PostgreSQL (QA-07 #35) ----------

@contextmanager
def _concurrent_voting_session():
    """Scratch schema and committed outing on PostgreSQL, so real connections race under row locks."""
    schema = f"qa07_{uuid.uuid4().hex[:8]}"
    route = lambda dbapi, record, proxy: dbapi.cursor().execute(f"SET search_path TO {schema}, public")  # noqa: E731
    with engine.begin() as conn:
        conn.execute(sa.text(f"CREATE SCHEMA {schema}"))
        conn.execute(sa.text(f"SET LOCAL search_path TO {schema}, public"))
        for statement in (SCHEMA + ";" + VOTES).split(";"):
            if statement.strip():
                conn.execute(sa.text(statement))
        lat, lon = map(float, conn.execute(sa.text("SELECT latitude, longitude FROM districts WHERE id = '00100001141'")).one())
        for rid, cuisine in enumerate(("shawarma", "italian", "saudi", "burgers", "indian", "chinese"), start=1):
            conn.execute(sa.text(
                "INSERT INTO restaurants (id, name_ar, brand_id, cuisine, district, latitude, longitude, spend_low, "
                "spend_high, price_tier, rating, quality_score, opening_hours, maps_url) VALUES (:id, :n, :id, :c, "
                "'العليا', :lat, :lon, 20, 60, 2, 4.5, :q, CAST(:h AS jsonb), 'https://maps')"),
                {"id": rid, "n": f"مطعم {rid}", "c": cuisine, "lat": lat + 0.01 * rid, "lon": lon,
                 "q": 5 - rid / 10, "h": json.dumps(ALWAYS)})
        organizer = _add_user(conn, "عاصم حامد")
        oid, code = _add_outing(conn, organizer, status="preferences")
        member = _add_user(conn, "فهد")
        mem_pid = uuid.uuid4()
        conn.execute(sa.text("INSERT INTO participants (id, outing_id, user_id, attendance, preferences_done) "
                             "VALUES (:id, :o, :u, 'confirmed', true)"), {"id": mem_pid, "o": oid, "u": member})
        guest_pid = uuid.uuid4()
        conn.execute(sa.text("INSERT INTO participants (id, outing_id, guest_name, attendance, preferences_done) "
                             "VALUES (:id, :o, 'نورة', 'confirmed', true)"), {"id": guest_pid, "o": oid})
        conn.execute(sa.text("UPDATE participants SET preferences_done = true WHERE outing_id = :o"), {"o": oid})

    sa.event.listen(engine, "checkout", route)
    client = TestClient(app)
    try:
        guest_token = create_guest_token(guest_pid, oid, datetime.now(timezone.utc) + timedelta(days=1))
        guest = {"Authorization": f"Bearer {guest_token}"}
        org_headers = _bearer(organizer)
        mem_headers = _bearer(member)
        plan_res = client.post(f"{BASE}/{oid}/start-voting", headers=org_headers, json=R(client, oid, org_headers)).json()
        items = [i["plan_item_id"] for i in plan_res["plan_items"]]
        yield client, oid, org_headers, mem_headers, guest, items, mem_pid, guest_pid
    finally:
        sa.event.remove(engine, "checkout", route)
        engine.dispose()
        with engine.begin() as conn:
            conn.execute(sa.text(f"DROP SCHEMA {schema} CASCADE"))
            conn.execute(sa.text("DELETE FROM notification_events WHERE outing_id = :o"), {"o": oid})
            conn.execute(sa.text("DELETE FROM round_members WHERE round_id IN "
                                 "(SELECT id FROM outing_rounds WHERE outing_id = :o)"), {"o": oid})
            conn.execute(sa.text("DELETE FROM participants WHERE outing_id = :o"), {"o": oid})
            conn.execute(sa.text("DELETE FROM outings WHERE id = :o"), {"o": oid})
            conn.execute(sa.text("DELETE FROM users WHERE id IN (:o, :m)"), {"o": organizer, "m": member})


def test_two_simultaneous_votes_do_not_duplicate_votes_or_produce_different_results(secret):
    """QA-07 (#35): two simultaneous votes arrive on PostgreSQL.

    Proves:
    1. Simultaneous votes on the same suggestion by the same member (rapid double tap)
       do not create duplicate votes in the database.
    2. Two simultaneous votes arriving from different participants on tied suggestions
       settle cleanly: both votes count, tie settlement picks the higher recommendation
       rank (D09), exactly one winner is stored, and all participants read the identical result.
    """
    with _concurrent_voting_session() as (client, oid, org, mem, guest, items, mem_pid, guest_pid):
        # 1. Same user submits two simultaneous votes on items[0] (double tap race)
        holder = engine.connect()
        tx = holder.begin()
        holder.execute(sa.text("SELECT 1 FROM outings WHERE id = :o FOR UPDATE"), {"o": oid})
        results = [None, None]

        def vote_double(i, liked):
            results[i] = client.post(f"{BASE}/{oid}/votes", headers=mem,
                                     json=W(client, oid, mem, {"plan_item_id": items[0], "liked": liked}))

        threads = [threading.Thread(target=vote_double, args=(0, True)),
                   threading.Thread(target=vote_double, args=(1, False))]
        for t in threads:
            t.start()
        for t in threads:
            t.join(0.5)
        tx.commit()
        holder.close()
        for t in threads:
            t.join(10)

        assert all(r.status_code == 200 for r in results)
        with engine.connect() as conn:
            # Confirm no duplicate vote row: exactly 1 row exists
            count = conn.execute(
                sa.text("SELECT count(*) FROM votes WHERE participant_id = :p AND plan_item_id = :i"),
                {"p": mem_pid, "i": items[0]},
            ).scalar()
            assert count == 1

        # 2. Organizer answers all items with Pass (no likes)
        for it in items:
            client.post(f"{BASE}/{oid}/votes", headers=org,
                        json=W(client, oid, org, {"plan_item_id": it, "liked": False}))

        # Member and Guest answer remaining items (items[2:]) with Pass
        for it in items[2:]:
            client.post(f"{BASE}/{oid}/votes", headers=mem,
                        json=W(client, oid, mem, {"plan_item_id": it, "liked": False}))
            client.post(f"{BASE}/{oid}/votes", headers=guest,
                        json=W(client, oid, guest, {"plan_item_id": it, "liked": False}))

        # Guest votes items[0] with Like (rank 1 -> 1 like)
        client.post(f"{BASE}/{oid}/votes", headers=guest,
                    json=W(client, oid, guest, {"plan_item_id": items[0], "liked": True}))

        # Now only items[1] remains for Member and Guest.
        # Member will Like items[1] (rank 2 -> 1 like).
        # Guest will Pass items[1] (rank 2 -> 0 like).
        # Both submit their final vote simultaneously!
        # This creates a tie between items[0] (rank 1, 1 like) and items[1] (rank 2, 1 like),
        # while completing the entire outing voting stage.
        holder = engine.connect()
        tx = holder.begin()
        holder.execute(sa.text("SELECT 1 FROM outings WHERE id = :o FOR UPDATE"), {"o": oid})
        sim_res = [None, None]

        def vote_mem():
            sim_res[0] = client.post(f"{BASE}/{oid}/votes", headers=mem,
                                     json=W(client, oid, mem, {"plan_item_id": items[1], "liked": True}))

        def vote_guest():
            sim_res[1] = client.post(f"{BASE}/{oid}/votes", headers=guest,
                                     json=W(client, oid, guest, {"plan_item_id": items[1], "liked": False}))

        threads = [threading.Thread(target=vote_mem), threading.Thread(target=vote_guest)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(0.5)
        tx.commit()
        holder.close()
        for t in threads:
            t.join(10)

        assert all(r.status_code == 200 for r in sim_res)
        assert any(r.json()["voting_complete"] is True for r in sim_res)

        with engine.connect() as conn:
            # Confirm no duplicate votes exist in the round
            total_votes = conn.execute(
                sa.text("SELECT count(*) FROM votes WHERE plan_item_id IN (:a, :b)"),
                {"a": items[0], "b": items[1]},
            ).scalar()
            assert total_votes == 6

            # Exactly one winner marked in plan_items
            winners = conn.execute(
                sa.text("SELECT id FROM plan_items WHERE outing_id = :o AND is_winner"),
                {"o": oid},
            ).all()
            assert len(winners) == 1
            # By D09, rank 1 (items[0]) beats rank 2 (items[1]) at equal likes (1 each)
            assert str(winners[0].id) == items[0]

        # Confirm all participants read the identical result without divergent outcomes
        res_org = client.get(f"{BASE}/{oid}/result", headers=org, params=R(client, oid, org)).json()
        res_mem = client.get(f"{BASE}/{oid}/result", headers=mem, params=R(client, oid, mem)).json()
        res_gst = client.get(f"{BASE}/{oid}/result", headers=guest, params=R(client, oid, guest)).json()
        assert res_org == res_mem == res_gst
        assert res_org["winner"]["plan_item_id"] == items[0]


def test_last_vote_arriving_while_organizer_ends_voting_leaves_one_consistent_result(secret):
    """QA-07 (#35): a participant's last vote arrives while the organizer ends voting early.

    Proves:
    Under PostgreSQL row locking, the two requests serialize cleanly.
    Either:
      - The organizer ends voting first: the last vote is refused (409 VOTING_NOT_OPEN),
        voting closes with the early votes, and the settled result is preserved.
      - The last vote commits first: voting completes automatically (200 OK), and the organizer's
        end-voting idempotently returns the same final result (200 OK).
    In either case:
      - No duplicate votes are created.
      - Exactly one winner is stored in the database.
      - All participants read the exact same final result from GET /result.
    """
    with _concurrent_voting_session() as (client, oid, org, mem, guest, items, mem_pid, guest_pid):
        # Organizer and Member answer everything (liking items[1])
        for it in items:
            client.post(f"{BASE}/{oid}/votes", headers=org,
                        json=W(client, oid, org, {"plan_item_id": it, "liked": it == items[1]}))
            client.post(f"{BASE}/{oid}/votes", headers=mem,
                        json=W(client, oid, mem, {"plan_item_id": it, "liked": it == items[1]}))

        # Guest answers all items EXCEPT items[0] (passing)
        for it in items[1:]:
            client.post(f"{BASE}/{oid}/votes", headers=guest,
                        json=W(client, oid, guest, {"plan_item_id": it, "liked": False}))

        # Guest has exactly one card remaining (items[0]).
        # Organizer calls end-voting at the same instant Guest submits their last vote.
        holder = engine.connect()
        tx = holder.begin()
        holder.execute(sa.text("SELECT 1 FROM outings WHERE id = :o FOR UPDATE"), {"o": oid})
        results = {}

        def do_end_voting():
            results["end"] = client.post(f"{BASE}/{oid}/end-voting", headers=org,
                                         json=R(client, oid, org))

        def do_last_vote():
            results["vote"] = client.post(f"{BASE}/{oid}/votes", headers=guest,
                                          json=W(client, oid, guest, {"plan_item_id": items[0], "liked": True}))

        t_end = threading.Thread(target=do_end_voting)
        t_vote = threading.Thread(target=do_last_vote)
        t_end.start()
        t_vote.start()
        t_end.join(0.5)
        t_vote.join(0.5)
        tx.commit()
        holder.close()
        t_end.join(10)
        t_vote.join(10)

        # End voting always succeeds (200). Last vote either commits (200) or was locked out (409).
        assert results["end"].status_code == 200
        assert results["vote"].status_code in (200, 409)
        if results["vote"].status_code == 409:
            assert results["vote"].json()["error"]["code"] == "VOTING_NOT_OPEN"

        with engine.connect() as conn:
            # Outing is firmly in result status
            status = conn.execute(sa.text("SELECT status FROM outings WHERE id = :o"), {"o": oid}).scalar()
            assert status == "result"

            # Exactly one winner in the database
            winners = conn.execute(
                sa.text("SELECT id FROM plan_items WHERE outing_id = :o AND is_winner"),
                {"o": oid},
            ).all()
            assert len(winners) == 1

            # No duplicate votes for the guest on items[0]
            guest_v_count = conn.execute(
                sa.text("SELECT count(*) FROM votes WHERE participant_id = :p AND plan_item_id = :i"),
                {"p": guest_pid, "i": items[0]},
            ).scalar()
            assert guest_v_count in (0, 1)

        # All participants read the exact same result
        res_org = client.get(f"{BASE}/{oid}/result", headers=org, params=R(client, oid, org)).json()
        res_mem = client.get(f"{BASE}/{oid}/result", headers=mem, params=R(client, oid, mem)).json()
        res_gst = client.get(f"{BASE}/{oid}/result", headers=guest, params=R(client, oid, guest)).json()
        assert res_org == res_mem == res_gst
        assert res_org["winner"] is not None
