import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as rolesService from "./roles.service.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";

const router = Router();

router.use(authenticate);

const createRoleSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().optional(),
  permissions: z
    .array(z.string())
    .min(1, "At least one permission is required"),
});

const updateRoleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

// ── GET /roles ───────────────────────────────────────────
router.get(
  "/",
  authorize("roles.manage", "staff.create", "staff.update", "users.manage"),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const roles = await rolesService.listRoles();
      res.json({ roles });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /roles/:id ───────────────────────────────────────
router.get(
  "/:id",
  authorize("roles.manage", "staff.create", "staff.update", "users.manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = await rolesService.getRoleById(req.params.id as string);
      res.json({ role });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /roles ──────────────────────────────────────────
router.post(
  "/",
  authorize("roles.manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createRoleSchema.parse(req.body);
      const role = await rolesService.createRole(req.user!, body);
      res.status(201).json({ role });
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /roles/:id ─────────────────────────────────────
router.patch(
  "/:id",
  authorize("roles.manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateRoleSchema.parse(req.body);
      const role = await rolesService.updateRole(
        req.user!,
        req.params.id as string,
        body,
      );
      res.json({ role });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /roles/:id ────────────────────────────────────
router.delete(
  "/:id",
  authorize("roles.manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await rolesService.deleteRole(req.user!, req.params.id as string);
      res.json({ message: "Role deleted" });
    } catch (err) {
      next(err);
    }
  },
);

export { router as rolesRouter };
