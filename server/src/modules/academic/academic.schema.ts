import { z } from "zod";

const dateValue = z.string().or(z.date()).transform((value) => new Date(value));
const datedRange = z.object({ startDate: dateValue, endDate: dateValue }).refine((value) => value.endDate > value.startDate, {
  message: "End date must be after start date",
  path: ["endDate"],
});

export const createAcademicYearSchema = datedRange.and(z.object({
  name: z.string().trim().min(1),
  termCount: z.number().int().min(1).max(4).default(3),
  terms: z.array(datedRange).min(1).max(4).optional(),
}));

export const updateAcademicYearSchema = z.object({
  name: z.string().trim().min(1).optional(),
  startDate: dateValue.optional(),
  endDate: dateValue.optional(),
});

export const updateTermSchema = z.object({
  name: z.string().trim().min(1).optional(),
  startDate: dateValue.optional(),
  endDate: dateValue.optional(),
});

export const transitionTermSchema = z.object({
  status: z.enum(["ACTIVE", "CLOSED"]),
});

export const academicSettingsSchema = z.object({
  defaultTermCount: z.number().int().min(1).max(4),
});

export const schoolProfileSchema = z.object({
  name: z.string().trim().min(1),
  motto: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  logoUrl: z.string().trim().nullable().optional(),
  headteacherName: z.string().trim().nullable().optional(),
  reportFooter: z.string().trim().nullable().optional(),
});

export const createGradeLevelSchema = z.object({
  name: z.string().trim().min(1),
  code: z.string().trim().min(1).max(20),
  order: z.number().int().min(1),
  nextGradeLevelId: z.string().nullable().optional(),
  isFinal: z.boolean().default(false),
});

export const updateGradeLevelSchema = createGradeLevelSchema.partial().extend({ active: z.boolean().optional() });

export const createSectionSchema = z.object({
  academicYearId: z.string().min(1),
  gradeLevelId: z.string().min(1),
  name: z.string().trim().min(1),
  capacity: z.number().int().min(1),
  classTeacherId: z.string().nullable().optional(),
});

export const updateSectionSchema = createSectionSchema.omit({ academicYearId: true }).partial().extend({ active: z.boolean().optional() });

export const createSubjectSchema = z.object({
  name: z.string().trim().min(1),
  code: z.string().trim().min(1).max(20),
  description: z.string().trim().nullable().optional(),
});

export const updateSubjectSchema = createSubjectSchema.partial().extend({ active: z.boolean().optional() });

export const saveCurriculumSchema = z.object({
  subjects: z.array(z.object({
    subjectId: z.string().min(1),
    passMark: z.number().min(0).max(100).default(50),
    sortOrder: z.number().int().min(0).default(0),
  })),
});

export const saveAssessmentSchemeSchema = z.object({
  name: z.string().trim().min(1),
  components: z.array(z.object({
    name: z.string().trim().min(1),
    code: z.string().trim().min(1).max(30),
    maxScore: z.number().positive().max(100),
    sequence: z.number().int().min(1),
  })).min(1).max(6),
  gradeBands: z.array(z.object({
    minScore: z.number().min(0).max(100),
    maxScore: z.number().min(0).max(100),
    grade: z.string().trim().min(1).max(10),
    remark: z.string().trim().min(1),
  })).min(1),
});

export const copyYearStructureSchema = z.object({
  sourceYearId: z.string().min(1),
  copyTermCount: z.boolean().default(false),
});
