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
        permissions: ALL_PERMISSIONS.filter((p) => !p.startsWith("ngo") && !p.startsWith("accounting") && !p.startsWith("inventory")),
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
    // ── 1. Create roles ────────────────────────────────────
    for (const roleDef of BUILT_IN_ROLES) {
        const existing = await prisma.role.findUnique({ where: { slug: roleDef.slug } });
        if (existing) {
            // Update permissions for existing built-in roles
            await prisma.rolePermission.deleteMany({ where: { roleId: existing.id } });
            await prisma.rolePermission.createMany({
                data: roleDef.permissions.map((p) => ({ roleId: existing.id, permission: p })),
            });
            console.log(`  ✓ Role "${roleDef.name}" updated (${roleDef.permissions.length} permissions)`);
        }
        else {
            await prisma.role.create({
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
            console.log(`  ✓ Role "${roleDef.name}" created (${roleDef.permissions.length} permissions)`);
        }
    }
    // ── 2. Create super-admin user ─────────────────────────
    const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@erp.com";
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || "admin123";
    const adminName = process.env.SEED_ADMIN_NAME || "Super Admin";
    const superAdminRole = await prisma.role.findUnique({ where: { slug: "super-admin" } });
    if (!superAdminRole) {
        throw new Error("Super Admin role not found after seeding!");
    }
    const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!existingAdmin) {
        const passwordHash = await bcrypt.hash(adminPassword, 12);
        await prisma.user.create({
            data: {
                email: adminEmail,
                passwordHash,
                name: adminName,
                roleId: superAdminRole.id,
            },
        });
        console.log(`\n  ✓ Super Admin user created: ${adminEmail}`);
    }
    else {
        console.log(`\n  ⓘ Super Admin user already exists: ${adminEmail}`);
    }
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
//# sourceMappingURL=seed.js.map