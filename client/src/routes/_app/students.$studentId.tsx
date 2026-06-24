import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Mail, Phone, MapPin, GraduationCap, Calendar, Wallet, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { students, classes, payments, formatCurrency, studentBalance, studentTotalBilled, studentTotalPaid } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/students/$studentId")({
  loader: ({ params }) => {
    const s = students.find(x => x.id === params.studentId);
    if (!s) throw notFound();
    return s;
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.firstName ?? "Student"} — Lumen Suite` }] }),
  notFoundComponent: () => <div className="p-8 text-center text-sm text-muted-foreground">Student not found.</div>,
  errorComponent: ({ error }) => <div className="p-8 text-center text-sm text-destructive">{error.message}</div>,
  component: StudentProfile,
});

function StudentProfile() {
  const s = Route.useLoaderData();
  const { user } = useAuth();
  if (!hasPermission(user, "students.view")) return <Forbidden />;
  const cls = classes.find(c => c.id === s.classId);
  const myPayments = payments.filter(p => p.studentId === s.id);

  return (
    <div className="space-y-6">
      <Link to="/students" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to students
      </Link>

      <div className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-5 sm:flex sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl text-lg font-semibold text-white" style={{ backgroundColor: s.photoColor }}>
              {s.firstName[0]}{s.lastName[0]}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{s.firstName} {s.lastName}</h1>
              <p className="text-sm text-muted-foreground">{s.admissionNo} · {cls?.name} · Enrolled {s.enrolledAt}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">Edit</Button>
            <Button size="sm">Record payment</Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <InfoTile icon={Wallet} label="Outstanding balance" value={formatCurrency(studentBalance(s.id))} accent={studentBalance(s.id) > 0 ? "text-destructive" : "text-success"} />
          <InfoTile icon={GraduationCap} label="Total billed (term)" value={formatCurrency(studentTotalBilled(s.id))} />
          <InfoTile icon={Calendar} label="Total paid" value={formatCurrency(studentTotalPaid(s.id))} accent="text-success" />
        </div>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="guardian">Guardian</TabsTrigger>
          <TabsTrigger value="academic">Academic history</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailCard title="Personal">
              <Row label="Full name" value={`${s.firstName} ${s.lastName}`} />
              <Row label="Gender" value={s.gender === "F" ? "Female" : "Male"} />
              <Row label="Date of birth" value={s.dob} />
              <Row label="Status" value={<span className="capitalize">{s.status}</span>} />
            </DetailCard>
            <DetailCard title="Contact">
              <Row icon={<MapPin className="h-4 w-4" />} label="Address" value={s.address} />
              <Row icon={<Phone className="h-4 w-4" />} label="Guardian phone" value={s.guardian.phone} />
              <Row icon={<Mail className="h-4 w-4" />} label="Guardian email" value={s.guardian.email ?? "—"} />
            </DetailCard>
          </div>
        </TabsContent>

        <TabsContent value="guardian" className="mt-4">
          <DetailCard title={s.guardian.name}>
            <Row label="Relation" value={s.guardian.relation} />
            <Row label="Phone" value={s.guardian.phone} />
            <Row label="Email" value={s.guardian.email ?? "—"} />
          </DetailCard>
        </TabsContent>

        <TabsContent value="academic" className="mt-4">
          <DetailCard title="Class history">
            <Row label="Current class" value={cls?.name ?? "—"} />
            <Row label="Enrolled at" value={s.enrolledAt} />
            <Row label="Promotions" value="No prior records (MVP)" />
          </DetailCard>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-2.5 text-left font-medium">Receipt</th><th className="px-4 py-2.5 text-left font-medium">Date</th><th className="px-4 py-2.5 text-left font-medium">Method</th><th className="px-4 py-2.5 text-left font-medium">Amount</th><th className="px-4 py-2.5 text-left font-medium">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {myPayments.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No payments yet.</td></tr>}
                {myPayments.map(p => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5 font-medium">{p.receiptNo}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.date}</td>
                    <td className="px-4 py-2.5">{p.method}</td>
                    <td className="px-4 py-2.5 font-medium">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-2.5">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <DetailCard title="Recent attendance">
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 28 }).map((_, i) => {
                const tone = [0,2,5,9,12,15,19,21,25].includes(i) ? "bg-warning/40" : i === 7 ? "bg-destructive/50" : "bg-success/60";
                return <div key={i} title={`Day ${i+1}`} className={`h-7 rounded ${tone}`} />;
              })}
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-success/60" /> Present</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-warning/40" /> Late/Excused</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-destructive/50" /> Absent</span>
            </div>
          </DetailCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <div className={`mt-1.5 text-lg font-semibold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}
function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 space-y-2.5">{children}</div>
    </div>
  );
}
function Row({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-start gap-3 text-sm">
      <div className="flex items-center gap-1.5 text-muted-foreground">{icon}{label}</div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}
