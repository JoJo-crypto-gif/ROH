import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { AttendanceStatus, PromotionDecision } from "@prisma/client";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import * as academicService from "./academic.service.js";
import * as attendanceService from "./services/attendance.service.js";
import * as gradebookService from "./services/gradebook.service.js";
import * as reportsService from "./services/reports.service.js";
import * as promotionsService from "./services/promotions.service.js";
import {
  academicSettingsSchema,
  copyYearStructureSchema,
  createAcademicYearSchema,
  createGradeLevelSchema,
  createSectionSchema,
  createSubjectSchema,
  saveAssessmentSchemeSchema,
  saveCurriculumSchema,
  schoolProfileSchema,
  transitionTermSchema,
  updateAcademicYearSchema,
  updateGradeLevelSchema,
  updateSectionSchema,
  updateSubjectSchema,
  updateTermSchema,
} from "./academic.schema.js";

const router = Router();
router.use(authenticate);

const route =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };

async function activeTerm() {
  const term = await prisma.term.findFirst({ where: { status: "ACTIVE" } });
  if (!term) throw AppError.badRequest("No active term is configured.");
  return term;
}

router.get(
  "/settings",
  authorize("academic.view"),
  route(async (_req, res) => {
    res.json({ settings: await academicService.getAcademicSettings() });
  }),
);
router.patch(
  "/settings",
  authorize("academic.manage"),
  route(async (req, res) => {
    const input = academicSettingsSchema.parse(req.body);
    res.json({
      settings: await academicService.updateAcademicSettings(
        req.user!.id,
        input.defaultTermCount,
      ),
    });
  }),
);
router.get(
  "/school-profile",
  authorize("academic.view"),
  route(async (_req, res) => {
    res.json({ profile: await academicService.getSchoolProfile() });
  }),
);
router.patch(
  "/school-profile",
  authorize("academic.manage"),
  route(async (req, res) => {
    res.json({
      profile: await academicService.updateSchoolProfile(
        req.user!.id,
        schoolProfileSchema.parse(req.body),
      ),
    });
  }),
);

router.get(
  "/years",
  authorize("academic.view"),
  route(async (_req, res) => {
    res.json({ years: await academicService.listAcademicYears() });
  }),
);
router.post(
  "/years",
  authorize("academic.manage"),
  route(async (req, res) => {
    const year = await academicService.createAcademicYear(
      req.user!.id,
      createAcademicYearSchema.parse(req.body),
    );
    res.status(201).json({ year });
  }),
);
router.patch(
  "/years/:id",
  authorize("academic.manage"),
  route(async (req, res) => {
    res.json({
      year: await academicService.updateAcademicYear(
        req.user!.id,
        req.params.id as string,
        updateAcademicYearSchema.parse(req.body),
      ),
    });
  }),
);
router.post(
  "/years/:id/activate",
  authorize("academic.manage"),
  route(async (req, res) => {
    res.json({
      year: await academicService.activateAcademicYear(
        req.user!.id,
        req.params.id as string,
      ),
    });
  }),
);
router.post(
  "/years/:id/close",
  authorize("academic.manage"),
  route(async (req, res) => {
    await academicService.closeAcademicYear(
      req.user!.id,
      req.params.id as string,
    );
    res.json({ message: "Academic year closed." });
  }),
);
router.post(
  "/years/:id/copy-structure",
  authorize("academic.manage"),
  route(async (req, res) => {
    const input = copyYearStructureSchema.parse(req.body);
    await academicService.copyYearStructure(
      req.user!.id,
      req.params.id as string,
      input.sourceYearId,
      input.copyTermCount,
    );
    res.json({ message: "Academic structure copied." });
  }),
);
router.delete(
  "/years/:id",
  authorize("academic.manage"),
  route(async (req, res) => {
    await academicService.deleteAcademicYear(req.params.id as string);
    res.json({ message: "Draft academic year deleted." });
  }),
);

