import { z } from "zod";

export const createEventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().nullable().optional(),
  startDate: z.string().or(z.date()).transform((val) => new Date(val)),
  endDate: z.string().or(z.date()).transform((val) => new Date(val)),
  type: z.string().min(1, "Type is required"),
  academicYearId: z.string().min(1, "Academic year is required"),
}).refine((data) => data.endDate >= data.startDate, {
  message: "End date must be after or equal to start date",
  path: ["endDate"],
});

export const updateEventSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  startDate: z.string().or(z.date()).transform((val) => new Date(val)).optional(),
  endDate: z.string().or(z.date()).transform((val) => new Date(val)).optional(),
  type: z.string().min(1).optional(),
}).refine((data) => {
  if (data.startDate && data.endDate) return data.endDate >= data.startDate;
  return true;
}, {
  message: "End date must be after or equal to start date",
  path: ["endDate"],
});
