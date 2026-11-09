# HoneBill backend review (2026-11-05)

A point-in-time review of `apps/backend` against the principles in `nestjs-principles.md` and `engineering-checklist.md`. **Code changes; re-verify any finding against the current code before acting on it or telling the user it is still true.** Delete entries here as they are fixed.

**Scope and honesty about depth.** Read in full: bootstrap, `AppModule`, env schema, all of `common/` (guards, filter, middleware, exception), all of `infra/`, `auth`, `otp`, `accounts`, `settlements` (service + voucher parser), `engine` (controller, service, processor, queue, retry), `health`, `sms` (controller, webhook processing, signature guard), Prisma schema, Dockerfile, configs. **Not read line by line:** `wallet.util.ts` (396 lines), `anchor.service.ts` (611 lines), `textbee.service.ts`, `reconciliation.util.ts`, the SMS dispatch processor, most spec files. Nothing was executed (no tests, typecheck or live calls were run for this review).

"Verified" = I read the code that shows it. "Suspected" = looks wrong, needs a run or a design decision.

## What is already good

- **Settlement design is sound.** Unique `nonce` as idempotency key; `txHash` + `signedTxXdr` persisted *before* submitting so a crash resumes instead of double-spending; relayer lock with token-checked Lua release in a `finally`; deterministic BullMQ `jobId`; retryable vs `UnrecoverableError` classification; failed jobs retained.
- **Webhook authentication is done right:** raw bytes, 2 KB cap, timestamp drift window, HMAC, signed *before* JSON parsing.
- **Security hygiene in places:** scrypt PIN hashing with transparent rehash; atomic Lua counters for PIN lockout (5 tries -> 423 for 15 min) and OTP attempts; JWT verified with explicit `algorithms` and `issuer`; `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`; PIN stripped from the register response; masked phone numbers in logs; `.env` is git-ignored; no secret-like strings found in the tracked log/output files.
- **Boot-time validation** of env vars (Joi) and a shared `configureApp()` so e2e tests run the same pipeline as production.
- **Optional infrastructure** via dynamic modules (`register(enabled)`) with `@Optional()` fallbacks.
- **Strong test culture:** many unit specs, e2e specs, and parity scripts against the legacy API.

## Findings

### High

**H1. Client-controlled IP used for abuse limits** *(verified)*
`src/modules/otp/otp.controller.ts:15-22` builds the client IP from `X-Forwarded-For` / `X-Real-IP` before `req.ip`; the anchor controller passes those headers straight into the service (`src/modules/anchor/anchor.controller.ts:82-105`). There is no `trust proxy` setting anywhere (`grep` found none).
*Scenario:* an attacker sends a fresh random `X-Forwarded-For` with each `POST /api/otp/send`. The per-IP+phone window (3 per 5 min) never trips, so SMS-bombing a victim is limited only by the per-phone (5/hour) and global (300/hour) caps; the global cap can then be exhausted by one attacker, denying OTP to everyone.
*Fix:* `app.set('trust proxy', <known hop count/subnet>)` in `main.ts`, use `req.ip` only, delete header parsing.

**H2. Production can boot with fake/insecure defaults** *(verified)*
`src/config/env.validation.ts:6-7` defaults `CORS_ORIGIN` to `'*'` and `DATABASE_URL` to `postgresql://localhost:5432/mock`; `src/infra/prisma/prisma.service.ts:6-11` also falls back to the mock URL when `NODE_ENV` is unset. A deployment that forgets `DATABASE_URL` starts "successfully" and fails on the first query.
Secrets the app cannot work without (`SECRET_SEP10_SIGNING_SEED`, `SECRET_SEP10_JWT_SECRET`, `OTP_VERIFICATION_JWT_SECRET`, `RELAYER_SECRET_KEY`, `TEXTBEE_WEBHOOK_SECRET`) are `optional()`/`allow('')` (`env.validation.ts:19-20` etc.), so they fail late (the JWT secret at module init, the signing seed on the first login request).
*Fix:* make them `required()` when `NODE_ENV=production` (`Joi.when`), remove the mock fallback outside tests, require an explicit `CORS_ORIGIN` list in production.

