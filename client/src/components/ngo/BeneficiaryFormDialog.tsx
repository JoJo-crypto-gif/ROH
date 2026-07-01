import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronsUpDown,
  ImagePlus,
  Link2,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  ngoApi,
  type ApiBeneficiary,
  type ApiBeneficiaryGuardian,
  type BeneficiaryInput,
} from "@/lib/api";

type GuardianForm = Omit<ApiBeneficiaryGuardian, "id" | "sequence">;

interface BeneficiaryForm {
  beneficiaryNo: string;
  fullName: string;
  dateOfBirth: string;
  gender: ApiBeneficiary["gender"];
  admissionDate: string;
  careCentreId: string;
  referralSource: string;
  backgroundSummary: string;
  status: ApiBeneficiary["status"];
  educationLevelAtAdmission: string;
  currentEducationLevel: string;
  schoolName: string;
  studentId: string;
  healthStatus: string;
  healthNotes: string;
  specialNeeds: string;
  exitDate: string;
  exitReason: string;
  additionalNotes: string;
  remarks: string;
  avatarUrl: string;
  avatarBase64: string;
  guardians: GuardianForm[];
}

const emptyGuardian = (): GuardianForm => ({
  name: "",
  primaryPhone: "",
  secondaryPhone: null,
  relationship: "",
});

const emptyForm = (): BeneficiaryForm => ({
  beneficiaryNo: "",
  fullName: "",
  dateOfBirth: "",
  gender: "MALE",
  admissionDate: new Date().toISOString().slice(0, 10),
  careCentreId: "",
  referralSource: "",
  backgroundSummary: "",
  status: "ACTIVE",
  educationLevelAtAdmission: "",
  currentEducationLevel: "",
  schoolName: "",
  studentId: "",
  healthStatus: "No known condition",
  healthNotes: "",
  specialNeeds: "",
  exitDate: "",
  exitReason: "",
  additionalNotes: "",
  remarks: "",
  avatarUrl: "",
  avatarBase64: "",
  guardians: [emptyGuardian()],
});

const formSteps = [
  { title: "Identity", description: "Photo, identity and admission" },
  { title: "Care & education", description: "School link, health and needs" },
  { title: "Guardians", description: "Family and emergency contacts" },
  { title: "Notes & review", description: "Exit details and internal notes" },
] as const;

function formFromBeneficiary(beneficiary: ApiBeneficiary): BeneficiaryForm {
  return {
    beneficiaryNo: beneficiary.beneficiaryNo,
    fullName: beneficiary.fullName,
    dateOfBirth: beneficiary.dateOfBirth,
    gender: beneficiary.gender,
    admissionDate: beneficiary.admissionDate,
    careCentreId:
      beneficiary.currentPlacement?.careCentre.id ??
      beneficiary.placementHistory[0]?.careCentre.id ??
      "",
    referralSource: beneficiary.referralSource,
    backgroundSummary: beneficiary.backgroundSummary ?? "",
    status: beneficiary.status,
    educationLevelAtAdmission: beneficiary.educationLevelAtAdmission ?? "",
    currentEducationLevel: beneficiary.currentEducationLevel ?? "",
    schoolName: beneficiary.schoolName ?? "",
    studentId: beneficiary.studentId ?? "",
    healthStatus: beneficiary.healthStatus,
    healthNotes: beneficiary.healthNotes ?? "",
    specialNeeds: beneficiary.specialNeeds ?? "",
    exitDate: beneficiary.exitDate ?? "",
    exitReason: beneficiary.exitReason ?? "",
    additionalNotes: beneficiary.additionalNotes ?? "",
    remarks: beneficiary.remarks ?? "",
    avatarUrl: beneficiary.avatarUrl ?? "",
    avatarBase64: "",
    guardians: beneficiary.guardians.map((guardian) => ({
      name: guardian.name,
      primaryPhone: guardian.primaryPhone,
      secondaryPhone: guardian.secondaryPhone,
      relationship: guardian.relationship,
    })),
  };
}

function avatarSource(value: string) {
  if (!value) return "";
  if (value.startsWith("data:") || value.startsWith("http")) return value;
  const base = import.meta.env.VITE_API_URL || "http://localhost:4000";
  return `${base}${value.startsWith("/") ? value : `/${value}`}`;
}

