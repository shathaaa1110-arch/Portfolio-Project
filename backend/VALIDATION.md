# BE-01 validation evidence

Validated locally on **21 October 2026**, against application code at
`a55fadb`, using Python 3.12.15 and PostgreSQL 18.6. This change adds the
[health contract, flow diagram, and shared error examples](README.md#health-check-contract)
and updates the [BE-01 task card](../%5BBE-01%5D%20Check%20the%20API%20skeleton%20and%20health%20check.md).
The existing application implementation passed without code changes.

## Real HTTP and database checks

A temporary PostgreSQL cluster used a generated password, loopback-only TCP,
and an available port separate from the host database. Uvicorn served
`app.main:app` on another loopback port, with `ENVIRONMENT=development` and
`DATABASE_URL` supplied to its process. No `.env` was needed or created.
The temporary database was `postgres`, with role `be01`; `SELECT 1` requires
no application tables or migrations.

The same Uvicorn process remained running throughout the database lifecycle.
The database was actually stopped with `pg_ctl -m fast -w stop`, then restarted;
neither the database helper nor its result was mocked.

| Check | HTTP | Observed response |
| --- | --- | --- |
| PostgreSQL running | 200 | `{"status":"ok","database":"ok","environment":"development"}` |
| PostgreSQL stopped | 200 | `{"status":"degraded","database":"unreachable","environment":"development"}` |
| PostgreSQL restarted | 200 | `{"status":"ok","database":"ok","environment":"development"}` |
| POST `/api/v1/auth/request-code` with `{}` | 422 | `{"error":{"code":"VALIDATION_ERROR","message":"Some fields are missing or invalid.","fields":["phone"]}}` |
| POST `/api/v1/auth/request-code` with `{"phone":"invalid"}` | 422 | `{"error":{"code":"INVALID_PHONE","message":"Phone number must be in the format 05XXXXXXXX."}}` |

The error requests were rejected before authentication database operations or
SMS delivery. `/openapi.json` returned 200 and listed all seven implemented
paths: health, restaurants, and auth request-code, resend-code, verify,
push-token, and logout. The outings, preferences, plan, and voting routers
remain registered; they currently declare no operations to expose in OpenAPI.

Both temporary processes were stopped and the temporary cluster, password,
and logs removed after validation. The existing host PostgreSQL service was
not stopped or reset.

## Automated checks

From `backend/`, using the existing virtual environment:

```bash
TEST_DATABASE_URL='postgresql+psycopg://thouq_test:unit-test-placeholder@127.0.0.1:5432/thouq_test' \
  .venv/bin/python -m pytest -m 'not integration' -q
```

Result: **85 passed, 2 deselected, 1 warning in 0.88s**. The password above is
only a configuration placeholder; this suite does not connect to PostgreSQL.
It includes all three health cases, shared error behavior, and service
regressions. The warning concerns Starlette's deprecated AnyIO
`BlockingPortal` alias. The two migration/database integration tests were not
run; the real HTTP lifecycle check above supplies BE-01 connectivity evidence.

The restricted execution sandbox caused TestClient to stall and hid host
PostgreSQL availability. The successful unit and live HTTP runs used approved
execution outside that sandbox. A preliminary validation-script assertion
incorrectly expected invalid-phone HTTP 400; the contract specifies 422.
Correcting that assertion produced the successful complete run above.

## Reproduce the live check

Use an isolated PostgreSQL instance that you own and can stop. With its
credentials configured in `DATABASE_URL`, start the API from `backend/`:

```bash
ENVIRONMENT=development .venv/bin/python -m uvicorn app.main:app \
  --host 127.0.0.1 --port 8000
```

In another terminal, set `BE01_PGDATA` to that isolated instance's data directory
and run the following. Keep the API process running throughout; use the same
PostgreSQL port and options when restarting the instance.

```bash
curl -i http://127.0.0.1:8000/api/v1/health
pg_ctl -D "$BE01_PGDATA" -m fast -w stop
curl -i http://127.0.0.1:8000/api/v1/health
pg_ctl -D "$BE01_PGDATA" -w start
curl -i http://127.0.0.1:8000/api/v1/health
curl -i http://127.0.0.1:8000/openapi.json
curl -i -H 'Content-Type: application/json' -d '{}' \
  http://127.0.0.1:8000/api/v1/auth/request-code
curl -i -H 'Content-Type: application/json' -d '{"phone":"invalid"}' \
  http://127.0.0.1:8000/api/v1/auth/request-code
```

Require the bodies and HTTP statuses in the table above, then stop the API
and clean up the isolated database. HTTP 200 alone is not health acceptance.
Never use the unit-test placeholder password as real database credentials.
