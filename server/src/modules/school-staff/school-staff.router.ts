import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import * as schoolStaffService from "./school-staff.service.js";
import {
  createSchoolStaffSchema,
  updateSchoolStaffSchema,
} from "./school-staff.schema.js";

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

router.get(
  "/",
  authorize("staff.view"),
  route(async (_req, res) => {
    res.json({ staff: await schoolStaffService.listSchoolStaff() });
  }),
);

router.get(
  "/:id",
  authorize("staff.view"),
  route(async (req, res) => {
    res.json({
      staff: await schoolStaffService.getSchoolStaffById(
        req.params.id as string,
      ),
    });
  }),
);

router.post(
  "/",
  authorize("staff.create"),
  route(async (req, res) => {
    const body = createSchoolStaffSchema.parse(req.body);
    res.status(201).json({
      staff: await schoolStaffService.createSchoolStaff(req.user!, body),
    });
  }),
);

router.patch(
  "/:id",
  authorize("staff.update"),
  route(async (req, res) => {
    const body = updateSchoolStaffSchema.parse(req.body);
    res.json({
      staff: await schoolStaffService.updateSchoolStaff(
        req.user!,
        req.params.id as string,
        body,
      ),
    });
  }),
);

router.delete(
  "/:id",
  authorize("staff.delete"),
  route(async (req, res) => {
    await schoolStaffService.deactivateSchoolStaff(
      req.user!,
      req.params.id as string,
    );
    res.json({ message: "School staff member deactivated" });
  }),
);

export { router as schoolStaffRouter };
