"""Run after the reset command; these checks do not reset the database."""
import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from pathlib import Path
from sqlalchemy import text

from app.core.database import engine
from app.main import app

pytestmark = pytest.mark.integration


def test_migrated_postgres_identity_and_revision():
    config = Config(str(Path(__file__).resolve().parents[2] / "database" / "alembic.ini"))
    command.upgrade(config, "head")  # Applying an already-current migration is safe.
    expected = ScriptDirectory.from_config(config).get_current_head()
    with engine.connect() as conn:
        assert tuple(conn.execute(text("SELECT current_database(), current_user")).one()) == (
            "thouq_test", "thouq_test"
        )
        assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == expected


def test_api_reaches_real_postgresql():
    with TestClient(app) as client:
        response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok", "environment": "test"}
