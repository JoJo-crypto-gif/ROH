import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ClipboardCheck, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { classes, students } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/attendance")({
  head: () => ({ meta: [{ title: "Attendance — Lumen Suite" }] }),
  component: AttendancePage,
});

type Status = "Present" | "Absent" | "Late" | "Excused";
const STATUSES: Status[] = ["Present", "Absent", "Late", "Excused"];
const colorOf = (s: Status) =>
  s === "Present" ? "bg-success/15 text-[oklch(0.35_0.1_155)] border-success/30"
  : s === "Late" ? "bg-warning/15 text-[oklch(0.4_0.12_70)] border-warning/30"
  : s === "Excused" ? "bg-brand/10 text-brand border-brand/30"
  : "bg-destructive/15 text-destructive border-destructive/30";

function AttendancePage() {
  const { user } = useAuth();
  const allowedClasses = user?.scopes.includes("class") && user.assignedClassId
    ? classes.filter(c => c.id === user.assignedClassId)
    : classes;
  const [classId, setClassId] = useState(allowedClasses[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const list = students.filter(s => s.classId === classId && s.status === "active");
  const [marks, setMarks] = useState<Record<string, Status>>(() =>
    Object.fromEntries(list.map(s => [s.id, "Present" as Status]))
  );

  if (!hasPermission(user, "attendance.view")) return <Forbidden />;
  const canMark = hasPermission(user, "attendance.mark");

  const summary = STATUSES.map(st => ({ st, count: Object.values(marks).filter(x => x === st).length }));

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" description="Mark daily attendance per class and review summaries." />

      <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Class</label>
            <select value={classId} onChange={e => { setClassId(e.target.value); setMarks({}); }} className="mt-1 h-9 rounded-md border border-input bg-background px-2 text-sm">
              {allowedClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 h-9 rounded-md border border-input bg-background px-2 text-sm" />
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {summary.map(s => (
              <div key={s.st} className={`rounded-md border px-2.5 py-1 text-xs font-medium ${colorOf(s.st)}`}>
                {s.st}: {s.count}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="border-b border-border px-4 py-2.5 text-sm font-semibold flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-brand" /> {list.length} students
        </div>
        <ul className="divide-y divide-border">
          {list.map(s => (
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
                {STATUSES.map(st => {
                  const active = marks[s.id] === st;
                  return (
                    <button
                      key={st}
                      disabled={!canMark}
                      onClick={() => setMarks(m => ({ ...m, [s.id]: st }))}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs font-medium transition",
                        active ? colorOf(st) : "border-border bg-card text-muted-foreground hover:bg-muted",
                        !canMark && "opacity-60 cursor-not-allowed"
                      )}
                    >{st}</button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
        <div className="border-t border-border p-3 flex justify-end">
          <Button size="sm" disabled={!canMark}><Save className="mr-1.5 h-4 w-4" /> Save attendance</Button>
        </div>
      </div>
    </div>
  );
}
