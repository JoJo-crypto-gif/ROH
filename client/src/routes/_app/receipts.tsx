import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Download, Eye, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { financeApi } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/receipts")({
  head: () => ({ meta: [{ title: "Receipts — Lumen Suite" }] }),
  component: ReceiptsPage,
});
const money = (value: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(value);
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ReceiptsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const receipts = useQuery({
    queryKey: ["fee-receipts", search, status, dateFrom, dateTo, page],
    queryFn: () => financeApi.getReceipts({ search, status, dateFrom, dateTo, page }),
  });
  useEffect(() => {
    const effectivePage = receipts.data?.pagination.page;
    if (effectivePage && effectivePage !== page) setPage(effectivePage);
  }, [page, receipts.data?.pagination.page]);
  const receiptDetail = useQuery({
    queryKey: ["fee-receipt", selectedReceiptId],
    queryFn: () => financeApi.getReceipt(selectedReceiptId!),
    enabled: !!selectedReceiptId,
  });
  if (!hasPermission(user, "receipts.view")) return <Forbidden />;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipts"
        description="Immutable payment receipts. Reversed payments remain visible as voided history."
      />
      <div className="grid gap-2 md:grid-cols-[minmax(240px,1fr)_190px_170px_170px]">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm"
            placeholder="Search receipt or student"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="POSTED">Posted</option>
          <option value="REVERSAL_PENDING">Reversal pending</option>
          <option value="REVERSED">Reversed</option>
        </select>
        <input
          type="date"
          aria-label="Receipt date from"
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
        />
        <input
          type="date"
          aria-label="Receipt date to"
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {receipts.data?.receipts.map((receipt) => (
          <article key={receipt.id} className="rounded-xl border bg-card p-5">
            <div className="flex justify-between">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Receipt</div>
                <div className="text-lg font-semibold">{receipt.number}</div>
              </div>
              <Badge variant={receipt.status === "POSTED" ? "default" : "outline"}>
                {receipt.status === "REVERSED"
                  ? "VOID — REVERSED"
                  : receipt.status.replaceAll("_", " ")}
              </Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Student</div>
                <div className="font-medium">{receipt.student.name}</div>
                <div className="text-xs text-muted-foreground">{receipt.student.admissionNo}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Payment</div>
                <div className="font-medium">{money(receipt.amount)}</div>
                <div className="text-xs text-muted-foreground">
                  {receipt.method.replaceAll("_", " ")} ·{" "}
                  {new Date(receipt.issuedAt).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="max-w-64 truncate text-[10px] text-muted-foreground">
                SHA-256 {receipt.checksum}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedReceiptId(receipt.id)}
                >
                  <Eye className="mr-1 h-4 w-4" />
                  Details
                </Button>
                {hasPermission(user, "receipts.print") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      financeApi
                        .downloadReceipt(receipt.id)
                        .then((blob) => download(blob, `${receipt.number}.pdf`))
                        .catch((error: Error) => toast.error(error.message))
                    }
                  >
                    <Download className="mr-1 h-4 w-4" />
                    PDF
                  </Button>
                )}
              </div>
            </div>
          </article>
        ))}
        {!receipts.isLoading && !receipts.data?.receipts.length && (
          <div className="col-span-full rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            No receipts have been issued.
          </div>
        )}
      </div>
      {receipts.data?.pagination && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{receipts.data.pagination.total} receipts</span>
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
              Page {receipts.data.pagination.page} of {receipts.data.pagination.totalPages || 1}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= receipts.data.pagination.totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <Dialog
        open={!!selectedReceiptId}
        onOpenChange={(open) => !open && setSelectedReceiptId(null)}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{receiptDetail.data?.receipt.number ?? "Receipt details"}</DialogTitle>
            <DialogDescription>
              Immutable payment allocation and audit information.
            </DialogDescription>
          </DialogHeader>
          {receiptDetail.isLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading receipt…</div>
          )}
          {receiptDetail.data && <ReceiptDetail receipt={receiptDetail.data.receipt} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReceiptDetail({
  receipt,
}: {
  receipt: Awaited<ReturnType<typeof financeApi.getReceipt>>["receipt"];
}) {
  const snapshot = receipt.snapshot;
  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 rounded-lg bg-muted/40 p-4 sm:grid-cols-2">
        <Detail
          label="Student"
          value={`${snapshot.student.name} · ${snapshot.student.admissionNo}`}
        />
        <Detail label="Amount" value={money(snapshot.payment.amount)} />
        <Detail label="Method" value={snapshot.payment.method.replaceAll("_", " ")} />
        <Detail label="Transaction reference" value={snapshot.payment.transactionRef || "—"} />
        <Detail label="Cashier" value={receipt.payment.recordedBy?.name || "System user"} />
        <Detail label="Issued" value={new Date(receipt.issuedAt).toLocaleString()} />
      </div>
      <div>
        <h3 className="mb-2 font-semibold">Allocations</h3>
        <div className="divide-y rounded-lg border">
          {snapshot.allocations.map((allocation) => (
            <div key={allocation.chargeId} className="flex justify-between gap-3 px-3 py-2">
              <span>{allocation.label}</span>
              <span className="font-medium">{money(allocation.amount)}</span>
            </div>
          ))}
          {!snapshot.allocations.length && (
            <div className="px-3 py-3 text-muted-foreground">No charge allocations.</div>
          )}
          <div className="flex justify-between gap-3 px-3 py-2">
            <span>Unallocated credit created</span>
            <span className="font-medium">{money(snapshot.credit)}</span>
          </div>
        </div>
      </div>
      {receipt.payment.reversal && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="font-semibold">Reversal history · {receipt.payment.reversal.status}</div>
          <div className="mt-1 text-muted-foreground">{receipt.payment.reversal.reason}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Requested {new Date(receipt.payment.reversal.createdAt).toLocaleString()}
            {receipt.payment.reversal.decidedAt
              ? ` · Decided ${new Date(receipt.payment.reversal.decidedAt).toLocaleString()}`
              : ""}
          </div>
        </div>
      )}
      <div className="break-all rounded-lg border p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">SHA-256 checksum:</span> {receipt.checksum}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
