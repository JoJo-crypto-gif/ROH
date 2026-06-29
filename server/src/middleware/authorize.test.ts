import test from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { authorize } from "./authorize.js";
import { AppError } from "../lib/errors.js";

function runAuthorization(permissions: string[], required: string) {
  const request = {
    user: {
      id: "teacher-1",
      email: "teacher@example.com",
      name: "Teacher",
      roleId: "teacher-role",
      roleSlug: "teacher",
      permissions,
    },
  } as Request;
  let outcome: unknown;
  const next = ((error?: unknown) => {
    outcome = error ?? "allowed";
  }) as NextFunction;
  authorize(required)(request, {} as Response, next);
  return outcome;
}

test("permission middleware allows a held permission", () => {
  assert.equal(
    runAuthorization(["gradebook.view", "gradebook.edit"], "gradebook.edit"),
    "allowed",
  );
});

test("permission middleware rejects a removed permission", () => {
  const outcome = runAuthorization(["gradebook.view"], "gradebook.edit");
  assert.ok(outcome instanceof AppError);
  assert.equal(outcome.statusCode, 403);
  assert.match(outcome.message, /gradebook.edit/);
});
