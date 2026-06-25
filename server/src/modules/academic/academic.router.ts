import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import * as academicService from "./academic.service.js";
import {
  createAcademicYearSchema,
  updateAcademicYearSchema,
  updateTermSchema,
  createClassRoomSchema,
  updateClassRoomSchema,
  createSubjectSchema,
  updateSubjectSchema,
  saveClassSubjectsSchema,
} from "./academic.schema.js";
import * as attendanceService from "./services/attendance.service.js";
import * as gradebookService from "./services/gradebook.service.js";
import * as reportsService from "./services/reports.service.js";
import * as promotionsService from "./services/promotions.service.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { z } from "zod";

const router = Router();

// All academic routes require authentication
router.use(authenticate);

// ── GET Endpoints (require academic.view) ─────────────────
router.get("/years", authorize("academic.view"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const years = await academicService.listAcademicYears();
    res.json({ years });
  } catch (err) {
    next(err);
  }
});

router.get("/classes", authorize("academic.view"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const classrooms = await academicService.listClassRooms();
    res.json({ classrooms });
  } catch (err) {
    next(err);
  }
});

router.get("/subjects", authorize("academic.view"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const subjects = await academicService.listSubjects();
    res.json({ subjects });
  } catch (err) {
    next(err);
  }
});

router.get("/teachers", authorize("academic.view"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const teachers = await academicService.listTeachers();
    res.json({ teachers });
  } catch (err) {
    next(err);
  }
});

// ── Write Endpoints (require academic.manage) ─────────────

// Academic Years CRUD
router.post("/years", authorize("academic.manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createAcademicYearSchema.parse(req.body);
    const year = await academicService.createAcademicYear(body);
    res.status(201).json({ year });
  } catch (err) {
    next(err);
  }
});

router.patch("/years/:id", authorize("academic.manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateAcademicYearSchema.parse(req.body);
    const year = await academicService.updateAcademicYear(req.params.id as string, body);
    res.json({ year });
  } catch (err) {
    next(err);
  }
});

router.delete("/years/:id", authorize("academic.manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await academicService.deleteAcademicYear(req.params.id as string);
    res.json({ message: "Academic year deleted" });
  } catch (err) {
    next(err);
  }
});

// Terms CRUD
router.patch("/terms/:id", authorize("academic.manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateTermSchema.parse(req.body);
    const term = await academicService.updateTerm(req.params.id as string, body);
    res.json({ term });
  } catch (err) {
    next(err);
  }
});

// ClassRooms CRUD
router.post("/classes", authorize("academic.manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createClassRoomSchema.parse(req.body);
    const classroom = await academicService.createClassRoom(body);
    res.status(201).json({ classroom });
  } catch (err) {
    next(err);
  }
});

router.patch("/classes/:id", authorize("academic.manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateClassRoomSchema.parse(req.body);
    const classroom = await academicService.updateClassRoom(req.params.id as string, body);
    res.json({ classroom });
  } catch (err) {
    next(err);
  }
});

router.delete("/classes/:id", authorize("academic.manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await academicService.deleteClassRoom(req.params.id as string);
    res.json({ message: "Classroom deleted" });
  } catch (err) {
    next(err);
  }
});

// Subjects CRUD
router.post("/subjects", authorize("academic.manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createSubjectSchema.parse(req.body);
    const subject = await academicService.createSubject(body);
    res.status(201).json({ subject });
  } catch (err) {
    next(err);
  }
});

router.patch("/subjects/:id", authorize("academic.manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateSubjectSchema.parse(req.body);
    const subject = await academicService.updateSubject(req.params.id as string, body);
    res.json({ subject });
  } catch (err) {
    next(err);
  }
});

router.delete("/subjects/:id", authorize("academic.manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await academicService.deleteSubject(req.params.id as string);
    res.json({ message: "Subject deleted" });
  } catch (err) {
    next(err);
  }
});

// ── Class Subjects Endpoints ───────────────────────────────
router.get("/classes/:id/subjects", authorize("academic.view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const classSubjects = await academicService.getClassSubjects(req.params.id as string);
    res.json({ classSubjects });
  } catch (err) {
    next(err);
  }
});

router.post("/classes/:id/subjects", authorize("academic.manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = saveClassSubjectsSchema.parse(req.body);
    await academicService.saveClassSubjects(req.params.id as string, body);
    res.json({ message: "Class subjects updated successfully" });
  } catch (err) {
    next(err);
  }
});

// ── Attendance Endpoints ───────────────────────────────────
router.get("/attendance/dates", authorize("attendance.view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activeTerm = await prisma.term.findFirst({ where: { active: true } });
    if (!activeTerm) throw AppError.badRequest("No active term configured.");

    const { classId } = req.query;
    if (!classId) throw AppError.badRequest("Missing classId.");

    const dates = await attendanceService.listAttendanceDates(
      classId as string,
      activeTerm.id
    );
    res.json({ dates });
  } catch (err) {
    next(err);
  }
});

router.get("/attendance", authorize("attendance.view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activeTerm = await prisma.term.findFirst({ where: { active: true } });
    if (!activeTerm) throw AppError.badRequest("No active term configured.");

    const { classId, date } = req.query;
    if (!classId || !date) throw AppError.badRequest("Missing classId or date.");

    const list = await attendanceService.listAttendance(
      classId as string,
      new Date(date as string),
      activeTerm.id
    );
    res.json({ attendance: list });
  } catch (err) {
    next(err);
  }
});

