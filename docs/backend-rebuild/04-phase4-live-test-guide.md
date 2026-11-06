# Phase 4 Live Test Guide (Neon + Testnet)

This guide walks through Phase 4 using the Nest backend, a **Neon development database**, Postman, and Stellar testnet. It assumes you are new to Postman and Soroban.

> Use a Neon development branch and Stellar **testnet** accounts only. Never put production wallet keys or a production database URL in this setup.

## What you need before starting

- A Neon PostgreSQL development branch and its connection string.
- A Redis connection URL. Redis is separate from Neon; it is used for queues and locks.
- Soroban testnet RPC and Horizon URLs, the deployed Pijin contract ID, and the PHPC SAC token contract ID.
- Testnet keypairs for a sender, receiver, relayer, and registrar. Keep secret keys private.
- PHPC test funds and a PHPC trustline for the sender and receiver. Friendbot funds XLM only; it does not provide PHPC.
- Node.js 22, npm dependencies installed, and the Stellar CLI if you plan to use CLI contract queries.

You also need someone with the deployed contract's admin key to register the relayer gateway if that has not already been done.

## 1. Point the backend at Neon

From the repository root, create the local environment file and edit it:

```powershell
Copy-Item apps/backend/.env.example apps/backend/.env
notepad apps/backend/.env
```

In the Neon Console, select your **development branch**, open **Connect**, and copy its PostgreSQL connection string. Use the direct connection string for this test setup, and keep `sslmode=require`. Put it in `apps/backend/.env` as `DATABASE_URL`.

Set the relevant values in that same file:

```dotenv
DATABASE_URL="postgresql://...neon...?...sslmode=require"
REDIS_URL="rediss://..."
SOROBAN_RPC_URL="https://soroban-testnet.stellar.org"
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
STELLAR_HORIZON_URL="https://horizon-testnet.stellar.org"
CONTRACT_ID="<deployed Pijin contract C-address>"
RELAYER_PUBLIC_KEY="<testnet relayer G-address>"
RELAYER_SECRET_KEY="<testnet relayer S-secret>"
REGISTRAR_PUBLIC_KEY="<testnet registrar G-address>"
REGISTRAR_SECRET_KEY="<testnet registrar S-secret>"
SECRET_SEP10_SIGNING_SEED="<SEP-10 signing S-secret>"
SECRET_SEP10_JWT_SECRET="<long random development-only secret>"
PORT=3001
NEXT_PUBLIC_APP_URL="http://localhost:3001"
SEP10_HOME_DOMAINS="localhost:3001"
OFFLINE_TOKEN_SYMBOL="PHPC"
QUEUE_ENABLED=true
```

Set `REDIS_URL` to your Redis provider's TLS URL (often starts with `rediss://`). `REDIS_URL` is required for queue testing and is not the same as Neon `DATABASE_URL`. Do not paste connection strings or secret keys into Postman or commit `.env`.

The sample IDs in `.env.example` are examples. Confirm they are the IDs deployed on the same testnet you are using.

## 2. Apply migrations and add test records in Neon

Open PowerShell in the repository root and run:

```powershell
Set-Location apps/backend
npx prisma migrate deploy
npx prisma studio
```

Prisma Studio opens in a browser. Use it to confirm or add these records:

- **Token:** `symbol` = `PHPC`, `contractId` = the PHPC SAC contract ID, `isActive` = `true`.
- **Account (sender):** unique six-character Base62 `shortId` and sender's Stellar public key.
- **Account (receiver):** a different unique six-character Base62 `shortId` and receiver's Stellar public key.

Use only a Neon development branch for this. Do not use `prisma migrate reset`; it deletes database data. When finished, close Prisma Studio and return to the repository root:

```powershell
Set-Location ../
```

## 3. Check the contract and gateway

The local contract unit tests do not access Neon or testnet. Run them from the repository root:

```powershell
Set-Location contracts
cargo test
Set-Location ..
```

Before online settlement, the relayer must be funded with testnet XLM and whitelisted on-chain using `register_gateway`. The contract admin has to perform that registration. An unregistered relayer causes `spend_offline` to fail with contract error #9.

