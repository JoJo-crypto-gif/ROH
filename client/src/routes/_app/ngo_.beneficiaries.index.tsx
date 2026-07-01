import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, GraduationCap, HeartHandshake, Plus, Search, UserRound } from "lucide-react";
import { BeneficiaryFormDialog } from "@/components/ngo/BeneficiaryFormDialog";
import { Forbidden } from "@/components/layout/Forbidden";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ngoApi, type ApiBeneficiary } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/ngo_/beneficiaries/")({
  head: () => ({ meta: [{ title: "Beneficiaries — Lumen Suite" }] }),
  component: BeneficiariesPage,
});

const getAvatarSrc = (url: string | null) => {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("http")) return url;
  const base = import.meta.env.VITE_API_URL || "http://localhost:4000";
  return `${base}${url.startsWith("/") ? url : `/${url}`}`;
};

function ageFromDate(value: string) {
  const birthday = new Date(`${value}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birthday.getFullYear();
  const month = today.getMonth() - birthday.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < birthday.getDate())) age -= 1;
  return age;
}

function statusLabel(status: ApiBeneficiary["status"]) {
  if (status === "ACTIVE") return "Active in care";
  return status === "TRANSFERRED" ? "Transferred" : "Exited";
}

function BeneficiariesPage() {
  const { user } = useAuth();
  const canView = hasPermission(user, "ngo.beneficiaries.view");
  const canManage = hasPermission(user, "ngo.beneficiaries.manage");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | ApiBeneficiary["status"]>("ACTIVE");
  const [centreId, setCentreId] = useState("ALL");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const beneficiariesQuery = useQuery({
    queryKey: ["ngo-beneficiaries", search, status, centreId, page],
    queryFn: () =>
      ngoApi.getBeneficiaries({
        search: search || undefined,
        status: status === "ALL" ? undefined : status,
        careCentreId: centreId === "ALL" ? undefined : centreId,
        page,
        pageSize: 25,
      }),
    enabled: canView,
  });
  const optionsQuery = useQuery({
    queryKey: ["ngo-beneficiary-options"],
    queryFn: ngoApi.getBeneficiaryOptions,
    enabled: canManage,
  });

  useEffect(() => {
    const effectivePage = beneficiariesQuery.data?.pagination.page;
    if (effectivePage && effectivePage !== page) setPage(effectivePage);
  }, [beneficiariesQuery.data?.pagination.page, page]);

  if (!canView) return <Forbidden />;

  const beneficiaries = beneficiariesQuery.data?.beneficiaries ?? [];
  const pagination = beneficiariesQuery.data?.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Beneficiaries"
        description="Complete care records for rescued children, including centre placement, school links, health and guardians."
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Register child
            </Button>
          ) : null
        }
      />

      <div className="rounded-xl border bg-card shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-3 border-b p-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search special ID, name, referral or school"
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring"
            />
          </div>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="ACTIVE">Active in care</option>
            <option value="EXITED">Exited</option>
            <option value="TRANSFERRED">Transferred</option>
            <option value="ALL">All statuses</option>
          </select>
          {canManage ? (
            <select
              value={centreId}
              onChange={(event) => {
                setCentreId(event.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="ALL">All centres</option>
              {(optionsQuery.data?.centres ?? []).map((centre) => (
                <option key={centre.id} value={centre.id}>
                  {centre.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {beneficiariesQuery.isLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Loading beneficiary records…
          </div>
        ) : beneficiariesQuery.isError ? (
          <div className="p-12 text-center text-sm text-destructive">
            {(beneficiariesQuery.error as Error).message}
          </div>
        ) : beneficiaries.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-brand/10 text-brand">
              <HeartHandshake className="h-6 w-6" />
            </div>
            <h2 className="font-semibold">No beneficiary records found</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {search || status !== "ACTIVE" || centreId !== "ALL"
                ? "Adjust the filters to look for another child."
                : "Register the first child to begin their care, placement and education history."}
            </p>
            {canManage && !search && status === "ACTIVE" && centreId === "ALL" ? (
              <Button className="mt-4" size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Register first child
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Child</th>
                  <th className="px-4 py-2.5 text-left font-medium">Special ID</th>
                  <th className="px-4 py-2.5 text-left font-medium">Care centre</th>
                  <th className="px-4 py-2.5 text-left font-medium">Education</th>
                  <th className="px-4 py-2.5 text-left font-medium">Admission</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {beneficiaries.map((beneficiary) => (
                  <tr key={beneficiary.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-brand/10 text-brand">
                          {beneficiary.avatarUrl ? (
                            <img
                              src={getAvatarSrc(beneficiary.avatarUrl)}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <UserRound className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium">{beneficiary.fullName}</div>
                          <div className="text-xs text-muted-foreground">
                            {beneficiary.gender === "MALE" ? "Male" : "Female"} ·{" "}
                            {ageFromDate(beneficiary.dateOfBirth)} years
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-medium">
                      {beneficiary.beneficiaryNo}
                    </td>
                    <td className="px-4 py-3">
                      {beneficiary.currentPlacement ? (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />{" "}
                          {beneficiary.currentPlacement.careCentre.name}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">No active placement</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />{" "}
                        {beneficiary.currentEducationLevel || "Not recorded"}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {beneficiary.linkedStudent
                          ? `Linked · ${beneficiary.linkedStudent.admissionNo}`
                          : beneficiary.schoolName || "No school recorded"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(beneficiary.admissionDate)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={beneficiary.status === "ACTIVE" ? "default" : "secondary"}>
                        {statusLabel(beneficiary.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to="/ngo/beneficiaries/$beneficiaryId"
                          params={{ beneficiaryId: beneficiary.id }}
                        >
                          View profile
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">{pagination.total} children</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {canManage ? <BeneficiaryFormDialog open={formOpen} onOpenChange={setFormOpen} /> : null}
    </div>
  );
}

const dateFormatter = new Intl.DateTimeFormat("en-GH", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}
