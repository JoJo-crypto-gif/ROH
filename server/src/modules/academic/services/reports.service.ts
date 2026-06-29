import crypto from "node:crypto";
import { Prisma, ReportStatus } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../../lib/errors.js";
import { assertEnrolmentAccess, assertSectionAccess } from "./access.service.js";
import { generateReportPdf, type ReportSnapshot } from "./report-pdf.service.js";
import { readReport, removeReport, reportPath, saveReport } from "./report-storage.service.js";

export async function listSectionReports(userId: string, roleSlug: string, sectionId: string, termId: string) {
  const section = await assertSectionAccess(userId, roleSlug, sectionId);
  const term = await prisma.term.findUnique({ where: { id: termId } });
  if (!term || term.academicYearId !== section.academicYearId) throw AppError.badRequest("Invalid term for this section.");
  const enrolments = await prisma.studentEnrolment.findMany({
    where: { classSectionId: sectionId, status: "ACTIVE" },
    include: {
      student: true,
      assessmentResults: { where: { termId } },
      reports: { where: { termId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } },
    },
    orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
  });
  return enrolments.map((enrolment) => {
    const report = enrolment.reports[0];
    const total = enrolment.assessmentResults.reduce((sum, result) => sum + result.totalScore, 0);
    return {
      enrolmentId: enrolment.id,
      studentId: enrolment.studentId,
      firstName: enrolment.student.firstName,
      lastName: enrolment.student.lastName,
      admissionNo: enrolment.student.admissionNo,
      photoColor: enrolment.student.photoColor,
      averageScore: enrolment.assessmentResults.length ? Math.round((total / enrolment.assessmentResults.length) * 10) / 10 : 0,
      totalScore: report?.totalScore ?? total,
      position: report?.position ?? null,
      teacherRemarks: report?.teacherRemarks ?? null,
      headteacherRemark: report?.headteacherRemark ?? null,
      status: report?.status ?? ReportStatus.DRAFT,
      published: report?.status === ReportStatus.PUBLISHED,
      currentVersion: report?.currentVersion ?? 0,
      latestVersionId: report?.versions[0]?.id ?? null,
    };
  });
}

async function loadReportContext(enrolmentId: string, termId: string) {
  const enrolment = await prisma.studentEnrolment.findUnique({
    where: { id: enrolmentId },
    include: { student: true, academicYear: true, classSection: { include: { gradeLevel: true, classTeacher: { select: { name: true } } } } },
  });
  if (!enrolment) throw AppError.notFound("Student enrolment not found.");
  const [term, scheme, curriculum, results, attendance, report, profile, promotion] = await Promise.all([
    prisma.term.findUnique({ where: { id: termId } }),
    prisma.assessmentScheme.findUnique({ where: { academicYearId: enrolment.academicYearId }, include: { components: { orderBy: { sequence: "asc" } }, gradeBands: true } }),
    prisma.curriculumSubject.findMany({ where: { academicYearId: enrolment.academicYearId, gradeLevelId: enrolment.classSection.gradeLevelId, active: true }, include: { subject: true }, orderBy: [{ sortOrder: "asc" }, { subject: { name: "asc" } }] }),
    prisma.assessmentResult.findMany({ where: { enrolmentId, termId }, include: { scores: true } }),
    prisma.attendance.findMany({ where: { enrolmentId, termId } }),
    prisma.termReport.findUnique({ where: { enrolmentId_termId: { enrolmentId, termId } }, include: { versions: { orderBy: { version: "desc" } } } }),
    prisma.schoolProfile.upsert({ where: { id: "default" }, update: {}, create: { id: "default", name: "Lumen School" } }),
    prisma.promotion.findUnique({ where: { currentEnrolmentId: enrolmentId }, include: { nextEnrolment: { include: { classSection: true } } } }),
  ]);
  if (!term || term.academicYearId !== enrolment.academicYearId) throw AppError.badRequest("Invalid term for this enrolment.");
  if (!scheme) throw AppError.badRequest("No assessment scheme is configured.");
  return { enrolment, term, scheme, curriculum, results, attendance, report, profile, promotion };
}

function attendanceSummary(attendance: { status: string }[]) {
  const count = (status: string) => attendance.filter((item) => item.status === status).length;
  return { present: count("PRESENT"), absent: count("ABSENT"), late: count("LATE"), excused: count("EXCUSED"), total: attendance.length };
}

