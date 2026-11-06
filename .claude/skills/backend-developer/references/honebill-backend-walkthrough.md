# HoneBill backend: step-by-step walkthrough

Written from the code at `apps/backend` on **2026-11-05** (branch `features/frontend`). File paths are relative to `apps/backend/`. Names drift, so spot-check before quoting.

**Depth legend.** Sections marked *(read in full)* were read line by line. Sections marked *(skimmed)* were understood from controllers, module wiring and the migration plan, but their service internals were not reviewed line by line.

## Contents
1. [What the backend is for](#1-what-the-backend-is-for)
2. [Folder map](#2-folder-map)
3. [Boot sequence](#3-boot-sequence-step-by-step-read-in-full)
4. [Life of a request](#4-life-of-a-request-read-in-full)
5. [Module graph](#5-module-graph)
6. [Infra layer](#6-infra-layer-read-in-full)
7. [Feature walkthroughs](#7-feature-walkthroughs)
8. [Data model](#8-data-model-read-in-full)
9. [Async flows](#9-async-flows-queues-and-workers)
10. [Configuration](#10-configuration)
11. [Testing layout](#11-testing-layout)
12. [Build and deploy](#12-build-and-deploy)
13. [How to add an endpoint here](#13-how-to-add-an-endpoint-here)
14. [Glossary](#14-glossary)

---

## 1. What the backend is for

HoneBill is a mobile payments app for people with unreliable connectivity. Value moves as a token (PHPC, plus USDC for ramps) on the **Stellar / Soroban** blockchain. The backend is the trusted server in the middle. It:

- **Registers and identifies users** (phone number + PIN, a 6-character `shortId`, Stellar public key, optional offline device key). OTPs are delivered by an SMS gateway (TextBee).
- **Authenticates wallets** using **SEP-10** (Stellar's challenge/response login) and issues JWTs.
- **Prepares on-chain transactions** (deposit, withdraw, online transfer) as unsigned XDR for the user's wallet to sign (`EngineModule`).
- **Settles offline payments.** A phone with no internet signs a *voucher* (`tokenId:sender:receiver:amount:nonce:signature`) and sends it by SMS. The gateway forwards it to the webhook; the backend verifies the Ed25519 signature, and a **relayer** account submits `spend_offline` to the Soroban contract and records the result (`SettlementsModule`).
- **Acts as a SEP-1/SEP-24 anchor** for fiat on/off ramps (`AnchorModule`).
- Exposes **wallet reads** (balances, history) and a **health** endpoint.

It is a ground-up NestJS rebuild of an older Next.js backend (`apps/_legacy/backend`, read-only). The rebuild's rule is **API contract parity**: same paths, status codes and JSON bodies, so the existing mobile client keeps working. This explains many unusual choices below (custom body parsers, bespoke error bodies, empty 405 responses). Plan: `docs/backend-rebuild/01-nestjs-migration-plan.md`.

## 2. Folder map

```
apps/backend/
  prisma/                 schema.prisma + migrations (Postgres)
  prisma.config.ts        Prisma 7 CLI config (direct URL for migrations)
  src/
    main.ts               process entry
    bootstrap.ts          configureApp(): prefix, CORS, ValidationPipe, Swagger (shared with e2e tests)
    app.module.ts         root module
    config/               env.validation.ts (Joi schema)
    common/               cross-cutting: guards, filters, middleware, exceptions, utils
    infra/                wrappers around external systems: prisma, redis, queue, lock, stellar
    modules/              features: accounts, auth, otp, wallet, settlements, engine, sms, anchor, health
    scripts/              smoke/live-check helpers
  test/                   e2e + parity tests (see section 11)
  Dockerfile
```

## 3. Boot sequence (step by step) *(read in full)*

`src/main.ts`:

1. `NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false })`. Nest's built-in body parser is **turned off** so the app controls parsing order itself. While `create` runs, Nest builds the dependency graph from `AppModule` (section 5), validates env vars (Joi), constructs singletons, and runs `onModuleInit` hooks.
2. `configureSmsWebhookMiddleware(app)` (`src/common/middleware/sms-webhook.middleware.ts`): for `/api/sms/webhook` only, assigns a `traceId` to POSTs, reads the body as **raw bytes capped at 2 KB** (`express.raw`), stores it as `req.rawBody`, and has a 4-argument error middleware turning "too large" into `413 { error, traceId }`.
   *Why first:* the webhook HMAC is computed over the exact bytes TextBee sent. Once a JSON parser has consumed the stream, you can't recover those bytes.
3. `configureRequestBodyParsing(app)` (`src/common/middleware/request-body.middleware.ts`): path-specific parsers, then general ones:
   - `POST /api/auth` -> `express.text` (the service parses it; legacy behaviour).
   - `/api/auth/pin/verify`, `/api/otp`, anchor submit/confirm/simulate -> `express.text` then `parseJsonOrNull` so malformed JSON becomes `null` and the **service** returns its own "missing field" error.
   - SEP-24 interactive routes -> text for JSON, left alone for form/multipart.
   - A small middleware replying **405** to wrong methods on `/api/otp/send|verify`.
   - `/api/sms/dispatch` -> text, with raw bytes captured, *before* JSON parsing (authenticate, then parse).
   - Finally `express.json({ strict:false, verify: captureRawBody })` and `express.urlencoded`.
   *Why so fussy:* each reproduces how the old Next.js routes behaved on bad input.
4. `configureApp(app)` (`src/bootstrap.ts`):
   - `setGlobalPrefix('api')`, excluding `/.well-known/*` (SEP-1 requires `/.well-known/stellar.toml` at the domain root).
   - An explicit `OPTIONS /.well-known/stellar.toml` handler (wide-open CORS preflight for wallets).
   - `enableCors({ origin: CORS_ORIGIN || '*', methods, allowedHeaders incl. X-Signature/X-Textbee-* })`.
   - Global `ValidationPipe({ whitelist, transform, forbidNonWhitelisted })`.
   - Swagger: UI at `/api/docs`, JSON at `/api/docs-json` and `/api/swagger`.
5. `app.listen(process.env.PORT || 3000)`.

Not present: `enableShutdownHooks()`, `helmet`, `trust proxy`, compression.

## 4. Life of a request *(read in full)*

Example: `POST /api/otp/send { "phoneNumber": "+639171234567" }`.

1. **TCP -> Express.** Middleware from section 3 runs in registration order. `/api/otp` matches `express.text`, then `parseJsonOrNull` turns the string into an object (or `null`).
2. **Routing.** Nest strips the `api` prefix and matches `OtpController @Post('send')`.
3. **Global guard:** `ThrottlerGuard` (registered with `APP_GUARD` in `app.module.ts`) counts requests per client; default **120 per 60 s** (`ThrottlerModule.forRoot`). Storage is **in-memory**. Over the limit -> `ThrottlerException`.
4. **Route guards.** `/otp/send` has none. (`/otp/verify` has `PinVerifyRateLimitGuard`, a Redis sliding-window limiter at 30/min/IP.)
5. **Pipe:** `ValidationPipe` instantiates `SendOtpDto`, validates, strips unknown fields (400 on extras).
6. **Controller** (`otp.controller.ts`) works out a client IP from `X-Forwarded-For` / `X-Real-IP` / `req.ip` and calls `OtpService.send`.
7. **Service** (`otp.service.ts`):
   a. validates phone plausibility, normalizes it;
   b. `OtpRateLimitService.enforceSendLimits`: three Redis sliding windows (ip+phone 3 per 5 min, phone 5 per hour, global per hour);
   c. generates a code (or a fixed test code when `OTP_TEST_MODE` + number is whitelisted);
   d. stores it in Redis with a TTL (`honebill:otp:<phone>`), clears the attempts counter;
   e. sends SMS through `TextbeeService` (timeouts, retry, fallback device); on SMS failure **deletes the stored OTP** and returns `502 { error, code:'SMS_FAILED' }`.
8. **Response** `200 { success:true, message }`.
9. **On any thrown error**, the global **`ApiExceptionFilter`** (`APP_FILTER`) maps it to the legacy JSON shape: `{ error: string, attemptsRemaining?, retryAfter?, code? }`; adds `Retry-After`; throttler -> 429 body; unknown errors -> logged with stack, client gets `500 { error:'Internal Server Error' }`.

`POST /api/otp/verify` then compares the submitted code against Redis. Wrong guesses atomically increment a counter via a Lua script; after `OTP_MAX_ATTEMPTS` the code is deleted. Success deletes the code and returns a signed **verification token** (JWT-like) proving phone ownership for `/register`.

## 5. Module graph

```
AppModule
 |- ConfigModule (global, Joi validation, env files)
 |- CommonModule (global) -> Ed25519SignatureGuard
 |- ThrottlerModule.forRoot (120/min default)
 |- PrismaModule (global)   -> PrismaService (PrismaClient + pg adapter)
 |- RedisModule (global)    -> RedisService, OtpRateLimitService
 |- QueueModule  (only if QUEUE_ENABLED=true) -> BullMQ connection
 |- LockModule (global)     -> LockService
 |- StellarModule (global)  -> StellarService, StellarTransactionManager (infra copy)
 |- AuthModule      -> AuthService, AuthController, JwtModule (HS256)
 |- OtpModule       -> OtpService, TextbeeService, OtpController
 |- AccountsModule  -> AccountsService, AccountsController
 |- WalletModule    -> WalletService (in wallet.util.ts), WalletController
 |- SettlementsModule -> SettlementsService (settlements.util.ts), reconciliation, controller
 |- EngineModule    -> EngineService, SettlementQueueModule, SmsModule, SettlementProcessor (flagged)
 |- AnchorModule    -> AnchorService, AnchorController
 '- HealthModule    -> Terminus indicators + HealthController
 APP_GUARD  = ThrottlerGuard
 APP_FILTER = ApiExceptionFilter
```

`EngineModule` and `SmsModule` use **dynamic modules** (`register(enabled)`) so BullMQ queues and workers exist only when `QUEUE_ENABLED=true`; providers that need a queue use `@Optional() @InjectQueue(...)` and fall back to direct delivery.

## 6. Infra layer *(read in full)*

| Piece | File | What it does |
|---|---|---|
| `PrismaService` | `infra/prisma/prisma.service.ts` | `PrismaClient` with `@prisma/adapter-pg`; `DATABASE_URL` from env (falls back to a mock URL in test/unset env); disconnects in `onModuleDestroy`. |
| `RedisService` | `infra/redis/redis.service.ts` | Lazily creates one `ioredis` client (`lazyConnect`, 1 retry, 2 s connect/command timeouts) from `REDIS_URL` or host/port/db; `quit()` on destroy. |
| `OtpRateLimitService` | `infra/redis/otp-rate-limit.service.ts` | Sliding-window limiter in a **Lua script** on a sorted set; throws `RateLimitedException` (429 + `Retry-After`). |
| `LockService` | `infra/lock/lock.service.ts` | `SET key token NX PX ttl` to acquire; **compare-and-delete Lua** to release (only the holder can unlock). |
| `QueueModule` | `infra/queue/queue.module.ts` | `BullModule.forRootAsync` using Redis settings, `maxRetriesPerRequest: null` (BullMQ requirement). |
| `StellarService` | `infra/stellar/stellar.service.ts` | Horizon + Soroban RPC clients, network passphrase, lazy `pijin_core` contract client. |
| `StellarTransactionManager` | `infra/stellar/...` and a **second copy** in `modules/engine/...` | Builds, signs, submits and polls the relayer's `spend_offline` transaction under a Redis lock. Both copies exist; `SettlementsService` uses the engine copy. |

## 7. Feature walkthroughs

### 7.1 Registration and PIN (`modules/accounts`, `modules/auth` pin route) *(read in full)*

1. Client verifies phone via OTP and receives a `verificationToken`.
2. `POST /api/register` (throttled 30 per 10 min). `RegisterAccountDto` trims/validates; controller rejects empty bodies with `400 {error:'Invalid JSON body'}` (legacy behaviour).
3. `AccountsService.register`: validates Stellar keys, phone, PIN format and names; checks the OTP `verificationToken` against the phone when present (required if `REQUIRE_OTP_TOKEN`); looks up existing key/phone (409 if found); hashes the PIN with **scrypt**; inserts the `Account` with a random 6-char Base62 `shortId`, retrying up to 5 times on a short-ID collision. Returns the row **without** `pin`.
4. `POST /api/auth/pin/verify` (throttled 30/min): 5 wrong PINs per phone -> **423 Locked** for 15 minutes (counter in Redis, atomic via Lua). Successful verify clears the counter and transparently re-hashes a legacy plaintext/old-parameter PIN.
5. `GET /api/users/check?phone=` and `GET /api/users/lookup?shortId=|phone=` let the app find a recipient's Stellar key and offline key.

### 7.2 SEP-10 login (`modules/auth`) *(read in full)*

1. `GET /api/auth?account=G...` -> `WebAuth.buildChallengeTx` signed by the server key (`SECRET_SEP10_SIGNING_SEED`), valid `SEP10_AUTH_TIMEOUT` seconds.
2. The wallet signs the challenge. `POST /api/auth { transaction }` (accepts JSON, form or multipart).
3. `AuthService.issueToken`: `readChallengeTx` (checks server signature, home domain, time bounds) -> load the account's signers from **Horizon** -> `verifyChallengeTxThreshold` (client signatures meet the weight threshold) -> sign a JWT (`sub` = Stellar account, `iss` = home domain, HS256, `SEP10_JWT_TIMEOUT`).
4. `Sep10JwtGuard` (`common/guards/sep10-jwt.guard.ts`) protects routes: reads `Authorization: Bearer`, verifies with explicit algorithm and issuer, stashes the payload on `request.user`.

### 7.3 Engine: prepare on-chain transactions (`modules/engine`) *(read in full)*

- `POST /engine/deposit|withdraw|transfer` are guarded by **`Ed25519SignatureGuard`**: the request's `Authorization: Bearer <base64 signature>` must be the sender's Ed25519 signature over an intent string like `deposit:<sender>:<amount>` (`@SignedIntent(builder)` supplies the string). This proves the caller owns the key without a login.
- Service flow (`EngineService`): validate amount (positive i128) and token (`Token` table, active) -> ask the Soroban contract client (or build a `transfer` invocation) -> simulate -> inject source-account auth and rebuild the envelope for the sender's account -> return **unsigned XDR**. The wallet signs and submits. For `transfer`, an `OnlineTransfer` row is upserted `PENDING` keyed by tx hash.
- `POST|PATCH /engine/offline-key` (JWT guard): rotate the device key. POST returns `synced` (already on-chain) or `rotation_required` + XDR; PATCH confirms on-chain, then stores the key in `account.offlineDeviceKey`.
- `POST /engine/recipient-registry` (JWT guard): registrar keypair registers the user's `shortId -> Stellar address` in the contract, returns offline config (contract id, gateway key, token, passphrase).

### 7.4 Offline settlement (`modules/settlements`, `engine`, `sms`) *(settlement service read in full; SMS ingress skimmed)*

1. Phone creates a voucher and SMS-es it to the TextBee device. TextBee `POST /api/sms/webhook` with an HMAC signature.
2. **`TextbeeSignatureGuard`**: needs raw bytes, size <= 2 KB, timestamp within drift, and valid HMAC (using `TEXTBEE_WEBHOOK_SECRET`) -> else 400/413/401 with `traceId`.
3. `SmsService.processWebhook` (`modules/sms/sms.service.ts`) in order: parse JSON; ignore delivery receipts and non-"received" events (200); extract sender+message; cap message length; **rate-limit per sender (3 per rolling minute, Redis sorted set; over the limit it returns `200 {status:'Rate Limited'}`, so that voucher is dropped, not retried)**; structurally parse the voucher (`offline-voucher.util.ts`: six parts, Base62 amount, 32-byte nonce, 64-byte signature; the *signature* is only checked later, in the worker); check a short-lived Redis **nonce cache** for replays (fail-open if Redis is down, the DB `nonce` unique key stays authoritative); enqueue (`SettlementQueueService.enqueue`, `jobId = sha256(nonce)` so the same voucher can't be queued twice; 5 attempts, exponential backoff); only after a successful enqueue, mark the nonce in Redis (`SET NX EX`). Returns `200 {status:'Buffered'}`.
4. `SettlementProcessor` (BullMQ worker) calls `SettlementsService.processSettlement(smsBody)`:
   a. parse voucher; if a settlement with this `nonce` already exists and isn't `PENDING` -> 409;
   b. load sender, receiver, token (parallel); require an enrolled `offlineDeviceKey`;
   c. rebuild the exact signed tuple as **XDR** (`buildOfflineSignatureXdr`: amount, toll, nonce, receiver, gateway, token, contract) and **verify the sender's Ed25519 signature**;
   d. insert `Settlement(PENDING)` (unique `nonce` = idempotency; on conflict re-read);
   e. `executeTwoPhaseSettlement`: take the Redis **relayer lock**, build + sign the `spend_offline` transaction, **persist `txHash` + `signedTxXdr` first**, submit, release the lock, then poll Soroban RPC for confirmation (up to ~15 s);
   f. `SUCCESS` -> `SETTLED`; `FAILED` -> `FAILED` + reason; still unknown -> throw so BullMQ retries and **resumes** from the stored XDR (no double-spend, no re-sign).
5. On `SETTLED` the processor enqueues an SMS receipt (deduped job id) to the sender.
6. Retry policy (`engine-retry.util.ts`): network/429/5xx/`tx_bad_seq` retry; contract errors are `UnrecoverableError`.

`POST /api/settlements { smsBody }` does the same synchronously (no queue).

### 7.5 Wallet reads (`modules/wallet`) *(skimmed)*
Balance (Horizon trustline check with zero fallback), history (reconciles settlements, anchor txs, online transfers), vault balance (Soroban `get_vault`), transactions list, and `POST /wallet/transfers/confirm` (verifies the tx on Soroban RPC, promotes `OnlineTransfer` to `SETTLED`). Rate limits are per-route `@Throttle`.

### 7.6 Anchor / SEP-24 (`modules/anchor`) *(skimmed)*
`stellar.toml`, `sep24/info`, SEP-10-authed interactive deposit/withdraw that mint a **short-lived interactive-URL JWT** for a web view, `submit-withdraw`, `confirm-withdraw` (verifies the payment on Horizon, idempotent), and a testnet-only `simulate-payment` guarded by a single-use Redis claim. Caps and kill switches come from env (`RAMP_*`, `DEPOSIT_ENABLED`, `WITHDRAW_ENABLED`).

### 7.7 Health (`modules/health`) *(read in full)*
`GET /api/health` pings DB, Redis and Soroban RPC concurrently (each failure is isolated), reports `healthy` only if DB and Redis are OK, and lists feature flags. `?deep=1` also probes TextBee devices.

## 8. Data model *(read in full)*

`prisma/schema.prisma` (PostgreSQL, snake_case columns via `@map`):

| Model | Purpose | Notable |
|---|---|---|
| `Account` | A user | unique `shortId`, unique `stellarPublicKey`; `pin` is a scrypt hash; `phoneNumber` is **indexed but not unique** |
| `Token` | Supported tokens (PHPC, USDC) | unique `symbol`, `contractId`; `decimals` |
| `Settlement` | One offline voucher settlement | unique `nonce` (replay/idempotency), `status` PENDING/SETTLED/FAILED, `txHash`, `signedTxXdr` (for resume), `amountStroops` BigInt; legacy column `qstashMessageId` |
| `OnlineTransfer` | Direct online transfer record | unique `txHash`; promoted to SETTLED after RPC confirmation |
| `AnchorTransaction` | SEP-24 deposit/withdraw | uuid id, status enum, amounts as strings |
| `GatewayNode` | Backup gateway keys | |
| `DemoAccountPair` | Disposable judge accounts, secrets encrypted by the app | |

Money is `BigInt` stroops (7 decimals).

## 9. Async flows: queues and workers

- **Queues:** `engine-settlement` (settlement jobs) and the SMS delivery queue; Redis-backed BullMQ; registered only when `QUEUE_ENABLED=true`.
- **Idempotency:** deterministic `jobId`, DB unique `nonce`, Redis nonce claim.
- **Failure policy:** exponential backoff, `UnrecoverableError` for permanent failures, `removeOnFail:false` so failed jobs stay inspectable.
- **Fallback:** with queues off, SMS goes out directly via TextBee (`SmsService.enqueueSms`).

## 10. Configuration

`src/config/env.validation.ts` (Joi) validates at boot; `ConfigModule` loads `apps/backend/.env` (ignored by git). Groups: server (`PORT`, `CORS_ORIGIN`), database, Stellar (`SOROBAN_RPC_URL`, `STELLAR_HORIZON_URL`, passphrase, `CONTRACT_ID`), keys (relayer, registrar, SEP-10 seed/JWT secret, distributors), ramp caps/flags, Redis/queue, TextBee (+ fallback), OTP (test mode, JWT secret), SEP-10 timeouts. `.env.example` is the template. See the review file for variables read at runtime but missing from the schema.

## 11. Testing layout

- **Unit specs next to source:** `src/**/*.spec.ts`, run by `npm test` (Jest, `rootDir: src`).
- **e2e:** `test/e2e-testing/*.e2e-spec.ts` via `npm run test:e2e` (`supertest` against `AppModule`, using `configureApp`, with Prisma/Redis faked in `e2e-setup.ts`). `test/parity-testing/` holds live-parity scripts against the legacy deployment.
- **Duplicates exist:** several e2e specs are also at `test/*.e2e-spec.ts`, and `test/unit-testing/` mirrors specs that live in `src/`. See the review file.
- Phase scripts: `test:phase2`, `test:phase3` run curated subsets.

## 12. Build and deploy

- `npm run build` -> `prisma generate` then `nest build` -> `dist/`.
- `Dockerfile`: multi-stage on `node:22-alpine`; builds `pijin_core` (workspace package) and Prisma client; runtime copies `node_modules` and `dist`, runs as `node` user; `HEALTHCHECK` hits `/api/docs-json`.
- Migrations are not run by the container; `prisma migrate deploy` must be run as a separate step.
- Docs: `docs/backend-rebuild/` (plan, contributor guide, next steps, SMS test porting).

## 13. How to add an endpoint here

1. Decide the contract (path under `/api`, auth type, body, errors). If it replaces a legacy route, match the legacy body exactly.
2. Create `modules/<domain>/dto/<name>.dto.ts` with `class-validator` decorators.
3. Add the method to `<domain>.service.ts` (business rule + Prisma + infra). Throw Nest exceptions, or `ApiResponseException(status, body)` for an exact body.
4. Add the thin controller method with `@Throttle`, `@UseGuards(...)`, `@HttpCode(...)` as needed.
5. Register providers/imports in `<domain>.module.ts`; add the module to `AppModule` if new.
6. New env var? Add to `env.validation.ts` and `.env.example`; read via `ConfigService`.
7. If the route needs special body parsing (raw bytes, text), add it in `request-body.middleware.ts`, *before* the generic JSON parser.
8. Write a unit spec beside the service and an e2e spec in `test/e2e-testing/` if guards/pipes/filters/status codes matter.
9. Run `npm run typecheck`, `npm run lint`, the specs you touched; update the parity table in the migration plan.

## 14. Glossary

- **Stroop**: smallest Stellar unit (1 token = 10^7 stroops).
- **Soroban**: Stellar's smart-contract platform; **XDR** is its binary wire format.
- **SEP-10 / SEP-24 / SEP-1**: Stellar standards for wallet auth, interactive deposit/withdraw, and discovery metadata.
- **Relayer**: server-held Stellar account that submits settlement transactions and pays fees.
- **Voucher**: offline, Ed25519-signed payment instruction sent by SMS.
- **Nonce**: unique value per voucher; the idempotency/replay key.
- **shortId**: 6-character Base62 public identifier for a user (used inside SMS vouchers).
- **TextBee**: Android-based SMS gateway used to send OTPs and receive vouchers.
- **Parity**: matching the legacy API's behaviour exactly.
