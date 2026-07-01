import crypto from "node:crypto";
import {
  AccountSystemKey,
  AccountType,
  AccountingBookDomain,
  AccountingBookStatus,
  AccountingPeriodStatus,
  ExpenseStatus,
  FeePaymentMethod,
  JournalSource,
  JournalStatus,
  MoneyAccountType,
  Prisma,
  ReconciliationStatus,
  TermStatus,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { config } from "../../config.js";
import { generateFinancePdf } from "../finance/finance-pdf.service.js";
import {
  readAccountingDocument,
  saveAccountingDocument,
} from "./accounting-storage.service.js";

type Tx = Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);
const decimal = (value: Prisma.Decimal | number | string | null | undefined) =>
  new Prisma.Decimal(value ?? 0);
const number = (value: Prisma.Decimal | number | string | null | undefined) =>
  decimal(value).toDecimalPlaces(2).toNumber();
const isoDate = (value: Date) => value.toISOString().slice(0, 10);

async function serializable<T>(work: (tx: Tx) => Promise<T>) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 5
      ) {
        await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt));
        continue;
      }
      throw error;
    }
  }
  throw AppError.conflict(
    "Accounting transaction could not be completed. Please retry.",
  );
}

async function audit(
  tx: Tx,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>,
) {
  await tx.accountingAuditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId,
      metadata: metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

function monthPeriods(startDate: Date, endDate: Date) {
  const periods: {
    name: string;
    sequence: number;
    startDate: Date;
    endDate: Date;
  }[] = [];
  let cursor = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1),
  );
  let sequence = 1;
  while (cursor <= endDate) {
    const monthStart = new Date(
      Math.max(cursor.getTime(), startDate.getTime()),
    );
    const nextMonth = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
    );
    const monthEnd = new Date(
      Math.min(nextMonth.getTime() - 1, endDate.getTime()),
    );
    periods.push({
      name: cursor.toLocaleString("en", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
      sequence,
      startDate: monthStart,
      endDate: monthEnd,
    });
    cursor = nextMonth;
    sequence += 1;
  }
  return periods;
}

const DEFAULT_ACCOUNTS: {
  code: string;
  name: string;
  type: AccountType;
  systemKey?: AccountSystemKey;
}[] = [
  { code: "1000", name: "Cash on Hand", type: AccountType.ASSET },
  { code: "1010", name: "School Bank Account", type: AccountType.ASSET },
  { code: "1020", name: "Mobile Money Wallet", type: AccountType.ASSET },
  { code: "1030", name: "Card Clearing", type: AccountType.ASSET },
  {
    code: "1100",
    name: "Student Fee Receivables",
    type: AccountType.ASSET,
    systemKey: AccountSystemKey.ACCOUNTS_RECEIVABLE,
  },
  {
    code: "2000",
    name: "Accounts Payable",
    type: AccountType.LIABILITY,
    systemKey: AccountSystemKey.ACCOUNTS_PAYABLE,
  },
  {
    code: "2100",
    name: "Student Credits",
    type: AccountType.LIABILITY,
    systemKey: AccountSystemKey.STUDENT_CREDITS,
  },
  {
    code: "2200",
    name: "Deferred Fee Income",
    type: AccountType.LIABILITY,
    systemKey: AccountSystemKey.DEFERRED_FEE_INCOME,
  },
  {
    code: "3000",
    name: "Opening Balance Equity",
    type: AccountType.EQUITY,
    systemKey: AccountSystemKey.OPENING_EQUITY,
  },
  { code: "4000", name: "School Fee Income", type: AccountType.INCOME },
  { code: "4010", name: "Other School Income", type: AccountType.INCOME },
  {
    code: "4090",
    name: "Fee Waivers and Discounts",
    type: AccountType.EXPENSE,
    systemKey: AccountSystemKey.FEE_WAIVERS,
  },
  {
    code: "5000",
    name: "Teaching and Learning Materials",
    type: AccountType.EXPENSE,
  },
  { code: "5010", name: "Staff Costs", type: AccountType.EXPENSE },
  { code: "5020", name: "Utilities", type: AccountType.EXPENSE },
  { code: "5030", name: "Transport and Travel", type: AccountType.EXPENSE },
  { code: "5090", name: "Other School Expenses", type: AccountType.EXPENSE },
  {
    code: "5990",
    name: "Cash Over and Short",
    type: AccountType.EXPENSE,
    systemKey: AccountSystemKey.CASH_OVER_SHORT,
  },
];

async function findFiscalYear(tx: Tx, bookId: string, date: Date) {
  const fiscalYear = await tx.accountingFiscalYear.findFirst({
    where: { bookId, startDate: { lte: date }, endDate: { gte: date } },
    include: { periods: true },
  });
  if (!fiscalYear)
    throw AppError.badRequest(
      "The date is outside a configured accounting year.",
    );
  if (fiscalYear.status === AccountingPeriodStatus.CLOSED)
    throw AppError.badRequest("The accounting year is closed.");
  const period = fiscalYear.periods.find(
    (item) => item.startDate <= date && item.endDate >= date,
  );
  if (!period || period.status === AccountingPeriodStatus.CLOSED)
    throw AppError.badRequest("The accounting period for this date is closed.");
  return { fiscalYear, period };
}

async function schoolBook(tx: Tx, requireActive = true) {
  const book = await tx.accountingBook.findUnique({
    where: { domain: AccountingBookDomain.SCHOOL },
  });
  if (!book) throw AppError.badRequest("Complete accounting setup first.");
  if (requireActive && book.status !== AccountingBookStatus.ACTIVE)
    throw AppError.badRequest(
      "Activate accounting before posting transactions.",
    );
  return book;
}

async function systemAccounts(tx: Tx, bookId: string) {
  const accounts = await tx.account.findMany({
    where: { bookId, systemKey: { not: null } },
  });
  return new Map(accounts.map((account) => [account.systemKey!, account]));
}

type PostingLine = {
  accountId: string;
  description?: string | null;
  debit?: Prisma.Decimal | number | string;
  credit?: Prisma.Decimal | number | string;
  studentId?: string | null;
};

function validateLines(lines: PostingLine[]) {
  if (lines.length < 2)
    throw AppError.badRequest("A journal requires at least two lines.");
  let debits = ZERO;
  let credits = ZERO;
  for (const line of lines) {
    const debit = decimal(line.debit);
    const credit = decimal(line.credit);
    if (debit.isNegative() || credit.isNegative() || debit.eq(credit))
      throw AppError.badRequest(
        "Each journal line must contain one positive debit or credit.",
      );
    if ((debit.gt(0) && credit.gt(0)) || (debit.eq(0) && credit.eq(0)))
      throw AppError.badRequest(
        "Each journal line must contain either a debit or credit.",
      );
    debits = debits.plus(debit);
    credits = credits.plus(credit);
  }
  if (!debits.eq(credits))
    throw AppError.badRequest(
      `Journal is not balanced: debits ${debits.toFixed(2)}, credits ${credits.toFixed(2)}.`,
    );
  return debits;
}