function toSnapshot(context: Awaited<ReturnType<typeof loadReportContext>>, version: number): ReportSnapshot {
  const resultMap = new Map(context.results.map((result) => [result.curriculumSubjectId, result]));
  const total = context.results.reduce((sum, result) => sum + result.totalScore, 0);
  return {
    school: context.profile,
    student: {
      name: `${context.enrolment.student.firstName} ${context.enrolment.student.lastName}`,
      admissionNo: context.enrolment.student.admissionNo,
      sectionName: context.enrolment.classSection.name,
      gradeLevelName: context.enrolment.classSection.gradeLevel.name,
    },
    academic: { academicYear: context.enrolment.academicYear.name, term: context.term.name, generatedAt: new Date().toISOString(), version },
    components: context.scheme.components.map(({ id, name, maxScore }) => ({ id, name, maxScore })),
    subjects: context.curriculum.map((item) => {
      const result = resultMap.get(item.id);
      return {
        name: item.subject.name,
        scores: result?.scores.map(({ componentId, score }) => ({ componentId, score })) ?? [],
        totalScore: result?.totalScore ?? 0,
        grade: result?.grade ?? "-",
        remark: result?.remarks ?? "",
        position: result?.position ?? null,
      };
    }),
    attendance: attendanceSummary(context.attendance),
    summary: {
      totalScore: context.report?.totalScore ?? total,
      averageScore: context.report?.averageScore ?? (context.results.length ? total / context.results.length : 0),
      position: context.report?.position ?? null,
      conduct: context.report?.conduct ?? "",
      attitude: context.report?.attitude ?? "",
      teacherRemarks: context.report?.teacherRemarks ?? "",
      headteacherRemark: context.report?.headteacherRemark ?? "",
    },
  };
}

export async function getReportCard(userId: string, roleSlug: string, enrolmentId: string, termId: string) {
  await assertEnrolmentAccess(userId, roleSlug, enrolmentId);
  const context = await loadReportContext(enrolmentId, termId);
  const snapshot = toSnapshot(context, Math.max(1, (context.report?.currentVersion ?? 0) + 1));
  const resultMap = new Map(context.results.map((result) => [result.curriculumSubjectId, result]));
  return {
    enrolmentId,
    student: {
      id: context.enrolment.studentId,
      firstName: context.enrolment.student.firstName,
      lastName: context.enrolment.student.lastName,
      admissionNo: context.enrolment.student.admissionNo,
      photoColor: context.enrolment.student.photoColor,
      className: context.enrolment.classSection.name,
      gradeLevelName: context.enrolment.classSection.gradeLevel.name,
    },
    components: context.scheme.components,
    attendance: snapshot.attendance,
    subjects: context.curriculum.map((item) => {
      const result = resultMap.get(item.id);
      return {
        curriculumSubjectId: item.id,
        subjectId: item.subjectId,
        subjectName: item.subject.name,
        subjectCode: item.subject.code,
        passMark: item.passMark,
        scores: context.scheme.components.map((component) => ({ componentId: component.id, score: result?.scores.find((score) => score.componentId === component.id)?.score ?? null })),
        totalScore: result?.totalScore ?? null,
        grade: result?.grade ?? "-",
        remarks: result?.remarks ?? "",
        position: result?.position ?? null,
      };
    }),
    reportSummary: {
      ...snapshot.summary,
      subjectsCount: context.results.length,
      totalExpectedScore: context.curriculum.length * 100,
      status: context.report?.status ?? ReportStatus.DRAFT,
      published: context.report?.status === ReportStatus.PUBLISHED,
      currentVersion: context.report?.currentVersion ?? 0,
      promotedToSectionId: context.promotion?.nextEnrolment?.classSectionId ?? null,
      promotionDecision: context.promotion?.decision ?? null,
    },
    versions: context.report?.versions.map((version) => ({ id: version.id, version: version.version, publishedAt: version.publishedAt, checksum: version.checksum })) ?? [],
    term: context.term,
  };
}

export async function saveRemarks(actorId: string, roleSlug: string, enrolmentId: string, termId: string, data: { conduct?: string; attitude?: string; teacherRemarks?: string; headteacherRemark?: string }) {
  await assertEnrolmentAccess(actorId, roleSlug, enrolmentId);
  const context = await loadReportContext(enrolmentId, termId);
  const correctionOpen = context.report?.status === ReportStatus.DRAFT && context.report.currentVersion > 0;
  if (context.term.status !== "ACTIVE" && !correctionOpen) throw AppError.badRequest("Remarks can be changed only during the active term or an explicit correction.");
  if (context.report?.status === ReportStatus.PUBLISHED) throw AppError.badRequest("Begin a correction before changing a published report.");
  return prisma.$transaction(async (tx) => {
    const report = await tx.termReport.upsert({ where: { enrolmentId_termId: { enrolmentId, termId } }, update: data, create: { enrolmentId, termId, ...data } });
    await tx.academicAuditLog.create({ data: { actorId, action: "REPORT_REMARKS_SAVED", entityType: "TermReport", entityId: report.id, metadata: { termId } } });
    return report;
  });
}

