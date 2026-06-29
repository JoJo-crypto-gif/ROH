-- Expand the legacy staff.manage permission into explicit CRUD permissions.
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT rp."role_id", expanded.permission
FROM "role_permissions" rp
CROSS JOIN (VALUES ('staff.create'), ('staff.update'), ('staff.delete')) AS expanded(permission)
WHERE rp."permission" = 'staff.manage'
ON CONFLICT DO NOTHING;

-- Rename the legacy payments.create permission.
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT rp."role_id", 'payments.record'
FROM "role_permissions" rp
WHERE rp."permission" = 'payments.create'
ON CONFLICT DO NOTHING;

-- Remove permission names that are no longer part of the canonical registry.
DELETE FROM "role_permissions"
WHERE "permission" IN ('staff.manage', 'payments.create', 'calendar.view');
