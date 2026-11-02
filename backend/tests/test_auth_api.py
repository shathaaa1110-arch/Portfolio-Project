"""End-to-end tests for /auth/request-code, /auth/resend-code and /auth/verify.

They run against a temporary in-memory SQLite database, so they need no
Postgres and send no real SMS: send_code is replaced to capture the code.
"""
import uuid
from datetime import timedelta

import jwt
import pytest
from app.core.config import get_settings
from app.core.database import get_db
from app.main import app
from app.services.auth import router as auth_router
from app.services.auth.models import OtpCode, User, utcnow
from app.services.auth.sms import SmsSendError
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

PHONE = "0551234567"
SECRET = "test-secret"


@pytest.fixture
def ctx(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", SECRET)
    monkeypatch.setenv("SMS_MODE", "mock")
    get_settings.cache_clear()

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    User.__table__.create(engine)
    OtpCode.__table__.create(engine)
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE preferences (id CHAR(32) PRIMARY KEY, user_id CHAR(32))"))
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    sent = []

    def fake_send(phone, code):
        sent.append(code)

    app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(auth_router, "send_code", fake_send)

    class Ctx:
        client = TestClient(app)
        session = Session
        codes = sent

        @staticmethod
        def last_code():
            return sent[-1]

    yield Ctx
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def request_code(c, phone=PHONE):
    return c.client.post("/api/v1/auth/request-code", json={"phone": phone})


def verify(c, code, name=None, phone=PHONE):
    body = {"phone": phone, "code": code}
    if name is not None:
        body["name"] = name
    return c.client.post("/api/v1/auth/verify", json=body)


def age_latest_code(c, seconds):
    """Pretend the latest code was created `seconds` ago."""
    with c.session() as db:
        otp = db.query(OtpCode).order_by(OtpCode.created_at.desc()).first()
        otp.created_at -= timedelta(seconds=seconds)
        db.commit()


# ---------- request-code ----------


def test_request_code_returns_contract_fields(ctx):
    r = request_code(ctx)
    assert r.status_code == 200
    assert r.json() == {
        "message": "verification code sent",
        "code_length": 6,
        "expires_in_seconds": 300,
    }
    assert len(ctx.last_code()) == 6


def test_request_code_stores_hash_not_code(ctx):
    request_code(ctx)
    with ctx.session() as db:
        otp = db.query(OtpCode).one()
    assert ctx.last_code() not in otp.code_hash
    assert otp.phone == PHONE


def test_request_code_normalizes_arabic_digits(ctx):
    r = request_code(ctx, phone="٠٥٥١٢٣٤٥٦٧")
    assert r.status_code == 200
    with ctx.session() as db:
        assert db.query(OtpCode).one().phone == PHONE


def test_request_code_invalid_phone(ctx):
    r = request_code(ctx, phone="12345")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_PHONE"


def test_request_code_missing_field_uses_error_shape(ctx):
    r = ctx.client.post("/api/v1/auth/request-code", json={})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_request_code_rate_limited_within_60_seconds(ctx):
    request_code(ctx)
    r = request_code(ctx)
    assert r.status_code == 429
    err = r.json()["error"]
    assert err["code"] == "RATE_LIMITED"
    assert 0 < err["retry_after_seconds"] <= 60


def test_request_code_allowed_after_60_seconds(ctx):
    request_code(ctx)
    age_latest_code(ctx, 61)
    assert request_code(ctx).status_code == 200


def test_sms_failure_returns_503_and_saves_nothing(ctx, monkeypatch):
    def broken(phone, code):
        raise SmsSendError("down")

    monkeypatch.setattr(auth_router, "send_code", broken)
    r = request_code(ctx)
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "SMS_SEND_FAILED"
    with ctx.session() as db:
        assert db.query(OtpCode).count() == 0


# ---------- verify ----------


def test_new_user_signs_up_with_name(ctx):
    request_code(ctx)
    r = verify(ctx, ctx.last_code(), name="  Asim  ")
    assert r.status_code == 200
    body = r.json()
    assert body["expires_in_seconds"] == 30 * 24 * 60 * 60
    assert body["user"]["name"] == "Asim"
    assert body["user"]["has_saved_preferences"] is False

    claims = jwt.decode(body["token"], SECRET, algorithms=["HS256"])
    assert claims["sub"] == body["user"]["id"]
    with ctx.session() as db:
        assert db.query(User).one().phone_number == PHONE


def test_new_user_without_name_keeps_code_usable(ctx):
    request_code(ctx)
    code = ctx.last_code()
    r = verify(ctx, code)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "NAME_REQUIRED"

    r = verify(ctx, code, name="Asim")
    assert r.status_code == 200


def test_existing_user_logs_in_and_name_is_ignored(ctx):
    request_code(ctx)
    first = verify(ctx, ctx.last_code(), name="Asim").json()

    age_latest_code(ctx, 61)
    request_code(ctx)
    r = verify(ctx, ctx.last_code(), name="Someone else")
    assert r.status_code == 200
    assert r.json()["user"]["id"] == first["user"]["id"]
    assert r.json()["user"]["name"] == "Asim"
    with ctx.session() as db:
        assert db.query(User).count() == 1


def test_wrong_code(ctx):
    request_code(ctx)
    wrong = "000000" if ctx.last_code() != "000000" else "111111"
    r = verify(ctx, wrong, name="Asim")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "INVALID_CODE"


def test_expired_code(ctx):
    request_code(ctx)
    with ctx.session() as db:
        otp = db.query(OtpCode).one()
        otp.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    r = verify(ctx, ctx.last_code(), name="Asim")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "CODE_EXPIRED"


def test_code_works_only_once(ctx):
    request_code(ctx)
    code = ctx.last_code()
    assert verify(ctx, code, name="Asim").status_code == 200
    r = verify(ctx, code)
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "INVALID_CODE"


def test_five_wrong_attempts_lock_the_code(ctx):
    request_code(ctx)
    code = ctx.last_code()
    wrong = "000000" if code != "000000" else "111111"
    statuses = [verify(ctx, wrong, name="Asim").status_code for _ in range(5)]
    assert statuses == [401, 401, 401, 401, 429]

    r = verify(ctx, code, name="Asim")
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "TOO_MANY_ATTEMPTS"


def test_has_saved_preferences_true_when_row_exists(ctx):
    request_code(ctx)
    user_id = verify(ctx, ctx.last_code(), name="Asim").json()["user"]["id"]
    with ctx.session() as db:
        db.execute(
            text("INSERT INTO preferences (id, user_id) VALUES (:id, :uid)"),
            {"id": uuid.uuid4().hex, "uid": uuid.UUID(user_id).hex},
        )
        db.commit()

    age_latest_code(ctx, 61)
    request_code(ctx)
    r = verify(ctx, ctx.last_code())
    assert r.json()["user"]["has_saved_preferences"] is True


# ---------- resend-code ----------


def test_resend_without_request_returns_404(ctx):
    r = ctx.client.post("/api/v1/auth/resend-code", json={"phone": PHONE})
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NO_PENDING_CODE"


def test_resend_replaces_the_old_code(ctx):
    request_code(ctx)
    old = ctx.last_code()
    age_latest_code(ctx, 61)
    r = ctx.client.post("/api/v1/auth/resend-code", json={"phone": PHONE})
    assert r.status_code == 200
    assert r.json()["message"] == "new code sent"
    new = ctx.last_code()

    if old != new:
        assert verify(ctx, old, name="Asim").status_code == 401
    assert verify(ctx, new, name="Asim").status_code == 200