async function nextJournalNumber(
  tx: Tx,
  fiscalYearId: string,
  yearName: string,
) {
  const sequence = await tx.journalSequence.upsert({
    where: { fiscalYearId },
    create: { fiscalYearId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  const code =
    yearName.replace(/[^0-9]/g, "").slice(0, 8) ||
    String(new Date().getUTCFullYear());
  return `JRN-${code}-${String(sequence.lastNumber).padStart(6, "0")}`;
}

export async function createPostedJournal(
  tx: Tx,
  input: {
    actorId: string | null;
    bookId: string;
    date: Date;
    description: string;
    source: JournalSource;
    sourceKey: string;
    lines: PostingLine[];
    links?: { entityType: string; entityId: string }[];
    metadata?: Record<string, unknown>;
  },
) {
  const duplicate = await tx.journalEntry.findUnique({
    where: { sourceKey: input.sourceKey },
  });
  if (duplicate) return duplicate;
  const total = validateLines(input.lines);
  const { fiscalYear, period } = await findFiscalYear(
    tx,
    input.bookId,
    input.date,
  );
  const accountIds = [...new Set(input.lines.map((line) => line.accountId))];
  const accountCount = await tx.account.count({
    where: { id: { in: accountIds }, bookId: input.bookId, active: true },
  });
  if (accountCount !== accountIds.length)
    throw AppError.badRequest(
      "Every journal line must use an active account in this book.",
    );
  const numberValue = await nextJournalNumber(
    tx,
    fiscalYear.id,
    fiscalYear.name,
  );
  const journal = await tx.journalEntry.create({
    data: {
      fiscalYearId: fiscalYear.id,
      periodId: period.id,
      number: numberValue,
      date: input.date,
      description: input.description,
      status: JournalStatus.POSTED,
      source: input.source,
      sourceKey: input.sourceKey,
      preparedById: input.actorId,
      approvedById: input.actorId,
      submittedAt: new Date(),
      postedAt: new Date(),
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      lines: {
        create: input.lines.map((line) => ({
          accountId: line.accountId,
          description: line.description,
          debit: decimal(line.debit),
          credit: decimal(line.credit),
          studentId: line.studentId,
        })),
      },
      sourceLinks: input.links?.length
        ? { create: input.links.map((link) => link) }
        : undefined,
    },
  });
  await audit(tx, input.actorId, "JOURNAL_POSTED", "JournalEntry", journal.id, {
    number: numberValue,
    source: input.source,
    total: total.toFixed(2),
  });
  return journal;
}

export async function bootstrapAccounting(
  actorId: string,
  academicYearId?: string,
) {
  return serializable(async (tx) => {
    let book = await tx.accountingBook.findUnique({
      where: { domain: AccountingBookDomain.SCHOOL },
    });
    if (!book) {
      book = await tx.accountingBook.create({
        data: {
          domain: AccountingBookDomain.SCHOOL,
          name: "School Accounting",
        },
      });
      await tx.account.createMany({
        data: DEFAULT_ACCOUNTS.map((account) => ({
          ...account,
          bookId: book!.id,
        })),
      });
      const accounts = await tx.account.findMany({
        where: { bookId: book.id },
      });
      const byCode = new Map(
        accounts.map((account) => [account.code, account]),
      );
      const money = await Promise.all([
        tx.moneyAccount.create({
          data: {
            accountId: byCode.get("1000")!.id,
            name: "Cash on Hand",
            type: MoneyAccountType.CASH,
          },
        }),
        tx.moneyAccount.create({
          data: {
            accountId: byCode.get("1010")!.id,
            name: "School Bank",
            type: MoneyAccountType.BANK,
          },
        }),
        tx.moneyAccount.create({
          data: {
            accountId: byCode.get("1020")!.id,
            name: "Mobile Money",
            type: MoneyAccountType.MOBILE_MONEY,
          },
        }),
        tx.moneyAccount.create({
          data: {
            accountId: byCode.get("1030")!.id,
            name: "Card Clearing",
            type: MoneyAccountType.CARD_CLEARING,
          },
        }),
      ]);
      await tx.paymentMethodAccount.createMany({
        data: [
          {
            bookId: book.id,
            method: FeePaymentMethod.CASH,
            moneyAccountId: money[0].id,
          },
          {
            bookId: book.id,
            method: FeePaymentMethod.BANK_TRANSFER,
            moneyAccountId: money[1].id,
          },
          {
            bookId: book.id,
            method: FeePaymentMethod.MOBILE_MONEY,
            moneyAccountId: money[2].id,
          },
          {
            bookId: book.id,
            method: FeePaymentMethod.CARD,
            moneyAccountId: money[3].id,
          },
        ],
      });
    }
    const year = academicYearId
      ? await tx.academicYear.findUnique({ where: { id: academicYearId } })
      : await tx.academicYear.findFirst({
          where: { status: { in: ["ACTIVE", "DRAFT"] } },
          orderBy: { startDate: "desc" },
        });
    if (!year)
      throw AppError.badRequest(
        "Create an academic year before accounting setup.",
      );
    let fiscalYear = await tx.accountingFiscalYear.findUnique({
      where: {
        bookId_academicYearId: { bookId: book.id, academicYearId: year.id },
      },
    });
    if (!fiscalYear) {
      fiscalYear = await tx.accountingFiscalYear.create({
        data: {
          bookId: book.id,
          academicYearId: year.id,
          name: year.name,
          startDate: year.startDate,
          endDate: year.endDate,
          periods: { create: monthPeriods(year.startDate, year.endDate) },
        },
      });
    }
    const feeIncome = await tx.account.findFirstOrThrow({
      where: { bookId: book.id, code: "4000" },
    });
    const feeItems = await tx.feeItem.findMany({ where: { active: true } });
    await tx.feeAccountMapping.createMany({
      data: feeItems.map((item) => ({
        bookId: book!.id,
        feeItemId: item.id,
        incomeAccountId: feeIncome.id,
      })),
      skipDuplicates: true,
    });
    await audit(
      tx,
      actorId,
      "ACCOUNTING_BOOTSTRAPPED",
      "AccountingBook",
      book.id,
      {
        fiscalYearId: fiscalYear.id,
      },
    );
    return getSetupData(tx, book.id);
  });
}

async function getSetupData(tx: Tx, bookId: string) {
  return tx.accountingBook.findUniqueOrThrow({
    where: { id: bookId },
    include: {
      accounts: { orderBy: { code: "asc" } },
      fiscalYears: {
        include: {
          academicYear: true,
          periods: { orderBy: { sequence: "asc" } },
        },
        orderBy: { startDate: "desc" },
      },
      feeMappings: { include: { feeItem: true, incomeAccount: true } },
      methodMappings: {
        include: { moneyAccount: { include: { account: true } } },
      },
    },
  });
}

export async function getAccountingSetup() {
  const book = await prisma.accountingBook.findUnique({
    where: { domain: AccountingBookDomain.SCHOOL },
  });
  return book ? getSetupData(prisma as unknown as Tx, book.id) : null;
}

export async function setAccountingPeriodStatus(
  actorId: string,
  periodId: string,
  status: AccountingPeriodStatus,
) {
  return prisma.$transaction(async (tx) => {
    const period = await tx.accountingPeriod.findUnique({
      where: { id: periodId },
      include: { fiscalYear: { include: { book: true } } },
    });
    if (
      !period ||
      period.fiscalYear.book.domain !== AccountingBookDomain.SCHOOL
    )
      throw AppError.notFound("Accounting period not found.");
    if (period.status === status) return period;
    if (status === AccountingPeriodStatus.CLOSED) {
      const unfinished = await tx.journalEntry.count({
        where: {
          periodId,
          status: { in: [JournalStatus.DRAFT, JournalStatus.PENDING_APPROVAL] },
        },
      });
      if (unfinished)
        throw AppError.badRequest(
          "Post, reject, or remove pending journals before closing this period.",
        );
    }
    const updated = await tx.accountingPeriod.update({
      where: { id: periodId },
      data: {
        status,
        closedAt: status === AccountingPeriodStatus.CLOSED ? new Date() : null,
        closedById: status === AccountingPeriodStatus.CLOSED ? actorId : null,
      },
    });
    await audit(
      tx,
      actorId,
      `ACCOUNTING_PERIOD_${status}`,
      "AccountingPeriod",
      periodId,
    );
    return updated;
  });
}

type OpeningRow = {
  outstanding: Prisma.Decimal;
  deferred: Prisma.Decimal;
  available_credit: Prisma.Decimal;
};

async function openingControlBalances(tx: Tx) {
  const rows = await tx.$queryRaw<OpeningRow[]>(Prisma.sql`
    WITH adjustment_totals AS (
      SELECT charge_id,
        COALESCE(SUM(amount) FILTER (WHERE type = 'CHARGE_DEBIT'), 0) AS debits,
        COALESCE(SUM(amount) FILTER (WHERE type <> 'CHARGE_DEBIT'), 0) AS reductions
      FROM charge_adjustments WHERE status = 'APPROVED' GROUP BY charge_id
    ), payment_totals AS (
      SELECT pa.charge_id, COALESCE(SUM(pa.amount), 0) AS paid
      FROM payment_allocations pa JOIN fee_payments fp ON fp.id = pa.payment_id
      WHERE pa.reversed_at IS NULL AND fp.status <> 'REVERSED' GROUP BY pa.charge_id
    ), credit_totals AS (
      SELECT ca.charge_id, COALESCE(SUM(ca.amount), 0) AS applied
      FROM credit_allocations ca JOIN student_credit_lots scl ON scl.id = ca.credit_lot_id
      WHERE ca.reversed_at IS NULL AND scl.status = 'ACTIVE' GROUP BY ca.charge_id
    ), charges AS (
      SELECT GREATEST(0, sc.amount + COALESCE(a.debits, 0) - COALESCE(a.reductions, 0)) AS net,
        GREATEST(0, sc.amount + COALESCE(a.debits, 0) - COALESCE(a.reductions, 0)
          - COALESCE(p.paid, 0) - COALESCE(c.applied, 0)) AS balance,
        t.status AS term_status
      FROM student_charges sc
      JOIN fee_schedule_lines fsl ON fsl.id = sc.line_id
      JOIN fee_schedules fs ON fs.id = fsl.schedule_id
      JOIN terms t ON t.id = fs.term_id
      LEFT JOIN adjustment_totals a ON a.charge_id = sc.id
      LEFT JOIN payment_totals p ON p.charge_id = sc.id
      LEFT JOIN credit_totals c ON c.charge_id = sc.id
    ), credits AS (
      SELECT COALESCE(SUM(scl.amount - COALESCE(used.amount, 0)), 0) AS available
      FROM student_credit_lots scl
      JOIN fee_payments fp ON fp.id = scl.payment_id AND fp.status <> 'REVERSED'
      LEFT JOIN (
        SELECT credit_lot_id, SUM(amount) AS amount FROM credit_allocations
        WHERE reversed_at IS NULL GROUP BY credit_lot_id
      ) used ON used.credit_lot_id = scl.id
      WHERE scl.status = 'ACTIVE'
    )
    SELECT COALESCE(SUM(balance), 0) AS outstanding,
      COALESCE(SUM(net) FILTER (WHERE term_status = 'PENDING'), 0) AS deferred,
      (SELECT available FROM credits) AS available_credit
    FROM charges
  `);
  return (
    rows[0] ?? { outstanding: ZERO, deferred: ZERO, available_credit: ZERO }
  );
}

export async function activateAccounting(
  actorId: string,
  input: {
    cutoverDate: Date;
    moneyBalances: { moneyAccountId: string; amount: number }[];
    otherBalances: { accountId: string; debit: number; credit: number }[];
  },
) {
  return serializable(async (tx) => {
    const book = await schoolBook(tx, false);
    if (book.status === AccountingBookStatus.ACTIVE)
      throw AppError.badRequest("Accounting has already been activated.");
    const { fiscalYear } = await findFiscalYear(tx, book.id, input.cutoverDate);
    const controls = await systemAccounts(tx, book.id);
    const balances = await openingControlBalances(tx);
    const signed = new Map<string, Prisma.Decimal>();
    const add = (accountId: string, amount: Prisma.Decimal) =>
      signed.set(accountId, (signed.get(accountId) ?? ZERO).plus(amount));
    add(
      controls.get(AccountSystemKey.ACCOUNTS_RECEIVABLE)!.id,
      balances.outstanding,
    );
    add(
      controls.get(AccountSystemKey.STUDENT_CREDITS)!.id,
      balances.available_credit.negated(),
    );
    add(
      controls.get(AccountSystemKey.DEFERRED_FEE_INCOME)!.id,
      balances.deferred.negated(),
    );
    for (const balance of input.moneyBalances) {
      const money = await tx.moneyAccount.findUnique({
        where: { id: balance.moneyAccountId },
      });
      if (!money) throw AppError.badRequest("Invalid opening money account.");
      add(money.accountId, decimal(balance.amount));
    }
    for (const balance of input.otherBalances)
      add(balance.accountId, decimal(balance.debit).minus(balance.credit));
    const net = [...signed.values()].reduce(
      (sum, amount) => sum.plus(amount),
      ZERO,
    );
    add(controls.get(AccountSystemKey.OPENING_EQUITY)!.id, net.negated());
    const lines: PostingLine[] = [...signed.entries()]
      .filter(([, amount]) => !amount.eq(0))
      .map(([accountId, amount]) => ({
        accountId,
        description: "Opening balance",
        debit: amount.gt(0) ? amount : ZERO,
        credit: amount.lt(0) ? amount.abs() : ZERO,
      }));
    const journal = await createPostedJournal(tx, {
      actorId,
      bookId: book.id,
      date: input.cutoverDate,
      description: `Accounting opening balances at ${isoDate(input.cutoverDate)}`,
      source: JournalSource.OPENING,
      sourceKey: `OPENING:${book.id}`,
      lines,
      metadata: {
        receivables: number(balances.outstanding),
        studentCredits: number(balances.available_credit),
        deferredFees: number(balances.deferred),
      },
    });
    await tx.accountingBook.update({
      where: { id: book.id },
      data: {
        status: AccountingBookStatus.ACTIVE,
        cutoverAt: input.cutoverDate,
        activatedAt: new Date(),
        activatedById: actorId,
      },
    });
    await audit(
      tx,
      actorId,
      "ACCOUNTING_ACTIVATED",
      "AccountingBook",
      book.id,
      {
        fiscalYearId: fiscalYear.id,
        journalId: journal.id,
      },
    );
    return { bookId: book.id, journalId: journal.id };
  });
}

export async function listAccounts(includeArchived = false) {
  const book = await prisma.accountingBook.findUnique({
    where: { domain: AccountingBookDomain.SCHOOL },
  });
  if (!book) return [];
  return prisma.account.findMany({
    where: { bookId: book.id, ...(includeArchived ? {} : { active: true }) },
    include: {
      parent: true,
      moneyAccount: true,
      _count: { select: { journalLines: true } },
    },
    orderBy: { code: "asc" },
  });
}

export async function createAccount(
  actorId: string,
  input: {
    code: string;
    name: string;
    type: AccountType;
    parentId?: string | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    const book = await schoolBook(tx, false);
    const account = await tx.account.create({
      data: { ...input, bookId: book.id },
    });
    await audit(tx, actorId, "ACCOUNT_CREATED", "Account", account.id);
    return account;
  });
}

export async function updateAccount(
  actorId: string,
  id: string,
  input: Partial<{
    code: string;
    name: string;
    type: AccountType;
    parentId: string | null;
    active: boolean;
  }>,
) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({
      where: { id },
      include: { _count: { select: { journalLines: true } } },
    });
    if (!account) throw AppError.notFound("Account not found.");
    if (account._count.journalLines && (input.code || input.type))
      throw AppError.badRequest(
        "A used account may be renamed or archived, but not recoded.",
      );
    if (account.systemKey && input.active === false)
      throw AppError.badRequest("A system control account cannot be archived.");
    const updated = await tx.account.update({ where: { id }, data: input });
    await audit(tx, actorId, "ACCOUNT_UPDATED", "Account", id);
    return updated;
  });
}

