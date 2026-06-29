import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CreditCard, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { accountingApi, financeApi, studentsApi } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/payments")({
  head: () => ({ meta: [{ title: "Payments — Lumen Suite" }] }),
  component: PaymentsPage,
});
const money = (value: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(value);
const field =
  "h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring";

function PaymentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [studentId, setStudentId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [creditLotId, setCreditLotId] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const canReverse = hasPermission(user, "payments.reverse");
  const canApproveReversals = hasPermission(user, "payments.reverse.approve");
  const canRecord = hasPermission(user, "payments.record");
  const moneyAccounts = useQuery({
    queryKey: ["accounting-money-accounts"],
    queryFn: accountingApi.getMoneyAccounts,
    enabled: canRecord && showForm,
  });
  useEffect(() => {
    const available = moneyAccounts.data?.moneyAccounts ?? [];
    const current = available.find((account) => account.id === moneyAccountId);
    if (current) return;
    const mapped = available.find((account) =>
      account.methodMappings?.some((mapping) => mapping.method === method),
    );
    setMoneyAccountId(mapped?.id ?? available[0]?.id ?? "");
  }, [method, moneyAccountId, moneyAccounts.data?.moneyAccounts]);
  const students = useQuery({
    queryKey: ["finance-payment-students", search],
    queryFn: () => studentsApi.list({ search }),
  });
  const ledger = useQuery({
    queryKey: ["student-ledger", studentId],
    queryFn: () => financeApi.getLedger(studentId),
    enabled: !!studentId,
  });
  const payments = useQuery({
    queryKey: ["fee-payments", search, paymentMethod, paymentStatus, dateFrom, dateTo, page],
    queryFn: () =>
      financeApi.getPayments({
        search,
        method: paymentMethod,
        status: paymentStatus,
        dateFrom,
        dateTo,
        page,
      }),
  });
  useEffect(() => {
    const effectivePage = payments.data?.pagination.page;
    if (effectivePage && effectivePage !== page) setPage(effectivePage);
  }, [page, payments.data?.pagination.page]);
  const reversals = useQuery({
    queryKey: ["payment-reversals", "PENDING"],
    queryFn: () => financeApi.getReversals(),
    enabled: canApproveReversals,
  });
  const allocationTotal = useMemo(
    () => Object.values(allocations).reduce((sum, value) => sum + Number(value || 0), 0),
    [allocations],
  );
  const payment = useMutation({
    mutationFn: () =>
      financeApi.recordPayment({
        studentId,
        amount: Number(amount),
        method,
        moneyAccountId: moneyAccountId || null,
        transactionRef: method === "CASH" ? null : reference,
        idempotencyKey: crypto.randomUUID(),
        allocations: Object.entries(allocations)
          .filter(([, value]) => Number(value) > 0)
          .map(([chargeId, value]) => ({ chargeId, amount: Number(value) })),
      }),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["student-ledger", studentId] }),
        queryClient.invalidateQueries({ queryKey: ["fee-payments"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      setAmount("");
      setAllocations({});
      toast.success(`Payment posted — ${result.payment.receipt?.number ?? "receipt created"}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const requestReversal = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      financeApi.requestReversal(paymentId, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fee-payments"] });
      toast.success("Reversal sent for approval");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const decideReversal = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      financeApi.decideReversal(id, approved),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payment-reversals"] }),
        queryClient.invalidateQueries({ queryKey: ["fee-payments"] }),
        queryClient.invalidateQueries({ queryKey: ["student-ledger"] }),
      ]);
      toast.success("Reversal decision saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const allocateCredit = useMutation({
    mutationFn: () =>
      financeApi.allocateCredit(
        creditLotId,
        Object.entries(allocations)
          .filter(([, value]) => Number(value) > 0)
          .map(([chargeId, value]) => ({ chargeId, amount: Number(value) })),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["student-ledger", studentId] });
      setAllocations({});
      toast.success("Student credit allocated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (!hasPermission(user, "payments.view")) return <Forbidden />;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Allocate one payment across any outstanding term or academic year."
        actions={
          canRecord ? (
            <Button size="sm" onClick={() => setShowForm((v) => !v)}>
              <Plus className="mr-1 h-4 w-4" />
              Record payment
            </Button>
          ) : null
        }
      />
      <div className="grid gap-2 lg:grid-cols-[minmax(240px,1fr)_180px_180px_160px_160px]">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            className={`${field} w-full pl-9`}
            placeholder="Search student, admission number or receipt"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className={field}
          value={paymentMethod}
          onChange={(e) => {
            setPaymentMethod(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All methods</option>
          <option value="CASH">Cash</option>
          <option value="MOBILE_MONEY">Mobile money</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="CARD">Card</option>
        </select>
        <select
          className={field}
          value={paymentStatus}
          onChange={(e) => {
            setPaymentStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="POSTED">Posted</option>
          <option value="REVERSAL_PENDING">Reversal pending</option>
          <option value="REVERSED">Reversed</option>
        </select>
        <input
          className={field}
          type="date"
          aria-label="Payment date from"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
        />
        <input
          className={field}
          type="date"
          aria-label="Payment date to"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
        />
      </div>
      {showForm && (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <aside className="rounded-xl border bg-card p-3">
            <h2 className="mb-2 text-sm font-semibold">Select student</h2>
            <div className="max-h-96 space-y-1 overflow-auto">
              {students.data?.students.map((student) => (
                <button
                  key={student.id}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${studentId === student.id ? "bg-brand text-brand-foreground" : "hover:bg-muted"}`}
                  onClick={() => {
                    setStudentId(student.id);
                    setAllocations({});
                  }}
                >
                  {student.firstName} {student.lastName}
                  <span className="block text-xs opacity-70">
                    {student.admissionNo} · {student.className}
                  </span>
                </button>
              ))}
            </div>
          </aside>
          <section className="rounded-xl border bg-card p-4">
            {ledger.data ? (
              <>
                <div className="grid gap-3 sm:grid-cols-5">
                  <Stat
                    label="Previous arrears"
                    value={ledger.data.ledger.summary.previousArrears}
                  />
                  <Stat
                    label="Current term"
                    value={ledger.data.ledger.summary.currentTermBalance}
                  />
                  <Stat label="Future charges" value={ledger.data.ledger.summary.futureCharges} />
                  <Stat
                    label="Available credit"
                    value={ledger.data.ledger.summary.availableCredit}
                  />
                  <Stat label="Net exposure" value={ledger.data.ledger.summary.netExposure} />
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-2">Charge</th>
                        <th>Context</th>
                        <th>Balance</th>
                        <th className="w-36">Allocate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {ledger.data.ledger.charges
                        .filter((charge) => charge.balance > 0)
                        .map((charge) => (
                          <tr key={charge.id}>
                            <td className="py-2 font-medium">{charge.label}</td>
                            <td className="text-muted-foreground">
                              {charge.academicYearName} · {charge.termName}
                            </td>
                            <td>{money(charge.balance)}</td>
                            <td>
                              <input
                                className={`${field} w-32`}
                                type="number"
                                min="0"
                                max={charge.balance}
                                step="0.01"
                                value={allocations[charge.id] ?? ""}
                                onChange={(e) =>
                                  setAllocations({ ...allocations, [charge.id]: e.target.value })
                                }
                              />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <form
                  className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    payment.mutate();
                  }}
                >
                  <input
                    className={field}
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Amount received"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <select
                    className={field}
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    <option value="CASH">Cash</option>
                    <option value="MOBILE_MONEY">Mobile money</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="CARD">Card</option>
                  </select>
                  <select
                    className={field}
                    value={moneyAccountId}
                    onChange={(e) => setMoneyAccountId(e.target.value)}
                  >
                    <option value="">Default money account</option>
                    {moneyAccounts.data?.moneyAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                  {method !== "CASH" ? (
                    <input
                      className={field}
                      placeholder="Transaction reference"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  ) : (
                    <div className="rounded-md bg-muted px-3 py-2 text-xs">
                      Allocated: {money(allocationTotal)}
                      <br />
                      Credit: {money(Math.max(0, Number(amount || 0) - allocationTotal))}
                    </div>
                  )}
                  <Button
                    disabled={payment.isPending || !amount || allocationTotal > Number(amount)}
                  >
                    Post & issue receipt
                  </Button>
                </form>
                {hasPermission(user, "credits.allocate") &&
                  ledger.data.ledger.credits.some((credit) => credit.available > 0) && (
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-dashed p-3">
                      <span className="mr-auto text-xs text-muted-foreground">
                        Use the allocation amounts above, then select a credit lot.
                      </span>
                      <select
                        className={field}
                        value={creditLotId}
                        onChange={(e) => setCreditLotId(e.target.value)}
                      >
                        <option value="">Available credit</option>
                        {ledger.data.ledger.credits
                          .filter((credit) => credit.available > 0)
                          .map((credit) => (
                            <option key={credit.id} value={credit.id}>
                              {money(credit.available)} ·{" "}
                              {new Date(credit.createdAt).toLocaleDateString()}
                            </option>
                          ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!creditLotId || !allocationTotal || allocateCredit.isPending}
                        onClick={() => allocateCredit.mutate()}
                      >
                        Apply selected credit
                      </Button>
                    </div>
                  )}
              </>
            ) : (
              <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">
                Select a student to load all outstanding fees.
              </div>
            )}
          </section>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Receipt</th>
              <th>Student</th>
              <th>Date</th>
              <th>Method</th>
              <th>Allocated</th>
              <th>Credit</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {payments.data?.payments.map((entry) => (
              <tr key={entry.id}>
                <td className="px-4 py-3 font-medium">{entry.receipt?.number ?? "—"}</td>
                <td>
                  {entry.student.firstName} {entry.student.lastName}
                  <span className="block text-xs text-muted-foreground">
                    {entry.student.admissionNo}
                  </span>
                </td>
                <td>{new Date(entry.postedAt).toLocaleDateString()}</td>
                <td>{entry.method.replaceAll("_", " ")}</td>
                <td>{money(entry.allocated)}</td>
                <td>{money(entry.creditCreated)}</td>
                <td>
                  <Badge variant={entry.status === "POSTED" ? "default" : "outline"}>
                    {entry.status.replaceAll("_", " ")}
                  </Badge>
                </td>
                <td className="pr-3 text-right">
                  {canReverse && entry.status === "POSTED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const reason = window.prompt("Reason for reversing this payment?");
                        if (reason?.trim()) requestReversal.mutate({ paymentId: entry.id, reason });
                      }}
                    >
                      Request reversal
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {payments.data?.pagination && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {payments.data.pagination.total} payment
            {payments.data.pagination.total === 1 ? "" : "s"}
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
              Page {payments.data.pagination.page} of {payments.data.pagination.totalPages || 1}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= payments.data.pagination.totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      {canApproveReversals && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Pending reversal approvals</h2>
          <div className="space-y-2">
            {reversals.data?.reversals.map((raw) => {
              const entry = raw as {
                id: string;
                reason: string;
                student: { name: string; admissionNo: string };
                payment: { amount: number; receipt: { number: string } | null };
              };
              return (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
                >
                  <div>
                    <div className="font-medium">
                      {entry.student.name} · {entry.payment.receipt?.number ?? "Payment"}
                    </div>
                    <div className="text-xs text-muted-foreground">{entry.reason}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{money(entry.payment.amount)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decideReversal.mutate({ id: entry.id, approved: false })}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => decideReversal.mutate({ id: entry.id, approved: true })}
                    >
                      Approve reversal
                    </Button>
                  </div>
                </div>
              );
            })}
            {!reversals.isLoading && !reversals.data?.reversals.length && (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No pending reversals.
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{money(value)}</div>
    </div>
  );
}
