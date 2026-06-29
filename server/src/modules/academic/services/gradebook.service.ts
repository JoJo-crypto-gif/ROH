import { ReportStatus, TermStatus } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../../lib/errors.js";
import {
  assertEnrolmentAccess,
  assertSectionAccess,
  getAcademicAccessScope,
} from "./access.service.js";

export async function listSectionsForUser(
  userId: string,
  roleSlug: string,
  academicYearId?: string,
) {
  const accessScope = await getAcademicAccessScope(userId, roleSlug);
  if (accessScope === "NONE") return [];
  const where = {
    ...(academicYearId
      ? { academicYearId }
      : { academicYear: { status: "ACTIVE" as const } }),
    active: true,
    ...(accessScope === "ASSIGNED" ? { classTeacherId: userId } : {}),
  };
  const sections = await prisma.classSection.findMany({
    where,
    include: {
      gradeLevel: true,
      classTeacher: { select: { id: true, name: true } },
    },
    orderBy: [{ gradeLevel: { order: "asc" } }, { name: "asc" }],
  });
  return sections.map((section) => ({
    id: section.id,
    classId: section.id,
    className: section.name,
    sectionName: section.name,
    gradeLevelId: section.gradeLevelId,
    gradeLevelName: section.gradeLevel.name,
    teacherId: section.classTeacherId,
    teacherName: section.classTeacher?.name ?? "Unassigned",
    academicYearId: section.academicYearId,
  }));
}

export async function getEnrolmentGradebook(
  userId: string,
  roleSlug: string,
  enrolmentId: string,
  termId: string,
) {
  const enrolment = await assertEnrolmentAccess(userId, roleSlug, enrolmentId);
  const term = await prisma.term.findUnique({ where: { id: termId } });
  if (!term) throw AppError.notFound("Term not found.");
  if (term.academicYearId !== enrolment.academicYearId)
    throw AppError.badRequest(
      "Term and enrolment belong to different academic years.",
    );
  const [scheme, curriculum, results, report] = await Promise.all([
    prisma.assessmentScheme.findUnique({
      where: { academicYearId: enrolment.academicYearId },
      include: {
        components: { orderBy: { sequence: "asc" } },
        gradeBands: { orderBy: { minScore: "desc" } },
      },
    }),
    prisma.curriculumSubject.findMany({
      where: {
        academicYearId: enrolment.academicYearId,
        gradeLevelId: enrolment.classSection.gradeLevelId,
        active: true,
      },
      include: { subject: true },
      orderBy: [{ sortOrder: "asc" }, { subject: { name: "asc" } }],
    }),
    prisma.assessmentResult.findMany({
      where: { enrolmentId, termId },
      include: { scores: true },
    }),
    prisma.termReport.findUnique({
      where: { enrolmentId_termId: { enrolmentId, termId } },
    }),
  ]);
  if (!scheme)
    throw AppError.badRequest(
      "No assessment scheme is configured for this academic year.",
    );
  const resultMap = new Map(
    results.map((result) => [result.curriculumSubjectId, result]),
  );
  return {
    enrolment: {
      id: enrolment.id,
      studentId: enrolment.studentId,
      firstName: enrolment.student.firstName,
      lastName: enrolment.student.lastName,
      admissionNo: enrolment.student.admissionNo,
      photoColor: enrolment.student.photoColor,
      sectionName: enrolment.classSection.name,
      gradeLevelName: enrolment.classSection.gradeLevel.name,
    },
    term,
    components: scheme.components,
    subjects: curriculum.map((item) => {
      const result = resultMap.get(item.id);
      return {
        curriculumSubjectId: item.id,
        classSubjectId: item.id,
        subjectId: item.subjectId,
        subjectName: item.subject.name,
        subjectCode: item.subject.code,
        passMark: item.passMark,
        scores: scheme.components.map((component) => ({
          componentId: component.id,
          score:
            result?.scores.find((score) => score.componentId === component.id)
              ?.score ?? null,
        })),
        totalScore: result?.totalScore ?? null,
        grade: result?.grade ?? null,
        remarks: result?.remarks ?? "",
        position: result?.position ?? null,
      };
    }),
    report: report ?? {
      status: ReportStatus.DRAFT,
      conduct: "",
      attitude: "",
      teacherRemarks: "",
      headteacherRemark: "",
    },
    editable:
      (term.status === TermStatus.ACTIVE ||
        (report?.status === ReportStatus.DRAFT &&
          (report.currentVersion ?? 0) > 0)) &&
      report?.status !== ReportStatus.PUBLISHED,
  };
}