export async function listMoneyAccounts() {
  return prisma.moneyAccount.findMany({
    include: { account: true, methodMappings: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export async function createMoneyAccount(
  actorId: string,
  input: {
    accountId: string;
    name: string;
    type: MoneyAccountType;
    institution?: string | null;
    accountNumber?: string | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({
      where: { id: input.accountId },
    });
    if (!account || account.type !== AccountType.ASSET)
      throw AppError.badRequest(
        "Money accounts require an asset ledger account.",
      );
    const money = await tx.moneyAccount.create({ data: input });
    await audit(tx, actorId, "MONEY_ACCOUNT_CREATED", "MoneyAccount", money.id);
    return money;
  });
}

export async function setPaymentMethodAccount(
  actorId: string,
  method: FeePaymentMethod,
  moneyAccountId: string,
) {
  return prisma.$transaction(async (tx) => {
    const book = await schoolBook(tx, false);
    const money = await tx.moneyAccount.findUnique({
      where: { id: moneyAccountId },
      include: { account: true },
    });
    if (!money || money.account.bookId !== book.id || !money.active)
      throw AppError.badRequest(
        "Select an active money account from this book.",
      );
    const mapping = await tx.paymentMethodAccount.upsert({
      where: { bookId_method: { bookId: book.id, method } },
      create: { bookId: book.id, method, moneyAccountId },
      update: { moneyAccountId },
    });
    await audit(
      tx,
      actorId,
      "PAYMENT_METHOD_MAPPED",
      "AccountingBook",
      book.id,
      { method },
    );
    return mapping;
  });
}

export async function saveFeeMappings(
  actorId: string,
  mappings: { feeItemId: string; incomeAccountId: string }[],
) {
  return prisma.$transaction(async (tx) => {
    const book = await schoolBook(tx, false);
    for (const mapping of mappings) {
      const account = await tx.account.findUnique({
        where: { id: mapping.incomeAccountId },
      });
      if (
        !account ||
        account.bookId !== book.id ||
        account.type !== AccountType.INCOME
      )
        throw AppError.badRequest(
          "Fee items must map to active income accounts.",
        );
      await tx.feeAccountMapping.upsert({
        where: {
          bookId_feeItemId: { bookId: book.id, feeItemId: mapping.feeItemId },
        },
        create: { bookId: book.id, ...mapping },
        update: { incomeAccountId: mapping.incomeAccountId },
      });
    }
    await audit(tx, actorId, "FEE_ACCOUNTS_MAPPED", "AccountingBook", book.id, {
      count: mappings.length,
    });
    return { saved: mappings.length };
  });
}

export async function listJournals(filters: {
  fiscalYearId?: string;
  status?: JournalStatus;
}) {
  const book = await prisma.accountingBook.findUnique({
    where: { domain: AccountingBookDomain.SCHOOL },
  });
  if (!book) return [];
  return prisma.journalEntry.findMany({
    where: {
      fiscalYear: { bookId: book.id },
      ...(filters.fiscalYearId && { fiscalYearId: filters.fiscalYearId }),
      ...(filters.status && { status: filters.status }),
    },
    include: {
      fiscalYear: true,
      lines: { include: { account: true } },
      reversal: { select: { id: true, number: true } },
      reversalOf: { select: { id: true, number: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

export async function createManualJournal(
  actorId: string,
  input: { date: Date; description: string; lines: PostingLine[] },
) {
  return prisma.$transaction(async (tx) => {
    const book = await schoolBook(tx);
    validateLines(input.lines);
    const { fiscalYear, period } = await findFiscalYear(
      tx,
      book.id,
      input.date,
    );
    const journal = await tx.journalEntry.create({
      data: {
        fiscalYearId: fiscalYear.id,
        periodId: period.id,
        date: input.date,
        description: input.description,
        source: JournalSource.MANUAL,
        preparedById: actorId,
        lines: {
          create: input.lines.map((line) => ({
            accountId: line.accountId,
            description: line.description,
            debit: decimal(line.debit),
            credit: decimal(line.credit),
          })),
        },
      },
      include: { lines: true },
    });
    await audit(
      tx,
      actorId,
      "MANUAL_JOURNAL_CREATED",
      "JournalEntry",
      journal.id,
    );
    return journal;
  });
}

export async function submitManualJournal(actorId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const journal = await tx.journalEntry.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!journal || journal.source !== JournalSource.MANUAL)
      throw AppError.notFound("Manual journal not found.");
    if (journal.status !== JournalStatus.DRAFT)
      throw AppError.badRequest("Only draft journals can be submitted.");
    validateLines(journal.lines);
    const updated = await tx.journalEntry.update({
      where: { id },
      data: { status: JournalStatus.PENDING_APPROVAL, submittedAt: new Date() },
    });
    await audit(tx, actorId, "JOURNAL_SUBMITTED", "JournalEntry", id);
    return updated;
  });
}

export async function decideManualJournal(
  actorId: string,
  id: string,
  approved: boolean,
) {
  return serializable(async (tx) => {
    const journal = await tx.journalEntry.findUnique({
      where: { id },
      include: { fiscalYear: true, period: true, lines: true },
    });
    if (!journal || journal.source !== JournalSource.MANUAL)
      throw AppError.notFound("Manual journal not found.");
    if (journal.status !== JournalStatus.PENDING_APPROVAL)
      throw AppError.badRequest("This journal is not awaiting approval.");
    if (!approved) {
      const rejected = await tx.journalEntry.update({
        where: { id },
        data: { status: JournalStatus.DRAFT, submittedAt: null },
      });
      await audit(tx, actorId, "JOURNAL_REJECTED", "JournalEntry", id);
      return rejected;
    }
    validateLines(journal.lines);
    if (journal.period?.status === AccountingPeriodStatus.CLOSED)
      throw AppError.badRequest("The journal period has been closed.");
    const numberValue = await nextJournalNumber(
      tx,
      journal.fiscalYearId,
      journal.fiscalYear.name,
    );
    const posted = await tx.journalEntry.update({
      where: { id },
      data: {
        number: numberValue,
        status: JournalStatus.POSTED,
        approvedById: actorId,
        postedAt: new Date(),
      },
    });
    await audit(tx, actorId, "JOURNAL_APPROVED", "JournalEntry", id, {
      number: numberValue,
    });
    return posted;
  });
}

export async function reverseJournal(
  actorId: string,
  id: string,
  reason: string,
  txOverride?: Tx,
) {
  const work = async (tx: Tx) => {
    const journal = await tx.journalEntry.findUnique({
      where: { id },
      include: { fiscalYear: true, lines: true, reversal: true },
    });
    if (!journal || journal.status !== JournalStatus.POSTED)
      throw AppError.badRequest("Only posted journals can be reversed.");
    if (journal.reversal) return journal.reversal;
    const reversal = await createPostedJournal(tx, {
      actorId,
      bookId: journal.fiscalYear.bookId,
      date: new Date(),
      description: `Reversal of ${journal.number}: ${reason}`,
      source: JournalSource.PAYMENT_REVERSAL,
      sourceKey: `REVERSAL:${journal.id}`,
      lines: journal.lines.map((line) => ({
        accountId: line.accountId,
        description: `Reversal: ${line.description ?? journal.description}`,
        debit: line.credit,
        credit: line.debit,
        studentId: line.studentId,
      })),
      links: [{ entityType: "JournalEntry", entityId: journal.id }],
      metadata: { reason, reversedJournal: journal.number },
    });
    await tx.journalEntry.update({
      where: { id: reversal.id },
      data: { reversalOfId: journal.id, reversedById: actorId },
    });
    await tx.journalEntry.update({
      where: { id: journal.id },
      data: { status: JournalStatus.REVERSED },
    });
    await audit(tx, actorId, "JOURNAL_REVERSED", "JournalEntry", journal.id, {
      reversalId: reversal.id,
      reason,
    });
    return reversal;
  };
  return txOverride ? work(txOverride) : serializable(work);
}

async function nextExpenseNumber(
  tx: Tx,
  fiscalYearId: string,
  yearName: string,
) {
  const sequence = await tx.expenseSequence.upsert({
    where: { fiscalYearId },
    create: { fiscalYearId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  const code = yearName.replace(/[^0-9]/g, "").slice(0, 8);
  return `EXP-${code}-${String(sequence.lastNumber).padStart(6, "0")}`;
}

export async function listExpenses(status?: ExpenseStatus) {
  return prisma.expense.findMany({
    where: status ? { status } : {},
    include: {
      fiscalYear: true,
      lines: true,
      payments: {
        where: { reversedAt: null },
        include: { moneyAccount: true },
      },
      attachments: true,
      approvalJournal: true,
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

export async function addExpenseAttachment(
  actorId: string,
  expenseId: string,
  input: { filename: string; contentBase64: string },
) {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense) throw AppError.notFound("Expense not found.");
  if (expense.status !== ExpenseStatus.DRAFT)
    throw AppError.badRequest(
      "Attachments can only be added while an expense is draft.",
    );
  const data = Buffer.from(input.contentBase64, "base64");
  if (!data.length || data.length > 10_000_000)
    throw AppError.badRequest(
      "Expense attachments must be between 1 byte and 10 MB.",
    );
  const filename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const checksum = crypto.createHash("sha256").update(data).digest("hex");
  const storagePath = `expenses/${expenseId}/${crypto.randomUUID()}-${filename}`;
  await saveAccountingDocument(storagePath, data);
  return prisma.$transaction(async (tx) => {
    const attachment = await tx.expenseAttachment.create({
      data: {
        expenseId,
        filename: input.filename,
        storagePath,
        checksum,
        uploadedById: actorId,
      },
    });
    await audit(tx, actorId, "EXPENSE_ATTACHMENT_ADDED", "Expense", expenseId, {
      attachmentId: attachment.id,
      checksum,
    });
    return attachment;
  });
}

export async function getExpenseAttachment(
  expenseId: string,
  attachmentId: string,
) {
  const attachment = await prisma.expenseAttachment.findFirst({
    where: { id: attachmentId, expenseId },
  });
  if (!attachment) throw AppError.notFound("Expense attachment not found.");
  return {
    ...attachment,
    data: await readAccountingDocument(attachment.storagePath),
  };
}

export async function createExpense(
  actorId: string,
  input: {
    date: Date;
    dueDate?: Date | null;
    payee: string;
    reference?: string | null;
    description: string;
    missingDocumentReason?: string | null;
    lines: { accountId: string; description: string; amount: number }[];
  },
) {
  return serializable(async (tx) => {
    const book = await schoolBook(tx);
    const { fiscalYear } = await findFiscalYear(tx, book.id, input.date);
    const accounts = await tx.account.findMany({
      where: {
        id: { in: input.lines.map((line) => line.accountId) },
        bookId: book.id,
      },
    });
    if (
      accounts.length !==
        new Set(input.lines.map((line) => line.accountId)).size ||
      accounts.some((account) => account.type !== AccountType.EXPENSE)
    )
      throw AppError.badRequest(
        "Expense lines must use active expense accounts.",
      );
    const total = input.lines.reduce(
      (sum, line) => sum.plus(line.amount),
      ZERO,
    );
    const expense = await tx.expense.create({
      data: {
        fiscalYearId: fiscalYear.id,
        number: await nextExpenseNumber(tx, fiscalYear.id, fiscalYear.name),
        date: input.date,
        dueDate: input.dueDate,
        payee: input.payee,
        reference: input.reference,
        description: input.description,
        missingDocumentReason: input.missingDocumentReason,
        total,
        createdById: actorId,
        lines: { create: input.lines },
      },
      include: { lines: true },
    });
    await audit(tx, actorId, "EXPENSE_CREATED", "Expense", expense.id, {
      number: expense.number,
      total: total.toFixed(2),
    });
    return expense;
  });
}

export async function submitExpense(actorId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.findUnique({
      where: { id },
      include: { attachments: true },
    });
    if (!expense) throw AppError.notFound("Expense not found.");
    if (expense.status !== ExpenseStatus.DRAFT)
      throw AppError.badRequest("Only draft expenses can be submitted.");
    if (!expense.attachments.length && !expense.missingDocumentReason)
      throw AppError.badRequest(
        "Attach supporting evidence or explain why it is unavailable.",
      );
    const updated = await tx.expense.update({
      where: { id },
      data: { status: ExpenseStatus.PENDING_APPROVAL, submittedAt: new Date() },
    });
    await audit(tx, actorId, "EXPENSE_SUBMITTED", "Expense", id);
    return updated;
  });
}

export async function decideExpense(
  actorId: string,
  id: string,
  approved: boolean,
  reason?: string,
) {
  return serializable(async (tx) => {
    const expense = await tx.expense.findUnique({
      where: { id },
      include: { fiscalYear: true, lines: true },
    });
    if (!expense) throw AppError.notFound("Expense not found.");
    if (expense.status !== ExpenseStatus.PENDING_APPROVAL)
      throw AppError.badRequest("This expense is not awaiting approval.");
    if (!approved) {
      const rejected = await tx.expense.update({
        where: { id },
        data: {
          status: ExpenseStatus.REJECTED,
          rejectedById: actorId,
          rejectedAt: new Date(),
          rejectionReason: reason || "Rejected",
        },
      });
      await audit(tx, actorId, "EXPENSE_REJECTED", "Expense", id, { reason });
      return rejected;
    }
    const book = await schoolBook(tx);
    const controls = await systemAccounts(tx, book.id);
    const journal = await createPostedJournal(tx, {
      actorId,
      bookId: book.id,
      date: expense.date,
      description: `Expense ${expense.number}: ${expense.description}`,
      source: JournalSource.EXPENSE_APPROVAL,
      sourceKey: `EXPENSE_APPROVAL:${expense.id}`,
      lines: [
        ...expense.lines.map((line) => ({
          accountId: line.accountId,
          description: line.description,
          debit: line.amount,
          credit: ZERO,
        })),
        {
          accountId: controls.get(AccountSystemKey.ACCOUNTS_PAYABLE)!.id,
          description: expense.payee,
          debit: ZERO,
          credit: expense.total,
        },
      ],
      links: [{ entityType: "Expense", entityId: expense.id }],
    });
    const updated = await tx.expense.update({
      where: { id },
      data: {
        status: ExpenseStatus.APPROVED,
        approvedById: actorId,
        approvedAt: new Date(),
        approvalJournalId: journal.id,
      },
    });
    await audit(tx, actorId, "EXPENSE_APPROVED", "Expense", id, {
      journalId: journal.id,
    });
    return updated;
  });
}

export async function payExpense(
  actorId: string,
  id: string,
  input: {
    amount: number;
    date: Date;
    moneyAccountId: string;
    transactionRef?: string | null;
  },
) {
  return serializable(async (tx) => {
    const expense = await tx.expense.findUnique({
      where: { id },
      include: { payments: { where: { reversedAt: null } }, fiscalYear: true },
    });
    if (
      !expense ||
      (expense.status !== ExpenseStatus.APPROVED &&
        expense.status !== ExpenseStatus.PARTIALLY_PAID)
    )
      throw AppError.badRequest("Only approved unpaid expenses can be paid.");
    const paid = expense.payments.reduce(
      (sum, payment) => sum.plus(payment.amount),
      ZERO,
    );
    const remaining = expense.total.minus(paid);
    if (decimal(input.amount).gt(remaining))
      throw AppError.badRequest("Payment exceeds the expense balance.");
    const money = await tx.moneyAccount.findUnique({
      where: { id: input.moneyAccountId },
      include: { account: true },
    });
    if (!money?.active)
      throw AppError.badRequest("Select an active money account.");
    const book = await schoolBook(tx);
    const controls = await systemAccounts(tx, book.id);
    const paymentId = crypto.randomUUID();
    const journal = await createPostedJournal(tx, {
      actorId,
      bookId: book.id,
      date: input.date,
      description: `Payment of ${expense.number} to ${expense.payee}`,
      source: JournalSource.EXPENSE_PAYMENT,
      sourceKey: `EXPENSE_PAYMENT:${paymentId}`,
      lines: [
        {
          accountId: controls.get(AccountSystemKey.ACCOUNTS_PAYABLE)!.id,
          description: expense.payee,
          debit: input.amount,
          credit: ZERO,
        },
        {
          accountId: money.accountId,
          description: input.transactionRef || expense.number,
          debit: ZERO,
          credit: input.amount,
        },
      ],
      links: [{ entityType: "Expense", entityId: expense.id }],
    });
    const payment = await tx.expensePayment.create({
      data: {
        id: paymentId,
        expenseId: expense.id,
        moneyAccountId: money.id,
        journalEntryId: journal.id,
        amount: input.amount,
        date: input.date,
        transactionRef: input.transactionRef,
        recordedById: actorId,
      },
    });
    const newPaid = paid.plus(input.amount);
    await tx.expense.update({
      where: { id },
      data: {
        status: newPaid.eq(expense.total)
          ? ExpenseStatus.PAID
          : ExpenseStatus.PARTIALLY_PAID,
      },
    });
    await audit(tx, actorId, "EXPENSE_PAID", "Expense", id, {
      amount: input.amount,
      journalId: journal.id,
    });
    return payment;
  });
}

export async function reverseExpense(
  actorId: string,
  id: string,
  reason: string,
) {
  return serializable(async (tx) => {
    const expense = await tx.expense.findUnique({
      where: { id },
      include: { payments: { where: { reversedAt: null } } },
    });
    if (!expense || expense.status === ExpenseStatus.REVERSED)
      throw AppError.badRequest("This expense cannot be reversed.");
    for (const payment of expense.payments) {
      await reverseJournal(actorId, payment.journalEntryId, reason, tx);
      await tx.expensePayment.update({
        where: { id: payment.id },
        data: { reversedAt: new Date() },
      });
    }
    if (expense.approvalJournalId)
      await reverseJournal(actorId, expense.approvalJournalId, reason, tx);
    const updated = await tx.expense.update({
      where: { id },
      data: { status: ExpenseStatus.REVERSED },
    });
    await audit(tx, actorId, "EXPENSE_REVERSED", "Expense", id, { reason });
    return updated;
  });
}

function parseCsv(csv: string) {
  const rows = csv.trim().split(/\r?\n/);
  const headers =
    rows
      .shift()
      ?.split(",")
      .map((value) => value.trim().toLowerCase()) ?? [];
  const required = ["date", "description", "amount"];
  if (required.some((header) => !headers.includes(header)))
    throw AppError.badRequest(
      "CSV headers must include date, description and amount.",
    );
  return rows
    .filter((row) => row.trim())
    .map((row) => {
      const values = row.split(",").map((value) => value.trim());
      const get = (name: string) => values[headers.indexOf(name)] ?? "";
      const date = new Date(`${get("date")}T00:00:00.000Z`);
      const amount = decimal(get("amount"));
      if (Number.isNaN(date.getTime()) || amount.eq(0))
        throw AppError.badRequest(
          "Every statement row needs a valid date and non-zero amount.",
        );
      return {
        date,
        description: get("description"),
        reference: get("reference") || null,
        amount,
      };
    });
}

export async function importBankStatement(
  actorId: string,
  input: {
    moneyAccountId: string;
    filename: string;
    periodStart: Date;
    periodEnd: Date;
    csv: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const money = await tx.moneyAccount.findUnique({
      where: { id: input.moneyAccountId },
    });
    if (!money || money.type === MoneyAccountType.CASH)
      throw AppError.badRequest("Select a bank or electronic money account.");
    const checksum = crypto
      .createHash("sha256")
      .update(input.csv)
      .digest("hex");
    const existing = await tx.bankStatementImport.findUnique({
      where: {
        moneyAccountId_checksum: { moneyAccountId: money.id, checksum },
      },
    });
    if (existing)
      throw AppError.conflict("This statement file was already imported.");
    const rows = parseCsv(input.csv);
    const statementImport = await tx.bankStatementImport.create({
      data: {
        moneyAccountId: money.id,
        filename: input.filename,
        checksum,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        importedById: actorId,
      },
    });
    let imported = 0;
    let duplicates = 0;
    for (const row of rows) {
      const fingerprint = crypto
        .createHash("sha256")
        .update(
          [
            money.id,
            row.date.toISOString(),
            row.description,
            row.reference ?? "",
            row.amount.toFixed(2),
          ].join("|"),
        )
        .digest("hex");
      const result = await tx.bankStatementLine.createMany({
        data: [
          {
            importId: statementImport.id,
            moneyAccountId: money.id,
            date: row.date,
            description: row.description,
            reference: row.reference,
            amount: row.amount,
            fingerprint,
          },
        ],
        skipDuplicates: true,
      });
      imported += result.count;
      duplicates += result.count ? 0 : 1;
    }
    await audit(
      tx,
      actorId,
      "BANK_STATEMENT_IMPORTED",
      "BankStatementImport",
      statementImport.id,
      {
        imported,
        duplicates,
      },
    );
    return { statementImport, imported, duplicates };
  });
}

export async function getReconciliationWorkspace(moneyAccountId?: string) {
  const accounts = await listMoneyAccounts();
  const selectedId =
    moneyAccountId ??
    accounts.find((account) => account.type !== MoneyAccountType.CASH)?.id;
  if (!selectedId)
    return { accounts, statementLines: [], ledgerLines: [], cashCounts: [] };
  const [statementLines, money, cashCounts] = await Promise.all([
    prisma.bankStatementLine.findMany({
      where: { moneyAccountId: selectedId },
      include: { matches: true },
      orderBy: { date: "desc" },
      take: 200,
    }),
    prisma.moneyAccount.findUnique({ where: { id: selectedId } }),
    prisma.cashCount.findMany({
      where: { moneyAccountId: selectedId },
      orderBy: { date: "desc" },
      take: 50,
    }),
  ]);
  const ledgerLines = money
    ? await prisma.journalLine.findMany({
        where: {
          accountId: money.accountId,
          journal: { status: JournalStatus.POSTED },
        },
        include: { journal: true, reconciliationMatches: true },
        orderBy: { journal: { date: "desc" } },
        take: 200,
      })
    : [];
  return {
    accounts,
    statementLines: statementLines.map((line) => ({
      ...line,
      amount: number(line.amount),
      matched: number(
        line.matches.reduce((sum, match) => sum.plus(match.amount), ZERO),
      ),
    })),
    ledgerLines: ledgerLines.map((line) => ({
      ...line,
      date: line.journal.date,
      description: line.description ?? line.journal.description,
      debit: number(line.debit),
      credit: number(line.credit),
      amount: number(line.debit.minus(line.credit)),
      matched: number(
        line.reconciliationMatches.reduce(
          (sum, match) => sum.plus(match.amount),
          ZERO,
        ),
      ),
    })),
    cashCounts: cashCounts.map((count) => ({
      ...count,
      expected: number(count.expected),
      counted: number(count.counted),
      difference: number(count.difference),
    })),
  };
}

export async function matchReconciliation(
  actorId: string,
  statementLineId: string,
  matches: { journalLineId: string; amount: number }[],
) {
  return prisma.$transaction(async (tx) => {
    const statement = await tx.bankStatementLine.findUnique({
      where: { id: statementLineId },
      include: { matches: true, moneyAccount: true },
    });
    if (!statement) throw AppError.notFound("Statement line not found.");
    const requested = matches.reduce(
      (sum, match) => sum.plus(match.amount),
      ZERO,
    );
    const statementUsed = statement.matches.reduce(
      (sum, match) => sum.plus(match.amount),
      ZERO,
    );
    if (requested.plus(statementUsed).gt(statement.amount.abs()))
      throw AppError.badRequest("Matches exceed the statement-line amount.");
    const ledgerLines = await tx.journalLine.findMany({
      where: {
        id: { in: matches.map((match) => match.journalLineId) },
        accountId: statement.moneyAccount.accountId,
        journal: { status: JournalStatus.POSTED },
      },
      include: { reconciliationMatches: true },
    });
    if (
      ledgerLines.length !==
      new Set(matches.map((match) => match.journalLineId)).size
    )
      throw AppError.badRequest(
        "Every match must use a posted line from the selected money account.",
      );
    for (const match of matches) {
      const line = ledgerLines.find((item) => item.id === match.journalLineId)!;
      const used = line.reconciliationMatches.reduce(
        (sum, item) => sum.plus(item.amount),
        ZERO,
      );
      if (used.plus(match.amount).gt(line.debit.minus(line.credit).abs()))
        throw AppError.badRequest(
          "A match exceeds the available ledger amount.",
        );
    }
    await tx.reconciliationMatch.createMany({
      data: matches.map((match) => ({
        statementLineId,
        ...match,
        matchedById: actorId,
      })),
    });
    await audit(
      tx,
      actorId,
      "RECONCILIATION_MATCHED",
      "BankStatementLine",
      statementLineId,
      {
        amount: requested.toFixed(2),
      },
    );
    return { matched: number(requested) };
  });
}

export async function createReconciliationDraftJournal(
  actorId: string,
  input: {
    statementLineId: string;
    offsetAccountId: string;
    description: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const statement = await tx.bankStatementLine.findUnique({
      where: { id: input.statementLineId },
      include: { matches: true, moneyAccount: { include: { account: true } } },
    });
    if (!statement) throw AppError.notFound("Statement line not found.");
    const matched = statement.matches.reduce(
      (sum, item) => sum.plus(item.amount),
      ZERO,
    );
    const available = statement.amount.abs().minus(matched);
    if (available.lte(0))
      throw AppError.badRequest(
        "This statement line is already fully matched.",
      );
    const book = await schoolBook(tx);
    const offset = await tx.account.findUnique({
      where: { id: input.offsetAccountId },
    });
    if (
      !offset?.active ||
      offset.bookId !== book.id ||
      offset.id === statement.moneyAccount.accountId
    )
      throw AppError.badRequest(
        "Select another active account for the draft journal.",
      );
    const { fiscalYear, period } = await findFiscalYear(
      tx,
      book.id,
      statement.date,
    );
    const incoming = statement.amount.gt(0);
    const lines: PostingLine[] = incoming
      ? [
          {
            accountId: statement.moneyAccount.accountId,
            debit: available,
            credit: ZERO,
          },
          { accountId: offset.id, debit: ZERO, credit: available },
        ]
      : [
          { accountId: offset.id, debit: available, credit: ZERO },
          {
            accountId: statement.moneyAccount.accountId,
            debit: ZERO,
            credit: available,
          },
        ];
    validateLines(lines);
    const journal = await tx.journalEntry.create({
      data: {
        fiscalYearId: fiscalYear.id,
        periodId: period.id,
        date: statement.date,
        description: input.description,
        source: JournalSource.RECONCILIATION,
        sourceKey: `RECON_DRAFT:${statement.id}:${crypto.randomUUID()}`,
        preparedById: actorId,
        lines: { create: lines },
        sourceLinks: {
          create: { entityType: "BankStatementLine", entityId: statement.id },
        },
      },
      include: { lines: { include: { account: true } } },
    });
    await audit(
      tx,
      actorId,
      "RECONCILIATION_DRAFT_CREATED",
      "JournalEntry",
      journal.id,
      {
        statementLineId: statement.id,
      },
    );
    return journal;
  });
}

async function accountBalance(tx: Tx, accountId: string, throughDate: Date) {
  const aggregate = await tx.journalLine.aggregate({
    where: {
      accountId,
      journal: { status: JournalStatus.POSTED, date: { lte: throughDate } },
    },
    _sum: { debit: true, credit: true },
  });
  return decimal(aggregate._sum.debit).minus(decimal(aggregate._sum.credit));
}

export async function createCashCount(
  actorId: string,
  input: { moneyAccountId: string; date: Date; counted: number },
) {
  return prisma.$transaction(async (tx) => {
    const money = await tx.moneyAccount.findUnique({
      where: { id: input.moneyAccountId },
    });
    if (!money || money.type !== MoneyAccountType.CASH)
      throw AppError.badRequest("Cash counts require a cash money account.");
    const expected = await accountBalance(tx, money.accountId, input.date);
    const counted = decimal(input.counted);
    const count = await tx.cashCount.create({
      data: {
        moneyAccountId: money.id,
        date: input.date,
        expected,
        counted,
        difference: counted.minus(expected),
        countedById: actorId,
      },
    });
    await audit(tx, actorId, "CASH_COUNT_CREATED", "CashCount", count.id);
    return count;
  });
}

export async function approveCashCount(actorId: string, id: string) {
  return serializable(async (tx) => {
    const count = await tx.cashCount.findUnique({
      where: { id },
      include: { moneyAccount: true },
    });
    if (!count || count.status !== ReconciliationStatus.PENDING_APPROVAL)
      throw AppError.badRequest("This cash count is not awaiting approval.");
    const book = await schoolBook(tx);
    let journalId: string | null = null;
    if (!count.difference.eq(0)) {
      const controls = await systemAccounts(tx, book.id);
      const overShort = controls.get(AccountSystemKey.CASH_OVER_SHORT)!;
      const journal = await createPostedJournal(tx, {
        actorId,
        bookId: book.id,
        date: count.date,
        description: `Cash-count difference ${isoDate(count.date)}`,
        source: JournalSource.CASH_COUNT,
        sourceKey: `CASH_COUNT:${count.id}`,
        lines: count.difference.gt(0)
          ? [
              {
                accountId: count.moneyAccount.accountId,
                debit: count.difference,
                credit: ZERO,
              },
              {
                accountId: overShort.id,
                debit: ZERO,
                credit: count.difference,
              },
            ]
          : [
              {
                accountId: overShort.id,
                debit: count.difference.abs(),
                credit: ZERO,
              },
              {
                accountId: count.moneyAccount.accountId,
                debit: ZERO,
                credit: count.difference.abs(),
              },
            ],
        links: [{ entityType: "CashCount", entityId: count.id }],
      });
      journalId = journal.id;
    }
    const updated = await tx.cashCount.update({
      where: { id },
      data: {
        status: ReconciliationStatus.APPROVED,
        approvedById: actorId,
        approvedAt: new Date(),
        journalEntryId: journalId,
      },
    });
    await audit(tx, actorId, "CASH_COUNT_APPROVED", "CashCount", id, {
      journalId,
    });
    return updated;
  });
}

function dateWhere(dateFrom?: string, dateTo?: string) {
  return {
    ...(dateFrom && { gte: new Date(`${dateFrom}T00:00:00.000Z`) }),
    ...(dateTo && { lte: new Date(`${dateTo}T23:59:59.999Z`) }),
  };
}

export async function getAccountingReports(filters: {
  fiscalYearId?: string;
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
}) {
  const book = await prisma.accountingBook.findUnique({
    where: { domain: AccountingBookDomain.SCHOOL },
  });
  if (!book) return null;
  const fiscalYear = filters.fiscalYearId
    ? await prisma.accountingFiscalYear.findUnique({
        where: { id: filters.fiscalYearId },
      })
    : await prisma.accountingFiscalYear.findFirst({
        where: { bookId: book.id, status: AccountingPeriodStatus.OPEN },
        orderBy: { startDate: "desc" },
      });
  if (!fiscalYear) return null;
  const date = dateWhere(filters.dateFrom, filters.dateTo);
  const lines = await prisma.journalLine.findMany({
    where: {
      ...(filters.accountId && { accountId: filters.accountId }),
      journal: {
        fiscalYearId: fiscalYear.id,
        status: JournalStatus.POSTED,
        ...(Object.keys(date).length && { date }),
      },
    },
    include: { account: true, journal: true },
    orderBy: [{ account: { code: "asc" } }, { journal: { date: "asc" } }],
  });
  const accounts = await prisma.account.findMany({
    where: { bookId: book.id },
    orderBy: { code: "asc" },
  });
  const balances = new Map<
    string,
    { debit: Prisma.Decimal; credit: Prisma.Decimal }
  >();
  for (const line of lines) {
    const value = balances.get(line.accountId) ?? { debit: ZERO, credit: ZERO };
    value.debit = value.debit.plus(line.debit);
    value.credit = value.credit.plus(line.credit);
    balances.set(line.accountId, value);
  }
  const trialBalance = accounts
    .map((account) => {
      const value = balances.get(account.id) ?? { debit: ZERO, credit: ZERO };
      return {
        account,
        debit: number(value.debit),
        credit: number(value.credit),
        balance: number(value.debit.minus(value.credit)),
      };
    })
    .filter((row) => row.debit || row.credit);
  const typeBalance = (type: AccountType) =>
    trialBalance
      .filter((row) => row.account.type === type)
      .reduce((sum, row) => sum.plus(row.balance), ZERO);
  const income = typeBalance(AccountType.INCOME).negated();
  const expenseTotal = typeBalance(AccountType.EXPENSE);
  const assets = typeBalance(AccountType.ASSET);
  const liabilities = typeBalance(AccountType.LIABILITY).negated();
  const equity = typeBalance(AccountType.EQUITY).negated();
  const [moneyAccounts, expenseRows, statementLines, controls] =
    await Promise.all([
      prisma.moneyAccount.findMany({
        include: { account: true },
        orderBy: { name: "asc" },
      }),
      prisma.expense.findMany({
        where: { fiscalYearId: fiscalYear.id },
        include: { payments: { where: { reversedAt: null } } },
        orderBy: { date: "asc" },
      }),
      prisma.bankStatementLine.findMany({
        include: { matches: true, moneyAccount: true },
        orderBy: { date: "asc" },
      }),
      prisma.$transaction((tx) => openingControlBalances(tx)),
    ]);
  const generalLedger = lines.map((line) => ({
    id: line.id,
    accountId: line.accountId,
    accountCode: line.account.code,
    accountName: line.account.name,
    journalNumber: line.journal.number,
    date: line.journal.date,
    description: line.description ?? line.journal.description,
    debit: number(line.debit),
    credit: number(line.credit),
  }));
  const moneyByAccount = new Map(
    moneyAccounts.map((item) => [item.accountId, item]),
  );
  const reconciliationByAccount = moneyAccounts.map((moneyAccount) => {
    const accountLines = statementLines.filter(
      (line) => line.moneyAccountId === moneyAccount.id,
    );
    const statementAmount = accountLines.reduce(
      (sum, line) => sum.plus(line.amount.abs()),
      ZERO,
    );
    const matchedAmount = accountLines.reduce(
      (sum, line) =>
        sum.plus(
          line.matches.reduce(
            (matched, item) => matched.plus(item.amount),
            ZERO,
          ),
        ),
      ZERO,
    );
    return {
      moneyAccountId: moneyAccount.id,
      name: moneyAccount.name,
      statementAmount: number(statementAmount),
      matchedAmount: number(matchedAmount),
      unmatchedAmount: number(statementAmount.minus(matchedAmount)),
      unmatchedLines: accountLines.filter((line) => line.matches.length === 0)
        .length,
    };
  });
  const receivableAccount = accounts.find(
    (account) => account.systemKey === AccountSystemKey.ACCOUNTS_RECEIVABLE,
  );
  const receivableLedgerBalance = receivableAccount
    ? (trialBalance.find((row) => row.account.id === receivableAccount.id)
        ?.balance ?? 0)
    : 0;
  return {
    book,
    fiscalYear,
    cutoverNotice: book.cutoverAt
      ? `Profit-and-loss activity begins at the accounting cutover date ${isoDate(book.cutoverAt)}.`
      : null,
    trialBalance,
    generalLedger,
    cashBankBook: generalLedger
      .filter((line) => moneyByAccount.has(line.accountId))
      .map((line) => ({
        ...line,
        moneyAccountName: moneyByAccount.get(line.accountId)!.name,
      })),
    expenseRegister: expenseRows.map((expense) => ({
      id: expense.id,
      number: expense.number,
      date: expense.date,
      payee: expense.payee,
      description: expense.description,
      status: expense.status,
      total: number(expense.total),
      paid: number(
        expense.payments.reduce(
          (sum, payment) => sum.plus(payment.amount),
          ZERO,
        ),
      ),
    })),
    reconciliationSummary: reconciliationByAccount,
    receivableControl: {
      ledgerBalance: number(receivableLedgerBalance),
      financeOutstanding: number(controls.outstanding),
      difference: number(
        decimal(receivableLedgerBalance).minus(controls.outstanding),
      ),
      reconciled: decimal(receivableLedgerBalance).eq(controls.outstanding),
    },
    incomeStatement: {
      income: number(income),
      expenses: number(expenseTotal),
      surplus: number(income.minus(expenseTotal)),
    },
    balanceSheet: {
      assets: number(assets),
      liabilities: number(liabilities),
      equity: number(equity),
    },
  };
}

export async function generateAccountingReportPdf(
  filters: {
    fiscalYearId?: string;
    dateFrom?: string;
    dateTo?: string;
    accountId?: string;
  },
  type:
    | "trial-balance"
    | "general-ledger"
    | "income-statement"
    | "balance-sheet"
    | "cash-bank-book"
    | "expense-register"
    | "reconciliation-summary"
    | "receivable-control",
) {
  const [report, school] = await Promise.all([
    getAccountingReports(filters),
    prisma.schoolProfile.findUnique({ where: { id: "default" } }),
  ]);
  if (!report) throw AppError.notFound("No accounting report is available.");
  const rows =
    type === "general-ledger"
      ? report.generalLedger.map((row) => ({
          label: `${row.accountCode} ${row.accountName}`,
          context: `${isoDate(row.date)} · ${row.journalNumber ?? "Draft"} · ${row.description}`,
          debit: row.debit,
          credit: row.credit,
        }))
      : type === "cash-bank-book"
        ? report.cashBankBook.map((row) => ({
            label: `${row.moneyAccountName} · ${row.description}`,
            context: `${isoDate(row.date)} · ${row.journalNumber ?? "Draft"}`,
            debit: row.debit,
            credit: row.credit,
          }))
        : type === "expense-register"
          ? report.expenseRegister.map((row) => ({
              label: `${row.number} · ${row.payee}`,
              context: `${isoDate(row.date)} · ${row.status} · ${row.description}`,
              debit: row.total,
              credit: row.paid,
              balance: row.total - row.paid,
            }))
          : type === "reconciliation-summary"
            ? report.reconciliationSummary.map((row) => ({
                label: row.name,
                debit: row.statementAmount,
                credit: row.matchedAmount,
                balance: row.unmatchedAmount,
              }))
            : type === "receivable-control"
              ? [
                  {
                    label: "Student fee receivable control",
                    debit: report.receivableControl.ledgerBalance,
                    credit: report.receivableControl.financeOutstanding,
                    balance: report.receivableControl.difference,
                  },
                ]
              : type === "trial-balance"
                ? report.trialBalance.map((row) => ({
                    label: `${row.account.code} ${row.account.name}`,
                    debit: row.debit,
                    credit: row.credit,
                    balance: row.balance,
                  }))
                : type === "income-statement"
                  ? [
                      {
                        label: "Fee and other income",
                        credit: report.incomeStatement.income,
                      },
                      {
                        label: "Expenses",
                        debit: report.incomeStatement.expenses,
                      },
                      {
                        label: "Surplus / (deficit)",
                        balance: report.incomeStatement.surplus,
                      },
                    ]
                  : [
                      { label: "Assets", debit: report.balanceSheet.assets },
                      {
                        label: "Liabilities",
                        credit: report.balanceSheet.liabilities,
                      },
                      { label: "Equity", credit: report.balanceSheet.equity },
                    ];
  const titles = {
    "trial-balance": "Trial Balance",
    "general-ledger": "General Ledger",
    "income-statement": "Income Statement",
    "balance-sheet": "Balance Sheet",
    "cash-bank-book": "Cash and Bank Book",
    "expense-register": "Expense Register",
    "reconciliation-summary": "Reconciliation Summary",
    "receivable-control": "Student Receivable Control Reconciliation",
  } as const;
  return generateFinancePdf({
    title: `${titles[type]} — ${report.fiscalYear.name}`,
    school: {
      name: school?.name ?? "Lumen School",
      address: school?.address,
      phone: school?.phone,
      email: school?.email,
    },
    student: {
      name: "School accounting book",
      admissionNo: report.fiscalYear.name,
    },
    generatedAt: new Date().toISOString(),
    lines: rows,
    totals:
      type === "trial-balance"
        ? [
            {
              label: "Total debits",
              value: report.trialBalance.reduce(
                (sum, row) => sum + row.debit,
                0,
              ),
            },
            {
              label: "Total credits",
              value: report.trialBalance.reduce(
                (sum, row) => sum + row.credit,
                0,
              ),
            },
          ]
        : [],
    footer: [report.cutoverNotice, school?.reportFooter]
      .filter(Boolean)
      .join(" "),
  });
}

export async function getAccountingSummary() {
  const report = await getAccountingReports({});
  if (!report)
    return { available: false, reason: "Accounting has not been configured." };
  const moneyAccountIds = new Set(
    (await prisma.moneyAccount.findMany({ select: { accountId: true } })).map(
      (item) => item.accountId,
    ),
  );
  const cashPosition = report.trialBalance
    .filter((row) => moneyAccountIds.has(row.account.id))
    .reduce((sum, row) => sum + row.balance, 0);
  const accountByKey = await prisma.account.findMany({
    where: { bookId: report.book.id, systemKey: { not: null } },
  });
  const balanceFor = (key: AccountSystemKey) => {
    const account = accountByKey.find((item) => item.systemKey === key);
    return (
      report.trialBalance.find((row) => row.account.id === account?.id)
        ?.balance ?? 0
    );
  };
  const unreconciled = await prisma.bankStatementLine.count({
    where: { matches: { none: {} } },
  });
  return {
    available: report.book.status === AccountingBookStatus.ACTIVE,
    reason:
      report.book.status === AccountingBookStatus.ACTIVE
        ? null
        : "Accounting setup is not activated.",
    cashPosition,
    receivables: balanceFor(AccountSystemKey.ACCOUNTS_RECEIVABLE),
    payables: -balanceFor(AccountSystemKey.ACCOUNTS_PAYABLE),
    income: report.incomeStatement.income,
    expenses: report.incomeStatement.expenses,
    surplus: report.incomeStatement.surplus,
    unreconciled,
  };
}

async function activePostingBook(tx: Tx, date = new Date()) {
  if (!config.accounting.enabled) return null;
  const book = await tx.accountingBook.findUnique({
    where: { domain: AccountingBookDomain.SCHOOL },
  });
  if (
    !book ||
    book.status !== AccountingBookStatus.ACTIVE ||
    !book.cutoverAt ||
    date < book.cutoverAt
  )
    return null;
  return book;
}

export async function postFeeChargeRows(
  tx: Tx,
  input: {
    actorId: string | null;
    sourceKey: string;
    sourceEntityType: string;
    sourceEntityId: string;
    date: Date;
    rows: { enrolmentId: string; lineId: string; amount: Prisma.Decimal }[];
  },
) {
  if (!input.rows.length) return null;
  const book = await activePostingBook(tx, input.date);
  if (!book) return null;
  const controls = await systemAccounts(tx, book.id);
  const lineIds = [...new Set(input.rows.map((row) => row.lineId))];
  const scheduleLines = await tx.feeScheduleLine.findMany({
    where: { id: { in: lineIds } },
    include: {
      schedule: { include: { term: true } },
      feeItem: {
        include: { accountingMappings: { where: { bookId: book.id } } },
      },
    },
  });
  const byId = new Map(scheduleLines.map((line) => [line.id, line]));
  const credits = new Map<string, Prisma.Decimal>();
  let total = ZERO;
  for (const row of input.rows) {
    const line = byId.get(row.lineId);
    if (!line)
      throw AppError.badRequest(
        "Accounting could not resolve a fee schedule line.",
      );
    const accountId =
      line.schedule.term.status === TermStatus.PENDING
        ? controls.get(AccountSystemKey.DEFERRED_FEE_INCOME)!.id
        : line.feeItem.accountingMappings[0]?.incomeAccountId;
    if (!accountId)
      throw AppError.badRequest(
        `Map fee item ${line.feeItem.name} to an income account.`,
      );
    credits.set(accountId, (credits.get(accountId) ?? ZERO).plus(row.amount));
    total = total.plus(row.amount);
  }
  return createPostedJournal(tx, {
    actorId: input.actorId,
    bookId: book.id,
    date: input.date,
    description: `Student fee charges (${input.rows.length})`,
    source: JournalSource.FEE_CHARGE,
    sourceKey: input.sourceKey,
    lines: [
      {
        accountId: controls.get(AccountSystemKey.ACCOUNTS_RECEIVABLE)!.id,
        debit: total,
        credit: ZERO,
      },
      ...[...credits].map(([accountId, amount]) => ({
        accountId,
        debit: ZERO,
        credit: amount,
      })),
    ],
    links: [
      { entityType: input.sourceEntityType, entityId: input.sourceEntityId },
      ...input.rows.map((row) => ({
        entityType: "StudentEnrolment",
        entityId: row.enrolmentId,
      })),
    ].filter(
      (link, index, links) =>
        links.findIndex(
          (candidate) =>
            candidate.entityType === link.entityType &&
            candidate.entityId === link.entityId,
        ) === index,
    ),
  });
}

export async function resolvePaymentMoneyAccount(
  tx: Tx,
  method: FeePaymentMethod,
  requestedId?: string | null,
) {
  const book = await activePostingBook(tx);
  if (!book) return requestedId ?? null;
  if (requestedId) {
    const requested = await tx.moneyAccount.findUnique({
      where: { id: requestedId },
      include: { account: true },
    });
    if (!requested || !requested.active || requested.account.bookId !== book.id)
      throw AppError.badRequest("Select an active accounting money account.");
    return requested.id;
  }
  const mapping = await tx.paymentMethodAccount.findUnique({
    where: { bookId_method: { bookId: book.id, method } },
  });
  if (!mapping)
    throw AppError.badRequest(
      `Configure the default ${method.replaceAll("_", " ")} account.`,
    );
  return mapping.moneyAccountId;
}

export async function postFeePayment(
  tx: Tx,
  input: {
    actorId: string | null;
    paymentId: string;
    studentId: string;
    date: Date;
    moneyAccountId: string | null;
    amount: Prisma.Decimal | number;
    allocated: Prisma.Decimal | number;
    credit: Prisma.Decimal | number;
  },
) {
  const book = await activePostingBook(tx, input.date);
  if (!book) return null;
  if (!input.moneyAccountId)
    throw AppError.badRequest(
      "An accounting money account is required for this payment.",
    );
  const money = await tx.moneyAccount.findUnique({
    where: { id: input.moneyAccountId },
  });
  if (!money) throw AppError.badRequest("Payment money account not found.");
  const controls = await systemAccounts(tx, book.id);
  const lines: PostingLine[] = [
    {
      accountId: money.accountId,
      debit: input.amount,
      credit: ZERO,
      studentId: input.studentId,
    },
  ];
  if (decimal(input.allocated).gt(0))
    lines.push({
      accountId: controls.get(AccountSystemKey.ACCOUNTS_RECEIVABLE)!.id,
      debit: ZERO,
      credit: input.allocated,
      studentId: input.studentId,
    });
  if (decimal(input.credit).gt(0))
    lines.push({
      accountId: controls.get(AccountSystemKey.STUDENT_CREDITS)!.id,
      debit: ZERO,
      credit: input.credit,
      studentId: input.studentId,
    });
  return createPostedJournal(tx, {
    actorId: input.actorId,
    bookId: book.id,
    date: input.date,
    description: "Student fee payment",
    source: JournalSource.FEE_PAYMENT,
    sourceKey: `FEE_PAYMENT:${input.paymentId}`,
    lines,
    links: [{ entityType: "FeePayment", entityId: input.paymentId }],
  });
}

export async function postCreditAllocation(
  tx: Tx,
  input: {
    actorId: string | null;
    creditLotId: string;
    studentId: string;
    date: Date;
    amount: Prisma.Decimal | number;
    sourceKey: string;
  },
) {
  const book = await activePostingBook(tx, input.date);
  if (!book) return null;
  const controls = await systemAccounts(tx, book.id);
  return createPostedJournal(tx, {
    actorId: input.actorId,
    bookId: book.id,
    date: input.date,
    description: "Student credit applied to fees",
    source: JournalSource.CREDIT_ALLOCATION,
    sourceKey: input.sourceKey,
    lines: [
      {
        accountId: controls.get(AccountSystemKey.STUDENT_CREDITS)!.id,
        debit: input.amount,
        credit: ZERO,
        studentId: input.studentId,
      },
      {
        accountId: controls.get(AccountSystemKey.ACCOUNTS_RECEIVABLE)!.id,
        debit: ZERO,
        credit: input.amount,
        studentId: input.studentId,
      },
    ],
    links: [{ entityType: "StudentCreditLot", entityId: input.creditLotId }],
  });
}

export async function postFeeAdjustment(
  tx: Tx,
  input: {
    actorId: string | null;
    adjustmentId: string;
    chargeId: string;
    studentId: string;
    type: "DISCOUNT" | "WAIVER" | "CHARGE_CREDIT" | "CHARGE_DEBIT";
    amount: Prisma.Decimal;
    date: Date;
  },
) {
  const book = await activePostingBook(tx, input.date);
  if (!book) return null;
  const charge = await tx.studentCharge.findUnique({
    where: { id: input.chargeId },
    include: {
      line: {
        include: {
          schedule: { include: { term: true } },
          feeItem: {
            include: { accountingMappings: { where: { bookId: book.id } } },
          },
        },
      },
    },
  });
  if (!charge)
    throw AppError.notFound("Student charge not found for accounting.");
  const controls = await systemAccounts(tx, book.id);
  const deferred = charge.line.schedule.term.status === TermStatus.PENDING;
  const incomeAccountId =
    charge.line.feeItem.accountingMappings[0]?.incomeAccountId;
  if (!incomeAccountId)
    throw AppError.badRequest("Map this fee item to an income account.");
  const offsetId = deferred
    ? controls.get(AccountSystemKey.DEFERRED_FEE_INCOME)!.id
    : input.type === "CHARGE_DEBIT"
      ? incomeAccountId
      : controls.get(AccountSystemKey.FEE_WAIVERS)!.id;
  const receivableId = controls.get(AccountSystemKey.ACCOUNTS_RECEIVABLE)!.id;
  const isDebit = input.type === "CHARGE_DEBIT";
  return createPostedJournal(tx, {
    actorId: input.actorId,
    bookId: book.id,
    date: input.date,
    description: `Approved fee adjustment: ${input.type.replaceAll("_", " ")}`,
    source: JournalSource.FEE_ADJUSTMENT,
    sourceKey: `FEE_ADJUSTMENT:${input.adjustmentId}`,
    lines: isDebit
      ? [
          {
            accountId: receivableId,
            debit: input.amount,
            credit: ZERO,
            studentId: input.studentId,
          },
          {
            accountId: offsetId,
            debit: ZERO,
            credit: input.amount,
            studentId: input.studentId,
          },
        ]
      : [
          {
            accountId: offsetId,
            debit: input.amount,
            credit: ZERO,
            studentId: input.studentId,
          },
          {
            accountId: receivableId,
            debit: ZERO,
            credit: input.amount,
            studentId: input.studentId,
          },
        ],
    links: [
      { entityType: "ChargeAdjustment", entityId: input.adjustmentId },
      { entityType: "StudentCharge", entityId: input.chargeId },
    ],
  });
}

export async function recognizeDeferredTerm(
  tx: Tx,
  actorId: string | null,
  termId: string,
  date: Date,
) {
  const book = await activePostingBook(tx, date);
  if (!book) return null;
  const term = await tx.term.findUnique({ where: { id: termId } });
  if (!term) throw AppError.notFound("Term not found for accounting.");
  const charges = await tx.studentCharge.findMany({
    where: { line: { schedule: { termId } } },
    include: {
      adjustments: { where: { status: "APPROVED" } },
      line: {
        include: {
          feeItem: {
            include: { accountingMappings: { where: { bookId: book.id } } },
          },
        },
      },
    },
  });
  const income = new Map<string, Prisma.Decimal>();
  let total = ZERO;
  for (const charge of charges) {
    const debits = charge.adjustments
      .filter((item) => item.type === "CHARGE_DEBIT")
      .reduce((sum, item) => sum.plus(item.amount), ZERO);
    const reductions = charge.adjustments
      .filter((item) => item.type !== "CHARGE_DEBIT")
      .reduce((sum, item) => sum.plus(item.amount), ZERO);
    const net = Prisma.Decimal.max(
      ZERO,
      charge.amount.plus(debits).minus(reductions),
    );
    const accountId =
      charge.line.feeItem.accountingMappings[0]?.incomeAccountId;
    if (!accountId)
      throw AppError.badRequest(
        `Map ${charge.line.feeItem.name} to an income account.`,
      );
    income.set(accountId, (income.get(accountId) ?? ZERO).plus(net));
    total = total.plus(net);
  }
  if (total.eq(0)) return null;
  const controls = await systemAccounts(tx, book.id);
  return createPostedJournal(tx, {
    actorId,
    bookId: book.id,
    date,
    description: `Recognize deferred fee income for ${term.name}`,
    source: JournalSource.TERM_RECOGNITION,
    sourceKey: `TERM_RECOGNITION:${term.id}`,
    lines: [
      {
        accountId: controls.get(AccountSystemKey.DEFERRED_FEE_INCOME)!.id,
        debit: total,
        credit: ZERO,
      },
      ...[...income].map(([accountId, amount]) => ({
        accountId,
        debit: ZERO,
        credit: amount,
      })),
    ],
    links: [{ entityType: "Term", entityId: term.id }],
  });
}

export async function reverseJournalsForEntity(
  tx: Tx,
  actorId: string,
  entityType: string,
  entityId: string,
  reason: string,
) {
  const links = await tx.accountingSourceLink.findMany({
    where: { entityType, entityId, journal: { status: JournalStatus.POSTED } },
    include: { journal: true },
  });
  for (const link of links)
    await reverseJournal(actorId, link.journalId, reason, tx);
  return links.length;
}
