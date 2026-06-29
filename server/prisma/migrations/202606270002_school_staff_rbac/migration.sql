-- CreateEnum
CREATE TYPE "SchoolStaffCategory" AS ENUM ('TEACHING', 'ADMIN', 'SUPPORT');

-- CreateEnum
CREATE TYPE "SchoolStaffStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "school_staff" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "staff_no" TEXT NOT NULL,
    "phone" TEXT,
    "job_title" TEXT,
    "category" "SchoolStaffCategory" NOT NULL DEFAULT 'TEACHING',
    "status" "SchoolStaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_staff_pkey" PRIMARY KEY ("id")
);

-- Backfill existing school-related users into school staff profiles.
INSERT INTO "school_staff" (
    "id",
    "user_id",
    "staff_no",
    "phone",
    "job_title",
    "category",
    "status",
    "joined_at",
    "created_at",
    "updated_at"
)
SELECT
    concat('schoolstaff_', substring(md5(random()::text || clock_timestamp()::text), 1, 18)),
    u."id",
    COALESCE(u."staff_no", concat('STAFF-', substring(u."id", 1, 8))),
    u."phone",
    r."name",
    CASE
        WHEN r."slug" = 'teacher' THEN 'TEACHING'::"SchoolStaffCategory"
        ELSE 'ADMIN'::"SchoolStaffCategory"
    END,
    CASE
        WHEN u."active" THEN 'ACTIVE'::"SchoolStaffStatus"
        ELSE 'INACTIVE'::"SchoolStaffStatus"
    END,
    COALESCE(u."joined_at", now()),
    now(),
    now()
FROM "users" u
JOIN "roles" r ON r."id" = u."role_id"
WHERE r."slug" IN ('super-admin', 'school-admin', 'principal', 'teacher', 'bursar', 'admissions')
ON CONFLICT DO NOTHING;

-- CreateIndex
CREATE UNIQUE INDEX "school_staff_user_id_key" ON "school_staff"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_staff_staff_no_key" ON "school_staff"("staff_no");

-- CreateIndex
CREATE INDEX "school_staff_category_status_idx" ON "school_staff"("category", "status");

-- AddForeignKey
ALTER TABLE "school_staff" ADD CONSTRAINT "school_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
