-- CreateEnum
CREATE TYPE "AccountingBookDomain" AS ENUM ('SCHOOL', 'NGO');

-- CreateEnum
CREATE TYPE "AccountingBookStatus" AS ENUM ('SETUP', 'ACTIVE');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "AccountSystemKey" AS ENUM ('ACCOUNTS_RECEIVABLE', 'STUDENT_CREDITS', 'DEFERRED_FEE_INCOME', 'ACCOUNTS_PAYABLE', 'FEE_WAIVERS', 'OPENING_EQUITY', 'CASH_OVER_SHORT');

-- CreateEnum
CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "JournalSource" AS ENUM ('MANUAL', 'OPENING', 'FEE_CHARGE', 'FEE_PAYMENT', 'CREDIT_ALLOCATION', 'FEE_ADJUSTMENT', 'PAYMENT_REVERSAL', 'TERM_RECOGNITION', 'EXPENSE_APPROVAL', 'EXPENSE_PAYMENT', 'EXPENSE_REVERSAL', 'CASH_COUNT', 'RECONCILIATION');

-- CreateEnum
CREATE TYPE "MoneyAccountType" AS ENUM ('CASH', 'BANK', 'MOBILE_MONEY', 'CARD_CLEARING');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PARTIALLY_PAID', 'PAID', 'REVERSED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED');

-- AlterTable
ALTER TABLE "fee_payments" ADD COLUMN     "money_account_id" TEXT;

