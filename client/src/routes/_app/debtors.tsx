import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Download, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { financeApi } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/debtors")({
  head: () => ({ meta: [{ title: "Debtors — Lumen Suite" }] }),
  component: DebtorsPage,
});
const money = (value: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(value);
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DebtorsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [gradeLevelId, setGradeLevelId] = useState("");
  const [classSectionId, setClassSectionId] = useState("");
  const [page, setPage] = useState(1);
  const filters = useQuery({
    queryKey: ["debtor-filters"],
    queryFn: financeApi.getDebtorFilters,
  });
  const debtors = useQuery({
    queryKey: ["debtors", search, gradeLevelId, classSectionId, page],
    queryFn: () => financeApi.getDebtors({ search, gradeLevelId, classSectionId, page }),
  });
  useEffect(() => {
    const effectivePage = debtors.data?.pagination.page;
    if (effectivePage && effectivePage !== page) setPage(effectivePage);
  }, [debtors.data?.pagination.page, page]);
  if (!hasPermission(user, "debtors.view")) return <Forbidden />;
  const visibleSections =
    filters.data?.sections.filter(
      (section) => !gradeLevelId || section.gradeLevelId === gradeLevelId,
    ) ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Debtors & arrears"
        description="Outstanding balances include every term and academic year; available credit is shown separately."
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Students owing" value={String(debtors.data?.pagination.total ?? 0)} />
        <Stat label="Total net exposure" value={money(debtors.data?.totals.netExposure ?? 0)} />
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Grade filter</div>
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={gradeLevelId}
            onChange={(e) => {
              setGradeLevelId(e.target.value);
              setClassSectionId("");
              setPage(1);
            }}
          >
            <option value="">All grades</option>
            {filters.data?.gradeLevels.map((grade) => (
              <option key={grade.id} value={grade.id}>
                {grade.name}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Current section</div>
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={classSectionId}
            onChange={(e) => {
              setClassSectionId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All sections</option>
            {visibleSections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm"
          placeholder="Search student or admission number"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      {debtors.data?.pagination && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {debtors.data.debtors.length} of {debtors.data.pagination.total} debtors
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </Button>
            <span>
              Page {debtors.data.pagination.page} of {debtors.data.pagination.totalPages || 1}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= debtors.data.pagination.totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Student</th>
              <th>Previous arrears</th>
              <th>Current term</th>
              <th>Future charges</th>
              <th>Credit</th>
              <th>Outstanding</th>
              <th>Net exposure</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {debtors.data?.debtors.map((entry) => (
              <tr key={entry.student.id}>
                <td className="px-4 py-3 font-medium">
                  {entry.student.name}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {entry.student.admissionNo}
                  </span>
                </td>
                <td>{money(entry.previousArrears)}</td>
                <td>{money(entry.currentTermBalance)}</td>
                <td>{money(entry.futureCharges)}</td>
                <td>{money(entry.availableCredit)}</td>
                <td>{money(entry.outstanding)}</td>
                <td className="font-semibold text-destructive">{money(entry.netExposure)}</td>
                <td>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      financeApi
                        .downloadStatement(entry.student.id)
                        .then((blob) =>
                          save(
                            blob,
                            `${entry.student.admissionNo.replaceAll("/", "-")}-statement.pdf`,
                          ),
                        )
                    }
                  >
                    <Download className="mr-1 h-4 w-4" />
                    Statement
                  </Button>
                </td>
              </tr>
            ))}
            {!debtors.isLoading && !debtors.data?.debtors.length && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-muted-foreground">
                  No outstanding student balances.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
