# Migration next steps

This file captures the progression path after the setup-phase completion. Phase 2 implementation has landed; Phase 3 endpoint code is underway in `apps/backend`, with tests and parity checks still to complete.

## 1. Phase 2: Auth, OTP, accounts (implementation landed; parity gate pending)

Execute in this order:

1. Port auth/session basics from the legacy Next.js backend into `apps/backend/src/modules/auth`.
   - `/api/auth` (SEP-10 challenge and token flow)
   - `Sep10JwtGuard`
   - `JWT` secret handling and timeout validation
2. Port PIN verification lockout:
   - `/api/auth/pin/verify`
   - same Redis keys, TTLs, and failure logic as legacy
3. Port OTP flows:
   - `/api/otp/send`
   - `/api/otp/verify`
   - TextBee gateway client and test-mode rules
4. Port account flows:
   - `/api/register`
   - `/api/users/check`
   - `/api/users/lookup`
5. Port the legacy signup security tests and ensure they pass under Jest.

Completion gate:
- typecheck passes
- tests pass for auth/OTP/account modules
- contract parity check against legacy responses for all routes above

## 2. Phase 3: Wallet, transactions, settlements

Implementation started on 2026-10-29. Wallet balance/history/vault/transactions, transfer confirmation, and signed offline settlement submission have Nest service implementations. Focused tests are in `src/modules/wallet/wallet.service.spec.ts`, `src/modules/settlements/settlements.service.spec.ts`, `src/modules/settlements/reconciliation.service.spec.ts`, and `src/scripts/phase3-wallet-smoke.spec.ts`; all 16 Phase 3 unit tests pass. RPC success, storage lookup, and safe-retry reconciliation cases are covered; recipient registry cases and request/response parity checks are still outstanding.

1. Port wallet endpoints:
   - `/api/wallet/balance`
   - `/api/wallet/history`
   - `/api/vault-balance`
   - `/api/transactions`
2. Resolve the open review decisions before porting:
   - `/api/wallet/transfers/confirm`
   - `/api/settlements`
3. Port settlement logic and reconcile legacy semantics exactly.
4. Port `reconciliation.test.ts` and pass it.

Completion gate:
- all route contracts match legacy
- no auth decision is made silently; any intentional deviation gets recorded in the migration plan decision log

## 3. Phase 4: Engine / Soroban (highest risk)

1. Port the test files first, as required by the plan:
   - `concurrency-hardening.test.ts`
   - `engine-retry-classifier.test.ts`
   - `stellar-transaction-manager.test.ts`
2. Port `Ed25519SignatureGuard` and server-side transaction submission flow.
3. Migrate the engine endpoints:
   - `/api/engine/deposit`
   - `/api/engine/offline-key`
   - `/api/engine/recipient-registry`
   - `/api/engine/transfer`
   - `/api/engine/withdraw`
   - `/api/engine/settle`
4. Convert settle flow to a BullMQ processor while preserving API compatibility where external callers still use the HTTP route.

Completion gate:
- all engine tests pass
- contract simulation / submission behavior matches legacy
- retries, queue semantics, and lock handling are validated under concurrency tests

## 4. Phase 5: SMS, queue, voucher security (implementation underway)

1. Port the TextBee client with fallback device logic and signature guard.
2. Port SMS dispatch queue and webhook inbound handling.
3. Port offline voucher verification logic.
4. Port the legacy SMS security tests:
   - `sms-security.test.ts`
   - `sms-delivery.test.ts`
   - `offline-voucher-security.test.ts`

Initial Nest implementation now includes TextBee primary/fallback delivery, a BullMQ SMS producer/worker, the signed inbound webhook and settlement queue producer, a shared offline voucher parser/XDR verifier, deep TextBee health status, and the `SMS_DISPATCH_SECRET` guard for the compatibility dispatch route. Raw HTTP size/signature and dispatch authorization tests pass. Finish any remaining legacy edge assertions and live route parity before closing Phase 5.

Completion gate:
- webhook signatures verified
- fallback device logic tested
- no rate-limit regressions

## 5. Phase 6: Anchor / SEP-24 and web pages

1. Port anchor endpoints and interactive flows.
2. Decide how web pages will be served during migration:
   - Nest server-rendered views, or a separate small web app
3. Complete required pages before cutover:
   - SEP-24 deposit/withdraw pages
   - privacy policy
   - delete account
   - demo pages if needed
4. Port `ramp-security.test.ts` and run contract checks.

Completion gate:
- interactive flow works against the hosted Nest backend
- interactive JWT and flow security match the legacy contract

## 6. Phase 7: Demo, friendbot, scripts

1. Port demo modules behind `DEMO_ENABLED`.
2. Add friendbot with testnet-only guards.
3. Port useful scripts from legacy for operational support.
4. Run demo validations and ensure they are not accidentally enabled in production.

Completion gate:
- demo-only flows stay disabled unless explicitly enabled
- scripts run cleanly in local and staging environments

## 7. Phase 8: Deploy and cutover

1. Choose a long-running host and provision Postgres, Redis, and secrets.
2. Deploy to staging and run legacy-vs-Nest contract checks for critical endpoints.
3. Update environment values, webhook targets, and app URLs.
4. Point the mobile app to the new API base URL only after staging validation is green.
5. Keep the Vercel legacy deployment alive until stable cutover is confirmed.

Completion gate:
- all critical endpoints match legacy behavior
- staging health checks and queue workers are green
- rollback path validated

## Critical guardrails before each phase

- Keep `apps/_legacy/backend` read-only.
- Copy any logic needed; do not import across the boundary.
- Do not change Prisma schema during migration unless the decision log explicitly says so.
- For every endpoint port: run legacy vs Nest parity check before marking it complete.
- Require `npm run typecheck`, `npm test`, `npm run build`, and relevant e2e checks before moving to the next phase.

## Recommended next milestone

Start with Phase 2 (Auth, OTP, accounts) because the app bootstrap is already in place and the main risks are route parity and JWT/OTP behavior. This is the safest next step to continue the migration without destabilizing the backend foundation.
