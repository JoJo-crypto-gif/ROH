-- Care-centre management is assigned to a system user. The column remains
-- nullable at the database layer so archived history survives user removal;
-- the API requires a manager for every newly created centre.
ALTER TABLE "care_centres" ADD COLUMN "manager_id" TEXT;

CREATE INDEX "care_centres_manager_id_status_idx"
ON "care_centres"("manager_id", "status");

ALTER TABLE "care_centres"
ADD CONSTRAINT "care_centres_manager_id_fkey"
FOREIGN KEY ("manager_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
