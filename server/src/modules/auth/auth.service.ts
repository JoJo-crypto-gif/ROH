import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  parseDuration,
} from "../../lib/jwt.js";
import { sendPasswordResetEmail } from "../../lib/email.js";
import { AppError } from "../../lib/errors.js";
import { config } from "../../config.js";

// ── Helpers ──────────────────────────────────────────────

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "U";
}

interface UserWithRole {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  active: boolean;
  role: {
    id: string;
    slug: string;
    name: string;
    permissions: { permission: string }[];
  };
}

function formatUser(user: UserWithRole) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    avatarInitials: initialsOf(user.name),
    roleId: user.role.id,
    roleSlug: user.role.slug,
    roleName: user.role.name,
    permissions: user.role.permissions.map((p) => p.permission),
  };
}

// ── Sign In ──────────────────────────────────────────────

export async function signIn(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      role: { include: { permissions: true } },
    },
  });

  if (!user) {
    throw AppError.unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
  }

  if (!user.active) {
    throw AppError.unauthorized("Account is deactivated. Contact your administrator.", "ACCOUNT_DISABLED");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw AppError.unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
  }

  // Issue tokens
  const accessToken = signAccessToken({
    userId: user.id,
    roleId: user.role.id,
    roleSlug: user.role.slug,
  });

  const refreshExpiry = new Date(Date.now() + parseDuration(config.jwt.refreshExpiresIn));

  // Create refresh token record in DB
  const refreshRecord = await prisma.refreshToken.create({
    data: {
      token: crypto.randomUUID(),
      userId: user.id,
      expiresAt: refreshExpiry,
    },
  });

  const refreshToken = signRefreshToken({
    userId: user.id,
    tokenId: refreshRecord.id,
  });

  // Update the DB record with the signed JWT (so we can verify it later)
  await prisma.refreshToken.update({
    where: { id: refreshRecord.id },
    data: { token: refreshToken },
  });

  return {
    accessToken,
    refreshToken,
    refreshExpiresAt: refreshExpiry,
    user: formatUser(user),
  };
}

// ── Refresh ──────────────────────────────────────────────

export async function refreshAccessToken(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw AppError.unauthorized("Invalid or expired refresh token", "REFRESH_INVALID");
  }

  // Look up the token in the DB
  const stored = await prisma.refreshToken.findUnique({
    where: { id: payload.tokenId },
  });

  if (!stored || stored.token !== refreshToken || stored.expiresAt < new Date()) {
    // Token reuse detected or expired — revoke all tokens for this user
    if (stored) {
      await prisma.refreshToken.deleteMany({ where: { userId: payload.userId } });
    }
    throw AppError.unauthorized("Refresh token revoked", "REFRESH_REVOKED");
  }

  // Fetch user
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { role: { include: { permissions: true } } },
  });

  if (!user || !user.active) {
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    throw AppError.unauthorized("User not found or deactivated");
  }

  // Rotate: delete old, issue new
  try {
    await prisma.refreshToken.delete({ where: { id: stored.id } });
  } catch (err: any) {
    if (err.code === "P2025") {
      throw AppError.unauthorized("Invalid or expired refresh token", "REFRESH_REVOKED");
    }
    throw err;
  }

  const refreshExpiry = new Date(Date.now() + parseDuration(config.jwt.refreshExpiresIn));

  const newRefreshRecord = await prisma.refreshToken.create({
    data: {
      token: crypto.randomUUID(),
      userId: user.id,
      expiresAt: refreshExpiry,
    },
  });

  const newRefreshToken = signRefreshToken({
    userId: user.id,
    tokenId: newRefreshRecord.id,
  });

  await prisma.refreshToken.update({
    where: { id: newRefreshRecord.id },
    data: { token: newRefreshToken },
  });

  const accessToken = signAccessToken({
    userId: user.id,
    roleId: user.role.id,
    roleSlug: user.role.slug,
  });

  return {
    accessToken,
    refreshToken: newRefreshToken,
    refreshExpiresAt: refreshExpiry,
    user: formatUser(user),
  };
}

// ── Logout ───────────────────────────────────────────────

export async function logout(refreshToken: string) {
  try {
    const payload = verifyRefreshToken(refreshToken);
    await prisma.refreshToken.deleteMany({
      where: { id: payload.tokenId, userId: payload.userId },
    });
  } catch {
    // Token already invalid — that's fine
  }
}

// ── Get Current User ─────────────────────────────────────

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: true } } },
  });

  if (!user || !user.active) {
    throw AppError.unauthorized("User not found or deactivated");
  }

  return formatUser(user);
}

// ── Forgot Password ─────────────────────────────────────

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  // Always return success to prevent email enumeration
  if (!user || !user.active) return;

  // Invalidate any existing reset tokens
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  // Create new reset token (valid for 1 hour)
  const resetToken = crypto.randomUUID();
  await prisma.passwordResetToken.create({
    data: {
      token: resetToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  await sendPasswordResetEmail(user.email, user.name, resetToken);
}

// ── Reset Password ──────────────────────────────────────

export async function resetPassword(token: string, newPassword: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw AppError.badRequest("Invalid or expired reset token", "RESET_TOKEN_INVALID");
  }

  const passwordHash = await hashPassword(newPassword);

  // Update password and mark token as used
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    // Revoke all refresh tokens so user must re-login
    prisma.refreshToken.deleteMany({
      where: { userId: record.userId },
    }),
  ]);
}
