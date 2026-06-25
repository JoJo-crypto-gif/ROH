import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../../lib/errors.js";

export async function listClassReports(classId: string, activeTermId: string) {
  const enrollments = await prisma.studentEnrolment.findMany({
    where: {
      classId,
      academicYear: { active: true },
      student: { status: "active" },
    },
    include: {
      student: {
        include: {
          reports: {
            where: { termId: activeTermId },
          },
        },
      },
    },
    orderBy: {
      student: { lastName: "asc" },
    },
  });

  const studentsList = enrollments.map((e) => e.student);
  const studentIds = studentsList.map((s) => s.id);

  const allGrades = await prisma.gradeBook.findMany({
    where: {
      termId: activeTermId,
      studentId: { in: studentIds },
    },
  });

  const gradesByStudent = new Map<string, typeof allGrades>();
  for (const grade of allGrades) {
    if (!gradesByStudent.has(grade.studentId)) {
      gradesByStudent.set(grade.studentId, []);
    }
    gradesByStudent.get(grade.studentId)!.push(grade);
  }

  return enrollments.map((e) => {
    const s = e.student;
    const report = s.reports?.[0] || null;
    const studentGrades = gradesByStudent.get(s.id) ?? [];
    const averageScore =
      studentGrades.length > 0
        ? studentGrades.reduce((sum: number, g: any) => sum + g.totalScore, 0) / studentGrades.length
        : 0;

    return {
      studentId: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      admissionNo: s.admissionNo,
      photoColor: s.photoColor,
      averageScore: Math.round(averageScore * 10) / 10,
      teacherRemarks: report?.teacherRemarks ?? null,
      principalRemark: report?.principalRemark ?? null,
      published: report?.published ?? false,
    };
  });
}

export async function getStudentReportCard(studentId: string, activeTermId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      enrolments: {
        where: { academicYear: { active: true } },
        include: { classRoom: true },
      },
    },
  });

  if (!student) {
    throw AppError.notFound("Student not found");
  }

  const activeEnrolment = student.enrolments?.[0];
  const className = activeEnrolment?.classRoom?.name ?? "Unassigned";

  // Get report remarks
  const report = await prisma.termReport.findUnique({
    where: {
      studentId_termId: {
        studentId,
        termId: activeTermId,
      },
    },
  });

  // Get all grade entries
  const grades = await prisma.gradeBook.findMany({
    where: {
      studentId,
      termId: activeTermId,
    },
    include: {
      classSubject: {
        include: {
          subject: true,
          teacher: { select: { name: true } },
        },
      },
    },
    orderBy: {
      classSubject: { subject: { name: "asc" } },
    },
  });

  // Get attendance logs
  const attendance = await prisma.attendance.findMany({
    where: {
      studentId,
      termId: activeTermId,
    },
  });

  const presentCount = attendance.filter((a) => a.status === "PRESENT").length;
  const lateCount = attendance.filter((a) => a.status === "LATE").length;
  const absentCount = attendance.filter((a) => a.status === "ABSENT").length;
  const excusedCount = attendance.filter((a) => a.status === "EXCUSED").length;

  const subjects = grades.map((g) => ({
    subjectId: g.classSubject.subjectId,
    subjectName: g.classSubject.subject.name,
    subjectCode: g.classSubject.subject.code,
    teacherName: g.classSubject.teacher?.name ?? "Unassigned",
    classScore: g.classScore,
    examScore: g.examScore,
    totalScore: g.totalScore,
    passMark: g.classSubject.passMark,
    grade: g.grade ?? "F",
    remarks: g.remarks ?? "Fail",
  }));

  const totalScoreSum = grades.reduce((sum, g) => sum + g.totalScore, 0);
  const averageScore = grades.length > 0 ? totalScoreSum / grades.length : 0;

  return {
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      admissionNo: student.admissionNo,
      photoColor: student.photoColor,
      className,
    },
    attendance: {
      present: presentCount,
      late: lateCount,
      absent: absentCount,
      excused: excusedCount,
      total: attendance.length,
    },
    subjects,
    reportSummary: {
      averageScore: Math.round(averageScore * 10) / 10,
      totalScore: totalScoreSum,
      subjectsCount: grades.length,
      teacherRemarks: report?.teacherRemarks ?? "",
      principalRemark: report?.principalRemark ?? "",
      published: report?.published ?? false,
    },
  };
}

export async function saveRemarks(
  studentId: string,
  activeTermId: string,
  data: { teacherRemarks?: string; principalRemark?: string; published?: boolean }
) {
  const existing = await prisma.termReport.findUnique({
    where: {
      studentId_termId: {
        studentId,
        termId: activeTermId,
      },
    },
  });

  if (existing) {
    return prisma.termReport.update({
      where: { id: existing.id },
      data: {
        ...(data.teacherRemarks !== undefined && { teacherRemarks: data.teacherRemarks }),
        ...(data.principalRemark !== undefined && { principalRemark: data.principalRemark }),
        ...(data.published !== undefined && { published: data.published }),
      },
    });
  } else {
    return prisma.termReport.create({
      data: {
        studentId,
        termId: activeTermId,
        teacherRemarks: data.teacherRemarks ?? null,
        principalRemark: data.principalRemark ?? null,
        published: data.published ?? false,
      },
    });
  }
}
