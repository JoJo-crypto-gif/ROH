-- Finance list and aggregate query support. Additive only; existing ledger data is preserved.
CREATE INDEX "fee_payments_status_posted_at_idx"
  ON "fee_payments"("status", "posted_at");

CREATE INDEX "fee_payments_method_posted_at_idx"
  ON "fee_payments"("method", "posted_at");
