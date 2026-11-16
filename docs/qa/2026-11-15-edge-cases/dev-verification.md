# Edge-case session: developer verification

Companion to `tester-pack.md` (30 cards). How to confirm each result, what a failure points to, and what to set up beforehand. Numbers were checked against the code on 2026-11-15 at `471f55b`.

## Before the session

- [ ] Backend deployed from the build under test. `GET /api/v2/health` all green (DB, Redis, Stellar RPC, SMS).
- [ ] TextBee gateway phone charged, on signal, with SMS credit; webhook points at `/api/v2/sms/webhook`.
- [ ] Relayer and funding accounts have testnet XLM for ~100 settlements plus top-ups.
- [ ] `SETTLEMENT_TRANSPORT` set and its consumer (QStash or BullMQ worker) running.
- [ ] `APP_MIN_SUPPORTED_VERSION` is not above the testers' build.
- [ ] Every tester is on the same APK (Profile footer) and has ≥ ₱200 Online and ≥ ₱100 Offline. Offline cards use about ₱110 per sender in total.
- [ ] At least one tester has a **second phone** for OFF-15, OFF-16 and GRP-04.
- [ ] Log stream open, filtered for: `Buffered offline settlement`, `already received (replay)`, `rate limited`, `429`, `Invalid voucher signature`, `Relayer`, `timeout`, `sequence`.
- [ ] Record the start time of each round (and of every GO in round 5).
- [ ] Prisma Studio open on `Settlement` (`npx prisma studio` in `apps/backend`), sorted by `createdAt` desc.

**Tracing any offline report:** the receipt's reference code is the voucher nonce. Search `Settlement` by nonce. No row means neither route reached the backend: check the gateway phone's inbox, then the phone's `outbox` row. Then check `txHash` on `stellar.expert/explorer/testnet`.

## Card by card

