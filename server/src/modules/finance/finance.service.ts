import crypto from "node:crypto";
import {
  AcademicYearStatus,
  CreditLotStatus,
  FeeApplicability,
  FeePaymentStatus,
  FeeScheduleStatus,
  FinanceDecisionStatus,
  Prisma,
  TermStatus,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import type { z } from "zod";
import { generateFinancePdf } from "./finance-pdf.service.js";
import {
  readFinanceDocument,
  saveFinanceDocument,
} from "./finance-storage.service.js";
import {
  adjustmentSchema,
  debtorListQuerySchema,
  paymentSchema,
  paymentListQuerySchema,
  receiptListQuerySchema,
  scheduleSchema,
  updateScheduleSchema,
} from "./finance.schema.js";
import {
  postCreditAllocation,
  postFeeAdjustment,
  postFeeChargeRows,
  postFeePayment,
  resolvePaymentMoneyAccount,
  reverseJournalsForEntity,
} from "../accounting/accounting.service.js";

type Tx = Prisma.TransactionClient;
type ScheduleInput = z.infer<typeof scheduleSchema>;
type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
type PaymentInput = z.infer<typeof paymentSchema>;
type AdjustmentInput = z.infer<typeof adjustmentSchema>;
type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
type ReceiptListQuery = z.infer<typeof receiptListQuerySchema>;
type DebtorListQuery = z.infer<typeof debtorListQuerySchema>;
const ZERO = new Prisma.Decimal(0);
const decimal = (value: Prisma.Decimal | number | string | null | undefined) =>
  new Prisma.Decimal(value ?? 0);
const number = (value: Prisma.Decimal | number | string | null | undefined) =>
  decimal(value).toDecimalPlaces(2).toNumber();
const round = (value: Prisma.Decimal | number | string) =>
  decimal(value).toDecimalPlaces(2).toNumber();
const nonNegative = (value: Prisma.Decimal) =>
  value.isNegative() ? ZERO : value;
const isoDate = (value: Date) => value.toISOString().slice(0, 10);

async function audit(
  tx: Tx,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>,
) {
  await tx.financeAuditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId,
      metadata: metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

async function serializable<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < maxAttempts - 1
      ) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            10 * 2 ** attempt + Math.floor(Math.random() * 10),
          ),
        );
        continue;
      }
      throw error;
    }
  }
  throw AppError.badRequest(
    "The transaction could not be completed. Please retry.",
  );
}

const chargeInclude = {
  adjustments: true,
  paymentAllocations: { include: { payment: true } },
  creditAllocations: { include: { creditLot: true } },
  line: {
    include: {
      feeItem: true,
      schedule: {
        include: { academicYear: true, term: true, gradeLevel: true },
      },
    },
  },
  enrolment: { include: { student: true, classSection: true } },
} as const;
type ChargeWithFinance = Prisma.StudentChargeGetPayload<{
  include: typeof chargeInclude;
}>;

function chargeMath(charge: ChargeWithFinance) {
  const approved =
    charge.adjustments?.filter(
      (item) => item.status === FinanceDecisionStatus.APPROVED,
    ) ?? [];
  const debits = approved
    .filter((item) => item.type === "CHARGE_DEBIT")
    .reduce((sum, item) => sum.plus(item.amount), ZERO);
  const reductions = approved
    .filter((item) => item.type !== "CHARGE_DEBIT")
    .reduce((sum, item) => sum.plus(item.amount), ZERO);
  const net = nonNegative(
    decimal(charge.amount).plus(debits).minus(reductions),
  );
  const paid = (charge.paymentAllocations ?? [])
    .filter(
      (item) =>
        !item.reversedAt && item.payment?.status !== FeePaymentStatus.REVERSED,
    )
    .reduce((sum, item) => sum.plus(item.amount), ZERO);
  const creditApplied = (charge.creditAllocations ?? [])
    .filter(
      (item) =>
        !item.reversedAt && item.creditLot?.status === CreditLotStatus.ACTIVE,
    )
    .reduce((sum, item) => sum.plus(item.amount), ZERO);
  return {
    original: number(charge.amount),
    debits: round(debits),
    reductions: round(reductions),
    net: round(net),
    paid: round(paid),
    creditApplied: round(creditApplied),
    balance: round(nonNegative(net.minus(paid).minus(creditApplied))),
  };
}

export async function listFeeItems(includeArchived = false) {
  return prisma.feeItem.findMany({
    where: includeArchived ? {} : { active: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export async function createFeeItem(
  actorId: string,
  input: { code: string; name: string; description?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.feeItem.create({ data: input });
    await audit(tx, actorId, "FEE_ITEM_CREATED", "FeeItem", item.id, {
      code: item.code,
    });
    return item;
  });
}

export async function updateFeeItem(
  actorId: string,
  id: string,
  input: {
    code?: string;
    name?: string;
    description?: string | null;
    active?: boolean;
  },
) {
  const existing = await prisma.feeItem.findUnique({
    where: { id },
    include: { scheduleLines: { include: { schedule: true } } },
  });
  if (!existing) throw AppError.notFound("Fee item not found.");
  const used = existing.scheduleLines.some(
    (line) => line.schedule.status === FeeScheduleStatus.PUBLISHED,
  );
  if (used && (input.code || input.name))
    throw AppError.badRequest(
      "A fee item used by a published schedule can only be archived, not renamed.",
    );
  return prisma.$transaction(async (tx) => {
    const item = await tx.feeItem.update({ where: { id }, data: input });
    await audit(
      tx,
      actorId,
      input.active === false ? "FEE_ITEM_ARCHIVED" : "FEE_ITEM_UPDATED",
      "FeeItem",
      id,
    );
    return item;
  });
}

async function validateScheduleInput(input: {
  academicYearId: string;
  termId: string;
  gradeLevelId: string;
  lines: { feeItemId: string; dueDate: Date }[];
}) {
  const [year, term, grade, items] = await Promise.all([
    prisma.academicYear.findUnique({ where: { id: input.academicYearId } }),
    prisma.term.findUnique({ where: { id: input.termId } }),
    prisma.gradeLevel.findUnique({ where: { id: input.gradeLevelId } }),
    prisma.feeItem.findMany({
      where: {
        id: { in: input.lines.map((line) => line.feeItemId) },
        active: true,
      },
    }),
  ]);
  if (!year || !term || term.academicYearId !== year.id)
    throw AppError.badRequest("Select a term from the chosen academic year.");
  if (!grade?.active)
    throw AppError.badRequest("Select an active grade level.");
  if (items.length !== new Set(input.lines.map((line) => line.feeItemId)).size)
    throw AppError.badRequest(
      "Every schedule line must use a distinct active fee item.",
    );
  if (
    input.lines.some(
      (line) => line.dueDate < year.startDate || line.dueDate > year.endDate,
    )
  )
    throw AppError.badRequest(
      "Fee due dates must fall inside the academic year.",
    );
  return {
    year,
    term,
    grade,
    items: new Map(items.map((item) => [item.id, item])),
  };
}

export async function createSchedule(actorId: string, input: ScheduleInput) {
  const context = await validateScheduleInput(input);
  const existing = await prisma.feeSchedule.findMany({
    where: {
      academicYearId: input.academicYearId,
      termId: input.termId,
      gradeLevelId: input.gradeLevelId,
      kind: input.kind,
    },
    orderBy: { sequence: "desc" },
    take: 1,
  });
  if (input.kind === "STANDARD" && existing.length)
    throw AppError.badRequest(
      "A standard schedule already exists for this grade and term. Use a supplemental schedule.",
    );
  const sequence =
    input.kind === "STANDARD" ? 1 : (existing[0]?.sequence ?? 0) + 1;
  return prisma.$transaction(async (tx) => {
    const schedule = await tx.feeSchedule.create({
      data: {
        academicYearId: input.academicYearId,
        termId: input.termId,
        gradeLevelId: input.gradeLevelId,
        kind: input.kind,
        sequence,
        name: input.name,
        lines: {
          create: input.lines.map((line) => ({
            feeItemId: line.feeItemId,
            label: context.items.get(line.feeItemId)!.name,
            amount: line.amount,
            dueDate: line.dueDate,
            applicability: line.applicability,
          })),
        },
      },
      include: {
        lines: { include: { feeItem: true } },
        academicYear: true,
        term: true,
        gradeLevel: true,
      },
    });
    await audit(
      tx,
      actorId,
      "FEE_SCHEDULE_CREATED",
      "FeeSchedule",
      schedule.id,
      { kind: schedule.kind },
    );
    return schedule;
  });
}

export async function updateSchedule(
  actorId: string,
  id: string,
  input: UpdateScheduleInput,
) {
  const existing = await prisma.feeSchedule.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound("Fee schedule not found.");
  if (existing.status !== FeeScheduleStatus.DRAFT)
    throw AppError.badRequest("Only draft schedules can be edited.");
  let context: Awaited<ReturnType<typeof validateScheduleInput>> | null = null;
  if (input.lines)
    context = await validateScheduleInput({ ...existing, lines: input.lines });
  return prisma.$transaction(async (tx) => {
    if (input.lines) {
      await tx.feeScheduleLine.deleteMany({ where: { scheduleId: id } });
    }
    const schedule = await tx.feeSchedule.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.lines && {
          lines: {
            create: input.lines.map((line) => ({
              feeItemId: line.feeItemId,
              label: context!.items.get(line.feeItemId)!.name,
              amount: line.amount,
              dueDate: line.dueDate,
              applicability: line.applicability,
            })),
          },
        }),
      },
      include: {
        lines: { include: { feeItem: true } },
        academicYear: true,
        term: true,
        gradeLevel: true,
      },
    });
    await audit(tx, actorId, "FEE_SCHEDULE_UPDATED", "FeeSchedule", id);
    return schedule;
  });
}

