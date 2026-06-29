import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessSection,
  resolveAcademicAccessScope,
} from "./access.service.js";

test("school-wide academic roles can access any section", () => {
  assert.equal(canAccessSection("super-admin", "admin", "teacher-a"), true);
  assert.equal(canAccessSection("school-admin", "admin", "teacher-a"), true);
  assert.equal(canAccessSection("principal", "head", "teacher-a"), true);
});

test("non-wide roles can access only sections assigned to their user", () => {
  assert.equal(canAccessSection("teacher", "teacher-a", "teacher-a"), true);
  assert.equal(canAccessSection("teacher", "teacher-a", "teacher-b"), false);
  assert.equal(
    canAccessSection("custom-teaching-role", "teacher-a", null),
    false,
  );
});

test("custom school roles derive scope from the active staff category", () => {
  assert.equal(
    resolveAcademicAccessScope("custom-teacher", {
      category: "TEACHING",
      status: "ACTIVE",
    }),
    "ASSIGNED",
  );
  assert.equal(
    resolveAcademicAccessScope("custom-office-role", {
      category: "SUPPORT",
      status: "ACTIVE",
    }),
    "ALL",
  );
  assert.equal(resolveAcademicAccessScope("custom-role", null), "NONE");
});
