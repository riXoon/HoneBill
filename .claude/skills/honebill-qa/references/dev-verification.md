# Developer verification and triage

How the developer confirms what a tester saw, and where a failure points in the code. Testers report symptoms; this file maps symptoms to layers.

## Contents
1. Where to look
2. Tracing one offline payment end to end
3. Symptom → likely cause
4. Pre-session checklist

---

## 1. Where to look

| Source | How | Tells you |
|---|---|---|
| **Settlement table** (Postgres, Prisma `Settlement`) | Prisma Studio (`npx prisma studio` in `apps/backend`) or SQL | Whether the backend saw a voucher (by nonce), its status PENDING/SETTLED/FAILED, `txHash`, `failReason` |
| **Backend logs** | Host log stream | Webhook receipt ("Buffered offline settlement"), replay ("already received"), rate limit ("sent more than 3 in a minute"), 429s, relayer/lock errors |
| **Stellar Expert (testnet)** | `https://stellar.expert/explorer/testnet/tx/<hash>` and `/account/<G…>`, `/contract/<C…>` | The ground truth: did `spend_offline`/`deposit`/payment happen, which contract error |
| **TextBee dashboard / gateway phone** | The gateway phone's SMS inbox | Whether the SMS arrived at all, and when |
| **Health** | `GET /api/v2/health` | DB, Redis, Stellar RPC, SMS status |
| **Phone (dev build)** | Metro log: `[offline-setup]`, `[voucher] signed` (dev only) | Setup steps, the exact signed voucher fields |
| **Phone DB** (dev build or `adb` on a debuggable build) | `outbox` table: `kind`, `status`, `attempts`, `lastError`, `nextAttemptAt` | Whether the phone's internet route tried, and why it's waiting |
| **Feedback reports** | Discord channel / DB | Tester reports sent from the app, including the app version |

Ask testers for the **reference code** from the receipt: it's the voucher nonce (5th field). Search `Settlement` by nonce. The pending entry id is `pending:<nonce>`.

## 2. Tracing one offline payment

1. Tester's receipt → nonce, time, amount, receiver ID.
2. Gateway phone inbox: did the SMS arrive? When? Was it in one part?
3. Logs at that time: "Buffered" (good) / "rate limited" / "replay" / "Malformed SMS payload" / "Invalid voucher signature".
4. `Settlement` row by nonce: missing (never reached the backend by either route), PENDING (stuck in queue or relayer), SETTLED, or FAILED + reason.
5. Stellar Expert: the tx for `txHash`. If FAILED, read the contract error code (see `app-map.md` §3).
6. If no row: the phone's outbox row for that nonce. `attempts`/`lastError` show the internet route's last result.
7. Receiver: history lists it? A text sent to the receiver?

## 3. Symptom → likely cause

| Tester says | Check first | Likely code |
|---|---|---|
| "Payment stuck on pending forever" (online for a while) | Settlement row exists? Outbox `nextAttemptAt` far in the future? | Backoff up to 1 h in `sync/voucherOutbox.ts`; queue stuck in `modules/engine/settlement-*`; relayer lock not released (`infra/lock`) |
| "Said failed but receiver got the money" | Two Settlement rows? Status the app read? | `classify()` in `voucherOutbox.ts` (409 handling); history merge by nonce in `WalletDataContext.tsx` |
| "Paid twice" / "shows twice in History" | Two on-chain txs (real double spend: **critical**) vs. one tx shown twice (display) | Contract nonce check; `transactions` merge (`listed` nonce set, `normalizeNonce`), `addMoves` dedupe by ref |
| "Offline balance wrong" | Server's `offlineBalancePHP` vs. Stellar Expert contract balance; pending list | `pendingOffline` sum; cache in `walletCache.ts`; stale snapshot |
| "Couldn't send, says not set up" | Offline setup cached? Key on-chain = this phone's? | `services/offline/setup.ts`, `offlineConfig.ts`; another phone took the key |
| "Could not be verified" | Device key on-chain vs. the voucher signer | Key rotation (O10); tampered SMS; config mismatch (gateway/token/contract IDs changed after a backend redeploy, so the cached config is stale) |
| "Too many requests" | 429 in logs, which route, which IP | Throttler keyed by IP behind a proxy (`app.module.ts`) |
| "App locked during payment" | Which screen? | `useAutoLock.ts`, `lockHold.ts`, `SendMethodScreen` AppState listener |
| "MPIN not accepted offline" | Ever signed in with the MPIN online on this phone? | `offlineMpin.ts` (`canCheckMpinOffline`, phone-number match) |
| "Spinner never stops" | Network condition C3/C4? | Missing timeout or abort on that request (`services/api/client.ts`); `ProcessingOverlay` |
| "Got no text" (receiver) | Receiver's phone on file? Log of the notice dispatch | `settlement-notice.util.ts`, `modules/sms` dispatch processor |
| "Text says weird name" | Sender's name | `smsSafeName` (ASCII, 20 chars) |
| "Crash" | Android version, model, steps; ErrorBoundary screen text | `components/ErrorBoundary.tsx`, `services/errorReporting.ts` |

Classify each report: **real bug** / **expected but confusing** (fix the wording or UX: a confused tester is a confused user) / **test-setup issue** (config, gateway off, outdated APK).

## 4. Pre-session checklist (developer)

- [ ] Backend deployed from the branch under test. `/api/v2/health` all green.
- [ ] TextBee gateway phone: charged, on signal, SMS credit, webhook URL correct.
- [ ] Relayer and funding accounts have enough testnet XLM. PHPC issuer can fund top-ups.
- [ ] `SETTLEMENT_TRANSPORT` set, and its worker or QStash is running.
- [ ] `APP_LATEST_VERSION` / `APP_MIN_SUPPORTED_VERSION` / `APP_DOWNLOAD_URL` correct (unless a card changes them).
- [ ] Every tester's APK version noted (Profile footer). Everyone is on the same build.
- [ ] Each tester has an account, a short ID shared with their partner, ≥ ₱200 online and ≥ ₱100 in the vault (top up beforehand; offline cards spend from the vault).
- [ ] Testers paired (A/B), with second phones assigned for O10/G4 cards.
- [ ] Log stream open and filtered. Start times recorded per round.
- [ ] Any temporary config changes listed, with who reverts them afterwards.