export async function listSchedules(filters: {
  academicYearId?: string;
  termId?: string;
  gradeLevelId?: string;
  status?: string;
}) {
  const schedules = await prisma.feeSchedule.findMany({
    where: {
      ...(filters.academicYearId && { academicYearId: filters.academicYearId }),
      ...(filters.termId && { termId: filters.termId }),
      ...(filters.gradeLevelId && { gradeLevelId: filters.gradeLevelId }),
      ...(filters.status &&
        filters.status !== "all" && {
          status: filters.status as FeeScheduleStatus,
        }),
    },
    include: {
      academicYear: true,
      term: true,
      gradeLevel: true,
      lines: { include: { feeItem: true }, orderBy: { label: "asc" } },
      _count: { select: { lines: true } },
    },
    orderBy: [
      { academicYear: { startDate: "desc" } },
      { term: { sequence: "asc" } },
      { gradeLevel: { order: "asc" } },
      { sequence: "asc" },
    ],
  });
  return schedules.map((schedule) => ({
    ...schedule,
    total: round(
      schedule.lines.reduce((sum, line) => sum.plus(line.amount), ZERO),
    ),
    lines: schedule.lines.map((line) => ({
      ...line,
      amount: number(line.amount),
      dueDate: isoDate(line.dueDate),
    })),
  }));
}

export async function submitSchedule(actorId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const schedule = await tx.feeSchedule.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!schedule) throw AppError.notFound("Fee schedule not found.");
    if (schedule.status !== FeeScheduleStatus.DRAFT || !schedule.lines.length)
      throw AppError.badRequest(
        "Only a complete draft schedule can be submitted.",
      );
    const updated = await tx.feeSchedule.update({
      where: { id },
      data: {
        status: FeeScheduleStatus.PENDING_APPROVAL,
        submittedById: actorId,
        submittedAt: new Date(),
      },
    });
    await audit(tx, actorId, "FEE_SCHEDULE_SUBMITTED", "FeeSchedule", id);
    return updated;
  });
}

function eligibleForTerm(
  enrolment: { feeEffectiveTerm?: { sequence: number } | null },
  termSequence: number,
) {
  return (enrolment.feeEffectiveTerm?.sequence ?? 1) <= termSequence;
}

export async function publishSchedule(actorId: string, id: string) {
  return serializable(async (tx) => {
    const schedule = await tx.feeSchedule.findUnique({
      where: { id },
      include: {
        academicYear: true,
        term: true,
        lines: { include: { assignments: true } },
      },
    });
    if (!schedule) throw AppError.notFound("Fee schedule not found.");
    if (schedule.status === FeeScheduleStatus.PUBLISHED)
      return { schedule, chargesCreated: 0, alreadyPublished: true };
    if (schedule.status !== FeeScheduleStatus.PENDING_APPROVAL)
      throw AppError.badRequest(
        "The schedule must be submitted before publication.",
      );
    if (schedule.academicYear.status !== AcademicYearStatus.ACTIVE)
      throw AppError.badRequest(
        "Fee schedules can only be published for the active academic year.",
      );
    if (schedule.term.status === TermStatus.CLOSED)
      throw AppError.badRequest("Fees cannot be published for a closed term.");
    const enrolments = await tx.studentEnrolment.findMany({
      where: {
        academicYearId: schedule.academicYearId,
        status: "ACTIVE",
        classSection: { gradeLevelId: schedule.gradeLevelId },
      },
      include: { feeEffectiveTerm: true },
    });
    const rows: {
      enrolmentId: string;
      lineId: string;
      amount: Prisma.Decimal;
      dueDate: Date;
    }[] = [];
    for (const line of schedule.lines) {
      const assigned = new Set(
        line.assignments.map((item) => item.enrolmentId),
      );
      for (const enrolment of enrolments)
        if (
          eligibleForTerm(enrolment, schedule.term.sequence) &&
          (line.applicability === FeeApplicability.MANDATORY ||
            assigned.has(enrolment.id))
        )
          rows.push({
            enrolmentId: enrolment.id,
            lineId: line.id,
            amount: line.amount,
            dueDate: line.dueDate,
          });
    }
    const created = rows.length
      ? await tx.studentCharge.createMany({ data: rows, skipDuplicates: true })
      : { count: 0 };
    const updated = await tx.feeSchedule.update({
      where: { id },
      data: {
        status: FeeScheduleStatus.PUBLISHED,
        publishedById: actorId,
        publishedAt: new Date(),
      },
    });
    await audit(tx, actorId, "FEE_SCHEDULE_PUBLISHED", "FeeSchedule", id, {
      chargesCreated: created.count,
    });
    if (created.count)
      await postFeeChargeRows(tx, {
        actorId,
        sourceKey: `FEE_SCHEDULE:${schedule.id}`,
        sourceEntityType: "FeeSchedule",
        sourceEntityId: schedule.id,
        date: new Date(),
        rows,
      });
    return {
      schedule: updated,
      chargesCreated: created.count,
      alreadyPublished: false,
    };
  });
}