| Card | Pass looks like (behind the scenes) | If it fails, look at |
|---|---|---|
| OFF-01 | One `Settlement` SETTLED with a `txHash`; "Buffered" log; one `spend_offline` tx | Gateway inbox → webhook log → queue → relayer. Phone side: `WalletDataContext.addPendingOffline`, history merge by nonce |
| OFF-02 | No backend check; it's the phone's math. 3 SETTLED rows | `pendingOffline` (`WalletDataContext.tsx`), `SendAmountScreen.tsx` (`available − fee`), `amountProblem` |
| OFF-03 | One row; one nonce reused | `SendMethodScreen.tsx` `voucher.current ??=` |
| OFF-04 | One SETTLED row; log "already received (replay)" or 409 / contract error 5 | `sms.service.ts` replay check; contract `NonceReplayed` |
| OFF-05 | SETTLED via SMS; the phone learns of it only from history | Expected gap: no local pending entry exists. If A's History never shows it, check `wallet/history` includes offline settlements for the sender |
| OFF-06 | **Watch closely.** Pending entry exists after unlock | `useAutoLock.ts` vs. the `AppState` listener in `SendMethodScreen.tsx` (navigation reset to Login unmounts the screen, so the "Did you send" dialog may be lost). If lost: a **real P0** (money sent, not held) |
| OFF-07 | SETTLED via SMS; no outbox row | Known design gap (no hold after "Not yet"). Record what the testers saw, for a UX decision |
| OFF-08 | 3 webhook "Buffered" + 1 "rate limited (more than 3 in a minute)"; the 4th settles via `POST /settlements` once A is online | `sms.service.ts allowWebhookSender`; `voucherOutbox.ts`. Ask: was A told anything? Probably not, a UX gap |
| OFF-09 | Row created by `POST /settlements` (no webhook log) | `drainVouchers`, `syncService` reconnect trigger. Note the time from data-on to SETTLED |
| OFF-10 | Wrong-case: FAILED "Recipient account not found" (or settled to another real ID, which is **critical**); made-up ID: 404 → outbox `rejected` → pending shows failed | `rejectionReason()` mapping; `recordRejection`; short IDs are case-sensitive, contract `get_recipient` |
| OFF-11 | SMS copy: "Invalid voucher signature" (401) or malformed; outbox's clean copy SETTLED. Either way, one settlement at most | `offline-voucher.util.ts` parse; `verifyOfflineVoucherSignature`. Make sure the tester's final History matches the chain |
| OFF-12 | No backend signal. Watch for hung requests | Request timeouts in `services/api/client.ts`; `SendToScreen.tsx` unreachable → `offerUnverified`; `useSendMode` deciding "online" on dead Wi-Fi |
| OFF-13 | Exactly one sync burst in logs after it settles (`wallet/balance` + `history`) | `connectivity.ts` (1.5 s debounce), `syncService` `exhaustMap` |
| OFF-14 | Pending entry survives the reboot; SETTLED via the internet route (or SMS if the messages app auto-resent it, so check the webhook log) | `walletCache.ts` / SQLite persistence; outbox row |
| OFF-15 | A2's sign-in rotates the key (`PATCH /engine/offline-key`); A1's voucher → "Invalid voucher signature", FAILED via `recordRejection`, failure text to A | `services/offline/setup.ts` (2-min key-check cache); `settlements.util.ts` signature check. Check the failure-text wording reaches A |
| OFF-16 | Either `spend_offline` fails with contract error 6 (InsufficientBalance) → FAILED, or the withdraw is limited | The withdraw ignores A1's unknown pending (expected). Main check: no negative balance, consistent end state |
| OFF-17 | SETTLED normally (no on-chain expiry yet) | History timestamps come from the phone clock for pending entries. Note any duplicates or reordering when the server entry replaces the pending one |
| SIGN-01 | No backend traffic | `offlineMpin.ts` `canCheckMpinOffline` (phone match); cached snapshot after lock (`4193025`) |
| SIGN-02 | No backend traffic | `offlineMpin.ts` attempts in SecureStore (`MAX_TRIES` 5, `LOCK_MS` 15 min). Lock uses the phone clock |
| SIGN-03 | One transfer; `confirm_transfer` done | `lockHold.ts`, `useAutoLock.ts` (30 s, `AUTO_LOCK_AFTER_MS`), confirm outbox |
| SIGN-04 | A's voucher settles after A signs back in | `clearOtherWalletCaches` on account switch; outbox is per `publicKey` and kept on sign-out |
| SEND-01 | One tx per action | Re-entry guards (`running` refs in `useTopUp`, `useWalletTransfer`, send hooks) |
| SEND-02 | Tx on chain at most once; `confirm_transfer` row eventually done | `confirmOutbox.ts` (409 indexing retries); the result dialog's wording when the outcome is unknown |
| SEND-03 | One deposit tx or none; `confirm_move` done after reopen | `confirmOutbox.ts` `confirm_move`, `addMoves` dedupe |
| PHONE-01 | n/a | `theme/responsive.ts`, `AuthScroll`, `fil.ts` gaps |
| PHONE-02 | n/a | SQLite persistence; navigation restore after process death |
| GRP-01 | **Key test.** If 429s appear for everyone, even across networks, the throttler is keying on the proxy IP | `app.module.ts` `ThrottlerModule` (120/60 s), no `trust proxy` in `main.ts`/`bootstrap.ts`; `wallet/balance` 10/10 s. Log `req.ip` during the round |
| GRP-02 | ~10 SETTLED rows, processed one after another (relayer lock). Note the slowest time | `stellar-transaction-manager.service.ts` lock, `isBadSequence` retries, queue retries |
| GRP-03 | ~12-20 `POST /settlements` within seconds (0-3 s jitter); all SETTLED; no 429 | Throttler (shared IP); relayer queue; outbox backoff after a 429 (30 s → 1 h, so a 429 here can mean long delays) |
| GRP-04 | One transfer succeeds; the other fails at simulation/submit | Online balance check is client-side; the chain is the guard. Make sure the failure message is clear, not raw |

## Most likely real findings from this session

1. **GRP-01 / GRP-03: shared rate limit.** No `trust proxy`, so all users may share one 120/min bucket behind the host's proxy.
2. **OFF-06: lock during the SMS hand-off (confirmed in code, needs a device to reproduce).** Only `ProcessingOverlay` calls `holdLock()`, and `building` is already false once `Linking.openURL` returns. So a user who spends more than 30 s in the messages app comes back to `useAutoLock` resetting navigation to Login. That unmounts `SendMethodScreen` before "Did you send the text?" can be answered, so `addPendingOffline` never runs: the money is sent by SMS but not held, and not queued for the internet route.
3. **OFF-07 / OFF-05: no hold when the phone didn't record the payment.** The spendable Offline balance is overstated until the next online sync.
4. **OFF-08: the 4th text in a minute is silently dropped.** It settles only once the sender is online, and the sender isn't told.
5. **OFF-15: key rotation.** A user with two phones can pay offline from only one, and the reason shown to the user may be unclear.

## After the session

Collect `tester-tracker.xlsx` from everyone, then paste failures or reports back into Claude with `/honebill-qa` to triage them.
