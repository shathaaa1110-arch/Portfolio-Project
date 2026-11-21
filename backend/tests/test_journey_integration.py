"""QA-03 (#70): the phase 1 journey through the API, end to end, on PostgreSQL.

One scenario, only through HTTP, as the app does it: sign in by SMS code, save default preferences,
create an outing, a member and a guest join, everyone saves answers and confirms Ready in the
current round (round_id). Then the two rules around it: the outing is full at 8 people, and a guest
only ever sees and changes their own answers in their own outing.

Everything runs inside one transaction that is rolled back, so the scenario can run again and again
on the same test database without production data. To check that it repeats:

    python -m pytest -m integration tests/test_journey_integration.py -v
    python -m pytest -m integration tests/test_journey_integration.py -v
"""
import secrets
from datetime import datetime, timedelta, timezone

import pytest
from app.services.auth import router as auth_router
from tests.test_outing_state_integration import BASE, api, secret  # noqa: F401
from tests.test_outings_join_integration import OLAYA, fresh_limits  # noqa: F401

pytestmark = pytest.mark.integration
AUTH = "/api/v1/auth"
ME = "/api/v1/users/me"
CODE = "246810"
DEFAULTS = {"liked_cuisines": ["grill", "levant"], "allergies": ["nuts"], "budget_min": 30, "budget_max": 90,
            "max_distance_km": 6.0, "seating_needs": "جلسة عائلية"}


@pytest.fixture
def sms_code(monkeypatch):
    """SMS_MODE is mock in tests; fix the generated code so the test can type it like a person would."""
    monkeypatch.setattr(auth_router, "generate_code", lambda: CODE)


def _phone():
    return "05" + "".join(secrets.choice("0123456789") for _ in range(8))


def _sign_in(client, name):
    phone = _phone()
    assert client.post(f"{AUTH}/request-code", json={"phone": phone}).status_code == 200
    r = client.post(f"{AUTH}/verify", json={"phone": phone, "code": CODE, "name": name})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _round(client, oid, headers):
    return {"round_id": client.get(f"{BASE}/{oid}", headers=headers).json()["round_id"]}


