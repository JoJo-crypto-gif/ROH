import { z } from "zod";

// Academic Year schemas
export const termInputSchema = z.object({
  name: z.string().min(1, "Term name is required"),
  startDate: z.string().or(z.date()).transform((val) => new Date(val)),
  endDate: z.string().or(z.date()).transform((val) => new Date(val)),
  active: z.boolean().optional().default(false),
}).refine((data) => data.endDate > data.startDate, {
  message: "End date must be after start date",
  path: ["endDate"],
});

export const createAcademicYearSchema = z.object({
  name: z.string().min(1, "Academic year name is required"),
  startDate: z.string().or(z.date()).transform((val) => new Date(val)),
  endDate: z.string().or(z.date()).transform((val) => new Date(val)),
  active: z.boolean().optional().default(false),
  terms: z.array(termInputSchema).min(1, "At least one term is required"),
}).refine((data) => data.endDate > data.startDate, {
  message: "End date must be after start date",
  path: ["endDate"],
});

export const updateAcademicYearSchema = z.object({
  name: z.string().min(1).optional(),
  startDate: z.string().or(z.date()).transform((val) => new Date(val)).optional(),
  endDate: z.string().or(z.date()).transform((val) => new Date(val)).optional(),
  active: z.boolean().optional(),
}).refine((data) => {
  if (data.startDate && data.endDate) return data.endDate > data.startDate;
  return true;
}, {
  message: "End date must be after start date",
  path: ["endDate"],
});

export const updateTermSchema = z.object({
  name: z.string().min(1).optional(),
  startDate: z.string().or(z.date()).transform((val) => new Date(val)).optional(),
  endDate: z.string().or(z.date()).transform((val) => new Date(val)).optional(),
  active: z.boolean().optional(),
}).refine((data) => {
  if (data.startDate && data.endDate) return data.endDate > data.startDate;
  return true;
}, {
  message: "End date must be after start date",
  path: ["endDate"],
});

// ClassRoom schemas
export const createClassRoomSchema = z.object({
  name: z.string().min(1, "Class name is required"),
  level: z.number().int().min(1, "Level must be at least 1"),
  capacity: z.number().int().min(1, "Capacity must be at least 1"),
  teacherId: z.string().nullable().optional(),
});

export const updateClassRoomSchema = createClassRoomSchema.partial();

// Subject schemas
export const createSubjectSchema = z.object({
  name: z.string().min(1, "Subject name is required"),
  code: z.string().min(1, "Subject code is required"),
  teacherIds: z.array(z.string()).optional(),
});

export const updateSubjectSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  teacherIds: z.array(z.string()).optional(),
});

// ClassSubject schema
export const saveClassSubjectsSchema = z.object({
  subjects: z.array(z.object({
    subjectId: z.string().min(1),
    teacherId: z.string().nullable().optional(),
    passMark: z.number().min(0).max(100).default(50),
    weight: z.number().min(0).default(1),
  })),
});
