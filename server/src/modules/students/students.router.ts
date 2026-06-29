import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import * as studentsService from "./students.service.js";
import { createStudentSchema, updateStudentSchema } from "./students.schema.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";

const router = Router();
router.use(authenticate);

router.get("/", authorize("students.view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const students = await studentsService.listStudents({
      classSectionId: (req.query.classSectionId ?? req.query.classId) as string | undefined,
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
    }, req.user!.id, req.user!.roleSlug);
    res.json({ students });
  } catch (error) { next(error); }
});

router.get("/:id/history", authorize("students.view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const history = await studentsService.getAcademicHistory(req.params.id as string, req.user!.id, req.user!.roleSlug);
    res.json({ history });
  } catch (error) { next(error); }
});

router.get("/:id/attendance", authorize("students.view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const termId = req.query.termId as string;
    const academicYearId = req.query.academicYearId as string;
    if (!termId || !academicYearId) throw AppError.badRequest("academicYearId and termId are required");
    await studentsService.getStudentById(req.params.id as string, req.user!.id, req.user!.roleSlug);
    const enrolment = await prisma.studentEnrolment.findUnique({ where: { studentId_academicYearId: { studentId: req.params.id as string, academicYearId } }, include: { classSection: true } });
    const attendance = enrolment ? await prisma.attendance.findMany({ where: { enrolmentId: enrolment.id, termId }, orderBy: { date: "asc" } }) : [];
    res.json({ attendance: attendance.map((item) => ({ id: item.id, date: item.date.toISOString().slice(0, 10), status: item.status, className: enrolment?.classSection.name ?? "Unknown Class" })) });
  } catch (error) { next(error); }
});

router.get("/:id", authorize("students.view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await studentsService.getStudentById(req.params.id as string, req.user!.id, req.user!.roleSlug);
    res.json({ student });
  } catch (error) { next(error); }
});

router.post("/", authorize("students.create"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await studentsService.createStudent(createStudentSchema.parse(req.body));
    res.status(201).json({ student });
  } catch (error) { next(error); }
});

router.patch("/:id", authorize("students.update"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await studentsService.updateStudent(req.params.id as string, updateStudentSchema.parse(req.body));
    res.json({ student });
  } catch (error) { next(error); }
});

export { router as studentsRouter };
