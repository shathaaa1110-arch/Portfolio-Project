"""QA-01 (#56): prove the shared database helpers leave nothing behind.

Run after database/reset_test_db.py, like every integration test.
"""
import uuid

import pytest
from app.core.config import get_settings
from app.services.auth.models import User
from app.services.auth.tokens import create_access_token
from sqlalchemy import func, select

pytestmark = pytest.mark.integration

# Fixed synthetic values, so a row left over from an earlier test would be found
PHONE = "0500000056"
FAILED_PHONE = "0500000057"
USER_ID = uuid.UUID("00000000-0000-4000-8000-000000000056")
NAME = "QA-01 synthetic user"


def count_users(session, phone=PHONE):
    return session.scalar(select(func.count()).select_from(User).where(User.phone_number == phone))


def add_test_user(session):
    session.add(User(id=USER_ID, name=NAME, phone_number=PHONE))
    session.commit()  # The API commits the same way


@pytest.fixture
def secret_key(monkeypatch):
    # Tokens need a secret; clear the cached settings before and after
    monkeypatch.setenv("SECRET_KEY", "qa01-test-secret")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.mark.parametrize("run", [1, 2])
def test_committed_rows_are_rolled_back(db_session, run):
    # The second run fails here if the first run's row escaped the rollback
    assert count_users(db_session) == 0
    add_test_user(db_session)
    assert count_users(db_session) == 1


def test_rollback_in_code_keeps_earlier_test_rows(db_session):
    add_test_user(db_session)

    # A failing request writes, then rolls back
    db_session.add(User(name="QA-01 failed request", phone_number=FAILED_PHONE))
    db_session.flush()
    db_session.rollback()

    assert count_users(db_session, FAILED_PHONE) == 0
    assert count_users(db_session) == 1


def test_api_reads_rows_from_the_test_transaction(db_session, api_client, secret_key):
    add_test_user(db_session)
    token = create_access_token(USER_ID)

    response = api_client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {"id": str(USER_ID), "name": NAME, "phone": PHONE}
    