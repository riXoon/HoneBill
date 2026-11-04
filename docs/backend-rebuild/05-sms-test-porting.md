# Phase 5 SMS test porting

Verified 2026-11-01. Legacy files remain unchanged. The mappings below cover the
cases in all three requested legacy files; Jest groups related assertions into
parameterized tests instead of preserving node:test names one for one.

All paths below are relative to `apps/backend/src` unless otherwise stated.

| Legacy file / case | Nest coverage |
|---|---|
| `sms-security.test.ts`: valid HMAC and both `sha256=` prefix cases | `modules/sms/sms-security.util.spec.ts` |
| Tampered payload, wrong secret, single-hex-digit signature mutation | Same security spec |
| Missing, short, odd-length, oversized, non-hex signatures | Same security spec |
| Omitted timestamp: null, undefined, empty, whitespace | Same security spec |
| Fresh seconds/milliseconds, recent past, near future | Same security spec |
| Stale, future drift, unparseable timestamps | Same security spec |
| Body under limit | Same security spec |
| Early Content-Length rejection | Same security spec |
| Streaming body limit rejection | Same security spec; production Express size limit also covered in `modules/sms/sms.routes.e2e.spec.ts` |
| International/local phone masking and short-value redaction | Same security spec |
| Recursive Stellar/QStash/bearer redaction, embedded seeds, preserved public fields | Same security spec |
| `sms-delivery.test.ts`: retryable 408/429/500/502/503 and permanent 400/401/403/404/422 | `modules/otp/textbee.service.spec.ts`, exercised through public `deliver` |
| Retry 5xx then succeed | Same TextBee spec |
| Do not retry permanent 4xx | Same TextBee spec |
| Retry network errors and return retryable failure | Same TextBee spec |
| Fallback gateway and fallback SIM selection | Same TextBee spec |
| Invalid recipient without gateway calls | Same TextBee spec |
| Missing config is permanent | Same TextBee spec |
| Overall deadline across retries/devices | Same TextBee spec, fake-clock deadline exhaustion |
| URL derivation and duplicate fallback suppression | Same TextBee spec |
| Philippine recipient normalization | Same TextBee spec |
| Tester OTP enabled/disabled, valid/invalid code, normalized allow-list | `common/utils/otp-test-mode.spec.ts` |
| Device health: online/offline/disabled/unknown | `modules/health/sms-health.service.spec.ts` (existing coverage) |
| `offline-voucher-security.test.ts`: valid six-part voucher and positive amount | `modules/settlements/offline-voucher.util.spec.ts` |
| Unpadded/URL-safe Base64 | Same voucher spec |
| Empty, too few, too many parts | Same voucher spec |
| Invalid token IDs | Same voucher spec |
| Invalid sender/receiver Base62 IDs and wrong lengths | Same voucher spec |
| Zero amount | Same voucher spec |
| i128 overflow | Same voucher spec |
| Invalid nonce/signature Base64 characters | Same voucher spec |
| Wrong nonce byte length | Same voucher spec |
| Wrong signature byte length | Same voucher spec |
| Golden seven-element XDR/signature and changed-contract rejection | Same voucher spec |
| Backward-compatible six-element tuple | Same voucher spec |

## Route compatibility

Run from the repository root with both servers available:

```powershell
node apps/backend/test/parity-testing/sms-parity.mjs http://127.0.0.1:3000 http://127.0.0.1:3001
```

The script loads each app's `.env`/`.env.local` signing secret without printing it.
Override secrets using `PARITY_LEGACY_WEBHOOK_SECRET` and
`PARITY_NEST_WEBHOOK_SECRET` when a running process uses a different configuration.
It checks connectivity and webhook health on both servers, then compares 26
requests. Status codes and JSON match after normalizing trace IDs and elapsed
timestamp-drift seconds. No valid vouchers or authenticated sends are published.

Coverage: missing/invalid/tampered signatures; alternate signature header/prefix;
invalid JSON; missing fields; receipt and ignored-event filtering; timestamps;
raw/SMS length limits; malformed vouchers; unauthorized dispatch (including invalid
JSON); unsupported methods. Live result against the fresh compiled Nest process
on **3002** and legacy on **3000**: **26 OK / 0 DIFF / 0 BLOCKED**.

Porting exposed and fixed SMS 404-versus-405 differences, dispatch authentication
ordering for malformed JSON, and HTTP 503-versus-500 delivery/buffering failures.
Authenticated dispatch validation is covered by the SMS HTTP tests. Gateway
success/permanent/transient results and worker retry behavior use mocked gateway
results in the service and dispatch-processor tests. Successful voucher buffering,
concurrent deduplication, and worker signature verification use real services with
mocked queue/cache/DB/RPC boundaries in `sms-settlement.integration.spec.ts`.

Expected migration differences remain: dispatch uses `SMS_DISPATCH_SECRET` instead
of QStash authentication, and webhook health reports `qstashToken: false`.

## Validation and remaining live work

- Backend Jest suite: **30 suites / 233 tests passed**.
- Backend E2E suite: **13 suites / 78 tests passed** (Redis available).
- Typecheck and production build passed.
- Full suite logs include deliberately simulated delivery failures.
- The fresh parity run used the legacy server on 3000 and the rebuilt Nest server on 3002.

The test-porting/route-check task is complete within the coverage described above.
The user confirmed a primary-device SMS was delivered, and a signed synthetic
webhook request through the public tunnel returned HTTP 200. This run did not verify
TextBee fallback, a provider-originated callback delivery record, production-worker
queue processing/retry scheduling, or a funded on-chain voucher settlement. Phase 5
remains in progress until the remaining live checks are completed and recorded. This
automated/parity run sent no real SMS and submitted no payment.
