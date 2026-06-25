import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";

// ── Academic Years & Terms Services ────────────────────

export async function listAcademicYears() {
  return prisma.academicYear.findMany({
    include: {
      terms: {
        orderBy: { startDate: "asc" },
      },
    },
    orderBy: { name: "desc" },
  });
}

export async function createAcademicYear(input: {
  name: string;
  startDate: Date;
  endDate: Date;
  active?: boolean;
  terms: { name: string; startDate: Date; endDate: Date; active?: boolean }[];
}) {
  const existing = await prisma.academicYear.findUnique({
    where: { name: input.name },
  });
  if (existing) {
    throw AppError.conflict("An academic year with this name already exists");
  }

  // If this year is active, deactivate all other years and terms
  if (input.active) {
    await prisma.$transaction([
      prisma.academicYear.updateMany({ data: { active: false } }),
      prisma.term.updateMany({ data: { active: false } }),
    ]);
  }

  return prisma.academicYear.create({
    data: {
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      active: !!input.active,
      terms: {
        create: input.terms.map((t) => ({
          name: t.name,
          startDate: t.startDate,
          endDate: t.endDate,
          active: input.active ? !!t.active : false,
        })),
      },
    },
    include: {
      terms: true,
    },
  });
}

export async function updateAcademicYear(
  id: string,
  input: { name?: string; startDate?: Date; endDate?: Date; active?: boolean }
) {
  const existing = await prisma.academicYear.findUnique({ where: { id } });
  if (!existing) {
    throw AppError.notFound("Academic year not found");
  }

  if (input.name && input.name !== existing.name) {
    const nameConflict = await prisma.academicYear.findUnique({
      where: { name: input.name },
    });
    if (nameConflict) {
      throw AppError.conflict("An academic year with this name already exists");
    }
  }

  // Handle active status toggle
  if (input.active && !existing.active) {
    await prisma.$transaction([
      prisma.academicYear.updateMany({ data: { active: false } }),
      prisma.term.updateMany({ data: { active: false } }),
      prisma.academicYear.update({
        where: { id },
        data: { active: true },
      }),
    ]);
    return prisma.academicYear.findUnique({
      where: { id },
      include: { terms: true },
    });
  }

  return prisma.academicYear.update({
    where: { id },
    data: {
      ...(input.name && { name: input.name }),
      ...(input.startDate && { startDate: input.startDate }),
      ...(input.endDate && { endDate: input.endDate }),
      ...(input.active !== undefined && { active: input.active }),
    },
    include: {
      terms: true,
    },
  });
}

export async function deleteAcademicYear(id: string) {
  const existing = await prisma.academicYear.findUnique({ where: { id } });
  if (!existing) {
    throw AppError.notFound("Academic year not found");
  }
  await prisma.academicYear.delete({ where: { id } });
}

export async function updateTerm(
  id: string,
  input: { name?: string; startDate?: Date; endDate?: Date; active?: boolean }
) {
  const existing = await prisma.term.findUnique({ where: { id } });
  if (!existing) {
    throw AppError.notFound("Term not found");
  }

  if (input.active && !existing.active) {
    // If activating a term, deactivate all other terms, and make its academic year the active one
    return prisma.$transaction(async (tx) => {
      await tx.term.updateMany({ data: { active: false } });
      await tx.academicYear.updateMany({ data: { active: false } });
      await tx.academicYear.update({
        where: { id: existing.academicYearId },
        data: { active: true },
      });
      return tx.term.update({
        where: { id },
        data: {
          ...(input.name && { name: input.name }),
          ...(input.startDate && { startDate: input.startDate }),
          ...(input.endDate && { endDate: input.endDate }),
          active: true,
        },
      });
    });
  }

  return prisma.term.update({
    where: { id },
    data: {
      ...(input.name && { name: input.name }),
      ...(input.startDate && { startDate: input.startDate }),
      ...(input.endDate && { endDate: input.endDate }),
      ...(input.active !== undefined && { active: input.active }),
    },
  });
}

// ── ClassRooms Services ───────────────────────────────

