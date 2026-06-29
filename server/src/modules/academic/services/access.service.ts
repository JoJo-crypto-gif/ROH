import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../../lib/errors.js";

export function hasAcademicWideAccess(roleSlug: string) {
  return (
    roleSlug === "super-admin" ||
    roleSlug === "school-admin" ||
    roleSlug === "principal"
  );
}

export type AcademicAccessScope = "ALL" | "ASSIGNED" | "NONE";

export function resolveAcademicAccessScope(
  roleSlug: string,
  staff?: { category: string; status: string } | null,
): AcademicAccessScope {
  if (hasAcademicWideAccess(roleSlug)) return "ALL";
  if (!staff || staff.status !== "ACTIVE") return "NONE";
  return staff.category === "TEACHING" ? "ASSIGNED" : "ALL";
}

export async function getAcademicAccessScope(
  userId: string,
  roleSlug: string,
): Promise<AcademicAccessScope> {
  const staff = await prisma.schoolStaff.findUnique({
    where: { userId },
    select: { category: true, status: true },
  });
  return resolveAcademicAccessScope(roleSlug, staff);
}

export function canAccessSection(
  roleSlug: string,
  userId: string,
  classTeacherId: string | null,
) {
  return hasAcademicWideAccess(roleSlug) || classTeacherId === userId;
}

export async function hasAssignedSectionScope(
  userId: string,
  roleSlug: string,
) {
  return (await getAcademicAccessScope(userId, roleSlug)) === "ASSIGNED";
}

export async function assertSectionAccess(
  userId: string,
  roleSlug: string,
  sectionId: string,
) {
  const section = await prisma.classSection.findUnique({
    where: { id: sectionId },
    include: { gradeLevel: true, academicYear: true },
  });
  if (!section) throw AppError.notFound("Class section not found.");
  const scope = await getAcademicAccessScope(userId, roleSlug);
  if (
    scope === "NONE" ||
    (scope === "ASSIGNED" && section.classTeacherId !== userId)
  ) {
    throw AppError.forbidden(
      "You can access only your assigned class section.",
    );
  }
  return section;
}

export async function assertEnrolmentAccess(
  userId: string,
  roleSlug: string,
  enrolmentId: string,
) {
  const enrolment = await prisma.studentEnrolment.findUnique({
    where: { id: enrolmentId },
    include: {
      student: true,
      academicYear: true,
      classSection: {
        include: {
          gradeLevel: true,
          classTeacher: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!enrolment) throw AppError.notFound("Student enrolment not found.");
  const scope = await getAcademicAccessScope(userId, roleSlug);
  if (
    scope === "NONE" ||
    (scope === "ASSIGNED" && enrolment.classSection.classTeacherId !== userId)
  ) {
    throw AppError.forbidden(
      "You can access only students in your assigned class section.",
    );
  }
  return enrolment;
}
