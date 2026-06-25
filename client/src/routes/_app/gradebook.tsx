import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { BookOpenCheck, Save } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { academicApi } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/gradebook")({
  head: () => ({ meta: [{ title: "Gradebook — Lumen Suite" }] }),
  component: GradebookPage,
});

function calculateGrade(total: number) {
  if (total >= 90) return { grade: "A", remarks: "Excellent" };
  if (total >= 80) return { grade: "B", remarks: "Very Good" };
  if (total >= 70) return { grade: "C", remarks: "Good" };
  if (total >= 60) return { grade: "D", remarks: "Credit" };
  if (total >= 50) return { grade: "E", remarks: "Pass" };
  return { grade: "F", remarks: "Fail" };
}

function GradebookPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedCsId, setSelectedCsId] = useState("");
  const [scores, setScores] = useState<Record<string, { classScore: number; examScore: number }>>({});

  if (!hasPermission(user, "students.view")) return <Forbidden />;

  // Queries
  const { data: csData, isLoading: loadingCs } = useQuery({
    queryKey: ["class-subjects-list"],
    queryFn: academicApi.getClassSubjects,
  });

  const classSubjects = csData?.classSubjects ?? [];

  // Default selection
  useEffect(() => {
    if (classSubjects.length > 0 && !selectedCsId) {
      setSelectedCsId(classSubjects[0].id);
    }
  }, [classSubjects, selectedCsId]);

  const { data: gradebookData, isLoading: loadingGradebook } = useQuery({
    queryKey: ["gradebook", selectedCsId],
    queryFn: () => academicApi.getGradebook(selectedCsId),
    enabled: !!selectedCsId,
  });

  const records = gradebookData?.records ?? [];
  const classSubjectMeta = gradebookData?.classSubject ?? null;

  // Initialize inputs when data loads
  useEffect(() => {
    if (records.length > 0) {
      const initialScores = Object.fromEntries(
        records.map((r) => [
          r.studentId,
          { classScore: r.classScore, examScore: r.examScore },
        ])
      );
      setScores(initialScores);
    }
  }, [records]);

  // Mutation
  const saveGradebookMutation = useMutation({
    mutationFn: (data: { classSubjectId: string; entries: { studentId: string; classScore: number; examScore: number }[] }) =>
      academicApi.saveGradebook(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gradebook", selectedCsId] });
      toast.success("Gradebook marks updated successfully");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save marks");
    },
  });

  const handleScoreChange = (studentId: string, field: "classScore" | "examScore", valStr: string) => {
    let val = parseFloat(valStr) || 0;
    if (val < 0) val = 0;
    if (val > 100) val = 100;

    setScores((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: val,
      },
    }));
  };

  const handleSave = () => {
    const entries = Object.entries(scores).map(([studentId, item]) => ({
      studentId,
      classScore: item.classScore,
      examScore: item.examScore,
    }));

    saveGradebookMutation.mutate({
      classSubjectId: selectedCsId,
      entries,
    });
  };

  const isPending = saveGradebookMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gradebook"
        description="Continuous Assessment (CA) and final Exam marks entries."
      />

      <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px]">
            <label className="text-xs text-muted-foreground font-medium">Select Class & Subject</label>
            {loadingCs ? (
              <div className="h-9 w-full rounded-md border border-input bg-background animate-pulse" />
            ) : (
              <select
                value={selectedCsId}
                onChange={(e) => {
                  setSelectedCsId(e.target.value);
                  setScores({});
                }}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring"
              >
                {classSubjects.length === 0 && <option value="">No subjects assigned</option>}
                {classSubjects.map((cs) => (
                  <option key={cs.id} value={cs.id}>
                    {cs.className} · {cs.subjectName} ({cs.subjectCode})
                  </option>
                ))}
              </select>
            )}
          </div>

          {classSubjectMeta && (
            <div className="flex gap-4 ml-auto text-xs text-muted-foreground border-l border-border pl-4">
              <div>
                <span className="font-semibold block text-foreground">Continuous Assessment (CA)</span>
                Max: 40%
              </div>
              <div>
                <span className="font-semibold block text-foreground">Exam Score</span>
                Max: 60%
              </div>
              <div>
                <span className="font-semibold block text-foreground">Pass Mark</span>
                {classSubjectMeta.passMark}%
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedCsId && (
        <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
          <div className="border-b border-border px-4 py-2.5 text-sm font-semibold flex items-center gap-2">
            <BookOpenCheck className="h-4 w-4 text-brand" /> {records.length} enrolled students
          </div>

          {loadingGradebook ? (
            <div className="flex h-48 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-brand" />
                <p className="text-sm text-muted-foreground">Loading gradebook roster…</p>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Student</th>
                      <th className="px-4 py-2.5 text-left font-medium">Admission No</th>
                      <th className="px-4 py-2.5 text-center font-medium w-32">CA Score (40)</th>
                      <th className="px-4 py-2.5 text-center font-medium w-32">Exam Score (60)</th>
                      <th className="px-4 py-2.5 text-center font-medium w-24">Total</th>
                      <th className="px-4 py-2.5 text-center font-medium w-24">Grade</th>
                      <th className="px-4 py-2.5 text-left font-medium">Remark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {records.map((r) => {
                      const item = scores[r.studentId] || { classScore: 0, examScore: 0 };
                      const total = item.classScore + item.examScore;
                      const { grade, remarks } = calculateGrade(total);
                      const isPass = total >= (classSubjectMeta?.passMark ?? 50);

                      return (
                        <tr key={r.studentId} className="hover:bg-muted/10">
                          <td className="px-4 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <span
                                className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-xs font-medium text-white"
                                style={{ backgroundColor: r.photoColor }}
                              >
                                {r.firstName[0]}
                                {r.lastName[0]}
                              </span>
                              <div className="truncate font-medium text-foreground">
                                {r.firstName} {r.lastName}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{r.admissionNo}</td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min={0}
                              max={40}
                              step={0.5}
                              value={item.classScore}
                              onChange={(e) => handleScoreChange(r.studentId, "classScore", e.target.value)}
                              className="h-8 w-20 text-center rounded-md border border-input bg-card text-sm outline-none focus:border-ring"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min={0}
                              max={60}
                              step={0.5}
                              value={item.examScore}
                              onChange={(e) => handleScoreChange(r.studentId, "examScore", e.target.value)}
                              className="h-8 w-20 text-center rounded-md border border-input bg-card text-sm outline-none focus:border-ring"
                            />
                          </td>
                          <td className="px-4 py-3 text-center font-bold">{total}</td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                                isPass
                                  ? "bg-success/15 text-[oklch(0.35_0.1_155)]"
                                  : "bg-destructive/15 text-destructive"
                              }`}
                            >
                              {grade}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs ${
                                isPass ? "text-muted-foreground" : "text-destructive font-medium"
                              }`}
                            >
                              {remarks}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {records.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                          No students enrolled in this classroom.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {records.length > 0 && (
                <div className="border-t border-border p-3 flex justify-end">
                  <Button size="sm" onClick={handleSave} disabled={isPending}>
                    <Save className="mr-1.5 h-4 w-4" />
                    {isPending ? "Saving marks..." : "Save gradebook"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
