import { z } from "zod";

const money = z.coerce.number().nonnegative().multipleOf(0.01);
const positiveMoney = money.refine(
  (value) => value > 0,
  "Amount must be greater than zero.",
);
const date = z
  .string()
  .or(z.date())
  .transform((value) => new Date(value));

export const bootstrapSchema = z.object({
  academicYearId: z.string().min(1).optional(),
});

export const activateAccountingSchema = z.object({
  cutoverDate: date,
  moneyBalances: z
    .array(z.object({ moneyAccountId: z.string().min(1), amount: money }))
    .default([]),
  otherBalances: z
    .array(
      z
        .object({
          accountId: z.string().min(1),
          debit: money.default(0),
          credit: money.default(0),
        })
        .refine((line) => line.debit > 0 !== line.credit > 0, {
          message: "Enter either a debit or credit opening balance.",
        }),
    )
    .default([]),
});

export const accountSchema = z.object({
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(120),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]),
  parentId: z.string().min(1).optional().nullable(),
});
export const updateAccountSchema = accountSchema
  .partial()
  .extend({ active: z.boolean().optional() });

export const moneyAccountSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  type: z.enum(["CASH", "BANK", "MOBILE_MONEY", "CARD_CLEARING"]),
  institution: z.string().trim().max(120).optional().nullable(),
  accountNumber: z.string().trim().max(80).optional().nullable(),
});

export const methodMappingSchema = z.object({
  method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD"]),
  moneyAccountId: z.string().min(1),
});

export const feeMappingSchema = z.object({
  mappings: z.array(
    z.object({
      feeItemId: z.string().min(1),
      incomeAccountId: z.string().min(1),
    }),
  ),
});

const journalLine = z
  .object({
    accountId: z.string().min(1),
    description: z.string().trim().max(300).optional().nullable(),
    debit: money.default(0),
    credit: money.default(0),
  })
  .refine((line) => line.debit > 0 !== line.credit > 0, {
    message: "Each journal line must contain either a debit or credit.",
  });

export const journalSchema = z.object({
  date,
  description: z.string().trim().min(3).max(300),
  lines: z.array(journalLine).min(2),
});
export const journalDecisionSchema = z.object({
  approved: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});
export const reversalDecisionSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const expenseSchema = z.object({
  date,
  dueDate: date.optional().nullable(),
  payee: z.string().trim().min(2).max(160),
  reference: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().min(3).max(500),
  missingDocumentReason: z.string().trim().max(500).optional().nullable(),
  lines: z
    .array(
      z.object({
        accountId: z.string().min(1),
        description: z.string().trim().min(2).max(300),
        amount: positiveMoney,
      }),
    )
    .min(1),
});

export const expenseDecisionSchema = z.object({
  approved: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

export const expensePaymentSchema = z.object({
  amount: positiveMoney,
  date,
  moneyAccountId: z.string().min(1),
  transactionRef: z.string().trim().max(120).optional().nullable(),
});

export const statementImportSchema = z.object({
  moneyAccountId: z.string().min(1),
  filename: z.string().trim().min(1).max(160),
  periodStart: date,
  periodEnd: date,
  csv: z.string().min(1).max(5_000_000),
});

export const reconciliationMatchSchema = z.object({
  statementLineId: z.string().min(1),
  matches: z
    .array(
      z.object({ journalLineId: z.string().min(1), amount: positiveMoney }),
    )
    .min(1),
});

export const reconciliationDraftSchema = z.object({
  statementLineId: z.string().min(1),
  offsetAccountId: z.string().min(1),
  description: z.string().trim().min(3).max(300),
});

export const cashCountSchema = z.object({
  moneyAccountId: z.string().min(1),
  date,
  counted: money,
});

export const periodStatusSchema = z.object({
  status: z.enum(["OPEN", "CLOSED"]),
});

export const expenseAttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(160),
  contentBase64: z.string().min(1).max(14_000_000),
});

export const reportQuerySchema = z.object({
  fiscalYearId: z.string().min(1).optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  accountId: z.string().min(1).optional(),
});
