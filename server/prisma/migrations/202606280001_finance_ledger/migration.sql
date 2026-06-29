-- CreateEnum
CREATE TYPE "FeeScheduleKind" AS ENUM ('STANDARD', 'SUPPLEMENTAL');

-- CreateEnum
CREATE TYPE "FeeScheduleStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "FeeApplicability" AS ENUM ('MANDATORY', 'OPTIONAL');

-- CreateEnum
CREATE TYPE "ChargeAdjustmentType" AS ENUM ('DISCOUNT', 'WAIVER', 'CHARGE_CREDIT', 'CHARGE_DEBIT');

-- CreateEnum
CREATE TYPE "FinanceDecisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FeePaymentMethod" AS ENUM ('CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CARD');

-- CreateEnum
CREATE TYPE "FeePaymentStatus" AS ENUM ('POSTED', 'REVERSAL_PENDING', 'REVERSED');

-- CreateEnum
CREATE TYPE "CreditLotStatus" AS ENUM ('ACTIVE', 'REVERSED');

-- AlterTable
ALTER TABLE "student_enrolments" ADD COLUMN     "fee_effective_term_id" TEXT;

-- CreateTable
CREATE TABLE "fee_items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_schedules" (
    "id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "grade_level_id" TEXT NOT NULL,
    "kind" "FeeScheduleKind" NOT NULL DEFAULT 'STANDARD',
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "status" "FeeScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_by_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "published_by_id" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_schedule_lines" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "fee_item_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "applicability" "FeeApplicability" NOT NULL DEFAULT 'MANDATORY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_schedule_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "optional_fee_assignments" (
    "id" TEXT NOT NULL,
    "enrolment_id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "assigned_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "optional_fee_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_charges" (
    "id" TEXT NOT NULL,
    "enrolment_id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charge_adjustments" (
    "id" TEXT NOT NULL,
    "charge_id" TEXT NOT NULL,
    "type" "ChargeAdjustmentType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "FinanceDecisionStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by_id" TEXT,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charge_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_payments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "FeePaymentMethod" NOT NULL,
    "status" "FeePaymentStatus" NOT NULL DEFAULT 'POSTED',
    "transaction_ref" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "recorded_by_id" TEXT,
    "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "charge_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reversed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_credit_lots" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "CreditLotStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_credit_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_allocations" (
    "id" TEXT NOT NULL,
    "credit_lot_id" TEXT NOT NULL,
    "charge_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "allocated_by_id" TEXT,
    "reversed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_reversals" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "FinanceDecisionStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by_id" TEXT,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_reversals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_receipts" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "pdf_path" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_sequences" (
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "finance_audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fee_items_code_key" ON "fee_items"("code");

-- CreateIndex
CREATE INDEX "fee_schedules_status_academic_year_id_term_id_idx" ON "fee_schedules"("status", "academic_year_id", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_schedules_academic_year_id_term_id_grade_level_id_kind__key" ON "fee_schedules"("academic_year_id", "term_id", "grade_level_id", "kind", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "fee_schedule_lines_schedule_id_fee_item_id_key" ON "fee_schedule_lines"("schedule_id", "fee_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "optional_fee_assignments_enrolment_id_line_id_key" ON "optional_fee_assignments"("enrolment_id", "line_id");

-- CreateIndex
CREATE INDEX "student_charges_enrolment_id_due_date_idx" ON "student_charges"("enrolment_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "student_charges_enrolment_id_line_id_key" ON "student_charges"("enrolment_id", "line_id");

-- CreateIndex
CREATE INDEX "charge_adjustments_status_charge_id_idx" ON "charge_adjustments"("status", "charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_payments_idempotency_key_key" ON "fee_payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "fee_payments_student_id_posted_at_idx" ON "fee_payments"("student_id", "posted_at");

-- CreateIndex
CREATE INDEX "fee_payments_method_transaction_ref_idx" ON "fee_payments"("method", "transaction_ref");

-- CreateIndex
CREATE INDEX "payment_allocations_charge_id_reversed_at_idx" ON "payment_allocations"("charge_id", "reversed_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_charge_id_key" ON "payment_allocations"("payment_id", "charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_credit_lots_payment_id_key" ON "student_credit_lots"("payment_id");

-- CreateIndex
CREATE INDEX "student_credit_lots_student_id_status_idx" ON "student_credit_lots"("student_id", "status");

-- CreateIndex
CREATE INDEX "credit_allocations_credit_lot_id_reversed_at_idx" ON "credit_allocations"("credit_lot_id", "reversed_at");

-- CreateIndex
CREATE INDEX "credit_allocations_charge_id_reversed_at_idx" ON "credit_allocations"("charge_id", "reversed_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reversals_payment_id_key" ON "payment_reversals"("payment_id");

-- CreateIndex
CREATE INDEX "payment_reversals_status_idx" ON "payment_reversals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "fee_receipts_payment_id_key" ON "fee_receipts"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_receipts_number_key" ON "fee_receipts"("number");

-- CreateIndex
CREATE INDEX "fee_receipts_issued_at_idx" ON "fee_receipts"("issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "fee_receipts_year_sequence_key" ON "fee_receipts"("year", "sequence");

-- CreateIndex
CREATE INDEX "finance_audit_logs_entity_type_entity_id_idx" ON "finance_audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "finance_audit_logs_created_at_idx" ON "finance_audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "student_enrolments" ADD CONSTRAINT "student_enrolments_fee_effective_term_id_fkey" FOREIGN KEY ("fee_effective_term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_schedule_lines" ADD CONSTRAINT "fee_schedule_lines_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "fee_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_schedule_lines" ADD CONSTRAINT "fee_schedule_lines_fee_item_id_fkey" FOREIGN KEY ("fee_item_id") REFERENCES "fee_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optional_fee_assignments" ADD CONSTRAINT "optional_fee_assignments_enrolment_id_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "student_enrolments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optional_fee_assignments" ADD CONSTRAINT "optional_fee_assignments_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "fee_schedule_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optional_fee_assignments" ADD CONSTRAINT "optional_fee_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_charges" ADD CONSTRAINT "student_charges_enrolment_id_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "student_enrolments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_charges" ADD CONSTRAINT "student_charges_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "fee_schedule_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_adjustments" ADD CONSTRAINT "charge_adjustments_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "student_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_adjustments" ADD CONSTRAINT "charge_adjustments_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_adjustments" ADD CONSTRAINT "charge_adjustments_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "fee_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "student_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_credit_lots" ADD CONSTRAINT "student_credit_lots_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_credit_lots" ADD CONSTRAINT "student_credit_lots_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "fee_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_allocations" ADD CONSTRAINT "credit_allocations_credit_lot_id_fkey" FOREIGN KEY ("credit_lot_id") REFERENCES "student_credit_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_allocations" ADD CONSTRAINT "credit_allocations_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "student_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_allocations" ADD CONSTRAINT "credit_allocations_allocated_by_id_fkey" FOREIGN KEY ("allocated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "fee_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_receipts" ADD CONSTRAINT "fee_receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "fee_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_audit_logs" ADD CONSTRAINT "finance_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill existing enrolments to their academic year's first configured term.
UPDATE "student_enrolments" AS enrolment
SET "fee_effective_term_id" = first_term."id"
FROM (
  SELECT DISTINCT ON ("academic_year_id") "id", "academic_year_id"
  FROM "terms"
  ORDER BY "academic_year_id", "sequence" ASC
) AS first_term
WHERE enrolment."academic_year_id" = first_term."academic_year_id"
  AND enrolment."fee_effective_term_id" IS NULL;

-- Synchronize the new finance permissions for built-in roles.
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT "id", permission
FROM "roles"
CROSS JOIN (VALUES
  ('fees.publish'), ('fees.adjust'), ('fees.adjust.approve'),
  ('credits.allocate'), ('payments.reverse'), ('payments.reverse.approve')
) AS permissions(permission)
WHERE "slug" IN ('super-admin', 'school-admin')
ON CONFLICT DO NOTHING;

-- Monetary invariants and duplicate external-payment protection.
ALTER TABLE "fee_schedule_lines" ADD CONSTRAINT "fee_schedule_lines_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "student_charges" ADD CONSTRAINT "student_charges_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "charge_adjustments" ADD CONSTRAINT "charge_adjustments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "student_credit_lots" ADD CONSTRAINT "student_credit_lots_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "credit_allocations" ADD CONSTRAINT "credit_allocations_amount_positive" CHECK ("amount" > 0);
CREATE UNIQUE INDEX "fee_payments_method_transaction_ref_key"
ON "fee_payments" ("method", "transaction_ref")
WHERE "transaction_ref" IS NOT NULL;

INSERT INTO "role_permissions" ("role_id", "permission")
SELECT "id", permission
FROM "roles"
CROSS JOIN (VALUES ('fees.adjust'), ('credits.allocate'), ('payments.reverse')) AS permissions(permission)
WHERE "slug" = 'bursar'
ON CONFLICT DO NOTHING;
