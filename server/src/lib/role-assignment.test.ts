import test from "node:test";
import assert from "node:assert/strict";
import {
  assertNotSelfDeactivation,
  assertPermissionsGrantable,
  assertProtectedRoleManageable,
  type RoleActor,
} from "./role-assignment.js";

const schoolAdmin: RoleActor = {
  id: "school-admin-1",
  roleSlug: "school-admin",
  permissions: ["staff.create", "staff.update", "gradebook.view"],
};

test("delegated admins can grant only permissions they already hold", () => {
  assert.doesNotThrow(() =>
    assertPermissionsGrantable(schoolAdmin, ["gradebook.view"]),
  );
  assert.throws(
    () => assertPermissionsGrantable(schoolAdmin, ["accounting.view"]),
    /cannot grant permission/,
  );
});

test("only Super Admin can manage Super Admin access", () => {
  assert.throws(
    () => assertProtectedRoleManageable(schoolAdmin, "super-admin"),
    /Only a Super Admin/,
  );
  assert.doesNotThrow(() =>
    assertProtectedRoleManageable(
      { ...schoolAdmin, roleSlug: "super-admin" },
      "super-admin",
    ),
  );
});

test("an administrator cannot deactivate their own account", () => {
  assert.throws(
    () => assertNotSelfDeactivation(schoolAdmin, schoolAdmin.id),
    /your own account/,
  );
  assert.doesNotThrow(() =>
    assertNotSelfDeactivation(schoolAdmin, "another-user"),
  );
});
