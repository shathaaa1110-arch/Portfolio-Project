"""Tests for GET /api/v1/users/me (BE-34)."""
from datetime import timedelta

from app.services.auth.models import User
from tests.test_auth_api import ctx, request_code, verify  # noqa: F401 (ctx is a fixture)
from tests.test_session import login, make_token


def test_me_returns_own_profile(ctx):
    token = login(ctx)
    r = ctx.client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Asim"
    assert body["phone"] == "0551234567"
    assert set(body) == {"id", "name", "phone"}

def test_me_without_token_returns_401(ctx):
    r = ctx.client.get("/api/v1/users/me")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "INVALID_TOKEN"

def test_me_with_expired_token_returns_401(ctx):
    login(ctx)
    with ctx.session() as db:
        uid = str(db.query(User).one().id)
    expired = make_token(uid, timedelta(seconds=-5))
    r = ctx.client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "TOKEN_EXPIRED"

def test_two_accounts_each_see_only_their_own_profile(ctx):
    token_a = login(ctx, name="Asim")
    request_code(ctx, phone="0559876543")
    token_b = verify(ctx, ctx.last_code(), name="Sara", phone="0559876543").json()["token"]

    me_a = ctx.client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token_a}"}).json()
    me_b = ctx.client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token_b}"}).json()

    assert (me_a["name"], me_a["phone"]) == ("Asim", "0551234567")
    assert (me_b["name"], me_b["phone"]) == ("Sara", "0559876543")
    assert me_a["id"] != me_b["id"]
