import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  CalendarDays,
  ClipboardCheck,
  Wallet,
  Receipt,
  AlertTriangle,
  ArrowUpCircle,
  BarChart3,
  ShieldCheck,
  Building2,
  HeartHandshake,
  BookOpenCheck,
  Boxes,
  Settings,
  ChevronRight,
  LayoutGrid,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { hasPermission, type Permission } from "@/lib/rbac";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  perm: Permission | Permission[];
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const groups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
    ],
  },
  {
    label: "School",
    items: [
      { label: "Classes", to: "/classes", icon: LayoutGrid, perm: "academic.view" },
      { label: "Students", to: "/students", icon: GraduationCap, perm: "students.view" },
      { label: "Staff", to: "/staff", icon: Users, perm: "staff.view" },
      { label: "Academic Setup", to: "/academic", icon: BookOpenCheck, perm: "academic.view" },
      { label: "Calendar", to: "/calendar", icon: CalendarDays, perm: "academic.view" },
      { label: "Attendance", to: "/attendance", icon: ClipboardCheck, perm: "attendance.view" },
      { label: "Gradebook", to: "/gradebook", icon: BookOpenCheck, perm: "gradebook.view" },
      { label: "Promotions", to: "/promotions", icon: ArrowUpCircle, perm: "promotion.view" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Fees", to: "/fees", icon: Wallet, perm: "fees.view" },
      { label: "Payments", to: "/payments", icon: CalendarDays, perm: "payments.view" },
      { label: "Receipts", to: "/receipts", icon: Receipt, perm: "receipts.view" },
      { label: "Debtors", to: "/debtors", icon: AlertTriangle, perm: "debtors.view" },
    ],
  },
  {
    label: "Insights",
    items: [{ label: "Reports", to: "/reports", icon: BarChart3, perm: "reports.view" }],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", to: "/users", icon: Users, perm: "users.manage" },
      { label: "Roles & Permissions", to: "/roles", icon: ShieldCheck, perm: "roles.manage" },
    ],
  },
  {
    label: "Other Modules",
    items: [
      { label: "NGO", to: "/ngo", icon: HeartHandshake, perm: "ngo.view" },
      { label: "Accounting", to: "/accounting", icon: Building2, perm: "accounting.view" },
      { label: "Inventory", to: "/inventory", icon: Boxes, perm: "inventory.view" },
    ],
  },
];

export function Sidebar() {
  const { user } = useAuth();
  const { logo, brandName } = useTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-sidebar-border">
        {logo ? (
          <img
            src={logo}
            alt={`${brandName} logo`}
            className="h-9 w-9 rounded-xl object-cover ring-1 ring-border"
          />
        ) : (
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-brand-foreground shadow-[var(--shadow-card)]">
            <BookOpenCheck className="h-5 w-5" />
          </div>
        )}
        <div className="flex flex-col leading-tight">
          <span className="font-semibold tracking-tight text-sidebar-foreground">{brandName}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            School · NGO · Ops
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {groups.map((group) => {
          const visible = group.items.filter((i) => hasPermission(user, i.perm));
          if (visible.length === 0) return null;
          return (
            <div key={group.label}>
              <div className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {visible.map((item) => {
                  const active = pathname === item.to || pathname.startsWith(item.to + "/");
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        active
                          ? "bg-brand text-brand-foreground shadow-[var(--shadow-card)]"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          active
                            ? "text-brand-accent"
                            : "text-muted-foreground group-hover:text-foreground",
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                      {active && <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-70" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <Link
          to="/settings"
          className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <Settings className="h-4 w-4" /> Settings
        </Link>
      </div>
    </aside>
  );
}
