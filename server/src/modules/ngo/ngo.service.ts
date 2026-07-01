import { CareCentreStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import type {
  CareCentreListInput,
  CreateCareCentreInput,
  UpdateCareCentreInput,
} from "./ngo.schema.js";

type Actor = { id: string };

const centreInclude = {
  manager: {
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      role: { select: { name: true, slug: true } },
    },
  },
  _count: { select: { beneficiaryPlacements: { where: { active: true } } } },
} satisfies Prisma.CareCentreInclude;

type CentreWithManager = Prisma.CareCentreGetPayload<{
  include: typeof centreInclude;
}>;

function formatCentre(centre: CentreWithManager) {
  const { _count, ...data } = centre;
  return {
    ...data,
    latitude: centre.latitude?.toNumber() ?? null,
    longitude: centre.longitude?.toNumber() ?? null,
    manager: centre.manager
      ? {
          id: centre.manager.id,
          name: centre.manager.name,
          email: centre.manager.email,
          active: centre.manager.active,
          roleName: centre.manager.role.name,
          roleSlug: centre.manager.role.slug,
        }
      : null,
    currentOccupancy: _count.beneficiaryPlacements,
  };
}

function normalizedCreateData(
  input: CreateCareCentreInput,
): Prisma.CareCentreCreateInput {
  const { managerId, ...centre } = input;
  return {
    ...centre,
    code: input.code.toUpperCase(),
    openedAt: input.openedAt
      ? new Date(`${input.openedAt}T00:00:00.000Z`)
      : null,
    manager: { connect: { id: managerId } },
  };
}

function normalizedUpdateData(
  input: UpdateCareCentreInput,
): Prisma.CareCentreUpdateInput {
  const { managerId, ...centre } = input;
  const data: Prisma.CareCentreUpdateInput = { ...centre };
  if (input.code !== undefined) data.code = input.code.toUpperCase();
  if (input.openedAt !== undefined) {
    data.openedAt = input.openedAt
      ? new Date(`${input.openedAt}T00:00:00.000Z`)
      : null;
  }
  if (managerId !== undefined) data.manager = { connect: { id: managerId } };
  return data;
}

async function assertEligibleManager(managerId: string) {
  const manager = await prisma.user.findFirst({
    where: {
      id: managerId,
      active: true,
      role: {
        permissions: {
          some: { permission: "ngo.centres.manage" },
        },
      },
    },
    select: { id: true },
  });
  if (!manager) {
    throw AppError.badRequest(
      "Centre manager must be an active user with NGO centre management access",
      "INVALID_CENTRE_MANAGER",
    );
  }
}

export async function listCentreManagers() {
  const managers = await prisma.user.findMany({
    where: {
      active: true,
      role: {
        permissions: {
          some: { permission: "ngo.centres.manage" },
        },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: { select: { name: true, slug: true } },
    },
    orderBy: { name: "asc" },
  });
  return managers.map((manager) => ({
    id: manager.id,
    name: manager.name,
    email: manager.email,
    roleName: manager.role.name,
    roleSlug: manager.role.slug,
  }));
}

async function assertUniqueCentre(
  input: { code?: string; name?: string },
  exceptId?: string,
) {
  const conditions: Prisma.CareCentreWhereInput[] = [];
  if (input.code)
    conditions.push({
      code: { equals: input.code.toUpperCase(), mode: "insensitive" },
    });
  if (input.name)
    conditions.push({ name: { equals: input.name, mode: "insensitive" } });
  if (!conditions.length) return;

  const existing = await prisma.careCentre.findFirst({
    where: {
      ...(exceptId ? { id: { not: exceptId } } : {}),
      OR: conditions,
    },
  });
  if (!existing) return;
  if (input.code && existing.code.toLowerCase() === input.code.toLowerCase()) {
    throw AppError.conflict(
      "A centre with this code already exists",
      "CENTRE_CODE_EXISTS",
    );
  }
  throw AppError.conflict(
    "A centre with this name already exists",
    "CENTRE_NAME_EXISTS",
  );
}

export async function getNgoOverview() {
  const [activeCentres, inactiveCentres, capacity, activeBeneficiaries] =
    await Promise.all([
      prisma.careCentre.count({ where: { status: CareCentreStatus.ACTIVE } }),
      prisma.careCentre.count({ where: { status: CareCentreStatus.INACTIVE } }),
      prisma.careCentre.aggregate({
        where: { status: CareCentreStatus.ACTIVE },
        _sum: { capacity: true },
      }),
      prisma.beneficiary.count({ where: { status: "ACTIVE" } }),
    ]);
  return {
    activeCentres,
    inactiveCentres,
    totalCapacity: capacity._sum.capacity ?? 0,
    currentOccupancy: activeBeneficiaries,
    activeBeneficiaries,
  };
}

export async function listCareCentres(input: CareCentreListInput) {
  const where: Prisma.CareCentreWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.search
      ? {
          OR: ["code", "name", "town", "district", "region"].map((field) => ({
            [field]: { contains: input.search, mode: "insensitive" },
          })),
        }
      : {}),
  };
  const total = await prisma.careCentre.count({ where });
  const totalPages = total === 0 ? 0 : Math.ceil(total / input.pageSize);
  const page = totalPages === 0 ? 1 : Math.min(input.page, totalPages);
  const centres = await prisma.careCentre.findMany({
    where,
    include: centreInclude,
    orderBy: [{ status: "asc" }, { name: "asc" }],
    skip: (page - 1) * input.pageSize,
    take: input.pageSize,
  });
  return {
    centres: centres.map(formatCentre),
    pagination: { page, pageSize: input.pageSize, total, totalPages },
  };
}

