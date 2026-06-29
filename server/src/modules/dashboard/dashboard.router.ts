import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { getDashboard } from "./dashboard.service.js";

const router = Router();

router.get(
  "/",
  authenticate,
  authorize("dashboard.view"),
  async (req, res, next) => {
    try {
      res.setHeader("Cache-Control", "private, no-store");
      res.json({
        dashboard: await getDashboard(
          req.user!.id,
          req.user!.roleSlug,
          req.user!.permissions,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

export { router as dashboardRouter };
