import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";

export async function listEvents(academicYearId: string) {
  return prisma.calendarEvent.findMany({
    where: { academicYearId },
    orderBy: { startDate: "asc" },
  });
}

export async function createEvent(input: {
  title: string;
  description?: string | null;
  startDate: Date;
  endDate: Date;
  type: string;
  academicYearId: string;
}) {
  const academicYear = await prisma.academicYear.findUnique({
    where: { id: input.academicYearId },
  });
  if (!academicYear) {
    throw AppError.notFound("Academic year not found");
  }

  return prisma.calendarEvent.create({
    data: {
      title: input.title,
      description: input.description,
      startDate: input.startDate,
      endDate: input.endDate,
      type: input.type,
      academicYearId: input.academicYearId,
    },
  });
}

export async function updateEvent(
  id: string,
  input: {
    title?: string;
    description?: string | null;
    startDate?: Date;
    endDate?: Date;
    type?: string;
  }
) {
  const existing = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!existing) {
    throw AppError.notFound("Event not found");
  }

  return prisma.calendarEvent.update({
    where: { id },
    data: {
      ...(input.title && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.startDate && { startDate: input.startDate }),
      ...(input.endDate && { endDate: input.endDate }),
      ...(input.type && { type: input.type }),
    },
  });
}

export async function deleteEvent(id: string) {
  const existing = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!existing) {
    throw AppError.notFound("Event not found");
  }
  await prisma.calendarEvent.delete({ where: { id } });
}
