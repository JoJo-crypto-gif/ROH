-- CreateEnum
CREATE TYPE "CareCentreStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "care_centres" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "opened_at" TIMESTAMP(3),
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT NOT NULL,
    "town" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "capacity" INTEGER NOT NULL,
    "status" "CareCentreStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "care_centres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ngo_audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ngo_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "care_centres_code_key" ON "care_centres"("code");
CREATE UNIQUE INDEX "care_centres_name_key" ON "care_centres"("name");
CREATE INDEX "care_centres_status_name_idx" ON "care_centres"("status", "name");
CREATE INDEX "care_centres_region_district_idx" ON "care_centres"("region", "district");
CREATE INDEX "ngo_audit_logs_entity_type_entity_id_idx" ON "ngo_audit_logs"("entity_type", "entity_id");
CREATE INDEX "ngo_audit_logs_created_at_idx" ON "ngo_audit_logs"("created_at");

ALTER TABLE "ngo_audit_logs" ADD CONSTRAINT "ngo_audit_logs_actor_id_fkey"
FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add the built-in NGO administrator role without changing existing users.
INSERT INTO "roles" ("id", "name", "slug", "description", "built_in", "created_at", "updated_at")
VALUES ('role_ngo_admin', 'NGO Admin', 'ngo-admin', 'Manages NGO care centres and operations.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "built_in" = true,
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" ("role_id", "permission")
SELECT "id", permission
FROM "roles"
CROSS JOIN (VALUES
  ('dashboard.view'),
  ('ngo.view'),
  ('ngo.centres.view'),
  ('ngo.centres.manage')
) AS ngo_permissions(permission)
WHERE "slug" = 'ngo-admin'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission")
SELECT "id", permission
FROM "roles"
CROSS JOIN (VALUES
  ('ngo.view'),
  ('ngo.centres.view'),
  ('ngo.centres.manage')
) AS ngo_permissions(permission)
WHERE "slug" = 'super-admin'
ON CONFLICT DO NOTHING;
