import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarDays,
  Check,
  Copy,
  GraduationCap,
  Plus,
  Save,
  School,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { academicApi, type ApiAssessmentScheme } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/academic")({
  head: () => ({ meta: [{ title: "Academic setup — Lumen Suite" }] }),
  component: AcademicPage,
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

function statusTone(status: string) {
  if (status === "ACTIVE") return "bg-success/15 text-[oklch(0.35_0.1_155)]";
  if (status === "CLOSED") return "bg-muted text-muted-foreground";
  return "bg-brand/10 text-brand";
}

function AcademicPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission(user, "academic.manage");
  const canView = hasPermission(user, "academic.view");

  const settingsQuery = useQuery({
    queryKey: ["academic-settings"],
    queryFn: academicApi.getSettings,
  });
  const yearsQuery = useQuery({ queryKey: ["academic-years"], queryFn: academicApi.getYears });
  const levelsQuery = useQuery({ queryKey: ["grade-levels"], queryFn: academicApi.getGradeLevels });
  const subjectsQuery = useQuery({ queryKey: ["subjects"], queryFn: academicApi.getSubjects });
  const teachersQuery = useQuery({ queryKey: ["teachers"], queryFn: academicApi.getTeachers });
  const years = useMemo(() => yearsQuery.data?.years ?? [], [yearsQuery.data?.years]);
  const levels = useMemo(
    () => levelsQuery.data?.gradeLevels ?? [],
    [levelsQuery.data?.gradeLevels],
  );
  const subjects = useMemo(
    () => subjectsQuery.data?.subjects ?? [],
    [subjectsQuery.data?.subjects],
  );
  const teachers = useMemo(
    () => teachersQuery.data?.teachers ?? [],
    [teachersQuery.data?.teachers],
  );

  const [selectedYearId, setSelectedYearId] = useState("");
  const [selectedLevelId, setSelectedLevelId] = useState("");
  useEffect(() => {
    if (!selectedYearId && years.length)
      setSelectedYearId(
        (
          years.find((year) => year.status === "DRAFT") ??
          years.find((year) => year.status === "ACTIVE") ??
          years[0]
        ).id,
      );
  }, [years, selectedYearId]);
  useEffect(() => {
    if (!selectedLevelId && levels.length) setSelectedLevelId(levels[0].id);
  }, [levels, selectedLevelId]);

  const sectionsQuery = useQuery({
    queryKey: ["sections", selectedYearId],
    queryFn: () => academicApi.getClasses(selectedYearId),
    enabled: !!selectedYearId,
  });
  const curriculumQuery = useQuery({
    queryKey: ["curriculum", selectedYearId, selectedLevelId],
    queryFn: () => academicApi.getCurriculum(selectedYearId, selectedLevelId),
    enabled: !!selectedYearId && !!selectedLevelId,
  });
  const schemeQuery = useQuery({
    queryKey: ["assessment-scheme", selectedYearId],
    queryFn: () => academicApi.getAssessmentScheme(selectedYearId),
    enabled: !!selectedYearId,
  });
  const selectedYear = years.find((year) => year.id === selectedYearId);
  const isDraft = selectedYear?.status === "DRAFT";

  const invalidateSetup = () => {
    queryClient.invalidateQueries({ queryKey: ["academic-years"] });
    queryClient.invalidateQueries({ queryKey: ["sections"] });
    queryClient.invalidateQueries({ queryKey: ["curriculum"] });
    queryClient.invalidateQueries({ queryKey: ["assessment-scheme"] });
  };

  if (!canView) return <Forbidden />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic foundation"
        description="Configure progression, yearly class streams, curriculum, terms and assessment rules."
      />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="min-w-56">
          <label className="text-xs font-medium text-muted-foreground">Working academic year</label>
          <select
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selectedYearId}
            onChange={(event) => setSelectedYearId(event.target.value)}
          >
            {years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name} — {year.status}
              </option>
            ))}
          </select>
        </div>
        {selectedYear && (
          <Badge className={statusTone(selectedYear.status)}>
            {selectedYear.termCount} terms · {selectedYear.status}
          </Badge>
        )}
        {selectedYear?.status === "ACTIVE" && (
          <p className="text-xs text-muted-foreground">
            Year structure is locked. Class-teacher assignments remain editable.
          </p>
        )}
        {selectedYear?.status === "CLOSED" && (
          <p className="text-xs text-muted-foreground">
            Historical structure is read-only. Select a draft or active year.
          </p>
        )}
      </div>

      <Tabs defaultValue="years">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="years">
            <CalendarDays className="mr-1.5 h-4 w-4" />
            Years & terms
          </TabsTrigger>
          <TabsTrigger value="levels">
            <GraduationCap className="mr-1.5 h-4 w-4" />
            Grade levels
          </TabsTrigger>
          <TabsTrigger value="sections">
            <School className="mr-1.5 h-4 w-4" />
            Class streams
          </TabsTrigger>
          <TabsTrigger value="subjects">
            <BookOpen className="mr-1.5 h-4 w-4" />
            Subjects
          </TabsTrigger>
          <TabsTrigger value="curriculum">
            <Check className="mr-1.5 h-4 w-4" />
            Curriculum
          </TabsTrigger>
          <TabsTrigger value="assessment">
            <Settings2 className="mr-1.5 h-4 w-4" />
            Assessment
          </TabsTrigger>
        </TabsList>

        <TabsContent value="years" className="mt-4">
          <YearsPanel
            canManage={canManage}
            years={years}
            defaultTermCount={settingsQuery.data?.settings.defaultTermCount ?? 3}
            invalidate={invalidateSetup}
          />
        </TabsContent>
        <TabsContent value="levels" className="mt-4">
          <LevelsPanel
            canManage={canManage}
            levels={levels}
            refresh={() => queryClient.invalidateQueries({ queryKey: ["grade-levels"] })}
          />
        </TabsContent>
        <TabsContent value="sections" className="mt-4">
          <SectionsPanel
            canManage={canManage && isDraft}
            canAssign={canManage && selectedYear?.status !== "CLOSED"}
            yearId={selectedYearId}
            sections={sectionsQuery.data?.sections ?? []}
            levels={levels}
            teachers={teachers}
            refresh={() =>
              queryClient.invalidateQueries({ queryKey: ["sections", selectedYearId] })
            }
          />
        </TabsContent>
        <TabsContent value="subjects" className="mt-4">
          <SubjectsPanel
            canManage={canManage}
            subjects={subjects}
            refresh={() => queryClient.invalidateQueries({ queryKey: ["subjects"] })}
          />
        </TabsContent>
        <TabsContent value="curriculum" className="mt-4">
          <CurriculumPanel
            canManage={canManage && isDraft}
            yearId={selectedYearId}
            levelId={selectedLevelId}
            setLevelId={setSelectedLevelId}
            levels={levels}
            subjects={subjects}
            current={curriculumQuery.data?.curriculum ?? []}
            refresh={() =>
              queryClient.invalidateQueries({
                queryKey: ["curriculum", selectedYearId, selectedLevelId],
              })
            }
          />
        </TabsContent>
        <TabsContent value="assessment" className="mt-4">
          <AssessmentPanel
            canManage={canManage && isDraft}
            yearId={selectedYearId}
            scheme={schemeQuery.data?.scheme ?? null}
            refresh={() =>
              queryClient.invalidateQueries({ queryKey: ["assessment-scheme", selectedYearId] })
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function YearsPanel({
  canManage,
  years,
  defaultTermCount,
  invalidate,
}: {
  canManage: boolean;
  years: Awaited<ReturnType<typeof academicApi.getYears>>["years"];
  defaultTermCount: number;
  invalidate: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [termCount, setTermCount] = useState(defaultTermCount);
  const [termDates, setTermDates] = useState<{ startDate: string; endDate: string }[]>(
    Array.from({ length: defaultTermCount }, () => ({ startDate: "", endDate: "" })),
  );
  useEffect(() => {
    setTermCount(defaultTermCount);
    setTermDates(Array.from({ length: defaultTermCount }, () => ({ startDate: "", endDate: "" })));
  }, [defaultTermCount]);
  const setCount = (count: number) => {
    setTermCount(count);
    setTermDates((current) =>
      Array.from({ length: count }, (_, index) => current[index] ?? { startDate: "", endDate: "" }),
    );
  };
  const mutation = useMutation({
    mutationFn: () =>
      academicApi.createYear({ name, startDate, endDate, termCount, terms: termDates }),
    onSuccess: () => {
      toast.success("Draft academic year created");
      setName("");
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const settingsMutation = useMutation({
    mutationFn: (count: number) => academicApi.updateSettings({ defaultTermCount: count }),
    onSuccess: () => {
      toast.success("Default term count updated");
      queryClient.invalidateQueries({ queryKey: ["academic-settings"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const actionMutation = useMutation({
    mutationFn: async ({
      type,
      id,
      termStatus,
    }: {
      type: string;
      id: string;
      termStatus?: "ACTIVE" | "CLOSED";
    }) => {
      if (type === "activate") await academicApi.activateYear(id);
      else if (type === "close") await academicApi.closeYear(id);
      else await academicApi.transitionTerm(id, termStatus!);
    },
    onSuccess: () => {
      toast.success("Academic lifecycle updated");
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const copyMutation = useMutation({
    mutationFn: ({ targetYearId, sourceYearId }: { targetYearId: string; sourceYearId: string }) =>
      academicApi.copyYearStructure(targetYearId, { sourceYearId }),
    onSuccess: () => {
      toast.success("Sections, curriculum and assessment scheme copied");
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">Create draft year</h3>
        <div className="mt-4 space-y-3">
          <Input
            placeholder="2027 / 2028"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!canManage}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              disabled={!canManage}
            />
            <Input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              disabled={!canManage}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Terms in this year</label>
            <select
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={termCount}
              onChange={(event) => setCount(Number(event.target.value))}
              disabled={!canManage}
            >
              {[1, 2, 3, 4].map((count) => (
                <option key={count}>{count}</option>
              ))}
            </select>
          </div>
          {termDates.map((term, index) => (
            <div key={index} className="rounded-lg border p-3">
              <div className="mb-2 text-xs font-semibold">Term {index + 1}</div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={term.startDate}
                  onChange={(event) =>
                    setTermDates((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, startDate: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Input
                  type="date"
                  value={term.endDate}
                  onChange={(event) =>
                    setTermDates((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, endDate: event.target.value } : item,
                      ),
                    )
                  }
                />
              </div>
            </div>
          ))}
          <Button
            className="w-full"
            onClick={() => mutation.mutate()}
            disabled={
              !canManage ||
              mutation.isPending ||
              !name ||
              !startDate ||
              !endDate ||
              termDates.some((term) => !term.startDate || !term.endDate)
            }
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Create draft
          </Button>
        </div>
        <div className="mt-6 border-t pt-4">
          <label className="text-xs font-medium">Default terms for future years</label>
          <div className="mt-2 flex gap-2">
            <select
              className="h-9 flex-1 rounded-md border bg-background px-2"
              value={defaultTermCount}
              onChange={(event) => settingsMutation.mutate(Number(event.target.value))}
              disabled={!canManage}
            >
              {[1, 2, 3, 4].map((count) => (
                <option key={count}>{count}</option>
              ))}
            </select>
          </div>
        </div>
      </section>
      <section className="space-y-3">
        {years.map((year) => {
          const copySource =
            years.find((candidate) => candidate.id !== year.id && candidate.status !== "DRAFT") ??
            years.find((candidate) => candidate.id !== year.id);
          return (
            <div key={year.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{year.name}</h3>
                    <Badge className={statusTone(year.status)}>{year.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {year.startDate.slice(0, 10)} → {year.endDate.slice(0, 10)} · {year.termCount}{" "}
                    terms
                  </p>
                </div>
                <div className="flex gap-2">
                  {year.status === "DRAFT" && copySource && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        copyMutation.mutate({ targetYearId: year.id, sourceYearId: copySource.id })
                      }
                      disabled={!canManage}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Copy {copySource.name}
                    </Button>
                  )}
                  {year.status === "DRAFT" && (
                    <Button
                      size="sm"
                      onClick={() => actionMutation.mutate({ type: "activate", id: year.id })}
                      disabled={!canManage}
                    >
                      Activate
                    </Button>
                  )}
                  {year.status === "ACTIVE" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => actionMutation.mutate({ type: "close", id: year.id })}
                      disabled={!canManage}
                    >
                      Close year
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-3">
                {year.terms.map((term) => (
                  <div key={term.id} className="rounded-lg bg-muted/35 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{term.name}</span>
                      <Badge variant="outline">{term.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {term.startDate.slice(0, 10)} → {term.endDate.slice(0, 10)}
                    </p>
                    {year.status === "ACTIVE" && (
                      <div className="mt-2">
                        {term.status === "ACTIVE" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              actionMutation.mutate({
                                type: "term",
                                id: term.id,
                                termStatus: "CLOSED",
                              })
                            }
                            disabled={!canManage}
                          >
                            Close term
                          </Button>
                        )}
                        {term.status === "PENDING" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              actionMutation.mutate({
                                type: "term",
                                id: term.id,
                                termStatus: "ACTIVE",
                              })
                            }
                            disabled={!canManage}
                          >
                            Activate
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function LevelsPanel({
  canManage,
  levels,
  refresh,
}: {
  canManage: boolean;
  levels: Awaited<ReturnType<typeof academicApi.getGradeLevels>>["gradeLevels"];
  refresh: () => void;
}) {
  const [form, setForm] = useState({ name: "", code: "", order: levels.length + 1 });
  const createMutation = useMutation({
    mutationFn: () =>
      academicApi.createGradeLevel({ ...form, nextGradeLevelId: null, isFinal: false }),
    onSuccess: () => {
      toast.success("Grade level created");
      setForm({ name: "", code: "", order: levels.length + 2 });
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { nextGradeLevelId?: string | null; isFinal?: boolean };
    }) => academicApi.updateGradeLevel(id, data),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <section className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold">New grade level</h3>
        <div className="mt-4 space-y-3">
          <Input
            placeholder="Grade name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <Input
            placeholder="Code"
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
          />
          <Input
            type="number"
            min={1}
            value={form.order}
            onChange={(event) => setForm({ ...form, order: Number(event.target.value) })}
          />
          <Button
            className="w-full"
            disabled={!canManage || !form.name || !form.code}
            onClick={() => createMutation.mutate()}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add level
          </Button>
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left">Order</th>
              <th className="px-4 py-3 text-left">Level</th>
              <th className="px-4 py-3 text-left">Next level</th>
              <th className="px-4 py-3 text-center">Final</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {levels.map((level) => (
              <tr key={level.id}>
                <td className="px-4 py-3">{level.order}</td>
                <td className="px-4 py-3 font-medium">
                  {level.name} <span className="text-xs text-muted-foreground">({level.code})</span>
                </td>
                <td className="px-4 py-3">
                  <select
                    className="h-8 rounded border bg-background px-2"
                    value={level.nextGradeLevelId ?? ""}
                    disabled={!canManage || level.isFinal}
                    onChange={(event) =>
                      updateMutation.mutate({
                        id: level.id,
                        data: { nextGradeLevelId: event.target.value || null },
                      })
                    }
                  >
                    <option value="">None</option>
                    {levels
                      .filter((item) => item.id !== level.id)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={level.isFinal}
                    disabled={!canManage}
                    onChange={(event) =>
                      updateMutation.mutate({
                        id: level.id,
                        data: {
                          isFinal: event.target.checked,
                          nextGradeLevelId: event.target.checked ? null : level.nextGradeLevelId,
                        },
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function SectionsPanel({
  canManage,
  canAssign,
  yearId,
  sections,
  levels,
  teachers,
  refresh,
}: {
  canManage: boolean;
  canAssign: boolean;
  yearId: string;
  sections: Awaited<ReturnType<typeof academicApi.getClasses>>["sections"];
  levels: Awaited<ReturnType<typeof academicApi.getGradeLevels>>["gradeLevels"];
  teachers: { id: string; name: string }[];
  refresh: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    gradeLevelId: "",
    capacity: 35,
    classTeacherId: "",
  });
  useEffect(() => {
    if (!form.gradeLevelId && levels.length)
      setForm((value) => ({ ...value, gradeLevelId: levels[0].id }));
  }, [levels, form.gradeLevelId]);
  const mutation = useMutation({
    mutationFn: () =>
      academicApi.createClass({
        academicYearId: yearId,
        ...form,
        classTeacherId: form.classTeacherId || null,
      }),
    onSuccess: () => {
      toast.success("Class stream created");
      setForm((value) => ({ ...value, name: "" }));
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const assignmentMutation = useMutation({
    mutationFn: ({ id, classTeacherId }: { id: string; classTeacherId: string | null }) =>
      academicApi.updateClass(id, { classTeacherId }),
    onSuccess: () => {
      toast.success("Class teacher updated");
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <Input
            placeholder="e.g. Basic 1 A"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={form.gradeLevelId}
            onChange={(event) => setForm({ ...form, gradeLevelId: event.target.value })}
          >
            {levels
              .filter((level) => level.active)
              .map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
          </select>
          <Input
            type="number"
            min={1}
            value={form.capacity}
            onChange={(event) => setForm({ ...form, capacity: Number(event.target.value) })}
          />
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={form.classTeacherId}
            onChange={(event) => setForm({ ...form, classTeacherId: event.target.value })}
          >
            <option value="">Unassigned teacher</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.name}
              </option>
            ))}
          </select>
          <Button disabled={!canManage || !yearId || !form.name} onClick={() => mutation.mutate()}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add stream
          </Button>
        </div>
      </section>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <div key={section.id} className="rounded-xl border bg-card p-4">
            <div className="flex justify-between">
              <div>
                <h3 className="font-semibold">{section.name}</h3>
                <p className="text-xs text-muted-foreground">{section.gradeLevelName}</p>
              </div>
              <Badge variant="outline">
                {section.studentCount}/{section.capacity}
              </Badge>
            </div>
            <label className="mt-3 block space-y-1 text-xs font-medium">
              Class teacher
              <select
                aria-label={`Class teacher for ${section.name}`}
                value={section.teacherId ?? ""}
                disabled={!canAssign || assignmentMutation.isPending}
                onChange={(event) =>
                  assignmentMutation.mutate({
                    id: section.id,
                    classTeacherId: event.target.value || null,
                  })
                }
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Unassigned teacher</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </section>
    </div>
  );
}

function SubjectsPanel({
  canManage,
  subjects,
  refresh,
}: {
  canManage: boolean;
  subjects: Awaited<ReturnType<typeof academicApi.getSubjects>>["subjects"];
  refresh: () => void;
}) {
  const [form, setForm] = useState({ name: "", code: "", description: "" });
  const createMutation = useMutation({
    mutationFn: () => academicApi.createSubject(form),
    onSuccess: () => {
      toast.success("Subject created");
      setForm({ name: "", code: "", description: "" });
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const archiveMutation = useMutation({
    mutationFn: academicApi.deleteSubject,
    onSuccess: () => {
      toast.success("Subject archived");
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <div className="space-y-4">
      <section className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[1fr_160px_1fr_auto]">
        <Input
          placeholder="Subject name"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <Input
          placeholder="Code"
          value={form.code}
          onChange={(event) => setForm({ ...form, code: event.target.value })}
        />
        <Input
          placeholder="Description (optional)"
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
        <Button
          disabled={!canManage || !form.name || !form.code}
          onClick={() => createMutation.mutate()}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      </section>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {subjects.map((subject) => (
          <div key={subject.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{subject.name}</h3>
                <p className="text-xs text-muted-foreground">{subject.code}</p>
              </div>
              <Badge variant="outline">{subject.active ? "Active" : "Archived"}</Badge>
            </div>
            {subject.description && (
              <p className="mt-2 text-xs text-muted-foreground">{subject.description}</p>
            )}
            {subject.active && (
              <Button
                className="mt-3"
                size="sm"
                variant="ghost"
                disabled={!canManage}
                onClick={() => archiveMutation.mutate(subject.id)}
              >
                Archive
              </Button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

function CurriculumPanel({
  canManage,
  yearId,
  levelId,
  setLevelId,
  levels,
  subjects,
  current,
  refresh,
}: {
  canManage: boolean;
  yearId: string;
  levelId: string;
  setLevelId: (id: string) => void;
  levels: Awaited<ReturnType<typeof academicApi.getGradeLevels>>["gradeLevels"];
  subjects: Awaited<ReturnType<typeof academicApi.getSubjects>>["subjects"];
  current: { subjectId: string; passMark: number; sortOrder: number }[];
  refresh: () => void;
}) {
  const [selected, setSelected] = useState<Record<string, { passMark: number; sortOrder: number }>>(
    {},
  );
  useEffect(() => {
    setSelected(
      Object.fromEntries(
        current.map((item) => [
          item.subjectId,
          { passMark: item.passMark, sortOrder: item.sortOrder },
        ]),
      ),
    );
  }, [current]);
  const mutation = useMutation({
    mutationFn: () =>
      academicApi.saveCurriculum(
        yearId,
        levelId,
        Object.entries(selected).map(([subjectId, value]) => ({ subjectId, ...value })),
      ),
    onSuccess: () => {
      toast.success("Curriculum saved");
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Grade level</label>
          <select
            className="mt-1 h-9 min-w-52 rounded-md border bg-background px-2"
            value={levelId}
            onChange={(event) => setLevelId(event.target.value)}
          >
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
        </div>
        <Button disabled={!canManage} onClick={() => mutation.mutate()}>
          <Save className="mr-1.5 h-4 w-4" />
          Save curriculum
        </Button>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {subjects
          .filter((subject) => subject.active)
          .map((subject, index) => {
            const value = selected[subject.id];
            return (
              <label
                key={subject.id}
                className={`rounded-lg border p-3 ${value ? "border-brand bg-brand/5" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!value}
                    disabled={!canManage}
                    onChange={(event) =>
                      setSelected((state) => {
                        const next = { ...state };
                        if (event.target.checked)
                          next[subject.id] = { passMark: 50, sortOrder: index + 1 };
                        else delete next[subject.id];
                        return next;
                      })
                    }
                  />
                  <span className="text-sm font-medium">{subject.name}</span>
                </div>
                {value && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    Pass mark{" "}
                    <Input
                      className="h-7 w-20"
                      type="number"
                      min={0}
                      max={100}
                      value={value.passMark}
                      onChange={(event) =>
                        setSelected((state) => ({
                          ...state,
                          [subject.id]: { ...value, passMark: Number(event.target.value) },
                        }))
                      }
                    />
                  </div>
                )}
              </label>
            );
          })}
      </div>
    </section>
  );
}

const defaultScheme: Omit<ApiAssessmentScheme, "id" | "locked"> = {
  name: "40/60 Standard Assessment",
  components: [
    { name: "Class Score", code: "CLASS_SCORE", maxScore: 40, sequence: 1 },
    { name: "Exam", code: "EXAM", maxScore: 60, sequence: 2 },
  ],
  gradeBands: [
    { minScore: 80, maxScore: 100, grade: "A", remark: "Excellent" },
    { minScore: 70, maxScore: 79.99, grade: "B", remark: "Very Good" },
    { minScore: 60, maxScore: 69.99, grade: "C", remark: "Good" },
    { minScore: 50, maxScore: 59.99, grade: "D", remark: "Pass" },
    { minScore: 0, maxScore: 49.99, grade: "F", remark: "Needs Improvement" },
  ],
};

function AssessmentPanel({
  canManage,
  yearId,
  scheme,
  refresh,
}: {
  canManage: boolean;
  yearId: string;
  scheme: ApiAssessmentScheme | null;
  refresh: () => void;
}) {
  const [draft, setDraft] = useState(defaultScheme);
  useEffect(() => {
    if (scheme)
      setDraft({
        name: scheme.name,
        components: scheme.components.map(({ name, code, maxScore, sequence }) => ({
          name,
          code,
          maxScore,
          sequence,
        })),
        gradeBands: scheme.gradeBands.map(({ minScore, maxScore, grade, remark }) => ({
          minScore,
          maxScore,
          grade,
          remark,
        })),
      });
  }, [scheme]);
  const mutation = useMutation({
    mutationFn: () => academicApi.saveAssessmentScheme(yearId, draft),
    onSuccess: () => {
      toast.success("Assessment scheme saved");
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const total = draft.components.reduce((sum, component) => sum + component.maxScore, 0);
  const addComponent = () =>
    setDraft((current) => ({
      ...current,
      components: [
        ...current.components,
        {
          name: "New component",
          code: `COMP_${current.components.length + 1}`,
          maxScore: 0,
          sequence: current.components.length + 1,
        },
      ],
    }));
  const removeComponent = (index: number) =>
    setDraft((current) => ({
      ...current,
      components: current.components
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({ ...item, sequence: itemIndex + 1 })),
    }));
  const addBand = () =>
    setDraft((current) => ({
      ...current,
      gradeBands: [...current.gradeBands, { minScore: 0, maxScore: 0, grade: "", remark: "" }],
    }));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Assessment components</h3>
            <p className="text-xs text-muted-foreground">Maximum scores must total 100.</p>
          </div>
          <Badge
            className={
              total === 100
                ? "bg-success/15 text-[oklch(0.35_0.1_155)]"
                : "bg-destructive/10 text-destructive"
            }
          >
            {total}/100
          </Badge>
        </div>
        <div className="mt-4 space-y-2">
          {draft.components.map((component, index) => (
            <div
              key={`${component.code}-${index}`}
              className="grid grid-cols-[1fr_100px_auto] gap-2"
            >
              <Input
                value={component.name}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    components: draft.components.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            name: event.target.value,
                            code: event.target.value.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
                          }
                        : item,
                    ),
                  })
                }
              />
              <Input
                type="number"
                value={component.maxScore}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    components: draft.components.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, maxScore: Number(event.target.value) }
                        : item,
                    ),
                  })
                }
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={!canManage || draft.components.length === 1}
                onClick={() => removeComponent(index)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          disabled={!canManage || draft.components.length >= 6}
          onClick={addComponent}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add component
        </Button>
      </section>
      <section className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold">Grade bands</h3>
        <div className="mt-4 space-y-2">
          {draft.gradeBands.map((band, index) => (
            <div
              key={`${band.grade}-${index}`}
              className="grid grid-cols-[65px_65px_60px_1fr_auto] gap-2"
            >
              <Input
                type="number"
                value={band.minScore}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    gradeBands: draft.gradeBands.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, minScore: Number(event.target.value) }
                        : item,
                    ),
                  })
                }
              />
              <Input
                type="number"
                value={band.maxScore}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    gradeBands: draft.gradeBands.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, maxScore: Number(event.target.value) }
                        : item,
                    ),
                  })
                }
              />
              <Input
                value={band.grade}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    gradeBands: draft.gradeBands.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, grade: event.target.value } : item,
                    ),
                  })
                }
              />
              <Input
                value={band.remark}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    gradeBands: draft.gradeBands.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, remark: event.target.value } : item,
                    ),
                  })
                }
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={!canManage || draft.gradeBands.length === 1}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    gradeBands: current.gradeBands.filter((_, itemIndex) => itemIndex !== index),
                  }))
                }
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" disabled={!canManage} onClick={addBand}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add band
          </Button>
          <Button
            className="ml-auto"
            disabled={!canManage || total !== 100 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <Save className="mr-1.5 h-4 w-4" />
            Save scheme
          </Button>
        </div>
      </section>
    </div>
  );
}
