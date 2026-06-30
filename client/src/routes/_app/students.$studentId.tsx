import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
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
  Edit,
  Plus,
  Calendar,
  HeartPulse,
  Camera,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  validateSearch: (search: Record<string, unknown>): { edit?: boolean } => {
    return {
      edit: (search.edit === true || search.edit === "true") ? true : undefined,
    };
  },
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

const getAvatarSrc = (url: string | null | undefined) => {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = import.meta.env.VITE_API_URL || "http://localhost:4000";
  const cleanUrl = url.startsWith("/") ? url : `/${url}`;
  return `${base}${cleanUrl}`;
};

function StudentProfile() {
  const initial = Route.useLoaderData();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canView = hasPermission(user, "students.view");

  const [editOpen, setEditOpen] = useState(false);
  const [editStep, setEditStep] = useState(1);
  const [editAvatarBase64, setEditAvatarBase64] = useState("");
  const [editAvatarPreview, setEditAvatarPreview] = useState("");

  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editGender, setEditGender] = useState<"M" | "F">("M");
  const [editDob, setEditDob] = useState("");
  const [editStatus, setEditStatus] = useState<"ACTIVE" | "GRADUATED" | "WITHDRAWN" | "TRANSFERRED">("ACTIVE");
  const [editAddress, setEditAddress] = useState("");

  // Step 2 Contacts
  const [editGuardianName, setEditGuardianName] = useState("");
  const [editGuardianPhone, setEditGuardianPhone] = useState("");
  const [editGuardianRelation, setEditGuardianRelation] = useState("Father");
  const [editGuardianEmail, setEditGuardianEmail] = useState("");

  const [editHasSecondaryGuardian, setEditHasSecondaryGuardian] = useState(false);
  const [editGuardian2Name, setEditGuardian2Name] = useState("");
  const [editGuardian2Phone, setEditGuardian2Phone] = useState("");
  const [editGuardian2Relation, setEditGuardian2Relation] = useState("Mother");
  const [editGuardian2Email, setEditGuardian2Email] = useState("");

  const [editHasEmergencyContact, setEditHasEmergencyContact] = useState(false);
  const [editEmergencyName, setEditEmergencyName] = useState("");
  const [editEmergencyPhone, setEditEmergencyPhone] = useState("");
  const [editEmergencyRelation, setEditEmergencyRelation] = useState("Guardian");

  // Step 3 Health & Additional
  const [editBloodGroup, setEditBloodGroup] = useState("");
  const [editAllergies, setEditAllergies] = useState("");
  const [editMedicalNotes, setEditMedicalNotes] = useState("");
  const [editBoardingStatus, setEditBoardingStatus] = useState("DAY");
  const [editPreviousSchool, setEditPreviousSchool] = useState("");

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

  const { edit } = Route.useSearch();
  const navigate = Route.useNavigate();

  useEffect(() => {
    if (edit && student) {
      setEditStep(1);
      setEditFirstName(student.firstName);
      setEditLastName(student.lastName);
      setEditGender(student.gender as "M" | "F");
      setEditDob(student.dob);
      setEditStatus((student.status || "ACTIVE").toUpperCase() as any);
      setEditAvatarBase64("");
      setEditAvatarPreview(student.avatarUrl || "");

      // Primary Guardian
      setEditGuardianName(student.guardianName);
      setEditGuardianPhone(student.guardianPhone);
      setEditGuardianRelation(student.guardianRelation);
      setEditGuardianEmail(student.guardianEmail || "");

      // Secondary Guardian
      setEditHasSecondaryGuardian(!!student.guardian2Name);
      setEditGuardian2Name(student.guardian2Name || "");
      setEditGuardian2Phone(student.guardian2Phone || "");
      setEditGuardian2Relation(student.guardian2Relation || "Mother");
      setEditGuardian2Email(student.guardian2Email || "");

      // Emergency Contact
      setEditHasEmergencyContact(!!student.emergencyName);
      setEditEmergencyName(student.emergencyName || "");
      setEditEmergencyPhone(student.emergencyPhone || "");
      setEditEmergencyRelation(student.emergencyRelation || "Guardian");

      // Health & Additional
      setEditBloodGroup(student.bloodGroup || "");
      setEditAllergies(student.allergies || "");
      setEditMedicalNotes(student.medicalNotes || "");
      setEditBoardingStatus(student.boardingStatus || "DAY");
      setEditPreviousSchool(student.previousSchool || "");
      setEditAddress(student.address || "");

      setEditOpen(true);
      
      // Clear the query parameter so the modal doesn't reopen unexpectedly
      navigate({ search: {} });
    }
  }, [edit, student, navigate]);

  const handleEditAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      toast.error("Avatar image must be smaller than 1.5MB");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      if (base64) {
        setEditAvatarBase64(base64);
        setEditAvatarPreview(result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Camera capture states for edit
  const [editCameraOpen, setEditCameraOpen] = useState(false);
  const [editCameraStream, setEditCameraStream] = useState<MediaStream | null>(null);
  const editVideoRef = useRef<HTMLVideoElement>(null);

  const startEditCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 300, height: 300, facingMode: "user" }
      });
      setEditCameraStream(mediaStream);
      setTimeout(() => {
        if (editVideoRef.current) {
          editVideoRef.current.srcObject = mediaStream;
        }
      }, 150);
    } catch (err) {
      toast.error("Failed to access camera. Please check camera permissions.");
      setEditCameraOpen(false);
    }
  };

  const stopEditCamera = () => {
    if (editCameraStream) {
      editCameraStream.getTracks().forEach((track) => track.stop());
      setEditCameraStream(null);
    }
  };

  const captureEditPhoto = () => {
    if (editVideoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = 300;
      canvas.height = 300;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(editVideoRef.current, 0, 0, 300, 300);
        const dataUrl = canvas.toDataURL("image/jpeg");
        const base64 = dataUrl.split(",")[1];
        if (base64) {
          setEditAvatarBase64(base64);
          setEditAvatarPreview(dataUrl);
        }
      }
      stopEditCamera();
      setEditCameraOpen(false);
    }
  };

  const openEdit = () => {
    if (!student) return;
    setEditStep(1);
    setEditFirstName(student.firstName);
    setEditLastName(student.lastName);
    setEditGender(student.gender as "M" | "F");
    setEditDob(student.dob);
    setEditStatus((student.status || "ACTIVE").toUpperCase() as any);
    setEditAvatarBase64("");
    setEditAvatarPreview(student.avatarUrl || "");

    // Primary Guardian
    setEditGuardianName(student.guardianName);
    setEditGuardianPhone(student.guardianPhone);
    setEditGuardianRelation(student.guardianRelation);
    setEditGuardianEmail(student.guardianEmail || "");

    // Secondary Guardian
    const hasSec = !!student.guardian2Name;
    setEditHasSecondaryGuardian(hasSec);
    setEditGuardian2Name(student.guardian2Name || "");
    setEditGuardian2Phone(student.guardian2Phone || "");
    setEditGuardian2Relation(student.guardian2Relation || "Mother");
    setEditGuardian2Email(student.guardian2Email || "");

    // Emergency Contact
    const hasEm = !!student.emergencyName;
    setEditHasEmergencyContact(hasEm);
    setEditEmergencyName(student.emergencyName || "");
    setEditEmergencyPhone(student.emergencyPhone || "");
    setEditEmergencyRelation(student.emergencyRelation || "Guardian");

    // Health / Demographics
    setEditBloodGroup(student.bloodGroup || "");
    setEditAllergies(student.allergies || "");
    setEditMedicalNotes(student.medicalNotes || "");
    setEditBoardingStatus(student.boardingStatus || "DAY");
    setEditPreviousSchool(student.previousSchool || "");
    setEditAddress(student.address);
    setEditOpen(true);
  };

  const editStudentMutation = useMutation({
    mutationFn: (data: Parameters<typeof studentsApi.update>[1]) =>
      studentsApi.update(student.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student", student.id] });
      queryClient.invalidateQueries({ queryKey: ["student-history", student.id] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      toast.success("Student details updated successfully");
      setEditOpen(false);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to update student");
    },
  });

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    editStudentMutation.mutate({
      firstName: editFirstName,
      lastName: editLastName,
      gender: editGender,
      dob: editDob,
      status: editStatus,
      avatarBase64: editAvatarBase64 || undefined,

      // Primary Guardian
      guardianName: editGuardianName,
      guardianPhone: editGuardianPhone,
      guardianRelation: editGuardianRelation,
      guardianEmail: editGuardianEmail || null,

      // Secondary Guardian
      guardian2Name: editHasSecondaryGuardian ? editGuardian2Name : null,
      guardian2Phone: editHasSecondaryGuardian ? editGuardian2Phone : null,
      guardian2Relation: editHasSecondaryGuardian ? editGuardian2Relation : null,
      guardian2Email: editHasSecondaryGuardian && editGuardian2Email ? editGuardian2Email : null,

      // Emergency Contact
      emergencyName: editHasEmergencyContact ? editEmergencyName : null,
      emergencyPhone: editHasEmergencyContact ? editEmergencyPhone : null,
      emergencyRelation: editHasEmergencyContact ? editEmergencyRelation : null,

      // Health / Demographics
      bloodGroup: editBloodGroup || null,
      allergies: editAllergies || null,
      medicalNotes: editMedicalNotes || null,
      boardingStatus: editBoardingStatus,
      previousSchool: editPreviousSchool || null,

      address: editAddress,
    });
  };

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
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                {student.avatarUrl ? (
                  <img
                    src={getAvatarSrc(student.avatarUrl)}
                    className="h-16 w-16 rounded-full object-cover shadow-sm border border-border"
                    alt={`${student.firstName} ${student.lastName}`}
                  />
                ) : (
                  <span
                    className="grid h-16 w-16 place-items-center rounded-full text-xl font-semibold text-white shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.2)]"
                    style={{ backgroundColor: student.photoColor }}
                  >
                    {student.firstName[0]}
                    {student.lastName[0]}
                  </span>
                )}
                <div>
                  <h2 className="font-bold text-foreground">
                    {student.firstName} {student.lastName}
                  </h2>
                  <p className="text-sm text-muted-foreground">{student.admissionNo}</p>
                  <Badge variant="outline" className="mt-1 border-border/80 bg-muted/20">
                    {humanize(profile?.status ?? student.status)}
                  </Badge>
                </div>
              </div>

              {hasPermission(user, "students.update") && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-muted"
                  onClick={openEdit}
                >
                  <Edit className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                  <span className="sr-only">Edit Student</span>
                </Button>
              )}
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

          {/* Health & Demographics Card */}
          {(student.bloodGroup || student.allergies || student.medicalNotes || student.boardingStatus) && (
            <section className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                <span className="p-1.5 rounded-lg bg-destructive/10 text-destructive">
                  <HeartPulse className="h-4 w-4" />
                </span>
                <h3 className="font-semibold text-foreground text-sm">Health & Demographics</h3>
              </div>
              <div className="space-y-3 text-xs">
                {student.boardingStatus && (
                  <div className="flex justify-between items-center py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Boarding Status</span>
                    <span className="font-medium text-foreground">
                      {student.boardingStatus === "BOARDER" ? "Boarder (Resident)" : "Day Student"}
                    </span>
                  </div>
                )}
                {student.bloodGroup && (
                  <div className="flex justify-between items-center py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Blood Group</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-destructive/20 text-destructive font-bold">
                      {student.bloodGroup}
                    </span>
                  </div>
                )}
                {student.allergies && (
                  <div className="py-1">
                    <span className="text-muted-foreground block mb-0.5">Allergies / Needs</span>
                    <span className="text-foreground bg-warning/10 text-warning-foreground border border-warning/20 px-2 py-1 rounded block">
                      {student.allergies}
                    </span>
                  </div>
                )}
                {student.medicalNotes && (
                  <div className="py-1">
                    <span className="text-muted-foreground block mb-0.5">Medical Notes</span>
                    <span className="text-foreground bg-muted p-2 rounded block font-mono text-[10px]">
                      {student.medicalNotes}
                    </span>
                  </div>
                )}
                {student.previousSchool && (
                  <div className="py-1">
                    <span className="text-muted-foreground block mb-0.5">Previous School</span>
                    <span className="text-foreground italic">{student.previousSchool}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Secondary & Emergency Contacts Card */}
          {(student.guardian2Name || student.emergencyName) && (
            <section className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                <span className="p-1.5 rounded-lg bg-brand/10 text-brand">
                  <Users className="h-4 w-4" />
                </span>
                <h3 className="font-semibold text-foreground text-sm">Additional Contacts</h3>
              </div>
              <div className="space-y-4 text-xs">
                {student.guardian2Name && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-foreground">{student.guardian2Name}</span>
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-medium">
                        {student.guardian2Relation || "Secondary Guardian"}
                      </span>
                    </div>
                    {student.guardian2Phone && (
                      <a href={`tel:${student.guardian2Phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-brand transition-colors">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span>{student.guardian2Phone}</span>
                      </a>
                    )}
                    {student.guardian2Email && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{student.guardian2Email}</span>
                      </div>
                    )}
                  </div>
                )}

                {student.emergencyName && (
                  <div className="space-y-1.5 pt-2 border-t border-border/40">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-destructive">{student.emergencyName}</span>
                      <span className="text-[10px] bg-destructive/10 px-1.5 py-0.5 rounded text-destructive font-medium uppercase tracking-wider">
                        Emergency ({student.emergencyRelation || "Contact"})
                      </span>
                    </div>
                    {student.emergencyPhone && (
                      <a href={`tel:${student.emergencyPhone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-brand transition-colors">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span>{student.emergencyPhone}</span>
                      </a>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

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

      {/* Edit Student Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => {
        setEditOpen(open);
        if (!open) {
          setEditStep(1);
          stopEditCamera();
          setEditCameraOpen(false);
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle>Edit Student Profile</DialogTitle>
              <DialogDescription>
                Progress through the steps to edit student details, update status, or register guardians.
              </DialogDescription>
            </DialogHeader>

            {/* Step Indicators */}
            <div className="flex items-center justify-between border-b border-border pb-4 mb-4 mt-2">
              {[
                { num: 1, label: "Profile" },
                { num: 2, label: "Contacts" },
                { num: 3, label: "Additional" },
              ].map((s) => (
                <div key={s.num} className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      editStep === s.num
                        ? "bg-brand text-white"
                        : editStep > s.num
                          ? "bg-success/20 text-success border border-success/30"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {editStep > s.num ? "✓" : s.num}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      editStep === s.num ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </span>
                  {s.num < 3 && <div className="h-px w-6 bg-border" />}
                </div>
              ))}
            </div>

            <div className="space-y-4 py-2 max-h-[55vh] overflow-y-auto pr-1">
              {/* STEP 1: Personal Profile */}
              {editStep === 1 && (
                <div className="space-y-4">
                  {/* Photo Upload */}
                  <div className="flex flex-col items-center justify-center gap-2 pb-2">
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-border bg-muted/20 overflow-hidden">
                      {editAvatarPreview ? (
                        <img src={getAvatarSrc(editAvatarPreview)} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center p-2 text-muted-foreground">
                          <Plus className="h-5 w-5" />
                          <span className="text-[10px]">No Photo</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-semibold text-brand hover:underline cursor-pointer">
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleEditAvatarChange}
                          className="hidden"
                        />
                      </label>
                      <span className="text-muted-foreground/30 text-xs">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditCameraOpen(true);
                          startEditCamera();
                        }}
                        className="text-xs font-semibold text-brand hover:underline"
                      >
                        Camera
                      </button>
                      {editAvatarPreview && (
                        <>
                          <span className="text-muted-foreground/30 text-xs">|</span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditAvatarPreview("");
                              setEditAvatarBase64("");
                            }}
                            className="text-xs font-semibold text-destructive hover:underline"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>

                    {/* Camera Modal inside step */}
                    <Dialog
                      open={editCameraOpen}
                      onOpenChange={(open) => {
                        setEditCameraOpen(open);
                        if (!open) stopEditCamera();
                      }}
                    >
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Capture Student Photo</DialogTitle>
                          <DialogDescription>
                            Align the student's face in the camera frame and click "Capture".
                          </DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col items-center justify-center gap-4 py-4">
                          <div className="relative h-64 w-64 overflow-hidden rounded-full border-2 border-border bg-black shadow-inner flex items-center justify-center">
                            {editCameraStream ? (
                              <video
                                ref={editVideoRef}
                                autoPlay
                                playsInline
                                muted
                                className="h-full w-full object-cover rounded-full"
                              />
                            ) : (
                              <div className="text-center p-4">
                                <Camera className="mx-auto h-8 w-8 text-muted-foreground animate-bounce" />
                                <p className="text-xs text-muted-foreground mt-2">Camera is starting...</p>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-3 justify-end w-full border-t pt-4">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                stopEditCamera();
                                setEditCameraOpen(false);
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              onClick={captureEditPhoto}
                              disabled={!editCameraStream}
                            >
                              Capture Frame
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">First Name *</label>
                      <input
                        value={editFirstName}
                        onChange={(e) => setEditFirstName(e.target.value)}
                        required
                        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">Last Name *</label>
                      <input
                        value={editLastName}
                        onChange={(e) => setEditLastName(e.target.value)}
                        required
                        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">Gender *</label>
                      <select
                        value={editGender}
                        onChange={(e) => setEditGender(e.target.value as "M" | "F")}
                        className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring"
                      >
                        <option value="M">Male</option>
                        <option value="F">Female</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">Date of Birth *</label>
                      <input
                        type="date"
                        value={editDob}
                        onChange={(e) => setEditDob(e.target.value)}
                        required
                        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">Enrolment Status *</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as any)}
                      className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="REPEATING">Repeating</option>
                      <option value="WITHDRAWN">Withdrawn / Deactivated</option>
                      <option value="GRADUATED">Graduated</option>
                      <option value="TRANSFERRED">Transferred</option>
                    </select>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Withdrawn, graduated or transferred students will not receive future automatic term bills.
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 2: Contacts & Guardians */}
              {editStep === 2 && (
                <div className="space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-1">
                    Primary Guardian Info
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">Guardian Name *</label>
                      <input
                        value={editGuardianName}
                        onChange={(e) => setEditGuardianName(e.target.value)}
                        required
                        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">Relation *</label>
                      <select
                        value={editGuardianRelation}
                        onChange={(e) => setEditGuardianRelation(e.target.value)}
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
                      <label className="text-xs font-medium text-foreground">Phone Number *</label>
                      <input
                        value={editGuardianPhone}
                        onChange={(e) => setEditGuardianPhone(e.target.value)}
                        required
                        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">Email Address</label>
                      <input
                        type="email"
                        value={editGuardianEmail}
                        onChange={(e) => setEditGuardianEmail(e.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                      />
                    </div>
                  </div>

                  {/* Secondary Guardian Toggle */}
                  <div className="pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground">
                      <input
                        type="checkbox"
                        checked={editHasSecondaryGuardian}
                        onChange={(e) => setEditHasSecondaryGuardian(e.target.checked)}
                        className="rounded border-input text-brand focus:ring-ring h-4 w-4"
                      />
                      <span>Add Secondary Guardian</span>
                    </label>
                  </div>

                  {editHasSecondaryGuardian && (
                    <div className="space-y-4 border border-dashed border-border/80 rounded-lg p-3 bg-muted/5 animate-in fade-in-50 duration-200">
                      <h5 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Secondary Guardian Details
                      </h5>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-foreground">Guardian Name *</label>
                          <input
                            value={editGuardian2Name}
                            onChange={(e) => setEditGuardian2Name(e.target.value)}
                            required={editHasSecondaryGuardian}
                            placeholder="e.g. Mary Doe"
                            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-foreground">Relation *</label>
                          <select
                            value={editGuardian2Relation}
                            onChange={(e) => setEditGuardian2Relation(e.target.value)}
                            className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring"
                          >
                            <option value="Mother">Mother</option>
                            <option value="Father">Father</option>
                            <option value="Guardian">Guardian</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-foreground">Phone Number *</label>
                          <input
                            value={editGuardian2Phone}
                            onChange={(e) => setEditGuardian2Phone(e.target.value)}
                            required={editHasSecondaryGuardian}
                            placeholder="+233..."
                            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-foreground">Email Address</label>
                          <input
                            type="email"
                            value={editGuardian2Email}
                            onChange={(e) => setEditGuardian2Email(e.target.value)}
                            placeholder="mother@example.com"
                            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Emergency Contact Toggle */}
                  <div className="pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground">
                      <input
                        type="checkbox"
                        checked={editHasEmergencyContact}
                        onChange={(e) => setEditHasEmergencyContact(e.target.checked)}
                        className="rounded border-input text-brand focus:ring-ring h-4 w-4"
                      />
                      <span>Emergency Contact is different from primary guardian</span>
                    </label>
                  </div>

                  {editHasEmergencyContact && (
                    <div className="space-y-4 border border-dashed border-border/80 rounded-lg p-3 bg-muted/5 animate-in fade-in-50 duration-200">
                      <h5 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Emergency Contact Details
                      </h5>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2 col-span-2">
                          <label className="text-xs font-medium text-foreground">Full Name *</label>
                          <input
                            value={editEmergencyName}
                            onChange={(e) => setEditEmergencyName(e.target.value)}
                            required={editHasEmergencyContact}
                            placeholder="e.g. Uncle Steve"
                            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-foreground">Relation *</label>
                          <input
                            value={editEmergencyRelation}
                            onChange={(e) => setEditEmergencyRelation(e.target.value)}
                            required={editHasEmergencyContact}
                            placeholder="e.g. Uncle"
                            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-foreground">Phone Number *</label>
                        <input
                          value={editEmergencyPhone}
                          onChange={(e) => setEditEmergencyPhone(e.target.value)}
                          required={editHasEmergencyContact}
                          placeholder="+233..."
                          className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: Medical & Additional Info */}
              {editStep === 3 && (
                <div className="space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-1">
                    Medical Info
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">Blood Group</label>
                      <select
                        value={editBloodGroup}
                        onChange={(e) => setEditBloodGroup(e.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring"
                      >
                        <option value="">Unknown</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                      </select>
                    </div>
                    <div className="space-y-2 col-span-2">
                      <label className="text-xs font-medium text-foreground">Boarding Status</label>
                      <select
                        value={editBoardingStatus}
                        onChange={(e) => setEditBoardingStatus(e.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring"
                      >
                        <option value="DAY">Day Student (Commuter)</option>
                        <option value="BOARDER">Boarding Student (Resident)</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">Allergies / Special Needs</label>
                    <textarea
                      value={editAllergies}
                      onChange={(e) => setEditAllergies(e.target.value)}
                      placeholder="e.g. Penicillin allergy, peanut allergy, asthma"
                      rows={1.5}
                      className="w-full rounded-md border border-input bg-card p-3 text-sm outline-none focus:border-ring"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">Medical Notes</label>
                    <textarea
                      value={editMedicalNotes}
                      onChange={(e) => setEditMedicalNotes(e.target.value)}
                      placeholder="Any additional instructions or conditions"
                      rows={1.5}
                      className="w-full rounded-md border border-input bg-card p-3 text-sm outline-none focus:border-ring"
                    />
                  </div>

                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-1 pt-2">
                    Schooling History & Address
                  </h4>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">Previous School (Transferring from)</label>
                    <input
                      value={editPreviousSchool}
                      onChange={(e) => setEditPreviousSchool(e.target.value)}
                      placeholder="Name of previous school"
                      className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">Residential Address *</label>
                    <textarea
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      required
                      rows={2}
                      placeholder="Physical address"
                      className="w-full rounded-md border border-input bg-card p-3 text-sm outline-none focus:border-ring"
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="mt-4 pt-4 border-t border-border/60">
              {editStep > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditStep((s) => s - 1)}
                  disabled={editStudentMutation.isPending}
                >
                  Back
                </Button>
              )}
              
              <Button type="button" variant="ghost" onClick={() => setEditOpen(false)} className="mr-auto text-muted-foreground">
                Cancel
              </Button>

              {editStep < 3 ? (
                <Button
                  key="edit-next-btn"
                  type="button"
                  onClick={() => {
                    if (editStep === 1) {
                      if (!editFirstName || !editLastName || !editDob) {
                        toast.error("Please fill in all required profile fields (*)");
                        return;
                      }
                    } else if (editStep === 2) {
                      if (!editGuardianName || !editGuardianPhone) {
                        toast.error("Please fill in primary guardian contacts (*)");
                        return;
                      }
                      if (editHasSecondaryGuardian && (!editGuardian2Name || !editGuardian2Phone)) {
                        toast.error("Please fill in secondary guardian details");
                        return;
                      }
                      if (editHasEmergencyContact && (!editEmergencyName || !editEmergencyPhone)) {
                        toast.error("Please fill in emergency contact details");
                        return;
                      }
                    }
                    setEditStep((s) => s + 1);
                  }}
                >
                  Next
                </Button>
              ) : (
                <Button
                  key="edit-submit-btn"
                  type="submit"
                  disabled={editStudentMutation.isPending}
                >
                  {editStudentMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