const saveAttendanceSchema = z.object({
  classId: z.string(),
  date: z.string(),
  marks: z.array(z.object({
    studentId: z.string(),
    status: z.string()
  }))
});

router.post("/attendance", authorize("attendance.mark"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activeTerm = await prisma.term.findFirst({ where: { active: true } });
    if (!activeTerm) throw AppError.badRequest("No active term configured.");

    const body = saveAttendanceSchema.parse(req.body);
    await attendanceService.saveAttendance(
      activeTerm.id,
      new Date(body.date),
      body.marks
    );
    res.json({ message: "Attendance saved successfully" });
  } catch (err) {
    next(err);
  }
});

// ── Gradebook Endpoints ────────────────────────────────────
router.get("/class-subjects", authorize("students.view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await gradebookService.listClassSubjectsForUser(
      req.user!.id,
      req.user!.roleSlug
    );
    res.json({ classSubjects: list });
  } catch (err) {
    next(err);
  }
});

router.get("/gradebook", authorize("students.view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activeTerm = await prisma.term.findFirst({ where: { active: true } });
    if (!activeTerm) throw AppError.badRequest("No active term configured.");

    const { classSubjectId } = req.query;
    if (!classSubjectId) throw AppError.badRequest("Missing classSubjectId.");

    const data = await gradebookService.listGradebook(
      classSubjectId as string,
      activeTerm.id
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

const saveGradebookSchema = z.object({
  classSubjectId: z.string(),
  entries: z.array(z.object({
    studentId: z.string(),
    classScore: z.number().min(0).max(100),
    examScore: z.number().min(0).max(100)
  }))
});

router.post("/gradebook", authorize("students.view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activeTerm = await prisma.term.findFirst({ where: { active: true } });
    if (!activeTerm) throw AppError.badRequest("No active term configured.");

    const body = saveGradebookSchema.parse(req.body);
    await gradebookService.saveGradebook(
      body.classSubjectId,
      activeTerm.id,
      body.entries
    );
    res.json({ message: "Gradebook updated successfully" });
  } catch (err) {
    next(err);
  }
});

// ── Reports Endpoints ──────────────────────────────────────
router.get("/reports", authorize("reports.view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activeTerm = await prisma.term.findFirst({ where: { active: true } });
    if (!activeTerm) throw AppError.badRequest("No active term configured.");

    const { classId } = req.query;
    if (!classId) throw AppError.badRequest("Missing classId.");

    const list = await reportsService.listClassReports(
      classId as string,
      activeTerm.id
    );
    res.json({ reports: list });
  } catch (err) {
    next(err);
  }
});

router.get("/reports/student/:studentId", authorize("reports.view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activeTerm = await prisma.term.findFirst({ where: { active: true } });
    if (!activeTerm) throw AppError.badRequest("No active term configured.");

    const card = await reportsService.getStudentReportCard(
      req.params.studentId as string,
      activeTerm.id
    );
    res.json(card);
  } catch (err) {
    next(err);
  }
});

const saveRemarksSchema = z.object({
  studentId: z.string(),
  teacherRemarks: z.string().optional(),
  principalRemark: z.string().optional(),
  published: z.boolean().optional()
});

router.post("/reports/remarks", authorize("reports.view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activeTerm = await prisma.term.findFirst({ where: { active: true } });
    if (!activeTerm) throw AppError.badRequest("No active term configured.");

    const body = saveRemarksSchema.parse(req.body);
    await reportsService.saveRemarks(
      body.studentId,
      activeTerm.id,
      {
        teacherRemarks: body.teacherRemarks,
        principalRemark: body.principalRemark,
        published: body.published
      }
    );
    res.json({ message: "Report card remarks updated" });
  } catch (err) {
    next(err);
  }
});

// ── Promotions Endpoints ───────────────────────────────────
router.get("/promotions", authorize("promotion.view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activeYear = await prisma.academicYear.findFirst({ where: { active: true } });
    if (!activeYear) throw AppError.badRequest("No active academic year configured.");

    const { classId } = req.query;
    if (!classId) throw AppError.badRequest("Missing classId.");

    const list = await promotionsService.listPromotions(
      classId as string,
      activeYear.id
    );
    res.json({ promotions: list });
  } catch (err) {
    next(err);
  }
});

const saveRecommendationsSchema = z.object({
  classId: z.string(),
  recommendations: z.array(z.object({
    studentId: z.string(),
    recommendation: z.string(),
    remarks: z.string().optional()
  }))
});

router.post("/promotions/recommend", authorize("promotion.recommend"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activeYear = await prisma.academicYear.findFirst({ where: { active: true } });
    if (!activeYear) throw AppError.badRequest("No active academic year configured.");

    const body = saveRecommendationsSchema.parse(req.body);
    await promotionsService.saveRecommendations(
      req.user!.id,
      body.classId,
      activeYear.id,
      body.recommendations
    );
    res.json({ message: "Recommendations saved successfully" });
  } catch (err) {
    next(err);
  }
});

const approvePromotionsSchema = z.object({
  classId: z.string(),
  targetClassId: z.string()
});

router.post("/promotions/approve", authorize("promotion.approve"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = approvePromotionsSchema.parse(req.body);
    await promotionsService.approvePromotions(
      req.user!.id,
      body.classId,
      body.targetClassId
    );
    res.json({ message: "Class promotions approved and rollover executed successfully" });
  } catch (err) {
    next(err);
  }
});

export { router as academicRouter };
