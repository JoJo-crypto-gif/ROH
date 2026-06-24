import { prisma } from "../../lib/prisma.js";
import { hashPassword } from "../../lib/password.js";
import { AppError } from "../../lib/errors.js";

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

function formatUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    active: user.active,
    roleId: user.role?.id ?? user.roleId,
    roleName: user.role?.name,
    roleSlug: user.role?.slug,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function listUsers() {
  const users = await prisma.user.findMany({
    include: { role: true },
    orderBy: { createdAt: "desc" },
  });
  return users.map(formatUser);
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      role: { include: { permissions: true } },
    },
  });
  if (!user) throw AppError.notFound("User not found");
  return formatUser(user);
}

export async function createUser(input: CreateUserInput) {
  // Check email uniqueness
  const existing = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });
  if (existing) {
    throw AppError.conflict("A user with this email already exists", "EMAIL_EXISTS");
  }

  // Validate role exists
  const role = await prisma.role.findUnique({ where: { id: input.roleId } });
  if (!role) throw AppError.badRequest("Invalid role ID");

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash,
      name: input.name,
      roleId: input.roleId,
    },
    include: { role: true },
  });

  return formatUser(user);
}

export async function updateUser(id: string, input: UpdateUserInput) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound("User not found");

  if (input.email) {
    const emailTaken = await prisma.user.findFirst({
      where: { email: input.email.toLowerCase(), id: { not: id } },
    });
    if (emailTaken) {
      throw AppError.conflict("A user with this email already exists", "EMAIL_EXISTS");
    }
  }

  if (input.roleId) {
    const role = await prisma.role.findUnique({ where: { id: input.roleId } });
    if (!role) throw AppError.badRequest("Invalid role ID");
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(input.email && { email: input.email.toLowerCase() }),
      ...(input.name && { name: input.name }),
      ...(input.roleId && { roleId: input.roleId }),
      ...(input.active !== undefined && { active: input.active }),
    },
    include: { role: true },
  });

  return formatUser(user);
}

export async function deactivateUser(id: string) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound("User not found");

  await prisma.user.update({
    where: { id },
    data: { active: false },
  });

  // Revoke all sessions
  await prisma.refreshToken.deleteMany({ where: { userId: id } });
}
