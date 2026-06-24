import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";

interface CreateRoleInput {
  name: string;
  slug: string;
  description?: string;
  permissions: string[];
}

interface UpdateRoleInput {
  name?: string;
  description?: string;
  permissions?: string[];
}

function formatRole(role: any) {
  return {
    id: role.id,
    name: role.name,
    slug: role.slug,
    description: role.description,
    builtIn: role.builtIn,
    permissions: role.permissions?.map((p: any) => p.permission) ?? [],
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

export async function listRoles() {
  const roles = await prisma.role.findMany({
    include: { permissions: true },
    orderBy: { createdAt: "asc" },
  });
  return roles.map(formatRole);
}

export async function getRoleById(id: string) {
  const role = await prisma.role.findUnique({
    where: { id },
    include: { permissions: true },
  });
  if (!role) throw AppError.notFound("Role not found");
  return formatRole(role);
}

export async function createRole(input: CreateRoleInput) {
  const existing = await prisma.role.findFirst({
    where: { OR: [{ name: input.name }, { slug: input.slug }] },
  });
  if (existing) {
    throw AppError.conflict("A role with this name or slug already exists", "ROLE_EXISTS");
  }

  const role = await prisma.role.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      builtIn: false,
      permissions: {
        create: input.permissions.map((p) => ({ permission: p })),
      },
    },
    include: { permissions: true },
  });

  return formatRole(role);
}

export async function updateRole(id: string, input: UpdateRoleInput) {
  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound("Role not found");

  // Allow updating permissions on built-in roles, but not name/slug
  if (existing.builtIn && input.name) {
    throw AppError.badRequest("Cannot rename a built-in role");
  }

  const role = await prisma.$transaction(async (tx) => {
    // Update role metadata
    await tx.role.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
      },
    });

    // Replace permissions if provided
    if (input.permissions) {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({
        data: input.permissions.map((p) => ({ roleId: id, permission: p })),
      });
    }

    return tx.role.findUnique({
      where: { id },
      include: { permissions: true },
    });
  });

  return formatRole(role);
}

export async function deleteRole(id: string) {
  const existing = await prisma.role.findUnique({
    where: { id },
    include: { users: { select: { id: true } } },
  });

  if (!existing) throw AppError.notFound("Role not found");
  if (existing.builtIn) throw AppError.badRequest("Cannot delete a built-in role");
  if (existing.users.length > 0) {
    throw AppError.badRequest(
      `Cannot delete role: ${existing.users.length} user(s) are still assigned to it. Reassign them first.`,
    );
  }

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: id } }),
    prisma.role.delete({ where: { id } }),
  ]);
}
