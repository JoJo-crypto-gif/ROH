import {
  AcademicYearStatus,
  EnrollmentStatus,
  StudentStatus,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { getAcademicAccessScope } from "../academic/services/access.service.js";
import { chargePublishedSchedulesForEnrolment } from "../finance/finance.service.js";

const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;

function dateOnly(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function round(value: number | null | undefined, precision = 1) {
  if (value === null || value === undefined || !Number.isFinite(value))
    return null;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function summarizeAttendance(records: { status: string }[]) {
  const counts = Object.fromEntries(
    ATTENDANCE_STATUSES.map((status) => [status, 0]),
  ) as Record<(typeof ATTENDANCE_STATUSES)[number], number>;
  for (const record of records) {
    if (record.status in counts)
      counts[record.status as keyof typeof counts] += 1;
  }
  const total = records.length;
  return {
    ...counts,
    total,
    attendanceRate: total
      ? round(((counts.PRESENT + counts.LATE) / total) * 100)
      : null,
  };
}

function formatStudent(student: any) {
  const enrolment = student.enrolments?.[0];
  return {
    id: student.id,
    admissionNo: student.admissionNo,
    firstName: student.firstName,
    lastName: student.lastName,
    gender: student.gender,
    dob: student.dob.toISOString().slice(0, 10),
    status: student.status.toLowerCase(),
    enrolledAt: student.enrolledAt.toISOString().slice(0, 10),
    avatarUrl: student.avatarUrl,
    
    // Primary Guardian
    guardianName: student.guardianName,
    guardianPhone: student.guardianPhone,
    guardianRelation: student.guardianRelation,
    guardianEmail: student.guardianEmail,
    guardian: {
      name: student.guardianName,
      phone: student.guardianPhone,
      relation: student.guardianRelation,
      email: student.guardianEmail,
    },
    
    // Secondary Guardian
    guardian2Name: student.guardian2Name,
    guardian2Phone: student.guardian2Phone,
    guardian2Relation: student.guardian2Relation,
    guardian2Email: student.guardian2Email,
    
    // Emergency Contact
    emergencyName: student.emergencyName,
    emergencyPhone: student.emergencyPhone,
    emergencyRelation: student.emergencyRelation,
    
    // Health & Demographics
    bloodGroup: student.bloodGroup,
    allergies: student.allergies,
    medicalNotes: student.medicalNotes,
    boardingStatus: student.boardingStatus,
    previousSchool: student.previousSchool,

    address: student.address,
    photoColor: student.photoColor,
    enrolmentId: enrolment?.id ?? null,
    classSectionId: enrolment?.classSection?.id ?? null,
    classId: enrolment?.classSection?.id ?? null,
    className: enrolment?.classSection?.name ?? "Unassigned",
    gradeLevelName: enrolment?.classSection?.gradeLevel?.name ?? "Unassigned",
    academicYearId: enrolment?.academicYearId ?? null,
  };
}

function activeEnrolmentInclude() {
  return {
    enrolments: {
      where: { academicYear: { status: AcademicYearStatus.ACTIVE } },
      include: { classSection: { include: { gradeLevel: true } } },
    },
  } as const;
}

export async function listStudents(
  filters: { classSectionId?: string; status?: string; search?: string },
  userId: string,
  roleSlug: string,
) {
  const accessScope = await getAcademicAccessScope(userId, roleSlug);
  if (accessScope === "NONE") return [];
  const where: any = {};
  if (filters.search) {
    where.OR = [
      { firstName: { contains: filters.search, mode: "insensitive" } },
      { lastName: { contains: filters.search, mode: "insensitive" } },
      { admissionNo: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  if (filters.status && filters.status !== "all") {
    where.status = filters.status.toUpperCase();
  }
  const enrolmentWhere: any = {
    academicYear: { status: AcademicYearStatus.ACTIVE },
  };
  if (filters.classSectionId && filters.classSectionId !== "all") {
    enrolmentWhere.classSectionId = filters.classSectionId;
  }
  if (accessScope === "ASSIGNED") {
    enrolmentWhere.classSection = { classTeacherId: userId };
  }
  if (Object.keys(enrolmentWhere).length) {
    where.enrolments = { some: enrolmentWhere };
  }
  const students = await prisma.student.findMany({
    where,
    include: activeEnrolmentInclude(),
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return students.map(formatStudent);
}

export async function getStudentById(
  id: string,
  userId: string,
  roleSlug: string,
) {
  const student = await prisma.student.findUnique({
    where: { id },
    include: activeEnrolmentInclude(),
  });
  if (!student) throw AppError.notFound("Student not found.");
  const accessScope = await getAcademicAccessScope(userId, roleSlug);
  if (accessScope === "NONE") {
    throw AppError.forbidden("You do not have access to school students.");
  }
  const enrolment = student.enrolments[0];
  if (
    accessScope === "ASSIGNED" &&
    enrolment?.classSection.classTeacherId !== userId
  ) {
    throw AppError.forbidden(
      "You can view only students in your assigned section.",
    );
  }
  return formatStudent(student);
}

export async function createStudent(input: {
  firstName: string;
  lastName: string;
  gender: string;
  dob: Date;
  avatarUrl?: string | null;
  
  // Primary Guardian
  guardianName: string;
  guardianPhone: string;
  guardianRelation: string;
  guardianEmail?: string | null;
  
  // Secondary Guardian
  guardian2Name?: string | null;
  guardian2Phone?: string | null;
  guardian2Relation?: string | null;
  guardian2Email?: string | null;
  
  // Emergency Contact
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  emergencyRelation?: string | null;
  
  // Health & Demographics
  bloodGroup?: string | null;
  allergies?: string | null;
  medicalNotes?: string | null;
  boardingStatus?: string;
  previousSchool?: string | null;
  
  address: string;
  classSectionId?: string;
  classId?: string;
  feeEffectiveTermId?: string;
}) {
  const activeYear = await prisma.academicYear.findFirst({
    where: { status: AcademicYearStatus.ACTIVE },
  });
  if (!activeYear)
    throw AppError.badRequest("No active academic year is configured.");
  const classSectionId = input.classSectionId ?? input.classId!;
  const section = await prisma.classSection.findUnique({
    where: { id: classSectionId },
  });
  if (!section || section.academicYearId !== activeYear.id || !section.active)
    throw AppError.badRequest(
      "Select an active class section in the current academic year.",
    );
  const terms = await prisma.term.findMany({
    where: { academicYearId: activeYear.id },
    orderBy: { sequence: "asc" },
  });
  const defaultTerm =
    terms.find((term) => term.status === "ACTIVE") ??
    terms.find((term) => term.status === "PENDING") ??
    terms[0];
  const feeEffectiveTermId = input.feeEffectiveTermId ?? defaultTerm?.id;
  if (
    !feeEffectiveTermId ||
    !terms.some((term) => term.id === feeEffectiveTermId)
  )
    throw AppError.badRequest(
      "Select a fee-effective term from the active academic year.",
    );
  const yearPrefix =
    activeYear.name.replace(/\s+/g, "").split("/")[0] ??
    String(new Date().getUTCFullYear());
  const count = await prisma.student.count();
  let counter = count + 1001;
  let admissionNo = `ADM/${yearPrefix}/${counter}`;
  while (await prisma.student.findUnique({ where: { admissionNo } }))
    admissionNo = `ADM/${yearPrefix}/${++counter}`;
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
  const student = await prisma.$transaction(async (tx) => {
    const created = await tx.student.create({
      data: {
        admissionNo,
        firstName: input.firstName,
        lastName: input.lastName,
        gender: input.gender,
        dob: input.dob,
        avatarUrl: input.avatarUrl || null,
        
        // Primary Guardian
        guardianName: input.guardianName,
        guardianPhone: input.guardianPhone,
        guardianRelation: input.guardianRelation,
        guardianEmail: input.guardianEmail || null,
        
        // Secondary Guardian
        guardian2Name: input.guardian2Name || null,
        guardian2Phone: input.guardian2Phone || null,
        guardian2Relation: input.guardian2Relation || null,
        guardian2Email: input.guardian2Email || null,
        
        // Emergency Contact
        emergencyName: input.emergencyName || null,
        emergencyPhone: input.emergencyPhone || null,
        emergencyRelation: input.emergencyRelation || null,
        
        // Health & Demographics
        bloodGroup: input.bloodGroup || null,
        allergies: input.allergies || null,
        medicalNotes: input.medicalNotes || null,
        boardingStatus: input.boardingStatus || "DAY",
        previousSchool: input.previousSchool || null,
        
        address: input.address,
        photoColor: colors[Math.floor(Math.random() * colors.length)],
        enrolments: {
          create: {
            classSectionId,
            academicYearId: activeYear.id,
            status: EnrollmentStatus.ACTIVE,
            feeEffectiveTermId,
          },
        },
      },
      include: activeEnrolmentInclude(),
    });
    const enrolmentId = created.enrolments[0]?.id;
    if (enrolmentId)
      await chargePublishedSchedulesForEnrolment(tx, enrolmentId);
    return created;
  });
  return formatStudent(student);
}

export async function updateStudent(
  id: string,
  input: {
    firstName?: string;
    lastName?: string;
    gender?: string;
    dob?: Date;
    status?: "ACTIVE" | "GRADUATED" | "WITHDRAWN" | "TRANSFERRED";
    avatarUrl?: string | null;
    
    // Primary Guardian
    guardianName?: string;
    guardianPhone?: string;
    guardianRelation?: string;
    guardianEmail?: string | null;
    
    // Secondary Guardian
    guardian2Name?: string | null;
    guardian2Phone?: string | null;
    guardian2Relation?: string | null;
    guardian2Email?: string | null;
    
    // Emergency Contact
    emergencyName?: string | null;
    emergencyPhone?: string | null;
    emergencyRelation?: string | null;
    
    // Health & Demographics
    bloodGroup?: string | null;
    allergies?: string | null;
    medicalNotes?: string | null;
    boardingStatus?: string;
    previousSchool?: string | null;
    
    address?: string;
    classSectionId?: string;
    classId?: string;
    feeEffectiveTermId?: string;
  },
) {
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) throw AppError.notFound("Student not found.");
  const activeYear = await prisma.academicYear.findFirst({
    where: { status: AcademicYearStatus.ACTIVE },
  });
  const classSectionId = input.classSectionId ?? input.classId;
  const currentEnrolment = activeYear
    ? await prisma.studentEnrolment.findUnique({
        where: {
          studentId_academicYearId: {
            studentId: id,
            academicYearId: activeYear.id,
          },
        },
      })
    : null;
  if (classSectionId && activeYear) {
    const section = await prisma.classSection.findUnique({
      where: { id: classSectionId },
    });
    if (!section || section.academicYearId !== activeYear.id)
      throw AppError.badRequest(
        "Selected class section is not in the active academic year.",
      );
  }
  if (input.feeEffectiveTermId && activeYear) {
    const term = await prisma.term.findUnique({
      where: { id: input.feeEffectiveTermId },
    });
    if (!term || term.academicYearId !== activeYear.id)
      throw AppError.badRequest(
        "The fee-effective term must belong to the active academic year.",
      );
  }
  await prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { id },
      data: {
        ...(input.firstName !== undefined && { firstName: input.firstName }),
        ...(input.lastName !== undefined && { lastName: input.lastName }),
        ...(input.gender !== undefined && { gender: input.gender }),
        ...(input.dob !== undefined && { dob: input.dob }),
        ...(input.status !== undefined && {
          status: input.status as StudentStatus,
        }),
        ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
        
        // Primary Guardian
        ...(input.guardianName !== undefined && {
          guardianName: input.guardianName,
        }),
        ...(input.guardianPhone !== undefined && {
          guardianPhone: input.guardianPhone,
        }),
        ...(input.guardianRelation !== undefined && {
          guardianRelation: input.guardianRelation,
        }),
        ...(input.guardianEmail !== undefined && {
          guardianEmail: input.guardianEmail || null,
        }),
        
        // Secondary Guardian
        ...(input.guardian2Name !== undefined && {
          guardian2Name: input.guardian2Name || null,
        }),
        ...(input.guardian2Phone !== undefined && {
          guardian2Phone: input.guardian2Phone || null,
        }),
        ...(input.guardian2Relation !== undefined && {
          guardian2Relation: input.guardian2Relation || null,
        }),
        ...(input.guardian2Email !== undefined && {
          guardian2Email: input.guardian2Email || null,
        }),
        
        // Emergency Contact
        ...(input.emergencyName !== undefined && {
          emergencyName: input.emergencyName || null,
        }),
        ...(input.emergencyPhone !== undefined && {
          emergencyPhone: input.emergencyPhone || null,
        }),
        ...(input.emergencyRelation !== undefined && {
          emergencyRelation: input.emergencyRelation || null,
        }),
        
        // Health & Demographics
        ...(input.bloodGroup !== undefined && {
          bloodGroup: input.bloodGroup || null,
        }),
        ...(input.allergies !== undefined && {
          allergies: input.allergies || null,
        }),
        ...(input.medicalNotes !== undefined && {
          medicalNotes: input.medicalNotes || null,
        }),
        ...(input.boardingStatus !== undefined && {
          boardingStatus: input.boardingStatus || "DAY",
        }),
        ...(input.previousSchool !== undefined && {
          previousSchool: input.previousSchool || null,
        }),
        
        ...(input.address !== undefined && { address: input.address }),
      },
    });
    const effectiveClassSectionId =
      classSectionId ?? currentEnrolment?.classSectionId;
    if (
      (classSectionId || input.feeEffectiveTermId) &&
      activeYear &&
      effectiveClassSectionId
    ) {
      const enrolment = await tx.studentEnrolment.upsert({
        where: {
          studentId_academicYearId: {
            studentId: id,
            academicYearId: activeYear.id,
          },
        },
        update: {
          classSectionId: effectiveClassSectionId,
          ...(input.feeEffectiveTermId && {
            feeEffectiveTermId: input.feeEffectiveTermId,
          }),
        },
        create: {
          studentId: id,
          academicYearId: activeYear.id,
          classSectionId: effectiveClassSectionId,
          status: EnrollmentStatus.ACTIVE,
          feeEffectiveTermId: input.feeEffectiveTermId,
        },
      });
      await chargePublishedSchedulesForEnrolment(tx, enrolment.id);
    }
  });
  return getStudentById(id, "", "super-admin");
}

export async function getAcademicHistory(
  id: string,
  userId: string,
  roleSlug: string,
) {
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      enrolments: {
        include: {
          academicYear: {
            include: {
              terms: { orderBy: { sequence: "asc" } },
              assessmentScheme: {
                include: { components: { orderBy: { sequence: "asc" } } },
              },
            },
          },
          classSection: {
            include: {
              gradeLevel: true,
              classTeacher: { select: { id: true, name: true, email: true } },
            },
          },
          attendance: {
            include: {
              term: {
                select: { id: true, name: true, sequence: true, status: true },
              },
            },
            orderBy: { date: "desc" },
          },
          assessmentResults: {
            include: {
              term: {
                select: { id: true, name: true, sequence: true, status: true },
              },
              curriculumSubject: { include: { subject: true } },
              scores: { include: { component: true } },
            },
          },
          reports: {
            include: {
              versions: {
                orderBy: { version: "desc" },
                include: { publishedBy: { select: { id: true, name: true } } },
              },
              term: {
                select: { id: true, name: true, sequence: true, status: true },
              },
            },
          },
          promotions: {
            include: {
              recommendedBy: { select: { id: true, name: true } },
              approvedBy: { select: { id: true, name: true } },
              nextEnrolment: {
                include: {
                  classSection: { include: { gradeLevel: true } },
                  academicYear: true,
                },
              },
            },
          },
          incomingPromotion: {
            include: {
              recommendedBy: { select: { id: true, name: true } },
              approvedBy: { select: { id: true, name: true } },
              currentEnrolment: {
                include: {
                  classSection: { include: { gradeLevel: true } },
                  academicYear: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!student) throw AppError.notFound("Student not found.");
  const accessScope = await getAcademicAccessScope(userId, roleSlug);
  if (accessScope === "NONE") {
    throw AppError.forbidden("You do not have access to school students.");
  }
  const hasCurrentAssignedEnrolment = student.enrolments.some(
    (enrolment) =>
      enrolment.academicYear.status === AcademicYearStatus.ACTIVE &&
      enrolment.status === EnrollmentStatus.ACTIVE &&
      enrolment.classSection.classTeacherId === userId,
  );
  if (accessScope === "ASSIGNED" && !hasCurrentAssignedEnrolment) {
    throw AppError.forbidden(
      "You can view only students in your assigned section.",
    );
  }

  const sortedEnrolments = [...student.enrolments].sort(
    (a, b) =>
      b.academicYear.startDate.getTime() - a.academicYear.startDate.getTime(),
  );
  const activeEnrolment =
    sortedEnrolments.find(
      (enrolment) =>
        enrolment.academicYear.status === AcademicYearStatus.ACTIVE &&
        enrolment.status === EnrollmentStatus.ACTIVE,
    ) ?? null;
  const lastEnrolment = sortedEnrolments[0] ?? null;
  const allAttendance = sortedEnrolments.flatMap(
    (enrolment) => enrolment.attendance,
  );
  const publishedVersions = sortedEnrolments.flatMap((enrolment) =>
    enrolment.reports.flatMap((report) => report.versions),
  );

  return {
    student: {
      id: student.id,
      admissionNo: student.admissionNo,
      firstName: student.firstName,
      lastName: student.lastName,
      gender: student.gender,
      dob: dateOnly(student.dob),
      status: student.status,
      enrolledAt: dateOnly(student.enrolledAt),
      guardian: {
        name: student.guardianName,
        phone: student.guardianPhone,
        relation: student.guardianRelation,
        email: student.guardianEmail,
      },
      address: student.address,
      photoColor: student.photoColor,
      currentClass: activeEnrolment
        ? {
            enrolmentId: activeEnrolment.id,
            academicYear: activeEnrolment.academicYear.name,
            gradeLevel: activeEnrolment.classSection.gradeLevel.name,
            section: activeEnrolment.classSection.name,
            status: activeEnrolment.status,
            classTeacher:
              activeEnrolment.classSection.classTeacher?.name ?? null,
          }
        : null,
      lastClass: lastEnrolment
        ? {
            enrolmentId: lastEnrolment.id,
            academicYear: lastEnrolment.academicYear.name,
            gradeLevel: lastEnrolment.classSection.gradeLevel.name,
            section: lastEnrolment.classSection.name,
            status: lastEnrolment.status,
            classTeacher: lastEnrolment.classSection.classTeacher?.name ?? null,
          }
        : null,
    },
    summary: {
      enrolmentCount: sortedEnrolments.length,
      reportCount: publishedVersions.length,
      assessmentResultCount: sortedEnrolments.reduce(
        (sum, enrolment) => sum + enrolment.assessmentResults.length,
        0,
      ),
      attendance: summarizeAttendance(allAttendance),
    },
    enrolments: sortedEnrolments.map((enrolment) => {
      const yearTerms = enrolment.academicYear.terms;
      const termCards = yearTerms.map((term) => {
        const termAttendance = enrolment.attendance.filter(
          (record) => record.termId === term.id,
        );
        const termResults = enrolment.assessmentResults
          .filter((result) => result.termId === term.id)
          .sort(
            (a, b) =>
              a.curriculumSubject.sortOrder - b.curriculumSubject.sortOrder ||
              a.curriculumSubject.subject.name.localeCompare(
                b.curriculumSubject.subject.name,
              ),
          );
        const report = enrolment.reports.find(
          (item) => item.termId === term.id,
        );
        const totalScore =
          report?.totalScore ??
          termResults.reduce((sum, result) => sum + result.totalScore, 0);
        const averageScore =
          report?.averageScore ??
          (termResults.length ? totalScore / termResults.length : null);

        return {
          id: term.id,
          name: term.name,
          sequence: term.sequence,
          status: term.status,
          startDate: dateOnly(term.startDate),
          endDate: dateOnly(term.endDate),
          attendance: {
            summary: summarizeAttendance(termAttendance),
            records: termAttendance.map((record) => ({
              id: record.id,
              date: dateOnly(record.date),
              status: record.status,
            })),
          },
          assessment: {
            subjectCount: termResults.length,
            totalScore: round(totalScore),
            averageScore: round(averageScore),
            subjects: termResults.map((result) => ({
              id: result.id,
              subjectName: result.curriculumSubject.subject.name,
              subjectCode: result.curriculumSubject.subject.code,
              totalScore: round(result.totalScore),
              grade: result.grade,
              remarks: result.remarks,
              position: result.position,
              scores: result.scores
                .sort((a, b) => a.component.sequence - b.component.sequence)
                .map((score) => ({
                  componentId: score.componentId,
                  componentName: score.component.name,
                  componentCode: score.component.code,
                  maxScore: round(score.component.maxScore),
                  score: round(score.score),
                })),
            })),
          },
          report: report
            ? {
                id: report.id,
                status: report.status,
                conduct: report.conduct,
                attitude: report.attitude,
                teacherRemarks: report.teacherRemarks,
                headteacherRemark: report.headteacherRemark,
                position: report.position,
                totalScore: round(report.totalScore),
                averageScore: round(report.averageScore),
                currentVersion: report.currentVersion,
                versions: report.versions.map((version) => ({
                  id: version.id,
                  version: version.version,
                  publishedAt: version.publishedAt.toISOString(),
                  checksum: version.checksum,
                  publishedBy: version.publishedBy?.name ?? null,
                })),
              }
            : null,
        };
      });
      const promotion = enrolment.promotions[0] ?? null;
      const incomingPromotion = enrolment.incomingPromotion ?? null;
      return {
        id: enrolment.id,
        status: enrolment.status,
        completedAt: dateOnly(enrolment.completedAt),
        academicYear: {
          id: enrolment.academicYear.id,
          name: enrolment.academicYear.name,
          status: enrolment.academicYear.status,
          startDate: dateOnly(enrolment.academicYear.startDate),
          endDate: dateOnly(enrolment.academicYear.endDate),
          termCount: enrolment.academicYear.termCount,
        },
        classSection: {
          id: enrolment.classSection.id,
          name: enrolment.classSection.name,
          capacity: enrolment.classSection.capacity,
          gradeLevel: {
            id: enrolment.classSection.gradeLevel.id,
            name: enrolment.classSection.gradeLevel.name,
            order: enrolment.classSection.gradeLevel.order,
            isFinal: enrolment.classSection.gradeLevel.isFinal,
          },
          classTeacher: enrolment.classSection.classTeacher
            ? {
                id: enrolment.classSection.classTeacher.id,
                name: enrolment.classSection.classTeacher.name,
                email: enrolment.classSection.classTeacher.email,
              }
            : null,
        },
        assessmentComponents:
          enrolment.academicYear.assessmentScheme?.components.map(
            (component) => ({
              id: component.id,
              name: component.name,
              code: component.code,
              maxScore: round(component.maxScore),
              sequence: component.sequence,
            }),
          ) ?? [],
        terms: termCards,
        promotion: promotion
          ? {
              id: promotion.id,
              decision: promotion.decision,
              status: promotion.status,
              remarks: promotion.remarks,
              approvedAt: promotion.approvedAt?.toISOString() ?? null,
              recommendedBy: promotion.recommendedBy?.name ?? null,
              approvedBy: promotion.approvedBy?.name ?? null,
              nextEnrolment: promotion.nextEnrolment
                ? {
                    id: promotion.nextEnrolment.id,
                    academicYear: promotion.nextEnrolment.academicYear.name,
                    section: promotion.nextEnrolment.classSection.name,
                    gradeLevel:
                      promotion.nextEnrolment.classSection.gradeLevel.name,
                    status: promotion.nextEnrolment.status,
                  }
                : null,
            }
          : null,
        arrivedFrom: incomingPromotion
          ? {
              decision: incomingPromotion.decision,
              status: incomingPromotion.status,
              academicYear:
                incomingPromotion.currentEnrolment.academicYear.name,
              section: incomingPromotion.currentEnrolment.classSection.name,
              gradeLevel:
                incomingPromotion.currentEnrolment.classSection.gradeLevel.name,
              approvedAt: incomingPromotion.approvedAt?.toISOString() ?? null,
              approvedBy: incomingPromotion.approvedBy?.name ?? null,
            }
          : null,
      };
    }),
  };
}
