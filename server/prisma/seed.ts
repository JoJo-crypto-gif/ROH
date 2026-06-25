import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

// ── All permissions (must match client/src/lib/rbac.ts) ──
const ALL_PERMISSIONS = [
  "dashboard.view",
  "students.view", "students.create", "students.update", "students.delete",
  "staff.view", "staff.create", "staff.update", "staff.delete",
  "academic.view", "academic.manage",
  "attendance.view", "attendance.mark",
  "fees.view", "fees.manage",
  "payments.view", "payments.record",
  "receipts.view", "receipts.print",
  "debtors.view",
  "promotion.view", "promotion.recommend", "promotion.approve",
  "reports.view",
  "users.manage", "roles.manage",
  "ngo.view", "accounting.view", "inventory.view",
];

// ── Built-in roles ───────────────────────────────────────
const BUILT_IN_ROLES = [
  {
    slug: "super-admin",
    name: "Super Admin",
    description: "Full access across all modules and departments.",
    permissions: ALL_PERMISSIONS,
  },
  {
    slug: "school-admin",
    name: "School Admin",
    description: "Manages all school operations.",
    permissions: ALL_PERMISSIONS.filter(
      (p) => !p.startsWith("ngo") && !p.startsWith("accounting") && !p.startsWith("inventory"),
    ),
  },
  {
    slug: "headteacher",
    name: "Headteacher",
    description: "Academic leadership, promotions, reports.",
    permissions: [
      "dashboard.view", "students.view", "students.update", "staff.view",
      "academic.view", "academic.manage", "attendance.view", "attendance.mark",
      "fees.view", "payments.view", "debtors.view",
      "promotion.view", "promotion.recommend", "promotion.approve", "reports.view",
    ],
  },
  {
    slug: "teacher",
    name: "Teacher",
    description: "Class attendance and student view (scoped to assigned class).",
    permissions: [
      "dashboard.view", "students.view", "attendance.view", "attendance.mark",
      "promotion.view", "promotion.recommend",
    ],
  },
  {
    slug: "bursar",
    name: "Bursar / Accountant",
    description: "Fees, payments, receipts, debtors and reports.",
    permissions: [
      "dashboard.view", "students.view", "fees.view", "fees.manage",
      "payments.view", "payments.record", "receipts.view", "receipts.print",
      "debtors.view", "reports.view",
    ],
  },
  {
    slug: "receptionist",
    name: "Receptionist",
    description: "Front desk: enrol students, basic lookups.",
    permissions: ["dashboard.view", "students.view", "students.create", "staff.view"],
  },
];

