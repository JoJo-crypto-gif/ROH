import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, GraduationCap, BookOpen, ClipboardCheck, Wallet, Receipt, AlertTriangle, ArrowUpRight, TrendingUp, ArrowDownRight, Plus, Send, ArrowDownToLine } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  students, staff, classes, payments, todayAttendance, studentBalance, formatCurrency, cashFlowData, feeItems,
} from "@/lib/mock-data";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Lumen Suite" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  if (!hasPermission(user, "dashboard.view")) return <Forbidden />;

  const att = todayAttendance();
  const present = att.filter(a => a.status === "Present").length;
  const totalExpected = students.filter(s => s.status === "active").length * feeItems.reduce((a, f) => a + f.amount, 0);
  const totalCollected = payments.filter(p => p.status === "Success").reduce((a, p) => a + p.amount, 0);
  const outstanding = students.reduce((a, s) => a + Math.max(studentBalance(s.id), 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.name.split(" ")[0]}`}
        description="Here's what's happening across Rays Of Hope today."
        actions={
          <>
            <Button variant="outline" size="sm">Export</Button>
            <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Quick action</Button>
          </>
        }
      />

      {/* Hero balance card — inspired by reference */}
      <div className="relative overflow-hidden rounded-2xl p-6 md:p-7 text-brand-foreground shadow-[var(--shadow-elevated)]" style={{ backgroundImage: "var(--gradient-brand)" }}>
        <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-brand-accent/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 top-10 grid grid-cols-6 gap-2 opacity-10">
          {Array.from({ length: 24 }).map((_, i) => <div key={i} className="h-10 w-10 rounded-lg border border-white/40" />)}
        </div>
        <div className="relative grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <div className="text-sm text-brand-foreground/75">Total fees expected (current term)</div>
            <div className="mt-2 flex items-end gap-3">
              <div className="text-3xl font-semibold tracking-tight sm:text-4xl">{formatCurrency(totalExpected)}</div>
              <Badge className="bg-brand-accent text-[oklch(0.18_0.04_180)] hover:bg-brand-accent">+15.8% <ArrowUpRight className="ml-1 h-3 w-3" /></Badge>
            </div>
            <div className="mt-1 text-xs text-brand-foreground/70">Collected so far: {formatCurrency(totalCollected)} · Outstanding: {formatCurrency(outstanding)}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="bg-brand-accent text-[oklch(0.18_0.04_180)] hover:bg-brand-accent/90"><Plus className="mr-1.5 h-4 w-4" /> Record</Button>
            <Button size="sm" variant="outline" className="border-white/25 bg-white/10 text-brand-foreground hover:bg-white/15 hover:text-brand-foreground"><Send className="mr-1.5 h-4 w-4" /> Remind</Button>
            <Button size="sm" variant="outline" className="border-white/25 bg-white/10 text-brand-foreground hover:bg-white/15 hover:text-brand-foreground"><ArrowDownToLine className="mr-1.5 h-4 w-4" /> Statement</Button>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={GraduationCap} label="Total students" value={String(students.length)} delta="+4 this week" tone="up" />
        <StatCard icon={Users} label="Total staff" value={String(staff.filter(s => s.active).length)} delta={`${staff.filter(s => !s.active).length} inactive`} tone="flat" />
        <StatCard icon={BookOpen} label="Classes" value={String(classes.length)} delta="6 with class teachers" tone="flat" />
        <StatCard icon={ClipboardCheck} label="Today's attendance" value={`${present}/${att.length}`} delta={`${Math.round((present / Math.max(att.length, 1)) * 100)}% present`} tone="up" />
      </div>

      {/* Cash flow + side breakdown */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Cash flow</h3>
              <p className="text-xs text-muted-foreground">Income vs expense over the last 14 days</p>
            </div>
            <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
              <button className="rounded-md bg-card px-2.5 py-1 font-medium shadow-sm">Weekly</button>
              <button className="px-2.5 py-1 text-muted-foreground">Daily</button>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashFlowData} barCategoryGap={6}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip cursor={{ fill: "var(--color-muted)" }} contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="income" fill="var(--color-brand)" radius={[4,4,0,0]} />
                <Bar dataKey="expense" fill="var(--color-brand-accent)" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-4">
          <MiniStat label="Income" value={formatCurrency(totalCollected)} delta="+45.0%" tone="up" icon={ArrowDownRight} />
          <MiniStat label="Expense" value={formatCurrency(Math.round(totalCollected * 0.32))} delta="-12.5%" tone="down" icon={ArrowUpRight} />
          <MiniStat label="Outstanding fees" value={formatCurrency(outstanding)} delta={`${students.filter(s => studentBalance(s.id) > 0).length} debtors`} tone="flat" icon={AlertTriangle} />
        </div>
      </div>

      {/* Section cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent payments</h3>
            <Link to="/payments" className="text-xs text-brand hover:underline">See all →</Link>
          </div>
          <div className="mt-3 divide-y divide-border">
            {payments.slice(0, 5).map(p => {
              const s = students.find(x => x.id === p.studentId);
              return (
                <div key={p.id} className="flex items-center justify-between py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-xs font-medium text-white" style={{ backgroundColor: s?.photoColor }}>
                      {s?.firstName[0]}{s?.lastName[0]}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{s?.firstName} {s?.lastName}</div>
                      <div className="text-xs text-muted-foreground">{p.receiptNo} · {p.method}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{formatCurrency(p.amount)}</div>
                    <StatusPill status={p.status} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Top debtors</h3>
            <Link to="/debtors" className="text-xs text-brand hover:underline">See all →</Link>
          </div>
          <div className="mt-3 divide-y divide-border">
            {students.map(s => ({ s, bal: studentBalance(s.id) })).filter(x => x.bal > 0).sort((a,b) => b.bal - a.bal).slice(0,5).map(({ s, bal }) => {
              const cls = classes.find(c => c.id === s.classId);
              return (
                <div key={s.id} className="flex items-center justify-between py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-xs font-medium text-white" style={{ backgroundColor: s.photoColor }}>
                      {s.firstName[0]}{s.lastName[0]}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{s.firstName} {s.lastName}</div>
                      <div className="text-xs text-muted-foreground">{cls?.name}</div>
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-destructive">{formatCurrency(bal)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Pending promotions</h3>
            <Link to="/promotions" className="text-xs text-brand hover:underline">Review →</Link>
          </div>
          <div className="mt-3 space-y-3">
            {classes.slice(0, 4).map(c => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{students.filter(s => s.classId === c.id).length} students</div>
                </div>
                <Badge variant="outline" className="border-warning/40 bg-warning/10 text-[oklch(0.4_0.1_70)]">Awaiting review</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, delta, tone }: { icon: any; label: string; value: string; delta: string; tone: "up" | "down" | "flat" }) {
  const toneCls = tone === "up" ? "text-success" : tone === "down" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${toneCls}`}>
          {tone === "up" && <TrendingUp className="h-3.5 w-3.5" />}
          {delta}
        </span>
      </div>
      <div className="mt-4 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, delta, tone }: { icon: any; label: string; value: string; delta: string; tone: "up"|"down"|"flat" }) {
  const toneCls = tone === "up" ? "text-success" : tone === "down" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand text-brand-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate text-lg font-semibold">{value}</div>
      </div>
      <span className={`text-xs font-medium ${toneCls}`}>{delta}</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Success: "bg-success/15 text-[oklch(0.35_0.1_155)]",
    Pending: "bg-warning/15 text-[oklch(0.4_0.12_70)]",
    Failed: "bg-destructive/15 text-destructive",
  };
  return <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`}>{status}</span>;
}
