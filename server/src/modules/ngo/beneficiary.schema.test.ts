import assert from "node:assert/strict";
import test from "node:test";
import { createBeneficiarySchema } from "./beneficiary.schema.js";

const validBeneficiary = {
  beneficiaryNo: "ROH-BEN-001",
  fullName: "Ama Mensah",
  dateOfBirth: "2014-03-12",
  gender: "FEMALE",
  admissionDate: "2025-01-20",
  careCentreId: "centre-id",
  referralSource: "Department of Social Welfare",
  backgroundSummary: "Referred for residential care and family support.",
  healthStatus: "Good",
  guardians: [
    {
      name: "Esi Mensah",
      primaryPhone: "+233200000000",
      secondaryPhone: "+233240000000",
      relationship: "Aunt",
    },
  ],
};

test("beneficiary validation accepts the full active child dossier", () => {
  const parsed = createBeneficiarySchema.parse(validBeneficiary);
  assert.equal(parsed.status, "ACTIVE");
  assert.equal(parsed.guardians.length, 1);
});

test("beneficiary validation allows up to two guardians and two contact numbers", () => {
  const parsed = createBeneficiarySchema.parse({
    ...validBeneficiary,
    guardians: [
      ...validBeneficiary.guardians,
      {
        name: "Kojo Mensah",
        primaryPhone: "+233270000000",
        secondaryPhone: null,
        relationship: "Uncle",
      },
    ],
  });
  assert.equal(parsed.guardians.length, 2);
});

test("exited or transferred beneficiaries require a dated outcome and reason", () => {
  assert.equal(
    createBeneficiarySchema.safeParse({
      ...validBeneficiary,
      status: "EXITED",
    }).success,
    false,
  );
  assert.equal(
    createBeneficiarySchema.safeParse({
      ...validBeneficiary,
      status: "TRANSFERRED",
      exitDate: "2026-06-20",
      exitReason: "Transferred to family-based care",
    }).success,
    true,
  );
});

test("beneficiary validation rejects invalid dates, IDs and missing guardian contact", () => {
  assert.equal(
    createBeneficiarySchema.safeParse({
      ...validBeneficiary,
      beneficiaryNo: "ID with spaces",
    }).success,
    false,
  );
  assert.equal(
    createBeneficiarySchema.safeParse({
      ...validBeneficiary,
      admissionDate: "2010-01-01",
    }).success,
    false,
  );
  assert.equal(
    createBeneficiarySchema.safeParse({
      ...validBeneficiary,
      guardians: [{ ...validBeneficiary.guardians[0], primaryPhone: "" }],
    }).success,
    false,
  );
});
