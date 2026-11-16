# HoneBill app map (for QA)

How the app works from a tester's point of view, and the facts behind each expected result. Every number has a source file: **grep it before relying on it**, because the code changes often.

## Contents
1. Parts of the system
2. The two balances and how money moves
3. The offline payment lifecycle
4. Sync: when the phone talks to the server
5. Sign-in, lock and accounts
6. Limits and timings table
7. Messages testers will see
8. Known gaps and planned changes

---

## 1. Parts of the system

| Part | Where | What testers touch |
|---|---|---|
| Mobile app | `apps/mobile` (Expo SDK 57, RN 0.86, Android APK from `/download`) | Everything |
| Backend | `apps/backend` (NestJS, Prisma/Postgres, Upstash Redis, routes under `/api/v2`) | Indirectly: balances, history, OTP, settlement |
| SMS gateway | TextBee (a phone acting as a gateway) → `POST /api/v2/sms/webhook` | The number offline vouchers are texted to (`EXPO_PUBLIC_SMS_GATEWAY_NUMBER`) |
| Settlement queue | QStash or BullMQ (`SETTLEMENT_TRANSPORT`), `modules/engine/settlement-*` | Delay between "text sent" and "went through" |
| Relayer | One relayer key behind a Redis lock (`honebill:relayer:lock`, `infra/stellar/stellar-transaction-manager.service.ts`) | All offline settlements run **one at a time** |
| Contract | `contracts/src/lib.rs` (Soroban): `deposit`, `spend_offline`, `set_offline_key`, `register_recipient` | Vault balance, nonce replay protection, offline key |
| Stellar testnet | Horizon + Soroban RPC (`EXPO_PUBLIC_HORIZON_URL`, `EXPO_PUBLIC_SOROBAN_RPC_URL`) | Online wallet balance, tx hashes on Stellar Expert |
| Anchor (SEP-24) | `modules/anchor` | Top Up (testnet, simulated payment) |

## 2. The two balances

- **Online wallet**: PHPC held by the user's Stellar account. Online sends and Top Up use it. Needs internet.
- **Offline vault (Offline balance)**: PHPC deposited into the contract under the user's address. Offline vouchers spend from it.
- **Transfer to Offline** = `/engine/deposit` (contract `deposit`). **Transfer to Online** = `/engine/withdraw`. Both are signed on the phone and need internet. After they land, a `confirm_move` is queued (see §4).
- **Toll**: each offline payment costs **₱0.50** on top of the amount (`OFFLINE_TOLL_PESOS`, `apps/mobile/src/config/limits.ts`; backend `settlements.util.ts`). The contract debits amount + toll.
- **Held money**: `pendingOffline` (`context/WalletDataContext.tsx`) = sum of (amount + 0.50) for pending outgoing offline payments. Spendable offline = `vault − pendingOffline` (`screens/SendAmountScreen.tsx`, `components/send/TransferForm.tsx`). The phone **never computes a balance itself**: the vault balance shown is the server's last reading, minus held money.
- The chain is the source of truth. Pending entries are placeholders until the server's history lists the nonce. Then the server's entry (settled or failed) replaces them.

## 3. Offline payment lifecycle

