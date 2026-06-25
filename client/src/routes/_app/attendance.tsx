import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { Calendar as CalendarIcon, ClipboardCheck, Plus, Save } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { academicApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/attendance")({
  head: () => ({ meta: [{ title: "Attendance — Lumen Suite" }] }),
  component: AttendancePage,
});

type Status = "Present" | "Absent" | "Late" | "Excused";
const STATUSES: Status[] = ["Present", "Absent", "Late", "Excused"];

const normalizeStatus = (statusStr: string): Status => {
  if (!statusStr) return "Present";
  const clean = statusStr.toLowerCase();
  if (clean === "present") return "Present";
  if (clean === "absent") return "Absent";
  if (clean === "late") return "Late";
  if (clean === "excused") return "Excused";
  return "Present";
};

const colorOf = (s: Status) =>
  s === "Present" ? "bg-success/15 text-[oklch(0.35_0.1_155)] border-success/30"
  : s === "Late" ? "bg-warning/15 text-[oklch(0.4_0.12_70)] border-warning/30"
  : s === "Excused" ? "bg-brand/10 text-brand border-brand/30"
  : "bg-destructive/15 text-destructive border-destructive/30";

function AttendancePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [newDateModalOpen, setNewDateModalOpen] = useState(false);
  const [newRegisterDate, setNewRegisterDate] = useState(new Date().toISOString().slice(0, 10));
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [isEditing, setIsEditing] = useState(false);

  if (!hasPermission(user, "attendance.view")) return <Forbidden />;
  const canMark = hasPermission(user, "attendance.mark");

  // Queries
  const { data: classesData, isLoading: loadingClasses } = useQuery({
    queryKey: ["classes"],
    queryFn: academicApi.getClasses,
  });

  const classrooms = classesData?.classrooms ?? [];

  // Filter allowed classes for class teachers
  const allowedClasses = useMemo(() => {
    return user?.scopes.includes("class") && user.assignedClassId
      ? classrooms.filter(c => c.id === user.assignedClassId)
      : classrooms;
  }, [classrooms, user?.scopes, user?.assignedClassId]);

  // Set default classId when classrooms load
  useEffect(() => {
    if (allowedClasses.length > 0 && !classId) {
      setClassId(allowedClasses[0].id);
    }
  }, [allowedClasses, classId]);

  // Fetch unique dates where attendance was recorded for this class
  const { data: datesData, isLoading: loadingDates } = useQuery({
    queryKey: ["class-attendance-dates", classId],
    queryFn: () => academicApi.getAttendanceDates(classId),
    enabled: !!classId,
  });

  const historyDates = useMemo(() => {
    return [...(datesData?.dates ?? [])].sort((a, b) => b.localeCompare(a));
  }, [datesData?.dates]);

  // Reset selectedDate and edit mode when classId changes
  useEffect(() => {
    setSelectedDate("");
    setMarks({});
    setIsEditing(false);
  }, [classId]);

  // Set default editing state depending on date existence
  useEffect(() => {
    if (selectedDate) {
      const exists = historyDates.includes(selectedDate);
      setIsEditing(!exists);
    }
  }, [selectedDate, historyDates]);

  // Automatically select the latest date from history once it's fetched (and if we don't have one selected)
  useEffect(() => {
    if (historyDates.length > 0 && !selectedDate) {
      setSelectedDate(historyDates[0]);
    }
  }, [historyDates, selectedDate]);

  // Query student list & status for the selected class and date
  const { data: attendanceData, isLoading: loadingAttendance } = useQuery({
    queryKey: ["attendance", classId, selectedDate],
    queryFn: () => academicApi.getAttendance(classId, selectedDate),
    enabled: !!classId && !!selectedDate,
  });

  const list = attendanceData?.attendance ?? [];

  // Initialize marks state when roster loads
  useEffect(() => {
    if (list.length > 0) {
      const initialMarks = Object.fromEntries(
        list.map(s => [s.id as string, normalizeStatus(s.status)])
      );
      setMarks(initialMarks);
    }
  }, [attendanceData?.attendance]);

  // Mutation
  const saveAttendanceMutation = useMutation({
    mutationFn: (data: { classId: string; date: string; marks: { studentId: string; status: string }[] }) =>
      academicApi.saveAttendance(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-attendance-dates", classId] });
      queryClient.invalidateQueries({ queryKey: ["attendance", classId, selectedDate] });
      toast.success("Attendance saved successfully");
      setIsEditing(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save attendance");
    },
  });

  const handleSave = () => {
    if (!selectedDate) return;
    const formattedMarks = Object.entries(marks).map(([studentId, status]) => ({
      studentId,
      status: status.toUpperCase(), // PRESENT, ABSENT, etc.
    }));

    saveAttendanceMutation.mutate({
      classId,
      date: selectedDate,
      marks: formattedMarks,
    });
  };

  const handleCreateNewRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRegisterDate) return;

    // Check if attendance already exists for this date
    if (historyDates.includes(newRegisterDate)) {
      toast.info("Attendance already exists for this date. Loading register for edit.");
      setSelectedDate(newRegisterDate);
    } else {
      setSelectedDate(newRegisterDate);
      toast.success(`Started new register for ${newRegisterDate}`);
    }
    setNewDateModalOpen(false);
  };

  const summary = STATUSES.map(st => ({
    st,
    count: Object.values(marks).filter(x => x === st).length
  }));

  const isPending = saveAttendanceMutation.isPending;

  const isExistingRegister = historyDates.includes(selectedDate);
  const formattedSelectedDate = selectedDate
    ? new Date(selectedDate).toLocaleDateString(undefined, { dateStyle: "full" })
    : "";

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" description="Mark daily attendance per class and review summaries." />

      <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground font-medium block">Class</label>
            {loadingClasses ? (
              <div className="h-9 w-40 rounded-md border border-input bg-background animate-pulse mt-1" />
            ) : (
              <select
                value={classId}
                onChange={e => {
                  setClassId(e.target.value);
                }}
                className="mt-1 h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring cursor-pointer"
              >
                {allowedClasses.length === 0 && <option value="">No classes available</option>}
                {allowedClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          {historyDates.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground font-medium block">Select Date</label>
              <select
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="mt-1 h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring block cursor-pointer"
              >
                {historyDates.map(d => {
                  const label = new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" });
                  return <option key={d} value={d}>{label}</option>;
                })}
              </select>
            </div>
          )}

          {canMark && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setNewRegisterDate(new Date().toISOString().slice(0, 10));
                setNewDateModalOpen(true);
              }}
              className="h-9 gap-1.5"
            >
              <Plus className="h-4 w-4" /> Record New Day
            </Button>
          )}

          {selectedDate && (
            <div className="ml-auto flex flex-wrap gap-2">
              {summary.map(s => (
                <div key={s.st} className={`rounded-md border px-2.5 py-1 text-xs font-medium ${colorOf(s.st)}`}>
                  {s.st}: {s.count}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {classId && (
        <div className="space-y-4">
          {!selectedDate && !loadingDates && (
            <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
                <CalendarIcon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-foreground">No Attendance History</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
                No attendance registers have been recorded for this classroom yet. Click the button below to start marking.
              </p>
              {canMark && (
                <div className="mt-6">
                  <Button
                    onClick={() => {
                      setNewRegisterDate(new Date().toISOString().slice(0, 10));
                      setNewDateModalOpen(true);
                    }}
                    size="sm"
                    className="gap-1.5"
                  >
                    <Plus className="h-4 w-4" /> Record First Attendance
                  </Button>
                </div>
              )}
            </div>
          )}

          {selectedDate && (
            <>
              <div className={cn(
                "rounded-xl border px-4 py-3 text-sm font-medium flex items-center justify-between animate-fade-in",
                !isEditing
                  ? "bg-muted/50 border-border text-muted-foreground"
                  : isExistingRegister
                    ? "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400"
                    : "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400"
              )}>
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  <span>
                    {!isEditing
                      ? `Viewing attendance register taken on ${formattedSelectedDate}.`
                      : isExistingRegister
                        ? `Editing saved attendance register for ${formattedSelectedDate}. Any changes will update the existing record.`
                        : `Recording NEW attendance register for ${formattedSelectedDate}.`
                    }
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
                <div className="border-b border-border px-4 py-2.5 text-sm font-semibold flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-brand" /> {list.length} students
                </div>

                {loadingAttendance ? (
                  <div className="flex h-48 items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-brand" />
                      <p className="text-sm text-muted-foreground">Loading attendance roster…</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <ul className="divide-y divide-border">
                      {list.map(s => {
                        const studentId = s.id!;
                        return (
                          <li key={studentId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <span
                                className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-xs font-medium text-white"
                                style={{ backgroundColor: s.photoColor }}
                              >
                                {s.firstName[0]}{s.lastName[0]}
                              </span>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium">{s.firstName} {s.lastName}</div>
                                <div className="text-xs text-muted-foreground">{s.admissionNo}</div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {STATUSES.map(st => {
                                const active = (marks[studentId] || "Present") === st;
                                return (
                                  <button
                                    key={st}
                                    disabled={!canMark || isPending || !isEditing}
                                    onClick={() => setMarks(m => ({ ...m, [studentId]: st }))}
                                    className={cn(
                                      "rounded-md border px-2.5 py-1 text-xs font-medium transition cursor-pointer",
                                      active ? colorOf(st) : "border-border bg-card text-muted-foreground hover:bg-muted",
                                      (!canMark || isPending || !isEditing) && "opacity-60 cursor-not-allowed"
                                    )}
                                  >
                                    {st}
                                  </button>
                                );
                              })}
                            </div>
                          </li>
                        );
                      })}
                      {list.length === 0 && (
                        <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                          No active students enrolled in this classroom.
                        </li>
                      )}
                    </ul>

                    {list.length > 0 && (
                      <div className="border-t border-border p-3 flex justify-end gap-2 bg-muted/20">
                        {!isEditing && canMark && (
                          <Button size="sm" onClick={() => setIsEditing(true)}>
                            Edit Register
                          </Button>
                        )}
                        {isEditing && (
                          <>
                            {isExistingRegister && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (list.length > 0) {
                                    const initialMarks = Object.fromEntries(
                                      list.map(s => [s.id as string, normalizeStatus(s.status)])
                                    );
                                    setMarks(initialMarks);
                                  }
                                  setIsEditing(false);
                                }}
                              >
                                Cancel
                              </Button>
                            )}
                            <Button size="sm" disabled={!canMark || isPending} onClick={handleSave}>
                              <Save className="mr-1.5 h-4 w-4" />
                              {isPending ? "Saving..." : "Save attendance"}
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Date Selector Dialog Modal */}
      <Dialog open={newDateModalOpen} onOpenChange={setNewDateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateNewRegister}>
            <DialogHeader>
              <DialogTitle>Take Attendance for a New Day</DialogTitle>
              <DialogDescription>
                Choose the date you want to record or view attendance for.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2 font-medium">Select Date</label>
              <input
                type="date"
                value={newRegisterDate}
                onChange={e => setNewRegisterDate(e.target.value)}
                required
                max={new Date().toISOString().slice(0, 10)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewDateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Proceed
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
