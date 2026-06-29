-- Accounting periods retain the actor and timestamp for controlled closure/reopening.
ALTER TABLE "accounting_periods"
ADD COLUMN "closed_at" TIMESTAMP(3),
ADD COLUMN "closed_by_id" TEXT;
