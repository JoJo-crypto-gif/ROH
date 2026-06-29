import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import {
  AcademicYearStatus,
  EnrollmentStatus,
  FeeApplicability,
  FeeScheduleKind,
  FeeScheduleStatus,
  JournalStatus,
  Prisma,
  TermStatus,
} from "@prisma/client";
import request from "supertest";
import { app } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { prisma } from "../../lib/prisma.js";
import {
  adjustmentSchema,
  debtorListQuerySchema,
  paymentListQuerySchema,
  paymentSchema,
  receiptListQuerySchema,
  scheduleSchema,
} from "./finance.schema.js";
import * as finance from "./finance.service.js";
import * as accounting from "../accounting/accounting.service.js";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || process.env.DATABASE_URL !== testUrl)
  throw new Error(
    "Finance integration tests must be started through npm run test:finance:integration.",
  );
const databaseName = new URL(testUrl).pathname.replace(/^\//, "");
if (!/test/i.test(databaseName))
  throw new Error("The finance integration database name must contain 'test'.");

const ids: Record<string, string> = {};
let adminToken = "";
let limitedToken = "";

async function clearTestDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (!tables.length) return;
  const quoted = tables
    .map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`)
    .join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
  );
}

before(async () => {
  await clearTestDatabase();
  const adminRole = await prisma.role.create({
    data: {
      name: "Finance Administrator",
      slug: "finance-admin",
      permissions: {
        create: [
          "fees.view",
          "fees.manage",
          "fees.publish",
          "fees.adjust",
          "fees.adjust.approve",
          "payments.view",
          "payments.record",
          "payments.reverse",
          "payments.reverse.approve",
          "credits.allocate",
          "receipts.view",
          "receipts.print",
          "debtors.view",
          "accounting.view",
          "accounting.setup",
          "accounting.periods.manage",
          "journals.create",
          "journals.approve",
          "journals.reverse",
          "expenses.view",
          "expenses.create",
          "expenses.approve",
          "expenses.pay",
          "expenses.reverse",
          "reconciliation.view",
          "reconciliation.manage",
          "reconciliation.approve",
          "accounting.reports.view",
        ].map((permission) => ({ permission })),
      },
    },
  });
  const limitedRole = await prisma.role.create({
    data: {
      name: "Payment Viewer",
      slug: "payment-viewer",
      permissions: { create: { permission: "payments.view" } },
    },
  });
  const [admin, limited] = await Promise.all([
    prisma.user.create({
      data: {
        email: "finance-admin@example.test",
        name: "Finance Admin",
        passwordHash: "integration-only",
        roleId: adminRole.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "viewer@example.test",
        name: "Payment Viewer",
        passwordHash: "integration-only",
        roleId: limitedRole.id,
      },
    }),
  ]);
  ids.admin = admin.id;
  adminToken = signAccessToken({
    userId: admin.id,
    roleId: adminRole.id,
    roleSlug: adminRole.slug,
  });
  limitedToken = signAccessToken({
    userId: limited.id,
    roleId: limitedRole.id,
    roleSlug: limitedRole.slug,
  });

  await prisma.schoolProfile.create({
    data: { id: "default", name: "Finance Integration School" },
  });
  const grade = await prisma.gradeLevel.create({
    data: { name: "Class Test", code: "CT", order: 1 },
  });
  ids.grade = grade.id;
  const previousYear = await prisma.academicYear.create({
    data: {
      name: "2025/2026 Test",
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-12-31T00:00:00.000Z"),
      termCount: 1,
      status: AcademicYearStatus.CLOSED,
      terms: {
        create: {
          name: "Term 1",
          sequence: 1,
          startDate: new Date("2025-01-01T00:00:00.000Z"),
          endDate: new Date("2025-12-31T00:00:00.000Z"),
          status: TermStatus.CLOSED,
        },
      },
    },
    include: { terms: true },
  });
  const year = await prisma.academicYear.create({
    data: {
      name: "2026/2027 Test",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
      termCount: 2,
      status: AcademicYearStatus.ACTIVE,
      terms: {
        create: [
          {
            name: "Term 1",
            sequence: 1,
            startDate: new Date("2026-01-01T00:00:00.000Z"),
            endDate: new Date("2026-04-30T00:00:00.000Z"),
            status: TermStatus.ACTIVE,
          },
          {
            name: "Term 2",
            sequence: 2,
            startDate: new Date("2026-05-01T00:00:00.000Z"),
            endDate: new Date("2026-08-31T00:00:00.000Z"),
            status: TermStatus.PENDING,
          },
        ],
      },
    },
    include: { terms: { orderBy: { sequence: "asc" } } },
  });
  ids.year = year.id;
  ids.term1 = year.terms[0].id;
  ids.term2 = year.terms[1].id;
  const [previousSection, section] = await Promise.all([
    prisma.classSection.create({
      data: {
        name: "Class Test Old",
        capacity: 500,
        academicYearId: previousYear.id,
        gradeLevelId: grade.id,
      },
    }),
    prisma.classSection.create({
      data: {
        name: "Class Test A",
        capacity: 500,
        academicYearId: year.id,
        gradeLevelId: grade.id,
      },
    }),
  ]);
  ids.section = section.id;
  const [earlyStudent, lateStudent] = await Promise.all([
    prisma.student.create({
      data: {
        admissionNo: "TEST/001",
        firstName: "Early",
        lastName: "Student",
        gender: "Female",
        dob: new Date("2015-01-01T00:00:00.000Z"),
        guardianName: "Early Guardian",
        guardianPhone: "0200000001",
        guardianRelation: "Parent",
        address: "Test Town",
        photoColor: "#123456",
      },
    }),
    prisma.student.create({
      data: {
        admissionNo: "TEST/002",
        firstName: "Late",
        lastName: "Student",
        gender: "Male",
        dob: new Date("2015-02-01T00:00:00.000Z"),
        guardianName: "Late Guardian",
        guardianPhone: "0200000002",
        guardianRelation: "Parent",
        address: "Test Town",
        photoColor: "#654321",
      },
    }),
  ]);
  ids.earlyStudent = earlyStudent.id;
  ids.lateStudent = lateStudent.id;
  const [earlyEnrolment, lateEnrolment, previousEnrolment] = await Promise.all([
    prisma.studentEnrolment.create({
      data: {
        studentId: earlyStudent.id,
        classSectionId: section.id,
        academicYearId: year.id,
        feeEffectiveTermId: ids.term1,
        status: EnrollmentStatus.ACTIVE,
      },
    }),
    prisma.studentEnrolment.create({
      data: {
        studentId: lateStudent.id,
        classSectionId: section.id,
        academicYearId: year.id,
        feeEffectiveTermId: ids.term2,
        status: EnrollmentStatus.ACTIVE,
      },
    }),
    prisma.studentEnrolment.create({
      data: {
        studentId: earlyStudent.id,
        classSectionId: previousSection.id,
        academicYearId: previousYear.id,
        status: EnrollmentStatus.COMPLETED,
      },
    }),
  ]);
  ids.earlyEnrolment = earlyEnrolment.id;
  ids.lateEnrolment = lateEnrolment.id;

  const [tuition, transport] = await Promise.all([
    finance.createFeeItem(admin.id, { code: "TUITION", name: "Tuition" }),
    finance.createFeeItem(admin.id, { code: "TRANSPORT", name: "Transport" }),
  ]);
  ids.tuition = tuition.id;
  ids.transport = transport.id;

  const previousSchedule = await prisma.feeSchedule.create({
    data: {
      academicYearId: previousYear.id,
      termId: previousYear.terms[0].id,
      gradeLevelId: grade.id,
      kind: FeeScheduleKind.STANDARD,
      name: "Previous fees",
      status: FeeScheduleStatus.PUBLISHED,
      lines: {
        create: {
          feeItemId: tuition.id,
          label: "Previous tuition",
          amount: new Prisma.Decimal(75),
          dueDate: new Date("2025-03-01T00:00:00.000Z"),
          applicability: FeeApplicability.MANDATORY,
        },
      },
    },
    include: { lines: true },
  });
  await prisma.studentCharge.create({
    data: {
      enrolmentId: previousEnrolment.id,
      lineId: previousSchedule.lines[0].id,
      amount: new Prisma.Decimal(75),
      dueDate: new Date("2025-03-01T00:00:00.000Z"),
    },
  });
});

after(async () => {
  await prisma.$disconnect();
});

test("publishes standard, supplemental and optional fees with effective-term eligibility", async () => {
  const term1 = await finance.createSchedule(
    ids.admin,
    scheduleSchema.parse({
      academicYearId: ids.year,
      termId: ids.term1,
      gradeLevelId: ids.grade,
      kind: "STANDARD",
      name: "Term 1 standard",
      lines: [
        {
          feeItemId: ids.tuition,
          amount: 100,
          dueDate: "2026-03-01",
          applicability: "MANDATORY",
        },
        {
          feeItemId: ids.transport,
          amount: 25,
          dueDate: "2026-03-01",
          applicability: "OPTIONAL",
        },
      ],
    }),
  );
  const optionalLine = term1.lines.find(
    (line) => line.applicability === FeeApplicability.OPTIONAL,
  )!;
  await finance.assignOptionalFee(ids.admin, optionalLine.id, [
    ids.earlyEnrolment,
  ]);
  await finance.submitSchedule(ids.admin, term1.id);
  const term1Publication = await finance.publishSchedule(ids.admin, term1.id);
  assert.equal(term1Publication.chargesCreated, 2);
  assert.equal(
    await prisma.studentCharge.count({
      where: { enrolmentId: ids.lateEnrolment },
    }),
    0,
  );

  const term2 = await finance.createSchedule(
    ids.admin,
    scheduleSchema.parse({
      academicYearId: ids.year,
      termId: ids.term2,
      gradeLevelId: ids.grade,
      kind: "STANDARD",
      name: "Term 2 standard",
      lines: [{ feeItemId: ids.tuition, amount: 120, dueDate: "2026-06-01" }],
    }),
  );
  await finance.submitSchedule(ids.admin, term2.id);
  assert.equal(
    (await finance.publishSchedule(ids.admin, term2.id)).chargesCreated,
    2,
  );

  const supplemental = await finance.createSchedule(
    ids.admin,
    scheduleSchema.parse({
      academicYearId: ids.year,
      termId: ids.term2,
      gradeLevelId: ids.grade,
      kind: "SUPPLEMENTAL",
      name: "Term 2 optional transport",
      lines: [
        {
          feeItemId: ids.transport,
          amount: 30,
          dueDate: "2026-06-15",
          applicability: "OPTIONAL",
        },
      ],
    }),
  );
  await finance.submitSchedule(ids.admin, supplemental.id);
  await finance.publishSchedule(ids.admin, supplemental.id);
  const assigned = await finance.assignOptionalFee(
    ids.admin,
    supplemental.lines[0].id,
    [ids.lateEnrolment],
  );
  assert.equal(assigned.chargesCreated, 1);

  const earlyLedger = await finance.getStudentLedger(ids.earlyStudent);
  assert.equal(earlyLedger.summary.previousArrears, 75);
  assert.equal(earlyLedger.summary.currentTermBalance, 125);
  assert.equal(earlyLedger.summary.futureCharges, 120);
  const lateLedger = await finance.getStudentLedger(ids.lateStudent);
  assert.equal(lateLedger.summary.billed, 150);
  assert.equal(lateLedger.summary.previousArrears, 0);
  assert.equal(lateLedger.summary.currentTermBalance, 0);
  assert.equal(lateLedger.summary.futureCharges, 150);
});

test("classifies balances between terms and without an active academic year", async () => {
  await prisma.term.update({
    where: { id: ids.term1 },
    data: { status: TermStatus.CLOSED },
  });
  const betweenTerms = await finance.getStudentLedger(ids.earlyStudent);
  assert.equal(betweenTerms.summary.previousArrears, 200);
  assert.equal(betweenTerms.summary.currentTermBalance, 0);
  assert.equal(betweenTerms.summary.futureCharges, 120);

  const debtorBetweenTerms = await finance.listDebtors(
    debtorListQuerySchema.parse({ search: "TEST/001", page: 1, pageSize: 25 }),
  );
  assert.equal(debtorBetweenTerms.debtors[0].previousArrears, 200);
  assert.equal(debtorBetweenTerms.debtors[0].currentTermBalance, 0);
  assert.equal(debtorBetweenTerms.debtors[0].futureCharges, 120);

  await prisma.academicYear.update({
    where: { id: ids.year },
    data: { status: AcademicYearStatus.CLOSED },
  });
  const withoutActiveYear = await finance.getStudentLedger(ids.earlyStudent);
  assert.equal(withoutActiveYear.summary.previousArrears, 320);
  assert.equal(withoutActiveYear.summary.currentTermBalance, 0);
  assert.equal(withoutActiveYear.summary.futureCharges, 0);

  await prisma.$transaction([
    prisma.academicYear.update({
      where: { id: ids.year },
      data: { status: AcademicYearStatus.ACTIVE },
    }),
    prisma.term.update({
      where: { id: ids.term1 },
      data: { status: TermStatus.ACTIVE },
    }),
  ]);
});

test("preserves exact partial payments, credit, adjustments, reversals and receipt snapshots", async () => {
  const ledger = await finance.getStudentLedger(ids.earlyStudent);
  const tuition = ledger.charges.find(
    (charge) => charge.termId === ids.term1 && charge.label === "Tuition",
  )!;
  const partialInput = paymentSchema.parse({
    studentId: ids.earlyStudent,
    amount: 40,
    method: "CASH",
    idempotencyKey: "integration-partial-payment",
    allocations: [{ chargeId: tuition.id, amount: 40 }],
  });
  const partial = await finance.recordPayment(ids.admin, partialInput);
  const retry = await finance.recordPayment(ids.admin, partialInput);
  assert.equal(retry.id, partial.id);

  const overpayment = await finance.recordPayment(
    ids.admin,
    paymentSchema.parse({
      studentId: ids.earlyStudent,
      amount: 200,
      method: "MOBILE_MONEY",
      transactionRef: "MOMO-INTEGRATION-001",
      idempotencyKey: "integration-overpayment",
      allocations: [{ chargeId: tuition.id, amount: 60 }],
    }),
  );
  const creditLot = await prisma.studentCreditLot.findUniqueOrThrow({
    where: { paymentId: overpayment.id },
  });
  assert.equal(creditLot.amount.toNumber(), 140);
  const anotherCharge = (
    await finance.getStudentLedger(ids.earlyStudent)
  ).charges.find((charge) => charge.balance >= 20)!;
  await finance.allocateCredit(ids.admin, creditLot.id, [
    { chargeId: anotherCharge.id, amount: 20 },
  ]);

  const adjustment = await finance.requestAdjustment(
    ids.admin,
    adjustmentSchema.parse({
      chargeId: anotherCharge.id,
      type: "WAIVER",
      amount: 5,
      reason: "Approved integration waiver",
    }),
  );
  await finance.decideAdjustment(ids.admin, adjustment.id, true);

  const receiptBefore = await prisma.feeReceipt.findUniqueOrThrow({
    where: { paymentId: overpayment.id },
  });
  const snapshotBefore = JSON.stringify(receiptBefore.snapshot);
  const reversal = await finance.requestReversal(
    ids.admin,
    overpayment.id,
    "Integration reversal",
  );
  await finance.decideReversal(ids.admin, reversal.id, true);
  const [paymentAfter, lotAfter, creditAllocation, receiptAfter] =
    await Promise.all([
      prisma.feePayment.findUniqueOrThrow({ where: { id: overpayment.id } }),
      prisma.studentCreditLot.findUniqueOrThrow({
        where: { id: creditLot.id },
      }),
      prisma.creditAllocation.findFirstOrThrow({
        where: { creditLotId: creditLot.id },
      }),
      prisma.feeReceipt.findUniqueOrThrow({
        where: { paymentId: overpayment.id },
      }),
    ]);
  assert.equal(paymentAfter.status, "REVERSED");
  assert.equal(lotAfter.status, "REVERSED");
  assert.ok(creditAllocation.reversedAt);
  assert.equal(JSON.stringify(receiptAfter.snapshot), snapshotBefore);
});

test("concurrent posting produces unique, gap-free annual receipt sequences", async () => {
  await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      finance.recordPayment(
        ids.admin,
        paymentSchema.parse({
          studentId: ids.lateStudent,
          amount: 1,
          method: "CASH",
          idempotencyKey: `integration-concurrent-${index}`,
          allocations: [],
        }),
      ),
    ),
  );
  const receipts = await prisma.feeReceipt.findMany({
    orderBy: { sequence: "asc" },
  });
  const sequences = receipts.map((receipt) => receipt.sequence);
  assert.equal(
    new Set(receipts.map((receipt) => receipt.number)).size,
    receipts.length,
  );
  assert.deepEqual(
    sequences,
    Array.from({ length: receipts.length }, (_, index) => index + 1),
  );
});

test("debtors stay paginated with hundreds of historical balances", async () => {
  const line = await prisma.feeScheduleLine.findFirstOrThrow({
    where: {
      schedule: { termId: ids.term1 },
      applicability: FeeApplicability.MANDATORY,
    },
  });
  const bulk = Array.from({ length: 220 }, (_, index) => ({
    studentId: crypto.randomUUID(),
    enrolmentId: crypto.randomUUID(),
    admissionNo: `BULK/${String(index + 1).padStart(4, "0")}`,
  }));
  await prisma.student.createMany({
    data: bulk.map((item, index) => ({
      id: item.studentId,
      admissionNo: item.admissionNo,
      firstName: "Bulk",
      lastName: `Student ${index + 1}`,
      gender: "Other",
      dob: new Date("2015-01-01T00:00:00.000Z"),
      guardianName: "Bulk Guardian",
      guardianPhone: "0200000999",
      guardianRelation: "Parent",
      address: "Test Town",
      photoColor: "#999999",
    })),
  });
  await prisma.studentEnrolment.createMany({
    data: bulk.map((item) => ({
      id: item.enrolmentId,
      studentId: item.studentId,
      classSectionId: ids.section,
      academicYearId: ids.year,
      feeEffectiveTermId: ids.term1,
      status: EnrollmentStatus.ACTIVE,
    })),
  });
  await prisma.studentCharge.createMany({
    data: bulk.map((item) => ({
      enrolmentId: item.enrolmentId,
      lineId: line.id,
      amount: new Prisma.Decimal("10.01"),
      dueDate: line.dueDate,
    })),
  });
  const result = await finance.listDebtors(
    debtorListQuerySchema.parse({
      page: 1,
      pageSize: 25,
      gradeLevelId: ids.grade,
    }),
  );
  assert.equal(result.debtors.length, 25);
  assert.ok(result.pagination.total >= 220);
  assert.ok(result.totals.netExposure > 2200);
  const summary = await finance.getFinanceSummary();
  assert.equal(summary.available, true);
  assert.ok(summary.billed > 2200);
  assert.ok(summary.recentPayments.length <= 5);
});

test("accounting cutover, journals, expenses, payments and reports remain balanced", async () => {
  const setup = await accounting.bootstrapAccounting(ids.admin, ids.year);
  assert.equal(setup.status, "SETUP");
  const moneyAccounts = await accounting.listMoneyAccounts();
  const cash = moneyAccounts.find((item) => item.type === "CASH")!;
  const bank = moneyAccounts.find((item) => item.type === "BANK")!;
  const activated = await accounting.activateAccounting(ids.admin, {
    cutoverDate: new Date("2026-06-29T00:00:00.000Z"),
    moneyBalances: [
      { moneyAccountId: cash.id, amount: 50 },
      { moneyAccountId: bank.id, amount: 100 },
    ],
    otherBalances: [],
  });
  const opening = await prisma.journalEntry.findUniqueOrThrow({
    where: { id: activated.journalId },
    include: { lines: true },
  });
  assert.equal(opening.status, JournalStatus.POSTED);
  assert.equal(
    opening.lines
      .reduce((sum, line) => sum.plus(line.debit), new Prisma.Decimal(0))
      .toFixed(2),
    opening.lines
      .reduce((sum, line) => sum.plus(line.credit), new Prisma.Decimal(0))
      .toFixed(2),
  );

  const accounts = await accounting.listAccounts();
  const income = accounts.find((item) => item.type === "INCOME")!;
  const expenseAccount = accounts.find((item) => item.type === "EXPENSE")!;
  const draft = await accounting.createManualJournal(ids.admin, {
    date: new Date("2026-06-29T00:00:00.000Z"),
    description: "Integration manual income",
    lines: [
      { accountId: cash.accountId, debit: 12.34, credit: 0 },
      { accountId: income.id, debit: 0, credit: 12.34 },
    ],
  });
  await accounting.submitManualJournal(ids.admin, draft.id);
  const posted = await accounting.decideManualJournal(
    ids.admin,
    draft.id,
    true,
  );
  assert.match(posted.number!, /^JRN-/);
  const concurrentDrafts = await Promise.all(
    Array.from({ length: 3 }, (_, index) =>
      accounting.createManualJournal(ids.admin, {
        date: new Date("2026-06-29T00:00:00.000Z"),
        description: `Concurrent journal ${index + 1}`,
        lines: [
          { accountId: cash.accountId, debit: 1, credit: 0 },
          { accountId: income.id, debit: 0, credit: 1 },
        ],
      }),
    ),
  );
  await Promise.all(
    concurrentDrafts.map((item) =>
      accounting.submitManualJournal(ids.admin, item.id),
    ),
  );
  const concurrentPosted = await Promise.all(
    concurrentDrafts.map((item) =>
      accounting.decideManualJournal(ids.admin, item.id, true),
    ),
  );
  assert.equal(new Set(concurrentPosted.map((item) => item.number)).size, 3);

  const expense = await accounting.createExpense(ids.admin, {
    date: new Date("2026-06-29T00:00:00.000Z"),
    payee: "Integration Utility",
    description: "Integration electricity",
    missingDocumentReason: "Integration fixture",
    lines: [
      { accountId: expenseAccount.id, description: "Electricity", amount: 40 },
    ],
  });
  await accounting.submitExpense(ids.admin, expense.id);
  await accounting.decideExpense(ids.admin, expense.id, true);
  await accounting.payExpense(ids.admin, expense.id, {
    amount: 15,
    date: new Date("2026-06-29T00:00:00.000Z"),
    moneyAccountId: bank.id,
    transactionRef: "BANK-INTEGRATION-1",
  });
  assert.equal(
    (await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } }))
      .status,
    "PARTIALLY_PAID",
  );

  const feePayment = await finance.recordPayment(
    ids.admin,
    paymentSchema.parse({
      studentId: ids.earlyStudent,
      amount: 3,
      method: "CASH",
      moneyAccountId: cash.id,
      idempotencyKey: "accounting-linked-payment",
      allocations: [],
    }),
  );
  const linked = await prisma.journalEntry.findUnique({
    where: { sourceKey: `FEE_PAYMENT:${feePayment.id}` },
  });
  assert.equal(linked?.status, JournalStatus.POSTED);

  const reports = await accounting.getAccountingReports({});
  assert.ok(reports);
  const debits = reports!.trialBalance.reduce((sum, row) => sum + row.debit, 0);
  const credits = reports!.trialBalance.reduce(
    (sum, row) => sum + row.credit,
    0,
  );
  assert.equal(debits.toFixed(2), credits.toFixed(2));
  assert.equal(reports!.receivableControl.reconciled, true);
  assert.equal(reports!.receivableControl.difference, 0);

  await request(app).get("/accounting/reports/trial-balance/pdf").expect(401);
  const pdf = await request(app)
    .get("/accounting/reports/trial-balance/pdf")
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200)
    .expect("Content-Type", /pdf/);
  assert.equal(pdf.body.subarray(0, 8).toString(), "%PDF-1.4");
  await request(app)
    .get("/accounting/setup")
    .set("Authorization", `Bearer ${limitedToken}`)
    .expect(403);
});

test("finance endpoints enforce RBAC, filters, pagination and protected PDFs", async () => {
  const payments = await request(app)
    .get("/finance/payments")
    .query({ method: "CASH", page: 1, pageSize: 2 })
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(payments.body.payments.length, 2);
  assert.equal(payments.body.pagination.pageSize, 2);

  await request(app)
    .get("/finance/payments")
    .query({ pageSize: 101 })
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(400);
  await request(app)
    .get("/finance/debtors")
    .set("Authorization", `Bearer ${limitedToken}`)
    .expect(403);

  const debtorFilters = await request(app)
    .get("/finance/debtors/filters")
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(debtorFilters.body.gradeLevels[0].id, ids.grade);
  assert.equal(debtorFilters.body.sections[0].id, ids.section);

  const debtors = await request(app)
    .get("/finance/debtors")
    .query({
      classSectionId: ids.section,
      search: "Bulk",
      page: 2,
      pageSize: 25,
    })
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(debtors.body.debtors.length, 25);
  assert.equal(debtors.body.pagination.page, 2);

  const lastPaymentPage = await request(app)
    .get("/finance/payments")
    .query({ page: 999, pageSize: 2 })
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(lastPaymentPage.body.payments.length > 0);
  assert.equal(
    lastPaymentPage.body.pagination.page,
    lastPaymentPage.body.pagination.totalPages,
  );

  const lastReceiptPage = await request(app)
    .get("/finance/receipts")
    .query({ page: 999, pageSize: 2 })
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(lastReceiptPage.body.receipts.length > 0);
  assert.equal(
    lastReceiptPage.body.pagination.page,
    lastReceiptPage.body.pagination.totalPages,
  );

  const lastDebtorPage = await request(app)
    .get("/finance/debtors")
    .query({ search: "Bulk", page: 999, pageSize: 25 })
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(lastDebtorPage.body.pagination.total, 220);
  assert.equal(lastDebtorPage.body.pagination.page, 9);
  assert.equal(lastDebtorPage.body.debtors.length, 20);

  for (const endpoint of ["payments", "receipts", "debtors"]) {
    const empty = await request(app)
      .get(`/finance/${endpoint}`)
      .query({ search: "NO-SUCH-FINANCE-RECORD", page: 999, pageSize: 25 })
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(empty.body.pagination.page, 1);
    assert.equal(empty.body.pagination.total, 0);
    assert.equal(empty.body[endpoint].length, 0);
  }

  const receiptList = await finance.listReceipts(
    receiptListQuerySchema.parse({ status: "REVERSED", page: 1, pageSize: 25 }),
  );
  assert.equal(receiptList.receipts.length, 1);
  const reversedReceipt = receiptList.receipts[0];
  await request(app)
    .get(`/finance/receipts/${reversedReceipt.id}/pdf`)
    .expect(401);
  const pdf = await request(app)
    .get(`/finance/receipts/${reversedReceipt.id}/pdf`)
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200)
    .expect("Content-Type", /pdf/);
  assert.equal(pdf.body.subarray(0, 8).toString(), "%PDF-1.4");

  const filtered = await finance.listPayments(
    paymentListQuerySchema.parse({ search: "TEST/001", page: 1, pageSize: 25 }),
  );
  assert.ok(filtered.payments.length >= 2);
});