**H3. `phoneNumber` is not unique but is treated as an identity** *(verified)*
`prisma/schema.prisma:49,59` has only `@@index([phoneNumber])`; no migration adds a unique index. `register` does check-then-insert (`accounts.service.ts`), so two concurrent registrations with the same phone both succeed; the `case 'phoneNumber'` branch of `classifyAccountUniqueConstraint` can never fire. `verifyPin` and `checkUser` use `findFirst` (the former `orderBy createdAt desc`), i.e. the code already assumes duplicates can exist.
*Scenario:* duplicate accounts per phone; PIN verification and recipient lookup silently pick one.
*Fix:* decide the rule (unique, or unique among non-null), de-duplicate existing rows, add a unique index migration, then rely on `P2002`.

### Medium

**M1. No graceful shutdown** *(verified)* `enableShutdownHooks` appears nowhere in `src/`. `PrismaService.onModuleDestroy` and `RedisService.onModuleDestroy` never run on SIGTERM; BullMQ workers are killed mid-job. A deploy can drop in-flight requests and leave jobs `active` until stall detection re-queues them. *Fix:* `app.enableShutdownHooks()` in `main.ts` and a sensible termination grace period.

**M2. Rate limiting is per-process, not shared** *(verified)* `ThrottlerModule.forRoot` (`app.module.ts:33`) uses the default in-memory store; the plan says "Redis storage". With N instances the effective limit is N x, and a restart resets it. `WalletModule` also calls `ThrottlerModule.forRoot([{ ttl: 10_000, limit: 10 }])` (`wallet.module.ts:10`), a second root configuration whose purpose is unclear next to per-route `@Throttle`. *Fix:* one `forRootAsync` with a Redis storage adapter, or reuse the existing Redis sliding-window limiter; remove the duplicate.

**M3. Same provider registered in two modules** *(verified)* `OtpRateLimitService` is in `RedisModule` providers/exports (`redis.module.ts:7-8`) *and* in `OtpModule` providers (`otp.module.ts:12`). Nest builds two instances. They are stateless wrappers over Redis today, so no bug yet, but it breaks the "one instance" assumption. Likewise there are **two classes named `StellarTransactionManager`** (`infra/stellar/` and `modules/engine/`), exported by two modules; `SettlementsService` uses the engine one, `StellarModule` exports the infra one. *Fix:* keep one, delete the other, import the module that exports it.

**M4. Offline signing intent has no freshness** *(suspected)* `Ed25519SignatureGuard` signs `deposit:<sender>:<amount>` / `withdraw:...` / `transfer:v2:online:...` with no nonce or timestamp (`ed25519-signature.guard.ts`). A captured `Authorization` value can be replayed for the same sender+amount indefinitely. Impact is bounded because the endpoint returns an *unsigned* XDR the wallet must still sign (and `transfer` writes a PENDING row), but it is still unauthenticated server work and DB writes on demand. *Fix (if parity allows):* add a timestamp/nonce to the signed message with a short validity window, or require the SEP-10 JWT as well.

**M5. Signature verification falls back to a weaker format** *(suspected)* `settlements.util.ts:97-98` accepts a voucher signed over the tuple **without** the contract address if the contract-bound form fails. A signature not bound to a contract could be replayed against another deployment that shares token, gateway and receiver. Likely deliberate backwards compatibility with old clients. *Fix:* add a sunset date/flag and drop the fallback once clients upgrade.

**M6. A legitimate voucher can be silently dropped** *(verified)* `SmsService.allowWebhookSender` allows 3 webhooks per sender per minute and returns `200 {status:'Rate Limited'}` when exceeded (`sms.service.ts`). The gateway sees success, the voucher is never queued or retried. A merchant paying several customers' offline vouchers within a minute loses payments. The limit mirrors legacy behaviour, so changing it is a product decision. *Fix:* queue and throttle processing instead of discarding, or respond 429 so the gateway retries.

**M7. Validation duplicated and logic in controllers** *(verified)* `RegisterAccountDto` validates shape, then `AccountsService.register` re-validates the same fields by hand (`accounts.service.ts`); `AccountsController.register` contains body-emptiness heuristics (`accounts.controller.ts:30-38`); `AuthController` parses bodies (`extractTransaction`). The duplication exists for legacy error-body parity but means two sources of truth. *Fix:* keep one validator, map its failure to the legacy body in the exception filter; move parsing into a pipe.

**M8. Env vars used but not in the schema** *(verified)* `SEP10_HOME_DOMAINS` (`auth.service.ts:30`) is required at runtime but absent from `env.validation.ts`; `health.controller.ts:25-31` and `engine.module.ts:15` read `process.env` directly, bypassing `ConfigService` and validation. Also `DEMO_ENABLED`, `OTP_GLOBAL_LIMIT_PER_HOUR` are read without schema entries (not exhaustively checked). *Fix:* add them to the Joi schema and `.env.example`; inject `ConfigService`.