router.patch(
  "/terms/:id",
  authorize("academic.manage"),
  route(async (req, res) => {
    res.json({
      term: await academicService.updateTerm(
        req.user!.id,
        req.params.id as string,
        updateTermSchema.parse(req.body),
      ),
    });
  }),
);
router.post(
  "/terms/:id/transition",
  authorize("academic.manage"),
  route(async (req, res) => {
    const input = transitionTermSchema.parse(req.body);
    res.json({
      term: await academicService.transitionTerm(
        req.user!.id,
        req.params.id as string,
        input.status,
      ),
    });
  }),
);

router.get(
  "/grade-levels",
  authorize("academic.view"),
  route(async (_req, res) => {
    res.json({ gradeLevels: await academicService.listGradeLevels() });
  }),
);
router.post(
  "/grade-levels",
  authorize("academic.manage"),
  route(async (req, res) => {
    res
      .status(201)
      .json({
        gradeLevel: await academicService.createGradeLevel(
          createGradeLevelSchema.parse(req.body),
        ),
      });
  }),
);
router.patch(
  "/grade-levels/:id",
  authorize("academic.manage"),
  route(async (req, res) => {
    res.json({
      gradeLevel: await academicService.updateGradeLevel(
        req.params.id as string,
        updateGradeLevelSchema.parse(req.body),
      ),
    });
  }),
);

router.get(
  ["/sections", "/classes"],
  authorize("academic.view"),
  route(async (req, res) => {
    const sections = await academicService.listSections(
      req.user!.id,
      req.user!.roleSlug,
      req.query.academicYearId as string | undefined,
    );
    res.json({ sections, classrooms: sections });
  }),
);
router.post(
  ["/sections", "/classes"],
  authorize("academic.manage"),
  route(async (req, res) => {
    const input = createSectionSchema.parse(req.body);
    const section = await academicService.createSection(input);
    res.status(201).json({ section, classroom: section });
  }),
);
router.patch(
  ["/sections/:id", "/classes/:id"],
  authorize("academic.manage"),
  route(async (req, res) => {
    const section = await academicService.updateSection(
      req.user!.id,
      req.params.id as string,
      updateSectionSchema.parse(req.body),
    );
    res.json({ section, classroom: section });
  }),
);
router.delete(
  ["/sections/:id", "/classes/:id"],
  authorize("academic.manage"),
  route(async (req, res) => {
    await academicService.archiveSection(req.params.id as string);
    res.json({ message: "Class section archived." });
  }),
);

router.get(
  "/subjects",
  authorize("academic.view"),
  route(async (_req, res) => {
    res.json({ subjects: await academicService.listSubjects() });
  }),
);
router.post(
  "/subjects",
  authorize("academic.manage"),
  route(async (req, res) => {
    res
      .status(201)
      .json({
        subject: await academicService.createSubject(
          createSubjectSchema.parse(req.body),
        ),
      });
  }),
);
router.patch(
  "/subjects/:id",
  authorize("academic.manage"),
  route(async (req, res) => {
    res.json({
      subject: await academicService.updateSubject(
        req.params.id as string,
        updateSubjectSchema.parse(req.body),
      ),
    });
  }),
);
router.delete(
  "/subjects/:id",
  authorize("academic.manage"),
  route(async (req, res) => {
    await academicService.archiveSubject(req.params.id as string);
    res.json({ message: "Subject archived." });
  }),
);
router.get(
  "/teachers",
  authorize("academic.view"),
  route(async (_req, res) => {
    res.json({ teachers: await academicService.listTeachers() });
  }),
);

