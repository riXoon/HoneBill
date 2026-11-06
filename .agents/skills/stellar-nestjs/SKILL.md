---
name: stellar-nestjs
description: Build and debug Stellar integrations in HoneBill's NestJS backend, including Horizon and Soroban access, wallet and settlement flows, transaction verification, and Rust contract/API coordination.
metadata:
  short-description: Stellar and NestJS integration for HoneBill
---

# Stellar + NestJS (HoneBill)

Use this skill when a change crosses `apps/backend` and Stellar, or when implementing Stellar-facing backend features. For backend-only conventions, also consult [NestJS guidance](../nestjs/SKILL.md). For contract implementation, testing, or review, consult the relevant [Soroban contract guidance](../smart-contracts/SKILL.md) and its linked references.

## Repository map

- The NestJS API is under `apps/backend/src`. Feature code belongs in `src/modules/<feature>/`; shared chain access is in `src/infra/stellar/`.
- `StellarService` configures Horizon from `STELLAR_HORIZON_URL`, Soroban RPC from `SOROBAN_RPC_URL`, network identity from `STELLAR_NETWORK_PASSPHRASE`, and a lazily created `pijin_core` client from `CONTRACT_ID`. Inject the service through `StellarModule`; do not create ad hoc servers in feature services.
- Soroban contract source and tests are in `contracts/`. Check `Cargo.toml`, the lockfile, and generated/client package before relying on SDK or interface details. The checked-in contract currently uses `soroban-sdk` 22; do not copy examples for a different major without verifying compatibility.
- Wallet and settlement features join chain state with Prisma records. Keep persisted transaction state consistent with verified chain outcomes.

## Implementing backend chain flows

- Keep HTTP parsing, DTO validation, status codes, and response shapes in Nest controllers; keep business decisions in injected services. Preserve the global `/api` prefix and strict validation behavior described in the NestJS skill.
- Reuse the shared `StellarService` for network clients and contract access. Keep network URLs, passphrases, and identifiers in validated configuration; never log secrets or private signing material.
- Use Horizon for classic account and payment data, and Soroban RPC for contract simulation/submission and contract transaction or ledger status. Check the operation type and existing flow before selecting an API.
- Treat submitted transactions as pending until network status is definitive. Handle Soroban `PENDING`, `SUCCESS`, `FAILED`, and `NOT_FOUND` deliberately; do not mark a payment or settlement complete from a client-provided hash alone. Preserve idempotency and existing reconciliation behavior.
- Keep amounts and large contract integers in exact decimal or integer representations. Avoid JavaScript `number` for values that can exceed safe integer precision; follow existing string/`bigint` conversions and the contract's units.
- For signed offline operations, preserve byte-level agreement with the Rust contract: inspect existing XDR helpers and parity tests before changing field order, domain separation, integer encoding, network or contract binding, nonce handling, or signature verification.
- Do not submit live transactions, sign with production credentials, or mutate external chain state as part of ordinary implementation or verification. Use mocks, local contract tests, or validation-only requests unless the user explicitly asks for a live operation.

## Cross-layer changes

When an API flow depends on contract behavior, trace it across controller, service, `StellarService`/transaction manager, generated client or XDR utility, Rust entrypoint, and relevant tests. Keep contract method names, argument types, token units, error semantics, and transaction status handling aligned. Avoid duplicating contract rules in the API when a result can be checked against authoritative on-chain state.

For contract storage, authorization, TTL, and upgrade rules, read `../smart-contracts/development.md`. For unit and integration test patterns, read `../smart-contracts/testing.md`. For requested security reviews, read `../smart-contracts/security.md`.

## Verification

Choose checks based on the files changed and the user's request:

- Backend type/build checks run from `apps/backend` (`npm run typecheck`, `npm run build`). Wallet/settlement coverage is available through `npm run test:phase3`.
- Contract tests/build run from `contracts` using the repository's Cargo setup and `stellar contract build`; check local tooling and target availability first.
- For cross-layer serialization or behavior changes, run the focused parity tests on both sides where available. Report unavailable services or toolchains; do not substitute a live chain transaction for a test.

Do not run checks unless the user asks for verification or the task's instructions require it.
