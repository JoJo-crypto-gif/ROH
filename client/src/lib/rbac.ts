// Role-Based Access Control - permissions, roles, scopes
// Permissions are NOT hardcoded to roles in the UI; we always check permission strings.

export type Permission =
  // Students
  | "students.view" | "students.create" | "students.update" | "students.delete"
  // Staff
  | "staff.view" | "staff.create" | "staff.update" | "staff.delete"
  // Academic
  | "academic.view" | "academic.manage"
  // Attendance
  | "attendance.view" | "attendance.mark"
  // Fees
  | "fees.view" | "fees.manage"
  // Payments
  | "payments.view" | "payments.record"
  // Receipts
  | "receipts.view" | "receipts.print"
  // Debtors
  | "debtors.view"
  // Promotion
  | "promotion.view" | "promotion.recommend" | "promotion.approve"
  // Reports
  | "reports.view"
  // Users & roles
  | "users.manage" | "roles.manage"
  // Dashboard
  | "dashboard.view"
  // Future modules
  | "ngo.view" | "accounting.view" | "inventory.view";

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
  { module: "Students", items: [
    { key: "students.view", label: "View students" },
    { key: "students.create", label: "Create students" },
    { key: "students.update", label: "Update students" },
    { key: "students.delete", label: "Delete students" },
  ]},
  { module: "Staff", items: [
    { key: "staff.view", label: "View staff" },
    { key: "staff.create", label: "Create staff" },
    { key: "staff.update", label: "Update staff" },
    { key: "staff.delete", label: "Deactivate staff" },
  ]},
  { module: "Academic", items: [
    { key: "academic.view", label: "View academic setup" },
    { key: "academic.manage", label: "Manage years, terms, classes, subjects" },
  ]},
  { module: "Attendance", items: [
    { key: "attendance.view", label: "View attendance" },
    { key: "attendance.mark", label: "Mark attendance" },
  ]},
  { module: "Fees", items: [
    { key: "fees.view", label: "View fee items" },
    { key: "fees.manage", label: "Create / assign fee items" },
  ]},
  { module: "Payments", items: [
    { key: "payments.view", label: "View payments" },
    { key: "payments.record", label: "Record payments" },
  ]},
  { module: "Receipts", items: [
    { key: "receipts.view", label: "View receipts" },
    { key: "receipts.print", label: "Print receipts" },
  ]},
  { module: "Debtors", items: [{ key: "debtors.view", label: "View debtors" }] },
  { module: "Promotion", items: [
    { key: "promotion.view", label: "View promotion workflow" },
    { key: "promotion.recommend", label: "Recommend promotions" },
    { key: "promotion.approve", label: "Approve promotions" },
  ]},
  { module: "Reports", items: [{ key: "reports.view", label: "View reports" }] },
  { module: "User management", items: [
    { key: "users.manage", label: "Manage users" },
    { key: "roles.manage", label: "Manage roles & permissions" },
  ]},
  { module: "Future modules", items: [
    { key: "ngo.view", label: "Access NGO module" },
    { key: "accounting.view", label: "Access accounting" },
    { key: "inventory.view", label: "Access inventory" },
  ]},
];

const flat = ALL_PERMISSIONS.flatMap(g => g.items.map(i => i.key));

export const DEFAULT_ROLES: RoleDefinition[] = [
  {
    id: "super-admin", name: "Super Admin", builtIn: true,
    description: "Full access across all modules and departments.",
    permissions: flat,
  },
  {
    id: "school-admin", name: "School Admin", builtIn: true,
    description: "Manages all school operations.",
    permissions: flat.filter(p => !p.startsWith("ngo") && !p.startsWith("accounting") && !p.startsWith("inventory")),
  },
  {
    id: "headteacher", name: "Headteacher", builtIn: true,
    description: "Academic leadership, promotions, reports.",
    permissions: [
      "dashboard.view","students.view","students.update","staff.view","academic.view","academic.manage",
      "attendance.view","attendance.mark","fees.view","payments.view","debtors.view",
      "promotion.view","promotion.recommend","promotion.approve","reports.view",
    ],
  },
  {
    id: "teacher", name: "Teacher", builtIn: true,
    description: "Class attendance and student view (scoped to assigned class).",
    permissions: ["dashboard.view","students.view","attendance.view","attendance.mark","promotion.view","promotion.recommend"],
  },
  {
    id: "bursar", name: "Bursar / Accountant", builtIn: true,
    description: "Fees, payments, receipts, debtors and reports.",
    permissions: [
      "dashboard.view","students.view","fees.view","fees.manage",
      "payments.view","payments.record","receipts.view","receipts.print",
      "debtors.view","reports.view",
    ],
  },
  {
    id: "receptionist", name: "Receptionist", builtIn: true,
    description: "Front desk: enrol students, basic lookups.",
    permissions: ["dashboard.view","students.view","students.create","staff.view"],
  },
];

export function hasPermission(user: AuthUser | null, perm: Permission | Permission[]): boolean {
  if (!user) return false;
  const list = Array.isArray(perm) ? perm : [perm];
  return list.some(p => user.permissions.includes(p));
}

export function hasScope(user: AuthUser | null, scope: Scope): boolean {
  if (!user) return false;
  return user.scopes.includes("all") || user.scopes.includes(scope);
}
