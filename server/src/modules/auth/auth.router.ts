import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { loginSchema, forgotPasswordSchema, resetPasswordSchema } from "./auth.schema.js";
import * as authService from "./auth.service.js";
import { authenticate } from "../../middleware/authenticate.js";
import { config } from "../../config.js";
import { parseDuration } from "../../lib/jwt.js";
import { AppError } from "../../lib/errors.js";

const router = Router();

// ── POST /auth/login ─────────────────────────────────────
router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await authService.signIn(body.email, body.password);

    // Set refresh token as httpOnly cookie
    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: config.env === "production",
      sameSite: "lax",
      path: "/auth",
      maxAge: parseDuration(config.jwt.refreshExpiresIn),
    });

    // Attach user to req so Morgan logs it
    (req as any).user = { id: result.user.id };

    res.json({
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/refresh ───────────────────────────────────
router.post("/refresh", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      throw AppError.unauthorized("No refresh token", "NO_REFRESH_TOKEN");
    }

    const result = await authService.refreshAccessToken(token);

    // Set new rotated refresh token
    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: config.env === "production",
      sameSite: "lax",
      path: "/auth",
      maxAge: parseDuration(config.jwt.refreshExpiresIn),
    });

    // Attach user to req so Morgan logs it
    (req as any).user = { id: result.user.id };

    res.json({
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/logout ────────────────────────────────────
router.post("/logout", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      await authService.logout(token);
    }

    res.clearCookie("refreshToken", { path: "/auth" });
    res.json({ message: "Logged out" });
  } catch (err) {
    next(err);
  }
});

// ── GET /auth/me ─────────────────────────────────────────
router.get("/me", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await authService.getMe(req.user!.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/forgot-password ───────────────────────────
router.post("/forgot-password", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = forgotPasswordSchema.parse(req.body);
    await authService.requestPasswordReset(body.email);

    // Always return success to prevent email enumeration
    res.json({ message: "If an account exists with that email, a reset link has been sent." });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/reset-password ────────────────────────────
router.post("/reset-password", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(body.token, body.password);
    res.json({ message: "Password reset successfully. You can now sign in." });
  } catch (err) {
    next(err);
  }
});

export { router as authRouter };
