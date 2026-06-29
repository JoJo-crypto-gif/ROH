import { AcademicYearStatus, Prisma, TermStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { recognizeDeferredTerm } from "../accounting/accounting.service.js";
import { AppError } from "../../lib/errors.js";
import { getAcademicAccessScope } from "./services/access.service.js";

type Transaction = Prisma.TransactionClient;

async function audit(
  tx: Transaction,
  actorId: string | undefined,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Prisma.InputJsonValue,
) {
  await tx.academicAuditLog.create({
    data: { actorId, action, entityType, entityId, metadata },
  });
}

function assertYearDates(startDate: Date, endDate: Date) {
  if (
    !Number.isFinite(startDate.getTime()) ||
    !Number.isFinite(endDate.getTime()) ||
    endDate <= startDate
  ) {
    throw AppError.badRequest(
      "Academic year end date must be after its start date.",
    );
  }
}

export function validateTermRanges(
  yearStart: Date,
  yearEnd: Date,
  ranges: { startDate: Date; endDate: Date }[],
  termCount: number,
) {
  if (ranges.length !== termCount)
    throw AppError.badRequest(
      `Exactly ${termCount} term date ranges are required.`,
    );
  const sorted = [...ranges].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );
  for (let index = 0; index < sorted.length; index++) {
    const range = sorted[index];
    if (
      range.startDate < yearStart ||
      range.endDate > yearEnd ||
      range.endDate <= range.startDate
    ) {
      throw AppError.badRequest(
        "Every term must have valid dates inside the academic year.",
      );
    }
    if (index > 0 && range.startDate <= sorted[index - 1].endDate) {
      throw AppError.badRequest("Term dates cannot overlap.");
    }
  }
  return sorted;
}

function generateTermRanges(startDate: Date, endDate: Date, termCount: number) {
  const totalDays =
    Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  const chunk = Math.floor(totalDays / termCount);
  return Array.from({ length: termCount }, (_, index) => {
    const start = new Date(startDate.getTime() + index * chunk * 86_400_000);
    const end =
      index === termCount - 1
        ? new Date(endDate)
        : new Date(
            startDate.getTime() + ((index + 1) * chunk - 1) * 86_400_000,
          );
    return { startDate: start, endDate: end };
  });
}

export function validateAssessmentScheme(input: {
  components: {
    name: string;
    code: string;
    maxScore: number;
    sequence: number;
  }[];
  gradeBands: {
    minScore: number;
    maxScore: number;
    grade: string;
    remark: string;
  }[];
}) {
  const total = input.components.reduce(
    (sum, component) => sum + component.maxScore,
    0,
  );
  if (Math.abs(total - 100) > 0.001)
    throw AppError.badRequest(
      "Assessment component maximum scores must total 100.",
    );
  if (
    new Set(input.components.map((item) => item.code.toUpperCase())).size !==
    input.components.length
  )
    throw AppError.badRequest("Assessment component codes must be unique.");
  if (
    new Set(input.components.map((item) => item.sequence)).size !==
    input.components.length
  )
    throw AppError.badRequest(
      "Assessment component order values must be unique.",
    );

  const bands = [...input.gradeBands].sort((a, b) => a.minScore - b.minScore);
  if (bands[0]?.minScore !== 0 || bands[bands.length - 1]?.maxScore !== 100)
    throw AppError.badRequest(
      "Grade bands must cover scores from 0 through 100.",
    );
  for (let index = 0; index < bands.length; index++) {
    const band = bands[index];
    if (band.maxScore < band.minScore)
      throw AppError.badRequest(
        "A grade band maximum cannot be lower than its minimum.",
      );
    if (index > 0) {
      const boundaryDelta = band.minScore - bands[index - 1].maxScore;
      if (boundaryDelta <= 0 || boundaryDelta > 0.011)
        throw AppError.badRequest(
          "Grade bands must be continuous and cannot overlap.",
        );
    }
  }
}

export function assertCurriculumRemovalAllowed(recordedScoreCount: number) {
  if (recordedScoreCount > 0)
    throw AppError.badRequest(
      "Curriculum subjects with recorded scores cannot be removed.",
    );
}

export function assertAssessmentSchemeEditable(
  locked: boolean,
  recordedScoreCount: number,
) {
  if (locked || recordedScoreCount > 0)
    throw AppError.badRequest(
      "Assessment schemes with recorded scores cannot be changed.",
    );
}

