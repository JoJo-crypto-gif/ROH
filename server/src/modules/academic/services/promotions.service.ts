import {
  AcademicYearStatus,
  EnrollmentStatus,
  PromotionDecision,
  PromotionStatus,
  StudentStatus,
  TermStatus,
} from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../../lib/errors.js";
import { assertSectionAccess } from "./access.service.js";

export async function listPromotions(
  userId: string,
  roleSlug: string,
  sectionId: string,
) {
  const section = await assertSectionAccess(userId, roleSlug, sectionId);
  const enrolments = await prisma.studentEnrolment.findMany({
    where: {
      classSectionId: sectionId,
      academicYearId: section.academicYearId,
      status: "ACTIVE",
    },
    include: {
      student: true,
      promotions: {
        include: { nextEnrolment: { include: { classSection: true } } },
      },
    },
    orderBy: [
      { student: { lastName: "asc" } },
      { student: { firstName: "asc" } },
    ],
  });
  return enrolments.map((enrolment) => {
    const promotion = enrolment.promotions[0] ?? null;
    return {
      enrolmentId: enrolment.id,
      studentId: enrolment.studentId,
      firstName: enrolment.student.firstName,
      lastName: enrolment.student.lastName,
      admissionNo: enrolment.student.admissionNo,
      photoColor: enrolment.student.photoColor,
      studentStatus: enrolment.student.status,
      decision: promotion?.decision ?? null,
      recommendation: promotion?.decision ?? "PENDING",
      promotionStatus: promotion?.status ?? PromotionStatus.PENDING,
      remarks: promotion?.remarks ?? "",
      targetSectionId: promotion?.nextEnrolment?.classSectionId ?? null,
      targetSectionName: promotion?.nextEnrolment?.classSection.name ?? null,
    };
  });
}

export async function saveRecommendations(
  actorId: string,
  roleSlug: string,
  sectionId: string,
  recommendations: {
    enrolmentId: string;
    decision: PromotionDecision;
    remarks?: string;
  }[],
) {
  const section = await assertSectionAccess(actorId, roleSlug, sectionId);
  const enrolments = await prisma.studentEnrolment.findMany({
    where: {
      id: { in: recommendations.map((item) => item.enrolmentId) },
      classSectionId: sectionId,
      status: "ACTIVE",
    },
  });
  if (
    enrolments.length !==
    new Set(recommendations.map((item) => item.enrolmentId)).size
  )
    throw AppError.badRequest(
      "One or more students do not belong to this active section.",
    );
  return prisma.$transaction(async (tx) => {
    for (const item of recommendations) {
      const existing = await tx.promotion.findUnique({
        where: { currentEnrolmentId: item.enrolmentId },
      });
      if (existing?.status === PromotionStatus.APPROVED)
        throw AppError.conflict(
          "An approved promotion decision cannot be replaced.",
        );
      await tx.promotion.upsert({
        where: { currentEnrolmentId: item.enrolmentId },
        update: {
          decision: item.decision,
          remarks: item.remarks ?? null,
          recommendedById: actorId,
          status: PromotionStatus.PENDING,
        },
        create: {
          currentEnrolmentId: item.enrolmentId,
          decision: item.decision,
          remarks: item.remarks ?? null,
          recommendedById: actorId,
        },
      });
    }
    await tx.academicAuditLog.create({
      data: {
        actorId,
        action: "PROMOTION_RECOMMENDATIONS_SAVED",
        entityType: "ClassSection",
        entityId: section.id,
        metadata: { count: recommendations.length },
      },
    });
  });
}

