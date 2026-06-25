import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../../lib/errors.js";

export async function listAttendance(classId: string, date: Date, activeTermId: string) {
  // Find all active students in the classroom for this year
  const enrollments = await prisma.studentEnrolment.findMany({
    where: {
      classId,
      academicYear: { active: true },
      student: { status: "active" },
    },
    include: {
      student: true,
    },
    orderBy: {
      student: { lastName: "asc" },
    },
  });

  const studentsList = enrollments.map((e) => e.student);

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Find existing attendance marks
  const attendanceRecords = await prisma.attendance.findMany({
    where: {
      termId: activeTermId,
      date: {
        gte: startOfDay,
        lte: endOfDay,
      },
      studentId: { in: studentsList.map((s) => s.id) },
    },
  });

  const marksMap = new Map(attendanceRecords.map((r) => [r.studentId, r.status]));

  return studentsList.map((s) => ({
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    admissionNo: s.admissionNo,
    photoColor: s.photoColor,
    status: marksMap.get(s.id) || "Present", // defaults to "Present"
  }));
}

export async function saveAttendance(
  activeTermId: string,
  date: Date,
  marks: { studentId: string; status: string }[]
) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return prisma.$transaction(async (tx) => {
    for (const mark of marks) {
      // Find if mark already exists
      const existing = await tx.attendance.findFirst({
        where: {
          studentId: mark.studentId,
          termId: activeTermId,
          date: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });

      if (existing) {
        await tx.attendance.update({
          where: { id: existing.id },
          data: { status: mark.status },
        });
      } else {
        await tx.attendance.create({
          data: {
            studentId: mark.studentId,
            termId: activeTermId,
            date: startOfDay,
            status: mark.status,
          },
        });
      }
    }
  });
}

export async function listAttendanceDates(classId: string, activeTermId: string) {
  // Find all active students in the classroom for this year
  const enrollments = await prisma.studentEnrolment.findMany({
    where: {
      classId,
      academicYear: { active: true },
      student: { status: "active" },
    },
    select: {
      studentId: true,
    },
  });

  const studentIds = enrollments.map((e) => e.studentId);

  if (studentIds.length === 0) return [];

  // Find all unique dates where attendance was recorded for these students
  const records = await prisma.attendance.findMany({
    where: {
      termId: activeTermId,
      studentId: { in: studentIds },
    },
    select: {
      date: true,
    },
    distinct: ["date"],
  });

  // Return formatted YYYY-MM-DD strings
  return records.map((r) => r.date.toISOString().slice(0, 10));
}
