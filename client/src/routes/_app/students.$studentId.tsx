import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Mail, Phone, MapPin, GraduationCap, Calendar, Wallet, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  studentsApi,
  academicApi,
  type ApiStudent
} from "@/lib/api";
import {
  payments,
  formatCurrency,
  studentBalance,
  studentTotalBilled,
  studentTotalPaid
} from "@/lib/mock-data";

export const Route = createFileRoute("/_app/students/$studentId")({
  loader: async ({ params }) => {
    try {
      const data = await studentsApi.get(params.studentId);
      return data.student;
    } catch (err) {
      throw notFound();
    }
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.firstName ?? "Student"} — Lumen Suite` }] }),
  notFoundComponent: () => <div className="p-8 text-center text-sm text-muted-foreground">Student not found.</div>,
  errorComponent: ({ error }) => <div className="p-8 text-center text-sm text-destructive">{error.message}</div>,
  component: StudentProfile,
});

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function StudentProfile() {
  const loaderData = Route.useLoaderData();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  if (!hasPermission(user, "students.view")) return <Forbidden />;

  // Reactive Student Hook
  const { data: s = loaderData } = useQuery({
    queryKey: ["student", loaderData.id],
    queryFn: () => studentsApi.get(loaderData.id).then(r => r.student),
    initialData: loaderData,
  });

  const { data: classesData } = useQuery({
    queryKey: ["classes"],
    queryFn: academicApi.getClasses,
  });

  const classrooms = classesData?.classrooms ?? [];

  const { data: yearsData } = useQuery({
    queryKey: ["years"],
    queryFn: academicApi.getYears,
  });
  const years = yearsData?.years ?? [];

  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");

  // Automatically set default year/term when years data is loaded
  useEffect(() => {
    if (years.length > 0 && !yearId) {
      const activeYear = years.find(y => y.active) || years[0];
      setYearId(activeYear.id);
      if (activeYear.terms.length > 0) {
        const activeTerm = activeYear.terms.find(t => t.active) || activeYear.terms[0];
        setTermId(activeTerm.id);
      }
    }
  }, [years, yearId]);

  // Update terms when year changes
  const handleYearChange = (newYearId: string) => {
    setYearId(newYearId);
    const yearObj = years.find(y => y.id === newYearId);
    if (yearObj && yearObj.terms.length > 0) {
      const activeTerm = yearObj.terms.find(t => t.active) || yearObj.terms[0];
      setTermId(activeTerm.id);
    } else {
      setTermId("");
    }
  };

  const { data: attendanceHistoryData, isLoading: loadingAttendance } = useQuery({
    queryKey: ["student-attendance-history", s.id, yearId, termId],
    queryFn: () => studentsApi.getAttendance(s.id, yearId, termId),
    enabled: !!yearId && !!termId,
  });
  const attendanceHistory = attendanceHistoryData?.attendance ?? [];

  const selectedYearObj = years.find(y => y.id === yearId);
  const selectedTermObj = selectedYearObj?.terms?.find(t => t.id === termId);

  // Removed calendar helpers in favor of linear boxes list

  const myPayments = payments.filter(p => p.studentId === s.id);

  // Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [firstName, setFirstName] = useState(s.firstName);
  const [lastName, setLastName] = useState(s.lastName);
  const [gender, setGender] = useState<"M" | "F">(s.gender as "M" | "F");
  const [dob, setDob] = useState(s.dob);
  const [status, setStatus] = useState(s.status);
  const [classId, setClassId] = useState(s.classId ?? "");
  const [guardianName, setGuardianName] = useState(s.guardian.name);
  const [guardianPhone, setGuardianPhone] = useState(s.guardian.phone);
  const [guardianRelation, setGuardianRelation] = useState(s.guardian.relation);
  const [guardianEmail, setGuardianEmail] = useState(s.guardian.email ?? "");
  const [address, setAddress] = useState(s.address);

  const updateStudentMutation = useMutation({
    mutationFn: (data: any) => studentsApi.update(s.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student", s.id] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      toast.success("Student details updated successfully");
      setModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update student details");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateStudentMutation.mutate({
      firstName,
      lastName,
      gender,
      dob,
      status,
      classId: classId || null,
      guardianName,
      guardianPhone,
      guardianRelation,
      guardianEmail: guardianEmail || null,
      address,
    });
  };

  return (
    <div className="space-y-6">
      <Link to="/students" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to students
      </Link>

      <div className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-5 sm:flex sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl text-lg font-semibold text-white" style={{ backgroundColor: s.photoColor }}>
              {s.firstName[0]}{s.lastName[0]}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{s.firstName} {s.lastName}</h1>
              <p className="text-sm text-muted-foreground">{s.admissionNo} · {s.className} · Enrolled {s.enrolledAt}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {hasPermission(user, "students.update") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFirstName(s.firstName);
                  setLastName(s.lastName);
                  setGender(s.gender as "M" | "F");
                  setDob(s.dob);
                  setStatus(s.status);
                  setClassId(s.classId ?? "");
                  setGuardianName(s.guardian.name);
                  setGuardianPhone(s.guardian.phone);
                  setGuardianRelation(s.guardian.relation);
                  setGuardianEmail(s.guardian.email ?? "");
                  setAddress(s.address);
                  setModalOpen(true);
                }}
              >
                Edit
              </Button>
            )}
            <Button size="sm">Record payment</Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <InfoTile icon={Wallet} label="Outstanding balance" value={formatCurrency(studentBalance(s.id, s.classId))} accent={studentBalance(s.id, s.classId) > 0 ? "text-destructive" : "text-success"} />
          <InfoTile icon={GraduationCap} label="Total billed (term)" value={formatCurrency(studentTotalBilled(s.id, s.classId))} />
          <InfoTile icon={Calendar} label="Total paid" value={formatCurrency(studentTotalPaid(s.id, s.classId))} accent="text-success" />
        </div>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="guardian">Guardian</TabsTrigger>
          <TabsTrigger value="academic">Academic history</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailCard title="Personal">
              <Row label="Full name" value={`${s.firstName} ${s.lastName}`} />
              <Row label="Gender" value={s.gender === "F" ? "Female" : "Male"} />
              <Row label="Date of birth" value={s.dob} />
              <Row label="Status" value={<span className="capitalize">{s.status}</span>} />
            </DetailCard>
            <DetailCard title="Contact">
              <Row icon={<MapPin className="h-4 w-4" />} label="Address" value={s.address} />
              <Row icon={<Phone className="h-4 w-4" />} label="Guardian phone" value={s.guardian.phone} />
              <Row icon={<Mail className="h-4 w-4" />} label="Guardian email" value={s.guardian.email ?? "—"} />
            </DetailCard>
          </div>
        </TabsContent>

        <TabsContent value="guardian" className="mt-4">
          <DetailCard title={s.guardian.name}>
            <Row label="Relation" value={s.guardian.relation} />
            <Row label="Phone" value={s.guardian.phone} />
            <Row label="Email" value={s.guardian.email ?? "—"} />
          </DetailCard>
        </TabsContent>

        <TabsContent value="academic" className="mt-4">
          <DetailCard title="Class history">
            <Row label="Current class" value={s.className ?? "—"} />
            <Row label="Enrolled at" value={s.enrolledAt} />
            <Row label="Promotions" value="No prior records (MVP)" />
          </DetailCard>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-2.5 text-left font-medium">Receipt</th><th className="px-4 py-2.5 text-left font-medium">Date</th><th className="px-4 py-2.5 text-left font-medium">Method</th><th className="px-4 py-2.5 text-left font-medium">Amount</th><th className="px-4 py-2.5 text-left font-medium">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {myPayments.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No payments yet.</td></tr>}
                {myPayments.map(p => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5 font-medium">{p.receiptNo}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.date}</td>
                    <td className="px-4 py-2.5">{p.method}</td>
                    <td className="px-4 py-2.5 font-medium">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-2.5">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <DetailCard title="Attendance Heatmap">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4 border-b border-border pb-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Year:</span>
                <select
                  value={yearId}
                  onChange={(e) => handleYearChange(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                >
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name} {y.active ? "(Active)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Term:</span>
                <select
                  value={termId}
                  onChange={(e) => setTermId(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                >
                  {selectedYearObj?.terms?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.active ? "(Active)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loadingAttendance ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-48 animate-pulse rounded-xl border border-border bg-muted/20" />
                ))}
              </div>
            ) : !selectedTermObj ? (
              <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                No active term configuration found.
              </div>
            ) : (
              <div className="space-y-6">
                {attendanceHistory.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                    No attendance records found for this student in the selected term.
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex flex-wrap gap-2">
                      {attendanceHistory.map((rec) => {
                        const statusLower = rec.status.toLowerCase();
                        let colorClass = "bg-muted/40 border border-border/50";
                        let textClass = "text-muted-foreground";
                        let label = "No record";

                        if (statusLower === "present") {
                          colorClass = "bg-green-500/20 border-green-500/30 hover:bg-green-500/30 shadow-sm";
                          textClass = "text-green-700 dark:text-green-400 font-semibold";
                          label = "Present";
                        } else if (statusLower === "absent") {
                          colorClass = "bg-red-500/20 border-red-500/30 hover:bg-red-500/30 shadow-sm";
                          textClass = "text-red-700 dark:text-red-400 font-semibold";
                          label = "Absent";
                        } else if (statusLower === "late") {
                          colorClass = "bg-yellow-500/20 border-yellow-500/30 hover:bg-yellow-500/30 shadow-sm";
                          textClass = "text-yellow-700 dark:text-yellow-400 font-semibold";
                          label = "Late";
                        } else if (statusLower === "excused") {
                          colorClass = "bg-gray-500/20 border-gray-500/30 hover:bg-gray-500/30 shadow-sm";
                          textClass = "text-gray-700 dark:text-gray-400 font-semibold";
                          label = "Excused";
                        }

                        const formattedCellDate = new Date(rec.date).toLocaleDateString(undefined, { dateStyle: "medium" });

                        return (
                          <div key={rec.id} className="group relative">
                            <div className={cn("h-[90px] w-[200px] rounded-lg cursor-pointer transition-all flex flex-col justify-between p-3 border", colorClass)}>
                              <span className="text-[10px] font-bold opacity-80 uppercase tracking-wider">
                                {new Date(rec.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                              </span>
                              <div className="flex flex-col">
                                <span className={cn("text-xs font-bold", textClass)}>{label}</span>
                                <span className="text-[9px] text-muted-foreground mt-0.5 truncate">{rec.className}</span>
                              </div>
                            </div>
                            
                            {/* CSS Tooltip */}
                            <div className="absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 rounded-lg bg-popover border border-border p-2.5 shadow-md group-hover:block text-xs text-popover-foreground w-48 pointer-events-none animate-fade-in">
                              <div className="font-semibold border-b border-border pb-1 mb-1">{formattedCellDate}</div>
                              <div className="space-y-0.5">
                                <div>Status: <span className={textClass}>{label}</span></div>
                                <div>Class: <span className="font-medium text-foreground">{rec.className}</span></div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Legend */}
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/50">
                      <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-sm bg-green-500/20 border border-green-500/30" /> Present
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-sm bg-red-500/20 border border-red-500/30" /> Absent
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-sm bg-yellow-500/20 border border-yellow-500/30" /> Late
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-sm bg-gray-500/20 border border-gray-500/30" /> Excused
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DetailCard>
        </TabsContent>
      </Tabs>

      {/* Edit Student Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Edit Student Details</DialogTitle>
              <DialogDescription>
                Modify student details, update primary guardian details, or change active classroom enrolment.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-1">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Personal Info</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">First Name</label>
                  <input
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    required
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Last Name</label>
                  <input
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    required
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Gender</label>
                  <select
                    value={gender}
                    onChange={e => setGender(e.target.value as "M" | "F")}
                    className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring"
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Date of Birth</label>
                  <input
                    type="date"
                    value={dob}
                    onChange={e => setDob(e.target.value)}
                    required
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Status</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring"
                  >
                    <option value="active">Active</option>
                    <option value="repeating">Repeating</option>
                    <option value="withdrawn">Withdrawn</option>
                    <option value="graduated">Graduated</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Classroom Enrolment</label>
                  <select
                    value={classId}
                    onChange={e => setClassId(e.target.value)}
                    required
                    className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring"
                  >
                    <option value="" disabled>Select Classroom</option>
                    {classrooms.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Residential Address</label>
                <textarea
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  required
                  rows={2}
                  className="w-full rounded-md border border-input bg-card p-3 text-sm outline-none focus:border-ring"
                />
              </div>

              <h4 className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Primary Guardian Info</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Guardian Name</label>
                  <input
                    value={guardianName}
                    onChange={e => setGuardianName(e.target.value)}
                    required
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Guardian Relation</label>
                  <select
                    value={guardianRelation}
                    onChange={e => setGuardianRelation(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring"
                  >
                    <option value="Father">Father</option>
                    <option value="Mother">Mother</option>
                    <option value="Guardian">Guardian</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Phone Number</label>
                  <input
                    value={guardianPhone}
                    onChange={e => setGuardianPhone(e.target.value)}
                    required
                    placeholder="+234..."
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Email Address</label>
                  <input
                    type="email"
                    value={guardianEmail}
                    onChange={e => setGuardianEmail(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateStudentMutation.isPending}>
                {updateStudentMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <div className={`mt-1.5 text-lg font-semibold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}
function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 space-y-2.5">{children}</div>
    </div>
  );
}
function Row({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-start gap-3 text-sm">
      <div className="flex items-center gap-1.5 text-muted-foreground">{icon}{label}</div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}
