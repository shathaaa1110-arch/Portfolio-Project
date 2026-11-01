"""Test target rejection must happen before a connection is opened."""
import importlib.util
from pathlib import Path

import pytest
from app.core.config import Settings, get_database_url, validate_test_database_url

SAFE = "postgresql+psycopg://thouq_test:dummy@127.0.0.1:5432/thouq_test"


def test_development_keeps_its_configured_target():
    settings = Settings(_env_file=None, environment="development", database_url="postgres://dev:dummy@localhost/dev")
    url = get_database_url(settings)
    assert url.database == "dev"
    assert url.drivername == "postgresql+psycopg"


def test_test_mode_never_falls_back_to_database_url():
    settings = Settings(_env_file=None, environment="test", database_url=SAFE, test_database_url=None)
    with pytest.raises(ValueError, match="required"):
        get_database_url(settings)


@pytest.mark.parametrize("prefix", ["postgres", "postgresql", "postgresql+psycopg"])
def test_supported_postgres_aliases(prefix):
    assert validate_test_database_url(SAFE.replace("postgresql+psycopg", prefix)).database == "thouq_test"


@pytest.mark.parametrize("unsafe", [
    None,
    "",
    "not-a-url",
    SAFE.replace("127.0.0.1", "production.example.com"),
    SAFE.replace("5432", "5433"),
    SAFE.replace("5432", "invalid"),
    SAFE.replace("/thouq_test", "/thouq_dev"),
    SAFE.replace("//thouq_test:", "//postgres:"),
    SAFE.replace(":dummy@", "@"),
    SAFE + "?host=production.example.com",
    SAFE + "?service=production",
    "sqlite:///thouq_test",
])
def test_reset_rejects_unsafe_targets_without_connecting(monkeypatch, unsafe):
    path = Path(__file__).resolve().parents[2] / "database" / "reset_test_db.py"
    spec = importlib.util.spec_from_file_location("reset_test_db", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    def forbidden_connection(*args, **kwargs):
        pytest.fail("Unsafe configuration attempted a connection")

    monkeypatch.setattr(module.psycopg, "connect", forbidden_connection)
    with pytest.raises(ValueError) as error:
        module.reset_test_database(unsafe)
    assert "dummy" not in str(error.value)


@pytest.mark.parametrize("role, owner", [
    ((True, True, False), None),
    ((False, False, False), None),
    ((False, True, False), ("someone_else",)),
])
def test_reset_refuses_unsafe_permissions_before_database_changes(monkeypatch, role, owner):
    path = Path(__file__).resolve().parents[2] / "database" / "reset_test_db.py"
    spec = importlib.util.spec_from_file_location("reset_test_db", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, query, params=None):
            if isinstance(query, str) and query.startswith("SELECT rolsuper"):
                self.result = role
            elif isinstance(query, str) and query.startswith("SELECT pg_get_userbyid"):
                self.result = owner
            else:
                pytest.fail("Rejected permissions must not trigger database mutations")
            return self

        def fetchone(self):
            return self.result

    monkeypatch.setattr(module.psycopg, "connect", lambda **kwargs: Connection())
    with pytest.raises(ValueError):
        module.reset_test_database(SAFE)


def test_test_connection_pins_address_despite_libpq_environment(monkeypatch):
    from app.core.config import get_database_connect_args
    monkeypatch.setenv("PGHOSTADDR", "192.0.2.1")
    assert get_database_connect_args()["hostaddr"] == "127.0.0.1"
