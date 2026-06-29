import {
  PrismaClient,
  AcademicYearStatus,
  TermStatus,
  EnrollmentStatus,
  SchoolStaffCategory,
} from "@prisma/client";
import bcrypt from "bcrypt";
import { ALL_PERMISSIONS } from "../src/lib/permissions.js";
import { recordPayment } from "../src/modules/finance/finance.service.js";
import {
  activateAccounting,
  bootstrapAccounting,
  createExpense,
  decideExpense,
  listMoneyAccounts,
  payExpense,
  submitExpense,
} from "../src/modules/accounting/accounting.service.js";

const prisma = new PrismaClient();

const roleDefinitions = [
  {
    name: "Super Admin",
    slug: "super-admin",
    description: "Full platform access.",
    permissions: [...ALL_PERMISSIONS],
  },
  {
    name: "School Admin",
    slug: "school-admin",
    description: "Full school operations access.",
    permissions: ALL_PERMISSIONS.filter(
      (p) => !p.startsWith("ngo") && !p.startsWith("inventory"),
    ),
  },
  {
    name: "Headteacher",
    slug: "principal",
    description: "Academic leadership and oversight.",
    permissions: [
      "dashboard.view",
      "students.view",
      "students.update",
      "staff.view",
      "academic.view",
      "academic.manage",
      "attendance.view",
      "attendance.mark",
      "gradebook.view",
      "gradebook.edit",
      "reports.view",
      "reports.publish",
      "reports.reissue",
      "promotion.view",
      "promotion.recommend",
      "promotion.approve",
    ],
  },
  {
    name: "Teacher",
    slug: "teacher",
    description: "Assigned-section academic workflow.",
    permissions: [
      "dashboard.view",
      "students.view",
      "academic.view",
      "attendance.view",
      "attendance.mark",
      "gradebook.view",
      "gradebook.edit",
      "reports.view",
      "reports.publish",
      "reports.reissue",
      "promotion.view",
      "promotion.recommend",
    ],
  },
  {
    name: "Bursar",
    slug: "bursar",
    description: "Fees and school finance.",
    permissions: [
      "dashboard.view",
      "students.view",
      "fees.view",
      "fees.manage",
      "fees.adjust",
      "credits.allocate",
      "payments.view",
      "payments.record",
      "payments.reverse",
      "receipts.view",
      "receipts.print",
      "debtors.view",
      "accounting.view",
      "journals.create",
      "expenses.view",
      "expenses.create",
      "expenses.pay",
      "reconciliation.view",
      "reconciliation.manage",
      "accounting.reports.view",
      "reports.view",
    ],
  },
  {
    name: "Admissions Officer",
    slug: "admissions",
    description: "Student registration.",
    permissions: [
      "dashboard.view",
      "students.view",
      "students.create",
      "students.update",
      "academic.view",
    ],
  },
] as const;

