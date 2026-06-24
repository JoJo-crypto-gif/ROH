import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Mail, AlertTriangle, Phone } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { students, classes, studentBalance, studentTotalBilled, studentTotalPaid, formatCurrency } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/debtors")({
  head: () => ({ meta: [{ title: "Debtors — Lumen Suite" }] }),
  component: DebtorsPage,
});

function DebtorsPage() {
  const { user } = useAuth();
  const [classId, setClassId] = useState("all");
  if (!hasPermission(user, "debtors.view")) return <Forbidden />;

  const debtors = useMemo(() => students
    .map(s => ({ s, billed: studentTotalBilled(s.id), paid: studentTotalPaid(s.id), bal: studentBalance(s.id) }))
    .filter(r => r.bal > 0 && (classId === "all" || r.s.classId === classId))
    .sort((a, b) => b.bal - a.bal),
    [classId]);

  const total = debtors.reduce((a, r) => a + r.bal, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Debtors"
        description="Students with outstanding fee balances."
        actions={<Button size="sm" variant="outline"><Mail className="mr-1.5 h-4 w-4" /> Send reminders</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="text-xs text-muted-foreground">Total outstanding</div>
          <div className="mt-1 text-2xl font-semibold text-destructive">{formatCurrency(total)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="text-xs text-muted-foreground">Debtors</div>
          <div className="mt-1 text-2xl font-semibold">{debtors.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] flex items-end justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Filter by class</div>
            <select value={classId} onChange={e => setClassId(e.target.value)} className="mt-1 h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="all">All classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <AlertTriangle className="h-7 w-7 text-warning" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Student</th>
              <th className="px-4 py-2.5 text-left font-medium">Class</th>
              <th className="px-4 py-2.5 text-left font-medium">Billed</th>
              <th className="px-4 py-2.5 text-left font-medium">Paid</th>
              <th className="px-4 py-2.5 text-left font-medium">Balance</th>
              <th className="px-4 py-2.5 text-left font-medium">Guardian</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {debtors.map(({ s, billed, paid, bal }) => {
              const cls = classes.find(c => c.id === s.classId);
              return (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-xs font-medium text-white" style={{ backgroundColor: s.photoColor }}>
                        {s.firstName[0]}{s.lastName[0]}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{s.firstName} {s.lastName}</div>
                        <div className="text-xs text-muted-foreground">{s.admissionNo}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{cls?.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatCurrency(billed)}</td>
                  <td className="px-4 py-3 text-success">{formatCurrency(paid)}</td>
                  <td className="px-4 py-3 font-semibold text-destructive">{formatCurrency(bal)}</td>
                  <td className="px-4 py-3 text-xs">
                    <div>{s.guardian.name}</div>
                    <div className="text-muted-foreground inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {s.guardian.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-right"><Button size="sm" variant="outline">Remind</Button></td>
                </tr>
              );
            })}
            {debtors.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No debtors — well done!</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
