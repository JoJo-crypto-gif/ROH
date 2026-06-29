import { SchoolStaffCategory, SchoolStaffStatus } from "@prisma/client";
import { z } from "zod";

export const createSchoolStaffSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(6),
  roleId: z.string().min(1),
  staffNo: z.string().trim().min(1),
  phone: z.string().trim().optional().nullable(),
  jobTitle: z.string().trim().optional().nullable(),
  category: z
    .nativeEnum(SchoolStaffCategory)
    .default(SchoolStaffCategory.TEACHING),
  status: z.nativeEnum(SchoolStaffStatus).default(SchoolStaffStatus.ACTIVE),
  joinedAt: z.string().datetime().optional(),
});

export const updateSchoolStaffSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  roleId: z.string().min(1).optional(),
  staffNo: z.string().trim().min(1).optional(),
  phone: z.string().trim().optional().nullable(),
  jobTitle: z.string().trim().optional().nullable(),
  category: z.nativeEnum(SchoolStaffCategory).optional(),
  status: z.nativeEnum(SchoolStaffStatus).optional(),
  joinedAt: z.string().datetime().optional(),
});
