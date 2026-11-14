# Offline voucher deadline: plan

Status: decisions agreed (see Decisions), not started. Touches the contract, the backend and the mobile app.

## Why

An offline voucher is valid forever today. The signed payload in `spend_offline`
([contracts/src/lib.rs](../../contracts/src/lib.rs)) is
`(amount, protocol_toll, nonce, receiver_short_id, gateway, token, contract)`, with no time in it. The contract defines
`ContractError::ExpiredVoucher = 4` but never returns it.

So the app cannot know when a payment it has not heard back about is dead. It currently guesses: after 14 days it stops
retrying, marks the payment "could not be confirmed" and stops holding its money (`agePending` in
`apps/mobile/src/services/walletCache.ts`). That guess causes three problems:

1. **Double spend.** The held money is released while the old voucher can still settle (a late SMS). If it does, the
   vault may then be short for the person's newer payments, which fail.
2. **Vague wording.** The app cannot say "No money was taken" for an expired payment, only "check your balance".
3. **Silent late settlement.** A payment marked unconfirmed that settles later is never announced as gone through.

With a deadline the contract enforces, "expired" becomes a fact. After the deadline the voucher can never settle, so
the app can say "Expired. No money was taken.", release the held money safely, and drop the "unconfirmed" state for new
vouchers.

## Design

### The deadline

- New signed field `expires_at: u64`, in Unix seconds, compared with `env.ledger().timestamp()`.
- The app sets it to `now + lifetime` when it builds the voucher, rounded down to a whole minute (see SMS format).
- **Lifetime:** the backend sends it in the offline config the app already caches (`offlineConfig` from
  `POST /engine/recipient-registry`), as `voucherLifetimeSeconds`: **7 days** (decision 1). It can change without an
  app release.
- **Contract cap:** the contract rejects `expires_at > now + MAX_VOUCHER_LIFETIME` (proposed 30 days, matching the
  nonce TTL below). This stops a modified app from issuing vouchers with no real deadline.

### Phone clock

An offline phone's clock can be wrong, and the deadline is compared with ledger time.

- While online, the app records the offset between server time and phone time on each successful sync, read from the
  HTTP `Date` response header (decision 3).
- `expires_at = phoneNow + savedOffset + lifetime`. If there is no offset yet, use the phone clock; the cap and the
  grace period below cover small errors.
- The app treats a voucher as certainly dead only after `expires_at + 10 minutes`. The grace covers ledger close time
  and leftover clock error.

### Contract (`spend_offline`)

1. Add the `expires_at: u64` parameter.
2. Right after the amount check (it is cheap, so it goes before any storage read):
   `if env.ledger().timestamp() > expires_at { return Err(ContractError::ExpiredVoucher) }`.
   Then check the cap: `expires_at <= now + MAX_VOUCHER_LIFETIME`, or return `ExpiredVoucher` / a new
   `InvalidExpiry` error.
3. Add `expires_at` to the signed tuple:
   `(amount, protocol_toll, nonce, receiver_short_id, expires_at, gateway, token, contract)`.
4. Not in this change (decision 4): nonces only need to outlive their voucher, so a later follow-up could move them
   from persistent storage (TTL bumped forever) to temporary storage with a TTL past `expires_at`, which costs less
   rent. Do it only after confirming the TTL arithmetic in tests; a nonce that disappears before its voucher's deadline
   would allow a replay.
5. Tests in `contracts/src/test.rs`:
   - settles one second before the deadline;
   - rejected one second after, with `ExpiredVoucher`;
   - a tampered `expires_at` fails the signature check;
   - a deadline beyond the cap is rejected;
   - a replay is still rejected before the deadline.

### Voucher SMS format

Today: `tokenId:sender:receiver:amountB62:nonceB64:sigB64`. For typical amounts that is about **156 characters**, and
one GSM SMS holds 160. Going past 160 splits the text into two parts, which some gateways deliver separately, breaking
the voucher.

New format (7 fields):
`tokenId:sender:receiver:amountB62:expiryB62:nonceB64:sigB64`

- `expiryB62` is **minutes since 2026-01-01T00:00Z**, in base62. Four characters cover 28 years. The contract value is
  `epoch + minutes * 60`, so the app must sign exactly that value (the reason for rounding to a minute).
- Strip base64 padding from the nonce and signature. This saves 3 characters, and the backend already restores
  padding (`restoreBase64Padding`).
- Result: 152 characters plus the amount's length, so about 158 for typical amounts (PHP 1 to 5,680 is 6 base62
  characters). It stays within 160 up to about PHP 21.8M (8 characters). Add a test that checks the longest realistic
  voucher is 160 characters or fewer.
