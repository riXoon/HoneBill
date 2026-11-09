# NestJS Backend Migration: Contributor Guide

This guide is the shared starting point for anyone working on the backend migration.
It explains what to install, where code belongs, how to divide the work, how to run the
backend, and what must be included in every pull request.

The migration plan is the source of truth for endpoint coverage and phase status:

`docs/backend-rebuild/01-nestjs-migration-plan.md`

## 1. Project map

| Location | Purpose | Rule |
|---|---|---|
| `apps/backend` | New NestJS backend | Add all migrated backend code here |
| `apps/_legacy/backend` | Old Next.js backend | Read-only reference; never edit or import it |
| `apps/mobile` | Mobile application | Do not change it to hide backend parity problems |
| `packages/pijin_core` | Shared Soroban contract package | Coordinate before changing its public API |
| `docs/backend-rebuild` | Migration decisions and status | Update the plan in the same PR as the feature |

The new backend currently contains shared infrastructure under `apps/backend/src/infra`:

- `prisma`: database access
- `redis`: Redis client
- `queue`: BullMQ setup
- `lock`: distributed locking
- `stellar`: Stellar and Soroban clients

Feature code belongs under `apps/backend/src/modules/<domain>`.

## 2. Install and prepare the repository

For development outside containers, use Node.js 22 and npm. From the repository root:

```powershell
npm install
npm run build:sdk
npx prisma generate --schema=apps/backend/prisma/schema.prisma
```

The repository already includes the backend dependencies. Do not install NestJS packages
one by one unless the team has agreed that a new dependency is needed. If a dependency is
needed, update `apps/backend/package.json` and the appropriate lockfile in the same PR.

Create a local backend environment file for Compose and integrations. Never commit it:

```powershell
Copy-Item apps/backend/.env.example apps/backend/.env
```

For the Compose setup, you can keep the database and Redis values from the example;
Compose overrides them inside the backend container so it connects to the local services.
For running Nest directly on your machine, use local host addresses instead:

```dotenv
NODE_ENV=development
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
QUEUE_ENABLED=false
```

The complete variable list and descriptions are in `apps/backend/.env.example`.
Use testnet Stellar values while developing. Never commit real secret keys, API keys,
database credentials, or `.env` files.

## 3. Local services

Feature work that touches Prisma needs PostgreSQL. Redis is needed for rate limiting,
locks, OTP/PIN state, and queue work. The root `compose.yaml` starts both services and
the backend together. For external services such as Stellar testnet, TextBee, and any
third-party integrations, use approved development credentials; do not add credentials
to the repository.

### Start the full local stack with Docker

Install and start Docker Desktop, then from the repository root:

```powershell
Copy-Item apps/backend/.env.example apps/backend/.env
docker compose up --build -d
```

The Docker build context is the repository root because the image uses the root npm
workspaces. The Compose file starts PostgreSQL, Redis, and the Nest backend, waits for
PostgreSQL and Redis to become healthy, and wires the backend to them. It reads
`apps/backend/.env` for integration settings and overrides the database/Redis connection
inside the container. Do not put real production credentials in this local file.

Apply the checked-in Prisma migrations to the Compose database once it is healthy:

```powershell
docker compose exec -w /app/apps/backend backend npx prisma migrate deploy
```

Then check the API and container logs:

```powershell
Invoke-WebRequest http://localhost:3000/api/docs-json
docker compose logs -f backend
```

Stop the services and keep the database volume:

```powershell
docker compose down
```

The Postgres data is stored in the named `postgres_data` volume and remains between
starts. Avoid removing that volume unless you intentionally want to erase the local DB.

Before running a feature that uses the database, verify that the database URL points to a
development database. The migration must reuse the existing schema and migrations:

```powershell
npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma
npx prisma generate --schema=apps/backend/prisma/schema.prisma
```

Do not create or edit a Prisma migration during the NestJS parity migration. Schema
changes happen only after the cutover unless the migration plan is changed first.

## 4. Running the backend

Run commands from the repository root so npm resolves the workspace correctly:

```powershell
# Type-check the backend
npm run typecheck --workspace=backend

# Start the backend once
npm run start --workspace=backend

# Start with automatic reload while developing
npm run start:dev --workspace=backend

# Run unit tests
npm test --workspace=backend

# Run tests in watch mode
npm run test:watch --workspace=backend

# Run end-to-end tests
npm run test:e2e --workspace=backend

# Build the backend
npm run build --workspace=backend
```

Tests are grouped under `apps/backend/test`: unit tests in `unit-testing/`,
end-to-end tests in `e2e-testing/`, and parity tests and comparison scripts in
`parity-testing/`.

The API uses the global `/api` prefix. Once running, useful checks are:

```text
GET http://localhost:3000/api/health
GET http://localhost:3000/api/docs
GET http://localhost:3000/api/docs-json
```

