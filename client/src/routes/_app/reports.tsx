import { createFileRoute } from "@tanstack/react-router";
import { Download, FileText, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({ meta: [{ title: "Reports — Lumen Suite" }] }),
  component: ReportsPage,
});

const reports = [
  { name: "Students by class", desc: "Headcount per class with gender split." },
  { name: "Attendance report", desc: "Daily, weekly and monthly attendance percentages." },
  { name: "Fee collection report", desc: "Collections per term, class and fee item." },
  { name: "Debtors report", desc: "Outstanding balances with guardian contacts." },
  { name: "Promotion report", desc: "Promoted, repeated, withdrawn and graduated students." },
  { name: "Repeated students", desc: "Students repeating their current class." },
  { name: "Withdrawn students", desc: "Students who have left the school." },
  { name: "Graduated students", desc: "Students who completed the highest class." },
];

function ReportsPage() {
  const { user } = useAuth();
  if (!hasPermission(user, "reports.view")) return <Forbidden />;
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Download or print reports across the school." />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reports.map(r => (
          <div key={r.name} className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground"><BarChart3 className="h-5 w-5" /></span>
            <h3 className="mt-3 text-sm font-semibold">{r.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{r.desc}</p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1"><FileText className="mr-1.5 h-3.5 w-3.5" /> PDF</Button>
              <Button size="sm" className="flex-1"><Download className="mr-1.5 h-3.5 w-3.5" /> Excel</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
