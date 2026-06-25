import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";

function formatStudent(s: any) {
  const activeEnrolment = s.enrolments?.[0];
  return {
    id: s.id,
    admissionNo: s.admissionNo,
    firstName: s.firstName,
    lastName: s.lastName,
    gender: s.gender,
    dob: s.dob.toISOString().slice(0, 10),
    status: s.status,
    enrolledAt: s.enrolledAt.toISOString().slice(0, 10),
    guardianName: s.guardianName,
    guardianPhone: s.guardianPhone,
    guardianRelation: s.guardianRelation,
    guardianEmail: s.guardianEmail,
    guardian: {
      name: s.guardianName,
      phone: s.guardianPhone,
      relation: s.guardianRelation,
      email: s.guardianEmail,
    },
    address: s.address,
    photoColor: s.photoColor,
    classId: activeEnrolment?.classRoom?.id || null,
    className: activeEnrolment?.classRoom?.name || "Unassigned",
  };
}

export async function listStudents(
  filters: { classId?: string; status?: string; search?: string },
  restrictClassId?: string
) {
  const where: any = {};

  if (filters.search) {
    where.OR = [
      { firstName: { contains: filters.search, mode: "insensitive" } },
      { lastName: { contains: filters.search, mode: "insensitive" } },
      { admissionNo: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  if (filters.status && filters.status !== "all") {
    where.status = filters.status;
  }

  const targetClassId = restrictClassId || (filters.classId && filters.classId !== "all" ? filters.classId : undefined);
  if (targetClassId) {
    where.enrolments = {
      some: {
        classId: targetClassId,
        academicYear: { active: true },
      },
    };
  }

  const students = await prisma.student.findMany({
    where,
    include: {
      enrolments: {
        where: {
          academicYear: { active: true },
        },
        include: {
          classRoom: true,
        },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return students.map(formatStudent);
}

export async function getStudentById(id: string) {
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      enrolments: {
        where: {
          academicYear: { active: true },
        },
        include: {
          classRoom: true,
        },
      },
    },
  });

  if (!student) {
    throw AppError.notFound("Student not found");
  }

  return formatStudent(student);
}

export async function createStudent(input: {
  firstName: string;
  lastName: string;
  gender: string;
  dob: Date;
  guardianName: string;
  guardianPhone: string;
  guardianRelation: string;
  guardianEmail?: string | null;
  address: string;
  classId: string;
}) {
  const activeYear = await prisma.academicYear.findFirst({
    where: { active: true },
  });

  if (!activeYear) {
    throw AppError.badRequest("No active academic year configured. Please activate an academic year first.");
  }

  const classRoom = await prisma.classRoom.findUnique({
    where: { id: input.classId },
  });

  if (!classRoom) {
    throw AppError.badRequest("Selected classroom does not exist.");
  }

  // Generate unique admission number
  const yearClean = activeYear.name.replace(/\s+/g, "").split("/")[0] || "2025";
  let count = await prisma.studentEnrolment.count({
    where: { academicYearId: activeYear.id },
  });
  let admissionNo = `ADM/${yearClean}/${String(1000 + count + 1)}`;
  let exists = await prisma.student.findUnique({ where: { admissionNo } });
  while (exists) {
    count++;
    admissionNo = `ADM/${yearClean}/${String(1000 + count + 1)}`;
    exists = await prisma.student.findUnique({ where: { admissionNo } });
  }

  const colors = ["#0f766e", "#15803d", "#0369a1", "#7c3aed", "#b45309", "#be123c", "#0d9488", "#4d7c0f"];
  const photoColor = colors[Math.floor(Math.random() * colors.length)];

  const student = await prisma.$transaction(async (tx) => {
    const s = await tx.student.create({
      data: {
        admissionNo,
        firstName: input.firstName,
        lastName: input.lastName,
        gender: input.gender,
        dob: input.dob,
        guardianName: input.guardianName,
        guardianPhone: input.guardianPhone,
        guardianRelation: input.guardianRelation,
        guardianEmail: input.guardianEmail || null,
        address: input.address,
        photoColor,
      },
    });

    await tx.studentEnrolment.create({
      data: {
        studentId: s.id,
        classId: input.classId,
        academicYearId: activeYear.id,
      },
    });

    return tx.student.findUnique({
      where: { id: s.id },
      include: {
        enrolments: {
          where: { academicYearId: activeYear.id },
          include: { classRoom: true },
        },
      },
    });
  });

  return formatStudent(student);
}

export async function updateStudent(
  id: string,
  input: {
    firstName?: string;
    lastName?: string;
    gender?: string;
    dob?: Date;
    status?: string;
    guardianName?: string;
    guardianPhone?: string;
    guardianRelation?: string;
    guardianEmail?: string | null;
    address?: string;
    classId?: string;
  }
) {
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) {
    throw AppError.notFound("Student not found");
  }

  const activeYear = await prisma.academicYear.findFirst({
    where: { active: true },
  });

  await prisma.$transaction(async (tx) => {
    // 1. Update personal details
    await tx.student.update({
      where: { id },
      data: {
        ...(input.firstName && { firstName: input.firstName }),
        ...(input.lastName && { lastName: input.lastName }),
        ...(input.gender && { gender: input.gender }),
        ...(input.dob && { dob: input.dob }),
        ...(input.status && { status: input.status }),
        ...(input.guardianName && { guardianName: input.guardianName }),
        ...(input.guardianPhone && { guardianPhone: input.guardianPhone }),
        ...(input.guardianRelation && { guardianRelation: input.guardianRelation }),
        ...(input.guardianEmail !== undefined && { guardianEmail: input.guardianEmail || null }),
        ...(input.address && { address: input.address }),
      },
    });

    // 2. Update classroom enrolment for the active academic year if classId is specified
    if (input.classId && activeYear) {
      const enrolment = await tx.studentEnrolment.findUnique({
        where: {
          studentId_academicYearId: {
            studentId: id,
            academicYearId: activeYear.id,
          },
        },
      });

      if (enrolment) {
        await tx.studentEnrolment.update({
          where: { id: enrolment.id },
          data: { classId: input.classId },
        });
      } else {
        await tx.studentEnrolment.create({
          data: {
            studentId: id,
            classId: input.classId,
            academicYearId: activeYear.id,
          },
        });
      }
    }
  });

  return getStudentById(id);
}