router.get(
  "/curriculum",
  authorize("academic.view"),
  route(async (req, res) => {
    const { academicYearId, gradeLevelId } = req.query;
    if (!academicYearId || !gradeLevelId)
      throw AppError.badRequest(
        "academicYearId and gradeLevelId are required.",
      );
    res.json({
      curriculum: await academicService.getCurriculum(
        academicYearId as string,
        gradeLevelId as string,
      ),
    });
  }),
);
router.put(
  "/curriculum/:academicYearId/:gradeLevelId",
  authorize("academic.manage"),
  route(async (req, res) => {
    const input = saveCurriculumSchema.parse(req.body);
    res.json({
      curriculum: await academicService.saveCurriculum(
        req.user!.id,
        req.params.academicYearId as string,
        req.params.gradeLevelId as string,
        input.subjects,
      ),
    });
  }),
);
router.get(
  "/sections/:id/curriculum",
  authorize("academic.view"),
  route(async (req, res) => {
    const section = await prisma.classSection.findUnique({
      where: { id: req.params.id as string },
    });
    if (!section) throw AppError.notFound("Class section not found.");
    const curriculum = await academicService.getCurriculum(
      section.academicYearId,
      section.gradeLevelId,
    );
    res.json({
      curriculum,
      classSubjects: curriculum.map((item) => ({
        ...item,
        subjectName: item.subject.name,
        subjectCode: item.subject.code,
      })),
    });
  }),
);
router.get(
  "/classes/:id/subjects",
  authorize("academic.view"),
  route(async (req, res) => {
    const section = await prisma.classSection.findUnique({
      where: { id: req.params.id as string },
    });
    if (!section) throw AppError.notFound("Class section not found.");
    const curriculum = await academicService.getCurriculum(
      section.academicYearId,
      section.gradeLevelId,
    );
    res.json({
      classSubjects: curriculum.map((item) => ({
        ...item,
        subjectName: item.subject.name,
        subjectCode: item.subject.code,
      })),
    });
  }),
);

router.get(
  "/assessment-schemes/:academicYearId",
  authorize("academic.view"),
  route(async (req, res) => {
    res.json({
      scheme: await academicService.getAssessmentScheme(
        req.params.academicYearId as string,
      ),
    });
  }),
);
router.put(
  "/assessment-schemes/:academicYearId",
  authorize("academic.manage"),
  route(async (req, res) => {
    res.json({
      scheme: await academicService.saveAssessmentScheme(
        req.user!.id,
        req.params.academicYearId as string,
        saveAssessmentSchemeSchema.parse(req.body),
      ),
    });
  }),
);
router.get(
  "/grading",
  authorize("academic.view"),
  route(async (req, res) => {
    const yearId =
      (req.query.academicYearId as string | undefined) ??
      (await prisma.academicYear.findFirst({ where: { status: "ACTIVE" } }))
        ?.id;
    if (!yearId) return void res.json({ settings: [] });
    const scheme = await academicService.getAssessmentScheme(yearId);
    res.json({ settings: scheme?.gradeBands ?? [], scheme });
  }),
);

router.get(
  "/attendance/dates",
  authorize("attendance.view"),
  route(async (req, res) => {
    const sectionId = (req.query.sectionId ?? req.query.classId) as string;
    const termId =
      (req.query.termId as string | undefined) ?? (await activeTerm()).id;
    if (!sectionId) throw AppError.badRequest("sectionId is required.");
    res.json({
      dates: await attendanceService.listAttendanceDates(
        req.user!.id,
        req.user!.roleSlug,
        sectionId,
        termId,
      ),
    });
  }),
);
router.get(
  "/attendance",
  authorize("attendance.view"),
  route(async (req, res) => {
    const sectionId = (req.query.sectionId ?? req.query.classId) as string;
    const termId =
      (req.query.termId as string | undefined) ?? (await activeTerm()).id;
    if (!sectionId || !req.query.date)
      throw AppError.badRequest("sectionId and date are required.");
    res.json({
      attendance: await attendanceService.listAttendance(
        req.user!.id,
        req.user!.roleSlug,
        sectionId,
        new Date(req.query.date as string),
        termId,
      ),
    });
  }),
);
const attendanceInput = z
  .object({
    sectionId: z.string().optional(),
    classId: z.string().optional(),
    termId: z.string().optional(),
    date: z.string(),
    marks: z.array(
      z.object({
        enrolmentId: z.string(),
        status: z.nativeEnum(AttendanceStatus),
      }),
    ),
  })
  .refine((value) => value.sectionId || value.classId, {
    message: "sectionId is required",
  });
router.post(
  "/attendance",
  authorize("attendance.mark"),
  route(async (req, res) => {
    const input = attendanceInput.parse(req.body);
    await attendanceService.saveAttendance(
      req.user!.id,
      req.user!.roleSlug,
      input.sectionId ?? input.classId!,
      input.termId ?? (await activeTerm()).id,
      new Date(input.date),
      input.marks,
    );
    res.json({ message: "Attendance saved." });
  }),
);

