import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Search, Filter, Download, MoreHorizontal } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { studentBalance, formatCurrency } from "@/lib/mock-data";
import { studentsApi, academicApi } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/students/")({
  head: () => ({ meta: [{ title: "Students — Lumen Suite" }] }),
  component: StudentsPage,
});

function StudentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  if (!hasPermission(user, "students.view")) return <Forbidden />;

  // Queries
  const { data: studentsData, isLoading: loadingStudents } = useQuery({
    queryKey: ["students", classFilter, statusFilter, query],
    queryFn: () => studentsApi.list({ classId: classFilter, status: statusFilter, search: query }),
  });

  const { data: classesData } = useQuery({
    queryKey: ["classes"],
    queryFn: academicApi.getClasses,
  });

  const studentsList = studentsData?.students ?? [];
  const classrooms = classesData?.classrooms ?? [];

  // Modal Dialog Form State
  const [modalOpen, setModalOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<"M" | "F">("M");
  const [dob, setDob] = useState("");
  const [classId, setClassId] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianRelation, setGuardianRelation] = useState("Father");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [address, setAddress] = useState("");

  const createStudentMutation = useMutation({
    mutationFn: studentsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      toast.success("Student admitted successfully");
      setModalOpen(false);
      // Reset form
      setFirstName("");
      setLastName("");
      setGender("M");
      setDob("");
      setClassId("");
      setGuardianName("");
      setGuardianPhone("");
      setGuardianRelation("Father");
      setGuardianEmail("");
      setAddress("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to admit student");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId) {
      toast.error("Please select a classroom.");
      return;
    }
    createStudentMutation.mutate({
      firstName,
      lastName,
      gender,
      dob,
      classId,
      guardianName,
      guardianPhone,
      guardianRelation,
      guardianEmail: guardianEmail || null,
      address,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description="Manage enrolment, profiles, guardians and academic history."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-4 w-4" /> Export</Button>
            {hasPermission(user, "students.create") && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setClassId(classrooms[0]?.id ?? "");
                  setModalOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add student
              </Button>
            )}
          </>
        }
      />

      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <div className="relative flex-1 min-w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or admission no" className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring" />
          </div>
          <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="all">All classes</option>
            {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="repeating">Repeating</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="graduated">Graduated</option>
          </select>
          <Button variant="outline" size="sm" className="gap-1.5"><Filter className="h-4 w-4" /> More</Button>
          <div className="ml-auto text-xs text-muted-foreground">{studentsList.length} total</div>
        </div>

        {loadingStudents ? (
          <div className="flex h-48 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-brand" />
              <p className="text-sm text-muted-foreground">Loading students…</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Student</th>
                  <th className="px-4 py-2.5 text-left font-medium">Admission no</th>
                  <th className="px-4 py-2.5 text-left font-medium">Class</th>
                  <th className="px-4 py-2.5 text-left font-medium">Guardian</th>
                  <th className="px-4 py-2.5 text-left font-medium">Balance</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {studentsList.map(s => {
                  const bal = studentBalance(s.id, s.classId);
                  return (
                    <tr key={s.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link to="/students/$studentId" params={{ studentId: s.id }} className="flex min-w-0 items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-xs font-medium text-white" style={{ backgroundColor: s.photoColor }}>
                            {s.firstName[0]}{s.lastName[0]}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">{s.firstName} {s.lastName}</div>
                            <div className="text-xs text-muted-foreground">{s.gender === "F" ? "Female" : "Male"} · DOB {s.dob}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{s.admissionNo}</td>
                      <td className="px-4 py-3">{s.className}</td>
                      <td className="px-4 py-3">
                        <div className="text-foreground">{s.guardian.name}</div>
                        <div className="text-xs text-muted-foreground">{s.guardian.phone}</div>
                      </td>
                      <td className={`px-4 py-3 font-medium ${bal > 0 ? "text-destructive" : "text-success"}`}>{formatCurrency(bal)}</td>
                      <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                      <td className="px-4 py-3 text-right"><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></td>
                    </tr>
                  );
                })}
                {studentsList.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No students match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Admit Student Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Admit New Student</DialogTitle>
              <DialogDescription>
                Fill in the student details, select an initial classroom, and register the primary guardian.
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
                <div className="space-y-2 col-span-2">
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
                  <label className="text-xs font-medium text-foreground">Email Address (Optional)</label>
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
              <Button type="submit" disabled={createStudentMutation.isPending}>
                {createStudentMutation.isPending ? "Admitting..." : "Admit Student"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-success/15 text-[oklch(0.35_0.1_155)]",
    repeating: "bg-warning/15 text-[oklch(0.4_0.12_70)]",
    withdrawn: "bg-destructive/15 text-destructive",
    graduated: "bg-brand/10 text-brand",
  };
  return <Badge variant="outline" className={`border-transparent capitalize ${map[status]}`}>{status}</Badge>;
}