export async function getAcademicSettings() {
  return prisma.academicSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", defaultTermCount: 3 },
  });
}

export async function updateAcademicSettings(
  actorId: string,
  defaultTermCount: number,
) {
  return prisma.$transaction(async (tx) => {
    const settings = await tx.academicSettings.upsert({
      where: { id: "default" },
      update: { defaultTermCount },
      create: { id: "default", defaultTermCount },
    });
    await audit(
      tx,
      actorId,
      "ACADEMIC_SETTINGS_UPDATED",
      "AcademicSettings",
      settings.id,
      { defaultTermCount },
    );
    return settings;
  });
}

export async function getSchoolProfile() {
  return prisma.schoolProfile.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", name: "Lumen School" },
  });
}

export async function updateSchoolProfile(
  actorId: string,
  input: {
    name: string;
    motto?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    logoUrl?: string | null;
    headteacherName?: string | null;
    reportFooter?: string | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    const profile = await tx.schoolProfile.upsert({
      where: { id: "default" },
      update: input,
      create: { id: "default", ...input },
    });
    await audit(
      tx,
      actorId,
      "SCHOOL_PROFILE_UPDATED",
      "SchoolProfile",
      profile.id,
    );
    return profile;
  });
}

export async function listAcademicYears() {
  const years = await prisma.academicYear.findMany({
    include: {
      terms: { orderBy: { sequence: "asc" } },
      _count: { select: { sections: true, enrolments: true } },
    },
    orderBy: { startDate: "desc" },
  });
  return years.map((year) => ({
    ...year,
    active: year.status === AcademicYearStatus.ACTIVE,
  }));
}

export async function createAcademicYear(
  actorId: string,
  input: {
    name: string;
    startDate: Date;
    endDate: Date;
    termCount: number;
    terms?: { startDate: Date; endDate: Date }[];
  },
) {
  assertYearDates(input.startDate, input.endDate);
  const ranges = validateTermRanges(
    input.startDate,
    input.endDate,
    input.terms ??
      generateTermRanges(input.startDate, input.endDate, input.termCount),
    input.termCount,
  );
  return prisma.$transaction(async (tx) => {
    const existing = await tx.academicYear.findUnique({
      where: { name: input.name },
    });
    if (existing)
      throw AppError.conflict(
        "An academic year with this name already exists.",
      );
    const year = await tx.academicYear.create({
      data: {
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        termCount: input.termCount,
        terms: {
          create: ranges.map((range, index) => ({
            name: `Term ${index + 1}`,
            sequence: index + 1,
            ...range,
          })),
        },
        assessmentScheme: {
          create: {
            name: "40/60 Standard Assessment",
            components: {
              create: [
                {
                  name: "Class Score",
                  code: "CLASS_SCORE",
                  maxScore: 40,
                  sequence: 1,
                },
                { name: "Exam", code: "EXAM", maxScore: 60, sequence: 2 },
              ],
            },
            gradeBands: {
              create: [
                {
                  minScore: 80,
                  maxScore: 100,
                  grade: "A",
                  remark: "Excellent",
                },
                {
                  minScore: 70,
                  maxScore: 79.99,
                  grade: "B",
                  remark: "Very Good",
                },
                { minScore: 60, maxScore: 69.99, grade: "C", remark: "Good" },
                { minScore: 50, maxScore: 59.99, grade: "D", remark: "Pass" },
                {
                  minScore: 0,
                  maxScore: 49.99,
                  grade: "F",
                  remark: "Needs Improvement",
                },
              ],
            },
          },
        },
      },
      include: {
        terms: { orderBy: { sequence: "asc" } },
        assessmentScheme: { include: { components: true, gradeBands: true } },
      },
    });
    await audit(tx, actorId, "ACADEMIC_YEAR_CREATED", "AcademicYear", year.id, {
      termCount: input.termCount,
    });
    return { ...year, active: false };
  });
}