-- CreateTable
CREATE TABLE "accounting_books" (
    "id" TEXT NOT NULL,
    "domain" "AccountingBookDomain" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AccountingBookStatus" NOT NULL DEFAULT 'SETUP',
    "cutover_at" TIMESTAMP(3),
    "activated_by_id" TEXT,
    "activated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_fiscal_years" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_periods" (
    "id" TEXT NOT NULL,
    "fiscal_year_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "system_key" "AccountSystemKey",
    "parent_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_accounts" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MoneyAccountType" NOT NULL,
    "institution" TEXT,
    "account_number" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "money_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_method_accounts" (
    "book_id" TEXT NOT NULL,
    "method" "FeePaymentMethod" NOT NULL,
    "money_account_id" TEXT NOT NULL,

    CONSTRAINT "payment_method_accounts_pkey" PRIMARY KEY ("book_id","method")
);

-- CreateTable
CREATE TABLE "fee_account_mappings" (
    "book_id" TEXT NOT NULL,
    "fee_item_id" TEXT NOT NULL,
    "income_account_id" TEXT NOT NULL,

    CONSTRAINT "fee_account_mappings_pkey" PRIMARY KEY ("book_id","fee_item_id")
);

-- CreateTable
CREATE TABLE "journal_sequences" (
    "fiscal_year_id" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_sequences_pkey" PRIMARY KEY ("fiscal_year_id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "fiscal_year_id" TEXT NOT NULL,
    "period_id" TEXT,
    "number" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "JournalSource" NOT NULL DEFAULT 'MANUAL',
    "source_key" TEXT,
    "metadata" JSONB,
    "prepared_by_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "posted_at" TIMESTAMP(3),
    "reversal_of_id" TEXT,
    "reversed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "journal_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "description" TEXT,
    "debit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "student_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_source_links" (
    "id" TEXT NOT NULL,
    "journal_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,

    CONSTRAINT "accounting_source_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_sequences" (
    "fiscal_year_id" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_sequences_pkey" PRIMARY KEY ("fiscal_year_id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "fiscal_year_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "reference" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "total" DECIMAL(12,2) NOT NULL,
    "missing_document_reason" TEXT,
    "created_by_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_by_id" TEXT,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "approval_journal_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_lines" (
    "id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_attachments" (
    "id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_payments" (
    "id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "money_account_id" TEXT NOT NULL,
    "journal_entry_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "transaction_ref" TEXT,
    "reversed_at" TIMESTAMP(3),
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_imports" (
    "id" TEXT NOT NULL,
    "money_account_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "imported_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statement_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_lines" (
    "id" TEXT NOT NULL,
    "import_id" TEXT,
    "money_account_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_matches" (
    "id" TEXT NOT NULL,
    "statement_line_id" TEXT NOT NULL,
    "journal_line_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "matched_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_counts" (
    "id" TEXT NOT NULL,
    "money_account_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "expected" DECIMAL(12,2) NOT NULL,
    "counted" DECIMAL(12,2) NOT NULL,
    "difference" DECIMAL(12,2) NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "counted_by_id" TEXT,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "journal_entry_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounting_books_domain_key" ON "accounting_books"("domain");

-- CreateIndex
CREATE INDEX "accounting_fiscal_years_status_start_date_end_date_idx" ON "accounting_fiscal_years"("status", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_fiscal_years_book_id_academic_year_id_key" ON "accounting_fiscal_years"("book_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "accounting_periods_fiscal_year_id_status_idx" ON "accounting_periods"("fiscal_year_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_periods_fiscal_year_id_sequence_key" ON "accounting_periods"("fiscal_year_id", "sequence");

-- CreateIndex
CREATE INDEX "accounts_book_id_type_active_idx" ON "accounts"("book_id", "type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_book_id_code_key" ON "accounts"("book_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_book_id_system_key_key" ON "accounts"("book_id", "system_key");

-- CreateIndex
CREATE UNIQUE INDEX "money_accounts_account_id_key" ON "money_accounts"("account_id");

-- CreateIndex
CREATE INDEX "money_accounts_type_active_idx" ON "money_accounts"("type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_number_key" ON "journal_entries"("number");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_source_key_key" ON "journal_entries"("source_key");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reversal_of_id_key" ON "journal_entries"("reversal_of_id");

-- CreateIndex
CREATE INDEX "journal_entries_fiscal_year_id_date_status_idx" ON "journal_entries"("fiscal_year_id", "date", "status");

-- CreateIndex
CREATE INDEX "journal_entries_source_posted_at_idx" ON "journal_entries"("source", "posted_at");

-- CreateIndex
CREATE INDEX "journal_lines_account_id_journal_id_idx" ON "journal_lines"("account_id", "journal_id");

-- CreateIndex
CREATE INDEX "journal_lines_student_id_idx" ON "journal_lines"("student_id");

-- CreateIndex
CREATE INDEX "accounting_source_links_entity_type_entity_id_idx" ON "accounting_source_links"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_source_links_journal_id_entity_type_entity_id_key" ON "accounting_source_links"("journal_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_number_key" ON "expenses"("number");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_approval_journal_id_key" ON "expenses"("approval_journal_id");

-- CreateIndex
CREATE INDEX "expenses_fiscal_year_id_status_date_idx" ON "expenses"("fiscal_year_id", "status", "date");

-- CreateIndex
CREATE INDEX "expense_lines_account_id_idx" ON "expense_lines"("account_id");

-- CreateIndex
CREATE INDEX "expense_payments_expense_id_reversed_at_idx" ON "expense_payments"("expense_id", "reversed_at");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_imports_money_account_id_checksum_key" ON "bank_statement_imports"("money_account_id", "checksum");

-- CreateIndex
CREATE INDEX "bank_statement_lines_money_account_id_date_idx" ON "bank_statement_lines"("money_account_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_money_account_id_fingerprint_key" ON "bank_statement_lines"("money_account_id", "fingerprint");

-- CreateIndex
CREATE INDEX "reconciliation_matches_journal_line_id_idx" ON "reconciliation_matches"("journal_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_matches_statement_line_id_journal_line_id_key" ON "reconciliation_matches"("statement_line_id", "journal_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_counts_journal_entry_id_key" ON "cash_counts"("journal_entry_id");

-- CreateIndex
CREATE INDEX "cash_counts_money_account_id_date_idx" ON "cash_counts"("money_account_id", "date");

-- CreateIndex
CREATE INDEX "accounting_audit_logs_entity_type_entity_id_idx" ON "accounting_audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "accounting_audit_logs_created_at_idx" ON "accounting_audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_money_account_id_fkey" FOREIGN KEY ("money_account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_fiscal_years" ADD CONSTRAINT "accounting_fiscal_years_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "accounting_books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_fiscal_years" ADD CONSTRAINT "accounting_fiscal_years_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "accounting_fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "accounting_books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_accounts" ADD CONSTRAINT "money_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_method_accounts" ADD CONSTRAINT "payment_method_accounts_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "accounting_books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_method_accounts" ADD CONSTRAINT "payment_method_accounts_money_account_id_fkey" FOREIGN KEY ("money_account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_account_mappings" ADD CONSTRAINT "fee_account_mappings_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "accounting_books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_account_mappings" ADD CONSTRAINT "fee_account_mappings_fee_item_id_fkey" FOREIGN KEY ("fee_item_id") REFERENCES "fee_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_account_mappings" ADD CONSTRAINT "fee_account_mappings_income_account_id_fkey" FOREIGN KEY ("income_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_sequences" ADD CONSTRAINT "journal_sequences_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "accounting_fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "accounting_fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_source_links" ADD CONSTRAINT "accounting_source_links_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_sequences" ADD CONSTRAINT "expense_sequences_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "accounting_fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "accounting_fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approval_journal_id_fkey" FOREIGN KEY ("approval_journal_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_attachments" ADD CONSTRAINT "expense_attachments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_money_account_id_fkey" FOREIGN KEY ("money_account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_money_account_id_fkey" FOREIGN KEY ("money_account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "bank_statement_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_money_account_id_fkey" FOREIGN KEY ("money_account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_statement_line_id_fkey" FOREIGN KEY ("statement_line_id") REFERENCES "bank_statement_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_journal_line_id_fkey" FOREIGN KEY ("journal_line_id") REFERENCES "journal_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_counts" ADD CONSTRAINT "cash_counts_money_account_id_fkey" FOREIGN KEY ("money_account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_counts" ADD CONSTRAINT "cash_counts_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extend built-in roles without replacing existing custom permission assignments.
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", p."permission"
FROM "roles" r
CROSS JOIN (VALUES
  ('accounting.view'), ('accounting.setup'), ('accounting.periods.manage'),
  ('journals.create'), ('journals.approve'), ('journals.reverse'),
  ('expenses.view'), ('expenses.create'), ('expenses.approve'), ('expenses.pay'), ('expenses.reverse'),
  ('reconciliation.view'), ('reconciliation.manage'), ('reconciliation.approve'),
  ('accounting.reports.view')
) AS p("permission")
WHERE r."slug" IN ('super-admin', 'school-admin')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", p."permission"
FROM "roles" r
CROSS JOIN (VALUES
  ('accounting.view'), ('journals.create'),
  ('expenses.view'), ('expenses.create'), ('expenses.pay'),
  ('reconciliation.view'), ('reconciliation.manage'),
  ('accounting.reports.view')
) AS p("permission")
WHERE r."slug" = 'bursar'
ON CONFLICT DO NOTHING;