export async function assignOptionalFee(
  actorId: string,
  lineId: string,
  enrolmentIds: string[],
) {
  return serializable(async (tx) => {
    const line = await tx.feeScheduleLine.findUnique({
      where: { id: lineId },
      include: { schedule: { include: { term: true } } },
    });
    if (!line || line.applicability !== FeeApplicability.OPTIONAL)
      throw AppError.badRequest("Select an optional fee line.");
    if (line.schedule.term.status === TermStatus.CLOSED)
      throw AppError.badRequest(
        "Optional fees cannot be assigned after the term closes.",
      );
    const enrolments = await tx.studentEnrolment.findMany({
      where: {
        id: { in: enrolmentIds },
        academicYearId: line.schedule.academicYearId,
        classSection: { gradeLevelId: line.schedule.gradeLevelId },
      },
      include: { feeEffectiveTerm: true },
    });
    if (enrolments.length !== new Set(enrolmentIds).size)
      throw AppError.badRequest(
        "Every student must belong to the schedule's grade and academic year.",
      );
    await tx.optionalFeeAssignment.createMany({
      data: enrolments.map((item) => ({
        enrolmentId: item.id,
        lineId,
        assignedById: actorId,
      })),
      skipDuplicates: true,
    });
    let chargesCreated = 0;
    if (line.schedule.status === FeeScheduleStatus.PUBLISHED) {
      const eligible = enrolments.filter(
        (item) =>
          item.status === "ACTIVE" &&
          eligibleForTerm(item, line.schedule.term.sequence),
      );
      const existing = new Set(
        (
          await tx.studentCharge.findMany({
            where: {
              lineId,
              enrolmentId: { in: eligible.map((item) => item.id) },
            },
            select: { enrolmentId: true },
          })
        ).map((charge) => charge.enrolmentId),
      );
      const newlyEligible = eligible.filter((item) => !existing.has(item.id));
      const created = await tx.studentCharge.createMany({
        data: newlyEligible.map((item) => ({
          enrolmentId: item.id,
          lineId,
          amount: line.amount,
          dueDate: line.dueDate,
        })),
        skipDuplicates: true,
      });
      chargesCreated = created.count;
      if (created.count)
        await postFeeChargeRows(tx, {
          actorId,
          sourceKey: `OPTIONAL_FEE:${lineId}:${crypto.randomUUID()}`,
          sourceEntityType: "FeeScheduleLine",
          sourceEntityId: lineId,
          date: new Date(),
          rows: newlyEligible.map((item) => ({
            enrolmentId: item.id,
            lineId,
            amount: line.amount,
          })),
        });
    }
    await audit(
      tx,
      actorId,
      "OPTIONAL_FEE_ASSIGNED",
      "FeeScheduleLine",
      lineId,
      { enrolmentIds, chargesCreated },
    );
    return { assigned: enrolments.length, chargesCreated };
  });
}

export async function listOptionalAssignments(lineId: string) {
  const line = await prisma.feeScheduleLine.findUnique({
    where: { id: lineId },
  });
  if (!line) throw AppError.notFound("Fee schedule line not found.");
  return prisma.optionalFeeAssignment.findMany({
    where: { lineId },
    include: {
      enrolment: { include: { student: true, classSection: true } },
      assignedBy: { select: { id: true, name: true } },
    },
    orderBy: { enrolment: { student: { lastName: "asc" } } },
  });
}

export async function removeOptionalAssignment(
  actorId: string,
  lineId: string,
  enrolmentId: string,
) {
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.optionalFeeAssignment.findUnique({
      where: { enrolmentId_lineId: { enrolmentId, lineId } },
      include: { line: { include: { schedule: true } } },
    });
    if (!assignment)
      throw AppError.notFound("Optional fee assignment not found.");
    if (assignment.line.schedule.status === FeeScheduleStatus.PUBLISHED)
      throw AppError.badRequest(
        "Published optional charges cannot be removed. Request an approved waiver instead.",
      );
    await tx.optionalFeeAssignment.delete({ where: { id: assignment.id } });
    await audit(
      tx,
      actorId,
      "OPTIONAL_FEE_UNASSIGNED",
      "FeeScheduleLine",
      lineId,
      { enrolmentId },
    );
    return { removed: true };
  });
}

export async function chargePublishedSchedulesForEnrolment(
  tx: Tx,
  enrolmentId: string,
  actorId: string | null = null,
) {
  const enrolment = await tx.studentEnrolment.findUnique({
    where: { id: enrolmentId },
    include: { classSection: true, feeEffectiveTerm: true },
  });
  if (!enrolment || enrolment.status !== "ACTIVE") return 0;
  const schedules = await tx.feeSchedule.findMany({
    where: {
      academicYearId: enrolment.academicYearId,
      gradeLevelId: enrolment.classSection.gradeLevelId,
      status: FeeScheduleStatus.PUBLISHED,
    },
    include: {
      term: true,
      lines: { include: { assignments: { where: { enrolmentId } } } },
    },
  });
  const rows = schedules.flatMap((schedule) =>
    eligibleForTerm(enrolment, schedule.term.sequence)
      ? schedule.lines
          .filter(
            (line) =>
              line.applicability === FeeApplicability.MANDATORY ||
              line.assignments.length,
          )
          .map((line) => ({
            enrolmentId,
            lineId: line.id,
            amount: line.amount,
            dueDate: line.dueDate,
          }))
      : [],
  );
  const existingLineIds = new Set(
    (
      await tx.studentCharge.findMany({
        where: { enrolmentId, lineId: { in: rows.map((row) => row.lineId) } },
        select: { lineId: true },
      })
    ).map((charge) => charge.lineId),
  );
  const newRows = rows.filter((row) => !existingLineIds.has(row.lineId));
  const created = newRows.length
    ? await tx.studentCharge.createMany({ data: newRows, skipDuplicates: true })
    : { count: 0 };
  if (created.count) {
    await audit(
      tx,
      actorId,
      "LATE_ENROLMENT_CHARGED",
      "StudentEnrolment",
      enrolmentId,
      { chargesCreated: created.count },
    );
    await postFeeChargeRows(tx, {
      actorId,
      sourceKey: `LATE_ENROLMENT:${enrolmentId}`,
      sourceEntityType: "StudentEnrolment",
      sourceEntityId: enrolmentId,
      date: new Date(),
      rows: newRows,
    });
  }
  return created.count;
}

