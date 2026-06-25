import { z } from "zod";

export const createStudentSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  gender: z.enum(["M", "F"]),
  dob: z.string().or(z.date()).transform((val) => new Date(val)),
  guardianName: z.string().min(1, "Guardian name is required"),
  guardianPhone: z.string().min(1, "Guardian phone number is required"),
  guardianRelation: z.string().min(1, "Guardian relation is required"),
  guardianEmail: z.string().email().optional().nullable().or(z.literal("")),
  address: z.string().min(1, "Address is required"),
  classId: z.string().min(1, "Class is required"),
});

export const updateStudentSchema = createStudentSchema.partial().extend({
  status: z.enum(["active", "withdrawn", "graduated", "repeating"]).optional(),
});
