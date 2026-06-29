import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenCheck,
  CalendarDays,
  ClipboardCheck,
  Download,
  Eye,
  FileText,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  TrendingUp,
  Trophy,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  academicApi,
  financeApi,
  studentsApi,
  type ApiStudentHistory,
  type ApiStudentLedger,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/students/$studentId")({
  loader: async ({ params }) => {
    try {
      return (await studentsApi.get(params.studentId)).student;
    } catch {
      throw notFound();
    }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.firstName ?? "Student"} — Lumen Suite` }],
  }),
  notFoundComponent: () => (
    <div className="p-8 text-center text-sm text-muted-foreground">Student not found.</div>
  ),
  component: StudentProfile,
});

type EnrolmentHistory = ApiStudentHistory["enrolments"][number];
type TermHistory = EnrolmentHistory["terms"][number];

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDate(date: string | null | undefined) {
  if (!date) return "—";
  return dateFormatter.format(new Date(date));
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${value.toFixed(1)}%`;
}

function formatScore(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : value.toFixed(1).replace(/\.0$/, "");
}

function humanize(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function downloadBlob(blob: Blob, filename: string, openInNewTab = false) {
  const url = URL.createObjectURL(blob);
  if (openInNewTab) {
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function StudentProfile() {
  const initial = Route.useLoaderData();
  const { user } = useAuth();
  const canView = hasPermission(user, "students.view");
  const studentQuery = useQuery({
    queryKey: ["student", initial.id],
    queryFn: () => studentsApi.get(initial.id).then((result) => result.student),
    initialData: initial,
  });
  const historyQuery = useQuery({
    queryKey: ["student-history", initial.id],
    queryFn: () => studentsApi.getHistory(initial.id).then((result) => result.history),
  });
  const student = studentQuery.data;
  const dossier = historyQuery.data;
  const canViewFinance = hasPermission(user, "fees.view");
  const ledgerQuery = useQuery({
    queryKey: ["student-ledger", initial.id],
    queryFn: () => financeApi.getLedger(initial.id).then((result) => result.ledger),
    enabled: canViewFinance,
  });
  const enrolments = dossier?.enrolments ?? [];
  const allTerms = enrolments.flatMap((enrolment) =>
    enrolment.terms.map((term) => ({ enrolment, term })),
  );

  const previewReport = async (enrolmentId: string, termId: string) => {
    try {
      const blob = await academicApi.previewReport(enrolmentId, termId);
      downloadBlob(blob, `${student.admissionNo.replaceAll("/", "-")}-preview.pdf`, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to preview report");
    }
  };

  const downloadReport = async (versionId: string, version: number) => {
    try {
      const blob = await academicApi.downloadReportVersion(versionId);
      downloadBlob(blob, `${student.admissionNo.replaceAll("/", "-")}-report-v${version}.pdf`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to download report");
    }
  };

  if (!canView) return <Forbidden />;

  const profile = dossier?.student;
  const attendance = dossier?.summary.attendance;
  const displayPlacement = profile?.currentClass ?? profile?.lastClass ?? null;
  const placementLabel = profile?.currentClass
    ? "Current academic placement"
    : "Last academic placement";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${student.firstName} ${student.lastName}`}
        description={`${student.admissionNo} · ${displayPlacement?.section ?? student.className}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/students">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Students
            </Link>
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
        <aside className="space-y-4">
          <section className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-4">
              <span
                className="grid h-16 w-16 place-items-center rounded-full text-xl font-semibold text-white"
                style={{ backgroundColor: student.photoColor }}
              >
                {student.firstName[0]}
                {student.lastName[0]}
              </span>
              <div>
                <h2 className="font-bold">
                  {student.firstName} {student.lastName}
                </h2>
                <p className="text-sm text-muted-foreground">{student.admissionNo}</p>
                <Badge variant="outline" className="mt-1">
                  {humanize(profile?.status ?? student.status)}
                </Badge>
              </div>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <Info
                icon={GraduationCap}
                label={
                  displayPlacement
                    ? `${displayPlacement.gradeLevel} · ${displayPlacement.section}`
                    : `${student.gradeLevelName} · ${student.className}`
                }
                sublabel={
                  displayPlacement
                    ? `${displayPlacement.academicYear} · ${placementLabel}`
                    : placementLabel
                }
              />
              <Info
                icon={UserRound}
                label={`${student.gender} · Born ${formatDate(student.dob)}`}
              />
              <Info
                icon={Users}
                label={`${student.guardianName} (${student.guardianRelation})`}
                sublabel="Guardian"
              />
              <Info icon={Phone} label={student.guardianPhone} />
              <Info icon={Mail} label={student.guardianEmail || "No guardian email"} />
              <Info icon={MapPin} label={student.address} />
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">At a glance</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat
                icon={CalendarDays}
                label="Years"
                value={dossier?.summary.enrolmentCount ?? enrolments.length}
              />
              <MiniStat icon={FileText} label="PDFs" value={dossier?.summary.reportCount ?? 0} />
              <MiniStat
                icon={BookOpenCheck}
                label="Results"
                value={dossier?.summary.assessmentResultCount ?? 0}
              />
              <MiniStat
                icon={ClipboardCheck}
                label="Attendance"
                value={attendance?.total ?? 0}
                detail={formatPercent(attendance?.attendanceRate)}
              />
            </div>
          </section>
        </aside>

        <main className="space-y-4">
          {historyQuery.isLoading ? (
            <div className="grid h-72 place-items-center rounded-xl border bg-card text-sm text-muted-foreground">
              Loading complete student profile…
            </div>
          ) : (
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="flex h-auto flex-wrap justify-start">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="reports">Reports</TabsTrigger>
                <TabsTrigger value="attendance">Attendance</TabsTrigger>
                <TabsTrigger value="assessments">Assessments</TabsTrigger>
                <TabsTrigger value="progression">Progression</TabsTrigger>
                {canViewFinance && <TabsTrigger value="financials">Financials</TabsTrigger>}
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <SectionIntro
                  icon={UserRound}
                  title="Student dossier"
                  description="A year-by-year view of class placement, terms, attendance, assessments, reports and progression."
                />
                {enrolments.map((enrolment) => (
                  <YearCard key={enrolment.id} enrolment={enrolment}>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {enrolment.terms.map((term) => (
                        <TermSnapshot
                          key={term.id}
                          term={term}
                          onPreview={() => previewReport(enrolment.id, term.id)}
                          onDownload={downloadReport}
                        />
                      ))}
                    </div>
                  </YearCard>
                ))}
                {!enrolments.length && <EmptyState message="No enrolment history found." />}
              </TabsContent>

              <TabsContent value="reports" className="space-y-4">
                <SectionIntro
                  icon={FileText}
                  title="Academic reports and PDFs"
                  description="Every term report, publication status, teacher remarks and immutable PDF version is shown here."
                />
                {allTerms.map(({ enrolment, term }) => (
                  <ReportPanel
                    key={`${enrolment.id}-${term.id}`}
                    enrolment={enrolment}
                    term={term}
                    onPreview={() => previewReport(enrolment.id, term.id)}
                    onDownload={downloadReport}
                  />
                ))}
                {!allTerms.length && <EmptyState message="No report history found." />}
              </TabsContent>

              <TabsContent value="attendance" className="space-y-4">
                <SectionIntro
                  icon={ClipboardCheck}
                  title="Attendance by year and term"
                  description="Attendance is tied to the exact enrolment, class section and term, so old records stay attached to the correct class."
                />
                {allTerms.map(({ enrolment, term }) => (
                  <AttendancePanel
                    key={`${enrolment.id}-${term.id}`}
                    enrolment={enrolment}
                    term={term}
                  />
                ))}
                {!allTerms.length && <EmptyState message="No attendance history found." />}
              </TabsContent>

              <TabsContent value="assessments" className="space-y-4">
                <SectionIntro
                  icon={BookOpenCheck}
                  title="Assessment results"
                  description="Subject scores are grouped by academic year, class and term, with component scores preserved from the yearly assessment scheme."
                />
                {allTerms.map(({ enrolment, term }) => (
                  <AssessmentPanel
                    key={`${enrolment.id}-${term.id}`}
                    enrolment={enrolment}
                    term={term}
                  />
                ))}
                {!allTerms.length && <EmptyState message="No assessment history found." />}
              </TabsContent>

              <TabsContent value="progression" className="space-y-4">
                <SectionIntro
                  icon={TrendingUp}
                  title="Promotion and movement history"
                  description="Shows how the student arrived in each class and what outcome was approved at the end of each academic year."
                />
                {enrolments.map((enrolment) => (
                  <ProgressionPanel key={enrolment.id} enrolment={enrolment} />
                ))}
                {!enrolments.length && <EmptyState message="No progression history found." />}
              </TabsContent>
              {canViewFinance && (
                <TabsContent value="financials" className="space-y-4">
                  <SectionIntro
                    icon={Wallet}
                    title="Complete financial history"
                    description="Every charge, adjustment, payment, credit and receipt remains attached to the student across academic years."
                  />
                  {ledgerQuery.data ? (
                    <FinancialPanel
                      ledger={ledgerQuery.data}
                      canAdjust={hasPermission(user, "fees.adjust")}
                      onStatement={() =>
                        financeApi
                          .downloadStatement(initial.id)
                          .then((blob) =>
                            downloadBlob(
                              blob,
                              `${student.admissionNo.replaceAll("/", "-")}-fee-statement.pdf`,
                            ),
                          )
                          .catch((error: Error) => toast.error(error.message))
                      }
                    />
                  ) : (
                    <EmptyState
                      message={
                        ledgerQuery.isLoading
                          ? "Loading financial history…"
                          : "No financial history found."
                      }
                    />
                  )}
                </TabsContent>
              )}
            </Tabs>
          )}
        </main>
      </div>
    </div>
  );
}

const currency = (value: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(value);
function FinancialPanel({
  ledger,
  onStatement,
  canAdjust,
}: {
  ledger: ApiStudentLedger;
  onStatement: () => void;
  canAdjust: boolean;
}) {
  const queryClient = useQueryClient();
  const requestAdjustment = async (charge: ApiStudentLedger["charges"][number]) => {
    const amount = Number(window.prompt(`Adjustment amount for ${charge.label}`));
    if (!amount) return;
    const reason = window.prompt("Reason for the adjustment?");
    if (!reason?.trim()) return;
    try {
      await financeApi.requestAdjustment({
        chargeId: charge.id,
        type: "CHARGE_CREDIT",
        amount,
        reason,
      });
      await queryClient.invalidateQueries({ queryKey: ["student-ledger", ledger.student.id] });
      toast.success("Adjustment sent for approval");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to request adjustment");
    }
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <FinanceStat label="Previous arrears" value={ledger.summary.previousArrears} />
        <FinanceStat label="Current term" value={ledger.summary.currentTermBalance} />
        <FinanceStat label="Future charges" value={ledger.summary.futureCharges} />
        <FinanceStat label="Available credit" value={ledger.summary.availableCredit} />
        <FinanceStat label="Net exposure" value={ledger.summary.netExposure} />
      </div>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onStatement}>
          <Download className="mr-1 h-4 w-4" />
          Download statement
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fee</TableHead>
              <TableHead>Academic context</TableHead>
              <TableHead>Charged</TableHead>
              <TableHead>Paid/credit</TableHead>
              <TableHead>Balance</TableHead>
              {canAdjust && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledger.charges.map((charge) => (
              <TableRow key={charge.id}>
                <TableCell className="font-medium">{charge.label}</TableCell>
                <TableCell>
                  {charge.academicYearName} · {charge.termName}
                  <span className="block text-xs text-muted-foreground">{charge.sectionName}</span>
                </TableCell>
                <TableCell>{currency(charge.net)}</TableCell>
                <TableCell>{currency(charge.paid + charge.creditApplied)}</TableCell>
                <TableCell
                  className={charge.balance ? "font-semibold text-destructive" : "text-success"}
                >
                  {currency(charge.balance)}
                </TableCell>
                {canAdjust && (
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!charge.balance}
                      onClick={() => requestAdjustment(charge)}
                    >
                      Adjust
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <h3 className="font-semibold">Payments & receipts</h3>
        <div className="mt-3 space-y-2">
          {ledger.payments.map((payment) => (
            <div
              key={payment.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
            >
              <div>
                {new Date(payment.postedAt).toLocaleDateString()} ·{" "}
                {payment.method.replaceAll("_", " ")}
                <span className="block text-xs text-muted-foreground">
                  {payment.receipt?.number ?? "Receipt pending"}
                </span>
              </div>
              <div className="text-right font-semibold">
                {currency(payment.amount)}
                <Badge variant="outline" className="ml-2">
                  {payment.status}
                </Badge>
              </div>
            </div>
          ))}
          {!ledger.payments.length && (
            <p className="text-sm text-muted-foreground">No payments recorded.</p>
          )}
        </div>
      </div>
    </div>
  );
}
function FinanceStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{currency(value)}</div>
    </div>
  );
}

function YearCard({
  enrolment,
  children,
}: {
  enrolment: EnrolmentHistory;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{enrolment.academicYear.name}</h3>
            <Badge variant="outline">{humanize(enrolment.academicYear.status)}</Badge>
            <Badge variant="secondary">{humanize(enrolment.status)}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {enrolment.classSection.gradeLevel.name} · {enrolment.classSection.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDate(enrolment.academicYear.startDate)} —{" "}
            {formatDate(enrolment.academicYear.endDate)}
          </p>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <p>{enrolment.academicYear.termCount} terms</p>
          <p>{enrolment.classSection.classTeacher?.name ?? "No class teacher"}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function TermSnapshot({
  term,
  onPreview,
  onDownload,
}: {
  term: TermHistory;
  onPreview: () => void;
  onDownload: (versionId: string, version: number) => void;
}) {
  const latestVersion = term.report?.versions[0];
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{term.name}</h4>
        <Badge variant="outline">{humanize(term.status)}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Metric label="Average" value={formatPercent(term.assessment.averageScore)} />
        <Metric label="Position" value={term.report?.position ?? "—"} />
        <Metric label="Subjects" value={term.assessment.subjectCount} />
        <Metric label="Attendance" value={term.attendance.summary.total} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onPreview} disabled={!term.report}>
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          Preview
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => latestVersion && onDownload(latestVersion.id, latestVersion.version)}
          disabled={!latestVersion}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Latest PDF
        </Button>
      </div>
    </div>
  );
}

function ReportPanel({
  enrolment,
  term,
  onPreview,
  onDownload,
}: {
  enrolment: EnrolmentHistory;
  term: TermHistory;
  onPreview: () => void;
  onDownload: (versionId: string, version: number) => void;
}) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {enrolment.academicYear.name} · {term.name}
          </h3>
          <p className="text-sm text-muted-foreground">
            {enrolment.classSection.gradeLevel.name} · {enrolment.classSection.name}
          </p>
        </div>
        <Badge variant={term.report?.status === "PUBLISHED" ? "default" : "outline"}>
          {term.report ? humanize(term.report.status) : "No report"}
        </Badge>
      </div>
      {term.report ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <MetricCard label="Total score" value={formatScore(term.report.totalScore)} />
            <MetricCard label="Average" value={formatPercent(term.report.averageScore)} />
            <MetricCard label="Position" value={term.report.position ?? "—"} />
            <MetricCard label="Versions" value={term.report.versions.length} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <RemarkBlock label="Conduct" value={term.report.conduct} />
            <RemarkBlock label="Attitude" value={term.report.attitude} />
            <RemarkBlock label="Teacher remark" value={term.report.teacherRemarks} />
            <RemarkBlock label="Headteacher remark" value={term.report.headteacherRemark} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onPreview}>
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              Preview report
            </Button>
            {term.report.versions.map((version) => (
              <Button
                key={version.id}
                variant="ghost"
                size="sm"
                onClick={() => onDownload(version.id, version.version)}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                PDF v{version.version} · {formatDate(version.publishedAt)}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No term report has been started for this term yet.
        </p>
      )}
    </section>
  );
}

function AttendancePanel({ enrolment, term }: { enrolment: EnrolmentHistory; term: TermHistory }) {
  const summary = term.attendance.summary;
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {enrolment.academicYear.name} · {term.name}
          </h3>
          <p className="text-sm text-muted-foreground">
            {enrolment.classSection.gradeLevel.name} · {enrolment.classSection.name}
          </p>
        </div>
        <Badge variant="outline">{formatPercent(summary.attendanceRate)} attendance</Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <MetricCard label="Present" value={summary.PRESENT} />
        <MetricCard label="Late" value={summary.LATE} />
        <MetricCard label="Absent" value={summary.ABSENT} />
        <MetricCard label="Excused" value={summary.EXCUSED} />
        <MetricCard label="Total marked" value={summary.total} />
      </div>
      {term.attendance.records.length ? (
        <div className="mt-4 max-h-72 overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {term.attendance.records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>{formatDate(record.date)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{humanize(record.status)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No attendance has been recorded for this term.
        </p>
      )}
    </section>
  );
}

function AssessmentPanel({ enrolment, term }: { enrolment: EnrolmentHistory; term: TermHistory }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {enrolment.academicYear.name} · {term.name}
          </h3>
          <p className="text-sm text-muted-foreground">
            {enrolment.classSection.gradeLevel.name} · {enrolment.classSection.name}
          </p>
        </div>
        <Badge variant="outline">{formatPercent(term.assessment.averageScore)} average</Badge>
      </div>
      {term.assessment.subjects.length ? (
        <div className="mt-4 rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                {enrolment.assessmentComponents.map((component) => (
                  <TableHead key={component.id} className="text-right">
                    {component.name}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead className="text-right">Position</TableHead>
                <TableHead>Remark</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {term.assessment.subjects.map((subject) => (
                <TableRow key={subject.id}>
                  <TableCell>
                    <div className="font-medium">{subject.subjectName}</div>
                    <div className="text-xs text-muted-foreground">{subject.subjectCode}</div>
                  </TableCell>
                  {enrolment.assessmentComponents.map((component) => {
                    const score = subject.scores.find((item) => item.componentId === component.id);
                    return (
                      <TableCell key={component.id} className="text-right">
                        {formatScore(score?.score)}
                        <span className="text-xs text-muted-foreground">
                          /{formatScore(score?.maxScore ?? component.maxScore)}
                        </span>
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right font-medium">
                    {formatScore(subject.totalScore)}
                  </TableCell>
                  <TableCell>{subject.grade ?? "—"}</TableCell>
                  <TableCell className="text-right">{subject.position ?? "—"}</TableCell>
                  <TableCell className="min-w-44 text-muted-foreground">
                    {subject.remarks || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No scores have been entered for this term.
        </p>
      )}
    </section>
  );
}

function ProgressionPanel({ enrolment }: { enrolment: EnrolmentHistory }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{enrolment.academicYear.name}</h3>
          <p className="text-sm text-muted-foreground">
            {enrolment.classSection.gradeLevel.name} · {enrolment.classSection.name}
          </p>
        </div>
        <Badge variant="outline">{humanize(enrolment.status)}</Badge>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ArrowLeft className="h-4 w-4" />
            Arrived from
          </div>
          {enrolment.arrivedFrom ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {humanize(enrolment.arrivedFrom.decision)} from {enrolment.arrivedFrom.gradeLevel} ·{" "}
              {enrolment.arrivedFrom.section} ({enrolment.arrivedFrom.academicYear})
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Initial enrolment or no previous promotion record.
            </p>
          )}
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4" />
            Year-end outcome
          </div>
          {enrolment.promotion ? (
            <div className="mt-2 space-y-2 text-sm text-muted-foreground">
              <p>
                {humanize(enrolment.promotion.decision)} · {humanize(enrolment.promotion.status)}
              </p>
              {enrolment.promotion.nextEnrolment && (
                <p>
                  Next: {enrolment.promotion.nextEnrolment.gradeLevel} ·{" "}
                  {enrolment.promotion.nextEnrolment.section} (
                  {enrolment.promotion.nextEnrolment.academicYear})
                </p>
              )}
              {enrolment.promotion.remarks && <p>Remarks: {enrolment.promotion.remarks}</p>}
              <p>
                Approved by {enrolment.promotion.approvedBy ?? "—"} on{" "}
                {formatDate(enrolment.promotion.approvedAt)}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No approved year-end outcome recorded yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function SectionIntro({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </section>
  );
}

function Info({
  icon: Icon,
  label,
  sublabel,
}: {
  icon: LucideIcon;
  label: string;
  sublabel?: string | null;
}) {
  return (
    <div className="flex items-start gap-2 text-muted-foreground">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <span className="block text-foreground">{label}</span>
        {sublabel && <span className="text-xs">{sublabel}</span>}
      </span>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <p className="mt-2 text-xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">
        {label}
        {detail ? ` · ${detail}` : ""}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function RemarkBlock({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg bg-muted/35 p-3 text-sm">
      <p className="font-medium">{label}</p>
      <p className="mt-1 text-muted-foreground">{value || "—"}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="grid h-48 place-items-center rounded-xl border bg-card text-sm text-muted-foreground">
      {message}
    </div>
  );
}
