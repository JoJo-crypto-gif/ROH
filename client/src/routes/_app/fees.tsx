import { createFileRoute } from "@tanstack/react-router";
import { Plus, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { feeItems, classes, academicYears, formatCurrency } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/fees")({
  head: () => ({ meta: [{ title: "Fees — Lumen Suite" }] }),
  component: FeesPage,
});

function FeesPage() {
  const { user } = useAuth();
  if (!hasPermission(user, "fees.view")) return <Forbidden />;
  const canManage = hasPermission(user, "fees.manage");
  const activeYear = academicYears.find(y => y.active);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fees"
        description={`Fee items for ${activeYear?.name}. Assign to all classes or specific classes.`}
        actions={canManage ? <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> New fee item</Button> : null}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {feeItems.map(f => {
          const cls = classes.find(c => c.id === f.classId);
          const term = activeYear?.terms.find(t => t.id === f.termId);
          return (
            <div key={f.id} className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">{term?.name}</div>
                  <h3 className="mt-0.5 text-base font-semibold">{f.name}</h3>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand text-brand-foreground"><Wallet className="h-4 w-4" /></span>
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight">{formatCurrency(f.amount)}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{cls?.name ?? "All classes"}</Badge>
                {f.mandatory && <Badge className="bg-success/15 text-[oklch(0.35_0.1_155)] hover:bg-success/15">Mandatory</Badge>}
              </div>
              {canManage && (
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1">Edit</Button>
                  <Button size="sm" className="flex-1">Assign</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
