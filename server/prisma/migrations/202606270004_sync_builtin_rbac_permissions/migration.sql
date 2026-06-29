-- Keep built-in school roles aligned with the canonical permission registry.
-- Existing installations predate the explicit receipt-print permission.
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT "id", 'receipts.print'
FROM "roles"
WHERE "slug" IN ('super-admin', 'school-admin', 'bursar')
ON CONFLICT DO NOTHING;

-- Repair legacy development years whose term boundaries extended beyond the year.
UPDATE "academic_years" AS year
SET
  "start_date" = LEAST(year."start_date", bounds."first_term_start"),
  "end_date" = GREATEST(year."end_date", bounds."last_term_end"),
  "updated_at" = CURRENT_TIMESTAMP
FROM (
  SELECT
    "academic_year_id",
    MIN("start_date") AS "first_term_start",
    MAX("end_date") AS "last_term_end"
  FROM "terms"
  GROUP BY "academic_year_id"
) AS bounds
WHERE year."id" = bounds."academic_year_id"
  AND (
    year."start_date" > bounds."first_term_start"
    OR year."end_date" < bounds."last_term_end"
  );
