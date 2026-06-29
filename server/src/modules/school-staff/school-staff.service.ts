import { SchoolStaffCategory, SchoolStaffStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { hashPassword } from "../../lib/password.js";
import { AppError } from "../../lib/errors.js";
import {
  assertNotSelfDeactivation,
  assertProtectedRoleManageable,
  getAssignableRole,
  type RoleActor,
} from "../../lib/role-assignment.js";

interface CreateSchoolStaffInput {
  name: string;
  email: string;
  password: string;
  roleId: string;
  staffNo: string;
  phone?: string | null;
  jobTitle?: string | null;
  category: SchoolStaffCategory;
  status: SchoolStaffStatus;
  joinedAt?: string;
}

interface UpdateSchoolStaffInput {
  name?: string;
  email?: string;
  roleId?: string;
  staffNo?: string;
  phone?: string | null;
  jobTitle?: string | null;
  category?: SchoolStaffCategory;
  status?: SchoolStaffStatus;
  joinedAt?: string;
}

const staffInclude = {
  user: {
    include: {
      role: true,
      sectionsTaught: {
        include: {
          academicYear: { select: { id: true, name: true, status: true } },
          gradeLevel: { select: { id: true, name: true, order: true } },
        },
        orderBy: [
          { academicYear: { startDate: "desc" as const } },
          { name: "asc" as const },
        ],
      },
    },
  },
};

function parseDate(value?: string) {
  return value ? new Date(value) : undefined;
}

function formatSchoolStaff(staff: any) {
  return {
    id: staff.id,
    userId: staff.userId,
    name: staff.user.name,
    email: staff.user.email,
    roleId: staff.user.roleId,
    roleName: staff.user.role.name,
    roleSlug: staff.user.role.slug,
    userActive: staff.user.active,
    staffNo: staff.staffNo,
    phone: staff.phone,
    jobTitle: staff.jobTitle,
    category: staff.category,
    status: staff.status,
    joinedAt: staff.joinedAt,
    assignedSections: staff.user.sectionsTaught.map((section: any) => ({
      id: section.id,
      name: section.name,
      academicYearId: section.academicYearId,
      academicYearName: section.academicYear.name,
      academicYearStatus: section.academicYear.status,
      gradeLevelId: section.gradeLevelId,
      gradeLevelName: section.gradeLevel.name,
    })),
    createdAt: staff.createdAt,
    updatedAt: staff.updatedAt,
  };
}

async function assertUniqueEmail(email: string, exceptUserId?: string) {
  const existing = await prisma.user.findFirst({
    where: {
      email: email.toLowerCase(),
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
  });
  if (existing)
    throw AppError.conflict(
      "A user with this email already exists",
      "EMAIL_EXISTS",
    );
}

async function assertUniqueStaffNo(
  staffNo: string,
  exceptStaffId?: string,
  exceptUserId?: string,
) {
  const [staff, user] = await Promise.all([
    prisma.schoolStaff.findFirst({
      where: {
        staffNo,
        ...(exceptStaffId ? { id: { not: exceptStaffId } } : {}),
      },
    }),
    prisma.user.findFirst({
      where: {
        staffNo,
        ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
      },
    }),
  ]);
  if (staff || user)
    throw AppError.conflict(
      "A staff member with this staff number already exists",
      "STAFF_NO_EXISTS",
    );
}

export async function listSchoolStaff() {
  const staff = await prisma.schoolStaff.findMany({
    include: staffInclude,
    orderBy: [{ status: "asc" }, { user: { name: "asc" } }],
  });
  return staff.map(formatSchoolStaff);
}

export async function getSchoolStaffById(id: string) {
  const staff = await prisma.schoolStaff.findUnique({
    where: { id },
    include: staffInclude,
  });
  if (!staff) throw AppError.notFound("School staff member not found");
  return formatSchoolStaff(staff);
}

export async function createSchoolStaff(
  actor: RoleActor,
  input: CreateSchoolStaffInput,
) {
  await Promise.all([
    getAssignableRole(actor, input.roleId),
    assertUniqueEmail(input.email),
    assertUniqueStaffNo(input.staffNo),
  ]);

  const passwordHash = await hashPassword(input.password);
  const joinedAt = parseDate(input.joinedAt);
  const active = input.status === SchoolStaffStatus.ACTIVE;

  const staff = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash,
        name: input.name,
        roleId: input.roleId,
        active,
        staffNo: input.staffNo,
        phone: input.phone ?? null,
        ...(joinedAt ? { joinedAt } : {}),
      },
    });
    return tx.schoolStaff.create({
      data: {
        userId: user.id,
        staffNo: input.staffNo,
        phone: input.phone ?? null,
        jobTitle: input.jobTitle ?? null,
        category: input.category,
        status: input.status,
        ...(joinedAt ? { joinedAt } : {}),
      },
      include: staffInclude,
    });
  });

  return formatSchoolStaff(staff);
}

export async function updateSchoolStaff(
  actor: RoleActor,
  id: string,
  input: UpdateSchoolStaffInput,
) {
  const existing = await prisma.schoolStaff.findUnique({
    where: { id },
    include: { user: { include: { role: true } } },
  });
  if (!existing) throw AppError.notFound("School staff member not found");
  assertProtectedRoleManageable(actor, existing.user.role.slug);
  if (input.status === SchoolStaffStatus.INACTIVE) {
    assertNotSelfDeactivation(actor, existing.userId);
  }

  await Promise.all([
    input.roleId ? getAssignableRole(actor, input.roleId) : Promise.resolve(),
    input.email
      ? assertUniqueEmail(input.email, existing.userId)
      : Promise.resolve(),
    input.staffNo
      ? assertUniqueStaffNo(input.staffNo, id, existing.userId)
      : Promise.resolve(),
  ]);

  const joinedAt = parseDate(input.joinedAt);
  const active = input.status
    ? input.status === SchoolStaffStatus.ACTIVE
    : undefined;

  const staff = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: existing.userId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.email ? { email: input.email.toLowerCase() } : {}),
        ...(input.roleId ? { roleId: input.roleId } : {}),
        ...(active !== undefined ? { active } : {}),
        ...(input.staffNo ? { staffNo: input.staffNo } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(joinedAt !== undefined ? { joinedAt } : {}),
      },
    });
    if (active === false) {
      await tx.refreshToken.deleteMany({ where: { userId: existing.userId } });
    }
    return tx.schoolStaff.update({
      where: { id },
      data: {
        ...(input.staffNo ? { staffNo: input.staffNo } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
        ...(input.category ? { category: input.category } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(joinedAt !== undefined ? { joinedAt } : {}),
      },
      include: staffInclude,
    });
  });

  return formatSchoolStaff(staff);
}

export async function deactivateSchoolStaff(actor: RoleActor, id: string) {
  const existing = await prisma.schoolStaff.findUnique({
    where: { id },
    include: { user: { include: { role: true } } },
  });
  if (!existing) throw AppError.notFound("School staff member not found");
  assertProtectedRoleManageable(actor, existing.user.role.slug);
  assertNotSelfDeactivation(actor, existing.userId);

  await prisma.$transaction([
    prisma.schoolStaff.update({
      where: { id },
      data: { status: SchoolStaffStatus.INACTIVE },
    }),
    prisma.user.update({
      where: { id: existing.userId },
      data: { active: false },
    }),
    prisma.refreshToken.deleteMany({ where: { userId: existing.userId } }),
  ]);
}