The `/.well-known/stellar.toml` path is intentionally outside the `/api` prefix.

## 5. How to divide the work

Each contributor should own a complete domain module, including its controller, service,
DTOs, guards, tests, and migration-plan updates.

### Recommended first assignment: Auth, OTP, and Accounts

One contributor owns:

```text
apps/backend/src/modules/auth/
apps/backend/src/modules/otp/
apps/backend/src/modules/accounts/
```

Routes:

- `GET/POST /api/auth`
- `POST /api/auth/pin/verify`
- `POST /api/otp/send`
- `POST /api/otp/verify`
- `POST /api/register`
- `GET /api/users/check`
- `GET /api/users/lookup`

Reference files:

```text
apps/_legacy/backend/app/api/auth/
apps/_legacy/backend/app/api/otp/
apps/_legacy/backend/app/api/register/
apps/_legacy/backend/app/api/users/
apps/_legacy/backend/lib/pin.ts
apps/_legacy/backend/lib/otp.ts
apps/_legacy/backend/lib/short-id.ts
apps/_legacy/backend/lib/signup-security.test.ts
```

### Other recommended assignments

| Owner | Module | Main migration-plan phase |
|---|---|---|
| Contributor A | Auth, OTP, Accounts | Phase 2 |
| Contributor B | Wallet, Transactions, Settlements | Phase 3 |
| Contributor C | Engine, Soroban, settlement worker | Phase 4 |
| Contributor D | SMS, TextBee, offline vouchers, queues | Phase 5 |
| Contributor E | Anchor, SEP-1, SEP-24 | Phase 6 |
| Contributor F | Demo tools and Friendbot | Phase 7 |

Do not split one endpoint between two people unless they agree on the service contract
first. A feature is not complete until its tests and parity-table row are complete too.

## 6. Branch and pull-request workflow

Create one focused branch per domain. Use the `codex/` prefix unless the team has an
existing branch convention:

```powershell
git switch <base-branch>
git pull
git switch -c codex/auth-otp-accounts
```

Keep commits focused. Good commit examples:

```text
feat(backend): add OTP send and verify endpoints
test(backend): port signup security tests
docs(backend): mark auth parity rows complete
```

Before opening a pull request:

```powershell
git status
npm run typecheck --workspace=backend
npm test --workspace=backend
npm run build --workspace=backend
```

The pull request should explain:

1. Which migration-plan phase and endpoints it covers.
2. Which legacy files were used as reference.
3. Which tests were added or ported.
4. Any intentional API difference and the corresponding Decision log entry.
5. Any environment variable or dependency change.

Do not include `.env`, generated secrets, production credentials, or unrelated formatting
changes in a pull request.

## 7. API parity rules

For every migrated endpoint, preserve:

- HTTP method and exact path
- request body, query parameters, and headers
- response JSON field names and types
- HTTP status codes
- legacy error response shape
- authentication and rate-limit behavior
- raw-body behavior for signed webhooks

Use the legacy route and its imported libraries to understand behavior. Do not copy the
legacy app into the new app wholesale and do not import from `apps/_legacy/backend`.

If behavior must change, record the reason in the Decision log before merging:

`docs/backend-rebuild/01-nestjs-migration-plan.md`

## 8. Testing expectations

Every migrated domain should include:

- unit tests for services and guards
- ported security/property tests from the legacy `lib` tests
- controller or e2e tests for route status and response shape
- tests for failure cases, not only the happy path

The high-risk legacy tests are especially important:

```text
concurrency-hardening.test.ts
engine-retry-classifier.test.ts
offline-voucher-security.test.ts
ramp-security.test.ts
reconciliation.test.ts
signup-security.test.ts
sms-delivery.test.ts
sms-security.test.ts
stellar-transaction-manager.test.ts
```

When a test needs external services, keep the default test suite deterministic. Use mocks,
fixtures, or disposable test services rather than real production services.

## 9. Shared-file coordination

These files are merge-conflict hotspots:

```text
apps/backend/src/app.module.ts
apps/backend/src/main.ts
apps/backend/package.json
docs/backend-rebuild/01-nestjs-migration-plan.md
```

Each contributor should add their module with the smallest possible change. Coordinate
before editing shared bootstrap code or dependencies. When two branches both need
`app.module.ts`, merge one branch first and then rebase the other branch before resolving
the registration change.

## 10. Definition of done

A domain can be marked complete only when:

- the Nest module is registered and starts successfully
- all planned endpoints are implemented
- API behavior matches the legacy backend
- guards, rate limits, and signature checks are present where required
- tests are added and passing
- typecheck and build pass
- no secrets or generated noise are committed
- the parity table and change log are updated
- the pull request has been reviewed by another contributor

If there is uncertainty about behavior, stop and compare the Nest implementation with
the corresponding legacy route before inventing a new contract.
