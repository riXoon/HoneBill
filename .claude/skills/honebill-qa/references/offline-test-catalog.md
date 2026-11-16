# Offline test catalog

Scenarios for HoneBill's offline features. They're written for you (the QA lead), not the testers. Turn the ones you pick into tester cards using `tester-writing-guide.md`. Each has: **who/what is needed**, **how**, **expected**, **what it's hunting** (the code or assumption under test), and **dev check** (see `dev-verification.md`).

Roles: **A** = sender, **B** = receiver, **A2** = A's account signed in on a second phone.
"Offline" means **Airplane mode on, Wi-Fi off, mobile data off**, unless the scenario says otherwise. Testers need the phone's SMS to work, so for SMS scenarios use "mobile data off + Wi-Fi off" (*not* airplane mode), which keeps cellular SMS.

## Contents
- O1 Ways of being offline (connectivity conditions)
- O2 Setup and readiness
- O3 The happy path, end to end
- O4 Interrupting the voucher flow
- O5 The two routes racing (SMS vs internet)
- O6 Held money and balances
- O7 Multiple payments and backlog
- O8 Recipient and amount edge cases
- O9 Offline sign-in, lock and accounts
- O10 Device key and multiple phones
- O11 Time and clock
- O12 Storage, restarts and reinstall
- O13 Offline Help & Feedback

---

## O1. Ways of being offline

Many bugs only show up under one specific kind of "offline". Run the key scenarios (O3.1, O5.1, O6.1) under several of these. List the condition explicitly on each card.

| Code | Condition | How a tester makes it | What it hunts |
|---|---|---|---|
| C1 | Fully offline | Airplane mode on (SMS off too) | The basic offline UI; vouchers can't be texted. Expect a messaging-app failure or a queued SMS |
| C2 | No data, SMS works | Mobile data off, Wi-Fi off, airplane off | **The real offline-payment condition** |
| C3 | Captive / dead Wi-Fi | Connect to a hotspot whose host phone has mobile data **off** | NetInfo says "connected" but nothing loads. Timeouts, endless spinners, `useSendMode` choosing online when it shouldn't |
| C4 | Weak signal | Basement, elevator, edge of coverage, or a 2G-only setting | Slow requests that time out half-way: duplicate submits, stuck "processing" |
| C5 | Flapping | Toggle airplane mode on/off every 2-3 s, 5 times | Only **one** sync after it settles (`exhaustMap`, 1.5 s debounce); no duplicate history rows; no crash |
| C6 | Drops mid-request | Start an action, turn on airplane mode within 1 s | Cancelled sync must not count as a failed attempt. Online send/move outcome must be resolved later, not lost |
| C7 | Long offline | Stay offline 1+ hour, then 1+ day, with the app backgrounded | Held money stays held. Lock and offline MPIN still work. Reconnect catches up in one go |
| C8 | Data saver / battery saver | Android Data Saver on, Battery Saver on, app "restricted" in battery settings | Background/foreground sync timing; the app may not see connectivity changes until reopened |

## O2. Setup and readiness

**O2.1 Brand-new account, never offline-ready** (P0, 1 phone)
How: Sign up online. Right after the "Vault Secured" screen, go C2 and try an offline payment.
Expected: either it works (setup finished during sign-up) or a clear message: "Offline payments are not set up on this phone yet. Open the app once with a connection, then try again." No crash, no voucher sent.
Hunts: `ensureOfflineReady` not completed before the first offline use. Short-ID registration is slow (`registerWithRetry` retries 502/503/504 up to 3×).
Dev check: backend log for `/engine/recipient-registry` and `/engine/offline-key`; contract `get_recipient(shortId)`.

**O2.2 Setup interrupted** (P1, 1 phone)
How: Fresh sign-in. On Home, go offline within ~2 s (before setup can finish). Wait 1 min, come back online, wait 2 min, then try offline.
Expected: setup finishes on its own once online. The offline payment then works.
Hunts: the `inFlight` promise stuck after an abort. A half-saved setup.

