"""Database engine and session.

Every request that needs the database asks for a session with `Depends(get_db)`;
the session is closed when the request ends.
"""
from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_database_connect_args, get_database_url


engine = create_engine(
    get_database_url(),
    connect_args=get_database_connect_args(),
    pool_pre_ping=True,  # hosted Postgres (Neon) suspends idle connections
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Parent class for every ORM model (BE-02)."""


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def database_is_up() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
