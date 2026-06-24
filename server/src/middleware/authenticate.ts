import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type AccessTokenPayload } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        roleId: string;
        roleSlug: string;
        permissions: string[];
      };
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw AppError.unauthorized("Missing or invalid authorization header");
    }

    const token = authHeader.slice(7);
    let payload: AccessTokenPayload;

    try {
      payload = verifyAccessToken(token);
    } catch {
      throw AppError.unauthorized("Invalid or expired access token", "TOKEN_EXPIRED");
    }

    // Fetch user with role and permissions
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        role: {
          include: {
            permissions: true,
          },
        },
      },
    });

    if (!user || !user.active) {
      throw AppError.unauthorized("User not found or deactivated");
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      roleId: user.role.id,
      roleSlug: user.role.slug,
      permissions: user.role.permissions.map((p) => p.permission),
    };

    next();
  } catch (err) {
    next(err);
  }
}
