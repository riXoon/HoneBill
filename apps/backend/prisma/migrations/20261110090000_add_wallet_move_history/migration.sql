-- CreateEnum
CREATE TYPE "MoveDirection" AS ENUM ('TO_OFFLINE', 'TO_ONLINE');

-- CreateTable
CREATE TABLE "wallet_move" (
    "id" TEXT NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "account_public_key" TEXT NOT NULL,
    "direction" "MoveDirection" NOT NULL,
    "token_id" INTEGER NOT NULL,
    "amount_stroops" BIGINT NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "wallet_move_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_move_tx_hash_key" ON "wallet_move"("tx_hash");

-- CreateIndex
CREATE INDEX "wallet_move_account_public_key_created_at_idx"
ON "wallet_move"("account_public_key", "created_at");

-- AddForeignKey
ALTER TABLE "wallet_move"
ADD CONSTRAINT "wallet_move_token_id_fkey"
FOREIGN KEY ("token_id") REFERENCES "token"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
