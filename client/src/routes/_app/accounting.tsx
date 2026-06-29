import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Download, Landmark, Paperclip, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import {
  accountingApi,
  academicApi,
  type ApiAccount,
  type ApiAccountingSetup,
  type ApiExpense,
} from "@/lib/api";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/accounting")({
  head: () => ({ meta: [{ title: "Accounting — Lumen Suite" }] }),
  component: AccountingPage,
});

const field =
  "h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring";
const money = (value: number | string) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(Number(value));
const today = new Date().toISOString().slice(0, 10);

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function fileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read the supporting document."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  });
}

function AccountingPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canSetup = hasPermission(user, "accounting.setup");
  const setup = useQuery({ queryKey: ["accounting-setup"], queryFn: accountingApi.getSetup });
  const years = useQuery({
    queryKey: ["academic-years"],
    queryFn: academicApi.getYears,
    enabled: canSetup && !setup.data?.setup,
  });
  const bootstrap = useMutation({
    mutationFn: () => {
      const year =
        years.data?.years.find((item) => item.status === "ACTIVE") ?? years.data?.years[0];
      return accountingApi.bootstrap(year?.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounting-setup"] });
      toast.success("School accounting structure created");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (!hasPermission(user, "accounting.view")) return <Forbidden />;
  if (setup.isLoading)
    return (
      <div className="grid min-h-72 place-items-center text-muted-foreground">
        Loading accounting…
      </div>
    );
  if (!setup.data?.setup)
    return (
      <div className="space-y-6">
        <PageHeader
          title="School Accounting"
          description="Create the school’s accrual ledger and connect it to fees and payments."
        />
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <Landmark className="mx-auto h-10 w-10 text-brand" />
          <h2 className="mt-4 text-lg font-semibold">Accounting has not been configured</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Setup creates a school chart of accounts, academic-year periods, money accounts and fee
            mappings.
          </p>
          {canSetup ? (
            <Button
              className="mt-5"
              onClick={() => bootstrap.mutate()}
              disabled={bootstrap.isPending}
            >
              Create accounting foundation
            </Button>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              A School Admin must complete setup.
            </p>
          )}
        </div>
      </div>
    );
  return <AccountingWorkspace setup={setup.data.setup} />;
}

function AccountingWorkspace({ setup }: { setup: ApiAccountingSetup }) {
  const { user } = useAuth();
  const canSetup = hasPermission(user, "accounting.setup");
  return (
    <div className="space-y-6">
      <PageHeader
        title="School Accounting"
        description="Accrual journals, expenses, money accounts, reconciliation and financial statements."
        actions={
          <Badge variant={setup.status === "ACTIVE" ? "default" : "outline"}>{setup.status}</Badge>
        }
      />
      <Tabs defaultValue={setup.status === "SETUP" && canSetup ? "setup" : "overview"}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="journals">Journals</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="money">Money accounts</TabsTrigger>
          <TabsTrigger value="reconcile">Reconciliation</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          {canSetup && <TabsTrigger value="setup">Setup</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview">
          <Overview />
        </TabsContent>
        <TabsContent value="accounts">
          <Accounts />
        </TabsContent>
        <TabsContent value="journals">
          <Journals />
        </TabsContent>
        <TabsContent value="expenses">
          <Expenses />
        </TabsContent>
        <TabsContent value="money">
          <MoneyAccounts setup={setup} />
        </TabsContent>
        <TabsContent value="reconcile">
          <Reconciliation />
        </TabsContent>
        <TabsContent value="reports">
          <Reports />
        </TabsContent>
        {canSetup && (
          <TabsContent value="setup">
            <Setup setup={setup} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function Overview() {
  const summary = useQuery({ queryKey: ["accounting-summary"], queryFn: accountingApi.getSummary });
  const value = (key: string) => Number(summary.data?.summary[key] ?? 0);
  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cash position" value={money(value("cashPosition"))} />
        <Stat label="Fee receivables" value={money(value("receivables"))} />
        <Stat label="Accounts payable" value={money(value("payables"))} />
        <Stat label="Unreconciled" value={String(value("unreconciled"))} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Income" value={money(value("income"))} />
        <Stat label="Expenses" value={money(value("expenses"))} />
        <Stat label="Surplus / deficit" value={money(value("surplus"))} />
      </div>
    </div>
  );
}

function Accounts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const accounts = useQuery({
    queryKey: ["accounting-accounts"],
    queryFn: () => accountingApi.getAccounts(true),
  });
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<ApiAccount["type"]>("EXPENSE");
  const create = useMutation({
    mutationFn: () => accountingApi.createAccount({ code, name, type }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounting-accounts"] });
      setCode("");
      setName("");
      setShowForm(false);
      toast.success("Account created");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <section className="mt-5 space-y-4">
      <div className="flex justify-between">
        <div>
          <h2 className="font-semibold">Chart of accounts</h2>
          <p className="text-sm text-muted-foreground">
            Used accounts remain historical and can only be archived.
          </p>
        </div>
        {hasPermission(user, "accounting.setup") && (
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-1 h-4 w-4" />
            Account
          </Button>
        )}
      </div>
      {showForm && (
        <form
          className="grid gap-2 rounded-xl border bg-card p-4 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <input
            className={field}
            placeholder="Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <input
            className={field}
            placeholder="Account name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className={field}
            value={type}
            onChange={(e) => setType(e.target.value as ApiAccount["type"])}
          >
            {(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <Button disabled={!code || !name || create.isPending}>Save account</Button>
        </form>
      )}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th>Name</th>
              <th>Type</th>
              <th>Control</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {accounts.data?.accounts.map((account) => (
              <tr key={account.id}>
                <td className="px-4 py-3 font-mono">{account.code}</td>
                <td className="font-medium">{account.name}</td>
                <td>{account.type}</td>
                <td>{account.systemKey?.replaceAll("_", " ") ?? "—"}</td>
                <td>
                  <Badge variant={account.active ? "default" : "outline"}>
                    {account.active ? "ACTIVE" : "ARCHIVED"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Journals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const journals = useQuery({
    queryKey: ["accounting-journals"],
    queryFn: accountingApi.getJournals,
  });
  const accounts = useQuery({
    queryKey: ["accounting-accounts"],
    queryFn: accountingApi.getAccounts,
  });
  const [description, setDescription] = useState("");
  const [debitAccount, setDebitAccount] = useState("");
  const [creditAccount, setCreditAccount] = useState("");
  const [amount, setAmount] = useState("");
  const create = useMutation({
    mutationFn: () =>
      accountingApi.createJournal({
        date: today,
        description,
        lines: [
          { accountId: debitAccount, debit: Number(amount), credit: 0 },
          { accountId: creditAccount, debit: 0, credit: Number(amount) },
        ],
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounting-journals"] });
      setDescription("");
      setAmount("");
      toast.success("Draft journal created");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const action = useMutation({
    mutationFn: ({
      id,
      kind,
      approved,
    }: {
      id: string;
      kind: "submit" | "decide";
      approved?: boolean;
    }) =>
      kind === "submit"
        ? accountingApi.submitJournal(id)
        : accountingApi.decideJournal(id, !!approved),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounting-journals"] });
      toast.success("Journal updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <section className="mt-5 space-y-4">
      {hasPermission(user, "journals.create") && (
        <form
          className="grid gap-2 rounded-xl border bg-card p-4 lg:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <input
            className={field}
            placeholder="Journal description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <AccountSelect
            accounts={accounts.data?.accounts ?? []}
            value={debitAccount}
            onChange={setDebitAccount}
            placeholder="Debit account"
          />
          <AccountSelect
            accounts={accounts.data?.accounts ?? []}
            value={creditAccount}
            onChange={setCreditAccount}
            placeholder="Credit account"
          />
          <input
            className={field}
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button disabled={!description || !debitAccount || !creditAccount || !amount}>
            Create draft
          </Button>
        </form>
      )}
      <div className="space-y-2">
        {journals.data?.journals.map((journal) => (
          <div
            key={journal.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
          >
            <div>
              <div className="font-medium">
                {journal.number ?? "DRAFT"} · {journal.description}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(journal.date).toLocaleDateString()} ·{" "}
                {journal.source.replaceAll("_", " ")}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={journal.status === "POSTED" ? "default" : "outline"}>
                {journal.status.replaceAll("_", " ")}
              </Badge>
              {journal.status === "DRAFT" && hasPermission(user, "journals.create") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => action.mutate({ id: journal.id, kind: "submit" })}
                >
                  Submit
                </Button>
              )}
              {journal.status === "PENDING_APPROVAL" && hasPermission(user, "journals.approve") && (
                <Button
                  size="sm"
                  onClick={() => action.mutate({ id: journal.id, kind: "decide", approved: true })}
                >
                  Approve
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Expenses() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const expenses = useQuery({
    queryKey: ["accounting-expenses"],
    queryFn: accountingApi.getExpenses,
  });
  const accounts = useQuery({
    queryKey: ["accounting-accounts"],
    queryFn: accountingApi.getAccounts,
  });
  const moneyAccounts = useQuery({
    queryKey: ["accounting-money-accounts"],
    queryFn: accountingApi.getMoneyAccounts,
  });
  const expenseAccounts =
    accounts.data?.accounts.filter((account) => account.type === "EXPENSE") ?? [];
  const [payee, setPayee] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const create = useMutation({
    mutationFn: async () => {
      const created = await accountingApi.createExpense({
        date: today,
        payee,
        description,
        missingDocumentReason: attachment ? null : "Supporting document not yet available",
        lines: [{ accountId, description, amount: Number(amount) }],
      });
      if (attachment)
        await accountingApi.addExpenseAttachment(
          created.expense.id,
          attachment.name,
          await fileBase64(attachment),
        );
      return created;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounting-expenses"] });
      setPayee("");
      setDescription("");
      setAmount("");
      setAttachment(null);
      toast.success("Draft expense recorded");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["accounting-expenses"] }),
      queryClient.invalidateQueries({ queryKey: ["accounting-journals"] }),
      queryClient.invalidateQueries({ queryKey: ["accounting-summary"] }),
    ]);
  };
  const run = useMutation({
    mutationFn: async ({ expense, action }: { expense: ApiExpense; action: string }) => {
      if (action === "submit") return accountingApi.submitExpense(expense.id);
      if (action === "approve") return accountingApi.decideExpense(expense.id, true);
      if (action === "reject")
        return accountingApi.decideExpense(expense.id, false, "Rejected by approver");
      const paid = expense.payments.reduce((sum, item) => sum + Number(item.amount), 0);
      const account = moneyAccounts.data?.moneyAccounts[0];
      if (!account) throw new Error("Configure a money account first.");
      return accountingApi.payExpense(expense.id, {
        amount: Number(expense.total) - paid,
        date: today,
        moneyAccountId: account.id,
      });
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Expense updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <section className="mt-5 space-y-4">
      {hasPermission(user, "expenses.create") && (
        <form
          className="grid gap-2 rounded-xl border bg-card p-4 lg:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <input
            className={field}
            placeholder="Payee"
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
          />
          <label
            className={`${field} flex cursor-pointer items-center gap-2 text-muted-foreground`}
          >
            <Paperclip className="h-4 w-4" />
            <span className="truncate">{attachment?.name ?? "Supporting file"}</span>
            <input
              className="hidden"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
            />
          </label>
          <input
            className={field}
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <AccountSelect
            accounts={expenseAccounts}
            value={accountId}
            onChange={setAccountId}
            placeholder="Expense account"
          />
          <input
            className={field}
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button disabled={!payee || !description || !accountId || !amount}>Record expense</Button>
        </form>
      )}
      <div className="space-y-2">
        {expenses.data?.expenses.map((expense) => {
          const paid = expense.payments.reduce((sum, item) => sum + Number(item.amount), 0);
          return (
            <div
              key={expense.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
            >
              <div>
                <div className="font-medium">
                  {expense.number} · {expense.payee}
                </div>
                <div className="text-xs text-muted-foreground">
                  {expense.description} · {money(expense.total)} · Paid {money(paid)}
                </div>
                {expense.attachments.map((file) => (
                  <button
                    key={file.id}
                    className="mt-1 text-xs text-brand underline"
                    onClick={async () =>
                      saveBlob(
                        await accountingApi.downloadExpenseAttachment(expense.id, file.id),
                        file.filename,
                      )
                    }
                  >
                    {file.filename}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Badge variant={expense.status === "PAID" ? "default" : "outline"}>
                  {expense.status.replaceAll("_", " ")}
                </Badge>
                {expense.status === "DRAFT" && hasPermission(user, "expenses.create") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => run.mutate({ expense, action: "submit" })}
                  >
                    Submit
                  </Button>
                )}
                {expense.status === "PENDING_APPROVAL" &&
                  hasPermission(user, "expenses.approve") && (
                    <Button size="sm" onClick={() => run.mutate({ expense, action: "approve" })}>
                      Approve
                    </Button>
                  )}
                {["APPROVED", "PARTIALLY_PAID"].includes(expense.status) &&
                  hasPermission(user, "expenses.pay") && (
                    <Button size="sm" onClick={() => run.mutate({ expense, action: "pay" })}>
                      Pay balance
                    </Button>
                  )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MoneyAccounts({ setup }: { setup: ApiAccountingSetup }) {
  return (
    <section className="mt-5 grid gap-4 md:grid-cols-2">
      {setup.methodMappings.map((mapping) => (
        <div key={mapping.method} className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">
            Default for {mapping.method.replaceAll("_", " ")}
          </div>
          <div className="mt-1 font-semibold">{mapping.moneyAccount.name}</div>
          <div className="text-sm text-muted-foreground">
            {mapping.moneyAccount.type.replaceAll("_", " ")} · {mapping.moneyAccount.account.code}
          </div>
        </div>
      ))}
    </section>
  );
}

function Reconciliation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [csv, setCsv] = useState("date,description,reference,amount\n");
  const [statementLineId, setStatementLineId] = useState("");
  const [journalLineId, setJournalLineId] = useState("");
  const [matchAmount, setMatchAmount] = useState("");
  const [counted, setCounted] = useState("");
  const [offsetAccountId, setOffsetAccountId] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const accounts = useQuery({
    queryKey: ["accounting-accounts"],
    queryFn: accountingApi.getAccounts,
  });
  const workspace = useQuery({
    queryKey: ["accounting-reconciliation", moneyAccountId],
    queryFn: () => accountingApi.getReconciliation(moneyAccountId || undefined),
  });
  const selected =
    moneyAccountId || workspace.data?.accounts.find((item) => item.type !== "CASH")?.id || "";
  const selectedAccount = workspace.data?.accounts.find((item) => item.id === selected);
  const imported = useMutation({
    mutationFn: () =>
      accountingApi.importStatement({
        moneyAccountId: selected,
        filename: "manual-import.csv",
        periodStart: today,
        periodEnd: today,
        csv,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["accounting-reconciliation"] });
      toast.success(`${result.imported} statement lines imported`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const match = useMutation({
    mutationFn: () =>
      accountingApi.match(statementLineId, [{ journalLineId, amount: Number(matchAmount) }]),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounting-reconciliation"] });
      setStatementLineId("");
      setJournalLineId("");
      setMatchAmount("");
      toast.success("Statement and ledger movement matched");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const cashCount = useMutation({
    mutationFn: () =>
      accountingApi.createCashCount({
        moneyAccountId: selected,
        date: today,
        counted: Number(counted),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounting-reconciliation"] });
      setCounted("");
      toast.success("Cash count sent for approval");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const approveCount = useMutation({
    mutationFn: accountingApi.approveCashCount,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounting-reconciliation"] }),
        queryClient.invalidateQueries({ queryKey: ["accounting-summary"] }),
      ]);
      toast.success("Cash count approved and discrepancy posted");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const draftJournal = useMutation({
    mutationFn: () =>
      accountingApi.createReconciliationDraft(statementLineId, offsetAccountId, draftDescription),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounting-journals"] });
      setDraftDescription("");
      toast.success("Unmatched statement item added as a draft journal");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <section className="mt-5 space-y-4">
      <div className="grid gap-3 rounded-xl border bg-card p-4 lg:grid-cols-[240px_1fr_auto]">
        <select
          className={field}
          value={selected}
          onChange={(e) => setMoneyAccountId(e.target.value)}
        >
          {workspace.data?.accounts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {selectedAccount?.type === "CASH" ? (
          <input
            className={field}
            type="number"
            min="0"
            step="0.01"
            placeholder="Counted cash"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
          />
        ) : (
          <textarea
            className="min-h-24 rounded-md border bg-background p-3 font-mono text-xs"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
        )}
        {selectedAccount?.type === "CASH" ? (
          <Button disabled={!counted || cashCount.isPending} onClick={() => cashCount.mutate()}>
            Record count
          </Button>
        ) : (
          <Button disabled={!selected || imported.isPending} onClick={() => imported.mutate()}>
            Import CSV
          </Button>
        )}
      </div>
      {selectedAccount?.type === "CASH" ? (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Cash counts</h3>
          {workspace.data?.cashCounts.map((count) => (
            <div key={count.id} className="flex items-center justify-between border-b py-2 text-sm">
              <span>
                {new Date(count.date).toLocaleDateString()} · expected {money(count.expected)} ·
                counted {money(count.counted)}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Difference {money(count.difference)}</Badge>
                {count.status === "PENDING_APPROVAL" &&
                  hasPermission(user, "reconciliation.approve") && (
                    <Button size="sm" onClick={() => approveCount.mutate(count.id)}>
                      Approve
                    </Button>
                  )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <SelectableReconcileList
              title="Statement lines"
              rows={workspace.data?.statementLines ?? []}
              selectedId={statementLineId}
              onSelect={setStatementLineId}
            />
            <SelectableReconcileList
              title="Ledger money movements"
              rows={workspace.data?.ledgerLines ?? []}
              selectedId={journalLineId}
              onSelect={setJournalLineId}
            />
          </div>
          {hasPermission(user, "reconciliation.manage") && (
            <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-card p-4">
              <input
                className={field}
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Match amount"
                value={matchAmount}
                onChange={(e) => setMatchAmount(e.target.value)}
              />
              <Button
                disabled={!statementLineId || !journalLineId || !matchAmount || match.isPending}
                onClick={() => match.mutate()}
              >
                Match selected
              </Button>
              {hasPermission(user, "journals.create") && (
                <>
                  <AccountSelect
                    accounts={accounts.data?.accounts ?? []}
                    value={offsetAccountId}
                    onChange={setOffsetAccountId}
                    placeholder="Unmatched item account"
                  />
                  <input
                    className={field}
                    placeholder="Draft journal description"
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={
                      !statementLineId ||
                      !offsetAccountId ||
                      !draftDescription ||
                      draftJournal.isPending
                    }
                    onClick={() => draftJournal.mutate()}
                  >
                    Create draft journal
                  </Button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Reports() {
  const reports = useQuery({
    queryKey: ["accounting-reports"],
    queryFn: () => accountingApi.getReports(),
  });
  const data = reports.data?.reports;
  const download = useMutation({
    mutationFn: accountingApi.downloadReport,
    onSuccess: (blob, type) => saveBlob(blob, `${type}.pdf`),
    onError: (error: Error) => toast.error(error.message),
  });
  if (!data)
    return (
      <div className="mt-5 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        Activate accounting to produce financial statements.
      </div>
    );
  return (
    <section className="mt-5 space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        {(
          [
            "trial-balance",
            "general-ledger",
            "income-statement",
            "balance-sheet",
            "cash-bank-book",
            "expense-register",
            "reconciliation-summary",
            "receivable-control",
          ] as const
        ).map((type) => (
          <Button key={type} size="sm" variant="outline" onClick={() => download.mutate(type)}>
            <Download className="mr-1 h-4 w-4" />
            {type.replaceAll("-", " ")}
          </Button>
        ))}
      </div>
      {data.cutoverNotice && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {data.cutoverNotice}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Income" value={money(data.incomeStatement.income)} />
        <Stat label="Expenses" value={money(data.incomeStatement.expenses)} />
        <Stat label="Surplus / deficit" value={money(data.incomeStatement.surplus)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Cash/bank movements" value={String(data.cashBankBook.length)} />
        <Stat label="Expense records" value={String(data.expenseRegister.length)} />
        <Stat
          label="Receivable control difference"
          value={money(data.receivableControl.difference)}
        />
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Account</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.trialBalance.map((row) => (
              <tr key={row.account.id}>
                <td className="px-4 py-3">
                  {row.account.code} · {row.account.name}
                </td>
                <td>{money(row.debit)}</td>
                <td>{money(row.credit)}</td>
                <td>{money(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Setup({ setup }: { setup: ApiAccountingSetup }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [cutoverDate, setCutoverDate] = useState(today);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const moneyAccounts = setup.methodMappings
    .map((item) => item.moneyAccount)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
  const activate = useMutation({
    mutationFn: () =>
      accountingApi.activate({
        cutoverDate,
        moneyBalances: moneyAccounts.map((account) => ({
          moneyAccountId: account.id,
          amount: Number(balances[account.id] || 0),
        })),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounting-setup"] }),
        queryClient.invalidateQueries({ queryKey: ["accounting-summary"] }),
      ]);
      toast.success("Accounting activated with an opening journal");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const periodStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "OPEN" | "CLOSED" }) =>
      accountingApi.setPeriodStatus(id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounting-setup"] });
      toast.success("Accounting period updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <section className="mt-5 space-y-4">
      <div className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Accounting cutover</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Existing receivables, student credits and deferred fees are calculated automatically.
          Enter the real balances held in each money account.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            className={field}
            type="date"
            value={cutoverDate}
            onChange={(e) => setCutoverDate(e.target.value)}
          />
          {moneyAccounts.map((account) => (
            <label key={account.id} className="text-xs text-muted-foreground">
              {account.name}
              <input
                className={`${field} mt-1 w-full`}
                type="number"
                min="0"
                step="0.01"
                value={balances[account.id] ?? ""}
                onChange={(e) => setBalances({ ...balances, [account.id]: e.target.value })}
              />
            </label>
          ))}
        </div>
        {setup.status === "SETUP" ? (
          <Button className="mt-4" onClick={() => activate.mutate()} disabled={activate.isPending}>
            <Check className="mr-1 h-4 w-4" />
            Post opening journal & activate
          </Button>
        ) : (
          <div className="mt-4 text-sm text-emerald-700">
            Accounting has been active since{" "}
            {setup.cutoverAt ? new Date(setup.cutoverAt).toLocaleDateString() : "the cutover"}.
          </div>
        )}
      </div>
      <div className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Academic-year periods</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {setup.fiscalYears[0]?.periods.map((period) => (
            <div key={period.id} className="flex items-center gap-1 rounded-md border p-1 pl-2">
              <span className="text-xs">
                {period.name} · {period.status}
              </span>
              {hasPermission(user, "accounting.periods.manage") && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() =>
                    periodStatus.mutate({
                      id: period.id,
                      status: period.status === "OPEN" ? "CLOSED" : "OPEN",
                    })
                  }
                >
                  {period.status === "OPEN" ? "Close" : "Reopen"}
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AccountSelect({
  accounts,
  value,
  onChange,
  placeholder,
}: {
  accounts: ApiAccount[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <select className={field} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>
          {account.code} · {account.name}
        </option>
      ))}
    </select>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
function SelectableReconcileList({
  title,
  rows,
  selectedId,
  onSelect,
}: {
  title: string;
  rows: { id: string; description: string; amount: number; matched: number }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-3 space-y-2">
        {rows.slice(0, 20).map((row) => (
          <button
            key={row.id}
            className={`flex w-full justify-between border-b p-2 text-left text-sm ${selectedId === row.id ? "rounded bg-brand/10 ring-1 ring-brand" : ""}`}
            onClick={() => onSelect(row.id)}
          >
            <span>{row.description}</span>
            <span>
              {money(row.amount)} · matched {money(row.matched)}
            </span>
          </button>
        ))}
        {!rows.length && (
          <div className="py-6 text-center text-sm text-muted-foreground">No transactions.</div>
        )}
      </div>
    </div>
  );
}