function assertComplete(context: Awaited<ReturnType<typeof loadReportContext>>) {
  if (context.results.length !== context.curriculum.length) throw AppError.badRequest("Every curriculum subject needs a complete result before publication.");
  if (context.results.some((result) => result.scores.length !== context.scheme.components.length)) throw AppError.badRequest("Every assessment component needs a score before publication.");
  if (!context.report?.teacherRemarks?.trim()) throw AppError.badRequest("A class teacher remark is required before publication.");
}

export async function previewReport(userId: string, roleSlug: string, enrolmentId: string, termId: string) {
  await assertEnrolmentAccess(userId, roleSlug, enrolmentId);
  const context = await loadReportContext(enrolmentId, termId);
  return generateReportPdf(toSnapshot(context, Math.max(1, (context.report?.currentVersion ?? 0) + 1)), true);
}

export async function publishReport(actorId: string, roleSlug: string, enrolmentId: string, termId: string) {
  await assertEnrolmentAccess(actorId, roleSlug, enrolmentId);
  const context = await loadReportContext(enrolmentId, termId);
  if (context.report?.status === ReportStatus.PUBLISHED) throw AppError.conflict("This report is already published. Begin a correction to create a new version.");
  assertComplete(context);
  const version = (context.report?.currentVersion ?? 0) + 1;
  const snapshot = toSnapshot(context, version);
  const pdf = await generateReportPdf(snapshot, false);
  const relativePath = reportPath({ year: context.enrolment.academicYear.name, term: context.term.name, section: context.enrolment.classSection.name, admissionNo: context.enrolment.student.admissionNo, version });
  await saveReport(relativePath, pdf);
  const checksum = crypto.createHash("sha256").update(pdf).digest("hex");
  try {
    return await prisma.$transaction(async (tx) => {
      const report = await tx.termReport.upsert({
        where: { enrolmentId_termId: { enrolmentId, termId } },
        update: { status: ReportStatus.PUBLISHED, currentVersion: version, totalScore: snapshot.summary.totalScore, averageScore: snapshot.summary.averageScore },
        create: { enrolmentId, termId, status: ReportStatus.PUBLISHED, currentVersion: version, totalScore: snapshot.summary.totalScore, averageScore: snapshot.summary.averageScore },
      });
      const published = await tx.reportCardVersion.create({ data: { reportId: report.id, version, snapshot: snapshot as unknown as Prisma.InputJsonValue, pdfPath: relativePath, checksum, publishedById: actorId } });
      await tx.academicAuditLog.create({ data: { actorId, action: "REPORT_PUBLISHED", entityType: "TermReport", entityId: report.id, metadata: { termId, version, checksum } } });
      return published;
    });
  } catch (error) {
    await removeReport(relativePath);
    throw error;
  }
}

export async function beginCorrection(actorId: string, roleSlug: string, enrolmentId: string, termId: string, reason: string) {
  await assertEnrolmentAccess(actorId, roleSlug, enrolmentId);
  const report = await prisma.termReport.findUnique({ where: { enrolmentId_termId: { enrolmentId, termId } } });
  if (!report || report.status !== ReportStatus.PUBLISHED) throw AppError.badRequest("Only a published report can be reopened for correction.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.termReport.update({ where: { id: report.id }, data: { status: ReportStatus.DRAFT } });
    await tx.academicAuditLog.create({ data: { actorId, action: "REPORT_CORRECTION_OPENED", entityType: "TermReport", entityId: report.id, metadata: { termId, reason } } });
    return updated;
  });
}

export async function downloadVersion(userId: string, roleSlug: string, versionId: string) {
  const version = await prisma.reportCardVersion.findUnique({ where: { id: versionId }, include: { report: true } });
  if (!version) throw AppError.notFound("Report version not found.");
  await assertEnrolmentAccess(userId, roleSlug, version.report.enrolmentId);
  return { buffer: await readReport(version.pdfPath), filename: `report-card-v${version.version}.pdf`, checksum: version.checksum };
}
