import {
  AttendanceStatus,
  EnrollmentStatus,
  Prisma,
  ReportStatus,
  SchoolStaffStatus,
  TermStatus,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import {
  getAcademicAccessScope,
  type AcademicAccessScope,
} from "../academic/services/access.service.js";
import { getFinanceSummary } from "../finance/finance.service.js";

const ACADEMIC_PERMISSIONS = [
  "academic.view",
  "attendance.view",
  "gradebook.view",
  "reports.view",
  "promotion.view",
] as const;

export type DashboardFocus =
  | "TEACHING"
  | "LEADERSHIP"
  | "ADMINISTRATION"
  | "GENERAL";

export interface DashboardActionContext {
  hasSections: boolean;
  attendanceAvailable: boolean;
  gradebookAvailable: boolean;
  reportsAvailable: boolean;
  promotionsAvailable: boolean;
}

export interface DashboardAction {
  id: string;
  label: string;
  description: string;
  to: string;
  enabled: boolean;
  reason: string | null;
}

function hasPermission(permissions: Set<string>, permission: string) {
  return permissions.has(permission);
}

export function determineDashboardFocus(
  permissions: string[],
  accessScope: AcademicAccessScope,
): DashboardFocus {
  const held = new Set(permissions);
  if (accessScope === "ASSIGNED") return "TEACHING";
  if (
    accessScope === "ALL" &&
    [
      "academic.manage",
      "promotion.approve",
      "reports.publish",
      "gradebook.edit",
    ].some((permission) => held.has(permission))
  ) {
    return "LEADERSHIP";
  }
  if (
    ["students.create", "staff.create", "users.manage", "roles.manage"].some(
      (permission) => held.has(permission),
    )
  ) {
    return "ADMINISTRATION";
  }
  return "GENERAL";
}

export function buildDashboardActions(
  permissions: string[],
  context: DashboardActionContext,
): DashboardAction[] {
  const held = new Set(permissions);
  const actions: DashboardAction[] = [];
  const add = (
    permission: string,
    action: Omit<DashboardAction, "enabled" | "reason">,
    available = true,
    reason: string | null = null,
  ) => {
    if (!held.has(permission)) return;
    actions.push({
      ...action,
      enabled: available,
      reason: available ? null : reason,
    });
  };

  add("students.create", {
    id: "register-student",
    label: "Register student",
    description: "Create a student and current-year enrolment.",
    to: "/students",
  });
  add("staff.create", {
    id: "add-staff",
    label: "Add school staff",
    description: "Create a staff profile and login account.",
    to: "/staff",
  });
  add(
    "attendance.mark",
    {
      id: "mark-attendance",
      label: "Mark attendance",
      description: "Open the daily register for an accessible section.",
      to: "/attendance",
    },
    context.hasSections && context.attendanceAvailable,
    context.hasSections
      ? "Attendance is unavailable for today's academic context."
      : "No accessible class section is assigned.",
  );
  add(
    "gradebook.edit",
    {
      id: "enter-scores",
      label: "Enter scores",
      description: "Complete assessment scores for the active term.",
      to: "/gradebook",
    },
    context.hasSections && context.gradebookAvailable,
    context.hasSections
      ? "No active assessment context is available."
      : "No accessible class section is assigned.",
  );
  add(
    "reports.publish",
    {
      id: "publish-reports",
      label: "Publish reports",
      description: "Review and publish completed report cards.",
      to: "/reports",
    },
    context.hasSections && context.reportsAvailable,
    context.hasSections
      ? "No active report context is available."
      : "No accessible class section is assigned.",
  );
  add(
    "promotion.recommend",
    {
      id: "recommend-promotions",
      label: "Recommend outcomes",
      description: "Recommend promotion, repeat or graduation outcomes.",
      to: "/promotions",
    },
    context.promotionsAvailable,
    "Promotion opens after the final configured term closes.",
  );
  add(
    "promotion.approve",
    {
      id: "approve-promotions",
      label: "Approve promotions",
      description: "Review and approve year-end outcomes.",
      to: "/promotions",
    },
    context.promotionsAvailable,
    "Promotion opens after the final configured term closes.",
  );
  add("academic.manage", {
    id: "academic-setup",
    label: "Academic setup",
    description: "Manage years, terms, streams and curriculum.",
    to: "/academic",
  });
  add("fees.manage", {
    id: "manage-fees",
    label: "Prepare fee schedule",
    description: "Create grade-level term fees and submit them for approval.",
    to: "/fees",
  });
  add("payments.record", {
    id: "record-payment",
    label: "Record payment",
    description: "Allocate a student payment and issue a receipt.",
    to: "/payments",
  });
  return actions;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function startOfUtcDay(value = new Date()) {
  const day = new Date(value);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

function percentage(numerator: number, denominator: number) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export async function getDashboard(
  userId: string,
  roleSlug: string,
  permissionList: string[],
  now = new Date(),
) {
  const permissions = new Set(permissionList);
  const needsAcademicContext =
    ACADEMIC_PERMISSIONS.some((permission) => permissions.has(permission)) ||
    permissions.has("students.view");
  const accessScope = needsAcademicContext
    ? await getAcademicAccessScope(userId, roleSlug)
    : "NONE";
  const focus = determineDashboardFocus(permissionList, accessScope);
  const widgets: Record<string, unknown> = {};

  const activeYear = needsAcademicContext
    ? await prisma.academicYear.findFirst({
        where: { status: "ACTIVE" },
        include: { terms: { orderBy: { sequence: "asc" } } },
      })
    : null;
  const activeTerm =
    activeYear?.terms.find((term) => term.status === TermStatus.ACTIVE) ?? null;
  const finalTerm = activeYear?.terms.at(-1) ?? null;

  const sectionWhere: Prisma.ClassSectionWhereInput = activeYear
    ? {
        academicYearId: activeYear.id,
        active: true,
        ...(accessScope === "ASSIGNED" ? { classTeacherId: userId } : {}),
      }
    : { id: "__no_active_year__" };
  const canAccessSections = accessScope !== "NONE";
  const sections = canAccessSections
    ? await prisma.classSection.findMany({
        where: sectionWhere,
        include: {
          gradeLevel: { select: { id: true, name: true } },
          classTeacher: { select: { id: true, name: true } },
          enrolments: {
            where: { status: EnrollmentStatus.ACTIVE },
            select: {
              id: true,
              studentId: true,
              student: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  admissionNo: true,
                  status: true,
                  enrolledAt: true,
                },
              },
            },
          },
        },
        orderBy: [{ gradeLevel: { order: "asc" } }, { name: "asc" }],
      })
    : [];
  const sectionIds = sections.map((section) => section.id);
  const accessibleEnrolments = sections.flatMap((section) =>
    section.enrolments.map((enrolment) => ({
      ...enrolment,
      sectionId: section.id,
      sectionName: section.name,
      gradeLevelId: section.gradeLevelId,
    })),
  );
  const enrolmentIds = accessibleEnrolments.map((enrolment) => enrolment.id);

  if (hasPermission(permissions, "students.view")) {
    const studentEnrolments = activeYear
      ? accessScope === "NONE"
        ? []
        : accessibleEnrolments
      : [];
    const recentAdmissions = [...studentEnrolments]
      .sort(
        (a, b) =>
          b.student.enrolledAt.getTime() - a.student.enrolledAt.getTime(),
      )
      .slice(0, 5)
      .map((enrolment) => ({
        id: enrolment.student.id,
        name: `${enrolment.student.firstName} ${enrolment.student.lastName}`,
        admissionNo: enrolment.student.admissionNo,
        sectionName: enrolment.sectionName,
        admittedAt: dateOnly(enrolment.student.enrolledAt),
      }));
    widgets.students = {
      total: studentEnrolments.length,
      active: studentEnrolments.filter(
        (enrolment) => enrolment.student.status === "ACTIVE",
      ).length,
      recentAdmissions,
    };
  }

  if (hasPermission(permissions, "staff.view")) {
    const staff = await prisma.schoolStaff.findMany({
      select: { status: true, category: true },
    });
    widgets.staff = {
      total: staff.length,
      active: staff.filter((item) => item.status === SchoolStaffStatus.ACTIVE)
        .length,
      inactive: staff.filter(
        (item) => item.status === SchoolStaffStatus.INACTIVE,
      ).length,
      teaching: staff.filter((item) => item.category === "TEACHING").length,
      administration: staff.filter((item) => item.category === "ADMIN").length,
      support: staff.filter((item) => item.category === "SUPPORT").length,
    };
  }

  if (hasPermission(permissions, "academic.view")) {
    widgets.academic = {
      available: !!activeYear,
      reason: activeYear ? null : "No active academic year is configured.",
      year: activeYear
        ? {
            id: activeYear.id,
            name: activeYear.name,
            startDate: dateOnly(activeYear.startDate),
            endDate: dateOnly(activeYear.endDate),
          }
        : null,
      term: activeTerm
        ? {
            id: activeTerm.id,
            name: activeTerm.name,
            sequence: activeTerm.sequence,
            startDate: dateOnly(activeTerm.startDate),
            endDate: dateOnly(activeTerm.endDate),
            status: activeTerm.status,
          }
        : null,
      sections: sections.map((section) => ({
        id: section.id,
        name: section.name,
        gradeLevelName: section.gradeLevel.name,
        studentCount: section.enrolments.length,
        teacherName: section.classTeacher?.name ?? "Unassigned",
      })),
    };
  }

  const today = startOfUtcDay(now);
  const todayInsideTerm =
    !!activeTerm &&
    today >= startOfUtcDay(activeTerm.startDate) &&
    today <= startOfUtcDay(activeTerm.endDate);
  const attendanceAvailable =
    !!activeTerm && todayInsideTerm && sectionIds.length > 0;

  if (hasPermission(permissions, "attendance.view")) {
    const records = attendanceAvailable
      ? await prisma.attendance.findMany({
          where: {
            termId: activeTerm!.id,
            date: today,
            enrolment: { classSectionId: { in: sectionIds } },
          },
          select: { status: true },
        })
      : [];
    const count = (status: AttendanceStatus) =>
      records.filter((record) => record.status === status).length;
    widgets.attendance = {
      date: dateOnly(today),
      available: attendanceAvailable,
      reason: !activeYear
        ? "No active academic year is configured."
        : !activeTerm
          ? "No active term is configured."
          : !todayInsideTerm
            ? `${dateOnly(today)} is outside ${activeTerm.name} (${dateOnly(activeTerm.startDate)} to ${dateOnly(activeTerm.endDate)}).`
            : sectionIds.length === 0
              ? "No accessible class section is assigned."
              : null,
      enrolled: accessibleEnrolments.length,
      marked: records.length,
      missing: Math.max(accessibleEnrolments.length - records.length, 0),
      present: count(AttendanceStatus.PRESENT),
      absent: count(AttendanceStatus.ABSENT),
      late: count(AttendanceStatus.LATE),
      excused: count(AttendanceStatus.EXCUSED),
      rate: percentage(
        count(AttendanceStatus.PRESENT) + count(AttendanceStatus.LATE),
        records.length,
      ),
    };
  }

  let completeEnrolmentIds = new Set<string>();
  let gradebookAvailable = false;
  if (
    (hasPermission(permissions, "gradebook.view") ||
      hasPermission(permissions, "reports.view")) &&
    activeYear &&
    activeTerm &&
    enrolmentIds.length > 0
  ) {
    const gradeLevelIds = [
      ...new Set(sections.map((section) => section.gradeLevelId)),
    ];
    const [scheme, curriculum, results] = await Promise.all([
      prisma.assessmentScheme.findUnique({
        where: { academicYearId: activeYear.id },
        include: { components: { select: { id: true } } },
      }),
      prisma.curriculumSubject.findMany({
        where: {
          academicYearId: activeYear.id,
          gradeLevelId: { in: gradeLevelIds },
          active: true,
        },
        select: { id: true, gradeLevelId: true },
      }),
      prisma.assessmentResult.findMany({
        where: { enrolmentId: { in: enrolmentIds }, termId: activeTerm.id },
        select: {
          enrolmentId: true,
          curriculumSubjectId: true,
          _count: { select: { scores: true } },
        },
      }),
    ]);
    gradebookAvailable = !!scheme && curriculum.length > 0;
    const expectedByGrade = new Map<string, number>();
    for (const subject of curriculum) {
      expectedByGrade.set(
        subject.gradeLevelId,
        (expectedByGrade.get(subject.gradeLevelId) ?? 0) + 1,
      );
    }
    const completedByEnrolment = new Map<string, number>();
    for (const result of results) {
      if (scheme && result._count.scores === scheme.components.length) {
        completedByEnrolment.set(
          result.enrolmentId,
          (completedByEnrolment.get(result.enrolmentId) ?? 0) + 1,
        );
      }
    }
    let expectedSubjects = 0;
    let completedSubjects = 0;
    for (const enrolment of accessibleEnrolments) {
      const expected = expectedByGrade.get(enrolment.gradeLevelId) ?? 0;
      const completed = completedByEnrolment.get(enrolment.id) ?? 0;
      expectedSubjects += expected;
      completedSubjects += completed;
      if (expected > 0 && completed >= expected)
        completeEnrolmentIds.add(enrolment.id);
    }
    if (hasPermission(permissions, "gradebook.view")) {
      widgets.gradebook = {
        available: gradebookAvailable,
        reason: !scheme
          ? "No assessment scheme is configured for the active year."
          : curriculum.length === 0
            ? "No curriculum subjects are configured for accessible sections."
            : null,
        termName: activeTerm.name,
        students: accessibleEnrolments.length,
        completeStudents: completeEnrolmentIds.size,
        incompleteStudents: Math.max(
          accessibleEnrolments.length - completeEnrolmentIds.size,
          0,
        ),
        completedSubjects,
        expectedSubjects,
        completionRate: percentage(completedSubjects, expectedSubjects),
      };
    }
  } else if (hasPermission(permissions, "gradebook.view")) {
    widgets.gradebook = {
      available: false,
      reason: !activeYear
        ? "No active academic year is configured."
        : !activeTerm
          ? "No active term is configured."
          : "No accessible student enrolments are available.",
      termName: activeTerm?.name ?? null,
      students: accessibleEnrolments.length,
      completeStudents: 0,
      incompleteStudents: accessibleEnrolments.length,
      completedSubjects: 0,
      expectedSubjects: 0,
      completionRate: null,
    };
  }

  const reportsAvailable = !!activeTerm && enrolmentIds.length > 0;
  if (hasPermission(permissions, "reports.view")) {
    const reports = reportsAvailable
      ? await prisma.termReport.findMany({
          where: { enrolmentId: { in: enrolmentIds }, termId: activeTerm!.id },
          select: {
            enrolmentId: true,
            status: true,
            teacherRemarks: true,
            currentVersion: true,
          },
        })
      : [];
    const reportByEnrolment = new Map(
      reports.map((report) => [report.enrolmentId, report]),
    );
    const published = reports.filter(
      (report) => report.status === ReportStatus.PUBLISHED,
    ).length;
    const ready = accessibleEnrolments.filter((enrolment) => {
      const report = reportByEnrolment.get(enrolment.id);
      return (
        completeEnrolmentIds.has(enrolment.id) &&
        !!report?.teacherRemarks?.trim() &&
        report.status !== ReportStatus.PUBLISHED
      );
    }).length;
    widgets.reports = {
      available: reportsAvailable,
      reason: reportsAvailable
        ? null
        : "No active term and accessible enrolments are available.",
      termName: activeTerm?.name ?? null,
      total: accessibleEnrolments.length,
      published,
      ready,
      draft: Math.max(accessibleEnrolments.length - published, 0),
      notStarted: accessibleEnrolments.filter(
        (enrolment) => !reportByEnrolment.has(enrolment.id),
      ).length,
    };
  }

  const promotionsAvailable =
    !!finalTerm &&
    finalTerm.status === TermStatus.CLOSED &&
    enrolmentIds.length > 0;
  if (hasPermission(permissions, "promotion.view")) {
    const promotions = promotionsAvailable
      ? await prisma.promotion.findMany({
          where: { currentEnrolmentId: { in: enrolmentIds } },
          select: { currentEnrolmentId: true, status: true },
        })
      : [];
    const recommended = new Set(
      promotions.map((promotion) => promotion.currentEnrolmentId),
    );
    widgets.promotions = {
      available: promotionsAvailable,
      reason: !finalTerm
        ? "No final term is configured."
        : finalTerm.status !== TermStatus.CLOSED
          ? `${finalTerm.name} must be closed before promotion begins.`
          : enrolmentIds.length === 0
            ? "No accessible active enrolments are available."
            : null,
      total: accessibleEnrolments.length,
      awaitingRecommendation: Math.max(
        accessibleEnrolments.length - recommended.size,
        0,
      ),
      awaitingApproval: promotions.filter(
        (promotion) => promotion.status === "PENDING",
      ).length,
      approved: promotions.filter(
        (promotion) => promotion.status === "APPROVED",
      ).length,
    };
  }

  if (
    hasPermission(permissions, "fees.view") ||
    hasPermission(permissions, "payments.view")
  ) {
    widgets.finance = await getFinanceSummary();
  }

  const actions = buildDashboardActions(permissionList, {
    hasSections: sectionIds.length > 0,
    attendanceAvailable,
    gradebookAvailable,
    reportsAvailable,
    promotionsAvailable,
  });

  return {
    generatedAt: new Date().toISOString(),
    focus,
    widgets,
    actions,
  };
}
