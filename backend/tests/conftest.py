"""Select and validate the test target before test modules import the API."""
import json
import os
from pathlib import Path

os.environ["ENVIRONMENT"] = "test"

import pytest
from app.core.config import get_database_url, get_settings

get_settings.cache_clear()
try:
    get_database_url()
except ValueError as exc:
    raise pytest.UsageError(str(exc)) from None

# Imported only after the test target is validated, so the engine uses thouq_test.
from app.core.database import engine, get_db
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


@pytest.fixture
def db_connection():
    """A PostgreSQL connection whose transaction is rolled back after the test.

    Not autouse: unit tests run without PostgreSQL and never ask for it.
    """
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            yield connection
        finally:
            transaction.rollback()


@pytest.fixture
def db_session(db_connection):
    """An ORM session on the test connection.

    create_savepoint keeps commit() and rollback() inside a savepoint, so the
    code under test cannot end the test transaction; the final rollback removes all.
    """
    session = Session(
        bind=db_connection,
        join_transaction_mode="create_savepoint",
        autoflush=False,
        expire_on_commit=False,
    )
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def api_client(db_session):
    """A TestClient whose requests use db_session instead of a new session."""

    def use_test_session():
        yield db_session

    app.dependency_overrides[get_db] = use_test_session
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db, None)


SYNTHETIC_RESTAURANTS = Path(__file__).parent / "data" / "synthetic_restaurants.json"


@pytest.fixture
def synthetic_restaurants():
    """Synthetic restaurant rows; feature tests insert them once their migration exists."""
    with SYNTHETIC_RESTAURANTS.open(encoding="utf-8") as file:
        return json.load(file)["restaurants"]
    