async function clearDatabase() {
  await prisma.financeAuditLog.deleteMany();
  await prisma.paymentReversal.deleteMany();
  await prisma.feeReceipt.deleteMany();
  await prisma.receiptSequence.deleteMany();
  await prisma.creditAllocation.deleteMany();
  await prisma.studentCreditLot.deleteMany();
  await prisma.paymentAllocation.deleteMany();
  await prisma.feePayment.deleteMany();
  await prisma.reconciliationMatch.deleteMany();
  await prisma.bankStatementLine.deleteMany();
  await prisma.bankStatementImport.deleteMany();
  await prisma.cashCount.deleteMany();
  await prisma.expensePayment.deleteMany();
  await prisma.expenseAttachment.deleteMany();
  await prisma.expenseLine.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.expenseSequence.deleteMany();
  await prisma.accountingSourceLink.deleteMany();
  await prisma.journalLine.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.journalSequence.deleteMany();
  await prisma.paymentMethodAccount.deleteMany();
  await prisma.feeAccountMapping.deleteMany();
  await prisma.moneyAccount.deleteMany();
  await prisma.account.deleteMany();
  await prisma.accountingPeriod.deleteMany();
  await prisma.accountingFiscalYear.deleteMany();
  await prisma.accountingAuditLog.deleteMany();
  await prisma.accountingBook.deleteMany();
  await prisma.chargeAdjustment.deleteMany();
  await prisma.studentCharge.deleteMany();
  await prisma.optionalFeeAssignment.deleteMany();
  await prisma.feeScheduleLine.deleteMany();
  await prisma.feeSchedule.deleteMany();
  await prisma.feeItem.deleteMany();
  await prisma.academicAuditLog.deleteMany();
  await prisma.promotion.deleteMany();
  await prisma.reportCardVersion.deleteMany();
  await prisma.termReport.deleteMany();
  await prisma.assessmentScore.deleteMany();
  await prisma.assessmentResult.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.studentEnrolment.deleteMany();
  await prisma.student.deleteMany();
  await prisma.curriculumSubject.deleteMany();
  await prisma.assessmentComponent.deleteMany();
  await prisma.gradeBand.deleteMany();
  await prisma.assessmentScheme.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.classSection.deleteMany();
  await prisma.term.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.gradeLevel.updateMany({ data: { nextGradeLevelId: null } });
  await prisma.gradeLevel.deleteMany();
  await prisma.schoolProfile.deleteMany();
  await prisma.academicSettings.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.schoolStaff.deleteMany();
  await prisma.user.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
}

function termDates(year: number) {
  return [
    {
      name: "Term 1",
      sequence: 1,
      startDate: new Date(`${year}-09-01T00:00:00.000Z`),
      endDate: new Date(`${year}-12-15T00:00:00.000Z`),
    },
    {
      name: "Term 2",
      sequence: 2,
      startDate: new Date(`${year + 1}-01-10T00:00:00.000Z`),
      endDate: new Date(`${year + 1}-04-10T00:00:00.000Z`),
    },
    {
      name: "Term 3",
      sequence: 3,
      startDate: new Date(`${year + 1}-05-04T00:00:00.000Z`),
      endDate: new Date(`${year + 1}-07-24T00:00:00.000Z`),
    },
  ];
}

async function createAssessmentScheme(academicYearId: string) {
  return prisma.assessmentScheme.create({
    data: {
      academicYearId,
      name: "40/60 Standard Assessment",
      totalMax: 100,
      components: {
        create: [
          {
            name: "Class Score",
            code: "CLASS_SCORE",
            maxScore: 40,
            sequence: 1,
          },
          { name: "Exam", code: "EXAM", maxScore: 60, sequence: 2 },
        ],
      },
      gradeBands: {
        create: [
          { minScore: 80, maxScore: 100, grade: "A", remark: "Excellent" },
          { minScore: 70, maxScore: 79.99, grade: "B", remark: "Very Good" },
          { minScore: 60, maxScore: 69.99, grade: "C", remark: "Good" },
          { minScore: 50, maxScore: 59.99, grade: "D", remark: "Pass" },
          {
            minScore: 0,
            maxScore: 49.99,
            grade: "F",
            remark: "Needs Improvement",
          },
        ],
      },
    },
  });
}

