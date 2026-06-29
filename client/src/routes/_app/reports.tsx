import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileCheck2, FileText, Printer, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { academicApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({ meta: [{ title: "Report cards — Lumen Suite" }] }),
  component: ReportsPage,
});

function useBlobAction(action: () => Promise<Blob>, filename?: string) {
  return useMutation({
    mutationFn: action,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      if (filename) {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
      } else window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Unable to open report"),
  });
}

function ReportsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canView = hasPermission(user, "reports.view");
  const canPublish = hasPermission(user, "reports.publish");
  const canReissue = hasPermission(user, "reports.reissue");
  const [sectionId, setSectionId] = useState("");
  const [termId, setTermId] = useState("");
  const [enrolmentId, setEnrolmentId] = useState("");
  const [teacherRemarks, setTeacherRemarks] = useState("");
  const [headteacherRemark, setHeadteacherRemark] = useState("");
  const [conduct, setConduct] = useState("");
  const [attitude, setAttitude] = useState("");

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
  const reportsQuery = useQuery({
    queryKey: ["reports", sectionId, termId],
    queryFn: () => academicApi.getClassReports(sectionId, termId),
    enabled: !!sectionId && !!termId,
  });
  const reports = useMemo(() => reportsQuery.data?.reports ?? [], [reportsQuery.data?.reports]);
  const cardQuery = useQuery({
    queryKey: ["report-card", enrolmentId, termId],
    queryFn: () => academicApi.getStudentReport(enrolmentId, termId),
    enabled: !!enrolmentId && !!termId,
  });
  const card = cardQuery.data;
  useEffect(() => {
    if (!card) return;
    setTeacherRemarks(String(card.reportSummary.teacherRemarks ?? ""));
    setHeadteacherRemark(String(card.reportSummary.headteacherRemark ?? ""));
    setConduct(String(card.reportSummary.conduct ?? ""));
    setAttitude(String(card.reportSummary.attitude ?? ""));
  }, [card]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["reports", sectionId, termId] });
    queryClient.invalidateQueries({ queryKey: ["report-card", enrolmentId, termId] });
  };
  const saveMutation = useMutation({
    mutationFn: () =>
      academicApi.saveRemarks({
        enrolmentId,
        termId,
        teacherRemarks,
        headteacherRemark,
        conduct,
        attitude,
      }),
    onSuccess: () => {
      toast.success("Report remarks saved");
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Unable to save report"),
  });
  const publishMutation = useMutation({
    mutationFn: async () => {
      await academicApi.saveRemarks({
        enrolmentId,
        termId,
        teacherRemarks,
        headteacherRemark,
        conduct,
        attitude,
      });
      return academicApi.publishReport(enrolmentId, termId);
    },
    onSuccess: (result) => {
      toast.success(`Report version ${result.version.version} published`);
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Unable to publish report"),
  });
  const correctionMutation = useMutation({
    mutationFn: () =>
      academicApi.beginReportCorrection(
        enrolmentId,
        termId,
        "Correction requested from report card workspace",
      ),
    onSuccess: () => {
      toast.success("Correction draft opened; previous PDF remains unchanged");
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Unable to open correction"),
  });
  const preview = useBlobAction(() => academicApi.previewReport(enrolmentId, termId));
  const reportStatus = String(card?.reportSummary.status ?? "DRAFT");

  if (!canView) return <Forbidden />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report cards"
        description="Review, publish, correct and download immutable terminal report versions."
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
            onChange={(event) => {
              setTermId(event.target.value);
              setEnrolmentId("");
            }}
          >
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.name} — {term.status}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex gap-2">
          <Badge variant="outline">
            Draft: {reports.filter((report) => !report.published).length}
          </Badge>
          <Badge className="bg-success/15 text-[oklch(0.35_0.1_155)]">
            Published: {reports.filter((report) => report.published).length}
          </Badge>
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b p-4">
            <h3 className="font-semibold">Class reports</h3>
            <p className="text-xs text-muted-foreground">
              Select a student to compile or inspect versions.
            </p>
          </div>
          <div className="max-h-[700px] divide-y overflow-y-auto">
            {reports.map((report) => (
              <button
                key={report.enrolmentId}
                onClick={() => setEnrolmentId(report.enrolmentId)}
                className={`flex w-full items-center gap-3 p-4 text-left hover:bg-muted/35 ${enrolmentId === report.enrolmentId ? "bg-brand/5" : ""}`}
              >
                <span
                  className="grid h-9 w-9 place-items-center rounded-full text-xs text-white"
                  style={{ backgroundColor: report.photoColor }}
                >
                  {report.firstName[0]}
                  {report.lastName[0]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {report.firstName} {report.lastName}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {report.admissionNo} · Average {report.averageScore}%
                  </span>
                </span>
                <Badge
                  variant="outline"
                  className={
                    report.published
                      ? "border-success/30 bg-success/10 text-[oklch(0.35_0.1_155)]"
                      : ""
                  }
                >
                  {report.published ? `Published v${report.currentVersion}` : "Draft"}
                </Badge>
              </button>
            ))}
            {!reports.length && (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No enrolled students found.
              </div>
            )}
          </div>
        </section>
        <section className="min-h-[600px] rounded-xl border bg-card p-5">
          {!enrolmentId ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8" />
              Select a report.
            </div>
          ) : cardQuery.isLoading ? (
            <div className="grid h-60 place-items-center text-sm text-muted-foreground">
              Loading report…
            </div>
          ) : card ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">
                    {card.student.firstName} {card.student.lastName}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {card.student.admissionNo} · {card.student.className}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    className={
                      reportStatus === "PUBLISHED"
                        ? "bg-success/15 text-[oklch(0.35_0.1_155)]"
                        : "bg-brand/10 text-brand"
                    }
                  >
                    {reportStatus}
                  </Badge>
                  <Button variant="outline" onClick={() => preview.mutate()}>
                    <Printer className="mr-1.5 h-4 w-4" />
                    Draft preview
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="bg-muted/50 text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left">Subject</th>
                      {card.components.map((component) => (
                        <th key={component.id} className="px-2 py-2 text-center">
                          {component.name}
                          <span className="block font-normal">/{component.maxScore}</span>
                        </th>
                      ))}
                      <th className="px-2 py-2 text-center">Total</th>
                      <th className="px-2 py-2 text-center">Grade</th>
                      <th className="px-2 py-2 text-center">Pos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {card.subjects.map((subject) => (
                      <tr key={subject.curriculumSubjectId}>
                        <td className="px-3 py-2 font-medium">{subject.subjectName}</td>
                        {card.components.map((component) => (
                          <td key={component.id} className="px-2 py-2 text-center">
                            {subject.scores.find((score) => score.componentId === component.id)
                              ?.score ?? "-"}
                          </td>
                        ))}
                        <td className="px-2 py-2 text-center font-semibold">
                          {subject.totalScore ?? "-"}
                        </td>
                        <td className="px-2 py-2 text-center">{subject.grade}</td>
                        <td className="px-2 py-2 text-center">{subject.position ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/30 p-4 md:grid-cols-4">
                <Summary
                  label="Average"
                  value={`${Number(card.reportSummary.averageScore ?? 0).toFixed(1)}%`}
                />
                <Summary label="Position" value={String(card.reportSummary.position ?? "-")} />
                <Summary
                  label="Present"
                  value={`${card.attendance.present ?? 0}/${card.attendance.total ?? 0}`}
                />
                <Summary label="Subjects" value={String(card.reportSummary.subjectsCount ?? 0)} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs font-medium">
                  Conduct
                  <input
                    className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={conduct}
                    disabled={reportStatus === "PUBLISHED"}
                    onChange={(event) => setConduct(event.target.value)}
                  />
                </label>
                <label className="text-xs font-medium">
                  Attitude
                  <input
                    className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={attitude}
                    disabled={reportStatus === "PUBLISHED"}
                    onChange={(event) => setAttitude(event.target.value)}
                  />
                </label>
                <label className="text-xs font-medium md:col-span-2">
                  Class teacher remark
                  <textarea
                    className="mt-1 w-full rounded-md border bg-background p-3 text-sm"
                    rows={3}
                    value={teacherRemarks}
                    disabled={reportStatus === "PUBLISHED"}
                    onChange={(event) => setTeacherRemarks(event.target.value)}
                  />
                </label>
                <label className="text-xs font-medium md:col-span-2">
                  Headteacher remark (optional)
                  <textarea
                    className="mt-1 w-full rounded-md border bg-background p-3 text-sm"
                    rows={2}
                    value={headteacherRemark}
                    disabled={reportStatus === "PUBLISHED"}
                    onChange={(event) => setHeadteacherRemark(event.target.value)}
                  />
                </label>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {reportStatus === "PUBLISHED" ? (
                  canReissue && (
                    <Button variant="outline" onClick={() => correctionMutation.mutate()}>
                      <RotateCcw className="mr-1.5 h-4 w-4" />
                      Begin correction
                    </Button>
                  )
                ) : (
                  <>
                    <Button variant="outline" onClick={() => saveMutation.mutate()}>
                      <Save className="mr-1.5 h-4 w-4" />
                      Save draft
                    </Button>
                    {canPublish && (
                      <Button onClick={() => publishMutation.mutate()}>
                        <FileCheck2 className="mr-1.5 h-4 w-4" />
                        Publish immutable version
                      </Button>
                    )}
                  </>
                )}
              </div>
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold">Published versions</h3>
                <div className="mt-2 space-y-2">
                  {card.versions.map((version) => (
                    <VersionRow key={version.id} version={version} />
                  ))}
                  {!card.versions.length && (
                    <p className="text-xs text-muted-foreground">No published versions yet.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid h-60 place-items-center text-sm text-destructive">
              Unable to load report.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

function VersionRow({
  version,
}: {
  version: { id: string; version: number; publishedAt: string; checksum: string };
}) {
  const download = useBlobAction(
    () => academicApi.downloadReportVersion(version.id),
    `report-card-v${version.version}.pdf`,
  );
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div>
        <div className="text-sm font-medium">Version {version.version}</div>
        <div className="text-xs text-muted-foreground">
          {new Date(version.publishedAt).toLocaleString()} · {version.checksum.slice(0, 12)}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={() => download.mutate()}>
        <Download className="mr-1.5 h-4 w-4" />
        PDF
      </Button>
    </div>
  );
}