1. **Recipient**: the sender enters a 6-character short ID (case-sensitive) or scans a QR code. Offline, there's no server lookup: the recipient shows as **unverified** ("Sent to ID ABC123") with a warning to double-check (`screens/SendToScreen.tsx`, `services/recipientDirectory.ts`). Scanning your own QR is refused.
2. **Amount**: limited to the spendable offline balance minus the toll.
3. **Voucher**: built and signed on the phone with the **offline device key**, using the gateway/token/contract IDs cached while online (`services/offline/voucher.ts`, `offlineConfig.ts`). If the phone was never set up online, it says "Offline payments are not set up on this phone yet…".
4. **Text**: the phone opens the SMS app with the voucher (≈156 characters, one SMS holds 160) addressed to the gateway number (`screens/SendMethodScreen.tsx`). The same voucher (same nonce) is reused if the user retries, so a retry can never pay twice.
5. **"Did you send the text?"**: shown when the user returns to the app. **"Yes, I sent it"** → pending entry added, voucher queued in the outbox, a sync requested, receipt shown. **"Not yet"** → nothing recorded.
6. **Settlement, two routes**: (a) the gateway receives the SMS → webhook → queue → relayer → `spend_offline`. (b) The phone's outbox posts the voucher to `POST /settlements` when online. Whichever is second gets 409 "already settled". The SMS webhook also drops replays of a voucher it has already received.
7. **Texts back**: on settle or fail, the backend texts the sender and the receiver (`modules/engine/settlement-notice.util.ts`), ASCII only, sender's first name cut to 20 characters.
8. **Outcome on the phone**: the next history read lists the nonce. The pending entry is replaced, and Home shows a notice: "N offline payments went through." / "…did not go through. No money was taken." / "…could not be confirmed. Check your balance before sending again."
9. **Give-up**: a pending payment the server still doesn't list after **14 days** is marked unconfirmed, but only after the phone is online and has just read history. While offline, money stays held indefinitely (`agePending`, `services/walletCache.ts`).
10. **Queued vouchers survive sign-out and restarts**. They settle the next time that wallet signs in on this phone.

**Offline device key**: each account has **one** key on-chain. When another install (another phone, a reinstall, a restored account) goes online, it rotates the key to itself (`services/offline/setup.ts`, re-checked at most every 2 minutes). Vouchers signed by the old key then fail the signature check ("not verified"). Setup also registers the short ID on-chain and caches the config.

**Contract errors** (`contracts/src/lib.rs`): 3 InvalidAmount, 4 ExpiredVoucher (not used yet), 5 NonceReplayed, 6 InsufficientBalance, 7 RecipientNotFound, 9 NotWhitelistedGateway, 12 InvalidShortId.

## 4. Sync

`services/sync/syncService.ts`, plan in `docs/mobile-sync/plan.md`.
- Triggers: reconnect (after a 0-3 s random wait; drops under 1.5 s are ignored), app back in the foreground, every **60 s** while online and on screen, pull-to-refresh.
- Only one sync at a time; triggers that arrive mid-sync are dropped. Losing the connection cancels an automatic sync.
- Step order: `vouchers` (10) → `confirms` (20) → `wallet` (100, balances + history) → feedback.
- **Voucher outbox**: up to 5 posts per sync, oldest first. 200 or 409-with-status = decided. 409 without status (device key not on file yet) = retry later. 408/429/5xx/network = back off 30 s, doubling to 1 h, and stop this drain. Other 4xx = rejected, and the pending entry shows failed with a reason.
- **Confirm outbox** (moves and online transfers): up to 10 per sync. 409 = not indexed yet, retry 2 s doubling to 60 s. 422 = failed on-chain. `confirmSoon` tries 4 times right away.
- **Feedback outbox**: reports written offline, sent on sync, expire after 30 days.
- Database: `expo-sqlite` + drizzle (`src/db`). Tables `wallet_state`, `wallet_transactions`, `outbox`.

## 5. Sign-in, lock, accounts

- Sign-up: phone number → OTP (SMS) → details → MPIN (4 digits; weak ones such as 1111, 1234 and 2580 are refused by `services/mpinPolicy.ts`) → recovery phrase → recovery quiz → vault created and offline setup done.
- Sign-in: MPIN checked by the server when reachable. Fingerprint is optional (`services/biometrics.ts`).
- **Offline MPIN** (`services/offlineMpin.ts`): works only after at least one *online* MPIN sign-in on this phone for this number. 5 wrong tries → offline sign-in locked 15 min. This count is **separate** from the server's, survives restarts, and is cleared by a correct online sign-in.
- **Auto-lock** (`hooks/useAutoLock.ts`): in the background for **30 s** → locked, MPIN asked again. iOS "inactive" doesn't count. A payment in progress holds the lock off until it finishes (`services/lockHold.ts`). Locking keeps cached balances and history.
- **Switching accounts** on a phone clears the other account's cached data. Queued vouchers stay.
- **Forgot MPIN**: SMS code + wallet proof. Email changes are paused 24 h after a reset. MPIN and email changes have a 24 h cooldown (`CHANGE_COOLDOWN_SECONDS`, `modules/accounts/accounts.service.ts`).
- Recovery phrase screens block screenshots and the recent-apps preview.
- **Updates**: `GET /app/version`. Below `APP_MIN_SUPPORTED_VERSION` → "Update required" screen. Below latest → notice in Inbox. The app version is at the bottom of Profile (`APP_VERSION_LABEL`).