- The backend tells the formats apart by field count (6 = old, 7 = new).

### Backend (`apps/backend`)

- `offline-voucher.util.ts`: parse the 7-field format and decode `expiryB62`. A 6-field voucher is recognised only to
  reject it with a clear reason and record it as FAILED (see Rollout), since the upgraded contract cannot settle it.
- `buildOfflineSignatureXdr` / `verifyOfflineVoucherSignature`: include `expires_at` in the signed bytes (same order
  as the contract).
- `SettlementsService.processSettlement`: after the signature check, if the voucher is past its deadline, record it as
  FAILED with the reason "Voucher has expired" and do not submit it. This saves the transaction fee and gives a clear
  reason. `recordRejection` already handles this case. Pass `expires_at` in the `spend_offline` arguments.
- `userFailureReason` already turns contract error 4 into "Voucher has expired."; the failure text then reads
  "...did not go through. Voucher has expired. No money was taken."
- Prisma: add `expiresAt DateTime?` to `Settlement` (migration), so History can show the deadline.
- Offline config: add `voucherLifetimeSeconds` (7 days).
- Make sure the API's responses include the standard `Date` header, including through any proxy in front of it; the
  app reads server time from it.
- Tests:
  - parse the 7-field format, and reject a 6-field one with the old-format reason;
  - signature with expiry;
  - an expired voucher is recorded as FAILED and never submitted;
  - expiry decoding at the minute boundary.

### Mobile (`apps/mobile`)

- `services/offline/voucher.ts`: compute `expires_at` (offset plus lifetime, rounded to a minute), add it to the signed
  vector in the contract's order, and emit the 7-field text with padding stripped.
- Save the server-time offset during sync. The lifetime comes from the cached offline config.
- Store the deadline on the pending entry: new column `expires_at` in `wallet_transactions` (migration step 3 in
  `src/db/migrations.ts`) and in the outbox payload.
- `agePending`:
  - **New vouchers:** after `expires_at + grace`, mark the entry failed with the reason "Expired before it was settled"
    and count it as **failed** (certain: "No money was taken"), not unconfirmed. Its held money is released.
  - **Old vouchers** (no `expires_at`): keep today's 14-day "unconfirmed" rule until none are left.
- Voucher queue: stop posting a voucher after its deadline instead of after 14 days.
- Screens:
  - the receipt and the payment's detail screen show "Valid until <date, time>";
  - pending entries show the time left once under 24 hours.
- Manual checks (the app has no unit test runner):
  - set the lifetime to 10 minutes in the backend config, send while offline, wait out the deadline, and confirm the
    History card, the Home notice and the released held money;
  - send a stale voucher's SMS late and confirm the "expired" text.

## Rollout

Testnet and testers only today, so `spend_offline` is replaced in place (decision 2).

1. **Tell testers** that vouchers sent before the upgrade and not yet settled will stop settling, and ask them to
   settle or resend any outstanding ones first.
2. **Contract:** implement and test, then upgrade through the existing `upgrade(new_wasm_hash)` (admin). From then on
   only 7-field vouchers can settle.
3. **Backend:** deploy the new format together with the contract upgrade. A 6-field voucher that arrives afterwards is
   rejected before submission with a clear reason ("This payment used an old format. Please send it again.") and
   recorded as FAILED, so the sender is told no money was taken.
4. **App:** ship the new format in a new APK build. Old app builds can no longer pay offline, so testers must update.
5. **Clean-up:** once no 6-field pending entries remain on testers' phones (14 days after the upgrade), remove the
   old-format rejection path from the backend and the old `agePending` rule from the app.

If live users exist before this ships, revisit decision 2: replacing in place would break their outstanding vouchers,
and the side-by-side route (`spend_offline_v2`, old function removed later) would be needed instead.

## Decisions

Agreed on 2026-11-14.

1. **Lifetime: 7 days.** The backend sends it as `voucherLifetimeSeconds` in the offline config, so it can change
   without an app release. A shorter lifetime releases held money sooner but gives a sender who stays offline less
   time for their text to go through.
2. **Compatibility: replace `spend_offline`.** Pre-launch there are only testers, so the contract function is replaced
   and upgraded in place rather than running v1 and v2 side by side. Testers are told before the upgrade that unsettled
   old vouchers will stop settling.
3. **Server time source: the HTTP `Date` header.** No API change is needed; the app reads it from responses it already
   receives during sync.
4. **Nonce storage: later.** Moving nonces to temporary storage is a separate follow-up after the deadline has shipped
   and its tests pass. It is not part of this change.

## Out of scope

- Reading the gateway's reply SMS in the app (SMS Retriever). That is a separate change, and it needs a native module.
- Changing how the nonce itself is generated or shortening it.
