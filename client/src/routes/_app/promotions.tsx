import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { ArrowUpCircle, RotateCcw, LogOut, GraduationCap, ClipboardList, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { academicYears, classes, students } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type Decision = "Promote" | "Repeat" | "Withdraw" | "Transfer" | "Graduate" | "Pending";
const DECISIONS: { key: Decision; icon: any; tone: string }[] = [
  { key: "Promote", icon: ArrowUpCircle, tone: "bg-success/15 text-[oklch(0.35_0.1_155)] border-success/30" },
  { key: "Repeat", icon: RotateCcw, tone: "bg-warning/15 text-[oklch(0.4_0.12_70)] border-warning/30" },
  { key: "Withdraw", icon: LogOut, tone: "bg-destructive/15 text-destructive border-destructive/30" },
  { key: "Transfer", icon: ClipboardList, tone: "bg-brand/10 text-brand border-brand/30" },
  { key: "Graduate", icon: GraduationCap, tone: "bg-accent text-accent-foreground border-border" },
  { key: "Pending", icon: ClipboardList, tone: "bg-muted text-muted-foreground border-border" },
];

export const Route = createFileRoute("/_app/promotions")({
  head: () => ({ meta: [{ title: "Promotions — Lumen Suite" }] }),
  component: PromotionsPage,
});

function PromotionsPage() {
  const { user } = useAuth();
  const [yearId, setYearId] = useState(academicYears.find(y => y.active)!.id);
  const [classId, setClassId] = useState(classes[0].id);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [confirmed, setConfirmed] = useState(false);

  if (!hasPermission(user, "promotion.view")) return <Forbidden />;
  const canRecommend = hasPermission(user, "promotion.recommend");
  const canApprove = hasPermission(user, "promotion.approve");

  const list = useMemo(() => students.filter(s => s.classId === classId && s.status !== "graduated" && s.status !== "withdrawn"), [classId]);

  const summary = DECISIONS.map(d => ({ ...d, count: list.filter(s => (decisions[s.id] ?? "Pending") === d.key).length }));

  return (
    <div className="space-y-6">
      <PageHeader title="Class promotions" description="Promote, repeat, transfer, withdraw or graduate students at end of year. History is preserved." />

      <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Academic year</label>
            <select value={yearId} onChange={e => setYearId(e.target.value)} className="mt-1 h-9 rounded-md border border-input bg-background px-2 text-sm">
              {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Class</label>
            <select value={classId} onChange={e => setClassId(e.target.value)} className="mt-1 h-9 rounded-md border border-input bg-background px-2 text-sm">
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {summary.map(s => (
              <div key={s.key} className={`rounded-md border px-2.5 py-1 text-xs font-medium ${s.tone}`}>{s.key}: {s.count}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">{list.length} students in {classes.find(c => c.id === classId)?.name}</div>
        <ul className="divide-y divide-border">
          {list.map(s => {
            const decision = decisions[s.id] ?? "Pending";
            return (
              <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-xs font-medium text-white" style={{ backgroundColor: s.photoColor }}>
                    {s.firstName[0]}{s.lastName[0]}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{s.firstName} {s.lastName}</div>
                    <div className="text-xs text-muted-foreground">{s.admissionNo}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {DECISIONS.filter(d => d.key !== "Pending").map(d => {
                    const Icon = d.icon;
                    const active = decision === d.key;
                    return (
                      <button
                        key={d.key} disabled={!canRecommend}
                        onClick={() => setDecisions(m => ({ ...m, [s.id]: d.key }))}
                        className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition",
                          active ? d.tone : "border-border bg-card text-muted-foreground hover:bg-muted",
                          !canRecommend && "opacity-60 cursor-not-allowed"
                        )}
                      ><Icon className="h-3 w-3" /> {d.key}</button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t border-border p-3">
          <div className="text-xs text-muted-foreground">
            {confirmed ? "Promotion enrolment records created for the next academic year. Previous class history preserved." : "Recommend decisions, then approve to create next-year enrolment records."}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!canRecommend}>Save recommendations</Button>
            <Button size="sm" disabled={!canApprove} onClick={() => setConfirmed(true)}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve & confirm
            </Button>
          </div>
        </div>
      </div>

      {confirmed && (
        <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm">
          <Badge className="bg-success text-success-foreground hover:bg-success">Confirmed</Badge>
          <span className="ml-2">Decisions applied. New class enrolment records created for next academic year — previous history preserved.</span>
        </div>
      )}
    </div>
  );
}
