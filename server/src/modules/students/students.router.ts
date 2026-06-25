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

// ── GET /students ─────────────────────────────────────────
router.get("/", authorize("students.view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    let restrictClassId: string | undefined = undefined;

    // If class teacher, restrict lookup to their assigned class
    if (req.user?.roleSlug === "teacher") {
      const cls = await prisma.classRoom.findFirst({
        where: { teacherId: req.user.id },
      });
      if (cls) {
        restrictClassId = cls.id;
      } else {
        res.json({ students: [] });
        return;
      }
    }

    const { classId, status, search } = req.query;
    const students = await studentsService.listStudents(
      {
        classId: classId as string,
        status: status as string,
        search: search as string,
      },
      restrictClassId
    );
    res.json({ students });
  } catch (err) {
    next(err);
  }
});

// ── GET /students/:id ─────────────────────────────────────
router.get("/:id", authorize("students.view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await studentsService.getStudentById(req.params.id as string);

    // Validate class teacher scope
    if (req.user?.roleSlug === "teacher") {
      const cls = await prisma.classRoom.findFirst({
        where: { teacherId: req.user.id },
      });
      if (!cls || student.classId !== cls.id) {
        throw AppError.forbidden("You are only authorized to view students in your assigned classroom.");
      }
    }

    res.json({ student });
  } catch (err) {
    next(err);
  }
});

// ── GET /students/:id/attendance ──────────────────────────
router.get("/:id/attendance", authorize("students.view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { academicYearId, termId } = req.query;
    if (!academicYearId || !termId) {
      throw AppError.badRequest("Missing academicYearId or termId");
    }

    // Validate class teacher scope
    if (req.user?.roleSlug === "teacher") {
      const cls = await prisma.classRoom.findFirst({
        where: { teacherId: req.user.id },
      });
      const student = await prisma.student.findUnique({ where: { id: req.params.id } });
      if (!cls || !student || student.classId !== cls.id) {
        throw AppError.forbidden("You are only authorized to view students in your assigned classroom.");
      }
    }

    const attendance = await prisma.attendance.findMany({
      where: {
        studentId: req.params.id,
        termId: termId as string,
        term: { academicYearId: academicYearId as string },
      },
      include: {
        student: {
          include: {
            enrolments: {
              where: { academicYearId: academicYearId as string },
              include: { classRoom: true },
            },
          },
        },
      },
      orderBy: { date: "asc" },
    });

    const records = attendance.map((att) => {
      const enrolment = att.student.enrolments[0];
      const className = enrolment?.classRoom?.name ?? "Unknown Class";

      return {
        id: att.id,
        date: att.date.toISOString().slice(0, 10),
        status: att.status,
        className,
      };
    });

    res.json({ attendance: records });
  } catch (err) {
    next(err);
  }
});

// ── POST /students ────────────────────────────────────────
router.post("/", authorize("students.create"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createStudentSchema.parse(req.body);
    const student = await studentsService.createStudent(body);
    res.status(201).json({ student });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /students/:id ───────────────────────────────────
router.patch("/:id", authorize("students.update"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateStudentSchema.parse(req.body);

    // Validate class teacher scope
    if (req.user?.roleSlug === "teacher") {
      const cls = await prisma.classRoom.findFirst({
        where: { teacherId: req.user.id },
      });
      const student = await studentsService.getStudentById(req.params.id as string);
      if (!cls || student.classId !== cls.id) {
        throw AppError.forbidden("You are only authorized to edit students in your assigned classroom.");
      }
    }

    const student = await studentsService.updateStudent(req.params.id as string, body);
    res.json({ student });
  } catch (err) {
    next(err);
  }
});

export { router as studentsRouter };
