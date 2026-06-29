import { prisma } from "../../lib/prisma.js";
import { hashPassword } from "../../lib/password.js";
import { AppError } from "../../lib/errors.js";
import {
  assertNotSelfDeactivation,
  assertProtectedRoleManageable,
  getAssignableRole,
  type RoleActor,
} from "../../lib/role-assignment.js";

interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  roleId: string;
}

interface UpdateUserInput {
  email?: string;
  name?: string;
  roleId?: string;
  active?: boolean;
}

function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    avatarInitials: initialsOf(user.name),
    active: user.active,
    staffNo: user.schoolStaffProfile?.staffNo ?? user.staffNo,
    phone: user.schoolStaffProfile?.phone ?? user.phone,
    schoolStaffId: user.schoolStaffProfile?.id ?? null,
    schoolStaffCategory: user.schoolStaffProfile?.category ?? null,
    schoolStaffStatus: user.schoolStaffProfile?.status ?? null,
    roleId: user.role?.id ?? user.roleId,
    roleName: user.role?.name,
    roleSlug: user.role?.slug,
    permissions:
      user.role?.permissions?.map((item: any) => item.permission) ?? [],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function listUsers() {
  const users = await prisma.user.findMany({
    include: {
      role: { include: { permissions: true } },
      schoolStaffProfile: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return users.map(formatUser);
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      role: { include: { permissions: true } },
      schoolStaffProfile: true,
    },
  });
  if (!user) throw AppError.notFound("User not found");
  return formatUser(user);
}

export async function createUser(actor: RoleActor, input: CreateUserInput) {
  // Check email uniqueness
  const existing = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });
  if (existing) {
    throw AppError.conflict(
      "A user with this email already exists",
      "EMAIL_EXISTS",
    );
  }

  // Validate role exists
  await getAssignableRole(actor, input.roleId);

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash,
      name: input.name,
      roleId: input.roleId,
    },
    include: {
      role: { include: { permissions: true } },
      schoolStaffProfile: true,
    },
  });

  return formatUser(user);
}

export async function updateUser(
  actor: RoleActor,
  id: string,
  input: UpdateUserInput,
) {
  const existing = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });
  if (!existing) throw AppError.notFound("User not found");
  assertProtectedRoleManageable(actor, existing.role.slug);
  if (input.active === false) assertNotSelfDeactivation(actor, id);

  if (input.email) {
    const emailTaken = await prisma.user.findFirst({
      where: { email: input.email.toLowerCase(), id: { not: id } },
    });
    if (emailTaken) {
      throw AppError.conflict(
        "A user with this email already exists",
        "EMAIL_EXISTS",
      );
    }
  }

  if (input.roleId) {
    await getAssignableRole(actor, input.roleId);
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(input.email && { email: input.email.toLowerCase() }),
      ...(input.name && { name: input.name }),
      ...(input.roleId && { roleId: input.roleId }),
      ...(input.active !== undefined && { active: input.active }),
    },
    include: {
      role: { include: { permissions: true } },
      schoolStaffProfile: true,
    },
  });

  return formatUser(user);
}

export async function deactivateUser(actor: RoleActor, id: string) {
  const existing = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });
  if (!existing) throw AppError.notFound("User not found");
  assertProtectedRoleManageable(actor, existing.role.slug);
  assertNotSelfDeactivation(actor, id);

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { active: false } }),
    prisma.schoolStaff.updateMany({
      where: { userId: id },
      data: { status: "INACTIVE" },
    }),
    prisma.refreshToken.deleteMany({ where: { userId: id } }),
  ]);
}
