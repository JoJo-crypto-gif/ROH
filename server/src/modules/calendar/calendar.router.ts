import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import * as calendarService from "./calendar.service.js";
import { createEventSchema, updateEventSchema } from "./calendar.schema.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

const router = Router();

router.use(authenticate);

// ── GET Endpoints ─────────────────────────────────────────

router.get("/", authorize("academic.view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    let { academicYearId } = req.query;

    if (!academicYearId) {
      // Default to the active academic year if not provided
      const activeYear = await prisma.academicYear.findFirst({ where: { active: true } });
      if (!activeYear) throw AppError.badRequest("No active academic year configured.");
      academicYearId = activeYear.id;
    }

    const events = await calendarService.listEvents(academicYearId as string);
    res.json({ events });
  } catch (err) {
    next(err);
  }
});

// ── Write Endpoints (Require academic.manage) ─────────────

router.post("/", authorize("academic.manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createEventSchema.parse(req.body);
    const event = await calendarService.createEvent(body);
    res.status(201).json({ event });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", authorize("academic.manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateEventSchema.parse(req.body);
    const event = await calendarService.updateEvent(req.params.id as string, body);
    res.json({ event });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", authorize("academic.manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await calendarService.deleteEvent(req.params.id as string);
    res.json({ message: "Event deleted" });
  } catch (err) {
    next(err);
  }
});

export { router as calendarRouter };