export async function updateAcademicYear(
  actorId: string,
  id: string,
  input: { name?: string; startDate?: Date; endDate?: Date },
) {
  return prisma.$transaction(async (tx) => {
    const year = await tx.academicYear.findUnique({
      where: { id },
      include: { terms: true },
    });
    if (!year) throw AppError.notFound("Academic year not found.");
    if (year.status !== AcademicYearStatus.DRAFT)
      throw AppError.badRequest("Only draft academic years can be edited.");
    const startDate = input.startDate ?? year.startDate;
    const endDate = input.endDate ?? year.endDate;
    assertYearDates(startDate, endDate);
    for (const term of year.terms) {
      if (term.startDate < startDate || term.endDate > endDate)
        throw AppError.badRequest(
          "Adjust term dates before shrinking the academic year range.",
        );
    }
    const updated = await tx.academicYear.update({
      where: { id },
      data: { ...input },
      include: { terms: { orderBy: { sequence: "asc" } } },
    });
    await audit(tx, actorId, "ACADEMIC_YEAR_UPDATED", "AcademicYear", id);
    return { ...updated, active: false };
  });
}

export async function activateAcademicYear(actorId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const year = await tx.academicYear.findUnique({
      where: { id },
      include: {
        terms: true,
        sections: true,
        curriculumSubjects: true,
        assessmentScheme: { include: { components: true, gradeBands: true } },
      },
    });
    if (!year) throw AppError.notFound("Academic year not found.");
    if (year.status !== AcademicYearStatus.DRAFT)
      throw AppError.badRequest("Only a draft academic year can be activated.");
    if (
      await tx.academicYear.findFirst({
        where: { status: AcademicYearStatus.ACTIVE },
      })
    )
      throw AppError.conflict(
        "Close the current active academic year before activating another.",
      );
    if (year.terms.length !== year.termCount)
      throw AppError.badRequest("The configured term count is incomplete.");
    if (year.sections.length === 0)
      throw AppError.badRequest(
        "At least one class section is required before activation.",
      );
    if (year.curriculumSubjects.length === 0)
      throw AppError.badRequest(
        "Curriculum subjects are required before activation.",
      );
    if (!year.assessmentScheme)
      throw AppError.badRequest(
        "An assessment scheme is required before activation.",
      );
    validateAssessmentScheme(year.assessmentScheme);
    const firstTerm = [...year.terms].sort(
      (a, b) => a.sequence - b.sequence,
    )[0];
    await tx.academicYear.update({
      where: { id },
      data: { status: AcademicYearStatus.ACTIVE },
    });
    await tx.term.update({
      where: { id: firstTerm.id },
      data: { status: TermStatus.ACTIVE },
    });
    await tx.studentEnrolment.updateMany({
      where: { academicYearId: id, status: "PLANNED" },
      data: { status: "ACTIVE" },
    });
    await audit(tx, actorId, "ACADEMIC_YEAR_ACTIVATED", "AcademicYear", id);
    return tx.academicYear.findUnique({
      where: { id },
      include: { terms: { orderBy: { sequence: "asc" } } },
    });
  });
}

export async function closeAcademicYear(actorId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const year = await tx.academicYear.findUnique({
      where: { id },
      include: {
        terms: true,
        enrolments: {
          where: { status: "ACTIVE" },
          include: { promotions: true },
        },
      },
    });
    if (!year) throw AppError.notFound("Academic year not found.");
    if (year.status !== AcademicYearStatus.ACTIVE)
      throw AppError.badRequest("Only the active academic year can be closed.");
    if (year.terms.some((term) => term.status !== TermStatus.CLOSED))
      throw AppError.badRequest("Every term must be closed first.");
    if (
      year.enrolments.some(
        (enrolment) => enrolment.promotions[0]?.status !== "APPROVED",
      )
    )
      throw AppError.badRequest(
        "Every active enrolment needs an approved year-end outcome.",
      );
    await tx.academicYear.update({
      where: { id },
      data: { status: AcademicYearStatus.CLOSED },
    });
    await audit(tx, actorId, "ACADEMIC_YEAR_CLOSED", "AcademicYear", id);
  });
}

export async function deleteAcademicYear(id: string) {
  const year = await prisma.academicYear.findUnique({
    where: { id },
    include: { _count: { select: { enrolments: true } } },
  });
  if (!year) throw AppError.notFound("Academic year not found.");
  if (year.status !== AcademicYearStatus.DRAFT || year._count.enrolments > 0)
    throw AppError.badRequest(
      "Only an unused draft academic year can be deleted.",
    );
  await prisma.academicYear.delete({ where: { id } });
}

