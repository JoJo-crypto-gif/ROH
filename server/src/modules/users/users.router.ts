import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as usersService from "./users.service.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";

const router = Router();

// All user management routes require authentication + users.manage permission
router.use(authenticate, authorize("users.manage"));

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  roleId: z.string().min(1),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  roleId: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

// ── GET /users ───────────────────────────────────────────
router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await usersService.listUsers();
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// ── GET /users/:id ───────────────────────────────────────
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await usersService.getUserById(req.params.id as string);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// ── POST /users ──────────────────────────────────────────
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createUserSchema.parse(req.body);
    const user = await usersService.createUser(body);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /users/:id ─────────────────────────────────────
router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateUserSchema.parse(req.body);
    const user = await usersService.updateUser(req.params.id as string, body);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /users/:id ────────────────────────────────────
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await usersService.deactivateUser(req.params.id as string);
    res.json({ message: "User deactivated" });
  } catch (err) {
    next(err);
  }
});

export { router as usersRouter };