export async function saveEnrolmentGradebook(
  actorId: string,
  roleSlug: string,
  enrolmentId: string,
  termId: string,
  entries: {
    curriculumSubjectId: string;
    scores: { componentId: string; score: number }[];
    remarks?: string;
  }[],
) {
  const enrolment = await assertEnrolmentAccess(actorId, roleSlug, enrolmentId);
  const [term, scheme, curriculum, report] = await Promise.all([
    prisma.term.findUnique({ where: { id: termId } }),
    prisma.assessmentScheme.findUnique({
      where: { academicYearId: enrolment.academicYearId },
      include: { components: true, gradeBands: true },
    }),
    prisma.curriculumSubject.findMany({
      where: {
        academicYearId: enrolment.academicYearId,
        gradeLevelId: enrolment.classSection.gradeLevelId,
        active: true,
      },
    }),
    prisma.termReport.findUnique({
      where: { enrolmentId_termId: { enrolmentId, termId } },
    }),
  ]);
  if (!term || term.academicYearId !== enrolment.academicYearId)
    throw AppError.badRequest("Invalid term for this enrolment.");
  const correctionOpen =
    report?.status === ReportStatus.DRAFT && report.currentVersion > 0;
  if (term.status !== TermStatus.ACTIVE && !correctionOpen)
    throw AppError.badRequest(
      "Scores can be changed only during the active term or an explicit correction.",
    );
  if (report?.status === ReportStatus.PUBLISHED)
    throw AppError.badRequest(
      "Begin a report correction before changing published results.",
    );
  if (!scheme) throw AppError.badRequest("No assessment scheme is configured.");
  const curriculumIds = new Set(curriculum.map((item) => item.id));
  const componentMap = new Map(
    scheme.components.map((component) => [component.id, component]),
  );
  const uniqueSubjects = new Set(
    entries.map((entry) => entry.curriculumSubjectId),
  );
  if (
    uniqueSubjects.size !== entries.length ||
    entries.some((entry) => !curriculumIds.has(entry.curriculumSubjectId))
  )
    throw AppError.badRequest("Invalid or duplicate curriculum subject entry.");

  for (const entry of entries) {
    if (
      entry.scores.length !== scheme.components.length ||
      new Set(entry.scores.map((score) => score.componentId)).size !==
        scheme.components.length
    )
      throw AppError.badRequest(
        "Every assessment component must have exactly one score.",
      );
    for (const score of entry.scores) {
      const component = componentMap.get(score.componentId);
      if (!component || score.score < 0 || score.score > component.maxScore)
        throw AppError.badRequest(
          "A component score is outside its allowed range.",
        );
    }
  }

  return prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      const totalScore = entry.scores.reduce(
        (sum, score) => sum + score.score,
        0,
      );
      const band = scheme.gradeBands.find(
        (item) =>
          totalScore >= item.minScore && totalScore <= item.maxScore + 0.001,
      );
      if (!band)
        throw AppError.badRequest(`No grade band covers score ${totalScore}.`);
      const result = await tx.assessmentResult.upsert({
        where: {
          enrolmentId_termId_curriculumSubjectId: {
            enrolmentId,
            termId,
            curriculumSubjectId: entry.curriculumSubjectId,
          },
        },
        update: {
          totalScore,
          grade: band.grade,
          remarks: entry.remarks ?? band.remark,
        },
        create: {
          enrolmentId,
          termId,
          curriculumSubjectId: entry.curriculumSubjectId,
          totalScore,
          grade: band.grade,
          remarks: entry.remarks ?? band.remark,
        },
      });
      for (const score of entry.scores) {
        await tx.assessmentScore.upsert({
          where: {
            resultId_componentId: {
              resultId: result.id,
              componentId: score.componentId,
            },
          },
          update: { score: score.score },
          create: {
            resultId: result.id,
            componentId: score.componentId,
            score: score.score,
          },
        });
      }
    }
    await tx.assessmentScheme.update({
      where: { id: scheme.id },
      data: { locked: true },
    });
    await tx.academicAuditLog.create({
      data: {
        actorId,
        action: "GRADEBOOK_SAVED",
        entityType: "StudentEnrolment",
        entityId: enrolmentId,
        metadata: { termId, subjectCount: entries.length },
      },
    });
  });
}