export async function updateTerm(
  actorId: string,
  id: string,
  input: { name?: string; startDate?: Date; endDate?: Date },
) {
  return prisma.$transaction(async (tx) => {
    const term = await tx.term.findUnique({
      where: { id },
      include: { academicYear: { include: { terms: true } } },
    });
    if (!term) throw AppError.notFound("Term not found.");
    if (
      term.academicYear.status === AcademicYearStatus.CLOSED ||
      term.status === TermStatus.CLOSED
    )
      throw AppError.badRequest("A closed term cannot be edited.");
    if (
      term.academicYear.status === AcademicYearStatus.ACTIVE &&
      term.status !== TermStatus.PENDING
    )
      throw AppError.badRequest(
        "Only future pending-term dates can be adjusted after activation.",
      );
    const startDate = input.startDate ?? term.startDate;
    const endDate = input.endDate ?? term.endDate;
    const ranges = term.academicYear.terms.map((item) =>
      item.id === id
        ? { startDate, endDate }
        : { startDate: item.startDate, endDate: item.endDate },
    );
    validateTermRanges(
      term.academicYear.startDate,
      term.academicYear.endDate,
      ranges,
      term.academicYear.termCount,
    );
    const updated = await tx.term.update({ where: { id }, data: input });
    await audit(tx, actorId, "TERM_UPDATED", "Term", id);
    return updated;
  });
}

export async function transitionTerm(
  actorId: string,
  id: string,
  status: "ACTIVE" | "CLOSED",
) {
  return prisma.$transaction(async (tx) => {
    const term = await tx.term.findUnique({
      where: { id },
      include: { academicYear: { include: { terms: true } } },
    });
    if (!term) throw AppError.notFound("Term not found.");
    if (term.academicYear.status !== AcademicYearStatus.ACTIVE)
      throw AppError.badRequest(
        "Terms can transition only within the active academic year.",
      );
    if (status === "CLOSED") {
      if (term.status !== TermStatus.ACTIVE)
        throw AppError.badRequest("Only the active term can be closed.");
      const [enrolmentCount, publishedCount] = await Promise.all([
        tx.studentEnrolment.count({
          where: { academicYearId: term.academicYearId, status: "ACTIVE" },
        }),
        tx.termReport.count({
          where: {
            termId: term.id,
            status: "PUBLISHED",
            enrolment: { status: "ACTIVE" },
          },
        }),
      ]);
      if (publishedCount !== enrolmentCount)
        throw AppError.badRequest(
          `Publish all ${enrolmentCount} student reports before closing this term (${publishedCount} published).`,
        );
    } else {
      if (term.status !== TermStatus.PENDING)
        throw AppError.badRequest("Only a pending term can be activated.");
      if (
        term.academicYear.terms.some(
          (item) => item.status === TermStatus.ACTIVE,
        )
      )
        throw AppError.conflict("Close the active term first.");
      if (
        term.academicYear.terms.some(
          (item) =>
            item.sequence < term.sequence && item.status !== TermStatus.CLOSED,
        )
      )
        throw AppError.badRequest("Earlier terms must be closed first.");
    }
    const updated = await tx.term.update({ where: { id }, data: { status } });
    if (status === "ACTIVE")
      await recognizeDeferredTerm(tx, actorId, term.id, new Date());
    await audit(tx, actorId, `TERM_${status}`, "Term", id);
    return updated;
  });
}

export async function listGradeLevels() {
  return prisma.gradeLevel.findMany({
    include: { nextGradeLevel: { select: { id: true, name: true } } },
    orderBy: { order: "asc" },
  });
}

export async function createGradeLevel(input: {
  name: string;
  code: string;
  order: number;
  nextGradeLevelId?: string | null;
  isFinal: boolean;
}) {
  return prisma.gradeLevel.create({
    data: { ...input, code: input.code.toUpperCase() },
  });
}

export async function updateGradeLevel(
  id: string,
  input: {
    name?: string;
    code?: string;
    order?: number;
    nextGradeLevelId?: string | null;
    isFinal?: boolean;
    active?: boolean;
  },
) {
  return prisma.gradeLevel.update({
    where: { id },
    data: {
      ...input,
      ...(input.code ? { code: input.code.toUpperCase() } : {}),
    },
  });
}