router.get(
  "/gradebook/sections",
  authorize("gradebook.view"),
  route(async (req, res) => {
    res.json({
      sections: await gradebookService.listSectionsForUser(
        req.user!.id,
        req.user!.roleSlug,
        req.query.academicYearId as string | undefined,
      ),
    });
  }),
);
router.get(
  "/class-subjects",
  authorize("gradebook.view"),
  route(async (req, res) => {
    const sections = await gradebookService.listSectionsForUser(
      req.user!.id,
      req.user!.roleSlug,
      req.query.academicYearId as string | undefined,
    );
    res.json({ classSubjects: sections });
  }),
);
router.get(
  "/gradebook",
  authorize("gradebook.view"),
  route(async (req, res) => {
    let enrolmentId = req.query.enrolmentId as string | undefined;
    const termId = req.query.termId as string;
    if (!enrolmentId && req.query.studentId && termId) {
      const term = await prisma.term.findUnique({ where: { id: termId } });
      enrolmentId = term
        ? (
            await prisma.studentEnrolment.findUnique({
              where: {
                studentId_academicYearId: {
                  studentId: req.query.studentId as string,
                  academicYearId: term.academicYearId,
                },
              },
            })
          )?.id
        : undefined;
    }
    if (!enrolmentId || !termId)
      throw AppError.badRequest("enrolmentId and termId are required.");
    res.json(
      await gradebookService.getEnrolmentGradebook(
        req.user!.id,
        req.user!.roleSlug,
        enrolmentId,
        termId,
      ),
    );
  }),
);
const gradebookInput = z.object({
  enrolmentId: z.string(),
  termId: z.string(),
  entries: z.array(
    z.object({
      curriculumSubjectId: z.string(),
      scores: z.array(z.object({ componentId: z.string(), score: z.number() })),
      remarks: z.string().optional(),
    }),
  ),
});
router.put(
  "/gradebook",
  authorize("gradebook.edit"),
  route(async (req, res) => {
    const input = gradebookInput.parse(req.body);
    await gradebookService.saveEnrolmentGradebook(
      req.user!.id,
      req.user!.roleSlug,
      input.enrolmentId,
      input.termId,
      input.entries,
    );
    res.json({ message: "Gradebook saved." });
  }),
);
router.post(
  "/gradebook/compute-positions",
  authorize("gradebook.edit"),
  route(async (req, res) => {
    const input = z
      .object({ sectionId: z.string(), termId: z.string() })
      .parse(req.body);
    res.json(
      await gradebookService.computePositions(
        req.user!.id,
        req.user!.roleSlug,
        input.sectionId,
        input.termId,
      ),
    );
  }),
);

