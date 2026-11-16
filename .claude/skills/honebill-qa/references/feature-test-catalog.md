# Feature test catalog (online features)

Everything except offline payments (see `offline-test-catalog.md`) and group stress (`stress-and-group-tests.md`). Same format: who, how, expected, what it hunts. Screens are in `apps/mobile/src/screens/`. Confirm wording in `src/i18n/en.ts`.

## Contents
F1 Sign-up · F2 Sign-in & MPIN · F3 Recovery & Forgot MPIN · F4 Account settings · F5 Online send · F6 QR · F7 Receive · F8 Top Up · F9 Moves between wallets · F10 History & details · F11 Inbox & updates · F12 Profile, language, layout · F13 Low-end phones

---

## F1. Sign-up
- **F1.1 Happy path** (P0): number → OTP → details → MPIN → recovery phrase → quiz → vault. Expected: lands on Home with ₱0 balances. The short ID is visible and copyable.
- **F1.2 OTP edge cases** (P0): wrong code ×5 (locks the code); wait 5+ min and use the old code (expired); press Resend 4× within 5 min (3rd/4th refused: 3 per 5 min); press Resend 6× in an hour (5/hour). Expected: a clear message with a wait time each time, never a blank error.
- **F1.3 OTP arrives late** (P1): request OTP in a weak signal area; enter it after 4 min 50 s. Expected: accepted until 300 s, then a clear "expired".
- **F1.4 Number formats** (P1): 09171234567, +639171234567, 9171234567, spaces, dashes, a landline, a non-PH number. Expected: normalised or clearly refused. The same person can't create two accounts through formatting tricks.
- **F1.5 Already registered** (P0): sign up with a number that already has an account. Expected: routed to sign-in or recovery, not a second account.
- **F1.6 Weak MPIN** (P1): 1111, 1234, 4321, 7890, 2580, 1212. Expected: weak-PIN warning (`mpinPolicy.ts`).
- **F1.7 Quit midway** (P0): kill the app on the recovery phrase screen, and again on the quiz. Reopen. Expected: resumes safely or restarts sign-up without leaving a half-made account that blocks the number.
- **F1.8 Screenshot the recovery phrase** (P1): try a screenshot and check the recent-apps preview. Expected: blocked/blank.
- **F1.9 Names** (P2): 50-char names, Ñ/accents, emoji, only spaces, pasted text with newlines. Expected: limits enforced (50); shows correctly on Home/Profile (long names were fixed in `4193025`, so recheck).
- **F1.10 Lose signal during "Creating your vault…"** (P0): go C1 mid-creation. Expected: a clear retry, and on retry no second wallet or orphaned account.

## F2. Sign-in & MPIN
- **F2.1 Wrong MPIN ×5 online** (P0): Expected: "N tries left", then a 15-min lockout with a countdown. Another phone with the same account is also locked (server-side).
- **F2.2 Fingerprint** (P1): enable, sign in, add a new fingerprint in Android settings, try again. Expected: falls back to the MPIN or asks to re-enable. Never unlocks with the new finger without the MPIN.
- **F2.3 Auto-lock** (P0): background 25 s → no lock; 35 s → lock. During an online send's processing screen, background for 40 s: expected no lock until the payment finishes, then it locks.
- **F2.4 Back button** (P1): Android back on Home, on the lock screen, after sign-out. Expected: can't get back into a locked wallet with the back button.
- **F2.5 Session expiry** (P1): leave the app open on Home for 2+ hours, then send. Expected: renews silently or asks for the MPIN; no raw "401".

## F3. Recovery & Forgot MPIN
- **F3.1 Restore on a new phone** (P0): recovery phrase → same short ID and balances. The old phone loses offline payments (see O10.1).
- **F3.2 Wrong phrase** (P0): one wrong word, wrong word order, extra spaces, uppercase. Expected: clear refusal; spaces and case tolerated if intended.
- **F3.3 Forgot MPIN** (P0): SMS code plus wallet proof → new MPIN. Then: the old MPIN fails online. Offline (on another phone that had the old MPIN cached), see O9.5. Email change is blocked for 24 h after the reset.
- **F3.4 Forgot MPIN offline** (P1): Expected: "You're offline. Connect to the internet to reset your MPIN."

## F4. Account settings
- **F4.1 Change MPIN** (P0): SMS code; the new MPIN works; a second change within 24 h is refused with a clear wait time.
- **F4.2 Change email** (P1): valid/invalid/254-char emails; 24 h cooldown.
- **F4.3 Edit profile 11× in a minute** (P2): the 11th is refused (10/min) with a friendly message.

