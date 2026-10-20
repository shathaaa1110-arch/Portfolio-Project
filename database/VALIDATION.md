# DB-02 validation evidence

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
