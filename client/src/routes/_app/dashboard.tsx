import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ComponentType, ReactNode } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarCheck,
  ClipboardCheck,
  GraduationCap,
  Landmark,
  ShieldAlert,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { dashboardApi, type ApiDashboard } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Lumen Suite" }] }),
  component: Dashboard,
});

type WidgetKey = keyof ApiDashboard["widgets"];

const widgetOrders: Record<ApiDashboard["focus"], WidgetKey[]> = {
  TEACHING: [
    "attendance",
    "gradebook",
    "reports",
    "academic",
    "students",
    "promotions",
    "staff",
    "finance",
    "accounting",
  ],
  LEADERSHIP: [
    "academic",
    "attendance",
    "gradebook",
    "reports",
    "promotions",
    "students",
    "staff",
    "finance",
    "accounting",
  ],
  ADMINISTRATION: [
    "students",
    "staff",
    "academic",
    "attendance",
    "gradebook",
    "reports",
    "promotions",
    "finance",
    "accounting",
  ],
  GENERAL: [
    "finance",
    "accounting",
    "students",
    "academic",
    "attendance",
    "gradebook",
    "reports",
    "promotions",
    "staff",
  ],
};

const actionRoutes = {
  "register-student": "/students",
  "add-staff": "/staff",
  "mark-attendance": "/attendance",
  "enter-scores": "/gradebook",
  "publish-reports": "/reports",
  "recommend-promotions": "/promotions",
  "approve-promotions": "/promotions",
  "academic-setup": "/academic",
  "manage-fees": "/fees",
  "record-payment": "/payments",
  "record-expense": "/accounting",
  "prepare-journal": "/accounting",
} as const;

