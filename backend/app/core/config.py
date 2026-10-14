"""App settings, read from environment variables (and a local .env file)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Thouq API"
    environment: str = "development"  # development | staging | production
    api_prefix: str = "/api/v1"

    # postgresql+psycopg://user:password@host:5432/dbname
    database_url: str = "postgresql+psycopg://thouq:thouq@localhost:5432/thouq"

    # Comma-separated origins allowed to call the API from a browser.
    cors_origins: str = "*"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