async function main() {
  console.log("🌱 Seeding database...\n");

  // ── Clean all tables in correct dependency order ─────
  console.log("🧹 Cleaning old data...");
  await prisma.promotion.deleteMany();
  await prisma.studentEnrolment.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.gradeBook.deleteMany();
  await prisma.termReport.deleteMany();
  await prisma.classSubject.deleteMany();
  await prisma.subjectTeacher.deleteMany();
  await prisma.student.deleteMany();
  await prisma.classRoom.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.term.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();

  // ── 1. Create roles ────────────────────────────────────
  const roleMap: Record<string, string> = {};
  for (const roleDef of BUILT_IN_ROLES) {
    const existing = await prisma.role.findUnique({ where: { slug: roleDef.slug } });
    let roleId = "";

    if (existing) {
      roleId = existing.id;
      // Update permissions for existing built-in roles
      await prisma.rolePermission.deleteMany({ where: { roleId: existing.id } });
      await prisma.rolePermission.createMany({
        data: roleDef.permissions.map((p) => ({ roleId: existing.id, permission: p })),
      });
      console.log(`  ✓ Role "${roleDef.name}" updated (${roleDef.permissions.length} permissions)`);
    } else {
      const created = await prisma.role.create({
        data: {
          name: roleDef.name,
          slug: roleDef.slug,
          description: roleDef.description,
          builtIn: true,
          permissions: {
            create: roleDef.permissions.map((p) => ({ permission: p })),
          },
        },
      });
      roleId = created.id;
      console.log(`  ✓ Role "${roleDef.name}" created (${roleDef.permissions.length} permissions)`);
    }
    roleMap[roleDef.slug] = roleId;
  }

  // ── 2. Create academic years and terms ─────────────────
  console.log("\n  ⚙ Seeding Academic Years & Terms...");

  const ay2025 = await prisma.academicYear.create({
    data: {
      name: "2025 / 2026",
      active: true,
      terms: {
        create: [
          { name: "Term 1", startDate: new Date("2025-09-01"), endDate: new Date("2025-12-15"), active: false },
          { name: "Term 2", startDate: new Date("2026-01-10"), endDate: new Date("2026-04-05"), active: true },
          { name: "Term 3", startDate: new Date("2026-04-25"), endDate: new Date("2026-07-20"), active: false },
        ]
      }
    }
  });

  const ay2024 = await prisma.academicYear.create({
    data: {
      name: "2024 / 2025",
      active: false,
      terms: {
        create: [
          { name: "Term 1", startDate: new Date("2024-09-01"), endDate: new Date("2024-12-15"), active: false },
          { name: "Term 2", startDate: new Date("2025-01-10"), endDate: new Date("2025-04-05"), active: false },
          { name: "Term 3", startDate: new Date("2025-04-25"), endDate: new Date("2025-07-20"), active: false },
        ]
      }
    }
  });
  console.log("  ✓ Academic Years & Terms seeded");

  // ── 3. Create staff users ──────────────────────────────
  console.log("\n  👤 Seeding Staff Users...");
  const passwordHash = await bcrypt.hash("admin123", 12);
  const teacherPasswordHash = await bcrypt.hash("teacher123", 12);

  // Create Seed Admin
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@erp.com";
  const adminName = process.env.SEED_ADMIN_NAME || "Super Admin";
  
  const superAdmin = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      name: adminName,
      roleId: roleMap["super-admin"],
      staffNo: "ST-000",
      phone: "+234 803 000 0000",
    }
  });
  console.log(`  ✓ Super Admin created: ${adminEmail}`);

  // Create Headteacher
  const headteacher = await prisma.user.create({
    data: {
      email: "grace@school.org",
      passwordHash: await bcrypt.hash("head123", 12),
      name: "Grace Okonkwo",
      roleId: roleMap["headteacher"],
      staffNo: "ST-001",
      phone: "+234 803 111 2200",
    }
  });

  // Create Bursar
  const bursar = await prisma.user.create({
    data: {
      email: "michael@school.org",
      passwordHash: await bcrypt.hash("bursar123", 12),
      name: "Michael Otieno",
      roleId: roleMap["bursar"],
      staffNo: "ST-008",
      phone: "+234 803 111 2207",
    }
  });

  // Create Teachers
  const teachersData = [
    { email: "daniel@school.org", name: "Daniel Mensah", staffNo: "ST-002", phone: "+234 803 111 2201" },
    { email: "amina@school.org", name: "Amina Yusuf", staffNo: "ST-003", phone: "+234 803 111 2202" },
    { email: "peter@school.org", name: "Peter Achieng", staffNo: "ST-004", phone: "+234 803 111 2203" },
    { email: "linda@school.org", name: "Linda Boateng", staffNo: "ST-005", phone: "+234 803 111 2204" },
    { email: "joseph@school.org", name: "Joseph Wanjiku", staffNo: "ST-006", phone: "+234 803 111 2205" },
    { email: "sarah@school.org", name: "Sarah Adeyemi", staffNo: "ST-007", phone: "+234 803 111 2206" },
  ];

  const teachers: any[] = [];
  for (const t of teachersData) {
    const teacher = await prisma.user.create({
      data: {
        email: t.email,
        passwordHash: teacherPasswordHash,
        name: t.name,
        roleId: roleMap["teacher"],
        staffNo: t.staffNo,
        phone: t.phone,
      }
    });
    teachers.push(teacher);
  }
  console.log(`  ✓ Seeded ${teachers.length} teachers`);

  // ── 4. Create classrooms ───────────────────────────────
  console.log("\n  🏫 Seeding Classrooms...");

  const classNames = ["Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6"];
  const classrooms: any[] = [];

  for (let i = 0; i < classNames.length; i++) {
    const classRoom = await prisma.classRoom.create({
      data: {
        name: classNames[i],
        level: i + 1,
        capacity: 35,
        teacherId: teachers[i].id, // Assign corresponding teacher
      }
    });
    classrooms.push(classRoom);
  }
  console.log(`  ✓ Seeded ${classrooms.length} classrooms`);

  // ── 5. Create subjects ─────────────────────────────────
  console.log("\n  📚 Seeding Subjects...");

  const subjectsData = [
    { name: "English", code: "ENG" },
    { name: "Mathematics", code: "MTH" },
    { name: "Science", code: "SCI" },
    { name: "Social Studies", code: "SST" },
    { name: "Religious Ed", code: "REL" },
    { name: "Creative Arts", code: "ART" },
  ];

  const subjects: any[] = [];
  for (const s of subjectsData) {
    const subject = await prisma.subject.create({
      data: {
        name: s.name,
        code: s.code,
      }
    });
    subjects.push(subject);
  }
  console.log(`  ✓ Seeded ${subjects.length} subjects`);

  // ── 6. Map subjects to classes and assign teachers ────
  console.log("\n  🔗 Mapping ClassSubjects...");

  // Create many-to-many SubjectTeacher assignments
  // Daniel teaches English and Mathematics
  const english = subjects.find(s => s.code === "ENG");
  const math = subjects.find(s => s.code === "MTH");
  const science = subjects.find(s => s.code === "SCI");
  const sst = subjects.find(s => s.code === "SST");
  const rel = subjects.find(s => s.code === "REL");
  const art = subjects.find(s => s.code === "ART");

  await prisma.subjectTeacher.createMany({
    data: [
      { subjectId: english.id, teacherId: teachers[0].id }, // Daniel
      { subjectId: math.id, teacherId: teachers[0].id },    // Daniel
      { subjectId: math.id, teacherId: teachers[1].id },    // Amina
      { subjectId: science.id, teacherId: teachers[2].id }, // Peter
      { subjectId: sst.id, teacherId: teachers[3].id },     // Linda
      { subjectId: english.id, teacherId: teachers[3].id }, // Linda
      { subjectId: rel.id, teacherId: teachers[4].id },     // Joseph
      { subjectId: math.id, teacherId: teachers[5].id },    // Sarah
      { subjectId: science.id, teacherId: teachers[5].id }, // Sarah
    ]
  });

  // Map subjects to classRooms and assign subject teachers
  // Mapping standard subjects to Primary 1 with Daniel
  await prisma.classSubject.createMany({
    data: [
      // Primary 1
      { classId: classrooms[0].id, subjectId: english.id, teacherId: teachers[0].id, passMark: 50, weight: 1 },
      { classId: classrooms[0].id, subjectId: math.id, teacherId: teachers[0].id, passMark: 50, weight: 1 },
      
      // Primary 2
      { classId: classrooms[1].id, subjectId: math.id, teacherId: teachers[1].id, passMark: 50, weight: 1 },
      { classId: classrooms[1].id, subjectId: english.id, teacherId: teachers[0].id, passMark: 50, weight: 1 },

      // Primary 3
      { classId: classrooms[2].id, subjectId: science.id, teacherId: teachers[2].id, passMark: 50, weight: 1 },
      { classId: classrooms[2].id, subjectId: math.id, teacherId: teachers[1].id, passMark: 50, weight: 1 },

      // Primary 4
      { classId: classrooms[3].id, subjectId: sst.id, teacherId: teachers[3].id, passMark: 50, weight: 1 },
      { classId: classrooms[3].id, subjectId: english.id, teacherId: teachers[3].id, passMark: 50, weight: 1 },

      // Primary 5
      { classId: classrooms[4].id, subjectId: rel.id, teacherId: teachers[4].id, passMark: 50, weight: 1 },
      { classId: classrooms[4].id, subjectId: art.id, teacherId: teachers[0].id, passMark: 50, weight: 1 },

      // Primary 6
      { classId: classrooms[5].id, subjectId: math.id, teacherId: teachers[5].id, passMark: 55, weight: 2 },
      { classId: classrooms[5].id, subjectId: science.id, teacherId: teachers[5].id, passMark: 55, weight: 2 },
    ]
  });
  console.log("  ✓ Mapped ClassSubjects successfully");

  // ── 7. Create students and enrolments ─────────────────
  console.log("\n  🎓 Seeding Students & Enrolments...");

  const colors = ["#0f766e","#15803d","#0369a1","#7c3aed","#b45309","#be123c","#0d9488","#4d7c0f"];
  const firstNames = ["Ada","Ben","Chika","Doris","Emeka","Fatima","Grace","Habiba","Isaac","Joy","Kemi","Lola","Musa","Ngozi","Olu","Priscilla","Quincy","Ridwan","Sade","Tobi","Uche","Victor","Wale","Yetunde"];
  const lastNames = ["Okafor","Adeyemi","Mensah","Yusuf","Achieng","Boateng","Wanjiku","Otieno","Nakato","Bello","Eze","Owusu"];

  // Seed 24 students
  for (let i = 0; i < 24; i++) {
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[i % lastNames.length];
    const cls = classrooms[i % classrooms.length];

    const student = await prisma.student.create({
      data: {
        admissionNo: `ADM/2025/${String(1000 + i)}`,
        firstName: fn,
        lastName: ln,
        gender: i % 2 === 0 ? "F" : "M",
        dob: new Date(`${2014 + (i % 6)}-${String((i % 12) + 1).padStart(2,"0")}-${String((i % 27) + 1).padStart(2,"0")}`),
        status: "active",
        enrolledAt: new Date(`2024-09-0${(i % 9) + 1}`),
        guardianName: `${ln} Family`,
        guardianPhone: `+234 80${i % 10} 555 ${1000 + i}`,
        guardianRelation: i % 3 === 0 ? "Mother" : i % 3 === 1 ? "Father" : "Guardian",
        guardianEmail: `guardian${i}@mail.com`,
        address: `${10 + i} Unity Street, City`,
        photoColor: colors[i % colors.length],
      }
    });

    // Create current enrollment in active year 2025/2026
    await prisma.studentEnrolment.create({
      data: {
        studentId: student.id,
        classId: cls.id,
        academicYearId: ay2025.id
      }
    });
  }
  console.log("  ✓ Students & Enrolments seeded successfully");

  console.log("\n✅ Seed complete!\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