**O2.3 Top up the vault, then go offline immediately** (P0, 1 phone)
How: Transfer ₱100 to Offline. As soon as the success screen shows, go C2. Check the Offline balance, then pay ₱90 offline.
Expected: the Offline balance includes the ₱100 (or the app makes clear it's still updating). The ₱90 payment either goes through or is blocked before sending as not enough balance. It must never be sent and then fail for insufficient balance without warning.
Hunts: the cached vault balance not refreshed after a move. The `addMoves` local entry vs the server balance.

## O3. Happy path, end to end

**O3.1 Offline pay, SMS settles, receiver is online** (P0, A+B)
How: A in C2 pays B ₱20 by SMS and taps "Yes, I sent it". B stays online on Home.
Expected (A): receipt with a reference code. History shows a pending entry at once. Offline balance available drops by ₱20.50 at once. A gets a confirmation text within a few minutes.
Expected (B): gets a text naming A's first name and ₱20. B's online balance or history shows +₱20 within ~1-2 min (60 s sync) or on pull-to-refresh.
Then: A goes online → pending becomes settled, Home notice "1 offline payment went through.", held money released, vault shows the new balance, no duplicate entry.
Dev check: `Settlement` row SETTLED with a txHash; tx visible on Stellar Expert testnet; SMS webhook log line "Buffered offline settlement".

**O3.2 Offline pay, both offline, settles via internet only** (P0, A+B)
How: A in C2 builds the voucher, but in the SMS app **does not send** (deletes the draft). Returns and taps "Yes, I sent it" anyway (simulating a text that never left). Later A goes online.
Expected: the outbox posts it on reconnect, and it settles within one sync. A sees "went through". B gets the text and balance.
Hunts: the internet route on its own (`drainVouchers`). Also shows that "Yes, I sent it" when the text didn't go still ends safely.

**O3.3 Receiver fully offline for hours** (P1, A+B)
How: B in C1 for 2+ hours while A pays B offline. B comes back online.
Expected: B's balance and history update on reconnect without pull-to-refresh. One sync. The settlement text is waiting in B's SMS.

## O4. Interrupting the voucher flow

**O4.1 "Not yet", then send again** (P0, A+B)
How: Build the voucher, open the SMS app, come back without sending, tap **Not yet**. Tap send again, actually send this time, tap "Yes, I sent it".
Expected: exactly one payment, one pending entry, B paid once. (The same voucher and nonce are reused: `voucher.current ??=`.)

**O4.2 Sent the SMS, then answered "Not yet"** (P0, A+B)
How: Send the text for real, but tap **Not yet**. Leave the screen.
Expected (current design): the SMS still settles it. A's app shows no pending entry and no held money, so A's spendable Offline balance is **too high** until the next online sync shows the settled payment. Record what the app shows. This is a known risk to report on: if A then spends the "free" money offline, the next voucher may fail with InsufficientBalance.
Hunts: user error the app can't detect. Whether the outcome is still announced once online.

**O4.3 App killed between "voucher built" and the answer** (P0, A+B)
How: Send the text, then swipe HoneBill away from Recent apps **before** returning to it. Reopen.
Expected: the payment settles via SMS anyway. A's app has no record until it syncs online and the server lists it. Then it appears as a settled payment (not pending), and the balance is right. Note whether the user is ever told.
Hunts: the gap where the payment exists on-chain but the phone never recorded it locally.

**O4.4 Send the same text twice** (P0, A+B)
How: After sending, open the SMS app's conversation and resend/forward the same message to the gateway.
Expected: B paid once. The second is ignored (webhook replay protection, or contract NonceReplayed). A may get one failure text at most, and it must not say money was taken.
Dev check: log "SMS webhook ignored: this voucher was already received (replay)".

**O4.5 Edit the SMS before sending** (P1, A+B, security)
How: In the SMS app, change one character of the voucher (e.g. the amount part or the last character) and send.
Expected: rejected ("could not be verified"). No money moves. A's pending entry eventually shows failed with "No money was taken" once the outbox gets its own (correct) copy settled, **or** the correct copy settles and the edited one is ignored. Record which.
Hunts: signature checks on the SMS route; the outbox copy vs the tampered SMS copy.

**O4.6 SMS app missing or not default** (P2, 1 phone)
How: On a phone with a third-party SMS app as default (or the default SMS app disabled), send offline.
Expected: the voucher opens in whatever app handles `sms:`. If none, the message "no messaging app" appears and nothing is recorded.

**O4.7 Phone dies mid-flow** (P1, 1 phone)
How: Battery under 5% (or hold power → restart) right after tapping "Yes, I sent it".
Expected: after reboot, the pending entry and held money are still there (SQLite write survived), and the outbox still settles it.

**O4.8 Lock during the SMS hand-off** (P1, 1 phone)
How: Build the voucher, stay in the SMS app for 45+ s (past the 30 s auto-lock), send, come back.
Expected: the "Did you send the text?" question still appears and is answered correctly, before or after the MPIN screen. The answer isn't lost to the lock. If the app locks and the question is lost, that's a **P0** bug: the payment went out but isn't held.
Hunts: `useAutoLock` vs the `AppState` listener in `SendMethodScreen`; `lockHold`.

## O5. The two routes racing

**O5.1 SMS and internet arrive together** (P0, A+B)
How: A in C2 sends the text, taps "Yes", then immediately turns data on.
Expected: settled once. B gets one credit and one text. A's history has one entry. A sees "went through" (not "failed") even though one route got 409.
Dev check: one `Settlement` row; a 409 in logs for the second route; outbox row `done`.

**O5.2 Gateway down** (P0, A+B; developer turns off the TextBee phone or pauses the webhook)
How: A sends offline by SMS while the gateway is down. A comes online 10 min later.
Expected: settles via the internet route. When the gateway comes back and delivers the old SMS, it's ignored (already settled).

**O5.3 Backend down when the phone reconnects** (P1, developer stops the backend or blocks the route)
How: A has 2 pending vouchers and reconnects while the API returns 5xx.
Expected: no error spam. Pending stays pending with held money. The outbox backs off (30 s → 60 s → …). Once the backend is back, they settle within a few syncs or on pull-to-refresh.
Hunts: backoff growing so large that it waits up to 1 h after the server recovers. Note how long it took.

## O6. Held money and balances

**O6.1 Held money is exact** (P0, A+B)
How: Vault ₱100. A pays ₱10, ₱20 and ₱30 offline in C2 (by SMS, answering "Yes").
Expected: spendable goes 100 → 89.50 → 69 → 38.50 (amount + ₱0.50 each). Home shows "₱61.50 is held…". Trying to send ₱39 is blocked ("not enough"). The **₱38** maximum still works (38 + 0.50 = 38.50).
Hunts: rounding in `pendingOffline`, `amountProblem(amount, available − fee)`.

**O6.2 Exact-balance edge** (P0, A+B)
How: Vault ₱10.50 exactly. Pay ₱10 offline.
Expected: allowed, and settles with the vault going to 0. Then ₱0.01 offline is blocked.

**O6.3 A failed payment releases held money** (P0, A+B)
How: Make a payment fail for real. Pay a short ID that's valid in format but doesn't exist (the offline unverified path), or use O10.1. Go online.
Expected: the entry shows failed with a reason and "No money was taken." Held money is released. Spendable Offline balance goes back up. Vault on-chain unchanged.

**O6.4 Vault drained elsewhere** (P0, A + A2)
How: A (phone 1) pays offline ₱50 by SMS (pending). A2 (phone 2, online) moves the whole vault to Online. Phone 1's SMS settles after that.
Expected: the voucher fails with InsufficientBalance. Phone 1 shows "did not go through. No money was taken." Nothing goes negative.

**O6.5 Moving money while a payment is pending** (P1, 1 phone)
How: With ₱20 pending, open Transfer to Online.
Expected: the max you can move from Offline = vault − held. Moving it all must not leave the pending voucher unfundable.

**O6.6 Balances after many toggles** (P1, 1 phone)
How: Repeat 5×: online → move ₱5 to Offline → offline → back online. Then compare the app's numbers with Stellar Expert.
Expected: the app matches the chain exactly. No double-counted moves in History.

## O7. Multiple payments and backlog

**O7.1 Four texts in one minute** (P0, A+B)
How: In C2, send 4 offline payments of ₱1 within 60 s, all texted.
Expected: the gateway drops the 4th SMS (3 per minute per sender), but the outbox still settles it once A is online. All 4 eventually settle. If A **stays offline**, the 4th never settles until A goes online. Record whether A is told anything (likely not, which is a UX gap worth reporting).
Dev check: log "SMS webhook rate limited: sender=… sent more than 3 in a minute".

**O7.2 Big backlog** (P1, A+B)
How: Offline all day, A makes 12 payments (spaced over 10 min to avoid O7.1). Go online.
Expected: all settle. At 5 per sync, it takes about 3 syncs (60 s apart, or pull-to-refresh). History never shows duplicates. Home's outcome notice sums them ("12 offline payments went through").
Hunts: drain cap, ordering (oldest first), the outcome counters.

**O7.3 Same recipient, same amount, back to back** (P0, A+B)
How: Pay B ₱5 offline twice in a row.
Expected: two separate payments (different nonces). B gets ₱10. Not merged, not deduped.

## O8. Recipient and amount edge cases

- **O8.1 Wrong-case short ID** (P0): B's ID is `aB3xYz`; A types `AB3XYZ` offline. Expected: the payment fails (recipient not found) with "No money was taken", **or** the app blocks it. It must never pay someone else whose ID matches with different case.
- **O8.2 Non-existent ID offline** (P0): a valid-looking 6-char ID nobody owns. Expected: the unverified warning before authorising, then failed / no money taken.
- **O8.3 Pay yourself** (P1): enter your own short ID, or scan your own QR, offline. Expected: refused.
- **O8.4 QR with an amount, offline** (P1): B makes a Receive QR with ₱15. A scans it in C2. Expected: the amount is pre-filled, the payment goes offline, B is shown as unverified.
- **O8.5 Amount formats** (P1): ₱0, ₱0.01, ₱0.005, ₱1,000, a pasted "1,000.00", a leading zero, the max allowed balance. Expected: clear validation; the receipt amount equals the settled amount to the centavo.
- **O8.6 Long note / emoji note** (P2): a 50-character note with emoji, offline. Expected: the note is limited to 50; the SMS still fits one part (the note isn't in the voucher, but check).
- **O8.7 Sender name with accents/emoji** (P2): A's first name "José 🐝". Expected: B's text reads "Jose" (ASCII-cleaned), and isn't split into two SMS.

## O9. Offline sign-in, lock and accounts

**O9.1 First-ever offline sign-in** (P0): fresh install, sign in online with the **fingerprint only** (never MPIN), lock, go C1, try the MPIN. Expected: "You're offline. To use your MPIN offline, sign in with it once while online." The fingerprint should still work offline if set up.
**O9.2 Offline MPIN works** (P0): sign in online with the MPIN once, lock, C1, sign in with the MPIN. Expected: Home shows the cached balances/history with an "offline, last updated …" note.
**O9.3 Offline wrong MPIN ×5** (P0): C1, enter the wrong MPIN 5×. Expected: locked for 15 min; it survives an app restart and a phone reboot. Changing the phone clock forward 20 min: record whether it unlocks (it probably will, since the lock uses the phone clock; report it as a finding).
**O9.4 Offline and server counters are separate** (P1): 4 wrong offline, go online, 1 wrong online. Expected: the server says 4 tries left (its own count). A correct online sign-in resets the offline count.
**O9.5 MPIN changed on another phone** (P0, A + A2): A2 changes the MPIN online. Phone 1, offline, signs in with the **old** MPIN. Expected (current design): the old MPIN still works offline on phone 1 until it next goes online. Record it. Once online, the old MPIN must stop working.
**O9.6 Auto-lock while offline** (P1): background for 31 s offline. Expected: locked; the offline MPIN unlocks it; cached data still shown (not wiped).
**O9.7 Switch account on the same phone with vouchers pending** (P0, A + another account C): A has a pending offline payment. Sign out, sign in as C (online). Expected: C sees none of A's data. Later A signs back in: A's pending voucher is still queued and settles.
**O9.8 Sign out offline** (P1): sign out while in C1. Expected: no crash; the queued voucher remains; sign-in needs a connection, or the offline MPIN for the same account.

## O10. Device key and multiple phones

**O10.1 Old phone pays after the key moved** (P0, A + A2)
How: A signs in on phone 2 (A2) **online**, which takes over the offline key. Phone 1 has been **offline the whole time** and pays B offline.
Expected: phone 1's voucher fails the signature check. The backend texts A that it didn't go through and no money was taken. Phone 1, once online, re-takes the key (rotation) and the failed entry shows the reason "This phone was not set up for offline payments" or "could not be verified".
Hunts: a key rotation race. A user with two phones can **never** pay offline from both, so it's worth reporting as UX.

**O10.2 Both phones online, alternating** (P1)
How: Use phone 1, then phone 2, then phone 1, each online for 3 min, then pay offline from each right after going offline.
Expected: the phone that was online most recently can pay offline. The other fails cleanly.
Hunts: the 2-minute `KEY_CHECK_INTERVAL_MS` cache. A phone that checked within 2 minutes may wrongly believe it still holds the key.

**O10.3 Reinstall the app** (P0, 1 phone)
How: Uninstall (with a pending voucher still queued), reinstall, restore with the recovery phrase.
Expected: the old queued voucher is gone with the install. If its SMS was sent, it still settles via the gateway. The new install creates a new device key and sets up again. Record what the user sees about the old payment.

**O10.4 Restore on a new phone while the old one is offline with vouchers** (P0): combine O10.1 and O10.3.

## O11. Time and clock

- **O11.1 Phone clock wrong** (P1): set the phone 2 days ahead / 3 days behind, pay offline, restore the clock. Expected: the payment still settles (no on-chain expiry yet). History dates may be odd; record them. Once the voucher-expiry plan ships, this becomes **P0** (`expires_at` uses the phone clock plus the server offset).
- **O11.2 The 14-day give-up** (P1, needs a phone kept offline or the clock moved): pending > 14 days, then online. Expected: the entry becomes "could not be confirmed". Then **send the original SMS late**: it settles, and record whether the app ever says it went through (known gap, `docs/voucher-expiry/plan.md`).
- **O11.3 Midnight / date dividers** (P2): pay offline at 23:59, settle after 00:00. Expected: shown under a sensible date, not duplicated across dividers.
- **O11.4 Timezone change** (P2): change the timezone while pending. Expected: no duplicate or lost entries.

## O12. Storage, restarts, reinstall

- **O12.1 Force stop with pending** (P0): Settings → Apps → HoneBill → Force stop. Reopen offline. Expected: pending entries and held money intact.
- **O12.2 Clear cache vs clear storage** (P1): "Clear cache" should keep everything. "Clear storage/data" wipes the account: recovery is required, and record what happens to pending vouchers.
- **O12.3 Phone storage nearly full** (P1, low-end phones): fill storage to < 100 MB free, then pay offline. Expected: the payment is recorded, or an error appears before the SMS is sent. Never "SMS sent but nothing recorded" silently.
- **O12.4 Update the APK with pending vouchers** (P0): install the newer APK over the old one with 2 pending. Expected: they survive the update (DB migrations) and settle.

## O13. Offline Help & Feedback

- **O13.1** Write a report offline. Expected: "You're offline. Your report will be saved and sent when you're back online." It's delivered once online (developer sees it in Discord/DB) exactly once.
- **O13.2** Write 6 reports offline, go online. Expected: 5 go now, 1 on the next sync (server limit 5/min). None lost, none duplicated.
