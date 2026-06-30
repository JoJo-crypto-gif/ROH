import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef } from "react";
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Copy,
  Check,
  Phone,
  Eye,
  Edit,
  GraduationCap,
  Calendar,
  Camera,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_app/students/")({
  head: () => ({ meta: [{ title: "Students — Lumen Suite" }] }),
  component: StudentsPage,
});

function calcAge(dobString: string): number | null {
  const birthDate = new Date(dobString);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function CopyableAdmissionNo({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(`Copied: ${value}`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleCopy}
            className="group/copy inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/30 px-2 py-0.5 font-mono text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-150"
          >
            <span>{value}</span>
            {copied ? (
              <Check className="h-3 w-3 text-success animate-in fade-in zoom-in-50" />
            ) : (
              <Copy className="h-3 w-3 opacity-0 group-hover/copy:opacity-100 transition-opacity duration-150" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <span>{copied ? "Copied!" : "Click to copy admission number"}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const getAvatarSrc = (url: string | null | undefined) => {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = import.meta.env.VITE_API_URL || "http://localhost:4000";
  const cleanUrl = url.startsWith("/") ? url : `/${url}`;
  return `${base}${cleanUrl}`;
};

function StudentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const canView = hasPermission(user, "students.view");

  // Queries
  const { data: studentsData, isLoading: loadingStudents } = useQuery({
    queryKey: ["students", classFilter, statusFilter, query],
    queryFn: () => studentsApi.list({ classId: classFilter, status: statusFilter, search: query }),
  });

  const { data: classesData } = useQuery({
    queryKey: ["classes"],
    queryFn: () => academicApi.getClasses(),
  });
  const { data: yearsData } = useQuery({
    queryKey: ["academic-years"],
    queryFn: academicApi.getYears,
  });

  const studentsList = studentsData?.students ?? [];
  const classrooms = classesData?.classrooms ?? [];
  const activeYear = yearsData?.years.find((year) => year.status === "ACTIVE");

  // Modal Dialog Form State
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [avatarBase64, setAvatarBase64] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<"M" | "F">("M");
  const [dob, setDob] = useState("");
  const [classId, setClassId] = useState("");
  const [feeEffectiveTermId, setFeeEffectiveTermId] = useState("");
  
  // Step 2: Guardians
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianRelation, setGuardianRelation] = useState("Father");
  const [guardianEmail, setGuardianEmail] = useState("");

  const [hasSecondaryGuardian, setHasSecondaryGuardian] = useState(false);
  const [guardian2Name, setGuardian2Name] = useState("");
  const [guardian2Phone, setGuardian2Phone] = useState("");
  const [guardian2Relation, setGuardian2Relation] = useState("Mother");
  const [guardian2Email, setGuardian2Email] = useState("");

  const [hasEmergencyContact, setHasEmergencyContact] = useState(false);
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRelation, setEmergencyRelation] = useState("Guardian");

  // Step 3: Medical & Health
  const [bloodGroup, setBloodGroup] = useState("");
  const [allergies, setAllergies] = useState("");
  const [medicalNotes, setMedicalNotes] = useState("");
  const [boardingStatus, setBoardingStatus] = useState("DAY");
  const [previousSchool, setPreviousSchool] = useState("");
  const [address, setAddress] = useState("");

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        setAvatarBase64(base64);
        setAvatarPreview(result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Camera capture states
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 300, height: 300, facingMode: "user" }
      });
      setCameraStream(mediaStream);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 150);
    } catch (err) {
      toast.error("Failed to access camera. Please check camera permissions.");
      setCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = 300;
      canvas.height = 300;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, 300, 300);
        const dataUrl = canvas.toDataURL("image/jpeg");
        const base64 = dataUrl.split(",")[1];
        if (base64) {
          setAvatarBase64(base64);
          setAvatarPreview(dataUrl);
        }
      }
      stopCamera();
      setCameraOpen(false);
    }
  };

  const createStudentMutation = useMutation({
    mutationFn: studentsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      toast.success("Student admitted successfully");
      setModalOpen(false);
      
      // Reset form
      setStep(1);
      setAvatarBase64("");
      setAvatarPreview("");
      setFirstName("");
      setLastName("");
      setGender("M");
      setDob("");
      setClassId("");
      setFeeEffectiveTermId("");
      
      setGuardianName("");
      setGuardianPhone("");
      setGuardianRelation("Father");
      setGuardianEmail("");

      setHasSecondaryGuardian(false);
      setGuardian2Name("");
      setGuardian2Phone("");
      setGuardian2Relation("Mother");
      setGuardian2Email("");

      setHasEmergencyContact(false);
      setEmergencyName("");
      setEmergencyPhone("");
      setEmergencyRelation("Guardian");

      setBloodGroup("");
      setAllergies("");
      setMedicalNotes("");
      setBoardingStatus("DAY");
      setPreviousSchool("");
      setAddress("");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to admit student");
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
      feeEffectiveTermId: feeEffectiveTermId || undefined,
      avatarBase64: avatarBase64 || undefined,
      
      // Primary Guardian
      guardianName,
      guardianPhone,
      guardianRelation,
      guardianEmail: guardianEmail || null,

      // Secondary Guardian
      guardian2Name: hasSecondaryGuardian ? guardian2Name : null,
      guardian2Phone: hasSecondaryGuardian ? guardian2Phone : null,
      guardian2Relation: hasSecondaryGuardian ? guardian2Relation : null,
      guardian2Email: hasSecondaryGuardian && guardian2Email ? guardian2Email : null,

      // Emergency Contact
      emergencyName: hasEmergencyContact ? emergencyName : null,
      emergencyPhone: hasEmergencyContact ? emergencyPhone : null,
      emergencyRelation: hasEmergencyContact ? emergencyRelation : null,

      // Health / Demographics
      bloodGroup: bloodGroup || null,
      allergies: allergies || null,
      medicalNotes: medicalNotes || null,
      boardingStatus,
      previousSchool: previousSchool || null,

      address,
    });
  };

  if (!canView) return <Forbidden />;

  const hasActiveFilters = query !== "" || classFilter !== "all" || statusFilter !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description="Manage enrolment, profiles, guardians and academic history."
        actions={
          <>
            {hasPermission(user, "students.create") && (
              <Button
                size="sm"
                className="gap-1.5 shadow-sm"
                onClick={() => {
                  setClassId(classrooms[0]?.id ?? "");
                  setFeeEffectiveTermId(
                    activeYear?.terms.find((term) => term.status === "ACTIVE")?.id ??
                      activeYear?.terms.find((term) => term.status === "PENDING")?.id ??
                      "",
                  );
                  setModalOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add student
              </Button>
            )}
          </>
        }
      />

      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4 bg-muted/10">
          <div className="relative flex-1 min-w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or admission no"
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring transition-colors"
            />
          </div>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:border-ring outline-none transition-colors"
          >
            <option value="all">All classes</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:border-ring outline-none transition-colors"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="transferred">Transferred</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="graduated">Graduated</option>
          </select>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Filter className="h-4 w-4" /> More
          </Button>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{studentsList.length}</span>
            <span>{hasActiveFilters ? "filtered" : "total"}</span>
            {hasActiveFilters && (
              <>
                <span>•</span>
                <button
                  onClick={() => {
                    setQuery("");
                    setClassFilter("all");
                    setStatusFilter("all");
                  }}
                  className="text-brand hover:underline font-semibold transition-colors"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        </div>

        {loadingStudents ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Student</th>
                  <th className="px-4 py-3 text-left font-medium">Admission no</th>
                  <th className="px-4 py-3 text-left font-medium">Class</th>
                  <th className="px-4 py-3 text-left font-medium">Guardian</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-md" />
                        <div className="space-y-1.5 flex-1 max-w-[150px]">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <Skeleton className="h-5 w-20 rounded-md" />
                    </td>
                    <td className="px-4 py-3.5">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <Skeleton className="h-6 w-16 rounded-full" />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Skeleton className="h-8 w-8 rounded ml-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Student</th>
                  <th className="px-4 py-3 text-left font-semibold">Admission no</th>
                  <th className="px-4 py-3 text-left font-semibold">Class</th>
                  <th className="px-4 py-3 text-left font-semibold">Guardian</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {studentsList.map((s) => {
                  const age = calcAge(s.dob);
                  return (
                    <tr
                      key={s.id}
                      className="group/row hover:bg-muted/40 transition-all duration-200 relative"
                    >
                      <td className="relative px-4 py-3">
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-brand opacity-0 group-hover/row:opacity-100 transition-opacity duration-200" />
                        <Link
                          to="/students/$studentId"
                          params={{ studentId: s.id }}
                          className="flex min-w-0 items-center gap-3"
                        >
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                {s.avatarUrl ? (
                                  <img
                                    src={getAvatarSrc(s.avatarUrl)}
                                    className="h-9 w-9 shrink-0 rounded-md object-cover border border-border shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] transition-transform duration-200 group-hover/row:scale-105"
                                    alt=""
                                  />
                                ) : (
                                  <span
                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-xs font-semibold text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] transition-transform duration-200 group-hover/row:scale-105"
                                    style={{ backgroundColor: s.photoColor }}
                                  >
                                    {s.firstName[0]}
                                    {s.lastName[0]}
                                  </span>
                                )}
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="flex flex-col gap-0.5 text-left text-xs">
                                  <span className="font-semibold">{s.firstName} {s.lastName}</span>
                                  <span className="text-muted-foreground">ID: {s.admissionNo}</span>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-foreground group-hover/row:text-brand transition-colors duration-200">
                              {s.firstName} {s.lastName}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2 hover:text-foreground transition-colors">
                                      {s.gender === "F" ? "Female" : "Male"} · {age !== null ? `${age} yrs` : `DOB ${s.dob}`}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="flex items-center gap-1.5 text-xs">
                                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                      <span className="font-medium text-muted-foreground">Born:</span>
                                      <span>{new Date(s.dob).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <CopyableAdmissionNo value={s.admissionNo} />
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{s.className}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{s.guardian.name}</div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={`tel:${s.guardian.phone.replace(/\s+/g, "")}`}
                                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-brand hover:underline transition-colors mt-0.5"
                              >
                                <Phone className="h-3 w-3 shrink-0" />
                                <span>{s.guardian.phone}</span>
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>
                              <span className="text-xs">Call primary guardian ({s.guardian.relation})</span>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-muted/80 transition-colors"
                            >
                              <MoreHorizontal className="h-4 w-4 text-muted-foreground group-hover/row:text-foreground" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem asChild>
                              <Link
                                to="/students/$studentId"
                                params={{ studentId: s.id }}
                                className="cursor-pointer"
                              >
                                <Eye className="mr-2 h-4 w-4 text-muted-foreground" /> View Profile
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => {
                                navigator.clipboard.writeText(s.admissionNo);
                                toast.success("Admission number copied to clipboard");
                              }}
                            >
                              <Copy className="mr-2 h-4 w-4 text-muted-foreground" /> Copy Admission No
                            </DropdownMenuItem>
                            {hasPermission(user, "students.update") && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <Link
                                    to="/students/$studentId"
                                    params={{ studentId: s.id }}
                                    search={{ edit: true }}
                                    className="cursor-pointer"
                                  >
                                    <Edit className="mr-2 h-4 w-4 text-muted-foreground" /> Edit Student
                                  </Link>
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
                {studentsList.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="mx-auto flex max-w-[320px] flex-col items-center justify-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <GraduationCap className="h-6 w-6" />
                        </div>
                        <h3 className="mt-4 text-sm font-semibold text-foreground">No students found</h3>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {hasActiveFilters
                            ? "No students match your active search terms or filter selections. Try clearing your filters."
                            : "No students have been admitted yet. Click 'Add student' to get started."}
                        </p>
                        {hasActiveFilters && (
                          <Button
                            variant="link"
                            size="sm"
                            className="mt-3 text-brand hover:text-brand/80"
                            onClick={() => {
                              setQuery("");
                              setClassFilter("all");
                              setStatusFilter("all");
                            }}
                          >
                            Clear all filters
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Admit Student Dialog */}
      <Dialog open={modalOpen} onOpenChange={(open) => {
        setModalOpen(open);
        if (!open) {
          setStep(1);
          stopCamera();
          setCameraOpen(false);
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Admit New Student</DialogTitle>
              <DialogDescription>
                Progress through the steps to register a new student, upload their photo, and assign guardians.
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
                      step === s.num
                        ? "bg-brand text-white"
                        : step > s.num
                          ? "bg-success/20 text-success border border-success/30"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step > s.num ? "✓" : s.num}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      step === s.num ? "text-foreground" : "text-muted-foreground"
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
              {step === 1 && (
                <div className="space-y-4">
                  {/* Photo Upload */}
                  <div className="flex flex-col items-center justify-center gap-2 pb-2">
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-border bg-muted/20 overflow-hidden">
                      {avatarPreview ? (
                        <img src={avatarPreview} className="h-full w-full object-cover" />
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
                          onChange={handleAvatarChange}
                          className="hidden"
                        />
                      </label>
                      <span className="text-muted-foreground/30 text-xs">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          setCameraOpen(true);
                          startCamera();
                        }}
                        className="text-xs font-semibold text-brand hover:underline"
                      >
                        Camera
                      </button>
                      {avatarPreview && (
                        <>
                          <span className="text-muted-foreground/30 text-xs">|</span>
                          <button
                            type="button"
                            onClick={() => {
                              setAvatarPreview("");
                              setAvatarBase64("");
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
                      open={cameraOpen}
                      onOpenChange={(open) => {
                        setCameraOpen(open);
                        if (!open) stopCamera();
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
                            {cameraStream ? (
                              <video
                                ref={videoRef}
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
                                stopCamera();
                                setCameraOpen(false);
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              onClick={capturePhoto}
                              disabled={!cameraStream}
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
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                        placeholder="e.g. John"
                        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">Last Name *</label>
                      <input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        required
                        placeholder="e.g. Doe"
                        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">Gender *</label>
                      <select
                        value={gender}
                        onChange={(e) => setGender(e.target.value as "M" | "F")}
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
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        required
                        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                      <label className="text-xs font-medium text-foreground">Classroom Enrolment *</label>
                      <select
                        value={classId}
                        onChange={(e) => setClassId(e.target.value)}
                        required
                        className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring"
                      >
                        <option value="" disabled>
                          Select Classroom
                        </option>
                        {classrooms.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">Fees effective from</label>
                    <select
                      value={feeEffectiveTermId}
                      onChange={(e) => setFeeEffectiveTermId(e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring"
                    >
                      <option value="">Use current or next term</option>
                      {activeYear?.terms
                        .filter((term) => term.status !== "CLOSED")
                        .map((term) => (
                          <option key={term.id} value={term.id}>
                            {term.name} · {term.status}
                          </option>
                        ))}
                    </select>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Published fees from earlier terms will not be charged automatically.
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 2: Contacts & Guardians */}
              {step === 2 && (
                <div className="space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-1">
                    Primary Guardian Info
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">Guardian Name *</label>
                      <input
                        value={guardianName}
                        onChange={(e) => setGuardianName(e.target.value)}
                        required
                        placeholder="e.g. Richard Doe"
                        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">Relation *</label>
                      <select
                        value={guardianRelation}
                        onChange={(e) => setGuardianRelation(e.target.value)}
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
                        value={guardianPhone}
                        onChange={(e) => setGuardianPhone(e.target.value)}
                        required
                        placeholder="+233..."
                        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">Email Address</label>
                      <input
                        type="email"
                        value={guardianEmail}
                        onChange={(e) => setGuardianEmail(e.target.value)}
                        placeholder="parent@example.com"
                        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                      />
                    </div>
                  </div>

                  {/* Secondary Guardian Toggle */}
                  <div className="pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground">
                      <input
                        type="checkbox"
                        checked={hasSecondaryGuardian}
                        onChange={(e) => setHasSecondaryGuardian(e.target.checked)}
                        className="rounded border-input text-brand focus:ring-ring h-4 w-4"
                      />
                      <span>Add Secondary Guardian</span>
                    </label>
                  </div>

                  {hasSecondaryGuardian && (
                    <div className="space-y-4 border border-dashed border-border/80 rounded-lg p-3 bg-muted/5 animate-in fade-in-50 duration-200">
                      <h5 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Secondary Guardian Details
                      </h5>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-foreground">Guardian Name *</label>
                          <input
                            value={guardian2Name}
                            onChange={(e) => setGuardian2Name(e.target.value)}
                            required={hasSecondaryGuardian}
                            placeholder="e.g. Mary Doe"
                            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-foreground">Relation *</label>
                          <select
                            value={guardian2Relation}
                            onChange={(e) => setGuardian2Relation(e.target.value)}
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
                            value={guardian2Phone}
                            onChange={(e) => setGuardian2Phone(e.target.value)}
                            required={hasSecondaryGuardian}
                            placeholder="+233..."
                            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-foreground">Email Address</label>
                          <input
                            type="email"
                            value={guardian2Email}
                            onChange={(e) => setGuardian2Email(e.target.value)}
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
                        checked={hasEmergencyContact}
                        onChange={(e) => setHasEmergencyContact(e.target.checked)}
                        className="rounded border-input text-brand focus:ring-ring h-4 w-4"
                      />
                      <span>Emergency Contact is different from primary guardian</span>
                    </label>
                  </div>

                  {hasEmergencyContact && (
                    <div className="space-y-4 border border-dashed border-border/80 rounded-lg p-3 bg-muted/5 animate-in fade-in-50 duration-200">
                      <h5 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Emergency Contact Details
                      </h5>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2 col-span-2">
                          <label className="text-xs font-medium text-foreground">Full Name *</label>
                          <input
                            value={emergencyName}
                            onChange={(e) => setEmergencyName(e.target.value)}
                            required={hasEmergencyContact}
                            placeholder="e.g. Uncle Steve"
                            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-foreground">Relation *</label>
                          <input
                            value={emergencyRelation}
                            onChange={(e) => setEmergencyRelation(e.target.value)}
                            required={hasEmergencyContact}
                            placeholder="e.g. Uncle"
                            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-foreground">Phone Number *</label>
                        <input
                          value={emergencyPhone}
                          onChange={(e) => setEmergencyPhone(e.target.value)}
                          required={hasEmergencyContact}
                          placeholder="+233..."
                          className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: Medical & Additional Info */}
              {step === 3 && (
                <div className="space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-1">
                    Medical Info
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">Blood Group</label>
                      <select
                        value={bloodGroup}
                        onChange={(e) => setBloodGroup(e.target.value)}
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
                        value={boardingStatus}
                        onChange={(e) => setBoardingStatus(e.target.value)}
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
                      value={allergies}
                      onChange={(e) => setAllergies(e.target.value)}
                      placeholder="e.g. Penicillin allergy, peanut allergy, asthma"
                      rows={1.5}
                      className="w-full rounded-md border border-input bg-card p-3 text-sm outline-none focus:border-ring"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">Medical Notes</label>
                    <textarea
                      value={medicalNotes}
                      onChange={(e) => setMedicalNotes(e.target.value)}
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
                      value={previousSchool}
                      onChange={(e) => setPreviousSchool(e.target.value)}
                      placeholder="Name of previous school"
                      className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">Residential Address *</label>
                    <textarea
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
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
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep((s) => s - 1)}
                  disabled={createStudentMutation.isPending}
                >
                  Back
                </Button>
              )}
              
              <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} className="mr-auto text-muted-foreground">
                Cancel
              </Button>

              {step < 3 ? (
                <Button
                  key="next-btn"
                  type="button"
                  onClick={() => {
                    if (step === 1) {
                      if (!firstName || !lastName || !dob || !classId) {
                        toast.error("Please fill in all required profile fields (*)");
                        return;
                      }
                    } else if (step === 2) {
                      if (!guardianName || !guardianPhone) {
                        toast.error("Please fill in primary guardian contacts (*)");
                        return;
                      }
                      if (hasSecondaryGuardian && (!guardian2Name || !guardian2Phone)) {
                        toast.error("Please fill in secondary guardian details");
                        return;
                      }
                      if (hasEmergencyContact && (!emergencyName || !emergencyPhone)) {
                        toast.error("Please fill in emergency contact details");
                        return;
                      }
                    }
                    setStep((s) => s + 1);
                  }}
                >
                  Next
                </Button>
              ) : (
                <Button
                  key="submit-btn"
                  type="submit"
                  disabled={createStudentMutation.isPending}
                >
                  {createStudentMutation.isPending ? "Admitting..." : "Admit Student"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-success/15 text-success-foreground border-success/30 dark:bg-success/10 dark:text-success",
    repeating: "bg-warning/15 text-warning-foreground border-warning/30 dark:bg-warning/10 dark:text-warning",
    withdrawn: "bg-destructive/15 text-destructive border-destructive/30 dark:bg-destructive/10 dark:text-destructive-foreground",
    graduated: "bg-brand/10 text-brand border-brand/20 dark:bg-brand-accent/15 dark:text-brand-accent",
    transferred: "bg-muted text-muted-foreground border-border dark:bg-muted/40 dark:text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={`capitalize ${map[status] || ""}`}>
      {status}
    </Badge>
  );
}