function Dashboard() {
  const { user } = useAuth();
  const canView = hasPermission(user, "dashboard.view");
  const permissionFingerprint = [...(user?.permissions ?? [])].sort().join("|");
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", user?.id, permissionFingerprint],
    queryFn: dashboardApi.get,
    enabled: canView && !!user,
    staleTime: 0,
  });

  if (!canView) return <Forbidden />;
  if (dashboardQuery.isLoading) {
    return (
      <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
        Loading your dashboard…
      </div>
    );
  }
  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        {dashboardQuery.error instanceof Error
          ? dashboardQuery.error.message
          : "Unable to load the dashboard."}
      </div>
    );
  }

  const dashboard = dashboardQuery.data.dashboard;
  const visibleWidgetKeys = widgetOrders[dashboard.focus].filter(
    (key) => dashboard.widgets[key] !== undefined,
  );
  const description = {
    TEACHING: "Your assigned classes, attendance and academic work.",
    LEADERSHIP: "School-wide academic progress and pending decisions.",
    ADMINISTRATION: "School operations and administrative work requiring attention.",
    GENERAL: "The information available to your current role.",
  }[dashboard.focus];

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome back, ${user?.name.split(" ")[0]}`} description={description} />

      {dashboard.actions.length > 0 && (
        <section className="rounded-2xl border border-brand/20 bg-gradient-to-br from-brand/10 via-card to-card p-5 shadow-[var(--shadow-card)]">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-brand-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-semibold">Your next actions</h2>
              <p className="text-xs text-muted-foreground">
                Generated from your permissions and accessible class scope.
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {dashboard.actions.map((action) => {
              const route = actionRoutes[action.id as keyof typeof actionRoutes];
              const content = (
                <>
                  <div className="font-medium">{action.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {action.enabled ? action.description : action.reason}
                  </div>
                  <ArrowRight className="absolute right-3 top-3 h-4 w-4 text-brand" />
                </>
              );
              return action.enabled && route ? (
                <Link
                  key={action.id}
                  to={route}
                  className="relative rounded-xl border bg-card p-4 pr-10 text-sm transition hover:border-brand/50 hover:shadow-sm"
                >
                  {content}
                </Link>
              ) : (
                <div
                  key={action.id}
                  className="relative rounded-xl border bg-muted/30 p-4 pr-10 text-sm opacity-70"
                >
                  {content}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {visibleWidgetKeys.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleWidgetKeys.map((key) => (
            <Widget key={key} type={key} dashboard={dashboard} />
          ))}
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed bg-card p-10 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">No dashboard widgets are available yet</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            Your role can access the dashboard, but none of its permitted modules currently expose
            operational dashboard data.
          </p>
        </section>
      )}
    </div>
  );
}

function Widget({ type, dashboard }: { type: WidgetKey; dashboard: ApiDashboard }) {
  const widget = dashboard.widgets[type];
  if (!widget) return null;

  switch (type) {
    case "students": {
      const data = dashboard.widgets.students!;
      return (
        <Panel title="Students" icon={GraduationCap} href="/students">
          <Metric value={data.total} label="Current enrolments" />
          <p className="mt-1 text-xs text-muted-foreground">{data.active} active students</p>
          {data.recentAdmissions.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Recent admissions
              </div>
              <div className="space-y-2">
                {data.recentAdmissions.slice(0, 3).map((student) => (
                  <div key={student.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-medium">{student.name}</span>
                    <span className="shrink-0 text-muted-foreground">{student.sectionName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      );
    }
    case "staff": {
      const data = dashboard.widgets.staff!;
      return (
        <Panel title="School staff" icon={Users} href="/staff">
          <Metric value={data.active} label="Active staff" />
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <SmallMetric value={data.teaching} label="Teaching" />
            <SmallMetric value={data.administration} label="Admin" />
            <SmallMetric value={data.support} label="Support" />
          </div>
          {data.inactive > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">{data.inactive} inactive</p>
          )}
        </Panel>
      );
    }
    case "academic": {
      const data = dashboard.widgets.academic!;
      return (
        <Panel title="Academic context" icon={BookOpenCheck} href="/academic">
          {data.available && data.year ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xl font-semibold">{data.year.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {data.term?.name ?? "No active term"}
                  </div>
                </div>
                {data.term && <Badge variant="outline">{data.term.status}</Badge>}
              </div>
              <div className="mt-4 space-y-2 border-t pt-3">
                {data.sections.length > 0 ? (
                  data.sections.slice(0, 4).map((section) => (
                    <div key={section.id} className="flex justify-between gap-3 text-xs">
                      <span className="font-medium">{section.name}</span>
                      <span className="text-muted-foreground">{section.studentCount} students</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No accessible class sections.</p>
                )}
              </div>
            </>
          ) : (
            <Unavailable reason={data.reason} />
          )}
        </Panel>
      );
    }
    case "attendance": {
      const data = dashboard.widgets.attendance!;
      return (
        <Panel title="Today’s attendance" icon={CalendarCheck} href="/attendance">
          {data.available ? (
            <>
              <Metric
                value={data.rate === null ? "—" : `${data.rate}%`}
                label={`${data.marked} of ${data.enrolled} marked`}
              />
              <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                <SmallMetric value={data.present} label="Present" />
                <SmallMetric value={data.absent} label="Absent" />
                <SmallMetric value={data.late} label="Late" />
                <SmallMetric value={data.missing} label="Unmarked" />
              </div>
            </>
          ) : (
            <Unavailable reason={data.reason} />
          )}
        </Panel>
      );
    }
    case "gradebook": {
      const data = dashboard.widgets.gradebook!;
      return (
        <Panel title="Gradebook progress" icon={ClipboardCheck} href="/gradebook">
          {data.available ? (
            <>
              <Metric
                value={data.completionRate === null ? "—" : `${data.completionRate}%`}
                label={`${data.termName} score completion`}
              />
              <Progress value={data.completionRate ?? 0} />
              <p className="mt-3 text-xs text-muted-foreground">
                {data.completeStudents} complete · {data.incompleteStudents} requiring scores
              </p>
            </>
          ) : (
            <Unavailable reason={data.reason} />
          )}
        </Panel>
      );
    }
    case "reports": {
      const data = dashboard.widgets.reports!;
      return (
        <Panel title="Term reports" icon={BookOpenCheck} href="/reports">
          {data.available ? (
            <>
              <Metric value={data.published} label={`${data.termName} reports published`} />
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <SmallMetric value={data.ready} label="Ready" />
                <SmallMetric value={data.draft} label="Draft" />
                <SmallMetric value={data.notStarted} label="Not started" />
              </div>
            </>
          ) : (
            <Unavailable reason={data.reason} />
          )}
        </Panel>
      );
    }
    case "promotions": {
      const data = dashboard.widgets.promotions!;
      return (
        <Panel title="Promotion workflow" icon={UserPlus} href="/promotions">
          {data.available ? (
            <>
              <Metric value={data.approved} label="Approved outcomes" />
              <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
                <SmallMetric value={data.awaitingRecommendation} label="Need recommendation" />
                <SmallMetric value={data.awaitingApproval} label="Need approval" />
              </div>
            </>
          ) : (
            <Unavailable reason={data.reason} />
          )}
        </Panel>
      );
    }
    case "finance": {
      const data = dashboard.widgets.finance!;
      return (
        <Panel title="School fees" icon={Wallet} href="/fees">
          {data.available ? (
            <>
              <Metric
                value={new Intl.NumberFormat("en-GH", {
                  style: "currency",
                  currency: "GHS",
                }).format(data.collected)}
                label={`${data.termName} collected`}
              />
              <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
                <SmallMetric value={`${data.collectionRate ?? 0}%`} label="Collection rate" />
                <SmallMetric
                  value={new Intl.NumberFormat("en-GH", {
                    style: "currency",
                    currency: "GHS",
                    notation: "compact",
                  }).format(data.outstanding)}
                  label="Outstanding"
                />
              </div>
            </>
          ) : (
            <Unavailable reason={data.reason} />
          )}
        </Panel>
      );
    }
    case "accounting": {
      const data = dashboard.widgets.accounting!;
      return (
        <Panel title="School accounting" icon={Landmark} href="/accounting">
          {data.available ? (
            <>
              <Metric
                value={new Intl.NumberFormat("en-GH", {
                  style: "currency",
                  currency: "GHS",
                }).format(data.cashPosition)}
                label="Cash position"
              />
              <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
                <SmallMetric
                  value={new Intl.NumberFormat("en-GH", {
                    style: "currency",
                    currency: "GHS",
                    notation: "compact",
                  }).format(data.receivables)}
                  label="Receivables"
                />
                <SmallMetric
                  value={new Intl.NumberFormat("en-GH", {
                    style: "currency",
                    currency: "GHS",
                    notation: "compact",
                  }).format(data.payables)}
                  label="Payables"
                />
              </div>
            </>
          ) : (
            <Unavailable reason={data.reason} />
          )}
        </Panel>
      );
    }
  }
}

function Panel({
  title,
  icon: Icon,
  href,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  href:
    | "/students"
    | "/staff"
    | "/academic"
    | "/attendance"
    | "/gradebook"
    | "/reports"
    | "/promotions"
    | "/fees"
    | "/accounting";
  children: ReactNode;
}) {
  return (
    <article className="rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand/10 text-brand">
            <Icon className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs">
          <Link to={href}>Open</Link>
        </Button>
      </div>
      {children}
    </article>
  );
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <div className="text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function SmallMetric({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-2">
      <div className="font-semibold">{value}</div>
      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-brand transition-[width]"
        style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
      />
    </div>
  );
}

function Unavailable({ reason }: { reason: string | null }) {
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-muted-foreground">
      {reason ?? "This information is not currently available."}
    </div>
  );
}
