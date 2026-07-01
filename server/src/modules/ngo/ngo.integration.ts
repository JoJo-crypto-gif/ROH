import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import request from "supertest";
import { app } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { prisma } from "../../lib/prisma.js";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || process.env.DATABASE_URL !== testUrl) {
  throw new Error(
    "NGO integration tests must run through npm run test:ngo:integration.",
  );
}
if (!/test/i.test(new URL(testUrl).pathname)) {
  throw new Error("The NGO integration database name must contain 'test'.");
}

let managerToken = "";
let superAdminToken = "";
let viewerToken = "";
let schoolOnlyToken = "";

async function clearTestDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (!tables.length) return;
  const quoted = tables
    .map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`)
    .join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
  );
}

before(async () => {
  await clearTestDatabase();
  const [managerRole, superAdminRole, viewerRole, schoolRole] =
    await Promise.all([
      prisma.role.create({
        data: {
          name: "NGO Admin",
          slug: "ngo-admin",
          permissions: {
            create: [
              "ngo.view",
              "ngo.centres.view",
              "ngo.centres.manage",
              "ngo.beneficiaries.view",
              "ngo.beneficiaries.manage",
            ].map((permission) => ({ permission })),
          },
        },
      }),
      prisma.role.create({
        data: {
          name: "Super Admin",
          slug: "super-admin",
          permissions: {
            create: [
              "ngo.view",
              "ngo.centres.view",
              "ngo.centres.manage",
              "ngo.beneficiaries.view",
              "ngo.beneficiaries.manage",
            ].map((permission) => ({ permission })),
          },
        },
      }),
      prisma.role.create({
        data: {
          name: "NGO Viewer Test",
          slug: "ngo-viewer-test",
          permissions: {
            create: ["ngo.centres.view", "ngo.beneficiaries.view"].map(
              (permission) => ({ permission }),
            ),
          },
        },
      }),
      prisma.role.create({
        data: {
          name: "School Only Test",
          slug: "school-only-test",
          permissions: { create: { permission: "academic.view" } },
        },
      }),
    ]);
  const [manager, superAdmin, viewer, schoolUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: "ngo-manager@example.test",
        name: "NGO Manager",
        passwordHash: "integration-only",
        roleId: managerRole.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "super-admin@example.test",
        name: "Super Admin",
        passwordHash: "integration-only",
        roleId: superAdminRole.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "ngo-viewer@example.test",
        name: "NGO Viewer",
        passwordHash: "integration-only",
        roleId: viewerRole.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "school-user@example.test",
        name: "School User",
        passwordHash: "integration-only",
        roleId: schoolRole.id,
      },
    }),
  ]);
  managerToken = signAccessToken({
    userId: manager.id,
    roleId: managerRole.id,
    roleSlug: managerRole.slug,
  });
  superAdminToken = signAccessToken({
    userId: superAdmin.id,
    roleId: superAdminRole.id,
    roleSlug: superAdminRole.slug,
  });
  viewerToken = signAccessToken({
    userId: viewer.id,
    roleId: viewerRole.id,
    roleSlug: viewerRole.slug,
  });
  schoolOnlyToken = signAccessToken({
    userId: schoolUser.id,
    roleId: schoolRole.id,
    roleSlug: schoolRole.slug,
  });
  centrePayload.managerId = manager.id;
});

after(async () => {
  await prisma.$disconnect();
});

const centrePayload = {
  code: "TEST-01",
  name: "Integration Care Centre",
  managerId: "",
  description: "Integration test only",
  openedAt: "2025-01-10",
  phone: "+233 20 000 0000",
  email: "integration-centre@example.test",
  address: "Test Street, GA-000-0000",
  town: "Accra",
  district: "Test Municipal",
  region: "Greater Accra",
  latitude: 5.6037,
  longitude: -0.187,
  capacity: 60,
};

test("NGO manager creates, updates and deactivates a historical care centre", async () => {
  const managers = await request(app)
    .get("/ngo/centre-managers")
    .set("Authorization", `Bearer ${managerToken}`)
    .expect(200);
  assert.equal(
    managers.body.managers.some(
      (item: { id: string }) => item.id === centrePayload.managerId,
    ),
    true,
  );

  const created = await request(app)
    .post("/ngo/centres")
    .set("Authorization", `Bearer ${managerToken}`)
    .send(centrePayload)
    .expect(201);
  assert.equal(created.body.centre.code, "TEST-01");
  assert.equal(created.body.centre.currentOccupancy, 0);
  assert.equal(created.body.centre.manager.id, centrePayload.managerId);
  const centreId = created.body.centre.id as string;

  await request(app)
    .post("/ngo/centres")
    .set("Authorization", `Bearer ${managerToken}`)
    .send({ ...centrePayload, name: "Duplicate code" })
    .expect(409);

  await request(app)
    .post("/ngo/centres")
    .set("Authorization", `Bearer ${managerToken}`)
    .send({
      ...centrePayload,
      code: "TEST-02",
      name: "Invalid capacity",
      capacity: 0,
    })
    .expect(400);

  const updated = await request(app)
    .patch(`/ngo/centres/${centreId}`)
    .set("Authorization", `Bearer ${superAdminToken}`)
    .send({ capacity: 75, phone: "+233 24 000 0000" })
    .expect(200);
  assert.equal(updated.body.centre.capacity, 75);

  await request(app)
    .post(`/ngo/centres/${centreId}/deactivate`)
    .set("Authorization", `Bearer ${superAdminToken}`)
    .expect(200);

  const stored = await prisma.careCentre.findUnique({
    where: { id: centreId },
  });
  assert.equal(stored?.status, "INACTIVE");
  assert.equal(
    await prisma.ngoAuditLog.count({ where: { entityId: centreId } }),
    3,
  );

  const listed = await request(app)
    .get("/ngo/centres?status=INACTIVE&search=Integration")
    .set("Authorization", `Bearer ${managerToken}`)
    .expect(200);
  assert.equal(listed.body.centres.length, 1);
  assert.equal(listed.body.pagination.total, 1);
});

test("read-only NGO roles can view but cannot mutate centres", async () => {
  await request(app)
    .get("/ngo/centres")
    .set("Authorization", `Bearer ${viewerToken}`)
    .expect(200);
  await request(app)
    .post("/ngo/centres")
    .set("Authorization", `Bearer ${viewerToken}`)
    .send({ ...centrePayload, code: "TEST-03", name: "Forbidden centre" })
    .expect(403);
});

test("school-only and unauthenticated requests cannot access NGO centres", async () => {
  await request(app)
    .get("/ngo/centres")
    .set("Authorization", `Bearer ${schoolOnlyToken}`)
    .expect(403);
  await request(app).get("/ngo/centres").expect(401);
});

test("NGO admin maintains a complete beneficiary record and preserves placement history", async () => {
  const activeCentre = await request(app)
    .post("/ngo/centres")
    .set("Authorization", `Bearer ${managerToken}`)
    .send({
      ...centrePayload,
      code: "TEST-BEN",
      name: "Beneficiary Test Centre",
      email: "beneficiary-centre@example.test",
      capacity: 2,
    })
    .expect(201);
  const centreId = activeCentre.body.centre.id as string;

  const student = await prisma.student.create({
    data: {
      admissionNo: "TEST-STU-001",
      firstName: "Ama",
      lastName: "Mensah",
      gender: "F",
      dob: new Date("2014-03-12T00:00:00.000Z"),
      guardianName: "Esi Mensah",
      guardianPhone: "+233200000000",
      guardianRelation: "Aunt",
      address: "Test address",
      photoColor: "bg-brand",
    },
  });

  const payload = {
    beneficiaryNo: "ROH-TEST-001",
    fullName: "Ama Mensah",
    dateOfBirth: "2014-03-12",
    gender: "FEMALE",
    admissionDate: "2025-01-20",
    careCentreId: centreId,
    referralSource: "Department of Social Welfare",
    backgroundSummary: "Integration test child record",
    educationLevelAtAdmission: "Class 3",
    currentEducationLevel: "Class 4",
    schoolName: "Integration School",
    studentId: student.id,
    healthStatus: "Good",
    healthNotes: "Routine review only",
    specialNeeds: "None recorded",
    guardians: [
      {
        name: "Esi Mensah",
        primaryPhone: "+233200000000",
        secondaryPhone: "+233240000000",
        relationship: "Aunt",
      },
    ],
  };

  const created = await request(app)
    .post("/ngo/beneficiaries")
    .set("Authorization", `Bearer ${managerToken}`)
    .send(payload)
    .expect(201);
  const beneficiaryId = created.body.beneficiary.id as string;
  assert.equal(
    created.body.beneficiary.currentPlacement.careCentre.id,
    centreId,
  );
  assert.equal(created.body.beneficiary.linkedStudent.id, student.id);
  assert.equal(
    created.body.beneficiary.guardians[0].secondaryPhone,
    "+233240000000",
  );

  const options = await request(app)
    .get("/ngo/beneficiary-options")
    .set("Authorization", `Bearer ${managerToken}`)
    .expect(200);
  assert.equal(
    options.body.students.find((item: { id: string }) => item.id === student.id)
      .linkedBeneficiaryId,
    beneficiaryId,
  );

  await request(app)
    .post("/ngo/beneficiaries")
    .set("Authorization", `Bearer ${managerToken}`)
    .send({ ...payload, studentId: null })
    .expect(409);

  const transferred = await request(app)
    .patch(`/ngo/beneficiaries/${beneficiaryId}`)
    .set("Authorization", `Bearer ${superAdminToken}`)
    .send({
      status: "TRANSFERRED",
      exitDate: "2026-06-20",
      exitReason: "Transferred to family-based care",
      remarks: "Follow-up arranged",
    })
    .expect(200);
  assert.equal(transferred.body.beneficiary.status, "TRANSFERRED");
  assert.equal(transferred.body.beneficiary.currentPlacement, null);
  assert.equal(transferred.body.beneficiary.placementHistory[0].active, false);

  const centre = await request(app)
    .get(`/ngo/centres/${centreId}`)
    .set("Authorization", `Bearer ${viewerToken}`)
    .expect(200);
  assert.equal(centre.body.centre.currentOccupancy, 0);
  assert.equal(
    await prisma.ngoAuditLog.count({ where: { entityId: beneficiaryId } }),
    2,
  );
});

test("beneficiary read-only and school-only access is enforced", async () => {
  await request(app)
    .get("/ngo/beneficiaries")
    .set("Authorization", `Bearer ${viewerToken}`)
    .expect(200);
  await request(app)
    .post("/ngo/beneficiaries")
    .set("Authorization", `Bearer ${viewerToken}`)
    .send({})
    .expect(403);
  await request(app)
    .get("/ngo/beneficiaries")
    .set("Authorization", `Bearer ${schoolOnlyToken}`)
    .expect(403);
});
