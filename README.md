# Thouq | ذوق

An Arabic restaurant discovery and group dining app. Browse without an account,
save personal food preferences, or invite companions to a one-off outing and
choose a restaurant together.

[Web app](https://thouq.onrender.com) · [API health](https://thouq-api.onrender.com/api/v1/health) · [Documentation](Docs/README.md)

## Run the project

The integration branch is `deployment`. The app uses Expo SDK 58, FastAPI and
PostgreSQL. Use the lockfile and the versioned setup instructions:

1. [Database setup and migrations](database/README.md).
2. [Backend configuration and API](backend/README.md).
3. [Frontend setup, web and iPhone](frontend/README.md).

To run the frontend against the shared API, from the repository root:

```sh
npm --prefix frontend ci
cp -n frontend/.env.example frontend/.env.local
npm run check
npm --prefix frontend start
```

If `.env.local` already exists, compare its values with `.env.example`; `cp -n`
does not replace it. The current API requires round-aware outing requests, so use
`EXPO_PUBLIC_SESSION_ROUNDS_ENABLED=true`. A native iPhone build needs its own
signing setup; Expo Go does not prove notification delivery.

## Repository map

| Directory | Purpose |
|---|---|
| `frontend/src/app` | Small route entrypoints |
| `frontend/src/application` | Page composition and app navigation |
| `frontend/src/features` | Feature screens, state and API adapters |
| `frontend/src/shared` | Shared UI, theme and HTTP tools |
| `backend/app` | FastAPI routes, services and infrastructure |
| `backend/tests` | Unit and PostgreSQL integration tests |
| `database/migrations` | Versioned Alembic schema changes |
| `Docs` | Architecture, contracts and Arabic guides |
| `Docs/mockups` | Design references and dated review evidence |

The restricted restaurant dataset is not stored here. Synthetic demo data and its repeatable
seed are documented in [the database guide](database/README.md).

## Implementation and validation

At `92412ee`, the repository includes authentication, account preferences,
personal discovery, saved restaurants, direct outings, guest joining,
preferences/readiness, voting, results and same-outing rounds.

Frontend work still remains for native notifications, leave/remove controls,
restaurant detail fetching, district/cuisine filters, and consistent invitation
sharing. The [frontend status map](Docs/Sprint-2-3-Frontend.ar.md) distinguishes
implemented code from acceptance still needed on devices.

[CI at this revision](https://github.com/shathaaa1110-arch/Portfolio-Project/actions/runs/43268119016)
passed 135 backend unit tests and 332 PostgreSQL integration tests; the integration
suite also passed a second run on the same database. Frontend checks include
TypeScript, architecture boundaries and behavior tests. Passing automated checks
does not replace an organizer/guest test on separate devices.

Run frontend checks with `npm run check`; auth regression is also available through
`node --test frontend/scripts/auth.test.cjs`. Backend/test database commands are in
[the backend guide](backend/README.md) and [database guide](database/README.md).
