import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../../lib/errors.js";

function calculateGrade(total: number) {
  if (total >= 90) return { grade: "A", remarks: "Excellent" };
  if (total >= 80) return { grade: "B", remarks: "Very Good" };
  if (total >= 70) return { grade: "C", remarks: "Good" };
  if (total >= 60) return { grade: "D", remarks: "Credit" };
  if (total >= 50) return { grade: "E", remarks: "Pass" };
  return { grade: "F", remarks: "Fail" };
}

export async function listClassSubjectsForUser(userId: string, roleSlug: string) {
  const where: any = {};
  if (roleSlug === "teacher") {
    where.teacherId = userId;
  }

  const classSubjects = await prisma.classSubject.findMany({
    where,
    include: {
      classRoom: true,
      subject: true,
      teacher: {
        select: { id: true, name: true },
      },
    },
    orderBy: [
      { classRoom: { level: "asc" } },
      { subject: { name: "asc" } },
    ],
  });

  return classSubjects.map((cs) => ({
    id: cs.id,
    classId: cs.classId,
    className: cs.classRoom.name,
    subjectId: cs.subjectId,
    subjectName: cs.subject.name,
    subjectCode: cs.subject.code,
    teacherId: cs.teacherId,
    teacherName: cs.teacher?.name ?? "Unassigned",
    passMark: cs.passMark,
    weight: cs.weight,
  }));
}

export async function listGradebook(classSubjectId: string, activeTermId: string) {
  const classSubject = await prisma.classSubject.findUnique({
    where: { id: classSubjectId },
    include: { classRoom: true, subject: true },
  });

  if (!classSubject) {
    throw AppError.notFound("Class subject assignment not found");
  }

  // Get active student enrollments
  const enrollments = await prisma.studentEnrolment.findMany({
    where: {
      classId: classSubject.classId,
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

  // Get existing grades
  const grades = await prisma.gradeBook.findMany({
    where: {
      classSubjectId,
      termId: activeTermId,
      studentId: { in: studentsList.map((s) => s.id) },
    },
  });

  const gradesMap = new Map(grades.map((g) => [g.studentId, g]));

  const records = studentsList.map((s) => {
    const record = gradesMap.get(s.id);
    return {
      id: record?.id ?? null,
      studentId: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      admissionNo: s.admissionNo,
      photoColor: s.photoColor,
      classScore: record?.classScore ?? 0,
      examScore: record?.examScore ?? 0,
      totalScore: record?.totalScore ?? 0,
      grade: record?.grade ?? null,
      remarks: record?.remarks ?? null,
    };
  });

  return {
    classSubject: {
      id: classSubject.id,
      className: classSubject.classRoom.name,
      subjectName: classSubject.subject.name,
      subjectCode: classSubject.subject.code,
      passMark: classSubject.passMark,
      weight: classSubject.weight,
    },
    records,
  };
}

export async function saveGradebook(
  classSubjectId: string,
  activeTermId: string,
  entries: { studentId: string; classScore: number; examScore: number }[]
) {
  const classSubject = await prisma.classSubject.findUnique({
    where: { id: classSubjectId },
  });

  if (!classSubject) {
    throw AppError.notFound("Class subject assignment not found");
  }

  return prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      const totalScore = entry.classScore + entry.examScore;
      const { grade, remarks } = calculateGrade(totalScore);

      const existing = await tx.gradeBook.findUnique({
        where: {
          studentId_classSubjectId_termId: {
            studentId: entry.studentId,
            classSubjectId,
            termId: activeTermId,
          },
        },
      });

      if (existing) {
        await tx.gradeBook.update({
          where: { id: existing.id },
          data: {
            classScore: entry.classScore,
            examScore: entry.examScore,
            totalScore,
            grade,
            remarks,
          },
        });
      } else {
        await tx.gradeBook.create({
          data: {
            studentId: entry.studentId,
            classSubjectId,
            termId: activeTermId,
            classScore: entry.classScore,
            examScore: entry.examScore,
            totalScore,
            grade,
            remarks,
          },
        });
      }
    }
  });
}
