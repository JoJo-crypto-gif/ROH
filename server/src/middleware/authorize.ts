import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors.js";

/**
 * Factory: creates middleware that checks if the authenticated user
 * has at least one of the specified permissions.
 *
 * Usage: `router.get("/users", authenticate, authorize("users.manage"), handler)`
 */
export function authorize(...requiredPermissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(AppError.unauthorized());
    }

    const has = requiredPermissions.some((perm) =>
      req.user!.permissions.includes(perm),
    );

    if (!has) {
      return next(
        AppError.forbidden(
          `Missing required permission: ${requiredPermissions.join(" or ")}`,
        ),
      );
    }

    next();
  };
}
