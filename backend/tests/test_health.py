import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.v1 import health

client = TestClient(app)


@pytest.mark.parametrize("available", [True, False])
def test_health_returns_database_status(monkeypatch, available):
    monkeypatch.setattr(health, "database_is_up", lambda: available)
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {
        "status": "ok" if available else "degraded",
        "database": "ok" if available else "unreachable",
        "environment": "test",
    }


def test_api_lives_under_v1():
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/v1/health" in paths
