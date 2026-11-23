ALTER TYPE "SettlementRecoveryReview" ADD VALUE 'MISSING_INTENT';
ALTER TYPE "SettlementRecoveryReview" ADD VALUE 'EVIDENCE_MISMATCH';

CREATE TYPE "SettlementAttemptOutcome" AS ENUM ('ENVELOPE_EXPIRED', 'FAILED');

ALTER TABLE "settlement" ADD COLUMN "confirmed_ledger" BIGINT,
    ADD COLUMN "recovery_lease" TEXT,
    ADD COLUMN "recovery_lease_until" TIMESTAMP(3),
    ADD COLUMN "next_reconcile_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "relay_receipt_phone" TEXT;

CREATE INDEX "settlement_status_recovery_review_next_reconcile_at_id_idx"
    ON "settlement"("status", "recovery_review", "next_reconcile_at", "id");

ALTER TABLE "settlement_attempt" ADD COLUMN "outcome" "SettlementAttemptOutcome",
    ADD COLUMN "outcome_ledger" BIGINT;

CREATE TABLE "settlement_receipt_claim" (
    "key" TEXT NOT NULL,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "settlement_receipt_claim_pkey" PRIMARY KEY ("key")
);
