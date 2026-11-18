"""Logout ends login tokens for the outing endpoints too (0013), on PostgreSQL.

Outing endpoints read the token in current_caller and check the account in participant_of, so a
token from before a logout must be refused there as well, not only by current_user.
"""
import pytest
import sqlalchemy as sa
from app.services.auth.tokens import create_access_token
from tests.test_outing_state_integration import BASE, _session, api, secret  # noqa: F401

pytestmark = pytest.mark.integration


def test_an_outing_refuses_a_token_from_before_logout(api):
    client, conn = api
    oid, _, organizer, member, guest = _session(client, conn)
    user_id = conn.execute(sa.text("SELECT user_id FROM participants WHERE outing_id = :o AND user_id IS NOT NULL "
                                   "AND user_id <> (SELECT organizer_id FROM outings WHERE id = :o)"),
                           {"o": oid}).scalar_one()
    token = {"Authorization": f"Bearer {create_access_token(user_id, 0)}"}
    assert client.get(f"{BASE}/{oid}", headers=token).status_code == 200
    assert client.post("/api/v1/auth/logout", headers=token).status_code == 204
    for call in (lambda: client.get(f"{BASE}/{oid}", headers=token),
                 lambda: client.post(f"{BASE}/{oid}/leave", headers=token)):
        r = call()
        assert r.status_code == 401 and r.json()["error"]["code"] == "INVALID_TOKEN"
    # A new login (the next version) works, and guests are not affected.
    assert client.get(f"{BASE}/{oid}", headers={"Authorization": f"Bearer {create_access_token(user_id, 1)}"}
                      ).status_code == 200
    assert client.get(f"{BASE}/{oid}", headers=guest).status_code == 200