router.get(
  "/reports",
  authorize("reports.view"),
  route(async (req, res) => {
    const sectionId = (req.query.sectionId ?? req.query.classId) as string;
    const termId = req.query.termId as string;
    if (!sectionId || !termId)
      throw AppError.badRequest("sectionId and termId are required.");
    res.json({
      reports: await reportsService.listSectionReports(
        req.user!.id,
        req.user!.roleSlug,
        sectionId,
        termId,
      ),
    });
  }),
);
router.get(
  "/reports/enrolment/:enrolmentId",
  authorize("reports.view"),
  route(async (req, res) => {
    if (!req.query.termId) throw AppError.badRequest("termId is required.");
    res.json(
      await reportsService.getReportCard(
        req.user!.id,
        req.user!.roleSlug,
        req.params.enrolmentId as string,
        req.query.termId as string,
      ),
    );
  }),
);
router.get(
  "/reports/student/:studentId",
  authorize("reports.view"),
  route(async (req, res) => {
    const termId = req.query.termId as string;
    const term = termId
      ? await prisma.term.findUnique({ where: { id: termId } })
      : null;
    if (!term) throw AppError.badRequest("Valid termId is required.");
    const enrolment = await prisma.studentEnrolment.findUnique({
      where: {
        studentId_academicYearId: {
          studentId: req.params.studentId as string,
          academicYearId: term.academicYearId,
        },
      },
    });
    if (!enrolment) throw AppError.notFound("Student enrolment not found.");
    res.json(
      await reportsService.getReportCard(
        req.user!.id,
        req.user!.roleSlug,
        enrolment.id,
        termId,
      ),
    );
  }),
);
const remarksInput = z.object({
  enrolmentId: z.string(),
  termId: z.string(),
  conduct: z.string().optional(),
  attitude: z.string().optional(),
  teacherRemarks: z.string().optional(),
  headteacherRemark: z.string().optional(),
});
router.put(
  "/reports/remarks",
  authorize("gradebook.edit"),
  route(async (req, res) => {
    const input = remarksInput.parse(req.body);
    res.json({
      report: await reportsService.saveRemarks(
        req.user!.id,
        req.user!.roleSlug,
        input.enrolmentId,
        input.termId,
        input,
      ),
    });
  }),
);
router.get(
  "/reports/:enrolmentId/preview",
  authorize("reports.view"),
  route(async (req, res) => {
    if (!req.query.termId) throw AppError.badRequest("termId is required.");
    const pdf = await reportsService.previewReport(
      req.user!.id,
      req.user!.roleSlug,
      req.params.enrolmentId as string,
      req.query.termId as string,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=report-preview.pdf");
    res.send(pdf);
  }),
);
router.post(
  "/reports/:enrolmentId/publish",
  authorize("reports.publish"),
  route(async (req, res) => {
    const input = z.object({ termId: z.string() }).parse(req.body);
    res
      .status(201)
      .json({
        version: await reportsService.publishReport(
          req.user!.id,
          req.user!.roleSlug,
          req.params.enrolmentId as string,
          input.termId,
        ),
      });
  }),
);
router.post(
  "/reports/:enrolmentId/corrections",
  authorize("reports.reissue"),
  route(async (req, res) => {
    const input = z
      .object({ termId: z.string(), reason: z.string().trim().min(3) })
      .parse(req.body);
    res.json({
      report: await reportsService.beginCorrection(
        req.user!.id,
        req.user!.roleSlug,
        req.params.enrolmentId as string,
        input.termId,
        input.reason,
      ),
    });
  }),
);
router.get(
  "/reports/versions/:versionId/pdf",
  authorize("reports.view"),
  route(async (req, res) => {
    const file = await reportsService.downloadVersion(
      req.user!.id,
      req.user!.roleSlug,
      req.params.versionId as string,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${file.filename}`,
    );
    res.setHeader("ETag", file.checksum);
    res.send(file.buffer);
  }),
);

router.get(
  "/promotions",
  authorize("promotion.view"),
  route(async (req, res) => {
    const sectionId = (req.query.sectionId ?? req.query.classId) as string;
    if (!sectionId) throw AppError.badRequest("sectionId is required.");
    res.json({
      promotions: await promotionsService.listPromotions(
        req.user!.id,
        req.user!.roleSlug,
        sectionId,
      ),
    });
  }),
);
const recommendationsInput = z.object({
  sectionId: z.string(),
  recommendations: z.array(
    z.object({
      enrolmentId: z.string(),
      decision: z.nativeEnum(PromotionDecision),
      remarks: z.string().optional(),
    }),
  ),
});
router.post(
  "/promotions/recommend",
  authorize("promotion.recommend"),
  route(async (req, res) => {
    const input = recommendationsInput.parse(req.body);
    await promotionsService.saveRecommendations(
      req.user!.id,
      req.user!.roleSlug,
      input.sectionId,
      input.recommendations,
    );
    res.json({ message: "Promotion recommendations saved." });
  }),
);
const approveInput = z.object({
  sectionId: z.string(),
  nextYearId: z.string(),
  defaultTargetSectionId: z.string().nullable().default(null),
  overrides: z
    .array(
      z.object({
        enrolmentId: z.string(),
        targetSectionId: z.string().nullable(),
      }),
    )
    .default([]),
});
router.post(
  "/promotions/approve",
  authorize("promotion.approve"),
  route(async (req, res) => {
    const input = approveInput.parse(req.body);
    res.json(
      await promotionsService.approvePromotions(
        req.user!.id,
        req.user!.roleSlug,
        input.sectionId,
        input.nextYearId,
        input.defaultTargetSectionId,
        input.overrides,
      ),
    );
  }),
);

export { router as academicRouter };
