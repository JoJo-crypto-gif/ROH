import { prisma } from "./prisma.js";
import { AppError } from "./errors.js";

export interface RoleActor {
  id: string;
  roleSlug: string;
  permissions: string[];
}

export function assertPermissionsGrantable(
  actor: RoleActor,
  permissions: string[],
) {
  if (actor.roleSlug === "super-admin") return;
  const actorPermissions = new Set(actor.permissions);
  const elevated = permissions.filter(
    (permission) => !actorPermissions.has(permission),
  );
  if (elevated.length > 0) {
    throw AppError.forbidden(
      `You cannot grant permission(s) you do not hold: ${elevated.join(", ")}`,
    );
  }
}

export function assertProtectedRoleManageable(
  actor: RoleActor,
  targetRoleSlug: string,
) {
  if (targetRoleSlug === "super-admin" && actor.roleSlug !== "super-admin") {
    throw AppError.forbidden(
      "Only a Super Admin can manage Super Admin access.",
    );
  }
}

export function assertNotSelfDeactivation(
  actor: RoleActor,
  targetUserId: string,
) {
  if (actor.id === targetUserId) {
    throw AppError.badRequest("You cannot deactivate your own account.");
  }
}

export async function getAssignableRole(actor: RoleActor, roleId: string) {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { permissions: true },
  });
  if (!role) throw AppError.badRequest("Invalid role ID");
  assertProtectedRoleManageable(actor, role.slug);
  assertPermissionsGrantable(
    actor,
    role.permissions.map((item) => item.permission),
  );
  return role;
}
