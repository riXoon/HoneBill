-- AlterTable: when the MPIN / email was last changed, for the 24-hour change cooldown.
ALTER TABLE "account" ADD COLUMN "pin_changed_at" TIMESTAMP(3);
ALTER TABLE "account" ADD COLUMN "email_changed_at" TIMESTAMP(3);

-- CreateIndex: the "email already in use" check looks accounts up by email.
CREATE INDEX "account_email_idx" ON "account"("email");
