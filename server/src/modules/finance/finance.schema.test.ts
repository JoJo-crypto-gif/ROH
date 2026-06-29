import assert from "node:assert/strict";
import test from "node:test";
import {
  creditAllocationSchema,
  paymentSchema,
  scheduleSchema,
} from "./finance.schema.js";

test("non-cash payments require a transaction reference", () => {
  const result = paymentSchema.safeParse({
    studentId: "student-1",
    amount: 100,
    method: "MOBILE_MONEY",
    idempotencyKey: "payment-key-1",
    allocations: [],
  });
  assert.equal(result.success, false);
});

test("payment and credit allocations reject duplicate charges", () => {
  const duplicate = [
    { chargeId: "charge-1", amount: 20 },
    { chargeId: "charge-1", amount: 10 },
  ];
  assert.equal(
    paymentSchema.safeParse({
      studentId: "student-1",
      amount: 30,
      method: "CASH",
      idempotencyKey: "payment-key-2",
      allocations: duplicate,
    }).success,
    false,
  );
  assert.equal(
    creditAllocationSchema.safeParse({ allocations: duplicate }).success,
    false,
  );
});

test("fee schedules default to standard mandatory lines", () => {
  const result = scheduleSchema.parse({
    academicYearId: "year-1",
    termId: "term-1",
    gradeLevelId: "grade-1",
    name: "Term fees",
    lines: [{ feeItemId: "item-1", amount: 250, dueDate: "2026-09-01" }],
  });
  assert.equal(result.kind, "STANDARD");
  assert.equal(result.lines[0].applicability, "MANDATORY");
});