**M9. Docs and Swagger are mostly empty** *(verified)* No `@ApiProperty`/`@ApiTags` in `src/`, and `nest-cli.json` has no `@nestjs/swagger` plugin, so `/api/docs` lists routes with empty schemas. Swagger is also public in production. *Fix:* enable the CLI plugin; gate the UI by environment.

### Low

**L1. Docker/port mismatch** *(verified)* `Dockerfile:27,29` exposes and health-checks port **3001**, while `main.ts:18` listens on `process.env.PORT || 3000`. If `PORT` isn't set, the container is "unhealthy". The health check also uses `/api/docs-json` (Swagger) instead of the real health route. The runtime image copies all `node_modules` (incl. dev dependencies).

**L2. Broken/duplicate npm script** *(verified)* `package.json` defines `test:e2e:phase2` twice (lines 17 and 28). JSON keeps the last, which points to `./test/jest-e2e.json` and files that no longer exist at those paths (the config now lives in `test/e2e-testing/`). The script as effective is broken.

**L3. Repo hygiene** *(verified)* Tracked in git under `apps/backend/`: `e2e.log`, `e2e-result.txt`, `nest-start.log`, `nest-auth.txt`, `auth-live-check-output.txt`, `parity-*.txt`, and `*.tmp.mjs` scripts (`git ls-files`). No secret-shaped strings were found in them, but they are noise and a leak risk. e2e specs exist in two places (`test/*.e2e-spec.ts` and `test/e2e-testing/`), and `test/unit-testing/` mirrors specs that also live in `src/`.

**L4. Naming** *(verified)* Services live in `*.util.ts` (`WalletService` in `wallet.util.ts`, `SettlementsService` in `settlements.util.ts`, `SettlementReconciliationService` in `reconciliation.util.ts`). `Settlement.qstashMessageId` is a legacy name for an unrelated value (`engine-<nonce>`). Imports mix `.js` and extension-less styles (`health`, `infra` vs the rest).

**L5. Missing hardening middleware** *(verified)* No `helmet` and no compression (neither is in `package.json`); `CORS_ORIGIN` defaults to `*` (see H2).

**L6. Account enumeration surfaces** *(verified)* `verifyPin` returns 404 "Account not found." vs 401 for a wrong PIN, and `/users/check` returns `exists` plus keys for any phone. Throttling limits scraping (60/min), and `/users/check` is by design for contact discovery, but the PIN route can drop the distinction.

**L7. PIN strength is bounded by its length** *(verified design note)* PINs are 4-6 digits (`^\d{4,6}$`). scrypt (`N=16384`) slows brute force but a leaked database is still crackable offline in seconds to minutes. Online guessing is well protected by lockout; offline is not. Legacy plaintext PINs may still exist (`verifyPin` supports them and upgrades on success). *Fix:* add a server-side pepper (HMAC key held outside the DB) and migrate remaining plaintext hashes.

**L8. Hard-coded business constant** *(verified)* The `5_000_000n` protocol toll for `PHPC` is embedded in `settlements.util.ts:89`. Move it to config or the `Token` row so a fee change doesn't need a redeploy.

**L9. Relayer lock scope** *(suspected)* The lock is released after `sendTransaction` but before inclusion (`stellar-transaction-manager.service.ts`). A second job building immediately may reuse the same sequence number, causing `tx_bad_seq`; the retry policy treats that as retryable, so it self-heals, at the cost of wasted attempts under burst load.

**L10. Unused imports and dead guard** *(verified)* `wallet.controller.ts:1,4` import `UseGuards` and `ApiThrottlerGuard` without using them; `ApiThrottlerGuard` itself is unused (the global guard is plain `ThrottlerGuard`, with the filter reshaping the body).

## Suggested order of work

1. **H1** (trust proxy / use `req.ip`), **M1** (shutdown hooks): one-line fixes with real production value.
2. **H2** env hardening (+ **M8** schema gaps) together, since both touch `env.validation.ts` and `.env.example`.
3. **H3** phone uniqueness: needs a data check and a migration; do it before real users accumulate duplicates.
4. **M2/M3** infra consolidation: Redis-backed throttler, single `StellarTransactionManager`, single `OtpRateLimitService`.
5. **L1-L4** cleanup in one housekeeping PR (ports, scripts, tracked logs, test duplicates, file naming).
6. Product/design decisions to take to the team: **M4**, **M5**, **M6**, **L7**.