def _create(client, organizer, name="عشاء الخميس"):
    body = {"name": name, "starts_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "district": OLAYA}
    r = client.post(f"{BASE}/session", headers=organizer, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _guest(client, code, name):
    r = client.post(f"{BASE}/{code}/join-guest", json={"guest_name": name})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['guest_token']}"}


def _code(r):
    return r.json()["error"]["code"]


def test_the_phase_one_journey_end_to_end(api, sms_code):  # noqa: F811
    client, _ = api

    # 1. Sign in with the SMS code and save default preferences.
    organizer = _sign_in(client, "عاصم")
    assert client.get(ME, headers=organizer).json()["name"] == "عاصم"
    assert client.put(f"{ME}/preferences", headers=organizer, json=DEFAULTS).status_code == 200

    # 2. Create an outing: it starts in round 1 with an invite code.
    outing = _create(client, organizer)
    oid, code = outing["outing_id"], outing["invite_code"]
    state = client.get(f"{BASE}/{oid}", headers=organizer).json()
    assert state["status"] == "invite" and state["round_number"] == 1 and state["invite_code"] == code

    # 3. A member with an account and a guest join with the code.
    member = _sign_in(client, "فهد")
    assert client.post(f"{BASE}/{code}/join", headers=member).status_code == 200
    guest = _guest(client, code, "نورة")
    assert client.post(f"{BASE}/{oid}/start-preferences", headers=organizer).status_code == 200

    # 4. The organizer's defaults were copied into this outing; nobody else's answers are shown.
    mine = client.get(f"{BASE}/{oid}/preferences", headers=organizer, params=_round(client, oid, organizer)).json()
    assert mine["is_saved"] is True
    assert {k: mine[k] for k in DEFAULTS} == {**DEFAULTS, "liked_cuisines": ["grill", "levant"]}
    assert client.get(f"{BASE}/{oid}/preferences", headers=guest,
                      params=_round(client, oid, guest)).json()["is_saved"] is False

    # 5. Everyone saves answers and confirms Ready in the current round.
    for headers, budget in ((organizer, 90), (member, 70), (guest, 50)):
        body = {"budget_max": budget, **_round(client, oid, headers)}
        assert client.put(f"{BASE}/{oid}/preferences", headers=headers, json=body).status_code == 200
        r = client.post(f"{BASE}/{oid}/preferences/ready", headers=headers, json=_round(client, oid, headers))
        assert r.status_code == 200 and r.json()["preferences_done"] is True

    # 6. Everyone sees the same outing: three people, all ready; only the organizer can start voting.
    views = [client.get(f"{BASE}/{oid}", headers=h).json() for h in (organizer, member, guest)]
    assert {(v["status"], v["round_id"]) for v in views} == {("preferences", state["round_id"])}
    assert all(v["readiness"] == {"ready_count": 3, "total_count": 3} for v in views)
    assert [p["name"] for p in views[0]["participants"]] == ["عاصم", "فهد", "نورة"]
    assert "start_voting" in views[0]["actions"] and views[1]["actions"] == views[2]["actions"] == []

    # 7. A write without the current round is refused (BE-31), and changes nothing.
    r = client.post(f"{BASE}/{oid}/preferences/ready", headers=guest)
    assert r.status_code == 409 and _code(r) == "STALE_ROUND"


def test_an_outing_is_full_at_eight_people(api, sms_code):  # noqa: F811
    client, _ = api
    organizer = _sign_in(client, "منظم")
    outing = _create(client, organizer)
    oid, code = outing["outing_id"], outing["invite_code"]
    member = _sign_in(client, "عضو")
    assert client.post(f"{BASE}/{code}/join", headers=member).status_code == 200
    for i in range(6):  # organizer + member + 6 guests = 8
        _guest(client, code, f"ضيف {i}")
    assert client.get(f"{BASE}/{oid}", headers=organizer).json()["readiness"]["total_count"] == 8

    r = client.post(f"{BASE}/{code}/join-guest", json={"guest_name": "التاسع"})
    assert r.status_code == 409 and _code(r) == "OUTING_FULL"
    ninth = _sign_in(client, "تاسع")
    r = client.post(f"{BASE}/{code}/join", headers=ninth)
    assert r.status_code == 409 and _code(r) == "OUTING_FULL"
    # Joining again as someone already inside is not a ninth person.
    assert client.post(f"{BASE}/{code}/join", headers=member).status_code == 200


def test_a_guest_only_reaches_their_own_answers_in_their_own_outing(api, sms_code):  # noqa: F811
    client, _ = api
    organizer = _sign_in(client, "منظم")
    first = _create(client, organizer, "الطلعة الأولى")
    second = _create(client, organizer, "الطلعة الثانية")
    noura, sara = _guest(client, first["invite_code"], "نورة"), _guest(client, first["invite_code"], "سارة")
    other = _guest(client, second["invite_code"], "ريم")
    oid = first["outing_id"]
    client.post(f"{BASE}/{oid}/start-preferences", headers=organizer)

    body = {"budget_max": 40, "allergies": ["shellfish"], **_round(client, oid, noura)}
    assert client.put(f"{BASE}/{oid}/preferences", headers=noura, json=body).status_code == 200
    # Sara reads her own empty copy, never Noura's answers.
    saras = client.get(f"{BASE}/{oid}/preferences", headers=sara, params=_round(client, oid, sara)).json()
    assert saras["is_saved"] is False and saras["allergies"] == [] and saras["budget_max"] is None
    # The outing state lists people, not their private answers.
    state = client.get(f"{BASE}/{oid}", headers=sara).json()
    for person in state["participants"]:
        assert set(person) == {"participant_id", "name", "attendance", "preferences_done", "is_organizer"}
    assert "shellfish" not in str(state)

    # A guest pass works only in the outing it was issued for.
    for call in (lambda: client.get(f"{BASE}/{oid}", headers=other),
                 lambda: client.get(f"{BASE}/{oid}/preferences", headers=other, params={"round_id": body["round_id"]}),
                 lambda: client.put(f"{BASE}/{oid}/preferences", headers=other, json=body)):
        r = call()
        assert r.status_code == 403 and _code(r) == "NOT_A_PARTICIPANT"
    # Organizer-only actions are refused to a guest.
    r = client.post(f"{BASE}/{oid}/start-voting", headers=noura, json=_round(client, oid, noura))
    assert r.status_code == 403 and _code(r) == "ORGANIZER_ONLY"