async function main() {
  console.log("Resetting and seeding Lumen academic foundation…");
  await clearDatabase();

  const roles = new Map<string, { id: string }>();
  for (const definition of roleDefinitions) {
    const role = await prisma.role.create({
      data: {
        name: definition.name,
        slug: definition.slug,
        description: definition.description,
        builtIn: true,
        permissions: {
          create: definition.permissions.map((permission) => ({ permission })),
        },
      },
    });
    roles.set(definition.slug, role);
  }

  const passwordHash = await bcrypt.hash("admin123", 12);
  const users = await Promise.all([
    prisma.user.create({
      data: {
        name: "Super Admin",
        email: "admin@erp.com",
        passwordHash,
        roleId: roles.get("super-admin")!.id,
        staffNo: "ADM-001",
      },
    }),
    prisma.user.create({
      data: {
        name: "Adwoa Finance",
        email: "bursar@erp.com",
        passwordHash,
        roleId: roles.get("bursar")!.id,
        staffNo: "BUR-001",
      },
    }),
    prisma.user.create({
      data: {
        name: "Akua Mensah",
        email: "schooladmin@erp.com",
        passwordHash,
        roleId: roles.get("school-admin")!.id,
        staffNo: "ADM-002",
      },
    }),
    prisma.user.create({
      data: {
        name: "Kwame Boateng",
        email: "headteacher@erp.com",
        passwordHash,
        roleId: roles.get("principal")!.id,
        staffNo: "HT-001",
      },
    }),
    prisma.user.create({
      data: {
        name: "Ama Owusu",
        email: "teacher1@erp.com",
        passwordHash,
        roleId: roles.get("teacher")!.id,
        staffNo: "TCH-001",
      },
    }),
    prisma.user.create({
      data: {
        name: "Kojo Asante",
        email: "teacher2@erp.com",
        passwordHash,
        roleId: roles.get("teacher")!.id,
        staffNo: "TCH-002",
      },
    }),
    prisma.user.create({
      data: {
        name: "Esi Addo",
        email: "teacher3@erp.com",
        passwordHash,
        roleId: roles.get("teacher")!.id,
        staffNo: "TCH-003",
      },
    }),
    prisma.user.create({
      data: {
        name: "Yaw Ofori",
        email: "teacher4@erp.com",
        passwordHash,
        roleId: roles.get("teacher")!.id,
        staffNo: "TCH-004",
      },
    }),
  ]);

  await prisma.schoolStaff.createMany({
    data: [
      {
        userId: users[0].id,
        staffNo: "ADM-001",
        jobTitle: "Platform Administrator",
        category: SchoolStaffCategory.ADMIN,
      },
      {
        userId: users[1].id,
        staffNo: "ADM-002",
        jobTitle: "School Administrator",
        category: SchoolStaffCategory.ADMIN,
      },
      {
        userId: users[2].id,
        staffNo: "HT-001",
        jobTitle: "Headteacher",
        category: SchoolStaffCategory.ADMIN,
      },
      {
        userId: users[3].id,
        staffNo: "TCH-001",
        jobTitle: "Class Teacher",
        category: SchoolStaffCategory.TEACHING,
      },
      {
        userId: users[4].id,
        staffNo: "TCH-002",
        jobTitle: "Class Teacher",
        category: SchoolStaffCategory.TEACHING,
      },
      {
        userId: users[5].id,
        staffNo: "TCH-003",
        jobTitle: "Class Teacher",
        category: SchoolStaffCategory.TEACHING,
      },
      {
        userId: users[6].id,
        staffNo: "TCH-004",
        jobTitle: "Class Teacher",
        category: SchoolStaffCategory.TEACHING,
      },
      {
        userId: users[7].id,
        staffNo: "BUR-001",
        jobTitle: "School Bursar",
        category: SchoolStaffCategory.ADMIN,
      },
    ],
  });

  await prisma.academicSettings.create({
    data: { id: "default", defaultTermCount: 3 },
  });
  await prisma.schoolProfile.create({
    data: {
      id: "default",
      name: "Lumen Community School",
      motto: "Knowledge, Character, Service",
      address: "Accra, Ghana",
      phone: "+233 20 000 0000",
      email: "school@lumen.org",
      headteacherName: "Kwame Boateng",
      reportFooter:
        "This report is an official academic record of Lumen Community School.",
    },
  });

  const levelDefinitions = [
    ["KG 1", "KG1"],
    ["KG 2", "KG2"],
    ["Basic 1", "B1"],
    ["Basic 2", "B2"],
    ["Basic 3", "B3"],
    ["Basic 4", "B4"],
    ["Basic 5", "B5"],
    ["Basic 6", "B6"],
    ["JHS 1", "JHS1"],
    ["JHS 2", "JHS2"],
    ["JHS 3", "JHS3"],
  ] as const;
  const levels = [];
  for (let index = 0; index < levelDefinitions.length; index++) {
    const [name, code] = levelDefinitions[index];
    levels.push(
      await prisma.gradeLevel.create({
        data: {
          name,
          code,
          order: index + 1,
          isFinal: index === levelDefinitions.length - 1,
        },
      }),
    );
  }
  for (let index = 0; index < levels.length - 1; index++) {
    await prisma.gradeLevel.update({
      where: { id: levels[index].id },
      data: { nextGradeLevelId: levels[index + 1].id },
    });
  }

  const activeYear = await prisma.academicYear.create({
    data: {
      name: "2025 / 2026",
      startDate: new Date("2025-09-01T00:00:00.000Z"),
      endDate: new Date("2026-07-24T00:00:00.000Z"),
      termCount: 3,
      status: AcademicYearStatus.ACTIVE,
      terms: {
        create: termDates(2025).map((term) => ({
          ...term,
          status: term.sequence === 3 ? TermStatus.ACTIVE : TermStatus.CLOSED,
        })),
      },
    },
  });
  const draftYear = await prisma.academicYear.create({
    data: {
      name: "2026 / 2027",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2027-07-24T00:00:00.000Z"),
      termCount: 3,
      status: AcademicYearStatus.DRAFT,
      terms: {
        create: termDates(2026).map((term) => ({
          ...term,
          status: TermStatus.PENDING,
        })),
      },
    },
  });
  const previousYear = await prisma.academicYear.create({
    data: {
      name: "2024 / 2025",
      startDate: new Date("2024-09-01T00:00:00.000Z"),
      endDate: new Date("2025-07-24T00:00:00.000Z"),
      termCount: 3,
      status: AcademicYearStatus.CLOSED,
      terms: {
        create: termDates(2024).map((term) => ({
          ...term,
          status: TermStatus.CLOSED,
        })),
      },
    },
  });
  await createAssessmentScheme(activeYear.id);
  await createAssessmentScheme(draftYear.id);
  const activeTerms = await prisma.term.findMany({
    where: { academicYearId: activeYear.id },
    orderBy: { sequence: "asc" },
  });
  const previousTerms = await prisma.term.findMany({
    where: { academicYearId: previousYear.id },
    orderBy: { sequence: "asc" },
  });

  const subjectDefinitions = [
    ["English Language", "ENG"],
    ["Mathematics", "MATH"],
    ["Integrated Science", "SCI"],
    ["Social Studies", "SOC"],
    ["Creative Arts", "ART"],
    ["Religious and Moral Education", "RME"],
    ["Computing", "ICT"],
    ["French", "FRE"],
  ] as const;
  const subjects = [];
  for (const [name, code] of subjectDefinitions) {
    subjects.push(await prisma.subject.create({ data: { name, code } }));
  }

  const activeSections = [];
  const draftSections = [];
  for (let index = 0; index < levels.length; index++) {
    const level = levels[index];
    const teacher = users[3 + (index % 4)];
    const sectionNames =
      level.code === "B1"
        ? [`${level.name} A`, `${level.name} B`]
        : [`${level.name} A`];
    for (const name of sectionNames) {
      activeSections.push(
        await prisma.classSection.create({
          data: {
            name,
            capacity: 35,
            academicYearId: activeYear.id,
            gradeLevelId: level.id,
            classTeacherId: teacher.id,
          },
        }),
      );
      draftSections.push(
        await prisma.classSection.create({
          data: {
            name,
            capacity: 35,
            academicYearId: draftYear.id,
            gradeLevelId: level.id,
            classTeacherId: teacher.id,
          },
        }),
      );
    }
  }
  const previousSection = await prisma.classSection.create({
    data: {
      name: "KG 2 A",
      capacity: 35,
      active: false,
      academicYearId: previousYear.id,
      gradeLevelId: levels.find((level) => level.code === "KG2")!.id,
    },
  });

  for (const year of [activeYear, draftYear]) {
    for (const level of levels) {
      const selected = level.code.startsWith("KG")
        ? subjects.slice(0, 6)
        : subjects;
      await prisma.curriculumSubject.createMany({
        data: selected.map((subject, index) => ({
          academicYearId: year.id,
          gradeLevelId: level.id,
          subjectId: subject.id,
          passMark: 50,
          sortOrder: index + 1,
        })),
      });
    }
  }

  const colors = [
    "#0f766e",
    "#15803d",
    "#0369a1",
    "#7c3aed",
    "#b45309",
    "#be123c",
    "#0d9488",
    "#4d7c0f",
  ];
  const firstNames = [
    "Ada",
    "Ben",
    "Chika",
    "Doris",
    "Emeka",
    "Fatima",
    "Grace",
    "Habiba",
    "Isaac",
    "Joy",
    "Kemi",
    "Lola",
    "Musa",
    "Ngozi",
    "Olu",
    "Priscilla",
    "Quincy",
    "Ridwan",
    "Sade",
    "Tobi",
    "Uche",
    "Victor",
    "Wale",
    "Yetunde",
  ];
  const lastNames = [
    "Okafor",
    "Adeyemi",
    "Mensah",
    "Yusuf",
    "Achieng",
    "Boateng",
    "Wanjiku",
    "Otieno",
    "Nakato",
    "Bello",
    "Eze",
    "Owusu",
  ];
  for (let index = 0; index < 24; index++) {
    const section = activeSections[index % activeSections.length];
    await prisma.student.create({
      data: {
        admissionNo: `ADM/2025/${String(1000 + index)}`,
        firstName: firstNames[index],
        lastName: lastNames[index % lastNames.length],
        gender: index % 2 === 0 ? "F" : "M",
        dob: new Date(
          `${2013 + (index % 6)}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}T00:00:00.000Z`,
        ),
        guardianName: `${lastNames[index % lastNames.length]} Family`,
        guardianPhone: `+233 20 555 ${String(1000 + index)}`,
        guardianRelation: index % 2 === 0 ? "Mother" : "Father",
        guardianEmail: `guardian${index}@mail.com`,
        address: `${10 + index} Community Road, Accra`,
        photoColor: colors[index % colors.length],
        enrolments: {
          create: {
            academicYearId: activeYear.id,
            classSectionId: section.id,
            status: EnrollmentStatus.ACTIVE,
            feeEffectiveTermId: activeTerms[0].id,
          },
        },
      },
    });
  }

  const [tuition, feeding, pta] = await Promise.all([
    prisma.feeItem.create({
      data: {
        code: "TUITION",
        name: "Tuition",
        description: "Term tuition fee",
      },
    }),
    prisma.feeItem.create({
      data: {
        code: "FEEDING",
        name: "Feeding",
        description: "Optional school feeding service",
      },
    }),
    prisma.feeItem.create({
      data: { code: "PTA", name: "PTA Levy", description: "Term PTA levy" },
    }),
  ]);
  const basicOne = levels.find((level) => level.code === "B1")!;
  const activeTerm = activeTerms.find(
    (term) => term.status === TermStatus.ACTIVE,
  )!;
  const feeSchedule = await prisma.feeSchedule.create({
    data: {
      academicYearId: activeYear.id,
      termId: activeTerm.id,
      gradeLevelId: basicOne.id,
      kind: "STANDARD",
      sequence: 1,
      name: `${activeTerm.name} Basic 1 Fees`,
      status: "PUBLISHED",
      submittedById: users[7].id,
      submittedAt: new Date(),
      publishedById: users[1].id,
      publishedAt: new Date(),
      lines: {
        create: [
          {
            feeItemId: tuition.id,
            label: tuition.name,
            amount: 450,
            dueDate: activeTerm.endDate,
            applicability: "MANDATORY",
          },
          {
            feeItemId: pta.id,
            label: pta.name,
            amount: 50,
            dueDate: activeTerm.endDate,
            applicability: "MANDATORY",
          },
          {
            feeItemId: feeding.id,
            label: feeding.name,
            amount: 150,
            dueDate: activeTerm.endDate,
            applicability: "OPTIONAL",
          },
        ],
      },
    },
    include: { lines: true },
  });
  const basicOneEnrolments = await prisma.studentEnrolment.findMany({
    where: {
      academicYearId: activeYear.id,
      classSection: { gradeLevelId: basicOne.id },
    },
    orderBy: { createdAt: "asc" },
  });
  const historicalEnrolment = await prisma.studentEnrolment.create({
    data: {
      studentId: basicOneEnrolments[0].studentId,
      academicYearId: previousYear.id,
      classSectionId: previousSection.id,
      status: EnrollmentStatus.COMPLETED,
      completedAt: previousYear.endDate,
      feeEffectiveTermId: previousTerms[0].id,
    },
  });
  const oldSchedule = await prisma.feeSchedule.create({
    data: {
      academicYearId: previousYear.id,
      termId: previousTerms[2].id,
      gradeLevelId: previousSection.gradeLevelId,
      kind: "STANDARD",
      sequence: 1,
      name: "Term 3 KG 2 Fees",
      status: "PUBLISHED",
      submittedById: users[7].id,
      submittedAt: previousYear.endDate,
      publishedById: users[1].id,
      publishedAt: previousYear.endDate,
      lines: {
        create: [
          {
            feeItemId: tuition.id,
            label: tuition.name,
            amount: 200,
            dueDate: previousTerms[2].endDate,
            applicability: "MANDATORY",
          },
        ],
      },
    },
    include: { lines: true },
  });
  await prisma.studentCharge.create({
    data: {
      enrolmentId: historicalEnrolment.id,
      lineId: oldSchedule.lines[0].id,
      amount: oldSchedule.lines[0].amount,
      dueDate: oldSchedule.lines[0].dueDate,
    },
  });
  const optionalLine = feeSchedule.lines.find(
    (line) => line.applicability === "OPTIONAL",
  )!;
  if (basicOneEnrolments[0])
    await prisma.optionalFeeAssignment.create({
      data: {
        enrolmentId: basicOneEnrolments[0].id,
        lineId: optionalLine.id,
        assignedById: users[7].id,
      },
    });
  await prisma.studentCharge.createMany({
    data: basicOneEnrolments.flatMap((enrolment, index) =>
      feeSchedule.lines
        .filter((line) => line.applicability === "MANDATORY" || index === 0)
        .map((line) => ({
          enrolmentId: enrolment.id,
          lineId: line.id,
          amount: line.amount,
          dueDate: line.dueDate,
        })),
    ),
  });
  const firstCharge = await prisma.studentCharge.findFirst({
    where: { enrolmentId: basicOneEnrolments[0]?.id },
    include: { enrolment: true },
  });
  if (firstCharge)
    await recordPayment(users[7].id, {
      studentId: firstCharge.enrolment.studentId,
      amount: 300,
      method: "CASH",
      idempotencyKey: "seed-payment-basic-one",
      allocations: [{ chargeId: firstCharge.id, amount: 250 }],
    });

  const accountingSetup = await bootstrapAccounting(users[1].id, activeYear.id);
  const cashAccount = accountingSetup.methodMappings.find(
    (mapping) => mapping.method === "CASH",
  )!.moneyAccount;
  await activateAccounting(users[1].id, {
    cutoverDate: new Date(),
    moneyBalances: [{ moneyAccountId: cashAccount.id, amount: 300 }],
    otherBalances: [],
  });
  const expenseAccount = accountingSetup.accounts.find(
    (account) => account.code === "5020",
  )!;
  const expense = await createExpense(users[7].id, {
    date: new Date(),
    payee: "Electricity Company",
    reference: "SEED-UTILITY-001",
    description: "Seeded electricity expense",
    missingDocumentReason: "Seed demonstration record",
    lines: [
      {
        accountId: expenseAccount.id,
        description: "Electricity bill",
        amount: 80,
      },
    ],
  });
  await submitExpense(users[7].id, expense.id);
  await decideExpense(users[1].id, expense.id, true);
  await payExpense(users[7].id, expense.id, {
    amount: 50,
    date: new Date(),
    moneyAccountId: cashAccount.id,
    transactionRef: "SEED-CASH-001",
  });

  console.log(
    "Seed complete. Admin: admin@erp.com / admin123; Bursar: bursar@erp.com / admin123",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
