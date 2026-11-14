-- AlterTable: when the MPIN was last reset through "Forgot MPIN", to pause email changes for 24 hours afterwards.
ALTER TABLE "account" ADD COLUMN "pin_reset_at" TIMESTAMP(3);
