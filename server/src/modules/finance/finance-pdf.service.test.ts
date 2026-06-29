import assert from "node:assert/strict";
import test from "node:test";
import { generateFinancePdf } from "./finance-pdf.service.js";

test("finance PDF supports multi-page statements", () => {
  const pdf = generateFinancePdf({
    title: "STUDENT FEE STATEMENT",
    school: { name: "Lumen School" },
    student: { name: "Ada Mensah", admissionNo: "ADM/2025/1000" },
    generatedAt: new Date("2026-06-28T00:00:00Z").toISOString(),
    lines: Array.from({ length: 60 }, (_, index) => ({
      label: `Charge ${index + 1}`,
      debit: 10,
      balance: (index + 1) * 10,
    })),
    totals: [{ label: "Outstanding", value: 600 }],
  });
  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
  assert.match(pdf.toString("latin1"), /\/Count 3/);
  assert.match(pdf.toString("latin1"), /STUDENT FEE STATEMENT/);
});

test("finance PDF wraps footer text without truncating it", () => {
  const footer =
    "Paid via mobile money with transaction reference MOMO-2026-001. This receipt is protected by its audit checksum and remains available after reversal.";
  const pdf = generateFinancePdf({
    title: "FEE PAYMENT RECEIPT",
    school: { name: "Lumen School" },
    student: { name: "Ada Mensah", admissionNo: "ADM/2025/1000" },
    generatedAt: new Date("2026-06-28T00:00:00Z").toISOString(),
    lines: [],
    totals: [{ label: "Amount received", value: 100 }],
    footer,
  }).toString("latin1");

  assert.match(footer, /^Paid via/);
  assert.match(pdf, /Paid via mobile money/);
  assert.match(pdf, /remains available after reversal\./);
});

test("finance PDF hard-wraps long unbroken transaction references", () => {
  const transactionReference = `MOMO-${"A".repeat(120)}`;
  const pdf = generateFinancePdf({
    title: "FEE PAYMENT RECEIPT",
    school: { name: "Lumen School" },
    student: { name: "Ada Mensah", admissionNo: "ADM/2025/1000" },
    generatedAt: new Date("2026-06-28T00:00:00Z").toISOString(),
    lines: [],
    totals: [{ label: "Amount received", value: 100 }],
    footer: `Transaction reference ${transactionReference}`,
  }).toString("latin1");

  assert.match(pdf, new RegExp(`MOMO-${"A".repeat(85)}`));
  assert.match(pdf, new RegExp("A".repeat(35)));
  assert.doesNotMatch(pdf, new RegExp(transactionReference));
});
