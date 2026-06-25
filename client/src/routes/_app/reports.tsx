import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Download, FileText, BarChart3, GraduationCap, ClipboardList, CheckCircle, Save } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { academicApi } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({ meta: [{ title: "Reports — Lumen Suite" }] }),
  component: ReportsPage,
});

const reportDownloads = [
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
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("downloads");
  const [classId, setClassId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Remarks Form State
  const [teacherRemarks, setTeacherRemarks] = useState("");
  const [principalRemark, setPrincipalRemark] = useState("");
  const [published, setPublished] = useState(false);

  if (!hasPermission(user, "reports.view")) return <Forbidden />;

  // Queries
  const { data: classesData, isLoading: loadingClasses } = useQuery({
    queryKey: ["classes"],
    queryFn: academicApi.getClasses,
  });

  const classrooms = classesData?.classrooms ?? [];

  // Default class selection
  useEffect(() => {
    if (classrooms.length > 0 && !classId) {
      setClassId(classrooms[0].id);
    }
  }, [classrooms, classId]);

  const { data: reportsData, isLoading: loadingReports } = useQuery({
    queryKey: ["class-reports", classId],
    queryFn: () => academicApi.getClassReports(classId),
    enabled: activeTab === "cards" && !!classId,
  });

  const reportsList = reportsData?.reports ?? [];

  const { data: cardData, isLoading: loadingCard } = useQuery({
    queryKey: ["student-report-card", selectedStudentId],
    queryFn: () => academicApi.getStudentReport(selectedStudentId!),
    enabled: !!selectedStudentId,
  });

  // Populate remarks fields when card loads
  useEffect(() => {
    if (cardData?.reportSummary) {
      setTeacherRemarks(cardData.reportSummary.teacherRemarks ?? "");
      setPrincipalRemark(cardData.reportSummary.principalRemark ?? "");
      setPublished(cardData.reportSummary.published ?? false);
    }
  }, [cardData]);

  // Mutation
  const saveRemarksMutation = useMutation({
    mutationFn: (data: { studentId: string; teacherRemarks?: string; principalRemark?: string; published?: boolean }) =>
      academicApi.saveRemarks(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-reports", classId] });
      queryClient.invalidateQueries({ queryKey: ["student-report-card", selectedStudentId] });
      toast.success("Report card remarks saved and updated");
      setSelectedStudentId(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update report remarks");
    },
  });

  const handleSaveRemarks = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) return;

    saveRemarksMutation.mutate({
      studentId: selectedStudentId,
      teacherRemarks,
      principalRemark,
      published,
    });
  };

  const cardDetails = cardData ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Download general sheets or compile terminal student report cards." />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="downloads">General Downloads</TabsTrigger>
          <TabsTrigger value="cards">Term Report Cards</TabsTrigger>
        </TabsList>

        {/* TAB 1: DOWNLOAD SHEETS */}
        <TabsContent value="downloads" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reportDownloads.map(r => (
              <div key={r.name} className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground">
                  <BarChart3 className="h-5 w-5" />
                </span>
                <h3 className="mt-3 text-sm font-semibold">{r.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{r.desc}</p>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1"><FileText className="mr-1.5 h-3.5 w-3.5" /> PDF</Button>
                  <Button size="sm" className="flex-1"><Download className="mr-1.5 h-3.5 w-3.5" /> Excel</Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* TAB 2: STUDENT REPORT CARDS */}
        <TabsContent value="cards" className="mt-4 space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="min-w-[240px] max-w-xs">
              <label className="text-xs text-muted-foreground font-medium">Select Classroom</label>
              {loadingClasses ? (
                <div className="h-9 w-full rounded-md border border-input bg-background animate-pulse mt-1" />
              ) : (
                <select
                  value={classId}
                  onChange={e => setClassId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring"
                >
                  {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
            <div className="border-b border-border px-4 py-2.5 text-sm font-semibold flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-brand" /> Reports compilation
            </div>

            {loadingReports ? (
              <div className="flex h-48 items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-brand" />
                  <p className="text-sm text-muted-foreground">Compiling reports…</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Student</th>
                      <th className="px-4 py-2.5 text-left font-medium">Admission No</th>
                      <th className="px-4 py-2.5 text-center font-medium">Average Score</th>
                      <th className="px-4 py-2.5 text-center font-medium">Remarks Status</th>
                      <th className="px-4 py-2.5 text-center font-medium">Status</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {reportsList.map(r => {
                      const hasRemarks = !!r.teacherRemarks || !!r.principalRemark;
                      return (
                        <tr key={r.studentId} className="hover:bg-muted/10">
                          <td className="px-4 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-xs font-medium text-white" style={{ backgroundColor: r.photoColor }}>
                                {r.firstName[0]}{r.lastName[0]}
                              </span>
                              <div className="truncate font-medium text-foreground">{r.firstName} {r.lastName}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{r.admissionNo}</td>
                          <td className="px-4 py-3 text-center font-bold">{r.averageScore}%</td>
                          <td className="px-4 py-3 text-center">
                            {hasRemarks ? (
                              <Badge className="bg-success/10 text-[oklch(0.35_0.1_155)] hover:bg-success/15 border-transparent">Completed</Badge>
                            ) : (
                              <Badge className="bg-warning/10 text-[oklch(0.4_0.12_70)] hover:bg-warning/15 border-transparent">Pending</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {r.published ? (
                              <Badge className="bg-brand/10 text-brand hover:bg-brand/15 border-transparent">Published</Badge>
                            ) : (
                              <Badge className="bg-muted text-muted-foreground border-transparent">Draft</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button size="xs" onClick={() => setSelectedStudentId(r.studentId)}>
                              Compile Report
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {reportsList.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No students enrolled in this classroom.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Compile Report Card Dialog */}
      <Dialog open={!!selectedStudentId} onOpenChange={(open) => !open && setSelectedStudentId(null)}>
        <DialogContent className="sm:max-w-2xl">
          {loadingCard || !cardDetails ? (
            <div className="flex h-60 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-brand" />
            </div>
          ) : (
            <form onSubmit={handleSaveRemarks}>
              <DialogHeader>
                <DialogTitle>Term Report Card</DialogTitle>
                <DialogDescription>
                  Compiled grade sheet for {cardDetails.student.firstName} {cardDetails.student.lastName} ({cardDetails.student.admissionNo}) · Class {cardDetails.student.className}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-1">
                {/* Attendance Summary */}
                <div className="rounded-lg bg-muted/40 p-3 grid grid-cols-4 gap-2 text-center text-xs">
                  <div>
                    <span className="text-muted-foreground block font-medium">Present Days</span>
                    <span className="text-sm font-bold text-success">{cardDetails.attendance.present}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block font-medium">Late Days</span>
                    <span className="text-sm font-bold text-warning">{cardDetails.attendance.late}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block font-medium">Absent Days</span>
                    <span className="text-sm font-bold text-destructive">{cardDetails.attendance.absent}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block font-medium">Excused Days</span>
                    <span className="text-sm font-bold text-brand">{cardDetails.attendance.excused}</span>
                  </div>
                </div>

                {/* Grades Table */}
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/70 text-muted-foreground font-semibold">
                      <tr>
                        <th className="px-3 py-2 text-left">Subject</th>
                        <th className="px-3 py-2 text-center">CA (40)</th>
                        <th className="px-3 py-2 text-center">Exam (60)</th>
                        <th className="px-3 py-2 text-center">Total (100)</th>
                        <th className="px-3 py-2 text-center">Grade</th>
                        <th className="px-3 py-2 text-left">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {cardDetails.subjects.map((sub: any) => {
                        const isPassed = sub.totalScore >= sub.passMark;
                        return (
                          <tr key={sub.subjectId} className="hover:bg-muted/10">
                            <td className="px-3 py-2.5 font-medium">
                              {sub.subjectName}
                              <span className="text-[10px] text-muted-foreground block">{sub.teacherName}</span>
                            </td>
                            <td className="px-3 py-2.5 text-center">{sub.classScore}</td>
                            <td className="px-3 py-2.5 text-center">{sub.examScore}</td>
                            <td className="px-3 py-2.5 text-center font-semibold">{sub.totalScore}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${isPassed ? "bg-success/15 text-[oklch(0.35_0.1_155)]" : "bg-destructive/15 text-destructive"}`}>
                                {sub.grade}
                              </span>
                            </td>
                            <td className={`px-3 py-2.5 ${isPassed ? "text-muted-foreground" : "text-destructive font-medium"}`}>{sub.remarks}</td>
                          </tr>
                        );
                      })}
                      {cardDetails.subjects.length === 0 && (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No gradebook entries recorded for this term.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span>Total Subjects: {cardDetails.reportSummary.subjectsCount}</span>
                  <span className="font-semibold text-foreground">Term Average: {cardDetails.reportSummary.averageScore}%</span>
                </div>

                {/* Remarks entries fields */}
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Class Teacher Remarks</label>
                    <textarea
                      value={teacherRemarks}
                      onChange={e => setTeacherRemarks(e.target.value)}
                      placeholder="Enter character assessment and recommendations..."
                      rows={2}
                      className="w-full rounded-md border border-input bg-card p-2 text-xs outline-none focus:border-ring"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Principal Remark & Signature</label>
                    <textarea
                      value={principalRemark}
                      onChange={e => setPrincipalRemark(e.target.value)}
                      placeholder="Add headmaster feedback..."
                      rows={2}
                      className="w-full rounded-md border border-input bg-card p-2 text-xs outline-none focus:border-ring"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1.5">
                    <input
                      type="checkbox"
                      id="publishedReport"
                      checked={published}
                      onChange={e => setPublished(e.target.checked)}
                      className="rounded border-input text-brand focus:ring-brand h-4 w-4"
                    />
                    <label htmlFor="publishedReport" className="text-xs font-semibold text-foreground select-none cursor-pointer">
                      Approve & Publish to Parent Portal
                    </label>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setSelectedStudentId(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveRemarksMutation.isPending}>
                  <Save className="mr-1.5 h-4 w-4" /> Save Report Card
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
