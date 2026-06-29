import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Send, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { academicApi, financeApi, studentsApi } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/fees")({
  head: () => ({ meta: [{ title: "Fees — Lumen Suite" }] }),
  component: FeesPage,
});
const money = (value: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(value);
const field =
  "h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring";

function FeesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission(user, "fees.manage");
  const canPublish = hasPermission(user, "fees.publish");
  const canApproveAdjustments = hasPermission(user, "fees.adjust.approve");
  const [showItem, setShowItem] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [item, setItem] = useState({ code: "", name: "", description: "" });
  const [schedule, setSchedule] = useState({
    academicYearId: "",
    termId: "",
    gradeLevelId: "",
    kind: "STANDARD" as "STANDARD" | "SUPPLEMENTAL",
    name: "",
    feeItemId: "",
    amount: "",
    dueDate: "",
    applicability: "MANDATORY" as "MANDATORY" | "OPTIONAL",
  });
  const [assignment, setAssignment] = useState<Record<string, string>>({});
  const [draftLines, setDraftLines] = useState<
    {
      feeItemId: string;
      amount: number;
      dueDate: string;
      applicability: "MANDATORY" | "OPTIONAL";
    }[]
  >([]);
  const items = useQuery({ queryKey: ["fee-items"], queryFn: () => financeApi.getFeeItems(true) });
  const schedules = useQuery({
    queryKey: ["fee-schedules"],
    queryFn: () => financeApi.getSchedules(),
  });
  const years = useQuery({ queryKey: ["academic-years"], queryFn: academicApi.getYears });
  const grades = useQuery({ queryKey: ["grade-levels"], queryFn: academicApi.getGradeLevels });
  const students = useQuery({ queryKey: ["finance-students"], queryFn: () => studentsApi.list() });
  const adjustments = useQuery({
    queryKey: ["fee-adjustments", "PENDING"],
    queryFn: () => financeApi.getAdjustments(),
    enabled: canApproveAdjustments,
  });
  const selectedYear =
    years.data?.years.find((year) => year.id === schedule.academicYearId) ??
    years.data?.years.find((year) => year.status === "ACTIVE");
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["fee-items"] }),
      queryClient.invalidateQueries({ queryKey: ["fee-schedules"] }),
    ]);
  const createItem = useMutation({
    mutationFn: () => financeApi.createFeeItem(item),
    onSuccess: async () => {
      await invalidate();
      setItem({ code: "", name: "", description: "" });
      setShowItem(false);
      toast.success("Fee item created");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const createSchedule = useMutation({
    mutationFn: () =>
      financeApi.createSchedule({
        academicYearId: schedule.academicYearId || selectedYear?.id || "",
        termId: schedule.termId,
        gradeLevelId: schedule.gradeLevelId,
        kind: schedule.kind,
        name: schedule.name,
        lines: draftLines.length
          ? draftLines
          : [
              {
                feeItemId: schedule.feeItemId,
                amount: Number(schedule.amount),
                dueDate: schedule.dueDate,
                applicability: schedule.applicability,
              },
            ],
      }),
    onSuccess: async () => {
      await invalidate();
      setShowSchedule(false);
      setDraftLines([]);
      toast.success("Draft fee schedule created");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const transition = useMutation({
    mutationFn: ({ id, publish }: { id: string; publish: boolean }) =>
      publish ? financeApi.publishSchedule(id) : financeApi.submitSchedule(id),
    onSuccess: async (_, input) => {
      await invalidate();
      toast.success(
        input.publish
          ? "Schedule published and charges created"
          : "Schedule submitted for approval",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const assign = useMutation({
    mutationFn: ({ lineId, enrolmentId }: { lineId: string; enrolmentId: string }) =>
      financeApi.assignOptionalFee(lineId, [enrolmentId]),
    onSuccess: async () => {
      await invalidate();
      toast.success("Optional fee assigned");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const decideAdjustment = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      financeApi.decideAdjustment(id, approved),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["fee-adjustments"] }),
        queryClient.invalidateQueries({ queryKey: ["student-ledger"] }),
      ]);
      toast.success("Adjustment decision saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const activeItems = useMemo(
    () => items.data?.items.filter((entry) => entry.active) ?? [],
    [items.data],
  );
  if (!hasPermission(user, "fees.view")) return <Forbidden />;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Fees & schedules"
        description="Publish grade-level term charges while preserving every student's arrears history."
        actions={
          canManage ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowItem((v) => !v)}>
                <Plus className="mr-1 h-4 w-4" />
                Fee item
              </Button>
              <Button size="sm" onClick={() => setShowSchedule((v) => !v)}>
                <Wallet className="mr-1 h-4 w-4" />
                Schedule
              </Button>
            </div>
          ) : null
        }
      />
      {showItem && (
        <form
          className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[160px_1fr_2fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            createItem.mutate();
          }}
        >
          <input
            className={field}
            placeholder="Code"
            value={item.code}
            onChange={(e) => setItem({ ...item, code: e.target.value })}
          />
          <input
            className={field}
            placeholder="Fee name"
            value={item.name}
            onChange={(e) => setItem({ ...item, name: e.target.value })}
          />
          <input
            className={field}
            placeholder="Description (optional)"
            value={item.description}
            onChange={(e) => setItem({ ...item, description: e.target.value })}
          />
          <Button disabled={createItem.isPending}>Save item</Button>
        </form>
      )}
      {showSchedule && (
        <form
          className="space-y-3 rounded-xl border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            createSchedule.mutate();
          }}
        >
          <div className="grid gap-3 md:grid-cols-4">
            <select
              className={field}
              value={schedule.academicYearId || selectedYear?.id || ""}
              onChange={(e) =>
                setSchedule({ ...schedule, academicYearId: e.target.value, termId: "" })
              }
            >
              <option value="">Academic year</option>
              {years.data?.years.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name} · {year.status}
                </option>
              ))}
            </select>
            <select
              className={field}
              value={schedule.termId}
              onChange={(e) => setSchedule({ ...schedule, termId: e.target.value })}
            >
              <option value="">Term</option>
              {selectedYear?.terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name} · {term.status}
                </option>
              ))}
            </select>
            <select
              className={field}
              value={schedule.gradeLevelId}
              onChange={(e) => setSchedule({ ...schedule, gradeLevelId: e.target.value })}
            >
              <option value="">Grade level</option>
              {grades.data?.gradeLevels
                .filter((grade) => grade.active)
                .map((grade) => (
                  <option key={grade.id} value={grade.id}>
                    {grade.name}
                  </option>
                ))}
            </select>
            <select
              className={field}
              value={schedule.kind}
              onChange={(e) =>
                setSchedule({ ...schedule, kind: e.target.value as typeof schedule.kind })
              }
            >
              <option value="STANDARD">Standard</option>
              <option value="SUPPLEMENTAL">Supplemental</option>
            </select>
          </div>
          <input
            className={`${field} w-full`}
            placeholder="Schedule name"
            value={schedule.name}
            onChange={(e) => setSchedule({ ...schedule, name: e.target.value })}
          />
          <div className="grid gap-3 md:grid-cols-5">
            <select
              className={field}
              value={schedule.feeItemId}
              onChange={(e) => setSchedule({ ...schedule, feeItemId: e.target.value })}
            >
              <option value="">Fee item</option>
              {activeItems.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
            <input
              className={field}
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Amount"
              value={schedule.amount}
              onChange={(e) => setSchedule({ ...schedule, amount: e.target.value })}
            />
            <input
              className={field}
              type="date"
              value={schedule.dueDate}
              onChange={(e) => setSchedule({ ...schedule, dueDate: e.target.value })}
            />
            <select
              className={field}
              value={schedule.applicability}
              onChange={(e) =>
                setSchedule({
                  ...schedule,
                  applicability: e.target.value as typeof schedule.applicability,
                })
              }
            >
              <option value="MANDATORY">Mandatory</option>
              <option value="OPTIONAL">Optional</option>
            </select>
            <Button
              type="button"
              variant="outline"
              disabled={!schedule.feeItemId || !schedule.amount || !schedule.dueDate}
              onClick={() => {
                setDraftLines((current) => [
                  ...current.filter((line) => line.feeItemId !== schedule.feeItemId),
                  {
                    feeItemId: schedule.feeItemId,
                    amount: Number(schedule.amount),
                    dueDate: schedule.dueDate,
                    applicability: schedule.applicability,
                  },
                ]);
                setSchedule({ ...schedule, feeItemId: "", amount: "" });
              }}
            >
              Add line
            </Button>
          </div>
          {draftLines.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {draftLines.map((line) => (
                <Badge key={line.feeItemId} variant="outline">
                  {activeItems.find((item) => item.id === line.feeItemId)?.name} ·{" "}
                  {money(line.amount)} · {line.applicability}
                </Badge>
              ))}
              <Button disabled={createSchedule.isPending || !schedule.termId} size="sm">
                Create {draftLines.length}-line draft
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Add later fees as supplemental schedules. Published schedules cannot be edited.
          </p>
        </form>
      )}
      <section>
        <h2 className="mb-3 text-sm font-semibold">Fee catalogue</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.data?.items.map((entry) => (
            <article key={entry.id} className="rounded-xl border bg-card p-4">
              <div className="flex justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">{entry.code}</div>
                  <div className="font-semibold">{entry.name}</div>
                </div>
                <Badge variant={entry.active ? "default" : "outline"}>
                  {entry.active ? "Active" : "Archived"}
                </Badge>
              </div>
              {canManage && entry.active && (
                <Button
                  className="mt-3"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    financeApi.updateFeeItem(entry.id, { active: false }).then(invalidate)
                  }
                >
                  Archive
                </Button>
              )}
            </article>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold">Term schedules</h2>
        <div className="space-y-3">
          {schedules.data?.schedules.map((entry) => (
            <article key={entry.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex gap-2">
                    <Badge>{entry.status.replaceAll("_", " ")}</Badge>
                    <Badge variant="outline">{entry.kind}</Badge>
                  </div>
                  <h3 className="mt-2 font-semibold">{entry.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {entry.academicYear.name} · {entry.term.name} · {entry.gradeLevel.name}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-semibold">{money(entry.total)}</div>
                  <div className="mt-2 flex gap-2">
                    {canManage && entry.status === "DRAFT" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => transition.mutate({ id: entry.id, publish: false })}
                      >
                        <Send className="mr-1 h-4 w-4" />
                        Submit
                      </Button>
                    )}
                    {canPublish && entry.status === "PENDING_APPROVAL" && (
                      <Button
                        size="sm"
                        onClick={() => transition.mutate({ id: entry.id, publish: true })}
                      >
                        <ShieldCheck className="mr-1 h-4 w-4" />
                        Publish
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 divide-y rounded-lg border">
                {entry.lines.map((line) => (
                  <div
                    key={line.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <span>
                      {line.label}{" "}
                      <Badge variant="outline" className="ml-2">
                        {line.applicability}
                      </Badge>
                    </span>
                    <span className="font-medium">
                      {money(line.amount)} · due {line.dueDate}
                    </span>
                    {canManage && line.applicability === "OPTIONAL" && (
                      <div className="flex gap-2">
                        <select
                          className={field}
                          value={assignment[line.id] ?? ""}
                          onChange={(e) =>
                            setAssignment({ ...assignment, [line.id]: e.target.value })
                          }
                        >
                          <option value="">Assign student</option>
                          {students.data?.students
                            .filter(
                              (student) =>
                                student.enrolmentId &&
                                student.gradeLevelName === entry.gradeLevel.name,
                            )
                            .map((student) => (
                              <option key={student.id} value={student.enrolmentId!}>
                                {student.firstName} {student.lastName}
                              </option>
                            ))}
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!assignment[line.id]}
                          onClick={() =>
                            assign.mutate({ lineId: line.id, enrolmentId: assignment[line.id] })
                          }
                        >
                          Assign
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </article>
          ))}
          {!schedules.isLoading && !schedules.data?.schedules.length && (
            <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
              No fee schedules yet.
            </div>
          )}
        </div>
      </section>
      {canApproveAdjustments && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Pending adjustment approvals</h2>
          <div className="space-y-2">
            {adjustments.data?.adjustments.map((raw) => {
              const entry = raw as {
                id: string;
                type: string;
                amount: number;
                reason: string;
                chargeLabel: string;
                academicContext: string;
                student: { name: string; admissionNo: string };
              };
              return (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
                >
                  <div>
                    <div className="font-medium">
                      {entry.student.name} · {entry.chargeLabel}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {entry.academicContext} · {entry.type.replaceAll("_", " ")} · {entry.reason}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{money(entry.amount)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decideAdjustment.mutate({ id: entry.id, approved: false })}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => decideAdjustment.mutate({ id: entry.id, approved: true })}
                    >
                      Approve
                    </Button>
                  </div>
                </div>
              );
            })}
            {!adjustments.isLoading && !adjustments.data?.adjustments.length && (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No pending adjustments.
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
