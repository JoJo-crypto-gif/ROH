import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Search, School, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { academicApi, studentsApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/classes")({
  head: () => ({ meta: [{ title: "Class streams — Lumen Suite" }] }),
  component: ClassesPage,
});

function ClassesPage() {
  const { user } = useAuth();
  const canView = hasPermission(user, "academic.view");
  const [yearId, setYearId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [search, setSearch] = useState("");
  const yearsQuery = useQuery({ queryKey: ["academic-years"], queryFn: academicApi.getYears });
  const years = useMemo(() => yearsQuery.data?.years ?? [], [yearsQuery.data?.years]);
  useEffect(() => {
    if (!yearId && years.length)
      setYearId((years.find((year) => year.status === "ACTIVE") ?? years[0]).id);
  }, [years, yearId]);
  const sectionsQuery = useQuery({
    queryKey: ["sections", yearId],
    queryFn: () => academicApi.getClasses(yearId),
    enabled: !!yearId,
  });
  const sections = useMemo(
    () => sectionsQuery.data?.sections ?? [],
    [sectionsQuery.data?.sections],
  );
  useEffect(() => {
    if (sections.length && !sections.some((section) => section.id === sectionId))
      setSectionId(sections[0].id);
  }, [sections, sectionId]);
  const studentsQuery = useQuery({
    queryKey: ["students", sectionId, search],
    queryFn: () => studentsApi.list({ classId: sectionId, search }),
    enabled: !!sectionId,
  });
  const selected = sections.find((section) => section.id === sectionId);

  if (!canView) return <Forbidden />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class streams"
        description="View yearly class sections, assigned teachers, curriculum and student rosters."
      />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="rounded-xl border bg-card p-4">
          <label className="text-xs font-medium text-muted-foreground">Academic year</label>
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={yearId}
            onChange={(event) => {
              setYearId(event.target.value);
              setSectionId("");
            }}
          >
            {years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name} — {year.status}
              </option>
            ))}
          </select>
          <div className="mt-4 space-y-2">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setSectionId(section.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${section.id === sectionId ? "border-brand bg-brand/5" : "hover:bg-muted/40"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{section.name}</span>
                  <Badge variant="outline">{section.studentCount}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {section.gradeLevelName} · {section.teacherName}
                </p>
              </button>
            ))}
            {!sections.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No streams configured.
              </p>
            )}
          </div>
        </aside>
        <main className="space-y-4">
          {selected ? (
            <>
              <section className="grid gap-3 sm:grid-cols-3">
                <Stat icon={School} label="Class stream" value={selected.name} />
                <Stat icon={Users} label="Class teacher" value={selected.teacherName} />
                <Stat
                  icon={BookOpen}
                  label="Capacity"
                  value={`${selected.studentCount} / ${selected.capacity}`}
                />
              </section>
              <section className="overflow-hidden rounded-xl border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                  <div>
                    <h3 className="font-semibold">Student roster</h3>
                    <p className="text-xs text-muted-foreground">
                      {selected.gradeLevelName} · {selected.name}
                    </p>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="w-60 pl-8"
                      placeholder="Search students"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-muted/45 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left">Student</th>
                      <th className="px-4 py-3 text-left">Admission no.</th>
                      <th className="px-4 py-3 text-left">Guardian</th>
                      <th className="px-4 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(studentsQuery.data?.students ?? []).map((student) => (
                      <tr key={student.id}>
                        <td className="px-4 py-3 font-medium">
                          {student.firstName} {student.lastName}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{student.admissionNo}</td>
                        <td className="px-4 py-3">{student.guardianName}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="capitalize">
                            {student.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          ) : (
            <div className="grid min-h-80 place-items-center rounded-xl border bg-card text-sm text-muted-foreground">
              Select a class stream.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof School; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <Icon className="h-5 w-5 text-brand" />
      <div className="mt-3 text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold">{value}</div>
    </div>
  );
}
