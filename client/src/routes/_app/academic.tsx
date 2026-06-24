import { createFileRoute } from "@tanstack/react-router";
import { CalendarRange, BookOpen, Users, Pencil } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { academicYears, classes, subjects, staff, students } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/academic")({
  head: () => ({ meta: [{ title: "Academic Setup — Lumen Suite" }] }),
  component: AcademicPage,
});

function AcademicPage() {
  const { user } = useAuth();
  if (!hasPermission(user, "academic.view")) return <Forbidden />;
  const canManage = hasPermission(user, "academic.manage");

  return (
    <div className="space-y-6">
      <PageHeader title="Academic setup" description="Years, terms, classes, subjects and teacher assignments." actions={
        canManage ? <Button size="sm">New academic year</Button> : null
      } />

      <Tabs defaultValue="years">
        <TabsList>
          <TabsTrigger value="years">Years & Terms</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="subjects">Subjects</TabsTrigger>
        </TabsList>

        <TabsContent value="years" className="mt-4 space-y-3">
          {academicYears.map(y => (
            <div key={y.id} className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-brand" />
                  <h3 className="text-base font-semibold">Academic year {y.name}</h3>
                  {y.active && <Badge className="bg-success/20 text-[oklch(0.35_0.1_155)] hover:bg-success/20">Active</Badge>}
                </div>
                {canManage && <Button variant="ghost" size="sm"><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit</Button>}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {y.terms.map(t => (
                  <div key={t.id} className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{t.start} → {t.end}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="classes" className="mt-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {classes.map(c => {
              const teacher = staff.find(s => s.id === c.teacherId);
              const count = students.filter(s => s.classId === c.id && s.status === "active").length;
              return (
                <div key={c.id} className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold">{c.name}</h3>
                      <p className="text-xs text-muted-foreground">Level {c.level} · Capacity {c.capacity}</p>
                    </div>
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground"><Users className="h-4 w-4" /></span>
                  </div>
                  <div className="mt-3 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Enrolled</span><span className="font-medium">{count} / {c.capacity}</span></div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-brand" style={{ width: `${(count / c.capacity) * 100}%` }} />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Class teacher</span>
                    <span className="font-medium">{teacher?.name ?? "Unassigned"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="subjects" className="mt-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-2.5 text-left font-medium">Subject</th><th className="px-4 py-2.5 text-left font-medium">Code</th><th className="px-4 py-2.5 text-left font-medium">Teachers</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subjects.map(sub => (
                  <tr key={sub.id}>
                    <td className="px-4 py-3 font-medium"><span className="inline-flex items-center gap-2"><BookOpen className="h-4 w-4 text-muted-foreground" /> {sub.name}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{sub.code}</td>
                    <td className="px-4 py-3">{staff.filter(s => s.subjects?.includes(sub.id)).map(s => s.name).join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
