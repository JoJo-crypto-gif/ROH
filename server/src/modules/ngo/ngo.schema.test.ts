import assert from "node:assert/strict";
import test from "node:test";
import { createCareCentreSchema } from "./ngo.schema.js";

const validCentre = {
  code: "ROH-01",
  name: "Hope Care Centre",
  managerId: "manager-user-id",
  description: "Residential child-care centre",
  openedAt: "2024-01-15",
  phone: "+233 20 000 0000",
  email: "centre@example.org",
  address: "GA-123-4567, Community Road",
  town: "Accra",
  district: "Ablekuma West Municipal",
  region: "Greater Accra",
  latitude: 5.6037,
  longitude: -0.187,
  capacity: 80,
};

test("care centre validation accepts a complete address, GPS and positive capacity", () => {
  const parsed = createCareCentreSchema.parse(validCentre);
  assert.equal(parsed.capacity, 80);
  assert.equal(parsed.status, "ACTIVE");
});

test("care centre validation accepts omitted GPS coordinates", () => {
  const parsed = createCareCentreSchema.parse({
    ...validCentre,
    latitude: undefined,
    longitude: undefined,
  });
  assert.equal(parsed.latitude, undefined);
});

test("care centre validation rejects incomplete GPS, invalid coordinates and capacity", () => {
  assert.equal(
    createCareCentreSchema.safeParse({ ...validCentre, longitude: undefined })
      .success,
    false,
  );
  assert.equal(
    createCareCentreSchema.safeParse({ ...validCentre, latitude: 91 }).success,
    false,
  );
  assert.equal(
    createCareCentreSchema.safeParse({ ...validCentre, capacity: 0 }).success,
    false,
  );
});

test("care centre validation rejects incomplete physical addresses", () => {
  assert.equal(
    createCareCentreSchema.safeParse({ ...validCentre, district: "" }).success,
    false,
  );
  assert.equal(
    createCareCentreSchema.safeParse({ ...validCentre, region: "" }).success,
    false,
  );
});
