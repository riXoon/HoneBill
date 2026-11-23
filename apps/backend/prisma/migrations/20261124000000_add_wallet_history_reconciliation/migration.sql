ALTER TABLE "wallet_move" ADD COLUMN "confirmed_ledger" BIGINT;
ALTER TABLE "online_transfer" ADD COLUMN "confirmed_ledger" BIGINT;

CREATE TABLE "wallet_history_cursor" (
    "scope" TEXT NOT NULL,
    "cursor" TEXT NOT NULL,
    CONSTRAINT "wallet_history_cursor_pkey" PRIMARY KEY ("scope")
);