Check the registrar using the Stellar CLI command syntax from the original test guide. The on-chain registrar must equal `REGISTRAR_PUBLIC_KEY` in `.env`. If the contract has no registrar set, the contract admin must call `set_registrar` first.

## 4. Start the backend and check health

From the repository root, start the app and leave this terminal open:

```powershell
npm run start:dev --workspace=backend
```

In a second terminal or Postman, send **GET** to:

```text
http://localhost:3001/api/v2/health
```

Look for HTTP 200 and healthy database, Redis, and Soroban RPC checks. If health is degraded, check `DATABASE_URL`, `REDIS_URL`, and the Soroban RPC URL before proceeding.

## 5. Make the first Postman request

In Postman:

1. Select **New** → **HTTP Request**.
2. Select the method (start with **GET**) and paste the URL.
3. For JSON requests, choose **Body** → **raw** → **JSON** and paste the example body from the relevant step below.
4. Add request headers under **Headers**. Click **Send** and read the status and JSON response in the lower panel.

Recommended first requests:

| Method | URL | Purpose |
|---|---|---|
| GET | `http://localhost:3001/api/v2/health` | Verify app and dependencies |
| POST | `http://localhost:3001/api/v2/engine/deposit` | Prepare a deposit transaction |
| POST | `http://localhost:3001/api/v2/engine/withdraw` | Prepare a withdrawal transaction |
| POST | `http://localhost:3001/api/v2/engine/transfer` | Prepare an online transfer |
| GET | `http://localhost:3001/api/v2/auth?account=<ACCOUNT_G_ADDRESS>` | Start SEP-10 login |
| POST / PATCH | `http://localhost:3001/api/v2/engine/offline-key` | Enroll and confirm a device key |
| POST | `http://localhost:3001/api/v2/engine/recipient-registry` | Register receiver short ID on-chain |
| POST | `http://localhost:3001/api/v2/wallet/transfers/confirm` | Confirm an online transfer |

Replace angle-bracket placeholders with your test values; do not include the brackets.

## 6. Signed deposit, withdraw, and transfer requests

These routes require an `Authorization` header whose value is `Bearer <Base64 signature>`. The sender wallet signs the exact text message specified below with Ed25519. **Postman does not create this signature.** Use the sender wallet or a trusted signing helper, then paste only the resulting Base64 signature into Postman. Never paste the sender's secret key into Postman.

### Deposit

Use **POST** `/api/v2/v2/engine/deposit`, then **Body → raw → JSON**:

```json
{
  "senderPublicKey": "<sender G-address>",
  "tokenAddress": "<PHPC SAC C-address>",
  "offlineDevicePubkeyHex": "<64 hex characters>",
  "amountStroops": "10000000"
}
```

`10000000` stroops equals 1 PHPC when the token has seven decimal places. Sign this exact message (with the actual values, no spaces added):

```text
deposit:<senderPublicKey>:<amountStroops>
```

A successful response contains `xdr`. Have the sender wallet sign and submit that XDR to testnet, then check the sender's vault balance with `get_vault`.

### Withdraw

Use **POST** `/api/v2/v2/engine/withdraw` with JSON fields `senderPublicKey`, `tokenAddress`, and `amountStroops`. Sign:

```text
withdraw:<senderPublicKey>:<amountStroops>
```

Sign and submit the returned XDR with the sender wallet. Attempting to withdraw more than the vault holds should fail during simulation.

### Online transfer

Use **POST** `/api/v2/v2/engine/transfer` with JSON:

```json
{
  "senderPublicKey": "<sender G-address>",
  "recipientPublicKey": "<receiver G-address>",
  "tokenAddress": "<PHPC SAC C-address>",
  "amountStroops": "10000000",
  "paymentMode": "online",
  "clientProtocol": 2
}
```

Sign the exact message:

```text
transfer:v2:online:<tokenAddress>:<senderPublicKey>:<recipientPublicKey>:<amountStroops>
```

The response contains `xdr` and `txHash`. Sign and submit the XDR using the sender wallet, then make **POST** `/api/v2/v2/wallet/transfers/confirm` with:

```json
{"txHash":"<txHash from the transfer response>"}
```

