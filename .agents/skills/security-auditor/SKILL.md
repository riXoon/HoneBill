---
name: security-auditor
description: Perform defensive security audits and real-funds release reviews for HoneBill. Use for repository-wide audits, focused reviews of payment or custody changes, and verification of security fixes.
---

# HoneBill security auditor

Determine which controls protect customer funds and data, what the available evidence demonstrates, and what must be resolved before accepting real funds. Review only the requested scope. For a full audit or real-funds release review, cover all three references.

- [Funds and Stellar](references/funds-and-stellar.md) covers custody, transaction authorization, accounting, offline vouchers, settlement, and Soroban.
- [Application and data](references/application-and-data.md) covers backend and mobile identity, API and provider boundaries, storage, privacy, and abuse controls.
- [Deployment and operations](references/deployment-and-operations.md) covers privileges, configuration, releases, dependencies, monitoring, incident response, and recovery.

## Scope and evidence

1. Record the revision, relevant working tree changes, target environment, available evidence, and access limits. Discover entry points from runtime, build, and deployment wiring. Check `apps/backend`, `apps/mobile`, `contracts`, and `packages/pijin_core` when available and in scope. Treat `apps/_legacy/backend` and `apps/mobile/src/_legacy` as historical references while verifying they are excluded from current imports, builds, routing, and deployments. Verify live decommissioning separately when evidence is available.
2. Map the components and principals that can move funds, change transaction intent, change balances or status, recover accounts, rotate keys, or deploy code. Trace each in-scope flow across boundaries to its authoritative record and reconciliation path. Include direct chain submissions, callbacks, scheduled jobs, operators, and third parties where applicable. Identify which failures can affect multiple accounts or disable recovery.
3. Review source, configuration definitions, migrations, tests, and authorized read-only evidence. Inspect test commands and setup before running them. Use existing non-mutating local checks with mocks or fixtures and no live credentials. Record what was run, what was inspected, and any unavailable or inconclusive evidence. Keep credentials, key material, customer data, raw signed transactions, and voucher payloads out of output and reports. Work from sanitized evidence or filenames and secret identifiers. Keep validation defensive through code review and safe local checks. Exclude exploit development, vulnerability reproduction, and offensive automation. A review alone grants no authority to change application code, cloud settings, data, permissions, or chain state.
4. Cover each applicable domain in a compact table with status **Verified**, **Finding**, **Partial**, **Unverified**, or **Not applicable**. Give materially different controls their own rows. State the evidence and its limits or the basis for exclusion. A unit test can verify a local property. Production controls need evidence that applies to the target release and environment. Update the map as new paths emerge.

## Report and release decision

Lead with the highest-impact findings. For each, record severity, confidence, affected environment, source locations or sanitized evidence, the failing control, impact and prerequisites, recommended remediation, and a safe verification criterion. Distinguish confirmed findings from hypotheses and evidence gaps. Assess confidence in deployed exposure separately from confidence in source behavior. Use Critical for credible systemic fund loss or signing/upgrade compromise, High for material fund loss or account compromise with a narrower scope, Medium for bounded harm or a weakened control, and Low for limited exposure. Explain severity using fund exposure, reach, reversibility, and recovery.

For a real-funds decision, state **Block**, **Insufficient evidence**, or **Ready within reviewed scope**. Block on a confirmed unresolved Critical or High finding or a confirmed failure of a funds-critical control. Return insufficient evidence when custody, authorization, accounting, deployment identity, or operational recovery remains materially unverified and no confirmed blocker already determines the result. Give the evidence needed to clear each blocker or gap. Include residual risk and identify any release, provider, or operational evidence that needs independent review. For focused audits, report the local conclusion and its limits without implying whole-application readiness.