export async function getStudentLedger(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      enrolments: {
        include: {
          classSection: { include: { gradeLevel: true } },
          academicYear: true,
          feeCharges: { include: chargeInclude },
        },
      },
      feePayments: {
        include: {
          allocations: {
            include: {
              charge: {
                include: {
                  line: {
                    include: {
                      schedule: { include: { academicYear: true, term: true } },
                    },
                  },
                },
              },
            },
          },
          receipt: true,
          reversal: true,
          creditLot: true,
          recordedBy: { select: { id: true, name: true } },
        },
        orderBy: { postedAt: "desc" },
      },
      creditLots: {
        include: { allocations: true, payment: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!student) throw AppError.notFound("Student not found.");
  const activeYear = await prisma.academicYear.findFirst({
    where: { status: AcademicYearStatus.ACTIVE },
    include: { terms: true },
  });
  const activeTerm =
    activeYear?.terms.find((term) => term.status === TermStatus.ACTIVE) ?? null;
  const charges = student.enrolments
    .flatMap((enrolment) =>
      enrolment.feeCharges.map((charge) => {
        const math = chargeMath(charge);
        const schedule = charge.line.schedule;
        const isCurrent =
          schedule.academicYearId === activeYear?.id &&
          schedule.termId === activeTerm?.id;
        const isPrevious = Boolean(
          !activeYear ||
          schedule.academicYear.startDate < activeYear.startDate ||
          (schedule.academicYearId === activeYear.id &&
            (activeTerm
              ? schedule.term.sequence < activeTerm.sequence
              : schedule.term.status === TermStatus.CLOSED)),
        );
        const isFuture = Boolean(
          activeYear &&
          schedule.academicYearId === activeYear.id &&
          schedule.term.status === TermStatus.PENDING,
        );
        return {
          id: charge.id,
          enrolmentId: charge.enrolmentId,
          label: charge.line.label,
          feeItemCode: charge.line.feeItem.code,
          amount: number(charge.amount),
          dueDate: isoDate(charge.dueDate),
          dueAt: charge.dueDate.getTime(),
          applicability: charge.line.applicability,
          academicYearId: schedule.academicYearId,
          academicYearName: schedule.academicYear.name,
          termId: schedule.termId,
          termName: schedule.term.name,
          termSequence: schedule.term.sequence,
          gradeLevelName: schedule.gradeLevel.name,
          sectionName: enrolment.classSection.name,
          isCurrent,
          isPrevious,
          isFuture,
          ...math,
          adjustments: charge.adjustments.map((item) => ({
            ...item,
            amount: number(item.amount),
          })),
        };
      }),
    )
    .sort((a, b) => a.dueAt - b.dueAt)
    .map(({ dueAt: _dueAt, ...charge }) => charge);
  const billed = round(charges.reduce((sum, item) => sum.plus(item.net), ZERO));
  const paid = round(charges.reduce((sum, item) => sum.plus(item.paid), ZERO));
  const creditApplied = round(
    charges.reduce((sum, item) => sum.plus(item.creditApplied), ZERO),
  );
  const outstanding = round(
    charges.reduce((sum, item) => sum.plus(item.balance), ZERO),
  );
  const availableCredit = round(
    student.creditLots
      .filter(
        (lot) =>
          lot.status === CreditLotStatus.ACTIVE &&
          lot.payment.status !== FeePaymentStatus.REVERSED,
      )
      .reduce(
        (sum, lot) =>
          sum
            .plus(lot.amount)
            .minus(
              lot.allocations
                .filter((allocation) => !allocation.reversedAt)
                .reduce(
                  (used, allocation) => used.plus(allocation.amount),
                  ZERO,
                ),
            ),
        ZERO,
      ),
  );
  return {
    student: {
      id: student.id,
      name: `${student.firstName} ${student.lastName}`,
      admissionNo: student.admissionNo,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhone,
    },
    context: {
      activeAcademicYearId: activeYear?.id ?? null,
      activeTermId: activeTerm?.id ?? null,
    },
    summary: {
      billed,
      paid,
      creditApplied,
      outstanding,
      availableCredit,
      netExposure: round(
        nonNegative(decimal(outstanding).minus(availableCredit)),
      ),
      previousArrears: round(
        charges
          .filter((item) => item.isPrevious)
          .reduce((sum, item) => sum.plus(item.balance), ZERO),
      ),
      currentTermBalance: round(
        charges
          .filter((item) => item.isCurrent)
          .reduce((sum, item) => sum.plus(item.balance), ZERO),
      ),
      futureCharges: round(
        charges
          .filter((item) => item.isFuture)
          .reduce((sum, item) => sum.plus(item.balance), ZERO),
      ),
    },
    charges,
    payments: student.feePayments.map((payment) => ({
      id: payment.id,
      amount: number(payment.amount),
      method: payment.method,
      status: payment.status,
      transactionRef: payment.transactionRef,
      postedAt: payment.postedAt,
      recordedBy: payment.recordedBy,
      receipt: payment.receipt
        ? { id: payment.receipt.id, number: payment.receipt.number }
        : null,
      reversal: payment.reversal,
      allocated: round(
        payment.allocations
          .filter((item) => !item.reversedAt)
          .reduce((sum, item) => sum.plus(item.amount), ZERO),
      ),
      creditCreated: number(payment.creditLot?.amount),
    })),
    credits: student.creditLots.map((lot) => ({
      id: lot.id,
      amount: number(lot.amount),
      status: lot.status,
      createdAt: lot.createdAt,
      available: round(
        nonNegative(
          decimal(lot.amount).minus(
            lot.allocations
              .filter((item) => !item.reversedAt)
              .reduce((sum, item) => sum.plus(item.amount), ZERO),
          ),
        ),
      ),
    })),
  };
}

async function loadChargeBalances(
  tx: Tx,
  chargeIds: string[],
  studentId: string,
) {
  const charges = await tx.studentCharge.findMany({
    where: { id: { in: chargeIds }, enrolment: { studentId } },
    include: chargeInclude,
  });
  if (charges.length !== new Set(chargeIds).size)
    throw AppError.badRequest(
      "Every allocation must belong to the selected student.",
    );
  return new Map(
    charges.map((charge) => [charge.id, { charge, math: chargeMath(charge) }]),
  );
}

export async function recordPayment(actorId: string, input: PaymentInput) {
  const existing = await prisma.feePayment.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { receipt: true },
  });
  if (existing) {
    if (
      existing.studentId !== input.studentId ||
      !decimal(existing.amount).eq(input.amount) ||
      existing.method !== input.method
    )
      throw AppError.badRequest(
        "This idempotency key was already used for a different payment.",
      );
    return existing;
  }
  const profile = await prisma.schoolProfile.findUnique({
    where: { id: "default" },
  });
  return serializable(async (tx) => {
    const duplicate = await tx.feePayment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { receipt: true },
    });
    if (duplicate) {
      if (
        duplicate.studentId !== input.studentId ||
        !decimal(duplicate.amount).eq(input.amount) ||
        duplicate.method !== input.method
      )
        throw AppError.badRequest(
          "This idempotency key was already used for a different payment.",
        );
      return duplicate;
    }
    const student = await tx.student.findUnique({
      where: { id: input.studentId },
    });
    if (!student) throw AppError.notFound("Student not found.");
    if (input.transactionRef) {
      const referenced = await tx.feePayment.findFirst({
        where: { method: input.method, transactionRef: input.transactionRef },
      });
      if (referenced)
        throw AppError.badRequest(
          "That transaction reference has already been recorded for this payment method.",
        );
    }
    const allocationTotalDecimal = input.allocations.reduce(
      (sum, item) => sum.plus(item.amount),
      ZERO,
    );
    const allocationTotal = round(allocationTotalDecimal);
    if (allocationTotalDecimal.gt(input.amount))
      throw AppError.badRequest(
        "Allocations cannot exceed the payment amount.",
      );
    const balances = await loadChargeBalances(
      tx,
      input.allocations.map((item) => item.chargeId),
      input.studentId,
    );
    for (const item of input.allocations)
      if (decimal(item.amount).gt(balances.get(item.chargeId)!.math.balance))
        throw AppError.badRequest(
          `Allocation exceeds the outstanding balance for ${balances.get(item.chargeId)!.charge.line.label}.`,
        );
    const payment = await tx.feePayment.create({
      data: {
        studentId: input.studentId,
        amount: input.amount,
        method: input.method,
        transactionRef: input.transactionRef || null,
        idempotencyKey: input.idempotencyKey,
        recordedById: actorId,
        moneyAccountId: await resolvePaymentMoneyAccount(
          tx,
          input.method,
          input.moneyAccountId,
        ),
        allocations: { create: input.allocations },
      },
    });
    const credit = round(decimal(input.amount).minus(allocationTotalDecimal));
    if (credit > 0)
      await tx.studentCreditLot.create({
        data: {
          studentId: input.studentId,
          paymentId: payment.id,
          amount: credit,
        },
      });
    await postFeePayment(tx, {
      actorId,
      paymentId: payment.id,
      studentId: payment.studentId,
      date: payment.postedAt,
      moneyAccountId: payment.moneyAccountId,
      amount: payment.amount,
      allocated: allocationTotalDecimal,
      credit,
    });
    const year = payment.postedAt.getUTCFullYear();
    const sequence = await tx.receiptSequence.upsert({
      where: { year },
      create: { year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    const receiptNumber = `RCP-${year}-${String(sequence.lastNumber).padStart(6, "0")}`;
    const snapshot = {
      receiptNumber,
      postedAt: payment.postedAt.toISOString(),
      school: profile ?? { name: "Lumen School" },
      recordedById: actorId,
      student: {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        admissionNo: student.admissionNo,
      },
      payment: {
        id: payment.id,
        amount: input.amount,
        method: input.method,
        transactionRef: input.transactionRef || null,
      },
      allocations: input.allocations.map((item) => ({
        chargeId: item.chargeId,
        label: balances.get(item.chargeId)!.charge.line.label,
        amount: item.amount,
      })),
      credit,
    };
    const pdf = generateFinancePdf({
      title: "FEE PAYMENT RECEIPT",
      school: profile ?? { name: "Lumen School" },
      reference: receiptNumber,
      student: snapshot.student,
      generatedAt: payment.postedAt.toISOString(),
      lines: snapshot.allocations.map(
        (item: { label: string; amount: number }) => ({
          label: item.label,
          credit: item.amount,
        }),
      ),
      totals: [
        { label: "Amount received", value: input.amount },
        ...(credit ? [{ label: "Credit created", value: credit }] : []),
      ],
      footer: `Paid via ${String(input.method).replaceAll("_", " ")}${input.transactionRef ? `; reference ${input.transactionRef}` : ""}. This receipt is protected by its audit checksum.`,
    });
    const checksum = crypto.createHash("sha256").update(pdf).digest("hex");
    const pdfPath = `${year}/receipts/${receiptNumber}.pdf`;
    await saveFinanceDocument(pdfPath, pdf);
    const receipt = await tx.feeReceipt.create({
      data: {
        paymentId: payment.id,
        number: receiptNumber,
        year,
        sequence: sequence.lastNumber,
        snapshot: snapshot as Prisma.InputJsonValue,
        pdfPath,
        checksum,
      },
    });
    await audit(tx, actorId, "PAYMENT_POSTED", "FeePayment", payment.id, {
      receiptNumber,
      amount: input.amount,
      credit,
    });
    return { ...payment, receipt };
  });
}

