import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, Filter, Download, MoreHorizontal } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { students, classes, studentBalance, formatCurrency } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/students/")({
  head: () => ({ meta: [{ title: "Students — Lumen Suite" }] }),
  component: StudentsPage,
});

function StudentsPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  if (!hasPermission(user, "students.view")) return <Forbidden />;

  const filtered = useMemo(() => students.filter(s => {
    const q = query.toLowerCase();
    if (q && !(`${s.firstName} ${s.lastName} ${s.admissionNo}`.toLowerCase().includes(q))) return false;
    if (classFilter !== "all" && s.classId !== classFilter) return false;
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (user?.scopes.includes("class") && user.assignedClassId && s.classId !== user.assignedClassId) return false;
    return true;
  }), [query, classFilter, statusFilter, user]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description="Manage enrolment, profiles, guardians and academic history."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-4 w-4" /> Export</Button>
            {hasPermission(user, "students.create") && (
              <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Add student</Button>
            )}
          </>
        }
      />

      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <div className="relative flex-1 min-w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or admission no" className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring" />
          </div>
          <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="all">All classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="repeating">Repeating</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="graduated">Graduated</option>
          </select>
          <Button variant="outline" size="sm" className="gap-1.5"><Filter className="h-4 w-4" /> More</Button>
          <div className="ml-auto text-xs text-muted-foreground">{filtered.length} of {students.length}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Student</th>
                <th className="px-4 py-2.5 text-left font-medium">Admission no</th>
                <th className="px-4 py-2.5 text-left font-medium">Class</th>
                <th className="px-4 py-2.5 text-left font-medium">Guardian</th>
                <th className="px-4 py-2.5 text-left font-medium">Balance</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(s => {
                const cls = classes.find(c => c.id === s.classId);
                const bal = studentBalance(s.id);
                return (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link to="/students/$studentId" params={{ studentId: s.id }} className="flex min-w-0 items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-xs font-medium text-white" style={{ backgroundColor: s.photoColor }}>
                          {s.firstName[0]}{s.lastName[0]}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{s.firstName} {s.lastName}</div>
                          <div className="text-xs text-muted-foreground">{s.gender === "F" ? "Female" : "Male"} · DOB {s.dob}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.admissionNo}</td>
                    <td className="px-4 py-3">{cls?.name}</td>
                    <td className="px-4 py-3">
                      <div className="text-foreground">{s.guardian.name}</div>
                      <div className="text-xs text-muted-foreground">{s.guardian.phone}</div>
                    </td>
                    <td className={`px-4 py-3 font-medium ${bal > 0 ? "text-destructive" : "text-success"}`}>{formatCurrency(bal)}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3 text-right"><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No students match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-success/15 text-[oklch(0.35_0.1_155)]",
    repeating: "bg-warning/15 text-[oklch(0.4_0.12_70)]",
    withdrawn: "bg-destructive/15 text-destructive",
    graduated: "bg-brand/10 text-brand",
  };
  return <Badge variant="outline" className={`border-transparent capitalize ${map[status]}`}>{status}</Badge>;
}