## 6. Limits and timings

| What | Value | Source |
|---|---|---|
| Global API rate limit | 120 req / 60 s (Nest throttler, keyed by `req.ip`; **no `trust proxy` set**, so behind a proxy every user may share one bucket. Verify) | `apps/backend/src/app.module.ts` |
| `GET wallet/balance`, `wallet/history` | 10 / 10 s | `modules/wallet/wallet.controller.ts` |
| `GET transactions` | 15 / 10 s | same |
| `POST wallet/fund` (top-up funding) | 5 / 60 s | same |
| `POST register` | 30 / 10 min | `modules/accounts/accounts.controller.ts` |
| `GET users/lookup` | 300 / 60 s | same |
| `PATCH users/profile` | 10 / 60 s | same |
| `POST auth/pin/verify` | 30 / 60 s, plus 5 failures → 15 min lockout | `modules/auth/auth.controller.ts`, `accounts.service.ts` |
| `POST feedback` | 5 / 60 s | `modules/feedback/feedback.controller.ts` |
| OTP send | 3 per 5 min per IP+phone; 5 per hour per phone; 300/hour global | `infra/redis/otp-rate-limit.service.ts` |
| OTP code | expires in 300 s; 5 wrong tries | `common/utils/otp.util.ts` |
| SMS webhook | 3 texts per sender phone per rolling minute; extras are dropped | `modules/sms/sms.service.ts` |
| Auto-lock | 30 s in background | `apps/mobile/src/config/limits.ts` |
| Offline MPIN | 5 wrong → 15 min | `apps/mobile/src/services/offlineMpin.ts` |
| Toll | ₱0.50 per offline payment | `config/limits.ts` |
| Short ID | 6 chars, case-sensitive | `config/limits.ts` |
| Note | 50 chars | `config/limits.ts` |
| First/last name | 50 chars each; email 254 | `modules/accounts/accounts.service.ts` |
| Pending give-up | 14 days (online only) | `services/walletCache.ts`, `sync/voucherOutbox.ts` |
| Sync interval | 60 s while online and on screen | `services/sync/syncService.ts` |
| Offline key re-check | every 2 min while online | `services/offline/setup.ts` |
| Voucher SMS | ≈156 of 160 characters | `docs/voucher-expiry/plan.md` |

## 7. Messages testers will see

Most are in `apps/mobile/src/i18n/en.ts` (Filipino in `fil.ts`). Quote the exact wording in expected results. Grep `en.ts` for the key so the card matches the build. Useful ones: `held` ("₱X is held for offline payments that are still waiting to settle."), the outcome notices (`settled`/`failed`/`unconfirmed`), `offlineNotSetUp` (MPIN), `noInternetCheck`, `uncheckedBody`, `sentYes`/`sentNo`.

## 8. Known gaps and planned changes (don't file these as new bugs)

- **Vouchers never expire on-chain yet.** After the 14-day give-up, a late SMS can still settle the voucher, so a payment marked "could not be confirmed" may go through later, silently. This is documented in `docs/voucher-expiry/plan.md` (planned 7-day contract-enforced deadline, 7-field SMS format). Testing it is still valuable: confirm the current behaviour and note it against the plan.
- Relay dispatch ("let a partner text it for you") is not built; it shows "not available".
- Maya and GCash send methods show "not available yet".
- Settlement confirms (phase 5) are marked "needs device check" in the sync plan, so they're worth a real-device card.
