BEGIN;

CREATE TYPE "SettlementRecoveryReview" AS ENUM ('LEGACY_ENVELOPE_MISSING', 'LEGACY_INTENT_UNVERIFIED');

-- The active relayer already uses this column, but earlier checked-in migrations did not create it.
ALTER TABLE "settlement" ADD COLUMN IF NOT EXISTS "signed_tx_xdr" TEXT;
ALTER TABLE "settlement" ADD COLUMN "recovery_review" "SettlementRecoveryReview";

CREATE TABLE "settlement_attempt" (
    "id" SERIAL NOT NULL,
    "settlement_id" INTEGER NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "signed_tx_xdr" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "receiver_short_id" TEXT NOT NULL,
    "amount_stroops" BIGINT NOT NULL,
    "sender_address" TEXT,
    "receiver_address" TEXT,
    "gateway_address" TEXT,
    "token_contract_id" TEXT,
    "contract_id" TEXT,
    "network_id" TEXT,
    "protocol_toll" BIGINT,
    "source_sequence" BIGINT,
    "min_time" BIGINT,
    "max_time" BIGINT,
    "min_ledger" BIGINT,
    "max_ledger" BIGINT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_attempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "settlement_attempt_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "settlement_attempt_settlement_id_tx_hash_key" ON "settlement_attempt"("settlement_id", "tx_hash");
CREATE INDEX "settlement_status_id_idx" ON "settlement"("status", "id");

-- Preserve envelope evidence and the original settlement identifiers. Today's registry cannot prove the old recipient.
INSERT INTO "settlement_attempt" ("settlement_id", "tx_hash", "signed_tx_xdr", "nonce", "receiver_short_id", "amount_stroops", "gateway_address")
SELECT "id", "tx_hash", "signed_tx_xdr", "nonce", "receiver_short_id", "amount_stroops", "relayer_address"
FROM "settlement"
WHERE "status" = 'PENDING' AND NULLIF("tx_hash", '') IS NOT NULL AND NULLIF("signed_tx_xdr", '') IS NOT NULL;

UPDATE "settlement"
SET "recovery_review" = CASE
    WHEN NULLIF("tx_hash", '') IS NULL OR NULLIF("signed_tx_xdr", '') IS NULL
    THEN 'LEGACY_ENVELOPE_MISSING'::"SettlementRecoveryReview"
    ELSE 'LEGACY_INTENT_UNVERIFIED'::"SettlementRecoveryReview"
END
WHERE "status" = 'PENDING';

COMMIT;
