# Mobile online/offline sync plan

Goal: balances and records stay correct as the phone moves online → offline → online, with no manual refresh.
RxJS is the observer layer. The pieces are ported from `apps/mobile/src/_legacy` (`connectionService`,
`syncService`, the Drizzle/SQLite `db/`) into live code one phase at a time. They are copied and adapted, never
imported from `_legacy`.

## Where the app is today

- Connectivity: `useIsOnline` (NetInfo hook). It is per component, not observable outside React.
- Data: `WalletDataContext` fetches balances and history, caches them in `expo-sqlite/kv-store` as JSON blobs,
  shows pending offline payments and own-wallet moves, and refetches on reconnect.
- Offline payments: the voucher is texted to the SMS gateway. The phone never retries it over the internet.
- Settlement confirms (`confirmMove`, `confirmTransfer`): retried in memory only and lost if the app is killed.

## Phases

| # | Phase | Ported from `_legacy` | Status |
|---|-------|-----------------------|--------|
| 1 | **Connectivity observer.** `connectivity$`, `online$` and `reconnected$` over NetInfo (`BehaviorSubject`). `useIsOnline` reads it. `reconnected$` ignores drops shorter than 1.5 s. | `services/connectionService.ts` | Done |
| 2 | **Sync orchestrator.** `services/sync/syncService.ts` merges its triggers: reconnect (with 0–3 s jitter), app back in the foreground, every 60 s while online and on screen, and pull-to-refresh (`syncNow`). They go through one `exhaustMap`, so only one sync runs at a time. A sync runs the registered steps in `order`, and a failing step does not stop the rest. Losing the connection cancels an automatic sync. `WalletDataContext` registers its refresh as the `wallet` step (order 100). `state$` exposes `syncing` and `lastSyncedAt`. | `services/syncService.ts` | Done |
| 3 | **Local database.** `src/db`: `expo-sqlite` + `drizzle-orm` (driver only) with `wallet_state`, `wallet_transactions` (`server`, `pending` and `move` groups) and `outbox`. Migrations are versioned with `PRAGMA user_version` and run on first use, not at startup. `walletCache.ts` keeps its API on top of the tables, writes each group atomically, and imports the old kv-store blobs once per wallet, then deletes them. There are no reactive reads: `WalletDataContext` is the only writer and already holds the state. | `db/client.ts`, `db/schema.ts`, `db/migrations.ts` | Done |
| 4 | **Offline voucher outbox.** `services/sync/voucherOutbox.ts`. The voucher is queued only after the user taps "Yes, I sent it", through `addPendingOffline(payment, voucher)`, and a sync starts right away. The `vouchers` sync step (order 10, before `wallet`) posts at most 5 due vouchers, oldest first, to `POST /settlements`. A 200 or a 409 with a status means the chain decided: the row becomes `done` or `failed`. A 409 without a status (device key not on file yet) retries later. 408, 429, 5xx and network errors back off (30 s, doubling, up to 1 h) and end the drain. Other 4xx responses are rejected, and their pending entry shows as failed. Vouchers expire after 14 days. | `syncService.flush`, `db/services/paymentQueueDb.ts` | Done |
| 5 | **Confirm outbox.** `confirmMove` and `confirmTransfer` become outbox jobs, so a killed app still confirms on the next sync. | (new, same outbox) | |
| 6 | ~~Manual offline mode~~ | `connectionService.isOnlineMode` | Dropped |

## Decisions (2026-11-11)

- **Direct settlement: yes.** Queued vouchers are also posted to `POST /settlements` once online, and SMS remains
  the offline path. This is safe because the backend verifies the device-key signature, the nonce is unique in the
  database and settled once by the contract (a second submission gets 409), and the global throttle is
  120 requests/min. The phone sends at most 5 posts per flush.
- **The chain is the source of truth.** Balances and history shown in the app always come from the server's reading
  of the chain. The phone never computes a balance or adjusts it locally. Pending entries are placeholders until the
  server lists the nonce, and the server's entry (settled or failed) then replaces them.
- **Queued vouchers survive sign-out.** The money is committed once the text is sent, so they settle the next time
  that wallet signs in on this phone. The cached history is still cleared on sign-out.
- **Manual offline mode: no.** Detected connectivity is enough; test offline by turning off Wi-Fi and data.

## Rules for every phase

- Every subscription has an owner that unsubscribes: a service lives for the app's lifetime, and a hook cleans up
  in its `useEffect`.
- Treat unknown connectivity (NetInfo still probing) as online. A request that then fails reports its own error.
- Sync work never blocks a frame. It is network-bound, and any large mapping happens after interactions.
- Retries are idempotent: nonce for vouchers, transaction hash for confirms.
- Signing out clears the account's cached balances and history. The outbox is kept (see Decisions).

## Verify each phase on a release build

1. Turn on airplane mode. The app shows the offline state and the saved data within about 1 s.
2. Turn airplane mode off. One sync runs, not one per screen, and balances and history update without pulling.
3. Toggle the network quickly 5 times. There is still only one sync after it settles.
4. Phases 4 and 5: send offline, kill the app, reconnect, and reopen. The payment settles and leaves the pending
   state.
