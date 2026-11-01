# Database validation evidence

## DB-03 — account keys and phone storage

### Changes

- [Migration `0002_account_keys_and_phone`](migrations/versions/0002_account_keys_and_phone.py)
  creates only `users`, following DB-02's empty baseline. The sole primary key is
  UUID `id`; `phone_number` is required, unique `TEXT`.
- [Draft schema](schema.sql) already had these account types and keys; its account
  section now identifies the implementing migration. Group definitions are unchanged.
- [Database diagram and account dictionary](../Docs/TechnicalDoc.md#users) now use
  `phone_number` and the existing timestamp type, and distinguish the implemented
  account table from draft group/application tables.
- [PostgreSQL acceptance tests](../backend/tests/test_account_schema_integration.py)
  check column types/keys, `+` and leading-zero preservation, duplicate phones,
  duplicate IDs with different phones, null phones, and compatibility with the
  actual draft `groups`/`group_members` foreign keys. Group tables in an isolated
  schema and account rows are rolled back; no group features or Python models
  were added. PostgreSQL temporary tables cannot reference permanent tables,
  so the compatibility test uses transactional regular tables instead.

### Observed results

| Check | Result |
| --- | --- |
| Non-integration backend suite | **89 passed**, 9 integration cases deselected; one existing dependency deprecation warning |
| Alembic `upgrade head --sql` | Passed; emits the empty baseline followed by `users` with UUID PK and unique required TEXT phone |
| Alembic downgrade SQL to `0001_empty_baseline` | Passed; emits `DROP TABLE users` and revision update |
| Clean PostgreSQL reset | Passed; recreated only `thouq_test` and applied head `0002_account_keys_and_phone` |
| Full backend suite against migrated PostgreSQL | **98 passed**, 25 dependency deprecation warnings |
| Live downgrade / re-upgrade | Passed; revision `0001_empty_baseline`, then `0002_account_keys_and_phone (head)` |
| Integration suite after re-upgrade | **9 passed**, 89 deselected |
| Cleanup / scope | Only `alembic_version` and `users` remain in public; no test schemas or account rows remain |

Live validation used PostgreSQL 18.6, Python 3.14.8, and Alembic 1.20.0. 
The warnings come from Starlette/AnyIO and FastAPI's deprecated asyncio API usage, not DB-03 failures.
The full suite includes duplicate-phone rejection and single-ID foreign-key
acceptance against real PostgreSQL, not just offline SQL generation.
No development database, password values, or remote issue was changed.

### Reproduce validation

Configure local credentials using [README.md](README.md), then from the root:

```bash
backend/.venv/bin/python database/reset_test_db.py
ENVIRONMENT=test backend/.venv/bin/python -m alembic -c database/alembic.ini current
backend/.venv/bin/python -m pytest -q -c backend/pytest.ini backend/tests
```

Expected head: `0002_account_keys_and_phone`. The full suite includes seven new
DB-03 PostgreSQL cases and the two existing database integration checks.
To check reversibility **only on the disposable test database**, from the root:

```bash
ENVIRONMENT=test backend/.venv/bin/python -m alembic -c database/alembic.ini downgrade 0001_empty_baseline
ENVIRONMENT=test backend/.venv/bin/python -m alembic -c database/alembic.ini upgrade head
backend/.venv/bin/python -m pytest -q -c backend/pytest.ini backend/tests -m integration
```

Downgrade deletes account data. Do not run it against development or production.

The successful offline checks used a process-local URL with the required local
host/user/database and an unused placeholder password; no connection was attempted:

```bash
export ENVIRONMENT=test
export TEST_DATABASE_URL='postgresql+psycopg://thouq_test:unused@127.0.0.1:5432/thouq_test'
backend/.venv/bin/python -m pytest -q -c backend/pytest.ini backend/tests -m 'not integration'
backend/.venv/bin/python -m alembic -c database/alembic.ini upgrade head --sql
backend/.venv/bin/python -m alembic -c database/alembic.ini downgrade 0002_account_keys_and_phone:0001_empty_baseline --sql
unset ENVIRONMENT TEST_DATABASE_URL
```

## DB-02 validation evidence (historical)

The results below predate DB-03 and describe the environment at that time; they
are not evidence that DB-03's live migration or new integration tests passed.

Validated locally on 20 October 2026 using Python 3.12.15, PostgreSQL 18.6 client
and Alembic 1.20.0. These are local runtime results, not a claim that a teammate
has reproduced the setup or that the complete sprint journey is implemented.

## Implemented changes

- Explicit development/test database selection with no test-to-development fallback.
- Separate local database roles; only the test role has CREATEDB.
- Committed Alembic configuration and revision `0001_empty_baseline`.
- `python database/reset_test_db.py` recreates the approved local test database,
  applies migrations, and confirms database/user/revision.
- Target validation happens before connection. Ownership and role checks happen
  before reset. Test connections pin loopback even with conflicting libpq settings.
- Unit health checks use mocks; integration health checks use real PostgreSQL.
- Setup instructions and database separation diagram are in [README.md](README.md).

## Observed results

| Check | Result |
| --- | --- |
| First reset when no test database existed | Created `thouq_test`; revision `0001_empty_baseline` |
| Development `alembic upgrade head` and `current` | `0001_empty_baseline (head)` |
| Repeat resets | Both completed successfully |
| Temporary object/data in test database | Removed after reset |
| Temporary development data across test resets | Preserved; validation marker then removed |
| Missing test URL and remote test URL | Reset process exited 1; password absent from output |
| Wrong role attributes / database owner | Unit checks reject before database mutation |
| Conflicting `PGHOSTADDR=192.0.2.1` | Reset and full suite still connected to approved loopback target |
| Full backend suite after final code changes | **81 passed**, one dependency deprecation warning |
| Real Uvicorn HTTP request to `/api/v1/health` | HTTP 200; `status=ok`, `database=ok`, `environment=test` |
| Secret file handling | `backend/.env` ignored by Git and permissions set to 0600 |
| Whitespace validation | `git diff --check` passed |

The full suite includes 79 unit/safety tests and 2 PostgreSQL integration tests.
The warning is Starlette's use of an AnyIO deprecated alias; it did not affect
these checks. Validation API processes were stopped after the check. PostgreSQL
and the local databases remain available for development.

## Reproduce the main checks

From the repository root, after the setup guide:

```bash
source backend/.venv/bin/activate
python database/reset_test_db.py
alembic -c database/alembic.ini upgrade head
alembic -c database/alembic.ini current
cd backend
python -m pytest -q
```

For the ambient libpq regression, from the root:

```bash
PGHOSTADDR=192.0.2.1 python database/reset_test_db.py
cd backend
PGHOSTADDR=192.0.2.1 python -m pytest -q
```

The address above is a documentation-only address; explicit test connection
arguments prevent it being used. The health endpoint must report `database: ok`;
HTTP 200 alone is not acceptance evidence.


No remote issue was modified during this local implementation. The existing draft
`schema.sql` edits were preserved. Application-table corrections, authentication
against those tables, preferences persistence, and the Home journey require their
subsequent tasks; the empty migration does not prove those features work.
