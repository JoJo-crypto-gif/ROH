import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, Printer, RotateCcw, Save, User } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { academicApi, studentsApi, type ApiGradebook } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/gradebook")({
  head: () => ({ meta: [{ title: "Gradebook — Lumen Suite" }] }),
  component: GradebookPage,
});

function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function GradebookPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canView = hasPermission(user, "gradebook.view");
  const canEdit = hasPermission(user, "gradebook.edit");
  const [sectionId, setSectionId] = useState("");
  const [termId, setTermId] = useState("");
  const [enrolmentId, setEnrolmentId] = useState("");
  const [scores, setScores] = useState<Record<string, Record<string, number | "">>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [conduct, setConduct] = useState("");
  const [attitude, setAttitude] = useState("");
  const [teacherRemarks, setTeacherRemarks] = useState("");

  const yearsQuery = useQuery({ queryKey: ["academic-years"], queryFn: academicApi.getYears });
  const years = useMemo(() => yearsQuery.data?.years ?? [], [yearsQuery.data?.years]);
  const activeYear = useMemo(() => years.find((year) => year.status === "ACTIVE"), [years]);
  const terms = useMemo(() => activeYear?.terms ?? [], [activeYear]);
  useEffect(() => {
    if (terms.length && !terms.some((term) => term.id === termId))
      setTermId((terms.find((term) => term.status === "ACTIVE") ?? terms[terms.length - 1]).id);
  }, [terms, termId]);
  const sectionsQuery = useQuery({
    queryKey: ["gradebook-sections", activeYear?.id],
    queryFn: () => academicApi.getGradebookSections(activeYear?.id),
    enabled: !!activeYear,
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
    queryKey: ["students", sectionId],
    queryFn: () => studentsApi.list({ classId: sectionId, status: "active" }),
    enabled: !!sectionId,
  });
  const students = useMemo(
    () => studentsQuery.data?.students ?? [],
    [studentsQuery.data?.students],
  );
  useEffect(() => {
    if (students.length && !students.some((student) => student.enrolmentId === enrolmentId))
      setEnrolmentId(students[0].enrolmentId ?? "");
  }, [students, enrolmentId]);
  const gradebookQuery = useQuery({
    queryKey: ["gradebook", enrolmentId, termId],
    queryFn: () => academicApi.getGradebook(enrolmentId, termId),
    enabled: !!enrolmentId && !!termId,
  });
  const gradebook = gradebookQuery.data;
  useEffect(() => {
    if (!gradebook) return;
    setScores(
      Object.fromEntries(
        gradebook.subjects.map((subject) => [
          subject.curriculumSubjectId,
          Object.fromEntries(subject.scores.map((score) => [score.componentId, score.score ?? ""])),
        ]),
      ),
    );
    setRemarks(
      Object.fromEntries(
        gradebook.subjects.map((subject) => [subject.curriculumSubjectId, subject.remarks]),
      ),
    );
    setConduct(gradebook.report.conduct ?? "");
    setAttitude(gradebook.report.attitude ?? "");
    setTeacherRemarks(gradebook.report.teacherRemarks ?? "");
  }, [gradebook]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!gradebook) return;
      const entries = gradebook.subjects.map((subject) => ({
        curriculumSubjectId: subject.curriculumSubjectId,
        scores: gradebook.components.map((component) => ({
          componentId: component.id,
          score: Number(scores[subject.curriculumSubjectId]?.[component.id] ?? 0),
        })),
        remarks: remarks[subject.curriculumSubjectId] ?? "",
      }));
      await academicApi.saveGradebook({ enrolmentId, termId, entries });
      await academicApi.saveRemarks({ enrolmentId, termId, conduct, attitude, teacherRemarks });
    },
    onSuccess: () => {
      toast.success("Gradebook saved");
      queryClient.invalidateQueries({ queryKey: ["gradebook", enrolmentId, termId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Unable to save gradebook"),
  });
  const positionMutation = useMutation({
    mutationFn: () => academicApi.computePositions({ sectionId, termId }),
    onSuccess: (result) => {
      toast.success(`${result.ranked} students ranked; ${result.excluded} incomplete`);
      queryClient.invalidateQueries({ queryKey: ["gradebook"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Unable to compute positions"),
  });
  const correctionMutation = useMutation({
    mutationFn: () =>
      academicApi.beginReportCorrection(
        enrolmentId,
        termId,
        "Academic record correction requested from gradebook",
      ),
    onSuccess: () => {
      toast.success("Correction draft opened");
      queryClient.invalidateQueries({ queryKey: ["gradebook", enrolmentId, termId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Unable to open correction"),
  });
  const previewMutation = useMutation({
    mutationFn: () => academicApi.previewReport(enrolmentId, termId),
    onSuccess: openBlob,
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Unable to preview report"),
  });
  const selectedTerm = terms.find((term) => term.id === termId);
  const totals = useMemo(
    () =>
      gradebook?.subjects.map((subject) => ({
        id: subject.curriculumSubjectId,
        total: gradebook.components.reduce(
          (sum, component) =>
            sum + Number(scores[subject.curriculumSubjectId]?.[component.id] ?? 0),
          0,
        ),
      })) ?? [],
    [gradebook, scores],
  );

  if (!canView) return <Forbidden />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gradebook"
        description="Enter configurable assessment components and compile each student's terminal report."
        actions={
          <Button
            variant="outline"
            onClick={() => positionMutation.mutate()}
            disabled={!canEdit || !sectionId || !termId}
          >
            <Calculator className="mr-1.5 h-4 w-4" />
            Compute positions
          </Button>
        }
      />
      <section className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div>
          <label className="text-xs text-muted-foreground">Class stream</label>
          <select
            className="mt-1 h-9 min-w-52 rounded-md border bg-background px-2"
            value={sectionId}
            onChange={(event) => {
              setSectionId(event.target.value);
              setEnrolmentId("");
            }}
          >
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.className}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Term</label>
          <select
            className="mt-1 h-9 min-w-44 rounded-md border bg-background px-2"
            value={termId}
            onChange={(event) => setTermId(event.target.value)}
          >
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.name} — {term.status}
              </option>
            ))}
          </select>
        </div>
        {gradebook && <Badge variant="outline">Report: {gradebook.report.status}</Badge>}
      </section>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-xl border bg-card p-3">
          <div className="mb-2 px-2 text-xs font-semibold uppercase text-muted-foreground">
            Students
          </div>
          <div className="max-h-[680px] space-y-1 overflow-y-auto">
            {students.map((student) => (
              <button
                key={student.id}
                onClick={() => setEnrolmentId(student.enrolmentId ?? "")}
                className={`flex w-full items-center gap-3 rounded-lg p-2 text-left ${student.enrolmentId === enrolmentId ? "bg-brand/10 text-brand" : "hover:bg-muted"}`}
              >
                <span
                  className="grid h-8 w-8 place-items-center rounded-full text-xs text-white"
                  style={{ backgroundColor: student.photoColor }}
                >
                  {student.firstName[0]}
                  {student.lastName[0]}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {student.firstName} {student.lastName}
                  </span>
                  <span className="block text-xs text-muted-foreground">{student.admissionNo}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>
        <main className="min-h-[600px] rounded-xl border bg-card p-5">
          {!enrolmentId ? (
            <div className="grid h-full place-items-center text-muted-foreground">
              <User className="h-8 w-8" />
              Select a student.
            </div>
          ) : gradebookQuery.isLoading ? (
            <div className="grid h-60 place-items-center text-sm text-muted-foreground">
              Loading gradebook…
            </div>
          ) : gradebook ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">
                    {gradebook.enrolment.firstName} {gradebook.enrolment.lastName}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {gradebook.enrolment.admissionNo} · {gradebook.enrolment.sectionName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => previewMutation.mutate()}>
                    <Printer className="mr-1.5 h-4 w-4" />
                    Preview PDF
                  </Button>
                  {gradebook.report.status === "PUBLISHED" &&
                    hasPermission(user, "reports.reissue") && (
                      <Button variant="outline" onClick={() => correctionMutation.mutate()}>
                        <RotateCcw className="mr-1.5 h-4 w-4" />
                        Open correction
                      </Button>
                    )}
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Subject</th>
                      {gradebook.components.map((component) => (
                        <th key={component.id} className="px-2 py-2 text-center">
                          {component.name}
                          <span className="block font-normal">/{component.maxScore}</span>
                        </th>
                      ))}
                      <th className="px-2 py-2 text-center">Total</th>
                      <th className="px-2 py-2 text-center">Grade</th>
                      <th className="px-2 py-2 text-center">Position</th>
                      <th className="px-3 py-2 text-left">Remark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {gradebook.subjects.map((subject) => {
                      const total =
                        totals.find((item) => item.id === subject.curriculumSubjectId)?.total ?? 0;
                      return (
                        <tr key={subject.curriculumSubjectId}>
                          <td className="px-3 py-2 font-medium">{subject.subjectName}</td>
                          {gradebook.components.map((component) => (
                            <td key={component.id} className="px-2 py-2">
                              <input
                                className="mx-auto block h-8 w-16 rounded border bg-background text-center"
                                type="number"
                                min={0}
                                max={component.maxScore}
                                value={scores[subject.curriculumSubjectId]?.[component.id] ?? ""}
                                disabled={!canEdit || !gradebook.editable}
                                onChange={(event) =>
                                  setScores((current) => ({
                                    ...current,
                                    [subject.curriculumSubjectId]: {
                                      ...current[subject.curriculumSubjectId],
                                      [component.id]:
                                        event.target.value === "" ? "" : Number(event.target.value),
                                    },
                                  }))
                                }
                              />
                            </td>
                          ))}
                          <td className="px-2 py-2 text-center font-bold">{total}</td>
                          <td className="px-2 py-2 text-center">{subject.grade ?? "-"}</td>
                          <td className="px-2 py-2 text-center">{subject.position ?? "-"}</td>
                          <td className="px-3 py-2">
                            <input
                              className="h-8 min-w-36 rounded border bg-background px-2"
                              value={remarks[subject.curriculumSubjectId] ?? ""}
                              disabled={!canEdit || !gradebook.editable}
                              onChange={(event) =>
                                setRemarks((current) => ({
                                  ...current,
                                  [subject.curriculumSubjectId]: event.target.value,
                                }))
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs font-medium">Conduct</label>
                  <input
                    className="mt-1 h-9 w-full rounded-md border bg-background px-3"
                    value={conduct}
                    disabled={!canEdit || !gradebook.editable}
                    onChange={(event) => setConduct(event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Attitude</label>
                  <input
                    className="mt-1 h-9 w-full rounded-md border bg-background px-3"
                    value={attitude}
                    disabled={!canEdit || !gradebook.editable}
                    onChange={(event) => setAttitude(event.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium">Class teacher remark</label>
                  <textarea
                    className="mt-1 w-full rounded-md border bg-background p-3 text-sm"
                    rows={3}
                    value={teacherRemarks}
                    disabled={!canEdit || !gradebook.editable}
                    onChange={(event) => setTeacherRemarks(event.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={!canEdit || !gradebook.editable || saveMutation.isPending}
                >
                  <Save className="mr-1.5 h-4 w-4" />
                  Save gradebook
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid h-60 place-items-center text-sm text-destructive">
              Unable to load gradebook.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