export async function listClassRooms() {
  const classrooms = await prisma.classRoom.findMany({
    include: {
      teacher: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      enrolments: {
        where: {
          academicYear: { active: true },
          student: { status: "active" },
        },
      },
    },
    orderBy: { level: "asc" },
  });

  return classrooms.map((c) => ({
    id: c.id,
    name: c.name,
    level: c.level,
    capacity: c.capacity,
    teacherId: c.teacherId,
    teacherName: c.teacher?.name ?? "Unassigned",
    studentCount: c.enrolments.length,
  }));
}

export async function createClassRoom(input: {
  name: string;
  level: number;
  capacity: number;
  teacherId?: string | null;
}) {
  const existing = await prisma.classRoom.findUnique({
    where: { name: input.name },
  });
  if (existing) {
    throw AppError.conflict("A class with this name already exists");
  }

  if (input.teacherId) {
    const teacher = await prisma.user.findUnique({
      where: { id: input.teacherId },
      include: { role: true },
    });
    if (!teacher || teacher.role.slug !== "teacher") {
      throw AppError.badRequest("Selected user is not a valid teacher");
    }
  }

  return prisma.classRoom.create({
    data: {
      name: input.name,
      level: input.level,
      capacity: input.capacity,
      teacherId: input.teacherId ?? null,
    },
    include: {
      teacher: true,
    },
  });
}

export async function updateClassRoom(
  id: string,
  input: {
    name?: string;
    level?: number;
    capacity?: number;
    teacherId?: string | null;
  }
) {
  const existing = await prisma.classRoom.findUnique({ where: { id } });
  if (!existing) {
    throw AppError.notFound("Classroom not found");
  }

  if (input.name && input.name !== existing.name) {
    const nameConflict = await prisma.classRoom.findUnique({
      where: { name: input.name },
    });
    if (nameConflict) {
      throw AppError.conflict("A class with this name already exists");
    }
  }

  if (input.teacherId) {
    const teacher = await prisma.user.findUnique({
      where: { id: input.teacherId },
      include: { role: true },
    });
    if (!teacher || teacher.role.slug !== "teacher") {
      throw AppError.badRequest("Selected user is not a valid teacher");
    }
  }

  return prisma.classRoom.update({
    where: { id },
    data: {
      ...(input.name && { name: input.name }),
      ...(input.level !== undefined && { level: input.level }),
      ...(input.capacity !== undefined && { capacity: input.capacity }),
      teacherId: input.teacherId === undefined ? existing.teacherId : input.teacherId,
    },
    include: {
      teacher: true,
    },
  });
}

export async function deleteClassRoom(id: string) {
  const existing = await prisma.classRoom.findUnique({ where: { id } });
  if (!existing) {
    throw AppError.notFound("Classroom not found");
  }
  await prisma.classRoom.delete({ where: { id } });
}

// ── ClassSubject Services ───────────────────────────────

export async function getClassSubjects(classId: string) {
  const existing = await prisma.classRoom.findUnique({ where: { id: classId } });
  if (!existing) {
    throw AppError.notFound("Classroom not found");
  }

  const classSubjects = await prisma.classSubject.findMany({
    where: { classId },
    include: {
      subject: true,
      teacher: true, // The teacher
    },
  });

  return classSubjects.map((cs) => ({
    id: cs.id,
    subjectId: cs.subjectId,
    subjectName: cs.subject.name,
    subjectCode: cs.subject.code,
    teacherId: cs.teacherId,
    teacherName: cs.teacher?.name ?? "Unassigned",
    passMark: cs.passMark,
    weight: cs.weight,
  }));
}

