CREATE TYPE "BeneficiaryGender" AS ENUM ('MALE', 'FEMALE');
CREATE TYPE "BeneficiaryStatus" AS ENUM ('ACTIVE', 'EXITED', 'TRANSFERRED');

CREATE TABLE "beneficiaries" (
  "id" TEXT NOT NULL,
  "beneficiary_no" TEXT NOT NULL,
  "full_name" TEXT NOT NULL,
  "date_of_birth" TIMESTAMP(3) NOT NULL,
  "gender" "BeneficiaryGender" NOT NULL,
  "admission_date" TIMESTAMP(3) NOT NULL,
  "referral_source" TEXT NOT NULL,
  "background_summary" TEXT,
  "status" "BeneficiaryStatus" NOT NULL DEFAULT 'ACTIVE',
  "education_level_at_admission" TEXT,
  "current_education_level" TEXT,
  "school_name" TEXT,
  "student_id" TEXT,
  "health_status" TEXT NOT NULL,
  "health_notes" TEXT,
  "special_needs" TEXT,
  "exit_date" TIMESTAMP(3),
  "exit_reason" TEXT,
  "additional_notes" TEXT,
  "remarks" TEXT,
  "avatar_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "beneficiaries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "beneficiary_guardians" (
  "id" TEXT NOT NULL,
  "beneficiary_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "primary_phone" TEXT NOT NULL,
  "secondary_phone" TEXT,
  "relationship" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "beneficiary_guardians_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "beneficiary_placements" (
  "id" TEXT NOT NULL,
  "beneficiary_id" TEXT NOT NULL,
  "care_centre_id" TEXT NOT NULL,
  "start_date" TIMESTAMP(3) NOT NULL,
  "end_date" TIMESTAMP(3),
  "end_reason" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "beneficiary_placements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "beneficiaries_beneficiary_no_key" ON "beneficiaries"("beneficiary_no");
CREATE UNIQUE INDEX "beneficiaries_student_id_key" ON "beneficiaries"("student_id");
CREATE INDEX "beneficiaries_status_full_name_idx" ON "beneficiaries"("status", "full_name");
CREATE INDEX "beneficiaries_admission_date_idx" ON "beneficiaries"("admission_date");
CREATE UNIQUE INDEX "beneficiary_guardians_beneficiary_id_sequence_key" ON "beneficiary_guardians"("beneficiary_id", "sequence");
CREATE INDEX "beneficiary_placements_care_centre_id_active_idx" ON "beneficiary_placements"("care_centre_id", "active");
CREATE INDEX "beneficiary_placements_beneficiary_id_start_date_idx" ON "beneficiary_placements"("beneficiary_id", "start_date");
CREATE UNIQUE INDEX "beneficiary_placements_one_active_per_child"
ON "beneficiary_placements"("beneficiary_id") WHERE "active" = true;

ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "beneficiary_guardians" ADD CONSTRAINT "beneficiary_guardians_beneficiary_id_fkey"
FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "beneficiary_placements" ADD CONSTRAINT "beneficiary_placements_beneficiary_id_fkey"
FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "beneficiary_placements" ADD CONSTRAINT "beneficiary_placements_care_centre_id_fkey"
FOREIGN KEY ("care_centre_id") REFERENCES "care_centres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "role_permissions" ("role_id", "permission")
SELECT "id", permission FROM "roles"
CROSS JOIN (VALUES ('ngo.beneficiaries.view'), ('ngo.beneficiaries.manage')) AS beneficiary_permissions(permission)
WHERE "slug" IN ('super-admin', 'ngo-admin')
ON CONFLICT DO NOTHING;
