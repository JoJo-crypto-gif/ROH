import { AttendanceStatus, TermStatus } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../../lib/errors.js";
import { assertSectionAccess } from "./access.service.js";

function dayStart(value: Date) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

async function validateContext(userId: string, roleSlug: string, sectionId: string, termId: string, date?: Date) {
  const [section, term] = await Promise.all([
    assertSectionAccess(userId, roleSlug, sectionId),
    prisma.term.findUnique({ where: { id: termId } }),
  ]);
  if (!term) throw AppError.notFound("Term not found.");
  if (term.academicYearId !== section.academicYearId) throw AppError.badRequest("Term and class section belong to different academic years.");
  if (date) {
    const normalized = dayStart(date);
    if (normalized < dayStart(term.startDate) || normalized > dayStart(term.endDate)) throw AppError.badRequest("Attendance date must fall inside the selected term.");
  }
  return { section, term };
}

export async function listAttendance(userId: string, roleSlug: string, sectionId: string, date: Date, termId: string) {
  await validateContext(userId, roleSlug, sectionId, termId, date);
  const normalizedDate = dayStart(date);
  const enrolments = await prisma.studentEnrolment.findMany({
    where: { classSectionId: sectionId, status: "ACTIVE" },
    include: { student: true, attendance: { where: { date: normalizedDate } } },
    orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
  });
  return enrolments.map((enrolment) => ({
    enrolmentId: enrolment.id,
    studentId: enrolment.student.id,
    firstName: enrolment.student.firstName,
    lastName: enrolment.student.lastName,
    admissionNo: enrolment.student.admissionNo,
    photoColor: enrolment.student.photoColor,
    status: enrolment.attendance[0]?.status ?? AttendanceStatus.PRESENT,
  }));
}

export async function saveAttendance(
  actorId: string,
  roleSlug: string,
  sectionId: string,
  termId: string,
  date: Date,
  marks: { enrolmentId: string; status: AttendanceStatus }[],
) {
  const { term } = await validateContext(actorId, roleSlug, sectionId, termId, date);
  if (term.status !== TermStatus.ACTIVE) throw AppError.badRequest("Attendance can be changed only for the active term.");
  const normalizedDate = dayStart(date);
  const enrolments = await prisma.studentEnrolment.findMany({ where: { id: { in: marks.map((mark) => mark.enrolmentId) }, classSectionId: sectionId, academicYearId: term.academicYearId, status: "ACTIVE" } });
  if (enrolments.length !== new Set(marks.map((mark) => mark.enrolmentId)).size) throw AppError.badRequest("One or more attendance entries do not belong to this active class section.");
  return prisma.$transaction(async (tx) => {
    for (const mark of marks) {
      await tx.attendance.upsert({
        where: { enrolmentId_date: { enrolmentId: mark.enrolmentId, date: normalizedDate } },
        update: { status: mark.status, termId },
        create: { enrolmentId: mark.enrolmentId, termId, date: normalizedDate, status: mark.status },
      });
    }
    await tx.academicAuditLog.create({ data: { actorId, action: "ATTENDANCE_SAVED", entityType: "ClassSection", entityId: sectionId, metadata: { termId, date: normalizedDate.toISOString(), count: marks.length } } });
  });
}

export async function listAttendanceDates(userId: string, roleSlug: string, sectionId: string, termId: string) {
  await validateContext(userId, roleSlug, sectionId, termId);
  const records = await prisma.attendance.findMany({
    where: { termId, enrolment: { classSectionId: sectionId } },
    select: { date: true },
    distinct: ["date"],
    orderBy: { date: "asc" },
  });
  return records.map((record) => record.date.toISOString().slice(0, 10));
}