## F5. Online send
- **F5.1 Happy path** (P0, A+B): pay ₱25 by short ID. Expected: B sees it within ~60 s; both histories match; the receipt is shareable.
- **F5.2 Double tap Confirm** (P0): tap Authorise/Swipe twice fast. Expected: one payment.
- **F5.3 Drop the connection right after confirming** (P0): C6. Expected: the outcome is eventually shown correctly (sent or not), with no duplicate on retry. History is right after reconnect (confirm outbox).
- **F5.4 Kill the app on the processing screen** (P0): reopen online. Expected: if the money moved, History shows it (via `confirm_transfer` in the outbox); if not, no phantom entry.
- **F5.5 Insufficient online balance** (P0): send balance + ₱1. Expected: blocked before signing.
- **F5.6 Unknown short ID online** (P1): Expected: "not found" before the amount screen.
- **F5.7 C3 (dead Wi-Fi) send** (P0): Expected: the lookup times out, then the offline/unverified path or a clear error; never a spinner with no end.
- **F5.8 Recent recipients** (P2): after paying 5 people, recents are listed correctly and are tappable offline.

## F6. QR
- **F6.1 Scan in poor light, a cracked screen, from a printed copy, from a screenshot** (P1).
- **F6.2 Camera permission denied, then "Don't ask again"** (P1): Expected: "Open settings" works.
- **F6.3 Non-HoneBill QR** (P1): URL QR, GCash QR, random text. Expected: a clear "not a HoneBill code", no crash.
- **F6.4 Own QR** (P1): refused.

## F7. Receive
- **F7.1 QR with amount, save to gallery** (P1): saved success dialog; image legible; permission denied path.
- **F7.2 Copy short ID** (P2): copies the exact case.

## F8. Top Up (testnet)
- **F8.1 First top-up** (P0): creates the trustline, then deposits. Expected: step messages, success dialog, the balance updates.
- **F8.2 Six top-ups within a minute** (P1): the 6th may hit 5/min on `wallet/fund`. Expected: a friendly wait message.
- **F8.3 Lose connection mid top-up** (P0): Expected: a clear outcome after reconnect; no double credit when retried.
- **F8.4 Amount edge cases** (P1): 0, decimals, huge numbers.

## F9. Moves between wallets
- **F9.1 Online → Offline ₱50** (P0): Expected: both balances update; one History entry; matches the chain.
- **F9.2 Offline → Online with pending** (P0): see O6.5.
- **F9.3 Kill the app mid-move** (P0): Expected: the move resolves on the next open (`confirm_move` outbox).
- **F9.4 Move all, to the centavo** (P1).

## F10. History & details
- **F10.1 Filters and date dividers** (P2) across 30+ transactions.
- **F10.2 Pull to refresh offline** (P1): Expected: "You're offline. Showing your last update, <time>."
- **F10.3 Detail screen for each status** (P1): settled, pending, failed (with reason), unconfirmed, move, top-up.
- **F10.4 History matches Stellar Expert** (P0, dev-assisted): pick 5 entries and compare amounts and hashes.

## F11. Inbox & updates
- **F11.1 Update available** (P1): the developer sets `APP_LATEST_VERSION` above the build. Expected: an Inbox notice with a working download link.
- **F11.2 Update required** (P0): the developer sets `APP_MIN_SUPPORTED_VERSION` above the build. Expected: the blocking screen. Then **go offline**: record whether offline payments remain possible (they should not be blocked forever with no way to download).
- **F11.3 What's new** (P2): shows this version's notes once.

## F12. Profile, language, layout
- **F12.1 Filipino** (P1): switch to Filipino; go through every screen. Report English leftovers, cut-off text, wrong grammar.
- **F12.2 Big font / display size** (P1): Android font size max and display size max. Report overlapping or cut text, and keypad buttons pushed off-screen.
- **F12.3 Small screen** (P1): 5-inch or 720p phone; every screen scrollable, buttons reachable with the keyboard open.
- **F12.4 Dark mode / system theme** (P2).

## F13. Low-end phones
- **F13.1 Cold start time** (P1): time from tap to usable Home on a 2-3 GB RAM phone. Report > 5 s.
- **F13.2 Background kill** (P0): open the camera app plus 3 heavy apps, then return. Expected: the app restores to a safe screen (lock or Home); no lost pending payment.
- **F13.3 Long History scroll** (P2): 100+ entries; report stutter.
- **F13.4 Old Android** (P1): oldest Android version the testers have. Report any screen that crashes or looks broken; note the Android version.
- **F13.5 Battery** (P2): app open on Home for 30 min; battery drop vs. normal (60 s sync interval).
