"""Use the same database selection as the API; never store credentials here."""
from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import get_database_connect_args, get_database_url, validate_test_database_url

config = context.config
# Only the reset helper supplies this attribute; revalidate its disposable target.
test_url = config.attributes.get("test_database_url")
url = validate_test_database_url(test_url) if test_url is not None else get_database_url()
target_metadata = None  # DB-02 is an empty baseline; table migrations follow later.

if context.is_offline_mode():
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    connect_args = (
        {"hostaddr": "127.0.0.1", "connect_timeout": 5}
        if test_url is not None else get_database_connect_args()
    )
    engine = create_engine(url, poolclass=pool.NullPool, connect_args=connect_args)
    try:
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=target_metadata)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()
