import test from "node:test";
import assert from "node:assert/strict";
import { normalizePermissions } from "./roles.service.js";

test("role permission validation rejects unknown permission strings", () => {
  assert.throws(
    () => normalizePermissions(["dashboard.view", "gradebook.typo"]),
    /Unknown permission\(s\): gradebook\.typo/,
  );
});

test("role permission validation removes duplicates", () => {
  assert.deepEqual(
    normalizePermissions(["dashboard.view", "dashboard.view", "students.view"]),
    ["dashboard.view", "students.view"],
  );
});