export async function allocateCredit(
  actorId: string,
  creditLotId: string,
  allocations: { chargeId: string; amount: number }[],
) {
  return serializable(async (tx) => {
    const lot = await tx.studentCreditLot.findUnique({
      where: { id: creditLotId },
      include: { allocations: true, payment: true },
    });
    if (
      !lot ||
      lot.status !== CreditLotStatus.ACTIVE ||
      lot.payment.status === FeePaymentStatus.REVERSED
    )
      throw AppError.badRequest("This credit is unavailable.");
    const availableDecimal = decimal(lot.amount).minus(
      lot.allocations
        .filter((item) => !item.reversedAt)
        .reduce((sum, item) => sum.plus(item.amount), ZERO),
    );
    const available = round(availableDecimal);
    const requestedDecimal = allocations.reduce(
      (sum, item) => sum.plus(item.amount),
      ZERO,
    );
    const requested = round(requestedDecimal);
    if (requestedDecimal.gt(availableDecimal))
      throw AppError.badRequest(
        "Credit allocations exceed the available credit.",
      );
    const balances = await loadChargeBalances(
      tx,
      allocations.map((item) => item.chargeId),
      lot.studentId,
    );
    for (const item of allocations)
      if (decimal(item.amount).gt(balances.get(item.chargeId)!.math.balance))
        throw AppError.badRequest(
          `Credit allocation exceeds the balance for ${balances.get(item.chargeId)!.charge.line.label}.`,
        );
    const batchId = crypto.randomUUID();
    await tx.creditAllocation.createMany({
      data: allocations.map((item) => ({
        id: crypto.randomUUID(),
        creditLotId,
        chargeId: item.chargeId,
        amount: item.amount,
        allocatedById: actorId,
      })),
    });
    await postCreditAllocation(tx, {
      actorId,
      creditLotId,
      studentId: lot.studentId,
      date: new Date(),
      amount: requestedDecimal,
      sourceKey: `CREDIT_ALLOCATION:${batchId}`,
    });
    await audit(
      tx,
      actorId,
      "CREDIT_ALLOCATED",
      "StudentCreditLot",
      creditLotId,
      { amount: requested },
    );
    return {
      allocated: requested,
      remaining: round(availableDecimal.minus(requestedDecimal)),
    };
  });
}

export async function requestAdjustment(
  actorId: string,
  input: AdjustmentInput,
) {
  const charge = await prisma.studentCharge.findUnique({
    where: { id: input.chargeId },
  });
  if (!charge) throw AppError.notFound("Student charge not found.");
  return prisma.$transaction(async (tx) => {
    const adjustment = await tx.chargeAdjustment.create({
      data: { ...input, requestedById: actorId },
    });
    await audit(
      tx,
      actorId,
      "ADJUSTMENT_REQUESTED",
      "ChargeAdjustment",
      adjustment.id,
      { chargeId: input.chargeId, type: input.type, amount: input.amount },
    );
    return adjustment;
  });
}

