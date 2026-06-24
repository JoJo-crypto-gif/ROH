import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Plus, Search, Filter } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { payments, students, feeItems, formatCurrency } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/payments")({
  head: () => ({ meta: [{ title: "Payments — Lumen Suite" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("all");
  const [status, setStatus] = useState("all");
  if (!hasPermission(user, "payments.view")) return <Forbidden />;

  const rows = useMemo(() => payments.filter(p => {
    const s = students.find(x => x.id === p.studentId);
    if (q && !(`${s?.firstName} ${s?.lastName} ${p.receiptNo}`.toLowerCase().includes(q.toLowerCase()))) return false;
    if (method !== "all" && p.method !== method) return false;
    if (status !== "all" && p.status !== status) return false;
    return true;
  }), [q, method, status]);

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="All recorded payments across classes and terms." actions={
        hasPermission(user, "payments.record") ? <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> Record payment</Button> : null
      } />

      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <div className="relative flex-1 min-w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search student or receipt" className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring" />
          </div>
          <select value={method} onChange={e => setMethod(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="all">All methods</option>
            <option>Cash</option><option>Bank Transfer</option><option>Mobile Money</option><option>Card</option>
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="all">All statuses</option>
            <option>Success</option><option>Pending</option><option>Failed</option>
          </select>
          <Button variant="outline" size="sm"><Filter className="mr-1.5 h-4 w-4" /> More filters</Button>
          <div className="ml-auto text-xs text-muted-foreground">Total: {formatCurrency(rows.reduce((a, r) => a + r.amount, 0))}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Receipt</th>
                <th className="px-4 py-2.5 text-left font-medium">Student</th>
                <th className="px-4 py-2.5 text-left font-medium">Fee item</th>
                <th className="px-4 py-2.5 text-left font-medium">Date</th>
                <th className="px-4 py-2.5 text-left font-medium">Method</th>
                <th className="px-4 py-2.5 text-left font-medium">Amount</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(p => {
                const s = students.find(x => x.id === p.studentId);
                const f = feeItems.find(x => x.id === p.feeItemId);
                return (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium">{p.receiptNo}</td>
                    <td className="px-4 py-2.5">{s?.firstName} {s?.lastName}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{f?.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.date}</td>
                    <td className="px-4 py-2.5">{p.method}</td>
                    <td className="px-4 py-2.5 font-semibold">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-2.5"><StatusPill status={p.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Success: "bg-success/15 text-[oklch(0.35_0.1_155)]",
    Pending: "bg-warning/15 text-[oklch(0.4_0.12_70)]",
    Failed: "bg-destructive/15 text-destructive",
  };
  return <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${map[status]}`}>{status}</span>;
}
