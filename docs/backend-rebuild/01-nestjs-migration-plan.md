# Backend Rebuild: Next.js → NestJS

| | |
|---|---|
| Legacy source | `apps/_legacy/backend` (read-only, see `LEGACY.md` there) |
| Legacy baseline | branch `chores`, legacy move commit (see Change log); last commit before the move: `6f88868` |
| New app | `apps/backend` (NestJS, npm workspace name `backend`) |
| Legacy prod | `pijin-api.vercel.app` stays live until Phase 8 cutover |
| Owner | Backend developer |

**Status legend:** ☐ todo · ◐ in progress · ☑ done · ⏸ deferred · ✖ dropped

**How to use this file:** update the checkbox and the parity table row in the same PR that lands the work, and add one line to the [Change log](#change-log). Record any decision that changes this plan in the [Decision log](#decision-log).

---

## Ground rules

1. **Legacy is read-only.** Read `apps/_legacy/backend` for reference, copy logic into Nest, never import across the boundary and never edit it.
2. **API contract parity.** Keep the global prefix `/api`, the same paths, methods, request/response JSON, status codes and error shape. The mobile client in `apps/mobile/src/_legacy/services/api/*` must work against Nest without changes. Any intentional break goes in the Decision log first.
3. **Same database.** Copy `prisma/schema.prisma` and `prisma/migrations/` as-is. No schema changes during the migration; new migrations only after cutover.
4. **Port tests with the code.** A module is not ☑ until its legacy tests are ported and passing.
5. **Secrets stay out of git.** Same env var names as legacy unless the Decision log says otherwise.

> Note on the choice of NestJS: React Native talks plain HTTP/JSON, so it works with any backend. NestJS is chosen for its structure (modules, dependency injection, guards, pipes, first-class queues and Swagger) as a long-running server.

---

## Target architecture

| Concern | Legacy (Next.js) | NestJS |
|---|---|---|
| Runtime / host | Vercel serverless | Long-running Node 22 server in Docker (Railway / Render / Fly / VPS) |
| HTTP | App Router `route.ts` handlers | `@nestjs/core` 11 + Express controllers |
| Config | `process.env` reads scattered in routes/lib | `@nestjs/config` with schema validation (zod or Joi) at boot; vars from `apps/_legacy/backend/.env.example` |
| DB | `lib/prisma.ts` (Prisma 7 + `@prisma/adapter-pg`) | `PrismaModule` / `PrismaService` reusing the same adapter setup |
| CORS | `middleware.ts` (`CORS_ORIGIN`, allowed headers incl. `X-Signature`, `X-Textbee-Signature`) | `app.enableCors()` with the same origin, methods and headers |
| Webhook signatures | read raw body in route | `NestFactory.create(AppModule, { rawBody: true })` + signature guards |
| Rate limiting | `lib/rate-limit.ts` (`@upstash/ratelimit`) | `@nestjs/throttler` with Redis storage; named limits matching legacy keys/windows |
| Queues / background jobs | QStash callbacks (`lib/sms-queue.ts`, `lib/qstash-security.ts`, settlement) | `@nestjs/bullmq` queues + processors on Redis |
| Locks | `lib/redis-lock.ts` (Upstash REST) | ioredis-based lock service (same TTL/semantics) |
| Redis client | `@upstash/redis` REST | ioredis (TCP) |
| Stellar / Soroban | `@stellar/stellar-sdk`, `lib/pijin-contract.ts` → `packages/pijin_core` | Same SDK + `pijin_core`, wrapped in a `StellarModule` |
| API docs | `next-swagger-doc` + `/api/swagger` + `/api-docs` page | `@nestjs/swagger` at `/api/docs` (JSON at `/api/docs-json`) |
| Health | `/api/health` | `@nestjs/terminus` at `/api/health` (DB + Redis + RPC checks) |
| Tests | `node:test` + `fast-check` via `tsx --test` | Jest (Nest default) + `fast-check`; supertest e2e |

### Folder layout

```
apps/backend/
  prisma/                  # copied schema + migrations
  src/
    main.ts                # bootstrap: prefix, CORS, rawBody, Swagger, validation pipe
    app.module.ts
    config/                # env schema + typed config
    common/                # exception filter (legacy error shape), guards, pipes, decorators
    infra/                 # prisma, redis, queue, lock, stellar
    modules/
      <domain>/
        <domain>.module.ts
        <domain>.controller.ts
        <domain>.service.ts
        dto/
        guards/            # only if domain-specific
  test/                    # e2e (supertest)
  Dockerfile
```

---

## Module map and parity table

One row per endpoint. Update **Status** as work lands. "Guard" names are the Nest guards to build; the legacy mechanism is in brackets.

### Auth, OTP, accounts

| Method | Path | Legacy file | Nest module | Guard / limits | Status | Notes |
|---|---|---|---|---|---|---|
| GET, POST | `/api/auth` | `app/api/auth/route.ts` | `AuthModule` | rate limit | ☐ | SEP-10 challenge (GET) and token (POST). Issues the JWT used by `Sep10JwtGuard`. |
| POST | `/api/auth/pin/verify` | `app/api/auth/pin/verify/route.ts`, `lib/pin.ts` | `AuthModule` | rate limit (IP + per-phone failure lock) | ☐ | Keep Redis keys/limits from legacy. |
| POST | `/api/otp/send` | `app/api/otp/send/route.ts`, `lib/otp.ts` | `OtpModule` | rate limit | ☐ | `OTP_TEST_MODE` / test numbers. |
| POST | `/api/otp/verify` | `app/api/otp/verify/route.ts`, `lib/otp.ts` | `OtpModule` | rate limit | ☐ | Issues OTP verification JWT. |
| POST | `/api/register` | `app/api/register/route.ts`, `lib/short-id.ts` | `AccountsModule` | rate limit, OTP token (`REQUIRE_OTP_TOKEN`) | ☐ | |
| GET | `/api/users/check` | `app/api/users/check/route.ts` | `AccountsModule` | rate limit | ☐ | |
| GET | `/api/users/lookup` | `app/api/users/lookup/route.ts` | `AccountsModule` | rate limit | ☐ | |

### Wallet, transactions, settlements

| Method | Path | Legacy file | Nest module | Guard / limits | Status | Notes |
|---|---|---|---|---|---|---|
| GET | `/api/wallet/balance` | `app/api/wallet/balance/route.ts` | `WalletModule` | rate limit | ☑ | Horizon PHPC/USDC trustline check with zero-balance fallback |
| GET | `/api/wallet/history` | `app/api/wallet/history/route.ts` | `WalletModule` | IP-based | ☑ | Reconciles settlements, anchors, and online transfers |
| POST | `/api/wallet/transfers/confirm` | `app/api/wallet/transfers/confirm/route.ts` | `WalletModule` | public | ☑ | Soroban RPC verified confirmation with 409/422 status |
| GET | `/api/vault-balance` | `app/api/vault-balance/route.ts` | `WalletModule` | rate limit | ☑ | Soroban contract `get_vault` + Horizon online balance |
| GET | `/api/transactions` | `app/api/transactions/route.ts` | `WalletModule` | IP-based | ☑ | Settled offline settlements with token metadata |
| POST | `/api/settlements` | `app/api/settlements/route.ts`, `lib/settlement.ts` | `SettlementsModule` | signed voucher | ☑ | Offline voucher Ed25519 verification + relayer execution |

### Engine (Soroban contract)

| Method | Path | Legacy file | Nest module | Guard / limits | Status | Notes |
|---|---|---|---|---|---|---|
| POST | `/api/engine/deposit` | `app/api/engine/deposit/route.ts` | `EngineModule` | `Ed25519SignatureGuard` [signed `Authorization: Bearer`] | ☐ | Builds/simulates/submits `deposit` server-side. |
| POST, PATCH | `/api/engine/offline-key` | `app/api/engine/offline-key/route.ts` | `EngineModule` | `Sep10JwtGuard` | ☐ | |
| POST | `/api/engine/recipient-registry` | `app/api/engine/recipient-registry/route.ts` | `EngineModule` | `Sep10JwtGuard` | ☐ | |
| POST | `/api/engine/transfer` | `app/api/engine/transfer/route.ts` | `EngineModule` | `Ed25519SignatureGuard` | ☐ | |
| POST | `/api/engine/withdraw` | `app/api/engine/withdraw/route.ts` | `EngineModule` | `Ed25519SignatureGuard` | ☐ | |
| POST | `/api/engine/settle` | `app/api/engine/settle/route.ts`, `lib/settlement.ts` | `EngineModule` | QStash + TextBee signature → BullMQ processor | ☐ | Becomes a queue processor; keep an HTTP entry only if something external still calls it. |

Shared engine libs to port into `infra/stellar` or `EngineModule` services: `lib/pijin-contract.ts`, `lib/stellar-transaction-manager.ts`, `lib/stellar-reconciliation.ts`, `lib/redis-lock.ts`, `lib/crypto.ts`.

### SMS and offline vouchers

| Method | Path | Legacy file | Nest module | Guard / limits | Status | Notes |
|---|---|---|---|---|---|---|
| POST | `/api/sms/dispatch` | `app/api/sms/dispatch/route.ts`, `lib/sms-queue.ts` | `SmsModule` | QStash + TextBee signature → BullMQ processor | ☐ | |
| GET, POST | `/api/sms/webhook` | `app/api/sms/webhook/route.ts` | `SmsModule` | `TextbeeSignatureGuard` (raw body), rate limit | ☐ | Inbound SMS from TextBee. |

Shared libs: `lib/sms.ts`, `lib/sms-security.ts`, `lib/sms-health.ts`, `lib/textbee.ts` (primary + fallback device), `lib/offline-voucher.ts`, `lib/offline-transaction-debug.ts`.

### Anchor (SEP-1, SEP-24)

| Method | Path | Legacy file | Nest module | Guard / limits | Status | Notes |
|---|---|---|---|---|---|---|
| GET | `/.well-known/stellar.toml` | `app/.well-known/stellar.toml/route.ts` | `AnchorModule` | none | ☐ | Must be excluded from the `/api` prefix. `text/plain`, CORS `*`. |
| GET | `/api/sep24/info` | `app/api/sep24/info/route.ts` | `AnchorModule` | none | ☐ | |
| GET | `/api/sep24/transaction` | `app/api/sep24/transaction/route.ts` | `AnchorModule` | `Sep10JwtGuard` | ☐ | |
| POST | `/api/sep24/transactions/deposit/interactive` | `app/api/sep24/transactions/deposit/interactive/route.ts` | `AnchorModule` | `Sep10JwtGuard` | ☐ | Returns interactive URL → needs the deferred web pages. |
| POST | `/api/sep24/transactions/withdraw/interactive` | `app/api/sep24/transactions/withdraw/interactive/route.ts` | `AnchorModule` | `Sep10JwtGuard` | ☐ | Same as above. |
| POST | `/api/anchor/submit-withdraw` | `app/api/anchor/submit-withdraw/route.ts` | `AnchorModule` | interactive-URL JWT | ☐ | |
| POST | `/api/anchor/confirm-withdraw` | `app/api/anchor/confirm-withdraw/route.ts` | `AnchorModule` | `Sep10JwtGuard` + interactive JWT | ☐ | |
| POST | `/api/anchor/simulate-payment` | `app/api/anchor/simulate-payment/route.ts` | `AnchorModule` | rate limit; testnet only | ☐ | Uses distributor secrets. Disable in production. |

Shared lib: `lib/ramp-config.ts`.

### Demo, testnet tools, platform

| Method | Path | Legacy file | Nest module | Guard / limits | Status | Notes |
|---|---|---|---|---|---|---|
| POST, DELETE | `/api/demo/session` | `app/api/demo/session/route.ts`, `lib/demo/*` | `DemoModule` | `DEMO_ENABLED` + access code | ☐ | Load the module only when `DEMO_ENABLED=true`. |
| GET | `/api/demo/settlement` | `app/api/demo/settlement/route.ts` | `DemoModule` | same | ☐ | |
| POST | `/api/friendbot` | `app/api/friendbot/route.ts` | `FriendbotModule` | rate limit; testnet only | ☐ | |
| GET | `/api/health` | `app/api/health/route.ts`, `lib/sms-health.ts` | `HealthModule` | rate limit | ☐ | Keep legacy response fields; add Terminus checks. |
| GET | `/api/swagger` | `app/api/swagger/route.ts` | Swagger (bootstrap) | none | ☐ | Replaced by `/api/docs-json`. Keep `/api/swagger` as an alias if anything uses it. |

### Known gaps (mobile calls these, legacy backend has no route)

| Path | Called from | Decision |
|---|---|---|
| `/api/merchants/default-short-id` | `apps/mobile/src/_legacy/services/api/merchants.ts` | ☐ implement or drop |
| `/api/sms/simulate` | `apps/mobile/src/_legacy/services/api/settlement.ts` | ☐ implement (dev-only) or drop |

---

## Phases

### Phase 0: Legacy freeze ☑
- [x] Move `apps/backend` → `apps/_legacy/backend`; add `LEGACY.md`
- [x] Remove the legacy app from npm workspaces; resync `package-lock.json`
- [x] Root `typecheck` runs `--workspaces --if-present`; `build:sdk` no longer targets `backend`
- [x] `backend-ci.yml` rewritten for Nest and skipped until `apps/backend/package.json` exists
- [x] `CLAUDE.md` read-only rule covers `apps/_legacy/backend`; README updated

### Phase 1: Scaffold and infrastructure
- [x] `nest new` into `apps/backend` (package name `backend`, strict TS); add `"apps/backend"` to root `package.json` `workspaces` and resync the lockfile
- [x] Scripts the CI expects: `build`, `test`, plus `typecheck` (`tsc --noEmit`) for the root pre-commit hook
- [x] Copy `prisma/schema.prisma`, `prisma/migrations/`, `prisma.config.ts`; `PrismaModule`
- [x] `@nestjs/config` + env schema (fail fast on missing required vars)
- [x] Global prefix `api` (exclude `/.well-known/*`), CORS, `rawBody: true`, global `ValidationPipe`
- [x] Global exception filter producing the legacy error JSON shape (check legacy routes: `{ error: string }` with status)
- [x] Redis (ioredis), BullMQ, lock service, throttler with Redis storage
- [x] `StellarModule` (SDK, Horizon/RPC clients, `pijin_core` contract client)
- [x] Swagger at `/api/docs`; Terminus health at `/api/health`
- [x] Dockerfile + `.env.example`; CI green

Setup checkpoint complete: the Nest app scaffold, workspace wiring, Prisma/Redis/queue/Stellar infra, health/docs bootstrap, and readiness checks all pass. We are ready to move into feature migration work in Phase 2.

### Phase 2: Auth, OTP, accounts
- [x] `Sep10JwtGuard`, SEP-10 challenge/token
- [x] PIN verify with lockout
- [x] OTP send/verify (TextBee via `SmsModule` client)
- [x] Register, users check/lookup
- [x] Port `signup-security.test.ts`

### Phase 3: Wallet, transactions, settlements ☑
- [x] Balance, history, vault balance, transactions
- [x] Resolve the **review** items (transfers/confirm, settlements auth)
- [x] Port `reconciliation.test.ts`

Phase 3 migration completed (2026-10-29): all 6 endpoints implemented in `WalletModule` and `SettlementsModule` with full legacy parity (balance from Horizon trustlines with 404 fallback to zero, aggregated history across settlements/anchors/transfers with BigInt precision, vault balance querying Soroban and Horizon, transactions list with metadata, Soroban RPC-verified transfer confirmation, and offline voucher signature verification). Tests passing: `reconciliation.test.ts`, `reconciliation.service.spec.ts`, `wallet.service.spec.ts`, `settlements.service.spec.ts`, and `phase3-wallet-smoke.spec.ts` (19/19 Phase 3 tests passing, 155/155 backend unit tests passing).

### Phase 4: Engine / Soroban (highest risk)
- [ ] Port tests first: `concurrency-hardening.test.ts`, `engine-retry-classifier.test.ts`, `stellar-transaction-manager.test.ts`
- [ ] `Ed25519SignatureGuard`
- [ ] deposit, transfer, withdraw, offline-key, recipient-registry
- [ ] settle as a BullMQ processor

### Phase 5: SMS and queues
- [ ] TextBee client with fallback device; `TextbeeSignatureGuard`
- [ ] SMS dispatch queue (replaces QStash), inbound webhook
- [ ] Offline voucher verification
- [ ] Port `sms-security.test.ts`, `sms-delivery.test.ts`, `offline-voucher-security.test.ts`

### Phase 6: Anchor (SEP-1 / SEP-24)
- [ ] `stellar.toml`, `sep24/info`, `sep24/transaction`
- [ ] Interactive deposit/withdraw + interactive-URL JWT
- [ ] submit/confirm withdraw, simulate-payment (testnet only)
- [ ] Port `ramp-security.test.ts`
- [ ] Blocked on the deferred web pages for the interactive flow

### Phase 7: Demo, friendbot, scripts
- [ ] `DemoModule` behind `DEMO_ENABLED`; port `lib/demo/*.test.ts` (9 files)
- [ ] Friendbot (testnet only)
- [ ] Port useful `scripts/*` (`provision-demo-pool`, `verify-demo-pool`, `fund-wallet`, `register-device-key`, `simulate-sep24-deposit`, `test-sms-webhook`, `verify-webhook`, `e2e-live-test`) as Nest standalone-app scripts or `tsx` scripts

### Phase 8: Deploy and cutover
- [ ] Choose host; provision Postgres access, Redis, secrets
- [ ] Deploy to a staging URL; run the contract check (see Testing) against staging
- [ ] Update `SEP10_HOME_DOMAINS`, `stellar.toml` URLs, TextBee webhook URL
- [ ] Point mobile at the new API (`EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_ANCHOR_DOMAIN`, `apps/mobile/eas.json`)
- [ ] Rollback plan: point mobile back to `pijin-api.vercel.app`; keep Vercel deploy alive until stable
- [ ] Decommission Vercel and Upstash QStash after a stable period

### Deferred ⏸: web pages
Legacy pages in `apps/_legacy/backend/app`: SEP-24 `deposit/`, `withdraw/` (**required** before Phase 6 can ship), `privacy-policy/`, `delete-account/` (likely required by app stores), `api-docs/`, `demo/*`, `demo-split/`, landing `page.tsx`. Decide: serve from Nest (server-rendered views) or a separate small web app.

---

## Testing strategy

- **Unit:** port the 16 legacy test files (`lib/*.test.ts`, `lib/demo/*.test.ts`) from `node:test` to Jest, keeping `fast-check` property tests.
- **E2E:** per module with supertest against a disposable Postgres (Docker) and Redis.
- **Contract check:** for each endpoint, send the same request to legacy (Vercel/staging) and Nest, diff status + JSON. Do this before marking a row ☑.
- **CI:** `.github/workflows/backend-ci.yml` runs prisma generate, `tsc --noEmit`, `npm test`, `npm run build`.

---

## Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-10-23 | Rebuild the backend in NestJS; keep Next.js app as read-only reference in `apps/_legacy/backend` | Clearer structure for a growing API; legacy keeps the reference without being maintained |
| 2026-10-23 | Host as a long-running server (Docker), not Vercel serverless | Enables BullMQ workers, ioredis, in-process schedules; replaces QStash |
| 2026-10-23 | Web pages deferred | Decide Nest views vs separate web app later; SEP-24 pages block Phase 6 |
| 2026-10-27 | Preserve legacy SEP-10 memo behavior: ignore the GET memo parameter, but retain a memo claim when one is present in a valid POST challenge | Legacy passes the GET memo in a position the Stellar SDK ignores, while POST extracts and conditionally emits the challenge memo |
| 2026-10-27 | Keep SEP-10 issuer validation and require a non-empty string `sub` claim | The issuer matches the first `SEP10_HOME_DOMAINS` entry in legacy; production configuration must remain aligned for held-token compatibility. Legacy protected routes require `sub`. |
| 2026-10-27 | Preserve route-specific two-field legacy error bodies for `/api/auth` with an explicit exception marker | Legacy error bodies vary by route; a global message-field response would break parity elsewhere |
| 2026-10-27 | Keep 401 message text route-specific; require status and response-body parity rather than a global error normalizer | Legacy protected routes use different messages and body shapes; the mobile client reads the `error` field |
| 2026-10-29 | Preserve public transfer confirmation and settlement routes during Phase 3; confirm only advances a stored transfer after Soroban RPC success, while settlement requires a valid sender Ed25519 voucher and configured relayer | The legacy routes have no SEP-10 guard. Confirmation changes transaction metadata only, and settlement authorization is carried by the signed offline voucher; adding session authentication would break parity without adding transaction authorization |

## Change log

| Date | PR / commit | Phase | Change |
|---|---|---|---|
| 2026-10-23 | `chores` branch | 0 | Legacy freeze: moved Next.js backend to `apps/_legacy/backend`, CI/workspace updates, this plan |
| 2026-10-25 | setup-first migration pass | 1 | Completed Nest scaffold, workspace wiring, Prisma baseline, env validation, runtime bootstrap, Redis/BullMQ/lock/Stellar infra, Swagger/health/Docker, and readiness checks before feature migration |
| 2026-10-27 | local Phase 2 parity follow-up | 2 (in progress) | Ported signup security coverage; preserved `/api/auth` legacy error bodies, memo behavior and subject-claim validation with focused tests. Full endpoint parity remains pending. |
| 2026-10-29 | Phase 3 completion | 3 | Completed Phase 3 wallet, transactions, and settlement migration; all 19 Phase 3 tests pass, full suite (155/155 tests) and build/typecheck pass clean. |