export function BeneficiaryFormDialog({
  open,
  onOpenChange,
  beneficiary,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beneficiary?: ApiBeneficiary | null;
  onSaved?: (beneficiary: ApiBeneficiary) => void;
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<BeneficiaryForm>(emptyForm);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) {
      setForm(beneficiary ? formFromBeneficiary(beneficiary) : emptyForm());
      setStudentPickerOpen(false);
      setStep(0);
    }
  }, [beneficiary, open]);

  const optionsQuery = useQuery({
    queryKey: ["ngo-beneficiary-options"],
    queryFn: ngoApi.getBeneficiaryOptions,
    enabled: open,
  });

  const currentHistoricCentre = beneficiary?.placementHistory.find(
    (placement) => placement.careCentre.id === form.careCentreId,
  )?.careCentre;
  const centres = useMemo(() => {
    const available = optionsQuery.data?.centres ?? [];
    if (
      currentHistoricCentre &&
      !available.some((centre) => centre.id === currentHistoricCentre.id)
    ) {
      return [
        ...available,
        {
          id: currentHistoricCentre.id,
          code: currentHistoricCentre.code,
          name: `${currentHistoricCentre.name} (inactive)`,
          capacity: 0,
          currentOccupancy: 0,
        },
      ];
    }
    return available;
  }, [currentHistoricCentre, optionsQuery.data?.centres]);

  const payload = (): BeneficiaryInput => ({
    beneficiaryNo: form.beneficiaryNo.trim(),
    fullName: form.fullName.trim(),
    dateOfBirth: form.dateOfBirth,
    gender: form.gender,
    admissionDate: form.admissionDate,
    careCentreId: form.careCentreId,
    referralSource: form.referralSource.trim(),
    backgroundSummary: form.backgroundSummary.trim() || null,
    status: form.status,
    educationLevelAtAdmission: form.educationLevelAtAdmission.trim() || null,
    currentEducationLevel: form.currentEducationLevel.trim() || null,
    schoolName: form.schoolName.trim() || null,
    studentId: form.studentId || null,
    healthStatus: form.healthStatus.trim(),
    healthNotes: form.healthNotes.trim() || null,
    specialNeeds: form.specialNeeds.trim() || null,
    exitDate: form.status === "ACTIVE" ? null : form.exitDate || null,
    exitReason: form.status === "ACTIVE" ? null : form.exitReason.trim() || null,
    additionalNotes: form.additionalNotes.trim() || null,
    remarks: form.remarks.trim() || null,
    avatarUrl: form.avatarUrl || null,
    avatarBase64: form.avatarBase64 || undefined,
    guardians: form.guardians.map((guardian) => ({
      name: guardian.name.trim(),
      primaryPhone: guardian.primaryPhone.trim(),
      secondaryPhone: guardian.secondaryPhone?.trim() || null,
      relationship: guardian.relationship.trim(),
    })),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      beneficiary
        ? ngoApi.updateBeneficiary(beneficiary.id, payload())
        : ngoApi.createBeneficiary(payload()),
    onSuccess: async ({ beneficiary: saved }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ngo-beneficiaries"] }),
        queryClient.invalidateQueries({ queryKey: ["ngo-beneficiary", saved.id] }),
        queryClient.invalidateQueries({ queryKey: ["ngo-beneficiary-options"] }),
        queryClient.invalidateQueries({ queryKey: ["ngo-centres"] }),
        queryClient.invalidateQueries({ queryKey: ["ngo-overview"] }),
      ]);
      toast.success(beneficiary ? "Beneficiary record updated" : "Beneficiary registered");
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = <K extends keyof BeneficiaryForm>(key: K, value: BeneficiaryForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const updateGuardian = (index: number, key: keyof GuardianForm, value: string) => {
    setForm((current) => ({
      ...current,
      guardians: current.guardians.map((guardian, guardianIndex) =>
        guardianIndex === index ? { ...guardian, [key]: value || null } : guardian,
      ),
    }));
  };

  const chooseStudent = (studentId: string) => {
    const student = optionsQuery.data?.students.find((item) => item.id === studentId);
    if (!student) {
      update("studentId", "");
      return;
    }
    setForm((current) => ({
      ...current,
      studentId,
      fullName: student.fullName,
      dateOfBirth: student.dateOfBirth,
      gender: student.gender === "F" || student.gender === "FEMALE" ? "FEMALE" : "MALE",
      currentEducationLevel: student.currentEducationLevel ?? current.currentEducationLevel,
      schoolName: student.schoolName,
    }));
  };

  const handlePhoto = (file?: File) => {
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      toast.error("Use a JPG, PNG or WebP image");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Profile picture must be smaller than 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setForm((current) => ({
        ...current,
        avatarBase64: dataUrl.split(",")[1] ?? "",
        avatarUrl: dataUrl,
      }));
    };
    reader.readAsDataURL(file);
  };

  const identityValid =
    form.beneficiaryNo.trim().length >= 2 &&
    form.fullName.trim().length >= 2 &&
    Boolean(form.dateOfBirth) &&
    Boolean(form.admissionDate) &&
    Boolean(form.careCentreId) &&
    form.referralSource.trim().length >= 2;
  const careValid = form.healthStatus.trim().length >= 2;
  const guardiansValid =
    form.guardians.length >= 1 &&
    form.guardians.every(
      (guardian) =>
        guardian.name.trim().length >= 2 &&
        guardian.primaryPhone.trim().length >= 3 &&
        guardian.relationship.trim().length >= 2,
    );
  const reviewValid =
    form.status === "ACTIVE" || (Boolean(form.exitDate) && form.exitReason.trim().length >= 2);
  const valid = identityValid && careValid && guardiansValid && reviewValid;
  const currentStepValid = [identityValid, careValid, guardiansValid, reviewValid][step];

  const students = optionsQuery.data?.students ?? [];
  const selectedStudent = students.find((student) => student.id === form.studentId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col overflow-hidden p-0">
        <DialogHeader>
          <div className="px-6 pt-6">
            <DialogTitle>
              {beneficiary ? "Edit beneficiary record" : "Register beneficiary"}
            </DialogTitle>
            <DialogDescription>
              Keep the child’s identity, care placement, education, health and guardian information
              together.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="border-y bg-muted/20 px-6 py-4">
          <ol className="grid gap-2 sm:grid-cols-4">
            {formSteps.map((item, index) => (
              <li key={item.title}>
                <button
                  type="button"
                  onClick={() => setStep(index)}
                  aria-current={step === index ? "step" : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                    step === index ? "bg-background shadow-sm" : "hover:bg-background/60"
                  }`}
                >
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                      step === index
                        ? "bg-brand text-white"
                        : index < step
                          ? "bg-brand/15 text-brand"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="hidden truncate text-[11px] text-muted-foreground lg:block">
                      {item.description}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 py-5">
          {step === 0 ? (
            <section className="grid gap-5 md:grid-cols-[150px_1fr]">
              <div>
                <SectionTitle title="Profile picture" description="A clear, recent photo." />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="mt-3 grid h-32 w-32 place-items-center overflow-hidden rounded-2xl border-2 border-dashed bg-muted/30 text-muted-foreground hover:border-brand/60"
                >
                  {form.avatarUrl ? (
                    <img
                      src={avatarSource(form.avatarUrl)}
                      alt="Beneficiary preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex flex-col items-center gap-2 text-xs">
                      <Camera className="h-7 w-7" /> Add photo
                    </span>
                  )}
                </button>
                <div className="mt-3 grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => cameraRef.current?.click()}
                  >
                    <Camera className="h-4 w-4" /> Take photo
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                  >
                    <ImagePlus className="h-4 w-4" /> Choose photo
                  </Button>
                </div>
                <input
                  ref={fileRef}
                  className="hidden"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    handlePhoto(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <input
                  ref={cameraRef}
                  className="hidden"
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={(event) => {
                    handlePhoto(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </div>

              <div className="space-y-4">
                <SectionTitle
                  title="Identity & admission"
                  description="The special ID remains the primary NGO identifier."
                />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Special beneficiary ID" required>
                    <Input
                      value={form.beneficiaryNo}
                      onChange={(event) => update("beneficiaryNo", event.target.value)}
                      placeholder="e.g. ROH-BEN-001"
                    />
                  </Field>
                  <Field label="Full name" required className="sm:col-span-2">
                    <Input
                      value={form.fullName}
                      onChange={(event) => update("fullName", event.target.value)}
                    />
                  </Field>
                  <Field label="Date of birth" required>
                    <Input
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      value={form.dateOfBirth}
                      onChange={(event) => update("dateOfBirth", event.target.value)}
                    />
                  </Field>
                  <Field label="Gender" required>
                    <select
                      className={selectClass}
                      value={form.gender}
                      onChange={(event) =>
                        update("gender", event.target.value as ApiBeneficiary["gender"])
                      }
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                    </select>
                  </Field>
                  <Field label="Admission date" required>
                    <Input
                      type="date"
                      value={form.admissionDate}
                      onChange={(event) => update("admissionDate", event.target.value)}
                    />
                  </Field>
                  <Field label="Care centre" required>
                    <select
                      className={selectClass}
                      value={form.careCentreId}
                      onChange={(event) => update("careCentreId", event.target.value)}
                    >
                      <option value="">Select centre</option>
                      {centres.map((centre) => (
                        <option
                          key={centre.id}
                          value={centre.id}
                          disabled={
                            centre.capacity > 0 &&
                            centre.currentOccupancy >= centre.capacity &&
                            centre.id !== beneficiary?.currentPlacement?.careCentre.id
                          }
                        >
                          {centre.name} ({centre.currentOccupancy}/{centre.capacity || "—"})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Source / referral" required className="sm:col-span-2">
                    <Input
                      value={form.referralSource}
                      onChange={(event) => update("referralSource", event.target.value)}
                      placeholder="Who or which agency referred the child?"
                    />
                  </Field>
                  <Field label="Status" required>
                    <select
                      className={selectClass}
                      value={form.status}
                      onChange={(event) =>
                        update("status", event.target.value as ApiBeneficiary["status"])
                      }
                    >
                      <option value="ACTIVE">Active in care</option>
                      <option value="EXITED">Exited</option>
                      <option value="TRANSFERRED">Transferred</option>
                    </select>
                  </Field>
                  <Field label="Background summary" className="sm:col-span-2 lg:col-span-3">
                    <Textarea
                      rows={4}
                      value={form.backgroundSummary}
                      onChange={(event) => update("backgroundSummary", event.target.value)}
                      placeholder="Relevant history and care context…"
                    />
                  </Field>
                </div>
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <div className="space-y-7">
              <Section
                title="Education & school link"
                description="Link to the school record when this child is also enrolled in the school."
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Linked school student" className="sm:col-span-2 lg:col-span-3">
                    <Popover open={studentPickerOpen} onOpenChange={setStudentPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={studentPickerOpen}
                          className="w-full justify-between px-3 font-normal"
                          disabled={optionsQuery.isLoading}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">
                              {optionsQuery.isLoading
                                ? "Loading school students…"
                                : selectedStudent
                                  ? `${selectedStudent.fullName} · ${selectedStudent.admissionNo}`
                                  : "Search and select a school student"}
                            </span>
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-[var(--radix-popover-trigger-width)] p-0"
                      >
                        <Command>
                          <CommandInput placeholder="Search name or admission number…" />
                          <CommandList>
                            <CommandEmpty>No school student found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="not-linked clear school student"
                                onSelect={() => {
                                  chooseStudent("");
                                  setStudentPickerOpen(false);
                                }}
                              >
                                <Check
                                  className={`h-4 w-4 ${form.studentId ? "opacity-0" : "opacity-100"}`}
                                />
                                <div>
                                  <div>Not linked to a school student</div>
                                  <div className="text-xs text-muted-foreground">
                                    Keep this as an NGO-only child record
                                  </div>
                                </div>
                              </CommandItem>
                              {students.map((student) => {
                                const linkedElsewhere = Boolean(
                                  student.linkedBeneficiaryId &&
                                  student.linkedBeneficiaryId !== beneficiary?.id,
                                );
                                return (
                                  <CommandItem
                                    key={student.id}
                                    value={`${student.fullName} ${student.admissionNo} ${student.currentClass ?? ""}`}
                                    disabled={linkedElsewhere}
                                    onSelect={() => {
                                      chooseStudent(student.id);
                                      setStudentPickerOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={`h-4 w-4 ${form.studentId === student.id ? "opacity-100" : "opacity-0"}`}
                                    />
                                    <div className="min-w-0">
                                      <div className="truncate font-medium">{student.fullName}</div>
                                      <div className="truncate text-xs text-muted-foreground">
                                        {student.admissionNo}
                                        {student.currentClass ? ` · ${student.currentClass}` : ""}
                                        {linkedElsewhere ? " · Already linked" : ""}
                                      </div>
                                    </div>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </Field>
                  <Field label="Education level at admission">
                    <Input
                      value={form.educationLevelAtAdmission}
                      onChange={(event) => update("educationLevelAtAdmission", event.target.value)}
                      placeholder="e.g. Class 3"
                    />
                  </Field>
                  <Field label="Current education level">
                    <Input
                      value={form.currentEducationLevel}
                      onChange={(event) => update("currentEducationLevel", event.target.value)}
                    />
                  </Field>
                  <Field label="School name">
                    <Input
                      value={form.schoolName}
                      onChange={(event) => update("schoolName", event.target.value)}
                    />
                  </Field>
                </div>
              </Section>

              <Section
                title="Health & care needs"
                description="Record what care staff need to know; add detail where it affects daily support."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Health status" required>
                    <Input
                      value={form.healthStatus}
                      onChange={(event) => update("healthStatus", event.target.value)}
                      placeholder="e.g. Good / condition under treatment"
                    />
                  </Field>
                  <Field label="Special needs">
                    <Input
                      value={form.specialNeeds}
                      onChange={(event) => update("specialNeeds", event.target.value)}
                      placeholder="Mobility, learning, dietary or care needs"
                    />
                  </Field>
                  <Field label="Health additional notes" className="sm:col-span-2">
                    <Textarea
                      rows={3}
                      value={form.healthNotes}
                      onChange={(event) => update("healthNotes", event.target.value)}
                    />
                  </Field>
                </div>
              </Section>
            </div>
          ) : null}

          {step === 2 ? (
            <Section
              title="Guardians & family contacts"
              description="At least one contact is required. A second number and second guardian are optional."
            >
              <div className="space-y-4">
                {form.guardians.map((guardian, index) => (
                  <div key={index} className="rounded-xl border bg-muted/15 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 font-medium">
                        <UserRound className="h-4 w-4 text-brand" /> Guardian {index + 1}
                      </div>
                      {index > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() =>
                            update(
                              "guardians",
                              form.guardians.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                        >
                          <Trash2 className="mr-1.5 h-4 w-4" /> Remove
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Field label="Full name" required>
                        <Input
                          value={guardian.name}
                          onChange={(event) => updateGuardian(index, "name", event.target.value)}
                        />
                      </Field>
                      <Field label="Primary contact" required>
                        <Input
                          value={guardian.primaryPhone}
                          onChange={(event) =>
                            updateGuardian(index, "primaryPhone", event.target.value)
                          }
                        />
                      </Field>
                      <Field label="Second contact">
                        <Input
                          value={guardian.secondaryPhone ?? ""}
                          onChange={(event) =>
                            updateGuardian(index, "secondaryPhone", event.target.value)
                          }
                        />
                      </Field>
                      <Field label="Relationship" required>
                        <Input
                          value={guardian.relationship}
                          onChange={(event) =>
                            updateGuardian(index, "relationship", event.target.value)
                          }
                          placeholder="e.g. Aunt"
                        />
                      </Field>
                    </div>
                  </div>
                ))}
                {form.guardians.length < 2 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => update("guardians", [...form.guardians, emptyGuardian()])}
                  >
                    <Plus className="mr-1.5 h-4 w-4" /> Add second guardian
                  </Button>
                ) : null}
              </div>
            </Section>
          ) : null}

          {step === 3 ? (
            <div className="space-y-7">
              {form.status !== "ACTIVE" ? (
                <Section
                  title="Exit / transfer"
                  description="Changing the status ends the current centre placement but preserves the complete history."
                >
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field
                      label={form.status === "TRANSFERRED" ? "Transfer date" : "Exit date"}
                      required
                    >
                      <Input
                        type="date"
                        min={form.admissionDate}
                        value={form.exitDate}
                        onChange={(event) => update("exitDate", event.target.value)}
                      />
                    </Field>
                    <Field
                      label={
                        form.status === "TRANSFERRED"
                          ? "Transfer reason / destination"
                          : "Exit reason"
                      }
                      required
                      className="sm:col-span-2"
                    >
                      <Textarea
                        rows={2}
                        value={form.exitReason}
                        onChange={(event) => update("exitReason", event.target.value)}
                      />
                    </Field>
                  </div>
                </Section>
              ) : null}

              <Section
                title="Internal notes"
                description="Additional context and staff remarks remain on the child’s NGO record."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Additional notes">
                    <Textarea
                      rows={4}
                      value={form.additionalNotes}
                      onChange={(event) => update("additionalNotes", event.target.value)}
                    />
                  </Field>
                  <Field label="Remarks">
                    <Textarea
                      rows={4}
                      value={form.remarks}
                      onChange={(event) => update("remarks", event.target.value)}
                    />
                  </Field>
                </div>
              </Section>
              <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                <div className="font-medium">Ready to save?</div>
                <p className="mt-1 text-muted-foreground">
                  Review the previous steps if needed. Saving creates one complete beneficiary
                  record; the school link remains optional.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t bg-background px-6 py-4 sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="h-4 w-4" /> Previous
              </Button>
            ) : null}
            {step < formSteps.length - 1 ? (
              <Button type="button" disabled={!currentStepValid} onClick={() => setStep(step + 1)}>
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                disabled={!valid || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending
                  ? "Saving…"
                  : beneficiary
                    ? "Save changes"
                    : "Register beneficiary"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t pt-6">
      <SectionTitle title={title} description={description} />
      {children}
    </section>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}