export async function approvePromotions(
  actorId: string,
  roleSlug: string,
  sectionId: string,
  nextYearId: string,
  defaultTargetSectionId: string | null,
  overrides: { enrolmentId: string; targetSectionId: string | null }[],
) {
  const section = await assertSectionAccess(actorId, roleSlug, sectionId);
  const [currentYear, nextYear] = await Promise.all([
    prisma.academicYear.findUnique({
      where: { id: section.academicYearId },
      include: { terms: true },
    }),
    prisma.academicYear.findUnique({ where: { id: nextYearId } }),
  ]);
  if (!currentYear || currentYear.status !== AcademicYearStatus.ACTIVE)
    throw AppError.badRequest(
      "Promotions can run only from the active academic year.",
    );
  const finalTerm = [...currentYear.terms].sort(
    (a, b) => b.sequence - a.sequence,
  )[0];
  if (!finalTerm || finalTerm.status !== TermStatus.CLOSED)
    throw AppError.badRequest(
      "The final configured term must be closed before promotions.",
    );
  if (!nextYear || nextYear.status !== AcademicYearStatus.DRAFT)
    throw AppError.badRequest(
      "The target academic year must exist in draft status.",
    );
  if (nextYear.startDate <= currentYear.startDate)
    throw AppError.badRequest(
      "The target academic year must follow the current year.",
    );

  const enrolments = await prisma.studentEnrolment.findMany({
    where: { classSectionId: sectionId, status: EnrollmentStatus.ACTIVE },
    include: { student: true, promotions: true },
  });
  if (enrolments.some((enrolment) => !enrolment.promotions[0]))
    throw AppError.badRequest(
      "Every student requires a promotion recommendation.",
    );
  const overrideMap = new Map(
    overrides.map((item) => [item.enrolmentId, item.targetSectionId]),
  );
  const targetIds = new Set<string>();
  if (defaultTargetSectionId) targetIds.add(defaultTargetSectionId);
  for (const target of overrideMap.values()) if (target) targetIds.add(target);
  const targets = await prisma.classSection.findMany({
    where: {
      id: { in: [...targetIds] },
      academicYearId: nextYearId,
      active: true,
    },
    include: { gradeLevel: true },
  });
  const targetMap = new Map(targets.map((target) => [target.id, target]));
  if (targetMap.size !== targetIds.size)
    throw AppError.badRequest(
      "A selected target section does not belong to the next draft year.",
    );

  return prisma.$transaction(async (tx) => {
    let approved = 0;
    for (const enrolment of enrolments) {
      const promotion = enrolment.promotions[0];
      if (promotion.status === PromotionStatus.APPROVED) continue;
      const decision = promotion.decision;
      let nextEnrolmentId: string | null = null;
      if (
        decision === PromotionDecision.PROMOTE ||
        decision === PromotionDecision.REPEAT
      ) {
        const targetId =
          overrideMap.get(enrolment.id) ?? defaultTargetSectionId;
        if (!targetId)
          throw AppError.badRequest(
            `A target section is required for ${enrolment.student.firstName} ${enrolment.student.lastName}.`,
          );
        const target = targetMap.get(targetId);
        if (!target) throw AppError.badRequest("Target section not found.");
        const expectedGradeId =
          decision === PromotionDecision.PROMOTE
            ? section.gradeLevelId &&
              (
                await tx.gradeLevel.findUnique({
                  where: { id: section.gradeLevelId },
                })
              )?.nextGradeLevelId
            : section.gradeLevelId;
        if (decision === PromotionDecision.PROMOTE && !expectedGradeId)
          throw AppError.badRequest(
            "This grade level has no configured next grade; choose graduate or repeat.",
          );
        if (target.gradeLevelId !== expectedGradeId)
          throw AppError.badRequest(
            `The selected target section is not valid for ${decision.toLowerCase()}.`,
          );
        const firstTerm = await tx.term.findFirst({
          where: { academicYearId: nextYearId },
          orderBy: { sequence: "asc" },
        });
        const nextEnrolment = await tx.studentEnrolment.upsert({
          where: {
            studentId_academicYearId: {
              studentId: enrolment.studentId,
              academicYearId: nextYearId,
            },
          },
          update: {
            classSectionId: target.id,
            status: EnrollmentStatus.PLANNED,
          },
          create: {
            studentId: enrolment.studentId,
            academicYearId: nextYearId,
            classSectionId: target.id,
            status: EnrollmentStatus.PLANNED,
            feeEffectiveTermId: firstTerm?.id,
          },
        });
        nextEnrolmentId = nextEnrolment.id;
        await tx.student.update({
          where: { id: enrolment.studentId },
          data: { status: StudentStatus.ACTIVE },
        });
      } else if (decision === PromotionDecision.GRADUATE) {
        const grade = await tx.gradeLevel.findUnique({
          where: { id: section.gradeLevelId },
        });
        if (!grade?.isFinal)
          throw AppError.badRequest(
            "Only students in a final grade level can graduate.",
          );
        await tx.student.update({
          where: { id: enrolment.studentId },
          data: { status: StudentStatus.GRADUATED },
        });
      } else if (decision === PromotionDecision.WITHDRAW) {
        await tx.student.update({
          where: { id: enrolment.studentId },
          data: { status: StudentStatus.WITHDRAWN },
        });
      } else if (decision === PromotionDecision.TRANSFER) {
        await tx.student.update({
          where: { id: enrolment.studentId },
          data: { status: StudentStatus.TRANSFERRED },
        });
      }
      await tx.studentEnrolment.update({
        where: { id: enrolment.id },
        data: { status: EnrollmentStatus.COMPLETED, completedAt: new Date() },
      });
      await tx.promotion.update({
        where: { id: promotion.id },
        data: {
          status: PromotionStatus.APPROVED,
          nextEnrolmentId,
          approvedById: actorId,
          approvedAt: new Date(),
        },
      });
      approved++;
    }
    await tx.academicAuditLog.create({
      data: {
        actorId,
        action: "PROMOTIONS_APPROVED",
        entityType: "ClassSection",
        entityId: sectionId,
        metadata: { nextYearId, approved },
      },
    });
    return { approved };
  });
}
