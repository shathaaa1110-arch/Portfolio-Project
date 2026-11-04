"""DB-03 acceptance checks against migrated PostgreSQL, without ORM models.

Run after database/reset_test_db.py. Every test rolls back its data and DDL.
"""
from pathlib import Path
from uuid import uuid4

import pytest
from app.core.database import engine
from sqlalchemy import Text, Uuid, inspect, text
from sqlalchemy.exc import IntegrityError

pytestmark = pytest.mark.integration
SCHEMA = Path(__file__).resolve().parents[2] / "database" / "schema.sql"


@pytest.fixture
def connection():
    with engine.connect() as conn:
        transaction = conn.begin()
        try:
            yield conn
        finally:
            transaction.rollback()


def insert_user(conn, user_id, phone):
    conn.execute(
        text("""
            INSERT INTO users (id, name, phone_number, created_at)
            VALUES (:id, 'DB-03 account', :phone, CURRENT_TIMESTAMP)
        """),
        {"id": user_id, "phone": phone},
    )


def test_account_column_types_and_keys(connection):
    inspector = inspect(connection)
    columns = {column["name"]: column for column in inspector.get_columns("users")}
    assert isinstance(columns["id"]["type"], Uuid)
    assert isinstance(columns["phone_number"]["type"], Text)
    assert not columns["id"]["nullable"]
    assert not columns["phone_number"]["nullable"]
    assert inspector.get_pk_constraint("users")["constrained_columns"] == ["id"]
    assert any(
        constraint["column_names"] == ["phone_number"]
        for constraint in inspector.get_unique_constraints("users")
    )


@pytest.mark.parametrize("phone", ["+966500000001", "0500000002"])
def test_phone_text_round_trip(connection, phone):
    user_id = uuid4()
    insert_user(connection, user_id, phone)
    assert connection.execute(
        text("SELECT phone_number FROM users WHERE id = :id"), {"id": user_id}
    ).scalar_one() == phone


def test_duplicate_phone_rejected(connection):
    insert_user(connection, uuid4(), "+966500000003")
    with pytest.raises(IntegrityError) as error, connection.begin_nested():
        insert_user(connection, uuid4(), "+966500000003")
    assert error.value.orig.sqlstate == "23505"
    assert error.value.orig.diag.constraint_name == "users_phone_number_key"


def test_duplicate_id_with_different_phone_rejected(connection):
    user_id = uuid4()
    insert_user(connection, user_id, "+966500000004")
    with pytest.raises(IntegrityError) as error, connection.begin_nested():
        insert_user(connection, user_id, "+966500000005")
    assert error.value.orig.sqlstate == "23505"
    assert error.value.orig.diag.constraint_name == "users_pkey"


def test_null_phone_rejected(connection):
    with pytest.raises(IntegrityError) as error, connection.begin_nested():
        insert_user(connection, uuid4(), None)
    assert error.value.orig.sqlstate == "23502"


def test_existing_group_definitions_reference_one_user_id(connection):
    # PostgreSQL forbids temporary-to-permanent foreign keys. Use regular
    # tables in an isolated schema; the fixture rolls back the entire schema.
    test_schema = f"db03_{uuid4().hex}"
    connection.execute(text(f"CREATE SCHEMA {test_schema}"))
    connection.execute(text(f"SET LOCAL search_path TO {test_schema}, public"))
    schema = SCHEMA.read_text()
    for table in ("groups", "group_members"):
        start = schema.index(f"CREATE TABLE IF NOT EXISTS {table} (")
        statement = schema[start:schema.index(";", start) + 1]
        connection.execute(text(statement.replace(
            "CREATE TABLE IF NOT EXISTS", "CREATE TABLE", 1
        )))

    user_id, group_id = uuid4(), uuid4()
    insert_user(connection, user_id, "+966500000006")
    connection.execute(
        text("""
            INSERT INTO groups (id, name, organizer_id, created_at)
            VALUES (:group_id, 'DB-03 group', :user_id, CURRENT_TIMESTAMP)
        """),
        {"group_id": group_id, "user_id": user_id},
    )
    connection.execute(
        text("""
            INSERT INTO group_members (group_id, user_id, joined_at)
            VALUES (:group_id, :user_id, CURRENT_TIMESTAMP)
        """),
        {"group_id": group_id, "user_id": user_id},
    )
    assert connection.execute(text("""
        SELECT g.organizer_id, m.user_id FROM groups g
        JOIN group_members m ON m.group_id = g.id
    """)).one() == (user_id, user_id)

    for statement, parameters in (
        ("UPDATE groups SET organizer_id = :missing", {"missing": uuid4()}),
        ("UPDATE group_members SET user_id = :missing", {"missing": uuid4()}),
        ("DELETE FROM users WHERE id = :id", {"id": user_id}),
    ):
        with pytest.raises(IntegrityError) as error, connection.begin_nested():
            connection.execute(text(statement), parameters)
        assert error.value.orig.sqlstate == "23503"

    # References stay valid when the phone changes: it is not part of the key.
    connection.execute(
        text("UPDATE users SET phone_number = :phone WHERE id = :id"),
        {"phone": "+966500000007", "id": user_id},
    )
    assert connection.execute(text(
        "SELECT user_id FROM group_members WHERE group_id = :id"
    ), {"id": group_id}).scalar_one() == user_id
