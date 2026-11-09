---
name: pijin-rust
description: Develop or debug Rust code in HoneBill's Soroban contract crate, including vault, offline payment, authorization, storage, and contract API changes. Use the existing smart-contracts skill for deeper Stellar-specific patterns or security reviews; this skill is not for ordinary NestJS or frontend work.
metadata:
  short-description: Rust contracts for HoneBill
---

# HoneBill Rust Contracts

Use this skill for Rust changes in `contracts/`. The crate implements the Pijin Soroban contract; application and chain-client code lives elsewhere.

## Project facts

- Workspace: `contracts/`; crate `pijin-contract`, Rust edition 2021.
- `contracts/src/lib.rs` is `#![no_std]` and currently depends on `soroban-sdk` 22. Keep `Cargo.toml`, `Cargo.lock`, SDK APIs, and protocol assumptions aligned. Do not copy examples using another SDK major without checking compatibility.
- The contract is an offline vault, not a generic fungible-token contract. Its persistent vault balance is keyed by `(user, token)`; underlying assets move through the Soroban token interface.
- Public operations include `deposit`, `withdraw`, `spend_offline`, offline-key and recipient registry management, gateway management, and vault reads. There is no public vault `transfer` method. Do not add or assume one when a caller intends a direct token transfer.
- A direct wallet-to-wallet token transfer targets the asset's Stellar Asset Contract (SAC). Vault deposit/withdraw and offline settlement target the Pijin contract and may call the token contract internally. Keep these addresses and responsibilities distinct across Rust, NestJS, generated clients, and configuration.

## Change guidance

- Read the affected entry point and its tests before changing behavior. Trace cross-layer behavior into `apps/backend/src/modules/engine/`, `packages/pijin_core/`, or mobile code when the public contract ABI or authorization tree is involved.
- Treat contract entry-point names, argument order/types, error numbers, events, storage keys, and auth trees as externally consumed interfaces. Keep them compatible or explicitly account for the migration and generated binding impact.
- Preserve the vault invariants: users authorize debits with `require_auth`; `spend_offline` validates the gateway, recipient registration, registered device key, signed payload and replay nonce; token amounts use `i128` base units; persistent entries need TTL extension.
- Keep state in Soroban storage, use SDK types and host APIs, and avoid standard-library or network/I/O assumptions in contract code.
- Treat contract deployment, upgrade, and live transaction submission as external chain mutations. Do not perform them as part of routine code changes unless the user explicitly requests that operation.

## Useful commands and references

Run contract commands from `contracts/`:

```sh
cargo fmt --all
cargo test
stellar contract build
```

Choose only the checks needed for the requested work. For detailed Soroban storage, auth, TTL, and cross-contract-call patterns, read [the smart-contracts development guide](../smart-contracts/development.md). For contract testing guidance, read [the testing guide](../smart-contracts/testing.md). For a requested security review, read [the security guide](../smart-contracts/security.md).
