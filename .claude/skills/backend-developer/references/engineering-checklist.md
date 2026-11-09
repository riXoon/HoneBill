# Backend engineering checklist

Use this to check completeness when designing, reviewing, or declaring something "production ready". Not every item applies to every change; skip what is irrelevant and say so, rather than ticking boxes.

## Contents
1. [API design](#1-api-design)
2. [Data and persistence](#2-data-and-persistence)
3. [Security](#3-security-owasp-api-top-10-oriented)
4. [Reliability and failure handling](#4-reliability-and-failure-handling)
5. [Performance and scale](#5-performance-and-scale)
6. [Observability](#6-observability)
7. [Testing](#7-testing)
8. [Deployment and operations](#8-deployment-and-operations)
9. [Code quality](#9-code-quality)
10. [Review severity guide](#10-review-severity-guide)

## 1. API design
- [ ] Resource-oriented paths, plural nouns, consistent casing; verbs only for true actions (`/transfers/confirm`).
- [ ] HTTP method semantics respected (GET safe and idempotent; PUT/DELETE idempotent; POST for creates/actions).
- [ ] Status codes are deliberate: 200/201/204, 400, 401, 403, 404, 409, 422, 429 (+`Retry-After`), 5xx.
- [ ] One error body shape everywhere (here `{ error, ... }`), documented, with stable machine-readable `code`s for client branching.
- [ ] Input validated by DTO; unknown fields rejected; strings length-bounded; numbers range-bounded; arrays size-bounded.
- [ ] Lists paginated with a max page size (cursor preferred), stable sort, filter allowlist.
- [ ] Unsupported methods return 405 (not 404/500).
- [ ] Idempotency for retried unsafe operations (idempotency key, natural key, or unique constraint) so mobile clients on flaky networks can retry safely.
- [ ] Versioning strategy exists (path prefix, header) and breaking changes are explicit decisions.
- [ ] Responses never include secrets, hashes, internal ids not meant for clients.
- [ ] Money/large integers serialized as strings; timestamps ISO-8601 UTC.
- [ ] OpenAPI generated and accurate (request, response, auth, errors).

## 2. Data and persistence
- [ ] Schema normalized unless there's a measured reason; every FK and common filter column indexed.
- [ ] Constraints in the database (unique, not null, FK, check) as the last line of defense, not only in code.
- [ ] Multi-write operations atomic (`$transaction`); transactions short; no external calls inside.
- [ ] State transitions guarded (conditional update) so concurrent actors can't double-apply.
- [ ] Migrations versioned, reviewed, backward compatible with the running app version, and tested on a copy; never edit an applied migration.
- [ ] Soft vs hard delete decided deliberately; PII retention considered.
- [ ] Sensitive columns hashed (PINs/passwords: argon2/bcrypt) or encrypted (secrets) with keys outside the DB.
- [ ] Connection pool sized for (instances x pool) <= DB limit; pooled URL for runtime, direct URL for migrations when using a pooler.
- [ ] Backups and restore tested; know the RPO/RTO.
- [ ] Queries reviewed with `EXPLAIN` for hot paths; no N+1.

## 3. Security (OWASP API Top 10 oriented)
- [ ] **Broken object-level authorization:** every endpoint taking an id checks the caller may access *that* object (not just "is logged in").
- [ ] **Broken authentication:** JWT verified with explicit alg/issuer/expiry; short-lived access tokens; secrets rotated; brute-force protection (rate limit + lockout); constant-time comparisons.
- [ ] **Excessive data exposure / mass assignment:** response mapping explicit; `whitelist` + `forbidNonWhitelisted` on.
- [ ] **Unrestricted resource consumption:** body size limits, pagination caps, rate limits, timeouts, queue/backpressure.
- [ ] **Function-level authorization:** admin/privileged routes guarded by role; deny by default (global guard + `@Public()` opt-out).
- [ ] **Server-side request forgery:** any URL fetched from user input is allowlisted.
- [ ] **Security misconfiguration:** `helmet`; CORS allowlist; no stack traces; debug flags off in prod; no default/fake secrets; Swagger UI protected or disabled in prod if it exposes sensitive internals.
- [ ] **Injection:** parameterized queries only (Prisma does this; raw SQL via tagged templates `$queryRaw` not string concat); never `eval`/shell with user input.
- [ ] **Improper inventory:** old/legacy/test endpoints removed or protected (debug, simulate-payment, demo routes behind feature flags and environment checks).
- [ ] **Unsafe consumption of APIs:** validate upstream responses; timeouts; don't forward upstream error text to clients.
- [ ] Webhooks: verify HMAC over raw bytes, timestamp window, nonce/replay store, size cap.
- [ ] Proxy awareness: `trust proxy` configured; IP-derived limits can't be spoofed with headers.
- [ ] Secrets only in env/secret manager; `.env` ignored; nothing sensitive in logs, errors, git history, or tracked artifacts.
- [ ] Dependencies audited (`npm audit`), lockfile committed, minimal install in the image.

## 4. Reliability and failure handling
- [ ] Every outbound call has a timeout, bounded retries with backoff + jitter, and a clear failure mapping (502/503/504).
- [ ] Handlers idempotent or deduplicated; replays and double-submits are safe.
- [ ] Partial failure leaves a recoverable state (record intent before side effect; reconcile later).
- [ ] Locks have TTLs, are released in `finally`, and token-checked on release.
- [ ] Queues: attempts, backoff, dead-letter/failed retention, poison-message handling, alert on depth.
- [ ] Graceful shutdown (`enableShutdownHooks`), drain, close pools.
- [ ] Degradation is deliberate: if Redis/SMS is down, what happens (fail closed for auth/limits; degrade for notifications)? Documented and tested.
- [ ] Feature flags / kill switches for risky or externally dependent features.

## 5. Performance and scale
- [ ] Stateless processes: sessions, locks, rate limits, caches live in Redis/DB, not memory (so N instances behave like 1).
- [ ] Hot reads cached with sensible TTL + invalidation; cache keys include tenant/user where relevant.
- [ ] CPU-heavy work (hashing, crypto, big parsing) kept off the hot path or offloaded; event loop never blocked by sync loops over big data.
- [ ] Compression, keep-alive, and HTTP caching headers for static-ish responses.
- [ ] Parallelize independent I/O (`Promise.all`); don't parallelize unbounded fan-out.
- [ ] Load-tested against a target (e.g., p95 latency under expected RPS); know the bottleneck (DB, upstream RPC).
- [ ] Horizontal scaling understood: what breaks with 2 instances (in-memory throttler, cron jobs running twice, in-process caches)?

## 6. Observability
- [ ] Structured logs with request/trace ID, route, status, latency, user/account id (not PII).
- [ ] Errors logged once with stack at the boundary, not at every layer.
- [ ] Health: liveness vs readiness; dependency checks with timeouts.
- [ ] Metrics: RED (rate, errors, duration) per route; queue depth/failures; DB/Redis latency; business counters.
- [ ] Alerts on symptoms users feel (error rate, latency, failed settlements), not just CPU.
- [ ] Audit log for sensitive operations (key rotation, withdrawals, role changes).

## 7. Testing
- [ ] Unit tests for business rules and pure helpers (parsers, money math, retry classification).
- [ ] e2e tests through the real pipeline for auth, validation, error shapes, rate limits, raw-body behavior.
- [ ] Sad-path tests: bad input, unauthorized, duplicate, upstream failure, timeout, replay, concurrency.
- [ ] Contract/parity tests when a legacy API must be matched.
- [ ] Tests are deterministic (fake time/network), isolated (no shared mutable state), and fast; flaky tests are fixed or removed, not retried.
- [ ] One canonical location per kind of test; no duplicated copies.
- [ ] CI runs lint, typecheck, unit, e2e on every PR.

## 8. Deployment and operations
- [ ] Multi-stage Dockerfile; non-root user; `NODE_ENV=production`; only prod deps + build output; pinned base image.
- [ ] Port and healthcheck consistent between code, Dockerfile and platform config.
- [ ] Config entirely from env; validated at boot; per-environment values outside the image.
- [ ] Migrations run as a distinct deploy step; rollback plan documented.
- [ ] Zero-downtime deploys: readiness gates traffic; old instances drain.
- [ ] Runbook: how to deploy, roll back, rotate secrets, replay failed jobs, read logs.
- [ ] Repo hygiene: no logs, scratch output, or ad-hoc scripts committed to the app root.

## 9. Code quality
- [ ] Types are strict; no `any` at boundaries; exhaustive `switch` on unions.
- [ ] Functions small and single-purpose; names say intent; comments explain *why*.
- [ ] No dead code, duplicated services, or two implementations of the same thing (e.g., two transaction managers).
- [ ] Consistent import style and file naming; services in `*.service.ts`.
- [ ] Errors are typed and specific; no empty `catch`.
- [ ] Docs (README, plan, ADR/decision log) updated with the change.

## 10. Review severity guide

| Severity | Meaning | Examples |
|---|---|---|
| **Critical** | Data loss, money loss, auth bypass, secret exposure, outage on deploy | Unverified signature path, plaintext secret in git, migration that drops data |
| **High** | Likely bug or exploitable weakness under realistic conditions | Spoofable rate-limit key, race on balance, no shutdown hooks losing jobs, production boots with fake DB URL |
| **Medium** | Correctness/maintainability issue with a workaround, or risk under unusual conditions | Duplicated provider instances, in-memory limiter across instances, controller business logic |
| **Low** | Style, naming, small cleanups, missing docs | File named `.util.ts` containing a service, tracked scratch logs |

For each finding give: **where** (`file:line`) · **what** · **failure scenario** · **fix** · **verified or suspected**.
