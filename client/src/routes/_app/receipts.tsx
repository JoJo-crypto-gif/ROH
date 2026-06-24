import { createFileRoute } from "@tanstack/react-router";
import { Printer, Download } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { payments, students, feeItems, formatCurrency, classes } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/receipts")({
  head: () => ({ meta: [{ title: "Receipts — Lumen Suite" }] }),
  component: ReceiptsPage,
});

function ReceiptsPage() {
  const { user } = useAuth();
  if (!hasPermission(user, "receipts.view")) return <Forbidden />;
  const success = payments.filter(p => p.status === "Success");

  return (
    <div className="space-y-6">
      <PageHeader title="Receipts" description="Printable receipts for all successful payments." />
      <div className="grid gap-4 md:grid-cols-2">
        {success.slice(0, 8).map(p => {
          const s = students.find(x => x.id === p.studentId)!;
          const f = feeItems.find(x => x.id === p.feeItemId)!;
          const cls = classes.find(c => c.id === s.classId);
          return (
            <article key={p.id} className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Receipt</div>
                  <div className="text-lg font-semibold">{p.receiptNo}</div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>Rays Of Hope</div>
                  <div>{p.date}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Student</div>
                  <div className="font-medium">{s.firstName} {s.lastName}</div>
                  <div className="text-xs text-muted-foreground">{s.admissionNo} · {cls?.name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Paid via</div>
                  <div className="font-medium">{p.method}</div>
                  <div className="text-xs text-muted-foreground">By {p.recordedBy}</div>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 p-3">
                <div className="flex justify-between text-sm">
                  <span>{f.name}</span>
                  <span className="font-semibold">{formatCurrency(p.amount)}</span>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm"><Download className="mr-1.5 h-3.5 w-3.5" /> PDF</Button>
                {hasPermission(user, "receipts.print") && (
                  <Button size="sm"><Printer className="mr-1.5 h-3.5 w-3.5" /> Print</Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
