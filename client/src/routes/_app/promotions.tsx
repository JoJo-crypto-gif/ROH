import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpCircle, CheckCircle2, GraduationCap, LogOut, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { academicApi, type PromotionDecision } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/promotions")({
  head: () => ({ meta: [{ title: "Promotions — Lumen Suite" }] }),
  component: PromotionsPage,
});

const decisions: { value: PromotionDecision; label: string; icon: typeof ArrowUpCircle }[] = [
  { value: "PROMOTE", label: "Promote", icon: ArrowUpCircle },
  { value: "REPEAT", label: "Repeat", icon: RotateCcw },
  { value: "GRADUATE", label: "Graduate", icon: GraduationCap },
  { value: "TRANSFER", label: "Transfer", icon: LogOut },
  { value: "WITHDRAW", label: "Withdraw", icon: LogOut },
];

function PromotionsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canView = hasPermission(user, "promotion.view");
  const canRecommend = hasPermission(user, "promotion.recommend");
  const canApprove = hasPermission(user, "promotion.approve");
  const [sectionId, setSectionId] = useState("");
  const [nextYearId, setNextYearId] = useState("");
  const [selectedDecisions, setSelectedDecisions] = useState<
    Record<string, PromotionDecision | "">
  >({});
  const [targets, setTargets] = useState<Record<string, string>>({});

  const yearsQuery = useQuery({ queryKey: ["academic-years"], queryFn: academicApi.getYears });
  const years = useMemo(() => yearsQuery.data?.years ?? [], [yearsQuery.data?.years]);
  const activeYear = useMemo(() => years.find((year) => year.status === "ACTIVE"), [years]);
  const draftYears = useMemo(() => years.filter((year) => year.status === "DRAFT"), [years]);
  useEffect(() => {
    if (draftYears.length && !draftYears.some((year) => year.id === nextYearId))
      setNextYearId(draftYears[0].id);
  }, [draftYears, nextYearId]);
  const currentSectionsQuery = useQuery({
    queryKey: ["sections", activeYear?.id],
    queryFn: () => academicApi.getClasses(activeYear?.id),
    enabled: !!activeYear,
  });
  const currentSections = useMemo(
    () => currentSectionsQuery.data?.sections ?? [],
    [currentSectionsQuery.data?.sections],
  );
  useEffect(() => {
    if (currentSections.length && !currentSections.some((section) => section.id === sectionId))
      setSectionId(currentSections[0].id);
  }, [currentSections, sectionId]);
  const targetSectionsQuery = useQuery({
    queryKey: ["sections", nextYearId],
    queryFn: () => academicApi.getClasses(nextYearId),
    enabled: !!nextYearId,
  });
  const targetSections = useMemo(
    () => targetSectionsQuery.data?.sections ?? [],
    [targetSectionsQuery.data?.sections],
  );
  const levelsQuery = useQuery({ queryKey: ["grade-levels"], queryFn: academicApi.getGradeLevels });
  const levels = useMemo(
    () => levelsQuery.data?.gradeLevels ?? [],
    [levelsQuery.data?.gradeLevels],
  );
  const promotionsQuery = useQuery({
    queryKey: ["promotions", sectionId],
    queryFn: () => academicApi.getPromotions(sectionId),
    enabled: !!sectionId,
  });
  const promotions = useMemo(
    () => promotionsQuery.data?.promotions ?? [],
    [promotionsQuery.data?.promotions],
  );
  useEffect(() => {
    setSelectedDecisions(
      Object.fromEntries(
        promotions.map((promotion) => [promotion.enrolmentId, promotion.decision ?? ""]),
      ),
    );
    setTargets(
      Object.fromEntries(
        promotions.map((promotion) => [promotion.enrolmentId, promotion.targetSectionId ?? ""]),
      ),
    );
  }, [promotions]);
  const currentSection = currentSections.find((section) => section.id === sectionId);
  const currentLevel = levels.find((level) => level.id === currentSection?.gradeLevelId);
  const finalTerm = activeYear?.terms[activeYear.terms.length - 1];

  const validTargets = (decision: PromotionDecision | "") => {
    const gradeLevelId =
      decision === "PROMOTE"
        ? currentLevel?.nextGradeLevelId
        : decision === "REPEAT"
          ? currentLevel?.id
          : null;
    return gradeLevelId
      ? targetSections.filter((section) => section.gradeLevelId === gradeLevelId)
      : [];
  };
  const chooseDecision = (enrolmentId: string, decision: PromotionDecision) => {
    setSelectedDecisions((current) => ({ ...current, [enrolmentId]: decision }));
    const options = validTargets(decision);
    setTargets((current) => ({
      ...current,
      [enrolmentId]: options.some((option) => option.id === current[enrolmentId])
        ? current[enrolmentId]
        : (options[0]?.id ?? ""),
    }));
  };
  const summary = useMemo(
    () =>
      decisions.map((decision) => ({
        ...decision,
        count: Object.values(selectedDecisions).filter((value) => value === decision.value).length,
      })),
    [selectedDecisions],
  );
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["promotions", sectionId] });
  const saveMutation = useMutation({
    mutationFn: () =>
      academicApi.saveRecommendations({
        sectionId,
        recommendations: promotions
          .map((promotion) => ({
            enrolmentId: promotion.enrolmentId,
            decision: selectedDecisions[promotion.enrolmentId] as PromotionDecision,
          }))
          .filter((item) => !!item.decision),
      }),
    onSuccess: () => {
      toast.success("Recommendations saved");
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Unable to save recommendations"),
  });
  const approveMutation = useMutation({
    mutationFn: async () => {
      await academicApi.saveRecommendations({
        sectionId,
        recommendations: promotions.map((promotion) => ({
          enrolmentId: promotion.enrolmentId,
          decision: selectedDecisions[promotion.enrolmentId] as PromotionDecision,
        })),
      });
      return academicApi.approvePromotions({
        sectionId,
        nextYearId,
        defaultTargetSectionId: null,
        overrides: promotions.map((promotion) => ({
          enrolmentId: promotion.enrolmentId,
          targetSectionId: targets[promotion.enrolmentId] || null,
        })),
      });
    },
    onSuccess: (result) => {
      toast.success(`${result.approved} year-end outcomes approved`);
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Unable to approve promotions"),
  });
  const incomplete = promotions.some(
    (promotion) =>
      !selectedDecisions[promotion.enrolmentId] ||
      (["PROMOTE", "REPEAT"].includes(selectedDecisions[promotion.enrolmentId]) &&
        !targets[promotion.enrolmentId]),
  );

  if (!canView) return <Forbidden />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Year-end progression"
        description="Recommend and approve promotion, repetition, graduation, transfer or withdrawal without overwriting history."
      />
      <section className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div>
          <label className="text-xs text-muted-foreground">Current class stream</label>
          <select
            className="mt-1 h-9 min-w-52 rounded-md border bg-background px-2"
            value={sectionId}
            onChange={(event) => setSectionId(event.target.value)}
          >
            {currentSections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Next draft year</label>
          <select
            className="mt-1 h-9 min-w-48 rounded-md border bg-background px-2"
            value={nextYearId}
            onChange={(event) => setNextYearId(event.target.value)}
          >
            <option value="">Select draft year</option>
            {draftYears.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
              </option>
            ))}
          </select>
        </div>
        <Badge variant="outline">
          Final term: {finalTerm?.name ?? "-"} · {finalTerm?.status ?? "-"}
        </Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          {summary.map((item) => (
            <Badge key={item.value} variant="outline">
              {item.label}: {item.count}
            </Badge>
          ))}
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h3 className="font-semibold">{currentSection?.name ?? "Class"} decisions</h3>
            <p className="text-xs text-muted-foreground">
              Approval is available only after the final configured term is closed.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!canRecommend || incomplete || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              <Save className="mr-1.5 h-4 w-4" />
              Save recommendations
            </Button>
            <Button
              disabled={
                !canApprove ||
                incomplete ||
                !nextYearId ||
                finalTerm?.status !== "CLOSED" ||
                approveMutation.isPending
              }
              onClick={() => approveMutation.mutate()}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Approve outcomes
            </Button>
          </div>
        </div>
        <div className="divide-y">
          {promotions.map((promotion) => {
            const decision = selectedDecisions[promotion.enrolmentId] ?? "";
            const options = validTargets(decision);
            return (
              <div
                key={promotion.enrolmentId}
                className="grid gap-3 p-4 xl:grid-cols-[minmax(220px,1fr)_auto_220px]"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-9 w-9 place-items-center rounded-full text-xs text-white"
                    style={{ backgroundColor: promotion.photoColor }}
                  >
                    {promotion.firstName[0]}
                    {promotion.lastName[0]}
                  </span>
                  <div>
                    <div className="text-sm font-medium">
                      {promotion.firstName} {promotion.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {promotion.admissionNo}{" "}
                      {promotion.promotionStatus === "APPROVED" ? "· Approved" : ""}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {decisions.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      disabled={
                        !canRecommend ||
                        promotion.promotionStatus === "APPROVED" ||
                        (value === "GRADUATE" && !currentLevel?.isFinal)
                      }
                      onClick={() => chooseDecision(promotion.enrolmentId, value)}
                      className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${decision === value ? "border-brand bg-brand/10 text-brand" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
                <div>
                  {["PROMOTE", "REPEAT"].includes(decision) ? (
                    <select
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={targets[promotion.enrolmentId] ?? ""}
                      onChange={(event) =>
                        setTargets((current) => ({
                          ...current,
                          [promotion.enrolmentId]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select target stream</option>
                      {options.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="h-9 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      No next enrolment
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {!promotions.length && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No active enrolments in this section.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
