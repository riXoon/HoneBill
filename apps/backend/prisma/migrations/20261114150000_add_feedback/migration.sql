-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('PAYMENT', 'ACCOUNT', 'BUG', 'SUGGESTION');

-- CreateTable
CREATE TABLE "feedback" (
    "id" SERIAL NOT NULL,
    "client_id" TEXT NOT NULL,
    "category" "FeedbackCategory" NOT NULL,
    "message" TEXT NOT NULL,
    "short_id" TEXT,
    "context" JSONB,
    "forwarded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feedback_client_id_key" ON "feedback"("client_id");

-- CreateIndex
CREATE INDEX "feedback_created_at_idx" ON "feedback"("created_at");