export async function getCareCentre(id: string) {
  const centre = await prisma.careCentre.findUnique({
    where: { id },
    include: centreInclude,
  });
  if (!centre) throw AppError.notFound("Care centre not found");
  return formatCentre(centre);
}

export async function createCareCentre(
  actor: Actor,
  input: CreateCareCentreInput,
) {
  await Promise.all([
    assertUniqueCentre(input),
    assertEligibleManager(input.managerId),
  ]);
  const centre = await prisma.$transaction(async (tx) => {
    const created = await tx.careCentre.create({
      data: normalizedCreateData(input),
      include: centreInclude,
    });
    await tx.ngoAuditLog.create({
      data: {
        actorId: actor.id,
        action: "CENTRE_CREATED",
        entityType: "CARE_CENTRE",
        entityId: created.id,
        metadata: {
          code: created.code,
          name: created.name,
          managerId: input.managerId,
        },
      },
    });
    return created;
  });
  return formatCentre(centre);
}

export async function updateCareCentre(
  actor: Actor,
  id: string,
  input: UpdateCareCentreInput,
) {
  const existing = await prisma.careCentre.findUnique({
    where: { id },
    include: centreInclude,
  });
  if (!existing) throw AppError.notFound("Care centre not found");
  const activeOccupancy = existing._count.beneficiaryPlacements;
  if (input.capacity !== undefined && input.capacity < activeOccupancy) {
    throw AppError.conflict(
      `Capacity cannot be lower than the ${activeOccupancy} children currently placed here`,
      "CENTRE_CAPACITY_BELOW_OCCUPANCY",
    );
  }
  if (input.status === CareCentreStatus.INACTIVE && activeOccupancy > 0) {
    throw AppError.conflict(
      "Move, exit or transfer active beneficiaries before deactivating this centre",
      "CENTRE_HAS_ACTIVE_BENEFICIARIES",
    );
  }
  await Promise.all([
    assertUniqueCentre(input, id),
    input.managerId
      ? assertEligibleManager(input.managerId)
      : Promise.resolve(),
  ]);
  const centre = await prisma.$transaction(async (tx) => {
    const updated = await tx.careCentre.update({
      where: { id },
      data: normalizedUpdateData(input),
      include: centreInclude,
    });
    await tx.ngoAuditLog.create({
      data: {
        actorId: actor.id,
        action: "CENTRE_UPDATED",
        entityType: "CARE_CENTRE",
        entityId: id,
        metadata: {
          fields: Object.keys(input),
          previousStatus: existing.status,
          previousManagerId: existing.managerId,
          managerId: input.managerId ?? existing.managerId,
        },
      },
    });
    return updated;
  });
  return formatCentre(centre);
}

export async function deactivateCareCentre(actor: Actor, id: string) {
  const existing = await prisma.careCentre.findUnique({
    where: { id },
    include: centreInclude,
  });
  if (!existing) throw AppError.notFound("Care centre not found");
  if (existing.status === CareCentreStatus.INACTIVE)
    return formatCentre(existing);
  if (existing._count.beneficiaryPlacements > 0) {
    throw AppError.conflict(
      "Move, exit or transfer active beneficiaries before deactivating this centre",
      "CENTRE_HAS_ACTIVE_BENEFICIARIES",
    );
  }
  const centre = await prisma.$transaction(async (tx) => {
    const updated = await tx.careCentre.update({
      where: { id },
      data: { status: CareCentreStatus.INACTIVE },
      include: centreInclude,
    });
    await tx.ngoAuditLog.create({
      data: {
        actorId: actor.id,
        action: "CENTRE_DEACTIVATED",
        entityType: "CARE_CENTRE",
        entityId: id,
        metadata: { code: existing.code, name: existing.name },
      },
    });
    return updated;
  });
  return formatCentre(centre);
}
