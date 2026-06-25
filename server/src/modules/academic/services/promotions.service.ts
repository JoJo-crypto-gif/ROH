import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../../lib/errors.js";

export async function listPromotions(classId: string, activeYearId: string) {
  const enrollments = await prisma.studentEnrolment.findMany({
    where: {
      classId,
      academicYearId: activeYearId,
    },
    include: {
      student: true,
      promotions: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: {
      student: { lastName: "asc" },
    },
  });

  return enrollments.map((e) => {
    const s = e.student;
    const promo = e.promotions?.[0] || null;

    return {
      studentId: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      admissionNo: s.admissionNo,
      photoColor: s.photoColor,
      status: s.status,
      enrolmentId: e.id,
      recommendation: promo?.recommendation ?? "Pending",
      promotionStatus: promo?.status ?? "PENDING",
      remarks: promo?.remarks ?? "",
    };
  });
}

export async function saveRecommendations(
  recommendedById: string,
  classId: string,
  activeYearId: string,
  recs: { studentId: string; recommendation: string; remarks?: string }[]
) {
  return prisma.$transaction(async (tx) => {
    for (const rec of recs) {
      const enrolment = await tx.studentEnrolment.findUnique({
        where: {
          studentId_academicYearId: {
            studentId: rec.studentId,
            academicYearId: activeYearId,
          },
        },
      });

      if (!enrolment || enrolment.classId !== classId) {
        continue; // skip if student not enrolled in this class
      }

      const existing = await tx.promotion.findFirst({
        where: {
          studentEnrolmentId: enrolment.id,
        },
      });

      if (existing) {
        await tx.promotion.update({
          where: { id: existing.id },
          data: {
            recommendation: rec.recommendation,
            remarks: rec.remarks ?? null,
            recommendedById,
            status: "PENDING", // reset status if updated
          },
        });
      } else {
        await tx.promotion.create({
          data: {
            studentEnrolmentId: enrolment.id,
            recommendation: rec.recommendation,
            remarks: rec.remarks ?? null,
            recommendedById,
            status: "PENDING",
          },
        });
      }
    }
  });
}

export async function approvePromotions(
  approvedById: string,
  classId: string,
  targetClassId: string
) {
  const activeYear = await prisma.academicYear.findFirst({
    where: { active: true },
  });

  if (!activeYear) {
    throw AppError.badRequest("No active academic year configured.");
  }

  // Calculate next year name (e.g. "2025 / 2026" -> "2026 / 2027")
  const parts = activeYear.name.split("/").map((p) => parseInt(p.trim(), 10));
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
    throw AppError.badRequest("Current active year name format is invalid. Must be 'YYYY / YYYY'.");
  }
  const nextName = `${parts[0] + 1} / ${parts[1] + 1}`;

  const nextYear = await prisma.academicYear.findUnique({
    where: { name: nextName },
  });

  if (!nextYear) {
    throw AppError.badRequest(
      `The upcoming academic year "${nextName}" must be created and configured in Academic Setup first before executing promotions.`
    );
  }

  // Get classrooms to verify
  const currentClass = await prisma.classRoom.findUnique({ where: { id: classId } });
  const nextClass = await prisma.classRoom.findUnique({ where: { id: targetClassId } });

  if (!currentClass || !nextClass) {
    throw AppError.badRequest("Invalid classroom configurations.");
  }

  // Fetch student enrollments in classId for activeYearId
  const enrollments = await prisma.studentEnrolment.findMany({
    where: {
      classId,
      academicYearId: activeYear.id,
    },
    include: {
      promotions: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return prisma.$transaction(async (tx) => {
    for (const e of enrollments) {
      const promo = e.promotions?.[0];
      if (!promo || promo.status !== "PENDING") {
        continue; // skip if no pending recommendation
      }

      let nextEnrolmentId: string | null = null;

      // Handle recommendation rollover logic
      if (promo.recommendation === "Promote") {
        // Create enrollment in target class for next year
        const nextEnroll = await tx.studentEnrolment.create({
          data: {
            studentId: e.studentId,
            classId: targetClassId,
            academicYearId: nextYear.id,
          },
        });
        nextEnrolmentId = nextEnroll.id;
        await tx.student.update({
          where: { id: e.studentId },
          data: { status: "active" },
        });
      } else if (promo.recommendation === "Repeat") {
        // Create enrollment in current class for next year
        const nextEnroll = await tx.studentEnrolment.create({
          data: {
            studentId: e.studentId,
            classId,
            academicYearId: nextYear.id,
          },
        });
        nextEnrolmentId = nextEnroll.id;
        await tx.student.update({
          where: { id: e.studentId },
          data: { status: "repeating" },
        });
      } else if (promo.recommendation === "Graduate") {
        await tx.student.update({
          where: { id: e.studentId },
          data: { status: "graduated" },
        });
      } else if (promo.recommendation === "Withdraw") {
        await tx.student.update({
          where: { id: e.studentId },
          data: { status: "withdrawn" },
        });
      } else if (promo.recommendation === "Transfer") {
        await tx.student.update({
          where: { id: e.studentId },
          data: { status: "withdrawn" },
        });
      }

      // Update promotion record to approved
      await tx.promotion.update({
        where: { id: promo.id },
        data: {
          status: "APPROVED",
          approvedById,
          nextEnrolmentId,
        },
      });
    }
  });
}
