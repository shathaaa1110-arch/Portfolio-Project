"""Database engine and session.

Every request that needs the database asks for a session with `Depends(get_db)`;
the session is closed when the request ends.
"""
from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


def _normalize_url(url: str) -> str:
    # Hosts like Neon and Render hand out "postgres://" or "postgresql://" URLs;
    # SQLAlchemy needs the driver named explicitly.
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


engine = create_engine(
    _normalize_url(get_settings().database_url),
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
