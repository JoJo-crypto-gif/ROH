// Role-Based Access Control - permissions, roles, scopes
// Permissions are NOT hardcoded to roles in the UI; we always check permission strings.

export type Permission =
  // Students
  | "students.view"
  | "students.create"
  | "students.update"
  | "students.delete"
  // Staff
  | "staff.view"
  | "staff.create"
  | "staff.update"
  | "staff.delete"
  // Academic
  | "academic.view"
  | "academic.manage"
  // Attendance
  | "attendance.view"
  | "attendance.mark"
  | "gradebook.view"
  | "gradebook.edit"
  // Fees
  | "fees.view"
  | "fees.manage"
  | "fees.publish"
  | "fees.adjust"
  | "fees.adjust.approve"
  // Payments
  | "payments.view"
  | "payments.record"
  | "payments.reverse"
  | "payments.reverse.approve"
  | "credits.allocate"
  // Receipts
  | "receipts.view"
  | "receipts.print"
  // Debtors
  | "debtors.view"
  // Accounting
  | "accounting.view"
  | "accounting.setup"
  | "accounting.periods.manage"
  | "journals.create"
  | "journals.approve"
  | "journals.reverse"
  | "expenses.view"
  | "expenses.create"
  | "expenses.approve"
  | "expenses.pay"
  | "expenses.reverse"
  | "reconciliation.view"
  | "reconciliation.manage"
  | "reconciliation.approve"
  | "accounting.reports.view"
  // Promotion
  | "promotion.view"
  | "promotion.recommend"
  | "promotion.approve"
  // Reports
  | "reports.view"
  | "reports.publish"
  | "reports.reissue"
  // Users & roles
  | "users.manage"
  | "roles.manage"
  // Dashboard
  | "dashboard.view"
  // Future modules
  | "ngo.view"
  | "inventory.view";

export type Scope =
  | "all"
  | "school"
  | "ngo"
  | "accounting"
  | "inventory"
  | "class" // assigned class only
  | "department";

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  builtIn?: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarInitials: string;
  roleId: string;
  roleName: string;
  permissions: Permission[];
  scopes: Scope[];
  assignedClassId?: string;
}

