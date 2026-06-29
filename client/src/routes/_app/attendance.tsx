import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { academicApi, type ApiAttendanceMark } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/attendance")({
  head: () => ({ meta: [{ title: "Attendance — Lumen Suite" }] }),
  component: AttendancePage,
});

const statuses = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;
const statusTone: Record<(typeof statuses)[number], string> = {
  PRESENT: "bg-success/15 text-[oklch(0.35_0.1_155)] border-success/30",
  ABSENT: "bg-destructive/10 text-destructive border-destructive/25",
  LATE: "bg-warning/15 text-[oklch(0.4_0.12_70)] border-warning/30",
  EXCUSED: "bg-brand/10 text-brand border-brand/25",
};

function isoDate(value: string) {
  return value.slice(0, 10);
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate(value)}T00:00:00.000Z`));
}

function AttendancePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canView = hasPermission(user, "attendance.view");
  const canMark = hasPermission(user, "attendance.mark");
  const [sectionId, setSectionId] = useState("");
  const [termId, setTermId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [marks, setMarks] = useState<Record<string, ApiAttendanceMark["status"]>>({});
  const yearsQuery = useQuery({ queryKey: ["academic-years"], queryFn: academicApi.getYears });
  const years = useMemo(() => yearsQuery.data?.years ?? [], [yearsQuery.data?.years]);
  const activeYear = useMemo(() => years.find((year) => year.status === "ACTIVE"), [years]);
  const terms = useMemo(() => activeYear?.terms ?? [], [activeYear]);
  useEffect(() => {
    if (!terms.length) return;
    const nextTerm =
      terms.find((term) => term.id === termId) ??
      terms.find((term) => term.status === "ACTIVE") ??
      terms[0];
    if (nextTerm.id !== termId) setTermId(nextTerm.id);
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
  const selectedTerm = terms.find((term) => term.id === termId);
  const dateIsInsideTerm = selectedTerm
    ? date >= isoDate(selectedTerm.startDate) && date <= isoDate(selectedTerm.endDate)
    : false;
  const attendanceBlockReason = !selectedTerm
    ? "Select a term before taking attendance."
    : !dateIsInsideTerm
      ? `${displayDate(date)} is outside ${selectedTerm.name}. This term runs from ${displayDate(selectedTerm.startDate)} to ${displayDate(selectedTerm.endDate)}. Choose a date inside that range, or ask an administrator to correct the active term dates.`
      : selectedTerm.status !== "ACTIVE"
        ? `${selectedTerm.name} is ${selectedTerm.status.toLowerCase()}. Attendance can be marked only for the active term.`
        : null;
  const attendanceQuery = useQuery({
    queryKey: ["attendance", sectionId, termId, date],
    queryFn: () => academicApi.getAttendance(sectionId, date, termId),
    enabled: !!sectionId && !!termId && !!date && dateIsInsideTerm,
    retry: false,
  });
  const attendance = useMemo(
    () => attendanceQuery.data?.attendance ?? [],
    [attendanceQuery.data?.attendance],
  );
  useEffect(() => {
    setMarks(
      Object.fromEntries(attendance.map((student) => [student.enrolmentId, student.status])),
    );
  }, [attendance]);
  const mutation = useMutation({
    mutationFn: () =>
      academicApi.saveAttendance({
        sectionId,
        termId,
        date,
        marks: attendance.map((student) => ({
          enrolmentId: student.enrolmentId,
          status: marks[student.enrolmentId] ?? "PRESENT",
        })),
      }),
    onSuccess: () => {
      toast.success("Attendance saved");
      queryClient.invalidateQueries({ queryKey: ["attendance", sectionId, termId, date] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Unable to save attendance"),
  });
  const summary = useMemo(
    () =>
      Object.fromEntries(
        statuses.map((status) => [
          status,
          Object.values(marks).filter((value) => value === status).length,
        ]),
      ),
    [marks],
  );
  if (!canView) return <Forbidden />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Daily attendance is tied to each student's yearly enrolment and selected term."
      />
      <section className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div>
          <label className="text-xs text-muted-foreground">Class stream</label>
          <select
            className="mt-1 h-9 min-w-48 rounded-md border bg-background px-2"
            value={sectionId}
            onChange={(event) => setSectionId(event.target.value)}
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
            className="mt-1 h-9 min-w-40 rounded-md border bg-background px-2"
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
        <div>
          <label className="text-xs text-muted-foreground">Date</label>
          <input
            className="mt-1 block h-9 rounded-md border bg-background px-3 text-sm"
            type="date"
            value={date}
            min={selectedTerm ? isoDate(selectedTerm.startDate) : undefined}
            max={selectedTerm ? isoDate(selectedTerm.endDate) : undefined}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {statuses.map((status) => (
            <Badge key={status} variant="outline" className={statusTone[status]}>
              {status}: {summary[status] ?? 0}
            </Badge>
          ))}
        </div>
        {attendanceBlockReason && (
          <div className="basis-full rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
            <span className="font-medium">Attendance unavailable: </span>
            {attendanceBlockReason}
          </div>
        )}
      </section>
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h3 className="font-semibold">Daily register</h3>
            <p className="text-xs text-muted-foreground">
              {attendance.length} enrolled students · {selectedTerm?.name ?? "No term"}
            </p>
          </div>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              !canMark ||
              selectedTerm?.status !== "ACTIVE" ||
              !dateIsInsideTerm ||
              mutation.isPending ||
              !attendance.length
            }
          >
            <Save className="mr-1.5 h-4 w-4" />
            Save attendance
          </Button>
        </div>
        {!dateIsInsideTerm ? (
          <div className="grid h-48 place-items-center px-6 text-center text-sm text-muted-foreground">
            Choose a date inside {selectedTerm?.name ?? "the selected term"} to load the daily
            register.
          </div>
        ) : attendanceQuery.isLoading ? (
          <div className="grid h-48 place-items-center text-sm text-muted-foreground">
            Loading register…
          </div>
        ) : attendanceQuery.isError ? (
          <div className="grid h-48 place-items-center px-6 text-center text-sm text-destructive">
            {attendanceQuery.error instanceof Error
              ? attendanceQuery.error.message
              : "Unable to load attendance."}
          </div>
        ) : attendance.length ? (
          <div className="divide-y">
            {attendance.map((student) => (
              <div
                key={student.enrolmentId}
                className="grid items-center gap-3 p-4 md:grid-cols-[1fr_auto]"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-9 w-9 place-items-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: student.photoColor }}
                  >
                    {student.firstName[0]}
                    {student.lastName[0]}
                  </span>
                  <div>
                    <div className="text-sm font-medium">
                      {student.firstName} {student.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground">{student.admissionNo}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {statuses.map((status) => (
                    <button
                      key={status}
                      disabled={!canMark || selectedTerm?.status !== "ACTIVE"}
                      onClick={() =>
                        setMarks((current) => ({ ...current, [student.enrolmentId]: status }))
                      }
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium ${marks[student.enrolmentId] === status ? statusTone[status] : "border-border text-muted-foreground hover:bg-muted"}`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid h-48 place-items-center text-sm text-muted-foreground">
            <CalendarCheck className="h-6 w-6" />
            No students found.
          </div>
        )}
      </section>
    </div>
  );
}