export async function listSections(
  userId: string,
  roleSlug: string,
  academicYearId?: string,
) {
  const yearId =
    academicYearId ??
    (
      await prisma.academicYear.findFirst({
        where: { status: AcademicYearStatus.ACTIVE },
      })
    )?.id;
  if (!yearId) return [];
  const accessScope = await getAcademicAccessScope(userId, roleSlug);
  if (accessScope === "NONE") return [];
  const sections = await prisma.classSection.findMany({
    where: {
      academicYearId: yearId,
      active: true,
      ...(accessScope === "ASSIGNED" ? { classTeacherId: userId } : {}),
    },
    include: {
      gradeLevel: true,
      classTeacher: { select: { id: true, name: true, email: true } },
      enrolments: {
        where: { status: { in: ["ACTIVE", "PLANNED"] } },
        select: { id: true },
      },
    },
    orderBy: [{ gradeLevel: { order: "asc" } }, { name: "asc" }],
  });
  return sections.map((section) => ({
    ...section,
    className: section.name,
    level: section.gradeLevel.order,
    gradeLevelName: section.gradeLevel.name,
    teacherId: section.classTeacherId,
    teacherName: section.classTeacher?.name ?? "Unassigned",
    studentCount: section.enrolments.length,
  }));
}

async function assertTeacher(teacherId?: string | null) {
  if (!teacherId) return;
  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    include: { schoolStaffProfile: true },
  });
  if (
    !teacher ||
    !teacher.active ||
    teacher.schoolStaffProfile?.category !== "TEACHING" ||
    teacher.schoolStaffProfile.status !== "ACTIVE"
  ) {
    throw AppError.badRequest(
      "Selected user is not an active teaching staff member.",
    );
  }
}

export function assertSectionUpdateAllowed(
  yearStatus: AcademicYearStatus,
  changedFields: string[],
) {
  if (yearStatus === AcademicYearStatus.CLOSED) {
    throw AppError.badRequest("Closed-year sections cannot be changed.");
  }
  if (
    yearStatus === AcademicYearStatus.ACTIVE &&
    (changedFields.length !== 1 || changedFields[0] !== "classTeacherId")
  ) {
    throw AppError.badRequest(
      "Only the class-teacher assignment can be changed for an active-year section.",
    );
  }
}

export async function createSection(input: {
  academicYearId: string;
  gradeLevelId: string;
  name: string;
  capacity: number;
  classTeacherId?: string | null;
}) {
  const year = await prisma.academicYear.findUnique({
    where: { id: input.academicYearId },
  });
  if (!year) throw AppError.notFound("Academic year not found.");
  if (year.status !== AcademicYearStatus.DRAFT)
    throw AppError.badRequest("Sections can be created only for a draft year.");
  await assertTeacher(input.classTeacherId);
  return prisma.classSection.create({
    data: { ...input, classTeacherId: input.classTeacherId ?? null },
    include: { gradeLevel: true, classTeacher: true },
  });
}

export async function updateSection(
  actorId: string,
  id: string,
  input: {
    gradeLevelId?: string;
    name?: string;
    capacity?: number;
    classTeacherId?: string | null;
    active?: boolean;
  },
) {
  const section = await prisma.classSection.findUnique({
    where: { id },
    include: { academicYear: true },
  });
  if (!section) throw AppError.notFound("Class section not found.");
  const changedFields = Object.keys(input);
  assertSectionUpdateAllowed(section.academicYear.status, changedFields);
  await assertTeacher(input.classTeacherId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.classSection.update({
      where: { id },
      data: input,
      include: { gradeLevel: true, classTeacher: true },
    });
    await audit(tx, actorId, "CLASS_SECTION_UPDATED", "ClassSection", id, {
      academicYearId: section.academicYearId,
      changedFields,
      previousClassTeacherId: section.classTeacherId,
      classTeacherId: updated.classTeacherId,
    });
    return updated;
  });
}

export async function archiveSection(id: string) {
  const section = await prisma.classSection.findUnique({
    where: { id },
    include: { academicYear: true, _count: { select: { enrolments: true } } },
  });
  if (!section) throw AppError.notFound("Class section not found.");
  if (
    section.academicYear.status !== AcademicYearStatus.DRAFT ||
    section._count.enrolments > 0
  )
    throw AppError.badRequest("Only an unused draft section can be archived.");
  return prisma.classSection.update({ where: { id }, data: { active: false } });
}

export async function listSubjects() {
  return prisma.subject.findMany({ orderBy: { name: "asc" } });
}

export async function createSubject(input: {
  name: string;
  code: string;
  description?: string | null;
}) {
  return prisma.subject.create({
    data: { ...input, code: input.code.toUpperCase() },
  });
}

