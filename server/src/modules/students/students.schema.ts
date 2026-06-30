import { z } from "zod";

const studentFields = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  gender: z.enum(["M", "F"]),
  dob: z
    .string()
    .or(z.date())
    .transform((value) => new Date(value)),
  avatarUrl: z.string().optional().nullable(),
  avatarBase64: z.string().optional(),
  
  // Primary Guardian
  guardianName: z.string().trim().min(1),
  guardianPhone: z.string().trim().min(1),
  guardianRelation: z.string().trim().min(1),
  guardianEmail: z.string().email().optional().nullable().or(z.literal("")),
  
  // Secondary Guardian
  guardian2Name: z.string().trim().optional().nullable().or(z.literal("")),
  guardian2Phone: z.string().trim().optional().nullable().or(z.literal("")),
  guardian2Relation: z.string().trim().optional().nullable().or(z.literal("")),
  guardian2Email: z.string().email().optional().nullable().or(z.literal("")),
  
  // Emergency Contact
  emergencyName: z.string().trim().optional().nullable().or(z.literal("")),
  emergencyPhone: z.string().trim().optional().nullable().or(z.literal("")),
  emergencyRelation: z.string().trim().optional().nullable().or(z.literal("")),
  
  // Health & Demographics
  bloodGroup: z.string().trim().optional().nullable().or(z.literal("")),
  allergies: z.string().trim().optional().nullable().or(z.literal("")),
  medicalNotes: z.string().trim().optional().nullable().or(z.literal("")),
  boardingStatus: z.enum(["DAY", "BOARDER"]).optional().default("DAY"),
  previousSchool: z.string().trim().optional().nullable().or(z.literal("")),
  
  address: z.string().trim().min(1),
  classSectionId: z.string().min(1).optional(),
  classId: z.string().min(1).optional(),
  feeEffectiveTermId: z.string().min(1).optional(),
});

export const createStudentSchema = studentFields.refine(
  (value) => value.classSectionId || value.classId,
  { message: "Class section is required", path: ["classSectionId"] },
);

export const updateStudentSchema = studentFields.partial().extend({
  status: z
    .enum(["ACTIVE", "GRADUATED", "WITHDRAWN", "TRANSFERRED"])
    .optional(),
});
