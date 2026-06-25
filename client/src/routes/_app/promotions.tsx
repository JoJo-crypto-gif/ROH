import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { ArrowUpCircle, RotateCcw, LogOut, GraduationCap, ClipboardList, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { academicApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Decision = "Promote" | "Repeat" | "Withdraw" | "Transfer" | "Graduate" | "Pending";
const DECISIONS: { key: Decision; icon: any; tone: string }[] = [
  { key: "Promote", icon: ArrowUpCircle, tone: "bg-success/15 text-[oklch(0.35_0.1_155)] border-success/30" },
  { key: "Repeat", icon: RotateCcw, tone: "bg-warning/15 text-[oklch(0.4_0.12_70)] border-warning/30" },
  { key: "Withdraw", icon: LogOut, tone: "bg-destructive/15 text-destructive border-destructive/30" },
  { key: "Transfer", icon: ClipboardList, tone: "bg-brand/10 text-brand border-brand/30" },
  { key: "Graduate", icon: GraduationCap, tone: "bg-accent text-accent-foreground border-border" },
  { key: "Pending", icon: ClipboardList, tone: "bg-muted text-muted-foreground border-border" },
];

export const Route = createFileRoute("/_app/promotions")({
  head: () => ({ meta: [{ title: "Promotions — Lumen Suite" }] }),
  component: PromotionsPage,
});

function PromotionsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState("");
  const [targetClassId, setTargetClassId] = useState("");
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [confirmed, setConfirmed] = useState(false);

  if (!hasPermission(user, "promotion.view")) return <Forbidden />;
  const canRecommend = hasPermission(user, "promotion.recommend");
  const canApprove = hasPermission(user, "promotion.approve");

  // Queries
  const { data: yearsData } = useQuery({
    queryKey: ["academic-years"],
    queryFn: academicApi.getYears,
  });

  const { data: classesData, isLoading: loadingClasses } = useQuery({
    queryKey: ["classes"],
    queryFn: academicApi.getClasses,
  });

  const years = yearsData?.years ?? [];
  const classrooms = classesData?.classrooms ?? [];
  const activeYear = years.find((y) => y.active);

  // Set default classId when classrooms load
  useEffect(() => {
    if (classrooms.length > 0 && !classId) {
      setClassId(classrooms[0].id);
    }
  }, [classrooms, classId]);

  // Derive targetClassId (suggest next class level automatically)
  useEffect(() => {
    if (classId && classrooms.length > 0) {
      const currentClass = classrooms.find((c) => c.id === classId);
      if (currentClass) {
        const nextLevelClass = classrooms.find((c) => c.level === currentClass.level + 1);
        setTargetClassId(nextLevelClass?.id ?? "");
      }
    }
  }, [classId, classrooms]);

  const { data: promoData, isLoading: loadingPromotions } = useQuery({
    queryKey: ["promotions", classId],
    queryFn: () => academicApi.getPromotions(classId),
    enabled: !!classId,
  });

  const studentList = promoData?.promotions ?? [];

  // Initialize decisions local state
  useEffect(() => {
    if (studentList.length > 0) {
      const initialDecisions = Object.fromEntries(
        studentList.map((s) => [s.studentId, s.recommendation as Decision])
      );
      setDecisions(initialDecisions);
    }
  }, [studentList]);

  // Mutations
  const saveRecsMutation = useMutation({
    mutationFn: (data: { classId: string; recommendations: { studentId: string; recommendation: string }[] }) =>
      academicApi.saveRecommendations(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotions", classId] });
      toast.success("Promotion recommendations saved successfully");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save recommendations");
    },
  });

  const approveMutation = useMutation({
    mutationFn: (data: { classId: string; targetClassId: string }) =>
      academicApi.approvePromotions(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotions", classId] });
      toast.success("Rollover executed and student promotions approved successfully!");
      setConfirmed(true);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to execute promotions rollover");
    },
  });

  const handleSaveRecs = () => {
    const recommendations = Object.entries(decisions)
      .filter(([_, value]) => value !== "Pending")
      .map(([studentId, value]) => ({
        studentId,
        recommendation: value,
      }));

    saveRecsMutation.mutate({
      classId,
      recommendations,
    });
  };

  const handleApprove = () => {
    if (!targetClassId) {
      toast.error("Please select a target classroom for promotions.");
      return;
    }

    const pendingCount = studentList.filter(
      (s) => (decisions[s.studentId] ?? "Pending") === "Pending"
    ).length;

    if (pendingCount > 0) {
      toast.error(`Please recommend decisions for all students. There are ${pendingCount} pending.`);
      return;
    }

    if (confirm("Are you sure you want to approve all promotions and rollover students? This creates next year enrolments.")) {
      approveMutation.mutate({
        classId,
        targetClassId,
      });
    }
  };

  const summary = DECISIONS.map((d) => ({
    ...d,
    count: studentList.filter((s) => (decisions[s.studentId] ?? "Pending") === d.key).length,
  }));

  const isPending = saveRecsMutation.isPending || approveMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader title="Class promotions" description="Promote, repeat, transfer, withdraw or graduate students at end of year. History is preserved." />

      <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground font-medium">Academic year</label>
            <div className="mt-1 h-9 rounded-md border border-input bg-muted/30 px-3 text-sm flex items-center font-medium">
              {activeYear ? activeYear.name : "No Active Year"}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Class</label>
            {loadingClasses ? (
              <div className="h-9 w-40 rounded-md border border-input bg-background animate-pulse mt-1" />
            ) : (
              <select
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setDecisions({});
                  setConfirmed(false);
                }}
                className="mt-1 h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring"
              >
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Promote Target Class</label>
            <select
              value={targetClassId}
              onChange={(e) => setTargetClassId(e.target.value)}
              className="mt-1 h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring"
            >
              <option value="">None (Graduate / Exit only)</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {summary.map((s) => (
              <div key={s.key} className={`rounded-md border px-2.5 py-1 text-xs font-medium ${s.tone}`}>
                {s.key}: {s.count}
              </div>
            ))}
          </div>
        </div>
      </div>

      {classId && (
        <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
          <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">
            {studentList.length} students in {classrooms.find((c) => c.id === classId)?.name}
          </div>

          {loadingPromotions ? (
            <div className="flex h-48 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-brand" />
                <p className="text-sm text-muted-foreground">Loading promotions roster…</p>
              </div>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {studentList.map((s) => {
                  const decision = decisions[s.studentId] ?? "Pending";
                  const isApproved = s.promotionStatus === "APPROVED";
                  return (
                    <li key={s.studentId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-xs font-medium text-white"
                          style={{ backgroundColor: s.photoColor }}
                        >
                          {s.firstName[0]}
                          {s.lastName[0]}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {s.firstName} {s.lastName}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>{s.admissionNo}</span>
                            {isApproved && (
                              <Badge className="bg-success text-success-foreground text-[9px] h-4 py-0 select-none">
                                Approved Rollover
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {DECISIONS.filter((d) => d.key !== "Pending").map((d) => {
                          const Icon = d.icon;
                          const active = decision === d.key;
                          return (
                            <button
                              key={d.key}
                              disabled={!canRecommend || isApproved || isPending}
                              onClick={() => setDecisions((m) => ({ ...m, [s.studentId]: d.key }))}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition cursor-pointer",
                                active ? d.tone : "border-border bg-card text-muted-foreground hover:bg-muted",
                                (!canRecommend || isApproved || isPending) && "opacity-60 cursor-not-allowed"
                              )}
                            >
                              <Icon className="h-3 w-3" /> {d.key}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
                {studentList.length === 0 && (
                  <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No active students to promote in this classroom.
                  </li>
                )}
              </ul>
              <div className="flex items-center justify-between gap-3 border-t border-border p-3">
                <div className="text-xs text-muted-foreground">
                  {confirmed
                    ? "Promotion enrolment records created for the next academic year. Previous class history preserved."
                    : "Recommend decisions, then approve to create next-year enrolment records."}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={!canRecommend || isPending} onClick={handleSaveRecs}>
                    Save recommendations
                  </Button>
                  <Button size="sm" disabled={!canApprove || isPending} onClick={handleApprove}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve & confirm
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {confirmed && (
        <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm flex items-center">
          <Badge className="bg-success text-success-foreground hover:bg-success">Confirmed</Badge>
          <span className="ml-2 font-medium">Decisions applied. New class enrolment records created for next academic year — previous history preserved.</span>
        </div>
      )}
    </div>
  );
}