To check the protocol requirement, repeat without `clientProtocol: 2`; expect HTTP 426 and code `ONLINE_TRANSFER_PROTOCOL_REQUIRED`.

For failure checks, try omitting the authorization header (401), using an invalid 64-character device key (400), setting amount to `"0"` (400), or using a token address that has no active PHPC `Token` row (400). Keep the remaining request fields and signature consistent with each test.

## 7. SEP-10 login, offline key, and recipient registry

### Get a JWT

Send **GET** `/api/v2/v2/auth?account=<account G-address>`. The response contains a challenge transaction. Sign that challenge with the matching account wallet. Then send **POST** `/api/v2/v2/auth` with **Body → raw → JSON**:

```json
{"transaction":"<signed challenge XDR>"}
```

Copy the returned JWT. For the next requests, add this header:

```text
Authorization: Bearer <JWT>
```

### Enroll the offline device key

Send **POST** `/api/v2/v2/engine/offline-key` with:

```json
{"offlineDeviceKey":"<device G-address>"}
```

The first call should return `rotation_required` and an `xdr`. Sign and submit that XDR with the account wallet. Then send **PATCH** to the same URL with the same JSON and JWT. Expect `{"status":"synced"}`. A PATCH before submitting the XDR should return 409.

### Register the receiver

Authenticate as the receiver and send **POST** `/api/v2/v2/engine/recipient-registry` with the JWT header and no body. The first call should return `registered`; another call should return `already_registered`. Verify the mapping using the contract's `get_recipient` read method.

## 8. Verify contract state

Use the Stellar CLI contract invoke command from the original guide, replacing placeholders with your contract ID, CLI key name, sender address, and PHPC SAC address. Useful read calls are:

- `get_registrar`: should match the configured registrar public key.
- `get_offline_key --sender <sender G-address>`: empty before enrollment; populated after enrollment.
- `get_recipient`: should map the receiver's short ID to its public key after registry.
- `get_vault --user <sender G-address> --token <PHPC SAC C-address>`: increases after deposit and decreases after withdrawal or settlement.

## 9. Settlement test: use the inbound path

The current mobile app is frontend-only and does not create offline vouchers. A valid voucher must be signed by the enrolled offline device. Its SMS text has six colon-separated fields: token database ID, sender short ID, receiver short ID, Base62-encoded stroops, 32-byte nonce in Base64, and 64-byte signature in Base64. Do not invent or hand-edit a voucher; its signature must match the contract's encoded payment data.

There is an important route distinction in the current backend:

- `POST /api/v2/sms/dispatch` sends an **outbound** SMS through TextBee. It does not enqueue a settlement.
- An incoming TextBee message reaches `POST /api/v2/sms/webhook`; that route validates the signed webhook and voucher, then enqueues the settlement.

For the live settlement run, first make sure the sender deposited PHPC and enrolled the device key, the receiver is registered on-chain, the relayer is funded and whitelisted, and `QUEUE_ENABLED=true` with working `REDIS_URL`. Then send a valid signed voucher through the configured TextBee inbound webhook flow. Check the `engine-settlement` queue and Neon `Settlement` row: it should be saved as `PENDING` with transaction hash and signed XDR before broadcast, then become `SETTLED`. Confirm the sender vault falls by amount plus toll and receiver token balance rises.

Idempotency, expired-voucher, replay, transient-retry, and crash-recovery checks also require a voucher generator/signing helper and a controllable worker/RPC/Redis setup. The current mobile app does not supply that helper, so finish the HTTP and contract checks above first and arrange a trusted test voucher generator before attempting those scenarios.

## 10. Compare legacy and Nest responses

Note: the legacy service serves routes under `/api/...`, while the Nest backend now serves them under `/api/v2/...`. For each route required by the Phase 4 plan, send the same safe request to the legacy service (`https://pijin-api.vercel.app`) and the local Nest service (`http://localhost:3001`). Compare HTTP status and JSON fields. Do not repeat mutating requests against legacy production with real accounts or secrets; use only safe validation/auth checks unless a disposable legacy test environment and explicit test accounts are available.

Record completed live checks in the Phase 4 row of `docs/backend-rebuild/01-nestjs-migration-plan.md` only after the checks actually pass.
