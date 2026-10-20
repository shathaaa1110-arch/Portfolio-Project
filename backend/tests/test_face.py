"""Face login experiment: enroll, login, mismatch lock, disable, and the Authentica client."""
import base64
from datetime import timedelta

import httpx
import pytest

from app.services.auth import face as face_module
from app.services.auth.models import FaceProfile, User, utcnow
from tests.test_auth_api import PHONE, ctx, request_code, verify  # noqa: F401

JPEG_A = b"\xff\xd8\xff" + b"A" * 50
JPEG_B = b"\xff\xd8\xff" + b"B" * 50


@pytest.fixture(autouse=True)
def mock_face(monkeypatch):
    monkeypatch.setenv("FACE_MODE", "mock")


def b64(raw):
    return base64.b64encode(raw).decode()


def login(c):
    request_code(c)
    return {"Authorization": f"Bearer {verify(c, c.last_code(), name='Asim').json()['token']}"}


def enroll(c, headers, raw=JPEG_A, consent=True):
    return c.client.post("/api/v1/auth/face/enroll", json={"image": b64(raw), "consent": consent}, headers=headers)


def face_login(c, raw, phone=PHONE):
    return c.client.post("/api/v1/auth/face/login", json={"phone": phone, "image": b64(raw)})


@pytest.fixture
def face_ctx(ctx):
    FaceProfile.__table__.create(ctx.session().get_bind())
    return ctx


def test_enroll_then_login_returns_token(face_ctx):
    h = login(face_ctx)
    assert enroll(face_ctx, h).status_code == 201
    r = face_login(face_ctx, JPEG_A)
    assert r.status_code == 200
    assert r.json()["user"]["name"] == "Asim" and r.json()["token"]


def test_enroll_needs_login(face_ctx):
    r = face_ctx.client.post("/api/v1/auth/face/enroll", json={"image": b64(JPEG_A), "consent": True})
    assert r.json()["error"]["code"] == "INVALID_TOKEN"


def test_enroll_needs_consent(face_ctx):
    r = enroll(face_ctx, login(face_ctx), consent=False)
    assert r.status_code == 422 and r.json()["error"]["code"] == "CONSENT_REQUIRED"


def test_enroll_rejects_non_image(face_ctx):
    r = enroll(face_ctx, login(face_ctx), raw=b"not an image")
    assert r.json()["error"]["code"] == "INVALID_IMAGE"


def test_login_without_enrollment_is_404(face_ctx):
    login(face_ctx)
    assert face_login(face_ctx, JPEG_A).json()["error"]["code"] == "FACE_NOT_ENROLLED"
    assert face_login(face_ctx, JPEG_A, phone="0559999999").json()["error"]["code"] == "FACE_NOT_ENROLLED"


def test_mismatch_locks_after_five(face_ctx):
    enroll(face_ctx, login(face_ctx))
    for _ in range(4):
        assert face_login(face_ctx, JPEG_B).json()["error"]["code"] == "FACE_MISMATCH"
    assert face_login(face_ctx, JPEG_B).json()["error"]["code"] == "FACE_MISMATCH"
    r = face_login(face_ctx, JPEG_A)
    assert r.status_code == 429 and r.json()["error"]["code"] == "TOO_MANY_ATTEMPTS"


def test_lock_expires(face_ctx):
    enroll(face_ctx, login(face_ctx))
    with face_ctx.session() as db:
        p = db.query(FaceProfile).one()
        p.locked_until = utcnow() - timedelta(seconds=1)
        db.commit()
    assert face_login(face_ctx, JPEG_A).status_code == 200


def test_disable_deletes_photo(face_ctx):
    h = login(face_ctx)
    enroll(face_ctx, h)
    assert face_ctx.client.delete("/api/v1/auth/face", headers=h).status_code == 204
    with face_ctx.session() as db:
        assert db.query(FaceProfile).count() == 0
    assert face_login(face_ctx, JPEG_A).json()["error"]["code"] == "FACE_NOT_ENROLLED"


# --- Authentica client ---

class FakeResp:
    def __init__(self, status, data):
        self.status_code, self._data = status, data

    def json(self):
        return self._data


@pytest.fixture
def real(monkeypatch):
    from app.core.config import get_settings
    monkeypatch.setenv("FACE_MODE", "real")
    monkeypatch.setenv("AUTHENTICA_API_KEY", "k")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.mark.parametrize("result,expected", [("true", True), ("false", False), (True, True), (False, False)])
def test_result_text_is_parsed_strictly(real, monkeypatch, result, expected):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: FakeResp(200, {"success": True, "data": {"result": result}}))
    assert face_module.faces_match("u", b"x", b"y") is expected


def test_provider_error_raises(real, monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: FakeResp(401, {"errors": [{"message": "Unauthorized"}]}))
    with pytest.raises(face_module.FaceServiceError):
        face_module.faces_match("u", b"x", b"y")
