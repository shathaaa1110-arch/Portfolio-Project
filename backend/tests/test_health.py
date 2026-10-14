from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_200():
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in {"ok", "degraded"}
    assert body["database"] in {"ok", "unreachable"}


def test_api_lives_under_v1():
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/v1/health" in paths