export function competitionRanks<T>(items: T[], score: (item: T) => number) {
  let previous: number | undefined;
  let previousRank = 0;
  return items.map((item, index) => {
    const value = score(item);
    const rank =
      previous !== undefined && Math.abs(value - previous) < 0.001
        ? previousRank
        : index + 1;
    previous = value;
    previousRank = rank;
    return { item, rank };
  });
}

export async function computePositions(
  actorId: string,
  roleSlug: string,
  sectionId: string,
  termId: string,
) {
  const section = await assertSectionAccess(actorId, roleSlug, sectionId);
  const term = await prisma.term.findUnique({ where: { id: termId } });
  if (!term || term.academicYearId !== section.academicYearId)
    throw AppError.badRequest("Invalid term for this section.");
  const [enrolments, curriculum] = await Promise.all([
    prisma.studentEnrolment.findMany({
      where: { classSectionId: sectionId, status: "ACTIVE" },
      include: {
        assessmentResults: { where: { termId }, include: { scores: true } },
      },
    }),
    prisma.curriculumSubject.findMany({
      where: {
        academicYearId: section.academicYearId,
        gradeLevelId: section.gradeLevelId,
        active: true,
      },
    }),
  ]);
  const complete = enrolments.filter(
    (enrolment) =>
      enrolment.assessmentResults.length === curriculum.length &&
      enrolment.assessmentResults.every((result) => result.scores.length > 0),
  );
  return prisma.$transaction(async (tx) => {
    for (const subject of curriculum) {
      const subjectResults = complete
        .map(
          (enrolment) =>
            enrolment.assessmentResults.find(
              (result) => result.curriculumSubjectId === subject.id,
            )!,
        )
        .sort((a, b) => b.totalScore - a.totalScore);
      for (const { item, rank } of competitionRanks(
        subjectResults,
        (result) => result.totalScore,
      ))
        await tx.assessmentResult.update({
          where: { id: item.id },
          data: { position: rank },
        });
    }
    const totals = complete
      .map((enrolment) => ({
        enrolment,
        total: enrolment.assessmentResults.reduce(
          (sum, result) => sum + result.totalScore,
          0,
        ),
      }))
      .sort((a, b) => b.total - a.total);
    for (const { item, rank } of competitionRanks(
      totals,
      (value) => value.total,
    )) {
      await tx.termReport.upsert({
        where: {
          enrolmentId_termId: { enrolmentId: item.enrolment.id, termId },
        },
        update: {
          position: rank,
          totalScore: item.total,
          averageScore: curriculum.length ? item.total / curriculum.length : 0,
        },
        create: {
          enrolmentId: item.enrolment.id,
          termId,
          position: rank,
          totalScore: item.total,
          averageScore: curriculum.length ? item.total / curriculum.length : 0,
        },
      });
    }
    await tx.academicAuditLog.create({
      data: {
        actorId,
        action: "POSITIONS_COMPUTED",
        entityType: "ClassSection",
        entityId: sectionId,
        metadata: { termId, ranked: complete.length },
      },
    });
    return {
      ranked: complete.length,
      excluded: enrolments.length - complete.length,
    };
  });
}