export async function updateSubject(
  id: string,
  input: {
    name?: string;
    code?: string;
    description?: string | null;
    active?: boolean;
  },
) {
  return prisma.subject.update({
    where: { id },
    data: {
      ...input,
      ...(input.code ? { code: input.code.toUpperCase() } : {}),
    },
  });
}

export async function archiveSubject(id: string) {
  const subject = await prisma.subject.findUnique({ where: { id } });
  if (!subject) throw AppError.notFound("Subject not found.");
  return prisma.subject.update({ where: { id }, data: { active: false } });
}

export async function listTeachers() {
  const staff = await prisma.schoolStaff.findMany({
    where: { category: "TEACHING", status: "ACTIVE", user: { active: true } },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: [{ user: { name: "asc" } }],
  });
  return staff.map((item) => ({
    id: item.user.id,
    name: item.user.name,
    email: item.user.email,
    staffNo: item.staffNo,
  }));
}

export async function getCurriculum(
  academicYearId: string,
  gradeLevelId: string,
) {
  return prisma.curriculumSubject.findMany({
    where: { academicYearId, gradeLevelId, active: true },
    include: { subject: true },
    orderBy: [{ sortOrder: "asc" }, { subject: { name: "asc" } }],
  });
}

export async function saveCurriculum(
  actorId: string,
  academicYearId: string,
  gradeLevelId: string,
  subjects: { subjectId: string; passMark: number; sortOrder: number }[],
) {
  return prisma.$transaction(async (tx) => {
    const year = await tx.academicYear.findUnique({
      where: { id: academicYearId },
    });
    if (!year) throw AppError.notFound("Academic year not found.");
    if (year.status !== AcademicYearStatus.DRAFT)
      throw AppError.badRequest(
        "Curriculum can be changed only while the year is draft.",
      );
    const current = await tx.curriculumSubject.findMany({
      where: { academicYearId, gradeLevelId },
    });
    const requested = new Set(subjects.map((subject) => subject.subjectId));
    const removed = current.filter(
      (subject) => subject.active && !requested.has(subject.subjectId),
    );
    if (removed.length) {
      const scoreCount = await tx.assessmentResult.count({
        where: {
          curriculumSubjectId: { in: removed.map((subject) => subject.id) },
        },
      });
      assertCurriculumRemovalAllowed(scoreCount);
    }
    await tx.curriculumSubject.updateMany({
      where: {
        academicYearId,
        gradeLevelId,
        subjectId: { notIn: [...requested] },
      },
      data: { active: false },
    });
    for (const subject of subjects) {
      await tx.curriculumSubject.upsert({
        where: {
          academicYearId_gradeLevelId_subjectId: {
            academicYearId,
            gradeLevelId,
            subjectId: subject.subjectId,
          },
        },
        update: {
          passMark: subject.passMark,
          sortOrder: subject.sortOrder,
          active: true,
        },
        create: { academicYearId, gradeLevelId, ...subject },
      });
    }
    await audit(tx, actorId, "CURRICULUM_UPDATED", "GradeLevel", gradeLevelId, {
      academicYearId,
      subjectCount: subjects.length,
      previousCount: current.length,
    });
    return tx.curriculumSubject.findMany({
      where: { academicYearId, gradeLevelId, active: true },
      include: { subject: true },
      orderBy: { sortOrder: "asc" },
    });
  });
}

export async function getAssessmentScheme(academicYearId: string) {
  return prisma.assessmentScheme.findUnique({
    where: { academicYearId },
    include: {
      components: { orderBy: { sequence: "asc" } },
      gradeBands: { orderBy: { minScore: "desc" } },
    },
  });
}

