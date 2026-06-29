import { z } from "zod";

const money = z.coerce.number().positive().multipleOf(0.01);
const allocation = z.object({ chargeId: z.string().min(1), amount: money });

export const feeItemSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().nullable(),
});

export const updateFeeItemSchema = feeItemSchema
  .partial()
  .extend({ active: z.boolean().optional() });

export const scheduleSchema = z.object({
  academicYearId: z.string().min(1),
  termId: z.string().min(1),
  gradeLevelId: z.string().min(1),
  kind: z.enum(["STANDARD", "SUPPLEMENTAL"]).default("STANDARD"),
  name: z.string().trim().min(2).max(120),
  lines: z
    .array(
      z.object({
        feeItemId: z.string().min(1),
        amount: money,
        dueDate: z
          .string()
          .or(z.date())
          .transform((value) => new Date(value)),
        applicability: z.enum(["MANDATORY", "OPTIONAL"]).default("MANDATORY"),
      }),
    )
    .min(1),
});

export const updateScheduleSchema = scheduleSchema
  .pick({ name: true, lines: true })
  .partial();

export const optionalAssignmentsSchema = z.object({
  enrolmentIds: z.array(z.string().min(1)).min(1),
});

export const paymentSchema = z
  .object({
    studentId: z.string().min(1),
    amount: money,
    method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD"]),
    moneyAccountId: z.string().min(1).optional().nullable(),
    transactionRef: z.string().trim().min(2).max(120).optional().nullable(),
    idempotencyKey: z.string().trim().min(8).max(100),
    allocations: z.array(allocation).default([]),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.allocations.map((item) => item.chargeId)).size !==
      value.allocations.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allocations"],
        message: "Each charge may be allocated only once per payment.",
      });
    }
    if (value.method !== "CASH" && !value.transactionRef) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transactionRef"],
        message: "A transaction reference is required for non-cash payments.",
      });
    }
  });

export const creditAllocationSchema = z
  .object({
    allocations: z.array(allocation).min(1),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.allocations.map((item) => item.chargeId)).size !==
      value.allocations.length
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allocations"],
        message: "Each charge may be selected only once.",
      });
  });

export const adjustmentSchema = z.object({
  chargeId: z.string().min(1),
  type: z.enum(["DISCOUNT", "WAIVER", "CHARGE_CREDIT", "CHARGE_DEBIT"]),
  amount: money,
  reason: z.string().trim().min(3).max(500),
});

export const reversalSchema = z.object({
  paymentId: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
});

export const decisionSchema = z.object({ approved: z.boolean() });

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};
const dateRange = {
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
};

export const paymentListQuerySchema = z.object({
  ...pagination,
  ...dateRange,
  search: z.string().trim().max(100).optional(),
  status: z.enum(["POSTED", "REVERSAL_PENDING", "REVERSED"]).optional(),
  method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD"]).optional(),
});

export const receiptListQuerySchema = z.object({
  ...pagination,
  ...dateRange,
  search: z.string().trim().max(100).optional(),
  status: z.enum(["POSTED", "REVERSAL_PENDING", "REVERSED"]).optional(),
});

export const debtorListQuerySchema = z.object({
  ...pagination,
  search: z.string().trim().max(100).optional(),
  gradeLevelId: z.string().min(1).optional(),
  classSectionId: z.string().min(1).optional(),
});
