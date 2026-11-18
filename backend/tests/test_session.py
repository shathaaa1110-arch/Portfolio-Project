"""Tests for the session (BE-05): token checks, /auth/push-token and /auth/logout."""
import uuid
from datetime import timedelta

import jwt
from app.services.auth.models import User, utcnow
from app.services.auth.tokens import create_access_token
from tests.test_auth_api import SECRET, ctx, request_code, verify  # noqa: F401  (ctx is a fixture)


def login(c, name="Asim"):
    request_code(c)
    return verify(c, c.last_code(), name=name).json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def make_token(sub, exp_delta, secret=SECRET):
    now = utcnow()
    return jwt.encode({"sub": sub, "iat": now, "exp": now + exp_delta}, secret, algorithm="HS256")


def push_token_of(c, phone="0551234567"):
    with c.session() as db:
        return db.query(User).filter_by(phone_number=phone).one().push_token


def test_logout_clears_push_token_and_returns_204(ctx):
    token = login(ctx)
    assert ctx.client.post("/api/v1/auth/push-token", json={"push_token": "ExponentPushToken[x]"}, headers=auth(token)).status_code == 200
    assert push_token_of(ctx) == "ExponentPushToken[x]"

    r = ctx.client.post("/api/v1/auth/logout", headers=auth(token))
    assert r.status_code == 204
    assert r.content == b""
    assert push_token_of(ctx) is None


def test_push_token_is_saved(ctx):
    token = login(ctx)
    r = ctx.client.post("/api/v1/auth/push-token", json={"push_token": "abc"}, headers=auth(token))
    assert r.status_code == 200
    assert r.json() == {"message": "push token updated"}
    assert push_token_of(ctx) == "abc"


def test_empty_push_token_is_rejected(ctx):
    token = login(ctx)
    r = ctx.client.post("/api/v1/auth/push-token", json={"push_token": "  "}, headers=auth(token))
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_missing_token_returns_invalid_token(ctx):
    r = ctx.client.post("/api/v1/auth/logout")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "INVALID_TOKEN"


def test_garbage_token_returns_invalid_token(ctx):
    r = ctx.client.post("/api/v1/auth/logout", headers=auth("not-a-jwt"))
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "INVALID_TOKEN"


def test_wrong_scheme_returns_invalid_token(ctx):
    token = login(ctx)
    r = ctx.client.post("/api/v1/auth/logout", headers={"Authorization": f"Basic {token}"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "INVALID_TOKEN"


def test_token_signed_with_other_secret_returns_invalid_token(ctx):
    login(ctx)
    with ctx.session() as db:
        uid = str(db.query(User).one().id)
    r = ctx.client.post("/api/v1/auth/logout", headers=auth(make_token(uid, timedelta(days=1), "other")))
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "INVALID_TOKEN"


def test_expired_token_returns_token_expired(ctx):
    login(ctx)
    with ctx.session() as db:
        uid = str(db.query(User).one().id)
    r = ctx.client.post("/api/v1/auth/logout", headers=auth(make_token(uid, timedelta(seconds=-5))))
    assert r.status_code == 401
    assert r.json()["error"] == {
        "code": "TOKEN_EXPIRED",
        "message": "Your session has expired. Please log in again.",
    }


def test_token_for_unknown_user_returns_invalid_token(ctx):
    token = make_token(str(uuid.uuid4()), timedelta(days=1))
    r = ctx.client.post("/api/v1/auth/logout", headers=auth(token))
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "INVALID_TOKEN"


def test_user_can_log_in_again_after_logout(ctx):
    token = login(ctx)
    assert ctx.client.post("/api/v1/auth/logout", headers=auth(token)).status_code == 204
    # 61 seconds later the same phone asks for a new code and logs in without a name.
    from tests.test_auth_api import age_latest_code
    age_latest_code(ctx, 61)
    request_code(ctx)
    r = verify(ctx, ctx.last_code())
    assert r.status_code == 200
    assert r.json()["user"]["name"] == "Asim"


# ---------- logout ends login tokens (0013, security review 12 Nov 2026) ----------

def test_logout_ends_the_token_that_was_used(ctx):
    token = login(ctx)
    assert ctx.client.post("/api/v1/auth/logout", headers=auth(token)).status_code == 204
    for call in (lambda: ctx.client.post("/api/v1/auth/push-token", json={"push_token": "x"}, headers=auth(token)),
                 lambda: ctx.client.get("/api/v1/users/me/preferences", headers=auth(token)),
                 lambda: ctx.client.post("/api/v1/auth/logout", headers=auth(token))):
        r = call()
        assert r.status_code == 401 and r.json()["error"]["code"] == "INVALID_TOKEN"


def test_logout_ends_every_device_and_a_new_login_works(ctx):
    phone = login(ctx)
    with ctx.session() as db:
        user = db.query(User).filter_by(phone_number="0551234567").one()
        laptop = create_access_token(user.id, user.token_version)  # the same account on a second device
    assert ctx.client.post("/api/v1/auth/push-token", json={"push_token": "x"}, headers=auth(laptop)).status_code == 200
    assert ctx.client.post("/api/v1/auth/logout", headers=auth(phone)).status_code == 204
    assert ctx.client.post("/api/v1/auth/push-token", json={"push_token": "x"}, headers=auth(laptop)).status_code == 401
    with ctx.session() as db:
        user = db.query(User).filter_by(phone_number="0551234567").one()
        fresh = create_access_token(user.id, user.token_version)  # what the next login issues
    assert ctx.client.post("/api/v1/auth/push-token", json={"push_token": "x"}, headers=auth(fresh)).status_code == 200


def test_a_token_from_before_versions_works_until_the_first_logout(ctx):
    login(ctx)
    with ctx.session() as db:
        user_id = str(db.query(User).filter_by(phone_number="0551234567").one().id)
    old = make_token(user_id, timedelta(days=1))  # no "ver": issued before 0013
    assert ctx.client.post("/api/v1/auth/push-token", json={"push_token": "x"}, headers=auth(old)).status_code == 200
    assert ctx.client.post("/api/v1/auth/logout", headers=auth(old)).status_code == 204
    assert ctx.client.post("/api/v1/auth/push-token", json={"push_token": "x"}, headers=auth(old)).status_code == 401


def test_a_version_that_is_not_a_whole_number_is_refused(ctx):
    """After one logout the account is at version 1; true and 1.0 compare equal to 1 in Python,
    so only the type check keeps such a token out."""
    ctx.client.post("/api/v1/auth/logout", headers=auth(login(ctx)))
    with ctx.session() as db:
        user_id = str(db.query(User).filter_by(phone_number="0551234567").one().id)
    now = utcnow()
    for ver in ("1", -1, True, 1.0):
        token = jwt.encode({"sub": user_id, "ver": ver, "iat": now, "exp": now + timedelta(days=1)},
                           SECRET, algorithm="HS256")
        r = ctx.client.post("/api/v1/auth/push-token", json={"push_token": "x"}, headers=auth(token))
        assert r.status_code == 401, ver
