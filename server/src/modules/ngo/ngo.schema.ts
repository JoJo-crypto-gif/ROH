import { CareCentreStatus } from "@prisma/client";
import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable();

const coordinates = {
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
};

function coordinatesAreComplete(value: {
  latitude?: number | null;
  longitude?: number | null;
}) {
  return (value.latitude == null) === (value.longitude == null);
}

export const careCentreListSchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.nativeEnum(CareCentreStatus).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export const createCareCentreSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(20)
      .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and hyphens only"),
    name: z.string().trim().min(2).max(120),
    managerId: z.string().trim().min(1, "Select a centre manager"),
    description: optionalText(1_000),
    openedAt: z.string().date().optional().nullable(),
    phone: optionalText(40),
    email: z.string().trim().email().optional().nullable(),
    address: z.string().trim().min(3).max(240),
    town: z.string().trim().min(2).max(100),
    district: z.string().trim().min(2).max(100),
    region: z.string().trim().min(2).max(100),
    ...coordinates,
    capacity: z.coerce.number().int().positive().max(10_000),
    status: z.nativeEnum(CareCentreStatus).default(CareCentreStatus.ACTIVE),
  })
  .refine(coordinatesAreComplete, {
    message: "Latitude and longitude must be supplied together",
    path: ["latitude"],
  });

export const updateCareCentreSchema = createCareCentreSchema
  .innerType()
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  })
  .refine(coordinatesAreComplete, {
    message: "Latitude and longitude must be supplied together",
    path: ["latitude"],
  });

export type CareCentreListInput = z.infer<typeof careCentreListSchema>;
export type CreateCareCentreInput = z.infer<typeof createCareCentreSchema>;
export type UpdateCareCentreInput = z.infer<typeof updateCareCentreSchema>;