export async function saveClassSubjects(
  classId: string,
  input: {
    subjects: {
      subjectId: string;
      teacherId?: string | null;
      passMark: number;
      weight: number;
    }[];
  }
) {
  const existing = await prisma.classRoom.findUnique({ where: { id: classId } });
  if (!existing) {
    throw AppError.notFound("Classroom not found");
  }

  const existingSubjects = await prisma.classSubject.findMany({ where: { classId } });
  const inputSubjectIds = input.subjects.map(s => s.subjectId);

  // 1. Delete removed subjects (Note: this cascades and deletes gradebook entries)
  const toDelete = existingSubjects.filter(es => !inputSubjectIds.includes(es.subjectId));
  if (toDelete.length > 0) {
    await prisma.classSubject.deleteMany({
      where: { id: { in: toDelete.map(t => t.id) } },
    });
  }

  // 2. Upsert subjects
  for (const s of input.subjects) {
    const existingSubject = existingSubjects.find(es => es.subjectId === s.subjectId);
    if (existingSubject) {
      await prisma.classSubject.update({
        where: { id: existingSubject.id },
        data: {
          teacherId: s.teacherId ?? null,
          passMark: s.passMark,
          weight: s.weight,
        },
      });
    } else {
      await prisma.classSubject.create({
        data: {
          classId,
          subjectId: s.subjectId,
          teacherId: s.teacherId ?? null,
          passMark: s.passMark,
          weight: s.weight,
        },
      });
    }
  }

  return true;
}

// ── Subjects Services ─────────────────────────────────

export async function listSubjects() {
  const subjects = await prisma.subject.findMany({
    include: {
      teachers: {
        include: {
          teacher: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return subjects.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    teachers: s.teachers.map((t) => ({
      id: t.teacher.id,
      name: t.teacher.name,
    })),
  }));
}

export async function createSubject(input: {
  name: string;
  code: string;
  teacherIds?: string[];
}) {
  const existingName = await prisma.subject.findUnique({
    where: { name: input.name },
  });
  if (existingName) {
    throw AppError.conflict("A subject with this name already exists");
  }

  const existingCode = await prisma.subject.findUnique({
    where: { code: input.code.toUpperCase() },
  });
  if (existingCode) {
    throw AppError.conflict("A subject with this code already exists");
  }

  // Create Subject inside transaction
  return prisma.$transaction(async (tx) => {
    const subject = await tx.subject.create({
      data: {
        name: input.name,
        code: input.code.toUpperCase(),
      },
    });

    if (input.teacherIds && input.teacherIds.length > 0) {
      await tx.subjectTeacher.createMany({
        data: input.teacherIds.map((tid) => ({
          subjectId: subject.id,
          teacherId: tid,
        })),
      });
    }

    return tx.subject.findUnique({
      where: { id: subject.id },
      include: {
        teachers: {
          include: { teacher: true },
        },
      },
    });
  });
}

export async function updateSubject(
  id: string,
  input: {
    name?: string;
    code?: string;
    teacherIds?: string[];
  }
) {
  const existing = await prisma.subject.findUnique({ where: { id } });
  if (!existing) {
    throw AppError.notFound("Subject not found");
  }

  if (input.name && input.name !== existing.name) {
    const nameConflict = await prisma.subject.findUnique({
      where: { name: input.name },
    });
    if (nameConflict) {
      throw AppError.conflict("A subject with this name already exists");
    }
  }

  if (input.code && input.code.toUpperCase() !== existing.code) {
    const codeConflict = await prisma.subject.findUnique({
      where: { code: input.code.toUpperCase() },
    });
    if (codeConflict) {
      throw AppError.conflict("A subject with this code already exists");
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.subject.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.code && { code: input.code.toUpperCase() }),
      },
    });

    if (input.teacherIds !== undefined) {
      // Re-assign teachers
      await tx.subjectTeacher.deleteMany({ where: { subjectId: id } });
      if (input.teacherIds.length > 0) {
        await tx.subjectTeacher.createMany({
          data: input.teacherIds.map((tid) => ({
            subjectId: id,
            teacherId: tid,
          })),
        });
      }
    }

    return tx.subject.findUnique({
      where: { id },
      include: {
        teachers: {
          include: { teacher: true },
        },
      },
    });
  });
}

export async function deleteSubject(id: string) {
  const existing = await prisma.subject.findUnique({ where: { id } });
  if (!existing) {
    throw AppError.notFound("Subject not found");
  }
  await prisma.subject.delete({ where: { id } });
}

export async function listTeachers() {
  const teachers = await prisma.user.findMany({
    where: {
      role: { slug: "teacher" },
      active: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      staffNo: true,
    },
    orderBy: { name: "asc" },
  });
  return teachers;
}
