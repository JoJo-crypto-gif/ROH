import {
  AcademicYearStatus,
  BeneficiaryStatus,
  EnrollmentStatus,
  Prisma,
  StudentStatus,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import type {
  BeneficiaryListInput,
  CreateBeneficiaryInput,
  UpdateBeneficiaryInput,
} from "./beneficiary.schema.js";

type Actor = { id: string };

const beneficiaryInclude = {
  guardians: { orderBy: { sequence: "asc" as const } },
  placements: {
    include: {
      careCentre: {
        select: { id: true, code: true, name: true, status: true },
      },
    },
    orderBy: { startDate: "desc" as const },
  },
  student: {
    include: {
      enrolments: {
        where: {
          status: EnrollmentStatus.ACTIVE,
          academicYear: { status: AcademicYearStatus.ACTIVE },
        },
        include: {
          academicYear: { select: { id: true, name: true } },
          classSection: {
            select: {
              id: true,
              name: true,
              gradeLevel: { select: { id: true, name: true } },
            },
          },
        },
        take: 1,
      },
    },
  },
} satisfies Prisma.BeneficiaryInclude;

type BeneficiaryWithRelations = Prisma.BeneficiaryGetPayload<{
  include: typeof beneficiaryInclude;
}>;

function dateOnly(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatBeneficiary(beneficiary: BeneficiaryWithRelations) {
  const enrolment = beneficiary.student?.enrolments[0] ?? null;
  const currentPlacement =
    beneficiary.placements.find((placement) => placement.active) ?? null;
  return {
    ...beneficiary,
    dateOfBirth: dateOnly(beneficiary.dateOfBirth),
    admissionDate: dateOnly(beneficiary.admissionDate),
    exitDate: dateOnly(beneficiary.exitDate),
    guardians: beneficiary.guardians.map((guardian) => ({
      id: guardian.id,
      name: guardian.name,
      primaryPhone: guardian.primaryPhone,
      secondaryPhone: guardian.secondaryPhone,
      relationship: guardian.relationship,
      sequence: guardian.sequence,
    })),
    currentPlacement: currentPlacement
      ? {
          id: currentPlacement.id,
          careCentre: currentPlacement.careCentre,
          startDate: dateOnly(currentPlacement.startDate),
        }
      : null,
    placementHistory: beneficiary.placements.map((placement) => ({
      id: placement.id,
      careCentre: placement.careCentre,
      startDate: dateOnly(placement.startDate),
      endDate: dateOnly(placement.endDate),
      endReason: placement.endReason,
      active: placement.active,
    })),
    linkedStudent: beneficiary.student
      ? {
          id: beneficiary.student.id,
          admissionNo: beneficiary.student.admissionNo,
          fullName: `${beneficiary.student.firstName} ${beneficiary.student.lastName}`,
          status: beneficiary.student.status,
          currentClass: enrolment
            ? {
                academicYear: enrolment.academicYear.name,
                gradeLevel: enrolment.classSection.gradeLevel.name,
                section: enrolment.classSection.name,
              }
            : null,
        }
      : null,
  };
}

function assertLifecycle(value: {
  dateOfBirth: string;
  admissionDate: string;
  status: BeneficiaryStatus;
  exitDate?: string | null;
  exitReason?: string | null;
}) {
  const dob = parseDate(value.dateOfBirth);
  const admission = parseDate(value.admissionDate);
  if (dob > new Date())
    throw AppError.badRequest("Date of birth cannot be in the future");
  if (admission < dob)
    throw AppError.badRequest("Admission date cannot be before date of birth");
  if (value.status !== BeneficiaryStatus.ACTIVE) {
    if (!value.exitDate || !value.exitReason?.trim()) {
      throw AppError.badRequest(
        "Exit date and reason are required when a beneficiary exits or transfers",
        "BENEFICIARY_EXIT_DETAILS_REQUIRED",
      );
    }
    if (parseDate(value.exitDate) < admission) {
      throw AppError.badRequest("Exit date cannot be before admission date");
    }
  }
}

async function assertUniqueBeneficiaryNo(value: string, exceptId?: string) {
  const existing = await prisma.beneficiary.findFirst({
    where: {
      beneficiaryNo: { equals: value.toUpperCase(), mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw AppError.conflict(
      "A beneficiary with this special ID already exists",
      "BENEFICIARY_ID_EXISTS",
    );
  }
}

async function assertStudentAvailable(
  studentId: string | null | undefined,
  exceptId?: string,
) {
  if (!studentId) return;
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { beneficiary: { select: { id: true } } },
  });
  if (!student)
    throw AppError.badRequest("Linked school student was not found");
  if (student.beneficiary && student.beneficiary.id !== exceptId) {
    throw AppError.conflict(
      "This school student is already linked to another beneficiary",
      "STUDENT_ALREADY_LINKED",
    );
  }
}

async function assertCentreCapacity(
  careCentreId: string,
  excludeBeneficiaryId?: string,
) {
  const centre = await prisma.careCentre.findUnique({
    where: { id: careCentreId },
    include: {
      _count: {
        select: {
          beneficiaryPlacements: {
            where: {
              active: true,
              ...(excludeBeneficiaryId
                ? { beneficiaryId: { not: excludeBeneficiaryId } }
                : {}),
            },
          },
        },
      },
    },
  });
  if (!centre || centre.status !== "ACTIVE") {
    throw AppError.badRequest("Select an active care centre");
  }
  if (centre._count.beneficiaryPlacements >= centre.capacity) {
    throw AppError.conflict(
      "This care centre has reached its child capacity",
      "CENTRE_FULL",
    );
  }
}

export async function listBeneficiaryOptions() {
  const [centres, students, schoolProfile] = await Promise.all([
    prisma.careCentre.findMany({
      where: { status: "ACTIVE" },
      include: {
        _count: {
          select: { beneficiaryPlacements: { where: { active: true } } },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.student.findMany({
      where: { status: StudentStatus.ACTIVE },
      include: {
        beneficiary: { select: { id: true } },
        enrolments: {
          where: {
            status: EnrollmentStatus.ACTIVE,
            academicYear: { status: AcademicYearStatus.ACTIVE },
          },
          include: {
            classSection: { include: { gradeLevel: true } },
          },
          take: 1,
        },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    prisma.schoolProfile.findUnique({ where: { id: "default" } }),
  ]);
  return {
    centres: centres.map((centre) => ({
      id: centre.id,
      code: centre.code,
      name: centre.name,
      capacity: centre.capacity,
      currentOccupancy: centre._count.beneficiaryPlacements,
    })),
    students: students.map((student) => {
      const enrolment = student.enrolments[0] ?? null;
      return {
        id: student.id,
        admissionNo: student.admissionNo,
        fullName: `${student.firstName} ${student.lastName}`,
        dateOfBirth: dateOnly(student.dob),
        gender: student.gender,
        currentEducationLevel: enrolment?.classSection.gradeLevel.name ?? null,
        currentClass: enrolment?.classSection.name ?? null,
        schoolName: schoolProfile?.name ?? "Lumen School",
        linkedBeneficiaryId: student.beneficiary?.id ?? null,
      };
    }),
  };
}

export async function listBeneficiaries(input: BeneficiaryListInput) {
  const where: Prisma.BeneficiaryWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.careCentreId
      ? {
          placements: {
            some: { careCentreId: input.careCentreId, active: true },
          },
        }
      : {}),
    ...(input.search
      ? {
          OR: [
            { beneficiaryNo: { contains: input.search, mode: "insensitive" } },
            { fullName: { contains: input.search, mode: "insensitive" } },
            { referralSource: { contains: input.search, mode: "insensitive" } },
            { schoolName: { contains: input.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const total = await prisma.beneficiary.count({ where });
  const totalPages = total === 0 ? 0 : Math.ceil(total / input.pageSize);
  const page = totalPages === 0 ? 1 : Math.min(input.page, totalPages);
  const beneficiaries = await prisma.beneficiary.findMany({
    where,
    include: beneficiaryInclude,
    orderBy: [{ status: "asc" }, { fullName: "asc" }],
    skip: (page - 1) * input.pageSize,
    take: input.pageSize,
  });
  return {
    beneficiaries: beneficiaries.map(formatBeneficiary),
    pagination: { page, pageSize: input.pageSize, total, totalPages },
  };
}

export async function getBeneficiary(id: string) {
  const beneficiary = await prisma.beneficiary.findUnique({
    where: { id },
    include: beneficiaryInclude,
  });
  if (!beneficiary) throw AppError.notFound("Beneficiary not found");
  return formatBeneficiary(beneficiary);
}

export async function createBeneficiary(
  actor: Actor,
  input: CreateBeneficiaryInput,
) {
  assertLifecycle(input);
  await Promise.all([
    assertUniqueBeneficiaryNo(input.beneficiaryNo),
    assertStudentAvailable(input.studentId),
    assertCentreCapacity(input.careCentreId),
  ]);
  const active = input.status === BeneficiaryStatus.ACTIVE;
  const beneficiary = await prisma.$transaction(async (tx) => {
    const created = await tx.beneficiary.create({
      data: {
        beneficiaryNo: input.beneficiaryNo.toUpperCase(),
        fullName: input.fullName,
        dateOfBirth: parseDate(input.dateOfBirth),
        gender: input.gender,
        admissionDate: parseDate(input.admissionDate),
        referralSource: input.referralSource,
        backgroundSummary: input.backgroundSummary ?? null,
        status: input.status,
        educationLevelAtAdmission: input.educationLevelAtAdmission ?? null,
        currentEducationLevel: input.currentEducationLevel ?? null,
        schoolName: input.schoolName ?? null,
        studentId: input.studentId ?? null,
        healthStatus: input.healthStatus,
        healthNotes: input.healthNotes ?? null,
        specialNeeds: input.specialNeeds ?? null,
        exitDate: input.exitDate ? parseDate(input.exitDate) : null,
        exitReason: input.exitReason ?? null,
        additionalNotes: input.additionalNotes ?? null,
        remarks: input.remarks ?? null,
        avatarUrl: input.avatarUrl ?? null,
        guardians: {
          create: input.guardians.map((guardian, index) => ({
            ...guardian,
            secondaryPhone: guardian.secondaryPhone || null,
            sequence: index + 1,
          })),
        },
        placements: {
          create: {
            careCentreId: input.careCentreId,
            startDate: parseDate(input.admissionDate),
            active,
            endDate: active ? null : parseDate(input.exitDate!),
            endReason: active ? null : input.exitReason,
          },
        },
      },
      include: beneficiaryInclude,
    });
    await tx.ngoAuditLog.create({
      data: {
        actorId: actor.id,
        action: "BENEFICIARY_CREATED",
        entityType: "BENEFICIARY",
        entityId: created.id,
        metadata: {
          beneficiaryNo: created.beneficiaryNo,
          careCentreId: input.careCentreId,
          studentId: input.studentId ?? null,
        },
      },
    });
    return created;
  });
  return formatBeneficiary(beneficiary);
}

export async function updateBeneficiary(
  actor: Actor,
  id: string,
  input: UpdateBeneficiaryInput,
) {
  const existing = await prisma.beneficiary.findUnique({
    where: { id },
    include: beneficiaryInclude,
  });
  if (!existing) throw AppError.notFound("Beneficiary not found");
  const combined = {
    dateOfBirth: input.dateOfBirth ?? dateOnly(existing.dateOfBirth)!,
    admissionDate: input.admissionDate ?? dateOnly(existing.admissionDate)!,
    status: input.status ?? existing.status,
    exitDate:
      input.exitDate !== undefined
        ? input.exitDate
        : dateOnly(existing.exitDate),
    exitReason:
      input.exitReason !== undefined ? input.exitReason : existing.exitReason,
  };
  assertLifecycle(combined);
  const currentPlacement =
    existing.placements.find((placement) => placement.active) ?? null;
  const targetCentreId = input.careCentreId ?? currentPlacement?.careCentreId;
  const becomingActive = combined.status === BeneficiaryStatus.ACTIVE;
  const centreChanged = Boolean(
    becomingActive &&
    targetCentreId &&
    currentPlacement &&
    targetCentreId !== currentPlacement.careCentreId,
  );
  if (becomingActive && !targetCentreId) {
    throw AppError.badRequest(
      "An active beneficiary must have a care centre",
      "BENEFICIARY_CENTRE_REQUIRED",
    );
  }
  await Promise.all([
    input.beneficiaryNo
      ? assertUniqueBeneficiaryNo(input.beneficiaryNo, id)
      : Promise.resolve(),
    input.studentId !== undefined
      ? assertStudentAvailable(input.studentId, id)
      : Promise.resolve(),
    becomingActive && targetCentreId && (!currentPlacement || centreChanged)
      ? assertCentreCapacity(targetCentreId, id)
      : Promise.resolve(),
  ]);
  const beneficiary = await prisma.$transaction(async (tx) => {
    if (input.guardians) {
      await tx.beneficiaryGuardian.deleteMany({ where: { beneficiaryId: id } });
      await tx.beneficiaryGuardian.createMany({
        data: input.guardians.map((guardian, index) => ({
          beneficiaryId: id,
          ...guardian,
          secondaryPhone: guardian.secondaryPhone || null,
          sequence: index + 1,
        })),
      });
    }
    if (currentPlacement && (!becomingActive || centreChanged)) {
      await tx.beneficiaryPlacement.update({
        where: { id: currentPlacement.id },
        data: {
          active: false,
          endDate: becomingActive ? new Date() : parseDate(combined.exitDate!),
          endReason: becomingActive
            ? "Transferred to another care centre"
            : combined.exitReason,
        },
      });
    }
    if (
      becomingActive &&
      targetCentreId &&
      (!currentPlacement || centreChanged)
    ) {
      await tx.beneficiaryPlacement.create({
        data: {
          beneficiaryId: id,
          careCentreId: targetCentreId,
          startDate: new Date(),
          active: true,
        },
      });
    }
    const updated = await tx.beneficiary.update({
      where: { id },
      data: {
        ...(input.beneficiaryNo
          ? { beneficiaryNo: input.beneficiaryNo.toUpperCase() }
          : {}),
        ...(input.fullName ? { fullName: input.fullName } : {}),
        ...(input.dateOfBirth
          ? { dateOfBirth: parseDate(input.dateOfBirth) }
          : {}),
        ...(input.gender ? { gender: input.gender } : {}),
        ...(input.admissionDate
          ? { admissionDate: parseDate(input.admissionDate) }
          : {}),
        ...(input.referralSource
          ? { referralSource: input.referralSource }
          : {}),
        ...(input.backgroundSummary !== undefined
          ? { backgroundSummary: input.backgroundSummary || null }
          : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.educationLevelAtAdmission !== undefined
          ? {
              educationLevelAtAdmission:
                input.educationLevelAtAdmission || null,
            }
          : {}),
        ...(input.currentEducationLevel !== undefined
          ? { currentEducationLevel: input.currentEducationLevel || null }
          : {}),
        ...(input.schoolName !== undefined
          ? { schoolName: input.schoolName || null }
          : {}),
        ...(input.studentId !== undefined
          ? { studentId: input.studentId || null }
          : {}),
        ...(input.healthStatus ? { healthStatus: input.healthStatus } : {}),
        ...(input.healthNotes !== undefined
          ? { healthNotes: input.healthNotes || null }
          : {}),
        ...(input.specialNeeds !== undefined
          ? { specialNeeds: input.specialNeeds || null }
          : {}),
        exitDate: becomingActive ? null : parseDate(combined.exitDate!),
        exitReason: becomingActive ? null : combined.exitReason,
        ...(input.additionalNotes !== undefined
          ? { additionalNotes: input.additionalNotes || null }
          : {}),
        ...(input.remarks !== undefined
          ? { remarks: input.remarks || null }
          : {}),
        ...(input.avatarUrl !== undefined
          ? { avatarUrl: input.avatarUrl || null }
          : {}),
      },
      include: beneficiaryInclude,
    });
    await tx.ngoAuditLog.create({
      data: {
        actorId: actor.id,
        action:
          existing.status !== updated.status
            ? "BENEFICIARY_STATUS_CHANGED"
            : "BENEFICIARY_UPDATED",
        entityType: "BENEFICIARY",
        entityId: id,
        metadata: {
          fields: Object.keys(input).filter(
            (field) => field !== "avatarBase64",
          ),
          previousStatus: existing.status,
          status: updated.status,
          previousCentreId: currentPlacement?.careCentreId ?? null,
          careCentreId: targetCentreId ?? null,
        },
      },
    });
    return updated;
  });
  return formatBeneficiary(beneficiary);
}
