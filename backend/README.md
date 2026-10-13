# Thouq API (backend)

FastAPI + PostgreSQL. Every endpoint lives under `/api/v1`.

## Run it locally

Needs Python 3.12 and a PostgreSQL database (local or Neon).

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then put your DATABASE_URL in .env
uvicorn app.main:app --reload
```

Check it: http://127.0.0.1:8000/api/v1/health

- `"database": "ok"` → the API reaches the database.
- `"database": "unreachable"` → the API runs but `DATABASE_URL` is wrong or the database is down.

Interactive docs for every endpoint: http://127.0.0.1:8000/docs

## Tests

```bash
pytest
```

## Layout

```
backend/
├── app/
│   ├── main.py              # entry point: creates the app, mounts /api/v1
│   ├── core/
│   │   ├── config.py        # settings from environment variables / .env
│   │   └── database.py      # engine, get_db session, Base for models
│   ├── api/v1/
│   │   ├── router.py        # joins every service router under /api/v1
│   │   └── health.py        # GET /api/v1/health
│   └── services/            # one module per service (TechnicalDoc 4.11)
│       ├── auth/            # sign up, verification code, tokens
│       ├── outings/         # groups and outings, join, guests
│       ├── preferences/     # participant preferences
│       ├── plan/            # recommendation engine and the plan
│       └── voting/          # votes, result, tie-break
├── tests/
├── requirements.txt
└── .env.example
```

A new endpoint goes in its service's `router.py`; the service is already mounted.

## Environment variables

| Name | What it is |
| --- | --- |
| `DATABASE_URL` | PostgreSQL URL. `postgres://` and `postgresql://` URLs from Neon or Render work as they are. |
| `ENVIRONMENT` | `development`, `staging` or `production` |
| `CORS_ORIGINS` | Comma-separated origins allowed to call the API from a browser (`*` in development) |

Never commit `.env`: the repository is public.
