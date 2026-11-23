CREATE TABLE "settlement_spend_event" (
    "network_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "ledger" BIGINT NOT NULL,
    "nonce" TEXT NOT NULL,
    "sender_address" TEXT NOT NULL,
    "receiver_address" TEXT NOT NULL,
    "receiver_short_id" TEXT NOT NULL,
    "gateway_address" TEXT NOT NULL,
    "token_contract_id" TEXT NOT NULL,
    "amount_stroops" TEXT NOT NULL,
    "protocol_toll" TEXT NOT NULL,

    CONSTRAINT "settlement_spend_event_pkey" PRIMARY KEY ("network_id", "contract_id", "event_id")
);

CREATE INDEX "settlement_spend_event_network_id_contract_id_nonce_idx" ON "settlement_spend_event"("network_id", "contract_id", "nonce");

CREATE TABLE "settlement_event_cursor" (
    "network_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "cursor" TEXT,

    CONSTRAINT "settlement_event_cursor_pkey" PRIMARY KEY ("network_id", "contract_id")
);
