"""Recreate only the approved local test database and migrate it to head."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import psycopg
from alembic import command
from alembic.config import Config
from app.core.config import Settings, validate_test_database_url  # pyright: ignore[reportMissingImports]
from psycopg import sql
from sqlalchemy.engine import URL


def reset_test_database(value: str | URL | None) -> str:
    url = validate_test_database_url(value)  # Must precede every connection.
    connection_values = {
        "host": url.host, "hostaddr": url.host, "port": url.port, "user": url.username, "password": url.password,
        "connect_timeout": 5,
    }
    with psycopg.connect(dbname="postgres", autocommit=True, **connection_values) as conn:
        role = conn.execute(
            "SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user"
        ).fetchone()
        if role != (False, True, False):
            raise ValueError("Test role must have CREATEDB, NOSUPERUSER, and NOCREATEROLE.")
        owner = conn.execute(
            "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = %s",
            (url.database,),
        ).fetchone()
        if owner and owner[0] != url.username:
            raise ValueError("Refusing reset: test database is owned by another role.")
        name = sql.Identifier(url.database)
        user = sql.Identifier(url.username)
        conn.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(name))
        conn.execute(sql.SQL("CREATE DATABASE {} OWNER {} TEMPLATE template0").format(name, user))
        conn.execute(sql.SQL("REVOKE CONNECT ON DATABASE {} FROM PUBLIC").format(name))
        conn.execute(sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(name, user))

    config = Config(str(ROOT / "database" / "alembic.ini"))
    config.attributes["test_database_url"] = url
    command.upgrade(config, "head")
    with psycopg.connect(dbname=url.database, **connection_values) as conn:
        identity = conn.execute("SELECT current_database(), current_user").fetchone()
        if identity != ("thouq_test", "thouq_test"):
            raise ValueError("Unexpected database identity after reset.")
        revision = conn.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    return revision


def main() -> int:
    os.environ["ENVIRONMENT"] = "test"
    try:
        settings = Settings()
        revision = reset_test_database(settings.test_database_url)
    except ValueError as exc:
        # Validator and ownership errors contain no connection values.
        print(f"Test database reset failed: {exc}", file=sys.stderr)
        return 1
    except Exception:
        # Driver and migration errors may contain credentials or query values.
        print(
            "Test database reset failed. Check PostgreSQL availability, local role "
            "permissions, credentials, and migrations. Connection details are hidden.",
            file=sys.stderr,
        )
        return 1
    print(f"Ready: thouq_test on 127.0.0.1:5432; user thouq_test; revision {revision}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
