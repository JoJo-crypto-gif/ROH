import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDashboardActions,
  determineDashboardFocus,
} from "./dashboard.service.js";

test("teaching scope produces a teaching-focused dashboard", () => {
  assert.equal(
    determineDashboardFocus(
      ["dashboard.view", "attendance.view", "gradebook.view"],
      "ASSIGNED",
    ),
    "TEACHING",
  );
});

test("custom administrative permissions produce an administration focus", () => {
  assert.equal(
    determineDashboardFocus(
      ["dashboard.view", "students.view", "students.create"],
      "ALL",
    ),
    "ADMINISTRATION",
  );
});

test("quick actions include only held write permissions", () => {
  const actions = buildDashboardActions(
    ["attendance.mark", "gradebook.edit", "students.view"],
    {
      hasSections: true,
      attendanceAvailable: true,
      gradebookAvailable: true,
      reportsAvailable: false,
      promotionsAvailable: false,
    },
  );
  assert.deepEqual(
    actions.map((action) => action.id),
    ["mark-attendance", "enter-scores"],
  );
  assert.ok(actions.every((action) => action.enabled));
});

test("section-dependent actions explain why they are unavailable", () => {
  const [action] = buildDashboardActions(["attendance.mark"], {
    hasSections: false,
    attendanceAvailable: false,
    gradebookAvailable: false,
    reportsAvailable: false,
    promotionsAvailable: false,
  });
  assert.equal(action.enabled, false);
  assert.match(action.reason ?? "", /No accessible class section/);
});

test("finance write permissions create real finance workflow actions", () => {
  const actions = buildDashboardActions(
    ["payments.view", "payments.record", "fees.view", "fees.manage"],
    {
      hasSections: false,
      attendanceAvailable: false,
      gradebookAvailable: false,
      reportsAvailable: false,
      promotionsAvailable: false,
    },
  );
  assert.deepEqual(
    actions.map((action) => action.id),
    ["manage-fees", "record-payment"],
  );
});

test("paused accounting permissions do not create dashboard actions", () => {
  const actions = buildDashboardActions(
    ["accounting.view", "expenses.create", "journals.create"],
    {
      hasSections: false,
      attendanceAvailable: false,
      gradebookAvailable: false,
      reportsAvailable: false,
      promotionsAvailable: false,
    },
  );
  assert.deepEqual(actions, []);
});
