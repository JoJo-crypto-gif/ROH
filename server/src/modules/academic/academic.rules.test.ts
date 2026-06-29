import test from "node:test";
import assert from "node:assert/strict";
import { AcademicYearStatus } from "@prisma/client";
import {
  assertAssessmentSchemeEditable,
  assertCurriculumRemovalAllowed,
  assertSectionUpdateAllowed,
  validateAssessmentScheme,
  validateTermRanges,
} from "./academic.service.js";
import { competitionRanks } from "./services/gradebook.service.js";

test("three non-overlapping terms inside an academic year are valid", () => {
  assert.doesNotThrow(() =>
    validateTermRanges(
      new Date("2026-09-01"),
      new Date("2027-07-31"),
      [
        { startDate: new Date("2026-09-01"), endDate: new Date("2026-12-15") },
        { startDate: new Date("2027-01-10"), endDate: new Date("2027-04-10") },
        { startDate: new Date("2027-05-01"), endDate: new Date("2027-07-31") },
      ],
      3,
    ),
  );
});

test("term count and overlap are rejected", () => {
  assert.throws(() =>
    validateTermRanges(
      new Date("2026-01-01"),
      new Date("2026-12-31"),
      [{ startDate: new Date("2026-01-01"), endDate: new Date("2026-03-01") }],
      3,
    ),
  );
  assert.throws(() =>
    validateTermRanges(
      new Date("2026-01-01"),
      new Date("2026-12-31"),
      [
        { startDate: new Date("2026-01-01"), endDate: new Date("2026-06-01") },
        { startDate: new Date("2026-05-01"), endDate: new Date("2026-09-01") },
      ],
      2,
    ),
  );
});

test("assessment components total 100 and grade bands cover 0 through 100", () => {
  assert.doesNotThrow(() =>
    validateAssessmentScheme({
      components: [
        { name: "Class Score", code: "CA", maxScore: 40, sequence: 1 },
        { name: "Exam", code: "EXAM", maxScore: 60, sequence: 2 },
      ],
      gradeBands: [
        { minScore: 0, maxScore: 49.99, grade: "F", remark: "Improve" },
        { minScore: 50, maxScore: 79.99, grade: "B", remark: "Good" },
        { minScore: 80, maxScore: 100, grade: "A", remark: "Excellent" },
      ],
    }),
  );
  assert.throws(() =>
    validateAssessmentScheme({
      components: [
        { name: "Class Score", code: "CA", maxScore: 30, sequence: 1 },
        { name: "Exam", code: "EXAM", maxScore: 60, sequence: 2 },
      ],
      gradeBands: [{ minScore: 0, maxScore: 100, grade: "A", remark: "Any" }],
    }),
  );
});

test("competition ranking produces 1, 2, 2, 4", () => {
  assert.deepEqual(
    competitionRanks([95, 90, 90, 80], (score) => score).map(
      (entry) => entry.rank,
    ),
    [1, 2, 2, 4],
  );
});

test("scored curriculum subjects cannot be removed", () => {
  assert.doesNotThrow(() => assertCurriculumRemovalAllowed(0));
  assert.throws(() => assertCurriculumRemovalAllowed(1), /recorded scores/);
});

test("assessment schemes lock after scores are recorded", () => {
  assert.doesNotThrow(() => assertAssessmentSchemeEditable(false, 0));
  assert.throws(
    () => assertAssessmentSchemeEditable(true, 0),
    /recorded scores/,
  );
  assert.throws(
    () => assertAssessmentSchemeEditable(false, 1),
    /recorded scores/,
  );
});

test("active-year sections allow teacher reassignment but keep structure locked", () => {
  assert.doesNotThrow(() =>
    assertSectionUpdateAllowed(AcademicYearStatus.ACTIVE, ["classTeacherId"]),
  );
  assert.throws(
    () => assertSectionUpdateAllowed(AcademicYearStatus.ACTIVE, ["capacity"]),
    /class-teacher assignment/,
  );
  assert.doesNotThrow(() =>
    assertSectionUpdateAllowed(AcademicYearStatus.DRAFT, ["name", "capacity"]),
  );
  assert.throws(
    () =>
      assertSectionUpdateAllowed(AcademicYearStatus.CLOSED, ["classTeacherId"]),
    /Closed-year sections/,
  );
});
