export const ALL_PERMISSIONS = [
  "dashboard.view",
  "students.view",
  "students.create",
  "students.update",
  "students.delete",
  "staff.view",
  "staff.create",
  "staff.update",
  "staff.delete",
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
  "fees.view",
  "fees.manage",
  "fees.publish",
  "fees.adjust",
  "fees.adjust.approve",
  "payments.view",
  "payments.record",
  "payments.reverse",
  "payments.reverse.approve",
  "credits.allocate",
  "receipts.view",
  "receipts.print",
  "debtors.view",
  "accounting.view",
  "accounting.setup",
  "accounting.periods.manage",
  "journals.create",
  "journals.approve",
  "journals.reverse",
  "expenses.view",
  "expenses.create",
  "expenses.approve",
  "expenses.pay",
  "expenses.reverse",
  "reconciliation.view",
  "reconciliation.manage",
  "reconciliation.approve",
  "accounting.reports.view",
  "roles.manage",
  "users.manage",
  "ngo.view",
  "ngo.centres.view",
  "ngo.centres.manage",
  "ngo.beneficiaries.view",
  "ngo.beneficiaries.manage",
  "inventory.view",
] as const;

export type PermissionKey = (typeof ALL_PERMISSIONS)[number];

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export function isPermission(value: string): value is PermissionKey {
  return PERMISSION_SET.has(value);
}

export function invalidPermissions(permissions: string[]) {
  return permissions.filter((permission) => !isPermission(permission));
}