export const ALL_PERMISSIONS: { module: string; items: { key: Permission; label: string }[] }[] = [
  { module: "Dashboard", items: [{ key: "dashboard.view", label: "View dashboard" }] },
  {
    module: "Students",
    items: [
      { key: "students.view", label: "View students" },
      { key: "students.create", label: "Create students" },
      { key: "students.update", label: "Update students" },
      { key: "students.delete", label: "Delete students" },
    ],
  },
  {
    module: "Staff",
    items: [
      { key: "staff.view", label: "View staff" },
      { key: "staff.create", label: "Create staff" },
      { key: "staff.update", label: "Update staff" },
      { key: "staff.delete", label: "Deactivate staff" },
    ],
  },
  {
    module: "Academic",
    items: [
      { key: "academic.view", label: "View academic setup" },
      { key: "academic.manage", label: "Manage years, terms, classes, subjects" },
    ],
  },
  {
    module: "Attendance",
    items: [
      { key: "attendance.view", label: "View attendance" },
      { key: "attendance.mark", label: "Mark attendance" },
    ],
  },
  {
    module: "Gradebook",
    items: [
      { key: "gradebook.view", label: "View gradebook" },
      { key: "gradebook.edit", label: "Edit gradebook" },
    ],
  },
  {
    module: "Fees",
    items: [
      { key: "fees.view", label: "View fee items" },
      { key: "fees.manage", label: "Create / assign fee items" },
      { key: "fees.publish", label: "Publish fee schedules" },
      { key: "fees.adjust", label: "Request fee adjustments" },
      { key: "fees.adjust.approve", label: "Approve fee adjustments" },
    ],
  },
  {
    module: "Payments",
    items: [
      { key: "payments.view", label: "View payments" },
      { key: "payments.record", label: "Record payments" },
      { key: "payments.reverse", label: "Request payment reversals" },
      { key: "payments.reverse.approve", label: "Approve payment reversals" },
      { key: "credits.allocate", label: "Allocate student credit" },
    ],
  },
  {
    module: "Receipts",
    items: [
      { key: "receipts.view", label: "View receipts" },
      { key: "receipts.print", label: "Print receipts" },
    ],
  },
  { module: "Debtors", items: [{ key: "debtors.view", label: "View debtors" }] },
  {
    module: "Accounting",
    items: [
      { key: "accounting.view", label: "View school accounting" },
      { key: "accounting.setup", label: "Configure accounting" },
      { key: "accounting.periods.manage", label: "Open / close accounting periods" },
      { key: "journals.create", label: "Prepare journals" },
      { key: "journals.approve", label: "Approve journals" },
      { key: "journals.reverse", label: "Reverse journals" },
      { key: "expenses.view", label: "View expenses" },
      { key: "expenses.create", label: "Record expenses" },
      { key: "expenses.approve", label: "Approve expenses" },
      { key: "expenses.pay", label: "Pay approved expenses" },
      { key: "expenses.reverse", label: "Reverse expenses" },
      { key: "reconciliation.view", label: "View reconciliations" },
      { key: "reconciliation.manage", label: "Prepare reconciliations" },
      { key: "reconciliation.approve", label: "Approve reconciliations" },
      { key: "accounting.reports.view", label: "View financial statements" },
    ],
  },
  {
    module: "Promotion",
    items: [
      { key: "promotion.view", label: "View promotion workflow" },
      { key: "promotion.recommend", label: "Recommend promotions" },
      { key: "promotion.approve", label: "Approve promotions" },
    ],
  },
  {
    module: "Reports",
    items: [
      { key: "reports.view", label: "View reports" },
      { key: "reports.publish", label: "Publish reports" },
      { key: "reports.reissue", label: "Reissue reports" },
    ],
  },
  {
    module: "User management",
    items: [
      { key: "users.manage", label: "Manage users" },
      { key: "roles.manage", label: "Manage roles & permissions" },
    ],
  },
  {
    module: "Future modules",
    items: [
      { key: "ngo.view", label: "Access NGO module" },
      { key: "inventory.view", label: "Access inventory" },
    ],
  },
];

const flat = ALL_PERMISSIONS.flatMap((g) => g.items.map((i) => i.key));

export const DEFAULT_ROLES: RoleDefinition[] = [
  {
    id: "super-admin",
    name: "Super Admin",
    builtIn: true,
    description: "Full access across all modules and departments.",
    permissions: flat,
  },
  {
    id: "school-admin",
    name: "School Admin",
    builtIn: true,
    description: "Manages all school operations.",
    permissions: flat.filter((p) => !p.startsWith("ngo") && !p.startsWith("inventory")),
  },
  {
    id: "headteacher",
    name: "Headteacher",
    builtIn: true,
    description: "Academic leadership, promotions, reports.",
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
      "fees.view",
      "payments.view",
      "debtors.view",
      "promotion.view",
      "promotion.recommend",
      "promotion.approve",
      "reports.view",
      "reports.publish",
      "reports.reissue",
    ],
  },
  {
    id: "teacher",
    name: "Teacher",
    builtIn: true,
    description: "Class attendance and student view (scoped to assigned class).",
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
    id: "bursar",
    name: "Bursar / Accountant",
    builtIn: true,
    description: "Fees, payments, receipts, debtors and reports.",
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
    id: "receptionist",
    name: "Receptionist",
    builtIn: true,
    description: "Front desk: enrol students, basic lookups.",
    permissions: ["dashboard.view", "students.view", "students.create", "staff.view"],
  },
];

export function hasPermission(user: AuthUser | null, perm: Permission | Permission[]): boolean {
  if (!user) return false;
  const list = Array.isArray(perm) ? perm : [perm];
  return list.some((p) => user.permissions.includes(p));
}

export function hasScope(user: AuthUser | null, scope: Scope): boolean {
  if (!user) return false;
  return user.scopes.includes("all") || user.scopes.includes(scope);
}
