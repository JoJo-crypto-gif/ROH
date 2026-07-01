import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  ChevronDown,
  LayoutGrid,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { hasPermission, type Permission } from "@/lib/rbac";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  perm: Permission | Permission[];
  section?: string;
}
interface NavGroup {
  id: "school" | "ngo" | "hr" | "operations";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

const groups: NavGroup[] = [
  {
    id: "school",
    label: "School",
    icon: GraduationCap,
    items: [
      {
        label: "Classes",
        to: "/classes",
        icon: LayoutGrid,
        perm: "academic.view",
        section: "Academics",
      },
      {
        label: "Students",
        to: "/students",
        icon: GraduationCap,
        perm: "students.view",
        section: "Academics",
      },
      {
        label: "Academic Setup",
        to: "/academic",
        icon: BookOpenCheck,
        perm: "academic.view",
        section: "Academics",
      },
      {
        label: "Calendar",
        to: "/calendar",
        icon: CalendarDays,
        perm: "academic.view",
        section: "Academics",
      },
      {
        label: "Attendance",
        to: "/attendance",
        icon: ClipboardCheck,
        perm: "attendance.view",
        section: "Academics",
      },
      {
        label: "Gradebook",
        to: "/gradebook",
        icon: BookOpenCheck,
        perm: "gradebook.view",
        section: "Academics",
      },
      {
        label: "Promotions",
        to: "/promotions",
        icon: ArrowUpCircle,
        perm: "promotion.view",
        section: "Academics",
      },
      { label: "Fees", to: "/fees", icon: Wallet, perm: "fees.view", section: "Finance" },
      {
        label: "Payments",
        to: "/payments",
        icon: CalendarDays,
        perm: "payments.view",
        section: "Finance",
      },
      {
        label: "Receipts",
        to: "/receipts",
        icon: Receipt,
        perm: "receipts.view",
        section: "Finance",
      },
      {
        label: "Debtors",
        to: "/debtors",
        icon: AlertTriangle,
        perm: "debtors.view",
        section: "Finance",
      },
      {
        label: "School Accounting",
        to: "/accounting",
        icon: Building2,
        perm: "accounting.view",
        section: "Finance",
      },
      {
        label: "Reports",
        to: "/reports",
        icon: BarChart3,
        perm: "reports.view",
        section: "Insights",
      },
    ],
  },
  {
    id: "ngo",
    label: "NGO",
    icon: HeartHandshake,
    items: [
      { label: "Overview", to: "/ngo", icon: HeartHandshake, perm: "ngo.view" },
      {
        label: "Care Centres",
        to: "/ngo/centres",
        icon: Building2,
        perm: "ngo.centres.view",
      },
      {
        label: "Beneficiaries",
        to: "/ngo/beneficiaries",
        icon: Users,
        perm: "ngo.beneficiaries.view",
      },
    ],
  },
  {
    id: "hr",
    label: "HR & Administration",
    icon: Users,
    items: [
      { label: "Staff", to: "/staff", icon: Users, perm: "staff.view" },
      { label: "Users", to: "/users", icon: Users, perm: "users.manage" },
      {
        label: "Roles & Permissions",
        to: "/roles",
        icon: ShieldCheck,
        perm: "roles.manage",
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: Boxes,
    items: [{ label: "Inventory", to: "/inventory", icon: Boxes, perm: "inventory.view" }],
  },
];

const dashboardItem: NavItem = {
  label: "Dashboard",
  to: "/dashboard",
  icon: LayoutDashboard,
  perm: "dashboard.view",
};

export function Sidebar() {
  const { user } = useAuth();
  const { logo, brandName } = useTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeGroupId =
    groups.find((group) =>
      group.items.some((item) => hasPermission(user, item.perm) && isItemActive(item, pathname)),
    )?.id ?? null;
  const [openGroupId, setOpenGroupId] = useState<NavGroup["id"] | null>(activeGroupId);

  useEffect(() => {
    setOpenGroupId(activeGroupId);
  }, [activeGroupId]);

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
            School · NGO · HR
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {hasPermission(user, dashboardItem.perm) ? (
          <NavLink item={dashboardItem} pathname={pathname} />
        ) : null}

        <div className="my-3 border-t border-sidebar-border" />

        {groups.map((group) => {
          const visible = group.items.filter((i) => hasPermission(user, i.perm));
          if (visible.length === 0) return null;
          const groupActive = visible.some((item) => isItemActive(item, pathname));
          const GroupIcon = group.icon;
          return (
            <Collapsible
              key={group.id}
              open={openGroupId === group.id}
              onOpenChange={(open) => setOpenGroupId(open ? group.id : null)}
              className="group/module"
            >
              <CollapsibleTrigger
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors hover:bg-sidebar-accent",
                  groupActive ? "text-brand" : "text-sidebar-foreground",
                )}
              >
                <GroupIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">{group.label}</span>
                <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]/module:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 space-y-0.5 pl-2">
                {visible.map((item, index) => {
                  const showSection = item.section && item.section !== visible[index - 1]?.section;
                  return (
                    <div key={item.to}>
                      {showSection ? (
                        <div className="mb-1 mt-3 px-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground first:mt-1">
                          {item.section}
                        </div>
                      ) : null}
                      <NavLink item={item} pathname={pathname} nested />
                    </div>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
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

function isItemActive(item: NavItem, pathname: string) {
  if (item.to === "/ngo") return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function NavLink({
  item,
  pathname,
  nested = false,
}: {
  item: NavItem;
  pathname: string;
  nested?: boolean;
}) {
  const active = isItemActive(item, pathname);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
        nested && "ml-1",
        active
          ? "bg-brand text-brand-foreground shadow-[var(--shadow-card)]"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          active ? "text-brand-accent" : "text-muted-foreground group-hover:text-foreground",
        )}
      />
      <span className="truncate">{item.label}</span>
      {active ? <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-70" /> : null}
    </Link>
  );
}
