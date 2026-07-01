import { BeneficiaryGender, BeneficiaryStatus } from "@prisma/client";
import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable();

export const beneficiaryGuardianSchema = z.object({
  name: z.string().trim().min(2).max(120),
  primaryPhone: z.string().trim().min(3).max(40),
  secondaryPhone: optionalText(40),
  relationship: z.string().trim().min(2).max(80),
});

const beneficiaryFields = z.object({
  beneficiaryNo: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(
      /^[A-Za-z0-9/_-]+$/,
      "Use letters, numbers, slashes, underscores and hyphens only",
    ),
  fullName: z.string().trim().min(2).max(160),
  dateOfBirth: z.string().date(),
  gender: z.nativeEnum(BeneficiaryGender),
  admissionDate: z.string().date(),
  careCentreId: z.string().trim().min(1),
  referralSource: z.string().trim().min(2).max(200),
  backgroundSummary: optionalText(5_000),
  educationLevelAtAdmission: optionalText(120),
  currentEducationLevel: optionalText(120),
  schoolName: optionalText(180),
  studentId: z.string().trim().min(1).optional().nullable(),
  healthStatus: z.string().trim().min(2).max(160),
  healthNotes: optionalText(5_000),
  specialNeeds: optionalText(2_000),
  exitDate: z.string().date().optional().nullable(),
  exitReason: optionalText(1_000),
  additionalNotes: optionalText(5_000),
  remarks: optionalText(5_000),
  avatarUrl: z.string().max(500).optional().nullable(),
  avatarBase64: z.string().max(3_000_000).optional(),
  guardians: z.array(beneficiaryGuardianSchema).min(1).max(2),
});

function validateDatesAndExit(
  value: {
    dateOfBirth?: string;
    admissionDate?: string;
    status?: BeneficiaryStatus;
    exitDate?: string | null;
    exitReason?: string | null;
  },
  context: z.RefinementCtx,
) {
  if (value.dateOfBirth && new Date(value.dateOfBirth) > new Date()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dateOfBirth"],
      message: "Date of birth cannot be in the future",
    });
  }
  if (
    value.dateOfBirth &&
    value.admissionDate &&
    new Date(value.admissionDate) < new Date(value.dateOfBirth)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["admissionDate"],
      message: "Admission date cannot be before date of birth",
    });
  }
  if (value.status && value.status !== BeneficiaryStatus.ACTIVE) {
    if (!value.exitDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exitDate"],
        message:
          "Exit date is required for exited or transferred beneficiaries",
      });
    }
    if (!value.exitReason?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exitReason"],
        message:
          "Exit reason is required for exited or transferred beneficiaries",
      });
    }
  }
  if (
    value.exitDate &&
    value.admissionDate &&
    new Date(value.exitDate) < new Date(value.admissionDate)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["exitDate"],
      message: "Exit date cannot be before admission date",
    });
  }
}

export const createBeneficiarySchema = beneficiaryFields
  .extend({
    status: z.nativeEnum(BeneficiaryStatus).default(BeneficiaryStatus.ACTIVE),
  })
  .superRefine(validateDatesAndExit);

export const updateBeneficiarySchema = beneficiaryFields
  .partial()
  .extend({ status: z.nativeEnum(BeneficiaryStatus).optional() });

export const beneficiaryListSchema = z.object({
  search: z.string().trim().max(160).optional(),
  status: z.nativeEnum(BeneficiaryStatus).optional(),
  careCentreId: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export type CreateBeneficiaryInput = z.infer<typeof createBeneficiarySchema>;
export type UpdateBeneficiaryInput = z.infer<typeof updateBeneficiarySchema>;
export type BeneficiaryListInput = z.infer<typeof beneficiaryListSchema>;
