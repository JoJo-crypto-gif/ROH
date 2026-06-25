import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, BookOpen, ClipboardCheck, Mail, User, Calendar as CalendarIcon, AlertCircle, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { academicApi, studentsApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/classes")({
  head: () => ({ meta: [{ title: "Classes — Lumen Suite" }] }),
  component: ClassesPage,
});

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ClassesPage() {
  const { user } = useAuth();
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  if (!hasPermission(user, "academic.view")) return <Forbidden />;

  // Load classrooms via API (live database)
  const { data: classesData, isLoading: loadingClasses } = useQuery({
    queryKey: ["classes-list"],
    queryFn: academicApi.getClasses,
  });

  const classrooms = classesData?.classrooms ?? [];

  // When class is selected, fetch students, subjects, attendance, and teachers
  const selectedClass = classrooms.find((c) => c.id === selectedClassId);

  const { data: studentsData, isLoading: loadingStudents } = useQuery({
    queryKey: ["class-students", selectedClassId],
    queryFn: () => studentsApi.list({ classId: selectedClassId! }),
    enabled: !!selectedClassId,
  });
  const studentsList = studentsData?.students ?? [];

  const { data: teachersData } = useQuery({
    queryKey: ["teachers"],
    queryFn: academicApi.getTeachers,
    enabled: !!selectedClassId,
  });
  const teachers = teachersData?.teachers ?? [];
  const classTeacher = selectedClass ? teachers.find((t) => t.id === selectedClass.teacherId) : null;

  const { data: classSubjectsData, isLoading: loadingSubjects } = useQuery({
    queryKey: ["class-subjects-list"],
    queryFn: academicApi.getClassSubjects,
    enabled: !!selectedClassId,
  });
  const classSubjects = classSubjectsData?.classSubjects ?? [];
  const selectedClassSubjects = selectedClassId
    ? classSubjects.filter((cs) => cs.classId === selectedClassId)
    : [];

  // Fetch unique dates where attendance was recorded
  const { data: attendanceDatesData } = useQuery({
    queryKey: ["class-attendance-dates", selectedClassId],
    queryFn: () => academicApi.getAttendanceDates(selectedClassId!),
    enabled: !!selectedClassId,
  });
  const activeDates = attendanceDatesData?.dates ?? [];

  // Automatically select the latest date that has attendance records
  useEffect(() => {
    if (activeDates.length > 0) {
      const todayStr = formatLocalDate(new Date());
      if (activeDates.includes(todayStr)) {
        setSelectedDate(new Date());
      } else {
        const sorted = [...activeDates].sort((a, b) => b.localeCompare(a));
        setSelectedDate(new Date(sorted[0]));
      }
    } else {
      setSelectedDate(undefined);
    }
  }, [activeDates]);

  const selectedDateStr = selectedDate ? formatLocalDate(selectedDate) : "";

  const { data: attendanceData, isLoading: loadingAttendance } = useQuery({
    queryKey: ["class-today-attendance", selectedClassId, selectedDateStr],
    queryFn: () => academicApi.getAttendance(selectedClassId!, selectedDateStr),
    enabled: !!selectedClassId && !!selectedDateStr,
  });
  const todayAttendanceList = attendanceData?.attendance ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Classrooms"
        description="Monitor and manage all active academic classrooms, lead teachers, registered subjects, and daily attendance."
      />

      {/* Classes Grid Section */}
      {loadingClasses ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-40 animate-pulse rounded-xl border border-border bg-muted/20" />
          ))}
        </div>
      ) : classrooms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
          No classrooms found in the database.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classrooms.map((c) => {
            const capacityPercent = Math.min(Math.round((c.studentCount / c.capacity) * 100), 100);
            return (
              <div
                key={c.id}
                onClick={() => setSelectedClassId(c.id)}
                className="group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-elevated)] hover:border-brand/40"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg group-hover:text-brand transition-colors">{c.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Level {c.level}</p>
                  </div>
                  <Badge variant="secondary" className="bg-brand/10 text-brand border-brand/20 font-medium">
                    Level {c.level}
                  </Badge>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <User className="h-3.5 w-3.5 text-brand/70" />
                    <span>Teacher: <span className="font-medium text-foreground">{c.teacherName || "Unassigned"}</span></span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <GraduationCap className="h-3.5 w-3.5 text-brand/70" />
                    <span>Students: <span className="font-medium text-foreground">{c.studentCount} / {c.capacity}</span></span>
                  </div>

                  {/* Progress bar for capacity */}
                  <div className="space-y-1 pt-1">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          capacityPercent >= 90 ? "bg-destructive" : capacityPercent >= 75 ? "bg-warning" : "bg-success"
                        )}
                        style={{ width: `${capacityPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Capacity usage</span>
                      <span>{capacityPercent}%</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Class Details Modal */}
      <Dialog open={!!selectedClassId} onOpenChange={(open) => { if (!open) setSelectedClassId(null); }}>
        <DialogContent className="max-w-2xl sm:rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-brand" />
              {selectedClass?.name} Details
            </DialogTitle>
            <DialogDescription>
              Overview of students, teacher, subjects, and attendance status for the active term.
            </DialogDescription>
          </DialogHeader>

          {selectedClass && (
            <Tabs defaultValue="students" className="mt-2 w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="students" className="flex items-center gap-1.5">
                  <GraduationCap className="h-4 w-4" />
                  Students
                </TabsTrigger>
                <TabsTrigger value="teacher" className="flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  Teacher
                </TabsTrigger>
                <TabsTrigger value="subjects" className="flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4" />
                  Subjects
                </TabsTrigger>
                <TabsTrigger value="attendance" className="flex items-center gap-1.5">
                  <ClipboardCheck className="h-4 w-4" />
                  Attendance
                </TabsTrigger>
              </TabsList>

              {/* Students Tab */}
              <TabsContent value="students" className="mt-4 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-semibold text-foreground">Class Roster ({studentsList.length} Students)</h4>
                </div>

                {loadingStudents ? (
                  <div className="space-y-2 py-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 animate-pulse rounded-md bg-muted/30" />
                    ))}
                  </div>
                ) : studentsList.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                    No students currently enrolled in this class.
                  </div>
                ) : (
                  <div className="max-h-[300px] overflow-y-auto pr-1 border border-border rounded-lg divide-y divide-border bg-card">
                    {studentsList.map((s) => (
                      <div key={s.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/10 transition-colors">
                        <div className="flex items-center gap-3">
                          <span
                            className="grid h-8 w-8 place-items-center rounded-md text-xs font-semibold text-white"
                            style={{ backgroundColor: s.photoColor || "var(--color-brand)" }}
                          >
                            {s.firstName[0]}{s.lastName[0]}
                          </span>
                          <div>
                            <div className="text-sm font-medium text-foreground">{s.firstName} {s.lastName}</div>
                            <div className="text-xs text-muted-foreground">{s.admissionNo}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs px-2 py-0.5 rounded-full border border-border bg-muted/30 text-muted-foreground">
                            {s.gender === "F" ? "Female" : "Male"}
                          </span>
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full border",
                            s.status === "active" ? "bg-success/10 text-[oklch(0.35_0.1_155)] border-success/20" : "bg-muted text-muted-foreground border-border"
                          )}>
                            {s.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Teacher Tab */}
              <TabsContent value="teacher" className="mt-4">
                <h4 className="text-sm font-semibold text-foreground mb-3">Classroom Lead Teacher</h4>
                
                {selectedClass.teacherId ? (
                  <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] flex flex-col sm:flex-row items-center sm:items-start gap-4">
                    <span className="grid h-16 w-16 place-items-center rounded-xl bg-brand text-2xl font-bold text-white shadow-sm shrink-0">
                      {selectedClass.teacherName[0]}
                    </span>
                    <div className="space-y-2 text-center sm:text-left flex-1 min-w-0">
                      <div>
                        <h5 className="text-lg font-bold text-foreground">{selectedClass.teacherName}</h5>
                        <p className="text-xs text-brand font-medium">Primary Classroom Lead</p>
                      </div>
                      
                      <div className="grid gap-2 pt-2 text-sm">
                        <div className="flex items-center justify-center sm:justify-start gap-2.5 text-muted-foreground">
                          <Mail className="h-4 w-4 text-brand/75 shrink-0" />
                          <span className="truncate">{classTeacher?.email || "No email registered"}</span>
                        </div>
                        <div className="flex items-center justify-center sm:justify-start gap-2.5 text-muted-foreground">
                          <AlertCircle className="h-4 w-4 text-brand/75 shrink-0" />
                          <span>Staff Number: <span className="font-semibold text-foreground">{classTeacher?.staffNo || "ST-N/A"}</span></span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                    No class teacher has been assigned to this classroom.
                  </div>
                )}
              </TabsContent>

              {/* Subjects Tab */}
              <TabsContent value="subjects" className="mt-4 space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Subjects Registered</h4>

                {loadingSubjects ? (
                  <div className="space-y-2 py-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 animate-pulse rounded-md bg-muted/30" />
                    ))}
                  </div>
                ) : selectedClassSubjects.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                    No subjects registered for this class.
                  </div>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden bg-card">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border text-muted-foreground font-medium text-xs">
                          <th className="px-4 py-2">Subject Name</th>
                          <th className="px-4 py-2">Code</th>
                          <th className="px-4 py-2">Subject Teacher</th>
                          <th className="px-4 py-2 text-right">Pass Mark</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {selectedClassSubjects.map((cs) => (
                          <tr key={cs.id} className="hover:bg-muted/5 transition-colors">
                            <td className="px-4 py-3 font-medium text-foreground">{cs.subjectName}</td>
                            <td className="px-4 py-3 text-muted-foreground">
                              <Badge variant="outline" className="text-xs uppercase px-1.5 py-0">
                                {cs.subjectCode}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-foreground">{cs.teacherName}</td>
                            <td className="px-4 py-3 text-right font-medium text-brand">{cs.passMark}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* Attendance Tab */}
              <TabsContent value="attendance" className="mt-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <h4 className="text-sm font-semibold text-foreground">Attendance Register</h4>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium">Select Date:</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 justify-start text-left font-normal gap-2 border-border animate-fade-in"
                        >
                          <CalendarIcon className="h-4 w-4 text-brand" />
                          {selectedDate ? (
                            selectedDate.toLocaleDateString(undefined, { dateStyle: "medium" })
                          ) : (
                            <span className="text-muted-foreground text-xs">Choose a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={setSelectedDate}
                          disabled={(date) => !activeDates.includes(formatLocalDate(date))}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {loadingAttendance ? (
                  <div className="space-y-2 py-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 animate-pulse rounded-md bg-muted/30" />
                    ))}
                  </div>
                ) : !selectedDateStr ? (
                  <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                    No attendance has been registered for this classroom yet. Go to the Attendance page to record it.
                  </div>
                ) : todayAttendanceList.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                    No attendance details found for {selectedDate?.toLocaleDateString(undefined, { dateStyle: "medium" })}.
                  </div>
                ) : (
                  <div className="max-h-[300px] overflow-y-auto pr-1 border border-border rounded-lg divide-y divide-border bg-card">
                    {todayAttendanceList.map((a) => {
                      const statusClean = a.status.toLowerCase();
                      const statusLabel = a.status.charAt(0) + a.status.slice(1).toLowerCase();
                      return (
                        <div key={a.admissionNo} className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/10 transition-colors">
                          <div className="flex items-center gap-3">
                            <span
                              className="grid h-8 w-8 place-items-center rounded-md text-xs font-semibold text-white"
                              style={{ backgroundColor: a.photoColor || "var(--color-brand)" }}
                            >
                              {a.firstName[0]}{a.lastName[0]}
                            </span>
                            <div>
                              <div className="text-sm font-medium text-foreground">{a.firstName} {a.lastName}</div>
                              <div className="text-xs text-muted-foreground">{a.admissionNo}</div>
                            </div>
                          </div>
                          <span className={cn(
                            "text-xs px-2.5 py-0.5 rounded-full border font-medium",
                            statusClean === "present" ? "bg-success/15 text-[oklch(0.35_0.1_155)] border-success/30"
                            : statusClean === "late" ? "bg-warning/15 text-[oklch(0.4_0.12_70)] border-warning/30"
                            : statusClean === "excused" ? "bg-brand/10 text-brand border-brand/30"
                            : "bg-destructive/15 text-destructive border-destructive/30"
                          )}>
                            {statusLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
