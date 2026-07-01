import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  GraduationCap,
  HeartPulse,
  MapPin,
  Pencil,
  Phone,
  School,
  UserRound,
  UsersRound,
} from "lucide-react";
import { BeneficiaryFormDialog } from "@/components/ngo/BeneficiaryFormDialog";
import { Forbidden } from "@/components/layout/Forbidden";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { ngoApi, type ApiBeneficiary } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/ngo_/beneficiaries/$beneficiaryId")({
  head: () => ({ meta: [{ title: "Beneficiary Profile — Lumen Suite" }] }),
  component: BeneficiaryProfilePage,
});

const dateFormatter = new Intl.DateTimeFormat("en-GH", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function formatDate(value: string | null | undefined) {
  return value ? dateFormatter.format(new Date(`${value}T00:00:00`)) : "—";
}

function avatarSource(value: string | null) {
  if (!value) return "";
  if (value.startsWith("data:") || value.startsWith("http")) return value;
  const base = import.meta.env.VITE_API_URL || "http://localhost:4000";
  return `${base}${value.startsWith("/") ? value : `/${value}`}`;
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function BeneficiaryProfilePage() {
  const { beneficiaryId } = Route.useParams();
  const { user } = useAuth();
  const canView = hasPermission(user, "ngo.beneficiaries.view");
  const canManage = hasPermission(user, "ngo.beneficiaries.manage");
  const [editOpen, setEditOpen] = useState(false);
  const beneficiaryQuery = useQuery({
    queryKey: ["ngo-beneficiary", beneficiaryId],
    queryFn: () => ngoApi.getBeneficiary(beneficiaryId).then((result) => result.beneficiary),
    enabled: canView,
  });

  if (!canView) return <Forbidden />;
  if (beneficiaryQuery.isLoading) {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground">Loading child profile…</div>
    );
  }
  if (beneficiaryQuery.isError || !beneficiaryQuery.data) {
    return (
      <div className="space-y-4 p-8 text-center">
        <p className="text-sm text-destructive">
          {(beneficiaryQuery.error as Error)?.message || "Beneficiary not found"}
        </p>
        <Button asChild variant="outline">
          <Link to="/ngo/beneficiaries">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to beneficiaries
          </Link>
        </Button>
      </div>
    );
  }

  const beneficiary = beneficiaryQuery.data;
  const currentCentre = beneficiary.currentPlacement?.careCentre;

  return (
    <div className="space-y-6">
      <PageHeader
        title={beneficiary.fullName}
        description={`Beneficiary ${beneficiary.beneficiaryNo} · Complete NGO child dossier`}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/ngo/beneficiaries">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
              </Link>
            </Button>
            {canManage ? (
              <Button size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-1.5 h-4 w-4" /> Edit record
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="h-24 bg-gradient-to-br from-brand/25 via-brand/10 to-transparent" />
            <CardContent className="-mt-14 pb-6 text-center">
              <div className="mx-auto grid h-28 w-28 place-items-center overflow-hidden rounded-2xl border-4 border-card bg-muted text-muted-foreground shadow-sm">
                {beneficiary.avatarUrl ? (
                  <img
                    src={avatarSource(beneficiary.avatarUrl)}
                    alt={beneficiary.fullName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <UserRound className="h-12 w-12" />
                )}
              </div>
              <h2 className="mt-4 text-xl font-semibold">{beneficiary.fullName}</h2>
              <div className="mt-1 font-mono text-xs text-muted-foreground">
                {beneficiary.beneficiaryNo}
              </div>
              <Badge
                className="mt-3"
                variant={beneficiary.status === "ACTIVE" ? "default" : "secondary"}
              >
                {beneficiary.status === "ACTIVE" ? "Active in care" : humanize(beneficiary.status)}
              </Badge>
              <div className="mt-5 space-y-3 border-t pt-4 text-left text-sm">
                <IconLine
                  icon={CalendarDays}
                  label="Admitted"
                  value={formatDate(beneficiary.admissionDate)}
                />
                <IconLine
                  icon={Building2}
                  label="Current centre"
                  value={currentCentre?.name ?? "No active placement"}
                />
                <IconLine
                  icon={GraduationCap}
                  label="Education"
                  value={beneficiary.currentEducationLevel ?? "Not recorded"}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current placement</CardTitle>
            </CardHeader>
            <CardContent>
              {beneficiary.currentPlacement ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <MapPin className="h-4 w-4 text-brand" />{" "}
                    {beneficiary.currentPlacement.careCentre.name}
                  </div>
                  <div className="text-muted-foreground">
                    Since {formatDate(beneficiary.currentPlacement.startDate)}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {beneficiary.currentPlacement.careCentre.code}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This child has no active centre placement.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identity & background</CardTitle>
              <CardDescription>
                Admission and referral context for this care record.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Full name" value={beneficiary.fullName} />
              <Detail label="Date of birth" value={formatDate(beneficiary.dateOfBirth)} />
              <Detail label="Gender" value={humanize(beneficiary.gender)} />
              <Detail label="Admission date" value={formatDate(beneficiary.admissionDate)} />
              <Detail label="Source / referral" value={beneficiary.referralSource} />
              <Detail label="Special ID" value={beneficiary.beneficiaryNo} mono />
              <Detail
                label="Background summary"
                value={beneficiary.backgroundSummary}
                className="sm:col-span-2 lg:col-span-3"
                preserve
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <School className="h-4 w-4 text-brand" /> Education
              </CardTitle>
              <CardDescription>
                Education at admission and the child’s current school situation.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Level at admission" value={beneficiary.educationLevelAtAdmission} />
              <Detail label="Current level" value={beneficiary.currentEducationLevel} />
              <Detail label="School" value={beneficiary.schoolName} />
              {beneficiary.linkedStudent ? (
                <div className="rounded-lg border bg-brand/5 p-4 sm:col-span-2 lg:col-span-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">Linked school student record</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {beneficiary.linkedStudent.admissionNo}
                        {beneficiary.linkedStudent.currentClass
                          ? ` · ${beneficiary.linkedStudent.currentClass.gradeLevel} (${beneficiary.linkedStudent.currentClass.section}) · ${beneficiary.linkedStudent.currentClass.academicYear}`
                          : " · No active class enrolment"}
                      </div>
                    </div>
                    {hasPermission(user, "students.view") ? (
                      <Button asChild variant="outline" size="sm">
                        <Link
                          to="/students/$studentId"
                          params={{ studentId: beneficiary.linkedStudent.id }}
                        >
                          Open student profile
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
                  Not linked to a student in the school module.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HeartPulse className="h-4 w-4 text-brand" /> Health & care needs
              </CardTitle>
              <CardDescription>Information care staff need for daily support.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <Detail label="Health status" value={beneficiary.healthStatus} />
              <Detail label="Special needs" value={beneficiary.specialNeeds} />
              <Detail
                label="Health additional notes"
                value={beneficiary.healthNotes}
                className="sm:col-span-2"
                preserve
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UsersRound className="h-4 w-4 text-brand" /> Guardians & contacts
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {beneficiary.guardians.map((guardian, index) => (
                <div key={guardian.id ?? index} className="rounded-xl border p-4">
                  <div className="font-medium">{guardian.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {guardian.relationship} · Guardian {index + 1}
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />{" "}
                      {guardian.primaryPhone}
                    </div>
                    {guardian.secondaryPhone ? (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />{" "}
                        {guardian.secondaryPhone}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {beneficiary.status !== "ACTIVE" ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Exit / transfer outcome</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <Detail
                  label={beneficiary.status === "TRANSFERRED" ? "Transfer date" : "Exit date"}
                  value={formatDate(beneficiary.exitDate)}
                />
                <Detail label="Reason / destination" value={beneficiary.exitReason} preserve />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Placement history</CardTitle>
            </CardHeader>
            <CardContent>
              {beneficiary.placementHistory.length ? (
                <div className="space-y-0">
                  {beneficiary.placementHistory.map((placement, index) => (
                    <div key={placement.id} className="relative flex gap-4 pb-5 last:pb-0">
                      {index < beneficiary.placementHistory.length - 1 ? (
                        <div className="absolute left-[7px] top-5 h-[calc(100%-12px)] w-px bg-border" />
                      ) : null}
                      <div
                        className={`mt-1 h-4 w-4 shrink-0 rounded-full border-4 ${placement.active ? "border-brand bg-brand" : "border-muted-foreground/40 bg-card"}`}
                      />
                      <div>
                        <div className="font-medium">{placement.careCentre.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatDate(placement.startDate)} —{" "}
                          {placement.active ? "Present" : formatDate(placement.endDate)}
                        </div>
                        {placement.endReason ? (
                          <div className="mt-1 text-sm text-muted-foreground">
                            {placement.endReason}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No placement history recorded.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes & remarks</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Detail label="Additional notes" value={beneficiary.additionalNotes} preserve />
              <Detail label="Remarks" value={beneficiary.remarks} preserve />
            </CardContent>
          </Card>
        </div>
      </div>

      {canManage ? (
        <BeneficiaryFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          beneficiary={beneficiary}
        />
      ) : null}
    </div>
  );
}

function IconLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-0.5 font-medium">{value}</div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  className,
  mono,
  preserve,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
  mono?: boolean;
  preserve?: boolean;
}) {
  return (
    <div className={className}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1.5 text-sm ${mono ? "font-mono" : ""} ${preserve ? "whitespace-pre-wrap leading-6" : ""}`}
      >
        {value || "—"}
      </div>
    </div>
  );
}