export async function saveAssessmentScheme(
  actorId: string,
  academicYearId: string,
  input: {
    name: string;
    components: {
      name: string;
      code: string;
      maxScore: number;
      sequence: number;
    }[];
    gradeBands: {
      minScore: number;
      maxScore: number;
      grade: string;
      remark: string;
    }[];
  },
) {
  validateAssessmentScheme(input);
  return prisma.$transaction(async (tx) => {
    const year = await tx.academicYear.findUnique({
      where: { id: academicYearId },
    });
    if (!year) throw AppError.notFound("Academic year not found.");
    if (year.status !== AcademicYearStatus.DRAFT)
      throw AppError.badRequest(
        "Assessment schemes can be changed only while the year is draft.",
      );
    const existing = await tx.assessmentScheme.findUnique({
      where: { academicYearId },
    });
    if (existing) {
      const scoreCount = await tx.assessmentScore.count({
        where: { component: { schemeId: existing.id } },
      });
      assertAssessmentSchemeEditable(existing.locked, scoreCount);
    }
    const scheme = existing
      ? await tx.assessmentScheme.update({
          where: { id: existing.id },
          data: { name: input.name, totalMax: 100 },
        })
      : await tx.assessmentScheme.create({
          data: { academicYearId, name: input.name, totalMax: 100 },
        });
    await tx.assessmentComponent.deleteMany({ where: { schemeId: scheme.id } });
    await tx.gradeBand.deleteMany({ where: { schemeId: scheme.id } });
    await tx.assessmentComponent.createMany({
      data: input.components.map((component) => ({
        ...component,
        code: component.code.toUpperCase(),
        schemeId: scheme.id,
      })),
    });
    await tx.gradeBand.createMany({
      data: input.gradeBands.map((band) => ({ ...band, schemeId: scheme.id })),
    });
    await audit(
      tx,
      actorId,
      "ASSESSMENT_SCHEME_UPDATED",
      "AssessmentScheme",
      scheme.id,
      { academicYearId },
    );
    return tx.assessmentScheme.findUnique({
      where: { id: scheme.id },
      include: {
        components: { orderBy: { sequence: "asc" } },
        gradeBands: { orderBy: { minScore: "desc" } },
      },
    });
  });
}

export async function copyYearStructure(
  actorId: string,
  targetYearId: string,
  sourceYearId: string,
  copyTermCount: boolean,
) {
  if (targetYearId === sourceYearId)
    throw AppError.badRequest("Source and target years must be different.");
  return prisma.$transaction(async (tx) => {
    const [target, source] = await Promise.all([
      tx.academicYear.findUnique({
        where: { id: targetYearId },
        include: { sections: true, curriculumSubjects: true },
      }),
      tx.academicYear.findUnique({
        where: { id: sourceYearId },
        include: {
          sections: true,
          curriculumSubjects: true,
          assessmentScheme: { include: { components: true, gradeBands: true } },
        },
      }),
    ]);
    if (!target || !source)
      throw AppError.notFound("Source or target academic year not found.");
    if (target.status !== AcademicYearStatus.DRAFT)
      throw AppError.badRequest(
        "Structure can be copied only into a draft year.",
      );
    if (target.sections.length || target.curriculumSubjects.length)
      throw AppError.conflict(
        "The target year already has sections or curriculum.",
      );
    if (copyTermCount && target.termCount !== source.termCount)
      throw AppError.badRequest(
        "Create the target year with the desired copied term count before copying structure.",
      );
    await tx.classSection.createMany({
      data: source.sections
        .filter((item) => item.active)
        .map((item) => ({
          academicYearId: target.id,
          gradeLevelId: item.gradeLevelId,
          name: item.name,
          capacity: item.capacity,
          classTeacherId: item.classTeacherId,
        })),
    });
    await tx.curriculumSubject.createMany({
      data: source.curriculumSubjects
        .filter((item) => item.active)
        .map((item) => ({
          academicYearId: target.id,
          gradeLevelId: item.gradeLevelId,
          subjectId: item.subjectId,
          passMark: item.passMark,
          sortOrder: item.sortOrder,
        })),
    });
    if (source.assessmentScheme) {
      const current = await tx.assessmentScheme.findUnique({
        where: { academicYearId: target.id },
      });
      if (current) {
        await tx.assessmentComponent.deleteMany({
          where: { schemeId: current.id },
        });
        await tx.gradeBand.deleteMany({ where: { schemeId: current.id } });
        await tx.assessmentScheme.update({
          where: { id: current.id },
          data: {
            name: source.assessmentScheme.name,
            totalMax: source.assessmentScheme.totalMax,
            components: {
              create: source.assessmentScheme.components.map(
                ({ name, code, maxScore, sequence }) => ({
                  name,
                  code,
                  maxScore,
                  sequence,
                }),
              ),
            },
            gradeBands: {
              create: source.assessmentScheme.gradeBands.map(
                ({ minScore, maxScore, grade, remark }) => ({
                  minScore,
                  maxScore,
                  grade,
                  remark,
                }),
              ),
            },
          },
        });
      }
    }
    await audit(
      tx,
      actorId,
      "YEAR_STRUCTURE_COPIED",
      "AcademicYear",
      target.id,
      { sourceYearId },
    );
  });
}