export async function listAdjustments(status?: string) {
  const adjustments = await prisma.chargeAdjustment.findMany({
    where:
      status && status !== "all"
        ? { status: status as FinanceDecisionStatus }
        : {},
    include: {
      charge: {
        include: {
          enrolment: { include: { student: true } },
          line: {
            include: {
              schedule: { include: { academicYear: true, term: true } },
            },
          },
        },
      },
      requestedBy: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return adjustments.map((item) => ({
    ...item,
    amount: number(item.amount),
    student: {
      id: item.charge.enrolment.student.id,
      name: `${item.charge.enrolment.student.firstName} ${item.charge.enrolment.student.lastName}`,
      admissionNo: item.charge.enrolment.student.admissionNo,
    },
    chargeLabel: item.charge.line.label,
    academicContext: `${item.charge.line.schedule.academicYear.name} · ${item.charge.line.schedule.term.name}`,
  }));
}

export async function decideAdjustment(
  actorId: string,
  id: string,
  approved: boolean,
) {
  return serializable(async (tx) => {
    const adjustment = await tx.chargeAdjustment.findUnique({
      where: { id },
      include: { charge: { include: chargeInclude } },
    });
    if (!adjustment) throw AppError.notFound("Adjustment request not found.");
    if (adjustment.status !== FinanceDecisionStatus.PENDING)
      throw AppError.badRequest("This adjustment has already been decided.");
    if (
      approved &&
      adjustment.type !== "CHARGE_DEBIT" &&
      number(adjustment.amount) > chargeMath(adjustment.charge).balance
    )
      throw AppError.badRequest(
        "The adjustment exceeds the remaining charge balance.",
      );
    const status = approved
      ? FinanceDecisionStatus.APPROVED
      : FinanceDecisionStatus.REJECTED;
    const updated = await tx.chargeAdjustment.update({
      where: { id },
      data: { status, decidedById: actorId, decidedAt: new Date() },
    });
    if (approved)
      await postFeeAdjustment(tx, {
        actorId,
        adjustmentId: adjustment.id,
        chargeId: adjustment.chargeId,
        studentId: adjustment.charge.enrolment.studentId,
        type: adjustment.type,
        amount: adjustment.amount,
        date: new Date(),
      });
    await audit(
      tx,
      actorId,
      approved ? "ADJUSTMENT_APPROVED" : "ADJUSTMENT_REJECTED",
      "ChargeAdjustment",
      id,
    );
    return updated;
  });
}

export async function requestReversal(
  actorId: string,
  paymentId: string,
  reason: string,
) {
  return serializable(async (tx) => {
    const payment = await tx.feePayment.findUnique({
      where: { id: paymentId },
      include: { reversal: true },
    });
    if (!payment) throw AppError.notFound("Payment not found.");
    if (payment.status !== FeePaymentStatus.POSTED || payment.reversal)
      throw AppError.badRequest(
        "This payment cannot be submitted for reversal.",
      );
    const reversal = await tx.paymentReversal.create({
      data: { paymentId, reason, requestedById: actorId },
    });
    await tx.feePayment.update({
      where: { id: paymentId },
      data: { status: FeePaymentStatus.REVERSAL_PENDING },
    });
    await audit(
      tx,
      actorId,
      "REVERSAL_REQUESTED",
      "PaymentReversal",
      reversal.id,
      { paymentId },
    );
    return reversal;
  });
}

export async function listReversals(status?: string) {
  const reversals = await prisma.paymentReversal.findMany({
    where:
      status && status !== "all"
        ? { status: status as FinanceDecisionStatus }
        : {},
    include: {
      payment: { include: { student: true, receipt: true } },
      requestedBy: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return reversals.map((item) => ({
    ...item,
    payment: { ...item.payment, amount: number(item.payment.amount) },
    student: {
      id: item.payment.student.id,
      name: `${item.payment.student.firstName} ${item.payment.student.lastName}`,
      admissionNo: item.payment.student.admissionNo,
    },
  }));
}

export async function decideReversal(
  actorId: string,
  id: string,
  approved: boolean,
) {
  return serializable(async (tx) => {
    const reversal = await tx.paymentReversal.findUnique({
      where: { id },
      include: { payment: { include: { creditLot: true } } },
    });
    if (!reversal) throw AppError.notFound("Reversal request not found.");
    if (reversal.status !== FinanceDecisionStatus.PENDING)
      throw AppError.badRequest("This reversal has already been decided.");
    const now = new Date();
    const status = approved
      ? FinanceDecisionStatus.APPROVED
      : FinanceDecisionStatus.REJECTED;
    await tx.paymentReversal.update({
      where: { id },
      data: { status, decidedById: actorId, decidedAt: now },
    });
    if (approved) {
      await tx.paymentAllocation.updateMany({
        where: { paymentId: reversal.paymentId, reversedAt: null },
        data: { reversedAt: now },
      });
      if (reversal.payment.creditLot) {
        await tx.creditAllocation.updateMany({
          where: {
            creditLotId: reversal.payment.creditLot.id,
            reversedAt: null,
          },
          data: { reversedAt: now },
        });
        await tx.studentCreditLot.update({
          where: { id: reversal.payment.creditLot.id },
          data: { status: CreditLotStatus.REVERSED },
        });
      }
      await tx.feePayment.update({
        where: { id: reversal.paymentId },
        data: { status: FeePaymentStatus.REVERSED },
      });
      await reverseJournalsForEntity(
        tx,
        actorId,
        "FeePayment",
        reversal.paymentId,
        reversal.reason,
      );
      if (reversal.payment.creditLot)
        await reverseJournalsForEntity(
          tx,
          actorId,
          "StudentCreditLot",
          reversal.payment.creditLot.id,
          reversal.reason,
        );
    } else
      await tx.feePayment.update({
        where: { id: reversal.paymentId },
        data: { status: FeePaymentStatus.POSTED },
      });
    await audit(
      tx,
      actorId,
      approved ? "REVERSAL_APPROVED" : "REVERSAL_REJECTED",
      "PaymentReversal",
      id,
      { paymentId: reversal.paymentId },
    );
    return { ...reversal, status };
  });
}

function utcDateRange(dateFrom?: string, dateTo?: string) {
  return dateFrom || dateTo
    ? {
        ...(dateFrom && { gte: new Date(`${dateFrom}T00:00:00.000Z`) }),
        ...(dateTo && {
          lt: new Date(
            new Date(`${dateTo}T00:00:00.000Z`).getTime() + 86_400_000,
          ),
        }),
      }
    : undefined;
}

function pagination(requestedPage: number, pageSize: number, total: number) {
  const totalPages = Math.ceil(total / pageSize);
  const page = totalPages ? Math.min(requestedPage, totalPages) : 1;
  return { page, pageSize, total, totalPages };
}

export async function listPayments(filters: PaymentListQuery) {
  const where: Prisma.FeePaymentWhereInput = {
    ...(filters.status && { status: filters.status }),
    ...(filters.method && { method: filters.method }),
    ...(utcDateRange(filters.dateFrom, filters.dateTo) && {
      postedAt: utcDateRange(filters.dateFrom, filters.dateTo),
    }),
    ...(filters.search && {
      OR: [
        {
          student: {
            firstName: { contains: filters.search, mode: "insensitive" },
          },
        },
        {
          student: {
            lastName: { contains: filters.search, mode: "insensitive" },
          },
        },
        {
          student: {
            admissionNo: { contains: filters.search, mode: "insensitive" },
          },
        },
        {
          receipt: {
            number: { contains: filters.search, mode: "insensitive" },
          },
        },
      ],
    }),
  };
  const total = await prisma.feePayment.count({ where });
  const pageInfo = pagination(filters.page, filters.pageSize, total);
  const payments = await prisma.feePayment.findMany({
    where,
    include: {
      student: true,
      receipt: true,
      reversal: true,
      recordedBy: { select: { id: true, name: true } },
      allocations: true,
      creditLot: true,
    },
    orderBy: { postedAt: "desc" },
    skip: (pageInfo.page - 1) * pageInfo.pageSize,
    take: pageInfo.pageSize,
  });
  return {
    payments: payments.map((payment) => ({
      ...payment,
      amount: number(payment.amount),
      allocated: round(
        payment.allocations
          .filter((item) => !item.reversedAt)
          .reduce((sum, item) => sum.plus(item.amount), ZERO),
      ),
      creditCreated: number(payment.creditLot?.amount),
    })),
    pagination: pageInfo,
  };
}

export async function getPayment(id: string) {
  const payment = await prisma.feePayment.findUnique({
    where: { id },
    include: {
      student: true,
      receipt: true,
      reversal: true,
      creditLot: { include: { allocations: true } },
      allocations: { include: { charge: { include: { line: true } } } },
      recordedBy: { select: { id: true, name: true } },
    },
  });
  if (!payment) throw AppError.notFound("Payment not found.");
  return {
    ...payment,
    amount: number(payment.amount),
    allocations: payment.allocations.map((item) => ({
      ...item,
      amount: number(item.amount),
    })),
  };
}

export async function listReceipts(filters: ReceiptListQuery) {
  const where: Prisma.FeeReceiptWhereInput = {
    ...(filters.status && { payment: { status: filters.status } }),
    ...(utcDateRange(filters.dateFrom, filters.dateTo) && {
      issuedAt: utcDateRange(filters.dateFrom, filters.dateTo),
    }),
    ...(filters.search
      ? {
          OR: [
            { number: { contains: filters.search, mode: "insensitive" } },
            {
              payment: {
                student: {
                  firstName: { contains: filters.search, mode: "insensitive" },
                },
              },
            },
            {
              payment: {
                student: {
                  lastName: { contains: filters.search, mode: "insensitive" },
                },
              },
            },
          ],
        }
      : {}),
  };
  const total = await prisma.feeReceipt.count({ where });
  const pageInfo = pagination(filters.page, filters.pageSize, total);
  const receipts = await prisma.feeReceipt.findMany({
    where,
    include: {
      payment: {
        include: {
          student: true,
          recordedBy: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { issuedAt: "desc" },
    skip: (pageInfo.page - 1) * pageInfo.pageSize,
    take: pageInfo.pageSize,
  });
  return {
    receipts: receipts.map((receipt) => ({
      id: receipt.id,
      number: receipt.number,
      issuedAt: receipt.issuedAt,
      checksum: receipt.checksum,
      status: receipt.payment.status,
      amount: number(receipt.payment.amount),
      method: receipt.payment.method,
      student: {
        id: receipt.payment.student.id,
        name: `${receipt.payment.student.firstName} ${receipt.payment.student.lastName}`,
        admissionNo: receipt.payment.student.admissionNo,
      },
      recordedBy: receipt.payment.recordedBy,
    })),
    pagination: pageInfo,
  };
}

export async function getReceipt(id: string) {
  const receipt = await prisma.feeReceipt.findUnique({
    where: { id },
    include: {
      payment: {
        include: {
          student: true,
          recordedBy: { select: { id: true, name: true } },
          reversal: true,
        },
      },
    },
  });
  if (!receipt) throw AppError.notFound("Receipt not found.");
  return {
    ...receipt,
    payment: { ...receipt.payment, amount: number(receipt.payment.amount) },
  };
}

export async function getReceiptPdf(id: string) {
  const receipt = await prisma.feeReceipt.findUnique({ where: { id } });
  if (!receipt) throw AppError.notFound("Receipt not found.");
  return {
    buffer: await readFinanceDocument(receipt.pdfPath),
    filename: `${receipt.number}.pdf`,
  };
}

export async function getStatementPdf(studentId: string) {
  const ledger = await getStudentLedger(studentId);
  const profile = await prisma.schoolProfile.findUnique({
    where: { id: "default" },
  });
  let running = ZERO;
  const lines = ledger.charges.map((charge) => {
    running = running.plus(charge.balance);
    return {
      label: charge.label,
      context: `${charge.academicYearName} - ${charge.termName} - ${charge.sectionName}`,
      debit: charge.net,
      credit: round(charge.paid + charge.creditApplied),
      balance: number(running),
    };
  });
  const pdf = generateFinancePdf({
    title: "STUDENT FEE STATEMENT",
    school: profile ?? { name: "Lumen School" },
    student: ledger.student,
    generatedAt: new Date().toISOString(),
    lines,
    totals: [
      { label: "Total billed", value: ledger.summary.billed },
      {
        label: "Total paid/credit",
        value: ledger.summary.paid + ledger.summary.creditApplied,
      },
      { label: "Outstanding", value: ledger.summary.outstanding },
      { label: "Future charges", value: ledger.summary.futureCharges },
      { label: "Available credit", value: ledger.summary.availableCredit },
      { label: "Net exposure", value: ledger.summary.netExposure },
    ],
    footer:
      "Balances include every academic year and remain auditable after year closure.",
  });
  return {
    buffer: pdf,
    filename: `${ledger.student.admissionNo.replaceAll("/", "-")}-fee-statement.pdf`,
  };
}

const BALANCE_CTES = Prisma.sql`
  active_context AS (
    SELECT ay.id AS academic_year_id, ay.start_date AS academic_year_start,
      t.id AS term_id, t.sequence AS term_sequence
    FROM academic_years ay
    LEFT JOIN terms t ON t.academic_year_id = ay.id AND t.status = 'ACTIVE'
    WHERE ay.status = 'ACTIVE'
    LIMIT 1
  ),
  adjustment_totals AS (
    SELECT charge_id,
      COALESCE(SUM(amount) FILTER (WHERE type = 'CHARGE_DEBIT'), 0) AS debits,
      COALESCE(SUM(amount) FILTER (WHERE type <> 'CHARGE_DEBIT'), 0) AS reductions
    FROM charge_adjustments
    WHERE status = 'APPROVED'
    GROUP BY charge_id
  ),
  payment_totals AS (
    SELECT pa.charge_id, COALESCE(SUM(pa.amount), 0) AS paid
    FROM payment_allocations pa
    JOIN fee_payments fp ON fp.id = pa.payment_id
    WHERE pa.reversed_at IS NULL AND fp.status <> 'REVERSED'
    GROUP BY pa.charge_id
  ),
  credit_totals AS (
    SELECT ca.charge_id, COALESCE(SUM(ca.amount), 0) AS credit_applied
    FROM credit_allocations ca
    JOIN student_credit_lots scl ON scl.id = ca.credit_lot_id
    WHERE ca.reversed_at IS NULL AND scl.status = 'ACTIVE'
    GROUP BY ca.charge_id
  ),
  charge_net AS (
    SELECT sc.id, se.student_id, fs.academic_year_id, fs.term_id,
      ay.start_date AS academic_year_start, t.sequence AS term_sequence, t.status AS term_status,
      GREATEST(0, sc.amount + COALESCE(adj.debits, 0) - COALESCE(adj.reductions, 0)) AS net,
      COALESCE(pay.paid, 0) AS paid,
      COALESCE(cr.credit_applied, 0) AS credit_applied
    FROM student_charges sc
    JOIN student_enrolments se ON se.id = sc.enrolment_id
    JOIN fee_schedule_lines fsl ON fsl.id = sc.line_id
    JOIN fee_schedules fs ON fs.id = fsl.schedule_id
    JOIN academic_years ay ON ay.id = fs.academic_year_id
    JOIN terms t ON t.id = fs.term_id
    LEFT JOIN adjustment_totals adj ON adj.charge_id = sc.id
    LEFT JOIN payment_totals pay ON pay.charge_id = sc.id
    LEFT JOIN credit_totals cr ON cr.charge_id = sc.id
  ),
  charge_balances AS (
    SELECT *, GREATEST(0, net - paid - credit_applied) AS balance
    FROM charge_net
  ),
  student_balances AS (
    SELECT cb.student_id,
      SUM(cb.net) AS billed,
      SUM(cb.paid) AS paid,
      SUM(cb.credit_applied) AS credit_applied,
      SUM(cb.balance) AS outstanding,
      SUM(cb.balance) FILTER (
        WHERE ac.academic_year_id IS NULL
          OR cb.academic_year_start < ac.academic_year_start
          OR (
            cb.academic_year_id = ac.academic_year_id
            AND (
              (ac.term_id IS NOT NULL AND cb.term_sequence < ac.term_sequence)
              OR (ac.term_id IS NULL AND cb.term_status = 'CLOSED')
            )
          )
      ) AS previous_arrears,
      SUM(cb.balance) FILTER (WHERE cb.academic_year_id = ac.academic_year_id AND cb.term_id = ac.term_id) AS current_term_balance,
      SUM(cb.balance) FILTER (WHERE cb.academic_year_id = ac.academic_year_id AND cb.term_status = 'PENDING') AS future_charges
    FROM charge_balances cb
    LEFT JOIN active_context ac ON TRUE
    GROUP BY cb.student_id
  ),
  student_credits AS (
    SELECT scl.student_id,
      GREATEST(0, SUM(scl.amount) - COALESCE(SUM(used.used), 0)) AS available_credit
    FROM student_credit_lots scl
    JOIN fee_payments fp ON fp.id = scl.payment_id AND fp.status <> 'REVERSED'
    LEFT JOIN (
      SELECT credit_lot_id, SUM(amount) AS used
      FROM credit_allocations
      WHERE reversed_at IS NULL
      GROUP BY credit_lot_id
    ) used ON used.credit_lot_id = scl.id
    WHERE scl.status = 'ACTIVE'
    GROUP BY scl.student_id
  ),
  current_placement AS (
    SELECT se.student_id, se.class_section_id, cs.grade_level_id, cs.name AS section_name, gl.name AS grade_level_name
    FROM student_enrolments se
    JOIN academic_years ay ON ay.id = se.academic_year_id AND ay.status = 'ACTIVE'
    JOIN class_sections cs ON cs.id = se.class_section_id
    JOIN grade_levels gl ON gl.id = cs.grade_level_id
    WHERE se.status = 'ACTIVE'
  )`;

type DebtorRow = {
  id: string | null;
  first_name: string | null;
  last_name: string | null;
  admission_no: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  section_name: string | null;
  grade_level_name: string | null;
  billed: Prisma.Decimal | null;
  paid: Prisma.Decimal | null;
  credit_applied: Prisma.Decimal | null;
  outstanding: Prisma.Decimal | null;
  available_credit: Prisma.Decimal | null;
  previous_arrears: Prisma.Decimal | null;
  current_term_balance: Prisma.Decimal | null;
  future_charges: Prisma.Decimal | null;
  net_exposure: Prisma.Decimal | null;
  total_rows: bigint;
  total_exposure: Prisma.Decimal;
  effective_page: bigint;
  row_number: bigint | null;
};

export async function getDebtorFilters() {
  const sections = await prisma.classSection.findMany({
    where: {
      active: true,
      academicYear: { status: AcademicYearStatus.ACTIVE },
    },
    include: { gradeLevel: true },
    orderBy: [{ gradeLevel: { order: "asc" } }, { name: "asc" }],
  });
  const grades = new Map<string, { id: string; name: string; order: number }>();
  for (const section of sections)
    grades.set(section.gradeLevel.id, {
      id: section.gradeLevel.id,
      name: section.gradeLevel.name,
      order: section.gradeLevel.order,
    });
  return {
    gradeLevels: [...grades.values()].sort((a, b) => a.order - b.order),
    sections: sections.map((section) => ({
      id: section.id,
      name: section.name,
      gradeLevelId: section.gradeLevelId,
    })),
  };
}

export async function listDebtors(filters: DebtorListQuery) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`GREATEST(0, sb.outstanding - COALESCE(sc.available_credit, 0)) > 0`,
  ];
  if (filters.gradeLevelId)
    conditions.push(Prisma.sql`cp.grade_level_id = ${filters.gradeLevelId}`);
  if (filters.classSectionId)
    conditions.push(
      Prisma.sql`cp.class_section_id = ${filters.classSectionId}`,
    );
  if (filters.search) {
    const search = `%${filters.search}%`;
    conditions.push(
      Prisma.sql`(s.first_name ILIKE ${search} OR s.last_name ILIKE ${search} OR s.admission_no ILIKE ${search})`,
    );
  }
  const rows = await prisma.$queryRaw<DebtorRow[]>(Prisma.sql`
    WITH ${BALANCE_CTES},
    filtered_debtors AS (
      SELECT s.id, s.first_name, s.last_name, s.admission_no, s.guardian_name, s.guardian_phone,
        cp.section_name, cp.grade_level_name,
        sb.billed, sb.paid, sb.credit_applied, sb.outstanding,
        COALESCE(sc.available_credit, 0) AS available_credit,
        COALESCE(sb.previous_arrears, 0) AS previous_arrears,
        COALESCE(sb.current_term_balance, 0) AS current_term_balance,
        COALESCE(sb.future_charges, 0) AS future_charges,
        GREATEST(0, sb.outstanding - COALESCE(sc.available_credit, 0)) AS net_exposure
      FROM student_balances sb
      JOIN students s ON s.id = sb.student_id
      LEFT JOIN student_credits sc ON sc.student_id = sb.student_id
      LEFT JOIN current_placement cp ON cp.student_id = sb.student_id
      WHERE ${Prisma.join(conditions, " AND ")}
    ),
    metadata AS (
      SELECT COUNT(*) AS total_rows,
        COALESCE(SUM(net_exposure), 0) AS total_exposure,
        CASE
          WHEN COUNT(*) = 0 THEN 1
          ELSE LEAST(
            ${filters.page},
            CEIL(COUNT(*)::numeric / ${filters.pageSize})::integer
          )
        END AS effective_page
      FROM filtered_debtors
    ),
    ranked_debtors AS (
      SELECT filtered_debtors.*,
        ROW_NUMBER() OVER (ORDER BY net_exposure DESC, last_name, first_name) AS row_number
      FROM filtered_debtors
    )
    SELECT ranked_debtors.*, metadata.total_rows, metadata.total_exposure, metadata.effective_page
    FROM metadata
    LEFT JOIN ranked_debtors ON ranked_debtors.row_number > (metadata.effective_page - 1) * ${filters.pageSize}
      AND ranked_debtors.row_number <= metadata.effective_page * ${filters.pageSize}
    ORDER BY ranked_debtors.row_number
  `);
  const total = Number(rows[0]?.total_rows ?? 0);
  const effectivePage = Number(rows[0]?.effective_page ?? 1);
  return {
    debtors: rows.flatMap((row) =>
      row.id
        ? [
            {
              student: {
                id: row.id,
                name: `${row.first_name!} ${row.last_name!}`,
                admissionNo: row.admission_no!,
                guardianName: row.guardian_name!,
                guardianPhone: row.guardian_phone!,
                sectionName: row.section_name,
                gradeLevelName: row.grade_level_name,
              },
              billed: number(row.billed),
              paid: number(row.paid),
              creditApplied: number(row.credit_applied),
              outstanding: number(row.outstanding),
              availableCredit: number(row.available_credit),
              previousArrears: number(row.previous_arrears),
              currentTermBalance: number(row.current_term_balance),
              futureCharges: number(row.future_charges),
              netExposure: number(row.net_exposure),
            },
          ]
        : [],
    ),
    pagination: pagination(effectivePage, filters.pageSize, total),
    totals: { netExposure: number(rows[0]?.total_exposure) },
  };
}

export async function getFinanceSummary() {
  const activeYear = await prisma.academicYear.findFirst({
    where: { status: AcademicYearStatus.ACTIVE },
    include: { terms: true },
  });
  const activeTerm = activeYear?.terms.find(
    (term) => term.status === TermStatus.ACTIVE,
  );
  if (!activeYear || !activeTerm)
    return {
      available: false,
      reason: "No active academic year and term.",
      billed: 0,
      collected: 0,
      outstanding: 0,
      collectionRate: null,
      recentPayments: [],
    };
  const [summaryRows, recentPaymentsRaw] = await Promise.all([
    prisma.$queryRaw<
      { billed: Prisma.Decimal; collected: Prisma.Decimal }[]
    >(Prisma.sql`
      WITH ${BALANCE_CTES}
      SELECT COALESCE(SUM(net), 0) AS billed, COALESCE(SUM(paid + credit_applied), 0) AS collected
      FROM charge_balances
      WHERE academic_year_id = ${activeYear.id} AND term_id = ${activeTerm.id}
    `),
    prisma.feePayment.findMany({
      where: { status: { not: FeePaymentStatus.REVERSED } },
      include: { student: true, receipt: true },
      orderBy: { postedAt: "desc" },
      take: 5,
    }),
  ]);
  const billed = number(summaryRows[0]?.billed);
  const collected = number(summaryRows[0]?.collected);
  const recentPayments = recentPaymentsRaw.map((payment) => ({
    id: payment.id,
    studentName: `${payment.student.firstName} ${payment.student.lastName}`,
    amount: number(payment.amount),
    postedAt: payment.postedAt,
    receiptNumber: payment.receipt?.number ?? null,
  }));
  return {
    available: true,
    reason: null,
    academicYearName: activeYear.name,
    termName: activeTerm.name,
    billed,
    collected,
    outstanding: round(nonNegative(decimal(billed).minus(collected))),
    collectionRate: billed
      ? decimal(collected)
          .dividedBy(billed)
          .times(100)
          .toDecimalPlaces(1)
          .toNumber()
      : null,
    recentPayments,
  };
}
