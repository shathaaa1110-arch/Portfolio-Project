"""Settings and database target selection shared by the API and migrations."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    app_name: str = "Thouq API"
    environment: str = "development"  # development | test | staging | production
    api_prefix: str = "/api/v1"
# postgresql+psycopg://user:password@host:5432/dbname
    database_url: str = "postgresql+psycopg://thouq:thouq@localhost:5432/thouq"
    test_database_url: str | None = None

# Comma-separated origins allowed to call the API from a browser.
    cors_origins: str = "*"

# Authentica API key used to send verification codes by SMS. Never commit it.
    authentica_api_key: str = ""

# SMS delivery: "mock" prints the code to the console, "real" sends it through Authentica.
    sms_mode: str = "mock"

# Secret used to sign login tokens and hash verification codes. Never commit it.
    secret_key: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


def normalize_database_url(value: str | URL) -> URL:
    try:
        url = make_url(value)
        if url.drivername in {"postgres", "postgresql"}:
            url = url.set(drivername="postgresql+psycopg")
        return url
    except Exception:
        raise ValueError("Invalid database URL; check the local configuration.") from None


def validate_test_database_url(value: str | URL | None) -> URL:
    """Reject unapproved targets before any test connection is opened."""
    if not value:
        raise ValueError("TEST_DATABASE_URL is required in test mode; no fallback is allowed.")
    try:
        url = normalize_database_url(value)
        allowed = (
            url.drivername == "postgresql+psycopg"
            and url.host == "127.0.0.1"
            and url.port == 5432
            and url.database == "thouq_test"
            and url.username == "thouq_test"
            and bool(url.password)
            and not url.query
        )
    except Exception:
        allowed = False
    if not allowed:
        raise ValueError(
            "Unsafe TEST_DATABASE_URL: require PostgreSQL/Psycopg, "
            "127.0.0.1:5432, database and user thouq_test, a password, "
            "and no URL query parameters."
        ) from None
    return url


def get_database_url(settings: Settings | None = None) -> URL:
    settings = settings or get_settings()
    if settings.environment == "test":
        return validate_test_database_url(settings.test_database_url)
    return normalize_database_url(settings.database_url)


def get_database_connect_args() -> dict:
    # Explicit host address prevents ambient PostgreSQL HOSTADDR/service settings from
    # redirecting an otherwise validated local test URL.
    if get_settings().environment == "test":
        return {"hostaddr": "127.0.0.1", "connect_timeout": 5}
    return {}
