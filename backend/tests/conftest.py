"""Select and validate the test target before test modules import the API."""
import os

os.environ["ENVIRONMENT"] = "test"

import pytest
from app.core.config import get_database_url, get_settings

get_settings.cache_clear()
try:
    get_database_url()
except ValueError as exc:
    raise pytest.UsageError(str(exc)) from None
